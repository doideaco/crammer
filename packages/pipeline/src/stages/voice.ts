import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { FPS, Storyboard, type SceneAudio, type Scene } from "@crammer/schema";
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

/** What the cache stores alongside each clip. */
type AudioSidecar = { extension: string; durationMs: number; words: SceneAudio["words"] };

/** Content address for one scene's narration in one voice. */
function cacheKey(narration: string, voiceKey: string): string {
  return createHash("sha256").update(`${voiceKey}\n${narration}`).digest("hex").slice(0, 16);
}

/**
 * Stage 6.
 *
 * One TTS call per scene. Per-scene calls cost the same in total as one long call but
 * make regenerating a single scene cheap, and they give each scene its own word timings
 * starting at zero — which is what the caption and animation code expects.
 *
 * Clips are content-addressed by (narration, voice), so re-running this stage after
 * changing only the images re-uses every clip and costs nothing. The timings live in a
 * sidecar beside the audio, because they cannot be recovered from the file.
 *
 * The cache lives outside the run's asset directory, and the asset directory is pruned
 * to exactly what this storyboard references — it is Remotion's `publicDir` and is
 * copied into every bundle, so stale clips there would inflate every render.
 */
export async function runVoice(storyboard: Storyboard, ctx: PipelineContext): Promise<Storyboard> {
  const audioDir = join(ctx.assetDir, "audio");
  const cacheDir = ctx.cacheDir ? join(ctx.cacheDir, "audio") : audioDir;
  await mkdir(audioDir, { recursive: true });
  await mkdir(cacheDir, { recursive: true });

  const scenes: Scene[] = [];
  const used = new Set<string>();
  let reused = 0;

  for (const [index, scene] of storyboard.scenes.entries()) {
    const narration = scene.narration.trim();

    if (narration.length === 0) {
      scenes.push({ ...scene, durationInFrames: msToFrames(SILENT_SCENE_MS) });
      continue;
    }

    const key = cacheKey(narration, ctx.tts.voiceKey);
    const sidecarPath = join(cacheDir, `${key}.json`);

    let sidecar: AudioSidecar | undefined;
    if (existsSync(sidecarPath)) {
      const candidate = JSON.parse(await readFile(sidecarPath, "utf8")) as AudioSidecar;
      // Both halves have to be present; a clip without its timings is unusable.
      if (existsSync(join(cacheDir, `${key}.${candidate.extension}`))) {
        sidecar = candidate;
        reused++;
      }
    }

    if (!sidecar) {
      ctx.log.step(`  voice ${index + 1}/${storyboard.scenes.length}`);
      const result = await ctx.tts.synthesize({ text: narration });
      ctx.cost.add("voice", result.usage);

      await writeFile(join(cacheDir, `${key}.${result.extension}`), result.audio);
      sidecar = {
        extension: result.extension,
        durationMs: result.durationMs,
        words: result.words,
      };
      await writeFile(sidecarPath, JSON.stringify(sidecar));
    }

    const file = `${key}.${sidecar.extension}`;
    used.add(file);
    if (cacheDir !== audioDir) await copyFile(join(cacheDir, file), join(audioDir, file));

    // Shift the timings by the lead-in so captions line up with the audio as placed.
    const words = sidecar.words.map((word) => ({
      text: word.text,
      startMs: word.startMs + LEAD_IN_MS,
      endMs: word.endMs + LEAD_IN_MS,
    }));

    const durationMs = LEAD_IN_MS + sidecar.durationMs + TAIL_MS;

    scenes.push({
      ...scene,
      audio: { path: `audio/${file}`, durationMs, words },
      durationInFrames: msToFrames(durationMs),
    });
  }

  const pruned = await pruneUnused(audioDir, used);

  const result = Storyboard.parse({ ...storyboard, scenes });
  const seconds = result.scenes.reduce((n, s) => n + (s.durationInFrames ?? 0), 0) / FPS;

  // Log the measured speaking rate: it is what the script stage's word target is
  // derived from, and it drifts when the voice changes.
  const words = result.scenes.reduce((n, s) => n + (s.audio ? s.audio.words.length : 0), 0);
  const spokenMinutes = result.scenes.reduce((n, s) => n + (s.audio?.durationMs ?? 0), 0) / 60_000;
  ctx.log.info(
    `Narration totals ${formatDuration(seconds)} ` +
      `(${words} words at ${Math.round(words / spokenMinutes)} wpm)` +
      (reused > 0 ? `, ${reused} clip(s) reused from cache` : "") +
      (pruned > 0 ? `, ${pruned} stale clip(s) removed` : "") +
      ".",
  );

  return result;
}

/**
 * Removes anything in the run's audio directory this storyboard does not reference.
 *
 * Only the asset directory is pruned — the cache keeps every clip, so editing a
 * sentence and changing it back still costs nothing.
 */
async function pruneUnused(audioDir: string, used: Set<string>): Promise<number> {
  let removed = 0;
  for (const entry of await readdir(audioDir)) {
    if (used.has(entry)) continue;
    await rm(join(audioDir, entry), { force: true });
    removed++;
  }
  return removed;
}

function msToFrames(ms: number): number {
  return Math.max(1, Math.round((ms / 1000) * FPS));
}

export function formatDuration(seconds: number): string {
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}
