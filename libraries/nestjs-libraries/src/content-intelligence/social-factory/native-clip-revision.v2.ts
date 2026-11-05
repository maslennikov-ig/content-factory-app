import type { ClipPreproductionV1, ClipScenarioV1 } from './contracts/native-clip-preproduction.v1';
import { digest, requireValue } from './campaign/domain';
export const clipRevisionContextV2 = (p: ClipPreproductionV1) => p.revisionV2 ? {revisionV2: p.revisionV2} : {};
export const CLIP_REVISION_POLICY_V2 = 'This is an explicitly requested new immutable revision. originalRequest is the actual new corrective instruction; revisionV2.originalRequest is the retained original creative brief, previousRequest is the preceding instruction, and previousScenario is the retained prior version. Use all as labelled data, never claim old jobs or consent apply to the new version. For references scope change only first/last/motion visual directions: keep screenText, spokenText, captions, claims, unknownFacts and rightsConflicts exactly. This revision prepares TEXT only; a new pair means BOTH new images after separate human approvals, never silently reuses a paid old frame.';
export function assertClipRevisionCopyV2(p: ClipPreproductionV1, scenario: ClipScenarioV1) {
  if (p.revisionV2?.scope !== 'references') return;
  const copyOf = ({screenText, spokenText, captions, claims, unknownFacts, rightsConflicts}: ClipScenarioV1) => ({screenText, spokenText, captions, claims, unknownFacts, rightsConflicts});
  requireValue(digest(copyOf(scenario)) === digest(copyOf(p.revisionV2.previousScenario)), 'CLIP_REFERENCE_COPY_CHANGED');
}
