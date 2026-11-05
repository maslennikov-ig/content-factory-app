import type { ClipScenarioV1 } from './contracts/native-clip-preproduction.v1';
import type { HggPilotStageV1 } from '../../videos/subscriptions/video-hgg-pilot-stage.v1';

/** Pure exact provider prompt. Quote and generation consume this same retained string. */
export function clipPilotPromptV1(scenario: ClipScenarioV1, stage: HggPilotStageV1): string {
  const {directionsLanguage, outputLocale, targetSeconds, aspectRatio, firstFrameDirections, lastFrameDirections, motionDirections, screenText, spokenText, captions} = scenario;
  return JSON.stringify({stage, task: stage === 'clip'
    ? 'Generate the accepted continuous five-second portrait motion between the exact ordered first and last image. Follow the approved motion and public-text timing; preserve public copy exactly.'
    : `Generate only the requested ${stage === 'first_frame' ? 'first' : 'last'} portrait frame of this accepted continuous five-second scenario. Follow its ${stage === 'first_frame' ? 'first' : 'last'}-frame directions and approved text timing. Other directions describe continuity, not extra content to add to this frame. Preserve any public copy used in this frame exactly; no added factual claims, identities, logos or unapproved assets.`,
    directionsLanguage, outputLocale, targetSeconds, aspectRatio, firstFrameDirections, lastFrameDirections, motionDirections, screenText, spokenText, captions,
    direction: stage === 'clip' ? scenario.motionDirections : stage === 'first_frame' ? scenario.firstFrameDirections : scenario.lastFrameDirections});
}
