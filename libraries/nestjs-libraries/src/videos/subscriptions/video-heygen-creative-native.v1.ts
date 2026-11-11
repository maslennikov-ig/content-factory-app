import { z } from 'zod';
import { videoErrorV1 } from '../video-brief.v1';
import { HEYGEN_STYLE_TOOL_SCHEMAS_V1 } from './video-heygen-style.v1';
import { HEYGEN_VOICE_TOOL_SCHEMAS_V1 } from './video-heygen-voice-setup.v1';
import { subscriptionHash } from './video-provider-registry';
import { parseHeygenStyleReceiptV1, type HeygenStyleReceiptV1 } from './video-heygen-style.v1';

/** Exact authenticated 108-tool input inventory, 7 November. No output schema was advertised. */
export const HEYGEN_CREATIVE_TOOL_SCHEMAS_V1 = {...HEYGEN_STYLE_TOOL_SCHEMAS_V1, ...HEYGEN_VOICE_TOOL_SCHEMAS_V1} as const;
const id = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/);
const english = z.string().trim().min(1).max(4000).refine(value => !/[\u0000-\u001f\u007f]|https?:\/\//u.test(value) &&
  !Array.from(value).some(char => /\p{L}/u.test(char) && !/[a-z]/i.test(char)));
const label = z.string().trim().min(1).max(120).refine(value => !/[\u0000-\u001f\u007f]|https?:\/\/|\bbearer\s/iu.test(value));
const asset = z.object({type: z.literal('asset_id'), asset_id: id}).strict();
const style = z.object({name: label, prompt: english, avatarId: id, avatarGroupId: id,
  aspectRatio: z.enum(['auto', '16:9', '9:16', '1:1', '4:5', '5:4']), referenceImages: z.array(asset).max(3).optional()}).strict();
const clone = z.object({audio: asset, voiceName: label.refine(value => value.length <= 64), removeBackgroundNoise: z.boolean(), language: z.enum(['en', 'ru']).optional()}).strict();
const plain = z.string().min(1).max(1200).refine(value => value.trim().length > 0 &&
  !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value) &&
  !/<\/?(?:speak|break|prosody|phoneme|say-as|voice|audio|emphasis|sub|lang|p)\b[^>]*>/iu.test(value) &&
  !/\[(?:pause|long pause|short pause|warm|excited|sad|happy|angry|whisper|whispering|laugh|laughing|sigh|sighing|calm|serious)\]/iu.test(value));
const speech = z.object({text: plain, voiceId: id, inputType: z.literal('text'), speed: z.number().finite().min(0.5).max(2),
  language: z.enum(['en', 'ru']), locale: z.enum(['en-US', 'ru-RU']).optional(), forceRegenerate: z.literal(false),
  engine: z.enum(['elevenlabs', 'heygen_voice', 'starfish']), settings: z.object({model_id: z.enum([
    'eleven_multilingual_v2', 'eleven_flash_v2_5', 'eleven_turbo_v2_5', 'eleven_v3', 'eleven_v4',
  ])}).strict().optional()}).strict().refine(value => (!value.settings || value.engine === 'elevenlabs') &&
    (!value.locale || value.engine !== 'elevenlabs' && value.locale.split('-')[0] === value.language));
