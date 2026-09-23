import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "../client.js";
import {
  GlobalLimitError,
  dailyVideoLimit,
  globalVideoLimit,
  countVideosInWindow,
  createImportedVideo,
  remainingGlobalVideos,
  RateLimitError,
  appendEvent,
  claimNextQueuedVideo,
  countVideosToday,
  createVideo,
  ensureUser,
  getVideo,
  getVideoForUser,
  listEvents,
  listVideosForUser,
  markStatus,
  updateVideo,
} from "../queries.js";

/**
 * These run against a real Postgres, because the things worth testing here — the
 * advisory-lock rate limit, `for update skip locked` claiming, cascading deletes — are
 * database behaviour and a fake would not exercise any of it.
 *
 * Skipped when DATABASE_URL is unset, so the suite still passes without one.
 */
const url = process.env.DATABASE_URL;
const suite = url ? describe : describe.skip;

suite("queries (live database)", () => {
  let db: Database;
  let close: () => Promise<void>;
  const userId = randomUUID();

  beforeAll(async () => {
    const created = createDatabase(url, { max: 4 });
    db = created.db;
    close = () => created.client.end({ timeout: 5 });
    await ensureUser(db, { id: userId, email: `test-${userId}@example.com` });
  });

  afterAll(async () => {
    // Videos and events cascade from the user row.
    await db.execute(`delete from users where id = '${userId}'` as never).catch(() => {});
    await close();
  });

  it("upserts a profile without duplicating it", async () => {
    await ensureUser(db, { id: userId, email: "changed@example.com" });
    await ensureUser(db, { id: userId, email: "changed@example.com" });
    expect(await countVideosToday(db, userId)).toBe(0);
  });

  it("creates a video and finds it only for its owner", async () => {
    const video = await createVideo(db, {
      userId,
      topic: "A test topic about shipping",
      level: "beginner",
    });

    expect(video.status).toBe("queued");
    expect(await getVideoForUser(db, { id: video.id, userId })).toBeDefined();
    // Someone else's id must not resolve it, whatever they know about the row.
    expect(await getVideoForUser(db, { id: video.id, userId: randomUUID() })).toBeUndefined();
  });

  it("enforces the daily limit server-side", async () => {
    // Isolate the per-user limit from the global one, which is lower by default.
    process.env.CRAMMER_GLOBAL_VIDEO_LIMIT = "1000";
    const used = await countVideosToday(db, userId);
    for (let i = used; i < dailyVideoLimit(); i++) {
      await createVideo(db, { userId, topic: `Filler topic number ${i}`, level: "beginner" });
    }
    expect(await countVideosToday(db, userId)).toBe(dailyVideoLimit());

    await expect(
      createVideo(db, { userId, topic: "One over the limit", level: "beginner" }),
    ).rejects.toThrow(RateLimitError);
  });

  it("holds the limit when requests race", async () => {
    process.env.CRAMMER_GLOBAL_VIDEO_LIMIT = "1000";
    const racer = randomUUID();
    await ensureUser(db, { id: racer, email: `race-${racer}@example.com` });

    // Fire more than the limit at once: without the advisory lock, several would each
    // read a count below the limit and all insert.
    const attempts = await Promise.allSettled(
      Array.from({ length: dailyVideoLimit() + 4 }, (_, i) =>
        createVideo(db, { userId: racer, topic: `Racing topic number ${i}`, level: "beginner" }),
      ),
    );

    expect(attempts.filter((a) => a.status === "fulfilled")).toHaveLength(dailyVideoLimit());
    expect(await countVideosToday(db, racer)).toBe(dailyVideoLimit());
    await db.execute(`delete from users where id = '${racer}'` as never);
  });

  it("does not count imported videos against the spend caps", async () => {
    process.env.CRAMMER_GLOBAL_VIDEO_LIMIT = "1000";
    const before = await countVideosInWindow(db);
    await createImportedVideo(db, {
      userId,
      topic: "An existing run added from the CLI",
      level: "beginner",
    });
    // The video exists, but the budget it exists to protect is untouched.
    expect(await countVideosInWindow(db)).toBe(before);
    expect(await remainingGlobalVideos(db)).toBe(Math.max(0, globalVideoLimit() - before));
  });

  it("caps the whole instance, not just one user", async () => {
    process.env.CRAMMER_GLOBAL_VIDEO_LIMIT = "3";
    // Clear the decks: this asserts on a global count, so it owns the table.
    await db.execute("delete from videos where imported = false" as never);

    const people = await Promise.all(
      [0, 1, 2, 3].map(async (i) => {
        const id = randomUUID();
        await ensureUser(db, { id, email: `crowd-${i}-${id}@example.com` });
        return id;
      }),
    );

    // One video each, from different users, so no per-user limit is in play.
    const results = await Promise.allSettled(
      people.map((id, i) =>
        createVideo(db, { userId: id, topic: `A topic from person ${i}`, level: "beginner" }),
      ),
    );

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(globalVideoLimit());
    const rejected = results.find((r) => r.status === "rejected");
    expect((rejected as PromiseRejectedResult | undefined)?.reason).toBeInstanceOf(
      GlobalLimitError,
    );
    expect(await remainingGlobalVideos(db)).toBe(0);

    for (const id of people) await db.execute(`delete from users where id = '${id}'` as never);
  });

  it("claims one queued video per worker", async () => {
    const worker = randomUUID();
    await ensureUser(db, { id: worker, email: `worker-${worker}@example.com` });
    const created = await createVideo(db, {
      userId: worker,
      topic: "Something for a worker to claim",
      level: "beginner",
    });

    const claimed = await claimNextQueuedVideo(db);
    expect(claimed?.id).toBeDefined();
    expect(claimed?.status).toBe("running");

    // A second claim must not hand out the same row.
    const again = await claimNextQueuedVideo(db);
    expect(again?.id).not.toBe(claimed?.id);

    await updateVideo(db, created.id, { status: "queued" });
    await db.execute(`delete from users where id = '${worker}'` as never);
  });

  it("records stage events and reads them back in order", async () => {
    const [video] = await listVideosForUser(db, userId, 1);
    if (!video) throw new Error("expected a video");

    await appendEvent(db, { videoId: video.id, stage: "research", message: "first" });
    await appendEvent(db, { videoId: video.id, stage: "script", level: "warn", message: "second" });

    const events = await listEvents(db, video.id);
    expect(events.map((e) => e.message)).toEqual(["first", "second"]);
    expect(events[1]?.level).toBe("warn");
  });

  it("stamps completedAt when a run reaches a terminal state", async () => {
    const [video] = await listVideosForUser(db, userId, 1);
    if (!video) throw new Error("expected a video");

    await markStatus(db, video.id, "succeeded");
    const updated = await getVideo(db, video.id);
    expect(updated?.status).toBe("succeeded");
    expect(updated?.completedAt).toBeInstanceOf(Date);
  });
});
