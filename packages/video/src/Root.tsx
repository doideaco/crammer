import { Composition } from "remotion";
import {
  ExplainerProps,
  FPS,
  HEIGHT,
  TEMPLATE_NAMES,
  WIDTH,
  Storyboard,
  storyboardDuration,
} from "@crammer/schema";
import { Explainer } from "./Explainer";
import { DEMO_STORYBOARD, singleSceneStoryboard } from "./fixtures";

/**
 * `Explainer` is the only composition the pipeline renders. The `Template-*`
 * compositions exist purely so every template has a Studio fixture to work against.
 */
export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="Explainer"
      component={Explainer}
      width={WIDTH}
      height={HEIGHT}
      fps={FPS}
      durationInFrames={storyboardDuration(DEMO_STORYBOARD)}
      defaultProps={{ storyboard: DEMO_STORYBOARD, showCaptions: true } as ExplainerProps}
      schema={ExplainerProps}
      calculateMetadata={({ props }) => {
        // The real duration comes from the storyboard passed in at render time, which
        // is how the CLI renders an arbitrary run without editing this file.
        const storyboard = Storyboard.parse(props.storyboard);
        return { durationInFrames: storyboardDuration(storyboard) };
      }}
    />

    {TEMPLATE_NAMES.map((name) => {
      const storyboard = singleSceneStoryboard(name);
      return (
        <Composition
          key={name}
          id={`Template-${name}`}
          component={Explainer}
          width={WIDTH}
          height={HEIGHT}
          fps={FPS}
          durationInFrames={storyboardDuration(storyboard)}
          defaultProps={{ storyboard, showCaptions: false } as ExplainerProps}
          schema={ExplainerProps}
        />
      );
    })}
  </>
);
