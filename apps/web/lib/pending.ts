import { z } from "zod";
import { Level } from "@crammer/schema";

/**
 * A topic typed before signing in.
 *
 * Asking someone to retype their prompt after clicking a magic link is a bad first
 * impression, so it rides along in a short-lived cookie and the video is created the
 * moment they land back.
 */
export const PendingRequest = z.object({ topic: z.string(), level: Level });
export type PendingRequest = z.infer<typeof PendingRequest>;

export const PENDING_COOKIE = "crammer_pending";
/** Long enough to find the email, short enough not to linger. */
export const PENDING_MAX_AGE_SECONDS = 60 * 30;
