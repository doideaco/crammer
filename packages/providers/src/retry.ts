/** Sleeps, used for backoff between provider retries. */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** True for errors that are worth retrying: rate limits, timeouts, 5xx. */
function isTransient(error: unknown): boolean {
  const status = (error as { status?: number } | null)?.status;
  if (typeof status === "number") return status === 408 || status === 429 || status >= 500;
  const code = (error as { code?: string } | null)?.code;
  return code === "ETIMEDOUT" || code === "ECONNRESET" || code === "ENOTFOUND";
}

/** Retries `fn` with exponential backoff on transient provider failures. */
export async function withRetry<T>(
  fn: () => Promise<T>,
  { attempts = 4, baseMs = 700 } = {},
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isTransient(error) || attempt === attempts - 1) throw error;
      await sleep(baseMs * 2 ** attempt + Math.random() * 250);
    }
  }
  throw lastError;
}
