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

/** Videos one user may start per rolling 24 hours. */
export const DAILY_VIDEO_LIMIT = 3;

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

/**
 * Starts a video, enforcing the daily limit.
 *
 * The limit is checked and the row inserted in one transaction, so two requests racing
 * cannot both slip past a check that each saw as passing.
 */
export async function createVideo(
  db: Database,
  input: { userId: string; topic: string; level: Level; parentVideoId?: string },
): Promise<VideoRow> {
  return db.transaction(async (tx) => {
    // Lock this user's rows for the duration, so the count cannot change underneath us.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${input.userId}))`);

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [existing] = await tx
      .select({ n: count() })
      .from(videos)
      .where(and(eq(videos.userId, input.userId), gte(videos.createdAt, since)));

    if ((existing?.n ?? 0) >= DAILY_VIDEO_LIMIT) throw new RateLimitError(DAILY_VIDEO_LIMIT);

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
