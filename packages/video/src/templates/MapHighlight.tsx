import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import type { MapHighlightProps } from "@crammer/schema";
import { theme } from "../theme";
import { Frame } from "../components/Frame";
import { WorldMap } from "../components/WorldMap";
import { fadeIn } from "../components/animate";

/** A d3-geo map: highlighted countries, optional pins, optional animated route. */
export const MapHighlight: React.FC<MapHighlightProps> = (props) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  return (
    <Frame surface="paper">
      <AbsoluteFill style={{ opacity: fadeIn(frame, 0, 12) }}>
        <WorldMap {...props} width={width} height={height} />
      </AbsoluteFill>

      {props.caption ? (
        <div
          style={{
            position: "absolute",
            left: theme.layout.marginX,
            bottom: theme.layout.lowerThird,
            maxWidth: theme.layout.measure,
            opacity: fadeIn(frame, 10, 16),
          }}
        >
          <div
            style={{
              width: theme.space(6),
              height: theme.stroke.medium,
              background: theme.color.accent,
              marginBottom: theme.space(2),
            }}
          />
          <div
            style={{
              fontSize: theme.size.subheading,
              fontWeight: theme.font.weight.semibold,
              letterSpacing: theme.font.tracking.heading,
              lineHeight: theme.lineHeight.snug,
              color: theme.color.ink,
            }}
          >
            {props.caption}
          </div>
        </div>
      ) : null}
    </Frame>
  );
};
