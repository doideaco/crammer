import { describe, expect, it } from "vitest";
import { STAGES } from "@crammer/schema";
import { STAGE_LABELS, formatDuration, formatPence, isQueueStalled, stageStates } from "../format";

describe("STAGE_LABELS", () => {
  it("labels every stage, so the progress list can never render a blank row", () => {
    for (const stage of STAGES) {
      expect(STAGE_LABELS[stage]?.label).toBeTruthy();
      expect(STAGE_LABELS[stage]?.doing).toBeTruthy();
    }
  });
});

describe("stageStates", () => {
  it("shows everything pending before anything has started", () => {
    const states = stageStates("queued", null);
    expect(states).toHaveLength(STAGES.length);
    expect(states.every((s) => s.state === "pending")).toBe(true);
  });

  it("marks earlier stages done and later ones pending", () => {
    const states = stageStates("running", "storyboard");
    const byStage = Object.fromEntries(states.map((s) => [s.stage, s.state]));
    expect(byStage.research).toBe("done");
    expect(byStage.script).toBe("done");
    expect(byStage.storyboard).toBe("active");
    expect(byStage.images).toBe("pending");
    expect(byStage.render).toBe("pending");
  });

  it("marks the stage that failed, not the ones after it", () => {
    const byStage = Object.fromEntries(
      stageStates("failed", "images").map((s) => [s.stage, s.state]),
    );
    expect(byStage.images).toBe("failed");
    expect(byStage.voice).toBe("pending");
    expect(byStage.research).toBe("done");
  });

  it("marks a refusal against the stage that made the decision", () => {
    const byStage = Object.fromEntries(
      stageStates("refused", "research").map((s) => [s.stage, s.state]),
    );
    expect(byStage.research).toBe("failed");
    expect(byStage.script).toBe("pending");
  });

  it("shows everything done once the run succeeds, whatever stage is recorded", () => {
    expect(stageStates("succeeded", null).every((s) => s.state === "done")).toBe(true);
    expect(stageStates("succeeded", "render").every((s) => s.state === "done")).toBe(true);
  });
});

describe("isQueueStalled", () => {
  const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000).toISOString();

  it("is not stalled while a worker could still reasonably claim it", () => {
    expect(isQueueStalled({ status: "queued", createdAt: minutesAgo(1), eventCount: 0 })).toBe(
      false,
    );
  });

  it("is stalled once nothing has claimed it for minutes", () => {
    expect(isQueueStalled({ status: "queued", createdAt: minutesAgo(10), eventCount: 0 })).toBe(
      true,
    );
  });

  it("is never stalled once something has logged an event", () => {
    // The row may still say queued, but an event proves a worker is on it.
    expect(isQueueStalled({ status: "queued", createdAt: minutesAgo(60), eventCount: 3 })).toBe(
      false,
    );
  });

  it("only applies to queued videos", () => {
    for (const status of ["running", "succeeded", "failed", "refused"]) {
      expect(isQueueStalled({ status, createdAt: minutesAgo(60), eventCount: 0 })).toBe(false);
    }
  });
});

describe("formatters", () => {
  it("formats a duration as minutes and seconds", () => {
    expect(formatDuration(329)).toBe("5:29");
    expect(formatDuration(60)).toBe("1:00");
    expect(formatDuration(null)).toBe("—");
  });

  it("formats pence as pounds", () => {
    expect(formatPence(270)).toBe("£2.70");
    expect(formatPence(0)).toBe("£0.00");
  });
});
