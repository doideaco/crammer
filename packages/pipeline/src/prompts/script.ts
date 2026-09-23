import type { Level, Research } from "@crammer/schema";
import { ACCURACY_RULES, BALANCE_RULES, HOUSE_STYLE } from "./shared.js";

/**
 * Measured speaking rate of the default narration voice, in words per minute.
 *
 * The usual rule of thumb is 150, but the ElevenLabs narration voices read an explainer
 * at about 133 — measured over a full 747-word script. The voice stage logs the rate of
 * every run, so this can be re-checked whenever the voice changes.
 */
export const NARRATION_WPM = 133;

/**
 * Target length of the spoken body, in seconds. The end card and the per-scene padding
 * add roughly 25 seconds on top, which keeps the finished video inside 4 to 6 minutes.
 */
const SPOKEN_SECONDS = { min: 265, max: 310 } as const;

/** Derived from the runtime target rather than fixed, because runtime is what matters. */
export const WORD_TARGET = {
  min: Math.round((SPOKEN_SECONDS.min / 60) * NARRATION_WPM),
  max: Math.round((SPOKEN_SECONDS.max / 60) * NARRATION_WPM),
} as const;

const LEVEL_NOTES: Record<Level, string> = {
  beginner: "Assume no prior knowledge. Introduce every person, place and acronym.",
  intermediate:
    "Assume the viewer follows the news. Do not re-explain well-known context; spend the words on causes and consequences instead.",
};

export function scriptSystemPrompt(level: Level): string {
  return `
You write the narration for Crammer, which makes 5 minute explainer videos.

${LEVEL_NOTES[level]}

${HOUSE_STYLE}

${ACCURACY_RULES}

${BALANCE_RULES}

Structure — six sections, in this exact order, with these exact headings and these
word budgets. The budgets are not guidance; a section that runs over has to lose a
whole point, not trim every sentence.

| heading | words | contents |
|---|---|---|
| "hook" | 45-60 | 2 to 3 sentences. What this is and why it is worth five minutes. Lead with the most concrete, most surprising true thing you have. No questions. |
| "context" | 115-145 | The background needed before anything else makes sense. |
| "key players" | 100-125 | Who is involved and what each one wants. Two to four parties, no more. |
| "what happened" | 160-200 | The events, strictly in chronological order, with dates. |
| "why it matters now" | 115-145 | The consequences and what is currently unresolved. |
| "recap" | 45-60 | Exactly three sentences, one per point, each standing on its own. |

Length: ${WORD_TARGET.min} to ${WORD_TARGET.max} words in total. That is the hard
constraint; at the narrator's measured ${NARRATION_WPM} words a minute it gives a
4:30 to 5:10 read, and about five and a half minutes of finished video.

You will be given far more facts than fit. **Selecting is the job.** A viewer who
understands five things is better served than one who half-hears fifteen. Pick the facts
that carry the story and leave the rest out — do not try to mention everything, and do
not compress three facts into one dense sentence to fit them all in.

Sentence rules:
- One idea per sentence. Aim for 12 to 22 words. Vary the length.
- Every sentence gets an id: "t1", "t2", ... numbered continuously across sections.
- Every sentence lists the ids of the facts it relies on, in factIds.
- A sentence with no factIds is allowed only for pure connective tissue
  ("That changed in 2015."). Fewer than one in ten sentences should be like this.
- Never state a fact that is not in the facts you were given.
- This is spoken aloud: no parentheses, no bullet points, no "as mentioned above".
  Write numbers the way they should be read.
`.trim();
}

export function scriptPrompt(research: Research): string {
  const facts = research.facts
    .map((f) => `${f.id}: ${f.claim} [${f.sourceIds.join(", ")}]`)
    .join("\n");

  const sources = research.sources
    .map((s) => `${s.id}: ${s.title} — ${s.publisher}${s.publishedAt ? ` (${s.publishedAt})` : ""}`)
    .join("\n");

  return `
Topic: "${research.topic}"

Orientation:
${research.summary}

Sources:
${sources}

Facts you may use (and only these):
${facts}

Write the narration. Give it a title of at most eight words — a plain description of
the subject, not a headline and not a question.
`.trim();
}
