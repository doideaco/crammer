import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import {
  FactCheckResult,
  Research,
  Script,
  Storyboard,
  TopicAssessment,
  storyboardDuration,
  FPS,
  type Stage,
} from "@crammer/schema";
import { ProviderConfigError, RefusedError, StructuredOutputError } from "@crammer/providers";
import {
  FactCheckFailedError,
  runFactCheck,
  runImages,
  runRender,
  runResearch,
  runScript,
  runStoryboard,
  runVoice,
  sourcesMarkdown,
  transcriptText,
} from "@crammer/pipeline";
import { appendEvent, getVideo, updateVideo, type Database } from "@crammer/db";
import { MissingArtifactError, type ArtifactStore } from "./artifacts.js";
import { createStageContext } from "./context.js";

const ResearchArtifact = z.object({ research: Research, assessment: TopicAssessment });

export type StageDeps = { db: Database; store: ArtifactStore; videoEntryPoint: string };

/** Thrown when a topic is declined. Distinct from failure: nothing is broken. */
export class TopicRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TopicRefusedError";
  }
}

/**
 * The most a single video may spend before the run is abandoned.
 *
 * A clean run costs about £2.70, dominated by research. Without a ceiling, a stage that
 * fails after its expensive call re-pays for that call on every retry — a fully failing
 * run reaches roughly £10, and a bug that fails the same way every time does it to every
 * video. This is the backstop for the case nobody predicted.
 */
export const MAX_PENCE_PER_VIDEO = Number(process.env.CRAMMER_MAX_PENCE_PER_VIDEO ?? 600);

export class SpendLimitError extends Error {
  constructor(spent: number, limit: number) {
    super(
      `This video has already cost ${(spent / 100).toFixed(2)} pounds, over the ${(limit / 100).toFixed(2)} limit. Stopping rather than spending more.`,
    );
    this.name = "SpendLimitError";
  }
}

/**
 * Failures that will happen again in exactly the same way.
 *
 * Retrying these buys nothing and costs the whole stage each time — a fact-check
 * verdict is a decision, a missing artefact stays missing, and a key that is not set
 * will not set itself.
 */
export function isDeterministicFailure(error: unknown): boolean {
  if (error instanceof TopicRefusedError) return true;
  if (error instanceof SpendLimitError) return true;
  if (error instanceof FactCheckFailedError) return true;
  if (error instanceof MissingArtifactError) return true;
  if (error instanceof ProviderConfigError) return true;
  // The model failed validation after the provider's own retries; the stage repeating
  // the same prompt is unlikely to end differently and costs the same again.
  if (error instanceof StructuredOutputError) return true;
  return error instanceof Error && /does not exist/.test(error.message);
}

/**
 * Runs one stage of one video.
 *
 * Every stage follows the same shape — read the previous stage's artefact, run the M1
 * pipeline function unchanged, write the new artefact, fold the cost into the row. That
 * uniformity is what lets each stage be an independently retryable task.
 */
