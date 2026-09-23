import { feature } from "topojson-client";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import type { Topology, GeometryCollection } from "topojson-specification";
import topology from "world-atlas/countries-110m.json";
import { iso3ToNumeric } from "./iso";

type CountryProps = { name: string };

const world = topology as unknown as Topology<{ countries: GeometryCollection<CountryProps> }>;

/** Natural Earth 1:110m country polygons, parsed once at module scope. */
export const COUNTRIES: FeatureCollection<Geometry, CountryProps> = feature(
  world,
  world.objects.countries,
) as FeatureCollection<Geometry, CountryProps>;

const BY_NUMERIC = new Map<string, Feature<Geometry, CountryProps>>(
  COUNTRIES.features.map((f) => [String(f.id).padStart(3, "0"), f]),
);

/** Looks a country polygon up by ISO 3166-1 alpha-3 code. */
export function countryByIso3(iso3: string): Feature<Geometry, CountryProps> | undefined {
  const numeric = iso3ToNumeric(iso3);
  return numeric ? BY_NUMERIC.get(numeric) : undefined;
}

/** Collects the polygons for a list of alpha-3 codes, skipping unknown ones. */
export function countriesByIso3(codes: readonly string[]): Feature<Geometry, CountryProps>[] {
  return codes
    .map(countryByIso3)
    .filter((f): f is Feature<Geometry, CountryProps> => f !== undefined);
}
