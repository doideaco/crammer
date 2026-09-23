import { Research, TopicAssessment, type Level } from "@crammer/schema";
import { RefusedError } from "@crammer/providers";
import type { PipelineContext } from "../context.js";
import {
  researchPrompt,
  researchStructurePrompt,
  researchStructureSystemPrompt,
  researchSystemPrompt,
  topicAssessmentPrompt,
  topicAssessmentSystem,
} from "../prompts/index.js";

export type ResearchInput = { topic: string; level: Level };

/** The assessment is returned alongside the research so later stages can use it. */
export type ResearchOutput = { research: Research; assessment: TopicAssessment };

/**
 * Stage 1.
 *
 * Three calls: a safety gate, a web-search pass that produces free-text notes, and a
 * structuring pass that turns the notes into sources and facts. Splitting search from
 * structuring matters — forcing a tool call while the model is also running server-side
 * searches makes both worse.
 */
export async function runResearch(
  input: ResearchInput,
  ctx: PipelineContext,
): Promise<ResearchOutput> {
  const assessment = await ctx.llm.structured({
    system: topicAssessmentSystem(),
    prompt: topicAssessmentPrompt(input.topic),
    schema: TopicAssessment,
    toolName: "assess_topic",
    toolDescription: "Report whether Crammer can make an explainer about this topic.",
    maxTokens: 2000,
  });
  ctx.cost.add("research", assessment.usage);

  if (!assessment.value.allowed) {
    const alternative = assessment.value.suggestedAlternative;
    throw new RefusedError(
      `Crammer will not make a video about this topic.\n${assessment.value.reason}` +
        (alternative ? `\n\nYou could try: "${alternative}"` : ""),
    );
  }

  if (assessment.value.contested) {
    ctx.log.info(
      `Contested topic. Perspectives to represent: ${assessment.value.perspectives.join("; ")}`,
    );
  }

  const notes = await ctx.llm.text({
    system: researchSystemPrompt(input.level),
    prompt: researchPrompt(input.topic),
    maxTokens: 16000,
    webSearch: { maxUses: 12 },
  });
  ctx.cost.add("research", notes.usage);
  ctx.log.info(`Gathered notes from ${notes.citations.length} retrieved pages.`);

  const structured = await ctx.llm.structured({
    system: researchStructureSystemPrompt(),
    prompt: researchStructurePrompt(input.topic, notes.text, notes.citations),
    schema: Research,
    toolName: "emit_research",
    toolDescription: "Return the sources and facts extracted from the research notes.",
    maxTokens: 16000,
  });
  ctx.cost.add("research", structured.usage);

  const research = dropDanglingFacts(
    { ...structured.value, topic: input.topic, level: input.level },
    ctx,
  );

  ctx.log.info(`${research.sources.length} sources, ${research.facts.length} facts.`);
  return { research, assessment: assessment.value };
}

/**
 * Removes facts that cite a source id that does not exist. A fact with no traceable
 * source is exactly the thing this pipeline exists to prevent, so it is dropped rather
 * than passed on to the script writer.
 */
function dropDanglingFacts(research: Research, ctx: PipelineContext): Research {
  const known = new Set(research.sources.map((s) => s.id));
  const facts = research.facts
    .map((fact) => ({ ...fact, sourceIds: fact.sourceIds.filter((id) => known.has(id)) }))
    .filter((fact) => fact.sourceIds.length > 0);

  const dropped = research.facts.length - facts.length;
  if (dropped > 0) ctx.log.warn(`Dropped ${dropped} fact(s) citing unknown sources.`);

  return Research.parse({ ...research, facts });
}
