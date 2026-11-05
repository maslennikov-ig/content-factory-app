import { createHash } from 'node:crypto';
import { z } from 'zod';
import { videoErrorV1 } from '../video-brief.v1';
import { subscriptionHash } from './video-provider-registry';
import { HGG_PILOT_EVIDENCE_V1 } from './video-hgg-pilot-evidence.v1';
import { SourceArtifactRefSchemaV1 } from '../../content-intelligence/social-factory/contracts/source-artifact.v1';

const id = z.string().min(1).max(512).refine(v => !/[\u0000-\u001f\u007f]/.test(v));
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const positive = z.number().int().positive().safe();
const ownerSchema = z.object({organizationId: id, actorId: id, connectionId: id, accountGeneration: positive}).strict();
export type HggPilotQuoteOwnerV1 = z.infer<typeof ownerSchema>;
const source = z.object({pilotId: id, parentRevision: positive, sourceArtifactRef: SourceArtifactRefSchemaV1,
  sourceContentDigest: digest, scenarioDigest: digest, acceptedTextReviewDigest: digest, acceptedTextReviewInputHash: digest}).strict();
const asset = z.object({ownedMediaId: id, byteSha256: digest, providerMediaId: z.string().uuid(), connectionId: id, accountGeneration: positive}).strict();
export type HggPilotQuoteAssetV1 = z.infer<typeof asset> & {slot: 'first' | 'last'};
const first = asset.extend({slot: z.literal('first')});
const last = asset.extend({slot: z.literal('last')});
const prompt = z.string().min(1).max(20_000).refine(v => !!v.trim());
const inputSchema = z.discriminatedUnion('kind', [
  z.object({version: z.literal(1), kind: z.literal('image_frame'), slot: z.enum(['first', 'last']), source, prompt,
    settings: z.object({variant: z.enum(['flare', 'sunburst']), quality: z.enum(['low', 'medium', 'high', 'xhigh', 'max']),
      resolution: z.enum(['1k', '2k', '4k']), background: z.enum(['auto', 'opaque', 'transparent']).optional()}).strict(),
    references: z.array(first).max(1),
  }).strict(),
  z.object({version: z.literal(1), kind: z.literal('video'), source, prompt,
    resolution: z.enum(['720p', '1080p']).optional(),
    frames: z.union([z.tuple([]), z.tuple([first, last])]),
  }).strict(),
]);
/** Reused by the separately qualified native catalogue profile; old evidence-pinned entry stays unchanged. */
export const HggPilotQuoteInputSchemaV1 = inputSchema;
export type HggPilotQuoteInputV1 = z.infer<typeof inputSchema>;
export interface HggPilotEvidenceBytesV1 {imageDetail: Uint8Array; videoCatalogue: Uint8Array}
const frozen = <T>(v: T): T => {if (v && typeof v === 'object') {Object.values(v).forEach(frozen); Object.freeze(v);} return v;};

function models(evidence: HggPilotEvidenceBytesV1) {
  const read = (key: keyof HggPilotEvidenceBytesV1) => {
    try {
      const bytes = evidence[key], pin = HGG_PILOT_EVIDENCE_V1[key];
      if (!(bytes instanceof Uint8Array) || bytes.byteLength > 1024 * 1024 || createHash('sha256').update(bytes).digest('hex') !== pin.sha256) throw new Error();
      const retained = JSON.parse(Buffer.from(bytes).toString('utf8'));
      if (retained.schemaDigest !== HGG_PILOT_EVIDENCE_V1.schemaDigest || !positive.safeParse(retained.accountGeneration).success ||
        retained.request?.id !== (key === 'imageDetail' ? 'image_model' : 'video_catalogue')) throw new Error();
      const rows = key === 'imageDetail' ? [retained.raw] : retained.raw.items;
      const found = rows.filter((m: any) => m?.name === pin.name && m.provider_name === pin.provider && m.output_type === (key === 'imageDetail' ? 'image' : 'video'));
      if (found.length !== 1 || !id.safeParse(found[0].id).success) throw new Error();
      return {id: found[0].id as string, generation: retained.accountGeneration as number, evidenceHash: pin.sha256};
    } catch {return videoErrorV1('VIDEO_PILOT_EVIDENCE_INVALID', 409);}
  };
  return {image: read('imageDetail'), video: read('videoCatalogue')};
}

