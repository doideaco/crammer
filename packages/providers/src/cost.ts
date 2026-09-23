import type { Stage, StageCost } from "@crammer/schema";
import type { Usage } from "./types.js";
import { ZERO_USAGE, addUsage } from "./types.js";

/**
 * Rates in USD, as published at the time of writing. They move: treat every figure
 * these produce as an estimate for budgeting, not an invoice.
 *
 * Sources to re-check before relying on this:
 *   https://www.anthropic.com/pricing
 *   https://elevenlabs.io/pricing
 */
export const RATES = {
  /** USD per million tokens, by model id prefix. Longest matching prefix wins. */
  llmPerMillion: {
    "claude-fable-5": { input: 10, output: 50, cacheRead: 1 },
    "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5 },
    "claude-opus-4": { input: 5, output: 25, cacheRead: 0.5 },
    "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2 },
    "claude-sonnet-4": { input: 3, output: 15, cacheRead: 0.3 },
    "claude-haiku-4": { input: 1, output: 5, cacheRead: 0.1 },
  } as Record<string, { input: number; output: number; cacheRead: number }>,

  /** USD per 1,000 TTS characters, on a mid-tier ElevenLabs plan. */
  ttsPerThousandCharacters: 0.15,

  /** USD per server-side web search. */
  webSearchPerRequest: 0.01,

  /** USD to GBP. Only used to present a single headline number. */
  usdToGbp: 0.79,
} as const;

function ratesFor(model: string) {
  const match = Object.keys(RATES.llmPerMillion)
    .filter((prefix) => model.startsWith(prefix))
    .sort((a, b) => b.length - a.length)[0];
  return match ? RATES.llmPerMillion[match]! : RATES.llmPerMillion["claude-opus-5"]!;
}

/** Converts usage to pence sterling. Estimate only. */
export function estimatePence(usage: Usage, model: string): number {
  const rates = ratesFor(model);
  const usd =
    (usage.inputTokens / 1_000_000) * rates.input +
    (usage.outputTokens / 1_000_000) * rates.output +
    (usage.cacheReadTokens / 1_000_000) * rates.cacheRead +
    (usage.ttsCharacters / 1000) * RATES.ttsPerThousandCharacters;
  return Math.round(usd * RATES.usdToGbp * 100 * 100) / 100;
}

/**
 * Accumulates usage per stage so the CLI can print a cost table at the end of a run.
 * Stages report into it through `track`.
 */
export class CostTracker {
  private readonly byStage = new Map<Stage, Usage>();
  private readonly startedAt = new Map<Stage, number>();
  private readonly durations = new Map<Stage, number>();

  constructor(private readonly model: string) {}

  start(stage: Stage): void {
    this.startedAt.set(stage, Date.now());
    // Seed the stage so it appears in the report even if it spends nothing — the
    // render stage costs time but no tokens, and hiding it would be misleading.
    if (!this.byStage.has(stage)) this.byStage.set(stage, ZERO_USAGE);
  }

  finish(stage: Stage): void {
    const started = this.startedAt.get(stage);
    if (started !== undefined) {
      this.durations.set(stage, (this.durations.get(stage) ?? 0) + (Date.now() - started));
      this.startedAt.delete(stage);
    }
  }

  /** Adds one provider call's usage to a stage. */
  add(stage: Stage, usage: Partial<Usage>): void {
    this.byStage.set(stage, addUsage(this.byStage.get(stage) ?? ZERO_USAGE, usage));
  }

  usageFor(stage: Stage): Usage {
    return this.byStage.get(stage) ?? ZERO_USAGE;
  }

  costFor(stage: Stage): StageCost {
    const usage = this.usageFor(stage);
    return {
      stage,
      durationMs: this.durations.get(stage) ?? 0,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheReadTokens: usage.cacheReadTokens,
      ttsCharacters: usage.ttsCharacters,
      requests: usage.requests,
      estimatedPence: estimatePence(usage, this.model),
    };
  }

  /** Every stage that has recorded something, in the order it was first seen. */
  stages(): StageCost[] {
    return [...this.byStage.keys()].map((stage) => this.costFor(stage));
  }

  totalPence(): number {
    return Math.round(this.stages().reduce((n, s) => n + s.estimatedPence, 0) * 100) / 100;
  }

  report(): { stages: StageCost[]; totalPence: number } {
    return { stages: this.stages(), totalPence: this.totalPence() };
  }
}
