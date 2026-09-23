import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

/**
 * Walks up from this file to the workspace root, so the CLI works whether it is run
 * from the repo root, from `apps/cli`, or through `pnpm crammer`.
 */
export function workspaceRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    dir = dirname(dir);
  }
  // Fall back to the current working directory rather than guessing wrongly.
  return process.cwd();
}

/** Entry point Remotion bundles. */
export function videoEntryPoint(): string {
  return join(workspaceRoot(), "packages", "video", "src", "index.ts");
}

export function outputRoot(override?: string): string {
  return override ? resolve(override) : join(workspaceRoot(), "out");
}

/** Cache root for processed images and narration clips, shared across runs. */
export function cacheRoot(override?: string): string {
  return join(outputRoot(override), ".cache");
}
