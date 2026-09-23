import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { TimelineProps } from "@crammer/schema";
import { theme } from "../theme";
import { Frame, Kicker, Safe } from "../components/Frame";
import { fadeIn, rise, stagger } from "../components/animate";

/** 3–6 dated events animating left to right along a line. */
export const Timeline: React.FC<TimelineProps> = ({ heading, events }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const lastDelay = stagger(events.length - 1, 14);
  // The rail draws itself just ahead of the markers appearing on it.
  const rail = interpolate(frame, [6, lastDelay + 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <Frame surface="ink">
      <Safe style={{ justifyContent: "center", gap: theme.space(8) }}>
        <div style={{ opacity: fadeIn(frame, 0, 12) }}>
          <Kicker tone="onInk">{heading ?? "How it unfolded"}</Kicker>
        </div>

        <div style={{ position: "relative", paddingTop: theme.space(4) }}>
          {/* Rail */}
          <div
            style={{
              position: "absolute",
              top: theme.space(4),
              left: 0,
              height: theme.stroke.thin,
              width: `${rail * 100}%`,
              background: theme.color.accent,
            }}
          />
          <div
            style={{
              position: "absolute",
              top: theme.space(4),
              left: 0,
              height: theme.stroke.hairline,
              width: "100%",
              background: theme.color.lineOnInk,
            }}
          />

          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${events.length}, 1fr)`,
              gap: theme.space(3),
            }}
          >
            {events.map((event, i) => {
              const delay = stagger(i, 14);
              const grow = rise(frame, fps, delay);
              return (
                <div
                  key={`${event.date}-${i}`}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: theme.space(2),
                    opacity: fadeIn(frame, delay, 12),
                  }}
                >
                  <div
                    style={{
                      width: theme.space(2),
                      height: theme.space(2),
                      borderRadius: theme.radius.pill,
                      background: theme.color.accent,
                      transform: `translateY(${-theme.space(0.5)}px) scale(${grow})`,
                    }}
                  />
                  <div
                    style={{
                      fontSize: theme.size.heading,
                      fontWeight: theme.font.weight.bold,
                      letterSpacing: theme.font.tracking.heading,
                      lineHeight: theme.lineHeight.tight,
                      color: theme.color.onInk,
                      marginTop: theme.space(2),
                    }}
                  >
                    {event.date}
                  </div>
                  <div
                    style={{
                      fontSize: theme.size.caption,
                      lineHeight: theme.lineHeight.normal,
                      color: theme.color.onInkMuted,
                    }}
                  >
                    {event.label}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Safe>
    </Frame>
  );
};
