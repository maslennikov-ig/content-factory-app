import { z } from 'zod';
import { MASTRA_THREAD_ID_KEY } from '@mastra/core/request-context';
import { VideoHeygenControlsControllerV2 } from '@contentfactory/backend/api/routes/video-heygen-controls.controller.v2';
import { VideoAccessController } from '@contentfactory/backend/api/routes/video-access.controller';
import { HeygenChatControlsServiceV1, HeygenProfileSaveSchemaV1, HeygenProfileResolveSchemaV1, HeygenChatPrepareSchemaV2,
  HeygenGlossaryEditSchemaV1, HeygenBackgroundEditSchemaV1 } from '../../../videos/subscriptions/video-heygen-chat-controls.service.v1';
import { HeygenPersonProfileInputSchemaV1 } from '../../../videos/subscriptions/video-heygen-person-profile.v1';
import { HeygenAutopilotScopeInputV2 } from '../../../videos/subscriptions/video-heygen-autopilot-scope.v2';
import { HeygenPerformanceServiceV1, HeygenPerformanceApplySchemaV1, HeygenPerformanceFeedbackSchemaV1,
  HeygenPerformancePreferenceSchemaV1, HeygenPerformanceFeedbackCorrectionSchemaV1 } from '../../../videos/subscriptions/video-heygen-performance.service.v1';
import { HeygenPerformanceSceneServiceV1, HeygenPerformanceScenePrepareSchemaV1 } from '../../../videos/subscriptions/video-heygen-performance-scene.service.v1';
import { defineCapability, door, toolNameOf, type CapabilityRunContext } from '../capability.types';
import { hasApproval, readCapabilityContextValue } from '../capability.context';
import { approvalFingerprint } from '../approval-fingerprint';
import { AGENT_CHAT_MODE_CONTEXT_KEY } from '../../conductor/chat-mode';
import { unspentFailure } from './selection';
const common = {group: 'media' as const, card: 'media' as const, untrusted: ['workspace-text'] as const};
const requireHuman = (ctx: CapabilityRunContext, id: string, input: unknown) => {
  if (ctx.entrance === 'mcp' ? ctx.confirmed !== true : !hasApproval(ctx.requestContext, approvalFingerprint(toolNameOf(id), input)))
    throw unspentFailure('VIDEO_HUMAN_DECISION_REQUIRED', 'Use the actual human confirmation for this exact identity, voice or authorization.');
};
const thread = (ctx: CapabilityRunContext) => {
  const value = readCapabilityContextValue(ctx.requestContext, MASTRA_THREAD_ID_KEY);
  if (ctx.entrance !== 'chat' || typeof value !== 'string' || !value) throw unspentFailure('VIDEO_CHAT_CONTEXT_REQUIRED', 'Open this operation in the owned native chat.');
  return value;
};
const autopilot = (ctx: CapabilityRunContext) => {
  if (readCapabilityContextValue(ctx.requestContext, AGENT_CHAT_MODE_CONTEXT_KEY) !== 'autopilot')
    throw unspentFailure('VIDEO_AUTOPILOT_NOT_SELECTED', 'The person chooses Autopilot in this chat.');
  return thread(ctx);
};
const draftCard = (output: any) => output.id && output.pieceId ? {kind: 'media' as const, id: 'library', videoDraftId: output.id, pieceId: output.pieceId} : null;

