/**
 * Design tokens for every scene template.
 *
 * Swiss/minimal: one sans-serif family, an 8px spacing grid, a restrained palette of
 * near-black, off-white and one accent, generous margins, no shadows or gradients.
 *
 * Templates must import from here. Hard-coded colours, sizes, spacing or radii in a
 * template are a bug.
 */

export const theme = {
  color: {
    /** Near-black, used for text on paper and as the dark backdrop. */
    ink: "#14141A",
    inkSoft: "#3D3D47",
    inkMuted: "#6E6E7A",
    /** Off-white page. */
    paper: "#F6F5F1",
    paperSoft: "#E8E7E1",
    /** Hairlines and dividers. */
    line: "#CFCEC7",
    lineOnInk: "#33333D",
    /** The single accent. */
    accent: "#DE3A21",
    accentSoft: "#F5C7BD",
    /** Scrims over photography, so text always clears contrast. */
    scrim: "rgba(20, 20, 26, 0.62)",
    scrimLight: "rgba(20, 20, 26, 0.28)",
    /** Under a lower-third caption, where the photo beneath may be pale. */
    scrimDeep: "rgba(20, 20, 26, 0.82)",
    /** Text on top of ink or a scrim. */
    onInk: "#F6F5F1",
    onInkMuted: "#A6A6B0",
    /** Map fills. */
    mapLand: "#D9D8D0",
    mapLandStroke: "#BCBBB2",
    mapHighlight: "#DE3A21",
    mapContext: "#B4B3A9",
    mapWater: "#F6F5F1",
  },

  /** 8px grid. `space(3)` is 24px. */
  space: (steps: number): number => steps * 8,

  font: {
    family: "Inter, system-ui, sans-serif",
    weight: { regular: 400, medium: 500, semibold: 600, bold: 700 },
    /** Negative tracking on big type, positive on small caps labels. */
    tracking: { display: "-0.03em", heading: "-0.02em", body: "-0.01em", label: "0.14em" },
  },

  /** Type scale, in px at 1920x1080. */
  size: {
    display: 132,
    stat: 220,
    title: 92,
    heading: 60,
    subheading: 42,
    body: 34,
    caption: 28,
    label: 20,
    fine: 18,
  },

  lineHeight: { tight: 1.04, snug: 1.16, normal: 1.35, loose: 1.5 },

  radius: { none: 0, sm: 4, md: 8, pill: 999 },

  stroke: { hairline: 1, thin: 2, medium: 3, thick: 6 },

  /** Safe margins from the frame edge. */
  layout: {
    marginX: 128,
    marginY: 96,
    /** Max measure for body copy, in px. */
    measure: 1180,
    /**
     * Distance from the bottom edge for lower-third captions. Sits clear of the
     * burn-in subtitle band, which is anchored lower.
     */
    lowerThird: 144,
    /**
     * Vertical space the burn-in subtitle band occupies. Templates reserve this at the
     * bottom of the safe area when captions are on, so content never lands under it.
     */
    subtitleBand: 104,
  },

  /** Shared motion constants. Frame-based; the composition runs at 30fps. */
  motion: {
    /** Cross-fade between scenes. */
    transitionFrames: 12,
    /** Entrance stagger between sibling items. */
    staggerFrames: 6,
    /** Standard entrance length. */
    enterFrames: 18,
    spring: { damping: 200, stiffness: 120, mass: 0.8 },
    /** Softer spring for larger objects. */
    springSoft: { damping: 200, stiffness: 70, mass: 1 },
  },
} as const;

export type Theme = typeof theme;
