import { describe, expect, it } from "vitest";
import {
  TEMPLATE_NAMES,
  TEMPLATE_PROPS,
  TEMPLATE_DESCRIPTIONS,
  templatePropsSchema,
  BigStatProps,
  KeyPointsProps,
  MapHighlightProps,
  PhotoKenBurnsProps,
  PhotoWithLabelsProps,
  TimelineProps,
  TitleCardProps,
  WhosWhoProps,
} from "../templates.js";

describe("template registry", () => {
  it("has a props schema for every template name", () => {
    for (const name of TEMPLATE_NAMES) {
      expect(templatePropsSchema(name)).toBe(TEMPLATE_PROPS[name]);
    }
  });

  it("describes every template the model may choose", () => {
    for (const name of TEMPLATE_NAMES) {
      if (name === "EndCard") continue;
      expect(TEMPLATE_DESCRIPTIONS[name as keyof typeof TEMPLATE_DESCRIPTIONS]).toBeTruthy();
    }
  });

  it("does not offer EndCard to the model", () => {
    expect("EndCard" in TEMPLATE_DESCRIPTIONS).toBe(false);
  });
});

describe("TitleCardProps", () => {
  it("accepts a title alone", () => {
    expect(TitleCardProps.parse({ title: "Yemen" }).title).toBe("Yemen");
  });
  it("rejects an empty title", () => {
    expect(TitleCardProps.safeParse({ title: "" }).success).toBe(false);
  });
});

const slot = { queries: ["port of Hodeidah"], alt: "A busy container port" };

describe("PhotoKenBurnsProps", () => {
  it("defaults direction to in", () => {
    expect(PhotoKenBurnsProps.parse({ image: slot }).direction).toBe("in");
  });
  it("rejects an unknown direction", () => {
    expect(PhotoKenBurnsProps.safeParse({ image: slot, direction: "spin" }).success).toBe(false);
  });
  it("rejects more than three search queries", () => {
    expect(
      PhotoKenBurnsProps.safeParse({ image: { ...slot, queries: ["a", "b", "c", "d"] } }).success,
    ).toBe(false);
  });
});

describe("PhotoWithLabelsProps", () => {
  it("accepts up to three labels in the unit square", () => {
    const parsed = PhotoWithLabelsProps.parse({
      image: slot,
      labels: [{ text: "Crane", x: 0.2, y: 0.3 }],
    });
    expect(parsed.labels[0]!.side).toBe("right");
  });
  it("rejects out-of-frame coordinates", () => {
    expect(
      PhotoWithLabelsProps.safeParse({ image: slot, labels: [{ text: "x", x: 1.4, y: 0 }] })
        .success,
    ).toBe(false);
  });
  it("rejects four labels", () => {
    const labels = [0, 1, 2, 3].map((i) => ({ text: `l${i}`, x: 0.5, y: 0.5 }));
    expect(PhotoWithLabelsProps.safeParse({ image: slot, labels }).success).toBe(false);
  });
});

describe("MapHighlightProps", () => {
  it("defaults to an empty region map", () => {
    const parsed = MapHighlightProps.parse({});
    expect(parsed).toMatchObject({ scope: "region", highlight: [], pins: [] });
  });
  it("requires alpha-3 country codes", () => {
    expect(MapHighlightProps.safeParse({ highlight: ["YE"] }).success).toBe(false);
    expect(MapHighlightProps.safeParse({ highlight: ["YEM"] }).success).toBe(true);
  });
  it("rejects an impossible latitude", () => {
    expect(
      MapHighlightProps.safeParse({ pins: [{ label: "Aden", lat: 120, lon: 45 }] }).success,
    ).toBe(false);
  });
});

describe("WhosWhoProps", () => {
  const actor = (n: number) => ({ name: `Actor ${n}`, role: "Does a thing" });
  it("defaults the icon", () => {
    expect(WhosWhoProps.parse({ actors: [actor(1), actor(2)] }).actors[0]!.icon).toBe("UserCircle");
  });
  it("needs at least two and at most four actors", () => {
    expect(WhosWhoProps.safeParse({ actors: [actor(1)] }).success).toBe(false);
    expect(WhosWhoProps.safeParse({ actors: [1, 2, 3, 4, 5].map(actor) }).success).toBe(false);
  });
});

describe("TimelineProps", () => {
  const events = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ date: `201${i}`, label: `Event ${i}` }));
  it("needs three to six events", () => {
    expect(TimelineProps.safeParse({ events: events(2) }).success).toBe(false);
    expect(TimelineProps.safeParse({ events: events(3) }).success).toBe(true);
    expect(TimelineProps.safeParse({ events: events(7) }).success).toBe(false);
  });
});

describe("BigStatProps", () => {
  it("defaults decimals to zero", () => {
    expect(BigStatProps.parse({ value: 21_600_000, label: "people need aid" }).decimals).toBe(0);
  });
  it("rejects a missing label", () => {
    expect(BigStatProps.safeParse({ value: 1 }).success).toBe(false);
  });
});

describe("KeyPointsProps", () => {
  it("defaults the heading", () => {
    expect(KeyPointsProps.parse({ points: ["One"] }).heading).toBe("The short version");
  });
  it("rejects four points", () => {
    expect(KeyPointsProps.safeParse({ points: ["a", "b", "c", "d"] }).success).toBe(false);
  });
});
