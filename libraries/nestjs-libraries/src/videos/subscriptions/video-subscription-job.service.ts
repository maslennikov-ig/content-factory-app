import { assertHeygenScopedJobV2 } from './video-heygen-autopilot-scope.v2';
import { assertHeygenAppearanceLineageV2 } from './video-heygen-style-admission.v2';
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma, VideoSubscriptionJob } from '@prisma/client';
import { VideoSubscriptionRepository } from '../../database/prisma/video-subscription/video-subscription.repository';
import { VideoConnectionService, creditDecimal } from './video-connection.service';
import { VideoSubscriptionRuntime, SubscriptionProvider, subscriptionHash } from './video-provider-registry';
import { VideoMcpClient } from './video-mcp-client';
import { HiggsfieldSubscriptionProvider } from '../providers/higgsfield-subscription.provider';
import { HeygenSubscriptionProvider } from '../providers/heygen-subscription.provider';
import { VideoMediaV1 } from '../video-media.v1';
import { VideoSubscriptionRequest } from '../video-access.v2';
import { videoErrorV1, videoSourceRevisionV1 } from '../video-brief.v1';
import { videoProductionDigestV1 } from '../production/video-production.v1';
import { VideoGenerationRepository } from '../../database/prisma/video-generation/video-generation.repository';
import { assertResolvedSourceArtifactCurrentV1 } from '../../content-intelligence/social-factory/source-artifact.repository';
import { HEYGEN_NATIVE_REQUEST_KIND_V2, isHeygenAvatarRequest, parseHeygenAvatarRequest, assertHeygenRecipeSnapshotV2 } from './video-heygen-avatar-request.v2';
import { HeygenPersonProfileServiceV1 } from './video-heygen-person-profile.service.v1';
import { readHeygenSettingsQualificationV2, assertHeygenApprovedVoiceBaselineV2 } from './video-heygen-settings-admission.v2';
import type { StoredSubtitleV1 } from '../production/video-production-result.v1';
import type { HeygenVideoStatusV1 } from './video-heygen-avatar-native.v1';

export const VIDEO_SUBSCRIPTION_EXECUTION = Symbol('VIDEO_SUBSCRIPTION_EXECUTION');
export const SUBSCRIPTION_PENDING = ['accepted', 'submitting', 'queued', 'running', 'saving'];
const json = (value: unknown) => value as Prisma.InputJsonValue;
const codeOf = (error: any) => /^(?:VIDEO|SOURCE_ARTIFACT)_[A-Z0-9_]{1,70}$/.test(error?.getResponse?.()?.code) ? error.getResponse().code : 'VIDEO_SUBSCRIPTION_UNAVAILABLE';
const statusDeadline = (job: {statusDeadlineAt: Date | null; createdAt: Date}) => job.statusDeadlineAt?.getTime() ?? job.createdAt.getTime() + 86400_000;
const assertLegacyJob = (job: any) => {if (job?.request?.kind === 'hgg-pilot-stage/v1') return videoErrorV1('VIDEO_PILOT_ROUTE_REQUIRED', 409);};
type NativeStoredVideo = Awaited<ReturnType<VideoMediaV1['importVideo']>> & {subtitle?: StoredSubtitleV1 & {mediaId?: string}};
const nativeVideoNameV2 = (job: any): string | null => job.request?.kind === HEYGEN_NATIVE_REQUEST_KIND_V2 && typeof job.request.args?.title === 'string' && job.request.args.title.trim()
  ? `${job.request.args.title.trim().replace(/[\/\\]/g, '-')}.mp4` : null;

