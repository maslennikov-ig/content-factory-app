import { createHash } from 'node:crypto';
import { HttpException } from '@nestjs/common';
import { z } from 'zod';

export const HEYGEN_VOICE_TOOL_SCHEMAS_V1 = {
  clone_voice: '786e1b119062600b74f953dd1c9ef17c35b3db7a342ba16fe56df560da98d97e',
  create_speech: 'f8a78b8f1155a83360650d06f642e15a834749e8f7c36b1822dfc4e6d4d00777',
  get_voice: '4568f8b6e4709df689d096daa548f3c9aef56a971bb7474c20f9d0d9095226b8',
} as const;
export const voiceSetupHashV1 = (value: unknown): string => {
  const canonical = (v: any): any => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object'
    ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
};
export function voiceSetupErrorV1(code: string, remedy?: string): never {
  throw new HttpException({code, ...(remedy ? {remedy} : {})}, 409);
}
const id = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/), uuid = z.string().uuid(), digest = z.string().regex(/^[a-f0-9]{64}$/);
const label = z.string().min(1).max(120).refine(v => v.trim().length > 0 && !/[\u0000-\u001f\u007f]|https?:\/\/|\bbearer\s/iu.test(v));
export const HeygenVoiceLocaleSchemaV1 = z.enum(['en-US', 'ru-RU']);
const plain = z.string().min(1).max(1200).refine(v => v.trim().length > 0 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(v));
export const HeygenVoiceAuditionSchemaV1 = z.object({text: plain, locale: HeygenVoiceLocaleSchemaV1}).strict();
export const HeygenVoiceIntakeSchemaV1 = z.object({setupId: uuid, connectionId: uuid,
  intent: z.enum(['reproduce_person', 'narrator', 'recorded_speech']), originalMediaId: uuid.optional(), profileId: uuid.optional(),
  audition: HeygenVoiceAuditionSchemaV1.optional(), label: label.optional(),
}).strict();
export type HeygenVoiceIntakeV1 = z.infer<typeof HeygenVoiceIntakeSchemaV1>;
export const HeygenOwnedAudioSchemaV1 = z.object({mediaId: uuid, organizationId: id, actorId: id,
  origin: z.enum(['original_upload', 'original_recording_selected_by_person', 'generated_preview']), label, contentDigest: digest, bytes: z.number().int().positive().max(512 * 1024 * 1024),
  mimeType: z.enum(['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/ogg', 'audio/webm', 'audio/flac']),
  container: id, codec: id, durationSeconds: z.number().finite().positive(), sampleRate: z.number().int().positive(), channels: z.number().int().min(1).max(8),
  playable: z.boolean(), quality: z.object({speech: z.enum(['present', 'absent', 'unknown']), speakers: z.enum(['one', 'multiple', 'unknown']),
    clipping: z.enum(['detected', 'not_detected', 'unknown']), noise: z.enum(['detected', 'not_detected', 'unknown']), language: z.string().max(60).optional()}).strict(),
}).strict();
export type HeygenOwnedAudioV1 = z.infer<typeof HeygenOwnedAudioSchemaV1>;
export const HeygenVoiceCandidateSpecSchemaV1 = z.object({candidateId: uuid, voiceId: id,
  engine: z.enum(['elevenlabs', 'heygen_voice', 'starfish']), speed: z.number().finite().min(0.5).max(1.5).default(1),
  // Intersection with the avatar renderer: an audition must yield reusable controls.
  modelId: z.enum(['eleven_multilingual_v2', 'eleven_flash_v2_5', 'eleven_turbo_v2_5', 'eleven_v3', 'eleven_v4']).optional(),
}).strict();
export type HeygenVoiceCandidateSpecV1 = z.infer<typeof HeygenVoiceCandidateSpecSchemaV1>;
export const HeygenVoiceAuditionsInputSchemaV1 = z.object({setupId: uuid, expectedRevision: z.number().int().positive(),
  candidates: z.array(HeygenVoiceCandidateSpecSchemaV1).min(1).max(3)}).strict();
