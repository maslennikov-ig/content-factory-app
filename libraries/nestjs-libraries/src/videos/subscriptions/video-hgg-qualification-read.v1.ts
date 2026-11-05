import { z } from 'zod';
import { videoErrorV1 } from '../video-brief.v1';

/** Accepted tools/list evidence only. This never approves generation or wallet identity. */
export const HGG_READ_SCHEMA_V1 = '58a9127974601965209a272cd4503a4c4e843559876604e5fa53f9ac645b685d';
export const HGG_READ_CAPTURE_SHA_V1 = '416a52da49c4060a025d75e6ab6777d23e4f8531ff6cd250a5eac8d25bacbdaf';
const id = z.string().min(1).max(512).refine(value => !/[\u0000-\u001f\u007f]/.test(value));
const command = z.discriminatedUnion('kind', [
  z.object({kind: z.literal('workspaces')}).strict(), z.object({kind: z.literal('balance')}).strict(),
  z.object({kind: z.literal('video_search')}).strict(), z.object({kind: z.literal('image_search')}).strict(),
  z.object({kind: z.literal('video_catalogue')}).strict(),
  z.object({kind: z.literal('audio_catalogue')}).strict(), z.object({kind: z.literal('workflow_catalogue')}).strict(),
  z.object({kind: z.literal('narration_workflow')}).strict(), z.object({kind: z.literal('montage_workflow')}).strict(),
  z.object({kind: z.literal('video_model'), modelId: id}).strict(), z.object({kind: z.literal('image_model'), modelId: id}).strict(),
]);
export type HggReadCommandV1 = z.infer<typeof command>;
export const HGG_BASE_READS_V1: readonly HggReadCommandV1[] = Object.freeze([
  {kind: 'workspaces'}, {kind: 'balance'}, {kind: 'video_search'}, {kind: 'image_search'},
]);
export function hggReadPlanV1(input: unknown): HggReadCommandV1[] {
  const parsed = z.array(command).min(1).max(4).safeParse(input);
  if (!parsed.success) return videoErrorV1('VIDEO_QUALIFICATION_READ_INVALID', 409);
  const kinds = parsed.data.map(c => c.kind);
  const fixed = ['audio_catalogue,workflow_catalogue', 'narration_workflow,montage_workflow', 'video_catalogue', 'workspaces,balance,video_search,image_search'].includes(kinds.join(','));
  if (!fixed &&
    (kinds.length > 2 || new Set(kinds).size !== kinds.length || kinds.some(k => !['video_model', 'image_model'].includes(k)))) return videoErrorV1('VIDEO_QUALIFICATION_READ_INVALID', 409);
  return parsed.data;
}
export function hggReadRequestV1(input: HggReadCommandV1) {
  const value = command.parse(input);
  const args = value.kind === 'video_catalogue' ? {action: 'list', type: 'video', input: 'image', limit: 100}
    : value.kind === 'audio_catalogue' ? {action: 'list', type: 'audio', input: 'text', limit: 100}
    : value.kind === 'narration_workflow' ? {workflow: 'narration'}
    : value.kind === 'montage_workflow' ? {workflow: 'video-montage'}
    : value.kind === 'video_search' ? {action: 'search', query: 'Kling 4.0', type: 'video', input: 'image', limit: 10}
    : value.kind === 'image_search' ? {action: 'search', query: 'image editing reference image consistent first last frames portrait', type: 'image', input: 'image', limit: 10}
    : 'modelId' in value ? {action: 'get', model_id: value.modelId} : {};
  return Object.freeze({id: value.kind, tool: value.kind === 'workspaces' ? 'list_workspaces' : value.kind === 'balance' ? 'balance'
    : ['workflow_catalogue', 'narration_workflow', 'montage_workflow'].includes(value.kind) ? 'get_workflow_instructions' : 'models_explore', arguments: Object.freeze(args)});
}
export type HggReadRequestV1 = ReturnType<typeof hggReadRequestV1>;
export interface HggReadHooksV1 {
  /** After local session/credential/scope preflight, before any MCP request. */
  beforeSession(): Promise<void>;
  beforeRead(request: HggReadRequestV1): Promise<void>;
  /** Capture raw untrusted result before validating; never forward it to chat. */
  afterRead(request: HggReadRequestV1, raw: Record<string, unknown>): Promise<void>;
}
const finite = z.number().finite().nonnegative();
const model = z.object({id, name: z.string(), provider_name: z.string(), description: z.string(), output_type: z.enum(['image', 'video', 'audio', '3d']),
  parameters: z.array(z.object({name: z.string(), required: z.enum(['required', 'optional']), type: z.enum(['string', 'number', 'bool', 'string_array', 'object_array'])}).passthrough()),
  medias: z.array(z.object({name: z.string(), type: z.literal('image'), roles: z.array(z.string()).optional()}).passthrough()), aspect_ratios: z.array(z.string()),
  durations: z.array(finite).optional(), duration_range: z.object({min: finite, max: finite}).optional(),
  credits_per_unit: finite.optional(), credit_unit: z.enum(['per_image', 'per_second']).optional(),
  supports_unlim: z.boolean().optional(), supports_free_gens: z.boolean().optional(),
}).passthrough();
const unlim = z.object({available: z.boolean(), remaining: finite.nullable().optional(), expires_at: z.string().nullable().optional()}).passthrough();
export function decodeHggReadV1(input: HggReadCommandV1, value: Record<string, unknown>) {
  if ('error' in value && value.error !== undefined && value.error !== null && value.error !== '') return videoErrorV1('VIDEO_PROVIDER_TOOL_ERROR', 409);
  if (input.kind === 'narration_workflow' || input.kind === 'montage_workflow') {
    const parsed = z.object({mode: z.literal('workflow'), source: z.literal('bundled_resource'),
      workflow: z.literal(input.kind === 'narration_workflow' ? 'narration' : 'video-montage'), instructions_markdown: z.string().min(1),
    }).passthrough().safeParse(value);
    if (!parsed.success) return videoErrorV1('VIDEO_PROVIDER_RESPONSE_INVALID', 409);
    // Private reference only; no instruction, path or script becomes executable authority.
    return parsed.data;
  }
  if (input.kind === 'workflow_catalogue') {
    // Untrusted reference only. A catalogue never authorizes loading or executing a workflow.
    const parsed = z.object({mode: z.literal('catalog'), source: z.literal('bundled_resource'),
      workflows: z.array(z.object({name: id, description: z.string().max(4000), version: z.string().max(512).optional()}).passthrough()).max(100),
    }).passthrough().safeParse(value);
    if (!parsed.success || new Set(parsed.data.workflows.map(w => w.name)).size !== parsed.data.workflows.length)
      return videoErrorV1('VIDEO_PROVIDER_RESPONSE_INVALID', 409);
    return parsed.data;
  }
  const type = input.kind === 'audio_catalogue' ? 'audio' : input.kind.startsWith('video') ? 'video' : 'image';
  const schema = input.kind === 'workspaces' ? z.object({workspaces: z.array(z.object({id, name: z.string().nullable(),
    type: z.enum(['private', 'shared']), user_role: z.enum(['owner', 'member']), is_selected: z.boolean(), plan_type: z.string(), credits: finite}).passthrough())}).passthrough()
    : input.kind === 'balance' ? z.object({credits: finite, subscription_plan_type: z.string()}).passthrough()
    : 'modelId' in input ? model.refine(m => m.id === input.modelId && m.output_type === type)
    : z.object({items: z.array(model).max(input.kind === 'video_catalogue' || input.kind === 'audio_catalogue' ? 100 : 10), has_more: z.boolean().optional(), next_page_token: z.string().optional(), unlim: unlim.optional()}).passthrough()
      .refine(result => result.items.every(m => m.output_type === type));
  const result = schema.safeParse(value);
  if (!result.success) return videoErrorV1('VIDEO_PROVIDER_RESPONSE_INVALID', 409);
  if (input.kind === 'workspaces') {
    const rows = (result.data as any).workspaces;
    if (new Set(rows.map((w: any) => w.id)).size !== rows.length) return videoErrorV1('VIDEO_PROVIDER_RESPONSE_INVALID', 409);
  }
  return result.data;
}
/** IDs may only be selected by root/D from the retained, type-matching base result. */
export function hggDetailReadsV1(selection: unknown, base: {video: Record<string, unknown>; image: Record<string, unknown>}) {
  const parsed = z.object({videoId: id.optional(), imageId: id.optional()}).strict().safeParse(selection);
  if (!parsed.success || !parsed.data.videoId && !parsed.data.imageId) return videoErrorV1('VIDEO_QUALIFICATION_READ_INVALID', 409);
  const result: HggReadCommandV1[] = [];
  for (const type of ['video', 'image'] as const) {
    const selected = parsed.data[type === 'video' ? 'videoId' : 'imageId'];
    if (!selected) continue;
    const data = decodeHggReadV1({kind: type === 'video' ? 'video_search' : 'image_search'}, base[type]) as any;
    if (data.items.filter((m: any) => m.id === selected && m.output_type === type).length !== 1) return videoErrorV1('VIDEO_QUALIFICATION_READ_INVALID', 409);
    result.push({kind: type === 'video' ? 'video_model' : 'image_model', modelId: selected});
  }
  return result;
}
