import { MASTRA_THREAD_ID_KEY } from '@mastra/core/request-context';
import { VideoHeygenStyleVoiceControllerV1 } from '@contentfactory/backend/api/routes/video-heygen-style-voice.controller.v1';
import {
  HeygenStyleVoiceServiceV1, HeygenStyleOperationInputSchemaV1, HeygenStyleSubmitInputSchemaV1, HeygenStyleSelectInputSchemaV1,
  HeygenVoiceSetupReadInputSchemaV1, HeygenVoiceOperationInputSchemaV1, HeygenVoiceExecuteInputSchemaV1, heygenStyleVoiceHumanActionV1,
} from '../../../videos/subscriptions/video-heygen-style-voice.service.v1';
import { HeygenStylePrepareSchemaV1 } from '../../../videos/subscriptions/video-heygen-style.v1';
import { HeygenVoiceIntakeSchemaV1, HeygenVoiceAuditionsInputSchemaV1, HeygenVoiceCloneInputSchemaV1, HeygenVoiceSelectionInputSchemaV1 } from '../../../videos/subscriptions/video-heygen-voice-setup.v1';
import { defineCapability, door, toolNameOf, type CapabilityRunContext, type ApprovalDescribeContext } from '../capability.types';
import { hasApproval, readCapabilityContextValue } from '../capability.context';
import { approvalFingerprint } from '../approval-fingerprint';
import { ConfirmationNeeded } from '../mcp-confirmation';
import { codedFailure, unspentFailure } from './selection';

