import Anthropic from "@anthropic-ai/sdk";
import type {
  ContentBlockParam,
  MessageParam,
  Tool,
  ToolUnion,
} from "@anthropic-ai/sdk/resources/messages";
import { z } from "zod";
import type {
  LlmProvider,
  StructuredRequest,
  StructuredResult,
  TextRequest,
  TextResult,
  Usage,
  VisionRequest,
} from "../types.js";
import { ZERO_USAGE, addUsage } from "../types.js";
import { ProviderConfigError, RefusedError, StructuredOutputError } from "../errors.js";
import { withRetry } from "../retry.js";
import { toToolSchema, unwrapToolInput } from "./json-schema.js";

export const DEFAULT_MODEL = "claude-opus-5";

/** The model a run will use, without constructing a client (and so without a key). */
export function configuredModel(): string {
  return process.env.CRAMMER_MODEL || DEFAULT_MODEL;
}

/**
 * Server-side web search tool version. The dated variants are model-gated, so this is
 * overridable for anyone pointing `CRAMMER_MODEL` at an older model.
 */
const DEFAULT_WEB_SEARCH_TOOL = "web_search_20260209";

export type AnthropicLlmOptions = {
  apiKey?: string;
  model?: string;
  /**
   * Required when the API key is not scoped to a workspace. Sent as the
   * `anthropic-workspace-id` header.
   */
  workspaceId?: string;
  /** Overrides the web search tool version, e.g. "web_search_20250305". */
  webSearchTool?: string;
  /** Thinking depth. Higher costs more; "high" is the API default. */
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
};

/**
 * Above this, the SDK refuses a non-streaming request because it could exceed the
 * 10 minute HTTP timeout. Streaming has no such limit.
 */
const STREAM_ABOVE_MAX_TOKENS = 8000;

/** Reads token counts off a Messages API response. */
function usageOf(message: { usage?: Anthropic.Usage }, requests = 1): Usage {
  const usage = message.usage;
  return {
    inputTokens: usage?.input_tokens ?? 0,
    outputTokens: usage?.output_tokens ?? 0,
    cacheReadTokens: usage?.cache_read_input_tokens ?? 0,
    ttsCharacters: 0,
    requests,
  };
}

/**
 * Claude, via the Messages API.
 *
 * Structured output goes through tool use with `tool_choice` forced to our tool, and
 * validation failures are fed back to the model rather than thrown straight away —
 * a bad enum value or a missing field usually fixes itself on the second attempt.
 */
export class AnthropicLlm implements LlmProvider {
  readonly name = "anthropic";
  readonly model: string;
  private readonly client: Anthropic;
  private readonly webSearchTool: string;
  private readonly effort: NonNullable<AnthropicLlmOptions["effort"]>;

