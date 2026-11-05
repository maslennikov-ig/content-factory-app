import { MASTRA_RESOURCE_ID_KEY, MASTRA_THREAD_ID_KEY } from '@mastra/core/request-context';
import { SocialFactoryController } from '@contentfactory/backend/api/routes/social-factory.controller';
import { NativeClipPreproductionServiceV1 } from '@contentfactory/nestjs-libraries/content-intelligence/social-factory/native-clip-preproduction.service.v1';
import { clipRevisionInputV2 } from '../../../content-intelligence/social-factory/contracts/native-clip-revision.v2';
import { assertSelectedClipV2 } from './native-clip-context.v2';
import { clipPreproductionInputV1, clipPreproductionOpenV1 } from '../../../content-intelligence/social-factory/contracts/native-clip-preproduction.v1';
import { readCapabilityContextValue } from '../capability.context';
import { defineCapability, door, type CapabilityRunContext } from '../capability.types';
import { unspentFailure } from './selection';

const threadOf = (ctx: CapabilityRunContext) => {
  const threadId = readCapabilityContextValue(ctx.requestContext, MASTRA_THREAD_ID_KEY);
  if (typeof threadId !== 'string' || !threadId || readCapabilityContextValue(ctx.requestContext, MASTRA_RESOURCE_ID_KEY) !== `${ctx.organizationId}:${ctx.userId}`)
    throw unspentFailure('CLIP_OWNED_CHAT_REQUIRED', 'Continue in the original owned chat.');
  return threadId;
};
const shared = { group: 'media' as const, card: 'clip-preproduction' as const, entrances: ['chat'] as const, untrusted: ['workspace-text'] as const };
const cardOf = (out: { pilotId: string; pieceId: string; threadId: string }) => ({ kind: 'clip-preproduction' as const, id: out.pilotId, pieceId: out.pieceId, threadId: out.threadId });
export const videoPreproduction = defineCapability({
  ...shared, id: 'video.preproduction', label: { ru: 'Сценарий и независимая проверка', en: 'Scenario and independent review' },
  description: 'Prepare TEXT only for one five-second portrait clip in this original chat. First perform actual research.search for external evidence, read retained sources with piece.read, save the evidence-backed source piece via piece.create/from-research, then pass its exact source.resolve_artifact pin and original authored requestMessageId. Reuse saved results. This tool explicitly selects the configured secondary writer and different advanced critic, captures actual model provenance, and permits at most one targeted revision and two reviews (four scenario content operations, not total chat/research cost). Missing facts/rights block; the critic cannot invent answers. English visual directions remain separate from chosen outputLocale and exact public copy. The dedicated clip-preproduction card reads current text preparation and review; its source-piece link opens the SOURCE BRIEF. Neither is a generated video or publication. This TEXT tool creates no frames/video. After an actual NEW production-preparation request, use video.pilot_prepare with this saved pilotId for the separate automatic frame-pair/Higgsfield route. Never infer a price, silently use API funding or call a completed video ready from this text result. On replay use the same original request/source; unknown stages must not be purchased again. Read video.preproduction_open after reload.',
  input: clipPreproductionInputV1, risk: 'paid', door: door(SocialFactoryController, 'preproduceClip'),
  run: async (ctx, input) => {
    const threadId = threadOf(ctx), original = await ctx.resolveAuthorRequest?.({ requestMessageId: input.requestMessageId });
    if (!original) throw unspentFailure('CLIP_ORIGINAL_REQUEST_REQUIRED', 'Use the exact original author message from this chat.');
    return ctx.service(NativeClipPreproductionServiceV1).prepare(ctx.organizationId, ctx.userId, threadId, original, input);
  }, summarize: output => output, cardOf,
});
export const videoPreproductionOpen = defineCapability({
  ...shared, id: 'video.preproduction_open', label: { ru: 'Сохранённый сценарий', en: 'Saved scenario' },
  description: 'Reopen the same owned chat’s saved source-backed clip scenario, actual different-model review and stage blockers without model calls. The dedicated clip-preproduction card reads current text preparation and review; the source-piece link is only the brief. Text readiness is separate from frames/video; stale source invalidates current review acceptance while raw history remains preserved. Never create another request to bypass an unknown paid stage.',
  input: clipPreproductionOpenV1, risk: 'read', door: door(SocialFactoryController, 'openClipPreproduction'),
  run: (ctx, input) => ctx.service(NativeClipPreproductionServiceV1).open(ctx.organizationId, ctx.userId, threadOf(ctx), input.pilotId),
  summarize: output => output, cardOf,
});
export const videoPreproductionResumeReview = defineCapability({
  ...shared, id: 'video.preproduction_resume_review', label: {ru: 'Продолжить проверку сценария', en: 'Resume scenario review'},
  description: 'Explicitly continue the same saved clip parent when its old CLIP_FACT_RIGHTS_OR_LANGUAGE_BLOCKED gate stopped after exactly one captured verified author and before the independent critic. Reuses the exact retained author raw text, original request, current source pin and model policy; never buys another initial author or rewrites that capture. The critic may request one targeted fix for fixable source/rights/format/creative findings, or block essential missing facts/rights; final acceptance still requires empty unresolved flags and exact source-grounded copy/current independent review. Completed, uncertain or started stages are never repurchased; use the saved parent, never a fresh request to bypass uncertainty. This is TEXT review only, no frames/video/provider generation.',
  input: clipPreproductionOpenV1, risk: 'paid', door: door(SocialFactoryController, 'resumeClipPreproductionReview'),
  run: (ctx, input) => ctx.service(NativeClipPreproductionServiceV1).resumeReview(ctx.organizationId, ctx.userId, threadOf(ctx), input.pilotId),
  summarize: output => output, cardOf,
});
export const videoPreproductionReviseV2 = defineCapability({
  ...shared, id: 'video.preproduction_revise_v2', label: {ru: 'Подготовить новую версию сценария или кадров', en: 'Prepare a revised scenario or references'}, risk: 'paid',
  input: clipRevisionInputV2, door: door(SocialFactoryController, 'reviseClipPreproductionV2'),
  description: 'On a NEW actual authored correction to the selected saved scenario, create a LINKED NEW immutable TEXT preparation in this SAME owned chat. Pass exact selected pilotId, actual NEW requestMessageId and scope scenario or references. Keep original brief/source and previous scenario as separate retained context. References scope changes only visual directions; exact public screen/spoken/caption copy and claims remain unchanged. This means BOTH new images later, not selective last-frame repair/reuse. Existing author+independent critic execute once with bounded targeted fix; unknown/active original work blocks circumvention. Never change the original parent/jobs/assets/consents/costs or clone its spend permission. New child defaults REVIEW and has NO production/budget/permission: it needs separate media preparation and both nondelegable human approvals. No frames/video/provider generation/publication here. Reopen the child on replay; do not buy another revision for uncertain work.',
  run: async (ctx, input) => {
    assertSelectedClipV2(ctx, input.pilotId);
    const original = await ctx.resolveAuthorRequest?.({requestMessageId: input.requestMessageId});
    if (!original) throw unspentFailure('CLIP_NEW_REVISION_REQUEST_REQUIRED', 'Use the actual new authored correction from this owned chat.');
    return ctx.service(NativeClipPreproductionServiceV1).reviseV2(ctx.organizationId, ctx.userId, threadOf(ctx), original, input);
  }, summarize: output => output, cardOf,
});
export const NATIVE_CLIP_PREPRODUCTION_CAPABILITIES_V1 = [videoPreproduction, videoPreproductionOpen, videoPreproductionResumeReview, videoPreproductionReviseV2] as const;
