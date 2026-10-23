import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { Prisma, VideoGenerationJob } from '@prisma/client';
import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';
import { VideoGenerationRepository, VIDEO_PENDING_V1 } from '../database/prisma/video-generation/video-generation.repository';
import { AiUsageService } from '../openai/ai.usage.service';
import { getModelForRole, getOpenAiClient } from '../openai/ai.clients';
import { withoutActiveAiConfig } from '../openai/ai.provider.config';
import { runAsActingUser } from '../user/acting.user';
import { VideoCredentialsService } from './video-credentials.service';
import { HiggsfieldProviderV1 } from './providers/higgsfield.provider';
import { HeygenProviderV1 } from './providers/heygen.provider';
import { VideoMediaV1 } from './video-media.v1';
import { VIDEO_EXECUTION_V1, VideoExecutionPortV1 } from './video-execution.port.v1';
import { VideoBriefV1, VideoPrepareSchemaV1, VIDEO_PREPARATION_POLICY_V1, compileVideoBriefV1, editVideoBriefV1, parseVideoV1, validateVideoGroundingV1, videoErrorV1, videoSettingsV1, videoSourceRevisionV1 } from './video-brief.v1';
import { VideoCredentialV1, VideoPreparedRequestV1, VideoProviderErrorV1, VideoProviderIdV1, VideoProviderReceiptV1, VideoProviderStatusV1, VideoProviderV1, VideoSettingsV1 } from './video-provider.v1';

const asJson = (data: unknown) => data as Prisma.InputJsonValue;
const codeOf = (error: any) => {
  const code = error instanceof VideoProviderErrorV1 ? error.code : error?.getResponse?.()?.code;
  return typeof code === 'string' && /^[A-Za-z0-9_]{1,100}$/.test(code) ? code : 'VIDEO_OPERATION_FAILED';
};
// PostgreSQL jsonb reorders object keys; identity must not depend on that order.
const canonical = (value: any): any => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
type Preflight = {
  id: string; version: number; preflightId: string; estimate: VideoPreparedRequestV1['estimate'];
  payer: 'included' | 'workspace_key'; route: string; maxCostUsd: number;
  request: VideoPreparedRequestV1; credentialReference: string; digest: string;
};
const LaunchSchema = z.object({draftId: z.string().uuid(), version: z.number().int().positive(), preflightId: z.string().uuid(), intentId: z.string().min(16).max(100).regex(/^[A-Za-z0-9_-]+$/)}).strict();

@Injectable()
export class VideoJobService {
  constructor(
    private readonly repository: VideoGenerationRepository,
    private readonly credentials: VideoCredentialsService,
    private readonly usage: AiUsageService,
    private readonly higgsfield: HiggsfieldProviderV1,
    private readonly heygen: HeygenProviderV1,
    private readonly media: VideoMediaV1,
    @Inject(VIDEO_EXECUTION_V1) private readonly execution: VideoExecutionPortV1,
  ) {}

