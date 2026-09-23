import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createVideo, ensureUser, getDatabase, RateLimitError } from "@crammer/db";
import { createJobQueue } from "@crammer/jobs";
import { createClient } from "@/lib/supabase/server";
import { PENDING_COOKIE, PendingRequest } from "@/lib/pending";

/**
 * Where the magic link lands.
 *
 * Supports both shapes Supabase can send: the PKCE `code` (what `signInWithOtp` from a
 * server action produces) and a `token_hash`, which is what a project using the
 * `{{ .TokenHash }}` email template will send.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return failed(url, error.message);
  } else if (tokenHash) {
    const { error } = await supabase.auth.verifyOtp({ type: "email", token_hash: tokenHash });
    if (error) return failed(url, error.message);
  } else {
    return failed(url, "That link is missing its token. Ask for a new one.");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return failed(url, "That link has expired. Ask for a new one.");

  const db = getDatabase();
  await ensureUser(db, { id: user.id, email: user.email });

  // Pick up the topic they typed before signing in, if it is still waiting.
  const store = await cookies();
  const pending = store.get(PENDING_COOKIE)?.value;
  store.delete(PENDING_COOKIE);

  if (pending) {
    const parsed = PendingRequest.safeParse(safeJson(pending));
    if (parsed.success) {
      try {
        const video = await createVideo(db, { userId: user.id, ...parsed.data });
        await createJobQueue().enqueue({ id: video.id });
        return NextResponse.redirect(new URL(`/videos/${video.id}`, url.origin));
      } catch (error) {
        // Over the daily limit already: sign them in anyway and say so.
        if (error instanceof RateLimitError) return failed(url, error.message, "/videos");
        throw error;
      }
    }
  }

  return NextResponse.redirect(new URL("/videos", url.origin));
}

function failed(url: URL, message: string, path = "/"): NextResponse {
  const target = new URL(path, url.origin);
  target.searchParams.set("error", message);
  return NextResponse.redirect(target);
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
