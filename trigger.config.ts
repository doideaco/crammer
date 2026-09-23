import { defineConfig } from "@trigger.dev/sdk";

/**
 * Trigger.dev configuration.
 *
 * `TRIGGER_PROJECT_REF` comes from the Trigger.dev dashboard. Without it — and without
 * TRIGGER_SECRET_KEY — the web app falls back to the polling worker, which is a
 * supported way to run M2 rather than a degraded one.
 */
export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF ?? "proj_crammer",
  dirs: ["./jobs/src/trigger"],
  maxDuration: 7200,
  retries: {
    enabledInDev: false,
    default: { maxAttempts: 3, factor: 2, minTimeoutInMs: 5_000, maxTimeoutInMs: 60_000 },
  },
});
