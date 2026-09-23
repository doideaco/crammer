import type { ImageFetcher, ImageSearchProvider, LlmProvider, TtsProvider } from "./types.js";
import { AnthropicLlm } from "./llm/anthropic.js";
import { ElevenLabsTts } from "./tts/elevenlabs.js";
import { WikimediaImages } from "./images/wikimedia.js";
import { UnsplashImages } from "./images/unsplash.js";
import { PexelsImages } from "./images/pexels.js";
import { HttpImageFetcher } from "./images/mock.js";
import { ProviderConfigError } from "./errors.js";

/**
 * Defers construction until the first property access.
 *
 * Providers validate their keys in their constructors, so building them all up front
 * would make a research-only run demand an ElevenLabs key it never uses. With this, a
 * missing key fails at the point the provider is actually needed.
 */
function lazy<T extends object>(factory: () => T): T {
  let instance: T | undefined;
  return new Proxy({} as T, {
    get(_target, property, receiver) {
      instance ??= factory();
      const value = Reflect.get(instance, property, receiver);
      return typeof value === "function" ? value.bind(instance) : value;
    },
  });
}

export type Providers = {
  llm: LlmProvider;
  tts: TtsProvider;
  /** Tried in order: Wikimedia first, then the stock libraries. */
  imageSearch: ImageSearchProvider[];
  imageFetcher: ImageFetcher;
};

/**
 * Builds the real providers from the environment.
 *
 * Every provider is lazy, so `--stop-after research` needs only an Anthropic key and
 * `--from render` needs none at all.
 *
 * Unsplash and Pexels are optional: a run with only Wikimedia configured still works,
 * it just has fewer fallbacks for generic scenes.
 */
export function createProviders(): Providers {
  const imageSearch: ImageSearchProvider[] = [lazy(() => new WikimediaImages())];
  if (process.env.UNSPLASH_ACCESS_KEY) imageSearch.push(lazy(() => new UnsplashImages()));
  if (process.env.PEXELS_API_KEY) imageSearch.push(lazy(() => new PexelsImages()));

  return {
    llm: lazy(() => new AnthropicLlm()),
    tts: lazy(() => new ElevenLabsTts()),
    imageSearch,
    imageFetcher: new HttpImageFetcher({
      userAgent: process.env.WIKIMEDIA_USER_AGENT ?? "Crammer/0.1",
    }),
  };
}

/** Throws with a readable list of everything missing, rather than one key at a time. */
export function assertEnv(keys: string[]): void {
  const missing = keys.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new ProviderConfigError(
      `Missing environment variables: ${missing.join(", ")}. Copy .env.example to .env and fill them in.`,
    );
  }
}
