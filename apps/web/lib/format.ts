import { STAGES, type Stage } from "@crammer/schema";

/** What each stage is called, and what it is doing, for the progress list. */
export const STAGE_LABELS: Record<Stage, { label: string; doing: string }> = {
  research: { label: "Research", doing: "Searching the web and gathering sources" },
  script: { label: "Script", doing: "Writing the narration" },
  factcheck: { label: "Fact check", doing: "Checking every sentence against its sources" },
  storyboard: { label: "Storyboard", doing: "Deciding what you see, scene by scene" },
  images: { label: "Pictures", doing: "Finding and checking licensed photography" },
  voice: { label: "Voice", doing: "Recording the narration" },
  render: { label: "Render", doing: "Putting the video together" },
};

export type StageState = "done" | "active" | "pending" | "failed";

/** Works out where each stage stands, for the stage-by-stage indicator. */
export function stageStates(
  status: string,
  current: Stage | null,
): { stage: Stage; state: StageState }[] {
  const index = current ? STAGES.indexOf(current) : -1;

  return STAGES.map((stage, i) => {
    if (status === "succeeded") return { stage, state: "done" as const };
    if (index === -1) return { stage, state: "pending" as const };
    if (i < index) return { stage, state: "done" as const };
    if (i > index) return { stage, state: "pending" as const };
    const failed = status === "failed" || status === "refused";
    return { stage, state: failed ? ("failed" as const) : ("active" as const) };
  });
}

export function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  return `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;
}

export function formatPence(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

/**
 * How long a video may sit at `queued` before we stop pretending it is fine.
 *
 * A worker claims within a couple of poll intervals, and a Trigger.dev run starts in
 * seconds. Past this, nothing is consuming the queue and the honest thing is to say so
 * rather than keep showing a spinner.
 */
export const QUEUE_STALL_SECONDS = 120;

export function isQueueStalled(input: {
  status: string;
  createdAt: string | Date;
  eventCount: number;
}): boolean {
  if (input.status !== "queued") return false;
  // Any event means something picked it up, whatever the row still says.
  if (input.eventCount > 0) return false;
  const created = typeof input.createdAt === "string" ? new Date(input.createdAt) : input.createdAt;
  return (Date.now() - created.getTime()) / 1000 > QUEUE_STALL_SECONDS;
}

export function formatWhen(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
