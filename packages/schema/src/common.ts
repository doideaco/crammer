import { z } from "zod";

/** A stable, human-readable id used to cross-reference pipeline artefacts. */
export const Id = z.string().min(1).max(64);

/** Reading level of the finished explainer. */
export const Level = z.enum(["beginner", "intermediate"]);
export type Level = z.infer<typeof Level>;

/** Names of every pipeline stage, in execution order. */
export const STAGES = [
  "research",
  "script",
  "factcheck",
  "storyboard",
  "images",
  "voice",
  "render",
] as const;

export const Stage = z.enum(STAGES);
export type Stage = z.infer<typeof Stage>;

/** Cost accounting for one stage of one run. */
export const StageCost = z.object({
  stage: Stage,
  /** Wall-clock duration of the stage. */
  durationMs: z.number().nonnegative(),
  inputTokens: z.number().nonnegative().default(0),
  outputTokens: z.number().nonnegative().default(0),
  cacheReadTokens: z.number().nonnegative().default(0),
  /** Characters sent to the TTS provider. */
  ttsCharacters: z.number().nonnegative().default(0),
  /** Billable provider requests (image search, vision checks, TTS calls). */
  requests: z.number().nonnegative().default(0),
  /** Best-effort estimate in GBP pence. */
  estimatedPence: z.number().nonnegative().default(0),
});
export type StageCost = z.infer<typeof StageCost>;

export const RunCost = z.object({
  stages: z.array(StageCost),
  totalPence: z.number().nonnegative(),
});
export type RunCost = z.infer<typeof RunCost>;
