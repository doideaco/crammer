#!/usr/bin/env node
import { config as loadEnv } from "dotenv";
import { Command, InvalidArgumentError } from "commander";
import { STAGES, type Level, type Stage } from "@crammer/schema";
import { ProviderConfigError, RefusedError, StructuredOutputError } from "@crammer/providers";
import { FactCheckFailedError } from "@crammer/pipeline";
import { join } from "node:path";
import { run } from "./run.js";
import { fail } from "./logger.js";
import { workspaceRoot } from "./paths.js";

loadEnv({ path: join(workspaceRoot(), ".env"), quiet: true });

function parseStage(value: string): Stage {
  if (!(STAGES as readonly string[]).includes(value)) {
    throw new InvalidArgumentError(`Unknown stage. Choose one of: ${STAGES.join(", ")}`);
  }
  return value as Stage;
}

function parseLevel(value: string): Level {
  if (value !== "beginner" && value !== "intermediate") {
    throw new InvalidArgumentError("Level must be 'beginner' or 'intermediate'.");
  }
  return value;
}

function parseNumber(name: string, min: number, max: number) {
  return (value: string): number => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
      throw new InvalidArgumentError(`${name} must be between ${min} and ${max}.`);
    }
    return parsed;
  };
}

const program = new Command();

program
  .name("crammer")
  .description("Turn a prompt into a ~5 minute narrated explainer video.")
  .argument("<topic>", 'the subject, e.g. "The Houthis and the war in Yemen"')
  .option("-l, --level <level>", "beginner | intermediate", parseLevel, "beginner")
  .option("--from <stage>", `resume from a saved stage (${STAGES.join(", ")})`, parseStage, "research")
  .option("--stop-after <stage>", "halt after this stage for inspection", parseStage, "render")
  .option("-o, --out <dir>", "output root (default: <repo>/out)")
  .option("--no-captions", "render without burn-in subtitles")
  .option("--mock", "use mock providers: no network, no cost", false)
  .option("--scale <factor>", "render at a fraction of full size", parseNumber("scale", 0.1, 1))
  .option("--crf <n>", "H.264 quality, lower is better (default 21)", parseNumber("crf", 1, 51))
  .option(
    "--concurrency <n>",
    "parallel render workers",
    parseNumber("concurrency", 1, 32),
  )
  .option("-q, --quiet", "only print the final result", false)
  .showHelpAfterError()
  .action(async (topic: string, options) => {
    await run({
      topic,
      level: options.level,
      from: options.from,
      stopAfter: options.stopAfter,
      out: options.out,
      captions: options.captions,
      mock: options.mock || process.env.CRAMMER_MOCK === "1",
      scale: options.scale,
      crf: options.crf,
      concurrency: options.concurrency,
      quiet: options.quiet,
    });
  });

try {
  await program.parseAsync(process.argv);
} catch (error) {
  process.stdout.write(`\n${fail(messageFor(error))}\n`);
  process.exitCode = 1;
}

/** Turns the errors the pipeline raises into something worth reading in a terminal. */
function messageFor(error: unknown): string {
  if (error instanceof RefusedError) return error.message;

  if (error instanceof ProviderConfigError) {
    return `${error.message}\n\nSee .env.example for the full list.`;
  }

  if (error instanceof FactCheckFailedError) {
    return `${error.message}\n\nThe research and script are saved in the run directory; inspect factcheck.json and re-run with --from script.`;
  }

  if (error instanceof StructuredOutputError) {
    return `The model did not return valid output after ${error.attempts} attempts.\n${error.message}`;
  }

  return error instanceof Error ? (error.stack ?? error.message) : String(error);
}
