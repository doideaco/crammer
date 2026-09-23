import { z } from "zod";
import { Level } from "@crammer/schema";

/**
 * What the prompt box accepts.
 *
 * The lower bound rejects "yemen" — a research run on a single word costs real money
 * and produces a vague video. The upper bound is generous; a long prompt is fine.
 */
export const TopicInput = z
  .string()
  .trim()
  .min(8, "Give a bit more detail — a few words at least.")
  .max(300, "That's too long. Try to state the subject in a sentence.");

export const CreateVideoInput = z.object({
  topic: TopicInput,
  level: Level.default("beginner"),
  parentVideoId: z.uuid().optional(),
});
export type CreateVideoInput = z.infer<typeof CreateVideoInput>;

export const EmailInput = z.email("That does not look like an email address.");

/** Turns a zod failure into the single sentence a form should show. */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "That input is not valid.";
}
