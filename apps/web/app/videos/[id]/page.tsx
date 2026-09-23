import { notFound } from "next/navigation";
import Link from "next/link";
import { getDatabase, getVideoForUser, listEvents } from "@crammer/db";
import { createArtifactStore } from "@crammer/jobs";
import { requireUser } from "@/lib/auth";
import { VideoProgress } from "@/components/VideoProgress";
import { PromptBox } from "@/components/PromptBox";
import { formatDuration, formatPence } from "@/lib/format";

export default async function VideoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const db = getDatabase();

  const video = await getVideoForUser(db, { id, userId: user.id });
  if (!video) notFound();

  const events = await listEvents(db, id);
  const finished = video.status === "succeeded";

  // Only read the deliverables once there are some; a running job has none.
  const store = createArtifactStore();
  const [transcript, sources] = finished
    ? await Promise.all([
        store.getOutputText(id, "transcript.txt"),
        store.getOutputText(id, "sources.md"),
      ])
    : [undefined, undefined];

  return (
    <div className="flex flex-col gap-12">
      <header className="flex flex-col gap-4">
        <Link href="/videos" className="kicker hover:text-ink">
          ← Your videos
        </Link>
        <h1 className="max-w-3xl text-4xl font-bold leading-tight tracking-[var(--tracking-display)]">
          {video.title ?? video.topic}
        </h1>
        {video.title ? <p className="text-ink-muted">{video.topic}</p> : null}
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-ink-muted">
          <span>{video.level}</span>
          {finished ? <span>{formatDuration(video.durationSeconds)}</span> : null}
          <span>{formatPence(Number(video.costPence))}</span>
        </div>
      </header>

      {finished && video.videoUrl ? (
        <video
          key={video.videoUrl}
          controls
          preload="metadata"
          className="w-full rounded-sm border border-line bg-ink"
          src={video.videoUrl}
        >
          Your browser cannot play this video.{" "}
          <a href={video.videoUrl}>Download it instead.</a>
        </video>
      ) : (
        <VideoProgress
          videoId={id}
          initial={{
            status: video.status,
            stage: video.stage,
            error: video.error,
            costPence: Number(video.costPence),
            createdAt: video.createdAt.toISOString(),
            notifyByEmail: Boolean(process.env.RESEND_API_KEY),
            events: events.map((event) => ({
              id: event.id,
              stage: event.stage,
              level: event.level,
              message: event.message,
              createdAt: event.createdAt.toISOString(),
            })),
          }}
        />
      )}

      {transcript ? (
        <section className="flex flex-col gap-4">
          <div>
            <span className="kicker">Transcript</span>
            <div className="mt-2 rule" />
          </div>
          <div className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded-sm border border-line bg-white p-6 text-sm leading-relaxed">
            {transcript}
          </div>
        </section>
      ) : null}

      {sources ? (
        <section className="flex flex-col gap-4">
          <div>
            <span className="kicker">Sources</span>
            <div className="mt-2 rule" />
          </div>
          <div className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded-sm border border-line bg-white p-6 font-mono text-xs leading-relaxed">
            {sources}
          </div>
        </section>
      ) : null}

      {finished ? (
        <section className="flex max-w-2xl flex-col gap-4 rounded-sm border border-line bg-paper-soft/50 p-6">
          <PromptBox
            signedIn
            compact
            parentVideoId={id}
            defaultTopic={`Go deeper on ${video.topic}: `}
          />
        </section>
      ) : null}
    </div>
  );
}