export async function runStageForVideo(
  stage: Stage,
  videoId: string,
  deps: StageDeps,
): Promise<void> {
  const { db, store } = deps;
  await store.initialise();

  const video = await getVideo(db, videoId);
  if (!video) throw new Error(`Video ${videoId} does not exist.`);

  // Checked before the stage rather than after, so the expensive call is never made
  // once the budget is gone.
  const spent = Number(video.costPence);
  if (spent >= MAX_PENCE_PER_VIDEO) throw new SpendLimitError(spent, MAX_PENCE_PER_VIDEO);

  await updateVideo(db, videoId, { status: "running", stage });

  const { ctx, cost, workDir, dispose } = await createStageContext(videoId, stage, { db });

  try {
    switch (stage) {
      case "research": {
        try {
          const result = await runResearch(
            { topic: video.topic, level: video.level },
            ctx,
          );
          await store.putJson(videoId, "research", result);
        } catch (error) {
          // A refusal is a decision, not a fault, so it must not be retried.
          if (error instanceof RefusedError) throw new TopicRefusedError(error.message);
          throw error;
        }
        break;
      }

      case "script": {
        const { research } = await store.getJson(videoId, "research", ResearchArtifact);
        const script = await runScript(research, ctx);
        await store.putJson(videoId, "script", script);
        await updateVideo(db, videoId, { title: script.title });
        break;
      }

      case "factcheck": {
        const { research } = await store.getJson(videoId, "research", ResearchArtifact);
        const script = await store.getJson(videoId, "script", Script);
        const result = await runFactCheck({ script, research }, ctx);
        await store.putJson(videoId, "factcheck", result);
        await updateVideo(db, videoId, { title: result.script.title });
        break;
      }

      case "storyboard": {
        const { research } = await store.getJson(videoId, "research", ResearchArtifact);
        const { script } = await store.getJson(videoId, "factcheck", FactCheckResult);
        const storyboard = await runStoryboard({ script, research }, ctx);
        await store.putJson(videoId, "storyboard", storyboard);
        break;
      }

      case "images": {
        const storyboard = await store.getJson(videoId, "storyboard", Storyboard);
        const resolved = await runImages(storyboard, ctx);
        await store.putAssets(videoId, ctx.assetDir);
        await store.putJson(videoId, "images", resolved);
        break;
      }

      case "voice": {
        const storyboard = await store.getJson(videoId, "images", Storyboard);
        await store.fetchAssets(videoId, ctx.assetDir);
        const voiced = await runVoice(storyboard, ctx);
        await store.putAssets(videoId, ctx.assetDir);
        await store.putJson(videoId, "voice", voiced);
        break;
      }

      case "render": {
        const storyboard = await store.getJson(videoId, "voice", Storyboard);
        const { report } = await store.getJson(videoId, "factcheck", FactCheckResult);
        const assets = await store.fetchAssets(videoId, ctx.assetDir);
        ctx.log.info(`Fetched ${assets} asset(s) for rendering.`);

        const result = await runRender(
          { storyboard, entryPoint: deps.videoEntryPoint, outDir: workDir },
          ctx,
        );

        const videoUrl = await store.putOutput(
          videoId,
          "video.mp4",
          await readFile(result.videoPath),
          "video/mp4",
        );
        const transcriptUrl = await store.putOutput(
          videoId,
          "transcript.txt",
          Buffer.from(transcriptText(storyboard)),
          "text/plain; charset=utf-8",
        );
        const sourcesUrl = await store.putOutput(
          videoId,
          "sources.md",
          Buffer.from(sourcesMarkdown(storyboard, report)),
          "text/markdown; charset=utf-8",
        );

        await store.putJson(videoId, "final", storyboard);
        await updateVideo(db, videoId, {
          videoUrl,
          transcriptUrl,
          sourcesUrl,
          storyboardJson: storyboard,
          durationSeconds: Math.round(storyboardDuration(storyboard) / FPS),
        });
        break;
      }
    }

    await addCost(db, videoId, cost.totalPence());
    await appendEvent(db, {
      videoId,
      stage,
      message: `${stage} finished`,
      data: cost.report(),
    });
  } finally {
    await dispose();
  }
}

/**
 * Adds a stage's spend to the running total.
 *
 * Read-modify-write under the row's lock rather than `set costPence = costPence + x`
 * only because the value is a numeric string; the lock keeps concurrent stages honest.
 */
async function addCost(db: Database, videoId: string, pence: number): Promise<void> {
  if (pence <= 0) return;
  const video = await getVideo(db, videoId);
  if (!video) return;
  const total = Number(video.costPence) + pence;
  await updateVideo(db, videoId, { costPence: total.toFixed(2) });
}

/** Absolute path to the Remotion entry point, resolved from the workspace root. */
export function defaultVideoEntryPoint(workspaceRoot: string): string {
  return join(workspaceRoot, "packages", "video", "src", "index.ts");
}
