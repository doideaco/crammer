import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Walks up to the workspace root, so the worker runs from anywhere. */
export function workspaceRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    dir = dirname(dir);
  }
  return process.cwd();
}

/** The Remotion entry point the render stage bundles. */
export function videoEntryPoint(): string {
  return join(workspaceRoot(), "packages", "video", "src", "index.ts");
}
