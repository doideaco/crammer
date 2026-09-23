import { z } from "zod";
import { Id } from "./common.js";

/** A reference gathered during research. Ships with the finished video. */
export const Source = z.object({
  id: Id,
  title: z.string().min(1),
  url: z.url(),
  publisher: z.string().min(1),
  /** ISO 8601 date, when the source states one. */
  publishedAt: z.string().optional(),
});
export type Source = z.infer<typeof Source>;

/**
 * A single checkable claim extracted from the sources. The script cites these by id,
 * which is what makes the fact-check stage possible.
 */
export const Fact = z.object({
  id: Id,
  claim: z.string().min(1),
  sourceIds: z.array(Id).min(1),
});
export type Fact = z.infer<typeof Fact>;

export const Research = z.object({
  topic: z.string().min(1),
  level: z.enum(["beginner", "intermediate"]),
  /** One paragraph orienting the script writer. Not shown to the viewer. */
  summary: z.string().min(1),
  sources: z.array(Source).min(1),
  facts: z.array(Fact).min(1),
});
export type Research = z.infer<typeof Research>;
