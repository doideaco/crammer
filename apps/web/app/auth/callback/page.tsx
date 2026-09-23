import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createVideo, ensureUser, getDatabase, RateLimitError } from "@crammer/db";
import { createJobQueue } from "@crammer/jobs";
import { createClient } from "@/lib/supabase/server";
import { PENDING_COOKIE, PendingRequest } from "@/lib/pending";
import { HashSessionHandoff } from "@/components/HashSessionHandoff";

/**
 * Where the magic link lands.
 *
 * Supabase can return a session three ways, and a link that works is not worth
 * refusing because it took a different one:
 *
 * - `code` — the PKCE flow, which `signInWithOtp` from a server action produces.
 * - `token_hash` — projects using the `{{ .TokenHash }}` email template.
 * - a URL *fragment* — the implicit flow, used by admin-generated links. The fragment
 *   never reaches the server, so that case is handed to a client component.
 */
export default async function AuthCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; token_hash?: string; error_description?: string }>;
}) {
  const { code, token_hash: tokenHash, error_description: errorDescription } = await searchParams;

  if (errorDescription) redirect(`/?error=${encodeURIComponent(errorDescription)}`);

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) redirect(`/?error=${encodeURIComponent(error.message)}`);
  } else if (tokenHash) {
    const { error } = await supabase.auth.verifyOtp({ type: "email", token_hash: tokenHash });
    if (error) redirect(`/?error=${encodeURIComponent(error.message)}`);
  } else {
    // Nothing in the query string. The tokens may be in the fragment, which only the
    // browser can see — hand over rather than declaring the link broken.
    return <HashSessionHandoff next="/auth/complete" />;
  }

  redirect(await completeSignIn());
}

/**
 * Turns a fresh session into a profile row and, if one was waiting, a video.
 *
 * Exported so the fragment path can reuse it once the client has set the session.
 */
export async function completeSignIn(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return "/?error=That+link+has+expired.+Ask+for+a+new+one.";

  const db = getDatabase();
  await ensureUser(db, { id: user.id, email: user.email });

  const store = await cookies();
  const pending = store.get(PENDING_COOKIE)?.value;
  store.delete(PENDING_COOKIE);

  if (pending) {
    const parsed = PendingRequest.safeParse(safeJson(pending));
    if (parsed.success) {
      try {
        const video = await createVideo(db, { userId: user.id, ...parsed.data });
        await createJobQueue().enqueue({ id: video.id });
        return `/videos/${video.id}`;
      } catch (error) {
        if (error instanceof RateLimitError) {
          return `/videos?error=${encodeURIComponent(error.message)}`;
        }
        throw error;
      }
    }
  }

  return "/videos";
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
