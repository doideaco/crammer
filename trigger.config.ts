import { defineConfig } from "@trigger.dev/sdk";
import { ffmpeg, syncEnvVars } from "@trigger.dev/build/extensions/core";
import { puppeteer } from "@trigger.dev/build/extensions/puppeteer";

/**
 * Trigger.dev configuration.
 *
 * The project ref is the one from the Trigger.dev dashboard; `TRIGGER_PROJECT_REF`
 * overrides it for anyone deploying into a different project. Without
 * TRIGGER_SECRET_KEY the web app falls back to the polling worker, which is a supported
 * way to run M2 rather than a degraded one.
 *
 * The render stage drives a headless browser and stitches with ffmpeg, so the image
 * needs both:
 *
 * - `puppeteer()` installs Chrome at /usr/bin/google-chrome-stable and sets
 *   PUPPETEER_EXECUTABLE_PATH, which the render stage picks up. Without it Remotion
 *   downloads its own 93MB Chrome Headless Shell on every cold start.
 * - `ffmpeg()` provides the system binaries. Remotion ships its own compositor, but the
 *   platform-specific package has to resolve for linux-x64 rather than the darwin-arm64
 *   one installed on a Mac — which is why `external` leaves them to the runtime install.
 */
export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF ?? "proj_zaytdbmlxrrqjeqoojto",
  dirs: ["./jobs/src/trigger"],
  maxDuration: 7200,
  retries: {
    enabledInDev: false,
    default: { maxAttempts: 3, factor: 2, minTimeoutInMs: 5_000, maxTimeoutInMs: 60_000 },
  },
  build: {
    extensions: [
      puppeteer(),
      ffmpeg(),
      // Push the keys the pipeline needs at deploy time, from whatever environment the
      // deploy runs in. An explicit list, not everything in scope: a build machine's
      // environment holds plenty that has no business in a task.
      syncEnvVars(() =>
        [
          "ANTHROPIC_API_KEY",
          "ANTHROPIC_WORKSPACE_ID",
          "CRAMMER_MODEL",
          "ELEVENLABS_API_KEY",
          "ELEVENLABS_VOICE_ID",
          "WIKIMEDIA_USER_AGENT",
          "UNSPLASH_ACCESS_KEY",
          "PEXELS_API_KEY",
          "RESEND_API_KEY",
          "CRAMMER_EMAIL_FROM",
          "DATABASE_URL",
          "SUPABASE_URL",
          "SUPABASE_SERVICE_ROLE_KEY",
          "NEXT_PUBLIC_SITE_URL",
          "CRAMMER_GLOBAL_VIDEO_LIMIT",
          "CRAMMER_DAILY_VIDEO_LIMIT",
          "CRAMMER_MAX_PENCE_PER_VIDEO",
        ]
          .map((name) => ({ name, value: process.env[name] }))
          .filter((entry): entry is { name: string; value: string } => Boolean(entry.value)),
      ),
    ],
    /**
     * Left to the image's own install rather than bundled.
     *
     * Two different reasons, both fatal if ignored:
     *
     * - Native and platform-specific binaries (`sharp`, Remotion's compositor) must be
     *   installed for the image's platform, not copied from a developer's Mac.
     * - `@remotion/bundler` pulls in rspack and webpack, which load native `.node`
     *   bindings through `require`. Bundling those produces a CommonJS shim that fails
     *   at import with "Assignment to constant variable" — the task never starts, and
     *   the error points at rspack rather than at anything in this repo.
     */
    external: [
      "sharp",
      "@remotion/renderer",
      "@remotion/bundler",
      "@remotion/compositor-linux-x64-gnu",
      "@remotion/compositor-linux-x64-musl",
      "@rspack/core",
      "@rspack/binding",
      "@rspack/plugin-react-refresh",
      "webpack",
      "esbuild",
    ],
  },
});
