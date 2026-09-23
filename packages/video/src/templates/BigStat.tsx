import { interpolate, useCurrentFrame } from "remotion";
import type { BigStatProps } from "@crammer/schema";
import { theme } from "../theme";
import { Frame, Rule, Safe } from "../components/Frame";
import { fadeIn } from "../components/animate";

/** Formats the counting value with thousands separators and fixed decimals. */
function format(value: number, decimals: number): string {
  return value.toLocaleString("en-GB", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** One large number counting up, for the single striking figure in a script. */
export const BigStat: React.FC<BigStatProps> = ({
  value,
  prefix,
  suffix,
  decimals,
  label,
  footnote,
}) => {
  const frame = useCurrentFrame();

  // Ease-out count so the number decelerates into its final value.
  const t = interpolate(frame, [6, 54], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const eased = 1 - Math.pow(1 - t, 3);
  const current = value * eased;

  return (
    <Frame surface="ink">
      <Safe style={{ justifyContent: "center", gap: theme.space(3) }}>
        <div style={{ opacity: fadeIn(frame, 0, 10) }}>
          <Rule />
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: theme.space(1),
            fontSize: theme.size.stat,
            fontWeight: theme.font.weight.bold,
            letterSpacing: theme.font.tracking.display,
            lineHeight: theme.lineHeight.tight,
            color: theme.color.onInk,
            fontVariantNumeric: "tabular-nums",
            opacity: fadeIn(frame, 2, 12),
          }}
        >
          {prefix ? <span style={{ color: theme.color.accent }}>{prefix}</span> : null}
          <span>{format(current, decimals)}</span>
          {suffix ? (
            <span style={{ fontSize: theme.size.title, color: theme.color.accent }}>{suffix}</span>
          ) : null}
        </div>

        <div
          style={{
            maxWidth: theme.layout.measure,
            fontSize: theme.size.heading,
            fontWeight: theme.font.weight.medium,
            letterSpacing: theme.font.tracking.heading,
            lineHeight: theme.lineHeight.snug,
            color: theme.color.onInk,
            opacity: fadeIn(frame, 18, 16),
          }}
        >
          {label}
        </div>

        {footnote ? (
          <div
            style={{
              marginTop: theme.space(2),
              fontSize: theme.size.caption,
              lineHeight: theme.lineHeight.normal,
              color: theme.color.onInkMuted,
              opacity: fadeIn(frame, 28, 16),
            }}
          >
            {footnote}
          </div>
        ) : null}
      </Safe>
    </Frame>
  );
};
