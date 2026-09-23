import type { Licence } from "@crammer/schema";

/**
 * Maps a free-text licence string (Commons `extmetadata.LicenseShortName`, usually) to
 * one of the licences we are willing to ship.
 *
 * Returns null for anything non-commercial, no-derivatives, fair-use or unrecognised.
 * Unknown means rejected — never assume permission.
 */
export function normaliseLicence(raw: string | undefined | null): Licence | null {
  if (!raw) return null;
  const text = raw.toLowerCase().replace(/\s+/g, " ").trim();

  // Reject restrictive terms first, so "CC BY-NC" never matches the "cc by" branch.
  if (/\bnc\b|non-?commercial/.test(text)) return null;
  if (/\bnd\b|no-?deriv/.test(text)) return null;
  if (/fair use|fair dealing|non-?free|all rights reserved|copyright/.test(text)) return null;

  if (/cc0|cc-zero|zero waiver/.test(text)) return "cc0";
  if (/public domain|\bpd\b|pd-|no known copyright|copyright expired/.test(text)) {
    return "public-domain";
  }
  // Commons spells these out in `UsageTerms` as often as it abbreviates them in
  // `LicenseShortName`, so both forms have to match. ShareAlike is tested first
  // because "Attribution-ShareAlike" also contains "Attribution".
  if (/cc[ -]?by[ -]?sa|attribution[ -]?share[ -]?alike/.test(text)) return "cc-by-sa";
  if (/cc[ -]?by|\battribution\b/.test(text)) return "cc-by";
  if (/unsplash/.test(text)) return "unsplash";
  if (/pexels/.test(text)) return "pexels";

  return null;
}

/** Builds the credit line that ships on the end card and in sources.md. */
export function attributionLine(parts: {
  title?: string;
  author: string;
  licence: Licence;
  provider: string;
}): string {
  const licenceName: Record<Licence, string> = {
    cc0: "CC0",
    "public-domain": "public domain",
    "cc-by": "CC BY",
    "cc-by-sa": "CC BY-SA",
    unsplash: "Unsplash Licence",
    pexels: "Pexels Licence",
  };
  const source: Record<string, string> = {
    wikimedia: "Wikimedia Commons",
    unsplash: "Unsplash",
    pexels: "Pexels",
  };

  const title = parts.title ? `${stripHtml(parts.title)} — ` : "";
  return `${title}${stripHtml(parts.author)}, ${licenceName[parts.licence]}, via ${source[parts.provider] ?? parts.provider}`;
}

/** Commons metadata arrives as HTML fragments; credits are plain text. */
export function stripHtml(value: string): string {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
