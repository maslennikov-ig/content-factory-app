import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { VideoProductionRepository } from '../../database/prisma/video-production/video-production.repository';
import { VideoGenerationRepository } from '../../database/prisma/video-generation/video-generation.repository';
import { VideoAccessService } from '../video-access.service';
import { VideoMediaV1 } from '../video-media.v1';
import { videoErrorV1, videoSettingsV1, videoSourceRevisionV1 } from '../video-brief.v1';
import type { VideoBriefV1 } from '../video-brief.v1';
import { compositionUrlV1 } from '../providers/composition/composition-http.v1';
import type { VideoPersonalOperationInputV1, VideoPersonalProductionPayloadV1 } from '../video-personal-subscription.v1';
import type { VideoProductionSceneV1 } from './video-production.v1';
import { videoProductionDigestV1 } from './video-production.v1';
import {
  PersonalProductionFundingSchemaV2, PersonalProductionPreflightSchemaV2,
  personalManifestV2, productionContentManifestV2, personalSceneKeyV2,
  type PersonalProductionManifestV2,
} from './video-production.personal.v2';
import type {
  PersonalProductionApprovalV2, PersonalProductionJobCreateV2,
  PersonalProductionOperationV2, PersonalProductionPreparationV2,
  PersonalProductionRevisionV2,
} from './video-production.personal.types.v2';

const sceneIntent = (key: string) => `production-personal-scene-${key}`;
const finalIntent = (id: string) => `production-personal-final-${id}`;
const errorCode = (error: any) => {
  const code = error?.getResponse?.()?.code ?? error?.code;
  return typeof code === 'string' && /^VIDEO_[A-Z0-9_:.-]{1,160}$/.test(code) ? code : 'VIDEO_SUBSCRIPTION_OPERATION_UNAVAILABLE';
};

/** Groups existing subscription jobs. It never resolves API credentials,
 * submits provider tools directly, or accepts executable workflow commands. */
@Injectable()
export class VideoProductionPersonalServiceV2 {
  constructor(
    private readonly repository: VideoProductionRepository,
    private readonly generations: VideoGenerationRepository,
    private readonly access: VideoAccessService,
    private readonly media: VideoMediaV1,
  ) {}

  private async row(org: string, id: string): Promise<PersonalProductionRevisionV2> {
    const row = await this.repository.read(org, id);
    if (!row) return videoErrorV1('VIDEO_PRODUCTION_NOT_FOUND', 404);
    // An unknown/malformed personal version is never interpreted as API V1.
    productionContentManifestV2(row.manifest);
    return row as unknown as PersonalProductionRevisionV2;
  }

  private async assets(org: string, manifest: PersonalProductionManifestV2) {
    const content = productionContentManifestV2(manifest);
    const piece = await this.generations.piece(org, content.pieceId);
    if (!piece || videoSourceRevisionV1(piece) !== content.pieceRevision) return videoErrorV1('VIDEO_SOURCE_CHANGED', 409);
    const ids = [...new Set(content.scenes.flatMap(scene => [scene.mediaId, scene.audioMediaId, ...scene.referenceMediaIds].filter((id): id is string => !!id)))];
    const rows = ids.length ? await this.generations.references(org, ids) : [];
    if (rows.length !== ids.length) return videoErrorV1('VIDEO_REFERENCE_NOT_FOUND', 404);
    const assets = new Map(rows.map(row => [row.id, row]));
    for (const row of rows) compositionUrlV1(row.path);
    for (const scene of content.scenes) {
      if (scene.mediaId && assets.get(scene.mediaId)?.type !== scene.kind) return videoErrorV1('VIDEO_REFERENCE_TYPE_MISMATCH');
      if (scene.audioMediaId && assets.get(scene.audioMediaId)?.type !== 'audio') return videoErrorV1('VIDEO_REFERENCE_NOT_AUDIO');
      if (scene.referenceMediaIds.some(id => assets.get(id)?.type !== 'image')) return videoErrorV1('VIDEO_REFERENCE_NOT_IMAGE');
    }
    return assets;
  }

