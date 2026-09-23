import type { ImageCandidate } from "@crammer/schema";
import type { ImageSearchProvider } from "../types.js";
import { ProviderConfigError } from "../errors.js";
import { withRetry } from "../retry.js";
import { attributionLine, normaliseLicence, stripHtml } from "./licence.js";

const ENDPOINT = "https://commons.wikimedia.org/w/api.php";

type SearchResponse = {
  query?: { search?: { title: string }[] };
};

type ImageInfoResponse = {
  query?: {
    pages?: Record<
      string,
      {
        title: string;
        imageinfo?: {
          url: string;
          /** Scaled render requested via `iiurlwidth`; absent for small originals. */
          thumburl?: string;
          thumbwidth?: number;
          thumbheight?: number;
          descriptionurl: string;
          width: number;
          height: number;
          mime: string;
          extmetadata?: Record<string, { value?: string }>;
        }[];
      }
    >;
  };
};

/**
 * Wikimedia Commons via the MediaWiki API.
 *
 * Tried first for people, places and events: it is the only one of the three with real
 * coverage of news subjects, and its licence metadata is explicit enough to filter on.
 *
 * Wikimedia's API policy requires a descriptive User-Agent with contact details.
 */
export class WikimediaImages implements ImageSearchProvider {
  readonly name = "wikimedia" as const;
  private readonly userAgent: string;

  constructor(options: { userAgent?: string } = {}) {
    const userAgent = options.userAgent ?? process.env.WIKIMEDIA_USER_AGENT;
    if (!userAgent) {
      throw new ProviderConfigError(
        'WIKIMEDIA_USER_AGENT is not set. Wikimedia requires a contact string, e.g. "Crammer/0.1 (you@example.com)".',
      );
    }
    this.userAgent = userAgent;
  }

  private async get<T>(params: Record<string, string>): Promise<T> {
    const url = new URL(ENDPOINT);
    for (const [key, value] of Object.entries({ ...params, format: "json", origin: "*" })) {
      url.searchParams.set(key, value);
    }
    return withRetry(async () => {
      const response = await fetch(url, { headers: { "User-Agent": this.userAgent } });
      if (!response.ok) {
        throw Object.assign(new Error(`Wikimedia ${response.status}`), {
          status: response.status,
        });
      }
      return (await response.json()) as T;
    });
  }

  async search(query: string, limit: number): Promise<ImageCandidate[]> {
    // Namespace 6 is File:. Asking for a few extra lets licence filtering thin the list
    // without coming back empty.
    const search = await this.get<SearchResponse>({
      action: "query",
      list: "search",
      srsearch: `${query} filetype:bitmap`,
      srnamespace: "6",
      srlimit: String(Math.min(limit * 3, 40)),
    });

    const titles = (search.query?.search ?? []).map((r) => r.title);
    if (titles.length === 0) return [];

    const info = await this.get<ImageInfoResponse>({
      action: "query",
      titles: titles.join("|"),
      prop: "imageinfo",
      iiprop: "url|size|mime|extmetadata",
      // Ask for a sensible render rather than a 60MP original.
      iiurlwidth: "2400",
    });

    const pages = Object.values(info.query?.pages ?? {});
    const candidates: ImageCandidate[] = [];

    for (const page of pages) {
      const image = page.imageinfo?.[0];
      if (!image) continue;
      if (!/^image\/(jpeg|png|webp)$/.test(image.mime)) continue;

      const meta = image.extmetadata ?? {};
      const licence = normaliseLicence(
        meta.LicenseShortName?.value ?? meta.License?.value ?? meta.UsageTerms?.value,
      );
      if (!licence) continue;

      const author = stripHtml(meta.Artist?.value ?? "") || "Unknown author";
      const title = stripHtml(meta.ObjectName?.value ?? page.title.replace(/^File:/, ""));

      // Prefer the 2400px render: Commons originals run to tens of megapixels, and
      // nothing downstream needs more than 1920 wide.
      candidates.push({
        provider: "wikimedia",
        url: image.thumburl ?? image.url,
        pageUrl: image.descriptionurl,
        title,
        author,
        licence,
        licenceUrl: meta.LicenseUrl?.value,
        width: image.thumbwidth ?? image.width,
        height: image.thumbheight ?? image.height,
      });
    }

    // Closest to 16:9 first — every template crops to that, so a photo already near
    // it loses the least.
    const target = 16 / 9;
    candidates.sort(
      (a, b) => Math.abs(a.width / a.height - target) - Math.abs(b.width / b.height - target),
    );
    return candidates.slice(0, limit);
  }
}

export { attributionLine };
