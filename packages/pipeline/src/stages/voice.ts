import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { FPS, Storyboard, type Scene } from "@crammer/schema";
import type { PipelineContext } from "../context.js";

/** Silence before the narration starts, so a scene never opens mid-word. */
const LEAD_IN_MS = 250;
/**
 * Silence after it ends, so the cross-fade has somewhere to go. Kept tight: this is
 * paid once per scene, so 200ms here is six seconds across a whole video.
 */
const TAIL_MS = 500;
/** Scenes with no narration (the end card) get a fixed length. */
const SILENT_SCENE_MS = 7000;

/**
 * Stage 6.
 *
 * One TTS call per scene. Per-scene calls cost the same in total as one long call but
 * make regenerating a single scene cheap, and they give each scene its own word timings
 * starting at zero — which is what the caption and animation code expects.
 */
export async function runVoice(storyboard: Storyboard, ctx: PipelineContext): Promise<Storyboard> {
  const audioDir = join(ctx.assetDir, "audio");
  await mkdir(audioDir, { recursive: true });

  const scenes: Scene[] = [];

  for (const [index, scene] of storyboard.scenes.entries()) {
    const narration = scene.narration.trim();

    if (narration.length === 0) {
      scenes.push({ ...scene, durationInFrames: msToFrames(SILENT_SCENE_MS) });
      continue;
    }

    ctx.log.step(`  voice ${index + 1}/${storyboard.scenes.length}`);
    const result = await ctx.tts.synthesize({ text: narration });
    ctx.cost.add("voice", result.usage);

    const name = `sc-${String(index + 1).padStart(2, "0")}.${result.extension}`;
    await writeFile(join(audioDir, name), result.audio);

    // Shift the timings by the lead-in so captions line up with the audio as placed.
    const words = result.words.map((word) => ({
      text: word.text,
      startMs: word.startMs + LEAD_IN_MS,
      endMs: word.endMs + LEAD_IN_MS,
    }));

    const durationMs = LEAD_IN_MS + result.durationMs + TAIL_MS;

    scenes.push({
      ...scene,
      audio: { path: `audio/${name}`, durationMs, words },
      durationInFrames: msToFrames(durationMs),
    });
  }

  const result = Storyboard.parse({ ...storyboard, scenes });
  const seconds = result.scenes.reduce((n, s) => n + (s.durationInFrames ?? 0), 0) / FPS;

  // Log the measured speaking rate: it is what the script stage's word target is
  // derived from, and it drifts when the voice changes.
  const words = result.scenes.reduce(
    (n, s) => n + (s.audio ? s.audio.words.length : 0),
    0,
  );
  const spokenMinutes = result.scenes.reduce((n, s) => n + (s.audio?.durationMs ?? 0), 0) / 60_000;
  ctx.log.info(
    `Narration totals ${formatDuration(seconds)} ` +
      `(${words} words at ${Math.round(words / spokenMinutes)} wpm).`,
  );

  return result;
}

function msToFrames(ms: number): number {
  return Math.max(1, Math.round((ms / 1000) * FPS));
}

export function formatDuration(seconds: number): string {
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}
