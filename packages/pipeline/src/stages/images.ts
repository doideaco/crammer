import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { z } from "zod";
import {
  ImageVerdict,
  Storyboard,
  collectCredits,
  imageSlots,
  type ImageAsset,
  type ImageCandidate,
  type ImageSlot,
  type Scene,
} from "@crammer/schema";
import { attributionLine } from "@crammer/providers";
import type { PipelineContext } from "../context.js";
import { imageCheckPrompt, imageCheckSystemPrompt } from "../prompts/index.js";

/** Minimum relevance score for an image to be used. */
export const RELEVANCE_THRESHOLD = 0.62;
/** How many candidates go to the vision check per slot. */
const CANDIDATES_PER_SLOT = 5;
/** Longest edge sent to the vision model. Full-size images waste tokens. */
const VISION_WIDTH = 768;
/** Final render size. Everything is cropped to 16:9. */
const OUTPUT = { width: 1920, height: 1080 } as const;

const VerdictList = z.object({
  verdicts: z
    .array(ImageVerdict.extend({ index: z.number().int().min(0) }))
    .min(1),
});

/**
 * Stage 5.
 *
 * For each image slot: search across providers in query order, licence-filter, ask
 * Claude vision whether the top candidates actually depict what the narration
 * describes, then download, crop and cache the winner.
 *
 * A slot with no acceptable candidate does not get a wrong picture — the scene swaps to
 * a non-photo template instead.
 */
export async function runImages(storyboard: Storyboard, ctx: PipelineContext): Promise<Storyboard> {
  const imagesDir = join(ctx.assetDir, "images");
  await mkdir(imagesDir, { recursive: true });

  const slots = imageSlots(storyboard);
  ctx.log.info(`${slots.length} image slot(s) to fill.`);

  const failed = new Set<string>();

  for (const [index, entry] of slots.entries()) {
    ctx.log.step(`  image ${index + 1}/${slots.length}: ${entry.slot.alt}`);
    const asset = await resolveSlot(entry.slot, entry.narration, imagesDir, ctx);
    if (asset) {
      entry.set(asset);
    } else {
      ctx.log.warn(`  no usable image for "${entry.slot.alt}" — falling back.`);
      failed.add(entry.sceneId);
    }
  }

  const scenes = storyboard.scenes.map((scene) =>
    failed.has(scene.id) ? applyFallback(scene, ctx) : scene,
  );

  const result = Storyboard.parse({ ...storyboard, scenes });
  result.credits = collectCredits(result);

  // Keep the end card's credits in step with what actually resolved.
  const endCard = result.scenes.at(-1);
  if (endCard?.template === "EndCard") endCard.props.credits = result.credits;

  ctx.log.info(`${result.credits.length} image(s) used.`);
  return result;
}

/** Runs one slot through search, vision check, download and processing. */
async function resolveSlot(
  slot: ImageSlot,
  narration: string,
  imagesDir: string,
  ctx: PipelineContext,
): Promise<ImageAsset | undefined> {
  const candidates = await gatherCandidates(slot, ctx);
  if (candidates.length === 0) return undefined;

  const downloaded: { candidate: ImageCandidate; data: Buffer }[] = [];
  for (const candidate of candidates) {
    try {
      const { data } = await ctx.imageFetcher.fetch(candidate.url);
      ctx.cost.add("images", { requests: 1 });
      downloaded.push({ candidate, data });
    } catch (error) {
      ctx.log.warn(`  could not fetch ${candidate.url}: ${(error as Error).message}`);
    }
    if (downloaded.length >= CANDIDATES_PER_SLOT) break;
  }
  if (downloaded.length === 0) return undefined;

  // Send small versions for judging; the originals are only processed once a winner
  // is picked.
  const thumbnails = await Promise.all(
    downloaded.map(async ({ data }) =>
      sharp(data).rotate().resize({ width: VISION_WIDTH, withoutEnlargement: true }).jpeg({ quality: 78 }).toBuffer(),
    ),
  );

  const verdicts = await ctx.llm.vision({
    system: imageCheckSystemPrompt(),
    prompt: imageCheckPrompt(slot.alt, narration),
    images: thumbnails.map((data, i) => ({
      data,
      mediaType: "image/jpeg" as const,
      label: `${i}`,
    })),
    schema: VerdictList,
    toolName: "judge_images",
    toolDescription: "Score each image for relevance and flag graphic content.",
    maxTokens: 4000,
  });
  ctx.cost.add("images", verdicts.usage);

  const judged = verdicts.value.verdicts.filter((v) => v.index < downloaded.length);
  const scored = judged
    .filter((v) => !v.graphic && v.relevance >= RELEVANCE_THRESHOLD)
    .sort((a, b) => b.relevance - a.relevance);

  const best = scored[0];
  if (!best) {
    // Say why nothing passed. Without this a fallback is indistinguishable from a
    // search that returned nothing, and the two need completely different fixes.
    for (const verdict of judged) {
      const candidate = downloaded[verdict.index]?.candidate;
      ctx.log.info(
        `    rejected ${verdict.relevance.toFixed(2)}${verdict.graphic ? " graphic" : ""} ` +
          `"${(candidate?.title ?? "?").slice(0, 48)}" — ${verdict.reason.slice(0, 90)}`,
      );
    }
    return undefined;
  }

  const winner = downloaded[best.index]!;
  ctx.log.info(`  chose "${winner.candidate.title}" (relevance ${best.relevance.toFixed(2)}).`);

  return processImage(winner.candidate, winner.data, imagesDir, ctx);
}

