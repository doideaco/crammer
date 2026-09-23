import { useMemo } from "react";
import { geoEqualEarth, geoMercator, geoPath, geoInterpolate } from "d3-geo";
import type { GeoProjection } from "d3-geo";
import type { ExtendedFeatureCollection } from "d3-geo";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { MapHighlightProps } from "@crammer/schema";
import { theme } from "../theme";
import { COUNTRIES, countriesByIso3 } from "../geo/world";
import { fadeIn, rise, stagger } from "./animate";

type Props = MapHighlightProps & { width: number; height: number };

/**
 * A d3-geo map rendered as SVG. Highlighted countries wash in on the accent colour,
 * pins drop in staggered, and an optional great-circle route draws itself.
 *
 * Everything is a pure function of `frame`, so the render stays deterministic.
 */
export const WorldMap: React.FC<Props> = ({
  scope,
  highlight,
  context,
  pins,
  route,
  width,
  height,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const highlightSet = useMemo(
    () => new Set(countriesByIso3(highlight).map((f) => String(f.id))),
    [highlight],
  );
  const contextSet = useMemo(
    () => new Set(countriesByIso3(context).map((f) => String(f.id))),
    [context],
  );

  const projection = useMemo<GeoProjection>(() => {
    const padding = theme.space(10);
    const extent: [[number, number], [number, number]] = [
      [padding, padding],
      [width - padding, height - padding],
    ];

    if (scope === "world") {
      return geoEqualEarth().fitExtent(extent, { type: "Sphere" });
    }

    // Fit to the highlighted countries plus any context countries and pins, so the
    // region fills the frame without the storyboard having to specify a viewport.
    const focus = countriesByIso3([...highlight, ...context]);
    const collection = {
      type: "FeatureCollection",
      features: [
        ...focus,
        ...pins.map((p) => ({
          type: "Feature" as const,
          properties: {},
          geometry: { type: "Point" as const, coordinates: [p.lon, p.lat] },
        })),
      ],
    } as unknown as ExtendedFeatureCollection;

    if (collection.features.length === 0) {
      return geoEqualEarth().fitExtent(extent, { type: "Sphere" });
    }
    return geoMercator().fitExtent(extent, collection);
  }, [scope, highlight, context, pins, width, height]);

  const path = useMemo(() => geoPath(projection), [projection]);

  const routePath = useMemo(() => {
    if (!route) return null;
    const along = geoInterpolate([route.from.lon, route.from.lat], [route.to.lon, route.to.lat]);
    const coordinates = Array.from({ length: 64 }, (_, i) => along(i / 63));
    return path({ type: "LineString", coordinates });
  }, [route, path]);

  const routeProgress = interpolate(frame, [18, 60], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  /**
   * Pins that sit close together would stack their labels on top of each other —
   * common around a strait, which is exactly where these maps get used. Walk them in
   * vertical order and nudge each label clear of the last one it would collide with.
   */
  const placed = useMemo(() => {
    const LABEL_HEIGHT = theme.space(4);
    const LABEL_WIDTH = theme.space(28);

    const points = pins
      .map((pin, index) => ({ pin, index, xy: projection([pin.lon, pin.lat]) }))
      .filter((p): p is { pin: (typeof pins)[number]; index: number; xy: [number, number] } =>
        p.xy !== null,
      )
      .sort((a, b) => a.xy[1] - b.xy[1]);

    const taken: { x: number; y: number }[] = [];
    return points.map(({ pin, index, xy }) => {
      const [x, y] = xy;
      let labelY = y;
      for (const other of taken) {
        const overlaps =
          Math.abs(labelY - other.y) < LABEL_HEIGHT && Math.abs(x - other.x) < LABEL_WIDTH;
        if (overlaps) labelY = other.y + LABEL_HEIGHT;
      }
      taken.push({ x, y: labelY });
      return { pin, index, x, y, labelY };
    });
  }, [pins, projection]);

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <rect width={width} height={height} fill={theme.color.mapWater} />

      {/* Base landmass */}
      <g>
        {COUNTRIES.features.map((f) => {
          const id = String(f.id);
          const isHighlight = highlightSet.has(id);
          const isContext = contextSet.has(id);
          const d = path(f);
          if (!d) return null;
          return (
            <path
              key={id}
              d={d}
              fill={isContext ? theme.color.mapContext : theme.color.mapLand}
              stroke={theme.color.mapLandStroke}
              strokeWidth={theme.stroke.hairline}
              opacity={isHighlight ? 0 : 1}
            />
          );
        })}
      </g>

      {/* Highlighted countries wash in on top, staggered in the order given */}
      <g>
        {highlight.map((iso3, i) => {
          const f = countriesByIso3([iso3])[0];
          if (!f) return null;
          const d = path(f);
          if (!d) return null;
          return (
            <path
              key={`hl-${iso3}`}
              d={d}
              fill={theme.color.mapHighlight}
              stroke={theme.color.mapHighlight}
              strokeWidth={theme.stroke.thin}
              opacity={fadeIn(frame, stagger(i, 8), 14)}
            />
          );
        })}
      </g>

      {/* Animated great-circle route */}
      {routePath ? (
        <g>
          <path
            d={routePath}
            fill="none"
            stroke={theme.color.ink}
            strokeWidth={theme.stroke.medium}
            strokeLinecap="round"
            strokeDasharray={4000}
            strokeDashoffset={4000 * (1 - routeProgress)}
            opacity={0.85}
          />
        </g>
      ) : null}

      {/* City pins */}
      <g>
        {placed.map(({ pin, index: i, x, y, labelY }) => {
          const grow = rise(frame, fps, stagger(i, 20));
          const r = theme.space(1) * grow;
          const nudged = labelY !== y;
          return (
            <g key={`${pin.label}-${i}`} opacity={fadeIn(frame, stagger(i, 20), 10)}>
              <circle cx={x} cy={y} r={r} fill={theme.color.ink} />
              <circle
                cx={x}
                cy={y}
                r={r + theme.space(1)}
                fill="none"
                stroke={theme.color.ink}
                strokeWidth={theme.stroke.hairline}
                opacity={0.4}
              />
              {/* A leader line when the label had to move off its pin */}
              {nudged ? (
                <line
                  x1={x}
                  y1={y}
                  x2={x + theme.space(1.5)}
                  y2={labelY}
                  stroke={theme.color.ink}
                  strokeWidth={theme.stroke.hairline}
                  opacity={0.5}
                />
              ) : null}
              <text
                x={x + theme.space(2)}
                y={labelY + theme.space(0.75)}
                fill={theme.color.ink}
                fontSize={theme.size.caption}
                fontWeight={theme.font.weight.semibold}
                letterSpacing={theme.font.tracking.body}
                // A paper-coloured halo keeps labels readable where pins cluster.
                stroke={theme.color.mapWater}
                strokeWidth={theme.space(0.75)}
                paintOrder="stroke"
                strokeLinejoin="round"
              >
                {pin.label}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
};
