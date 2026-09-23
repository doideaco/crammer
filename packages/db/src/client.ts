import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export type Database = ReturnType<typeof createDatabase>["db"];

/**
 * Opens a pooled connection.
 *
 * Callers own the lifetime: long-lived processes (the web server, a worker) create one
 * at module scope, scripts create one and close it.
 */
export function createDatabase(url = process.env.DATABASE_URL, options: { max?: number } = {}) {
  if (!url) {
    throw new Error("DATABASE_URL is not set. See .env.example.");
  }
  const client = postgres(url, {
    max: options.max ?? 10,
    // Supabase's pooler does not support prepared statements on the transaction port.
    prepare: false,
  });
  return { db: drizzle(client, { schema }), client };
}

let cached: ReturnType<typeof createDatabase> | undefined;

/**
 * Process-wide connection, for the web app and workers.
 *
 * Next.js re-evaluates modules on every hot reload in development, so this is cached
 * to avoid opening a new pool each time.
 */
export function getDatabase(): Database {
  cached ??= createDatabase();
  return cached.db;
}

export { schema };