  private sceneKey(row: PersonalProductionRevisionV2, scene: VideoProductionSceneV1, assets: Map<string, any>) {
    const identities = [scene.mediaId, scene.audioMediaId, ...scene.referenceMediaIds].filter(Boolean).map(id => {
      const media = assets.get(id!);
      return {id: media.id, path: media.path, type: media.type, size: media.fileSize, revision: new Date(media.updatedAt).toISOString()};
    });
    return personalSceneKeyV2(row.productionId, row.manifest, scene, identities);
  }

  async createRevision(org: string, actor: string, value: any) {
    if (!value || Object.keys(value).some(key => !['manifest', 'intentId', 'parentId', 'funding'].includes(key)) ||
      typeof value.intentId !== 'string' || !/^[A-Za-z0-9_-]{16,100}$/.test(value.intentId)) return videoErrorV1('VIDEO_PRODUCTION_INPUT_INVALID');
    await this.access.repository.member(org, actor);
    const parent = value.parentId ? await this.repository.read(org, value.parentId) : null;
    if (value.parentId && (!parent || parent.userId !== actor)) return videoErrorV1('VIDEO_PRODUCTION_ACTOR_MISMATCH', 403);
    const stored = value.manifest?.version === 2;
    const nestedFunding = stored ? value.manifest.funding : undefined;
    const inherited = (parent?.manifest as any)?.version === 2 ? (parent!.manifest as any).funding : undefined;
    const funding = PersonalProductionFundingSchemaV2.parse(value.funding ?? nestedFunding ?? inherited);
    if (nestedFunding && videoProductionDigestV1(nestedFunding) !== videoProductionDigestV1(funding)) return videoErrorV1('VIDEO_PRODUCTION_FUNDING_CHANGED');
    const manifest = personalManifestV2(stored ? productionContentManifestV2(value.manifest) : value.manifest, funding);
    await this.assets(org, manifest);
    const row = await this.repository.create({organizationId: org, userId: actor, intentId: value.intentId, parentId: value.parentId,
      manifest, digest: videoProductionDigestV1(manifest)});
    return this.view(row as unknown as PersonalProductionRevisionV2, actor);
  }

  private async preparation(org: string, actor: string, input: VideoPersonalOperationInputV1): Promise<PersonalProductionPreparationV2> {
    const prepared = await this.access.preparePersonalOperation(org, actor, input);
    if (prepared.connectionId !== input.connectionId || prepared.operation !== input.operation) return videoErrorV1('VIDEO_PRODUCTION_FUNDING_CHANGED');
    const credential = await this.access.connections.token(org, actor, prepared.connectionId, prepared.accountGeneration);
    const connection = credential.connection;
    if (connection.provider !== prepared.provider || !['heygen_credit', 'higgsfield_credit'].includes(connection.unit) ||
      prepared.request.quote.unit !== connection.unit || !connection.perJob || !connection.perMonth) return videoErrorV1('VIDEO_PRODUCTION_CREDIT_UNIT_MISMATCH');
    await credential.assertUsable();
    return {...prepared, unit: connection.unit, walletDigest: connection.walletDigest,
      perJob: connection.perJob.toFixed(), perMonth: connection.perMonth.toFixed()};
  }

  private productionInput(row: PersonalProductionRevisionV2, stage: 'quote' | 'ready_assets', resolvedScenes?: VideoPersonalProductionPayloadV1['resolvedScenes'], sceneId?: string): VideoPersonalProductionPayloadV1 {
    return {version: 1, intentId: finalIntent(row.id), stage, manifest: productionContentManifestV2(row.manifest),
      manifestDigest: row.digest, ...(resolvedScenes ? {resolvedScenes} : {}), ...(sceneId ? {sceneId} : {})};
  }

