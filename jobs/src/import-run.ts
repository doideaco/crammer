/**
 * Imports a finished CLI run into a user's library.
 *
 * A video made with `pnpm crammer` already has everything the web app shows — the
 * storyboard, the transcript, the sources and the MP4 — it just has no row pointing at
 * it. This copies the deliverables into the artefact store and creates that row.
 *
 * Usage:
 *   pnpm import:run out/<slug> you@example.com
 *
 * Goes through `createVideo`, so the daily limit applies here too — importing is not a
 * way around it.
 */
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { FPS, Storyboard, storyboardDuration } from "@crammer/schema";
import {
  appendEvent,
  createDatabase,
  createVideo,
  getUserByEmail,
  updateVideo,
} from "@crammer/db";
import { createArtifactStore } from "./storage-factory.js";

const [runDirArg, email] = process.argv.slice(2);
if (!runDirArg || !email) {
  console.error("Usage: tsx src/import-run.ts <run-dir> <user-email>");
  process.exit(1);
}

const runDir = resolve(runDirArg);
for (const name of ["final.json", "video.mp4", "transcript.txt", "sources.md"]) {
  if (!existsSync(join(runDir, name))) {
    console.error(`${runDir} is not a finished run: ${name} is missing.`);
    process.exit(1);
  }
}

const { db, client } = createDatabase();
const store = createArtifactStore();
await store.initialise();

const storyboard = Storyboard.parse(JSON.parse(await readFile(join(runDir, "final.json"), "utf8")));

// Look the user up by email rather than taking an id, so this is usable from a terminal.
const user = await getUserByEmail(db, email);
if (!user) {
  console.error(`No user with email ${email}. Sign in through the web app first.`);
  await client.end();
  process.exit(1);
}
const userId = user.id;

console.log(`Importing "${storyboard.title}" for ${email}…`);

// Goes through createVideo so the daily limit applies here too — importing should not
// be a way around it.
const video = await createVideo(db, {
  userId,
  topic: storyboard.topic,
  level: storyboard.level,
});

const uploads: Record<string, string> = {};
for (const [name, contentType] of [
  ["video.mp4", "video/mp4"],
  ["transcript.txt", "text/plain; charset=utf-8"],
  ["sources.md", "text/markdown; charset=utf-8"],
] as const) {
  process.stdout.write(`  ${name}… `);
  uploads[name] = await store.putOutput(
    video.id,
    name,
    await readFile(join(runDir, name)),
    contentType,
  );
  console.log("done");
}

await store.putJson(video.id, "final", storyboard);

await updateVideo(db, video.id, {
  status: "succeeded",
  stage: null,
  title: storyboard.title,
  storyboardJson: storyboard,
  videoUrl: uploads["video.mp4"]!,
  transcriptUrl: uploads["transcript.txt"]!,
  sourcesUrl: uploads["sources.md"]!,
  durationSeconds: Math.round(storyboardDuration(storyboard) / FPS),
  // Whatever `final.json` recorded — which is the cost of the invocation that wrote
  // it, not the video's lifetime spend. A run resumed with `--from render` only
  // records the render, so an imported video can read lower than it really cost.
  costPence: (storyboard.cost?.totalPence ?? 0).toFixed(2),
  completedAt: new Date(),
});

await appendEvent(db, {
  videoId: video.id,
  message: `Imported from the CLI run in ${basename(runDir)}`,
});

console.log(`\nImported as ${video.id}`);
console.log(`View it at ${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/videos/${video.id}`);
await client.end();
