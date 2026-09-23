import type { ImageCandidate } from "@crammer/schema";
import type { ImageSearchProvider } from "../types.js";
import { ProviderConfigError } from "../errors.js";
import { HTTP_TIMEOUT_MS, withRetry } from "../retry.js";

type PexelsResponse = {
  photos?: {
    id: number;
    width: number;
    height: number;
    url: string;
    photographer: string;
    alt: string;
    src: { original: string; large2x: string; large: string };
  }[];
};

/** Pexels. The last fallback, on the same terms as Unsplash. */
export class PexelsImages implements ImageSearchProvider {
  readonly name = "pexels" as const;
  private readonly apiKey: string;

  constructor(options: { apiKey?: string } = {}) {
    const apiKey = options.apiKey ?? process.env.PEXELS_API_KEY;
    if (!apiKey) throw new ProviderConfigError("PEXELS_API_KEY is not set.");
    this.apiKey = apiKey;
  }

  async search(query: string, limit: number): Promise<ImageCandidate[]> {
    const url = new URL("https://api.pexels.com/v1/search");
    url.searchParams.set("query", query);
    url.searchParams.set("per_page", String(Math.min(limit, 30)));
    url.searchParams.set("orientation", "landscape");

    const data = await withRetry(async () => {
      const response = await fetch(url, {
        headers: { Authorization: this.apiKey },
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS.search),
      });
      if (!response.ok) {
        throw Object.assign(new Error(`Pexels ${response.status}`), { status: response.status });
      }
      return (await response.json()) as PexelsResponse;
    });

    return (data.photos ?? []).map((photo) => ({
      provider: "pexels" as const,
      url: photo.src.large2x,
      pageUrl: photo.url,
      title: photo.alt || query,
      author: photo.photographer,
      licence: "pexels" as const,
      licenceUrl: "https://www.pexels.com/license/",
      width: photo.width,
      height: photo.height,
    }));
  }
}
