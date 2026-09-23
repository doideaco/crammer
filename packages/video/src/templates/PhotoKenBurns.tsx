import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { KenBurnsDirection, PhotoKenBurnsProps } from "@crammer/schema";
import { theme } from "../theme";
import { Frame } from "../components/Frame";
import { fadeIn } from "../components/animate";
import { MissingImage } from "../components/MissingImage";

/** Start/end transform for each pan/zoom direction. Scale stays above 1 so the frame never gaps. */
function motionFor(direction: KenBurnsDirection, t: number) {
  const ease = (a: number, b: number) => a + (b - a) * t;
  switch (direction) {
    case "in":
      return { scale: ease(1.04, 1.18), x: 0, y: 0 };
    case "out":
      return { scale: ease(1.18, 1.04), x: 0, y: 0 };
    case "left":
      return { scale: 1.14, x: ease(2.2, -2.2), y: 0 };
    case "right":
      return { scale: 1.14, x: ease(-2.2, 2.2), y: 0 };
    case "up":
      return { scale: 1.14, x: 0, y: ease(2.2, -2.2) };
    case "down":
      return { scale: 1.14, x: 0, y: ease(-2.2, 2.2) };
  }
}

/** The workhorse template: one full-bleed photograph with a slow pan or zoom. */
export const PhotoKenBurns: React.FC<PhotoKenBurnsProps> = ({ image, direction, caption }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const asset = image.asset;

  const t = interpolate(frame, [0, Math.max(durationInFrames, 1)], [0, 1], {
    extrapolateRight: "clamp",
  });
  const { scale, x, y } = motionFor(direction, t);

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
              transform: `scale(${scale}) translate(${x}%, ${y}%)`,
              transformOrigin: "center",
            }}
          />
        ) : (
          <MissingImage alt={image.alt} />
        )}
      </AbsoluteFill>

      {caption ? (
        <>
          {/*
            Scrim so the caption clears contrast whatever the photo beneath is doing.
            Three stops rather than two: a pale subject (sunlit stone, sky, sand) needs
            real density directly behind the text, but a hard edge would read as a bar.
          */}
          <AbsoluteFill
            style={{
              background:
                `linear-gradient(to top, ${theme.color.scrimDeep} 0%, ` +
                `${theme.color.scrim} 22%, transparent 48%)`,
            }}
          />
          <div
            style={{
              position: "absolute",
              left: theme.layout.marginX,
              bottom: theme.layout.lowerThird,
              maxWidth: theme.layout.measure,
              opacity: fadeIn(frame, 8, 16),
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
                fontSize: theme.size.caption,
                fontWeight: theme.font.weight.medium,
                letterSpacing: theme.font.tracking.body,
                lineHeight: theme.lineHeight.snug,
                color: theme.color.onInk,
              }}
            >
              {caption}
            </div>
          </div>
        </>
      ) : null}
    </Frame>
  );
};
