import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { SocialFactoryRepository } from '../../content-intelligence/social-factory/social-factory.repository';
import type { SocialFactoryRecordV1, SocialFactoryStoreV1 } from '../../content-intelligence/social-factory/contracts/social-factory.v1';
import { VideoConnectionService } from './video-connection.service';
import { videoErrorV1 } from '../video-brief.v1';
import {
  heygenPersonProfileApprovalDigestV1, heygenPersonProfileDecisionContextSchemaV1, heygenPersonProfileSafeLabelV1,
  normalizeHeygenPersonNameV1, parseHeygenPersonProfileInputV1,
  type HeygenProfileHumanDecisionV1, type HeygenPersonProfilePayloadV1, type HeygenPersonProfileViewV1,
  type HeygenPersonProfileSelectionV1, type HeygenPersonProfileFrozenV1,
  type HeygenProfileAccountContextV1, type HeygenProfileFrozenFenceV1,
} from './video-heygen-person-profile.v1';

const KIND = 'heygen_person_profile' as const;
type Row = SocialFactoryRecordV1<HeygenPersonProfilePayloadV1>;
type Decision = {type: 'heygen_person_profile_human_decision'; actorId: string; profileId: string; profileRevision: number;
  approvedDigest: string; source: HeygenProfileHumanDecisionV1['source']; at: string};
const parentId = (actor: string) => `heygen-person-profile:actor:${actor}`;
const decisionId = (id: string) => `heygen-person-profile:${id}`;
const missing = (): never => videoErrorV1('VIDEO_PROFILE_UNAVAILABLE', 404);
const invalid = (): never => videoErrorV1('VIDEO_PROFILE_SELECTION_INVALID', 409);

/** Private human setup only. Provider reads, paid admission and generation remain separate. */
@Injectable()
export class HeygenPersonProfileServiceV1 {
  constructor(readonly store: SocialFactoryRepository, readonly connections: VideoConnectionService) {}

  private async member(org: string, actor: string) {
    if (!org || !actor) return videoErrorV1('VIDEO_ACCESS_DENIED', 403);
    await this.connections.repository.member(org, actor);
  }
  private async account(org: string, actor: string, id: string, trusted?: HeygenProfileAccountContextV1) {
    const row = await this.connections.repository.connection(org, actor, id, this.connections.repository.db, false);
    if (row.provider !== 'heygen' || row.ownerId !== actor || row.state === 'revoked')
      return videoErrorV1('VIDEO_PROFILE_ACCOUNT_UNVERIFIED', 409);
    const verified = typeof row.walletDigest === 'string' && /^[a-f0-9]{64}$/.test(row.walletDigest);
    if (trusted) {
      if (!/^[a-f0-9]{64}$/.test(trusted.accountDigest) || !Number.isInteger(trusted.accountGeneration) || trusted.accountGeneration !== row.generation)
        return videoErrorV1('VIDEO_PROFILE_ACCOUNT_UNVERIFIED', 409);
      if (verified && row.walletDigest !== trusted.accountDigest) return videoErrorV1('VIDEO_PROFILE_ACCOUNT_CHANGED', 409);
      return {digest: trusted.accountDigest, generation: row.generation as number};
    }
    if (!verified) return videoErrorV1('VIDEO_PROFILE_ACCOUNT_UNVERIFIED', 409);
    return {digest: row.walletDigest as string, generation: row.generation as number};
  }
  private async owned(store: SocialFactoryStoreV1, org: string, actor: string, id: string): Promise<Row> {
    const row = await store.read<HeygenPersonProfilePayloadV1>(org, KIND, id);
    if (!row || row.parentId !== parentId(actor) || row.payload?.version !== 1 || row.payload.actorId !== actor || row.payload.organizationId !== org) return missing();
    const p = row.payload;
    if (p.preferences?.profileId !== row.id || p.humanDecision?.actorId !== actor || p.humanDecision?.approvedDigest !== p.approvedDigest ||
      heygenPersonProfileApprovalDigestV1(org, actor, p.preferences, p.accountDigest) !== p.approvedDigest) return missing();
    const receipt = await store.read<Decision>(org, 'decision', decisionId(p.humanDecision.decisionId));
    if (!receipt || receipt.parentId !== parentId(actor) || receipt.payload.type !== 'heygen_person_profile_human_decision' ||
      receipt.payload.actorId !== actor || receipt.payload.profileId !== id || receipt.payload.profileRevision !== row.revision ||
      receipt.payload.approvedDigest !== p.approvedDigest || receipt.payload.source !== p.humanDecision.source || receipt.payload.at !== p.humanDecision.at) return missing();
    return row;
  }
  private async view(org: string, actor: string, row: Row, trusted?: HeygenProfileAccountContextV1): Promise<HeygenPersonProfileViewV1> {
    const p = row.payload, input = p.preferences;
    let blockers: string[] = [];
    try {
      const current = await this.account(org, actor, input.connectionId, trusted);
      if (current.digest !== p.accountDigest) blockers = ['VIDEO_PROFILE_ACCOUNT_CHANGED'];
    } catch (error: any) {
      const code = error?.getResponse?.()?.code;
      blockers = [code === 'VIDEO_PROFILE_ACCOUNT_UNVERIFIED' ? 'VIDEO_PROFILE_ACCOUNT_VERIFICATION_REQUIRED'
        : code === 'VIDEO_PROFILE_ACCOUNT_CHANGED' ? code : 'VIDEO_PROFILE_CONNECTION_UNAVAILABLE'];
    }
    // Explicit projection: no account digest, token, remote URL or raw provider object.
    return structuredClone({version: 1 as const, profileId: row.id, revision: row.revision, digest: p.approvedDigest,
      connectionId: input.connectionId, displayName: input.displayName, aliases: input.aliases, preferredForName: input.preferredForName,
      ...(input.editorialPersonaId ? {editorialPersonaId: input.editorialPersonaId} : {}), groupIds: input.groupIds,
      preferredGroupId: input.preferredGroupId, sourceLooks: input.sourceLooks, preferredSourceLookId: input.preferredSourceLookId,
      ...(input.defaultAppearanceLookId ? {defaultAppearanceLookId: input.defaultAppearanceLookId} : {}),
      ...(input.defaultAnimationReferenceLookId ? {defaultAnimationReferenceLookId: input.defaultAnimationReferenceLookId} : {}),
      defaultVoice: input.defaultVoice, observations: p.observations,
      humanDecision: {decisionId: p.humanDecision.decisionId, source: p.humanDecision.source, at: p.humanDecision.at},
      setupReusable: blockers.length === 0, blockers, renderQualified: false as const, generationAuthorized: false as const});
  }

