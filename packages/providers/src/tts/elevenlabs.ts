import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import type { TtsProvider, TtsRequest, TtsResult } from "../types.js";
import { ZERO_USAGE } from "../types.js";
import { ProviderConfigError } from "../errors.js";
import { withRetry } from "../retry.js";
import { charsToWords, durationOf } from "./words.js";

export type ElevenLabsTtsOptions = {
  apiKey?: string;
  voiceId?: string;
  modelId?: string;
  /** mp3 at 44.1kHz/128kbps is plenty for narration and keeps files small. */
  outputFormat?: "mp3_44100_128" | "mp3_44100_192";
};

/**
 * ElevenLabs, via the "with timestamps" endpoint.
 *
 * Word timings are the whole point: they drive subtitle chunking and let scene
 * animations key off the moment a word is actually spoken.
 */
export class ElevenLabsTts implements TtsProvider {
  readonly name = "elevenlabs";
  private readonly client: ElevenLabsClient;
  private readonly voiceId: string;
  private readonly modelId: string;
  private readonly outputFormat: NonNullable<ElevenLabsTtsOptions["outputFormat"]>;

  constructor(options: ElevenLabsTtsOptions = {}) {
    const apiKey = options.apiKey ?? process.env.ELEVENLABS_API_KEY;
    if (!apiKey) throw new ProviderConfigError("ELEVENLABS_API_KEY is not set.");

    const voiceId = options.voiceId ?? process.env.ELEVENLABS_VOICE_ID;
    if (!voiceId) throw new ProviderConfigError("ELEVENLABS_VOICE_ID is not set.");

    this.client = new ElevenLabsClient({ apiKey });
    this.voiceId = voiceId;
    this.modelId = options.modelId ?? "eleven_multilingual_v2";
    this.outputFormat = options.outputFormat ?? "mp3_44100_128";
  }

  async synthesize(req: TtsRequest): Promise<TtsResult> {
    const response = await withRetry(() =>
      this.client.textToSpeech.convertWithTimestamps(req.voiceId ?? this.voiceId, {
        text: req.text,
        modelId: this.modelId,
        outputFormat: this.outputFormat,
      }),
    );

    const audio = Buffer.from(response.audioBase64, "base64");

    // Prefer the normalised alignment: it matches what was actually spoken once
    // numbers and abbreviations have been expanded.
    const alignment = response.normalizedAlignment ?? response.alignment;
    const words = alignment
      ? charsToWords(
          alignment.characters,
          alignment.characterStartTimesSeconds,
          alignment.characterEndTimesSeconds,
        )
      : [];

    return {
      audio,
      extension: "mp3",
      durationMs: durationOf(words),
      words,
      usage: { ...ZERO_USAGE, ttsCharacters: req.text.length, requests: 1 },
    };
  }
}
