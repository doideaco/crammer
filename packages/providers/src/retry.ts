/**
 * Default deadlines for outbound HTTP.
 *
 * Without one, `fetch` waits forever: a host that accepts a connection and then says
 * nothing never errors, so a retry wrapper never fires and the whole stage hangs until
 * something upstream kills it. That is a worse failure than an error, because it looks
 * like work in progress.
 */
export const HTTP_TIMEOUT_MS = { search: 15_000, download: 30_000 } as const;

/** Sleeps, used for backoff between provider retries. */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** True for errors that are worth retrying: rate limits, timeouts, 5xx. */
function isTransient(error: unknown): boolean {
  const status = (error as { status?: number } | null)?.status;
  if (typeof status === "number") return status === 408 || status === 429 || status >= 500;

  // A request we abandoned on a timeout is the transient case retries exist for.
  const name = (error as { name?: string } | null)?.name;
  if (name === "TimeoutError" || name === "AbortError") return true;

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