export const HeygenVoiceCloneInputSchemaV1 = z.object({setupId: uuid, expectedRevision: z.number().int().positive(), operationId: uuid,
  voiceName: z.string().min(1).max(64).refine(v => v.trim().length > 0 && !/[\u0000-\u001f\u007f]/u.test(v)), removeBackgroundNoise: z.boolean()}).strict();
export const HeygenVoiceSelectionInputSchemaV1 = z.object({setupId: uuid, expectedRevision: z.number().int().positive(),
  decision: z.enum(['select', 'reject_all']), candidateId: uuid.optional(), candidateRevision: z.number().int().positive().optional()}).strict();
export const HeygenVoiceHumanDecisionSchemaV1 = z.object({decisionId: uuid, organizationId: id, actorId: id,
  source: z.enum(['authenticated_screen_action', 'confirmed_chat_action']), approvedDigest: digest, at: z.string().datetime()}).strict();
export type HeygenVoiceHumanDecisionV1 = z.infer<typeof HeygenVoiceHumanDecisionSchemaV1>;
export interface HeygenVoiceScopeV1 {organizationId: string; actorId: string; connectionId: string; subjectDigest: string; accountGeneration: number; setupId: string}
export interface HeygenVoiceAccountV1 {connectionId: string; subjectDigest: string; accountGeneration: number; billingType: 'subscription'}
export interface HeygenVoiceObservationV1 {
  voiceId: string; name: string; owned: boolean; ready: boolean;
  origin: 'personal_clone' | 'owned_narrator' | 'approved_existing'; originSourceDigest?: string; approvedProfileId?: string;
  speechSupport: 'qualified' | 'unsupported' | 'unknown'; engines: Array<'elevenlabs' | 'heygen_voice' | 'starfish'>; models?: string[];
  localeStrategy: 'regional_locale' | 'language_only';
}
export type HeygenVoiceMutationV1 = {tool: 'clone_voice' | 'create_speech'; toolSchemaDigest: string; arguments: Record<string, unknown>; requestHash: string};
export interface HeygenVoiceOperationV1 extends HeygenVoiceMutationV1 {
  operationId: string; accountGeneration: number; state: 'prepared' | 'dispatched' | 'receipt_saved' | 'completed' | 'uncertain';
  candidateId?: string; rawReceiptEncrypted?: string; voiceId?: string; blocker?: string;
}
export interface HeygenVoiceCandidateV1 {
  candidateId: string; revision: number; voiceId?: string; name: string; origin: HeygenVoiceObservationV1['origin'] | 'recorded_speech';
  spec?: HeygenVoiceCandidateSpecV1; requestedLocale?: 'en-US' | 'ru-RU'; localeStrategy?: HeygenVoiceObservationV1['localeStrategy'];
  state: 'prepared' | 'ready'; audio?: HeygenOwnedAudioV1;
}
export interface HeygenVoiceSelectionReceiptV1 extends HeygenVoiceHumanDecisionV1 {
  setupId: string; subjectDigest: string; sourceDigest: string; decision: 'select' | 'reject_all';
  candidateId?: string; candidateRevision?: number; voiceId?: string; candidateDigest?: string;
  /** Server-composed existing profile default at the actual human choice; never model input. */
  profileTarget?: {profileId: string; priorVoiceHash: string};
}
export interface HeygenVoiceSetupPayloadV1 {
  version: 1; organizationId: string; actorId: string; input: HeygenVoiceIntakeV1; subjectDigest: string;
  sourceDigest: string; original?: HeygenOwnedAudioV1; humanIntent: HeygenVoiceHumanDecisionV1;
  candidates: HeygenVoiceCandidateV1[]; operations: HeygenVoiceOperationV1[]; humanSelection?: HeygenVoiceSelectionReceiptV1;
}
export interface HeygenVoiceSetupViewV1 {
  setupId: string; revision: number; connectionId: string; profileId?: string; intent: HeygenVoiceIntakeV1['intent']; original?: HeygenOwnedAudioV1;
  audition?: HeygenVoiceIntakeV1['audition']; candidates: HeygenVoiceCandidateV1[];
  operations: Array<Pick<HeygenVoiceOperationV1, 'operationId' | 'tool' | 'state' | 'candidateId' | 'voiceId' | 'blocker' | 'requestHash'>>;
  selection?: Pick<HeygenVoiceSelectionReceiptV1, 'decisionId' | 'decision' | 'candidateId' | 'candidateRevision' | 'at'>;
  blockers: string[]; generationAuthorized: false;
}

