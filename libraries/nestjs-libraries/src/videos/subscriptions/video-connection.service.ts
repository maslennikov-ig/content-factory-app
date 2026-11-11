import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { AuthService } from '@contentfactory/helpers/auth/auth.service';
import { VideoSubscriptionRepository } from '../../database/prisma/video-subscription/video-subscription.repository';
import { VideoSubscriptionRuntime, SubscriptionProvider, subscriptionHash } from './video-provider-registry';
import { VideoOAuthClient } from './video-oauth-client';
import { videoErrorV1 } from '../video-brief.v1';
import { Prisma } from '@prisma/client';
import { authenticatedSession } from '../../user/authenticated.session';
import { VIDEO_SUBSCRIPTION_RETURN_CONTEXT, VIDEO_OAUTH_DEFAULT_RETURN, VideoSubscriptionReturnContextV1, VideoOAuthReturnErrorV1 } from './video-return-context.v1';

const encrypt = (v: unknown) => AuthService.fixedEncryption(JSON.stringify(v));
const decrypt = (v: string): any => JSON.parse(AuthService.fixedDecryption(v));
export const creditDecimal = (value: unknown): Prisma.Decimal => {
  if (typeof value !== 'string' || !/^\d{1,12}(?:\.\d{1,6})?$/.test(value)) return videoErrorV1('VIDEO_CREDIT_LIMIT_INVALID');
  return new Prisma.Decimal(value);
};

