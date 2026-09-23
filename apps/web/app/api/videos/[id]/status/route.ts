import { NextResponse } from "next/server";
import { getDatabase, getVideoForUser, listEvents } from "@crammer/db";
import { currentUser } from "@/lib/auth";

/**
 * Polled by the status page while a video is being made.
 *
 * Polling rather than Realtime: a run takes ten minutes and a two-second poll is a
 * rounding error next to that, with far less to go wrong. Realtime would be the
 * upgrade if this ever needed to be instant.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { id } = await params;
  const db = getDatabase();
  const video = await getVideoForUser(db, { id, userId: user.id });
  // Same response for "not yours" as "does not exist": ids should not be probeable.
  if (!video) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const events = await listEvents(db, id);

  return NextResponse.json(
    {
      id: video.id,
      status: video.status,
      stage: video.stage,
      createdAt: video.createdAt.toISOString(),
      // Whether a completion email will actually be sent. Promising one when no mail
      // provider is configured is just a lie told politely.
      notifyByEmail: Boolean(process.env.RESEND_API_KEY),
      title: video.title,
      videoUrl: video.videoUrl,
      durationSeconds: video.durationSeconds,
      costPence: Number(video.costPence),
      error: video.error,
      events: events.map((event) => ({
        id: event.id,
        stage: event.stage,
        level: event.level,
        message: event.message,
        createdAt: event.createdAt,
      })),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
