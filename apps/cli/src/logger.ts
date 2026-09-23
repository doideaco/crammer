import pc from "picocolors";
import type { Logger } from "@crammer/pipeline";

/** Terminal logger. Stages get `step` for progress and `info` for results. */
export function createLogger(options: { quiet?: boolean } = {}): Logger {
  const write = (line: string) => {
    if (!options.quiet) process.stdout.write(`${line}\n`);
  };
  return {
    step: (message) => write(pc.dim(`  ${message}`)),
    info: (message) => write(`  ${message}`),
    warn: (message) => write(pc.yellow(`  ! ${message}`)),
  };
}

export const banner = (text: string): string => `\n${pc.bold(pc.cyan(text))}`;
export const ok = (text: string): string => pc.green(`✓ ${text}`);
export const fail = (text: string): string => pc.red(`✗ ${text}`);
