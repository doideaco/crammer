import { logger, task } from "@trigger.dev/sdk";
import { STAGES, type Stage } from "@crammer/schema";
import { getDatabase, markStatus } from "@crammer/db";
import { createArtifactStore } from "../storage-factory.js";
import { videoEntryPoint } from "../paths.js";
import { TopicRefusedError, notifyReady, recordFailure, runStageForVideo } from "../run.js";

type Payload = { videoId: string };

function deps() {
  return { db: getDatabase(), store: createArtifactStore(), videoEntryPoint: videoEntryPoint() };
}

/**
 * Builds one stage task.
 *
 * Research and render are the long ones — research waits on a dozen web searches,
 * render drives a headless browser for several minutes. Retries are worth it because
 * the usual failure is a provider hiccup, not bad input; a refusal is a decision, so
 * `catchError` stops it being retried and paid for again.
 */
function stageTask(
  id: string,
  stage: Stage,
  options: { maxDuration: number; retries: number },
) {
  return task({
    id,
    maxDuration: options.maxDuration,
    retry: {
      maxAttempts: options.retries + 1,
      factor: 2,
      minTimeoutInMs: 5_000,
      maxTimeoutInMs: 60_000,
    },
    run: async (payload: Payload) => {
      await runStageForVideo(stage, payload.videoId, deps());
      return { stage, videoId: payload.videoId };
    },
    catchError: async ({ error }) => {
      if (error instanceof TopicRefusedError) return { skipRetrying: true };
      return;
    },
  });
}

// Each task is its own top-level export with a literal id. Trigger.dev discovers tasks
// by scanning a module's exports, so one tucked inside an object is never found — the
// deploy succeeds and the task silently does not exist. Literal ids rather than
// `video.${stage}` so that searching the repo for a task id actually finds it.
export const researchTask = stageTask("video.research", "research", {
  maxDuration: 900,
  retries: 3,
});
export const scriptTask = stageTask("video.script", "script", { maxDuration: 600, retries: 3 });
export const factcheckTask = stageTask("video.factcheck", "factcheck", {
  maxDuration: 900,
  retries: 3,
});
export const storyboardTask = stageTask("video.storyboard", "storyboard", {
  maxDuration: 600,
  retries: 3,
});
export const imagesTask = stageTask("video.images", "images", { maxDuration: 900, retries: 2 });
export const voiceTask = stageTask("video.voice", "voice", { maxDuration: 900, retries: 2 });
export const renderTask = stageTask("video.render", "render", { maxDuration: 3600, retries: 1 });

/** Lookup for the orchestrator, built from the exported tasks rather than beside them. */
const STAGE_TASKS = {
  research: researchTask,
  script: scriptTask,
  factcheck: factcheckTask,
  storyboard: storyboardTask,
  images: imagesTask,
  voice: voiceTask,
  render: renderTask,
} as const satisfies Record<Stage, unknown>;

/**
 * Drives the stages in order. Each `triggerAndWait` is a separate run with its own
 * retries; this task only sequences them and owns the final status.
 */
export const createVideoTask = task({
  id: "create-video",
  maxDuration: 7200,
  // The orchestrator itself must not retry: the stages already did, and re-running it
  // would repeat work that succeeded.
  retry: { maxAttempts: 1 },
  run: async (payload: Payload) => {
    const db = getDatabase();

    try {
      for (const stage of STAGES) {
        logger.info(`Running ${stage}`, { videoId: payload.videoId });
        // Awaited one at a time and never inside Promise.all: each of these is a
        // checkpoint, and wrapping them would break resumption.
        const result = await STAGE_TASKS[stage].triggerAndWait(payload);
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
