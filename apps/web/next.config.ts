import type { NextConfig } from "next";

const config: NextConfig = {
  // The pipeline packages are workspace TypeScript sources, not published builds.
  transpilePackages: ["@crammer/db", "@crammer/jobs", "@crammer/schema"],
  experimental: {
    // Server Actions receive a topic and a level, nothing large.
    serverActions: { bodySizeLimit: "1mb" },
  },
  // `postgres`, `sharp` and the Remotion renderer must not be bundled into the server
  // build; they are native or rely on dynamic requires.
  serverExternalPackages: ["postgres", "sharp", "@remotion/renderer", "@remotion/bundler"],
};

export default config;
