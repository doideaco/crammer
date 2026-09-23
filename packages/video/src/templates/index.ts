import type { TemplateName, TemplatePropsMap } from "@crammer/schema";
import { TitleCard } from "./TitleCard";
import { PhotoKenBurns } from "./PhotoKenBurns";
import { PhotoWithLabels } from "./PhotoWithLabels";
import { MapHighlight } from "./MapHighlight";
import { WhosWho } from "./WhosWho";
import { Timeline } from "./Timeline";
import { BigStat } from "./BigStat";
import { KeyPoints } from "./KeyPoints";
import { EndCard } from "./EndCard";

/**
 * Every scene template, keyed by the name used in the storyboard's discriminated union.
 * Adding a template means adding it here, to the schema, and to the fixtures.
 */
export const TEMPLATES: {
  [N in TemplateName]: React.FC<TemplatePropsMap[N]>;
} = {
  TitleCard,
  PhotoKenBurns,
  PhotoWithLabels,
  MapHighlight,
  WhosWho,
  Timeline,
  BigStat,
  KeyPoints,
  EndCard,
};

export {
  TitleCard,
  PhotoKenBurns,
  PhotoWithLabels,
  MapHighlight,
  WhosWho,
  Timeline,
  BigStat,
  KeyPoints,
  EndCard,
};
