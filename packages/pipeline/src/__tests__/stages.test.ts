import { mkdtempSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FPS, Storyboard, scriptSentences, scriptWordCount } from "@crammer/schema";
import { MockImageSearch, MockLlm, MockTts, RefusedError } from "@crammer/providers";
import { runResearch } from "../stages/research.js";
import { runScript } from "../stages/script.js";
import { runFactCheck, FactCheckFailedError, passes } from "../stages/factcheck.js";
import { checkCoverage, runStoryboard } from "../stages/storyboard.js";
import { runImages } from "../stages/images.js";
import { runVoice } from "../stages/voice.js";
import { makeTestContext, mockResearch, mockScript, mockStoryboardDraft } from "../testing/index.js";
import { sourcesMarkdown, transcriptText } from "../outputs.js";

const TOPIC = "The Houthis and the war in Yemen";

const tempDirs: string[] = [];
function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), "crammer-stage-"));
  tempDirs.push(dir);
  return dir;
}
afterEach(() => {
  tempDirs.length = 0;
});

describe("stage 1: research", () => {
  it("returns sources and facts, and records cost", async () => {
    const ctx = makeTestContext({ topic: TOPIC });
    const { research } = await runResearch({ topic: TOPIC, level: "beginner" }, ctx);

    expect(research.topic).toBe(TOPIC);
    expect(research.sources.length).toBeGreaterThanOrEqual(6);
    expect(research.facts.length).toBeGreaterThan(20);
    expect(ctx.cost.usageFor("research").requests).toBeGreaterThan(0);
  });

  it("refuses topics that would need harmful instructions", async () => {
    const ctx = makeTestContext({ topic: "bad", llmOptions: { refuse: true } });
    await expect(runResearch({ topic: "bad", level: "beginner" }, ctx)).rejects.toThrow(
      RefusedError,
    );
  });

  it("drops facts citing sources that do not exist", async () => {
    const research = mockResearch(TOPIC);
    const llm = new MockLlm()
      .on("assess_topic", () => ({ allowed: true, reason: "fine" }))
      .on("emit_research", () => ({
        ...research,
        facts: [
          ...research.facts,
          { id: "fX", claim: "A claim with no real source.", sourceIds: ["s999"] },
        ],
      }));

    const ctx = makeTestContext({ llm });
    const { research: result } = await runResearch({ topic: TOPIC, level: "beginner" }, ctx);
    expect(result.facts.find((f) => f.id === "fX")).toBeUndefined();
  });
});

describe("stage 2: script", () => {
  it("produces the fixed six-section structure with cited sentences", async () => {
    const ctx = makeTestContext({ topic: TOPIC });
    const research = mockResearch(TOPIC);
    const script = await runScript(research, ctx);

    expect(script.sections.map((s) => s.heading)).toEqual([
      "hook",
      "context",
      "key players",
      "what happened",
      "why it matters now",
      "recap",
    ]);
    expect(scriptSentences(script).every((s) => s.factIds.length > 0)).toBe(true);
    expect(scriptWordCount(script)).toBeGreaterThan(0);
  });

  it("strips citations to fact ids that do not exist", async () => {
    const research = mockResearch(TOPIC);
    const script = mockScript(research);
    const llm = new MockLlm().on("emit_script", () => ({
      ...script,
      sections: script.sections.map((section, i) =>
        i === 0
          ? {
              ...section,
              sentences: section.sentences.map((s) => ({ ...s, factIds: ["fZZZ", ...s.factIds] })),
            }
          : section,
      ),
    }));

    const ctx = makeTestContext({ llm });
    const result = await runScript(research, ctx);
    expect(scriptSentences(result).flatMap((s) => s.factIds)).not.toContain("fZZZ");
  });
});

