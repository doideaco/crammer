import { z } from "zod";
import { Id, Level, RunCost } from "./common.js";
import { SceneAudio } from "./audio.js";
import { ImageAsset, ImageSlot } from "./image.js";
import { Source } from "./source.js";
import {
  TEMPLATE_NAMES,
  TEMPLATE_PROPS,
  TemplateName,
  type BigStatProps,
  type EndCardProps,
  type KeyPointsProps,
  type MapHighlightProps,
  type PhotoKenBurnsProps,
  type PhotoWithLabelsProps,
  type TimelineProps,
  type TitleCardProps,
  type WhosWhoProps,
} from "./templates.js";

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;
/** Frames of cross-fade between consecutive scenes. */
export const TRANSITION_FRAMES = 12;

/** Fields every scene carries, whatever its template. */
const SceneBase = {
  id: Id,
  /**
   * The narration spoken over this scene. Drives TTS and the transcript.
   * Empty only for scenes with nothing to say — in practice just `EndCard`.
   */
  narration: z.string().default(""),
  /** Ids of the script sentences this scene covers, for traceability. */
  sentenceIds: z.array(Id).default([]),
  audio: SceneAudio.optional(),
  /** Set by the voice stage from the real audio length. */
  durationInFrames: z.number().int().positive().optional(),
};

/** Builds one member of the Scene discriminated union. */
function sceneVariant<N extends TemplateName>(name: N) {
  return z.object({
    ...SceneBase,
    template: z.literal(name),
    props: TEMPLATE_PROPS[name],
  });
}

export const Scene = z.discriminatedUnion("template", [
  sceneVariant("TitleCard"),
  sceneVariant("PhotoKenBurns"),
  sceneVariant("PhotoWithLabels"),
  sceneVariant("MapHighlight"),
  sceneVariant("WhosWho"),
  sceneVariant("Timeline"),
  sceneVariant("BigStat"),
  sceneVariant("KeyPoints"),
  sceneVariant("EndCard"),
]);
export type Scene = z.infer<typeof Scene>;

/** Narrow a scene to one template, so `props` is typed. */
export type SceneOf<N extends TemplateName> = Extract<Scene, { template: N }>;

export type TemplatePropsMap = {
  TitleCard: TitleCardProps;
  PhotoKenBurns: PhotoKenBurnsProps;
  PhotoWithLabels: PhotoWithLabelsProps;
  MapHighlight: MapHighlightProps;
  WhosWho: WhosWhoProps;
  Timeline: TimelineProps;
  BigStat: BigStatProps;
  KeyPoints: KeyPointsProps;
  EndCard: EndCardProps;
};

/**
 * The scenes the storyboard stage asks the model for: every template except `EndCard`,
 * which the pipeline appends itself so the credits can never be omitted or invented.
 */
export const DraftScene = z.discriminatedUnion("template", [
  sceneVariant("TitleCard"),
  sceneVariant("PhotoKenBurns"),
  sceneVariant("PhotoWithLabels"),
  sceneVariant("MapHighlight"),
  sceneVariant("WhosWho"),
  sceneVariant("Timeline"),
  sceneVariant("BigStat"),
  sceneVariant("KeyPoints"),
]);
export type DraftScene = z.infer<typeof DraftScene>;

export const StoryboardDraft = z.object({
  title: z.string().min(1).max(80),
  scenes: z.array(DraftScene).min(4).max(40),
});
export type StoryboardDraft = z.infer<typeof StoryboardDraft>;

export const Storyboard = z.object({
  id: Id,
  title: z.string().min(1),
  topic: z.string().min(1),
  level: Level.default("beginner"),
  theme: z.enum(["default"]).default("default"),
  scenes: z.array(Scene).min(1),
  sources: z.array(Source),
  /** Derived from resolved image assets; rendered on the end card and in sources.md. */
  credits: z.array(ImageAsset).default([]),
  cost: RunCost.optional(),
});
export type Storyboard = z.infer<typeof Storyboard>;

/** Props the `Explainer` composition takes. */
export const ExplainerProps = z.object({
  storyboard: Storyboard,
  showCaptions: z.boolean().default(true),
});
export type ExplainerProps = z.infer<typeof ExplainerProps>;

// ---------------------------------------------------------------------------
// Helpers shared by the pipeline and the Remotion project
// ---------------------------------------------------------------------------

/** Scene length in frames, falling back to a readable default before the voice stage. */
export function sceneDuration(scene: Scene): number {
  return scene.durationInFrames ?? FPS * 6;
}

/**
 * Total composition length. Consecutive scenes overlap by `TRANSITION_FRAMES`,
 * so the timeline is shorter than the sum of the scenes.
 */
export function storyboardDuration(storyboard: Storyboard): number {
  const total = storyboard.scenes.reduce((n, s) => n + sceneDuration(s), 0);
  const overlap = Math.max(0, storyboard.scenes.length - 1) * TRANSITION_FRAMES;
  return Math.max(FPS, total - overlap);
}

/** Frame at which each scene starts, accounting for transition overlap. */
export function sceneStartFrames(storyboard: Storyboard): number[] {
  let frame = 0;
  return storyboard.scenes.map((scene, i) => {
    const start = frame;
    frame += sceneDuration(scene) - (i < storyboard.scenes.length - 1 ? TRANSITION_FRAMES : 0);
    return start;
  });
}

/** Every image slot in a storyboard, with a setter so the images stage can fill it. */
export function imageSlots(
  storyboard: Storyboard,
): { sceneId: string; narration: string; slot: ImageSlot; set: (asset: ImageAsset) => void }[] {
  const out: {
    sceneId: string;
    narration: string;
    slot: ImageSlot;
    set: (asset: ImageAsset) => void;
  }[] = [];

  for (const scene of storyboard.scenes) {
    if (scene.template === "PhotoKenBurns" || scene.template === "PhotoWithLabels") {
      const props = scene.props;
      out.push({
        sceneId: scene.id,
        narration: scene.narration,
        slot: props.image,
        set: (asset) => {
          props.image.asset = asset;
        },
      });
    } else if (scene.template === "WhosWho") {
      for (const actor of scene.props.actors) {
        if (!actor.image) continue;
        const image = actor.image;
        out.push({
          sceneId: scene.id,
          narration: `${actor.name} — ${actor.role}. ${scene.narration}`,
          slot: image,
          set: (asset) => {
            image.asset = asset;
          },
        });
      }
    }
  }
  return out;
}

/** Deduplicated image credits, in scene order. */
export function collectCredits(storyboard: Storyboard): ImageAsset[] {
  const seen = new Set<string>();
  const credits: ImageAsset[] = [];
  for (const { slot } of imageSlots(storyboard)) {
    const asset = slot.asset;
    if (!asset || seen.has(asset.contentHash)) continue;
    seen.add(asset.contentHash);
    credits.push(asset);
  }
  return credits;
}

export { TEMPLATE_NAMES, TemplateName };