  private provider(id: string): VideoProviderV1 {
    if (id === 'higgsfield') return this.higgsfield;
    if (id === 'heygen') return this.heygen;
    return videoErrorV1('VIDEO_PROVIDER_INVALID');
  }
  private async dispatch(job: {organizationId: string; id: string; runCycle: number}) {
    // A durable row precedes dispatch. Bootstrap recovery retries a failed start.
    try { await this.execution.start(job.organizationId, job.id, job.runCycle); } catch { /* persisted pending work is recovered by VideoExecutionRecoveryV1 */ }
  }
  async catalog(organizationId: string) {
    const settings = await this.credentials.getSettings(organizationId);
    let assets: Awaited<ReturnType<HeygenProviderV1['listAssets']>> | undefined;
    let assetsError: string | undefined;
    if (settings.effective.heygen?.available) {
      try { assets = await this.heygen.listAssets(await this.credentials.resolve(organizationId, 'heygen')); }
      catch (error) { assetsError = codeOf(error); }
    }
    return {routes: [...this.higgsfield.routes, ...this.heygen.routes], settings, ...(assets ? {assets} : {}), ...(assetsError ? {assetsError} : {})};
  }
  async prepare(organizationId: string, userId: string, value: unknown) {
    const input = parseVideoV1(VideoPrepareSchemaV1, value);
    input.settings = videoSettingsV1(input.settings);
    const piece = await this.repository.piece(organizationId, input.pieceId);
    if (!piece) return videoErrorV1('VIDEO_PIECE_NOT_FOUND', 404);
    let brief = compileVideoBriefV1(piece, input);
    if (input.fromDraftId) {
      const source = await this.repository.draft(organizationId, input.fromDraftId);
      if (!source || source.pieceId !== input.pieceId) return videoErrorV1('VIDEO_DRAFT_NOT_FOUND', 404);
      if (source.version !== input.fromDraftVersion) return videoErrorV1('VIDEO_DRAFT_CHANGED', 409);
      if (source.pieceRevision !== videoSourceRevisionV1(piece)) return videoErrorV1('VIDEO_SOURCE_CHANGED', 409);
      brief = {...source.brief as unknown as VideoBriefV1, outputLocale: input.settings.locale};
    }
    await this.references(organizationId, brief.referenceMediaIds);
    if (input.prepareWithAi) {
      brief = await runAsActingUser(userId, () => withoutActiveAiConfig(() => this.usage.executeAiOperation(organizationId, 'text_generation', async () => {
        const schema = z.object({prompt: z.string().min(1).max(12000), script: z.string().min(1).max(12000)});
        const result = await (await getOpenAiClient(organizationId)).chat.completions.parse({
          model: await getModelForRole(organizationId, 'draft'),
          messages: [{role: 'system', content: VIDEO_PREPARATION_POLICY_V1}, {role: 'user', content: JSON.stringify({brief, settings: input.settings})}],
          response_format: zodResponseFormat(schema, 'videoDraftV1'),
        });
        const output = result.choices[0]?.message.parsed;
        if (!output) return videoErrorV1('VIDEO_PREPARATION_EMPTY');
        const prepared = {...brief, ...output};
        validateVideoGroundingV1(prepared, input.settings as VideoSettingsV1);
        return prepared;
      }, 'draft')));
    }
    brief = {...brief, preparedWithAi: input.prepareWithAi};
    const draft = await this.repository.createDraft({organizationId, userId, pieceId: piece.id, pieceRevision: videoSourceRevisionV1(piece), brief, settings: input.settings});
    return {...this.draftView(draft), preparedWithAi: input.prepareWithAi};
  }
  private draftView(draft: any) {
    return {id: draft.id, pieceId: draft.pieceId, pieceRevision: draft.pieceRevision, version: draft.version, brief: draft.brief, settings: draft.settings, preparedWithAi: draft.brief?.preparedWithAi === true, preflightId: draft.preflight?.preflightId ?? null, createdAt: draft.createdAt, updatedAt: draft.updatedAt};
  }
  async readDraft(organizationId: string, id: string) {
    const draft = await this.repository.draft(organizationId, id);
    if (!draft) return videoErrorV1('VIDEO_DRAFT_NOT_FOUND', 404);
    return this.draftView(draft);
  }
  async listDrafts(organizationId: string, pieceId?: string) { return (await this.repository.drafts(organizationId, pieceId)).map(d => this.draftView(d)); }
  async updateDraft(organizationId: string, _userId: string, id: string, value: any) {
    const draft = await this.repository.draft(organizationId, id);
    if (!draft) return videoErrorV1('VIDEO_DRAFT_NOT_FOUND', 404);
    if (!Number.isInteger(value?.version) || value.version !== draft.version) return videoErrorV1('VIDEO_DRAFT_CHANGED', 409);
    const allowed = ['version', 'brief', 'settings', 'prompt', 'script', 'referenceMediaIds', 'scriptPolicy'];
    if (!value || Object.keys(value).some(k => !allowed.includes(k))) return videoErrorV1('VIDEO_INVALID_INPUT');
    const settings = videoSettingsV1(value.settings ?? draft.settings);
    const original = draft.brief as unknown as VideoBriefV1;
    const brief = editVideoBriefV1(original, value.brief ?? {...original,
      ...(value.prompt !== undefined ? {prompt: value.prompt} : {}), ...(value.script !== undefined ? {script: value.script} : {}),
      ...(value.referenceMediaIds !== undefined ? {referenceMediaIds: value.referenceMediaIds} : {}), ...(value.scriptPolicy !== undefined ? {scriptPolicy: value.scriptPolicy} : {}),
    }, settings);
    await this.references(organizationId, brief.referenceMediaIds);
    return this.draftView(await this.repository.editDraft(organizationId, id, draft.version, brief, settings));
  }
  private async references(organizationId: string, ids: string[], dimensions = false) {
    if (ids.length > 1 || new Set(ids).size !== ids.length) return videoErrorV1('VIDEO_UNSUPPORTED_REFERENCES');
    const rows = ids.length ? await this.repository.references(organizationId, ids) : [];
    if (rows.length !== ids.length) return videoErrorV1('VIDEO_REFERENCE_NOT_FOUND', 404);
    return Promise.all(ids.map(async id => {
      const row = rows.find(r => r.id === id)!;
      if (!/\.(png|jpe?g|webp)(?:\?|$)/i.test(row.path)) return videoErrorV1('VIDEO_REFERENCE_NOT_IMAGE');
      // Existing owned Media URLs are permanent; never sign a changing URL per retry.
      return {id: row.id, url: row.path, ...(dimensions ? await this.media.referenceDimensions(row.path) : {})};
    }));
  }
  async preflight(organizationId: string, _userId: string, id: string) {
    const draft = await this.repository.draft(organizationId, id);
    if (!draft) return videoErrorV1('VIDEO_DRAFT_NOT_FOUND', 404);
    const piece = await this.repository.piece(organizationId, draft.pieceId);
    if (!piece || videoSourceRevisionV1(piece) !== draft.pieceRevision) return videoErrorV1('VIDEO_SOURCE_CHANGED', 409);
    const settings = videoSettingsV1(draft.settings);
    const brief = draft.brief as unknown as VideoBriefV1;
    validateVideoGroundingV1(brief, settings);
    const credential = await this.credentials.resolve(organizationId, settings.provider);
    const references = await this.references(organizationId, brief.referenceMediaIds, true);
    const request = await this.provider(settings.provider).prepare({settings, prompt: settings.mode === 'clip' ? brief.prompt : '', script: settings.mode === 'presenter' ? brief.script : '', scriptPolicy: brief.scriptPolicy, references}, credential);
    const value: Preflight = {id, version: draft.version, preflightId: randomUUID(), estimate: request.estimate, payer: credential.payer, route: request.endpoint, maxCostUsd: credential.maxCostUsd, request, credentialReference: credential.reference, digest: hash({brief, settings, pieceRevision: draft.pieceRevision})};
    await this.repository.preflight(organizationId, id, draft.version, value);
    return this.publicPreflight(value, brief, settings);
  }
  private publicPreflight(value: Preflight, brief: unknown, settings: unknown) {
    return {id: value.id, version: value.version, preflightId: value.preflightId, estimate: value.estimate, payer: value.payer, route: value.route, maxCostUsd: value.maxCostUsd, brief, settings};
  }
  async getPreflight(organizationId: string, _userId: string, id: string, preflightId: string) {
    const draft = await this.repository.draft(organizationId, id);
    const value = draft?.preflight as unknown as Preflight;
    if (!draft || !value || value.preflightId !== preflightId || value.version !== draft.version) return videoErrorV1('VIDEO_PREFLIGHT_STALE', 409);
    return this.publicPreflight(value, draft.brief, draft.settings);
  }
  async launch(organizationId: string, userId: string, value: unknown) {
    const input = parseVideoV1(LaunchSchema, value);
    const existing = await this.repository.byIntent(organizationId, input.intentId);
    if (existing) {
      const snapshot = existing.snapshot as any;
      if (existing.draftId !== input.draftId || existing.draftVersion !== input.version || snapshot.preflightId !== input.preflightId) return videoErrorV1('VIDEO_INTENT_MISMATCH', 409);
      await this.dispatch(existing);
      return this.jobView(existing);
    }
    const draft = await this.repository.draft(organizationId, input.draftId);
    if (!draft || draft.version !== input.version) return videoErrorV1('VIDEO_DRAFT_CHANGED', 409);
    const preflight = draft.preflight as unknown as Preflight;
    if (!preflight || preflight.preflightId !== input.preflightId || preflight.version !== draft.version || preflight.digest !== hash({brief: draft.brief, settings: draft.settings, pieceRevision: draft.pieceRevision}) || !Number.isFinite(Date.parse(preflight.estimate.expiresAt)) || Date.parse(preflight.estimate.expiresAt) < Date.now()) return videoErrorV1('VIDEO_PREFLIGHT_STALE', 409);
    const piece = await this.repository.piece(organizationId, draft.pieceId);
    if (!piece || videoSourceRevisionV1(piece) !== draft.pieceRevision) return videoErrorV1('VIDEO_SOURCE_CHANGED', 409);
    const settings = videoSettingsV1(draft.settings);
    const credential = await this.credentials.resolve(organizationId, settings.provider, preflight.payer);
    if (credential.reference !== preflight.credentialReference) return videoErrorV1('VIDEO_CREDENTIAL_CHANGED', 409);
    const usd = preflight.estimate.usd;
    if (usd === null || !Number.isFinite(usd) || usd < 0) return videoErrorV1('VIDEO_PRICE_UNAVAILABLE', 409);
    if (usd > credential.maxCostUsd || (preflight.estimate.upperBoundUsd ?? 0) > credential.maxCostUsd) return videoErrorV1('VIDEO_JOB_BUDGET_EXCEEDED', 409);
    await this.references(organizationId, (draft.brief as any).referenceMediaIds);
    const job = await this.repository.launch({
      id: randomUUID(), organizationId, userId, pieceId: draft.pieceId, pieceRevision: draft.pieceRevision,
      draftId: draft.id, draftVersion: draft.version, preflightId: input.preflightId, intentId: input.intentId,
      snapshot: asJson({brief: draft.brief, settings, preflightId: input.preflightId}), request: asJson(preflight.request),
      provider: settings.provider, model: settings.model, payer: credential.payer, credentialReference: credential.reference,
      idempotencyKey: randomUUID(), estimate: asJson(preflight.estimate), reservedUsd: credential.maxCostUsd,
    }, credential.monthlyBudgetUsd);
    await this.dispatch(job);
    return this.jobView(job);
  }
  private async jobView(job: VideoGenerationJob) {
    return {id: job.id, draftId: job.draftId, pieceId: job.pieceId, state: job.state, snapshot: job.snapshot, estimate: job.estimate,
      costUsd: job.costUsd === null ? null : Number(job.costUsd), reservedUsd: Number(job.reservedUsd), errorCode: job.errorCode,
      canCancel: job.provider === 'higgsfield' && job.state === 'queued', runCycle: job.runCycle,
      result: job.resultMediaId ? await this.repository.media(job.organizationId, job.resultMediaId) : null,
      providerResult: job.providerResult ? Object.fromEntries(Object.entries(job.providerResult as any).filter(([key]) => ['duration', 'resolution', 'audio', 'state'].includes(key))) : null,
      createdAt: job.createdAt, updatedAt: job.updatedAt};
  }
  async get(organizationId: string, id: string) {
    const job = await this.repository.job(organizationId, id);
    if (!job) return videoErrorV1('VIDEO_JOB_NOT_FOUND', 404);
    return this.jobView(job);
  }
  async download(organizationId: string, id: string) {
    const job = await this.repository.job(organizationId, id);
    if (!job?.resultMediaId || job.state !== 'completed') return videoErrorV1('VIDEO_OWNED_FILE_UNAVAILABLE', 404);
    const media = await this.repository.media(organizationId, job.resultMediaId);
    if (!media) return videoErrorV1('VIDEO_OWNED_FILE_UNAVAILABLE', 404);
    return {name: `video-${job.id}.mp4`, bytes: await this.media.readOwned(media.path)};
  }
  async list(organizationId: string, pieceId?: string) { return Promise.all((await this.repository.jobs(organizationId, pieceId)).map(j => this.jobView(j))); }
  recoverPending() { return this.repository.pending(); }
  async retrySave(organizationId: string, _userId: string, id: string) {
    const job = await this.repository.retrySave(organizationId, id);
    if (!job) return videoErrorV1('VIDEO_JOB_NOT_FOUND', 404);
    await this.dispatch(job);
    return this.jobView(job);
  }

