import type { Stage } from "@crammer/schema";
import type { CostTracker, ImageFetcher, ImageSearchProvider, LlmProvider, TtsProvider } from "@crammer/providers";

export type Logger = {
  info(message: string): void;
  warn(message: string): void;
  step(message: string): void;
};

/** A logger that says nothing, for tests. */
export const SILENT_LOGGER: Logger = { info: () => {}, warn: () => {}, step: () => {} };

/**
 * Everything a stage needs that is not its input. Passing this explicitly keeps stages
 * pure functions of (input, context) — no module-level singletons, no hidden config,
 * and mocked providers in tests.
 */
export type PipelineContext = {
  llm: LlmProvider;
  tts: TtsProvider;
  /** Tried in order until one returns a usable candidate. */
  imageSearch: ImageSearchProvider[];
  imageFetcher: ImageFetcher;
  cost: CostTracker;
  log: Logger;
  /**
   * Absolute path to the run's asset root. Images land in `<assetDir>/images` and
   * audio in `<assetDir>/audio`; storyboards reference them by relative path, and
   * Remotion is pointed here as its `publicDir`.
   */
  assetDir: string;
  /**
   * Optional cache root, shared across runs, holding `images/` and `audio/` keyed by
   * content hash. Re-running a topic then costs no downloads and no TTS.
   *
   * Deliberately outside `assetDir`: that directory is Remotion's `publicDir` and is
   * copied wholesale into every bundle, so a cache living inside it would grow the
   * bundle without bound.
   */
  cacheDir?: string;
};

/** Times a stage and records its cost. */
export async function runStage<T>(
  ctx: PipelineContext,
  stage: Stage,
  fn: () => Promise<T>,
): Promise<T> {
  ctx.cost.start(stage);
  ctx.log.step(`${stage}…`);
  try {
    return await fn();
  } finally {
    ctx.cost.finish(stage);
  }
}
