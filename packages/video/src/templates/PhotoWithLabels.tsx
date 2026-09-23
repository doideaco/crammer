import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { PhotoWithLabelsProps } from "@crammer/schema";
import { theme } from "../theme";
import { Frame } from "../components/Frame";
import { MissingImage } from "../components/MissingImage";
import { fadeIn, rise, stagger } from "../components/animate";

const LEADER = theme.space(9);

/** A photograph with 1–3 callout labels that draw a leader line out to a text box. */
export const PhotoWithLabels: React.FC<PhotoWithLabelsProps> = ({ image, labels }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const asset = image.asset;

  // A very gentle push-in so the still doesn't read as a frozen frame.
  const scale = interpolate(frame, [0, 300], [1.02, 1.08], { extrapolateRight: "clamp" });

  return (
    <Frame surface="bleed" style={{ background: theme.color.ink }}>
      <AbsoluteFill style={{ overflow: "hidden" }}>
        {asset ? (
          <Img
            src={staticFile(asset.localPath)}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              transform: `scale(${scale})`,
            }}
          />
        ) : (
          <MissingImage alt={image.alt} />
        )}
      </AbsoluteFill>

      <AbsoluteFill style={{ background: theme.color.scrimLight }} />

      {labels.map((label, i) => {
        const delay = stagger(i, 10);
        const grow = rise(frame, fps, delay);
        const opacity = fadeIn(frame, delay, 12);
        const cx = label.x * width;
        const cy = label.y * height;
        const dir = label.side === "left" ? -1 : 1;

        return (
          <AbsoluteFill key={`${label.text}-${i}`} style={{ opacity }}>
            <svg width={width} height={height} style={{ position: "absolute", inset: 0 }}>
              {/* Anchor dot on the thing being named */}
              <circle
                cx={cx}
                cy={cy}
                r={theme.space(0.75)}
                fill={theme.color.accent}
                stroke={theme.color.paper}
                strokeWidth={theme.stroke.thin}
              />
              <circle
                cx={cx}
                cy={cy}
                r={theme.space(2) * grow}
                fill="none"
                stroke={theme.color.accent}
                strokeWidth={theme.stroke.thin}
                opacity={0.5}
              />
              {/* Leader line out to the label box */}
              <line
                x1={cx}
                y1={cy}
                x2={cx + dir * LEADER * grow}
                y2={cy}
                stroke={theme.color.accent}
                strokeWidth={theme.stroke.thin}
              />
            </svg>

            <div
              style={{
                position: "absolute",
                left: label.side === "right" ? cx + LEADER + theme.space(1.5) : undefined,
                right:
                  label.side === "left" ? width - cx + LEADER + theme.space(1.5) : undefined,
                top: cy,
                transform: `translateY(-50%) translateX(${dir * (1 - grow) * theme.space(2)}px)`,
                background: theme.color.paper,
                color: theme.color.ink,
                padding: `${theme.space(1.25)}px ${theme.space(2)}px`,
                borderRadius: theme.radius.sm,
                fontSize: theme.size.caption,
                fontWeight: theme.font.weight.semibold,
                letterSpacing: theme.font.tracking.body,
                lineHeight: theme.lineHeight.snug,
                maxWidth: theme.space(45),
                borderLeft:
                  label.side === "right"
                    ? `${theme.stroke.medium}px solid ${theme.color.accent}`
                    : undefined,
                borderRight:
                  label.side === "left"
                    ? `${theme.stroke.medium}px solid ${theme.color.accent}`
                    : undefined,
              }}
            >
              {label.text}
            </div>
          </AbsoluteFill>
        );
      })}
    </Frame>
  );
};
