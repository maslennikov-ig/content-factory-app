import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { AuthService } from '@contentfactory/helpers/auth/auth.service';
import { VideoSubscriptionRepository } from '../../database/prisma/video-subscription/video-subscription.repository';
import { VideoSubscriptionRuntime, SubscriptionProvider, subscriptionHash } from './video-provider-registry';
import { VideoOAuthClient } from './video-oauth-client';
import { videoErrorV1 } from '../video-brief.v1';
import { Prisma } from '@prisma/client';
import { authenticatedSession } from '../../user/authenticated.session';

const encrypt = (v: unknown) => AuthService.fixedEncryption(JSON.stringify(v));
const decrypt = (v: string): any => JSON.parse(AuthService.fixedDecryption(v));
export const creditDecimal = (value: unknown): Prisma.Decimal => {
  if (typeof value !== 'string' || !/^\d{1,12}(?:\.\d{1,6})?$/.test(value)) return videoErrorV1('VIDEO_CREDIT_LIMIT_INVALID');
  return new Prisma.Decimal(value);
};

@Injectable()
export class VideoConnectionService {
  constructor(readonly repository: VideoSubscriptionRepository, readonly runtime: VideoSubscriptionRuntime, readonly oauth: VideoOAuthClient) {}
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
    if (!def.enabled || !policy?.enabled) return videoErrorV1('VIDEO_CONNECTION_UNAVAILABLE', 409);
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
    if (!/^\/media\?video=1(?:&(?:draftId|pieceId|jobId)=[A-Za-z0-9_-]{1,128})*$/.test(returnPath)) return videoErrorV1('VIDEO_RETURN_URL_INVALID');
    const def = await this.enabled(org, provider); const redirect = this.redirect(provider);
    const metadata = await this.oauth.metadata(def); const client = await this.registration(def, redirect, metadata);
    const state = randomBytes(32).toString('base64url');
    const result = await this.oauth.authorize(def, metadata, client, redirect, state);
    await this.repository.db.videoSubscriptionOAuthAttempt.create({data: {stateHash: subscriptionHash(state), actorId: actor, organizationId: org,
      provider, issuer: def.issuer, resource: def.resource, redirectUri: redirect, returnPath, sessionDigest: authenticatedSession()?.digest ?? subscriptionHash(actor), encryptedVerifier: encrypt(result.codeVerifier), expiresAt: new Date(this.runtime.now().getTime() + 600_000)}});
    return {authorizationUrl: result.authorizationUrl.href};
  }
  async callback(org: string, actor: string, provider: SubscriptionProvider, query: {state?: string; code?: string; error?: string; iss?: string}) {
    if (!query.state || query.state.length > 512 || (query.code?.length ?? 0) > 4096) return videoErrorV1('VIDEO_OAUTH_ATTEMPT_INVALID');
    const row = await this.repository.db.videoSubscriptionOAuthAttempt.findFirst({where: {stateHash: subscriptionHash(query.state), organizationId: org, actorId: actor}});
    if (!row || row.actorId !== actor || row.organizationId !== org || row.sessionDigest !== (authenticatedSession()?.digest ?? subscriptionHash(actor)) || row.provider !== provider || row.consumedAt || row.expiresAt <= this.runtime.now()) return videoErrorV1('VIDEO_OAUTH_ATTEMPT_INVALID', 409);
    const consumed = await this.repository.db.videoSubscriptionOAuthAttempt.updateMany({where: {id: row.id, organizationId: org, actorId: actor, consumedAt: null}, data: {consumedAt: this.runtime.now(), encryptedVerifier: ''}});
    if (!consumed.count) return videoErrorV1('VIDEO_OAUTH_ATTEMPT_INVALID', 409);
    await this.repository.member(org, actor);
    const def = await this.enabled(org, provider);
    if (query.error || !query.code) return videoErrorV1('VIDEO_OAUTH_REFUSED', 409);
    if (row.issuer !== def.issuer || row.resource !== def.resource || row.redirectUri !== this.redirect(provider) || (query.iss && query.iss !== def.issuer)) return videoErrorV1('VIDEO_OAUTH_ISSUER_INVALID');
    try {
      const metadata = await this.oauth.metadata(def); const client = await this.registration(def, row.redirectUri, metadata);
      await this.repository.member(org, actor);
      const tokens = await this.oauth.exchange(def, metadata, client, row.redirectUri, query.code, decrypt(row.encryptedVerifier));
      const subject = await this.oauth.identity(def, tokens.access_token);
      const walletDigest = createHmac('sha256', process.env.JWT_SECRET!).update(`video-wallet:v1:${def.issuer}:${subject}`).digest('hex');
      const connection = await this.repository.transaction(async tx => {
        await this.repository.member(org, actor, true, tx);
        const old = await tx.videoSubscriptionConnection.findUnique({where: {provider_walletDigest: {provider, walletDigest}}});
        if (old && old.ownerId !== actor) return videoErrorV1('VIDEO_WALLET_UNAVAILABLE', 409);
        const connection = old ? await tx.videoSubscriptionConnection.update({where: {id: old.id}, data: {state: 'connected', encryptedTokens: encrypt(tokens), generation: {increment: 1}, tokenVersion: {increment: 1}, refreshOwner: null, refreshUntil: null,
          expiresAt: new Date(this.runtime.now().getTime() + (tokens.expires_in ?? 300) * 1000)}})
          : await tx.videoSubscriptionConnection.create({data: {ownerId: actor, provider, issuer: def.issuer, resource: def.resource, walletDigest,
            encryptedTokens: encrypt(tokens), expiresAt: new Date(this.runtime.now().getTime() + (tokens.expires_in ?? 300) * 1000), unit: `${provider}_credit`}});
        await tx.videoSubscriptionGrant.upsert({where: {connectionId_organizationId: {connectionId: connection.id, organizationId: org}}, create: {connectionId: connection.id, organizationId: org}, update: {enabled: true}});
        return connection;
      });
      return {connectionId: connection.id, returnPath: row.returnPath};
    } catch (error: any) {
      const code = error?.getResponse?.()?.code;
      if (['VIDEO_WALLET_UNAVAILABLE', 'VIDEO_ACCESS_DENIED', 'VIDEO_WALLET_IDENTITY_UNVERIFIED'].includes(code)) throw error;
      return videoErrorV1('VIDEO_CONNECTION_UNAVAILABLE', 409);
    }
  }
  async list(org: string, actor: string) {
    await this.repository.member(org, actor, false);
    const grants = await this.repository.db.videoSubscriptionGrant.findMany({where: {organizationId: org}});
    const rows = await this.repository.db.videoSubscriptionConnection.findMany({where: {ownerId: actor}});
    const workspaceEnabled = (await this.repository.db.videoSubscriptionWorkspacePolicy.findUnique({where: {organizationId: org}}))?.enabled === true;
    return {workspaceEnabled, providers: (['higgsfield', 'heygen'] as const).map(provider => ({provider, enabled: this.runtime.definition(provider).enabled && workspaceEnabled, trial: provider === 'heygen'})),
      connections: rows.map(r => ({id: r.id, provider: r.provider, state: r.state, generation: r.generation, unit: r.unit, perJob: r.perJob?.toFixed() ?? null, perMonth: r.perMonth?.toFixed() ?? null,
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
  async token(org: string, actor: string, id: string, generation?: number): Promise<{token: string; connection: any; assertUsable: () => Promise<void>}> {
    for (let step = 0; step < 60; step++) {
      const row = await this.repository.connection(org, actor, id);
      if (generation !== undefined && row.generation !== generation) return videoErrorV1('VIDEO_CONNECTION_CHANGED', 409);
      if (!row.encryptedTokens) return videoErrorV1('VIDEO_REAUTH_REQUIRED', 409);
      const def = this.runtime.definition(row.provider as SubscriptionProvider);
      if (row.issuer !== def.issuer || row.resource !== def.resource) return videoErrorV1('VIDEO_OAUTH_ISSUER_INVALID');
      const tokens = decrypt(row.encryptedTokens);
      if (row.expiresAt && row.expiresAt.getTime() > this.runtime.now().getTime() + 30_000) return {token: tokens.access_token, connection: row,
        assertUsable: async () => {
          const current = await this.repository.connection(org, actor, id);
          if (current.generation !== row.generation) return videoErrorV1('VIDEO_CONNECTION_CHANGED', 409);
          if (current.tokenVersion !== row.tokenVersion || !current.encryptedTokens) return videoErrorV1('VIDEO_REAUTH_REQUIRED', 409);
        }};
      if (!tokens.refresh_token) return videoErrorV1('VIDEO_REAUTH_REQUIRED', 409);
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