describe("stage 3: fact check", () => {
  const research = mockResearch(TOPIC);
  const script = mockScript(research);

  it("passes a clean script without rewriting it", async () => {
    const ctx = makeTestContext({ topic: TOPIC });
    const result = await runFactCheck({ script, research }, ctx);
    expect(result.report.passed).toBe(true);
    expect(result.script).toEqual(script);
  });

  it("applies suggested rewrites and re-checks", async () => {
    const target = scriptSentences(script)[2]!;
    const ctx = makeTestContext({
      topic: TOPIC,
      llmOptions: {
        factCheckIssues: [
          {
            sentenceId: target.id,
            kind: "overstated",
            severity: "medium",
            explanation: "The facts support a weaker claim.",
            suggestedRewrite: "A more careful version of the sentence.",
          },
        ],
      },
    });

    const result = await runFactCheck({ script, research }, ctx);
    expect(result.report.passed).toBe(true);
    const rewritten = scriptSentences(result.script).find((s) => s.id === target.id);
    expect(rewritten?.text).toBe("A more careful version of the sentence.");
  });

  it("deletes sentences the checker wants dropped", async () => {
    const target = scriptSentences(script)[3]!;
    const ctx = makeTestContext({
      topic: TOPIC,
      llmOptions: {
        factCheckIssues: [
          {
            sentenceId: target.id,
            kind: "unsupported",
            severity: "high",
            explanation: "Nothing supports this.",
            suggestedRewrite: null,
          },
        ],
      },
    });

    const result = await runFactCheck({ script, research }, ctx);
    expect(scriptSentences(result.script).find((s) => s.id === target.id)).toBeUndefined();
  });

  /** A checker that keeps reporting the same issues, so nothing ever converges. */
  function stubbornChecker(severity: "high" | "medium" | "low", count: number) {
    const issues = scriptSentences(script)
      .slice(0, count)
      .map((s) => ({
        sentenceId: s.id,
        kind: "unsupported" as const,
        severity,
        explanation: "Unsupported.",
        suggestedRewrite: "Still unsupported, apparently.",
      }));
    return new MockLlm().on("emit_fact_check", () => ({ issues, balanceNote: "" }));
  }

  it("fails the run when high-severity issues survive every pass", async () => {
    const ctx = makeTestContext({ llm: stubbornChecker("high", 3) });
    await expect(runFactCheck({ script, research }, ctx)).rejects.toThrow(FactCheckFailedError);
  });

  it("fails the run on enough medium-severity issues", async () => {
    const ctx = makeTestContext({ llm: stubbornChecker("medium", 6) });
    await expect(runFactCheck({ script, research }, ctx)).rejects.toThrow(FactCheckFailedError);
  });

  it("does not fail on low-severity wording nits alone", async () => {
    // A strict reviewer always finds these; blocking on them means nothing ever ships.
    const ctx = makeTestContext({ llm: stubbornChecker("low", 12) });
    const result = await runFactCheck({ script, research }, ctx);
    expect(result.report.passed).toBe(true);
    expect(result.report.issues).toHaveLength(12);
  });

  it("tolerates one high-severity issue but not two", () => {
    const issue = (severity: "high" | "medium" | "low") => ({
      sentenceId: "t1",
      kind: "unsupported" as const,
      severity,
      explanation: "An issue.",
      suggestedRewrite: null,
    });
    expect(passes([issue("high")])).toBe(true);
    expect(passes([issue("high"), issue("high")])).toBe(false);
    expect(passes([issue("high"), issue("medium"), issue("medium")])).toBe(true);
    expect(passes(Array.from({ length: 20 }, () => issue("low")))).toBe(true);
  });

  it("keeps the best pass when a later one is worse", async () => {
    // Revision is not monotonic: pass 3 here is worse than pass 2.
    const severities = ["medium", "low", "high"] as const;
    let calls = 0;
    const llm = new MockLlm().on("emit_fact_check", () => {
      const severity = severities[calls] ?? "high";
      calls++;
      return {
        issues: [
          {
            sentenceId: scriptSentences(script)[1]!.id,
            kind: "overstated",
            severity,
            explanation: `Issue found on pass ${calls}.`,
            suggestedRewrite: `Rewrite ${calls}.`,
            suggestedFactIds: null,
          },
        ],
        balanceNote: "",
      };
    });

    const ctx = makeTestContext({ llm });
    const result = await runFactCheck({ script, research }, ctx);

    // Pass 2 (one low issue) scored best, so that is the report and script kept.
    expect(result.report.issues[0]!.severity).toBe("low");
    expect(scriptSentences(result.script)[1]!.text).toBe("Rewrite 1.");
  });

  it("updates a sentence's citations along with its wording", async () => {
    const target = scriptSentences(script)[2]!;
    const ctx = makeTestContext({
      topic: TOPIC,
      llmOptions: {
        factCheckIssues: [
          {
            sentenceId: target.id,
            kind: "unsupported",
            severity: "medium",
            explanation: "Cites the wrong facts.",
            suggestedRewrite: "A version resting on different facts.",
            suggestedFactIds: ["f7", "f8"],
          },
        ],
      },
    });

    const result = await runFactCheck({ script, research }, ctx);
    const fixed = scriptSentences(result.script).find((s) => s.id === target.id)!;
    expect(fixed.factIds).toEqual(["f7", "f8"]);
  });

  it("leaves citations alone when the checker does not supply new ones", async () => {
    const target = scriptSentences(script)[2]!;
    const ctx = makeTestContext({
      topic: TOPIC,
      llmOptions: {
        factCheckIssues: [
          {
            sentenceId: target.id,
            kind: "loaded-language",
            severity: "low",
            explanation: "Wording only.",
            suggestedRewrite: "Neutral wording, same facts.",
            suggestedFactIds: null,
          },
        ],
      },
    });

    const result = await runFactCheck({ script, research }, ctx);
    const fixed = scriptSentences(result.script).find((s) => s.id === target.id)!;
    expect(fixed.factIds).toEqual(target.factIds);
  });

  it("keeps revising until the checker is satisfied", async () => {
    let calls = 0;
    // Reports issues on the first two passes, then comes back clean.
    const llm = new MockLlm().on("emit_fact_check", () => {
      calls++;
      return {
        issues:
          calls <= 2
            ? [
                {
                  sentenceId: scriptSentences(script)[1]!.id,
                  kind: "overstated",
                  severity: "medium",
                  explanation: "Too strong.",
                  suggestedRewrite: `Rewrite number ${calls}.`,
                },
              ]
            : [],
        balanceNote: "n/a",
      };
    });

    const ctx = makeTestContext({ llm });
    const result = await runFactCheck({ script, research }, ctx);

    expect(calls).toBe(3);
    expect(result.report.passed).toBe(true);
    // The report describes the final script, and the last rewrite is the one kept.
    const target = scriptSentences(result.script)[1]!;
    expect(target.text).toBe("Rewrite number 2.");
  });
});

