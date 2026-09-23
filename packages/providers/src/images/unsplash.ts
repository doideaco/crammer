import type { ImageCandidate } from "@crammer/schema";
import type { ImageSearchProvider } from "../types.js";
import { ProviderConfigError } from "../errors.js";
import { HTTP_TIMEOUT_MS, withRetry } from "../retry.js";

type UnsplashResponse = {
  results?: {
    id: string;
    description: string | null;
    alt_description: string | null;
    width: number;
    height: number;
    urls: { raw: string; full: string; regular: string };
    links: { html: string };
    user: { name: string; links: { html: string } };
  }[];
};

/**
 * Unsplash. Used as a fallback for generic scenes — a harbour, a queue, a trading
 * floor — where Commons has nothing usable.
 *
 * Everything on Unsplash ships under the Unsplash Licence, so there is nothing to
 * filter; attribution is still tracked because the licence asks for it.
 */
export class UnsplashImages implements ImageSearchProvider {
  readonly name = "unsplash" as const;
  private readonly accessKey: string;

  constructor(options: { accessKey?: string } = {}) {
    const accessKey = options.accessKey ?? process.env.UNSPLASH_ACCESS_KEY;
    if (!accessKey) throw new ProviderConfigError("UNSPLASH_ACCESS_KEY is not set.");
    this.accessKey = accessKey;
  }

  async search(query: string, limit: number): Promise<ImageCandidate[]> {
    const url = new URL("https://api.unsplash.com/search/photos");
    url.searchParams.set("query", query);
    url.searchParams.set("per_page", String(Math.min(limit, 30)));
    url.searchParams.set("orientation", "landscape");
    url.searchParams.set("content_filter", "high");

    const data = await withRetry(async () => {
      const response = await fetch(url, {
        headers: {
          Authorization: `Client-ID ${this.accessKey}`,
          "Accept-Version": "v1",
        },
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS.search),
      });
      if (!response.ok) {
        throw Object.assign(new Error(`Unsplash ${response.status}`), { status: response.status });
      }
      return (await response.json()) as UnsplashResponse;
    });

    return (data.results ?? []).map((photo) => ({
      provider: "unsplash" as const,
      url: photo.urls.raw + "&w=2400&fm=jpg&q=85",
      pageUrl: photo.links.html,
      title: photo.description ?? photo.alt_description ?? query,
      author: photo.user.name,
      licence: "unsplash" as const,
      licenceUrl: "https://unsplash.com/license",
      width: photo.width,
      height: photo.height,
    }));
  }
}
