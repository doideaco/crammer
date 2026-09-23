import { existsSync } from "node:fs";
import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import type { z } from "zod";
import { MissingArtifactError, type ArtifactStore } from "./artifacts.js";

/**
 * Filesystem-backed artefacts, for the local worker.
 *
 * Everything for a video lives under `<root>/<videoId>/`, which mirrors the CLI's
 * `out/<slug>/` layout closely enough that a run can be inspected the same way.
 */
export class LocalArtifactStore implements ArtifactStore {
  constructor(
    private readonly root: string,
    /** Base URL the web app serves `<root>` from. */
    private readonly publicBaseUrl = "/media",
  ) {}

  /** Nothing to set up: directories are created as files are written. */
  async initialise(): Promise<void> {}

  private dir(videoId: string): string {
    return join(this.root, videoId);
  }

  private jsonPath(videoId: string, name: string): string {
    return join(this.dir(videoId), `${name}.json`);
  }

  async putJson(videoId: string, name: string, value: unknown): Promise<void> {
    const path = this.jsonPath(videoId, name);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
  }

  async getJson<T>(videoId: string, name: string, schema: z.ZodType<T>): Promise<T> {
    const path = this.jsonPath(videoId, name);
    if (!existsSync(path)) throw new MissingArtifactError(videoId, name);
    const parsed = schema.safeParse(JSON.parse(await readFile(path, "utf8")));
    if (!parsed.success) {
      throw new Error(
        `Artefact "${name}" for video ${videoId} does not match the current schema:\n` +
          parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n"),
      );
    }
    return parsed.data;
  }

  async has(videoId: string, name: string): Promise<boolean> {
    return existsSync(this.jsonPath(videoId, name));
  }

  async putAssets(videoId: string, localDir: string): Promise<number> {
    if (!existsSync(localDir)) return 0;
    const target = join(this.dir(videoId), "assets");
    await mkdir(target, { recursive: true });
    await cp(localDir, target, { recursive: true, force: true });
    return countFiles(await walk(target));
  }

  async fetchAssets(videoId: string, localDir: string): Promise<number> {
    const source = join(this.dir(videoId), "assets");
    if (!existsSync(source)) return 0;
    await mkdir(localDir, { recursive: true });
    await cp(source, localDir, { recursive: true, force: true });
    return countFiles(await walk(localDir));
  }

  async putOutput(
    videoId: string,
    name: string,
    body: Buffer,
    _contentType: string,
  ): Promise<string> {
    const path = join(this.dir(videoId), name);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
    return `${this.publicBaseUrl}/${videoId}/${name}`;
  }

  async getOutputText(videoId: string, name: string): Promise<string | undefined> {
    const path = join(this.dir(videoId), name);
    return existsSync(path) ? readFile(path, "utf8") : undefined;
  }

  /** Absolute path of a stored output, so the web app can stream it. */
  pathForOutput(videoId: string, name: string): string {
    return join(this.dir(videoId), name);
  }
}

async function walk(dir: string, base = dir): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full, base)));
    else out.push(relative(base, full));
  }
  return out;
}

const countFiles = (files: string[]) => files.length;

export { walk };
