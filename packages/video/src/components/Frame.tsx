import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill } from "remotion";
import { theme } from "../theme";
import { fontFamily } from "../fonts";
import { useCaptionsShown } from "./CaptionContext";

/**
 * The outer surface of every scene: sets the family, the background and the safe
 * margins so templates never repeat them.
 */
export const Frame: React.FC<{
  children: ReactNode;
  /** `paper` for typographic scenes, `ink` for dark cards, `bleed` for full-frame media. */
  surface?: "paper" | "ink" | "bleed";
  style?: CSSProperties;
}> = ({ children, surface = "paper", style }) => {
  const background =
    surface === "ink" ? theme.color.ink : surface === "paper" ? theme.color.paper : "transparent";

  return (
    <AbsoluteFill
      style={{
        fontFamily,
        background,
        color: surface === "ink" ? theme.color.onInk : theme.color.ink,
        fontWeight: theme.font.weight.regular,
        ...style,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

/**
 * Content inset to the safe area, with the subtitle band reserved when captions are on
 * so centred layouts never end up underneath them.
 */
export const Safe: React.FC<{ children: ReactNode; style?: CSSProperties }> = ({
  children,
  style,
}) => {
  const captionsShown = useCaptionsShown();
  const bottom = theme.layout.marginY + (captionsShown ? theme.layout.subtitleBand : 0);

  return (
    <AbsoluteFill
      style={{
        padding: `${theme.layout.marginY}px ${theme.layout.marginX}px ${bottom}px`,
        display: "flex",
        flexDirection: "column",
        ...style,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

/** Small letter-spaced label used above headings. */
export const Kicker: React.FC<{ children: ReactNode; tone?: "ink" | "accent" | "onInk" }> = ({
  children,
  tone = "accent",
}) => (
  <div
    style={{
      fontSize: theme.size.label,
      fontWeight: theme.font.weight.semibold,
      letterSpacing: theme.font.tracking.label,
      textTransform: "uppercase",
      color:
        tone === "accent"
          ? theme.color.accent
          : tone === "onInk"
            ? theme.color.onInkMuted
            : theme.color.inkMuted,
    }}
  >
    {children}
  </div>
);

/** A hairline rule on the accent colour, used as a Swiss-style section marker. */
export const Rule: React.FC<{ width?: number; tone?: "accent" | "line" }> = ({
  width = theme.space(9),
  tone = "accent",
}) => (
  <div
    style={{
      width,
      height: theme.stroke.medium,
      background: tone === "accent" ? theme.color.accent : theme.color.line,
    }}
  />
);
