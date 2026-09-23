import { describe, expect, it } from "vitest";
import { z } from "zod";
import { MockLlm } from "../llm/mock.js";
import { MockTts } from "../tts/mock.js";
import { MockImageSearch } from "../images/mock.js";
import { StructuredOutputError } from "../errors.js";
import { toToolSchema } from "../llm/json-schema.js";

describe("MockLlm", () => {
  const schema = z.object({ answer: z.string() });

  it("returns the registered handler's value", async () => {
    const llm = new MockLlm().on("ask", () => ({ answer: "yes" }));
    const result = await llm.structured({
      system: "",
      prompt: "",
      schema,
      toolName: "ask",
      toolDescription: "",
    });
    expect(result.value.answer).toBe("yes");
    expect(llm.calls).toEqual(["ask"]);
  });

  it("throws when a handler's output fails the real schema", async () => {
    const llm = new MockLlm().on("ask", () => ({ wrong: true }));
    await expect(
      llm.structured({ system: "", prompt: "", schema, toolName: "ask", toolDescription: "" }),
    ).rejects.toThrow(StructuredOutputError);
  });

  it("throws for an unregistered tool rather than inventing an answer", async () => {
    await expect(
      new MockLlm().structured({
        system: "",
        prompt: "",
        schema,
        toolName: "missing",
        toolDescription: "",
      }),
    ).rejects.toThrow(/no handler/);
  });
});

describe("MockTts", () => {
  it("produces a playable WAV and timings that match the text", async () => {
    const tts = new MockTts();
    const result = await tts.synthesize({ text: "One two three four five." });

    expect(result.extension).toBe("wav");
    expect(result.audio.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(result.audio.subarray(8, 12).toString("ascii")).toBe("WAVE");
    expect(result.words.map((w) => w.text)).toEqual(["One", "two", "three", "four", "five."]);
    expect(result.durationMs).toBeGreaterThan(result.words.at(-1)!.endMs);
    expect(result.usage.ttsCharacters).toBe("One two three four five.".length);
  });

  it("scales duration with the configured speaking rate", async () => {
    const slow = await new MockTts({ wordsPerMinute: 100 }).synthesize({ text: "a b c d" });
    const fast = await new MockTts({ wordsPerMinute: 200 }).synthesize({ text: "a b c d" });
    expect(slow.durationMs).toBeGreaterThan(fast.durationMs);
  });

  it("never emits overlapping word timings", async () => {
    const { words } = await new MockTts().synthesize({ text: "a b c d e f" });
    for (let i = 1; i < words.length; i++) {
      expect(words[i]!.startMs).toBeGreaterThan(words[i - 1]!.endMs);
    }
  });
});

describe("MockImageSearch", () => {
  it("returns deterministic, permissively licensed candidates", async () => {
    const search = new MockImageSearch();
    const first = await search.search("port of Aden", 3);
    const second = await search.search("port of Aden", 3);
    expect(first).toEqual(second);
    expect(first.every((c) => c.licence === "cc-by")).toBe(true);
  });

  it("can return nothing, to exercise the fallback path", async () => {
    const search = new MockImageSearch({ emptyFor: /nothing/ });
    expect(await search.search("nothing here", 5)).toEqual([]);
  });
});

describe("toToolSchema", () => {
  it("passes object schemas straight through", () => {
    const json = toToolSchema(z.object({ a: z.string(), b: z.number().optional() }));
    expect(json.type).toBe("object");
    expect(Object.keys(json.properties)).toEqual(["a", "b"]);
    expect(json.required).toEqual(["a"]);
  });

  it("treats a field with a default as optional for the model", () => {
    const json = toToolSchema(z.object({ a: z.string(), b: z.string().default("x") }));
    expect(json.required).toEqual(["a"]);
  });

  it("wraps non-object schemas so the tool still takes an object", () => {
    const json = toToolSchema(z.array(z.string()));
    expect(json.type).toBe("object");
    expect(json.required).toEqual(["value"]);
  });
});
