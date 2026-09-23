ALTER TABLE "videos" ADD COLUMN "share_token" text;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_share_token_unique" UNIQUE("share_token");