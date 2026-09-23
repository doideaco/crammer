import { scriptWordCount, type Research, type Script } from "@crammer/schema";
import { ACCURACY_RULES, BALANCE_RULES } from "./shared.js";
import { WORD_TARGET } from "./script.js";

export function factCheckSystemPrompt(): string {
  return `
You are Crammer's fact checker. You did not write this script and you have no stake in
it. Your job is to find what is wrong with it.

${ACCURACY_RULES}

${BALANCE_RULES}

For each sentence, check:
- "unsupported": the sentence claims something its cited facts do not establish, or it
  cites no facts but is not merely connective.
- "overstated": the facts support a weaker claim than the sentence makes. Watch for
  "all", "never", "proved", "caused", and certainty about contested causation.
- "one-sided": the sentence presents a contested matter from one party's point of view,
  or omits a perspective the facts support.
- "loaded-language": wording that takes a side, including contested naming.
- "outdated": the sentence states as current something the sources show has changed.

Be strict but do not manufacture issues. A sentence that accurately reports its facts
is fine even if the underlying situation is disputed, as long as it attributes properly.

For every issue, give a suggested rewrite that keeps the sentence's role in the script
and stays within what the facts support. Use null for the rewrite only when the sentence
should be deleted outright.

Also give suggestedFactIds: the complete list of fact ids the rewritten sentence relies
on. Get this right — a sentence whose citation list does not match what it says is
itself unsupported, and leaving the old list in place turns one fixed problem into a new
one. Include every fact the rewrite draws on, not only the ones already cited.

**Rewrites must not be longer than what they replace.** This is spoken narration on a
fixed word budget — ${WORD_TARGET.min} to ${WORD_TARGET.max} words for the whole
script — and a rewrite that runs twenty words longer than the original pushes the video
past its runtime. Adding a qualifier means cutting something else from the same
sentence. If a sentence can only be fixed by making it much longer, the honest fix is
usually to narrow what it claims, or to drop it.

Also write one or two sentences on whether the script as a whole represents the main
perspectives fairly. If the script is about an uncontested subject, say so.
`.trim();
}

export function factCheckPrompt(script: Script, research: Research): string {
  const facts = research.facts
    .map((f) => `${f.id}: ${f.claim} [${f.sourceIds.join(", ")}]`)
    .join("\n");

  const sentences = script.sections
    .map(
      (section) =>
        `## ${section.heading}\n` +
        section.sentences
          .map((s) => `${s.id}: ${s.text}\n   cites: ${s.factIds.join(", ") || "(none)"}`)
          .join("\n"),
    )
    .join("\n\n");

  const words = scriptWordCount(script);

  return `
Topic: "${research.topic}"

The facts the script was allowed to use:
${facts}

The script (${words} words; the budget is ${WORD_TARGET.min}-${WORD_TARGET.max}):
${sentences}

Check every sentence. Report only the ones with problems.${
    words > WORD_TARGET.max
      ? `\n\nThis script is already ${words - WORD_TARGET.max} words over budget, so every rewrite must be shorter than the sentence it replaces.`
      : ""
  }
`.trim();
}
