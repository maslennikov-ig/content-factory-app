import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { VideoSubscriptionRepository } from '../../database/prisma/video-subscription/video-subscription.repository';
import { VideoConnectionService, creditDecimal } from './video-connection.service';
import { VideoSubscriptionRuntime, SubscriptionProvider, subscriptionHash } from './video-provider-registry';
import { VideoMcpClient } from './video-mcp-client';
import { HiggsfieldSubscriptionProvider } from '../providers/higgsfield-subscription.provider';
import { HeygenSubscriptionProvider } from '../providers/heygen-subscription.provider';
import { VideoMediaV1 } from '../video-media.v1';
import { VideoSubscriptionRequest } from '../video-access.v2';
import { videoErrorV1 } from '../video-brief.v1';
import { VideoGenerationRepository } from '../../database/prisma/video-generation/video-generation.repository';

export const VIDEO_SUBSCRIPTION_EXECUTION = Symbol('VIDEO_SUBSCRIPTION_EXECUTION');
export const SUBSCRIPTION_PENDING = ['accepted', 'submitting', 'queued', 'running', 'saving'];
const json = (value: unknown) => value as Prisma.InputJsonValue;
const codeOf = (error: any) => /^VIDEO_[A-Z0-9_]{1,70}$/.test(error?.getResponse?.()?.code) ? error.getResponse().code : 'VIDEO_SUBSCRIPTION_UNAVAILABLE';
const statusDeadline = (job: {statusDeadlineAt: Date | null; createdAt: Date}) => job.statusDeadlineAt?.getTime() ?? job.createdAt.getTime() + 86400_000;

