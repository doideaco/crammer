import type { ImageCandidate } from "@crammer/schema";
import { HTTP_TIMEOUT_MS } from "../retry.js";
import type { ImageFetcher, ImageSearchProvider } from "../types.js";

/**
 * A deterministic image-search stand-in.
 *
 * Results are derived from the query, so a mock run produces a stable storyboard and
 * tests can assert on specific candidates without recording HTTP fixtures.
 */
export class MockImageSearch implements ImageSearchProvider {
  readonly name = "wikimedia" as const;
  readonly queries: string[] = [];

  constructor(
    private readonly options: {
      /** Return no results for queries matching this, to exercise the fallback path. */
      emptyFor?: RegExp;
      resultsPerQuery?: number;
    } = {},
  ) {}

  async search(query: string, limit: number): Promise<ImageCandidate[]> {
    this.queries.push(query);
    if (this.options.emptyFor?.test(query)) return [];

    const count = Math.min(this.options.resultsPerQuery ?? 3, limit);
    return Array.from({ length: count }, (_, i) => ({
      provider: "wikimedia" as const,
      url: `https://mock.invalid/${encodeURIComponent(query)}/${i}.jpg`,
      pageUrl: `https://mock.invalid/page/${encodeURIComponent(query)}/${i}`,
      title: `${query} (${i + 1})`,
      author: `Mock Photographer ${i + 1}`,
      licence: "cc-by" as const,
      licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
      width: 2400,
      height: 1600,
    }));
  }
}

/**
 * Returns a generated JPEG for any URL, so the images stage can run its full
 * download / process / hash path without a network.
 */
export class MockImageFetcher implements ImageFetcher {
  readonly fetched: string[] = [];

  constructor(private readonly makeImage: (url: string) => Promise<Buffer> | Buffer) {}

  async fetch(url: string): Promise<{ data: Buffer; contentType: string }> {
    this.fetched.push(url);
    return { data: await this.makeImage(url), contentType: "image/jpeg" };
  }
}

/** The real fetcher: plain HTTP with a size cap so a rogue URL cannot exhaust memory. */
export class HttpImageFetcher implements ImageFetcher {
  constructor(
    private readonly options: { userAgent?: string; maxBytes?: number; timeoutMs?: number } = {},
  ) {}

  async fetch(url: string): Promise<{ data: Buffer; contentType: string }> {
    const response = await fetch(url, {
      headers: this.options.userAgent ? { "User-Agent": this.options.userAgent } : {},
      redirect: "follow",
      // Images can be several megabytes, so this is generous — but finite. A stalled
      // download used to hang the whole images stage until something else killed it.
      signal: AbortSignal.timeout(this.options.timeoutMs ?? HTTP_TIMEOUT_MS.download),
    });
    if (!response.ok) {
      throw Object.assign(new Error(`Image fetch ${response.status} for ${url}`), {
        status: response.status,
      });
    }

    const maxBytes = this.options.maxBytes ?? 25 * 1024 * 1024;
    const declared = Number(response.headers.get("content-length") ?? 0);
    if (declared > maxBytes) throw new Error(`Image at ${url} is ${declared} bytes, over the cap`);

    const data = Buffer.from(await response.arrayBuffer());
    if (data.byteLength > maxBytes) throw new Error(`Image at ${url} exceeded the size cap`);

    return { data, contentType: response.headers.get("content-type") ?? "image/jpeg" };
  }
}
