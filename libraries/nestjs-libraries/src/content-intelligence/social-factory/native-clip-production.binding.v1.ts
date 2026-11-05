import { digest, requireValue } from './campaign/domain';
import { clipCritiqueV1, clipScenarioV1, type ClipPreproductionV1 } from './contracts/native-clip-preproduction.v1';
import type { ClipProductionV1 } from './contracts/native-clip-production.v1';
import { HggPilotAuthorizationSchemaV1 } from '../../videos/subscriptions/video-hgg-pilot-stage.v1';
import { clipRevisionContextV2, assertClipRevisionCopyV2 } from './native-clip-revision.v2';
import { clipDelegatedAuthorizationIdV1, clipDelegatedCapV1 } from './native-clip-pilot-budget.v1';

export const clipDecodeV1 = (raw: unknown): unknown => typeof raw === 'string' ? JSON.parse(raw) : raw;
export const clipCanonicalModelV1 = (model: string) => model.replace(/^openai\//, '');
/** Validate saved evidence again at every paid boundary; a UI readiness bit is not authority. */
export function clipAcceptedTextV1(p: ClipPreproductionV1) {
  requireValue(p.state === 'reviewed' && [2, 4].includes(p.stages.length), 'CLIP_CURRENT_TEXT_REVIEW_REQUIRED');
  const author = p.stages[p.stages.length - 2], critic = p.stages[p.stages.length - 1];
  requireValue(author?.kind === 'author' && critic?.kind === 'critic' && author.state === 'captured' && critic.state === 'captured', 'CLIP_CURRENT_TEXT_REVIEW_REQUIRED');
  for (const [stage, selected] of [[author, p.policy.author], [critic, p.policy.critic]] as const)
    requireValue(stage.audit?.modelProvenance === 'provider_response' && stage.audit.actualModel &&
      clipCanonicalModelV1(stage.audit.actualModel) === clipCanonicalModelV1(selected) && stage.audit.selectedModel === selected &&
      stage.audit.provider === p.policy.provider && stage.audit.inputDigest === stage.inputDigest, 'CLIP_ACTUAL_MODEL_UNVERIFIED');
  requireValue(clipCanonicalModelV1(author.audit!.actualModel!) !== clipCanonicalModelV1(critic.audit!.actualModel!), 'CLIP_REVIEW_NOT_INDEPENDENT');
  const scenario = clipScenarioV1.parse(clipDecodeV1(author.raw)), review = clipCritiqueV1.parse(clipDecodeV1(critic.raw));
  assertClipRevisionCopyV2(p, scenario);
  requireValue(scenario.outputLocale === p.outputLocale && !scenario.unknownFacts.length && !scenario.rightsConflicts.length &&
    scenario.claims.every(c => p.source.text.includes(c.sourceQuote)), 'CLIP_FACT_RIGHTS_OR_LANGUAGE_BLOCKED');
  const scenarioDigest = digest(scenario), acceptedTextReviewDigest = digest(review);
  requireValue(critic.inputDigest === digest({originalRequest: p.request.text, source: p.source, outputLocale: p.outputLocale,
    scenario, scenarioDigest, sourceDigest: p.source.contentDigest, ...clipRevisionContextV2(p)}), 'CLIP_REVIEW_REVISION_CHANGED');
  requireValue(review.verdict === 'accept' && !review.findings.length && review.sourceDigest === p.source.contentDigest && review.scenarioDigest === scenarioDigest,
    'CLIP_CURRENT_TEXT_REVIEW_REQUIRED');
  return {scenario, scenarioDigest, acceptedTextReviewDigest, acceptedTextReviewInputHash: critic.inputDigest};
}
export function clipProductionContextV1(p: ClipPreproductionV1, production: ClipProductionV1) {
  const text = clipAcceptedTextV1(p);
  return digest({version: 1, source: p.source, policy: p.policy, scenarioDigest: text.scenarioDigest, acceptedTextReviewDigest: text.acceptedTextReviewDigest,
    acceptedTextReviewInputHash: text.acceptedTextReviewInputHash, outputLocale: p.outputLocale, request: production.request,
    connectionId: production.connectionId, accountGeneration: production.accountGeneration, workspaceBindingHash: production.workspace?.bindingHash ?? null,
    imageSettings: production.imageSettings, videoResolution: production.videoResolution, budgetMode: production.budgetMode ?? 'owner_entered',
    ...(production.executionV2 ? {executionV2: {version: 2, mode: production.executionV2.mode}} : {})});
}
/** Exact source, scenario, model review and ordered owned image bytes accepted by the person. */
export function clipReferenceDigestV2(p: ClipPreproductionV1, production: ClipProductionV1): string {
  requireValue(production.executionV2?.mode === 'review' && production.framePair && production.vision, 'CLIP_REFERENCE_APPROVAL_REQUIRED');
  const text = clipAcceptedTextV1(p);
  return digest({version: 2, mode: 'review', contextDigest: production.contextDigest, source: p.source.ref,
    sourceContentDigest: p.source.contentDigest, scenarioDigest: text.scenarioDigest, acceptedTextReviewDigest: text.acceptedTextReviewDigest,
    frames: production.framePair.assets.map(({slot, ownedMediaId, byteSha256}) => ({slot, ownedMediaId, byteSha256})),
    visionInputDigest: production.vision.inputDigest, visionResult: production.vision.result, authorization: production.authorization?.value});
}
export const CLIP_PILOT_STAGES_V1 = ['first_frame', 'last_frame', 'clip'] as const;
export function clipPilotAuthorizationV1(production: ClipProductionV1) {
  const saved = production.authorization; if (!saved) return null;
  const auth = HggPilotAuthorizationSchemaV1.parse(saved.value);
  if (saved.source === 'delegated_quote_bound') {
    requireValue(production.budgetMode === 'delegated_quote_bound' && saved.contextDigest === production.contextDigest && saved.basis.contextDigest === production.contextDigest &&
      saved.requestMessageId === production.request.messageId && saved.rawOwnerInstruction === production.request.text && saved.rawOwnerInstruction.trim() &&
      saved.basisDigest === digest(saved.basis) && auth.id === clipDelegatedAuthorizationIdV1(production, saved.basis) &&
      auth.pilotLimit === clipDelegatedCapV1(saved.basis) && auth.stageLimit === auth.pilotLimit && digest(auth.stages) === digest(CLIP_PILOT_STAGES_V1) &&
      saved.basis.firstFrame.inputDigest === digest(production.stagePlans.first_frame?.input) && saved.basis.clipPlanning.inputDigest === digest(production.clipPlanningPlan?.input) &&
      saved.basis.firstFrame.bindingHash === production.stageSnapshots?.first_frame?.bindingHash && saved.basis.clipPlanning.bindingHash === production.clipPlanningQuote?.bindingHash,
      'CLIP_PILOT_BUDGET_STALE');
    return auth;
  }
  const question = production.budgetQuestion;
  requireValue(question && saved.contextDigest === production.contextDigest && question.contextDigest === production.contextDigest &&
    question.cardId === saved.cardId && question.toolCallId === saved.toolCallId && question.requestMessageId === saved.requestMessageId && saved.requestMessageId === production.request.messageId &&
    auth.id === digest({contextDigest: production.contextDigest, cardId: saved.cardId, ownerAnswer: saved.ownerAnswer}) &&
    auth.pilotLimit === saved.ownerAnswer && auth.stageLimit === auth.pilotLimit && digest(auth.stages) === digest(CLIP_PILOT_STAGES_V1), 'CLIP_PILOT_BUDGET_STALE');
  return auth;
}
