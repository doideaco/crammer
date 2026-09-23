import {
  FactCheckReport,
  Script,
  scriptSentences,
  scriptWordCount,
  type FactCheckIssue,
  type FactCheckResult,
  type Research,
} from "@crammer/schema";
import type { PipelineContext } from "../context.js";
import { factCheckPrompt, factCheckSystemPrompt } from "../prompts/index.js";

/**
 * How many rewrite passes to attempt before judging. A strict checker always finds
 * something on a fresh read, so one pass is rarely enough to converge — but the
 * number has to be bounded or a stubborn sentence loops forever.
 */
export const DEFAULT_MAX_REVISIONS = 2;

/**
 * Failure thresholds, applied to the issues that survive every revision pass.
 *
 * Low-severity issues never fail a run on their own: they are the wording nits a
 * careful reviewer will always produce, and treating them as blocking means no script
 * ever ships. What blocks is unsupported or unbalanced substance — high severity, or
 * enough mediums to suggest the script has drifted from its facts.
 */
export const THRESHOLDS = { high: 2, highPlusMedium: 6 } as const;

/**
 * Severity weights used to compare one pass against another.
 *
 * Revision is not monotonic: rewriting a sentence can surface a problem the previous
 * wording hid, so pass 3 is sometimes worse than pass 2. The stage keeps whichever
 * pass scored best rather than whichever ran last.
 */
const WEIGHTS = { high: 3, medium: 1, low: 0.2 } as const;

export function severityScore(issues: FactCheckIssue[]): number {
  return issues.reduce((score, issue) => score + WEIGHTS[issue.severity], 0);
}

export class FactCheckFailedError extends Error {
  constructor(
    message: string,
    readonly report: FactCheckReport,
  ) {
    super(message);
    this.name = "FactCheckFailedError";
  }
}

function tally(issues: FactCheckIssue[]) {
  const high = issues.filter((i) => i.severity === "high").length;
  const medium = issues.filter((i) => i.severity === "medium").length;
  return { high, medium, low: issues.length - high - medium };
}

/** True when the surviving issues are within what Crammer is willing to ship. */
export function passes(issues: FactCheckIssue[]): boolean {
  const { high, medium } = tally(issues);
  return high < THRESHOLDS.high && high + medium < THRESHOLDS.highPlusMedium;
}

/**
 * Stage 3.
 *
 * A separate call with no memory of writing the script. It reports problems; the stage
 * applies the rewrites and checks again, so the report that ships always describes the
 * script that was actually rendered. If substantive issues survive every pass, the run
 * fails rather than shipping a video that cannot be stood behind.
 */
export async function runFactCheck(
  input: { script: Script; research: Research },
  ctx: PipelineContext,
  options: { maxRevisions?: number } = {},
): Promise<FactCheckResult> {
  const maxRevisions = options.maxRevisions ?? DEFAULT_MAX_REVISIONS;
  const system = factCheckSystemPrompt();

  let script = input.script;

  const check = async () => {
    const result = await ctx.llm.structured({
      system,
      prompt: factCheckPrompt(script, input.research),
      schema: FactCheckReport.omit({ passed: true }),
      toolName: "emit_fact_check",
      toolDescription: "Report every sentence with an accuracy or balance problem.",
      maxTokens: 16000,
    });
    ctx.cost.add("factcheck", result.usage);
    return result.value;
  };

  let report = await check();
  ctx.log.info(`${report.issues.length} issue(s) flagged ${describe(report.issues)}.`);

  // The script and the report that produced it always travel together, so the report
  // that ships describes the script that was actually rendered.
  let best = { script, report, score: severityScore(report.issues) };

  for (let pass = 0; pass < maxRevisions && report.issues.length > 0; pass++) {
    script = applyIssues(script, report, ctx);
    report = await check();

    const score = severityScore(report.issues);
    const improved = score < best.score;
    ctx.log.info(
      `After revision ${pass + 1}: ${report.issues.length} issue(s) ${describe(report.issues)}` +
        (improved ? "." : " — worse than the previous pass, keeping that one."),
    );
    if (improved) best = { script, report, score };
    if (report.issues.length === 0) break;
  }

  // Rewrites tend to add qualifiers, so the script can drift longer across passes.
  // Surface it: this is the first thing to look at if the runtime comes out wrong.
  const before = scriptWordCount(input.script);
  const after = scriptWordCount(best.script);
  if (after > before) {
    ctx.log.info(`Revisions grew the script from ${before} to ${after} words.`);
  }

  const passed = passes(best.report.issues);
  const final: FactCheckReport = { ...best.report, passed };

  if (!passed) {
    const { high, medium } = tally(best.report.issues);
    throw new FactCheckFailedError(
      `Fact check did not pass: ${high} high and ${medium} medium severity issue(s) remain after ${maxRevisions} revision pass(es).\n` +
        best.report.issues
          .filter((i) => i.severity !== "low")
          .map((i) => `  [${i.severity}/${i.kind}] ${i.sentenceId}: ${i.explanation}`)
          .join("\n"),
      final,
    );
  }

  return { script: best.script, report: final };
}

function describe(issues: FactCheckIssue[]): string {
  const { high, medium, low } = tally(issues);
  return `(${high} high, ${medium} medium, ${low} low)`;
}

/** Applies every suggested rewrite, and deletes sentences the checker wants dropped. */
export function applyIssues(
  script: Script,
  report: Omit<FactCheckReport, "passed">,
  ctx: PipelineContext,
): Script {
  const rewrites = new Map<string, { text: string | null; factIds: string[] | null }>();
  for (const issue of report.issues) {
    // Where a sentence has several issues, the last rewrite wins, and a deletion
    // always wins — a sentence someone wanted removed does not get rescued.
    if (rewrites.get(issue.sentenceId)?.text === null) continue;
    rewrites.set(issue.sentenceId, {
      text: issue.suggestedRewrite,
      factIds: issue.suggestedFactIds,
    });
  }

  let deleted = 0;
  let rewritten = 0;

  const sections = script.sections
    .map((section) => ({
      ...section,
      sentences: section.sentences.flatMap((sentence) => {
        const rewrite = rewrites.get(sentence.id);
        if (!rewrite) return [sentence];
        if (rewrite.text === null) {
          deleted++;
          return [];
        }
        rewritten++;
        return [
          {
            ...sentence,
            text: rewrite.text,
            // Citations follow the rewrite; keeping the old ones is what made the
            // next pass report the same sentence as unsupported all over again.
            factIds: rewrite.factIds ?? sentence.factIds,
          },
        ];
      }),
    }))
    // A section can lose every sentence; drop it rather than render an empty heading.
    .filter((section) => section.sentences.length > 0);

  ctx.log.info(`  rewrote ${rewritten} sentence(s), deleted ${deleted}.`);

  const result = Script.parse({ ...script, sections });
  if (scriptSentences(result).length === 0) {
    throw new Error("Fact check removed every sentence in the script.");
  }
  return result;
}