@Injectable()
export class VideoConnectionService {
  private readonly callbackPaths = new WeakMap<object, string>();
  constructor(readonly repository: VideoSubscriptionRepository, readonly runtime: VideoSubscriptionRuntime, readonly oauth: VideoOAuthClient,
    @Optional() @Inject(VIDEO_SUBSCRIPTION_RETURN_CONTEXT) readonly returnContext?: VideoSubscriptionReturnContextV1) {}
  private async validateReturnPath(org: string, actor: string, path: string) {
    if (typeof path !== 'string' || path.length > 1024) return videoErrorV1('VIDEO_RETURN_URL_INVALID');
    if (path === '/third-party') return path;
    const chat = /^\/agents\/([A-Za-z0-9_-]{1,128})\?videoDraftId=([A-Za-z0-9_-]{1,128})(?:&pieceId=([A-Za-z0-9_-]{1,128}))?(?:&videoJobId=([A-Za-z0-9_-]{1,128}))?$/.exec(path);
    if (!chat && !/^\/media\?video=1(?:&(?:draftId|pieceId|jobId)=[A-Za-z0-9_-]{1,128})*$/.test(path)) return videoErrorV1('VIDEO_RETURN_URL_INVALID');
    const params = new URLSearchParams(path.slice(path.indexOf('?') + 1));
    if (new Set(params.keys()).size !== [...params.keys()].length) return videoErrorV1('VIDEO_RETURN_URL_INVALID');
    if (chat) {
      if (!this.returnContext || !await this.returnContext.ownThread({organizationId: org, userId: actor}, chat[1])) return videoErrorV1('VIDEO_RETURN_CONTEXT_UNAVAILABLE', 409);
    }
    const draftId = chat ? chat[2] : params.get('draftId');
    const pieceId = chat ? chat[3] : params.get('pieceId');
    const jobId = chat ? chat[4] : params.get('jobId');
    const draft = draftId ? await this.repository.db.videoPromptDraft.findFirst({where: {id: draftId, organizationId: org, userId: actor}}) : null;
    if (draftId && !draft) return videoErrorV1('VIDEO_RETURN_CONTEXT_UNAVAILABLE', 409);
    const piece = pieceId || draft?.pieceId;
    if (piece) {
      if ((draft && piece !== draft.pieceId) || !await this.repository.db.contentPiece.findFirst({where: {id: piece, organizationId: org, archivedAt: null}, select: {id: true}})) return videoErrorV1('VIDEO_RETURN_CONTEXT_UNAVAILABLE', 409);
    }
    if (jobId) {
      const job = await this.repository.db.videoSubscriptionJob.findFirst({where: {id: jobId, organizationId: org, actorId: actor}})
        ?? await this.repository.db.videoGenerationJob.findFirst({where: {id: jobId, organizationId: org, userId: actor}})
        ?? await this.repository.db.videoManualAttachment.findFirst({where: {id: jobId, organizationId: org, actorId: actor}});
      if (!job || (draft && job.draftId !== draft.id) || (piece && job.pieceId !== piece)) return videoErrorV1('VIDEO_RETURN_CONTEXT_UNAVAILABLE', 409);
    }
    return path;
  }
  /** Only errors bound inside this service to a consumed, authorized attempt may restore context. */
  async callbackFailurePath(org: string, actor: string, error: unknown) {
    let path = VIDEO_OAUTH_DEFAULT_RETURN;
    const candidate = error && typeof error === 'object' ? this.callbackPaths.get(error) : undefined;
    if (candidate) {
      this.callbackPaths.delete(error as object);
      try { await this.repository.member(org, actor); path = await this.validateReturnPath(org, actor, candidate); } catch { /* Lost scope uses the neutral media route. */ }
    }
    const code: VideoOAuthReturnErrorV1 = (error as any)?.getResponse?.()?.code === 'VIDEO_OAUTH_REFUSED' ? 'VIDEO_OAUTH_REFUSED' : 'VIDEO_CONNECTION_UNAVAILABLE';
    return `${path}${path.includes('?') ? '&' : '?'}connectionError=${code}`;
  }
  frontendDestination(path: string) {
    try {
      const base = new URL(process.env.FRONTEND_URL!);
      if (!['https:', 'http:'].includes(base.protocol) || base.username || base.password || base.search || base.hash || !path.startsWith('/') || path.startsWith('//')) throw new Error();
      return `${base.href.replace(/\/+$/, '')}${path}`;
    } catch { return videoErrorV1('VIDEO_CONNECTION_UNAVAILABLE', 409); }
  }
  private redirect(provider: SubscriptionProvider) {
    try {
      const base = new URL(process.env.NEXT_PUBLIC_BACKEND_URL!);
      if (!['https:', 'http:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw new Error();
      return `${base.href.replace(/\/+$/, '')}/media/video-connections/${provider}/callback`;
    } catch { return videoErrorV1('VIDEO_CONNECTION_UNAVAILABLE', 409); }
  }
  async enabled(org: string, provider: SubscriptionProvider) {
    const def = this.runtime.definition(provider);
    const policy = await this.repository.db.videoSubscriptionWorkspacePolicy.findUnique({where: {organizationId: org}});
    if (!def.enabled || !def.schemaDigests.length || !def.identityEndpoint || !policy?.enabled) return videoErrorV1('VIDEO_CONNECTION_UNAVAILABLE', 409);
    return def;
  }
  async connectable(org: string, provider: SubscriptionProvider) {
    const def = this.runtime.definition(provider);
    const policy = await this.repository.db.videoSubscriptionWorkspacePolicy.findUnique({where: {organizationId: org}});
    if (!(def.connectEnabled ?? def.enabled) || !policy?.enabled) return videoErrorV1('VIDEO_CONNECTION_UNAVAILABLE', 409);
    return def;
  }
  async workspacePolicy(org: string, actor: string, enabled: boolean) {
    const member = await this.repository.member(org, actor);
    if (!['ADMIN', 'SUPERADMIN'].includes(member.role)) return videoErrorV1('VIDEO_ACCESS_DENIED', 403);
    if (typeof enabled !== 'boolean') return videoErrorV1('VIDEO_INVALID_INPUT');
    return this.repository.db.videoSubscriptionWorkspacePolicy.upsert({where: {organizationId: org}, create: {organizationId: org, enabled}, update: {enabled}});
  }
  private async registration(def: ReturnType<VideoSubscriptionRuntime['definition']>, redirect: string, metadata: any) {
    const id = subscriptionHash([def.issuer, redirect]); const owner = randomUUID();
    await this.repository.db.videoSubscriptionRegistration.upsert({where: {id}, create: {id, issuer: def.issuer, redirectUri: redirect}, update: {}});
    for (let step = 0; step < 40; step++) {
      const row = await this.repository.db.videoSubscriptionRegistration.findUniqueOrThrow({where: {id}});
      if (row.encryptedClient) return decrypt(row.encryptedClient);
      const claimed = await this.repository.db.videoSubscriptionRegistration.updateMany({where: {id, encryptedClient: null, OR: [{leaseUntil: null}, {leaseUntil: {lt: this.runtime.now()}}]}, data: {leaseOwner: owner, leaseUntil: new Date(this.runtime.now().getTime() + 60_000)}});
      if (claimed.count) {
        try {
          const client = {...await this.oauth.registration(def, metadata, redirect), issuer: def.issuer};
          const stored = await this.repository.db.videoSubscriptionRegistration.updateMany({where: {id, leaseOwner: owner}, data: {encryptedClient: encrypt(client), leaseOwner: null, leaseUntil: null}});
          if (!stored.count) return videoErrorV1('VIDEO_CONNECTION_UNAVAILABLE', 409);
          return client;
        } catch { return videoErrorV1('VIDEO_CONNECTION_UNAVAILABLE', 409); }
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    return videoErrorV1('VIDEO_CONNECTION_BUSY', 409);
  }
  async start(org: string, actor: string, provider: SubscriptionProvider, returnPath = '/media?video=1') {
    await this.repository.member(org, actor);
    await this.validateReturnPath(org, actor, returnPath);
    const def = await this.connectable(org, provider); const redirect = this.redirect(provider);
    const metadata = await this.oauth.metadata(def); const client = await this.registration(def, redirect, metadata);
    const state = randomBytes(32).toString('base64url');
    const result = await this.oauth.authorize(def, metadata, client, redirect, state);
    await this.repository.db.videoSubscriptionOAuthAttempt.create({data: {stateHash: subscriptionHash(state), actorId: actor, organizationId: org,
      provider, issuer: def.issuer, resource: def.resource, redirectUri: redirect, returnPath, sessionDigest: authenticatedSession()?.digest ?? subscriptionHash(actor), encryptedVerifier: encrypt(result.codeVerifier), expiresAt: new Date(this.runtime.now().getTime() + 600_000)}});
    return {authorizationUrl: result.authorizationUrl.href};
  }
  async callback(org: string, actor: string, provider: SubscriptionProvider, query: {state?: string; code?: string; error?: string; iss?: string}) {
    if (typeof query.state !== 'string' || !query.state || query.state.length > 512 ||
      (query.code !== undefined && (typeof query.code !== 'string' || query.code.length > 4096)) ||
      (query.error !== undefined && (typeof query.error !== 'string' || query.error.length > 256)) ||
      (query.iss !== undefined && (typeof query.iss !== 'string' || query.iss.length > 2048))) return videoErrorV1('VIDEO_OAUTH_ATTEMPT_INVALID');
    const row = await this.repository.db.videoSubscriptionOAuthAttempt.findFirst({where: {stateHash: subscriptionHash(query.state), organizationId: org, actorId: actor}});
    if (!row || row.actorId !== actor || row.organizationId !== org || row.sessionDigest !== (authenticatedSession()?.digest ?? subscriptionHash(actor)) || row.provider !== provider || row.consumedAt || row.expiresAt <= this.runtime.now()) return videoErrorV1('VIDEO_OAUTH_ATTEMPT_INVALID', 409);
    const consumed = await this.repository.db.videoSubscriptionOAuthAttempt.updateMany({where: {id: row.id, organizationId: org, actorId: actor, consumedAt: null}, data: {consumedAt: this.runtime.now(), encryptedVerifier: ''}});
    if (!consumed.count) return videoErrorV1('VIDEO_OAUTH_ATTEMPT_INVALID', 409);
    let boundPath: string | undefined;
    try {
      await this.repository.member(org, actor);
      boundPath = await this.validateReturnPath(org, actor, row.returnPath);
      const def = await this.connectable(org, provider);
      if (query.error || !query.code) return videoErrorV1('VIDEO_OAUTH_REFUSED', 409);
      if (row.issuer !== def.issuer || row.resource !== def.resource || row.redirectUri !== this.redirect(provider) || (query.iss && query.iss !== def.issuer)) return videoErrorV1('VIDEO_OAUTH_ISSUER_INVALID');
      try {
        const metadata = await this.oauth.metadata(def); const client = await this.registration(def, row.redirectUri, metadata);
        await this.repository.member(org, actor);
        const tokens = await this.oauth.exchange(def, metadata, client, row.redirectUri, query.code, decrypt(row.encryptedVerifier));
        // An authorization is useful for read-only discovery before a wallet profile
        // exists. Its reserved namespace is never accepted by billing or normal token().
        // A configured identity endpoint that rejects must still fail closed.
        const subject = def.identityEndpoint ? await this.oauth.identity(def, tokens.access_token) : null;
        const walletDigest = subject === null ? `unverified:${randomUUID()}`
          : createHmac('sha256', process.env.JWT_SECRET!).update(`video-wallet:v1:${def.issuer}:${subject}`).digest('hex');
        const state = subject === null ? 'discovery_required' : 'connected';
        const connection = await this.repository.transaction(async tx => {
          await this.repository.member(org, actor, true, tx);
          const old = await tx.videoSubscriptionConnection.findUnique({where: {provider_walletDigest: {provider, walletDigest}}});
          if (old && old.ownerId !== actor) return videoErrorV1('VIDEO_WALLET_UNAVAILABLE', 409);
          const connection = old ? await tx.videoSubscriptionConnection.update({where: {id: old.id}, data: {state, encryptedTokens: encrypt(tokens), generation: {increment: 1}, tokenVersion: {increment: 1}, refreshOwner: null, refreshUntil: null,
            expiresAt: new Date(this.runtime.now().getTime() + (tokens.expires_in ?? 300) * 1000)}})
            : await tx.videoSubscriptionConnection.create({data: {ownerId: actor, provider, issuer: def.issuer, resource: def.resource, walletDigest, state,
              encryptedTokens: encrypt(tokens), expiresAt: new Date(this.runtime.now().getTime() + (tokens.expires_in ?? 300) * 1000), unit: `${provider}_credit`}});
          await tx.videoSubscriptionGrant.upsert({where: {connectionId_organizationId: {connectionId: connection.id, organizationId: org}}, create: {connectionId: connection.id, organizationId: org}, update: {enabled: true}});
          // Only this workspace's provisional authorization is being replaced.
          // Another workspace may be inspecting a different account of the same owner.
          const scoped = await tx.videoSubscriptionGrant.findMany({where: {organizationId: org}, select: {connectionId: true}});
          await tx.videoSubscriptionConnection.updateMany({where: {ownerId: actor, provider, id: {in: scoped.map(g => g.connectionId), not: connection.id}, state: 'discovery_required'},
            data: {state: 'disconnected', encryptedTokens: null, generation: {increment: 1}, tokenVersion: {increment: 1}, refreshOwner: null, refreshUntil: null}});
          return connection;
        });
        await this.validateReturnPath(org, actor, row.returnPath);
        return {connectionId: connection.id, returnPath: row.returnPath};
      } catch (error: any) {
        const code = error?.getResponse?.()?.code;
        if (['VIDEO_WALLET_UNAVAILABLE', 'VIDEO_ACCESS_DENIED', 'VIDEO_WALLET_IDENTITY_UNVERIFIED'].includes(code)) throw error;
        return videoErrorV1('VIDEO_CONNECTION_UNAVAILABLE', 409);
      }
    } catch (error) {
      if (boundPath && error && typeof error === 'object') this.callbackPaths.set(error, boundPath);
      throw error;
    }
  }
  async list(org: string, actor: string) {
    await this.repository.member(org, actor, false);
    const grants = await this.repository.db.videoSubscriptionGrant.findMany({where: {organizationId: org}});
    const rows = await this.repository.db.videoSubscriptionConnection.findMany({where: {ownerId: actor}});
    const workspaceEnabled = (await this.repository.db.videoSubscriptionWorkspacePolicy.findUnique({where: {organizationId: org}}))?.enabled === true;
    return {workspaceEnabled, providers: (['higgsfield', 'heygen'] as const).map(provider => {
      const def = this.runtime.definition(provider);
      const generationReady = workspaceEnabled && def.enabled && !!def.identityEndpoint && def.schemaDigests.length > 0;
      return {provider, enabled: generationReady, connectReady: workspaceEnabled && (def.connectEnabled ?? def.enabled), generationReady,
        nativeAvatarPreflightAvailable: workspaceEnabled && provider === 'heygen' && def.ownedAssetReadProfile === 'heygen_private_catalog_v1',
        blockers: [...(!workspaceEnabled ? ['VIDEO_WORKSPACE_SUBSCRIPTION_DISABLED'] : []), ...(!def.identityEndpoint ? ['VIDEO_WALLET_IDENTITY_UNVERIFIED'] : []), ...(!def.enabled || !def.schemaDigests.length ? ['VIDEO_SCHEMA_UNSUPPORTED'] : [])], trial: provider === 'heygen'};
    }),
      connections: rows.map(r => ({id: r.id, provider: r.provider, state: r.state, generation: r.generation, unit: r.unit, perJob: r.perJob?.toFixed() ?? null, perMonth: r.perMonth?.toFixed() ?? null,
        walletVerified: r.state === 'connected' && !r.walletDigest.startsWith('unverified:'),
        workspaceGranted: grants.find(g => g.connectionId === r.id)?.enabled === true, balance: null}))};
  }
  async grant(org: string, actor: string, id: string) {
    await this.repository.member(org, actor); const row = await this.repository.db.videoSubscriptionConnection.findFirst({where: {id, ownerId: actor, state: 'connected'}});
    if (!row) return videoErrorV1('VIDEO_CONNECTION_UNAVAILABLE', 409);
    await this.repository.db.videoSubscriptionGrant.upsert({where: {connectionId_organizationId: {connectionId: id, organizationId: org}}, create: {connectionId: id, organizationId: org}, update: {enabled: true}});
    return this.list(org, actor);
  }
  async limits(org: string, actor: string, id: string, perJob: string, perMonth: string) {
    await this.repository.connection(org, actor, id);
    const job = creditDecimal(perJob), month = creditDecimal(perMonth);
    if (job.lte(0) || month.lte(0)) return videoErrorV1('VIDEO_CREDIT_LIMIT_INVALID');
    await this.repository.db.videoSubscriptionConnection.update({where: {id}, data: {perJob: job, perMonth: month}});
    return this.list(org, actor);
  }
  async disconnect(org: string, actor: string, id: string) {
    const row = await this.repository.connection(org, actor, id, this.repository.db, false);
    await this.repository.transaction(async tx => {
      await tx.videoSubscriptionConnection.update({where: {id}, data: {state: 'disconnected', encryptedTokens: null, generation: {increment: 1}, tokenVersion: {increment: 1}, refreshOwner: null, refreshUntil: null}});
      await tx.videoSubscriptionGrant.updateMany({where: {connectionId: id}, data: {enabled: false}});
    });
    const def = this.runtime.definition(row.provider as SubscriptionProvider);
    try {
      const metadata = await this.oauth.metadata(def);
      if (metadata.revocation_endpoint && row.encryptedTokens) {
        const token = decrypt(row.encryptedTokens);
        await this.runtime.fetch(def, metadata.revocation_endpoint, {method: 'POST', body: new URLSearchParams({token: token.refresh_token || token.access_token})});
      }
    } catch { /* The local fence already holds; revocation is best effort. */ }
    return {state: 'disconnected', remoteCancellation: 'unknown'};
  }
  async discoverWallet(org: string, actor: string, id: string) {
    const credential = await this.token(org, actor, id, undefined, 'discovery');
    const def = await this.connectable(org, credential.connection.provider as SubscriptionProvider);
    if (credential.connection.state !== 'discovery_required' || !def.identityEndpoint) return;
    await credential.assertUsable();
    const subject = await this.oauth.identity(def, credential.token);
    const walletDigest = createHmac('sha256', process.env.JWT_SECRET!).update(`video-wallet:v1:${def.issuer}:${subject}`).digest('hex');
    await this.repository.transaction(async tx => {
      const current = await this.repository.connection(org, actor, id, tx, false);
      if (current.state !== 'discovery_required' || current.generation !== credential.connection.generation || current.tokenVersion !== credential.connection.tokenVersion) return videoErrorV1('VIDEO_CONNECTION_CHANGED', 409);
      const old = await tx.videoSubscriptionConnection.findUnique({where: {provider_walletDigest: {provider: def.provider, walletDigest}}});
      if (old && old.id !== id) return videoErrorV1(old.ownerId === actor ? 'VIDEO_WALLET_RECONNECT_REQUIRED' : 'VIDEO_WALLET_UNAVAILABLE', 409);
      await tx.videoSubscriptionConnection.updateMany({where: {id, ownerId: actor, state: 'discovery_required', generation: current.generation, tokenVersion: current.tokenVersion},
        data: {state: 'connected', walletDigest, generation: {increment: 1}}});
    });
  }
  /** Explicit, one-shot renewal of the existing Higgsfield grant. The caller holds
   * the connection context lease and supplies a transactional parent assertion. */
  async renewOwnedGrantV1(org: string, actor: string, input: {connectionId: string; accountGeneration: number; tokenVersion: number; pilotId: string; parentRevision: number}, assertParent: (tx: Prisma.TransactionClient) => Promise<void>) {
    if (authenticatedSession()?.actorId !== actor) return videoErrorV1('VIDEO_ACCESS_DENIED', 403);
    const def = await this.connectable(org, 'higgsfield');
    const redirect = this.redirect('higgsfield');
    const registrationId = subscriptionHash([def.issuer, redirect]);
    const receiptId = subscriptionHash({kind: 'hgg-same-grant-renewal/v1', connectionId: input.connectionId, generation: input.accountGeneration, tokenVersion: input.tokenVersion});
    const owner = randomUUID();
    const hasReceipt = await this.repository.transaction(async tx => {
      await this.repository.connection(org, actor, input.connectionId, tx, false);
      await assertParent(tx);
      return !!await tx.videoAccessPreflight.findUnique({where: {id: receiptId, organizationId: org, actorId: actor}});
    });
    // Metadata discovery cannot rotate a grant. Failure here must not create an
    // ambiguous dispatch receipt; completed/pending receipts need no discovery.
    const metadata = hasReceipt ? null : await this.oauth.metadata(def);
    const claim = await this.repository.transaction(async tx => {
      const row = await this.repository.connection(org, actor, input.connectionId, tx, false);
      await assertParent(tx);
      const receipt = await tx.videoAccessPreflight.findUnique({where: {id: receiptId, organizationId: org, actorId: actor}});
      if (receipt) {
        const saved = receipt.snapshot as any;
        if (receipt.actorId !== actor || receipt.connectionId !== input.connectionId || receipt.generation !== input.accountGeneration || saved?.kind !== 'hgg-same-grant-renewal/v1') return videoErrorV1('VIDEO_PILOT_RENEWAL_INVALID', 409);
        if (saved.state === 'completed' && row.generation === input.accountGeneration && row.tokenVersion === input.tokenVersion + 1) return {completed: true as const, receipt: saved};
        return videoErrorV1('VIDEO_PILOT_RENEWAL_UNCONFIRMED', 409);
      }
      if (row.provider !== 'higgsfield' || row.state !== 'discovery_required' || row.generation !== input.accountGeneration || row.tokenVersion !== input.tokenVersion || row.issuer !== def.issuer || row.resource !== def.resource || !row.encryptedTokens) return videoErrorV1('VIDEO_CONNECTION_CHANGED', 409);
      const active = await tx.videoSubscriptionJob.findFirst({where: {connectionId: input.connectionId, OR: [
        {state: {in: ['accepted', 'submitting', 'submission_unknown', 'queued', 'running', 'saving', 'status_delayed', 'reauth_required', 'input_changed', 'save_failed', 'access_unavailable']}},
        {state: {in: ['failed', 'canceled']}, submittedAt: {not: null}, actualCost: null},
      ]}, select: {id: true}});
      if (active) return videoErrorV1('VIDEO_PILOT_CONNECTION_BUSY', 409);
      const registered = await tx.videoSubscriptionRegistration.findUnique({where: {id: registrationId}});
      if (!registered?.encryptedClient || registered.issuer !== def.issuer || registered.redirectUri !== redirect) return videoErrorV1('VIDEO_CONNECTION_UNAVAILABLE', 409);
      const tokens = decrypt(row.encryptedTokens);
      if (typeof tokens.refresh_token !== 'string' || !tokens.refresh_token) return videoErrorV1('VIDEO_REAUTH_REQUIRED', 409);
      const locked = await tx.videoSubscriptionConnection.updateMany({where: {id: row.id, state: row.state, generation: row.generation, tokenVersion: row.tokenVersion, OR: [{refreshUntil: null}, {refreshUntil: {lt: this.runtime.now()}}]}, data: {refreshOwner: owner, refreshUntil: new Date(this.runtime.now().getTime() + 240000)}});
      if (locked.count !== 1) return videoErrorV1('VIDEO_PILOT_CONNECTION_BUSY', 409);
      const snapshot = {kind: 'hgg-same-grant-renewal/v1', state: 'pending', registrationId, fromTokenVersion: input.tokenVersion, toTokenVersion: input.tokenVersion + 1, issuer: def.issuer, resource: def.resource};
      await tx.videoAccessPreflight.create({data: {id: receiptId, organizationId: org, actorId: actor, draftId: input.pilotId, draftVersion: input.parentRevision, draftDigest: receiptId, access: {kind: snapshot.kind}, snapshot, request: {}, quote: {}, connectionId: input.connectionId, generation: input.accountGeneration, expiresAt: new Date(0)}});
      return {completed: false as const, tokens, client: decrypt(registered.encryptedClient), snapshot};
    });
    if (claim.completed) return claim.receipt;
    try {
      if (!metadata) return videoErrorV1('VIDEO_PILOT_RENEWAL_UNCONFIRMED', 409);
      const fresh = await this.oauth.refresh(def, metadata, claim.client, claim.tokens.refresh_token);
      if (!fresh?.access_token) return videoErrorV1('VIDEO_PILOT_RENEWAL_UNCONFIRMED', 409);
      const scopes = (value: string) => [...new Set(value.split(/\s+/).filter(Boolean))].sort().join(' ');
      const scopeChanged = typeof claim.tokens.scope === 'string' && typeof fresh.scope === 'string' && scopes(fresh.scope) !== scopes(claim.tokens.scope);
      const retained = {...fresh, ...(fresh.scope === undefined && typeof claim.tokens.scope === 'string' ? {scope: claim.tokens.scope} : {})};
      const receipt = await this.repository.transaction(async tx => {
        await this.repository.connection(org, actor, input.connectionId, tx, false);
        const saved = await tx.videoSubscriptionConnection.updateMany({where: {id: input.connectionId, state: 'discovery_required', generation: input.accountGeneration, tokenVersion: input.tokenVersion, refreshOwner: owner}, data: {encryptedTokens: encrypt(retained), tokenVersion: {increment: 1}, refreshOwner: null, refreshUntil: null, expiresAt: new Date(this.runtime.now().getTime() + (fresh.expires_in ?? 300) * 1000)}});
        if (saved.count !== 1) return videoErrorV1('VIDEO_PILOT_RENEWAL_UNCONFIRMED', 409);
        const result = {...claim.snapshot, state: scopeChanged ? 'scope_changed' : 'completed', observedAt: this.runtime.now().toISOString()};
        await tx.videoAccessPreflight.update({where: {id: receiptId, organizationId: org, actorId: actor}, data: {snapshot: result}});
        return result;
      });
      if (scopeChanged) return videoErrorV1('VIDEO_PILOT_RENEWAL_SCOPE_CHANGED', 409);
      return receipt;
    } catch {
      // A provider may have rotated the grant despite a lost response. Pending is
      // durable and deliberately cannot be re-dispatched automatically.
      return videoErrorV1('VIDEO_PILOT_RENEWAL_UNCONFIRMED', 409);
    }
  }
  async token(org: string, actor: string, id: string, generation?: number, purpose: 'generation' | 'discovery' | 'recovery' | 'pilot_context_v1' | 'pilot_generation_v1' | 'pilot_recovery_v1' = 'generation', options: {allowRefresh?: boolean; pilotQualificationId?: string} = {}): Promise<{token: string; connection: any; assertUsable: () => Promise<void>}> {
    const read = async () => {
      const pilot = purpose.startsWith('pilot_'), provisional = purpose === 'discovery' || pilot;
      const row = await this.repository.connection(org, actor, id, this.repository.db, !provisional);
      if (provisional) await this.connectable(org, row.provider as SubscriptionProvider);
      else if (purpose === 'generation') await this.enabled(org, row.provider as SubscriptionProvider);
      if (!['connected', ...(provisional ? ['discovery_required'] : [])].includes(row.state) ||
        (!provisional && row.walletDigest.startsWith('unverified:'))) return videoErrorV1('VIDEO_REAUTH_REQUIRED', 409);
      if (pilot && row.provider !== 'higgsfield') return videoErrorV1('VIDEO_PROVIDER_INVALID', 409);
      if (pilot && purpose !== 'pilot_context_v1') {
        const proof = options.pilotQualificationId ? await this.repository.db.videoAccessPreflight.findFirst({where: {id: options.pilotQualificationId, organizationId: org, actorId: actor, connectionId: id, generation: row.generation}}) : null;
        const context = proof?.snapshot as any;
        if (context?.kind !== 'hgg-workspace/v1' || context.state !== 'qualified' || context.binding?.tokenVersion !== row.tokenVersion ||
          context.binding?.connectionId !== id || context.binding?.accountGeneration !== row.generation ||
          purpose === 'pilot_generation_v1' && (!proof || proof.expiresAt <= this.runtime.now())) return videoErrorV1('VIDEO_PILOT_WORKSPACE_QUALIFICATION_REQUIRED', 409);
      }
      return row;
    };
    for (let step = 0; step < 60; step++) {
      const row = await read();
      if (generation !== undefined && row.generation !== generation) return videoErrorV1('VIDEO_CONNECTION_CHANGED', 409);
      if (!row.encryptedTokens) return videoErrorV1('VIDEO_REAUTH_REQUIRED', 409);
      const def = this.runtime.definition(row.provider as SubscriptionProvider);
      if (row.issuer !== def.issuer || row.resource !== def.resource) return videoErrorV1('VIDEO_OAUTH_ISSUER_INVALID');
      const tokens = decrypt(row.encryptedTokens);
      if (row.expiresAt && row.expiresAt.getTime() > this.runtime.now().getTime() + 30_000) return {token: tokens.access_token, connection: row,
        assertUsable: async () => {
          const current = await read();
          if (current.generation !== row.generation) return videoErrorV1('VIDEO_CONNECTION_CHANGED', 409);
          if (current.tokenVersion !== row.tokenVersion || !current.encryptedTokens) return videoErrorV1('VIDEO_REAUTH_REQUIRED', 409);
        }};
      if (purpose.startsWith('pilot_') || options.allowRefresh === false || !tokens.refresh_token) return videoErrorV1('VIDEO_REAUTH_REQUIRED', 409);
      // Provisional authorization never refreshes itself into a spendable identity.
      if (row.state === 'discovery_required') return videoErrorV1('VIDEO_REAUTH_REQUIRED', 409);
      const owner = randomUUID();
      const claim = await this.repository.db.videoSubscriptionConnection.updateMany({where: {id, state: 'connected', tokenVersion: row.tokenVersion, OR: [{refreshUntil: null}, {refreshUntil: {lt: this.runtime.now()}}]}, data: {refreshOwner: owner, refreshUntil: new Date(this.runtime.now().getTime() + 60_000)}});
      if (!claim.count) { await new Promise(resolve => setTimeout(resolve, 50)); continue; }
      try {
        const metadata = await this.oauth.metadata(def); const client = await this.registration(def, this.redirect(row.provider as SubscriptionProvider), metadata);
        const fenced = await this.repository.connection(org, actor, id);
        if (fenced.generation !== row.generation || fenced.tokenVersion !== row.tokenVersion || fenced.refreshOwner !== owner) return videoErrorV1('VIDEO_REAUTH_REQUIRED', 409);
        const fresh = await this.oauth.refresh(def, metadata, client, tokens.refresh_token);
        await this.repository.connection(org, actor, id);
        const saved = await this.repository.db.videoSubscriptionConnection.updateMany({where: {id, state: 'connected', generation: row.generation, tokenVersion: row.tokenVersion, refreshOwner: owner}, data: {encryptedTokens: encrypt(fresh), tokenVersion: {increment: 1}, refreshOwner: null, refreshUntil: null, expiresAt: new Date(this.runtime.now().getTime() + (fresh.expires_in ?? 300) * 1000)}});
        if (!saved.count) return videoErrorV1('VIDEO_REAUTH_REQUIRED', 409);
      } catch {
        await this.repository.db.videoSubscriptionConnection.updateMany({where: {id, refreshOwner: owner, tokenVersion: row.tokenVersion}, data: {state: 'reauth_required', refreshOwner: null, refreshUntil: null}});
        return videoErrorV1('VIDEO_REAUTH_REQUIRED', 409);
      }
    }
    return videoErrorV1('VIDEO_CONNECTION_BUSY', 409);
  }
}
