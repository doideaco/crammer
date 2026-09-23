import { redirect } from "next/navigation";
import { ensureUser, getDatabase } from "@crammer/db";
import { createClient } from "./supabase/server";

export type SessionUser = { id: string; email: string };

/** The signed-in user, or null. */
export async function currentUser(): Promise<SessionUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;
  return { id: user.id, email: user.email };
}

/**
 * The signed-in user, or a redirect to the landing page.
 *
 * Also refreshes the profile row, so a user created directly in Supabase (or before
 * the auth trigger existed) still has somewhere for their videos to point.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect("/?signin=1");
  await ensureUser(getDatabase(), user);
  return user;
}
