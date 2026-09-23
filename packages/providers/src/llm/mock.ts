import type {
  LlmProvider,
  StructuredRequest,
  StructuredResult,
  TextRequest,
  TextResult,
  VisionRequest,
} from "../types.js";
import { ZERO_USAGE } from "../types.js";
import { StructuredOutputError } from "../errors.js";

/** A canned answer, chosen by the tool name the caller asked for. */
export type MockHandler = (req: { prompt: string; system: string; toolName: string }) => unknown;

export type MockLlmOptions = {
  /** Keyed by tool name, e.g. `emit_research`. */
  handlers?: Record<string, MockHandler>;
  /** Returned by `text()`. */
  textResponse?: string;
  /** Records every call for assertions in tests. */
  onCall?: (toolName: string) => void;
};

/**
 * A deterministic stand-in for Claude.
 *
 * Every pipeline stage takes an `LlmProvider`, so tests and `CRAMMER_MOCK=1` runs use
 * this and touch no network. Handlers are registered by tool name; anything without a
 * handler is a test bug and throws rather than silently returning junk.
 */
export class MockLlm implements LlmProvider {
  readonly name = "mock";
  readonly model = "mock-model";
  readonly calls: string[] = [];
  private readonly handlers: Record<string, MockHandler>;

  constructor(private readonly options: MockLlmOptions = {}) {
    this.handlers = options.handlers ?? {};
  }

  /** Adds or replaces a handler after construction. */
  on(toolName: string, handler: MockHandler): this {
    this.handlers[toolName] = handler;
    return this;
  }

  async text(req: TextRequest): Promise<TextResult> {
    this.calls.push("text");
    this.options.onCall?.("text");
    return {
      text: this.options.textResponse ?? `Mock research notes for: ${req.prompt.slice(0, 120)}`,
      citations: [],
      usage: { ...ZERO_USAGE, inputTokens: 1000, outputTokens: 500, requests: 1 },
    };
  }

  async structured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    return this.run(req.toolName, req.system, req.prompt, req.schema);
  }

  async vision<T>(req: VisionRequest<T>): Promise<StructuredResult<T>> {
    return this.run(req.toolName, req.system, req.prompt, req.schema);
  }

  private async run<T>(
    toolName: string,
    system: string,
    prompt: string,
    schema: { safeParse: (v: unknown) => { success: boolean; data?: T; error?: unknown } },
  ): Promise<StructuredResult<T>> {
    this.calls.push(toolName);
    this.options.onCall?.(toolName);

    const handler = this.handlers[toolName];
    if (!handler) {
      throw new StructuredOutputError(
        `MockLlm has no handler for "${toolName}". Register one with .on("${toolName}", ...).`,
        0,
        null,
      );
    }

    const raw = handler({ prompt, system, toolName });
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      throw new StructuredOutputError(
        `MockLlm handler for "${toolName}" returned output that fails the real schema. ` +
          `Fix the fixture — a mock that does not satisfy the schema hides real bugs.\n` +
          JSON.stringify(parsed.error, null, 2),
        1,
        raw,
      );
    }

    return {
      value: parsed.data as T,
      usage: { ...ZERO_USAGE, inputTokens: 2000, outputTokens: 800, requests: 1 },
    };
  }
}
