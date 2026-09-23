import Link from "next/link";
import { getDatabase, listVideosForUser, countVideosToday, DAILY_VIDEO_LIMIT } from "@crammer/db";
import { requireUser } from "@/lib/auth";
import { formatDuration, formatWhen } from "@/lib/format";

const STATUS_STYLES: Record<string, string> = {
  succeeded: "text-ink",
  running: "text-accent",
  queued: "text-ink-muted",
  failed: "text-accent",
  refused: "text-ink-muted",
};

export default async function VideosPage() {
  const user = await requireUser();
  const db = getDatabase();
  const [videos, usedToday] = await Promise.all([
    listVideosForUser(db, user.id),
    countVideosToday(db, user.id),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="kicker">Your videos</span>
          <div className="mt-2 rule" />
        </div>
        <p className="text-sm text-ink-muted">
          {usedToday} of {DAILY_VIDEO_LIMIT} today
        </p>
      </div>

      {videos.length === 0 ? (
        <p className="text-ink-soft">
          Nothing yet. <Link href="/" className="text-accent underline">Make your first one.</Link>
        </p>
      ) : (
        <ul className="flex flex-col">
          {videos.map((video) => (
            <li key={video.id} className="border-t border-line first:border-t-2 first:border-ink">
              <Link
                href={`/videos/${video.id}`}
                className="flex flex-wrap items-baseline justify-between gap-2 py-4 hover:text-accent"
              >
                <span className="flex flex-col gap-1">
                  <span className="text-lg font-semibold">{video.title ?? video.topic}</span>
                  {video.title ? (
                    <span className="text-sm text-ink-muted">{video.topic}</span>
                  ) : null}
                </span>
                <span className="flex items-baseline gap-4 text-sm">
                  <span className={STATUS_STYLES[video.status] ?? "text-ink-muted"}>
                    {video.status === "running" && video.stage
                      ? `running — ${video.stage}`
                      : video.status}
                  </span>
                  <span className="text-ink-muted">{formatDuration(video.durationSeconds)}</span>
                  <span className="text-ink-muted">{formatWhen(video.createdAt)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
