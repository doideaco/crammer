import { z } from "zod";
import {
  FactCheckResult,
  Research,
  Script,
  Storyboard,
  TopicAssessment,
  type FactCheckReport,
  type Level,
  type Stage,
} from "@crammer/schema";
import {
  CostTracker,
  MockImageFetcher,
  MockTts,
  createProviders,
  configuredModel,
  MockImageSearch,
} from "@crammer/providers";
import {
  costTable,
  runFactCheck,
  runImages,
  runRender,
  runResearch,
  runScript,
  runStage,
  runStoryboard,
  runVoice,
  testing,
  writeRunOutputs,
  type PipelineContext,
} from "@crammer/pipeline";
import { RunDirectory, isBefore } from "./artifacts.js";
import { cacheRoot, outputRoot, videoEntryPoint } from "./paths.js";
import { banner, createLogger, ok } from "./logger.js";
import { slugify } from "./slug.js";

const ResearchArtifact = z.object({ research: Research, assessment: TopicAssessment });

export type RunOptions = {
  topic: string;
  level: Level;
  from: Stage;
  stopAfter: Stage;
  out?: string;
  captions: boolean;
  mock: boolean;
  crf?: number;
  scale?: number;
  concurrency?: number;
  quiet?: boolean;
};

/**
 * Runs the pipeline, writing each stage's output to `out/<slug>/` so any stage can be
 * inspected and re-run from.
 */
