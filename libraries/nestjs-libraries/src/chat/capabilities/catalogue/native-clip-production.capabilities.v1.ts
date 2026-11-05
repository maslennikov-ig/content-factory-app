import { MASTRA_RESOURCE_ID_KEY, MASTRA_THREAD_ID_KEY } from '@mastra/core/request-context';
import { SocialFactoryController } from '@contentfactory/backend/api/routes/social-factory.controller';
import { NativeClipProductionServiceV1 } from '@contentfactory/nestjs-libraries/content-intelligence/social-factory/native-clip-production.service.v1';
import { clipPreproductionOpenV1 } from '../../../content-intelligence/social-factory/contracts/native-clip-preproduction.v1';
import { clipReferenceLaunchV2 } from '../../../content-intelligence/social-factory/contracts/native-clip-execution.v2';
import { clipProductionPrepareV1, clipProductionLaunchV1, clipLastFrameRepairLaunchV1, clipLastFrameRepairRefreshV1, clipProductionRecoverV1, clipProductionBudgetQuestionV1, clipProductionBudgetAnswerV1 } from '../../../content-intelligence/social-factory/contracts/native-clip-production.v1';
import { createNativeQuestionTool } from '../../conductor/native-question-batch';
import { readCapabilityContextValue } from '../capability.context';
import { defineCapability, door, type CapabilityRunContext } from '../capability.types';
import { unspentFailure } from './selection';
import { assertSelectedClipV2 } from './native-clip-context.v2';

