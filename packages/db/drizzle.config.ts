import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  // Supabase owns `auth` and `storage`; only our own tables are managed here.
  schemaFilter: ["public"],
  verbose: true,
});
