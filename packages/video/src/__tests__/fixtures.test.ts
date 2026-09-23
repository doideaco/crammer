import { describe, expect, it } from "vitest";
import {
  FPS,
  Scene,
  Storyboard,
  TEMPLATE_NAMES,
  storyboardDuration,
  ICON_NAMES,
} from "@crammer/schema";
import { FIXTURE_SCENES } from "../fixtures/scenes";
import { DEMO_STORYBOARD, singleSceneStoryboard } from "../fixtures/storyboard";
import { TEMPLATES } from "../templates";
import { ICONS } from "../components/Icon";
import { countriesByIso3, countryByIso3 } from "../geo/world";
import { theme } from "../theme";

describe("template registry", () => {
  it("has a component for every template name", () => {
    for (const name of TEMPLATE_NAMES) {
      expect(TEMPLATES[name], `missing component for ${name}`).toBeTypeOf("function");
    }
  });

  it("has no components that are not registered template names", () => {
    expect(Object.keys(TEMPLATES).sort()).toEqual([...TEMPLATE_NAMES].sort());
  });
});

describe("Studio fixtures", () => {
  it("has a fixture for every template, so each is previewable", () => {
    for (const name of TEMPLATE_NAMES) {
      expect(FIXTURE_SCENES[name], `missing fixture for ${name}`).toBeDefined();
    }
  });

  it("every fixture scene satisfies the real Scene schema", () => {
    for (const [name, scene] of Object.entries(FIXTURE_SCENES)) {
      const result = Scene.safeParse(scene);
      expect(result.success, `${name}: ${JSON.stringify(result.error?.issues)}`).toBe(true);
    }
  });

  it("builds a valid single-scene storyboard for every template", () => {
    for (const name of TEMPLATE_NAMES) {
      const storyboard = singleSceneStoryboard(name);
      expect(Storyboard.safeParse(storyboard).success).toBe(true);
      expect(storyboardDuration(storyboard)).toBeGreaterThan(FPS);
    }
  });
});

describe("demo storyboard", () => {
  it("parses and covers every template", () => {
    expect(Storyboard.safeParse(DEMO_STORYBOARD).success).toBe(true);
    const used = new Set(DEMO_STORYBOARD.scenes.map((s) => s.template));
    expect(used.size).toBe(TEMPLATE_NAMES.length);
  });

  it("opens on a title card and closes on the end card", () => {
    expect(DEMO_STORYBOARD.scenes[0]!.template).toBe("TitleCard");
    expect(DEMO_STORYBOARD.scenes.at(-1)!.template).toBe("EndCard");
  });

  it("puts its image credits on the end card", () => {
    const endCard = DEMO_STORYBOARD.scenes.at(-1)!;
    if (endCard.template !== "EndCard") throw new Error("expected an end card");
    expect(endCard.props.credits).toEqual(DEMO_STORYBOARD.credits);
    expect(DEMO_STORYBOARD.credits.length).toBeGreaterThan(0);
  });
});

describe("icons", () => {
  it("implements exactly the icon names the schema offers", () => {
    expect(Object.keys(ICONS).sort()).toEqual([...ICON_NAMES].sort());
  });
});

describe("geo", () => {
  it("resolves alpha-3 codes to Natural Earth polygons", () => {
    expect(countryByIso3("YEM")?.properties.name).toBe("Yemen");
    expect(countryByIso3("SAU")?.properties.name).toBe("Saudi Arabia");
  });

  it("is case-insensitive", () => {
    expect(countryByIso3("yem")?.id).toBe(countryByIso3("YEM")?.id);
  });

  it("skips codes with no polygon rather than throwing", () => {
    expect(countryByIso3("ZZZ")).toBeUndefined();
    expect(countriesByIso3(["YEM", "ZZZ", "OMN"])).toHaveLength(2);
  });

  it("resolves every country the demo map fixture names", () => {
    const map = FIXTURE_SCENES.MapHighlight!;
    if (map.template !== "MapHighlight") throw new Error("expected a map");
    const codes = [...map.props.highlight, ...map.props.context];
    expect(countriesByIso3(codes)).toHaveLength(codes.length);
  });
});

describe("theme", () => {
  it("lays out on an 8px grid", () => {
    expect(theme.space(3)).toBe(24);
    expect(theme.space(0.5)).toBe(4);
  });

  it("keeps lower-third captions clear of the subtitle band", () => {
    // Subtitles sit at space(7) from the bottom and are roughly one line tall.
    expect(theme.layout.lowerThird).toBeGreaterThan(theme.space(7) + theme.size.caption * 2);
  });
});
