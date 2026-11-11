import { Inject, Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { SocialFactoryRepository } from '../../content-intelligence/social-factory/social-factory.repository';
import type { SocialFactoryRecordV1, SocialFactoryStoreV1 } from '../../content-intelligence/social-factory/contracts/social-factory.v1';
import { VideoConnectionService } from './video-connection.service';
import { HeygenPersonProfileServiceV1 } from './video-heygen-person-profile.service.v1';
import { videoErrorV1 } from '../video-brief.v1';
import { subscriptionHash } from './video-provider-registry';
import {
  HEYGEN_STYLE_SCHEMA_V1, HEYGEN_STYLE_TOOL_SCHEMAS_V1, heygenStyleImageUrlV1, heygenStyleRawResponseV1,
  heygenStyleRequestHashV1, heygenStyleWireArgsV1, parseHeygenStylePrepareV1, parseHeygenStyleReceiptV1,
  type HeygenStyleAdapterV1, type HeygenStyleAuthorizeV1, type HeygenStyleAuthorizationV1, type HeygenStyleChildV1,
  type HeygenStyleContextV1, type HeygenStylePayloadV1, type HeygenStyleQualificationV1, type HeygenStyleReceiptV1, type HeygenStyleViewV1, type HeygenStyleAppearanceV1,
} from './video-heygen-style.v1';

export const HEYGEN_STYLE_ADAPTER_TOKEN_V1 = 'HEYGEN_STYLE_ADAPTER_V1';
const KIND = 'heygen_style_operation' as const;
type Row = SocialFactoryRecordV1<HeygenStylePayloadV1>;
const parent = (actor: string) => `heygen-style:actor:${actor}`;
const invalid = (): never => videoErrorV1('VIDEO_STYLE_OPERATION_UNAVAILABLE', 404);
const fault = (error: unknown, fallback: string) => {
  const code = (error as any)?.response?.code;
  return typeof code === 'string' && /^VIDEO_[A-Z_]{1,100}$/.test(code) ? code : fallback;
};

/** One durable mutation attempt; recovery only reads the provider and saves retained images. */
@Injectable()
export class HeygenStyleServiceV1 {
  constructor(readonly store: SocialFactoryRepository, readonly connections: VideoConnectionService,
    readonly profiles: HeygenPersonProfileServiceV1,
    @Optional() @Inject(HEYGEN_STYLE_ADAPTER_TOKEN_V1) readonly adapter?: HeygenStyleAdapterV1) {}

  private now() { return this.connections.runtime?.now?.() ?? new Date(); }
  private async member(org: string, actor: string) {
    if (!org || !actor) return videoErrorV1('VIDEO_ACCESS_DENIED', 403);
    await this.connections.repository.member(org, actor);
  }
  private async account(org: string, actor: string, connectionId: string) {
    const row = await this.connections.repository.connection(org, actor, connectionId, this.connections.repository.db, false);
    if (row.provider !== 'heygen' || row.ownerId !== actor || row.state === 'revoked')
      return videoErrorV1('VIDEO_STYLE_ACCOUNT_UNVERIFIED', 409);
    const verified = typeof row.walletDigest === 'string' && /^[a-f0-9]{64}$/.test(row.walletDigest);
    if (this.adapter?.currentAccount) {
      const current = await this.adapter.currentAccount(org, actor, connectionId);
      if (!current || !/^[a-f0-9]{64}$/.test(current.accountDigest) || !Number.isInteger(current.accountGeneration) || current.accountGeneration !== row.generation)
        return videoErrorV1('VIDEO_STYLE_ACCOUNT_UNVERIFIED', 409);
      if (verified && current.accountDigest !== row.walletDigest) return videoErrorV1('VIDEO_STYLE_ACCOUNT_CHANGED', 409);
      return current;
    }
    if (!verified) return videoErrorV1('VIDEO_STYLE_ACCOUNT_UNVERIFIED', 409);
    return {accountDigest: row.walletDigest as string, accountGeneration: row.generation as number};
  }
  private async owned(store: SocialFactoryStoreV1, org: string, actor: string, id: string): Promise<Row> {
    const row = await store.read<HeygenStylePayloadV1>(org, KIND, id), p = row?.payload;
    if (!row || row.parentId !== parent(actor) || p?.version !== 1 || p.context?.organizationId !== org || p.context.actorId !== actor || p.context.operationId !== id ||
      p.schemaDigest !== HEYGEN_STYLE_SCHEMA_V1 || p.requestHash !== heygenStyleRequestHashV1(p.context, p.args, p.references) ||
      subscriptionHash(p.args) !== subscriptionHash(heygenStyleWireArgsV1(p.context.input, p.context.profile, p.references))) return invalid();
    return row;
  }
  private async update(org: string, actor: string, id: string, change: (payload: HeygenStylePayloadV1) => void, expectedRevision?: number): Promise<Row> {
    return this.store.transact(async store => {
      const row = await this.owned(store, org, actor, id), payload = structuredClone(row.payload);
      if (expectedRevision !== undefined && row.revision !== expectedRevision) return videoErrorV1('VIDEO_STYLE_OPERATION_CHANGED', 409);
      change(payload);
      return store.put<HeygenStylePayloadV1>({organizationId: org, kind: KIND, id, parentId: parent(actor), expectedRevision: row.revision, payload, sourceIds: []});
    });
  }
  private view(row: Row): HeygenStyleViewV1 {
    const p = row.payload, c = p.context, profile = c.profile;
    // Explicit projection excludes raw receipts, signed URLs, account digest and grant metadata.
    return structuredClone({version: 1, operationId: row.id, revision: row.revision, name: p.args.name, connectionId: c.connectionId, requestHash: p.requestHash,
      profileId: profile.profileId, profileRevision: profile.profileRevision, profileDigest: profile.profileDigest, groupId: profile.groupId, baseLookId: profile.baseLookId,
      referenceMediaIds: c.input.referenceMediaIds, prompt: p.args.prompt, aspectRatio: p.args.aspectRatio,
      state: p.state, blockers: p.blockers, attempted: !!p.attempt, actualCost: null, resultKind: 'image',
      completedCount: p.children.filter(child => child.state === 'saved').length, failedCount: p.children.filter(child => child.state === 'failed').length,
      children: p.children.map(child => ({lookId: child.lookId, groupId: child.groupId, state: child.state,
        ...(child.image ? {mediaId: child.image.mediaId, mimeType: child.image.mimeType} : {}), ...(child.blocker ? {blocker: child.blocker} : {})})),
      ...(p.selection ? {selection: p.selection} : {})});
  }
  private async current(context: HeygenStyleContextV1, requireGeneration: boolean) {
    const account = await this.account(context.organizationId, context.actorId, context.connectionId);
    if (account.accountDigest !== context.accountDigest || requireGeneration && account.accountGeneration !== context.accountGeneration)
      return videoErrorV1('VIDEO_STYLE_ACCOUNT_CHANGED', 409);
    return account;
  }
  private async currentProfile(context: HeygenStyleContextV1, trusted?: {accountDigest: string; accountGeneration: number}) {
    const {input, profile} = context;
    const current = await this.profiles.freeze(context.organizationId, context.actorId, {connectionId: context.connectionId,
      profileId: profile.profileId, groupId: profile.groupId, lookId: profile.baseLookId,
      expectedRevision: input.expectedProfileRevision, expectedDigest: input.expectedProfileDigest}, trusted ?? await this.current(context, true));
    if (subscriptionHash(current) !== subscriptionHash(profile)) return videoErrorV1('VIDEO_PROFILE_CHANGED', 409);
  }
  private qualification(context: HeygenStyleContextV1, q: HeygenStyleQualificationV1): string[] {
    if (!q || q.accountDigest !== context.accountDigest || q.accountGeneration !== context.accountGeneration)
      return videoErrorV1('VIDEO_STYLE_ACCOUNT_CHANGED', 409);
    if (q.baseLook?.lookId !== context.profile.baseLookId || q.baseLook.groupId !== context.profile.groupId || q.baseLook.ownership !== 'owned' ||
      q.baseLook.imageUsable !== true || !['accepted', 'not_required'].includes(q.baseLook.consent))
      return videoErrorV1('VIDEO_STYLE_BASE_UNAVAILABLE', 409);
    if (!Array.isArray(q.references)) return videoErrorV1('VIDEO_STYLE_REFERENCE_INVALID', 409);
    const blockers: string[] = [];
    if (subscriptionHash(q.schemaDigests) !== subscriptionHash(HEYGEN_STYLE_TOOL_SCHEMAS_V1)) blockers.push('VIDEO_STYLE_SCHEMA_CHANGED');
    if (q.entitlement !== 'available') blockers.push(q.entitlement === 'unavailable' ? 'VIDEO_STYLE_ENTITLEMENT_UNAVAILABLE' : 'VIDEO_STYLE_ENTITLEMENT_UNKNOWN');
    return blockers;
  }
  private async verifyReferences(context: HeygenStyleContextV1) {
    for (const id of context.input.referenceMediaIds) if (!await this.connections.repository.db.media.findFirst({where: {
      organizationId: context.organizationId, id, type: 'image', deletedAt: null}, select: {id: true}})) return videoErrorV1('VIDEO_STYLE_REFERENCE_INVALID', 409);
  }

  async prepare(org: string, actor: string, raw: unknown): Promise<HeygenStyleViewV1> {
    await this.member(org, actor);
    const input = parseHeygenStylePrepareV1(raw);
    const previous = await this.store.read<HeygenStylePayloadV1>(org, KIND, input.operationId);
    if (previous) {
      const owned = await this.owned(this.store, org, actor, input.operationId);
      if (subscriptionHash(owned.payload.context.input) !== subscriptionHash(input)) return videoErrorV1('VIDEO_STYLE_OPERATION_CHANGED', 409);
      return this.view(owned);
    }
    const account = await this.account(org, actor, input.connectionId);
    const profile = await this.profiles.freeze(org, actor, {connectionId: input.connectionId, profileId: input.profileId,
      groupId: input.groupId, lookId: input.baseLookId, expectedRevision: input.expectedProfileRevision, expectedDigest: input.expectedProfileDigest}, account);
    const context: HeygenStyleContextV1 = {organizationId: org, actorId: actor, operationId: input.operationId, connectionId: input.connectionId,
      ...account, profile, input};
    await this.verifyReferences(context);
    const q = this.adapter ? await this.adapter.qualify(structuredClone(context)) : null;
    const blockers = q ? this.qualification(context, q) : ['VIDEO_STYLE_ADAPTER_UNAVAILABLE'];
    const references = q?.references ?? [];
    const args = heygenStyleWireArgsV1(input, profile, references);
    const payload: HeygenStylePayloadV1 = {version: 1, context, args, references, requestHash: heygenStyleRequestHashV1(context, args, references),
      schemaDigest: HEYGEN_STYLE_SCHEMA_V1, state: 'prepared', blockers, children: [], createdAt: this.now().toISOString()};
    const row = await this.store.transact(async store => {
      await this.currentProfile(context, await this.current(context, true));
      const prior = await store.read<HeygenStylePayloadV1>(org, KIND, input.operationId);
      if (prior) {
        const owned = await this.owned(store, org, actor, input.operationId);
        if (owned.payload.requestHash !== payload.requestHash) return videoErrorV1('VIDEO_STYLE_OPERATION_CHANGED', 409);
        return owned;
      }
      return store.put<HeygenStylePayloadV1>({organizationId: org, kind: KIND, id: input.operationId, parentId: parent(actor), expectedRevision: 0, payload, sourceIds: []});
    });
    return this.view(row);
  }
  private authorization(context: HeygenStyleContextV1, requestHash: string, value: HeygenStyleAuthorizationV1) {
    if (!value || !value.decisionId || !value.scopeId || value.organizationId !== context.organizationId || value.actorId !== context.actorId ||
      value.operationId !== context.operationId || value.requestHash !== requestHash || value.connectionId !== context.connectionId ||
      value.accountDigest !== context.accountDigest || value.accountGeneration !== context.accountGeneration || value.funding !== 'personal_subscription' ||
      !Number.isFinite(Date.parse(value.expiresAt)) || Date.parse(value.expiresAt) <= this.now().getTime()) return videoErrorV1('VIDEO_STYLE_AUTHORITY_REQUIRED', 409);
  }
  async submit(org: string, actor: string, id: string, authorize: HeygenStyleAuthorizeV1): Promise<HeygenStyleViewV1> {
    await this.member(org, actor);
    let row = await this.owned(this.store, org, actor, id);
    if (row.payload.attempt) return this.view(row);
    if (!this.adapter) return videoErrorV1('VIDEO_STYLE_ADAPTER_UNAVAILABLE', 409);
    if (typeof authorize !== 'function') return videoErrorV1('VIDEO_STYLE_AUTHORITY_REQUIRED', 409);
    const {context, args, requestHash} = row.payload;
    await this.currentProfile(context, await this.current(context, true)); await this.verifyReferences(context);
    const q = await this.adapter.qualify(structuredClone(context)), blockers = this.qualification(context, q);
    if (blockers.length) {
      row = await this.update(org, actor, id, payload => {payload.blockers = blockers;});
      return this.view(row);
    }
    if (subscriptionHash(q.references) !== subscriptionHash(row.payload.references)) return videoErrorV1('VIDEO_STYLE_REFERENCE_CHANGED', 409);
    const authorization = await authorize(structuredClone({...context, args, requestHash}));
    this.authorization(context, requestHash, authorization);
    const attemptId = randomUUID();
    row = await this.update(org, actor, id, payload => {
      if (payload.attempt) return;
      payload.attempt = {id: attemptId, claimedAt: this.now().toISOString(), authorization}; payload.state = 'dispatching'; payload.blockers = [];
    });
    if (row.payload.attempt?.id !== attemptId) return this.view(row);
    let dispatched = false;
    try {
      const receipt = await this.adapter.create(structuredClone(context), structuredClone(args), {
        beforeDispatch: async () => {
          if (dispatched) return videoErrorV1('VIDEO_STYLE_DUPLICATE_DISPATCH', 409);
          await this.currentProfile(context, await this.current(context, true)); await this.verifyReferences(context);
          this.authorization(context, requestHash, authorization);
          await this.update(org, actor, id, payload => {
            if (payload.attempt?.id !== attemptId || payload.attempt.dispatchedAt) return videoErrorV1('VIDEO_STYLE_DUPLICATE_DISPATCH', 409);
            payload.attempt.dispatchedAt = this.now().toISOString();
          });
          dispatched = true;
        },
        afterResponse: async raw => {
          if (!dispatched) return videoErrorV1('VIDEO_STYLE_DISPATCH_UNVERIFIED', 409);
          const response = heygenStyleRawResponseV1(raw), hash = subscriptionHash(response);
          await this.update(org, actor, id, payload => {
            if (payload.attempt?.id !== attemptId) return invalid();
            if (payload.attempt.rawResponseHash && payload.attempt.rawResponseHash !== hash) return videoErrorV1('VIDEO_STYLE_RECEIPT_CHANGED', 409);
            payload.attempt.rawResponse = response; payload.attempt.rawResponseHash = hash;
          });
        },
      });
      if (!dispatched) return videoErrorV1('VIDEO_STYLE_DISPATCH_UNVERIFIED', 409);
      const parsed = parseHeygenStyleReceiptV1(receipt);
      await this.acceptReceipt(org, actor, id, parsed);
    } catch (error) {
      row = await this.update(org, actor, id, payload => {
        if (payload.attempt?.receipt) return;
        payload.state = 'uncertain'; payload.blockers = [fault(error, 'VIDEO_STYLE_SUBMISSION_UNCERTAIN')];
      });
      return this.view(row);
    }
    return this.recover(org, actor, id);
  }
  private async acceptReceipt(org: string, actor: string, id: string, receipt: HeygenStyleReceiptV1) {
    return this.update(org, actor, id, payload => {
      if (!payload.attempt?.dispatchedAt) return videoErrorV1('VIDEO_STYLE_DISPATCH_UNVERIFIED', 409);
      if (receipt.referenceKind === 'look' && receipt.groupId !== payload.context.profile.groupId)
        return videoErrorV1('VIDEO_STYLE_CHILD_INVALID', 409);
      if (payload.attempt.receipt && subscriptionHash(payload.attempt.receipt) !== subscriptionHash(receipt)) return videoErrorV1('VIDEO_STYLE_RECEIPT_CHANGED', 409);
      if (receipt.childLookIds.includes(payload.context.profile.baseLookId)) return videoErrorV1('VIDEO_STYLE_CHILD_INVALID', 409);
      payload.attempt.receipt = receipt; payload.state = 'submitted'; payload.blockers = [];
      for (const lookId of receipt.childLookIds) if (!payload.children.some(child => child.lookId === lookId))
        payload.children.push({lookId, groupId: payload.context.profile.groupId, state: 'queued'});
    });
  }
  async recover(org: string, actor: string, id: string): Promise<HeygenStyleViewV1> {
    await this.member(org, actor);
    let row = await this.owned(this.store, org, actor, id);
    if (!row.payload.attempt || row.payload.state === 'completed' || row.payload.state === 'failed') return this.view(row);
    if (!this.adapter) return videoErrorV1('VIDEO_STYLE_ADAPTER_UNAVAILABLE', 409);
    const context = row.payload.context;
    // Existing frozen work survives profile edits and same-account renewal; another account cannot recover it.
    await this.current(context, false);
    if (!row.payload.attempt.receipt) {
      if (!row.payload.attempt.rawResponse) return this.view(await this.update(org, actor, id, p => {p.state = 'uncertain'; p.blockers = ['VIDEO_STYLE_RECEIPT_UNKNOWN'];}));
      try {
        const receipt = parseHeygenStyleReceiptV1(this.adapter.decodeReceipt(structuredClone(row.payload.attempt.rawResponse)));
        row = await this.acceptReceipt(org, actor, id, receipt);
      } catch { return this.view(await this.update(org, actor, id, p => {p.state = 'uncertain'; p.blockers = ['VIDEO_STYLE_RECEIPT_UNKNOWN'];})); }
    }
    const receipt = row.payload.attempt!.receipt!;
    try {
      const status = await this.adapter.poll(structuredClone(context), structuredClone(receipt));
      parseHeygenStyleReceiptV1({operationId: status.operationId, childLookIds: status.childLookIds});
      if (status.operationId !== receipt.operationId || !['queued', 'running', 'completed', 'failed'].includes(status.state) ||
        status.childLookIds.includes(context.profile.baseLookId)) return videoErrorV1('VIDEO_STYLE_RECEIPT_MISMATCH', 409);
      row = await this.update(org, actor, id, payload => {
        payload.providerState = status.state; payload.state = 'collecting'; payload.blockers = [];
        for (const lookId of status.childLookIds) if (!payload.children.some(child => child.lookId === lookId)) payload.children.push({lookId, groupId: context.profile.groupId, state: 'queued'});
      });
    } catch (error) {
      // Already known child images can still be saved after a transient operation-status failure.
      row = await this.update(org, actor, id, p => {p.blockers = [fault(error, 'VIDEO_STYLE_STATUS_UNAVAILABLE')];});
    }
    for (const child of row.payload.children) {
      if (child.state === 'saved' || child.state === 'failed') continue;
      try {
        let pending: HeygenStyleChildV1 = child;
        if (!pending.imageUrl) {
          const look = await this.adapter.inspectLook(structuredClone(context), child.lookId);
          if (look.lookId !== child.lookId || look.groupId !== context.profile.groupId || look.ownership !== 'owned' ||
            !['queued', 'running', 'completed', 'failed'].includes(look.state)) return videoErrorV1('VIDEO_STYLE_CHILD_INVALID', 409);
          pending = {lookId: look.lookId, groupId: look.groupId,
            state: look.state === 'completed' ? 'save_pending' : look.state, ...(look.state === 'completed' ? {imageUrl: heygenStyleImageUrlV1(look.imageUrl)} : {})};
          await this.update(org, actor, id, p => {const index = p.children.findIndex(c => c.lookId === child.lookId); if (p.children[index].state !== 'saved') p.children[index] = pending;});
        }
        if (pending.state === 'save_pending' && pending.imageUrl) {
          const image = await this.adapter.saveOwnedImage(structuredClone(context), {lookId: pending.lookId, groupId: pending.groupId,
            ownership: 'owned', state: 'completed', imageUrl: pending.imageUrl}, `heygen-style:${id}:${pending.lookId}`);
          if (!/^[a-f0-9-]{36}$/i.test(image.mediaId) || !['image/png', 'image/jpeg', 'image/webp'].includes(image.mimeType) ||
            !await this.connections.repository.db.media.findFirst({where: {organizationId: org, id: image.mediaId, type: 'image', deletedAt: null}, select: {id: true}}))
            return videoErrorV1('VIDEO_STYLE_IMAGE_UNAVAILABLE', 409);
          await this.update(org, actor, id, p => {
            const current = p.children.find(c => c.lookId === child.lookId)!;
            if (current.image && current.image.mediaId !== image.mediaId) return videoErrorV1('VIDEO_STYLE_IMAGE_CHANGED', 409);
            current.state = 'saved'; current.image = image; delete current.blocker;
          });
        }
      } catch (error) {
        await this.update(org, actor, id, p => {const current = p.children.find(c => c.lookId === child.lookId)!;
          if (current.state !== 'saved') current.blocker = fault(error, 'VIDEO_STYLE_IMAGE_SAVE_PENDING');});
      }
    }
    row = await this.update(org, actor, id, p => {
      const terminal = p.children.every(child => child.state === 'saved' || child.state === 'failed');
      const saved = p.children.some(child => child.state === 'saved');
      if ((p.providerState === 'completed' || p.providerState === 'failed') && terminal && p.children.length)
        p.state = saved ? p.children.some(child => child.state === 'failed') || p.providerState === 'failed' ? 'partial' : 'completed' : 'failed';
      else if (p.providerState === 'failed' && !p.children.length) p.state = 'failed';
      else p.state = saved ? 'partial' : 'collecting';
      if (p.providerState === 'completed' && !p.children.length) p.blockers = ['VIDEO_STYLE_CHILDREN_UNKNOWN'];
      if (p.state === 'completed') p.blockers = [];
      if (p.state === 'failed' && !p.blockers.length) p.blockers = ['VIDEO_STYLE_PROVIDER_FAILED'];
    });
    return this.view(row);
  }
  async read(org: string, actor: string, id: string): Promise<HeygenStyleViewV1> {
    await this.member(org, actor); return this.view(await this.owned(this.store, org, actor, id));
  }
  async list(org: string, actor: string): Promise<HeygenStyleViewV1[]> {
    await this.member(org, actor);
    const rows = await this.store.list<HeygenStylePayloadV1>(org, KIND, 100, parent(actor));
    return Promise.all(rows.map(async row => this.view(await this.owned(this.store, org, actor, row.id))));
  }
  /** Creative choice only; root applies native review/autopilot policy before calling. No profile rewrite. */
  async selectOwnedPreview(org: string, actor: string, id: string, input: {lookId: string; expectedRevision: number}): Promise<HeygenStyleViewV1> {
    await this.member(org, actor);
    if (!input || typeof input.lookId !== 'string' || !Number.isInteger(input.expectedRevision) || input.expectedRevision < 1)
      return videoErrorV1('VIDEO_STYLE_SELECTION_INVALID', 409);
    const prior = await this.owned(this.store, org, actor, id);
    await this.current(prior.payload.context, false);
    const selected = prior.payload.children.find(child => child.lookId === input.lookId && child.state === 'saved' && child.image);
    if (!selected?.image || !await this.connections.repository.db.media.findFirst({where: {organizationId: org, id: selected.image.mediaId,
      type: 'image', deletedAt: null}, select: {id: true}})) return videoErrorV1('VIDEO_STYLE_SELECTION_INVALID', 409);
    const row = await this.update(org, actor, id, p => {
      const child = p.children.find(c => c.lookId === input.lookId && c.state === 'saved' && c.image);
      if (!child?.image) return videoErrorV1('VIDEO_STYLE_SELECTION_INVALID', 409);
      p.selection = {lookId: child.lookId, mediaId: child.image.mediaId, selectedAt: this.now().toISOString()};
    }, input.expectedRevision);
    return this.view(row);
  }
  /** Trusted recipe seam: generated look is verified against lineage, never appended to identity setup. */
  async freezeAppearance(org: string, actor: string, id: string, lookId?: string): Promise<HeygenStyleAppearanceV1> {
    await this.member(org, actor);
    const row = await this.owned(this.store, org, actor, id), p = row.payload;
    await this.currentProfile(p.context, await this.current(p.context, false));
    const chosen = lookId ?? p.selection?.lookId;
    const child = p.children.find(child => child.lookId === chosen && child.state === 'saved' && child.image);
    if (!child?.image || !await this.connections.repository.db.media.findFirst({where: {organizationId: org, id: child.image.mediaId,
      type: 'image', deletedAt: null}, select: {id: true}})) return videoErrorV1('VIDEO_STYLE_SELECTION_INVALID', 409);
    const lineage = {...p.context.profile, appearanceLookId: child.lookId, operationId: id,
      operationRevision: row.revision, requestHash: p.requestHash, mediaId: child.image.mediaId};
    return structuredClone({...lineage, lineageDigest: subscriptionHash({kind: 'heygen-style-appearance/v1', organizationId: org, actorId: actor, lineage})});
  }
  async freezeSelectedAppearance(org: string, actor: string, id: string, expected: {revision: number; requestHash: string}): Promise<HeygenStyleAppearanceV1> {
    const appearance = await this.freezeAppearance(org, actor, id);
    if (!expected || appearance.operationRevision !== expected.revision || appearance.requestHash !== expected.requestHash)
      return videoErrorV1('VIDEO_STYLE_OPERATION_CHANGED', 409);
    return appearance;
  }
}
