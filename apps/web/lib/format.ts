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

export function formatWhen(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
