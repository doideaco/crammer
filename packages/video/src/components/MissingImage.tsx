import { AbsoluteFill } from "remotion";
import { theme } from "../theme";

/**
 * Shown when an image slot has no resolved asset. In a finished run this should never
 * appear — the images stage swaps a scene to a non-photo template when nothing passes
 * the vision check — so it exists for Remotion Studio previews of raw storyboards.
 */
export const MissingImage: React.FC<{ alt: string }> = ({ alt }) => (
  <AbsoluteFill
    style={{
      background: theme.color.paperSoft,
      alignItems: "center",
      justifyContent: "center",
      padding: theme.layout.marginX,
    }}
  >
    <div
      style={{
        border: `${theme.stroke.thin}px dashed ${theme.color.line}`,
        padding: `${theme.space(4)}px ${theme.space(6)}px`,
        maxWidth: theme.layout.measure,
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontSize: theme.size.label,
          fontWeight: theme.font.weight.semibold,
          letterSpacing: theme.font.tracking.label,
          textTransform: "uppercase",
          color: theme.color.inkMuted,
          marginBottom: theme.space(2),
        }}
      >
        Image not resolved
      </div>
      <div
        style={{
          fontSize: theme.size.body,
          lineHeight: theme.lineHeight.normal,
          color: theme.color.inkSoft,
        }}
      >
        {alt}
      </div>
    </div>
  </AbsoluteFill>
);
