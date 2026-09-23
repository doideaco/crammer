import { loadFont } from "@remotion/google-fonts/Inter";

/**
 * Inter is the project's only family. Loading it at module scope means every
 * composition and every Studio preview gets it without per-template wiring.
 */
export const { fontFamily } = loadFont("normal", {
  weights: ["400", "500", "600", "700"],
  subsets: ["latin"],
});
