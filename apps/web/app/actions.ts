"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createVideo, getDatabase, GlobalLimitError, RateLimitError } from "@crammer/db";
import { createJobQueue } from "@crammer/jobs";
import { createClient } from "@/lib/supabase/server";
import { currentUser } from "@/lib/auth";
import { CreateVideoInput, EmailInput, firstIssue } from "@/lib/validation";
import { PENDING_COOKIE, PENDING_MAX_AGE_SECONDS } from "@/lib/pending";
import { siteUrl } from "@/lib/site";

export type FormState = { error?: string; notice?: string };

/**
 * Starts a video, or sends a magic link if nobody is signed in.
 *
 * One action for both because it is one intention: the person typed a topic and
 * pressed the button, and whether they happen to have a session is our problem.
 */
export async function createVideoAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = CreateVideoInput.safeParse({
    topic: formData.get("topic"),
    level: formData.get("level") ?? "beginner",
    parentVideoId: formData.get("parentVideoId") || undefined,
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const user = await currentUser();

  if (!user) {
    const email = EmailInput.safeParse(formData.get("email"));
    if (!email.success) return { error: firstIssue(email.error) };

    // Keep the topic so it is waiting for them when they come back.
    const store = await cookies();
    store.set(PENDING_COOKIE, JSON.stringify({ topic: parsed.data.topic, level: parsed.data.level }), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: PENDING_MAX_AGE_SECONDS,
    });

    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.data,
      options: { emailRedirectTo: `${siteUrl()}/auth/callback` },
    });
    if (error) return { error: error.message };

    return { notice: `Check ${email.data} for a link. Your topic is saved.` };
  }

  let videoId: string;
  try {
    const video = await createVideo(getDatabase(), { userId: user.id, ...parsed.data });
    videoId = video.id;
  } catch (error) {
    if (error instanceof RateLimitError || error instanceof GlobalLimitError) {
      return { error: error.message };
    }
    throw error;
  }

  await createJobQueue().enqueue({ id: videoId });
  revalidatePath("/videos");
  redirect(`/videos/${videoId}`);
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
