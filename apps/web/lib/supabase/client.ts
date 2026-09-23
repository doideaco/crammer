import { createBrowserClient } from "@supabase/ssr";

/** Supabase client for the browser. Anon key only, so RLS applies. */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
