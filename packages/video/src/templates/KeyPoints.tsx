import { useCurrentFrame, useVideoConfig } from "remotion";
import type { KeyPointsProps } from "@crammer/schema";
import { theme } from "../theme";
import { Frame, Kicker, Rule, Safe } from "../components/Frame";
import { fadeIn, rise, stagger } from "../components/animate";

/** Up to three short points. The recap template. */
export const KeyPoints: React.FC<KeyPointsProps> = ({ heading, points }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <Frame surface="paper">
      <Safe style={{ justifyContent: "center", gap: theme.space(6) }}>
        <div style={{ opacity: fadeIn(frame, 0, 12) }}>
          <Kicker>{heading}</Kicker>
          <div style={{ marginTop: theme.space(2) }}>
            <Rule />
          </div>
        </div>

        <ol
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: theme.space(4),
            maxWidth: theme.layout.measure + theme.space(12),
          }}
        >
          {points.map((point, i) => {
            const delay = stagger(i, 10);
            const grow = rise(frame, fps, delay);
            return (
              <li
                key={point}
                style={{
                  display: "flex",
                  gap: theme.space(3),
                  alignItems: "flex-start",
                  opacity: fadeIn(frame, delay, 14),
                  transform: `translateY(${(1 - grow) * theme.space(2)}px)`,
                }}
              >
                <span
                  style={{
                    flex: "0 0 auto",
                    fontSize: theme.size.heading,
                    fontWeight: theme.font.weight.bold,
                    letterSpacing: theme.font.tracking.heading,
                    lineHeight: theme.lineHeight.snug,
                    color: theme.color.accent,
                    fontVariantNumeric: "tabular-nums",
                    minWidth: theme.space(8),
                  }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span
                  style={{
                    fontSize: theme.size.heading,
                    fontWeight: theme.font.weight.medium,
                    letterSpacing: theme.font.tracking.heading,
                    lineHeight: theme.lineHeight.snug,
                    color: theme.color.ink,
                  }}
                >
                  {point}
                </span>
              </li>
            );
          })}
        </ol>
      </Safe>
    </Frame>
  );
};
