import type { WordTiming } from "@crammer/schema";
import type { TtsProvider, TtsRequest, TtsResult } from "../types.js";
import { ZERO_USAGE } from "../types.js";

const SAMPLE_RATE = 44100;

/** Writes a mono 16-bit PCM WAV header followed by `samples` of silence. */
function silentWav(durationMs: number): Buffer {
  const samples = Math.max(1, Math.round((durationMs / 1000) * SAMPLE_RATE));
  const dataBytes = samples * 2;
  const buffer = Buffer.alloc(44 + dataBytes);

  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16); // PCM chunk size
  buffer.writeUInt16LE(1, 20); // format: PCM
  buffer.writeUInt16LE(1, 22); // channels: mono
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28); // byte rate
  buffer.writeUInt16LE(2, 32); // block align
  buffer.writeUInt16LE(16, 34); // bits per sample
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataBytes, 40);
  // The sample data is already zeroed by Buffer.alloc.

  return buffer;
}

export type MockTtsOptions = {
  /** Words per minute used to fake timings. 150 matches the script target. */
  wordsPerMinute?: number;
};

/**
 * Produces real, playable silent audio with plausible word timings.
 *
 * Silence rather than synthesised speech keeps mock runs fast and free, while still
 * exercising every downstream path: durations, subtitle chunking, scene lengths and
 * the actual ffmpeg audio mux during render.
 */
export class MockTts implements TtsProvider {
  readonly name = "mock";
  private readonly msPerWord: number;

  constructor(options: MockTtsOptions = {}) {
    this.msPerWord = 60_000 / (options.wordsPerMinute ?? 150);
  }

  async synthesize(req: TtsRequest): Promise<TtsResult> {
    const tokens = req.text.split(/\s+/).filter(Boolean);
    const words: WordTiming[] = tokens.map((text, i) => ({
      text,
      startMs: Math.round(i * this.msPerWord),
      // A small gap between words keeps subtitle chunks from touching.
      endMs: Math.round((i + 1) * this.msPerWord - 60),
    }));

    const durationMs = Math.round(tokens.length * this.msPerWord) + 250;

    return {
      audio: silentWav(durationMs),
      extension: "wav",
      durationMs,
      words,
      usage: { ...ZERO_USAGE, ttsCharacters: req.text.length, requests: 1 },
    };
  }
}
