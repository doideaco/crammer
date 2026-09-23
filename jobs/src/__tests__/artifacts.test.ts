import { mkdtempSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { Storyboard } from "@crammer/schema";
import { LocalArtifactStore } from "../artifacts-local.js";
import { MissingArtifactError } from "../artifacts.js";
import {
  MAX_PENCE_PER_VIDEO,
  SpendLimitError,
  TopicRefusedError,
  isDeterministicFailure,
} from "../stages.js";
import { FactCheckFailedError } from "@crammer/pipeline";
import { ProviderConfigError, RefusedError, StructuredOutputError } from "@crammer/providers";

const temp = () => mkdtempSync(join(tmpdir(), "crammer-store-"));

describe("LocalArtifactStore", () => {
  const Thing = z.object({ a: z.string(), b: z.number() });

  it("round-trips a stage artefact through its schema", async () => {
    const store = new LocalArtifactStore(temp());
    await store.putJson("v1", "research", { a: "x", b: 2 });

    expect(await store.has("v1", "research")).toBe(true);
    expect(await store.getJson("v1", "research", Thing)).toEqual({ a: "x", b: 2 });
  });

  it("says which artefact is missing rather than returning undefined", async () => {
    const store = new LocalArtifactStore(temp());
    await expect(store.getJson("v1", "script", Thing)).rejects.toThrow(MissingArtifactError);
  });

  it("refuses an artefact that no longer matches the schema", async () => {
    const store = new LocalArtifactStore(temp());
    await store.putJson("v1", "storyboard", { id: "x" });
    await expect(store.getJson("v1", "storyboard", Storyboard)).rejects.toThrow(
      /does not match the current schema/,
    );
  });

  it("keeps videos apart", async () => {
    const store = new LocalArtifactStore(temp());
    await store.putJson("v1", "research", { a: "one", b: 1 });
    await store.putJson("v2", "research", { a: "two", b: 2 });

    expect((await store.getJson("v1", "research", Thing)).a).toBe("one");
    expect((await store.getJson("v2", "research", Thing)).a).toBe("two");
  });

  it("round-trips assets, including nested directories", async () => {
    const store = new LocalArtifactStore(temp());
    const source = temp();
    await mkdir(join(source, "images"), { recursive: true });
    await mkdir(join(source, "audio"), { recursive: true });
    await writeFile(join(source, "images", "a.jpg"), "image-bytes");
    await writeFile(join(source, "audio", "b.mp3"), "audio-bytes");

    expect(await store.putAssets("v1", source)).toBe(2);

    // A different machine picking the run up mid-way gets the same tree back.
    const destination = temp();
    expect(await store.fetchAssets("v1", destination)).toBe(2);
    expect(await readFile(join(destination, "images", "a.jpg"), "utf8")).toBe("image-bytes");
    expect(await readFile(join(destination, "audio", "b.mp3"), "utf8")).toBe("audio-bytes");
  });

  it("reports no assets rather than throwing when there are none", async () => {
    const store = new LocalArtifactStore(temp());
    expect(await store.fetchAssets("nobody", temp())).toBe(0);
  });

  it("publishes a deliverable and reads it back", async () => {
    const store = new LocalArtifactStore(temp(), "/media");
    const url = await store.putOutput("v1", "transcript.txt", Buffer.from("hello"), "text/plain");

    expect(url).toBe("/media/v1/transcript.txt");
    expect(await store.getOutputText("v1", "transcript.txt")).toBe("hello");
    expect(await store.getOutputText("v1", "missing.txt")).toBeUndefined();
  });
});

describe("isDeterministicFailure", () => {
  it("does not retry a decision", () => {
    expect(isDeterministicFailure(new TopicRefusedError("declined"))).toBe(true);
    expect(
      isDeterministicFailure(
        new FactCheckFailedError("too many issues", { issues: [], passed: false, balanceNote: "" }),
      ),
    ).toBe(true);
  });

  it("does not retry once the budget is gone", () => {
    expect(isDeterministicFailure(new SpendLimitError(900, 600))).toBe(true);
  });

  it("does not retry something that will still be missing", () => {
    expect(isDeterministicFailure(new MissingArtifactError("v1", "research"))).toBe(true);
    expect(isDeterministicFailure(new Error("Video abc does not exist."))).toBe(true);
  });

  it("does not retry a key that is not set", () => {
    expect(isDeterministicFailure(new ProviderConfigError("ANTHROPIC_API_KEY is not set."))).toBe(
      true,
    );
  });

  it("does not retry output that failed validation after the provider already retried", () => {
    expect(isDeterministicFailure(new StructuredOutputError("bad output", 3, null))).toBe(true);
  });

  it("DOES retry a provider hiccup, which is what retries are for", () => {
    expect(isDeterministicFailure(new Error("fetch failed"))).toBe(false);
    expect(isDeterministicFailure(Object.assign(new Error("rate limited"), { status: 429 }))).toBe(
      false,
    );
    // A refusal from the model mid-run is transient in a way a topic refusal is not:
    // it is surfaced by the research stage as a TopicRefusedError when it is final.
    expect(isDeterministicFailure(new RefusedError("declined this request"))).toBe(false);
  });
});

describe("spend limit", () => {
  it("defaults to a ceiling above a clean run but well below a fully retrying one", () => {
    // A clean run is about 270 pence; all-retries reaches roughly 1000.
    expect(MAX_PENCE_PER_VIDEO).toBeGreaterThan(270);
    expect(MAX_PENCE_PER_VIDEO).toBeLessThan(1000);
  });

  it("says what was spent and what the limit was", () => {
    const error = new SpendLimitError(900, 600);
    expect(error.message).toContain("9.00");
    expect(error.message).toContain("6.00");
  });
});
