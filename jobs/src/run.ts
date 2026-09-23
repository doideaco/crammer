/**
 * The heavy surface: running the pipeline.
 *
 * Pulls in `@crammer/pipeline`, and through it Remotion and sharp. Only import this
 * from a worker or a Trigger.dev task — never from the web app.
 */
export * from "./context.js";
export * from "./stages.js";
export * from "./pipeline.js";