  async preflight(org: string, actor: string, id: string, value: unknown) {
    const row = await this.row(org, id);
    if (row.userId !== actor) return videoErrorV1('VIDEO_PRODUCTION_ACTOR_MISMATCH', 403);
    await this.access.repository.member(org, actor);
    const input = PersonalProductionPreflightSchemaV2.safeParse(value);
    if (!input.success) return videoErrorV1('VIDEO_PRODUCTION_PERSONAL_CREDIT_LIMITS_REQUIRED');
    if (!['draft', 'preflight'].includes(row.state) || row.stoppedAt) return videoErrorV1('VIDEO_PRODUCTION_APPROVAL_STALE', 409);
    const assets = await this.assets(org, row.manifest);
    const approval: PersonalProductionApprovalV2 = {version: 2, kind: 'personal_subscription', id: randomUUID(), actorId: actor,
      manifestDigest: row.digest, expiresAt: new Date(Date.now() + 300000).toISOString(), creditLimits: input.data.creditLimits,
      scenes: [], final: {provider: row.manifest.funding.finalProvider, jobId: randomUUID()}, blockers: []};
    const funding = row.manifest.funding;
    const finalProvider = funding.finalProvider;
    const finalConnection = finalProvider ? funding.connections[finalProvider] : undefined;
    approval.final.connectionId = finalConnection;
    if (!finalProvider) approval.blockers.push('VIDEO_PERSONAL_FINAL_PROVIDER_REQUIRED');
    if (!finalConnection) approval.blockers.push('VIDEO_PERSONAL_FINAL_CONNECTION_REQUIRED');
    // Establish final readiness and a non-generating native-unit quote before
    // admitting even one scene. API composition is never a fallback.
    if (finalConnection && finalProvider) {
      try {
        const readiness = await this.access.personalReadiness(org, actor, finalConnection);
        const operation = readiness.operations.find(one => one.kind === 'final_composition');
        if (readiness.provider !== finalProvider || !readiness.walletVerified || !operation?.ready) {
          approval.blockers.push(...(operation?.blockers.length ? operation.blockers : ['VIDEO_SUBSCRIPTION_OPERATION_UNAVAILABLE:final_composition']));
        } else approval.final.preparation = await this.preparation(org, actor, {connectionId: finalConnection,
          operation: 'final_composition', production: this.productionInput(row, 'quote')});
      } catch (error) { approval.blockers.push(`${errorCode(error)}:final_composition`); }
    }
    // The current subscription result importer stores video only. Keep the
    // authored image/voice project rather than sending audio into that importer.
    for (const scene of row.manifest.scenes) if (scene.kind === 'image' && scene.script.trim() && !scene.audioMediaId)
      approval.blockers.push(`VIDEO_PERSONAL_NARRATION_AUDIO_RESULT_UNAVAILABLE:${scene.id}`);
    if (!approval.blockers.length) for (const scene of row.manifest.scenes) {
      const key = this.sceneKey(row, scene, assets);
      const plan: PersonalProductionApprovalV2['scenes'][number] = {sceneId: scene.id, key, kind: 'asset', reused: false,
        mediaId: scene.mediaId, audioMediaId: scene.audioMediaId};
      const operation: PersonalProductionOperationV2 | undefined = scene.kind === 'presenter' ? 'presenter' :
        scene.kind === 'generated_clip' ? 'generated_clip' : scene.kind === 'image' && scene.script.trim() && !scene.audioMediaId ? 'narration' : undefined;
      if (operation) {
        plan.kind = 'generation';
        const provider = operation === 'generated_clip' ? 'higgsfield' : 'heygen';
        const connectionId = funding.connections[provider];
        if (!connectionId) approval.blockers.push(`VIDEO_PERSONAL_CONNECTION_REQUIRED:${provider}`);
        else try {
          if (await this.repository.unresolvedPersonalScene(org, actor, row.productionId, scene.id))
            return videoErrorV1('VIDEO_SCENE_RECONCILIATION_REQUIRED', 409);
          const old = await this.repository.personalJobByIntent(org, sceneIntent(key));
          if (old) {
            const credential = await this.access.connections.token(org, actor, connectionId);
            if (old.actorId !== actor || old.connectionId !== connectionId || old.walletDigest !== credential.connection.walletDigest || old.provider !== provider ||
              (old.snapshot as any)?.details?.sceneKey !== key) return videoErrorV1('VIDEO_PRODUCTION_FUNDING_CHANGED');
            plan.jobId = old.id; plan.reused = true;
            if (old.state !== 'completed' || !old.resultMediaId) approval.blockers.push(`VIDEO_SCENE_RECONCILIATION_REQUIRED:${scene.id}`);
          } else {
            let prepared: PersonalProductionPreparationV2;
            if (operation === 'narration') prepared = await this.preparation(org, actor, {connectionId, operation,
              production: this.productionInput(row, 'quote', undefined, scene.id)});
            else {
              const settings = operation === 'presenter' ? videoSettingsV1({provider: 'heygen', model: 'heygen-avatar', mode: 'presenter',
                locale: row.manifest.locale, duration: scene.durationSeconds, aspectRatio: row.manifest.aspectRatio, resolution: row.manifest.resolution,
                audio: true, captions: row.manifest.captions, avatarId: scene.avatarId, voiceId: scene.voiceId, engine: scene.engine}) : videoSettingsV1(scene.clipSettings);
              if (settings.provider !== provider || settings.locale !== row.manifest.locale || settings.duration !== scene.durationSeconds ||
                settings.aspectRatio !== row.manifest.aspectRatio || operation === 'generated_clip' && (settings.mode !== 'clip' || settings.captions)) return videoErrorV1('VIDEO_CLIP_SETTINGS_MISMATCH');
              const brief: VideoBriefV1 = {intent: row.manifest.title, audience: '', keyMessage: scene.title ?? row.manifest.title,
                visualIntent: scene.prompt ?? scene.title ?? '', prompt: scene.prompt ?? '', script: scene.script,
                facts: [{text: operation === 'presenter' ? scene.script : scene.prompt!, sourceId: `${row.manifest.pieceId}:${scene.id}`, policy: 'must_include' as const}],
                avoidImplications: [], referenceMediaIds: [...scene.referenceMediaIds], sourceLocale: row.manifest.locale,
                outputLocale: row.manifest.locale, scriptPolicy: 'exact' as const, preparedWithAi: false};
              prepared = await this.preparation(org, actor, {connectionId, operation, settings, brief, references: scene.referenceMediaIds});
            }
            plan.jobId = randomUUID(); plan.preparation = prepared;
          }
        } catch (error) { approval.blockers.push(`${errorCode(error)}:${scene.id}`); }
      }
      approval.scenes.push(plan);
    }
    const preparations = [...approval.scenes.flatMap(scene => scene.preparation ? [scene.preparation] : []), ...(approval.final.preparation ? [approval.final.preparation] : [])];
    const totals = new Map<string, Prisma.Decimal>();
    for (const prepared of preparations) {
      const limit = approval.creditLimits.find(one => one.connectionId === prepared.connectionId);
      if (!limit || limit.unit !== prepared.unit) approval.blockers.push(`VIDEO_PRODUCTION_CREDIT_LIMIT_REQUIRED:${prepared.provider}`);
      const reservation = new Prisma.Decimal(prepared.perJob);
      totals.set(prepared.connectionId, (totals.get(prepared.connectionId) ?? new Prisma.Decimal(0)).plus(reservation));
      approval.expiresAt = new Date(Math.min(Date.parse(approval.expiresAt), Date.parse(prepared.request.quote.expiresAt))).toISOString();
    }
    for (const [connectionId, amount] of totals) {
      const limit = approval.creditLimits.find(one => one.connectionId === connectionId);
      if (limit && amount.gt(limit.maxCredits)) approval.blockers.push('VIDEO_PRODUCTION_TOTAL_CREDIT_LIMIT_EXCEEDED');
    }
    approval.blockers = [...new Set(approval.blockers)];
    await this.repository.savePersonalPreflight(row, approval);
    return this.get(org, id, actor);
  }

