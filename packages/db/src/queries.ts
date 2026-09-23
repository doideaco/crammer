import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import type { Level, Stage } from "@crammer/schema";
import type { Database } from "./client.js";
import {
  users,
  videoEvents,
  videos,
  type NewVideoRow,
  type UserRow,
  type VideoEventRow,
  type VideoRow,
  type VideoStatus,
} from "./schema.js";

/**
 * Limits are read when they are used, not when this module loads.
 *
 * Module-load reads mean a deployment has to be rebuilt to change a cap, and they are
 * untestable without re-importing the module.
 */
export function dailyVideoLimit(): number {
  return Number(process.env.CRAMMER_DAILY_VIDEO_LIMIT ?? 3);
}

/**
 * Videos anyone at all may start in the window below.
 *
 * The per-user limit bounds one person; this bounds the bill. A public demo that
 * several people find at once would otherwise cost about GBP 2.70 a go with nothing
 * to stop it. Set the window very large to make this a hard total rather than a rate.
 */
export function globalVideoLimit(): number {
  return Number(process.env.CRAMMER_GLOBAL_VIDEO_LIMIT ?? 3);
}

/**
 * Window the global limit applies over. The default is effectively forever, making it
 * a hard total rather than a rate — which is what a demo wants. Set it to 24 to get a
 * self-resetting daily cap instead.
 */
export function globalWindowHours(): number {
  return Number(process.env.CRAMMER_GLOBAL_VIDEO_WINDOW_HOURS ?? 24 * 365 * 100);
}

/** Advisory lock key for the global check. Any constant, as long as it is the same one. */
const GLOBAL_LOCK_KEY = 20260923;

/**
 * Creates or refreshes the profile row for a signed-in user.
 *
 * Supabase owns `auth.users`; this mirrors the parts we query so the app never has to
 * reach across schemas.
 */
export async function ensureUser(
  db: Database,
  input: { id: string; email: string },
): Promise<void> {
  await db
    .insert(users)
    .values({ id: input.id, email: input.email })
    .onConflictDoUpdate({ target: users.id, set: { email: input.email } });
}

/** One user's profile. */
export async function getUser(db: Database, id: string): Promise<UserRow | undefined> {
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return row;
}

/** One user, by email. Used by tools that take an address rather than an id. */
export async function getUserByEmail(db: Database, email: string): Promise<UserRow | undefined> {
  const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return row;
}

/** Videos this user started in the last 24 hours. */
export async function countVideosToday(db: Database, userId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [row] = await db
    .select({ n: count() })
    .from(videos)
    .where(and(eq(videos.userId, userId), gte(videos.createdAt, since)));
  return row?.n ?? 0;
}

export class RateLimitError extends Error {
  constructor(readonly limit: number) {
    super(`You have reached the limit of ${limit} videos a day. Try again tomorrow.`);
    this.name = "RateLimitError";
  }
}

/** Raised when the whole instance is at its cap, not just this user. */
export class GlobalLimitError extends Error {
  constructor(
    readonly limit: number,
    readonly windowHours: number,
  ) {
    super(
      windowHours >= 24 * 365
        ? `This demo is capped at ${limit} videos in total and has reached it.`
        : `This demo is capped at ${limit} videos every ${windowHours} hours and has reached it. Try again later.`,
    );
    this.name = "GlobalLimitError";
  }
}

/**
 * Videos the pipeline has generated across the whole instance, inside the global window.
 *
 * Imported videos are excluded: they were made elsewhere and cost nothing to add, so
 * letting them consume a budget that exists to bound spend would be wrong.
 */
export async function countVideosInWindow(db: Database): Promise<number> {
  const since = new Date(Date.now() - globalWindowHours() * 60 * 60 * 1000);
  const [row] = await db
    .select({ n: count() })
    .from(videos)
    .where(and(gte(videos.createdAt, since), eq(videos.imported, false)));
  return row?.n ?? 0;
}

/** How many more the pipeline may generate before the instance is capped. */
export async function remainingGlobalVideos(db: Database): Promise<number> {
  return Math.max(0, globalVideoLimit() - (await countVideosInWindow(db)));
}

/**
 * Starts a video, enforcing both the per-user and the whole-instance limits.
 *
 * Checks and insert happen in one transaction under advisory locks, so requests racing
 * each other cannot all slip past a check that each saw as passing.
 */