  /** A separate server-owned decision is required. A model-supplied boolean is never accepted. */
  async saveHumanConfirmed(org: string, actor: string, raw: unknown, decision: HeygenProfileHumanDecisionV1): Promise<HeygenPersonProfileViewV1> {
    await this.member(org, actor);
    const input = parseHeygenPersonProfileInputV1(raw);
    if (!decision) return videoErrorV1('VIDEO_PROFILE_HUMAN_DECISION_REQUIRED', 409);
    const {catalog, previewMediaBindings = [], ...context} = decision;
    if (!heygenPersonProfileDecisionContextSchemaV1.safeParse(context).success ||
      context.approvedDigest !== heygenPersonProfileApprovalDigestV1(org, actor, input, context.accountDigest))
      return videoErrorV1('VIDEO_PROFILE_HUMAN_DECISION_REQUIRED', 409);
    const account = await this.account(org, actor, input.connectionId, context);
    if (account.digest !== context.accountDigest || account.generation !== context.accountGeneration) return videoErrorV1('VIDEO_PROFILE_ACCOUNT_CHANGED', 409);
    if (!catalog || catalog.scope !== 'authenticated_private_account' || catalog.readOnly !== true || catalog.renderQualified !== false ||
      !Array.isArray(catalog.avatars) || !Array.isArray(catalog.voices)) return invalid();
    const ids = catalog.avatars.map(look => look.id), voiceIds = catalog.voices.map(voice => voice.id);
    if (new Set(ids).size !== ids.length || new Set(voiceIds).size !== voiceIds.length) return invalid();
    const selected = input.sourceLooks.map(ref => {
      const look = catalog.avatars.find(look => look.id === ref.lookId && look.groupId === ref.groupId && look.ownership === 'owned');
      if (!look || !look.selectableForDraft || !input.groupIds.includes(ref.groupId)) return invalid();
      if (ref.previewMediaId && !previewMediaBindings.some(binding => binding.groupId === ref.groupId && binding.lookId === ref.lookId && binding.mediaId === ref.previewMediaId))
        return videoErrorV1('VIDEO_PROFILE_PREVIEW_UNAVAILABLE', 409);
      return look;
    });
    if (input.groupIds.some(id => !catalog.avatars.some(look => look.groupId === id && look.ownership === 'owned'))) return invalid();
    const voice = catalog.voices.find(voice => voice.id === input.defaultVoice.voiceId && voice.ownership === 'owned' && voice.selectableForDraft);
    if (!voice) return invalid();
    if (input.editorialPersonaId && !await this.connections.repository.db.projectBrandProfile.findFirst({where: {organizationId: org, id: input.editorialPersonaId, deletedAt: null}, select: {id: true}})) return invalid();
    for (const ref of input.sourceLooks) if (ref.previewMediaId && !await this.connections.repository.db.media.findFirst({where: {organizationId: org, id: ref.previewMediaId, deletedAt: null, type: 'image'}, select: {id: true}}))
      return videoErrorV1('VIDEO_PROFILE_PREVIEW_UNAVAILABLE', 409);

    const payload: HeygenPersonProfilePayloadV1 = {version: 1, organizationId: org, actorId: actor,
      accountDigest: account.digest, observedAccountGeneration: account.generation, preferences: input, approvedDigest: context.approvedDigest,
      humanDecision: {decisionId: context.decisionId, actorId: actor, source: context.source, approvedDigest: context.approvedDigest, at: context.observedAt},
      observations: {observedAt: context.observedAt, renderQualified: false,
        looks: selected.map(look => ({groupId: look.groupId!, lookId: look.id, name: heygenPersonProfileSafeLabelV1(look.name, input.displayName), state: look.state,
          avatarType: look.avatarType ?? null, groupType: look.groupType ?? null, consentStatus: look.consentStatus ?? 'unknown', engines: look.engines.filter(engine => ['avatar_iii', 'avatar_iv', 'avatar_v'].includes(engine))})),
        voice: {voiceId: voice.id, name: heygenPersonProfileSafeLabelV1(voice.name, input.displayName), state: voice.state}}};
    const saved = await this.store.transact(async store => {
      const receipt = await store.read<Decision>(org, 'decision', decisionId(context.decisionId));
      if (receipt) {
        if (receipt.parentId !== parentId(actor) || receipt.payload.actorId !== actor || receipt.payload.profileId !== input.profileId ||
          receipt.payload.approvedDigest !== context.approvedDigest || receipt.payload.profileRevision !== input.expectedRevision + 1)
          return videoErrorV1('VIDEO_PROFILE_HUMAN_DECISION_REQUIRED', 409);
        const prior = await this.owned(store, org, actor, input.profileId);
        if (prior.revision !== receipt.payload.profileRevision) return videoErrorV1('VIDEO_PROFILE_CHANGED', 409);
        return prior;
      }
      const previous = await store.read<HeygenPersonProfilePayloadV1>(org, KIND, input.profileId);
      if (previous) {
        await this.owned(store, org, actor, input.profileId);
        if (previous.revision !== input.expectedRevision) return videoErrorV1('VIDEO_PROFILE_CHANGED', 409);
        // Rebinding an existing identity to a different account needs a separate new profile.
        if (previous.payload.accountDigest !== account.digest || previous.payload.preferences.connectionId !== input.connectionId)
          return videoErrorV1('VIDEO_PROFILE_ACCOUNT_CHANGED', 409);
      } else if (input.expectedRevision !== 0) return videoErrorV1('VIDEO_PROFILE_CHANGED', 409);
      const current = await this.account(org, actor, input.connectionId, context);
      if (current.digest !== account.digest || current.generation !== account.generation) return videoErrorV1('VIDEO_PROFILE_ACCOUNT_CHANGED', 409);
      const row = await store.put<HeygenPersonProfilePayloadV1>({organizationId: org, kind: KIND, id: input.profileId, expectedRevision: input.expectedRevision,
        parentId: parentId(actor), payload, sourceIds: []});
      await store.put<Decision>({organizationId: org, kind: 'decision', id: decisionId(context.decisionId), expectedRevision: 0,
        parentId: parentId(actor), sourceIds: [], payload: {type: 'heygen_person_profile_human_decision', actorId: actor, profileId: row.id,
          profileRevision: row.revision, approvedDigest: context.approvedDigest, source: context.source, at: context.observedAt}});
      return row;
    });
    return this.view(org, actor, saved, context);
  }

