import { useCurrentFrame, useVideoConfig } from "remotion";
import { chunkWords, type SceneAudio } from "@crammer/schema";
import { theme } from "../theme";
import { useMemo } from "react";

/**
 * Burn-in subtitles driven by the real word timings from the TTS provider, so they
 * track the narration rather than an estimate. Toggled by the `showCaptions`
 * composition prop.
 */
export const Captions: React.FC<{ audio: SceneAudio | undefined }> = ({ audio }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const chunks = useMemo(() => (audio ? chunkWords(audio.words) : []), [audio]);

  if (chunks.length === 0) return null;

  const ms = (frame / fps) * 1000;
  const active = chunks.find((c) => ms >= c.startMs && ms <= c.endMs + 120);
  if (!active) return null;

  return (
    <div
      style={{
        position: "absolute",
        left: theme.layout.marginX,
        right: theme.layout.marginX,
        bottom: theme.space(7),
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          background: theme.color.scrim,
          color: theme.color.onInk,
          fontSize: theme.size.caption,
          fontWeight: theme.font.weight.medium,
          letterSpacing: theme.font.tracking.body,
          lineHeight: theme.lineHeight.snug,
          padding: `${theme.space(1.5)}px ${theme.space(3)}px`,
          borderRadius: theme.radius.sm,
          maxWidth: theme.layout.measure,
          textAlign: "center",
        }}
      >
        {active.text}
      </div>
    </div>
  );
};
