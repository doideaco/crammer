import { z } from "zod";
import { ImageSlot } from "./image.js";
import { Source } from "./source.js";
import { ImageAsset } from "./image.js";

/** Normalised 0–1 position within the 16:9 frame. */
const Unit = z.number().min(0).max(1);

// ---------------------------------------------------------------------------
// 1. TitleCard
// ---------------------------------------------------------------------------
export const TitleCardProps = z.object({
  title: z.string().min(1).max(80),
  subtitle: z.string().max(140).optional(),
  /** Small label above the title, e.g. "Explainer". */
  kicker: z.string().max(40).optional(),
});
export type TitleCardProps = z.infer<typeof TitleCardProps>;

// ---------------------------------------------------------------------------
// 2. PhotoKenBurns
// ---------------------------------------------------------------------------
export const KenBurnsDirection = z.enum(["in", "out", "left", "right", "up", "down"]);
export type KenBurnsDirection = z.infer<typeof KenBurnsDirection>;

export const PhotoKenBurnsProps = z.object({
  image: ImageSlot,
  direction: KenBurnsDirection.default("in"),
  /** Lower-third caption, e.g. "Sana'a, 2015". */
  caption: z.string().max(90).optional(),
});
export type PhotoKenBurnsProps = z.infer<typeof PhotoKenBurnsProps>;

// ---------------------------------------------------------------------------
// 3. PhotoWithLabels
// ---------------------------------------------------------------------------
export const CalloutLabel = z.object({
  text: z.string().min(1).max(60),
  x: Unit,
  y: Unit,
  /** Which side of the anchor point the label box sits on. */
  side: z.enum(["left", "right"]).default("right"),
});
export type CalloutLabel = z.infer<typeof CalloutLabel>;

export const PhotoWithLabelsProps = z.object({
  image: ImageSlot,
  labels: z.array(CalloutLabel).min(1).max(3),
});
export type PhotoWithLabelsProps = z.infer<typeof PhotoWithLabelsProps>;

// ---------------------------------------------------------------------------
// 4. MapHighlight
// ---------------------------------------------------------------------------
export const MapPin = z.object({
  label: z.string().min(1).max(40),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});
export type MapPin = z.infer<typeof MapPin>;

export const MapHighlightProps = z.object({
  /** "world" fits the globe; "region" fits the highlighted countries plus padding. */
  scope: z.enum(["world", "region"]).default("region"),
  /** ISO 3166-1 alpha-3 codes, e.g. ["YEM", "SAU"]. */
  highlight: z.array(z.string().length(3)).max(12).default([]),
  /** Extra countries to keep in frame without highlighting them. */
  context: z.array(z.string().length(3)).max(12).default([]),
  pins: z.array(MapPin).max(6).default([]),
  /** An animated great-circle line, e.g. a shipping route. */
  route: z
    .object({
      from: z.object({ lat: z.number(), lon: z.number() }),
      to: z.object({ lat: z.number(), lon: z.number() }),
      label: z.string().max(40).optional(),
    })
    .optional(),
  caption: z.string().max(90).optional(),
});
export type MapHighlightProps = z.infer<typeof MapHighlightProps>;

// ---------------------------------------------------------------------------
// 5. WhosWho
// ---------------------------------------------------------------------------
/**
 * Icon names available to `WhosWho`, matching the curated Phosphor set bundled by
 * `@crammer/video`. Kept here so the storyboard prompt has a closed list to choose from
 * and the renderer has something to validate against.
 */
export const ICON_NAMES = [
  "Airplane",
  "Bank",
  "Boat",
  "Buildings",
  "Certificate",
  "Crosshair",
  "Drop",
  "Factory",
  "Flag",
  "Gavel",
  "GlobeHemisphereEast",
  "Handshake",
  "Lightning",
  "MapPin",
  "Megaphone",
  "Money",
  "Newspaper",
  "Package",
  "Scales",
  "ShieldCheck",
  "Student",
  "Truck",
  "UserCircle",
  "Users",
  "Warning",
] as const;

export const IconName = z.enum(ICON_NAMES);
export type IconName = z.infer<typeof IconName>;

export const Actor = z.object({
  name: z.string().min(1).max(48),
  role: z.string().min(1).max(90),
  /** Omit for an icon card; only use a photo when the narration is about this actor. */
  image: ImageSlot.optional(),
  /** Icon used when there is no image. */
  icon: IconName.default("UserCircle"),
});
export type Actor = z.infer<typeof Actor>;

