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
   * H.264 constant rate factor, lower being higher quality. Remotion defaults to 18,
   * which is near-lossless and produces very large files for what is mostly static
   * typography and slow pans. 21 is visually indistinguishable here at roughly half
   * the size, which matters once these are being served rather than watched locally.
   */
  crf?: number;
};

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
  });

  const frames = storyboardDuration(input.storyboard);
  ctx.log.info(
    `Rendering ${frames} frames (${formatDuration(frames / FPS)}) at ${WIDTH}x${HEIGHT}.`,
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
    crf: input.crf ?? 21,
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
