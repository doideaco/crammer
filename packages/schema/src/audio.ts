import { z } from "zod";

export const WordTiming = z.object({
  text: z.string(),
  startMs: z.number().nonnegative(),
  endMs: z.number().nonnegative(),
});
export type WordTiming = z.infer<typeof WordTiming>;

/**
 * Narration audio for one scene.
 * `path` is relative to the run's asset root, e.g. `audio/sc-03.mp3`.
 */
export const SceneAudio = z.object({
  path: z.string().min(1),
  durationMs: z.number().positive(),
  words: z.array(WordTiming),
});
export type SceneAudio = z.infer<typeof SceneAudio>;

/** Groups word timings into subtitle chunks of at most `maxChars` characters. */
export function chunkWords(
  words: WordTiming[],
  maxChars = 42,
): { text: string; startMs: number; endMs: number }[] {
  const chunks: { text: string; startMs: number; endMs: number }[] = [];
  let current: WordTiming[] = [];

  const flush = () => {
    if (current.length === 0) return;
    const first = current[0]!;
    const last = current[current.length - 1]!;
    chunks.push({
      text: current
        .map((w) => w.text)
        .join(" ")
        .replace(/\s+([,.;:!?])/g, "$1")
        .trim(),
      startMs: first.startMs,
      endMs: last.endMs,
    });
    current = [];
  };

  for (const word of words) {
    const candidateLength = current.reduce((n, w) => n + w.text.length + 1, 0) + word.text.length;
    if (current.length > 0 && candidateLength > maxChars) flush();
    current.push(word);
    // Break early on sentence-final punctuation so subtitles track the narration.
    if (/[.!?]$/.test(word.text)) flush();
  }
  flush();

  return chunks;
}