const common = {group: 'media' as const, card: 'media' as const, untrusted: ['workspace-text', 'uploaded-file'] as const};
const service = (ctx: ApprovalDescribeContext) => ctx.service(HeygenStyleVoiceServiceV1);
const nativeResult = async <T>(run: () => Promise<T>): Promise<T> => {
  try {return await run();} catch (error: any) {
    const response = error?.getResponse?.(), code = response?.code;
    if (typeof code === 'string' && /^VIDEO_[A-Z_]{1,58}$/.test(code)) throw codedFailure(code,
      typeof response.remedy === 'string' ? response.remedy : `The saved native operation is unavailable (${code}). Resolve this exact source, account or qualification limitation; preserve retained work and do not substitute an API payer or identity.`);
    throw error;
  }
};
const actualMediaCard = (output: any) => {
  const ids = [...new Set<string>([
    ...(Array.isArray(output.children) ? output.children.filter((child: any) => child.state === 'saved' && /^image\/(png|jpeg|webp)$/.test(child.mimeType ?? '')).map((child: any) => child.mediaId) : []),
    ...(Array.isArray(output.candidates) ? output.candidates.filter((candidate: any) => candidate.state === 'ready' && candidate.audio?.playable && /^audio\//.test(candidate.audio.mimeType ?? '')).map((candidate: any) => candidate.audio.mediaId) : []),
    ...(output.original?.playable && /^audio\//.test(output.original.mimeType ?? '') ? [output.original.mediaId] : []),
  ].filter((id: unknown): id is string => typeof id === 'string' && /^[a-f0-9-]{36}$/i.test(id)))];
  return ids.length ? {kind: 'media' as const, id: 'library', mediaId: ids[0], mediaIds: ids} : null;
};
/** Native wrapper owns approval. These extra checks stop direct/expert calls from forging a human answer. */
const human = async (ctx: CapabilityRunContext, toolId: string, input: unknown, describe: () => Promise<string>) => {
  const fingerprint = approvalFingerprint(toolNameOf(toolId), input);
  let threadId: string | undefined;
  if (ctx.entrance === 'mcp') {
    if (ctx.confirmed !== true) throw new ConfirmationNeeded(await describe());
  } else {
    if (!hasApproval(ctx.requestContext, fingerprint)) throw unspentFailure('VIDEO_HUMAN_DECISION_REQUIRED', 'Use the real human confirmation for these exact arguments; an expert recommendation is not approval.');
    const value = readCapabilityContextValue(ctx.requestContext, MASTRA_THREAD_ID_KEY);
    if (typeof value !== 'string' || !value) throw unspentFailure('VIDEO_CHAT_CONTEXT_REQUIRED', 'Open this operation in the owned native chat.');
    threadId = value;
  }
  return heygenStyleVoiceHumanActionV1({organizationId: ctx.organizationId, actorId: ctx.userId, source: 'confirmed_chat_action', toolId,
    input, approvalFingerprint: fingerprint, ...(threadId ? {threadId} : {})});
};
const styleApproval = async (ctx: ApprovalDescribeContext, input: any) => {
  const p = await service(ctx).styleReview(ctx.organizationId, ctx.userId, input);
  return ctx.language === 'ru'
    ? `Создать один новый образ «${p.name}» для «${p.profileName}» из исходного образа «${p.baseLookName}». Результат — изображение. Кредиты выбранной личной подписки; точная стоимость неизвестна. При потере ответа повторной генерации не будет.${p.blockers.length ? ` Ограничения: ${p.blockers.join(', ')}.` : ''} Описание: ${p.prompt}.`
    : `Create one new look “${p.name}” for “${p.profileName}” from the original look “${p.baseLookName}”. The result is an image. Selected personal subscription credits; exact debit unknown. A lost response will not trigger another generation.${p.blockers.length ? ` Limitations: ${p.blockers.join(', ')}.` : ''} Prompt: ${p.prompt}.`;
};
const intakeApproval = async (ctx: ApprovalDescribeContext, input: any) => {
  const p = await service(ctx).voiceIntakeReview(ctx.organizationId, ctx.userId, input);
  const intent = ctx.language === 'ru' ? {reproduce_person: 'воспроизведение голоса человека', narrator: 'подбор диктора', recorded_speech: 'использование исходной записи речи'} :
    {reproduce_person: 'reproduce the person’s voice', narrator: 'choose a narrator', recorded_speech: 'use the original recorded speech'};
  const original = p.original ? ctx.language === 'ru' ? ` Исходная запись: «${p.original.label}», ${p.original.durationSeconds} с. Вы подтверждаете, что выбрали её как исходную запись.`
    : ` Original recording: “${p.original.label}”, ${p.original.durationSeconds}s. You confirm selecting it as the original recording.` : '';
  return ctx.language === 'ru' ? `Сохранить намерение: ${intent[p.intent]}.${original} Это выбор источника и назначения; клонирование и прослушивания ещё не запускаются.`
    : `Save voice intent: ${intent[p.intent]}.${original} This selects the source and purpose; no cloning or auditions are launched.`;
};
const voiceApproval = async (ctx: ApprovalDescribeContext, input: any) => {
  const p = await service(ctx).voiceOperationReview(ctx.organizationId, ctx.userId, input);
  const label = p.operation === 'clone_voice' ? ctx.language === 'ru' ? 'Создать клон голоса' : 'Clone the voice' : ctx.language === 'ru' ? 'Создать прослушивание' : 'Create the audition';
  const name = 'candidateName' in p ? p.candidateName : 'originalLabel' in p ? p.originalLabel : '';
  const words = 'audition' in p ? ctx.language === 'ru' ? ` Точный текст (${p.audition?.locale}): ${p.audition?.text}.` : ` Exact text (${p.audition?.locale}): ${p.audition?.text}.` : '';
  return ctx.language === 'ru' ? `${label} «${name}»: одна попытка. Кредиты выбранной личной подписки; точная стоимость неизвестна. Потеря ответа не запускает повтор. Выбор понравившегося голоса остаётся за вами.${words}`
    : `${label} “${name}”: one attempt. Selected personal subscription credits; exact debit unknown. A lost response will not trigger another attempt. The final voice choice remains yours.${words}`;
};
const selectionApproval = async (ctx: ApprovalDescribeContext, input: any) => {
  const p = await service(ctx).voiceSelectionReview(ctx.organizationId, ctx.userId, input);
  if (p.decision === 'reject_all') return ctx.language === 'ru'
    ? 'Отклонить все сохранённые варианты голоса. Исходная запись и полученные результаты сохранятся.'
    : 'Reject all saved voice options. The original recording and received results remain saved.';
  if (!('candidate' in p) || !p.candidate) throw unspentFailure('VIDEO_VOICE_SELECTION_INVALID', 'Review an actual saved playable voice candidate.');
  const candidate = p.candidate;
  return candidate.origin === 'recorded_speech' ? ctx.language === 'ru' ? `Выбрать исходную запись «${candidate.name}» как готовую речь. Запись сохраняется отдельно, без клонирования и замены голоса профиля.`
      : `Choose the original recording “${candidate.name}” as direct recorded speech. Keep it separately without cloning or replacing the profile voice.`
    : ctx.language === 'ru' ? `Сохранить ваш выбор голоса «${candidate.name}» после прослушивания реального аудио.${p.profileName ? ` Сделать его голосом по умолчанию для будущих роликов ведущего «${p.profileName}».` : ' Этот выбор можно использовать в следующих роликах.'} Расходы этим не разрешаются.`
      : `Save your voice choice “${candidate.name}” after listening to its actual audio.${p.profileName ? ` Set it as the default voice for future videos of presenter “${p.profileName}”.` : ' Reuse this choice in later videos.'} It grants no spending authority.`;
};
const unspentQualification = async <T>(run: () => Promise<T>): Promise<T> => {
  try {return await run();} catch (error: any) {
    const code = error?.getResponse?.()?.code;
    if (['VIDEO_CREATIVE_ADAPTER_UNAVAILABLE', 'VIDEO_VOICE_ENTITLEMENT_UNVERIFIED', 'VIDEO_VOICE_RECEIPT_CONTRACT_UNQUALIFIED',
      'VIDEO_VOICE_APPROVAL_STALE', 'VIDEO_STYLE_OPERATION_CHANGED'].includes(code))
      throw unspentFailure(code, 'This operation was not dispatched. Resolve this exact native subscription qualification or saved-source limitation; no API or payer fallback is used.');
    throw error;
  }
};

export const videoHeygenStylePrepare = defineCapability({
  ...common, id: 'video.heygen_style_prepare', label: {ru: 'Подготовить новый образ', en: 'Prepare a new look'},
  description: 'Save an English prompt-restyle request for the exact selected source look of an approved person. avatarId is the original visual base; group is destination. Preserve original looks. Ordinary new outfit/background/pose does not require identity setup again. Local preparation only; actual account entitlement/output qualification may remain blocked. Use the named saved operation and status tool after reload; an operation UUID is never a Media image or MP4.',
  input: HeygenStylePrepareSchemaV1, risk: 'write', door: door(VideoHeygenStyleVoiceControllerV1, 'stylePrepare'),
  run: (ctx, input) => nativeResult(() => service(ctx).stylePrepare(ctx.organizationId, ctx.userId, input)), summarize: value => ({...value}), cardOf: actualMediaCard,
});
export const videoHeygenStyleStatus = defineCapability({
  ...common, id: 'video.heygen_style_status', label: {ru: 'Открыть сохранённый образ', en: 'Open saved look'},
  description: 'Reopen the actor-owned named style operation and actual saved image candidates by operationId. Show actual completed counts, original base, lineage and blockers. This only reads retained state; no generation or retry. Only returned saved child mediaIds open images in Media.',
  input: HeygenStyleOperationInputSchemaV1, risk: 'read', door: door(VideoHeygenStyleVoiceControllerV1, 'styleStatus'),
  run: (ctx, input) => nativeResult(() => service(ctx).styleStatus(ctx.organizationId, ctx.userId, input.operationId)), summarize: value => ({...value}), cardOf: actualMediaCard,
});
export const videoHeygenStyleRecover = defineCapability({
  ...common, id: 'video.heygen_style_recover', label: {ru: 'Восстановить изображения образа', en: 'Recover look images'},
  description: 'Read the same retained provider receipt and actual child looks, then save missing owned image previews. Never create or resubmit a style, including after a lost mutation response. Unknown receipt stays uncertain; retry only read/save recovery.',
  input: HeygenStyleOperationInputSchemaV1, risk: 'write', door: door(VideoHeygenStyleVoiceControllerV1, 'styleRecover'),
  run: (ctx, input) => nativeResult(() => service(ctx).styleRecover(ctx.organizationId, ctx.userId, input.operationId)), summarize: value => ({...value}), cardOf: actualMediaCard,
});
export const videoHeygenStyleSelect = defineCapability({
  ...common, id: 'video.heygen_style_select', label: {ru: 'Выбрать сохранённый образ', en: 'Choose saved look'},
  description: 'Choose one actually saved owned image child for this video’s appearance. Use its returned lookId and current operation revision. Review mode follows the person’s choice; autopilot may make ordinary creative choices within the approved person. This never changes the global profile, original look or identity, and grants no rendering/spending authority.',
  input: HeygenStyleSelectInputSchemaV1, risk: 'write', door: door(VideoHeygenStyleVoiceControllerV1, 'styleSelect'),
  run: (ctx, input) => nativeResult(() => service(ctx).styleSelect(ctx.organizationId, ctx.userId, input)), summarize: value => ({...value}), cardOf: actualMediaCard,
});
export const videoHeygenStyleSubmit = defineCapability({
  ...common, id: 'video.heygen_style_submit', label: {ru: 'Создать согласованный образ', en: 'Create reviewed look'},
  description: 'One paid prompt-restyle attempt for the exact saved base/prompt/account request after actual native human approval. Never infer funding from a connection, catalog, model recommendation or autopilot. Unknown entitlement/receipt contract remains an actionable blocker. Exact cost unknown; image creation and later video rendering are separate effects. A lost response never authorizes another create.',
  input: HeygenStyleSubmitInputSchemaV1, risk: 'paid', asksInWebChat: true, mcpConfirm: 'ask', door: door(VideoHeygenStyleVoiceControllerV1, 'styleSubmit'),
  describeApproval: styleApproval, approvalContent: (ctx, input) => service(ctx).styleReview(ctx.organizationId, ctx.userId, input),
  run: async (ctx, input) => {const proof = await human(ctx, 'video.heygen_style_submit', input, () => styleApproval(ctx, input)); return nativeResult(() => unspentQualification(() => service(ctx).styleSubmit(ctx.organizationId, ctx.userId, input, proof)));},
  spentNothing: value => !value.attempted, summarize: value => ({...value}), cardOf: actualMediaCard,
});
export const videoHeygenVoiceIntake = defineCapability({
  ...common, id: 'video.heygen_voice_intake', label: {ru: 'Выбрать исходную запись и задачу голоса', en: 'Choose original audio and voice intent'},
  description: 'Ask the actual person whether to reproduce their voice, choose a narrator or use recorded speech directly. Preserve original owned audio, not just transcription. Native human confirmation binds this exact source and purpose; an expert/autopilot cannot decide identity intent. Generated previews cannot become original training audio. No clone or audition is dispatched by intake.',
  input: HeygenVoiceIntakeSchemaV1, risk: 'confirm', mcpConfirm: 'ask', door: door(VideoHeygenStyleVoiceControllerV1, 'voiceIntake'),
  describeApproval: intakeApproval, approvalContent: (ctx, input) => service(ctx).voiceIntakeReview(ctx.organizationId, ctx.userId, input),
  run: async (ctx, input) => {const proof = await human(ctx, 'video.heygen_voice_intake', input, () => intakeApproval(ctx, input)); return nativeResult(() => service(ctx).voiceIntake(ctx.organizationId, ctx.userId, input, proof));},
  summarize: value => ({...value}), cardOf: actualMediaCard,
});
export const videoHeygenVoiceStatus = defineCapability({
  ...common, id: 'video.heygen_voice_status', label: {ru: 'Открыть запись и варианты голоса', en: 'Open voice recording and options'},
  description: 'Read the actor-owned saved voice setup, named original audio, actual playable candidates and persistent human selection after reload. Fewer real candidates remain fewer; do not invent three options or call a setup/operation UUID a Media ID. No paid effect.',
  input: HeygenVoiceSetupReadInputSchemaV1, risk: 'read', door: door(VideoHeygenStyleVoiceControllerV1, 'voiceStatus'),
  run: (ctx, input) => nativeResult(() => service(ctx).voiceStatus(ctx.organizationId, ctx.userId, input.setupId)), summarize: value => ({...value}), cardOf: actualMediaCard,
});
export const videoHeygenVoicePrepareAuditions = defineCapability({
  ...common, id: 'video.heygen_voice_prepare_auditions', label: {ru: 'Подготовить варианты прослушивания', en: 'Prepare audition options'},
  description: 'Save one to three real qualified owned voice/engine options with comparable exact target-language text from the saved setup. Model/locale compatibility and selected source identity are checked. Plain speech only; no audio tags or SSML. Preparation does not dispatch speech. Use returned operation IDs/request hashes for individual native paid approval.',
  input: HeygenVoiceAuditionsInputSchemaV1, risk: 'write', door: door(VideoHeygenStyleVoiceControllerV1, 'voicePrepareAuditions'),
  run: (ctx, input) => nativeResult(() => service(ctx).voicePrepareAuditions(ctx.organizationId, ctx.userId, input)), summarize: value => ({...value}), cardOf: actualMediaCard,
});
export const videoHeygenVoicePrepareClone = defineCapability({
  ...common, id: 'video.heygen_voice_prepare_clone', label: {ru: 'Подготовить клонирование голоса', en: 'Prepare voice cloning'},
  description: 'Prepare a clone operation only for the human-selected original recording and reproduce-person intent. Source rights, actual measured speech quality, consent, entitlement and exact receipt contract must qualify. An unknown condition is a concrete blocker. No cloning, voice replacement or spending is performed by this local preparation.',
  input: HeygenVoiceCloneInputSchemaV1, risk: 'write', door: door(VideoHeygenStyleVoiceControllerV1, 'voicePrepareClone'),
  run: (ctx, input) => nativeResult(() => service(ctx).voicePrepareClone(ctx.organizationId, ctx.userId, input)), summarize: value => ({...value}), cardOf: actualMediaCard,
});
export const videoHeygenVoiceExecute = defineCapability({
  ...common, id: 'video.heygen_voice_execute', label: {ru: 'Создать согласованный голос или прослушивание', en: 'Create reviewed clone or audition'},
  description: 'Execute exactly one prepared clone or audition after real argument/content-bound human native approval; expert advice cannot forge it. Personal subscription only and actual operation qualification required. Exact debit is unknown. Keep the same durable operation and recover saved receipts/audio after uncertainty, never resubmit. Do not replace/delete an existing voice or infer final human selection from generated audio.',
  input: HeygenVoiceExecuteInputSchemaV1, risk: 'paid', asksInWebChat: true, mcpConfirm: 'ask', door: door(VideoHeygenStyleVoiceControllerV1, 'voiceExecute'),
  describeApproval: voiceApproval, approvalContent: (ctx, input) => service(ctx).voiceOperationReview(ctx.organizationId, ctx.userId, input),
  run: async (ctx, input) => {const proof = await human(ctx, 'video.heygen_voice_execute', input, () => voiceApproval(ctx, input)); return nativeResult(() => unspentQualification(() => service(ctx).voiceExecute(ctx.organizationId, ctx.userId, input, proof)));},
  spentNothing: value => value.operations.find(op => op.operationId === value.requestedOperationId)?.state === 'prepared', summarize: value => ({...value}), cardOf: actualMediaCard,
});
export const videoHeygenVoiceRecover = defineCapability({
  ...common, id: 'video.heygen_voice_recover', label: {ru: 'Восстановить сохранённое прослушивание', en: 'Recover saved audition'},
  description: 'Decode the exact retained clone/speech receipt and save its actual owned audio. Read/save recovery only; never clone or create speech again after a lost response. Unknown raw receipts remain uncertain with an actionable limitation.',
  input: HeygenVoiceOperationInputSchemaV1, risk: 'write', door: door(VideoHeygenStyleVoiceControllerV1, 'voiceRecover'),
  run: (ctx, input) => nativeResult(() => service(ctx).voiceRecover(ctx.organizationId, ctx.userId, input)), summarize: value => ({...value}), cardOf: actualMediaCard,
});
export const videoHeygenVoiceSelect = defineCapability({
  ...common, id: 'video.heygen_voice_select', label: {ru: 'Сохранить мой выбор голоса', en: 'Save my voice choice'},
  description: 'Ask the actual person to select one ready playable saved voice candidate or reject all. This protected actor/account/source/candidate-bound choice persists. For an existing linked presenter, the same card explicitly saves the selected text voice as default for future videos, preserving identity and source looks; no second question/audition. Recorded speech remains separate from a cloned voice. An expert, model or autopilot cannot answer. Choice grants no spending or publication authority.',
  input: HeygenVoiceSelectionInputSchemaV1, risk: 'confirm', mcpConfirm: 'ask', door: door(VideoHeygenStyleVoiceControllerV1, 'voiceSelect'),
  describeApproval: selectionApproval, approvalContent: (ctx, input) => service(ctx).voiceSelectionReview(ctx.organizationId, ctx.userId, input),
  run: async (ctx, input) => {const proof = await human(ctx, 'video.heygen_voice_select', input, () => selectionApproval(ctx, input)); return nativeResult(() => service(ctx).voiceSelect(ctx.organizationId, ctx.userId, input, proof));},
  summarize: value => ({...value}), cardOf: actualMediaCard,
});
export const videoHeygenVoiceApplySelected = defineCapability({
  ...common, id: 'video.heygen_voice_apply_selected', label: {ru: 'Применить сохранённый выбор голоса', en: 'Apply saved voice choice'},
  description: 'Retry only the local application of an already saved actual human voice choice to its existing linked presenter profile. Use after an explicit profile CAS/account/catalog blocker; keep the selected candidate and all source looks. This never chooses for the person, creates a new identity, clones a voice, generates auditions or spends credits. Recorded speech is retained separately. No second human question is needed for the same unchanged saved choice.',
  input: HeygenVoiceSetupReadInputSchemaV1, risk: 'write', door: door(VideoHeygenStyleVoiceControllerV1, 'voiceApplySelected'),
  run: (ctx, input) => nativeResult(() => service(ctx).applySelectedVoice(ctx.organizationId, ctx.userId, input.setupId)), summarize: value => ({...value}), cardOf: actualMediaCard,
});
export const HEYGEN_STYLE_VOICE_CAPABILITIES_V1 = [videoHeygenStylePrepare, videoHeygenStyleStatus, videoHeygenStyleRecover, videoHeygenStyleSelect, videoHeygenStyleSubmit,
  videoHeygenVoiceIntake, videoHeygenVoiceStatus, videoHeygenVoicePrepareAuditions, videoHeygenVoicePrepareClone, videoHeygenVoiceExecute, videoHeygenVoiceRecover, videoHeygenVoiceSelect, videoHeygenVoiceApplySelected] as const;
