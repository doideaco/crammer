import { z } from "zod";

/** Licences we are willing to ship. Anything else is rejected in stage 5. */
export const PERMISSIVE_LICENCES = [
  "cc0",
  "public-domain",
  "cc-by",
  "cc-by-sa",
  "unsplash",
  "pexels",
] as const;

export const Licence = z.enum(PERMISSIVE_LICENCES);
export type Licence = z.infer<typeof Licence>;

export const ImageProvider = z.enum(["wikimedia", "unsplash", "pexels"]);
export type ImageProvider = z.infer<typeof ImageProvider>;

/**
 * A downloaded, processed, licence-cleared image.
 *
 * `localPath` is relative to the run's asset root (the Remotion `publicDir`), e.g.
 * `images/7f3a91c2.jpg` — never an absolute path, so storyboards stay portable.
 */
export const ImageAsset = z.object({
  localPath: z.string().min(1),
  sourceUrl: z.url(),
  /** Page a human should visit for provenance (Commons file page, Unsplash photo page). */
  pageUrl: z.url().optional(),
  author: z.string().min(1),
  licence: Licence,
  licenceUrl: z.url().optional(),
  /** Ready-to-render credit line for the end card and sources.md. */
  attribution: z.string().min(1),
  provider: ImageProvider,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  /** sha256 of the original bytes; doubles as the cache key. */
  contentHash: z.string().min(8),
});
export type ImageAsset = z.infer<typeof ImageAsset>;

/**
 * A slot the storyboard stage writes and the images stage fills.
 * Queries are ordered most specific first.
 */
export const ImageSlot = z.object({
  queries: z.array(z.string().min(1)).min(1).max(3),
  /** What the image should show, in the narrator's terms. Used by the vision check. */
  alt: z.string().min(1),
  asset: ImageAsset.optional(),
});
export type ImageSlot = z.infer<typeof ImageSlot>;

/** An unverified search hit, before licence filtering and the vision check. */
export const ImageCandidate = z.object({
  provider: ImageProvider,
  /** Direct URL to the full-size bytes. */
  url: z.url(),
  pageUrl: z.url().optional(),
  title: z.string(),
  author: z.string(),
  licence: Licence.nullable(),
  licenceUrl: z.url().optional(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export type ImageCandidate = z.infer<typeof ImageCandidate>;

/** Verdict from the Claude vision check in stage 5. */
export const ImageVerdict = z.object({
  relevance: z.number().min(0).max(1),
  /** True if the image shows casualties, injury, or other distressing content. */
  graphic: z.boolean(),
  /** True if a recognisable real person is the subject. */
  depictsRealPerson: z.boolean(),
  reason: z.string(),
});
export type ImageVerdict = z.infer<typeof ImageVerdict>;
