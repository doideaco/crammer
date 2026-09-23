import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { STAGES } from "@crammer/schema";

/** Mirrors `Level` in @crammer/schema. */
export const levelEnum = pgEnum("level", ["beginner", "intermediate"]);

/** Mirrors `STAGES` in @crammer/schema, so the two cannot drift. */
export const stageEnum = pgEnum("stage", STAGES);

export const videoStatusEnum = pgEnum("video_status", [
  "queued",
  "running",
  "succeeded",
  /** The pipeline failed. `error` says why. */
  "failed",
  /** The research stage declined the topic on safety grounds. */
  "refused",
]);

export const eventLevelEnum = pgEnum("event_level", ["info", "warn", "error"]);

/**
 * Profile row for an authenticated user.
 *
 * `id` matches `auth.users.id`; Supabase owns that table, so this is the place to hang
 * anything of our own. A trigger keeps the two in step (see the RLS migration).
 */
export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const videos = pgTable(
  "videos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    topic: text("topic").notNull(),
    level: levelEnum("level").notNull().default("beginner"),
    status: videoStatusEnum("status").notNull().default("queued"),
    /** The stage currently running, or the one that failed. */
    stage: stageEnum("stage"),
    /** Title from the script stage; null until then. */
    title: text("title"),
    /** The fully-resolved storyboard, once the run reaches render. */
    storyboardJson: jsonb("storyboard_json"),
    videoUrl: text("video_url"),
    transcriptUrl: text("transcript_url"),
    sourcesUrl: text("sources_url"),
    durationSeconds: integer("duration_seconds"),
    /** Estimated, in GBP pence. numeric so it does not drift like a float. */
    costPence: numeric("cost_pence", { precision: 10, scale: 2 }).notNull().default("0"),
    /** Set when status is failed or refused. Safe to show the user. */
    error: text("error"),
    /** The video this one was asked as a follow-up to, if any. */
    parentVideoId: uuid("parent_video_id"),
    /**
     * Added from an existing run rather than generated here. Excluded from the spend
     * caps, because it cost nothing to record.
     */
    imported: boolean("imported").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    // The two queries that matter: a user's library, and the daily rate limit.
    index("videos_user_created_idx").on(table.userId, table.createdAt.desc()),
    index("videos_status_idx").on(table.status),
  ],
);

/**
 * Stage-by-stage log for one video. This is what the status page renders, and what
 * makes a failed run explicable after the fact.
 */
export const videoEvents = pgTable(
  "video_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    videoId: uuid("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    stage: stageEnum("stage"),
    level: eventLevelEnum("level").notNull().default("info"),
    message: text("message").notNull(),
    /** Structured detail: costs, counts, provider verdicts. */
    data: jsonb("data"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [index("video_events_video_created_idx").on(table.videoId, table.createdAt)],
);

export type UserRow = typeof users.$inferSelect;
export type VideoRow = typeof videos.$inferSelect;
export type NewVideoRow = typeof videos.$inferInsert;
export type VideoEventRow = typeof videoEvents.$inferSelect;
export type VideoStatus = (typeof videoStatusEnum.enumValues)[number];
