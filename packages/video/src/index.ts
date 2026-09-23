import { registerRoot } from "remotion";
import { RemotionRoot } from "./Root";

registerRoot(RemotionRoot);

export { Explainer } from "./Explainer";
export { theme } from "./theme";
export { TEMPLATES } from "./templates";
export * from "./fixtures";

/** The composition id the pipeline renders. */
export const EXPLAINER_COMPOSITION_ID = "Explainer";
