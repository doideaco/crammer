import { z } from "zod";
import { Id } from "./common.js";

export const ScriptSentence = z.object({
  id: Id,
  text: z.string().min(1),
  /** Ids of the facts this sentence relies on. Empty only for pure connective tissue. */
  factIds: z.array(Id),
});
export type ScriptSentence = z.infer<typeof ScriptSentence>;

/** The fixed narrative structure every Crammer explainer follows. */
export const SECTION_HEADINGS = [
  "hook",
  "context",
  "key players",
  "what happened",
  "why it matters now",
  "recap",
] as const;

export const ScriptSection = z.object({
  heading: z.string().min(1),
  sentences: z.array(ScriptSentence).min(1),
});
export type ScriptSection = z.infer<typeof ScriptSection>;

export const Script = z.object({
  title: z.string().min(1),
  sections: z.array(ScriptSection).min(1),
});
export type Script = z.infer<typeof Script>;

export const FactCheckIssue = z.object({
  sentenceId: Id,
  kind: z.enum(["unsupported", "overstated", "one-sided", "loaded-language", "outdated"]),
  severity: z.enum(["low", "medium", "high"]),
  explanation: z.string().min(1),
  /** Replacement text, or null to drop the sentence entirely. */
  suggestedRewrite: z.string().nullable(),
  /**
   * The fact ids the rewritten sentence actually relies on.
   *
   * A rewrite often shifts which facts a sentence leans on, and a stale citation list
   * is itself an "unsupported" finding — so the checker corrects the citations in the
   * same breath as the wording. Null leaves the existing ids alone.
   */
  suggestedFactIds: z.array(Id).nullable().default(null),
});
export type FactCheckIssue = z.infer<typeof FactCheckIssue>;

export const FactCheckReport = z.object({
  issues: z.array(FactCheckIssue),
  /** Set by the stage, not the model: did the run clear the issue threshold? */
  passed: z.boolean(),
  /** Free-text note on whether contested perspectives are fairly represented. */
  balanceNote: z.string(),
});
export type FactCheckReport = z.infer<typeof FactCheckReport>;

/** Output of stage 3: the revised script plus the report that produced it. */
export const FactCheckResult = z.object({
  script: Script,
  report: FactCheckReport,
});
export type FactCheckResult = z.infer<typeof FactCheckResult>;

/** Flattens a script to its sentences in reading order. */
export function scriptSentences(script: Script): ScriptSentence[] {
  return script.sections.flatMap((s) => s.sentences);
}

/** Full narration text, used for word counts and the transcript. */
export function scriptText(script: Script): string {
  return script.sections.map((s) => s.sentences.map((x) => x.text).join(" ")).join("\n\n");
}

export function scriptWordCount(script: Script): number {
  return scriptText(script).split(/\s+/).filter(Boolean).length;
}
