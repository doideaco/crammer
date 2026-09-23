import type { z } from "zod";
import type { ImageCandidate, ImageProvider, WordTiming } from "@crammer/schema";

// ---------------------------------------------------------------------------
// Usage accounting — every provider call reports what it consumed, so the CLI
// can log full-run costs per stage.
// ---------------------------------------------------------------------------

export type Usage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  /** Characters billed by the TTS provider. */
  ttsCharacters: number;
  /** Billable provider requests (image search hits, web searches, TTS calls). */
  requests: number;
};

export const ZERO_USAGE: Usage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  ttsCharacters: 0,
  requests: 0,
};

export function addUsage(a: Usage, b: Partial<Usage>): Usage {
  return {
    inputTokens: a.inputTokens + (b.inputTokens ?? 0),
    outputTokens: a.outputTokens + (b.outputTokens ?? 0),
    cacheReadTokens: a.cacheReadTokens + (b.cacheReadTokens ?? 0),
    ttsCharacters: a.ttsCharacters + (b.ttsCharacters ?? 0),
    requests: a.requests + (b.requests ?? 0),
  };
}

// ---------------------------------------------------------------------------
// LLM
// ---------------------------------------------------------------------------

export type TextRequest = {
  system: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  /** Enable the server-side web search tool, capped at this many searches. */
  webSearch?: { maxUses: number };
};

export type TextResult = {
  text: string;
  /** URLs the model actually retrieved, when web search was enabled. */
  citations: { url: string; title: string }[];
  usage: Usage;
};

export type StructuredRequest<T> = {
  system: string;
  prompt: string;
  /** The shape the model must produce. Also drives the tool's JSON schema. */
  schema: z.ZodType<T>;
  /** Tool name shown to the model, e.g. "emit_research". */
  toolName: string;
  toolDescription: string;
  maxTokens?: number;
  /** Extra attempts on a validation failure. The error is fed back to the model. */
  retries?: number;
};

export type StructuredResult<T> = { value: T; usage: Usage };

export type VisionImage = {
  /** Raw image bytes. Providers base64-encode as needed. */
  data: Buffer;
  mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
  /** A short label so the model can refer to this image in its answer. */
  label: string;
};

export type VisionRequest<T> = {
  system: string;
  prompt: string;
  images: VisionImage[];
  schema: z.ZodType<T>;
  toolName: string;
  toolDescription: string;
  maxTokens?: number;
};

export interface LlmProvider {
  readonly name: string;
  readonly model: string;
  text(req: TextRequest): Promise<TextResult>;
  structured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>>;
  vision<T>(req: VisionRequest<T>): Promise<StructuredResult<T>>;
}

// ---------------------------------------------------------------------------
// Text to speech
// ---------------------------------------------------------------------------

export type TtsRequest = {
  text: string;
  /** Overrides the provider's configured default voice. */
  voiceId?: string;
};

export type TtsResult = {
  audio: Buffer;
  /** File extension to write, without the dot. */
  extension: string;
  durationMs: number;
  words: WordTiming[];
  usage: Usage;
};

export interface TtsProvider {
  readonly name: string;
  /**
   * Stable identifier for what this provider will produce — provider, voice and model.
   *
   * The voice stage caches audio by (narration, voiceKey), so this has to change
   * whenever the output would, or a cached clip in the wrong voice gets reused.
   */
  readonly voiceKey: string;
  synthesize(req: TtsRequest): Promise<TtsResult>;
}

// ---------------------------------------------------------------------------
// Image search
// ---------------------------------------------------------------------------

export interface ImageSearchProvider {
  readonly name: ImageProvider;
  /** Returns licence-cleared candidates, best first. Never throws on no results. */
  search(query: string, limit: number): Promise<ImageCandidate[]>;
}

/** Fetches raw bytes for a candidate. Separated so it can be mocked in tests. */
export interface ImageFetcher {
  fetch(url: string): Promise<{ data: Buffer; contentType: string }>;
}
