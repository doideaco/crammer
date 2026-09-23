/**
 * Polls for queued videos and runs them in this process.
 *
 * The spec allows local rendering on a worker for M2, and this is that worker: no
 * Trigger.dev account, no cloud, just `pnpm worker`. Several can run at once —
 * claiming uses `for update skip locked`, so they take different rows.
 *
 * Run with: pnpm --filter @crammer/jobs worker
 */
import { claimNextQueuedVideo, createDatabase } from "@crammer/db";
import { createArtifactStore } from "./storage-factory.js";
import { runVideo } from "./pipeline.js";
import { videoEntryPoint } from "./paths.js";

const POLL_INTERVAL_MS = Number(process.env.CRAMMER_WORKER_POLL_MS ?? 2000);

const { db, client } = createDatabase();
const store = createArtifactStore();
const deps = { db, store, videoEntryPoint: videoEntryPoint() };

let running = true;
let current: string | undefined;

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    // Finish the video in flight rather than leaving a half-rendered run behind.
    console.log(`\n${signal} received — finishing ${current ?? "nothing"} then stopping.`);
    running = false;
    if (!current) void shutdown();
  });
}

async function shutdown(): Promise<never> {
  await client.end({ timeout: 5 });
  process.exit(0);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

await store.initialise();

console.log(`Crammer worker started. Polling every ${POLL_INTERVAL_MS}ms.`);
console.log(`Artefacts: ${store.constructor.name}`);
if (process.env.CRAMMER_MOCK === "1") console.log("Mock providers: no network, no cost.");

while (running) {
  const video = await claimNextQueuedVideo(db);
  if (!video) {
    await sleep(POLL_INTERVAL_MS);
    continue;
  }

  current = video.id;
  console.log(`\n=== ${video.id} — "${video.topic}" (${video.level}) ===`);
  const startedAt = Date.now();

  try {
    await runVideo(video.id, deps);
    console.log(`=== done in ${((Date.now() - startedAt) / 1000).toFixed(0)}s ===`);
  } catch (error) {
    // runVideo has already recorded the failure against the row; the worker stays up.
    console.error(`=== failed: ${(error as Error).message} ===`);
  } finally {
    current = undefined;
  }
}

await shutdown();
