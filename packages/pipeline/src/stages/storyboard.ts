import {
  Storyboard,
  StoryboardDraft,
  collectCredits,
  scriptSentences,
  type Research,
  type Scene,
  type Script,
} from "@crammer/schema";
import type { PipelineContext } from "../context.js";
import {
  storyboardPrompt,
  storyboardRepairPrompt,
  storyboardSystemPrompt,
} from "../prompts/index.js";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
}

const normalise = (text: string) => text.replace(/\s+/g, " ").trim();

/**
 * Checks that the draft covers the script exactly: every sentence used once, in order,
 * with the narration text unchanged.
 *
 * This is the guard that keeps "accuracy is the product" true through the storyboard
 * stage — a model that quietly paraphrases while splitting scenes would break the link
 * between what is spoken and what was fact-checked.
 */
export function checkCoverage(draft: StoryboardDraft, script: Script): string[] {
  const problems: string[] = [];
  const expected = scriptSentences(script);
  const byId = new Map(expected.map((s) => [s.id, s]));

  const used = draft.scenes.flatMap((scene) => scene.sentenceIds);
  const seen = new Set<string>();

  for (const id of used) {
    if (!byId.has(id)) problems.push(`Scene references unknown sentence id "${id}".`);
    if (seen.has(id)) problems.push(`Sentence "${id}" appears in more than one scene.`);
    seen.add(id);
  }

  for (const sentence of expected) {
    if (!seen.has(sentence.id)) problems.push(`Sentence "${sentence.id}" is in no scene.`);
  }

  const expectedOrder = expected.map((s) => s.id).filter((id) => seen.has(id));
  const actualOrder = used.filter((id) => byId.has(id));
  if (expectedOrder.join(",") !== actualOrder.join(",")) {
    problems.push("Sentences are not in script order across the scenes.");
  }

  for (const scene of draft.scenes) {
    const text = scene.sentenceIds
      .map((id) => byId.get(id)?.text ?? "")
      .join(" ")
      .trim();
    if (text.length > 0 && normalise(scene.narration) !== normalise(text)) {
      problems.push(
        `Scene "${scene.id}" narration does not match its sentences. Expected: "${text}"`,
      );
    }
  }

  if (draft.scenes[0]?.template !== "TitleCard") {
    problems.push("The first scene must use the TitleCard template.");
  }

  return problems;
}

/**
 * Stage 4.
 *
 * Asks for a storyboard, verifies it covers the script, and gives the model one repair
 * attempt with the specific problems listed. Then appends the `EndCard`, which the
 * pipeline always generates so the credits cannot be omitted or invented.
 */
export async function runStoryboard(
  input: { script: Script; research: Research },
  ctx: PipelineContext,
): Promise<Storyboard> {
  const system = storyboardSystemPrompt();
  const basePrompt = storyboardPrompt(input.script, input.research);

  let draft: StoryboardDraft | undefined;
  let problems: string[] = [];

  for (let attempt = 0; attempt < 2; attempt++) {
    const prompt =
      attempt === 0
        ? basePrompt
        : `${basePrompt}\n\n${storyboardRepairPrompt(problems)}\n\nYour previous attempt:\n${JSON.stringify(draft, null, 2)}`;

    const result = await ctx.llm.structured({
      system,
      prompt,
      schema: StoryboardDraft,
      toolName: "emit_storyboard",
      toolDescription: "Return the scenes covering the script, in order.",
      maxTokens: 32000,
    });
    ctx.cost.add("storyboard", result.usage);

    draft = result.value;
    problems = checkCoverage(draft, input.script);
    if (problems.length === 0) break;

    ctx.log.warn(`Storyboard coverage problems (attempt ${attempt + 1}):\n  ${problems.join("\n  ")}`);
  }

  if (!draft) throw new Error("The storyboard stage produced nothing.");
  if (problems.length > 0) {
    throw new Error(
      `Storyboard does not cover the script after two attempts:\n${problems.map((p) => `  ${p}`).join("\n")}`,
    );
  }

  ctx.log.info(`${draft.scenes.length} scenes.`);

  const endCard: Scene = {
    id: "end-card",
    narration: "",
    sentenceIds: [],
    template: "EndCard",
    props: { title: "Credits", sources: input.research.sources.slice(0, 14), credits: [] },
  };

  const storyboard = Storyboard.parse({
    id: slugify(input.research.topic) || "explainer",
    title: draft.title,
    topic: input.research.topic,
    level: input.research.level,
    theme: "default",
    scenes: [...draft.scenes, endCard],
    sources: input.research.sources,
    credits: [],
  });

  storyboard.credits = collectCredits(storyboard);
  return storyboard;
}

export { slugify };
