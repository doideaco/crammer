import { ICON_NAMES, TEMPLATE_DESCRIPTIONS, type Script, type Research } from "@crammer/schema";
import { scriptSentences } from "@crammer/schema";

/**
 * Worked examples of each template's props. A schema alone tells the model what is
 * legal; an example tells it what good looks like.
 */
const TEMPLATE_EXAMPLES: Record<keyof typeof TEMPLATE_DESCRIPTIONS, string> = {
  TitleCard: `{ "title": "The Houthis and the war in Yemen", "subtitle": "How a local uprising became a regional confrontation", "kicker": "Explainer" }`,
  PhotoKenBurns: `{ "image": { "queries": ["Sana'a old city Yemen", "Yemen historic architecture", "Middle East old city"], "alt": "The old walled city of Sana'a" }, "direction": "in", "caption": "Sana'a, the capital since 2014 under Houthi control" }`,
  PhotoWithLabels: `{ "image": { "queries": ["container ship Red Sea", "cargo ship at sea"], "alt": "A container ship under way" }, "labels": [{ "text": "Container stacks", "x": 0.3, "y": 0.4, "side": "right" }, { "text": "Bridge", "x": 0.68, "y": 0.3, "side": "left" }] }`,
  MapHighlight: `{ "scope": "region", "highlight": ["YEM"], "context": ["SAU", "OMN", "DJI", "ERI", "SOM"], "pins": [{ "label": "Sana'a", "lat": 15.3694, "lon": 44.191 }, { "label": "Aden", "lat": 12.7855, "lon": 45.0187 }], "caption": "Yemen sits on the Bab al-Mandab strait" }`,
  WhosWho: `{ "heading": "Who's involved", "actors": [{ "name": "Ansar Allah", "role": "The Houthi movement, which controls the north-west", "icon": "Flag" }, { "name": "The recognised government", "role": "Internationally recognised, based in Aden", "icon": "Bank" }] }`,
  Timeline: `{ "heading": "How it unfolded", "events": [{ "date": "2014", "label": "Houthi forces take Sana'a" }, { "date": "2015", "label": "A Saudi-led coalition intervenes" }, { "date": "2022", "label": "A UN truce holds for six months" }] }`,
  BigStat: `{ "value": 21.6, "decimals": 1, "suffix": "m", "label": "people needed humanitarian assistance in 2024", "footnote": "Figure: UN OCHA" }`,
  KeyPoints: `{ "heading": "The short version", "points": ["A domestic power struggle became a regional conflict.", "The humanitarian crisis is driven as much by economics as by fighting.", "Red Sea shipping links it to the global economy."] }`,
};

export function storyboardSystemPrompt(): string {
  const catalogue = Object.entries(TEMPLATE_DESCRIPTIONS)
    .map(
      ([name, description]) =>
        `### ${name}\n${description}\nExample props:\n${TEMPLATE_EXAMPLES[name as keyof typeof TEMPLATE_DESCRIPTIONS]}`,
    )
    .join("\n\n");

  return `
You are Crammer's storyboard editor. You take a finished narration and decide what the
viewer sees while each part of it is spoken.

Split the narration into scenes. Each scene carries a contiguous run of sentences,
in order, with nothing added, dropped or reworded. Concatenating every scene's narration
must reproduce the script exactly.

Scene length: aim for 10 to 25 seconds of speech per scene, which is roughly 25 to 60
words at 150 words a minute. A 700 word script therefore becomes about 14 to 22 scenes.

## Templates

${catalogue}

## Rules

- The first scene is always TitleCard, and it carries the opening sentence or two.
- Use Timeline at most once, in the "what happened" section.
- Use KeyPoints for the recap. Use it at most twice in total.
- Use BigStat only when the narration states one striking number, and set the value to
  that number. Do not invent a figure.
- Do not use the same template three times in a row. Photos are the workhorse, but
  break them up with maps, cards and stats.
- Prefer maps, timelines and cards over photographs for conflict, violence and
  casualties. Crammer does not show graphic imagery.
- Only give an actor a photo when the narration is specifically about that person or
  place. Otherwise leave out "image" and choose an icon.
- Available icons: ${ICON_NAMES.join(", ")}.

## Image queries

For every image slot, write 2 to 3 search queries, most specific first, then
progressively more general. They are run against Wikimedia Commons, then Unsplash, then
Pexels, so the last query should be something a stock library would plausibly have.

Good: ["Port of Hodeidah Yemen", "Red Sea port cranes", "container port at dusk"]
Bad: ["Yemen", "war", "sad"]

Some subjects have almost no free-licensed photography: press conferences, named
officials, recent events, military action. If a scene's only plausible image is one of
those, choose a map, a timeline or a card instead — a fallback chosen deliberately
beats a photo slot that resolves to nothing.

Write "alt" as the **subject**, not the composition. It is given to a vision model to
check the image depicts that subject, so naming things that merely happen to be in a
nice photograph makes real, correct photographs fail the check.

Good: "The port town of Mokha on Yemen's Red Sea coast"
Bad:  "A coastal port town with harbour buildings and water in the foreground"

Never specify camera angle, weather, time of day, or what must be in frame — you cannot
know what photographs exist. Name the place, person, object or event, and stop.

## Maps

Use ISO 3166-1 alpha-3 codes. "highlight" is what the narration is about; "context" is
the neighbouring countries that should stay in frame. Pin only places the narration
names, with real coordinates.

## Captions

Captions and labels are on-screen text, not narration. Keep them under about 12 words.
They should add a specific detail — a place, a date, a number — not repeat the sentence
being spoken.
`.trim();
}

export function storyboardPrompt(script: Script, research: Research): string {
  const sentences = script.sections
    .map(
      (section) =>
        `## ${section.heading}\n` + section.sentences.map((s) => `${s.id}: ${s.text}`).join("\n"),
    )
    .join("\n\n");

  const total = scriptSentences(script).length;

  return `
Topic: "${research.topic}"
Script title: "${script.title}"
${total} sentences in total.

${sentences}

Produce the storyboard. Every sentence id must appear in exactly one scene's
sentenceIds, and each scene's narration must be the exact text of its sentences joined
with single spaces.
`.trim();
}

/** Fed back to the model when a draft fails the coverage check. */
export function storyboardRepairPrompt(problems: string[]): string {
  return `
The storyboard does not cover the script correctly:

${problems.map((p) => `- ${p}`).join("\n")}

Produce it again, fixing these problems. Keep everything else the same.
`.trim();
}
