import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Stage } from "@crammer/schema";
import { CostTracker, configuredModel, createProviders } from "@crammer/providers";
import { testing, type Logger, type PipelineContext } from "@crammer/pipeline";
import { appendEvent, getDatabase, type Database } from "@crammer/db";

/**
 * A logger that writes the pipeline's own progress messages into `video_events`.
 *
 * This is what the status page renders, so the running commentary the CLI prints to a
 * terminal becomes the thing a user watches in the browser. Writes are fire-and-forget:
 * a log line failing must never take down a stage that is otherwise succeeding.
 */
export function createDbLogger(db: Database, videoId: string, stage: Stage): Logger {
  const write = (level: "info" | "warn", message: string) => {
    const trimmed = message.trim();
    if (trimmed.length === 0) return;
    void appendEvent(db, { videoId, stage, level, message: trimmed }).catch((error) => {
      console.error(`[${videoId}] could not record event: ${(error as Error).message}`);
    });
    console.log(`[${videoId}] ${stage}: ${trimmed}`);
  };

  return {
    info: (message) => write("info", message),
    warn: (message) => write("warn", message),
    // Progress chatter would flood the timeline; it goes to the worker log only.
    step: (message) => console.log(`[${videoId}] ${stage}: ${message.trim()}`),
  };
}

export type StageContext = {
  ctx: PipelineContext;
  cost: CostTracker;
  /** Scratch directory holding this stage's assets. Removed by `dispose`. */
  workDir: string;
  dispose(): Promise<void>;
};

/**
 * Builds everything one stage needs, in a throwaway directory.
 *
 * Each stage may run on a different machine, so nothing may be assumed to survive
 * between them — assets come from the artefact store at the start and go back at the
 * end.
 */
export async function createStageContext(
  videoId: string,
  stage: Stage,
  options: { db?: Database } = {},
): Promise<StageContext> {
  const db = options.db ?? getDatabase();
  // CRAMMER_MOCK=1 runs the whole pipeline against mocks: no network, no spend. It is
  // how the web app is developed, since a real run is ten minutes and real money.
  const mock = process.env.CRAMMER_MOCK === "1";
  const providers = mock ? testing.createMockProviders() : createProviders();
  const cost = new CostTracker(mock ? "mock-model" : configuredModel());
  const workDir = await mkdtemp(join(tmpdir(), `crammer-${videoId.slice(0, 8)}-`));

  const ctx: PipelineContext = {
    llm: providers.llm,
    tts: providers.tts,
    imageSearch: providers.imageSearch,
    imageFetcher: providers.imageFetcher,
    cost,
    log: createDbLogger(db, videoId, stage),
    assetDir: join(workDir, "assets"),
    cacheDir: join(workDir, "cache"),
  };

  return {
    ctx,
    cost,
    workDir,
    dispose: () => rm(workDir, { recursive: true, force: true }),
  };
}
