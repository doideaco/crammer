import { mkdtempSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { Storyboard } from "@crammer/schema";
import { LocalArtifactStore } from "../artifacts-local.js";
import { MissingArtifactError } from "../artifacts.js";

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
