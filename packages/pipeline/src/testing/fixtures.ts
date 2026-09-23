import {
  FPS,
  Research,
  Script,
  StoryboardDraft,
  type DraftScene,
  type Fact,
  type ScriptSentence,
  type Source,
} from "@crammer/schema";

/**
 * Deterministic fixtures for mock runs and tests.
 *
 * The content is obviously synthetic — the point is that it satisfies every real schema
 * and every real cross-stage invariant (fact ids resolve, the storyboard covers the
 * script word for word), so a mock run exercises the same code paths as a live one.
 */

const PUBLISHERS = [
  "Reuters",
  "BBC News",
  "UN OCHA",
  "Associated Press",
  "Financial Times",
  "Chatham House",
  "IMF",
  "The Guardian",
];

export function mockResearch(topic: string, level: "beginner" | "intermediate" = "beginner") {
  const sources: Source[] = PUBLISHERS.map((publisher, i) => ({
    id: `s${i + 1}`,
    title: `${topic}: ${["background", "timeline", "analysis", "data", "latest", "explainer", "outlook", "reaction"][i]}`,
    url: `https://example.org/${encodeURIComponent(topic.toLowerCase().replace(/\s+/g, "-"))}/${i + 1}`,
    publisher,
    publishedAt: `2025-0${(i % 9) + 1}-1${i % 9}`,
  }));

  const facts: Fact[] = Array.from({ length: 30 }, (_, i) => ({
    id: `f${i + 1}`,
    claim: `Fact ${i + 1} about ${topic}, as reported by ${PUBLISHERS[i % PUBLISHERS.length]}.`,
    sourceIds: [`s${(i % sources.length) + 1}`],
  }));

  return Research.parse({
    topic,
    level,
    summary: `A synthetic research summary about ${topic}, used for mock runs. It contains no real reporting.`,
    sources,
    facts,
  });
}

const SECTION_SENTENCES: Record<string, string[]> = {
  hook: [
    "This is a mock narration produced without calling any model.",
    "It exists so the pipeline can be run end to end for nothing.",
  ],
  context: [
    "The background section explains what a viewer needs before the events make sense.",
    "It introduces the region, the institutions and the vocabulary that follow.",
    "Each sentence here is placeholder text of a realistic length and rhythm.",
    "That matters because scene lengths come from how long the narration takes to read.",
  ],
  "key players": [
    "The first party controls part of the territory and wants formal recognition.",
    "The second party is recognised internationally and wants the first to stand down.",
    "A third party intervened in support of the second and has its own security concerns.",
  ],
  "what happened": [
    "In two thousand and eleven, protests forced a change of leadership.",
    "By two thousand and fourteen, the first party had taken the capital.",
    "A coalition intervened the following year, and the conflict widened.",
    "Talks in two thousand and eighteen produced a partial agreement on one port.",
    "A truce in two thousand and twenty two held for roughly six months.",
    "Attacks on shipping began in late two thousand and twenty three.",
    "Each of those steps changed who held leverage over whom.",
  ],
  "why it matters now": [
    "The humanitarian position remains severe, and aid funding has fallen.",
    "The economy is split between two central banks with different currencies.",
    "Shipping through the strait has been rerouted, raising costs worldwide.",
    "None of the underlying political questions has been settled.",
  ],
  recap: [
    "A domestic power struggle became a regional conflict.",
    "The humanitarian crisis is driven as much by economics as by fighting.",
    "Shipping through the strait links all of it to the global economy.",
  ],
};

export function mockScript(research: Research) {
  let counter = 0;
  const sections = Object.entries(SECTION_SENTENCES).map(([heading, texts]) => ({
    heading,
    sentences: texts.map((text): ScriptSentence => {
      counter++;
      return {
        id: `t${counter}`,
        text,
        factIds: [research.facts[counter % research.facts.length]!.id],
      };
    }),
  }));

  return Script.parse({ title: `Understanding ${research.topic}`, sections });
}