/** Runs the slot's queries against each provider in turn until there are enough hits. */
async function gatherCandidates(
  slot: ImageSlot,
  ctx: PipelineContext,
): Promise<ImageCandidate[]> {
  const found: ImageCandidate[] = [];
  const seen = new Set<string>();

  for (const query of slot.queries) {
    for (const provider of ctx.imageSearch) {
      if (found.length >= CANDIDATES_PER_SLOT) return found;
      try {
        const results = await provider.search(query, CANDIDATES_PER_SLOT);
        ctx.cost.add("images", { requests: 1 });
        for (const candidate of results) {
          if (seen.has(candidate.url)) continue;
          // Everything is cropped to 16:9, so reject shapes that crop badly:
          // portrait and near-square lose the sides, panorama banners lose the subject.
          const ratio = candidate.width / candidate.height;
          if (ratio < 1.2 || ratio > 2.6) continue;
          // Too small to fill a 1920x1080 frame without visible upscaling.
          if (candidate.width < 1280) continue;
          seen.add(candidate.url);
          found.push(candidate);
        }
      } catch (error) {
        ctx.log.warn(`  ${provider.name} search failed for "${query}": ${(error as Error).message}`);
      }
    }
  }

  return found;
}

/**
 * Crops to 16:9, caps at 1920x1080, and stores the result under its content hash so a
 * repeated image across scenes is downloaded and processed once.
 */
async function processImage(
  candidate: ImageCandidate,
  data: Buffer,
  imagesDir: string,
  ctx: PipelineContext,
): Promise<ImageAsset> {
  const contentHash = createHash("sha256").update(data).digest("hex").slice(0, 16);
  const localPath = `images/${contentHash}.jpg`;
  const file = join(imagesDir, `${contentHash}.jpg`);

  const cached = ctx.cacheDir ? join(ctx.cacheDir, `${contentHash}.jpg`) : undefined;

  let processed: Buffer;
  if (cached && existsSync(cached)) {
    processed = await readFile(cached);
  } else {
    processed = await sharp(data)
      .rotate()
      .resize({ ...OUTPUT, fit: "cover", position: "attention" })
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer();
    if (cached) {
      await mkdir(ctx.cacheDir!, { recursive: true });
      await writeFile(cached, processed);
    }
  }

  await writeFile(file, processed);

  return {
    localPath,
    sourceUrl: candidate.url,
    ...(candidate.pageUrl ? { pageUrl: candidate.pageUrl } : {}),
    author: candidate.author || "Unknown author",
    licence: candidate.licence ?? "cc0",
    ...(candidate.licenceUrl ? { licenceUrl: candidate.licenceUrl } : {}),
    attribution: attributionLine({
      title: candidate.title,
      author: candidate.author || "Unknown author",
      licence: candidate.licence ?? "cc0",
      provider: candidate.provider,
    }),
    provider: candidate.provider,
    width: OUTPUT.width,
    height: OUTPUT.height,
    contentHash,
  };
}

/**
 * Replaces a photo scene whose image could not be resolved.
 *
 * `WhosWho` just loses the portrait and falls back to its icon. A photo scene becomes a
 * typographic card — showing nothing is better than showing the wrong picture.
 */
export function applyFallback(scene: Scene, ctx: PipelineContext): Scene {
  if (scene.template === "WhosWho") {
    return {
      ...scene,
      props: {
        ...scene.props,
        actors: scene.props.actors.map((actor) =>
          actor.image?.asset ? actor : { ...actor, image: undefined },
        ),
      },
    };
  }

  if (scene.template !== "PhotoKenBurns" && scene.template !== "PhotoWithLabels") return scene;

  const caption =
    scene.template === "PhotoKenBurns" ? scene.props.caption : scene.props.labels[0]?.text;
  const title = caption ?? firstClause(scene.narration);

  ctx.log.info(`  scene ${scene.id} swapped to a TitleCard.`);

  return {
    id: scene.id,
    narration: scene.narration,
    sentenceIds: scene.sentenceIds,
    ...(scene.audio ? { audio: scene.audio } : {}),
    ...(scene.durationInFrames ? { durationInFrames: scene.durationInFrames } : {}),
    template: "TitleCard",
    props: { kicker: "Context", title },
  };
}

/** First sentence of the narration, trimmed to fit a title card. */
function firstClause(narration: string): string {
  const sentence = narration.split(/(?<=[.!?])\s/)[0] ?? narration;
  return sentence.length > 78 ? `${sentence.slice(0, 75).trimEnd()}…` : sentence;
}
