import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { VideoAccessSchemaV2, VideoAccessV2 } from './video-access.v2';
import { VideoJobService } from './video-job.service';
import { VideoGenerationRepository } from '../database/prisma/video-generation/video-generation.repository';
import { VideoSubscriptionRepository } from '../database/prisma/video-subscription/video-subscription.repository';
import { VideoConnectionService } from './subscriptions/video-connection.service';
import { VideoSubscriptionJobService } from './subscriptions/video-subscription-job.service';
import { subscriptionHash, SubscriptionProvider } from './subscriptions/video-provider-registry';
import { assertCreditPolicy, creditExposure, creditPeriod } from './subscriptions/video-credit-policy';
import { parseVideoV1, videoErrorV1, videoSettingsV1, validateVideoGroundingV1, videoSourceRevisionV1 } from './video-brief.v1';
import { VideoMediaV1, assertMp4VideoV1 } from './video-media.v1';

const json = (v: unknown) => v as Prisma.InputJsonValue;
const PreflightInput = z.object({draftId: z.string().uuid(), version: z.number().int().positive(), access: VideoAccessSchemaV2}).strict();
const LaunchInput = z.object({preflightId: z.string().uuid(), intentId: z.string().uuid()}).strict();
const ManualInput = z.object({draftId: z.string().uuid(), version: z.number().int().positive(), mediaId: z.string().uuid()}).strict();
export const draftAccessDigest = (draft: any) => subscriptionHash({id: draft.id, version: draft.version, brief: draft.brief, settings: draft.settings, pieceRevision: draft.pieceRevision});

