"use client";

import { useState } from "react";
import { shareVideoAction, unshareVideoAction } from "@/app/actions";

/**
 * Creates, shows and revokes a video's public link.
 *
 * The copy button is the point: a share link that has to be selected out of a page is
 * a share link people get wrong.
 */
export function ShareLink({ videoId, url }: { videoId: string; url: string | null }) {
  const [copied, setCopied] = useState(false);

  if (!url) {
    return (
      <form action={shareVideoAction} className="flex flex-col gap-2">
        <input type="hidden" name="videoId" value={videoId} />
        <button
          type="submit"
          className="self-start rounded-sm border border-ink px-4 py-2 text-sm font-semibold hover:bg-ink hover:text-paper"
        >
          Create a share link
        </button>
        <span className="text-xs text-ink-muted">
          Anyone with the link can watch this without signing in. They cannot make videos.
        </span>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          readOnly
          value={url}
          onFocus={(event) => event.currentTarget.select()}
          className="min-w-0 flex-1 rounded-sm border border-line bg-white px-3 py-2 font-mono text-xs"
        />
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          className="rounded-sm bg-ink px-4 py-2 text-sm font-semibold text-paper hover:opacity-90"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="flex flex-wrap gap-4 text-xs text-ink-muted">
        <span>Anyone with this link can watch. They cannot make videos.</span>
        <form action={unshareVideoAction}>
          <input type="hidden" name="videoId" value={videoId} />
          <button type="submit" className="underline hover:text-accent">
            Revoke
          </button>
        </form>
        <form action={shareVideoAction}>
          <input type="hidden" name="videoId" value={videoId} />
          <button type="submit" className="underline hover:text-accent">
            New link (breaks the old one)
          </button>
        </form>
      </div>
    </div>
  );
}
