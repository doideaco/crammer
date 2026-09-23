import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { z } from "zod";
import { STAGES, type Stage } from "@crammer/schema";

/**
 * Every stage writes its output to `out/<slug>/<stage>.json`, which is what makes
 * `--from` and `--stop-after` work and what makes a bad run inspectable rather than
 * just failed.
 */
export class RunDirectory {
  constructor(readonly dir: string) {}

  static async open(root: string, slug: string): Promise<RunDirectory> {
    const dir = join(root, slug);
    await mkdir(dir, { recursive: true });
    await mkdir(join(dir, "assets"), { recursive: true });
    return new RunDirectory(dir);
  }

  /** Where images and audio live; also Remotion's `publicDir` for this run. */
  get assetDir(): string {
    return join(this.dir, "assets");
  }

  pathFor(name: string): string {
    return join(this.dir, name);
  }

  has(stage: Stage): boolean {
    return existsSync(this.pathFor(`${stage}.json`));
  }

  async write(stage: Stage, value: unknown): Promise<void> {
    await writeFile(this.pathFor(`${stage}.json`), `${JSON.stringify(value, null, 2)}\n`);
  }

  /** Reads and validates a saved stage output, so a stale file fails loudly. */
  async read<T>(stage: Stage, schema: z.ZodType<T>): Promise<T> {
    const file = this.pathFor(`${stage}.json`);
    if (!existsSync(file)) {
      throw new Error(
        `Cannot resume: ${file} does not exist. Run the earlier stages first, or drop --from.`,
      );
    }
    const raw = JSON.parse(await readFile(file, "utf8"));
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(
        `${file} does not match the current schema. Delete it and re-run that stage.\n` +
          parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n"),
      );
    }
    return parsed.data;
  }

  /**
   * The fully-resolved storyboard that produced the video.
   *
   * Kept separate from `storyboard.json` so the stage artefacts stay immutable: a
   * stage's file is what that stage produced, and re-running from it gives the same
   * result every time.
   */
  async writeFinal(storyboard: unknown): Promise<void> {
    await writeFile(this.pathFor("final.json"), `${JSON.stringify(storyboard, null, 2)}\n`);
  }

  async writeText(name: string, contents: string): Promise<void> {
    await writeFile(this.pathFor(name), contents);
  }
}

/** Stages at or after `stage`, in execution order. */
export function stagesFrom(stage: Stage): Stage[] {
  return STAGES.slice(STAGES.indexOf(stage));
}

export function isBefore(a: Stage, b: Stage): boolean {
  return STAGES.indexOf(a) < STAGES.indexOf(b);
}
