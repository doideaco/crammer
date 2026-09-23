import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDatabase, getSharedVideo } from "@crammer/db";
import { createArtifactStore } from "@crammer/jobs";
import { formatDuration } from "@/lib/format";

/**
 * A finished video, watchable without signing in.
 *
 * Holding the token is the authorisation — there is no session here and no user. Only
 * successful videos resolve, so a link cannot be used to watch a run in progress or to
 * read the error off a failed one. There is nothing on this page that starts work.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const video = await getSharedVideo(getDatabase(), token);
  if (!video) return { title: "Crammer" };

  return {
    title: `${video.title ?? video.topic} — Crammer`,
    description: `A five minute explainer on ${video.topic}. Every claim traces to a source.`,
    openGraph: {
      title: video.title ?? video.topic,
      description: `A five minute explainer on ${video.topic}.`,
      type: "video.other",
    },
    // A share link should not end up in search results.
    robots: { index: false, follow: false },
  };
}

export default async function WatchPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const video = await getSharedVideo(getDatabase(), token);
  if (!video?.videoUrl) notFound();

  // Local artefact URLs are served by this app and need the token; Supabase Storage
  // URLs are already public and must be left alone.
  const videoSrc = video.videoUrl.startsWith("/media/")
    ? `${video.videoUrl}?t=${encodeURIComponent(token)}`
    : video.videoUrl;

  const store = createArtifactStore();
  const [transcript, sources] = await Promise.all([
    store.getOutputText(video.id, "transcript.txt"),
    store.getOutputText(video.id, "sources.md"),
  ]);

  return (
    <div className="flex flex-col gap-12">
      <header className="flex flex-col gap-4">
        <span className="kicker">Explainer</span>
        <h1 className="max-w-3xl text-4xl font-bold leading-tight tracking-[var(--tracking-display)]">
          {video.title ?? video.topic}
        </h1>
        {video.title ? <p className="text-ink-muted">{video.topic}</p> : null}
        <p className="text-sm text-ink-muted">{formatDuration(video.durationSeconds)}</p>
      </header>

      <video
        controls
        preload="metadata"
        className="w-full rounded-sm border border-line bg-ink"
        src={videoSrc}
      >
        Your browser cannot play this video. <a href={videoSrc}>Download it instead.</a>
      </video>

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

      <p className="text-sm text-ink-muted">
        Made with <Link href="/" className="text-accent underline">Crammer</Link>, which turns one
        prompt into a five minute narrated explainer.
      </p>
    </div>
  );
}