  constructor(options: AnthropicLlmOptions = {}) {
    const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new ProviderConfigError(
        "ANTHROPIC_API_KEY is not set. Copy .env.example to .env and fill it in.",
      );
    }
    const workspaceId = options.workspaceId ?? process.env.ANTHROPIC_WORKSPACE_ID;
    this.client = new Anthropic({
      apiKey,
      ...(workspaceId ? { defaultHeaders: { "anthropic-workspace-id": workspaceId } } : {}),
    });
    this.model = options.model ?? configuredModel();
    this.webSearchTool =
      options.webSearchTool ?? (process.env.CRAMMER_WEB_SEARCH_TOOL || DEFAULT_WEB_SEARCH_TOOL);
    this.effort = options.effort ?? "high";
  }

  /**
   * Issues one Messages request, streaming when the output could be long.
   *
   * Streaming is only a transport choice here: `finalMessage()` returns the same
   * assembled message, so callers see no difference.
   */
  private async send(
    params: Anthropic.MessageCreateParamsNonStreaming,
  ): Promise<Anthropic.Message> {
    if ((params.max_tokens ?? 0) <= STREAM_ABOVE_MAX_TOKENS) {
      return this.client.messages.create(params);
    }
    const stream = this.client.messages.stream(params);
    return stream.finalMessage();
  }

  async text(req: TextRequest): Promise<TextResult> {
    const tools = req.webSearch
      ? ([
          {
            type: this.webSearchTool,
            name: "web_search",
            max_uses: req.webSearch.maxUses,
          },
        ] as unknown as ToolUnion[])
      : [];

    const message = await withRetry(() =>
      this.send({
        model: this.model,
        max_tokens: req.maxTokens ?? 8000,
        temperature: req.temperature ?? 1,
        system: req.system,
        output_config: { effort: this.effort },
        messages: [{ role: "user", content: req.prompt }],
        ...(tools.length > 0 ? { tools } : {}),
      }),
    );
    assertNotRefused(message);

    const text = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    // Server-side web search results come back as their own content blocks; pulling
    // the URLs out here is what lets the research stage cite real pages.
    const citations: { url: string; title: string }[] = [];
    for (const block of message.content) {
      if (block.type !== "web_search_tool_result") continue;
      const content = block.content;
      if (!Array.isArray(content)) continue;
      for (const result of content) {
        if ("url" in result && typeof result.url === "string") {
          citations.push({ url: result.url, title: ("title" in result && result.title) || result.url });
        }
      }
    }

    return { text, citations, usage: usageOf(message) };
  }

  async structured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const tool: Tool = {
      name: req.toolName,
      description: req.toolDescription,
      input_schema: toToolSchema(req.schema),
    };

    const messages: MessageParam[] = [{ role: "user", content: req.prompt }];
    let usage = ZERO_USAGE;
    let lastRaw: unknown;
    const attempts = (req.retries ?? 2) + 1;

    for (let attempt = 0; attempt < attempts; attempt++) {
      const message = await withRetry(() =>
        this.send({
          model: this.model,
          max_tokens: req.maxTokens ?? 16000,
          system: req.system,
          output_config: { effort: this.effort },
          messages,
          tools: [tool],
          tool_choice: { type: "tool", name: req.toolName },
        }),
      );
      usage = addUsage(usage, usageOf(message));
      assertNotRefused(message);

      const toolUse = message.content.find(
        (block): block is Anthropic.ToolUseBlock =>
          block.type === "tool_use" && block.name === req.toolName,
      );

      if (!toolUse) {
        lastRaw = message.content;
        messages.push(
          { role: "assistant", content: message.content as ContentBlockParam[] },
          {
            role: "user",
            content: `You must call the ${req.toolName} tool. Call it now with the full result.`,
          },
        );
        continue;
      }

      lastRaw = toolUse.input;
      const parsed = req.schema.safeParse(unwrapToolInput(req.schema, toolUse.input));
      if (parsed.success) return { value: parsed.data, usage };

      // Hand the validation errors back so the next attempt is a correction, not a redo.
      messages.push(
        { role: "assistant", content: message.content as ContentBlockParam[] },
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: toolUse.id,
              is_error: true,
              content: `The input failed validation. Fix these problems and call ${req.toolName} again:\n${formatIssues(parsed.error)}`,
            },
          ],
        },
      );
    }

    throw new StructuredOutputError(
      `${req.toolName} did not produce valid output after ${attempts} attempts`,
      attempts,
      lastRaw,
    );
  }

  async vision<T>(req: VisionRequest<T>): Promise<StructuredResult<T>> {
    const content: ContentBlockParam[] = [];
    for (const image of req.images) {
      content.push({ type: "text", text: `Image: ${image.label}` });
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: image.mediaType,
          data: image.data.toString("base64"),
        },
      });
    }
    content.push({ type: "text", text: req.prompt });

    const tool: Tool = {
      name: req.toolName,
      description: req.toolDescription,
      input_schema: toToolSchema(req.schema),
    };

    const message = await withRetry(() =>
      this.send({
        model: this.model,
        max_tokens: req.maxTokens ?? 4000,
        system: req.system,
        // Image relevance is a judgement call, not a research problem; low effort
        // keeps the per-candidate vision check cheap.
        output_config: { effort: "low" },
        messages: [{ role: "user", content }],
        tools: [tool],
        tool_choice: { type: "tool", name: req.toolName },
      }),
    );

    assertNotRefused(message);

    const toolUse = message.content.find(
      (block): block is Anthropic.ToolUseBlock =>
        block.type === "tool_use" && block.name === req.toolName,
    );
    if (!toolUse) {
      throw new StructuredOutputError(`${req.toolName} was not called`, 1, message.content);
    }

    const parsed = req.schema.safeParse(unwrapToolInput(req.schema, toolUse.input));
    if (!parsed.success) {
      throw new StructuredOutputError(
        `${req.toolName} returned invalid output: ${formatIssues(parsed.error)}`,
        1,
        toolUse.input,
      );
    }

    return { value: parsed.data, usage: usageOf(message) };
  }
}

/**
 * A safety decline arrives as a normal 200 with `stop_reason: "refusal"`, so it has to
 * be checked explicitly or it reads as an empty response.
 */
function assertNotRefused(message: Anthropic.Message): void {
  if (message.stop_reason !== "refusal") return;
  const details = message.stop_details;
  const category = details && "category" in details ? details.category : null;
  throw new RefusedError(
    `The model declined this request${category ? ` (${category})` : ""}.` +
      (details && "explanation" in details && details.explanation
        ? `\n${details.explanation}`
        : ""),
  );
}

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `- ${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n");
}