const mutation = z.discriminatedUnion('tool', [
  z.object({tool: z.literal('create_prompt_avatar'), arguments: style}).strict(),
  z.object({tool: z.literal('clone_voice'), arguments: clone}).strict(),
  z.object({tool: z.literal('create_speech'), arguments: speech}).strict(),
]);
const read = z.discriminatedUnion('tool', [
  z.object({tool: z.literal('get_avatar_look'), arguments: z.object({lookId: id}).strict()}).strict(),
  z.object({tool: z.literal('get_voice'), arguments: z.object({voiceId: id}).strict()}).strict(),
  // No ambiguous group-only polling: retain exactly the provider's returned operation role.
  z.object({tool: z.literal('get_avatar_creation_status'), arguments: z.object({photarId: id}).strict()}).strict(),
]);
export type HeygenCreativeMutationV1 = z.infer<typeof mutation>;
export type HeygenCreativeReadV1 = z.infer<typeof read>;
export const heygenCreativeMutationV1 = (raw: unknown): HeygenCreativeMutationV1 => {
  const parsed = mutation.safeParse(raw);
  return parsed.success ? parsed.data : videoErrorV1('VIDEO_CREATIVE_ARGUMENTS_UNAVAILABLE', 409);
};
export const heygenCreativeReadV1 = (raw: unknown): HeygenCreativeReadV1 => {
  const parsed = read.safeParse(raw);
  return parsed.success ? parsed.data : videoErrorV1('VIDEO_CREATIVE_ARGUMENTS_UNAVAILABLE', 409);
};
/** Structural envelope only. It establishes no successful provider operation/result contract. */
export function heygenCreativeEnvelopeV1(raw: unknown): Record<string, unknown> {
  const object = (value: unknown): Record<string, any> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return videoErrorV1('VIDEO_CREATIVE_RESPONSE_INVALID', 409);
    const record = value as Record<string, any>;
    if (record.error != null || record.isError === true || record.success === false) return videoErrorV1('VIDEO_CREATIVE_PROVIDER_ERROR', 409);
    return record;
  };
  let result = object(raw);
  if (Buffer.byteLength(JSON.stringify(result)) > 1024 * 1024) return videoErrorV1('VIDEO_CREATIVE_RESPONSE_INVALID', 409);
  if (result.kind === 'http') {
    if (!Number.isInteger(result.status) || result.status < 200 || result.status > 299 || typeof result.body !== 'string') return videoErrorV1('VIDEO_CREATIVE_RESPONSE_INVALID', 409);
    try {result = object(JSON.parse(result.body));} catch {return videoErrorV1('VIDEO_CREATIVE_RESPONSE_INVALID', 409);}
  }
  if (result.jsonrpc !== undefined) {
    if (result.jsonrpc !== '2.0' || result.error != null) return videoErrorV1('VIDEO_CREATIVE_RESPONSE_INVALID', 409);
    result = object(result.result);
  }
  if (result.content !== undefined || result.structuredContent !== undefined) {
    let text: Record<string, unknown> | undefined;
    if (result.content !== undefined) {
      if (!Array.isArray(result.content) || result.content.length !== 1 || result.content[0]?.type !== 'text' || typeof result.content[0].text !== 'string') return videoErrorV1('VIDEO_CREATIVE_RESPONSE_INVALID', 409);
      try {text = object(JSON.parse(result.content[0].text));} catch {return videoErrorV1('VIDEO_CREATIVE_RESPONSE_INVALID', 409);}
    }
    const structured = result.structuredContent === undefined ? undefined : object(result.structuredContent);
    // Conflicting envelopes are uncertain, rather than choosing whichever declares success.
    if (text && structured && subscriptionHash(text) !== subscriptionHash(structured)) return videoErrorV1('VIDEO_CREATIVE_RESPONSE_INVALID', 409);
    result = structured ?? text ?? videoErrorV1('VIDEO_CREATIVE_RESPONSE_INVALID', 409);
  }
  return object(result);
}

const promptLookReceipt = z.object({data: z.object({avatar_item: z.object({id, group_id: id}).passthrough(),
  avatar_group: z.record(z.unknown()),
}).strict(), error: z.null().optional()}).strict();
/** Official MCP creation reference, pinned 7 November inspection:
 * https://github.com/heygen-com/skills/blob/1bd5e4d33a028dfed3abf504c5e3dd644fb9ea8a/heygen-avatar/references/avatar-creation.md#L99-L118
 * It returns one look resource and group. No photar/job ID or three-look bundle is documented.
 */
export function decodeHeygenPromptLookReceiptV1(raw: unknown): HeygenStyleReceiptV1 {
  const parsed = promptLookReceipt.safeParse(heygenCreativeEnvelopeV1(raw));
  if (!parsed.success) return videoErrorV1('VIDEO_STYLE_RECEIPT_CONTRACT_UNQUALIFIED', 409);
  const {avatar_item: look, avatar_group: group} = parsed.data.data;
  if (look.error != null || group.error != null || group.id !== undefined && group.id !== look.group_id)
    return videoErrorV1('VIDEO_STYLE_RECEIPT_INVALID', 409);
  return parseHeygenStyleReceiptV1({operationId: look.id, childLookIds: [look.id], referenceKind: 'look', groupId: look.group_id});
}