describe("stage 4: storyboard", () => {
  const research = mockResearch(TOPIC);
  const script = mockScript(research);

  it("covers every sentence and appends an end card", async () => {
    const ctx = makeTestContext({ topic: TOPIC });
    const storyboard = await runStoryboard({ script, research }, ctx);

    expect(storyboard.scenes[0]!.template).toBe("TitleCard");
    expect(storyboard.scenes.at(-1)!.template).toBe("EndCard");

    const covered = storyboard.scenes.flatMap((s) => s.sentenceIds);
    expect(new Set(covered).size).toBe(scriptSentences(script).length);
    expect(storyboard.sources).toEqual(research.sources);
  });

  it("puts the real sources on the end card", async () => {
    const ctx = makeTestContext({ topic: TOPIC });
    const storyboard = await runStoryboard({ script, research }, ctx);
    const endCard = storyboard.scenes.at(-1)!;
    if (endCard.template !== "EndCard") throw new Error("expected an end card");
    expect(endCard.props.sources.length).toBeGreaterThan(0);
  });

  it("fails when the model cannot produce a covering storyboard", async () => {
    const draft = mockStoryboardDraft(script);
    // Still a schema-valid draft, but it leaves the final scene's sentences uncovered.
    const broken = { ...draft, scenes: draft.scenes.slice(0, -1) };
    const llm = new MockLlm().on("emit_storyboard", () => broken);
    const ctx = makeTestContext({ llm });

    await expect(runStoryboard({ script, research }, ctx)).rejects.toThrow(/does not cover/);
  });
});

describe("checkCoverage", () => {
  const research = mockResearch(TOPIC);
  const script = mockScript(research);
  const draft = mockStoryboardDraft(script);

  it("accepts a faithful draft", () => {
    expect(checkCoverage(draft, script)).toEqual([]);
  });

  it("catches a paraphrased narration", () => {
    const tampered = {
      ...draft,
      scenes: draft.scenes.map((s, i) =>
        i === 1 ? { ...s, narration: "Something the script never said." } : s,
      ),
    };
    expect(checkCoverage(tampered, script).join(" ")).toMatch(/does not match/);
  });

  it("catches a duplicated sentence", () => {
    const first = draft.scenes[0]!;
    const tampered = {
      ...draft,
      scenes: draft.scenes.map((s, i) =>
        i === 1 ? { ...s, sentenceIds: [...first.sentenceIds, ...s.sentenceIds] } : s,
      ),
    };
    expect(checkCoverage(tampered, script).join(" ")).toMatch(/more than one scene/);
  });

  it("requires the first scene to be a title card", () => {
    const tampered = {
      ...draft,
      scenes: [{ ...draft.scenes[1]! }, ...draft.scenes.slice(1)],
    };
    expect(checkCoverage(tampered, script).join(" ")).toMatch(/TitleCard/);
  });
});

