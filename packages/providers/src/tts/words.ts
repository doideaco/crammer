import type { WordTiming } from "@crammer/schema";

/**
 * Turns ElevenLabs' character-level alignment into word timings.
 *
 * The API gives a start and end time per character of the *original* text, so word
 * boundaries are just runs between whitespace. Punctuation stays attached to the
 * preceding word, which is what the subtitle chunker expects.
 */
export function charsToWords(
  characters: string[],
  startSeconds: number[],
  endSeconds: number[],
): WordTiming[] {
  const words: WordTiming[] = [];
  let buffer = "";
  let start = 0;
  let end = 0;

  const flush = () => {
    const text = buffer.trim();
    if (text.length > 0) {
      words.push({ text, startMs: Math.round(start * 1000), endMs: Math.round(end * 1000) });
    }
    buffer = "";
  };

  for (let i = 0; i < characters.length; i++) {
    const char = characters[i] ?? "";
    const charStart = startSeconds[i] ?? end;
    const charEnd = endSeconds[i] ?? charStart;

    if (/\s/.test(char)) {
      flush();
      continue;
    }
    if (buffer.length === 0) start = charStart;
    buffer += char;
    end = charEnd;
  }
  flush();

  return words;
}

/** Total spoken length implied by a set of word timings. */
export function durationOf(words: WordTiming[]): number {
  return words.length === 0 ? 0 : (words[words.length - 1]?.endMs ?? 0);
}
