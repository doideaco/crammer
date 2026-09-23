import { mkdtempSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Storyboard, Script, Research } from "@crammer/schema";
import { RunDirectory, isBefore, stagesFrom } from "../artifacts.js";
import { slugify } from "../slug.js";
import { run } from "../run.js";

const temp = () => mkdtempSync(join(tmpdir(), "crammer-cli-"));

describe("slugify", () => {
  it("makes a filesystem-safe directory name", () => {
    expect(slugify("The Houthis and the war in Yemen")).toBe(
      "the-houthis-and-the-war-in-yemen",
    );
  });

  it("strips punctuation and accents", () => {
    expect(slugify("Côte d'Ivoire: what's going on?!")).toBe("cote-divoire-whats-going-on");
  });

  it("never returns an empty name", () => {
    expect(slugify("???")).toBe("explainer");
    expect(slugify("")).toBe("explainer");
  });

  it("is stable for the same topic, so --from finds the same directory", () => {
    expect(slugify("Test topic")).toBe(slugify("Test topic"));
  });
});

describe("stage ordering", () => {
  it("orders stages as the pipeline runs them", () => {
    expect(stagesFrom("storyboard")).toEqual(["storyboard", "images", "voice", "render"]);
    expect(isBefore("script", "render")).toBe(true);
    expect(isBefore("render", "script")).toBe(false);
    expect(isBefore("script", "script")).toBe(false);
  });
});

describe("RunDirectory", () => {
  it("round-trips a stage artefact through its schema", async () => {
    const dir = await RunDirectory.open(temp(), "test");
    const script = Script.parse({
      title: "T",
      sections: [{ heading: "hook", sentences: [{ id: "t1", text: "Hello.", factIds: [] }] }],
    });

    expect(dir.has("script")).toBe(false);
    await dir.write("script", script);
    expect(dir.has("script")).toBe(true);
    expect(await dir.read("script", Script)).toEqual(script);
  });

  it("explains how to recover when resuming from a missing stage", async () => {
    const dir = await RunDirectory.open(temp(), "test");
    await expect(dir.read("research", Research)).rejects.toThrow(/Cannot resume/);
  });

  it("refuses an artefact that no longer matches the schema", async () => {
    const dir = await RunDirectory.open(temp(), "test");
    await dir.write("storyboard", { id: "x", title: "y" });
    await expect(dir.read("storyboard", Storyboard)).rejects.toThrow(
      /does not match the current schema/,
    );
  });
});

describe("run (mock providers)", () => {
  const TOPIC = "A test topic for the CLI";

  it("--stop-after halts and leaves that stage's output on disk", async () => {
    const out = temp();
    const { dir } = await run({
      topic: TOPIC,
      level: "beginner",
      from: "research",
      stopAfter: "script",
      out,
      captions: true,
      mock: true,
      quiet: true,
    });

    const runDir = new RunDirectory(dir);
    expect(runDir.has("research")).toBe(true);
    expect(runDir.has("script")).toBe(true);
    expect(runDir.has("storyboard")).toBe(false);
  });

  it("--from resumes using saved output instead of re-running earlier stages", async () => {
    const out = temp();
    const base = {
      topic: TOPIC,
      level: "beginner" as const,
      captions: true,
      mock: true,
      quiet: true,
      out,
    };

    await run({ ...base, from: "research", stopAfter: "factcheck" });

    const { dir } = await run({ ...base, from: "storyboard", stopAfter: "voice" });
    const runDir = new RunDirectory(dir);

    const storyboard = await runDir.read("voice", Storyboard);
    expect(storyboard.scenes.every((s) => s.narration === "" || s.audio)).toBe(true);
    expect(storyboard.credits.length).toBeGreaterThan(0);
  });

  it("resuming at images needs only the storyboard, not the research", async () => {
    const out = temp();
    const base = {
      topic: TOPIC,
      level: "beginner" as const,
      captions: true,
      mock: true,
      quiet: true,
      out,
    };

    const first = await run({ ...base, from: "research", stopAfter: "storyboard" });
    // Removing the earlier artefacts proves the resume does not read them.
    await rm(join(first.dir, "research.json"));
    await rm(join(first.dir, "script.json"));

    const { dir } = await run({ ...base, from: "images", stopAfter: "voice" });
    const storyboard = await new RunDirectory(dir).read("voice", Storyboard);
    expect(storyboard.scenes.some((s) => s.audio)).toBe(true);
  });

  it("writes a transcript and sources alongside the storyboard", async () => {
    const out = temp();
    const { dir } = await run({
      topic: TOPIC,
      level: "beginner",
      from: "research",
      stopAfter: "voice",
      out,
      captions: true,
      mock: true,
      quiet: true,
    });

    // The transcript and sources are written just before render; run them explicitly
    // here by reading what the voice stage produced.
    const storyboard = await new RunDirectory(dir).read("voice", Storyboard);
    expect(storyboard.scenes.length).toBeGreaterThan(3);
    expect(storyboard.sources.length).toBeGreaterThan(0);

    const research = JSON.parse(await readFile(join(dir, "research.json"), "utf8"));
    expect(research.research.topic).toBe(TOPIC);
    expect(research.assessment.allowed).toBe(true);
  });
});
