import { join } from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { HEIGHT, Storyboard, WIDTH, storyboardDuration, FPS } from "@crammer/schema";
import type { PipelineContext } from "../context.js";
import { formatDuration } from "./voice.js";

export type RenderInput = {
  storyboard: Storyboard;
  /** Absolute path to `packages/video/src/index.ts`. */
  entryPoint: string;
  /** Where video.mp4 is written. */
  outDir: string;
  showCaptions?: boolean;
  /** Renders a fraction of the frame size, for quick previews. */
  scale?: number;
  concurrency?: number;
  /**
   * Path to a Chrome/Chromium binary.
   *
   * Left unset, Remotion downloads its own Chrome Headless Shell on first use — fine
   * locally, but in a container that is a 93MB download on every cold start. Deploy
   * targets that already ship a browser set this instead.
   */
  browserExecutable?: string;
  /**
   * H.264 constant rate factor, lower being higher quality. Remotion defaults to 18,
   * which is near-lossless and produces very large files for what is mostly static
   * typography and slow pans. 21 is visually indistinguishable here at roughly half
   * the size, which matters once these are being served rather than watched locally.
   */
  crf?: number;
  /**
   * Hard ceiling on the finished file, in bytes.
   *
   * Storage backends reject oversized uploads, and a five minute video at a quality
   * chosen by feel lands anywhere between 40MB and 70MB depending on how much
   * photography is in it — so a fixed CRF is a hope, not a guarantee. The bitrate is
   * derived from this and the real duration instead. Supabase's free tier rejects
   * anything over 50MB, hence the default.
   */
  maxOutputBytes?: number;
};

/** Audio is encoded at this rate, and has to come out of the same budget. */
const AUDIO_BITRATE = 128_000;
/** Below this, 1080p stops being watchable; above it, nothing is gained here. */
const VIDEO_BITRATE_RANGE = { min: 500_000, max: 4_000_000 } as const;

/**
 * x264 treats a bitrate target as an aim, not a contract, and overshoots.
 *
 * Measured at about 8% on this content — a 45MB target produced 48.8MB. Aiming lower
 * by this much makes the stated ceiling one that actually holds, which is the point of
 * having it: the upload either fits or it does not.
 */
const ENCODER_OVERSHOOT_HEADROOM = 0.88;

/**
 * Picks a video bitrate that keeps the finished file under `maxOutputBytes`.
 *
 * Exported for the test: the arithmetic is the thing that matters, and it is easier to
 * check directly than by rendering a video and weighing it.
 */
export function videoBitrateFor(durationSeconds: number, maxOutputBytes: number): number {
  const total = (maxOutputBytes * ENCODER_OVERSHOOT_HEADROOM * 8) / Math.max(durationSeconds, 1);
  const forVideo = total - AUDIO_BITRATE;
  return Math.round(
    Math.min(Math.max(forVideo, VIDEO_BITRATE_RANGE.min), VIDEO_BITRATE_RANGE.max),
  );
}

export type RenderOutput = {
  videoPath: string;
  durationSeconds: number;
  frames: number;
};

/**
 * Stage 7.
 *
 * Nothing here talks to a model. The storyboard fully determines the output, so this
 * stage is reproducible: the same JSON always renders the same MP4.
 *
 * `bundle()` is pointed at the run's asset directory as its `publicDir`, so the run's
 * images and audio are copied into the bundle and `staticFile()` in the templates
 * resolves them — nothing has to be written into the video package.
 */
export async function runRender(input: RenderInput, ctx: PipelineContext): Promise<RenderOutput> {
  const videoPath = join(input.outDir, "video.mp4");

  // `PUPPETEER_EXECUTABLE_PATH` is what Trigger.dev's puppeteer extension sets, and
  // what most container images that ship Chrome use, so it is honoured as a fallback.
  const browserExecutable =
    input.browserExecutable ??
    process.env.REMOTION_BROWSER_EXECUTABLE ??
    process.env.PUPPETEER_EXECUTABLE_PATH;

  if (browserExecutable) ctx.log.info(`Using the browser at ${browserExecutable}.`);

  ctx.log.step("  bundling the Remotion project…");
  const serveUrl = await bundle({
    entryPoint: input.entryPoint,
    publicDir: ctx.assetDir,
    onProgress: () => {},
  });

  const inputProps = {
    storyboard: input.storyboard,
    showCaptions: input.showCaptions ?? true,
  };

  const composition = await selectComposition({
    serveUrl,
    id: "Explainer",
    inputProps,
    ...(browserExecutable ? { browserExecutable } : {}),
  });

  const frames = storyboardDuration(input.storyboard);
  const seconds = frames / FPS;

  // 45MB rather than 50: the limit applies to the finished object, and container
  // overhead is not worth losing a demo over.
  const maxOutputBytes = input.maxOutputBytes ?? 45 * 1024 * 1024;
  const videoBitrate = videoBitrateFor(seconds, maxOutputBytes);

  ctx.log.info(
    `Rendering ${frames} frames (${formatDuration(seconds)}) at ${WIDTH}x${HEIGHT}, ` +
      `capped at ${Math.round(maxOutputBytes / 1024 / 1024)}MB (${Math.round(videoBitrate / 1000)}kbps).`,
  );

  let lastLogged = -1;
  await renderMedia({
    composition: {
      ...composition,
      durationInFrames: frames,
      width: WIDTH,
      height: HEIGHT,
      fps: FPS,
    },
    serveUrl,
    codec: "h264",
    // A bitrate target rather than only a CRF, so the ceiling is a guarantee rather
    // than a hope. CRF still governs quality within that budget.
    videoBitrate: `${Math.round(videoBitrate / 1000)}K`,
    audioBitrate: `${Math.round(AUDIO_BITRATE / 1000)}K`,
    ...(input.crf !== undefined ? { crf: input.crf } : {}),
    ...(browserExecutable ? { browserExecutable } : {}),
    outputLocation: videoPath,
    inputProps,
    ...(input.scale ? { scale: input.scale } : {}),
    ...(input.concurrency ? { concurrency: input.concurrency } : {}),
    onProgress: ({ progress }) => {
      const percent = Math.floor(progress * 100);
      // Log every 10% rather than every frame, so CI output stays readable.
      if (percent >= lastLogged + 10) {
        lastLogged = percent;
        ctx.log.step(`  rendering ${percent}%`);
      }
    },
  });

  return { videoPath, durationSeconds: frames / FPS, frames };
}
