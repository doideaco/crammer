import { describe, expect, it } from "vitest";
import { charsToWords, durationOf } from "../tts/words.js";

describe("charsToWords", () => {
  const chars = "Hi there.".split("");
  const starts = chars.map((_, i) => i * 0.1);
  const ends = chars.map((_, i) => i * 0.1 + 0.09);

  it("splits on whitespace and keeps punctuation with its word", () => {
    const words = charsToWords(chars, starts, ends);
    expect(words.map((w) => w.text)).toEqual(["Hi", "there."]);
  });

  it("converts seconds to milliseconds", () => {
    const words = charsToWords(chars, starts, ends);
    expect(words[0]).toEqual({ text: "Hi", startMs: 0, endMs: 190 });
  });

  it("handles empty alignment", () => {
    expect(charsToWords([], [], [])).toEqual([]);
    expect(durationOf([])).toBe(0);
  });

  it("reports the end of the last word as the duration", () => {
    const words = charsToWords(chars, starts, ends);
    expect(durationOf(words)).toBe(words.at(-1)!.endMs);
  });
});