export async function run(options: RunOptions): Promise<{ dir: string }> {
  const log = createLogger({ quiet: options.quiet });
  const slug = slugify(options.topic);
  const runDir = await RunDirectory.open(outputRoot(options.out), slug);

  const providers = options.mock ? mockProviders() : createProviders();
  // Read the model from config rather than the provider: providers are lazy, and
  // touching `llm.model` here would construct a client a research-only run may not need.
  const cost = new CostTracker(options.mock ? "mock-model" : configuredModel());

  const ctx: PipelineContext = {
    llm: providers.llm,
    tts: providers.tts,
    imageSearch: providers.imageSearch,
    imageFetcher: providers.imageFetcher,
    cost,
    log,
    assetDir: runDir.assetDir,
    cacheDir: cacheRoot(options.out),
  };

  const shouldRun = (stage: Stage) =>
    !isBefore(stage, options.from) && !isBefore(options.stopAfter, stage);
  const stopsAt = (stage: Stage) => options.stopAfter === stage;

  if (!options.quiet) {
    process.stdout.write(banner(`Crammer — ${options.topic}`));
    process.stdout.write(`\n  output: ${runDir.dir}\n`);
    if (options.mock) process.stdout.write("  mode:   mock providers (no network, no cost)\n");
  }

  // Stages 1-4 need the research and the script; a run resumed at `images` or later
  // does not, so those artefacts are only read when something actually wants them.
  const needsScriptStages = !isBefore("storyboard", options.from);

  let research: Research | undefined;
  let script: Script | undefined;
  let report: FactCheckReport | undefined;
  let storyboard: Storyboard | undefined;

  if (needsScriptStages) {
    // --- 1. research -----------------------------------------------------
    if (shouldRun("research")) {
      const result = await runStage(ctx, "research", () =>
        runResearch({ topic: options.topic, level: options.level }, ctx),
      );
      research = result.research;
      await runDir.write("research", result);
    } else {
      research = (await runDir.read("research", ResearchArtifact)).research;
    }
    if (stopsAt("research")) return finish(runDir, cost, options);

    // --- 2. script -------------------------------------------------------
    if (shouldRun("script")) {
      script = await runStage(ctx, "script", () => runScript(research!, ctx));
      await runDir.write("script", script);
    } else {
      script = await runDir.read("script", Script);
    }
    if (stopsAt("script")) return finish(runDir, cost, options);

    // --- 3. fact check ---------------------------------------------------
    if (shouldRun("factcheck")) {
      const result = await runStage(ctx, "factcheck", () =>
        runFactCheck({ script: script!, research: research! }, ctx),
      );
      script = result.script;
      report = result.report;
      await runDir.write("factcheck", result);
    } else if (runDir.has("factcheck")) {
      // Use the revised script, not the draft, when resuming past the fact check.
      const saved = await runDir.read("factcheck", FactCheckResult);
      script = saved.script;
      report = saved.report;
    }
    if (stopsAt("factcheck")) return finish(runDir, cost, options);

    // --- 4. storyboard ---------------------------------------------------
    if (shouldRun("storyboard")) {
      storyboard = await runStage(ctx, "storyboard", () =>
        runStoryboard({ script: script!, research: research! }, ctx),
      );
      await runDir.write("storyboard", storyboard);
    } else {
      storyboard = await runDir.read("storyboard", Storyboard);
    }
    if (stopsAt("storyboard")) return finish(runDir, cost, options);
  } else if (runDir.has("factcheck")) {
    report = (await runDir.read("factcheck", FactCheckResult)).report;
  }

  // --- 5. images ---------------------------------------------------------
  if (shouldRun("images")) {
    storyboard ??= await runDir.read("storyboard", Storyboard);
    storyboard = await runStage(ctx, "images", () => runImages(storyboard!, ctx));
    await runDir.write("images", storyboard);
  } else {
    storyboard = await runDir.read("images", Storyboard);
  }
  if (stopsAt("images")) return finish(runDir, cost, options);

  // --- 6. voice ----------------------------------------------------------
  if (shouldRun("voice")) {
    storyboard = await runStage(ctx, "voice", () => runVoice(storyboard!, ctx));
    await runDir.write("voice", storyboard);
  } else {
    storyboard = await runDir.read("voice", Storyboard);
  }
  if (stopsAt("voice")) return finish(runDir, cost, options);

  // --- 7. render ---------------------------------------------------------
  // On a resumed run this records only the stages that actually ran, which is the
  // honest number for this invocation.
  storyboard.cost = cost.report();

  // The fully-resolved storyboard ships as `final.json`. It deliberately does NOT
  // overwrite `storyboard.json`: that is the stage-4 artefact, and clobbering it with
  // the post-images result bakes image fallbacks in, so a later `--from images` would
  // see TitleCards where photo scenes used to be and never retry them.
  await runDir.writeFinal(storyboard);
  await writeRunOutputs(runDir.dir, storyboard, report);

  const rendered = await runStage(ctx, "render", () =>
    runRender(
      {
        storyboard,
        entryPoint: videoEntryPoint(),
        outDir: runDir.dir,
        showCaptions: options.captions,
        ...(options.crf !== undefined ? { crf: options.crf } : {}),
        ...(options.scale ? { scale: options.scale } : {}),
        ...(options.concurrency ? { concurrency: options.concurrency } : {}),
      },
      ctx,
    ),
  );

  // Re-write it with the render stage's cost included.
  storyboard.cost = cost.report();
  await runDir.writeFinal(storyboard);

  process.stdout.write(`\n${ok(`video.mp4 — ${formatSeconds(rendered.durationSeconds)}`)}\n`);
  return finish(runDir, cost, options);
}

function finish(runDir: RunDirectory, cost: CostTracker, options: RunOptions): { dir: string } {
  if (options.quiet) return { dir: runDir.dir };
  const report = cost.report();
  if (report.stages.length > 0) process.stdout.write(`\n${costTable(report)}\n`);
  process.stdout.write(`\n${ok(`Done — ${runDir.dir}`)}\n`);
  return { dir: runDir.dir };
}

function formatSeconds(seconds: number): string {
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/**
 * Mock providers for `--mock`. Useful for working on templates, the renderer or the
 * CLI itself without spending anything.
 */
function mockProviders() {
  return {
    llm: testing.makeMockLlm("mock topic"),
    tts: new MockTts(),
    imageSearch: [new MockImageSearch()],
    imageFetcher: new MockImageFetcher((url) => testing.makeMockJpeg(url)),
  };
}
