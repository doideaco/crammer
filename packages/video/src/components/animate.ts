import { interpolate, spring, type SpringConfig } from "remotion";
import { theme } from "../theme";

/** Eased 0 -> 1 over `frames`, starting at `delay`. */
export function fadeIn(frame: number, delay = 0, frames: number = theme.motion.enterFrames): number {
  return interpolate(frame, [delay, delay + frames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

/** Spring 0 -> 1, for entrances that should feel physical rather than linear. */
export function rise(
  frame: number,
  fps: number,
  delay = 0,
  config: Partial<SpringConfig> = theme.motion.spring,
): number {
  return spring({ frame: frame - delay, fps, config, durationInFrames: 30 });
}

/** Staggered delay for the nth sibling in a group. */
export function stagger(index: number, base = 0): number {
  return base + index * theme.motion.staggerFrames;
}

/** Fades out over the last `frames` of a scene, so nothing cuts hard. */
export function fadeOut(frame: number, durationInFrames: number, frames = 10): number {
  return interpolate(frame, [durationInFrames - frames, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}
