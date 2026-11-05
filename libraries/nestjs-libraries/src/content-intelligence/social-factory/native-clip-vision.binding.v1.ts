import { digest, requireValue } from './campaign/domain';
import type { ClipPreproductionV1 } from './contracts/native-clip-preproduction.v1';
import type { ClipProductionV1, ClipVisionReviewPublicV1, ClipVisionCheckpointV1 } from './contracts/native-clip-production.v1';
import { clipAcceptedTextV1, clipProductionContextV1, clipCanonicalModelV1 } from './native-clip-production.binding.v1';

export function clipVisionInputV1(p: ClipPreproductionV1, production: ClipProductionV1) {
  const text = clipAcceptedTextV1(p), frames = production.framePair?.assets;
  requireValue(frames?.length === 2 && frames[0].slot === 'first' && frames[1].slot === 'last' && frames[0].ownedMediaId !== frames[1].ownedMediaId, 'CLIP_OWNED_FRAME_PAIR_REQUIRED');
  return {version: 1, originalRequest: production.request.text, source: p.source, outputLocale: p.outputLocale, scenario: text.scenario,
    sourceContentDigest: p.source.contentDigest, scenarioDigest: text.scenarioDigest, acceptedTextReviewDigest: text.acceptedTextReviewDigest,
    acceptedTextReviewInputHash: text.acceptedTextReviewInputHash,
    frames: frames.map(frame => ({slot: frame.slot, ownedMediaId: frame.ownedMediaId, byteSha256: frame.byteSha256}))};
}
export function clipVisionPublicV1(p: ClipPreproductionV1, production: ClipProductionV1, current: boolean): ClipVisionReviewPublicV1 | null {
  const saved = production.vision; if (!saved) return null;
  try { current = current && production.contextDigest === clipProductionContextV1(p, production) && saved.inputDigest === digest(clipVisionInputV1(p, production)); }
  catch { current = false; }
  const expired = saved.state === 'running' && (!saved.leaseUntil || Date.parse(saved.leaseUntil) <= Date.now());
  return {state: current ? expired ? 'uncertain' : saved.state : 'stale', current, inputKind: 'image_bytes', selectedModel: saved.selectedModel,
    actualModel: saved.audit?.actualModel ?? null, sourceContentDigest: saved.sourceContentDigest, scenarioDigest: saved.scenarioDigest,
    acceptedTextReviewDigest: saved.acceptedTextReviewDigest, inputDigest: saved.inputDigest, frames: saved.frames,
    verdict: saved.result?.verdict ?? null, findings: saved.result?.findings ?? [], blocker: saved.blocker ?? (expired ? 'CLIP_VISION_OPERATION_UNCERTAIN' : null)};
}

/** Compare a receipt to its own immutable request selection, including legacy reviews. */
export function clipVisionModelVerifiedV1(p: ClipPreproductionV1, saved?: ClipVisionCheckpointV1): boolean {
  const audit = saved?.audit, provider = saved?.selectedProvider ?? p.policy.provider;
  return !!(saved?.selectedModel && audit?.modelProvenance === 'provider_response' && audit.actualModel &&
    provider === p.policy.provider && audit.provider === provider && audit.inputDigest === saved.inputDigest &&
    audit.selectedModel === saved.selectedModel && clipCanonicalModelV1(audit.actualModel) === clipCanonicalModelV1(saved.selectedModel) &&
    clipCanonicalModelV1(audit.actualModel) !== clipCanonicalModelV1(p.policy.author) &&
    Array.isArray(audit.providerReportedModels) && audit.providerReportedModels.length > 0 && audit.providerReportedModels.every(model => typeof model === 'string' && clipCanonicalModelV1(model) === clipCanonicalModelV1(audit.actualModel!)));
}
