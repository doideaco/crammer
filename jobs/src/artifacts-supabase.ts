import { StorageClient } from "@supabase/storage-js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type { z } from "zod";
import { MissingArtifactError, type ArtifactStore } from "./artifacts.js";
import { walk } from "./artifacts-local.js";

/** Private bucket: intermediate artefacts and raw assets are not for the public. */
export const WORK_BUCKET = "crammer-work";
/** Public bucket: the finished video, transcript and sources. */
export const OUTPUT_BUCKET = "crammer-videos";

/**
 * Supabase Storage. Used when each stage may run on a different machine, which is the
 * whole reason the artefact store exists.
 *
 * Talks to `@supabase/storage-js` directly rather than going through the full
 * `supabase-js` client: a worker uploading files has no use for Auth or Realtime, and
 * the Realtime client drags in a websocket implementation that fails to construct at
 * all on Node 20.
 *
 * Uses the service role: these calls come from trusted workers, never the browser.
 */
export class SupabaseArtifactStore implements ArtifactStore {
  private readonly storage: StorageClient;

  constructor(options: { url?: string; serviceRoleKey?: string } = {}) {
    const url = options.url ?? process.env.SUPABASE_URL;
    const key = options.serviceRoleKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
    }
    this.publicBase = `${url.replace(/\/$/, "")}/storage/v1/object/public`;
    this.storage = new StorageClient(`${url.replace(/\/$/, "")}/storage/v1`, {
      apikey: key,
      Authorization: `Bearer ${key}`,
    });
  }

  private readonly publicBase: string;

  /** Creates the buckets if they are not there yet. Safe to call repeatedly. */
  async initialise(): Promise<void> {
    for (const [name, isPublic] of [
      [WORK_BUCKET, false],
      [OUTPUT_BUCKET, true],
    ] as const) {
      const { error } = await this.storage.createBucket(name, { public: isPublic });
      // Already existing is the normal case after the first run.
      if (error && !/already exists/i.test(error.message)) throw error;
    }
  }

  private jsonKey(videoId: string, name: string): string {
    return `${videoId}/${name}.json`;
  }

  async putJson(videoId: string, name: string, value: unknown): Promise<void> {
    const { error } = await this.storage
      .from(WORK_BUCKET)
      .upload(this.jsonKey(videoId, name), JSON.stringify(value), {
        contentType: "application/json",
        upsert: true,
      });
    if (error) throw error;
  }

  async getJson<T>(videoId: string, name: string, schema: z.ZodType<T>): Promise<T> {
    const { data, error } = await this.storage
      .from(WORK_BUCKET)
      .download(this.jsonKey(videoId, name));
    if (error || !data) throw new MissingArtifactError(videoId, name);

    const parsed = schema.safeParse(JSON.parse(await data.text()));
    if (!parsed.success) {
      throw new Error(
        `Artefact "${name}" for video ${videoId} does not match the current schema:\n` +
          parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n"),
      );
    }
    return parsed.data;
  }

  async has(videoId: string, name: string): Promise<boolean> {
    const { data } = await this.storage
      .from(WORK_BUCKET)
      .list(videoId, { search: `${name}.json` });
    return (data ?? []).some((entry) => entry.name === `${name}.json`);
  }

  async putAssets(videoId: string, localDir: string): Promise<number> {
    if (!existsSync(localDir)) return 0;
    const files = await walk(localDir);
    for (const relativePath of files) {
      const body = await readFile(join(localDir, relativePath));
      const { error } = await this.storage
        .from(WORK_BUCKET)
        .upload(`${videoId}/assets/${relativePath}`, body, { upsert: true });
      if (error) throw error;
    }
    return files.length;
  }

  async fetchAssets(videoId: string, localDir: string): Promise<number> {
    const keys = await this.listAssetKeys(`${videoId}/assets`);
    for (const key of keys) {
      const { data, error } = await this.storage.from(WORK_BUCKET).download(key);
      if (error || !data) throw error ?? new Error(`Could not download ${key}`);
      const target = join(localDir, key.slice(`${videoId}/assets/`.length));
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, Buffer.from(await data.arrayBuffer()));
    }
    return keys.length;
  }

  /** Storage has no recursive list, so walk the prefixes. */
  private async listAssetKeys(prefix: string): Promise<string[]> {
    const { data, error } = await this.storage.from(WORK_BUCKET).list(prefix, {
      limit: 1000,
    });
    if (error) throw error;

    const keys: string[] = [];
    for (const entry of (data ?? []) as { id: string | null; name: string }[]) {
      // Storage marks directories by having no id.
      if (entry.id === null) keys.push(...(await this.listAssetKeys(`${prefix}/${entry.name}`)));
      else keys.push(`${prefix}/${entry.name}`);
    }
    return keys;
  }

  async putOutput(
    videoId: string,
    name: string,
    body: Buffer,
    contentType: string,
  ): Promise<string> {
    const key = `${videoId}/${name}`;
    const { error } = await this.storage
      .from(OUTPUT_BUCKET)
      .upload(key, body, { contentType, upsert: true });
    if (error) throw error;

    return `${this.publicBase}/${OUTPUT_BUCKET}/${key}`;
  }

  async getOutputText(videoId: string, name: string): Promise<string | undefined> {
    const { data, error } = await this.storage
      .from(OUTPUT_BUCKET)
      .download(`${videoId}/${name}`);
    if (error || !data) return undefined;
    return data.text();
  }
}
