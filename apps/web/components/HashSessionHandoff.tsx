"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Completes an implicit-flow sign-in.
 *
 * Supabase has two ways of returning a session. The PKCE flow — what
 * `signInWithOtp` from a server action produces — puts a `code` in the query string,
 * which the server can read. The implicit flow puts the tokens in the URL *fragment*,
 * which is never sent to the server at all.
 *
 * Links minted through the admin `generate_link` API take the implicit route, so a
 * server-only callback sees a bare URL and can only say the token is missing. Handling
 * both here means any valid link works, however it was produced.
 */
export function HashSessionHandoff({ next }: { next: string }) {
  const [state, setState] = useState<"working" | "failed">("working");

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");

    if (!accessToken || !refreshToken) {
      setState("failed");
      return;
    }

    void (async () => {
      const { error } = await createClient().auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error) {
        setState("failed");
        return;
      }
      // A full navigation rather than a router push, so the server sees the new cookies.
      window.location.replace(next);
    })();
  }, [next]);

  if (state === "failed") {
    return (
      <div className="flex flex-col gap-4">
        <span className="kicker">Sign-in link</span>
        <h1 className="text-3xl font-bold">That link has expired.</h1>
        <p className="text-ink-soft">
          Magic links can only be used once, and they time out. Ask for a fresh one.
        </p>
        <a href="/" className="text-accent underline">
          Back to the start
        </a>
      </div>
    );
  }

  return (
    <p className="text-ink-muted" role="status">
      Signing you in…
    </p>
  );
}