export async function createVideo(
  db: Database,
  input: { userId: string; topic: string; level: Level; parentVideoId?: string },
): Promise<VideoRow> {
  return db.transaction(async (tx) => {
    // Global lock first, then the per-user one — always in that order, or two
    // transactions taking them the other way round would deadlock.
    await tx.execute(sql`select pg_advisory_xact_lock(${GLOBAL_LOCK_KEY})`);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${input.userId}))`);

    const globalSince = new Date(Date.now() - globalWindowHours() * 60 * 60 * 1000);
    const [global] = await tx
      .select({ n: count() })
      .from(videos)
      .where(and(gte(videos.createdAt, globalSince), eq(videos.imported, false)));

    if ((global?.n ?? 0) >= globalVideoLimit()) {
      throw new GlobalLimitError(globalVideoLimit(), globalWindowHours());
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [existing] = await tx
      .select({ n: count() })
      .from(videos)
      .where(and(eq(videos.userId, input.userId), gte(videos.createdAt, since)));

    if ((existing?.n ?? 0) >= dailyVideoLimit()) throw new RateLimitError(dailyVideoLimit());

    const values: NewVideoRow = {
      userId: input.userId,
      topic: input.topic,
      level: input.level,
      status: "queued",
      ...(input.parentVideoId ? { parentVideoId: input.parentVideoId } : {}),
    };
    const [row] = await tx.insert(videos).values(values).returning();
    if (!row) throw new Error("Failed to create the video row.");
    return row;
  });
}

/** One video, scoped to its owner. Returns undefined rather than throwing. */
export async function getVideoForUser(
  db: Database,
  input: { id: string; userId: string },
): Promise<VideoRow | undefined> {
  const [row] = await db
    .select()
    .from(videos)
    .where(and(eq(videos.id, input.id), eq(videos.userId, input.userId)))
    .limit(1);
  return row;
}

/**
 * Adds an already-finished video to a library, bypassing both limits.
 *
 * `pnpm import:run` uses this. The video was produced elsewhere and costs nothing to
 * record, so it neither consumes the demo budget nor counts against a daily allowance.
 */
export async function createImportedVideo(
  db: Database,
  input: { userId: string; topic: string; level: Level },
): Promise<VideoRow> {
  const [row] = await db
    .insert(videos)
    .values({ ...input, status: "queued", imported: true })
    .returning();
  if (!row) throw new Error("Failed to create the imported video row.");
  return row;
}

/** One video without an ownership check. Only for trusted workers. */
export async function getVideo(db: Database, id: string): Promise<VideoRow | undefined> {
  const [row] = await db.select().from(videos).where(eq(videos.id, id)).limit(1);
  return row;
}

export async function listVideosForUser(
  db: Database,
  userId: string,
  limit = 50,
): Promise<VideoRow[]> {
  return db
    .select()
    .from(videos)
    .where(eq(videos.userId, userId))
    .orderBy(desc(videos.createdAt))
    .limit(limit);
}

export type VideoPatch = Partial<
  Pick<
    VideoRow,
    | "status"
    | "stage"
    | "title"
    | "storyboardJson"
    | "videoUrl"
    | "transcriptUrl"
    | "sourcesUrl"
    | "durationSeconds"
    | "costPence"
    | "error"
    | "completedAt"
  >
>;

export async function updateVideo(
  db: Database,
  id: string,
  patch: VideoPatch,
): Promise<VideoRow | undefined> {
  const [row] = await db
    .update(videos)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(videos.id, id))
    .returning();
  return row;
}

export async function markStatus(
  db: Database,
  id: string,
  status: VideoStatus,
  extra: VideoPatch = {},
): Promise<void> {
  const completedAt =
    status === "succeeded" || status === "failed" || status === "refused" ? new Date() : null;
  await updateVideo(db, id, { status, ...(completedAt ? { completedAt } : {}), ...extra });
}

/**
 * Atomically takes the oldest queued video and marks it running.
 *
 * `for update skip locked` is what makes it safe to run several workers: each claims a
 * different row instead of blocking on the same one.
 */
export async function claimNextQueuedVideo(db: Database): Promise<VideoRow | undefined> {
  const rows = await db.execute<VideoRow>(sql`
    update videos set status = 'running', updated_at = now()
    where id = (
      select id from videos
      where status = 'queued'
      order by created_at
      for update skip locked
      limit 1
    )
    returning *
  `);
  return (rows as unknown as VideoRow[])[0];
}

export async function appendEvent(
  db: Database,
  input: {
    videoId: string;
    stage?: Stage | null;
    level?: "info" | "warn" | "error";
    message: string;
    data?: unknown;
  },
): Promise<void> {
  await db.insert(videoEvents).values({
    videoId: input.videoId,
    stage: input.stage ?? null,
    level: input.level ?? "info",
    message: input.message,
    data: input.data ?? null,
  });
}

export async function listEvents(db: Database, videoId: string): Promise<VideoEventRow[]> {
  return db
    .select()
    .from(videoEvents)
    .where(eq(videoEvents.videoId, videoId))
    .orderBy(videoEvents.createdAt);
}
