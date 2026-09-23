import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { TitleCardProps } from "@crammer/schema";
import { theme } from "../theme";
import { Frame, Kicker, Rule, Safe } from "../components/Frame";
import { fadeIn, rise } from "../components/animate";

/** Scene 1 of every video: the title, set large, on paper. */
export const TitleCard: React.FC<TitleCardProps> = ({ title, subtitle, kicker }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // A slow drift upward keeps the card from feeling like a static slide.
  const drift = interpolate(frame, [0, 240], [theme.space(2), -theme.space(2)], {
    extrapolateRight: "clamp",
  });

  return (
    <Frame surface="paper">
      <Safe style={{ justifyContent: "center", gap: theme.space(4) }}>
        <div style={{ transform: `translateY(${drift}px)` }}>
          <div style={{ opacity: fadeIn(frame, 0, 14), marginBottom: theme.space(3) }}>
            <Kicker>{kicker ?? "Explainer"}</Kicker>
          </div>

          <div style={{ marginBottom: theme.space(4), opacity: fadeIn(frame, 4, 14) }}>
            <Rule />
          </div>

          <h1
            style={{
              margin: 0,
              maxWidth: theme.layout.measure + theme.space(20),
              fontSize: theme.size.display,
              fontWeight: theme.font.weight.bold,
              letterSpacing: theme.font.tracking.display,
              lineHeight: theme.lineHeight.tight,
              color: theme.color.ink,
              opacity: fadeIn(frame, 6, 18),
              transform: `translateY(${(1 - rise(frame, fps, 6)) * theme.space(4)}px)`,
            }}
          >
            {title}
          </h1>

          {subtitle ? (
            <p
              style={{
                margin: `${theme.space(4)}px 0 0`,
                maxWidth: theme.layout.measure,
                fontSize: theme.size.subheading,
                fontWeight: theme.font.weight.regular,
                letterSpacing: theme.font.tracking.body,
                lineHeight: theme.lineHeight.normal,
                color: theme.color.inkSoft,
                opacity: fadeIn(frame, 16, 18),
              }}
            >
              {subtitle}
            </p>
          ) : null}
        </div>
      </Safe>
    </Frame>
  );
};