const threadOf = (ctx: Pick<CapabilityRunContext, 'organizationId' | 'userId' | 'requestContext'>, pilotId?: string) => {
  if (pilotId) assertSelectedClipV2(ctx, pilotId);
  const thread = readCapabilityContextValue(ctx.requestContext, MASTRA_THREAD_ID_KEY);
  if (typeof thread !== 'string' || !thread || readCapabilityContextValue(ctx.requestContext, MASTRA_RESOURCE_ID_KEY) !== `${ctx.organizationId}:${ctx.userId}`)
    throw unspentFailure('CLIP_OWNED_CHAT_REQUIRED', 'Continue in the saved pilot’s original owned chat.');
  return thread;
};
const shared = {group: 'media' as const, card: 'clip-preproduction' as const, entrances: ['chat'] as const, untrusted: ['workspace-text'] as const};
const cardOf = (out: {pilotId: string; pieceId: string; threadId: string}) => ({kind: 'clip-preproduction' as const, id: out.pilotId, pieceId: out.pieceId, threadId: out.threadId});
const repairApprovalSummaries: Record<string, (value: {price: string; remaining: string; cap: string}) => string> = {
  ru: v => `Исправить только последний кадр: текущая цена ${v.price} кредитов Higgsfield, остаток прежнего лимита ${v.remaining} из ${v.cap}. Первый кадр и сценарий сохраняются. Новая проверка двух изображений учитывается отдельно; клип возможен только после её принятия и новой проверки цены. Повторной попытки при отклонении не будет.`,
  en: v => `Correct only the last frame: current price ${v.price} Higgsfield credits, ${v.remaining} remaining within the original ${v.cap} cap. Keep the first frame and scenario. New two-image review is metered separately; the clip requires acceptance and a fresh price check. Rejection will not trigger another attempt.`,
};
export const videoPilotPrepare = defineCapability({
  ...shared, id: 'video.pilot_prepare', label: {ru: 'Подготовить выбранный режим пилота', en: 'Prepare the selected pilot mode'}, risk: 'write',
  input: clipProductionPrepareV1, door: door(SocialFactoryController, 'prepareClipPilot'),
  description: 'After current independent TEXT review, prepare the first frame -> conditioned last frame -> independent two-image review -> Kling clip route under the saved per-pilot mode (new pilots default to REVIEW) in the SAME saved pilot. Call only for an actual NEW authored production-preparation request; the old text-only test request supplies no selection/price permission. Input only pilotId. Server discovers the actual owned personal Higgsfield connection and fresh sole private-owner workspace, asks a real choice if ambiguous, and binds approved English visual fields to exact source/scenario/review. No private model/workspace/environment IDs or operator injection. Preparation may select the sole owner context and read the first actual price; it does not generate or approve spending. Then video.pilot_budget asks ONE actual owner total-credit fact for all three HGG stages; video.pilot_launch asks native human approval of the exact scenario and image pair generation. In REVIEW mode it authorizes NO VIDEO: after both actual images and independent review, use video.pilot_launch_reviewed_clip_v2 for separate human pair+cap consent; only then request a fresh clip quote and admit ONE video within the retained cap. Explicit/historical autopilot retains its original whole-pilot consent. Never invent rights, entitlement, budget, provider validation or billing caps. Repeated read/open never generates, quotes or retries an unknown operation.',
  run: async (ctx, input) => {
    const request = await ctx.resolveAuthorRequest?.({});
    if (!request) throw unspentFailure('CLIP_NEW_PRODUCTION_REQUEST_REQUIRED', 'Use the actual current authored production request from this chat.');
    return ctx.service(NativeClipProductionServiceV1).prepare(ctx.organizationId, ctx.userId, threadOf(ctx, input.pilotId), request, input);
  }, summarize: out => out, cardOf,
});
export const videoPilotPrepareDelegated = defineCapability({
  ...shared, id: 'video.pilot_prepare_delegated', label: {ru: 'Подготовить пилот с порученными расходами', en: 'Prepare delegated-spend pilot'}, risk: 'write',
  input: clipProductionPrepareV1, door: door(SocialFactoryController, 'prepareClipPilotDelegated'),
  description: 'Use for the actual NEW authored instruction that explicitly delegates necessary spend for THIS ONE pilot. Input ONLY pilotId; no budget number, invented fact, boolean permission, provider IDs or paths. Retains the exact authenticated current USER request as production.request/raw instruction, keeps original creative brief immutable, discovers the actual sole personal HGG context. Proposes one finite SERVER operational cap from exact current 1k first-frame and 720p clip-planning quotes: max(1,ceil(1.25*(2*firstFrameQuotedCredits+clipPlanningQuotedCredits))). The second image term is explicitly an estimate, not a quoted last-frame price. Planning frames[] has a separate non-generating intent outside the three paid slots and can NEVER admit a job. No ask_user/numeric owner question. This proposal alone grants no execution authority; the existing video.pilot_launch native approval shows the cap, estimate basis, exact scenario and saved execution mode. In REVIEW mode this supplies script/image-pair consent only; video.pilot_launch_reviewed_clip_v2 must separately obtain human approval of the actual pair before ONE video. Delegating necessary spend never delegates either creative acceptance. Every later actual quote must fit remaining cap; never automatically increase it or repurchase uncertain work. Manual budget users keep video.pilot_prepare then video.pilot_budget.',
  run: async (ctx, input) => {
    const request = await ctx.resolveAuthorRequest?.({});
    if (!request) throw unspentFailure('CLIP_NEW_PRODUCTION_REQUEST_REQUIRED', 'Use the actual current authored delegated-spend preparation request.');
    return ctx.service(NativeClipProductionServiceV1).prepare(ctx.organizationId, ctx.userId, threadOf(ctx, input.pilotId), request, input, 'delegated_quote_bound');
  }, summarize: out => out, cardOf,
});
export const videoPilotBudget = defineCapability({
  ...shared, id: 'video.pilot_budget', label: {ru: 'Общий лимит пилота', en: 'Pilot total credit limit'}, risk: 'input',
  input: clipPreproductionOpenV1, door: door(SocialFactoryController, 'clipPilotBudgetQuestion'),
  description: 'Ask ONE nondelegable native fact question for the actual owner’s total Higgsfield-credit limit covering first frame, last frame and clip. The model passes only pilotId, never an amount, wallet balance, per-job/month defaults or an invented authorization. The human answer resumes the exact server-held native question/card/tool/source/context. This supplies a finite budget fact, not execution consent; video.pilot_launch gives the one separate whole-pilot approval. Do not open three budget questions or answer for the person.',
  suspendSchema: clipProductionBudgetQuestionV1, resumeSchema: clipProductionBudgetAnswerV1,
  run: async (ctx, input, emit) => {
    const service = ctx.service(NativeClipProductionServiceV1), thread = threadOf(ctx, input.pilotId), toolCallId = ctx.nativeToolCallId;
    if (!toolCallId || !ctx.suspend) throw unspentFailure('CLIP_NATIVE_BUDGET_QUESTION_REQUIRED', 'Answer the pilot budget in its native question card.');
    const native = createNativeQuestionTool();
    if (ctx.resumeData !== undefined) {
      const payload = clipProductionBudgetQuestionV1.parse(ctx.suspendPayload), answer = clipProductionBudgetAnswerV1.parse(ctx.resumeData);
      const result = await (native as any).execute(payload, {requestContext: ctx.requestContext, agent: {resumeData: answer.answer}});
      if (result?.resolution !== 'person_reply') throw unspentFailure('CLIP_BUDGET_PERSON_ANSWER_REQUIRED', 'A person-supplied budget is required.');
      return service.answerBudget(ctx.organizationId, ctx.userId, thread, input.pilotId, toolCallId, payload, answer);
    }
    const view = await service.open(ctx.organizationId, ctx.userId, thread, input.pilotId);
    if (view.production?.authorization.state === 'authorized' || view.production?.authorization.limitSource === 'owner_delegated_necessary_one_pilot') return view;
    const payload = await service.budgetQuestion(ctx.organizationId, ctx.userId, thread, input.pilotId, toolCallId, ctx.language);
    await emit({kind: 'clip-preproduction', data: cardOf(view)});
    await (native as any).execute(payload, {requestContext: ctx.requestContext, agent: {suspend: ctx.suspend}});
    return undefined;
  }, summarize: out => out!, cardOf,
});
export const videoPilotLaunch = defineCapability({
  ...shared, id: 'video.pilot_launch', label: {ru: 'Запустить один пилот', en: 'Launch one pilot'}, risk: 'confirm',
  input: clipProductionLaunchV1, door: door(SocialFactoryController, 'launchClipPilot'),
  description: 'Native HUMAN approval of the displayed exact scenario under the saved per-pilot mode and actual finite total HGG-credit budget: first frame, conditioned last frame, actual independent two-image review, one five-second 9:16 Kling clip at the saved current resolution. Pass exact server preflightId and approvalHash from the same owned open.production.executionApproval; never client-build a hash or fabricate VideoPromptDraft. First quote is known, later prices are unknown and freshly checked within the same cap. This is local spending admission, not a provider billing cap or guaranteed actual charge. REVIEW mode (default for new pilots) permits only the first/last images and independent review, then DURABLY STOPS for separate video.pilot_launch_reviewed_clip_v2 human approval. Never use an ask_user/creative delegate as acceptance. Explicit or historical AUTOPILOT alone continues to one clip under the retained whole-pilot consent if all bindings remain current. Unknown/started operations are preserved, never replaced. Read/open does not launch.',
  beforeApproval: async (ctx, input) => {
    const view = await ctx.service(NativeClipProductionServiceV1).approval(ctx.organizationId, ctx.userId, input);
    if (!view.executionApproval.current || !view.executionApproval.canApprove || view.executionApproval.approved)
      throw unspentFailure('CLIP_PILOT_APPROVAL_CHANGED', 'Reopen the current pilot and its actual first quote/budget before approving.');
  },
  describeApproval: async (ctx, input) => {
    const view = await ctx.service(NativeClipProductionServiceV1).approval(ctx.organizationId, ctx.userId, input);
    const basis = view.authorization.capBasis;
    const provenance = basis ? ctx.language === 'ru'
      ? ` Рабочий лимит рассчитан по оценкам: первый кадр ${basis.firstFrameQuotedCredits}, последний кадр ориентировочно ${basis.estimatedLastFrameCredits}, план клипа ${basis.clipPlanningQuotedCredits}; запас 25%, округление вверх. Это не введённая владельцем сумма.`
      : ` Operational cap from estimates: first frame ${basis.firstFrameQuotedCredits}, last frame estimated ${basis.estimatedLastFrameCredits}, clip planning ${basis.clipPlanningQuotedCredits}; 25% buffer, rounded up. This is not an owner-entered amount.` : '';
    if (view.executionMode === 'review') return ctx.language === 'ru'
      ? `Принять показанный сценарий и создать два кадра. Общий лимит ${view.authorization.pilotLimit} кредитов Higgsfield; первая цена ${view.firstQuote?.amount ?? 'неизвестна'}, следующие проверяются отдельно.${provenance} Проверка изображений — отдельный расход ИИ. Видео НЕ разрешено: кадры требуют отдельного согласия, затем свежая цена видео должна уложиться в прежний остаток.`
      : `Accept the exact displayed scenario and create two frames. Total ${view.authorization.pilotLimit} Higgsfield credits; first quote ${view.firstQuote?.amount ?? 'unknown'}, later prices checked separately.${provenance} Image review is separate AI usage. Video is NOT authorized: approve the images separately, then the live clip price must fit the original remaining cap.`;
    return ctx.language === 'ru'
      ? `Запустить один пилот: первый кадр, последний кадр, проверка двух изображений и один клип Kling 5 с / ${view.videoResolution} / 9:16; кадры ${view.imageSettings.resolution}. Общий лимит ${view.authorization.pilotLimit} кредитов Higgsfield; первая цена ${view.firstQuote?.amount ?? 'неизвестна'}, последующие пока неизвестны.${provenance} Проверка кадров учитывается отдельно в расходах ИИ. Это локальный лимит допуска, не предел списания провайдера.`
      : `Launch one pilot: first frame, last frame, two-image review and one Kling clip, 5 s / ${view.videoResolution} / 9:16; images ${view.imageSettings.resolution}. Total ${view.authorization.pilotLimit} Higgsfield credits; first quote ${view.firstQuote?.amount ?? 'unknown'}, later prices unknown.${provenance} Image review is metered separately as AI usage. This is a local admission limit, not a provider billing cap.`;
  },
  approvalContent: (ctx, input) => ctx.service(NativeClipProductionServiceV1).approval(ctx.organizationId, ctx.userId, input),
  run: (ctx, input) => ctx.service(NativeClipProductionServiceV1).launch(ctx.organizationId, ctx.userId, threadOf(ctx, input.pilotId), input), summarize: out => out, cardOf,
});
export const videoPilotLaunchReviewedClipV2 = defineCapability({
  ...shared, id: 'video.pilot_launch_reviewed_clip_v2', label: {ru: 'Согласовать кадры и создать одно видео', en: 'Approve frames and create one video'}, risk: 'confirm',
  input: clipReferenceLaunchV2, door: door(SocialFactoryController, 'launchReviewedClipV2'),
  description: 'REVIEW mode only. After the actual owned first/last images and independent image review are saved, ask the PERSON to approve that exact pair and ONE clip within the retained finite cap. Pass ONLY pilotId and the same owned open.production.executionV2.referenceApproval.referenceDigest. The exact live clip price is checked AFTER human approval and must fit the remaining finite cap; no price is promised before that. This is a mandatory native human confirmation, never ask_user editorial delegation or an agent answer. Show both images. It cannot be replaced by the original script/image-pair approval, campaign autopilot, old whole-pilot consent or a prior pair. No extra job, reroll, cap increase, provider/payer change or publication. Source/frame/review changes invalidate consent.',
  beforeApproval: async (ctx, input) => {assertSelectedClipV2(ctx, input.pilotId);await ctx.service(NativeClipProductionServiceV1).referenceApprovalV2(ctx.organizationId, ctx.userId, input);},
  approvalContent: (ctx, input) => ctx.service(NativeClipProductionServiceV1).referenceApprovalV2(ctx.organizationId, ctx.userId, input),
  describeApproval: async (ctx, input) => {
    const view = await ctx.service(NativeClipProductionServiceV1).referenceApprovalV2(ctx.organizationId, ctx.userId, input);
    return ctx.language === 'ru'
      ? `Принять оба показанных кадра и создать ОДНО видео по этому сценарию в пределах оставшегося прежнего лимита (общий лимит ${view.authorization.pilotLimit} кредитов Higgsfield). Точную цену проверим после вашего согласия; превышение остатка остановит запуск без увеличения лимита. Фактическое списание провайдера неизвестно. Повторная генерация не разрешается.`
      : `Accept both displayed frames and create ONE video for this scenario within the remaining original cap (total ${view.authorization.pilotLimit} Higgsfield credits). The exact live price is checked after your approval; an estimate exceeding the remaining amount stops without increasing the cap. Actual provider charge is unknown. No repeat generation is authorized.`;
  },
  run: (ctx, input) => ctx.service(NativeClipProductionServiceV1).launchReviewedClipV2(ctx.organizationId, ctx.userId, threadOf(ctx, input.pilotId), input), summarize: out => out, cardOf,
});
export const videoPilotRecover = defineCapability({
  ...shared, id: 'video.pilot_recover', label: {ru: 'Восстановить сохранение пилота', en: 'Recover pilot result'}, risk: 'write',
  input: clipProductionRecoverV1, door: door(SocialFactoryController, 'recoverClipPilot'),
  description: 'Only the owned stage’s actual supported status_read or retry_save recovery. No new generation, new model, replacement frame pair or unknown-operation replay. Existing paid results may be recovered after a source change, while new paid stages remain blocked. Use only recoveryActions returned by the actual stage; do not invent cancel or regenerate.',
  run: (ctx, input) => ctx.service(NativeClipProductionServiceV1).recover(ctx.organizationId, ctx.userId, threadOf(ctx, input.pilotId), input.pilotId, input.stage, input.action), summarize: out => out, cardOf,
});
export const videoPilotPrepareLastFrameRepair = defineCapability({
  ...shared,id:'video.pilot_prepare_last_frame_repair',label:{ru:'Подготовить исправление последнего кадра',en:'Prepare last-frame correction'},risk:'write',
  input:clipProductionPrepareV1,door:door(SocialFactoryController,'prepareClipLastFrameRepair'),
  description:'For a NEW actual authored corrective instruction after a saved independent two-image rejection, prepare ONE last-frame-only repair in this same pilot/chat. Input only pilotId. Preserve the exact first image, source, accepted scenario, old jobs/assets/costs and rejection. Derive the correction from actual saved findings and authored instruction, quote a distinct idempotent last-frame intent under the UNCHANGED finite pilot cap. No generation or budget question. Read production.lastFrameRepair for its exact repairId/preflightId/approvalHash; a separate scoped native approval is required. Never replay an uncertain job, recreate the first frame, raise the cap or ignore typography findings.',
  run:async(ctx,input)=>{
    const request=await ctx.resolveAuthorRequest?.({});
    if(!request)throw unspentFailure('CLIP_NEW_REPAIR_REQUEST_REQUIRED','Use the actual current authored last-frame repair request.');
    return ctx.service(NativeClipProductionServiceV1).prepareLastFrameRepair(ctx.organizationId,ctx.userId,threadOf(ctx, input.pilotId),request,input);
  },summarize:out=>out,cardOf,
});
export const videoPilotLaunchLastFrameRepair = defineCapability({
  ...shared,id:'video.pilot_launch_last_frame_repair',label:{ru:'Подтвердить исправление последнего кадра',en:'Approve last-frame correction'},risk:'confirm',
  input:clipLastFrameRepairLaunchV1,door:door(SocialFactoryController,'launchClipLastFrameRepair'),
  description:'Approve the exact freshly quoted ONE last-frame repair from this owned pilot lastFrameRepair projection. Use its server repairId/preflightId/approvalHash, never the original pilot approval. Keep original first frame and all completed work. One fresh actual independent two-image review follows the new saved image; reject/unknown stops, accept permits only the original clip under fresh pricing and unchanged finite cap. Image review is metered separately. No blind rerolls or publication.',
  beforeApproval:(ctx,input)=>{assertSelectedClipV2(ctx,input.pilotId);return ctx.service(NativeClipProductionServiceV1).lastFrameRepairApproval(ctx.organizationId,ctx.userId,input).then(()=>undefined);},
  approvalContent:(ctx,input)=>ctx.service(NativeClipProductionServiceV1).lastFrameRepairApproval(ctx.organizationId,ctx.userId,input),
  describeApproval:async(ctx,input)=>{
    const v=await ctx.service(NativeClipProductionServiceV1).lastFrameRepairApproval(ctx.organizationId,ctx.userId,input);
    const locale=(ctx.interfaceLanguage??ctx.language).toLowerCase().replace(/_/g,'-');
    return (repairApprovalSummaries[locale]??repairApprovalSummaries[locale.split('-')[0]]??repairApprovalSummaries.en)({price:v.quote!.amount,remaining:v.ownerLimit!.remaining,cap:v.ownerLimit!.pilotLimit});
  },
  run:(ctx,input)=>ctx.service(NativeClipProductionServiceV1).launchLastFrameRepair(ctx.organizationId,ctx.userId,threadOf(ctx, input.pilotId),input),summarize:out=>out,cardOf,
});
export const videoPilotRefreshLastFrameRepairQuote = defineCapability({
  ...shared,id:'video.pilot_refresh_last_frame_repair_quote',label:{ru:'Обновить истёкшую цену исправления кадра',en:'Refresh expired frame-correction price'},risk:'write',
  input:clipLastFrameRepairRefreshV1,door:door(SocialFactoryController,'refreshClipLastFrameRepairQuote'),
  description:'For a NEW actual USER request to refresh the expired price of THIS existing lastFrameRepair, input only its pilotId and repairId. Reuse the SAME immutable correction instruction, first frame, source/scenario, plan, intent and preflight; archive prior quote and bind this new authored refresh separately. Only expired quoted/no-job/no-saved-execution-consent repairs can request a fresh provider estimate. A pending/interrupted refresh may ONLY read and adopt its already saved matching fresh preflight, with no new quote; if none is confirmed, stop without a retry. Never re-quote unexpired, pending, failed, approved, submitted or unknown-paid work. This creates NO job, grants NO consent and changes NO budget. Read the resulting fresh approvalHash; a NEW separate native video.pilot_launch_last_frame_repair approval is still required. Old hashes/consent cannot execute. No new repair attempt, prompt rewrite, first-frame regeneration, paid reroll or publication.',
  run:async(ctx,input)=>{
    const request=await ctx.resolveAuthorRequest?.({});
    if(!request)throw unspentFailure('CLIP_NEW_QUOTE_REFRESH_REQUEST_REQUIRED','Use the actual new authored request to refresh this saved repair price.');
    return ctx.service(NativeClipProductionServiceV1).refreshLastFrameRepairQuote(ctx.organizationId,ctx.userId,threadOf(ctx, input.pilotId),request,input);
  },summarize:out=>out,cardOf,
});
export const videoPilotStop = defineCapability({
  ...shared, id: 'video.pilot_stop', label: {ru: 'Остановить следующие этапы пилота', en: 'Stop further pilot stages'}, risk: 'write',
  input: clipPreproductionOpenV1, door: door(SocialFactoryController, 'stopClipPilot'),
  description: 'Retain a stop on this owned pilot so no further paid stage is admitted. It does not assert provider cancellation, erase costs or delete saved media/raw responses. An already submitted job remains recoverable. A stopped pilot is never silently restarted.',
  run: async (ctx, input) => {
    const request = await ctx.resolveAuthorRequest?.({});
    if (!request) throw unspentFailure('CLIP_ORIGINAL_REQUEST_REQUIRED', 'Use the actual stop request from this chat.');
    return ctx.service(NativeClipProductionServiceV1).stop(ctx.organizationId, ctx.userId, threadOf(ctx, input.pilotId), input.pilotId, request.messageId);
  }, summarize: out => out, cardOf,
});
export const videoPilotRenewCredentialsV2 = defineCapability({
  ...shared,id:'video.pilot_renew_credentials',label:{ru:'Обновить доступ текущего пилота',en:'Renew this pilot access'},risk:'confirm',
  input:clipProductionPrepareV1,door:door(SocialFactoryController,'renewClipPilotCredentialsV2'),
  description:'Explicitly renew only the SAME existing owner OAuth grant for this saved unsubmitted last-frame repair, after a native approval. Input ONLY pilotId. Server derives the exact retained connection, workspace, credential epoch and original owned frames. Never connect another account or replace the pilot, source, scenario, frame pair, original budget or repair. This grants NO price refresh, workspace selection, generation, job, submission or spend consent. After completed renewal use a separate new authored video.pilot_refresh_last_frame_repair_quote request and fresh repair approval. Pending/unknown renewal may only read its saved result; never rotate again or replay a lost outcome.',
  beforeApproval:async(ctx,input)=>{await ctx.service(NativeClipProductionServiceV1).credentialRenewalApproval(ctx.organizationId,ctx.userId,input);},
  approvalContent:(ctx,input)=>ctx.service(NativeClipProductionServiceV1).credentialRenewalApproval(ctx.organizationId,ctx.userId,input),
  describeApproval:async(ctx,input)=>{await ctx.service(NativeClipProductionServiceV1).credentialRenewalApproval(ctx.organizationId,ctx.userId,input);return ctx.language==='ru'?'Обновить доступ через то же подключение и проверить прежнее личное рабочее пространство. Сценарий, кадры и лимит сохраняются. Цена и генерация отдельно не разрешаются.':'Renew access through the same connection and observe the same private workspace. Preserve the scenario, frames and budget. No quote or generation is authorized.';},
  run:async(ctx,input)=>{const request=await ctx.resolveAuthorRequest?.({});if(!request)throw unspentFailure('CLIP_NEW_CREDENTIAL_RENEWAL_REQUEST_REQUIRED','Use the actual authored renewal request in this owned chat.');return ctx.service(NativeClipProductionServiceV1).renewCredentialsV2(ctx.organizationId,ctx.userId,threadOf(ctx, input.pilotId),request,input);},
  summarize:out=>out,cardOf,
});
export const videoPilotRecoverVisionFencedV1 = defineCapability({
  ...shared,id:'video.pilot_recover_vision_fenced_v1',label:{ru:'Восстановить сохранённую проверку кадров',en:'Recover saved frame review'},risk:'write',
  input:clipProductionPrepareV1,door:door(SocialFactoryController,'recoverClipVisionFencedV1'),
  description:'On an authored request, revalidate only the same saved JSON-fenced image review after its parsing failure. Rechecks current owned source, image bytes, model provenance and all bindings. No model call, quote, generation, consent or usage-ledger rewrite. Unknown or mismatched evidence remains blocked.',
  run:async(ctx,input)=>{const request=await ctx.resolveAuthorRequest?.({});if(!request)throw unspentFailure('CLIP_VISION_RECOVERY_REQUEST_REQUIRED','Use the actual authored recovery request in this owned chat.');return ctx.service(NativeClipProductionServiceV1).recoverVisionFencedV1(ctx.organizationId,ctx.userId,threadOf(ctx, input.pilotId),request,input);},
  summarize:out=>out,cardOf,
});
export const NATIVE_CLIP_PRODUCTION_CAPABILITIES_V1 = [videoPilotPrepare, videoPilotPrepareDelegated, videoPilotBudget, videoPilotLaunch, videoPilotLaunchReviewedClipV2, videoPilotRecover, videoPilotStop, videoPilotPrepareLastFrameRepair, videoPilotLaunchLastFrameRepair, videoPilotRefreshLastFrameRepairQuote, videoPilotRenewCredentialsV2, videoPilotRecoverVisionFencedV1] as const;
