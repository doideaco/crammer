import { z } from "zod";

/**
 * Converts a zod schema to the JSON Schema shape the Messages API expects for a tool.
 *
 * `io: "input"` means fields with defaults are reported as optional, which is what we
 * want: the model may omit them and zod fills them in on the way back.
 */
export function toToolSchema(schema: z.ZodType): {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
} {
  const json = z.toJSONSchema(schema, { target: "draft-7", io: "input" }) as Record<
    string,
    unknown
  >;

  // The API requires a top-level object schema. Anything else gets wrapped so the
  // caller can still use, say, an array schema.
  if (json.type === "object") {
    return json as { type: "object"; properties: Record<string, unknown>; required?: string[] };
  }
  return {
    type: "object",
    properties: { value: json },
    required: ["value"],
  };
}

/** Undoes the wrapping applied by `toToolSchema` for non-object schemas. */
export function unwrapToolInput(schema: z.ZodType, input: unknown): unknown {
  const json = z.toJSONSchema(schema, { target: "draft-7", io: "input" }) as { type?: string };
  if (json.type === "object") return input;
  return (input as { value: unknown } | null)?.value;
}
