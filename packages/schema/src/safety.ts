import { z } from "zod";

/**
 * Gate applied before any research happens. Crammer refuses topics that can only be
 * explained by supplying harmful instructional content — weapon-making, self-harm
 * methods, and so on. Explaining that such things exist, and their history and
 * consequences, is fine; the test is whether a faithful explainer would have to teach
 * someone how.
 */
export const TopicAssessment = z.object({
  allowed: z.boolean(),
  /** Shown to the user when `allowed` is false. Plain, non-preachy, one or two lines. */
  reason: z.string(),
  /** True when the topic is politically contested and needs balanced treatment. */
  contested: z.boolean().default(false),
  /** Perspectives the script must represent, when contested. */
  perspectives: z.array(z.string()).default([]),
  /** A neighbouring topic Crammer could cover instead, when refusing. */
  suggestedAlternative: z.string().nullable().default(null),
});
export type TopicAssessment = z.infer<typeof TopicAssessment>;
