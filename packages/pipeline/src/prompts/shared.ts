/**
 * Fragments reused across prompts. Keeping them here means the house style is stated
 * once, so tightening it changes every stage at the same time.
 */

export const HOUSE_STYLE = `
Crammer's voice:
- Plain English. Short sentences. No jargon without an immediate plain-language gloss.
- Concrete over abstract. Name the people, places, dates and numbers.
- Neutral. Describe what happened and who says what; do not editorialise.
- British English spelling.
- No rhetorical questions, no "imagine if", no "in today's fast-paced world".
- Never address the viewer as "guys" or open with "so".
`.trim();

export const ACCURACY_RULES = `
Accuracy rules:
- Every factual claim must be traceable to a source you were given. If you cannot
  support a claim, leave it out.
- Prefer primary sources, news agencies, government and intergovernmental bodies,
  academic work and encyclopedic references.
- Attribute contested claims: "the UN estimates", "according to Saudi officials".
- Never name a reference work aloud. "Wikipedia says" and "that encyclopedic account"
  do not belong in a spoken explainer. When a contested claim traces only to an
  encyclopedia, attribute it to whoever actually makes the claim ("US and Saudi
  officials describe them as...") or leave it out. Encyclopedias are for uncontested
  background, which needs no attribution at all.
- Distinguish what is established from what is disputed or unknown.
- Where numbers vary between sources, say so and give the range or the source.
- Never invent a date, a figure, a quotation or a source.
`.trim();

export const BALANCE_RULES = `
Contested topics:
- Represent the main perspectives of the parties involved, in their own terms.
- Avoid loaded language. Use the most widely used neutral name for each group,
  and note where naming itself is contested.
- Do not adjudicate disputes the sources themselves have not settled.
`.trim();

/** Renders a numbered list the model can cite back by index. */
export function numbered(items: string[]): string {
  return items.map((item, i) => `${i + 1}. ${item}`).join("\n");
}

/** Renders a compact JSON block for prompt context. */
export function asJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
