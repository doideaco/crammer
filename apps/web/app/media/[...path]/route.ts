import { createReadStream, statSync } from "node:fs";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { getDatabase, getSharedVideo, getVideoForUser } from "@crammer/db";
import { LocalArtifactStore, localMediaRoot } from "@crammer/jobs";
import { currentUser } from "@/lib/auth";

/**
 * Serves deliverables when the local artefact store is in use.
 *
 * With Supabase Storage configured, `videoUrl` points straight at the bucket and this
 * route is never hit. It exists so a single-machine deployment — the setup the spec
 * allows for M2 — still works.
 *
 * Range requests matter: a browser seeking in a 70MB MP4 asks for byte ranges, and
 * answering the whole file every time makes the player unusable.
 */
const SERVABLE: Record<string, string> = {
  "video.mp4": "video/mp4",
  "transcript.txt": "text/plain; charset=utf-8",
  "sources.md": "text/markdown; charset=utf-8",
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<NextResponse | Response> {
  const { path } = await params;
  const [videoId, name] = path;

  const contentType = name ? SERVABLE[name] : undefined;
  if (!videoId || !name || !contentType || path.length !== 2) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  // Deliverables are private to their owner. A share token is the other way in: it is
  // the same authorisation the watch page runs on, and without this a shared video
  // would play in production (public bucket URLs) but not locally, where the files are
  // served from here.
  const db = getDatabase();
  const token = new URL(request.url).searchParams.get("t");

  const video = token
    ? await getSharedVideo(db, token)
    : await (async () => {
        const user = await currentUser();
        if (!user) return undefined;
        return getVideoForUser(db, { id: videoId, userId: user.id });
      })();

  // Same response for "not yours", "bad token" and "does not exist".
  if (!video || video.id !== videoId) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const file = new LocalArtifactStore(localMediaRoot()).pathForOutput(videoId, name);

  let size: number;
  try {
    size = statSync(file).size;
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const range = request.headers.get("range");
  const common = {
    "content-type": contentType,
    "accept-ranges": "bytes",
    "cache-control": "private, max-age=3600",
  };

  if (!range) {
    return new Response(toWebStream(createReadStream(file)), {
      headers: { ...common, "content-length": String(size) },
    });
  }

  const match = /bytes=(\d*)-(\d*)/.exec(range);
  const start = match?.[1] ? Number(match[1]) : 0;
  const end = match?.[2] ? Math.min(Number(match[2]), size - 1) : size - 1;

  if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) {
    return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
  }

  return new Response(toWebStream(createReadStream(file, { start, end })), {
    status: 206,
    headers: {
      ...common,
      "content-range": `bytes ${start}-${end}/${size}`,
      "content-length": String(end - start + 1),
    },
  });
}

function toWebStream(stream: ReturnType<typeof createReadStream>): ReadableStream {
  return Readable.toWeb(stream) as ReadableStream;
}