  async read(org: string, actor: string, id: string, trusted?: HeygenProfileAccountContextV1): Promise<HeygenPersonProfileViewV1> {
    await this.member(org, actor);
    return this.view(org, actor, await this.owned(this.store, org, actor, id), trusted);
  }
  async list(org: string, actor: string, query: {cursor?: string; limit?: number; connectionId?: string} = {}, trusted?: HeygenProfileAccountContextV1): Promise<{items: HeygenPersonProfileViewV1[]; nextCursor: string | null}> {
    await this.member(org, actor);
    if (query.limit !== undefined && (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 100)) return invalid();
    const page = await this.store.page<HeygenPersonProfilePayloadV1>(org, KIND, {parentId: parentId(actor), cursor: query.cursor, limit: query.limit ?? 30});
    const items: HeygenPersonProfileViewV1[] = [];
    for (const row of page.items) {
      if (row.payload?.actorId !== actor || row.payload.organizationId !== org || query.connectionId && row.payload.preferences?.connectionId !== query.connectionId) continue;
      items.push(await this.view(org, actor, await this.owned(this.store, org, actor, row.id), trusted));
    }
    return {items, nextCursor: page.nextCursor};
  }
  async resolve(org: string, actor: string, input: HeygenPersonProfileSelectionV1, trusted?: HeygenProfileAccountContextV1): Promise<HeygenPersonProfileViewV1> {
    await this.member(org, actor);
    const account = await this.account(org, actor, input.connectionId, trusted);
    const name = input.name ? normalizeHeygenPersonNameV1(input.name) : null;
    const rows = input.profileId ? [await this.owned(this.store, org, actor, input.profileId)]
      : await this.store.list<HeygenPersonProfilePayloadV1>(org, KIND, 10000, parentId(actor));
    const candidates: Row[] = [];
    for (const row of rows) {
      const p = row.payload, preferences = p?.preferences;
      if (p?.actorId !== actor || p.organizationId !== org || row.parentId !== parentId(actor) ||
        preferences?.connectionId !== input.connectionId || p.accountDigest !== account.digest) continue;
      if (name && ![preferences.displayName, ...preferences.aliases].some(alias => normalizeHeygenPersonNameV1(alias) === name)) continue;
      if (input.groupId && !preferences.groupIds.includes(input.groupId) || input.lookId && !preferences.sourceLooks.some(look => look.lookId === input.lookId && (!input.groupId || look.groupId === input.groupId))) continue;
      candidates.push(await this.owned(this.store, org, actor, row.id));
    }
    if (!candidates.length) {
      if (input.profileId && rows[0]?.payload.accountDigest !== account.digest) return videoErrorV1('VIDEO_PROFILE_ACCOUNT_CHANGED', 409);
      return missing();
    }
    const preferred = candidates.filter(row => row.payload.preferences.preferredForName);
    const selected = candidates.length === 1 ? candidates[0] : preferred.length === 1 ? preferred[0] : null;
    if (!selected) return videoErrorV1('VIDEO_PROFILE_SELECTION_REQUIRED', 409);
    return this.view(org, actor, selected, trusted);
  }
  async freeze(org: string, actor: string, input: HeygenPersonProfileSelectionV1 & {expectedRevision?: number; expectedDigest?: string}, trusted?: HeygenProfileAccountContextV1): Promise<HeygenPersonProfileFrozenV1> {
    const profile = await this.resolve(org, actor, input, trusted);
    if (input.expectedRevision !== undefined && input.expectedRevision !== profile.revision || input.expectedDigest !== undefined && input.expectedDigest !== profile.digest)
      return videoErrorV1('VIDEO_PROFILE_CHANGED', 409);
    const groupId = input.groupId ?? profile.sourceLooks.find(look => look.lookId === input.lookId)?.groupId ?? profile.preferredGroupId;
    const bases = profile.sourceLooks.filter(look => look.groupId === groupId && look.roles.includes('style_base'));
    const baseLookId = input.lookId ?? (bases.some(look => look.lookId === profile.preferredSourceLookId) ? profile.preferredSourceLookId : bases.length === 1 ? bases[0].lookId : undefined);
    if (!baseLookId) return videoErrorV1('VIDEO_PROFILE_SELECTION_REQUIRED', 409);
    const inGroup = (id: string | undefined) => profile.sourceLooks.some(look => look.lookId === id && look.groupId === groupId);
    const appearanceLookId = input.appearanceLookId ?? (inGroup(profile.defaultAppearanceLookId) ? profile.defaultAppearanceLookId! : baseLookId);
    const animationReferenceLookId = input.animationReferenceLookId ?? (inGroup(profile.defaultAnimationReferenceLookId) ? profile.defaultAnimationReferenceLookId : undefined);
    const role = (id: string, role: 'style_base' | 'appearance' | 'animation_reference') => profile.sourceLooks.some(look => look.lookId === id && look.groupId === groupId && look.roles.includes(role));
    if (!role(baseLookId, 'style_base') || !role(appearanceLookId, 'appearance') || animationReferenceLookId && !role(animationReferenceLookId, 'animation_reference')) return invalid();
    return structuredClone({version: 1, profileId: profile.profileId, profileRevision: profile.revision, profileDigest: profile.digest,
      connectionId: profile.connectionId, groupId, baseLookId, appearanceLookId, ...(animationReferenceLookId ? {animationReferenceLookId} : {}),
      voiceId: profile.defaultVoice.voiceId, ...(profile.defaultVoice.engine ? {voiceEngine: profile.defaultVoice.engine} : {}),
      ...(profile.defaultVoice.baseline ? {voiceBaseline: profile.defaultVoice.baseline} : {}), renderQualified: false, generationAuthorized: false});
  }

