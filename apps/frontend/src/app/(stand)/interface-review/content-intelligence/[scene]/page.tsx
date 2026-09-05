import { notFound } from 'next/navigation';
import { resolveInterfaceReviewContext } from '../../../../../components/interface-review/fixture-contract';
import * as sources from '../../../../../components/content-intelligence/sources.review-scene';
import * as provenance from '../../../../../components/content-intelligence/provenance.review-scene';
import * as contentSection from '../../../../../components/content-intelligence/content-section.review-scene';
import * as contentFacts from '../../../../../components/content-intelligence/content-facts.review-scene';
import * as voiceEmpty from '../../../../../components/brand-voice/voice-empty.review-scene';
import * as voicePaths from '../../../../../components/brand-voice/voice-paths.review-scene';
import * as voiceSamples from '../../../../../components/brand-voice/voice-samples.review-scene';
import * as voiceAnalysis from '../../../../../components/brand-voice/voice-analysis.review-scene';
import * as voiceProposal from '../../../../../components/brand-voice/voice-proposal.review-scene';
import * as voiceRedactions from '../../../../../components/brand-voice/voice-redactions.review-scene';
import * as voiceRibbon from '../../../../../components/brand-voice/voice-ribbon.review-scene';
import * as voiceMaterials from '../../../../../components/brand-voice/voice-materials.review-scene';
import * as voiceBrief from '../../../../../components/brand-voice/voice-brief.review-scene';
import * as voicePassport from '../../../../../components/brand-voice/voice-passport.review-scene';
import * as voiceScales from '../../../../../components/brand-voice/voice-scales.review-scene';
import * as voiceVersions from '../../../../../components/brand-voice/voice-versions.review-scene';
import * as voiceAvatars from '../../../../../components/brand-voice/voice-avatars.review-scene';

export const dynamic = 'force-dynamic';

const scenes = {
  sources,
  provenance,
  'content-section': contentSection,
  'content-facts': contentFacts,
  'voice-empty': voiceEmpty,
  'voice-paths': voicePaths,
  'voice-samples': voiceSamples,
  'voice-analysis': voiceAnalysis,
  'voice-proposal': voiceProposal,
  'voice-redactions': voiceRedactions,
  'voice-ribbon': voiceRibbon,
  'voice-materials': voiceMaterials,
  'voice-brief': voiceBrief,
  'voice-passport': voicePassport,
  'voice-scales': voiceScales,
  'voice-versions': voiceVersions,
  'voice-avatars': voiceAvatars,
} as const;
type SceneName = keyof typeof scenes;
type ReviewQuery = Partial<
  Record<'state' | 'theme' | 'locale' | 'viewport', string | string[]>
>;

export default async function ContentIntelligenceReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ scene: string }>;
  searchParams: Promise<ReviewQuery>;
}) {
  const { scene: requestedScene } = await params;
  const selected = scenes[requestedScene as SceneName];
  if (!selected) notFound();

  let context;
  try {
    context = resolveInterfaceReviewContext(
      await searchParams,
      selected.scene.states
    );
  } catch {
    notFound();
  }

  const Scene = selected.Scene;
  return <Scene context={context} />;
}