describe("stage 5: images", () => {
  async function storyboardFor() {
    const research = mockResearch(TOPIC);
    const script = mockScript(research);
    const ctx = makeTestContext({ topic: TOPIC });
    return { storyboard: await runStoryboard({ script, research }, ctx), research };
  }

  it("resolves slots, writes files and collects credits", async () => {
    const { storyboard } = await storyboardFor();
    const assetDir = tempDir();
    const ctx = makeTestContext({ topic: TOPIC, assetDir });

    const result = await runImages(storyboard, ctx);

    expect(result.credits.length).toBeGreaterThan(0);
    expect(result.credits.every((c) => c.localPath.startsWith("images/"))).toBe(true);
    expect(result.credits.every((c) => c.attribution.length > 0)).toBe(true);

    const files = await readdir(join(assetDir, "images"));
    expect(files.length).toBe(result.credits.length);

    const endCard = result.scenes.at(-1)!;
    if (endCard.template !== "EndCard") throw new Error("expected an end card");
    expect(endCard.props.credits).toEqual(result.credits);
  });

  it("falls back to a title card when nothing passes the vision check", async () => {
    const { storyboard } = await storyboardFor();
    const ctx = makeTestContext({
      topic: TOPIC,
      assetDir: tempDir(),
      llmOptions: { imageRelevance: 0.1 },
    });

    const result = await runImages(storyboard, ctx);
    expect(result.credits).toEqual([]);
    expect(result.scenes.some((s) => s.template === "PhotoKenBurns")).toBe(false);
  });

  it("rejects graphic images rather than using them", async () => {
    const { storyboard } = await storyboardFor();
    const ctx = makeTestContext({
      topic: TOPIC,
      assetDir: tempDir(),
      llmOptions: { imageRelevance: 0.99, imageGraphic: true },
    });

    const result = await runImages(storyboard, ctx);
    expect(result.credits).toEqual([]);
  });

  it("falls back when image search returns nothing", async () => {
    const { storyboard } = await storyboardFor();
    const ctx = makeTestContext({
      topic: TOPIC,
      assetDir: tempDir(),
      imageSearch: [new MockImageSearch({ emptyFor: /.*/ })],
    });

    const result = await runImages(storyboard, ctx);
    expect(result.credits).toEqual([]);
  });
});

