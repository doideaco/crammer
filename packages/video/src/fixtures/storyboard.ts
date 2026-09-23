import { Storyboard, collectCredits, type Scene, type Source } from "@crammer/schema";
import { FIXTURE_SCENES } from "./scenes";

const SOURCES: Source[] = [
  {
    id: "s1",
    title: "Yemen situation report",
    url: "https://www.unocha.org/yemen",
    publisher: "UN OCHA",
    publishedAt: "2024-03-01",
  },
  {
    id: "s2",
    title: "Yemen country profile",
    url: "https://www.bbc.co.uk/news/world-middle-east-14704852",
    publisher: "BBC News",
  },
  {
    id: "s3",
    title: "Red Sea shipping and the Bab al-Mandab",
    url: "https://www.imf.org/en/Publications",
    publisher: "IMF",
  },
];

const ORDER = [
  "TitleCard",
  "MapHighlight",
  "WhosWho",
  "Timeline",
  "PhotoKenBurns",
  "BigStat",
  "PhotoWithLabels",
  "KeyPoints",
  "EndCard",
] as const;

/**
 * A full storyboard covering every M1 template, used as the default `Explainer`
 * composition in Remotion Studio. It has no audio, so scene lengths come from the
 * fixture `durationInFrames`.
 */
export const DEMO_STORYBOARD = Storyboard.parse({
  id: "fixture-yemen",
  title: "The Houthis and the war in Yemen",
  topic: "The Houthis and the war in Yemen",
  level: "beginner",
  theme: "default",
  scenes: ORDER.map((name) => FIXTURE_SCENES[name] as Scene),
  sources: SOURCES,
  credits: [],
});

DEMO_STORYBOARD.credits = collectCredits(DEMO_STORYBOARD);

// Keep the end card in step with the storyboard it closes.
const endCard = DEMO_STORYBOARD.scenes.at(-1);
if (endCard?.template === "EndCard") {
  endCard.props.sources = SOURCES;
  endCard.props.credits = DEMO_STORYBOARD.credits;
}

/** Wraps a single scene in a minimal storyboard for per-template Studio previews. */
export function singleSceneStoryboard(name: keyof typeof FIXTURE_SCENES) {
  const scene = FIXTURE_SCENES[name] as Scene;
  const storyboard = Storyboard.parse({
    id: `fixture-${name}`,
    title: name,
    topic: `Fixture: ${name}`,
    scenes: [scene],
    sources: SOURCES,
    credits: [],
  });
  storyboard.credits = collectCredits(storyboard);
  return storyboard;
}
