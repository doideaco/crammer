import { AbsoluteFill, Audio, Sequence, staticFile } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import {
  TRANSITION_FRAMES,
  sceneDuration,
  type ExplainerProps,
  type Scene as SceneType,
} from "@crammer/schema";
import { TEMPLATES } from "./templates";
import { Captions } from "./components/Captions";
import { CaptionsProvider } from "./components/CaptionContext";
import { theme } from "./theme";
import { fontFamily } from "./fonts";

/** Renders one scene's template with its typed props. */
const SceneBody: React.FC<{ scene: SceneType }> = ({ scene }) => {
  // The discriminated union guarantees props match the template, but the lookup is
  // by string, so one cast is unavoidable here. It is the only one in the project.
  const Template = TEMPLATES[scene.template] as React.FC<Record<string, unknown>>;
  return <Template {...(scene.props as Record<string, unknown>)} />;
};

const SceneFrame: React.FC<{ scene: SceneType; showCaptions: boolean }> = ({
  scene,
  showCaptions,
}) => (
  <AbsoluteFill style={{ fontFamily, background: theme.color.paper }}>
    <CaptionsProvider value={showCaptions && scene.audio !== undefined}>
      <SceneBody scene={scene} />
    </CaptionsProvider>
    {scene.audio ? (
      <>
        <Audio src={staticFile(scene.audio.path)} />
        {showCaptions ? (
          <Sequence from={0}>
            <Captions audio={scene.audio} />
          </Sequence>
        ) : null}
      </>
    ) : null}
  </AbsoluteFill>
);

/**
 * The single composition. Scenes are laid out in a `TransitionSeries` so consecutive
 * scenes cross-fade; narration audio rides inside each scene, which keeps regenerating
 * one scene's voice from shifting anything else.
 */
export const Explainer: React.FC<ExplainerProps> = ({ storyboard, showCaptions }) => {
  const scenes = storyboard.scenes;

  return (
    <AbsoluteFill style={{ background: theme.color.paper }}>
      <TransitionSeries>
        {scenes.map((scene, i) => [
          <TransitionSeries.Sequence key={scene.id} durationInFrames={sceneDuration(scene)}>
            <SceneFrame scene={scene} showCaptions={showCaptions} />
          </TransitionSeries.Sequence>,
          i < scenes.length - 1 ? (
            <TransitionSeries.Transition
              key={`t-${scene.id}`}
              presentation={fade()}
              timing={linearTiming({ durationInFrames: TRANSITION_FRAMES })}
            />
          ) : null,
        ])}
      </TransitionSeries>
    </AbsoluteFill>
  );
};
