import type { z } from "zod";

/**
 * Where a run's intermediate state lives between stages.
 *
 * M1 kept everything in one directory because one process did the whole job. In M2
 * each stage is its own task and may run on a different machine, so the artefacts and
 * the binary assets have to live somewhere both can reach. This is that somewhere,
 * behind an interface so the local worker can use the filesystem and production can
 * use Supabase Storage.
 */
export interface ArtifactStore {
  /**
   * One-time setup — creating buckets, making directories.
   *
   * Called by whatever starts a worker. Safe to call repeatedly, so it does not need
   * to be tracked or guarded.
   */
  initialise(): Promise<void>;

  /** Saves a stage's JSON output. */
  putJson(videoId: string, name: string, value: unknown): Promise<void>;

  /** Reads a stage's JSON output, validated. Throws if it is missing or stale. */
  getJson<T>(videoId: string, name: string, schema: z.ZodType<T>): Promise<T>;

  has(videoId: string, name: string): Promise<boolean>;

  /**
   * Uploads everything under `localDir` as this video's assets (images and audio),
   * preserving relative paths. Existing objects with the same path are replaced.
   */
  putAssets(videoId: string, localDir: string): Promise<number>;

  /** Downloads all of this video's assets into `localDir`. */
  fetchAssets(videoId: string, localDir: string): Promise<number>;

  /** Publishes a finished deliverable and returns a URL the web app can serve. */
  putOutput(
    videoId: string,
    name: string,
    body: Buffer,
    contentType: string,
  ): Promise<string>;

  /** Reads a deliverable back as text. Returns undefined if it is not there. */
  getOutputText(videoId: string, name: string): Promise<string | undefined>;
}

/** Thrown when a stage's input artefact is not where it should be. */
export class MissingArtifactError extends Error {
  constructor(videoId: string, name: string) {
    super(
      `Artefact "${name}" for video ${videoId} is missing. The stage that produces it has not run, or its output was lost.`,
    );
    this.name = "MissingArtifactError";
  }
}
