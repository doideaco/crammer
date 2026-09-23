CREATE TYPE "public"."event_level" AS ENUM('info', 'warn', 'error');--> statement-breakpoint
CREATE TYPE "public"."level" AS ENUM('beginner', 'intermediate');--> statement-breakpoint
CREATE TYPE "public"."stage" AS ENUM('research', 'script', 'factcheck', 'storyboard', 'images', 'voice', 'render');--> statement-breakpoint
CREATE TYPE "public"."video_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'refused');--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "video_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"stage" "stage",
	"level" "event_level" DEFAULT 'info' NOT NULL,
	"message" text NOT NULL,
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "videos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"topic" text NOT NULL,
	"level" "level" DEFAULT 'beginner' NOT NULL,
	"status" "video_status" DEFAULT 'queued' NOT NULL,
	"stage" "stage",
	"title" text,
	"storyboard_json" jsonb,
	"video_url" text,
	"transcript_url" text,
	"sources_url" text,
	"duration_seconds" integer,
	"cost_pence" numeric(10, 2) DEFAULT '0' NOT NULL,
	"error" text,
	"parent_video_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "video_events" ADD CONSTRAINT "video_events_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "video_events_video_created_idx" ON "video_events" USING btree ("video_id","created_at");--> statement-breakpoint
CREATE INDEX "videos_user_created_idx" ON "videos" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "videos_status_idx" ON "videos" USING btree ("status");