  async cancel(organizationId: string, _userId: string, id: string) {
    const job = await this.repository.job(organizationId, id);
    if (!job) return videoErrorV1('VIDEO_JOB_NOT_FOUND', 404);
    const provider = this.provider(job.provider);
    if (!provider.cancel || job.state !== 'queued' || !job.receipt) return videoErrorV1('VIDEO_CANCEL_UNAVAILABLE', 409);
    const owner = randomUUID();
    if (!(await this.repository.claim(organizationId, id, owner))) return videoErrorV1('VIDEO_JOB_BUSY', 409);
    try {
      const credential = await this.credentials.resolvePinned(organizationId, job.provider as VideoProviderIdV1, job.payer, job.credentialReference);
      const state = await provider.cancel(job.receipt as unknown as VideoProviderReceiptV1, credential);
      // A request/409 is not proof of cancellation. Only a confirmed status changes it.
      await this.status(job, owner, state);
    } finally { await this.repository.release(organizationId, id, owner); }
    return this.get(organizationId, id);
  }

  async expire(organizationId: string, id: string) {
    const job = await this.repository.job(organizationId, id);
    if (!job || !VIDEO_PENDING_V1.includes(job.state)) return {state: job?.state ?? 'failed', done: true};
    const owner = randomUUID();
    if (!(await this.repository.claim(organizationId, id, owner))) return {state: job.state, done: false};
    try {
      await this.repository.write(organizationId, id, owner, {state: job.state === 'saving' ? 'save_failed' : 'uncertain', errorCode: 'VIDEO_STATUS_DEADLINE'});
      await this.repository.finishUsage(organizationId, job.usageRecordId, false);
    } finally { await this.repository.release(organizationId, id, owner); }
    return {state: job.state === 'saving' ? 'save_failed' : 'uncertain', done: true};
  }

