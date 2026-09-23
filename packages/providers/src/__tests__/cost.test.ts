import { describe, expect, it } from "vitest";
import { CostTracker, estimatePence } from "../cost.js";
import { ZERO_USAGE } from "../types.js";

describe("estimatePence", () => {
  it("prices tokens against the model's rates", () => {
    const pence = estimatePence(
      { ...ZERO_USAGE, inputTokens: 1_000_000, outputTokens: 1_000_000 },
      "claude-opus-5",
    );
    // (5 + 25) USD * 0.79 = 23.70 GBP = 2370 pence
    expect(pence).toBeCloseTo(2370, 0);
  });

  it("charges a cheaper model less", () => {
    const usage = { ...ZERO_USAGE, inputTokens: 1_000_000, outputTokens: 1_000_000 };
    expect(estimatePence(usage, "claude-haiku-4-5")).toBeLessThan(
      estimatePence(usage, "claude-opus-5"),
    );
  });

  it("falls back to opus rates for an unrecognised model", () => {
    const usage = { ...ZERO_USAGE, inputTokens: 1_000_000 };
    expect(estimatePence(usage, "some-future-model")).toBe(estimatePence(usage, "claude-opus-5"));
  });

  it("bills TTS by the character", () => {
    expect(estimatePence({ ...ZERO_USAGE, ttsCharacters: 10_000 }, "claude-opus-5")).toBeGreaterThan(
      0,
    );
  });
});

describe("CostTracker", () => {
  it("accumulates usage per stage and totals the run", () => {
    const tracker = new CostTracker("claude-opus-5");
    tracker.start("research");
    tracker.add("research", { inputTokens: 1000, outputTokens: 500, requests: 1 });
    tracker.add("research", { inputTokens: 2000, requests: 1 });
    tracker.finish("research");
    tracker.add("voice", { ttsCharacters: 4000, requests: 8 });

    const report = tracker.report();
    expect(report.stages).toHaveLength(2);

    const research = report.stages.find((s) => s.stage === "research")!;
    expect(research.inputTokens).toBe(3000);
    expect(research.requests).toBe(2);
    expect(research.durationMs).toBeGreaterThanOrEqual(0);

    expect(report.totalPence).toBeCloseTo(
      report.stages.reduce((n, s) => n + s.estimatedPence, 0),
      2,
    );
  });

  it("reports zero for a stage that never ran", () => {
    expect(new CostTracker("claude-opus-5").usageFor("render")).toEqual(ZERO_USAGE);
  });
});
