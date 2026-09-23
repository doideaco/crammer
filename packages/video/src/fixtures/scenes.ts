import type { Scene } from "@crammer/schema";
import { FPS } from "@crammer/schema";
import { fixtureSlot } from "./assets";

const seconds = (n: number) => Math.round(n * FPS);

/**
 * One representative scene per template. These drive the per-template Studio
 * compositions, so every template is previewable without running the pipeline.
 */
export const FIXTURE_SCENES: Record<string, Scene> = {
  TitleCard: {
    id: "fx-title",
    narration: "The Houthis and the war in Yemen.",
    sentenceIds: [],
    durationInFrames: seconds(6),
    template: "TitleCard",
    props: {
      kicker: "Explainer",
      title: "The Houthis and the war in Yemen",
      subtitle: "How a local uprising became a regional confrontation — and why it reaches shipping lanes.",
    },
  },

  PhotoKenBurns: {
    id: "fx-kenburns",
    narration: "Yemen sits at one of the busiest maritime chokepoints in the world.",
    sentenceIds: [],
    durationInFrames: seconds(8),
    template: "PhotoKenBurns",
    props: {
      image: fixtureSlot("fixture-port", "fixture-port-0001", "A container port at dusk"),
      direction: "in",
      caption: "The Red Sea carries roughly 12% of global trade.",
    },
  },

  PhotoWithLabels: {
    id: "fx-labels",
    narration: "Container ships pass within sight of the Yemeni coast.",
    sentenceIds: [],
    durationInFrames: seconds(9),
    template: "PhotoWithLabels",
    props: {
      image: fixtureSlot("fixture-ship", "fixture-ship-0001", "A container ship at sea"),
      labels: [
        { text: "Container stacks", x: 0.28, y: 0.38, side: "right" },
        { text: "Bridge", x: 0.68, y: 0.3, side: "left" },
        { text: "Waterline", x: 0.48, y: 0.72, side: "right" },
      ],
    },
  },

  MapHighlight: {
    id: "fx-map",
    narration: "Yemen borders Saudi Arabia and Oman, and faces the Horn of Africa.",
    sentenceIds: [],
    durationInFrames: seconds(10),
    template: "MapHighlight",
    props: {
      scope: "region",
      highlight: ["YEM"],
      context: ["SAU", "OMN", "ERI", "DJI", "SOM", "ETH", "EGY"],
      pins: [
        { label: "Sana'a", lat: 15.3694, lon: 44.191 },
        { label: "Aden", lat: 12.7855, lon: 45.0187 },
        { label: "Hodeidah", lat: 14.7978, lon: 42.9545 },
      ],
      route: {
        from: { lat: 12.5, lon: 43.4 },
        to: { lat: 29.9, lon: 32.55 },
        label: "Bab al-Mandab to Suez",
      },
      caption: "The Bab al-Mandab strait is 30km wide at its narrowest.",
    },
  },

  WhosWho: {
    id: "fx-whoswho",
    narration: "Three groups matter most here.",
    sentenceIds: [],
    durationInFrames: seconds(11),
    template: "WhosWho",
    props: {
      heading: "Who's involved",
      actors: [
        {
          name: "Ansar Allah",
          role: "The Houthi movement, which controls the north-west, including the capital.",
          image: fixtureSlot("fixture-portrait-a", "fixture-pa-0001", "A public rally"),
          icon: "Flag",
        },
        {
          name: "The recognised government",
          role: "Internationally recognised, based in Aden since 2015.",
          image: fixtureSlot("fixture-portrait-b", "fixture-pb-0001", "A government building"),
          icon: "Bank",
        },
        {
          name: "The Saudi-led coalition",
          role: "Intervened in 2015 in support of the recognised government.",
          icon: "ShieldCheck",
        },
      ],
    },
  },

  Timeline: {
    id: "fx-timeline",
    narration: "The war has moved through several distinct phases.",
    sentenceIds: [],
    durationInFrames: seconds(12),
    template: "Timeline",
    props: {
      heading: "How it unfolded",
      events: [
        { date: "2011", label: "Protests force a change of president." },
        { date: "2014", label: "Houthi forces take Sana'a." },
        { date: "2015", label: "A Saudi-led coalition intervenes." },
        { date: "2018", label: "The Stockholm Agreement on Hodeidah." },
        { date: "2022", label: "A UN-brokered truce holds for six months." },
        { date: "2023", label: "Attacks on Red Sea shipping begin." },
      ],
    },
  },

  BigStat: {
    id: "fx-stat",
    narration: "The humanitarian scale is hard to overstate.",
    sentenceIds: [],
    durationInFrames: seconds(7),
    template: "BigStat",
    props: {
      value: 21.6,
      decimals: 1,
      suffix: "m",
      label: "people in Yemen needed humanitarian assistance in 2024",
      footnote: "Figure: UN OCHA. Estimates vary between agencies.",
    },
  },

  KeyPoints: {
    id: "fx-keypoints",
    narration: "So, three things to take away.",
    sentenceIds: [],
    durationInFrames: seconds(10),
    template: "KeyPoints",
    props: {
      heading: "The short version",
      points: [
        "A domestic power struggle became a regional conflict.",
        "The humanitarian crisis is driven as much by economics as by fighting.",
        "Red Sea shipping links it to the wider global economy.",
      ],
    },
  },

  EndCard: {
    id: "fx-endcard",
    narration: "",
    sentenceIds: [],
    durationInFrames: seconds(8),
    template: "EndCard",
    props: {
      title: "Credits",
      sources: [
        {
          id: "s1",
          title: "Yemen situation report",
          url: "https://www.unocha.org/yemen",
          publisher: "UN OCHA",
          publishedAt: "2024-03-01",
        },
        {
          id: "s2",
          title: "Yemen country profile",
          url: "https://www.bbc.co.uk/news/world-middle-east-14704852",
          publisher: "BBC News",
        },
        {
          id: "s3",
          title: "Red Sea shipping and the Bab al-Mandab",
          url: "https://www.imf.org/en/Publications",
          publisher: "IMF",
        },
      ],
      credits: [],
    },
  },
};
