"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Stage } from "@crammer/schema";
import {
  QUEUE_STALL_SECONDS,
  STAGE_LABELS,
  formatPence,
  isQueueStalled,
  stageStates,
  type StageState,
} from "@/lib/format";

type StatusResponse = {
  status: string;
  stage: Stage | null;
  error: string | null;
  costPence: number;
  createdAt: string;
  notifyByEmail: boolean;
  events: { id: string; stage: Stage | null; level: string; message: string; createdAt: string }[];
};

const POLL_MS = 2000;

const MARK: Record<StageState, string> = {
  done: "●",
  active: "◐",
  pending: "○",
  failed: "✕",
};

const TONE: Record<StageState, string> = {
  done: "text-ink",
  active: "text-accent",
  pending: "text-ink-muted/50",
  failed: "text-accent",
};

/**
 * Live progress while a video is being made.
 *
 * Polls rather than subscribing: a run takes about ten minutes, so a two-second poll
 * costs almost nothing and has far less to go wrong than a websocket. When the run
 * finishes it refreshes the route so the server component can render the player.
 */
export function VideoProgress({ videoId, initial }: { videoId: string; initial: StatusResponse }) {
  const router = useRouter();
  const [state, setState] = useState(initial);

  useEffect(() => {
    if (state.status === "succeeded" || state.status === "failed" || state.status === "refused") {
      return;
    }

    let cancelled = false;
    const timer = setInterval(async () => {
      try {
        const response = await fetch(`/api/videos/${videoId}/status`, { cache: "no-store" });
        if (!response.ok || cancelled) return;
        const next = (await response.json()) as StatusResponse;
        setState(next);
        // The player and transcript are server-rendered, so hand back over once done.
        if (next.status !== "queued" && next.status !== "running") router.refresh();
      } catch {
        // A dropped poll is not worth showing anyone; the next one will catch up.
      }
    }, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [videoId, state.status, router]);

  const states = stageStates(state.status, state.stage);
  const done = state.status === "succeeded";
  const running = state.status === "queued" || state.status === "running";
  const stalled = isQueueStalled({
    status: state.status,
    createdAt: state.createdAt,
    eventCount: state.events.length,
  });

  return (
    <div className="flex flex-col gap-8">
      {/* The header is server-rendered and goes stale during a run, so the cost the
          user is watching accumulate lives here instead. */}
      {running ? (
        <p className="text-sm text-ink-muted" aria-live="polite">
          Spent so far: <strong className="font-semibold text-ink">{formatPence(state.costPence)}</strong>
        </p>
      ) : null}
      <ol className="flex flex-col">
        {states.map(({ stage, state: mark }) => {
          const events = state.events.filter((event) => event.stage === stage);
          const latest = events.at(-1);
          return (
            <li key={stage} className="flex gap-4 border-t border-line py-3 first:border-t-0">
              <span className={`w-5 shrink-0 text-lg leading-6 ${TONE[mark]}`} aria-hidden>
                {MARK[mark]}
              </span>
              <span className="flex min-w-0 flex-col gap-1">
                <span className={`font-semibold ${mark === "pending" ? "text-ink-muted" : ""}`}>
                  {STAGE_LABELS[stage].label}
                  <span className="sr-only"> — {mark}</span>
                </span>
                <span className="text-sm text-ink-muted">
                  {latest ? latest.message : STAGE_LABELS[stage].doing}
                </span>
                {mark === "active" && events.length > 1 ? (
                  <span className="mt-1 flex flex-col gap-0.5 text-xs text-ink-muted/80">
                    {events.slice(-4, -1).map((event) => (
                      <span key={event.id} className={event.level === "warn" ? "text-accent" : ""}>
                        {event.message}
                      </span>
                    ))}
                  </span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ol>

      {state.error ? (
        <p role="alert" className="rounded-sm border border-accent bg-accent-soft/30 px-4 py-3 text-sm">
          <strong className="mr-2">
            {state.status === "refused" ? "Declined." : "Something went wrong."}
          </strong>
          {state.error}
        </p>
      ) : null}

      {/*
        A queued video with nothing consuming the queue used to sit here showing a
        cheerful "about ten minutes", which is how someone ends up refreshing for half
        an hour wondering what is happening. Say the true thing instead.
      */}
      {stalled ? (
        <div role="alert" className="rounded-sm border border-accent bg-accent-soft/30 px-4 py-3 text-sm">
          <strong className="block">Nothing has picked this up.</strong>
          <span className="mt-1 block text-ink-soft">
            This has been queued for over {Math.round(QUEUE_STALL_SECONDS / 60)} minutes with no
            worker claiming it. The video is saved and will start as soon as one is running — see
            DEPLOY.md. Nothing is lost by leaving it.
          </span>
        </div>
      ) : null}

      {done || stalled ? null : (
        <p className="text-sm text-ink-muted" role="status">
          {state.status === "queued"
            ? "Waiting for a worker to pick this up."
            : "This takes about ten minutes."}
          {state.notifyByEmail ? " You can close the tab — we will email you when it is done." : ""}
        </p>
      )}
    </div>
  );
}