export const videoPersonProfiles = defineCapability({
  ...common, id: 'video.person_profiles', label: {ru: 'Сохранённые ведущие', en: 'Saved presenters'},
  description: 'Read this actor’s existing approved person/voice profiles for the chosen personal connection. These are speaking identities, separate from editorial writing personas. Reuse a unique explicitly named approved person and unchanged voice; do not ask identity setup again. Account changes block new dependent work while retained records stay readable. No generation or spending.',
  input: z.object({connectionId: z.string().uuid()}).strict(), risk: 'read', door: door(VideoHeygenControlsControllerV2, 'profiles'),
  run: (ctx, input) => ctx.service(HeygenChatControlsServiceV1).listProfiles(ctx.organizationId, ctx.userId, input.connectionId), summarize: output => ({...output}),
});
export const videoPersonProfileResolve = defineCapability({
  ...common, id: 'video.person_profile_resolve', label: {ru: 'Выбрать сохранённого ведущего', en: 'Resolve saved presenter'},
  description: 'Resolve an exact unique approved saved person or alias and their unchanged voice. Use only trusted stored bindings; ambiguous names require one real human choice. The returned appearance roles are candidates for the current video. Compare them with the explicit wardrobe preferences, the reference and the requested gaze before recommending an appearance. Use a short official-source lookup when style is uncertain. Ask a native creative appearance question in collaborative mode if the look is unresolved. In autopilot, state and answer that question yourself and use a compatible approved look. An unapproved look goes to a separate actual profile approval.',
  input: HeygenProfileResolveSchemaV1, risk: 'read', door: door(VideoHeygenControlsControllerV2, 'resolveProfile'),
  run: (ctx, input) => ctx.service(HeygenChatControlsServiceV1).resolveProfile(ctx.organizationId, ctx.userId, input), summarize: output => ({...output}),
});
export const videoPersonProfilePropose = defineCapability({
  ...common, id: 'video.person_profile_propose', label: {ru: 'Подготовить профиль ведущего', en: 'Prepare presenter profile'},
  description: 'Prepare initial reusable identity/voice setup from actual owned catalog IDs. No provider mutation. Preserve the selected voice default: omit defaultVoice.engine and baseline.engineSettings unless retaining an unchanged actual saved human baseline. The provider name HeyGen does not imply the heygen_voice TTS engine; catalog visibility does not qualify one. Ordinary locale/speed/pitch/volume may be proposed separately. Show names and actual previews, then video.person_profile_save asks the person. NEW identity/voice likeness is always human-owned in both modes. Do not create imaginary voice candidates or treat catalog visibility as render eligibility. Keep aliases and groups explicitly bound by the person.',
  input: HeygenPersonProfileInputSchemaV1, risk: 'read', door: door(VideoHeygenControlsControllerV2, 'proposeProfile'),
  run: (ctx, input) => ctx.service(HeygenChatControlsServiceV1).proposeProfile(ctx.organizationId, ctx.userId, input), summarize: output => ({...output}),
});
export const videoPersonProfileSave = defineCapability({
  ...common, id: 'video.person_profile_save', label: {ru: 'Сохранить выбранного ведущего и голос', en: 'Save approved presenter and voice'},
  description: 'Save the exact proposed reusable identity, voice and source looks only after the actual person confirms this native card. This protected choice cannot be delegated to an expert or inferred from autopilot. Saving this profile grants no generation, spending or publication authority. Reuse unchanged saved selection on later videos.',
  input: HeygenProfileSaveSchemaV1, risk: 'confirm', door: door(VideoHeygenControlsControllerV2, 'saveProfile'),
  describeApproval: async (ctx, input) => {
    const p = await ctx.service(HeygenChatControlsServiceV1).proposeProfile(ctx.organizationId, ctx.userId, input.profile);
    if (p.selectionDigest !== input.selectionDigest) throw unspentFailure('VIDEO_PROFILE_SELECTION_CHANGED', 'Review the current owned person and voice.');
    return ctx.language === 'ru' ? `Сохранить профиль «${p.name}», голос «${p.voice.name}», образы: ${p.looks.map(look => look.name).join(', ')}. Это настройка личности, без генерации и расходов.`
      : `Save presenter “${p.name}”, voice “${p.voice.name}” and looks: ${p.looks.map(look => look.name).join(', ')}. Identity setup only; no generation or spending.`;
  },
  approvalContent: (ctx, input) => ctx.service(HeygenChatControlsServiceV1).proposeProfile(ctx.organizationId, ctx.userId, input.profile),
  run: (ctx, input) => {requireHuman(ctx, 'video.person_profile_save', input); return ctx.service(HeygenChatControlsServiceV1).saveProfile(ctx.organizationId, ctx.userId, input, 'confirmed_chat_action', ctx.nativeToolCallId);},
  summarize: output => ({...output}),
});
export const videoHeygenOptionsV1 = defineCapability({
  ...common, id: 'video.heygen_options_v1', label: {ru: 'Доступные настройки HeyGen', en: 'Available HeyGen options'},
  description: 'Read options on the exact owned draft: glossaries, advertised voice engines, image candidates, recordings and background removal availability. Use video.heygen_glossary_v1 for a listed glossary, and video.heygen_background_v1 for a specifically requested image candidate. Selection verifies current image bytes before use. Recordings require an original-file binding and cannot be selected here. Preserve the approved voice engine.',
  input: z.object({draftId: z.string().uuid(), version: z.number().int().positive()}).strict(), risk: 'read',
  door: door(VideoHeygenControlsControllerV2, 'heygenOptions'),
  run: (ctx, input) => ctx.service(HeygenChatControlsServiceV1).advancedOptions(ctx.organizationId, ctx.userId, input.draftId, input.version),
  summarize: output => ({...output}),
});
export const videoHeygenGlossaryV1 = defineCapability({
  ...common, id: 'video.heygen_glossary_v1', label: {ru: 'Применить словарь произношений', en: 'Apply pronunciation glossary'},
  description: 'Apply one existing workspace glossary to this exact saved draft, or remove it with glossaryId null. Read video.heygen_options_v1 first and select only a uniquely requested or relevant glossary. Preserves exact spoken text, approved voice, look and other settings. Apply delivery to the returned draft version if needed before preflight. No global changes, generation or upload.',
  input: HeygenGlossaryEditSchemaV1, risk: 'write', door: door(VideoHeygenControlsControllerV2, 'heygenGlossary'),
  run: (ctx, input) => ctx.service(HeygenChatControlsServiceV1).saveGlossary(ctx.organizationId, ctx.userId, input),
  summarize: output => ({...output}), cardOf: draftCard,
});
export const videoHeygenBackgroundV1 = defineCapability({
  ...common, id: 'video.heygen_background_v1', label: {ru: 'Применить изображение фона', en: 'Apply a background image'},
  description: 'Apply the selected owned background image on this exact draft or remove the background override with null. Read video.heygen_options_v1 first. Use the exact image requested by the human; the server verifies the bytes and library binding. Keep all other settings and the approved voice. No upload to HeyGen or generation.',
  input: HeygenBackgroundEditSchemaV1, risk: 'write', door: door(VideoHeygenControlsControllerV2, 'heygenBackground'),
  run: (ctx, input) => ctx.service(HeygenChatControlsServiceV1).saveBackground(ctx.organizationId, ctx.userId, input),
  summarize: output => ({...output}), cardOf: draftCard,
});
export const videoHeygenSettings = defineCapability({
  ...common, id: 'video.heygen_settings', label: {ru: 'Настройки ролика HeyGen', en: 'HeyGen video settings'},
  description: 'Save a compatible V2 per-video recipe from an exact saved draft and approved person profile. Select source base, appearance and animation reference separately. Ordinary voice, IV expressiveness, qualified motion, background and fit are separate. For an owned background image, first read video.heygen_options_v1, then use the exact selected backgroundAssetId; the server verifies and binds it to Media before saving. Keep all other saved values when making a targeted edit. Before preflight use video.performance_settings_v1 to infer restrained contextual delivery and preserve human edits. Operational directions English; speech/captions retain their language. No audio tags, SSML, hidden markup, account/voice/model/payer substitution. Generation needs current preflight and real approval or a matching bounded scope.',
  input: HeygenChatPrepareSchemaV2, risk: 'write', door: door(VideoHeygenControlsControllerV2, 'heygenSettings'),
  run: (ctx, input) => ctx.service(HeygenChatControlsServiceV1).prepareSettings(ctx.organizationId, ctx.userId, input), summarize: output => ({...output}), cardOf: draftCard,
});
const performanceCard = (output: any) => ({kind: 'media' as const, id: 'library',
  videoDraftId: output.draft?.id ?? output.draftId, ...(output.draft?.pieceId ? {pieceId: output.draft.pieceId} : {})});