  private job(row: PersonalProductionRevisionV2, id: string, intentId: string, preparation: PersonalProductionPreparationV2,
    state: PersonalProductionJobCreateV2['state'], details: Record<string, unknown>): PersonalProductionJobCreateV2 {
    return {id, intentId, preparation, state, snapshot: {kind: 'production/personal-v2', productionRevisionId: row.id,
      manifestDigest: row.digest, approvalId: row.approval!.id, details}};
  }

  private async revalidate(org: string, actor: string, prepared: PersonalProductionPreparationV2) {
    const readiness = await this.access.personalReadiness(org, actor, prepared.connectionId);
    if (!readiness.walletVerified || readiness.accountGeneration !== prepared.accountGeneration || readiness.schema.digest !== prepared.request.schemaDigest ||
      readiness.provider !== prepared.provider || !readiness.operations.some(one => one.kind === prepared.operation && one.ready)) return videoErrorV1('VIDEO_PREFLIGHT_STALE', 409);
    const credential = await this.access.connections.token(org, actor, prepared.connectionId, prepared.accountGeneration);
    if (credential.connection.walletDigest !== prepared.walletDigest) return videoErrorV1('VIDEO_CONNECTION_CHANGED', 409);
    await credential.assertUsable();
  }

  async approveAndLaunch(org: string, actor: string, id: string, value: {approvalId: string; digest: string}) {
    const row = await this.row(org, id), approval = row.approval;
    if (row.userId !== actor || !approval || approval.actorId !== actor || value?.approvalId !== approval.id || value.digest !== row.digest) return videoErrorV1('VIDEO_PRODUCTION_APPROVAL_STALE', 409);
    await this.access.repository.member(org, actor);
    if (row.state === 'approved') { await this.dispatch(row); return this.get(org, id, actor); }
    if (row.state === 'needs_attention' && approval.acceptedAt) {
      // Explicitly resume the same approved, unsent final reservation. This is
      // not retry-save and cannot re-create an uncertain scene or final job.
      await this.assets(org, row.manifest);
      if (!approval.final.preparation) return videoErrorV1('VIDEO_PRODUCTION_PREFLIGHT_BLOCKED', 409);
      await this.revalidate(org, actor, approval.final.preparation);
      const resumed = await this.repository.resumePersonalFinal(org, actor, id, approval.id, row.digest);
      await this.dispatch(resumed);
      return this.get(org, id, actor);
    }
    if (row.state !== 'preflight' || Date.parse(approval.expiresAt) <= Date.now() || approval.blockers.length || !approval.final.preparation) return videoErrorV1('VIDEO_PRODUCTION_PREFLIGHT_BLOCKED', 409);
    const assets = await this.assets(org, row.manifest);
    const creates: PersonalProductionJobCreateV2[] = [];
    for (const plan of approval.scenes) {
      const scene = row.manifest.scenes.find(one => one.id === plan.sceneId)!;
      if (this.sceneKey(row, scene, assets) !== plan.key) return videoErrorV1('VIDEO_PRODUCTION_ASSET_CHANGED', 409);
      if (plan.kind === 'asset' || plan.reused) continue;
      if (!plan.preparation || !plan.jobId) return videoErrorV1('VIDEO_PRODUCTION_PREFLIGHT_BLOCKED', 409);
      await this.revalidate(org, actor, plan.preparation);
      creates.push(this.job(row, plan.jobId, sceneIntent(plan.key), plan.preparation, 'accepted', {sceneId: scene.id, sceneKey: plan.key, scene}));
    }
    await this.revalidate(org, actor, approval.final.preparation);
    creates.push(this.job(row, approval.final.jobId, finalIntent(row.id), approval.final.preparation, 'awaiting_assets', {deferred: true}));
    const accepted = await this.repository.approvePersonal(row, approval, creates);
    await this.dispatch(accepted as unknown as PersonalProductionRevisionV2);
    return this.get(org, id, actor);
  }