/** Trusted infrastructure callbacks, excluded from all model/HTTP schemas.
 * dispatch MUST check the current tool pin and fence the physical send through hooks.
 * Receipt decoder callbacks exist only after their actual output contract is qualified.
 * Media callbacks read/import through the existing owned Media path, with measured bytes.
 */
export interface HeygenVoiceSetupAdapterV1 {
  currentAccount(scope: Pick<HeygenVoiceScopeV1, 'organizationId' | 'actorId' | 'connectionId'>): Promise<HeygenVoiceAccountV1>;
  /** Measurement for a prospective human declaration; proves no uploader identity. */
  inspectAccessibleAudio?(scope: HeygenVoiceScopeV1, mediaId: string): Promise<Omit<HeygenOwnedAudioV1, 'origin'>>;
  readOwnedAudio(scope: HeygenVoiceScopeV1, mediaId: string): Promise<HeygenOwnedAudioV1>;
  readVoice(scope: HeygenVoiceScopeV1, voiceId: string, toolSchemaDigest: string): Promise<HeygenVoiceObservationV1>;
  qualifyOperation(scope: HeygenVoiceScopeV1, tool: HeygenVoiceMutationV1['tool'], original?: HeygenOwnedAudioV1): Promise<{
    toolSchemaDigest: string; entitlement: 'qualified' | 'unsupported' | 'unknown'; receiptContract: 'qualified' | 'unknown';
    ownedOriginalAssetId?: string; sourceRights?: 'confirmed' | 'unknown'; consent?: 'confirmed' | 'unknown';
  }>;
  dispatch(scope: HeygenVoiceScopeV1, request: HeygenVoiceMutationV1,
    hooks: {beforeDispatch: () => Promise<void>; afterResponse: (raw: Record<string, unknown>) => Promise<void>}): Promise<void>;
  encryptReceipt(raw: Record<string, unknown>): string;
  decryptReceipt(ciphertext: string): Record<string, unknown>;
  decodeCloneReceipt?(raw: Record<string, unknown>): {voiceId: string} | null;
  decodeSpeechReceipt?(raw: Record<string, unknown>): {resultRef: string} | null;
  importSpeechResult?(scope: HeygenVoiceScopeV1, result: {resultRef: string}, operationId: string): Promise<HeygenOwnedAudioV1>;
  verifyHumanDecision(scope: HeygenVoiceScopeV1, proof: HeygenVoiceHumanDecisionV1, approvedDigest: string): Promise<boolean>;
  assertNativeApproval(scope: HeygenVoiceScopeV1, operation: HeygenVoiceOperationV1, proof: unknown): Promise<void>;
}

export const heygenVoiceIntentDigestV1 = (organizationId: string, actorId: string, input: HeygenVoiceIntakeV1, subjectDigest: string, original?: HeygenOwnedAudioV1) =>
  voiceSetupHashV1({kind: 'heygen-voice-intent/v1', organizationId, actorId, input, subjectDigest, original: original ?? null});
export const heygenVoiceSourceDigestV1 = (input: HeygenVoiceIntakeV1, original?: HeygenOwnedAudioV1) => voiceSetupHashV1({intent: input.intent, profileId: input.profileId ?? null,
  original: original ? {mediaId: original.mediaId, contentDigest: original.contentDigest, bytes: original.bytes} : null});