const authoredPerformanceEdit = async (ctx: CapabilityRunContext, input: {requestMessageId?: string; quote?: string}) => {
  if (typeof input.requestMessageId !== 'string' || typeof input.quote !== 'string' || input.quote.trim().length < 3)
    throw unspentFailure('VIDEO_REQUEST_NOT_AUTHORED', 'Use the actual authored message and exact edit quotation.');
  const author = await ctx.resolveAuthorRequest?.({requestMessageId: input.requestMessageId});
  if (!author || !author.text.includes(input.quote)) throw unspentFailure('VIDEO_REQUEST_NOT_AUTHORED', 'Use an exact quotation from the actual owned user message for this explicit edit.');
};
const describePerformanceEdit = async (ctx: {language: string}, input: {changes?: Record<string, unknown>; releaseFields?: string[]}) => {
  const ru = ctx.language === 'ru';
  const labels: Record<string, string> = ru
    ? {context: 'Контекст', delivery: 'Манера подачи', gaze: 'Взгляд', facialIntensity: 'Мимика', gestures: 'Специальные жесты', wish: 'Пожелание'}
    : {context: 'Context', delivery: 'Delivery', gaze: 'Gaze', facialIntensity: 'Facial expression', gestures: 'Intentional gestures', wish: 'Direction'};
  const values: Record<string, string> = ru ? {general: 'Общее обращение', invitation: 'Приглашение', explainer: 'Объяснение', serious: 'Серьёзное сообщение',
    thanks: 'Благодарность', promotion: 'Продвижение', dialogue: 'Диалог', restrained: 'Сдержанная', natural: 'Естественная', energetic: 'Энергичная',
    camera: 'В камеру', partner: 'К собеседнику', low: 'Сдержанная', medium: 'Умеренная', high: 'Яркая', none: 'Не добавлять', sparse: 'Редкие акценты'} : {};
  const changes = Object.entries(input.changes ?? {}).map(([key, value]) => `${labels[key] ?? key}: ${values[String(value)] ?? String(value)}`).join('; ');
  const released = (input.releaseFields ?? []).map(key => labels[key] ?? key).join(', ');
  return ru ? `Сохранить правки подачи: ${changes || 'без новых значений'}. Вернуть автоподбор: ${released || 'нет'}. Без генерации.`
    : `Save delivery edits: ${changes || 'no new values'}. Return to automatic selection: ${released || 'none'}. No generation.`;
};
export const videoPerformanceReadV1 = defineCapability({
  ...common, id: 'video.performance_v1', label: {ru: 'Подача ведущего', en: 'Presenter delivery'},
  description: 'Read the actual saved per-video delivery intent, manual field locks, effective settings and explicit limitations. A planned gaze/gesture is not proof it was applied or seen in a video. No provider mutation or generation.',
  input: z.object({draftId: z.string().uuid()}).strict(), risk: 'read', door: door(VideoHeygenControlsControllerV2, 'performanceRead'),
  run: (ctx, input) => ctx.service(HeygenPerformanceServiceV1).read(ctx.organizationId, ctx.userId, input.draftId), summarize: output => ({...output}),
});
export const videoPerformanceScenesV1 = defineCapability({
  ...common, id: 'video.performance_scenes_v1', label: {ru: 'Проверить взгляд и жесты', en: 'Check gaze and gestures'},
  description: 'Read route readiness for gaze, expression and intentional gestures on the exact saved draft and delivery revision. Use when camera eye contact or gestures are requested, before inviting the user to generate. A qualified Avatar V motion prompt is a direction; check the actual result separately. If limited, show actionable remedies, including a front-facing owned look and a ready approved motion reference where relevant. Do not switch look, engine, account or payer silently. This tool prepares and reads only.',
  input: HeygenPerformanceScenePrepareSchemaV1, risk: 'read', door: door(VideoHeygenControlsControllerV2, 'performanceScenes'),
  run: (ctx, input) => ctx.service(HeygenPerformanceSceneServiceV1).prepare(ctx.organizationId, ctx.userId, input),
  summarize: output => ({...output}), cardOf: performanceCard,
});
export const videoPerformanceSettingsV1 = defineCapability({
  ...common, id: 'video.performance_settings_v1', label: {ru: 'Подобрать подачу ролика', en: 'Choose contextual delivery'},
  description: 'Prepare delivery in your ordinary turn, without an extra expert call. Read video.performance_v1, then propose context and values from script purpose, audience, instructions and saved preference. Natural begins restrained: low facial intensity and rare semantic gestures, not excitement on every sentence. Explicit lively promotion can be energetic; high is never universal. Preserve locked human values; this tool cannot release them or label model choices manual. When a saved wish exists, interpret it into compatible typed fields and supply wishResolution with the exact wishDigest from the read, the affected field names and a concise rationale. Never claim a wish resolved by fields that cannot express it; unsupported required motion remains blocked. Changed mapped values invalidate that interpretation. No SSML/tags or direct wish injection into speech/provider prompts. Server returns actual supported settings and limitations. No new identity, voice, payer, render or publication; use returned saved draft version.',
  input: HeygenPerformanceApplySchemaV1.omit({releaseFields: true}).strict(), risk: 'write', door: door(VideoHeygenControlsControllerV2, 'performanceApply'),
  run: (ctx, input) => ctx.service(HeygenPerformanceServiceV1).apply(ctx.organizationId, ctx.userId, input, 'assistant'),
  summarize: output => ({...output}), cardOf: performanceCard,
});
export const videoPerformanceUserEditV1 = defineCapability({
  ...common, entrances: ['chat'], id: 'video.performance_user_edit_v1', label: {ru: 'Сохранить пожелание к подаче', en: 'Save explicit delivery edit'},
  description: 'Apply only an explicit actual authored user edit to the saved delivery, or an explicit request to return named fields to automatic selection. Include the original user message ID and exact quotation; never invent human preference from your own proposal. Unmentioned fields and locks remain. This edits a draft, not identity, voice, provider work or spending authority.',
  input: HeygenPerformanceApplySchemaV1.omit({wishResolution: true}).extend({requestMessageId: z.string().min(1).max(128), quote: z.string().min(3).max(1500)}).strict(),
  risk: 'confirm', door: door(VideoHeygenControlsControllerV2, 'performanceApply'),
  describeApproval: describePerformanceEdit,
  run: async (ctx, input) => {requireHuman(ctx, 'video.performance_user_edit_v1', input); await authoredPerformanceEdit(ctx, input); const {requestMessageId, quote, ...edit} = input;
    return ctx.service(HeygenPerformanceServiceV1).apply(ctx.organizationId, ctx.userId, edit, 'manual');},
  summarize: output => ({...output}), cardOf: performanceCard,
});
export const videoPerformancePreferenceV1 = defineCapability({
  ...common, entrances: ['chat'], id: 'video.performance_preference_v1', label: {ru: 'Запомнить подачу ведущего', en: 'Save presenter delivery preference'},
  description: 'Only after an explicit actual user request, save this current delivery as a reusable preference for the same approved presenter/account. Quote the authored request. This does not replace identity/voice, change the current script or grant generation permission.',
  input: HeygenPerformancePreferenceSchemaV1.extend({requestMessageId: z.string().min(1).max(128), quote: z.string().min(3).max(1500)}).strict(),
  risk: 'confirm', door: door(VideoHeygenControlsControllerV2, 'performancePreference'),
  describeApproval: async ctx => ctx.language === 'ru'
    ? 'Сохранить текущую подачу как предпочтение для будущих роликов этого ведущего. Голос и личность сохраняются; без генерации.'
    : 'Save current delivery as a preference for this presenter’s future videos. Preserve voice and identity; no generation.',
  run: async (ctx, input) => {requireHuman(ctx, 'video.performance_preference_v1', input); await authoredPerformanceEdit(ctx, input); const {requestMessageId, quote, ...edit} = input;
    return ctx.service(HeygenPerformanceServiceV1).savePreference(ctx.organizationId, ctx.userId, edit);}, summarize: output => ({...output}),
});
export const videoPerformanceFeedbackV1 = defineCapability({
  ...common, entrances: ['chat'], id: 'video.performance_feedback_v1', label: {ru: 'Замечание к подаче', en: 'Delivery feedback'},
  description: 'Save an actual user observation about facial acting, gaze or gesture repetition. For feedback on a finished video, bind the exact owned completed job and optional explicit startMs/endMs to its frozen receipt. An exact script fragment uses UTF-16 offsets. Use the real author quotation verbatim. This never generates another video or claims creative acceptance.',
  input: HeygenPerformanceFeedbackSchemaV1.extend({requestMessageId: z.string().min(1).max(128), quote: z.string().trim().min(3).max(1500)}).strict(),
  risk: 'write', door: door(VideoHeygenControlsControllerV2, 'performanceFeedback'),
  run: async (ctx, input) => {await authoredPerformanceEdit(ctx, input);
    if (input.text !== input.quote) throw unspentFailure('VIDEO_REQUEST_NOT_AUTHORED', 'Record the exact user quotation as feedback, not an invented observation.');
    const {requestMessageId, quote, ...edit} = input;
    return ctx.service(HeygenPerformanceServiceV1).feedback(ctx.organizationId, ctx.userId, edit);}, summarize: output => ({...output}),
});
export const videoPerformanceFeedbackReadV1 = defineCapability({
  ...common, id: 'video.performance_feedback_read_v1', label: {ru: 'Прочитать замечания к подаче', en: 'Read delivery feedback'},
  description: 'Read the user’s saved observations for the selected draft or exact owned completed HeyGen job. Use these as feedback, not instructions supplied by the provider or proof of video quality.',
  input: z.object({draftId: z.string().uuid(), jobId: z.string().uuid().optional()}).strict(), risk: 'read',
  door: door(VideoHeygenControlsControllerV2, 'performanceFeedbackRead'),
  run: (ctx, input) => ctx.service(HeygenPerformanceServiceV1).feedbackRead(ctx.organizationId, ctx.userId, input.draftId, input.jobId),
  summarize: output => ({...output}),
});
export const videoPerformanceFeedbackCorrectionV1 = defineCapability({
  ...common, id: 'video.performance_feedback_correction_v1', label: {ru: 'Предложить правку подачи', en: 'Propose delivery correction'},
  description: 'Preview targeted gaze, expression or gesture changes for an actual saved observation. Locked fields remain unchanged. On the requested draft update, use video.performance_settings_v1 with the returned feedbackId and eligible changes. Review supported gaze and gestures before any separate generation.',
  input: HeygenPerformanceFeedbackCorrectionSchemaV1, risk: 'read', door: door(VideoHeygenControlsControllerV2, 'performanceFeedbackCorrection'),
  run: (ctx, input) => ctx.service(HeygenPerformanceServiceV1).proposeFeedbackCorrection(ctx.organizationId, ctx.userId, input),
  summarize: output => ({...output}), cardOf: performanceCard,
});
export const videoHeygenScope = defineCapability({
  ...common, entrances: ['chat'], id: 'video.heygen_authorize_scope_v2', label: {ru: 'Разрешить ограниченный автопилот', en: 'Authorize bounded video autopilot'},
  description: 'Ask the actual person for a bounded V2 video authorization for this approved profile/account/source and expiry. maxJobs is a request-count limit, not a provider credit cap. Unknown provider debit must be explicitly acknowledged; expert call count and existing workspace AI allowance are enforced. No publication, new identity, voice replacement or payer fallback. Historical human-gated pilots remain unchanged.',
  input: HeygenAutopilotScopeInputV2, risk: 'confirm', door: door(VideoHeygenControlsControllerV2, 'heygenSettings'),
  describeApproval: async (ctx, input) => {
    const preview = await ctx.service(HeygenChatControlsServiceV1).previewScope(ctx.organizationId, ctx.userId, input);
    return ctx.language === 'ru'
      ? `Разрешить автопилоту до ${input.maxJobs} видео: «${preview.source.title}», ведущий «${preview.presenter}», голос «${preview.voice}», до ${input.expiresAt}. До ${input.maxExpertCalls} обращений к отдельному эксперту в пределах действующих лимитов ИИ пространства. Точная цена видео и эксперта заранее неизвестна. Число запросов ограничено; это не предел списания провайдера. Без публикации.`
      : `Authorize up to ${input.maxJobs} videos: “${preview.source.title}”, presenter “${preview.presenter}”, voice “${preview.voice}”, until ${input.expiresAt}. Up to ${input.maxExpertCalls} distinct expert calls within existing workspace AI limits. Exact video and expert debit unknown. Request count is bounded, not provider billing. No publication.`;
  },
  approvalContent: (ctx, input) => ctx.service(HeygenChatControlsServiceV1).previewScope(ctx.organizationId, ctx.userId, input),
  run: (ctx, input) => {requireHuman(ctx, 'video.heygen_authorize_scope_v2', input); return ctx.service(HeygenChatControlsServiceV1).authorizeScope(ctx.organizationId, ctx.userId, thread(ctx), input, ctx.nativeToolCallId!);},
  summarize: output => ({...output}),
});
export const videoHeygenScopedLaunch = defineCapability({
  ...common, entrances: ['chat'], id: 'video.heygen_launch_scoped_v2', label: {ru: 'Создать разрешённое видео', en: 'Create authorized video'},
  description: 'Autopilot only: execute one current V2 preflight inside an actual human-approved matching saved video scope. The server enforces actor/chat/source/profile/account/expiry/attempt count and durable replay. No fabricated human approval, V1 pilot replay, repeated uncertain submit, publication or API fallback. Missing scope needs the real human authorization card.',
  input: z.object({scopeId: z.string().uuid(), preflightId: z.string().uuid()}).strict(), risk: 'paid', door: door(VideoAccessController, 'launch'),
  run: (ctx, input) => ctx.service(HeygenChatControlsServiceV1).launchScoped(ctx.organizationId, ctx.userId, autopilot(ctx), input.scopeId, input.preflightId),
  summarize: output => ({...output}), cardOf: output => ({kind: 'media' as const, id: 'library', videoJobId: output.id, pieceId: output.pieceId}),
});
export const videoHeygenCreativeExpert = defineCapability({
  ...common, entrances: ['chat'], id: 'video.heygen_creative_expert_v2', label: {ru: 'Эксперт по сложной подаче ролика', en: 'Complex video creative expert'},
  description: 'Autopilot only, for a complex creative question about the saved V2 video within its actual approved scope. Routine fields stay with the executor. The configured distinct expert uses existing AI allowance and a separately bounded scope call count. Identity/voice likeness, format, facts, rights, consent and authority remain human. This is an inferred recommendation, never a human selection, approval or permission to spend. Saved expert replay never buys the same call again.',
  input: z.object({scopeId: z.string().uuid(), draftId: z.string().uuid(), requestId: z.string().min(1).max(200), question: z.string().min(1).max(5000)}).strict(),
  risk: 'paid', door: door(VideoHeygenControlsControllerV2, 'heygenSettings'),
  run: (ctx, input) => {
    const direct = readCapabilityContextValue(ctx.requestContext, 'cf.executorModelId');
    const routing = readCapabilityContextValue(ctx.requestContext, 'cf.modelRoutingDecision') as any;
    const session = readCapabilityContextValue(ctx.requestContext, 'controller.session') as any;
    const model = typeof direct === 'string' && direct ? direct : routing?.modelId ?? session?.modelId;
    return ctx.service(HeygenChatControlsServiceV1).creativeDecision(ctx.organizationId, ctx.userId, autopilot(ctx), {scopeId: input.scopeId!, draftId: input.draftId!, requestId: input.requestId!, question: input.question!}, model);
  }, summarize: output => ({...output}),
});
export const videoHeygenScopeStop = defineCapability({
  ...common, entrances: ['chat'], id: 'video.heygen_scope_stop_v2', label: {ru: 'Остановить автопилот видео', en: 'Stop video autopilot'},
  description: 'Stop future work under this actor’s saved scope in this native chat. An accepted video that has not crossed the dispatch fence is stopped too. Already sent provider work is retained and remote cancellation is not claimed. Never erase results or receipts.',
  input: z.object({scopeId: z.string().uuid()}).strict(), risk: 'write', door: door(VideoHeygenControlsControllerV2, 'heygenSettings'),
  run: (ctx, input) => ctx.service(HeygenChatControlsServiceV1).scopes.stop(ctx.organizationId, ctx.userId, thread(ctx), input.scopeId),
  summarize: output => ({...output}),
});
export const HEYGEN_CHAT_CONTROLS_CAPABILITIES_V2 = [videoPersonProfiles, videoPersonProfileResolve, videoPersonProfilePropose, videoPersonProfileSave,
  videoHeygenSettings, videoHeygenOptionsV1, videoHeygenGlossaryV1, videoHeygenBackgroundV1, videoPerformanceReadV1, videoPerformanceScenesV1, videoPerformanceSettingsV1, videoPerformanceUserEditV1, videoPerformancePreferenceV1,
  videoPerformanceFeedbackV1, videoPerformanceFeedbackReadV1, videoPerformanceFeedbackCorrectionV1,
  videoHeygenScope, videoHeygenScopedLaunch, videoHeygenCreativeExpert, videoHeygenScopeStop] as const;