/** Every new UI/chat route shares authorization, immutable approval and one route intent. */
@Injectable()
export class VideoAccessService {
  constructor(readonly repository: VideoSubscriptionRepository, readonly apiRepository: VideoGenerationRepository,
    readonly api: VideoJobService, readonly connections: VideoConnectionService,
    readonly subscriptions: VideoSubscriptionJobService, readonly media: VideoMediaV1) {}
  choices(org: string, actor: string) { return this.connections.list(org, actor); }
  async assets(org: string, actor: string, connectionId: string) {
    const credential = await this.connections.token(org, actor, connectionId);
    const provider = credential.connection.provider as SubscriptionProvider;
    const def = await this.connections.enabled(org, provider);
    await this.subscriptions.mcp.capabilities(def, credential.token, credential.assertUsable);
    if (provider !== 'heygen') return {avatars: [], voices: [], engines: []};
    const avatars = await this.subscriptions.mcp.call(def, credential.token, 'list_avatars', {}, credential.assertUsable);
    const voices = await this.subscriptions.mcp.call(def, credential.token, 'list_voices', {}, credential.assertUsable);
    if (avatars.eligibility !== 'small_trial' || voices.eligibility !== 'small_trial' || !Array.isArray(avatars.avatars) || !Array.isArray(voices.voices)) return videoErrorV1('VIDEO_SUBSCRIPTION_TRIAL_UNVERIFIED', 409);
    const safe = (rows: any[]) => rows.slice(0,100).filter(row => typeof row.id === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(row.id)).map(row => ({id: row.id, name: typeof row.name === 'string' ? row.name.slice(0,120) : row.id,
      engines: Array.isArray(row.engines) ? row.engines.filter((e: string) => ['avatar_iii','avatar_iv'].includes(e)) : [], locales: Array.isArray(row.locales) ? row.locales.filter((l: unknown) => typeof l === 'string' && /^[A-Za-z-]{2,60}$/.test(l)) : []}));
    return {avatars: safe(avatars.avatars), voices: safe(voices.voices), engines: ['avatar_iii','avatar_iv']};
  }
  private async currentDraft(org: string, id: string, version: number) {
    const draft = await this.apiRepository.draft(org, id);
    if (!draft || draft.version !== version) return videoErrorV1('VIDEO_DRAFT_CHANGED', 409);
    const piece = await this.apiRepository.piece(org, draft.pieceId);
    if (!piece || videoSourceRevisionV1(piece) !== draft.pieceRevision) return videoErrorV1('VIDEO_SOURCE_CHANGED', 409);
    return draft;
  }
  async preflight(org: string, actor: string, input: unknown) {
    await this.repository.member(org, actor);
    const value = parseVideoV1(PreflightInput, input);
    if (value.access.kind === 'manual') return videoErrorV1('VIDEO_MANUAL_AWAITING_UPLOAD', 409);
    const draft = await this.currentDraft(org, value.draftId, value.version);
    const settings = videoSettingsV1(draft.settings); const brief = draft.brief as any;
    validateVideoGroundingV1(brief, settings);
    let request: any, quote: any, connection: any = null, remaining: string | null = null;
    if (value.access.kind === 'api') {
      const result = await this.api.preflight(org, actor, draft.id);
      if (result.payer !== value.access.payer) return videoErrorV1('VIDEO_PAYER_CHANGED', 409);
      request = {apiPreflight: result};
      quote = {amount: result.estimate.usd === null ? null : String(result.estimate.usd), unit: 'USD', source: result.estimate.source,
        asOf: this.connections.runtime.now().toISOString(), expiresAt: result.estimate.expiresAt, upperBound: result.estimate.upperBoundUsd === undefined ? null : String(result.estimate.upperBoundUsd)};
      if (quote.amount === null) return videoErrorV1('VIDEO_PRICE_UNAVAILABLE', 409);
    } else {
      const credential = await this.connections.token(org, actor, value.access.connectionId);
      connection = credential.connection;
      if (connection.provider !== settings.provider) return videoErrorV1('VIDEO_PROVIDER_MODE_MISMATCH');
      const def = await this.connections.enabled(org, settings.provider as SubscriptionProvider);
      const references = await this.apiRepository.references(org, brief.referenceMediaIds);
      if (references.length !== brief.referenceMediaIds.length) return videoErrorV1('VIDEO_REFERENCE_NOT_FOUND', 404);
      for (const reference of references) await this.media.referenceDimensions(reference.path);
      request = await this.subscriptions.provider(settings.provider).prepare(def, credential.token, settings, brief, references.map(r => ({id: r.id, url: r.path})), credential.assertUsable);
      quote = request.quote; assertCreditPolicy(connection, quote);
      remaining = connection.perMonth.minus(await creditExposure(this.repository.db, connection.id, this.connections.runtime.now())).toFixed();
    }
    const expiresAt = new Date(Math.min(Date.parse(quote.expiresAt), this.connections.runtime.now().getTime() + 300_000));
    const row = await this.repository.db.videoAccessPreflight.create({data: {organizationId: org, actorId: actor, draftId: draft.id,
      draftVersion: draft.version, draftDigest: draftAccessDigest(draft), access: json(value.access), snapshot: json({brief, settings, pieceRevision: draft.pieceRevision,
        perJob: connection?.perJob?.toFixed() ?? request.apiPreflight?.maxCostUsd?.toString() ?? null,
        perMonth: connection?.perMonth?.toFixed() ?? null, remaining}), request: json(request), quote: json(quote), connectionId: connection?.id,
      generation: connection?.generation, schemaDigest: request.schemaDigest, expiresAt}});
    return this.approvalView(row);
  }
  private approvalView(row: any) {
    return {id: row.id, preflightId: row.id, draftId: row.draftId, version: row.draftVersion, access: row.access,
      brief: row.snapshot.brief, settings: row.snapshot.settings, quote: row.quote, expiresAt: row.expiresAt.toISOString(),
      accountGeneration: row.generation, perJob: row.snapshot.perJob, perMonth: row.snapshot.perMonth, remaining: row.snapshot.remaining, providerBillingCap: false};
  }
  async approval(org: string, actor: string, id: string, allowExpired = false) {
    await this.repository.member(org, actor);
    const row = await this.repository.db.videoAccessPreflight.findFirst({where: {id, organizationId: org, actorId: actor}});
    if (!row) return videoErrorV1('VIDEO_PREFLIGHT_NOT_FOUND', 404);
    const draft = await this.currentDraft(org, row.draftId, row.draftVersion);
    if (draftAccessDigest(draft) !== row.draftDigest || (!allowExpired && row.expiresAt <= this.connections.runtime.now())) return videoErrorV1('VIDEO_PREFLIGHT_STALE', 409);
    if ((row.access as any).kind === 'subscription') {
      const connection = await this.repository.connection(org, actor, row.connectionId!);
      if (row.generation !== connection.generation || (row.snapshot as any).perJob !== connection.perJob?.toFixed() || (row.snapshot as any).perMonth !== connection.perMonth?.toFixed()) return videoErrorV1('VIDEO_PREFLIGHT_STALE', 409);
    }
    return this.approvalView(row);
  }
  async launch(org: string, actor: string, input: unknown) {
    const value = parseVideoV1(LaunchInput, input); await this.repository.member(org, actor);
    const prior = await this.repository.db.videoRouteIntent.findUnique({where: {organizationId_intentId: {organizationId: org, intentId: value.intentId}}});
    if (prior && (prior.actorId !== actor || prior.preflightId !== value.preflightId)) return videoErrorV1('VIDEO_INTENT_MISMATCH', 409);
    const existing = await this.repository.db.videoSubscriptionJob.findFirst({where: {organizationId: org, preflightId: value.preflightId}});
    if (existing) {
      if (existing.actorId !== actor) return videoErrorV1('VIDEO_ACCESS_DENIED', 403);
      // A second entry point may use a different client intent for the same approval.
      // Bind that alias too, so it cannot later authorize a different route.
      await this.repository.transaction(async tx => {
        await this.repository.member(org, actor, true, tx);
        const digest = subscriptionHash({kind: 'subscription', connectionId: existing.connectionId});
        const receipt = await tx.videoRouteIntent.upsert({where: {organizationId_intentId: {organizationId: org, intentId: value.intentId}},
          create: {organizationId: org, actorId: actor, intentId: value.intentId, preflightId: value.preflightId, accessDigest: digest}, update: {}});
        if (receipt.actorId !== actor || receipt.preflightId !== value.preflightId || receipt.accessDigest !== digest) return videoErrorV1('VIDEO_INTENT_MISMATCH', 409);
      });
      await this.subscriptions.dispatch(existing); return this.subscriptions.view(existing, actor);
    }
    const apiExisting = await this.apiRepository.byIntent(org, value.intentId);
    if (prior && apiExisting) return {...await this.api.get(org, apiExisting.id), access: {kind: 'api', payer: apiExisting.payer}};
    const approval = await this.approval(org, actor, value.preflightId);
    const row = await this.repository.db.videoAccessPreflight.findFirstOrThrow({where: {id: value.preflightId, organizationId: org, actorId: actor}});
    const access = approval.access as VideoAccessV2;
    if (access.kind === 'subscription') {
      const def = await this.connections.enabled(org, approval.settings.provider);
      const credential = await this.connections.token(org, actor, access.connectionId, row.generation!);
      const capabilities = await this.subscriptions.mcp.capabilities(def, credential.token, credential.assertUsable);
      if (capabilities.digest !== row.schemaDigest) return videoErrorV1('VIDEO_SCHEMA_CHANGED', 409);
    }
    const job = await this.repository.transaction(async tx => {
      await this.repository.member(org, actor, true, tx);
      const draft = await tx.videoPromptDraft.findFirst({where: {id: row.draftId, organizationId: org}});
      if (!draft || draftAccessDigest(draft) !== row.draftDigest || row.expiresAt <= this.connections.runtime.now()) return videoErrorV1('VIDEO_PREFLIGHT_STALE', 409);
      const piece = await tx.contentPiece.findFirst({where: {id: draft.pieceId, organizationId: org, archivedAt: null}});
      if (!piece || videoSourceRevisionV1(piece) !== draft.pieceRevision) return videoErrorV1('VIDEO_SOURCE_CHANGED', 409);
      const existingIntent = await tx.videoRouteIntent.findUnique({where: {organizationId_intentId: {organizationId: org, intentId: value.intentId}}});
      if (existingIntent && (existingIntent.actorId !== actor || existingIntent.preflightId !== row.id || existingIntent.accessDigest !== subscriptionHash(access))) return videoErrorV1('VIDEO_INTENT_MISMATCH', 409);
      if (!existingIntent) await tx.videoRouteIntent.create({data: {organizationId: org, actorId: actor, intentId: value.intentId, preflightId: row.id, accessDigest: subscriptionHash(access)}});
      if (access.kind !== 'subscription') return null;
      const previous = await tx.videoSubscriptionJob.findFirst({where: {preflightId: row.id, organizationId: org, actorId: actor}});
      if (previous) return previous;
      const connection = await this.repository.connection(org, actor, access.connectionId, tx);
      if (connection.generation !== row.generation || connection.perJob?.toFixed() !== approval.perJob || connection.perMonth?.toFixed() !== approval.perMonth) return videoErrorV1('VIDEO_PREFLIGHT_STALE', 409);
      assertCreditPolicy(connection, row.quote);
      const exposure = await creditExposure(tx, connection.id, this.connections.runtime.now());
      if (exposure.plus(connection.perJob!).gt(connection.perMonth!)) return videoErrorV1('VIDEO_MONTHLY_CREDIT_LIMIT_EXCEEDED', 429);
      return tx.videoSubscriptionJob.create({data: {organizationId: org, actorId: actor, pieceId: draft.pieceId, pieceRevision: draft.pieceRevision,
        draftId: draft.id, draftVersion: draft.version, preflightId: row.id, intentId: value.intentId, connectionId: connection.id,
        walletDigest: connection.walletDigest, generation: connection.generation, provider: connection.provider, unit: connection.unit,
        snapshot: json({brief: approval.brief, settings: approval.settings}), request: json(row.request), quote: json(row.quote), reserved: connection.perJob!, period: creditPeriod(this.connections.runtime.now())}});
    });
    if (job) { await this.subscriptions.dispatch(job); return this.subscriptions.view(job, actor); }
    if (access.kind !== 'api') return videoErrorV1('VIDEO_INVALID_INPUT');
    const apiPreflight = (row.request as any).apiPreflight;
    const result = await this.api.launch(org, actor, {draftId: row.draftId, version: row.draftVersion, preflightId: apiPreflight.preflightId, intentId: value.intentId});
    return {...result, access};
  }
  async list(org: string, actor: string, pieceId?: string) {
    await this.repository.member(org, actor, false);
    const [api, subscription, manual] = await Promise.all([this.api.list(org, pieceId),
      this.repository.db.videoSubscriptionJob.findMany({where: {organizationId: org, ...(pieceId ? {pieceId} : {})}, orderBy: {createdAt: 'desc'}, take: 50}),
      this.repository.db.videoManualAttachment.findMany({where: {organizationId: org, ...(pieceId ? {pieceId} : {})}, orderBy: {createdAt: 'desc'}, take: 50})]);
    return [...api.map(j => ({...j, access: {kind: 'api'}})), ...await Promise.all(subscription.map(j => this.subscriptions.view(j, actor))),
      ...await Promise.all(manual.map(j => this.manualView(j)))].sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
  async get(org: string, actor: string, id: string) {
    await this.repository.member(org, actor, false);
    const sub = await this.repository.db.videoSubscriptionJob.findFirst({where: {id, organizationId: org}});
    if (sub) return this.subscriptions.view(sub, actor);
    const manual = await this.repository.db.videoManualAttachment.findFirst({where: {id, organizationId: org}});
    if (manual) return this.manualView(manual);
    return {...await this.api.get(org, id), access: {kind: 'api'}};
  }
  async action(org: string, actor: string, id: string, action: string) {
    await this.repository.member(org, actor);
    const sub = await this.repository.db.videoSubscriptionJob.findFirst({where: {id, organizationId: org}});
    if (sub) return this.subscriptions.action(org, actor, id, action);
    if (action === 'cancel') return {...await this.api.cancel(org, actor, id), access: {kind: 'api'}};
    if (action === 'retry-save') return {...await this.api.retrySave(org, actor, id), access: {kind: 'api'}};
    return videoErrorV1('VIDEO_ACTION_UNAVAILABLE', 409);
  }
  private async manualView(row: any) { return {id: row.id, draftId: row.draftId, pieceId: row.pieceId, state: 'completed', access: {kind: 'manual'}, snapshot: row.snapshot,
    cost: {amount: null as string | null, unit: null as string | null, certainty: 'external_unknown'}, result: await this.apiRepository.media(row.organizationId, row.mediaId), createdAt: row.createdAt}; }
  async attach(org: string, actor: string, input: unknown) {
    await this.repository.member(org, actor);
    const value = parseVideoV1(ManualInput, input); const draft = await this.currentDraft(org, value.draftId, value.version);
    const media = await this.apiRepository.media(org, value.mediaId);
    if (!media) return videoErrorV1('VIDEO_OWNED_FILE_UNAVAILABLE', 404);
    const bytes = await this.media.readOwned(media.path); await assertMp4VideoV1(bytes);
    const row = await this.repository.transaction(async tx => {
      await this.repository.member(org, actor, true, tx);
      const current = await tx.videoPromptDraft.findFirst({where: {id: value.draftId, organizationId: org, version: value.version}});
      const owned = await tx.media.findFirst({where: {id: value.mediaId, organizationId: org, deletedAt: null}});
      if (!current || !owned) return videoErrorV1('VIDEO_DRAFT_CHANGED', 409);
      const piece = await tx.contentPiece.findFirst({where: {id: current.pieceId, organizationId: org, archivedAt: null}});
      if (!piece || videoSourceRevisionV1(piece) !== current.pieceRevision) return videoErrorV1('VIDEO_SOURCE_CHANGED', 409);
      // The legacy uploader defaults Media.type to image. Establish video type from validated bytes, never a filename or client claim.
      await tx.media.updateMany({where: {id: owned.id, organizationId: org, deletedAt: null}, data: {type: 'video', fileSize: bytes.length}});
      return tx.videoManualAttachment.upsert({where: {organizationId_draftId_draftVersion_mediaId: {organizationId: org, draftId: value.draftId, draftVersion: value.version, mediaId: value.mediaId}},
        create: {organizationId: org, actorId: actor, pieceId: draft.pieceId, pieceRevision: draft.pieceRevision, draftId: draft.id, draftVersion: draft.version, mediaId: media.id, snapshot: json({brief: draft.brief, settings: draft.settings})}, update: {}});
    });
    return this.manualView(row);
  }
  async download(org: string, actor: string, id: string) {
    const job = await this.get(org, actor, id);
    if (!job.result || job.state !== 'completed') return videoErrorV1('VIDEO_OWNED_FILE_UNAVAILABLE', 404);
    return {name: `video-${id}.mp4`, bytes: await this.media.readOwned(job.result.path)};
  }
}
