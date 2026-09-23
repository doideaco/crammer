/**
 * The light surface: everything the web app needs.
 *
 * Deliberately excludes the stage runner and the pipeline. Those pull in Remotion and
 * sharp, which have no business in a serverless request handler — importing them here
 * would drag a video renderer into every page render and every deploy.
 *
 * Workers and Trigger.dev tasks import `@crammer/jobs/run` instead.
 */
export * from "./artifacts.js";
export * from "./artifacts-local.js";
export * from "./artifacts-supabase.js";
export * from "./storage-factory.js";
export * from "./email.js";
export * from "./paths.js";
export * from "./queue.js";