  private async dispatch(row: PersonalProductionRevisionV2) {
    for (const plan of row.approval?.scenes ?? []) if (plan.jobId && !plan.reused) {
      const job = await this.repository.subscriptionJob(row.organizationId, plan.jobId);
      if (job?.state === 'accepted') await this.access.subscriptions.dispatch(job);
    }
  }

  async runStep(org: string, id: string) {
    const row = await this.row(org, id);
    if (row.state !== 'approved' || row.stoppedAt) return {state: row.state, done: true};
    let waiting = false;
    for (const plan of row.approval!.scenes) if (plan.jobId) {
      const job = await this.repository.subscriptionJob(org, plan.jobId);
      if (!job) return {state: 'VIDEO_PRODUCTION_JOB_NOT_FOUND', done: true};
      if (job.state === 'completed') continue;
      if (!['accepted', 'submitting', 'queued', 'running', 'saving'].includes(job.state)) {
        await this.repository.setState(org, id, 'needs_attention'); return {state: `needs_attention:${job.state}`, done: true};
      }
      await this.access.subscriptions.dispatch(job); waiting = true;
    }
    if (waiting) return {state: 'preparing_scenes', done: false};
    const final = await this.repository.subscriptionJob(org, row.approval!.final.jobId);
    if (!final) return {state: 'VIDEO_PRODUCTION_JOB_NOT_FOUND', done: true};
    if (final.state === 'completed') { await this.repository.setState(org, id, 'completed'); return {state: 'completed', done: true}; }
    if (final.state === 'awaiting_assets') {
      try { await this.prepareFinal(row); }
      catch (error) {
        const code = errorCode(error);
        const recorded = await this.repository.recordPersonalFinalPreparationError(org, id, final.id, code);
        return recorded ? {state: `needs_attention:${code}`, done: true} : {state: 'preparing_final', done: false};
      }
    } else if (['accepted', 'submitting', 'queued', 'running', 'saving'].includes(final.state)) await this.access.subscriptions.dispatch(final);
    else { await this.repository.setState(org, id, 'needs_attention'); return {state: `needs_attention:${final.state}`, done: true}; }
    return {state: 'preparing_final', done: false};
  }