/** Cycles templates so a mock storyboard exercises every one of them. */
const TEMPLATE_CYCLE = [
  "PhotoKenBurns",
  "MapHighlight",
  "WhosWho",
  "Timeline",
  "PhotoWithLabels",
  "BigStat",
] as const;

function propsFor(template: (typeof TEMPLATE_CYCLE)[number], seed: number): DraftScene["props"] {
  switch (template) {
    case "PhotoKenBurns":
      return {
        image: { queries: [`mock subject ${seed}`, "mock scene"], alt: `A mock scene, number ${seed}` },
        direction: seed % 2 === 0 ? "in" : "left",
        caption: `Mock caption ${seed}`,
      };
    case "MapHighlight":
      return {
        scope: "region",
        highlight: ["YEM"],
        context: ["SAU", "OMN", "DJI"],
        pins: [{ label: "Aden", lat: 12.7855, lon: 45.0187 }],
        caption: `Mock map caption ${seed}`,
      };
    case "WhosWho":
      return {
        heading: "Who's involved",
        actors: [
          { name: `Party ${seed}`, role: "Holds territory in the north-west.", icon: "Flag" },
          { name: `Party ${seed + 1}`, role: "Recognised internationally.", icon: "Bank" },
        ],
      };
    case "Timeline":
      return {
        heading: "How it unfolded",
        events: [
          { date: "2011", label: "Protests force a change of leadership." },
          { date: "2014", label: "The capital changes hands." },
          { date: "2015", label: "A coalition intervenes." },
        ],
      };
    case "PhotoWithLabels":
      return {
        image: { queries: [`mock detail ${seed}`, "mock object"], alt: `A mock object, number ${seed}` },
        labels: [{ text: `Detail ${seed}`, x: 0.35, y: 0.45, side: "right" }],
      };
    case "BigStat":
      return {
        value: 21.6,
        decimals: 1,
        suffix: "m",
        label: "people affected, in a mock figure",
        footnote: "Mock figure, not a real statistic.",
      };
  }
}

/**
 * Chunks the script into scenes of roughly `wordsPerScene` words, so the draft satisfies
 * the coverage check exactly: every sentence used once, in order, narration unchanged.
 */
export function mockStoryboardDraft(script: Script, wordsPerScene = 34) {
  const sentences = script.sections.flatMap((s) => s.sentences);
  const groups: ScriptSentence[][] = [];
  let current: ScriptSentence[] = [];
  let words = 0;

  for (const sentence of sentences) {
    current.push(sentence);
    words += sentence.text.split(/\s+/).length;
    if (words >= wordsPerScene) {
      groups.push(current);
      current = [];
      words = 0;
    }
  }
  if (current.length > 0) groups.push(current);

  const scenes = groups.map((group, i): DraftScene => {
    const narration = group.map((s) => s.text).join(" ");
    const sentenceIds = group.map((s) => s.id);

    if (i === 0) {
      return {
        id: `sc-${i + 1}`,
        narration,
        sentenceIds,
        template: "TitleCard",
        props: { kicker: "Explainer", title: script.title, subtitle: "A mock explainer" },
      };
    }
    if (i === groups.length - 1) {
      return {
        id: `sc-${i + 1}`,
        narration,
        sentenceIds,
        template: "KeyPoints",
        props: {
          heading: "The short version",
          points: ["A mock first point.", "A mock second point.", "A mock third point."],
        },
      };
    }

    const template = TEMPLATE_CYCLE[(i - 1) % TEMPLATE_CYCLE.length]!;
    return {
      id: `sc-${i + 1}`,
      narration,
      sentenceIds,
      template,
      props: propsFor(template, i),
    } as DraftScene;
  });

  return StoryboardDraft.parse({ title: script.title, scenes });
}

/** Roughly how long a mock run's video will be, for test assertions. */
export function expectedSecondsFor(script: Script, wordsPerMinute = 150): number {
  const words = script.sections
    .flatMap((s) => s.sentences)
    .reduce((n, s) => n + s.text.split(/\s+/).length, 0);
  return (words / wordsPerMinute) * 60 + FPS * 0;
}