@Injectable()
export class VideoSubscriptionJobService {
  constructor(readonly repository: VideoSubscriptionRepository, readonly connections: VideoConnectionService,
    readonly runtime: VideoSubscriptionRuntime, readonly mcp: VideoMcpClient,
    readonly higgsfield: HiggsfieldSubscriptionProvider, readonly heygen: HeygenSubscriptionProvider,
    readonly media: VideoMediaV1, readonly apiRepository: VideoGenerationRepository,
    @Inject(VIDEO_SUBSCRIPTION_EXECUTION) readonly execution: {start(org: string, id: string, cycle?: number): Promise<void>},
    readonly heygenProfiles: HeygenPersonProfileServiceV1) {}
  provider(provider: string) { return provider === 'higgsfield' ? this.higgsfield : provider === 'heygen' ? this.heygen : videoErrorV1('VIDEO_PROVIDER_INVALID'); }
  private assertQuoteCurrent(request: VideoSubscriptionRequest) {
    const expiresAt = Date.parse(request.quote?.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= this.runtime.now().getTime()) return videoErrorV1('VIDEO_PREFLIGHT_STALE', 409);
  }
  async dispatch(job: any) { assertLegacyJob(job); try { await this.execution.start(job.organizationId, job.id, job.runCycle); } catch { /* durable recovery owns dispatch gap */ } }
  async view(job: any, actor: string) {
    assertLegacyJob(job);
    if (job.request?.kind === HEYGEN_NATIVE_REQUEST_KIND_V2 && job.actorId !== actor) return videoErrorV1('VIDEO_JOB_NOT_FOUND', 404);
    const subtitle = job.request?.kind === HEYGEN_NATIVE_REQUEST_KIND_V2 ? job.storedFile?.subtitle : null;
    const ownedSubtitle = subtitle?.mediaId ? await this.apiRepository.media(job.organizationId, subtitle.mediaId) : null;
    const subtitles = ownedSubtitle?.type === 'subtitle' && ownedSubtitle.path === subtitle.path && ownedSubtitle.name === subtitle.name &&
      ['application/x-subrip', 'text/vtt'].includes(subtitle.mimeType)
      ? [{id: ownedSubtitle.id, mediaId: ownedSubtitle.id, name: ownedSubtitle.name, path: ownedSubtitle.path, mimeType: subtitle.mimeType}] : [];
    return {id: job.id, draftId: job.draftId, pieceId: job.pieceId, state: job.state,
      access: job.actorId === actor ? {kind: 'subscription', connectionId: job.connectionId} : {kind: 'subscription', label: 'personal'},
      snapshot: job.snapshot, estimate: job.quote, quote: job.quote, cost: {amount: job.actualCost?.toFixed() ?? null, unit: job.unit, certainty: job.costCertainty},
      reserved: job.reserved.toFixed(), errorCode: job.errorCode, canCancel: false,
      result: job.resultMediaId ? await this.apiRepository.media(job.organizationId, job.resultMediaId) : null, createdAt: job.createdAt,
      ...(job.request?.kind === HEYGEN_NATIVE_REQUEST_KIND_V2 ? {subtitles} : {}),
      ...(job.errorCode === 'VIDEO_OWNED_VOICE_UNUSABLE' ? {actionRequired: {kind: 'replace_owned_voice',
        message: 'HeyGen refused this owned voice as unusable. Its catalog entry may still say complete. Do not retry it, substitute another person or switch to API. Keep the script and avatar; the person needs a usable owned voice clone or an original recording to recreate it.',
        providerUrl: 'https://app.heygen.com/', providerCode: 'voice_not_usable', retryable: false}} : {})};
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
    assertLegacyJob(job);
    if (!job || !SUBSCRIPTION_PENDING.includes(job.state)) return {state: job?.state ?? 'failed', done: true};
    const owner = randomUUID(); if (!await this.claim(org, id, owner)) return {state: job.state, done: false};
    try {
      // An old workflow may finish after an explicit recovery started. Re-read
      // under the lease so its expiry cannot terminate the new polling window.
      const fresh = await this.repository.db.videoSubscriptionJob.findFirstOrThrow({where: {id, organizationId: org}});
      if (this.runtime.now().getTime() < statusDeadline(fresh)) return {state: fresh.state, done: false};
      const unsentNative = isHeygenAvatarRequest(fresh.request) && fresh.state === 'accepted' && fresh.submitAttempts === 0;
      const state = unsentNative ? 'access_unavailable' : fresh.state === 'saving' ? 'save_failed' : fresh.state === 'submitting' ? 'submission_unknown' : 'status_delayed';
      await this.write(org, id, owner, {state, errorCode: 'VIDEO_STATUS_DEADLINE'});
      return {state, done: true};
    }
    finally { await this.repository.db.videoSubscriptionJob.updateMany({where: {id, organizationId: org, leaseOwner: owner}, data: {leaseOwner: null, leaseUntil: null}}); }
  }
  /** A personal production uses its frozen aggregate, never a V1 prompt draft. */
  private async assertPersonalProductionSubmit(tx: Prisma.TransactionClient, org: string, job: VideoSubscriptionJob) {
    const snapshot = job.snapshot as any;
    if (snapshot?.kind !== 'production/personal-v2') return;
    const row = await tx.videoProductionRevision.findFirst({where: {organizationId: org, id: snapshot.productionRevisionId}});
    if (!row || row.stoppedAt || row.state === 'stopped') return videoErrorV1('VIDEO_PRODUCTION_STOPPED', 409);
    if (row.state === 'needs_attention') return videoErrorV1('VIDEO_PRODUCTION_PAUSED', 409);
    const manifest = row.manifest as any, approval = row.approval as any;
    const plans = Array.isArray(approval?.scenes) ? approval.scenes.filter((scene: any) => scene.jobId === job.id) : [];
    const final = approval?.final?.jobId === job.id;
    const preparation = plans[0]?.preparation ?? approval?.final?.preparation;
    if (row.state !== 'approved' || row.userId !== job.actorId || job.draftId !== row.id || job.draftVersion !== row.revision ||
      row.digest !== snapshot.manifestDigest || manifest?.version !== 2 || videoProductionDigestV1(manifest) !== row.digest ||
      manifest.funding?.kind !== 'personal_subscription' || videoProductionDigestV1(manifest.funding) !== snapshot.fundingDigest ||
      manifest.funding.connections?.[job.provider] !== job.connectionId || manifest.pieceId !== job.pieceId || manifest.pieceRevision !== job.pieceRevision ||
      approval?.version !== 2 || approval.kind !== 'personal_subscription' || approval.id !== snapshot.approvalId ||
      approval.actorId !== job.actorId || approval.manifestDigest !== row.digest || typeof approval.acceptedAt !== 'string' || !Number.isFinite(Date.parse(approval.acceptedAt)) ||
      !Array.isArray(approval.blockers) || approval.blockers.length || plans.length + Number(final) !== 1 || !approval.final?.preparation ||
      preparation?.connectionId !== job.connectionId || preparation.provider !== job.provider || preparation.walletDigest !== job.walletDigest || preparation.accountGeneration !== job.generation ||
      preparation.unit !== job.unit || preparation.request?.schemaDigest !== (job.request as any)?.schemaDigest ||
      (plans.length === 1 && (plans[0].reused || plans[0].kind !== 'generation' || plans[0].sceneId !== snapshot.details?.sceneId || plans[0].key !== snapshot.details?.sceneKey ||
        videoProductionDigestV1(preparation.request) !== videoProductionDigestV1(job.request) || !Array.isArray(manifest.scenes) ||
        videoProductionDigestV1(manifest.scenes.find((scene: any) => scene.id === plans[0].sceneId) ?? null) !== videoProductionDigestV1(snapshot.details?.scene ?? null)))) return videoErrorV1('VIDEO_PRODUCTION_APPROVAL_STALE', 409);
    if (final) {
      // A freezes ready_assets on the same deferred reservation. Its request is
      // intentionally different from the original manifest-only quote request.
      const resolved = snapshot.details?.resolvedScenes;
      const quote = (job.request as any)?.quote;
      if (typeof approval.final.readyRequestDigest !== 'string' || !/^[a-f0-9]{64}$/.test(approval.final.readyRequestDigest) ||
        approval.final.readyRequestDigest !== videoProductionDigestV1(job.request) ||
        manifest.funding.finalProvider !== job.provider || approval.final.provider !== job.provider || approval.final.connectionId !== job.connectionId ||
        !Array.isArray(manifest.scenes) || !Array.isArray(resolved) || resolved.length !== manifest.scenes.length || !resolved.length ||
        !quote || quote.unit !== job.unit || videoProductionDigestV1(quote) !== videoProductionDigestV1(job.quote) ||
        job.reserved.lt(creditDecimal(quote.amount)) || (quote.upperBound !== null && job.reserved.lt(creditDecimal(quote.upperBound)))) return videoErrorV1('VIDEO_PRODUCTION_APPROVAL_STALE', 409);
      let duration = 0;
      for (const [index, input] of resolved.entries()) {
        const scene = manifest.scenes[index], plan = approval.scenes.find((one: any) => one.sceneId === scene.id);
        if (!plan || input.sceneId !== scene.id || !Number.isFinite(input.durationSeconds) || input.durationSeconds <= 0 ||
          input.audioMediaId !== (plan.audioMediaId ?? scene.audioMediaId)) return videoErrorV1('VIDEO_PRODUCTION_ASSET_CHANGED', 409);
        duration += input.durationSeconds;
        let mediaId: string | undefined;
        if (plan.kind === 'asset') mediaId = plan.mediaId;
        else {
          const generated = await tx.videoSubscriptionJob.findFirst({where: {id: plan.jobId, organizationId: org, actorId: job.actorId, state: 'completed', resultMediaId: {not: null}}});
          if (!generated || (generated.snapshot as any)?.kind !== 'production/personal-v2' ||
            (generated.snapshot as any)?.fundingDigest !== snapshot.fundingDigest || manifest.funding.connections?.[generated.provider] !== generated.connectionId) return videoErrorV1('VIDEO_PRODUCTION_ASSET_CHANGED', 409);
          mediaId = generated.resultMediaId!;
        }
        if (!mediaId || mediaId !== input.mediaId || (plan.kind === 'asset' && mediaId !== scene.mediaId) ||
          !await tx.media.findFirst({where: {id: mediaId, organizationId: org, deletedAt: null}, select: {id: true}}) ||
          (input.audioMediaId && !await tx.media.findFirst({where: {id: input.audioMediaId, organizationId: org, deletedAt: null}, select: {id: true}}))) return videoErrorV1('VIDEO_PRODUCTION_ASSET_CHANGED', 409);
      }
      if (duration > 600) return videoErrorV1('VIDEO_PRODUCTION_ACTUAL_DURATION_EXCEEDS_LIMIT', 409);
    }
    // This parent write serializes the paid-action claim with stop/pause/edit.
    const parent = await tx.videoProductionRevision.updateMany({where: {id: row.id, organizationId: org, userId: job.actorId, digest: row.digest, state: 'approved', stoppedAt: null}, data: {updatedAt: this.runtime.now()}});
    if (parent.count !== 1) return videoErrorV1('VIDEO_PRODUCTION_STOPPED', 409);
    const source = await tx.contentPiece.findFirst({where: {organizationId: org, id: job.pieceId, archivedAt: null}});
    if (!source || videoSourceRevisionV1(source) !== job.pieceRevision) return videoErrorV1('VIDEO_SOURCE_CHANGED', 409);
    // Preserve every source field/timestamp while fencing a concurrent edit after
    // the read. Serializable conflict retries then observe its new revision.
    const sourceFence = await tx.contentPiece.updateMany({where: {organizationId: org, id: source.id, archivedAt: null, updatedAt: source.updatedAt}, data: {updatedAt: source.updatedAt}});
    if (sourceFence.count !== 1) return videoErrorV1('VIDEO_SOURCE_CHANGED', 409);
  }
  async runStep(org: string, id: string): Promise<{state: string; done: boolean}> {
    let job = await this.repository.db.videoSubscriptionJob.findFirst({where: {id, organizationId: org}});
    if (isHeygenAvatarRequest(job?.request)) return this.runHeygenNativeStep(job!);
    assertLegacyJob(job);
    if (!job || !SUBSCRIPTION_PENDING.includes(job.state)) return {state: job?.state ?? 'failed', done: true};
    if (this.runtime.now().getTime() >= statusDeadline(job) && job.state !== 'saving') return this.expire(org, id);
    const owner = randomUUID(); if (!await this.claim(org, id, owner)) return {state: job.state, done: false};
    try {
      job = (await this.repository.db.videoSubscriptionJob.findFirst({where: {id, organizationId: org}}))!;
      if (job.state === 'submitting') await this.write(org, id, owner, {state: 'submission_unknown', errorCode: 'VIDEO_SUBMIT_INTERRUPTED'});
      else if (job.state === 'saving') await this.save(job, owner);
      else {
        const credential = await this.connections.token(org, job.actorId, job.connectionId, job.generation, job.state === 'accepted' ? 'generation' : 'recovery');
        const def = this.runtime.definition(job.provider as SubscriptionProvider); const adapter = this.provider(job.provider);
        if (job.state === 'accepted') {
          await this.connections.enabled(org, job.provider as SubscriptionProvider);
          const request = job.request as unknown as VideoSubscriptionRequest;
          const capability = await this.mcp.capabilities(def, credential.token, credential.assertUsable);
          if (capability.digest !== request.schemaDigest) return videoErrorV1('VIDEO_SCHEMA_CHANGED', 409);
          this.assertQuoteCurrent(request);
          if (job.provider === 'heygen') await this.heygen.validateIdentity(def, credential.token, request.args, credential.assertUsable, credential.connection.walletDigest);
          await credential.assertUsable();
          this.assertQuoteCurrent(request);
          // Persist before the ONLY mutation. A crash from this point is unknown, never replayed.
          await this.repository.transaction(async tx => {
            const connection = await this.repository.connection(org, job!.actorId, job!.connectionId, tx);
            if (connection.generation !== job!.generation) return videoErrorV1('VIDEO_CONNECTION_CHANGED', 409);
            await this.assertPersonalProductionSubmit(tx, org, job!);
            this.assertQuoteCurrent(request);
            const artifact = (job!.snapshot as any)?.brief?.sourceArtifact;
            if (artifact) await assertResolvedSourceArtifactCurrentV1(tx, org, job!.actorId, artifact, job!.pieceId);
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
  /** Persist a bounded response even after lease expiry; an attempt-bound receipt is never a second submission. */
  private async persistHeygenResponse(job: any, attemptId: string, raw: Record<string, unknown>) {
    const rawDigest = subscriptionHash(raw);
    await this.repository.transaction(async tx => {
      const current = await tx.videoSubscriptionJob.findFirst({where: {id: job.id, organizationId: job.organizationId, actorId: job.actorId, submitAttempts: 1}});
      if (!current || (current.snapshot as any)?.submitAttempt?.id !== attemptId || (current.request as any)?.requestHash !== (job.request as any)?.requestHash)
        return videoErrorV1('VIDEO_PROVIDER_RECEIPT_INVALID', 409);
      if (current.receipt) {
        if ((current.receipt as any).rawDigest !== rawDigest || (current.receipt as any).submitAttemptId !== attemptId) return videoErrorV1('VIDEO_PROVIDER_RECEIPT_INVALID', 409);
        return;
      }
      const saved = await tx.videoSubscriptionJob.updateMany({where: {id: job.id, organizationId: job.organizationId, actorId: job.actorId,
        submitAttempts: 1, receipt: {equals: Prisma.DbNull}, snapshot: {path: ['submitAttempt', 'id'], equals: attemptId}},
        data: {receipt: json({raw, rawDigest, submitAttemptId: attemptId})}});
      if (saved.count !== 1) return videoErrorV1('VIDEO_PROVIDER_RECEIPT_INVALID', 409);
    });
  }
  private async heygenCredential(job: any) {
    const request = parseHeygenAvatarRequest(job.request);
    const credential = await this.connections.token(job.organizationId, job.actorId, job.connectionId, job.generation, 'discovery', {allowRefresh: false});
    const recovery = (job.snapshot as any)?.nativeRecovery;
    const recovered = job.submitAttempts === 1 && recovery?.subjectDigest === request.subjectDigest && recovery?.requestHash === request.requestHash &&
      recovery?.generation === job.generation && recovery?.tokenVersion === credential.connection.tokenVersion;
    if (job.provider !== 'heygen' || credential.connection.provider !== 'heygen' || job.walletDigest !== request.subjectDigest ||
      !recovered && (credential.connection.tokenVersion !== request.tokenVersion || job.generation !== request.accountGeneration))
      return videoErrorV1('VIDEO_CONNECTION_CHANGED', 409);
    const def = await this.connections.connectable(job.organizationId, 'heygen');
    return {request, credential, def};
  }
  private async runHeygenNativeStep(initial: VideoSubscriptionJob): Promise<{state: string; done: boolean}> {
    const org = initial.organizationId, id = initial.id;
    const recoverable = initial.state === 'submission_unknown' && !!(initial.receipt as any)?.raw;
    if (!SUBSCRIPTION_PENDING.includes(initial.state) && !recoverable) return {state: initial.state, done: true};
    if (this.runtime.now().getTime() >= statusDeadline(initial) && initial.state !== 'saving' && !recoverable) return this.expire(org, id);
    const owner = randomUUID();
    const claimed = await this.repository.db.videoSubscriptionJob.updateMany({where: {id, organizationId: org, state: initial.state,
      OR: [{leaseUntil: null}, {leaseUntil: {lt: this.runtime.now()}}]}, data: {leaseOwner: owner, leaseUntil: new Date(this.runtime.now().getTime() + 240_000)}});
    if (claimed.count !== 1) return {state: initial.state, done: false};
    try {
      const job = await this.repository.db.videoSubscriptionJob.findFirstOrThrow({where: {id, organizationId: org}});
      if (job.state === 'submitting' || job.state === 'submission_unknown') {
        const raw = (job.receipt as any)?.raw;
        const rejection = raw ? this.heygen.nativeRejection(raw) : null;
        if (rejection) await this.write(org, id, owner, {state: 'access_unavailable', errorCode: rejection.code, providerResult: json({rejection}), finishedAt: this.runtime.now()});
        else if (!raw) await this.write(org, id, owner, {state: 'submission_unknown', errorCode: 'VIDEO_SUBMIT_INTERRUPTED'});
        else {
          const receipt = this.heygen.nativeReceipt(raw);
          await this.write(org, id, owner, {receipt: json({...job.receipt as any, ...receipt}), state: 'queued', errorCode: null,
            ...(recoverable ? {runCycle: {increment: 1}, statusDeadlineAt: new Date(this.runtime.now().getTime() + 86400_000)} : {})});
        }
      } else if (job.state === 'saving') await this.save(job, owner);
      else {
        const {request, credential, def} = await this.heygenCredential(job);
        if (job.state === 'accepted') {
          const account = await this.heygen.nativeAccount(def, credential.token, credential.assertUsable);
          if (account.subjectDigest !== request.subjectDigest || account.billingType !== 'subscription') return videoErrorV1('VIDEO_CONNECTION_CHANGED', 409);
          if (creditDecimal(account.remaining).lte(0)) return videoErrorV1('VIDEO_CREDIT_BALANCE_EMPTY', 409);
          const settings = (job.snapshot as any).settings;
          const selection = await this.heygen.nativeSelection(def, credential.token, settings, credential.assertUsable);
          if (selection.groupId !== request.selection.groupId) return videoErrorV1('VIDEO_SUBSCRIPTION_OPTION_UNAVAILABLE', 409);
          if (request.kind === HEYGEN_NATIVE_REQUEST_KIND_V2) {
            const {binding, settings: inner} = request.recipe;
            assertHeygenRecipeSnapshotV2(request, settings, (job.snapshot as any).brief);
            const profile = await this.heygenProfiles.freeze(org, job.actorId, {connectionId: job.connectionId, profileId: binding.profileId,
              expectedRevision: binding.profileRevision, expectedDigest: binding.profileDigest, groupId: inner.sourceGroupId,
              lookId: inner.sourceLookId, appearanceLookId: binding.appearanceLineage ? undefined : inner.appearanceLookId,
              ...(inner.animationReferenceLookId ? {animationReferenceLookId: inner.animationReferenceLookId} : {})},
              {accountDigest: account.subjectDigest, accountGeneration: credential.connection.generation});
            assertHeygenApprovedVoiceBaselineV2(profile, inner);
            const qualification = await readHeygenSettingsQualificationV2(this.mcp, def, credential.token, binding, inner,
              credential.assertUsable, {organizationId: org, media: this.media,
                mediaRow: (organizationId, mediaId) => this.apiRepository.media(organizationId, mediaId)});
            const current = this.heygen.nativeRecipeV2(binding, inner, request.recipe.speech, qualification);
            if (current.recipeHash !== request.recipe.recipeHash) return videoErrorV1('VIDEO_PREFLIGHT_STALE', 409);
          }
          const attemptId = randomUUID();
          const submit = request.kind === HEYGEN_NATIVE_REQUEST_KIND_V2 ? this.heygen.submitNativeV2.bind(this.heygen) : this.heygen.submitNative.bind(this.heygen);
          const receipt = await submit(def, credential.token, request.args, credential.assertUsable, {
            beforeDispatch: async () => this.repository.transaction(async tx => {
              const connection = await this.repository.connection(org, job.actorId, job.connectionId, tx, false);
              if (connection.provider !== 'heygen' || !['connected', 'discovery_required'].includes(connection.state) ||
                connection.generation !== job.generation || connection.tokenVersion !== request.tokenVersion) return videoErrorV1('VIDEO_CONNECTION_CHANGED', 409);
              const approval = await tx.videoAccessPreflight.findFirst({where: {id: job.preflightId, organizationId: org, actorId: job.actorId}});
              const draft = await tx.videoPromptDraft.findFirst({where: {id: job.draftId, organizationId: org, userId: job.actorId, version: job.draftVersion}});
              const piece = await tx.contentPiece.findFirst({where: {id: job.pieceId, organizationId: org, archivedAt: null}});
              const brief = (draft?.brief as any), settings = draft?.settings as any;
              if (!approval || approval.expiresAt <= this.runtime.now() || subscriptionHash(approval.request) !== subscriptionHash(request) || !draft ||
                !piece || videoSourceRevisionV1(piece) !== job.pieceRevision || draft.pieceRevision !== job.pieceRevision ||
                request.kind !== HEYGEN_NATIVE_REQUEST_KIND_V2 && subscriptionHash(this.heygen.nativeArgs(settings, brief)) !== subscriptionHash(request.args))
                return videoErrorV1('VIDEO_PREFLIGHT_STALE', 409);
              if ((job.snapshot as any)?.autopilotScopeV2) await assertHeygenScopedJobV2(tx, org, job.actorId, (job.snapshot as any).autopilotScopeV2, request, this.runtime.now());
              assertHeygenRecipeSnapshotV2(request, settings, brief);
              if (request.kind === HEYGEN_NATIVE_REQUEST_KIND_V2) {
                const approvedAppearance = await assertHeygenAppearanceLineageV2(tx, org, job.actorId, request.recipe);
                const background = request.recipe.settings.background;
                if (background?.type === 'image' && !await tx.media.findFirst({where: {
                  organizationId: org, id: background.mediaId, type: 'image', deletedAt: null,
                }, select: {id: true}})) return videoErrorV1('VIDEO_PREFLIGHT_STALE', 409);
                await this.heygenProfiles.assertFrozenInTransaction(tx, org, job.actorId,
                {profileId: request.recipe.binding.profileId!, profileRevision: request.recipe.binding.profileRevision!, profileDigest: request.recipe.binding.profileDigest!, connectionId: request.recipe.binding.connectionId!, subjectDigest: request.subjectDigest}, {groupId: request.recipe.settings.sourceGroupId,
                  baseLookId: request.recipe.settings.sourceLookId, appearanceLookId: approvedAppearance,
                  animationReferenceLookId: request.recipe.settings.animationReferenceLookId, voiceId: request.recipe.settings.voiceId!});
              }
              if (brief.sourceArtifact) await assertResolvedSourceArtifactCurrentV1(tx, org, job.actorId, brief.sourceArtifact, job.pieceId);
              const fence = await tx.contentPiece.updateMany({where: {id: piece.id, organizationId: org, archivedAt: null, updatedAt: piece.updatedAt}, data: {updatedAt: piece.updatedAt}});
              if (fence.count !== 1) return videoErrorV1('VIDEO_SOURCE_CHANGED', 409);
              const marked = await tx.videoSubscriptionJob.updateMany({where: {id, organizationId: org, state: 'accepted', submitAttempts: 0,
                leaseOwner: owner, leaseUntil: {gt: this.runtime.now()}}, data: {state: 'submitting', submitAttempts: 1, submittedAt: this.runtime.now(),
                  snapshot: json({...job.snapshot as any, submitAttempt: {id: attemptId, requestHash: request.requestHash}})}});
              if (marked.count !== 1) return videoErrorV1('VIDEO_JOB_LEASE_LOST', 409);
            }),
            afterResponse: (raw: Record<string, unknown>) => this.persistHeygenResponse(job, attemptId, raw),
          });
          const received = await this.repository.db.videoSubscriptionJob.findFirstOrThrow({where: {id, organizationId: org}});
          await this.write(org, id, owner, {receipt: json({...received.receipt as any, ...receipt}), state: 'queued', errorCode: null, pollAttempts: 0});
        } else {
          if (job.pollAttempts >= 8640) return videoErrorV1('VIDEO_STATUS_DEADLINE', 409);
          await this.write(org, id, owner, {pollAttempts: {increment: 1}});
          const status = await this.heygen.pollNative(def, credential.token, (job.receipt as any)?.id, credential.assertUsable);
          if (status.jobId !== (job.receipt as any)?.id) return videoErrorV1('VIDEO_PROVIDER_RECEIPT_INVALID', 409);
          await this.write(org, id, owner, {state: status.state === 'completed' ? 'saving' : status.state, providerResult: json(status), errorCode: null,
            ...(status.actualCost !== null ? {actualCost: status.actualCost, costCertainty: 'provider_confirmed'} : {}),
            ...(['failed', 'canceled'].includes(status.state) ? {finishedAt: this.runtime.now()} : {})});
        }
      }
    } catch (error) {
      const fresh = await this.repository.db.videoSubscriptionJob.findFirstOrThrow({where: {id, organizationId: org}});
      const code = codeOf(error);
      const rejection = ['submitting', 'submission_unknown'].includes(fresh.state) && (fresh.receipt as any)?.raw ? this.heygen.nativeRejection((fresh.receipt as any).raw) : null;
      if (rejection) await this.write(org, id, owner, {state: 'access_unavailable', errorCode: rejection.code, providerResult: json({rejection}), finishedAt: this.runtime.now()});
      else if (fresh.state === 'submitting' && (fresh.receipt as any)?.raw) {
        try {
          const receipt = this.heygen.nativeReceipt((fresh.receipt as any).raw);
          await this.write(org, id, owner, {receipt: json({...fresh.receipt as any, ...receipt}), state: 'queued', errorCode: code});
        } catch { await this.write(org, id, owner, {state: 'submission_unknown', errorCode: code}).catch(() => {}); }
      } else {
        const transientRead = ['VIDEO_MCP_UNAVAILABLE', 'VIDEO_RESPONSE_TIMEOUT'].includes(code) &&
          (fresh.state === 'accepted' && fresh.submitAttempts === 0 && fresh.pollAttempts < 3 || ['queued', 'running'].includes(fresh.state) && fresh.pollAttempts < 12);
        const state = ['submitting', 'submission_unknown'].includes(fresh.state) ? 'submission_unknown'
          : ['VIDEO_REAUTH_REQUIRED', 'VIDEO_CONNECTION_CHANGED', 'VIDEO_ACCESS_DENIED'].includes(code) ? 'reauth_required'
          : transientRead ? fresh.state
          : fresh.state === 'accepted' ? 'access_unavailable' : ['queued', 'running'].includes(fresh.state) ? 'status_delayed' : fresh.state;
        await this.write(org, id, owner, {state, errorCode: code, ...(transientRead && fresh.state === 'accepted' ? {pollAttempts: {increment: 1}} : {})}).catch(() => {});
      }
    } finally { await this.repository.db.videoSubscriptionJob.updateMany({where: {id, organizationId: org, leaseOwner: owner}, data: {leaseOwner: null, leaseUntil: null}}); }
    const fresh = await this.repository.db.videoSubscriptionJob.findFirstOrThrow({where: {id, organizationId: org}});
    return {state: fresh.state, done: !SUBSCRIPTION_PENDING.includes(fresh.state)};
  }
  private async pollSavedReceipt(job: any) {
    if (isHeygenAvatarRequest(job.request)) {
      const {credential, def} = await this.heygenCredential(job);
      return this.heygen.pollNative(def, credential.token, job.receipt.id, credential.assertUsable);
    }
    const credential = await this.connections.token(job.organizationId, job.actorId, job.connectionId, job.generation, 'recovery');
    return this.provider(job.provider).poll(this.runtime.definition(job.provider), credential.token, job.receipt, credential.assertUsable);
  }
  private async save(job: any, owner: string) {
    try {
      await this.write(job.organizationId, job.id, owner, {saveAttempts: {increment: 1}});
      let file = job.storedFile as NativeStoredVideo | null;
      let providerResult = job.providerResult;
      if (!file) {
        let url = job.providerResult?.url;
        try { if (!url) throw new Error(); file = await this.media.importVideo(url); }
        catch {
          // Refresh a result URL only after the captured URL fails; revoked tokens never block a still-accessible captured file.
          const status = await this.pollSavedReceipt(job);
          if (status.state !== 'completed' || status.jobId !== job.receipt.id || !status.url) return videoErrorV1('VIDEO_PROVIDER_RESULT_MISSING');
          await this.write(job.organizationId, job.id, owner, {providerResult: json(status), ...(status.actualCost !== null ? {actualCost: status.actualCost, costCertainty: 'provider_confirmed'} : {})});
          providerResult = status;
          file = await this.media.importVideo(status.url);
        }
        await this.write(job.organizationId, job.id, owner, {storedFile: json(file)});
      }
      const stored = file!;
      if (job.request?.kind === HEYGEN_NATIVE_REQUEST_KIND_V2 && job.request.recipe.settings.captions !== 'none') {
        await this.saveNativeSubtitles(job, owner, stored, providerResult);
        return;
      }
      await this.repository.transaction(async tx => {
        const fresh = await tx.videoSubscriptionJob.findFirst({where: {id: job.id, organizationId: job.organizationId, state: 'saving', resultMediaId: null, leaseOwner: owner, leaseUntil: {gt: this.runtime.now()}}});
        if (!fresh) return videoErrorV1('VIDEO_JOB_LEASE_LOST', 409);
        const displayName = isHeygenAvatarRequest(job.request) ? `HeyGen — ${(job.request as any).selection.avatar} — ${(job.snapshot as any).settings.locale} — ${job.draftVersion}.mp4` : `video-${job.id}.mp4`;
        const media = await tx.media.create({data: {organizationId: job.organizationId, name: nativeVideoNameV2(job) ?? stored.name, path: stored.path, fileSize: stored.size, type: 'video', originalName: nativeVideoNameV2(job) ?? displayName}});
        const changed = await tx.videoSubscriptionJob.updateMany({where: {id: job.id, organizationId: job.organizationId, state: 'saving', resultMediaId: null, leaseOwner: owner, leaseUntil: {gt: this.runtime.now()}}, data: {state: 'completed', resultMediaId: media.id, errorCode: null, finishedAt: this.runtime.now()}});
        if (changed.count !== 1) return videoErrorV1('VIDEO_JOB_LEASE_LOST', 409);
      });
    } catch (error) { await this.write(job.organizationId, job.id, owner, {state: 'save_failed', errorCode: codeOf(error)}); }
  }
  /** MP4 survives a failed sidecar; retries reuse both owned files and never submit a render. */
  private async saveNativeSubtitles(job: VideoSubscriptionJob, owner: string, stored: NativeStoredVideo, captured: HeygenVideoStatusV1) {
    const org = job.organizationId, id = job.id;
    const videoId = await this.repository.transaction(async tx => {
      const fresh = await tx.videoSubscriptionJob.findFirst({where: {id, organizationId: org, state: 'saving', leaseOwner: owner, leaseUntil: {gt: this.runtime.now()}}});
      if (!fresh) return videoErrorV1('VIDEO_JOB_LEASE_LOST', 409);
      if (fresh.resultMediaId) {
        const video = await tx.media.findFirst({where: {id: fresh.resultMediaId, organizationId: org, deletedAt: null, type: 'video', path: stored.path}});
        return video ? video.id : videoErrorV1('VIDEO_OWNED_FILE_UNAVAILABLE', 404);
      }
      const video = await tx.media.create({data: {organizationId: org, name: nativeVideoNameV2(job) ?? stored.name, path: stored.path, fileSize: stored.size, type: 'video', originalName: nativeVideoNameV2(job) ?? `video-${id}.mp4`}});
      const changed = await tx.videoSubscriptionJob.updateMany({where: {id, organizationId: org, state: 'saving', resultMediaId: null, leaseOwner: owner, leaseUntil: {gt: this.runtime.now()}}, data: {resultMediaId: video.id}});
      if (changed.count !== 1) return videoErrorV1('VIDEO_JOB_LEASE_LOST', 409);
      return video.id;
    });
    let subtitle = stored.subtitle;
    if (!subtitle) {
      let status = captured;
      const importSubtitle = async () => {
        if (status?.subtitleError) return videoErrorV1(status.subtitleError, 409);
        if (!status?.subtitleUrl) return videoErrorV1('VIDEO_PROVIDER_SUBTITLE_MISSING', 409);
        let duration = stored.metadata?.durationSeconds ?? status.durationSeconds;
        if (!duration || !Number.isFinite(duration) || duration <= 0) {
          try { duration = (await this.media.inspectOwnedVideo(stored.path)).durationSeconds; }
          catch { return videoErrorV1('VIDEO_SUBTITLE_DURATION_UNAVAILABLE', 409); }
        }
        try { return await this.media.importSubtitle(status.subtitleUrl, duration); }
        catch (error) {
          if (error instanceof Error && ['VIDEO_SUBTITLES_INVALID', 'VIDEO_SUBTITLE_STORAGE_UNAVAILABLE'].includes(error.message)) return videoErrorV1(error.message, 409);
          throw error;
        }
      };
      try { subtitle = await importSubtitle(); }
      catch (error) {
        if (codeOf(error) === 'VIDEO_SUBTITLE_STORAGE_UNAVAILABLE') throw error;
        // Refresh a missing, expired or invalid sidecar by reading the same receipt.
        status = await this.pollSavedReceipt(job) as HeygenVideoStatusV1;
        if (status.state !== 'completed' || status.jobId !== (job.receipt as any)?.id) return videoErrorV1('VIDEO_PROVIDER_RESULT_MISSING', 409);
        await this.write(org, id, owner, {providerResult: json(status)});
        subtitle = await importSubtitle();
      }
      await this.write(org, id, owner, {storedFile: json({...stored, subtitle})});
    }
    const savedSubtitle = subtitle;
    await this.repository.transaction(async tx => {
      const fresh = await tx.videoSubscriptionJob.findFirst({where: {id, organizationId: org, state: 'saving', resultMediaId: videoId, leaseOwner: owner, leaseUntil: {gt: this.runtime.now()}}});
      if (!fresh) return videoErrorV1('VIDEO_JOB_LEASE_LOST', 409);
      const existing = savedSubtitle.mediaId ? await tx.media.findFirst({where: {id: savedSubtitle.mediaId, organizationId: org, deletedAt: null, type: 'subtitle', path: savedSubtitle.path, name: savedSubtitle.name}}) : null;
      if (savedSubtitle.mediaId && !existing) return videoErrorV1('VIDEO_OWNED_FILE_UNAVAILABLE', 404);
      const media = existing ?? await tx.media.create({data: {organizationId: org, name: savedSubtitle.name, path: savedSubtitle.path, fileSize: savedSubtitle.size, type: 'subtitle', originalName: `subtitles-${id}.${savedSubtitle.mimeType === 'text/vtt' ? 'vtt' : 'srt'}`}});
      const changed = await tx.videoSubscriptionJob.updateMany({where: {id, organizationId: org, state: 'saving', resultMediaId: videoId, leaseOwner: owner, leaseUntil: {gt: this.runtime.now()}},
        data: {state: 'completed', storedFile: json({...stored, subtitle: {...savedSubtitle, mediaId: media.id}}), errorCode: null, finishedAt: this.runtime.now()}});
      if (changed.count !== 1) return videoErrorV1('VIDEO_JOB_LEASE_LOST', 409);
    });
  }
  async action(org: string, actor: string, id: string, action: string) {
    await this.repository.member(org, actor);
    const job = await this.repository.db.videoSubscriptionJob.findFirst({where: {id, organizationId: org}});
    assertLegacyJob(job);
    if (!job || job.actorId !== actor) return videoErrorV1('VIDEO_ACCESS_DENIED', 403);
    if (action === 'cancel') return videoErrorV1('VIDEO_CANCEL_UNAVAILABLE', 409);
    if (isHeygenAvatarRequest(job.request)) return this.heygenNativeAction(job, actor, action);
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
  private async heygenNativeAction(job: VideoSubscriptionJob, actor: string, action: string) {
    const request = parseHeygenAvatarRequest(job.request), org = job.organizationId;
    const save = action === 'retry-save' && job.state === 'save_failed';
    const resume = action === 'resume' && ['reauth_required', 'status_delayed'].includes(job.state) && !!(job.receipt as any)?.id;
    if (!save && !resume) return videoErrorV1('VIDEO_SAVE_RETRY_UNAVAILABLE', 409);
    let generation = job.generation;
    let snapshot = job.snapshot as Prisma.InputJsonValue;
    try {
      const credential = await this.connections.token(org, actor, job.connectionId, undefined, 'discovery', {allowRefresh: false});
      if (credential.connection.provider !== 'heygen') return videoErrorV1('VIDEO_CONNECTION_CHANGED', 409);
      const def = await this.connections.connectable(org, 'heygen');
      const account = await this.heygen.nativeAccount(def, credential.token, credential.assertUsable);
      if (account.subjectDigest !== request.subjectDigest) return videoErrorV1('VIDEO_CONNECTION_CHANGED', 409);
      generation = credential.connection.generation;
      snapshot = json({...job.snapshot as any, nativeRecovery: {subjectDigest: account.subjectDigest, requestHash: request.requestHash,
        generation, tokenVersion: credential.connection.tokenVersion}});
    } catch (error) {
      // A captured MP4 can be saved without provider credentials. Changed identity is never ignored.
      if (!save || codeOf(error) !== 'VIDEO_REAUTH_REQUIRED') throw error;
    }
    const changed = await this.repository.db.videoSubscriptionJob.updateMany({where: {id: job.id, organizationId: org, actorId: actor,
      state: job.state, submitAttempts: 1, OR: [{leaseUntil: null}, {leaseUntil: {lt: this.runtime.now()}}]},
      data: {state: save ? 'saving' : 'queued', generation, snapshot, errorCode: null, runCycle: {increment: 1}, pollAttempts: 0,
        statusDeadlineAt: new Date(this.runtime.now().getTime() + 86400_000)}});
    if (changed.count !== 1) return videoErrorV1('VIDEO_JOB_BUSY', 409);
    const fresh = await this.repository.db.videoSubscriptionJob.findFirstOrThrow({where: {id: job.id, organizationId: org}});
    await this.dispatch(fresh); return this.view(fresh, actor);
  }
  async reconcile(org: string, actor: string, id: string, amount: string, evidence: string) {
    await this.repository.member(org, actor);
    assertLegacyJob(await this.repository.db.videoSubscriptionJob.findFirst({where: {id, organizationId: org}}));
    const value = creditDecimal(amount);
    if (typeof evidence !== 'string' || evidence.trim().length < 5 || evidence.length > 1000) return videoErrorV1('VIDEO_RECONCILIATION_REQUIRED');
    const changed = await this.repository.db.videoSubscriptionJob.updateMany({where: {id, organizationId: org, actorId: actor, actualCost: null, state: {notIn: SUBSCRIPTION_PENDING}}, data: {actualCost: value, costCertainty: 'owner_reconciled', reconciledBy: actor, reconciliationEvidence: evidence}});
    if (!changed.count) return videoErrorV1('VIDEO_RECONCILIATION_UNAVAILABLE', 409);
    return this.get(org, actor, id);
  }
}
