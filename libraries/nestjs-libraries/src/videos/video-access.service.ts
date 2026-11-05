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
import { subscriptionHash, SubscriptionProvider, personalVideoOperations } from './subscriptions/video-provider-registry';
import { assertCreditPolicy, creditExposure, creditPeriod } from './subscriptions/video-credit-policy';
import { parseVideoV1, videoErrorV1, videoSettingsV1, validateVideoGroundingV1, videoSourceRevisionV1 } from './video-brief.v1';
import { VideoMediaV1, assertMp4VideoV1 } from './video-media.v1';
import { assertResolvedSourceArtifactCurrentV1, assertSourceArtifactBindingV1 } from '../content-intelligence/social-factory/source-artifact.repository';
import type { VideoPersonalAssetsV1, VideoPersonalReadinessV1, VideoPersonalQualificationV1, VideoPersonalOperationInputV1, VideoPersonalOperationPreparationV1 } from './video-personal-subscription.v1';
import { isOrganizationAdmin } from '../user/organization.roles';
import type { VideoBriefV1 } from './video-brief.v1';

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
  async assets(org: string, actor: string, connectionId: string): Promise<VideoPersonalAssetsV1> {
    const credential = await this.connections.token(org, actor, connectionId, undefined, 'discovery');
    const provider = credential.connection.provider as SubscriptionProvider;
    const def = await this.connections.connectable(org, provider);
    const base: VideoPersonalAssetsV1 = {avatars: [], voices: [], engines: [], ownedOnly: true, accountGeneration: credential.connection.generation,
      status: 'unavailable', blockers: [], guidance: provider === 'heygen' ? {avatar: {url: 'https://app.heygen.com/', requiresConsent: true}, voice: {url: 'https://app.heygen.com/', requiresConsent: true}} : null};
    if (credential.connection.state !== 'connected' || credential.connection.walletDigest.startsWith('unverified:') || !def.identityEndpoint) return {...base, status: 'discovery_required', blockers: ['VIDEO_WALLET_IDENTITY_UNVERIFIED']};
    if (provider !== 'heygen') return {...base, blockers: ['VIDEO_SUBSCRIPTION_OPERATION_UNAVAILABLE']};
    try {
      const owned = await this.subscriptions.heygen.ownedAssets(def, credential.token, credential.assertUsable, credential.connection.walletDigest);
      const blockers = [...(!owned.avatars.length ? ['VIDEO_OWNED_AVATAR_UNAVAILABLE'] : []), ...(!owned.voices.length ? ['VIDEO_OWNED_VOICE_UNAVAILABLE'] : [])];
      return {...base, ...owned, engines: [...new Set(owned.avatars.flatMap(a => a.engines))], status: blockers.length ? 'needs_owned_assets' : 'ready', blockers};
    } catch (error: any) {
      const code = error?.getResponse?.()?.code;
      if (['VIDEO_REAUTH_REQUIRED', 'VIDEO_CONNECTION_CHANGED', 'VIDEO_ACCESS_DENIED', 'VIDEO_CONNECTION_UNAVAILABLE'].includes(code)) throw error;
      return {...base, blockers: [typeof code === 'string' && /^VIDEO_[A-Z0-9_]+$/.test(code) ? code : 'VIDEO_MCP_UNAVAILABLE']};
    }
  }
  /** Non-generating inspection; tools/list cannot promote an unknown schema to a profile. */
  async personalReadiness(org: string, actor: string, connectionId: string): Promise<VideoPersonalReadinessV1> {
    const credential = await this.connections.token(org, actor, connectionId, undefined, 'discovery');
    const connection = credential.connection;
    const def = await this.connections.connectable(org, connection.provider as SubscriptionProvider);
    const walletVerified = connection.state === 'connected' && !connection.walletDigest.startsWith('unverified:') && !!def.identityEndpoint;
    const common: string[] = [];
    if (!walletVerified) common.push('VIDEO_WALLET_IDENTITY_UNVERIFIED');
    let schema = {digest: null as string | null, reviewed: false, observedToolNames: [] as string[]};
    let names: string[] = [];
    try {
      const discovered = await this.subscriptions.mcp.discover(def, credential.token, credential.assertUsable);
      schema = {digest: discovered.digest, reviewed: discovered.reviewed,
        observedToolNames: discovered.inventory.map(t => t.name).filter(n => /^[A-Za-z0-9_.-]{1,128}$/.test(n))};
      names = discovered.tools.map(t => t.name);
    } catch (error: any) {
      const code = error?.getResponse?.()?.code;
      if (['VIDEO_REAUTH_REQUIRED', 'VIDEO_CONNECTION_CHANGED', 'VIDEO_ACCESS_DENIED', 'VIDEO_CONNECTION_UNAVAILABLE'].includes(code)) throw error;
      common.push('VIDEO_MCP_UNAVAILABLE');
    }
    if (!def.enabled || !schema.reviewed) common.push('VIDEO_SCHEMA_UNSUPPORTED');
    if (!connection.perJob?.gt(0) || !connection.perMonth?.gt(0)) common.push('VIDEO_CREDIT_LIMITS_UNSET');
    const assets = walletVerified && schema.reviewed && def.provider === 'heygen' ? await this.assets(org, actor, connectionId) : null;
    const operations = personalVideoOperations.map(kind => {
      const supported = kind === (def.provider === 'heygen' ? 'presenter' : 'generated_clip');
      const blockers = [...common];
      if (!supported) blockers.push('VIDEO_SUBSCRIPTION_OPERATION_UNAVAILABLE');
      else if (def.provider === 'heygen') {
        if (assets) blockers.push(...assets.blockers);
        if (!def.ownedAssetProfile) blockers.push('VIDEO_OWNED_ASSET_PROFILE_UNVERIFIED');
        if (!['create_video', 'get_video', 'list_avatars', 'list_voices'].every(n => names.includes(n))) blockers.push('VIDEO_TOOL_UNAVAILABLE');
        if (!names.includes('quote_video')) blockers.push('VIDEO_PRICE_UNAVAILABLE');
      } else if (!['generate_clip', 'jobs_wait'].every(n => names.includes(n))) blockers.push('VIDEO_TOOL_UNAVAILABLE');
      return {kind, ready: blockers.length === 0, blockers: [...new Set(blockers)]};
    });
    return {connectionId, provider: def.provider, accountGeneration: connection.generation, walletVerified, unit: connection.unit, schema, operations};
  }
  async discoverPersonal(org: string, actor: string, connectionId: string) {
    await this.connections.discoverWallet(org, actor, connectionId);
    return this.personalReadiness(org, actor, connectionId);
  }
  /** Explicit operator export: no identity/profile/tool calls or qualification promotion. */
  async personalQualification(org: string, actor: string, connectionId: string): Promise<VideoPersonalQualificationV1> {
    const assertOperator = async () => {
      const member = await this.repository.member(org, actor);
      if (!isOrganizationAdmin(member.role)) return videoErrorV1('VIDEO_ACCESS_DENIED', 403);
    };
    await assertOperator();
    const credential = await this.connections.token(org, actor, connectionId, undefined, 'discovery', {allowRefresh: false});
    const connection = credential.connection;
    const def = await this.connections.connectable(org, connection.provider as SubscriptionProvider);
    const assertUsable = async () => {await assertOperator(); await credential.assertUsable();};
    // discover refuses paginated or oversized inventories rather than returning a partial digest.
    const discovered = await this.subscriptions.mcp.discoverQualification(def, credential.token, assertUsable);
    if (new Set(discovered.inventory.map(t => t.name)).size !== discovered.inventory.length) return videoErrorV1('VIDEO_SCHEMA_UNSUPPORTED', 409);
    await assertUsable();
    return {version: 1, purpose: 'schema_qualification', capturedAt: this.connections.runtime.now().toISOString(),
      connectionId, provider: def.provider, resource: def.resource, accountGeneration: connection.generation,
      walletVerified: connection.state === 'connected' && !connection.walletDigest.startsWith('unverified:') && !!def.identityEndpoint,
      schema: {digest: discovered.digest, reviewed: discovered.reviewed, inventory: discovered.inventory,
        complete: true, truncated: false, provenance: 'authenticated_mcp_tools_list', untrusted: true}};
  }
  async preparePersonalOperation(org: string, actor: string, input: VideoPersonalOperationInputV1): Promise<VideoPersonalOperationPreparationV1> {
    // These have their own typed, ordered production payload. A live reviewed
    // non-generating quote/workflow profile is still missing; never coerce them
    // into an API model or an arbitrary MCP tool/shell request.
    if (input.operation === 'narration' || input.operation === 'captions' || input.operation === 'final_composition') {
      await this.repository.connection(org, actor, input.connectionId);
      return videoErrorV1('VIDEO_SUBSCRIPTION_OPERATION_UNAVAILABLE', 409);
    }
    const credential = await this.connections.token(org, actor, input.connectionId);
    const provider = credential.connection.provider as SubscriptionProvider;
    if (input.operation !== (provider === 'heygen' ? 'presenter' : 'generated_clip')) return videoErrorV1('VIDEO_SUBSCRIPTION_OPERATION_UNAVAILABLE', 409);
    const settings = videoSettingsV1(input.settings); const brief = input.brief as VideoBriefV1;
    if (settings.provider !== provider) return videoErrorV1('VIDEO_PROVIDER_MODE_MISMATCH');
    if (!brief || !Array.isArray(brief.referenceMediaIds) || !Array.isArray(input.references) || input.references.length > 3 ||
      subscriptionHash(input.references) !== subscriptionHash(brief.referenceMediaIds)) return videoErrorV1('VIDEO_REFERENCE_NOT_FOUND', 404);
    validateVideoGroundingV1(brief, settings);
    const def = await this.connections.enabled(org, provider);
    const references = await this.apiRepository.references(org, input.references);
    if (references.length !== input.references.length) return videoErrorV1('VIDEO_REFERENCE_NOT_FOUND', 404);
    for (const reference of references) await this.media.referenceDimensions(reference.path);
    const request = await this.subscriptions.provider(provider).prepare(def, credential.token, settings, brief, references.map(r => ({id: r.id, url: r.path})), credential.assertUsable, credential.connection.walletDigest);
    assertCreditPolicy(credential.connection, request.quote);
    await credential.assertUsable();
    return {connectionId: input.connectionId, provider, accountGeneration: credential.connection.generation, operation: input.operation, request};
  }
  private async currentDraft(org: string, actor: string, id: string, version: number) {
    const draft = await this.apiRepository.draft(org, id);
    if (!draft || draft.version !== version) return videoErrorV1('VIDEO_DRAFT_CHANGED', 409);
    const piece = await this.apiRepository.piece(org, draft.pieceId);
    if (!piece || videoSourceRevisionV1(piece) !== draft.pieceRevision) return videoErrorV1('VIDEO_SOURCE_CHANGED', 409);
    if ((draft.brief as any)?.sourceArtifact) await this.api.assertCurrentSource(org, actor, draft);
    return draft;
  }
  async preflight(org: string, actor: string, input: unknown) {
    await this.repository.member(org, actor);
    const value = parseVideoV1(PreflightInput, input);
    if (value.access.kind === 'manual') return videoErrorV1('VIDEO_MANUAL_AWAITING_UPLOAD', 409);
    const draft = await this.currentDraft(org, actor, value.draftId, value.version);
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
      const prepared = await this.preparePersonalOperation(org, actor, {connectionId: value.access.connectionId,
        operation: settings.mode === 'presenter' ? 'presenter' : 'generated_clip', settings, brief, references: brief.referenceMediaIds});
      connection = await this.repository.connection(org, actor, value.access.connectionId);
      if (connection.generation !== prepared.accountGeneration) return videoErrorV1('VIDEO_CONNECTION_CHANGED', 409);
      request = prepared.request; quote = request.quote;
      remaining = connection.perMonth.minus(await creditExposure(this.repository.db, connection.id, this.connections.runtime.now())).toFixed();
    }
    const expiresAt = new Date(Math.min(Date.parse(quote.expiresAt), this.connections.runtime.now().getTime() + 300_000));
    const data = {organizationId: org, actorId: actor, draftId: draft.id,
      draftVersion: draft.version, draftDigest: draftAccessDigest(draft), access: json(value.access), snapshot: json({brief, settings, pieceRevision: draft.pieceRevision,
        perJob: connection?.perJob?.toFixed() ?? request.apiPreflight?.maxCostUsd?.toString() ?? null,
        perMonth: connection?.perMonth?.toFixed() ?? null, remaining}), request: json(request), quote: json(quote), connectionId: connection?.id,
      generation: connection?.generation, schemaDigest: request.schemaDigest, expiresAt};
    const row = brief.sourceArtifact ? await this.repository.transaction(async tx => {
      await assertResolvedSourceArtifactCurrentV1(tx, org, actor, brief.sourceArtifact, draft.pieceId);
      return tx.videoAccessPreflight.create({data});
    }) : await this.repository.db.videoAccessPreflight.create({data});
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
    const draft = await this.currentDraft(org, actor, row.draftId, row.draftVersion);
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
        const artifact = (existing.snapshot as any)?.brief?.sourceArtifact;
        if (artifact) {
          assertSourceArtifactBindingV1(artifact, org, actor, existing.pieceId);
          if (existing.state === 'accepted') await assertResolvedSourceArtifactCurrentV1(tx, org, actor, artifact, existing.pieceId);
        }
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
      const artifact = (draft.brief as any)?.sourceArtifact;
      if (artifact) await assertResolvedSourceArtifactCurrentV1(tx, org, actor, artifact, draft.pieceId);
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
    return [...api.map(j => ({...j, access: {kind: 'api'}})), ...await Promise.all(subscription.filter(j=>(j.request as any)?.kind!=='hgg-pilot-stage/v1').map(j => this.subscriptions.view(j, actor))),
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
    const value = parseVideoV1(ManualInput, input); const draft = await this.currentDraft(org, actor, value.draftId, value.version);
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
      const artifact = (current.brief as any)?.sourceArtifact;
      if (artifact) await assertResolvedSourceArtifactCurrentV1(tx, org, actor, artifact, current.pieceId);
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