  async runStep(organizationId: string, id: string): Promise<{state: string; done: boolean}> {
    let job = await this.repository.job(organizationId, id);
    if (!job || !VIDEO_PENDING_V1.includes(job.state)) return {state: job?.state ?? 'failed', done: true};
    if (Date.now() - job.createdAt.getTime() > 24 * 60 * 60_000 && job.state !== 'saving') return this.expire(organizationId, id);
    const owner = randomUUID();
    if (!(await this.repository.claim(organizationId, id, owner))) return {state: job.state, done: false};
    try {
      job = (await this.repository.job(organizationId, id))!;
      if (job.state === 'submitting') {
        await this.repository.write(organizationId, id, owner, {state: 'uncertain', errorCode: 'VIDEO_SUBMIT_INTERRUPTED'});
        await this.repository.finishUsage(organizationId, job.usageRecordId, false);
      } else if (job.state === 'saving') {
        await this.save(job, owner);
      } else {
        const credential = await this.credentials.resolvePinned(organizationId, job.provider as VideoProviderIdV1, job.payer, job.credentialReference);
        if (job.state === 'accepted') await this.submit(job, owner, credential);
        else {
          if (job.pollAttempts >= 8640) {
            await this.repository.write(organizationId, id, owner, {state: 'uncertain', errorCode: 'VIDEO_STATUS_DEADLINE'});
            return {state: 'uncertain', done: true};
          }
          await this.repository.write(organizationId, id, owner, {pollAttempts: {increment: 1}});
          const status = await this.provider(job.provider).poll(job.receipt as unknown as VideoProviderReceiptV1, credential);
          await this.status(job, owner, status);
        }
      }
    } catch (error) {
      // Never expose raw provider errors, credentials or request bodies.
      const current = await this.repository.job(organizationId, id);
      if (current?.state === 'submitting') {
        await this.repository.write(organizationId, id, owner, {state: 'uncertain', errorCode: 'VIDEO_SUBMIT_OUTCOME_UNKNOWN'});
      } else if (current?.state === 'accepted') {
        await this.repository.write(organizationId, id, owner, {state: 'failed', costUsd: 0, errorCode: codeOf(error), finishedAt: new Date()});
      } else {
        // Status reads are bounded by the persisted job age; no generation retry.
        await this.repository.write(organizationId, id, owner, {errorCode: codeOf(error)});
      }
    } finally { await this.repository.release(organizationId, id, owner); }
    const current = (await this.repository.job(organizationId, id))!;
    return {state: current.state, done: !VIDEO_PENDING_V1.includes(current.state)};
  }
  private async submit(job: VideoGenerationJob, owner: string, credential: VideoCredentialV1) {
    const config = await this.credentials.admissionConfig(job.organizationId, credential, job.model);
    const admission = await runAsActingUser(job.userId, () => this.usage.beginAiOperationWithConfig(job.organizationId, 'video_generation', config, 'draft'));
    try {
      await this.repository.write(job.organizationId, job.id, owner, {state: 'submitting', submitAttempts: 1, submittedAt: new Date(), usageRecordId: admission.id});
    } catch (error) { await admission.voidUnstarted(); throw error; }
    const request = job.request as unknown as VideoPreparedRequestV1;
    let receipt: VideoProviderReceiptV1;
    try {
      try { receipt = await this.provider(job.provider).submit(request, job.idempotencyKey, credential); }
      catch (error) {
        if (!(error instanceof VideoProviderErrorV1) || !error.uncertain || job.provider !== 'higgsfield' || !error.retryable) throw error;
        await this.repository.write(job.organizationId, job.id, owner, {submitAttempts: 2});
        // One immediate replay, same endpoint/body/key. No replay after a crash or delay.
        receipt = await this.provider(job.provider).submit(request, job.idempotencyKey, credential);
      }
      await this.repository.write(job.organizationId, job.id, owner, {receipt: asJson(receipt), state: 'queued', errorCode: null});
      await admission.finish(true);
    } catch (error) {
      const uncertain = !(error instanceof VideoProviderErrorV1) || error.uncertain;
      await this.repository.write(job.organizationId, job.id, owner, {state: uncertain ? 'uncertain' : 'failed', errorCode: codeOf(error), ...(uncertain ? {} : {finishedAt: new Date()})});
      await admission.finish(false);
    }
  }
  private async status(job: VideoGenerationJob, owner: string, status: VideoProviderStatusV1) {
    const cost = status.costUsd;
    const data: Prisma.VideoGenerationJobUpdateManyMutationInput = {errorCode: status.errorCode ?? null, ...(cost !== undefined && Number.isFinite(cost) && cost >= 0 ? {costUsd: cost} : {})};
    if (status.state === 'succeeded') {
      if (!status.url) return videoErrorV1('VIDEO_PROVIDER_RESULT_MISSING');
      Object.assign(data, {state: 'saving', providerResult: asJson(status)});
    } else if (status.state === 'failed' || status.state === 'canceled') Object.assign(data, {state: status.state, finishedAt: new Date()});
    else data.state = status.state;
    await this.repository.write(job.organizationId, job.id, owner, data);
    if (['succeeded', 'failed', 'canceled'].includes(status.state)) await this.repository.finishUsage(job.organizationId, job.usageRecordId, status.state === 'succeeded', cost);
  }
  private async save(job: VideoGenerationJob, owner: string) {
    try {
      await this.repository.write(job.organizationId, job.id, owner, {saveAttempts: {increment: 1}});
      let file = job.storedFile as unknown as {name: string; path: string; size: number} | null;
      if (!file) {
        const result = job.providerResult as unknown as VideoProviderStatusV1;
        let url = result?.url;
        // Expired CDN URL: refresh the existing provider ID, never submit a video.
        if ((job.saveAttempts > 0 || job.runCycle > 0) && job.receipt) {
          const credential = await this.credentials.resolvePinned(job.organizationId, job.provider as VideoProviderIdV1, job.payer, job.credentialReference);
          const status = await this.provider(job.provider).poll(job.receipt as unknown as VideoProviderReceiptV1, credential);
          if (status.state === 'succeeded' && status.url) {
            url = status.url;
            await this.repository.write(job.organizationId, job.id, owner, {providerResult: asJson(status), ...(status.costUsd !== undefined ? {costUsd: status.costUsd} : {})});
          }
        }
        if (!url) return videoErrorV1('VIDEO_PROVIDER_RESULT_MISSING');
        file = await this.media.importVideo(url);
        await this.repository.write(job.organizationId, job.id, owner, {storedFile: asJson(file)});
      }
      await this.repository.attachResult(job, owner, file);
    } catch (error) {
      await this.repository.write(job.organizationId, job.id, owner, {state: 'save_failed', errorCode: codeOf(error)});
    }
  }
}
