import { describe, expect, it } from "vitest";
import {
  FPS,
  Scene,
  Storyboard,
  TRANSITION_FRAMES,
  collectCredits,
  imageSlots,
  sceneStartFrames,
  storyboardDuration,
} from "../storyboard.js";
import type { ImageAsset } from "../image.js";
import { chunkWords } from "../audio.js";
import { scriptWordCount, scriptSentences } from "../script.js";

const asset = (hash: string): ImageAsset => ({
  localPath: `images/${hash}.jpg`,
  sourceUrl: "https://example.org/a.jpg",
  author: "A Photographer",
  licence: "cc-by",
  attribution: "A Photographer, CC BY 4.0, via Wikimedia Commons",
  provider: "wikimedia",
  width: 1920,
  height: 1080,
  contentHash: hash,
});

const base = {
  id: "sb-1",
  title: "Test",
  topic: "Test topic",
  scenes: [
    { id: "s1", narration: "Hello.", template: "TitleCard", props: { title: "Test" } },
    {
      id: "s2",
      narration: "A port.",
      template: "PhotoKenBurns",
      props: { image: { queries: ["port"], alt: "a port" } },
    },
  ],
  sources: [],
};

describe("Scene discriminated union", () => {
  it("validates props against the chosen template", () => {
    const bad = Scene.safeParse({
      id: "s1",
      narration: "x",
      template: "BigStat",
      props: { title: "not a stat" },
    });
    expect(bad.success).toBe(false);
  });

  it("rejects an unknown template name", () => {
    const bad = Scene.safeParse({ id: "s1", narration: "x", template: "Nope", props: {} });
    expect(bad.success).toBe(false);
  });

  it("accepts matching props", () => {
    const ok = Scene.safeParse({
      id: "s1",
      narration: "x",
      template: "BigStat",
      props: { value: 3, label: "things" },
    });
    expect(ok.success).toBe(true);
  });
});

describe("Storyboard", () => {
  it("applies defaults", () => {
    const sb = Storyboard.parse(base);
    expect(sb.theme).toBe("default");
    expect(sb.level).toBe("beginner");
    expect(sb.credits).toEqual([]);
  });

  it("requires at least one scene", () => {
    expect(Storyboard.safeParse({ ...base, scenes: [] }).success).toBe(false);
  });
});

describe("timing helpers", () => {
  it("falls back to a default scene length before the voice stage", () => {
    const sb = Storyboard.parse(base);
    // Two scenes at the 6s fallback, minus one transition overlap.
    expect(storyboardDuration(sb)).toBe(FPS * 12 - TRANSITION_FRAMES);
  });

  it("overlaps consecutive scenes by the transition length", () => {
    const sb = Storyboard.parse({
      ...base,
      scenes: base.scenes.map((s) => ({ ...s, durationInFrames: 100 })),
    });
    expect(sceneStartFrames(sb)).toEqual([0, 100 - TRANSITION_FRAMES]);
    expect(storyboardDuration(sb)).toBe(200 - TRANSITION_FRAMES);
  });
});

describe("imageSlots", () => {
  it("finds photo slots and writes assets back into the storyboard", () => {
    const sb = Storyboard.parse(base);
    const slots = imageSlots(sb);
    expect(slots).toHaveLength(1);
    slots[0]!.set(asset("aaaa1111"));
    const scene = sb.scenes[1]!;
    if (scene.template !== "PhotoKenBurns") throw new Error("wrong template");
    expect(scene.props.image.asset?.contentHash).toBe("aaaa1111");
  });

  it("includes WhosWho actor portraits", () => {
    const sb = Storyboard.parse({
      ...base,
      scenes: [
        {
          id: "s3",
          narration: "Two people.",
          template: "WhosWho",
          props: {
            actors: [
              { name: "A", role: "One", image: { queries: ["a"], alt: "a" } },
              { name: "B", role: "Two" },
            ],
          },
        },
      ],
    });
    expect(imageSlots(sb)).toHaveLength(1);
  });
});

describe("collectCredits", () => {
  it("deduplicates by content hash", () => {
    const sb = Storyboard.parse({
      ...base,
      scenes: [
        {
          id: "a",
          narration: "x",
          template: "PhotoKenBurns",
          props: { image: { queries: ["q"], alt: "a", asset: asset("dupe1234") } },
        },
        {
          id: "b",
          narration: "y",
          template: "PhotoKenBurns",
          props: { image: { queries: ["q"], alt: "a", asset: asset("dupe1234") } },
        },
      ],
    });
    expect(collectCredits(sb)).toHaveLength(1);
  });
});

describe("chunkWords", () => {
  it("breaks on sentence ends and on length", () => {
    const words = "One two three. Four five six seven eight nine ten eleven twelve"
      .split(" ")
      .map((text, i) => ({ text, startMs: i * 100, endMs: i * 100 + 90 }));
    const chunks = chunkWords(words, 20);
    expect(chunks[0]!.text).toBe("One two three.");
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.endMs >= c.startMs)).toBe(true);
  });

  it("returns nothing for no words", () => {
    expect(chunkWords([])).toEqual([]);
  });
});

describe("script helpers", () => {
  const script = {
    title: "T",
    sections: [
      { heading: "hook", sentences: [{ id: "x1", text: "One two three.", factIds: ["f1"] }] },
      { heading: "recap", sentences: [{ id: "x2", text: "Four five.", factIds: [] }] },
    ],
  };
  it("counts words across sections", () => {
    expect(scriptWordCount(script)).toBe(5);
  });
  it("flattens sentences in reading order", () => {
    expect(scriptSentences(script).map((s) => s.id)).toEqual(["x1", "x2"]);
  });
});
