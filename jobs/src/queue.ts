import type { VideoRow } from "@crammer/db";

/**
 * How a newly created video gets picked up.
 *
 * With Trigger.dev configured the web app triggers a run directly, so each stage is a
 * task with its own retries. Without it the row simply sits at `queued` and the local
 * worker claims it on its next poll — which is why the local path needs no enqueue at
 * all.
 */
export interface JobQueue {
  readonly name: string;
  enqueue(video: Pick<VideoRow, "id">): Promise<void>;
}

/** The worker polls, so there is nothing to do here. */
export class PollingQueue implements JobQueue {
  readonly name = "polling";
  async enqueue(): Promise<void> {}
}

export class TriggerQueue implements JobQueue {
  readonly name = "trigger.dev";

  async enqueue(video: Pick<VideoRow, "id">): Promise<void> {
    // Imported lazily so the SDK is only loaded when it is actually configured.
    const { tasks } = await import("@trigger.dev/sdk");
    await tasks.trigger("create-video", { videoId: video.id });
  }
}

export function createJobQueue(): JobQueue {
  return process.env.TRIGGER_SECRET_KEY ? new TriggerQueue() : new PollingQueue();
}
