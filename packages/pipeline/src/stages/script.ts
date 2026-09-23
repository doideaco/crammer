import { Script, scriptWordCount, type Research } from "@crammer/schema";
import type { PipelineContext } from "../context.js";
import { WORD_TARGET, scriptPrompt, scriptSystemPrompt } from "../prompts/index.js";

/** Length revision passes before accepting whatever the model last produced. */
export const MAX_LENGTH_REVISIONS = 2;

/**
 * Stage 2.
 *
 * Writes the narration from the research, then checks the length. The word count is a
 * hard product constraint — it is what makes the video 4 to 6 minutes — so a script
 * that misses the band gets revised rather than accepted.
 *
 * A first draft commonly overshoots by 200-300 words and one pass only gets part of
 * the way back, so the stage tries twice before giving up and saying so.
 */
export async function runScript(
  research: Research,
  ctx: PipelineContext,
  options: { maxRevisions?: number } = {},
): Promise<Script> {
  const system = scriptSystemPrompt(research.level);
  const maxRevisions = options.maxRevisions ?? MAX_LENGTH_REVISIONS;

  const first = await ctx.llm.structured({
    system,
    prompt: scriptPrompt(research),
    schema: Script,
    toolName: "emit_script",
    toolDescription: "Return the narration, split into sections and sentences.",
    maxTokens: 16000,
  });
  ctx.cost.add("script", first.usage);

  let script = first.value;
  let words = scriptWordCount(script);
  ctx.log.info(`Draft is ${words} words (target ${WORD_TARGET.min}–${WORD_TARGET.max}).`);

  for (let pass = 0; pass < maxRevisions; pass++) {
    if (words >= WORD_TARGET.min && words <= WORD_TARGET.max) break;

    const direction =
      words > WORD_TARGET.max
        ? `It is ${words - WORD_TARGET.max} words too long. Cut the least essential detail — whole sentences, not a uniform trim of every sentence. Removing two or three sentences outright is better than shortening twenty.`
        : `It is ${WORD_TARGET.min - words} words too short. Add supporting detail from the facts you were given; do not pad with generalities.`;

    const revised = await ctx.llm.structured({
      system,
      prompt: `${scriptPrompt(research)}\n\nYou previously wrote this script:\n${JSON.stringify(script, null, 2)}\n\n${direction} Rewrite it to ${WORD_TARGET.min}–${WORD_TARGET.max} words, keeping the structure, the sentence ids where they still apply, and the fact citations.`,
      schema: Script,
      toolName: "emit_script",
      toolDescription: "Return the revised narration.",
      maxTokens: 16000,
    });
    ctx.cost.add("script", revised.usage);

    script = revised.value;
    words = scriptWordCount(script);
    ctx.log.info(`Revised to ${words} words.`);
  }

  if (words < WORD_TARGET.min || words > WORD_TARGET.max) {
    // Not fatal — the acceptance band for the finished video is wider than the word
    // target — but it is the thing to look at if the runtime comes out wrong.
    ctx.log.warn(
      `Script is ${words} words after ${maxRevisions} revision pass(es), outside the ${WORD_TARGET.min}–${WORD_TARGET.max} target. The video will run about ${Math.round(words / 150)} minutes.`,
    );
  }

  return dropUnknownFactIds(script, research, ctx);
}

/** Strips citations to facts that do not exist, so the fact checker sees the truth. */
function dropUnknownFactIds(script: Script, research: Research, ctx: PipelineContext): Script {
  const known = new Set(research.facts.map((f) => f.id));
  let dropped = 0;

  const sections = script.sections.map((section) => ({
    ...section,
    sentences: section.sentences.map((sentence) => {
      const factIds = sentence.factIds.filter((id) => {
        if (known.has(id)) return true;
        dropped++;
        return false;
      });
      return { ...sentence, factIds };
    }),
  }));

  if (dropped > 0) ctx.log.warn(`Removed ${dropped} citation(s) to unknown fact ids.`);
  return Script.parse({ ...script, sections });
}
