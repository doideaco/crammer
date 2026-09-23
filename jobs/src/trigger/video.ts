import { logger, task, type TaskOptions } from "@trigger.dev/sdk";
import { STAGES, type Stage } from "@crammer/schema";
import { getDatabase, markStatus } from "@crammer/db";
import { createArtifactStore } from "../storage-factory.js";
import { videoEntryPoint } from "../paths.js";
import { TopicRefusedError, runStageForVideo } from "../stages.js";
import { notifyReady, recordFailure } from "../pipeline.js";

type Payload = { videoId: string };

function deps() {
  return { db: getDatabase(), store: createArtifactStore(), videoEntryPoint: videoEntryPoint() };
}

/**
 * How long each stage may take, and how hard to retry it.
 *
 * Research and render are the long ones — research waits on a dozen web searches,
 * render drives a headless browser for several minutes. Retries are worth it because
 * the usual failure is a provider hiccup, not bad input; a declined topic throws
 * `TopicRefusedError` and is excluded below, since retrying a refusal just spends money
 * to be told no again.
 */
const STAGE_OPTIONS: Record<Stage, { maxDuration: number; retries: number }> = {
  research: { maxDuration: 900, retries: 3 },
  script: { maxDuration: 600, retries: 3 },
  factcheck: { maxDuration: 900, retries: 3 },
  storyboard: { maxDuration: 600, retries: 3 },
  images: { maxDuration: 900, retries: 2 },
  voice: { maxDuration: 900, retries: 2 },
  render: { maxDuration: 3600, retries: 1 },
};

function optionsFor(stage: Stage): Pick<TaskOptions<string, Payload>, "maxDuration" | "retry"> {
  const { maxDuration, retries } = STAGE_OPTIONS[stage];
  return {
    maxDuration,
    retry: { maxAttempts: retries + 1, factor: 2, minTimeoutInMs: 5_000, maxTimeoutInMs: 60_000 },
  };
}

/**
 * One task per stage, so each is retried independently and a flaky image search never
 * costs a re-run of the research that preceded it.
 */
export const stageTasks = Object.fromEntries(
  STAGES.map((stage) => [
    stage,
    task({
      id: `video.${stage}`,
      ...optionsFor(stage),
      run: async (payload: Payload) => {
        await runStageForVideo(stage, payload.videoId, deps());
        return { stage, videoId: payload.videoId };
      },
      catchError: async ({ error }) => {
        // A refusal is a decision. Retrying it spends money to be told no again.
        if (error instanceof TopicRefusedError) return { skipRetrying: true };
        return;
      },
    }),
  ]),
) as Record<Stage, ReturnType<typeof task<string, Payload>>>;

/**
 * Drives the stages in order. Each `triggerAndWait` is a separate run with its own
 * retries, and this task just sequences them and owns the final status.
 */
export const createVideoTask = task({
  id: "create-video",
  maxDuration: 7200,
  // The orchestrator itself should not retry: the stages already did, and re-running
  // it would repeat work that succeeded.
  retry: { maxAttempts: 1 },
  run: async (payload: Payload) => {
    const db = getDatabase();

    try {
      for (const stage of STAGES) {
        logger.info(`Running ${stage}`, { videoId: payload.videoId });
        const result = await stageTasks[stage].triggerAndWait(payload);
        if (!result.ok) throw new Error(`Stage ${stage} failed: ${result.error}`);
      }

      await markStatus(db, payload.videoId, "succeeded", { stage: null, error: null });
      await notifyReady(payload.videoId, { ...deps() });
      return { videoId: payload.videoId, status: "succeeded" as const };
    } catch (error) {
      await recordFailure(payload.videoId, error, { db });
      throw error;
    }
  },
});