export const WhosWhoProps = z.object({
  heading: z.string().max(60).optional(),
  actors: z.array(Actor).min(2).max(4),
});
export type WhosWhoProps = z.infer<typeof WhosWhoProps>;

// ---------------------------------------------------------------------------
// 6. Timeline
// ---------------------------------------------------------------------------
export const TimelineEvent = z.object({
  /** Display string, not a parsed date: "2014", "Mar 2015", "Nov 2023". */
  date: z.string().min(1).max(16),
  label: z.string().min(1).max(90),
});
export type TimelineEvent = z.infer<typeof TimelineEvent>;

export const TimelineProps = z.object({
  heading: z.string().max(60).optional(),
  events: z.array(TimelineEvent).min(3).max(6),
});
export type TimelineProps = z.infer<typeof TimelineProps>;

// ---------------------------------------------------------------------------
// 7. BigStat
// ---------------------------------------------------------------------------
export const BigStatProps = z.object({
  value: z.number(),
  prefix: z.string().max(4).optional(),
  suffix: z.string().max(12).optional(),
  /** Decimal places to show while counting up. */
  decimals: z.number().int().min(0).max(2).default(0),
  label: z.string().min(1).max(90),
  footnote: z.string().max(90).optional(),
});
export type BigStatProps = z.infer<typeof BigStatProps>;

// ---------------------------------------------------------------------------
// 8. KeyPoints
// ---------------------------------------------------------------------------
export const KeyPointsProps = z.object({
  heading: z.string().max(60).default("The short version"),
  points: z.array(z.string().min(1).max(120)).min(1).max(3),
});
export type KeyPointsProps = z.infer<typeof KeyPointsProps>;

// ---------------------------------------------------------------------------
// 9. EndCard — generated by the pipeline, never chosen by the model
// ---------------------------------------------------------------------------
export const EndCardProps = z.object({
  title: z.string().max(60).default("Credits"),
  sources: z.array(Source).max(14),
  credits: z.array(ImageAsset).max(20),
});
export type EndCardProps = z.infer<typeof EndCardProps>;

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------
export const TEMPLATE_NAMES = [
  "TitleCard",
  "PhotoKenBurns",
  "PhotoWithLabels",
  "MapHighlight",
  "WhosWho",
  "Timeline",
  "BigStat",
  "KeyPoints",
  "EndCard",
] as const;

export const TemplateName = z.enum(TEMPLATE_NAMES);
export type TemplateName = z.infer<typeof TemplateName>;

export const TEMPLATE_PROPS = {
  TitleCard: TitleCardProps,
  PhotoKenBurns: PhotoKenBurnsProps,
  PhotoWithLabels: PhotoWithLabelsProps,
  MapHighlight: MapHighlightProps,
  WhosWho: WhosWhoProps,
  Timeline: TimelineProps,
  BigStat: BigStatProps,
  KeyPoints: KeyPointsProps,
  EndCard: EndCardProps,
} as const satisfies Record<TemplateName, z.ZodType>;

/**
 * One-line descriptions fed to the storyboard prompt so the model can choose
 * templates. `EndCard` is excluded: the pipeline appends it.
 */
export const TEMPLATE_DESCRIPTIONS: Record<Exclude<TemplateName, "EndCard">, string> = {
  TitleCard: "Opening card with the video title. Use once, as the first scene.",
  PhotoKenBurns:
    "One full-bleed photograph with a slow pan or zoom and an optional caption. The workhorse: use for places, events, objects and scene-setting.",
  PhotoWithLabels:
    "One photograph with 1-3 animated callout labels pointing at parts of the image. Use when the narration names specific things visible in the picture.",
  MapHighlight:
    "A map with countries highlighted by ISO code, optional city pins and an optional animated route line. Use for geography, borders, trade routes and conflict locations.",
  WhosWho:
    "2-4 cards revealed in sequence, each with a name and a one-line role. Use when the narration introduces the parties involved.",
  Timeline:
    "3-6 dated events animating along a horizontal line. Use for chronology, once, in the 'what happened' section.",
  BigStat:
    "One large number counting up with a short label. Use when the narration states a single striking figure.",
  KeyPoints:
    "Up to 3 short bullet points. Use for the recap at the end, and sparingly elsewhere.",
};

/** Returns the props schema for a template name. */
export function templatePropsSchema(name: TemplateName): z.ZodType {
  return TEMPLATE_PROPS[name];
}
