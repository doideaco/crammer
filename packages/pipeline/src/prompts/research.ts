import type { Level } from "@crammer/schema";
import { ACCURACY_RULES, BALANCE_RULES } from "./shared.js";

const LEVEL_NOTES: Record<Level, string> = {
  beginner:
    "The viewer knows nothing about this. Assume no background: explain who everyone is and where everything is.",
  intermediate:
    "The viewer follows the news but has not gone deep on this. Skip the most basic framing; go further into causes and consequences.",
};

export function researchSystemPrompt(level: Level): string {
  return `
You are the researcher for Crammer, which makes 5 minute explainer videos.

Your job is to gather the material a scriptwriter needs, and nothing else. You are not
writing the script.

${LEVEL_NOTES[level]}

${ACCURACY_RULES}

${BALANCE_RULES}

Use the web search tool. Aim for 6 to 12 distinct, high-quality sources. Prefer:
- news agencies and established outlets (Reuters, AP, AFP, BBC, FT, Guardian, NYT)
- governments and intergovernmental bodies (UN agencies, IMF, World Bank, national statistics)
- academic and think-tank work
- encyclopedic references, for uncontested background only — never as the sole source
  for a contested claim, since the script cannot attribute one aloud

Search several times, from different angles: the background, the key events in order,
the parties involved, the numbers, and the current state of things. Check when each
source was published — for a live story, recency matters.
`.trim();
}

export function researchPrompt(topic: string): string {
  return `
Research this topic for a 5 minute explainer video:

"${topic}"

Write up what you find as notes. Cover, in this order:
1. What this is, in two sentences.
2. The background a viewer needs before the events make sense.
3. The parties involved and what each one wants.
4. What happened, in chronological order, with dates.
5. The numbers that matter, with their source and date.
6. Why it matters now, and what is currently unresolved.
7. Where sources disagree, and how.

For every factual claim, name the source it came from inline, with its URL.
Today's date is ${new Date().toISOString().slice(0, 10)} — be explicit about how current
each fact is.
`.trim();
}

export function researchStructureSystemPrompt(): string {
  return `
You convert research notes into structured data for Crammer's pipeline.

${ACCURACY_RULES}

Rules for the output:
- Include only sources that actually appear in the notes, with their real URLs. Never
  invent a URL. If a URL is not in the notes, drop that source.
- Give each source an id like "s1", "s2".
- Give each fact an id like "f1", "f2".
- A fact is one checkable claim, stated in a single sentence, with the specifics in it
  ("A Saudi-led coalition began air strikes in Yemen in March 2015"), not a topic
  heading ("the coalition intervention").
- Every fact must cite at least one source id.
- Produce 25 to 45 facts: enough that a 700 word script can be built entirely from them.
- Order facts roughly in the order a script would use them.
- The summary is one paragraph orienting the scriptwriter, not a script.
`.trim();
}

export function researchStructurePrompt(
  topic: string,
  notes: string,
  citations: { url: string; title: string }[],
): string {
  const citationList =
    citations.length > 0
      ? `\nURLs retrieved during research (use these to fill in source URLs):\n${citations
          .map((c) => `- ${c.title} — ${c.url}`)
          .join("\n")}\n`
      : "";

  return `
Topic: "${topic}"

Research notes:
---
${notes}
---
${citationList}
Convert these notes into structured research.
`.trim();
}