@Injectable()
export class VideoSubscriptionJobService {
  constructor(readonly repository: VideoSubscriptionRepository, readonly connections: VideoConnectionService,
    readonly runtime: VideoSubscriptionRuntime, readonly mcp: VideoMcpClient,
    readonly higgsfield: HiggsfieldSubscriptionProvider, readonly heygen: HeygenSubscriptionProvider,
    readonly media: VideoMediaV1, readonly apiRepository: VideoGenerationRepository,
    @Inject(VIDEO_SUBSCRIPTION_EXECUTION) readonly execution: {start(org: string, id: string, cycle?: number): Promise<void>}) {}
  provider(provider: string) { return provider === 'higgsfield' ? this.higgsfield : provider === 'heygen' ? this.heygen : videoErrorV1('VIDEO_PROVIDER_INVALID'); }
  async dispatch(job: any) { try { await this.execution.start(job.organizationId, job.id, job.runCycle); } catch { /* durable recovery owns dispatch gap */ } }
  async view(job: any, actor: string) {
    return {id: job.id, draftId: job.draftId, pieceId: job.pieceId, state: job.state,
      access: job.actorId === actor ? {kind: 'subscription', connectionId: job.connectionId} : {kind: 'subscription', label: 'personal'},
      snapshot: job.snapshot, estimate: job.quote, quote: job.quote, cost: {amount: job.actualCost?.toFixed() ?? null, unit: job.unit, certainty: job.costCertainty},
      reserved: job.reserved.toFixed(), errorCode: job.errorCode, canCancel: false,
      result: job.resultMediaId ? await this.apiRepository.media(job.organizationId, job.resultMediaId) : null, createdAt: job.createdAt};
  }
  async get(org: string, actor: string, id: string) {
    await this.repository.member(org, actor, false);
    const job = await this.repository.db.videoSubscriptionJob.findFirst({where: {organizationId: org, id}});
    if (!job) return videoErrorV1('VIDEO_JOB_NOT_FOUND', 404);
    return this.view(job, actor);
  }
  async claim(org: string, id: string, owner: string) {
    return (await this.repository.db.videoSubscriptionJob.updateMany({where: {id, organizationId: org, state: {in: SUBSCRIPTION_PENDING}, OR: [{leaseUntil: null}, {leaseUntil: {lt: this.runtime.now()}}]}, data: {leaseOwner: owner, leaseUntil: new Date(this.runtime.now().getTime() + 180_000)}})).count === 1;
  }
  async write(org: string, id: string, owner: string, data: Prisma.VideoSubscriptionJobUpdateManyMutationInput) {
    const changed = await this.repository.db.videoSubscriptionJob.updateMany({where: {id, organizationId: org, leaseOwner: owner, leaseUntil: {gt: this.runtime.now()}}, data});
    if (changed.count !== 1) return videoErrorV1('VIDEO_JOB_LEASE_LOST', 409);
  }
  async expire(org: string, id: string) {
    const job = await this.repository.db.videoSubscriptionJob.findFirst({where: {id, organizationId: org}});
    if (!job || !SUBSCRIPTION_PENDING.includes(job.state)) return {state: job?.state ?? 'failed', done: true};
    const owner = randomUUID(); if (!await this.claim(org, id, owner)) return {state: job.state, done: false};
    try {
      // An old workflow may finish after an explicit recovery started. Re-read
      // under the lease so its expiry cannot terminate the new polling window.
      const fresh = await this.repository.db.videoSubscriptionJob.findFirstOrThrow({where: {id, organizationId: org}});
      if (this.runtime.now().getTime() < statusDeadline(fresh)) return {state: fresh.state, done: false};
      const state = fresh.state === 'saving' ? 'save_failed' : fresh.state === 'submitting' ? 'submission_unknown' : 'status_delayed';
      await this.write(org, id, owner, {state, errorCode: 'VIDEO_STATUS_DEADLINE'});
      return {state, done: true};
    }
    finally { await this.repository.db.videoSubscriptionJob.updateMany({where: {id, organizationId: org, leaseOwner: owner}, data: {leaseOwner: null, leaseUntil: null}}); }
  }
  async runStep(org: string, id: string): Promise<{state: string; done: boolean}> {
    let job = await this.repository.db.videoSubscriptionJob.findFirst({where: {id, organizationId: org}});
    if (!job || !SUBSCRIPTION_PENDING.includes(job.state)) return {state: job?.state ?? 'failed', done: true};
    if (this.runtime.now().getTime() >= statusDeadline(job) && job.state !== 'saving') return this.expire(org, id);
    const owner = randomUUID(); if (!await this.claim(org, id, owner)) return {state: job.state, done: false};
    try {
      job = (await this.repository.db.videoSubscriptionJob.findFirst({where: {id, organizationId: org}}))!;
      if (job.state === 'submitting') await this.write(org, id, owner, {state: 'submission_unknown', errorCode: 'VIDEO_SUBMIT_INTERRUPTED'});
      else if (job.state === 'saving') await this.save(job, owner);
      else {
        const credential = await this.connections.token(org, job.actorId, job.connectionId, job.generation);
        const def = this.runtime.definition(job.provider as SubscriptionProvider); const adapter = this.provider(job.provider);
        if (job.state === 'accepted') {
          await this.connections.enabled(org, job.provider as SubscriptionProvider);
          const request = job.request as unknown as VideoSubscriptionRequest;
          const capability = await this.mcp.capabilities(def, credential.token, credential.assertUsable);
          if (capability.digest !== request.schemaDigest) return videoErrorV1('VIDEO_SCHEMA_CHANGED', 409);
          if (Date.parse(request.quote.expiresAt) <= this.runtime.now().getTime()) return videoErrorV1('VIDEO_PREFLIGHT_STALE', 409);
          // Persist before the ONLY mutation. A crash from this point is unknown, never replayed.
          await this.repository.transaction(async tx => {
            const connection = await this.repository.connection(org, job!.actorId, job!.connectionId, tx);
            if (connection.generation !== job!.generation) return videoErrorV1('VIDEO_CONNECTION_CHANGED', 409);
            const changed = await tx.videoSubscriptionJob.updateMany({where: {id, organizationId: org, state: 'accepted', leaseOwner: owner, leaseUntil: {gt: this.runtime.now()}}, data: {state: 'submitting', submitAttempts: 1, submittedAt: this.runtime.now()}});
            if (changed.count !== 1) return videoErrorV1('VIDEO_JOB_LEASE_LOST', 409);
          });
          const receipt = await adapter.submit(def, credential.token, request, credential.assertUsable);
          await this.write(org, id, owner, {receipt: json(receipt), state: 'queued', errorCode: null});
        } else {
          if (job.pollAttempts >= 8640) await this.write(org, id, owner, {state: 'status_delayed', errorCode: 'VIDEO_STATUS_DEADLINE'});
          else {
            await this.write(org, id, owner, {pollAttempts: {increment: 1}});
            const status = await adapter.poll(def, credential.token, job.receipt, credential.assertUsable);
            if (status.jobId !== (job.receipt as any)?.id) return videoErrorV1('VIDEO_PROVIDER_RECEIPT_INVALID');
            await this.write(org, id, owner, {state: status.state === 'completed' ? 'saving' : status.state, providerResult: json(status), errorCode: null,
              ...(status.actualCost !== null ? {actualCost: status.actualCost, costCertainty: 'provider_confirmed'} : {}),
              ...(['failed', 'canceled'].includes(status.state) ? {finishedAt: this.runtime.now()} : {})});
          }
        }
      }
    } catch (error) {
      const fresh = await this.repository.db.videoSubscriptionJob.findFirst({where: {id, organizationId: org}});
      const code = codeOf(error);
      const state = fresh?.state === 'submitting' ? 'submission_unknown'
        : ['VIDEO_REAUTH_REQUIRED', 'VIDEO_CONNECTION_CHANGED', 'VIDEO_ACCESS_DENIED'].includes(code) ? 'reauth_required'
        : fresh?.state === 'accepted' ? 'access_unavailable' : fresh?.state;
      await this.write(org, id, owner, {state, errorCode: code}).catch(() => {});
    } finally { await this.repository.db.videoSubscriptionJob.updateMany({where: {id, organizationId: org, leaseOwner: owner}, data: {leaseOwner: null, leaseUntil: null}}); }
    const fresh = await this.repository.db.videoSubscriptionJob.findFirstOrThrow({where: {id, organizationId: org}});
    return {state: fresh.state, done: !SUBSCRIPTION_PENDING.includes(fresh.state)};
  }
  private async save(job: any, owner: string) {
    try {
      await this.write(job.organizationId, job.id, owner, {saveAttempts: {increment: 1}});
      let file = job.storedFile as {name: string; path: string; size: number} | null;
      if (!file) {
        let url = job.providerResult?.url;
        try { if (!url) throw new Error(); file = await this.media.importVideo(url); }
        catch {
          // Refresh a result URL only after the captured URL fails; revoked tokens never block a still-accessible captured file.
          const credential = await this.connections.token(job.organizationId, job.actorId, job.connectionId, job.generation);
          const status = await this.provider(job.provider).poll(this.runtime.definition(job.provider), credential.token, job.receipt, credential.assertUsable);
          if (status.state !== 'completed' || status.jobId !== job.receipt.id || !status.url) return videoErrorV1('VIDEO_PROVIDER_RESULT_MISSING');
          await this.write(job.organizationId, job.id, owner, {providerResult: json(status), ...(status.actualCost !== null ? {actualCost: status.actualCost, costCertainty: 'provider_confirmed'} : {})});
          file = await this.media.importVideo(status.url);
        }
        await this.write(job.organizationId, job.id, owner, {storedFile: json(file)});
      }
      const stored = file!;
      await this.repository.transaction(async tx => {
        const fresh = await tx.videoSubscriptionJob.findFirst({where: {id: job.id, organizationId: job.organizationId, state: 'saving', resultMediaId: null, leaseOwner: owner, leaseUntil: {gt: this.runtime.now()}}});
        if (!fresh) return videoErrorV1('VIDEO_JOB_LEASE_LOST', 409);
        const media = await tx.media.create({data: {organizationId: job.organizationId, name: stored.name, path: stored.path, fileSize: stored.size, type: 'video', originalName: `video-${job.id}.mp4`}});
        const changed = await tx.videoSubscriptionJob.updateMany({where: {id: job.id, organizationId: job.organizationId, state: 'saving', resultMediaId: null, leaseOwner: owner, leaseUntil: {gt: this.runtime.now()}}, data: {state: 'completed', resultMediaId: media.id, errorCode: null, finishedAt: this.runtime.now()}});
        if (changed.count !== 1) return videoErrorV1('VIDEO_JOB_LEASE_LOST', 409);
      });
    } catch (error) { await this.write(job.organizationId, job.id, owner, {state: 'save_failed', errorCode: codeOf(error)}); }
  }
  async action(org: string, actor: string, id: string, action: string) {
    await this.repository.member(org, actor);
    const job = await this.repository.db.videoSubscriptionJob.findFirst({where: {id, organizationId: org}});
    if (!job || job.actorId !== actor) return videoErrorV1('VIDEO_ACCESS_DENIED', 403);
    if (action === 'cancel') return videoErrorV1('VIDEO_CANCEL_UNAVAILABLE', 409);
    let state: string; let generation = job.generation;
    if (action === 'retry-save' && job.state === 'save_failed') {
      state = 'saving';
      try {
        const connection = await this.repository.connection(org, actor, job.connectionId);
        if (connection.walletDigest !== job.walletDigest) return videoErrorV1('VIDEO_CONNECTION_CHANGED', 409);
        generation = connection.generation;
      } catch (error) {
        // A still-accessible captured file needs no credential. If refresh is
        // needed later, save() will require this exact wallet/generation.
        if (codeOf(error) !== 'VIDEO_REAUTH_REQUIRED') throw error;
      }
    }
    else if (action === 'resume' && ['reauth_required', 'status_delayed'].includes(job.state) && job.receipt) {
      const connection = await this.repository.connection(org, actor, job.connectionId);
      if (connection.walletDigest !== job.walletDigest) return videoErrorV1('VIDEO_CONNECTION_CHANGED', 409);
      state = 'queued'; generation = connection.generation;
    } else return videoErrorV1('VIDEO_SAVE_RETRY_UNAVAILABLE', 409);
    const changed = await this.repository.db.videoSubscriptionJob.updateMany({where: {id, organizationId: org, state: job.state, OR: [{leaseUntil: null}, {leaseUntil: {lt: this.runtime.now()}}]}, data: {state, errorCode: null, runCycle: {increment: 1}, generation,
      statusDeadlineAt: new Date(this.runtime.now().getTime() + 86400_000), ...(state === 'queued' ? {pollAttempts: 0} : {})}});
    if (!changed.count) return videoErrorV1('VIDEO_JOB_BUSY', 409);
    const fresh = await this.repository.db.videoSubscriptionJob.findFirstOrThrow({where: {id, organizationId: org}}); await this.dispatch(fresh); return this.view(fresh, actor);
  }
  async reconcile(org: string, actor: string, id: string, amount: string, evidence: string) {
    await this.repository.member(org, actor);
    const value = creditDecimal(amount);
    if (typeof evidence !== 'string' || evidence.trim().length < 5 || evidence.length > 1000) return videoErrorV1('VIDEO_RECONCILIATION_REQUIRED');
    const changed = await this.repository.db.videoSubscriptionJob.updateMany({where: {id, organizationId: org, actorId: actor, actualCost: null, state: {notIn: SUBSCRIPTION_PENDING}}, data: {actualCost: value, costCertainty: 'owner_reconciled', reconciledBy: actor, reconciliationEvidence: evidence}});
    if (!changed.count) return videoErrorV1('VIDEO_RECONCILIATION_UNAVAILABLE', 409);
    return this.get(org, actor, id);
  }
}