export const heygenVoiceSelectionDigestV1 = (payload: HeygenVoiceSetupPayloadV1, input: z.infer<typeof HeygenVoiceSelectionInputSchemaV1>) =>
  voiceSetupHashV1({kind: 'heygen-voice-selection/v1', organizationId: payload.organizationId, actorId: payload.actorId, subjectDigest: payload.subjectDigest,
    sourceDigest: payload.sourceDigest, input, candidates: payload.candidates});
export const heygenVoiceOperationApprovalDigestV1 = (scope: HeygenVoiceScopeV1, operation: HeygenVoiceOperationV1) =>
  voiceSetupHashV1({kind: 'heygen-voice-operation-approval/v1', scope, operationId: operation.operationId, requestHash: operation.requestHash});
const notation = (text: string) => /<\/?(?:speak|break|prosody|phoneme|say-as|voice|audio|emphasis|sub|lang|p)\b[^>]*>/iu.test(text) ||
  /\[(?:pause|long pause|short pause|warm|excited|sad|happy|angry|whisper|whispering|laugh|laughing|sigh|sighing|calm|serious)\]/iu.test(text);
export function heygenSpeechRequestV1(spec: HeygenVoiceCandidateSpecV1, audition: z.infer<typeof HeygenVoiceAuditionSchemaV1>, voice: HeygenVoiceObservationV1): HeygenVoiceMutationV1 {
  const candidate = HeygenVoiceCandidateSpecSchemaV1.safeParse(spec), content = HeygenVoiceAuditionSchemaV1.safeParse(audition);
  if (!candidate.success || !content.success || notation(content.data.text)) return voiceSetupErrorV1('VIDEO_VOICE_PLAIN_SPEECH_REQUIRED', 'Resolve speech-control notation as ordinary text; meaningful literal author text is retained.');
  const s = candidate.data, a = content.data;
  if (voice.voiceId !== s.voiceId || !voice.owned || !voice.ready || voice.speechSupport !== 'qualified' || !voice.engines.includes(s.engine))
    return voiceSetupErrorV1('VIDEO_VOICE_SPEECH_UNQUALIFIED', 'Qualify this owned voice and speech engine before an audition.');
  if (s.modelId && (s.engine !== 'elevenlabs' || !voice.models?.includes(s.modelId))) return voiceSetupErrorV1('VIDEO_VOICE_MODEL_UNQUALIFIED');
  const args = {text: a.text, voiceId: s.voiceId, inputType: 'text', speed: s.speed, language: a.locale.split('-')[0], forceRegenerate: false, engine: s.engine,
    ...(s.engine !== 'elevenlabs' && voice.localeStrategy === 'regional_locale' ? {locale: a.locale} : {}),
    ...(s.modelId ? {settings: {model_id: s.modelId}} : {})};
  const request = {tool: 'create_speech' as const, toolSchemaDigest: HEYGEN_VOICE_TOOL_SCHEMAS_V1.create_speech, arguments: args};
  return {...request, requestHash: voiceSetupHashV1(request)};
}

export function heygenCloneRequestV1(input: z.infer<typeof HeygenVoiceCloneInputSchemaV1>, assetId: string, locale?: 'en-US' | 'ru-RU'): HeygenVoiceMutationV1 {
  const parsed = HeygenVoiceCloneInputSchemaV1.safeParse(input);
  if (!parsed.success || !id.safeParse(assetId).success) return voiceSetupErrorV1('VIDEO_VOICE_CLONE_UNQUALIFIED');
  const args = {audio: {type: 'asset_id', asset_id: assetId}, voiceName: parsed.data.voiceName, removeBackgroundNoise: parsed.data.removeBackgroundNoise,
    ...(locale ? {language: locale.split('-')[0]} : {})};
  const request = {tool: 'clone_voice' as const, toolSchemaDigest: HEYGEN_VOICE_TOOL_SCHEMAS_V1.clone_voice, arguments: args};
  return {...request, requestHash: voiceSetupHashV1(request)};
}
