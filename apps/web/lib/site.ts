/** Absolute base URL, used in magic-link redirects and the "ready" email. */
export function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}
