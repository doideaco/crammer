import { join } from "node:path";
import type { ArtifactStore } from "./artifacts.js";
import { LocalArtifactStore } from "./artifacts-local.js";
import { SupabaseArtifactStore } from "./artifacts-supabase.js";

/** Where the local store keeps everything, when Supabase is not configured. */
export function localMediaRoot(): string {
  return process.env.CRAMMER_MEDIA_ROOT ?? join(process.cwd(), "out", "web");
}

/**
 * Supabase Storage when it is configured, the filesystem otherwise.
 *
 * The filesystem store is not a toy: the spec allows a local worker for M2, and a
 * single-machine deployment is a perfectly good way to run this.
 */
export function createArtifactStore(): ArtifactStore {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return new SupabaseArtifactStore();
  }
  return new LocalArtifactStore(localMediaRoot());
}

export { LocalArtifactStore, SupabaseArtifactStore };