  /** Shares the profile row lock with the native submit-attempt transaction; never a provider effect. */
  async assertFrozenInTransaction(tx: Pick<Prisma.TransactionClient, 'socialFactoryRecord'>, org: string, actor: string,
    input: HeygenProfileFrozenFenceV1,
    selected?: Pick<HeygenPersonProfileFrozenV1, 'groupId' | 'baseLookId' | 'appearanceLookId' | 'animationReferenceLookId' | 'voiceId'>): Promise<void> {
    return assertHeygenPersonProfileFrozenInTransactionV1(tx, org, actor, input, selected);
  }
}

export async function assertHeygenPersonProfileFrozenInTransactionV1(tx: Pick<Prisma.TransactionClient, 'socialFactoryRecord'>, org: string, actor: string,
  input: HeygenProfileFrozenFenceV1,
  selected?: Pick<HeygenPersonProfileFrozenV1, 'groupId' | 'baseLookId' | 'appearanceLookId' | 'animationReferenceLookId' | 'voiceId'>): Promise<void> {
  if (!org || !actor || !input || !Number.isInteger(input.profileRevision) || input.profileRevision < 1) return videoErrorV1('VIDEO_PROFILE_CHANGED', 409);
  const where: Prisma.SocialFactoryRecordWhereInput = {kind: KIND, id: input.profileId, revision: input.profileRevision, parentId: parentId(actor), deletedAt: null, invalidatedAt: null,
    OR: [{expiresAt: null}, {expiresAt: {gt: new Date()}}], AND: [
      {payload: {path: ['actorId'], equals: actor}}, {payload: {path: ['organizationId'], equals: org}},
      {payload: {path: ['approvedDigest'], equals: input.profileDigest}}, {payload: {path: ['accountDigest'], equals: input.subjectDigest}},
      {payload: {path: ['preferences', 'connectionId'], equals: input.connectionId}},
    ]};
  const row = await tx.socialFactoryRecord.findFirst({where: {...where, organizationId: org}});
  if (!row) return videoErrorV1('VIDEO_PROFILE_CHANGED', 409);
  const p = row.payload as unknown as HeygenPersonProfilePayloadV1, preferences = p.preferences;
  if (p.version !== 1 || p.actorId !== actor || p.organizationId !== org || preferences?.profileId !== input.profileId ||
    p.humanDecision?.actorId !== actor || p.humanDecision.approvedDigest !== input.profileDigest ||
    heygenPersonProfileApprovalDigestV1(org, actor, preferences, p.accountDigest) !== input.profileDigest) return videoErrorV1('VIDEO_PROFILE_CHANGED', 409);
  if (selected) {
    const role = (id: string, role: 'style_base' | 'appearance' | 'animation_reference') => preferences.sourceLooks.some(look => look.lookId === id && look.groupId === selected.groupId && look.roles.includes(role));
    if (!role(selected.baseLookId, 'style_base') || !role(selected.appearanceLookId, 'appearance') ||
      selected.animationReferenceLookId && !role(selected.animationReferenceLookId, 'animation_reference') || selected.voiceId !== preferences.defaultVoice.voiceId)
      return videoErrorV1('VIDEO_PROFILE_CHANGED', 409);
  }
  const changed = await tx.socialFactoryRecord.updateMany({where: {...where, organizationId: org}, data: {revision: input.profileRevision}});
  if (changed.count !== 1) return videoErrorV1('VIDEO_PROFILE_CHANGED', 409);
}