describe("stage 6: voice", () => {
  async function storyboardFor(): Promise<Storyboard> {
    const research = mockResearch(TOPIC);
    const script = mockScript(research);
    const ctx = makeTestContext({ topic: TOPIC });
    return runStoryboard({ script, research }, ctx);
  }

  it("writes audio per scene and sets durations from it", async () => {
    const storyboard = await storyboardFor();
    const assetDir = tempDir();
    const ctx = makeTestContext({ topic: TOPIC, assetDir });

    const result = await runVoice(storyboard, ctx);

    const spoken = result.scenes.filter((s) => s.narration.trim().length > 0);
    expect(spoken.every((s) => s.audio && s.durationInFrames)).toBe(true);
    expect(spoken.every((s) => s.audio!.path.startsWith("audio/"))).toBe(true);

    const clips = await readdir(join(assetDir, "audio"));
    expect(clips).toHaveLength(spoken.length);

    const wav = await readFile(join(assetDir, "audio", clips[0]!));
    expect(wav.subarray(0, 4).toString("ascii")).toBe("RIFF");
  });

  it("gives the silent end card a fixed length", async () => {
    const storyboard = await storyboardFor();
    const ctx = makeTestContext({ topic: TOPIC, assetDir: tempDir() });
    const result = await runVoice(storyboard, ctx);

    const endCard = result.scenes.at(-1)!;
    expect(endCard.audio).toBeUndefined();
    expect(endCard.durationInFrames).toBe(7 * FPS);
  });

  it("reuses cached clips when only the images changed", async () => {
    const storyboard = await storyboardFor();
    const cacheDir = tempDir();

    const first = makeTestContext({ topic: TOPIC, assetDir: tempDir(), cacheDir });
    await runVoice(storyboard, first);
    expect(first.cost.usageFor("voice").ttsCharacters).toBeGreaterThan(0);

    // A fresh run directory, same cache: nothing should be re-synthesised.
    const second = makeTestContext({ topic: TOPIC, assetDir: tempDir(), cacheDir });
    const result = await runVoice(storyboard, second);
    expect(second.cost.usageFor("voice").ttsCharacters).toBe(0);
    expect(result.scenes.filter((s) => s.audio).length).toBeGreaterThan(0);
  });

  it("keeps the cache out of the directory Remotion bundles", async () => {
    const storyboard = await storyboardFor();
    const assetDir = tempDir();
    const cacheDir = tempDir();

    await runVoice(storyboard, makeTestContext({ topic: TOPIC, assetDir, cacheDir }));

    // Edit one scene, leaving the rest alone.
    const edited = Storyboard.parse({
      ...storyboard,
      scenes: storyboard.scenes.map((s, i) =>
        i === 1 ? { ...s, narration: "Different words entirely now." } : s,
      ),
    });
    await runVoice(edited, makeTestContext({ topic: TOPIC, assetDir, cacheDir }));

    const spoken = edited.scenes.filter((s) => s.narration.trim().length > 0).length;
    const assets = await readdir(join(assetDir, "audio"));
    // The asset directory holds exactly this storyboard's clips: the superseded one is
    // gone, and no sidecars are shipped.
    expect(assets).toHaveLength(spoken);
    expect(assets.every((f) => f.endsWith(".wav"))).toBe(true);

    // The cache still has the superseded clip, so changing the sentence back is free.
    const cached = await readdir(join(cacheDir, "audio"));
    expect(cached.filter((f) => f.endsWith(".wav"))).toHaveLength(spoken + 1);
  });

  it("re-synthesises when the voice changes", async () => {
    const storyboard = await storyboardFor();
    const cacheDir = tempDir();

    await runVoice(storyboard, makeTestContext({ topic: TOPIC, assetDir: tempDir(), cacheDir }));

    // A different speaking rate is a different voice, so the cache must miss.
    const second = makeTestContext({
      topic: TOPIC,
      assetDir: tempDir(),
      cacheDir,
      tts: new MockTts({ wordsPerMinute: 200 }),
    });
    await runVoice(storyboard, second);
    expect(second.cost.usageFor("voice").ttsCharacters).toBeGreaterThan(0);
  });

  it("re-synthesises a scene whose narration was edited", async () => {
    const storyboard = await storyboardFor();
    const cacheDir = tempDir();
    await runVoice(storyboard, makeTestContext({ topic: TOPIC, assetDir: tempDir(), cacheDir }));

    const edited = Storyboard.parse({
      ...storyboard,
      scenes: storyboard.scenes.map((s, i) =>
        i === 1 ? { ...s, narration: "A completely different sentence now." } : s,
      ),
    });

    const second = makeTestContext({ topic: TOPIC, assetDir: tempDir(), cacheDir });
    await runVoice(edited, second);
    expect(second.cost.usageFor("voice").ttsCharacters).toBe(
      "A completely different sentence now.".length,
    );
  });

  it("bills TTS characters", async () => {
    const storyboard = await storyboardFor();
    const ctx = makeTestContext({ topic: TOPIC, assetDir: tempDir() });
    await runVoice(storyboard, ctx);
    expect(ctx.cost.usageFor("voice").ttsCharacters).toBeGreaterThan(1000);
  });
});

describe("run outputs", () => {
  it("writes a transcript and a sources file listing credits", async () => {
    const research = mockResearch(TOPIC);
    const script = mockScript(research);
    const ctx = makeTestContext({ topic: TOPIC, assetDir: tempDir() });
    const storyboard = await runImages(await runStoryboard({ script, research }, ctx), ctx);

    const transcript = transcriptText(storyboard);
    expect(transcript).toContain(storyboard.title);
    expect(transcript).toContain(scriptSentences(script)[0]!.text);

    const markdown = sourcesMarkdown(storyboard, {
      issues: [],
      passed: true,
      balanceNote: "Nothing contested.",
    });
    expect(markdown).toContain("## References");
    expect(markdown).toContain("## Image credits");
    expect(markdown).toContain(research.sources[0]!.url);
    expect(markdown).toContain(storyboard.credits[0]!.attribution);
    expect(markdown).toContain("passed");
  });
});
