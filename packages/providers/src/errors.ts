/** Raised when a provider is misconfigured — a missing key, usually. */
export class ProviderConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderConfigError";
  }
}

/** Raised when the model's structured output never validated. */
export class StructuredOutputError extends Error {
  constructor(
    message: string,
    readonly attempts: number,
    readonly lastRaw: unknown,
  ) {
    super(message);
    this.name = "StructuredOutputError";
  }
}

/** Raised when the model declines a topic on safety grounds. */
export class RefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RefusedError";
  }
}