/** One immutable cost request. No arbitrary parameters, batch, free/credit choice or submit form. */
export function hggPilotQuoteRequestV1(input: unknown, evidence: HggPilotEvidenceBytesV1, ownerInput: HggPilotQuoteOwnerV1) {
  const parsed = inputSchema.safeParse(input), owner = ownerSchema.safeParse(ownerInput);
  if (!parsed.success || !owner.success) return videoErrorV1('VIDEO_PILOT_QUOTE_INVALID', 409);
  const value = parsed.data, selected = models(evidence)[value.kind === 'video' ? 'video' : 'image'];
  const assets = (value.kind === 'video' ? value.frames : value.references) as HggPilotQuoteAssetV1[];
  if (selected.generation !== owner.data.accountGeneration || assets.some(a => a.connectionId !== owner.data.connectionId || a.accountGeneration !== owner.data.accountGeneration) ||
    value.kind === 'image_frame' && value.slot === 'first' && value.references.length) return videoErrorV1('VIDEO_PILOT_QUOTE_INVALID', 409);
  const medias = assets.map(a => ({role: value.kind === 'video' ? a.slot === 'first' ? 'start_image' : 'end_image' : 'image_references', value: a.providerMediaId}));
  const params = {model: selected.id, prompt: value.prompt, count: 1, aspect_ratio: '9:16',
    ...(value.kind === 'video' ? {mode: 'image-to-video', resolution: value.resolution ?? '1080p', duration: 5} : value.settings),
    ...(medias.length ? {medias} : {}), get_cost: true as const};
  const tool = value.kind === 'video' ? 'generate_video' as const : 'generate_image' as const;
  const modelBindingHash = subscriptionHash({modelId: selected.id, evidenceHash: selected.evidenceHash, schemaDigest: HGG_PILOT_EVIDENCE_V1.schemaDigest});
  const settingsHash = subscriptionHash(value.kind === 'video' ? {mode: 'image-to-video', resolution: value.resolution ?? '1080p', duration: 5, aspect_ratio: '9:16', count: 1} : {...value.settings, aspect_ratio: '9:16', count: 1});
  const inputOrderDigest = subscriptionHash(assets);
  const requestHash = subscriptionHash({profile: 'hgg_pilot_cost_v1', owner: owner.data, input: value, tool, params, modelBindingHash, settingsHash, inputOrderDigest});
  return frozen({profile: 'hgg_pilot_cost_v1' as const, tool, arguments: {params}, input: value, accountGeneration: owner.data.accountGeneration,
    modelBindingHash, settingsHash, inputOrderDigest, requestHash, schemaDigest: HGG_PILOT_EVIDENCE_V1.schemaDigest});
}
export type HggPilotQuoteRequestV1 = ReturnType<typeof hggPilotQuoteRequestV1>;
export interface HggPilotQuoteHooksV1 {
  beforeSession(): Promise<void>;
  beforeQuote(request: HggPilotQuoteRequestV1): Promise<void>;
  /** Private raw capture before semantic validation. Never forward provider prose to a conductor. */
  afterQuote(request: HggPilotQuoteRequestV1, raw: Record<string, unknown>): Promise<void>;
}
const finite = z.number().finite().nonnegative();
const inputCheck = z.object({required_media_present: z.boolean(), image_count: finite.int(), video_count: finite.int(),
  missing_roles: z.array(z.enum(['image', 'video'])), generation_validated: z.literal(false)}).strict();
