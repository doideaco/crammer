import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import {
  CostTracker,
  MockImageFetcher,
  MockImageSearch,
  MockLlm,
  MockTts,
} from "@crammer/providers";
import type { PipelineContext } from "../context.js";
import { SILENT_LOGGER } from "../context.js";
import { mockResearch, mockScript, mockStoryboardDraft } from "./fixtures.js";

export * from "./fixtures.js";

/**
 * A `MockLlm` wired with handlers for every tool the pipeline calls.
 *
 * The storyboard handler closes over the canned script rather than parsing the prompt,
 * which is what lets a mock run satisfy the real coverage check.
 */
export function makeMockLlm(
  topic: string,
  options: {
    level?: "beginner" | "intermediate";
    /** Refuse the topic, to exercise the safety path. */
    refuse?: boolean;
    /** Issues the fact checker reports on its first pass. */
    factCheckIssues?: unknown[];
    /** Relevance the vision check gives every candidate. */
    imageRelevance?: number;
    imageGraphic?: boolean;
  } = {},
): MockLlm {
  const research = mockResearch(topic, options.level ?? "beginner");
  const script = mockScript(research);
  const draft = mockStoryboardDraft(script);
  let factCheckCalls = 0;

  return new MockLlm({ textResponse: `Mock research notes about ${topic}.` })
    .on("assess_topic", () => ({
      allowed: !options.refuse,
      reason: options.refuse
        ? "This topic would require step-by-step instructions for causing harm."
        : "This can be explained without supplying harmful instructions.",
      contested: false,
      perspectives: [],
      suggestedAlternative: options.refuse ? "The history of arms control treaties" : null,
    }))
    .on("emit_research", () => research)
    .on("emit_script", () => script)
    .on("emit_fact_check", () => {
      factCheckCalls++;
      // Report issues on the first pass only, so the revision path is exercised and
      // the re-check comes back clean.
      return {
        issues: factCheckCalls === 1 ? (options.factCheckIssues ?? []) : [],
        balanceNote: "Mock balance note: this synthetic script is not a contested topic.",
      };
    })
    .on("emit_storyboard", () => draft)
    .on("judge_images", ({ prompt }) => ({
      verdicts: [0, 1, 2].map((index) => ({
        index,
        relevance: options.imageRelevance ?? 0.9 - index * 0.1,
        graphic: options.imageGraphic ?? false,
        depictsRealPerson: false,
        reason: `Mock verdict for ${prompt.slice(0, 40)}`,
      })),
    }));
}

/** A tiny real JPEG, so `sharp` has something genuine to process in mock runs. */
export async function makeMockJpeg(seed: string): Promise<Buffer> {
  const hue = [...seed].reduce((n, c) => (n + c.charCodeAt(0)) % 360, 0);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900">
    <rect width="1600" height="900" fill="hsl(${hue}, 30%, 55%)"/>
    <rect y="560" width="1600" height="340" fill="hsl(${hue}, 34%, 40%)"/>
    <text x="800" y="450" fill="rgba(255,255,255,0.85)" font-family="sans-serif"
          font-size="72" font-weight="700" text-anchor="middle">mock image</text>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 80 }).toBuffer();
}

export type TestContextOptions = Partial<PipelineContext> & {
  topic?: string;
  llmOptions?: Parameters<typeof makeMockLlm>[1];
};

/** A `PipelineContext` backed entirely by mocks, writing into a temp directory. */
export function makeTestContext(options: TestContextOptions = {}): PipelineContext {
  const topic = options.topic ?? "A mock topic";
  const assetDir = options.assetDir ?? mkdtempSync(join(tmpdir(), "crammer-test-"));

  return {
    llm: options.llm ?? makeMockLlm(topic, options.llmOptions),
    tts: options.tts ?? new MockTts(),
    imageSearch: options.imageSearch ?? [new MockImageSearch()],
    imageFetcher: options.imageFetcher ?? new MockImageFetcher((url) => makeMockJpeg(url)),
    cost: options.cost ?? new CostTracker("mock-model"),
    log: options.log ?? SILENT_LOGGER,
    assetDir,
    ...(options.cacheDir ? { cacheDir: options.cacheDir } : {}),
  };
}