  private async prepareFinal(row: PersonalProductionRevisionV2) {
    const approval = row.approval!, original = approval.final.preparation!;
    const assets = await this.assets(row.organizationId, row.manifest);
    const resolved: NonNullable<VideoPersonalProductionPayloadV1['resolvedScenes']> = [];
    for (const plan of approval.scenes) {
      const scene = row.manifest.scenes.find(one => one.id === plan.sceneId)!;
      if (this.sceneKey(row, scene, assets) !== plan.key) return videoErrorV1('VIDEO_PRODUCTION_ASSET_CHANGED', 409);
      if (plan.jobId) {
        const job = await this.repository.subscriptionJob(row.organizationId, plan.jobId);
        const media = job?.resultMediaId ? await this.generations.media(row.organizationId, job.resultMediaId) : null;
        if (!job || job.state !== 'completed' || !media || media.type !== 'video') return videoErrorV1('VIDEO_SCENE_NOT_COMPLETED', 409);
        const measured = await this.media.inspectOwnedVideo(media.path);
        resolved.push({sceneId: scene.id, mediaId: media.id, durationSeconds: measured.durationSeconds,
          sourceCaptions: (job.providerResult as any)?.captionsBurned === true ? 'burned' : 'none'});
      } else {
        const durationSeconds = scene.kind === 'video'
          ? (await this.media.inspectOwnedVideo(assets.get(scene.mediaId!)!.path)).durationSeconds : scene.durationSeconds;
        resolved.push({sceneId: scene.id, mediaId: scene.mediaId!, audioMediaId: scene.audioMediaId,
          durationSeconds, sourceCaptions: scene.sourceCaptions});
      }
    }
    if (resolved.reduce((sum, one) => sum + one.durationSeconds, 0) > 600) return videoErrorV1('VIDEO_PRODUCTION_ACTUAL_DURATION_EXCEEDS_LIMIT', 409);
    await this.revalidate(row.organizationId, row.userId, original);
    const prepared = await this.preparation(row.organizationId, row.userId, {connectionId: original.connectionId, operation: 'final_composition',
      production: this.productionInput(row, 'ready_assets', resolved)});
    if (prepared.provider !== original.provider || prepared.walletDigest !== original.walletDigest || prepared.accountGeneration !== original.accountGeneration ||
      prepared.request.schemaDigest !== original.request.schemaDigest || prepared.unit !== original.unit || new Prisma.Decimal(prepared.request.quote.amount).gt(original.perJob) ||
      prepared.request.quote.upperBound !== null && new Prisma.Decimal(prepared.request.quote.upperBound).gt(original.perJob)) return videoErrorV1('VIDEO_FINAL_CREDIT_LIMIT_EXCEEDED', 409);
    await this.repository.finalPersonalJob(row, this.job(row, approval.final.jobId, finalIntent(row.id), prepared, 'accepted', {resolvedScenes: resolved}));
    const final = await this.repository.subscriptionJob(row.organizationId, approval.final.jobId);
    if (final?.state === 'accepted') await this.access.subscriptions.dispatch(final);
  }

