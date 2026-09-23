import { STAGES, type Stage } from "@crammer/schema";
import { appendEvent, getUser, getVideo, markStatus } from "@crammer/db";
import { createMailer, readyEmail, type Mailer } from "./email.js";
import { SpendLimitError, TopicRefusedError, runStageForVideo, type StageDeps } from "./stages.js";

export type RunDeps = StageDeps & {
  mailer?: Mailer;
  /** Base URL used in the "ready" email. */
  siteUrl?: string;
  /** Stages to run. Defaults to all of them; used to resume a partial run. */
  stages?: readonly Stage[];
};

/**
 * Runs a video end to end.
 *
 * Used directly by the local worker. The Trigger.dev path calls `runStageForVideo` per
 * task instead, so each stage gets its own retries — but both go through exactly the
 * same stage functions, so there is one implementation of what a stage does.
 */
export async function runVideo(videoId: string, deps: RunDeps): Promise<void> {
  const { db } = deps;
  const stages = deps.stages ?? STAGES;

  await appendEvent(db, { videoId, message: "Starting" });

  try {
    for (const stage of stages) {
      await runStageForVideo(stage, videoId, deps);
    }
    await markStatus(db, videoId, "succeeded", { stage: null, error: null });
    await appendEvent(db, { videoId, message: "Finished" });
    await notifyReady(videoId, deps);
  } catch (error) {
    await recordFailure(videoId, error, deps);
    throw error;
  }
}

/** Marks the run failed or refused and records why, in terms a user can read. */
export async function recordFailure(
  videoId: string,
  error: unknown,
  deps: Pick<RunDeps, "db">,
): Promise<void> {
  // A refusal and an exhausted budget are both decisions rather than faults, and both
  // are things the person who asked for the video needs told plainly.
  const refused = error instanceof TopicRefusedError;
  const overspent = error instanceof SpendLimitError;
  const message = error instanceof Error ? error.message : String(error);

  await markStatus(deps.db, videoId, refused ? "refused" : "failed", { error: message });
  await appendEvent(deps.db, {
    videoId,
    level: "error",
    message: refused
      ? "Topic declined"
      : overspent
        ? `Stopped: ${message}`
        : `Failed: ${message}`,
  });
}

/** Sends the "your video is ready" mail. Never fails the run. */
export async function notifyReady(videoId: string, deps: RunDeps): Promise<void> {
  const { db } = deps;
  try {
    const video = await getVideo(db, videoId);
    if (!video) return;

    const user = await getUser(db, video.userId);
    if (!user?.email) return;

    const siteUrl = deps.siteUrl ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    const mailer = deps.mailer ?? createMailer();

    await mailer.send({
      to: user.email,
      ...readyEmail({
        topic: video.topic,
        title: video.title ?? video.topic,
        url: `${siteUrl}/videos/${videoId}`,
      }),
    });
  } catch (error) {
    // A video that rendered is a success even if the mail bounced.
    console.error(`[${videoId}] could not send the ready email: ${(error as Error).message}`);
    await appendEvent(db, {
      videoId,
      level: "warn",
      message: "The video is ready, but the notification email could not be sent.",
    }).catch(() => {});
  }
}