export function decodeHggPilotQuoteV1(request: HggPilotQuoteRequestV1, raw: Record<string, unknown>) {
  if (raw.error) return videoErrorV1('VIDEO_PROVIDER_TOOL_ERROR', 409);
  if (raw.unlim_choice) return videoErrorV1('VIDEO_FUNDING_CHOICE_REQUIRED', 409);
  if (Array.isArray(raw.results) && raw.results.length || raw.job_id || raw.jobId || raw.id) return videoErrorV1('VIDEO_QUOTE_UNEXPECTED_JOB', 409);
  const parsed = z.object({cost: z.object({credits: finite, credits_exact: finite}).strict(),
    input_check: inputCheck.optional(), prepared_params: z.record(z.unknown()).optional(),
    adjustments: z.record(z.unknown()).optional(), results: z.array(z.never()).max(0).optional(), request_id: id.optional(),
  }).strict().safeParse(raw);
  if (!parsed.success) return videoErrorV1('VIDEO_PROVIDER_RESPONSE_INVALID', 409);
  const value = parsed.data;
  if (Object.keys(value.adjustments || {}).length || Object.entries(value.prepared_params || {}).some(([k, v]) =>
    !(k in request.arguments.params) || subscriptionHash(v) !== subscriptionHash((request.arguments.params as Record<string, unknown>)[k]))) return videoErrorV1('VIDEO_QUOTE_ADJUSTED', 409);
  const cost = {credits: value.cost.credits, creditsExact: value.cost.credits_exact};
  return frozen({version: 1 as const, profile: request.profile, requestHash: request.requestHash, modelBindingHash: request.modelBindingHash,
    settingsHash: request.settingsHash, inputOrderDigest: request.inputOrderDigest, schemaDigest: request.schemaDigest,
    cost, quoteHash: subscriptionHash({requestHash: request.requestHash, cost}), inputValidated: false as const,
    generationReady: false as const, walletVerified: false as const, paidSubmitEnabled: false as const, canSubmit: false as const,
    blockers: ['Оценка провайдера не подтверждает готовность входных данных.', 'Запуск генерации по этому профилю ещё не разрешён.'],
    ...(value.input_check ? {providerInputCheck: value.input_check} : {})});
}
export type HggPilotQuoteV1 = ReturnType<typeof decodeHggPilotQuoteV1>;

/** Future receipt mapping only. There is no transport method or paid-submit builder for this profile. */
const receiptSchema = z.object({profile: z.literal('hgg_pilot_job_v1'), requestHash: digest,
  kind: z.enum(['image', 'video']), modelId: id, jobId: z.string().uuid()}).strict();
export type HggPilotJobReceiptV1 = z.infer<typeof receiptSchema>;
export function hggPilotWaitRequestV1(input: HggPilotJobReceiptV1) {
  const receipt = receiptSchema.safeParse(input);
  if (!receipt.success) return videoErrorV1('VIDEO_PROVIDER_JOB_INVALID', 409);
  return frozen({tool: 'jobs_wait', arguments: {jobs: [{index: 0, job_id: receipt.data.jobId}], timeout_seconds: 15}});
}
export function decodeHggPilotWaitV1(input: HggPilotJobReceiptV1, raw: unknown) {
  const receipt = receiptSchema.safeParse(input);
  const parsed = z.object({jobs: z.array(z.object({index: z.literal(0), job_id: z.string().uuid(),
    status: z.enum(['pending', 'waiting', 'queued', 'dna', 'script', 'visuals', 'vision', 'flow', 'in_progress', 'ip_detect', 'completed', 'canceled', 'failed', 'nsfw', 'ip_detected', 'lookup_failed']),
    type: z.enum(['image', 'video', 'audio', '3d']).optional(), model: id.optional(), result_url: z.string().optional(), exr_url: z.string().optional(),
    thumbnail_url: z.string().optional(), error: z.string().optional(), retryable: z.boolean().optional(),
  }).strict()).length(1), summary: z.object({total: finite.int(), completed: finite.int(), failed: finite.int(), active: finite.int(), errors: finite.int()}).strict(),
    all_terminal: z.boolean(), timed_out: z.boolean().optional(), aborted: z.boolean().optional(), poll_after_seconds: finite.optional(),
  }).strict().safeParse(raw);
  if (!receipt.success || !parsed.success) return videoErrorV1('VIDEO_PROVIDER_RESPONSE_INVALID', 409);
  const job = parsed.data.jobs[0];
  if (job.job_id !== receipt.data.jobId || job.type && job.type !== receipt.data.kind || job.model && job.model !== receipt.data.modelId || parsed.data.summary.total !== 1) return videoErrorV1('VIDEO_PROVIDER_JOB_INVALID', 409);
  return frozen({jobId: job.job_id, status: job.status,
    state: job.status === 'lookup_failed' ? 'lookup_unknown' : job.status === 'completed' ? 'completed_unvalidated' : ['canceled', 'failed', 'nsfw', 'ip_detected'].includes(job.status) ? 'terminal' : 'active',
    ...(job.result_url ? {candidateResultUrl: job.result_url} : {}), resultRequiresValidation: true as const,
    ...(job.retryable === undefined ? {} : {lookupRetryable: job.retryable}), allTerminal: parsed.data.all_terminal,
    replayAllowed: false as const, actualCost: null});
}
