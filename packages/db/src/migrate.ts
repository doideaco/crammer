/**
 * Applies pending migrations. Run with `pnpm --filter @crammer/db migrate`.
 *
 * Kept as a script rather than something the web app does at boot: a server that
 * migrates on start will race itself the moment there is more than one instance.
 */
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabase } from "./client.js";

const { db, client } = createDatabase(process.env.DATABASE_URL, { max: 1 });
const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

console.log(`Applying migrations from ${migrationsFolder}`);
await migrate(db, { migrationsFolder });
console.log("Migrations applied.");
await client.end();