  async stop(org: string, actor: string, id: string) {
    await this.access.repository.member(org, actor);
    await this.repository.stopPersonal(org, actor, id);
    return this.get(org, id, actor);
  }

  async retrySave(org: string, actor: string, id: string, jobId: string) {
    const row = await this.row(org, id);
    if (row.userId !== actor || ![...row.approval?.scenes.map(scene => scene.jobId) ?? [], row.approval?.final.jobId].includes(jobId)) return videoErrorV1('VIDEO_PRODUCTION_JOB_NOT_FOUND', 404);
    // A missing subscription row must never enter the mixed facade's API fallback.
    await this.access.subscriptions.action(org, actor, jobId, 'retry-save');
    await this.repository.resume(org, id);
    return this.get(org, id, actor);
  }

  async finalResultJob(org: string, id: string, jobId: string) {
    const row = await this.row(org, id);
    if (row.approval?.final.jobId !== jobId) return videoErrorV1('VIDEO_FINAL_RESULT_MISMATCH');
    return this.repository.subscriptionJob(org, jobId);
  }

  async get(org: string, id: string, actor?: string) { return this.view(await this.row(org, id), actor); }

  async view(row: PersonalProductionRevisionV2, actor?: string) {
    const ids = row.approval?.acceptedAt ? [...new Set([...row.approval.scenes.flatMap(scene => scene.jobId ? [scene.jobId] : []), row.approval.final.jobId])] : [];
    const stored = (await Promise.all(ids.map(id => this.repository.subscriptionJob(row.organizationId, id)))).filter(Boolean);
    const jobs = await Promise.all(stored.map(job => this.access.subscriptions.view(job!, actor ?? '')));
    const final = stored.find(job => job!.id === row.approval?.final.jobId);
    let result: any = null;
    if (final?.state === 'completed' && final.resultMediaId) {
      const owned = await this.generations.media(row.organizationId, final.resultMediaId);
      if (owned?.type === 'video') {
        let metadata: Awaited<ReturnType<VideoMediaV1['inspectOwnedVideo']>> | undefined;
        try { metadata = await this.media.inspectOwnedVideo(owned.path); } catch { /* Owned file is retained without invented measurements. */ }
        result = {...owned, metadataStatus: metadata ? 'measured' : 'unavailable', ...(metadata ? {width: metadata.width, height: metadata.height, durationSeconds: metadata.durationSeconds, metadata} : {}),
          captions: {burned: (final.providerResult as any)?.captionsBurned === true ? 'provider_confirmed' : 'unverified', sourceJobIds: (final.providerResult as any)?.captionsBurned === true ? [final.id] : []}, subtitles: []};
      }
    }
    const own = actor === row.userId;
    const approval = row.approval ? {version: 2, kind: 'personal_subscription', id: row.approval.id, actorId: row.approval.actorId,
      expiresAt: row.approval.expiresAt, acceptedAt: row.approval.acceptedAt, blockers: row.approval.blockers,
      creditLimits: own ? row.approval.creditLimits : undefined,
      scenes: row.approval.scenes.map(scene => ({sceneId: scene.sceneId, kind: scene.kind, key: scene.key, jobId: scene.jobId, reused: scene.reused,
        operation: scene.preparation?.operation, provider: scene.preparation?.provider, quote: scene.preparation?.request.quote, reserved: scene.preparation?.perJob})),
      final: {provider: row.approval.final.provider, quote: row.approval.final.preparation?.request.quote, reserved: row.approval.final.preparation?.perJob},
      finalJobId: row.approval.final.jobId, providerBillingCap: false} : null;
    return {id: row.id, productionId: row.productionId, revision: row.revision, parentId: row.parentId, digest: row.digest,
      manifest: own ? row.manifest : {...row.manifest, funding: {...row.manifest.funding, connections: {}}},
      funding: {kind: 'personal_subscription' as const, apiFallback: false as const}, state: row.state, stoppedAt: row.stoppedAt,
      approval, jobs, result, cost: {kind: 'personal_subscription' as const,
        operations: stored.map(job => ({jobId: job!.id, amount: job!.actualCost?.toFixed() ?? null, reserved: job!.reserved.toFixed(), unit: job!.unit, certainty: job!.costCertainty}))},
      createdAt: row.createdAt};
  }
}
