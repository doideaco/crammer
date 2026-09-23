import { Img, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { WhosWhoProps } from "@crammer/schema";
import { theme } from "../theme";
import { Frame, Kicker, Rule, Safe } from "../components/Frame";
import { Icon } from "../components/Icon";
import { fadeIn, rise, stagger } from "../components/animate";

/** 2–4 actor cards revealed in sequence: who is involved and why they matter. */
export const WhosWho: React.FC<WhosWhoProps> = ({ heading, actors }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <Frame surface="paper">
      <Safe style={{ justifyContent: "center", gap: theme.space(6) }}>
        <div style={{ opacity: fadeIn(frame, 0, 12) }}>
          <Kicker>{heading ?? "Who's involved"}</Kicker>
          <div style={{ marginTop: theme.space(2) }}>
            <Rule />
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${actors.length}, 1fr)`,
            gap: theme.space(4),
            alignItems: "stretch",
          }}
        >
          {actors.map((actor, i) => {
            const delay = stagger(i, 8);
            const grow = rise(frame, fps, delay);
            const asset = actor.image?.asset;

            return (
              <div
                key={actor.name}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: theme.space(2),
                  opacity: fadeIn(frame, delay, 14),
                  transform: `translateY(${(1 - grow) * theme.space(3)}px)`,
                  borderTop: `${theme.stroke.medium}px solid ${theme.color.ink}`,
                  paddingTop: theme.space(3),
                }}
              >
                <div
                  style={{
                    aspectRatio: "1 / 1",
                    background: theme.color.paperSoft,
                    overflow: "hidden",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {asset ? (
                    <Img
                      src={staticFile(asset.localPath)}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        transform: `scale(${1.02 + 0.04 * grow})`,
                      }}
                    />
                  ) : (
                    <Icon name={actor.icon} size={theme.space(14)} color={theme.color.inkMuted} />
                  )}
                </div>

                <div
                  style={{
                    fontSize: theme.size.subheading,
                    fontWeight: theme.font.weight.bold,
                    letterSpacing: theme.font.tracking.heading,
                    lineHeight: theme.lineHeight.snug,
                    color: theme.color.ink,
                    // Two lines of headroom keeps the role text aligned across cards.
                    minHeight: theme.size.subheading * theme.lineHeight.snug * 2,
                  }}
                >
                  {actor.name}
                </div>
                <div
                  style={{
                    fontSize: theme.size.caption,
                    fontWeight: theme.font.weight.regular,
                    lineHeight: theme.lineHeight.normal,
                    color: theme.color.inkSoft,
                  }}
                >
                  {actor.role}
                </div>
              </div>
            );
          })}
        </div>
      </Safe>
    </Frame>
  );
};
