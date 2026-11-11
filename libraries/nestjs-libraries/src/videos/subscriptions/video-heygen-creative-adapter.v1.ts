import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { AuthService } from '@contentfactory/helpers/auth/auth.service';
import { SocialFactoryRepository } from '../../content-intelligence/social-factory/social-factory.repository';
import { VideoMediaV1 } from '../video-media.v1';
import { videoErrorV1 } from '../video-brief.v1';
import { VideoConnectionService } from './video-connection.service';
import { VideoMcpClient } from './video-mcp-client';
import { subscriptionHash } from './video-provider-registry';
import { HeygenPersonProfileServiceV1 } from './video-heygen-person-profile.service.v1';
import { HEYGEN_STYLE_TOOL_SCHEMAS_V1, parseHeygenStyleReceiptV1, type HeygenStyleAdapterV1, type HeygenStyleAuthorizationV1,
  type HeygenStyleContextV1, type HeygenStyleWireArgsV1 } from './video-heygen-style.v1';
import { HEYGEN_VOICE_TOOL_SCHEMAS_V1, HeygenVoiceHumanDecisionSchemaV1, type HeygenOwnedAudioV1,
  type HeygenVoiceHumanDecisionV1, type HeygenVoiceScopeV1, type HeygenVoiceSetupAdapterV1 } from './video-heygen-voice-setup.v1';
import { heygenCreativeEnvelopeV1, decodeHeygenPromptLookReceiptV1 } from './video-heygen-creative-native.v1';
import { HEYGEN_BACKGROUND_ASSET_ORIGIN_V1 } from './video-heygen-advanced-qualification.v1';

const fail = (code: string): never => videoErrorV1(code, 409);
const privateId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(value);
const digest = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const safeLabel = (value: unknown, fallback: string) => typeof value === 'string' && value.trim() &&
  !/[\u0000-\u001f\u007f]|https?:\/\/|\bbearer\s/iu.test(value) ? value.trim().slice(0, 120) : fallback;
const humanProofs = new Map<string, number>(), nativeProofs = new WeakSet<object>(), styleProofs = new WeakSet<object>(), originalProofs = new WeakSet<object>();
type Scope = Pick<HeygenVoiceScopeV1, 'organizationId' | 'actorId' | 'connectionId' | 'subjectDigest' | 'accountGeneration'>;
type NativeProof = Scope & {setupId: string; operationId: string; requestHash: string; decisionId: string; expiresAt: string};
type OriginalProof = Scope & {mediaId: string; contentDigest: string; decisionId: string; approvedDigest: string; at: string};
/** Call these factories only inside an authenticated screen/native-confirmation handler.
 * Deserialized model/HTTP objects cannot create a proof registration.
 */
export const heygenCreativeHumanDecisionProofV1 = (input: HeygenVoiceHumanDecisionV1): HeygenVoiceHumanDecisionV1 => {
  const parsed = HeygenVoiceHumanDecisionSchemaV1.safeParse(input);
  if (!parsed.success) return fail('VIDEO_VOICE_HUMAN_DECISION_REQUIRED');
  const value = Object.freeze(parsed.data), now = Date.now();
  for (const [key, expiresAt] of humanProofs) if (expiresAt <= now) humanProofs.delete(key);
  humanProofs.set(subscriptionHash(value), now + 15 * 60_000); return value;
};
export const heygenCreativeNativeApprovalProofV1 = (scope: HeygenVoiceScopeV1, approval: Pick<NativeProof, 'operationId' | 'requestHash' | 'decisionId' | 'expiresAt'>): unknown => {
  const value = Object.freeze({...scope, ...approval}); nativeProofs.add(value); return value;
};
export const heygenCreativeStyleApprovalProofV1 = (approval: HeygenStyleAuthorizationV1): unknown => {
  const value = Object.freeze({...approval}); styleProofs.add(value); return value;
};
export const heygenCreativeOriginalRecordingProofV1 = (input: OriginalProof): unknown => {
  const value = Object.freeze({...input}); originalProofs.add(value); return value;
};
const sameScope = (a: Scope, b: Scope) => a.organizationId === b.organizationId && a.actorId === b.actorId && a.connectionId === b.connectionId &&
  a.subjectDigest === b.subjectDigest && a.accountGeneration === b.accountGeneration;
const mediaBindingId = (scope: Scope, mediaId: string) => `heygen-creative-media:${subscriptionHash({organizationId: scope.organizationId, actorId: scope.actorId,
  connectionId: scope.connectionId, subjectDigest: scope.subjectDigest, mediaId})}`;
const parent = (actor: string) => `heygen-creative:actor:${actor}`;
const uuidFromHash = (hash: string) => `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
type OriginalBinding = {type: 'heygen_original_recording_declaration/v1'; organizationId: string; actorId: string; connectionId: string;
  subjectDigest: string; mediaId: string; contentDigest: string; decisionId: string; approvedDigest: string; at: string};
type StoredAsset = {name: string; path: string; size: number; mimeType: string; contentDigest: string; width?: number; height?: number;
  container?: string; codec?: string; durationSeconds?: number; sampleRate?: number; channels?: number};

/** Existing personal OAuth, selected pinned native tools and owned image/audio Media.
 * Unknown response/feature contracts remain explicit blockers, never assumed success.
 */
@Injectable()
export class HeygenCreativeAdapterV1 {
  private readonly styleAuthorities = new Map<string, {approval: HeygenStyleAuthorizationV1; argsHash: string}>();
  private readonly saves = new Map<string, Promise<{mediaId: string; stored: StoredAsset}>>();
  constructor(readonly connections: VideoConnectionService, readonly mcp: VideoMcpClient, readonly media: VideoMediaV1,
    readonly store: SocialFactoryRepository, readonly profiles: HeygenPersonProfileServiceV1) {}
  private now() {return this.connections.runtime.now();}
  private async local(scope: Pick<Scope, 'organizationId' | 'actorId' | 'connectionId'> & Partial<Scope>) {
    await this.connections.repository.member(scope.organizationId, scope.actorId);
    const row = await this.connections.repository.connection(scope.organizationId, scope.actorId, scope.connectionId, this.connections.repository.db, false);
    if (row.ownerId !== scope.actorId || row.provider !== 'heygen' || row.state === 'revoked' ||
      scope.accountGeneration !== undefined && row.generation !== scope.accountGeneration) return fail('VIDEO_CREATIVE_ACCOUNT_CHANGED');
    return row;
  }
  private async native(scope: Pick<Scope, 'organizationId' | 'actorId' | 'connectionId'> & Partial<Scope>) {
    await this.local(scope);
    const credential = await this.connections.token(scope.organizationId, scope.actorId, scope.connectionId, scope.accountGeneration, 'discovery', {allowRefresh: false});
    if (credential.connection.provider !== 'heygen') return fail('VIDEO_PROVIDER_INVALID');
    const def = await this.connections.connectable(scope.organizationId, 'heygen');
    const guard = async () => {await credential.assertUsable(); await this.local({...scope, accountGeneration: credential.connection.generation});};
    const account = await this.mcp.readHeygenAccountV1(def, credential.token, guard);
    if (account.billingType !== 'subscription' || scope.subjectDigest !== undefined && account.subjectDigest !== scope.subjectDigest) return fail('VIDEO_CREATIVE_ACCOUNT_CHANGED');
    return {def, token: credential.token, guard, account, generation: credential.connection.generation as number};
  }
  private styleScope(context: HeygenStyleContextV1): Scope {return {organizationId: context.organizationId, actorId: context.actorId,
    connectionId: context.connectionId, subjectDigest: context.accountDigest, accountGeneration: context.accountGeneration};}
  private styleAuthorityKey(context: HeygenStyleContextV1) {return subscriptionHash({organizationId: context.organizationId, actorId: context.actorId, operationId: context.operationId});}

  /** Server-only current private evidence for saving the same human-selected voice as a profile default. */
  async readProfileCatalog(organizationId: string, actorId: string, connectionId: string) {
    const n = await this.native({organizationId, actorId, connectionId});
    const owned = await this.mcp.readHeygenOwnedCatalog(n.def, n.token, n.guard);
    await n.guard();
    return {catalog: owned.catalog, accountDigest: n.account.subjectDigest, accountGeneration: n.generation};
  }

  /** An explicit background selection copies one authenticated provider image
   * to owned Media and records the digest of those exact stored bytes.
   */
  async bindOwnedBackgroundImage(scope: Scope, assetId: string) {
    const n = await this.native(scope);
    let selected: {type: 'image'; assetId: string; mediaId: string; contentDigest: string} | undefined;
    await this.mcp.readHeygenAdvancedOptionsV1(n.def, n.token, {subjectDigest: scope.subjectDigest, backgroundAssetId: assetId}, n.guard, async image => {
      const saved = await this.saveAsset(scope, 'image', `background:${assetId}`, image.url, image.name, HEYGEN_BACKGROUND_ASSET_ORIGIN_V1)
        .catch(() => fail('VIDEO_HEYGEN_BACKGROUND_IMPORT_UNAVAILABLE'));
      const local = await this.media.inspectOwnedImage(saved.stored.path).catch(() => fail('VIDEO_CREATIVE_MEDIA_BINDING_INVALID'));
      if (local.contentDigest !== saved.stored.contentDigest) return fail('VIDEO_CREATIVE_MEDIA_BINDING_INVALID');
      selected = {type: 'image', assetId, mediaId: saved.mediaId, contentDigest: local.contentDigest};
    });
    return selected ?? fail('VIDEO_CREATIVE_MEDIA_BINDING_INVALID');
  }

  async authorizeStyle(context: HeygenStyleContextV1 & {requestHash: string; args: HeygenStyleWireArgsV1}, proof: unknown): Promise<HeygenStyleAuthorizationV1> {
    if (!proof || typeof proof !== 'object' || !styleProofs.has(proof)) return fail('VIDEO_STYLE_AUTHORIZATION_REQUIRED');
    const p = proof as HeygenStyleAuthorizationV1;
    if (p.organizationId !== context.organizationId || p.actorId !== context.actorId || p.connectionId !== context.connectionId ||
      p.operationId !== context.operationId || p.accountDigest !== context.accountDigest || p.accountGeneration !== context.accountGeneration ||
      p.requestHash !== context.requestHash || !p.decisionId || !p.scopeId || p.funding !== 'personal_subscription' || Date.parse(p.expiresAt) <= this.now().getTime() || !Number.isFinite(Date.parse(p.expiresAt)))
      return fail('VIDEO_STYLE_AUTHORIZATION_REQUIRED');
    await this.local(this.styleScope(context));
    for (const [key, value] of this.styleAuthorities) if (Date.parse(value.approval.expiresAt) <= this.now().getTime()) this.styleAuthorities.delete(key);
    this.styleAuthorities.set(this.styleAuthorityKey(context), {approval: structuredClone(p), argsHash: subscriptionHash(context.args)}); return structuredClone(p);
  }

  readonly styleAdapter: HeygenStyleAdapterV1 = {
    currentAccount: async (organizationId, actorId, connectionId) => {
      const n = await this.native({organizationId, actorId, connectionId});
      return {accountDigest: n.account.subjectDigest, accountGeneration: n.generation};
    },
    qualify: async context => {
      const n = await this.native(this.styleScope(context));
      const schemas = await this.mcp.readHeygenCreativeSchemasV1(n.def, n.token, 'style', n.guard);
      const owned = await this.mcp.readHeygenOwnedCatalog(n.def, n.token, n.guard);
      const look = owned.catalog.avatars.find(look => look.id === context.profile.baseLookId && look.groupId === context.profile.groupId && look.ownership === 'owned' && look.selectableForDraft);
      if (!look) return fail('VIDEO_STYLE_BASE_UNAVAILABLE');
      const group = await this.mcp.readHeygenOwnedAvatarGroup(n.def, n.token, {avatarId: look.id, groupId: look.groupId}, n.guard);
      if (!['accepted', 'not_applicable'].includes(group.consentState)) return fail('VIDEO_STYLE_BASE_UNAVAILABLE');
      const detail = await this.styleAdapter.inspectLook(context, look.id);
      if (detail.state !== 'completed' || !detail.imageUrl) return fail('VIDEO_STYLE_BASE_UNAVAILABLE');
      if (context.input.referenceMediaIds.length) return fail('VIDEO_STYLE_OWNED_ASSET_BINDING_UNVERIFIED');
      return {accountDigest: n.account.subjectDigest, accountGeneration: n.generation, schemaDigests: schemas as typeof HEYGEN_STYLE_TOOL_SCHEMAS_V1,
        baseLook: {lookId: look.id, groupId: group.groupId, ownership: 'owned', imageUsable: true, consent: group.consentState === 'accepted' ? 'accepted' : 'not_required'},
        entitlement: 'unknown', references: []};
    },
    create: async (context, args, hooks) => {
      const key = this.styleAuthorityKey(context), authority = this.styleAuthorities.get(key);
      if (!authority || authority.argsHash !== subscriptionHash(args) || authority.approval.connectionId !== context.connectionId ||
        authority.approval.accountDigest !== context.accountDigest || authority.approval.accountGeneration !== context.accountGeneration)
        return fail('VIDEO_STYLE_AUTHORIZATION_REQUIRED');
      const n = await this.native(this.styleScope(context));
      const raw = await this.mcp.mutateHeygenCreativeV1(n.def, n.token, {tool: 'create_prompt_avatar', arguments: args}, n.guard, {
        beforeDispatch: async () => {
          if (Date.parse(authority.approval.expiresAt) <= this.now().getTime() || this.styleAuthorities.get(key) !== authority) return fail('VIDEO_STYLE_AUTHORIZATION_REQUIRED');
          this.styleAuthorities.delete(key); await hooks.beforeDispatch();
        }, afterResponse: hooks.afterResponse,
      });
      const receipt = this.styleAdapter.decodeReceipt(raw);
      if (receipt.referenceKind === 'look' && receipt.groupId !== context.profile.groupId) return fail('VIDEO_STYLE_CHILD_INVALID');
      return receipt;
    },
    decodeReceipt: raw => decodeHeygenPromptLookReceiptV1(raw),
    poll: async (context, raw) => {
      const receipt = parseHeygenStyleReceiptV1(raw);
      if (receipt.referenceKind !== 'look') return fail('VIDEO_STYLE_STATUS_CONTRACT_UNQUALIFIED');
      if (receipt.groupId !== context.profile.groupId) return fail('VIDEO_STYLE_CHILD_INVALID');
      const look = await this.styleAdapter.inspectLook(context, receipt.operationId);
      if (look.lookId !== receipt.operationId || look.groupId !== receipt.groupId || look.ownership !== 'owned') return fail('VIDEO_STYLE_CHILD_INVALID');
      return {...receipt, state: look.state};
    },
    inspectLook: async (context, lookId) => {
      const n = await this.native(this.styleScope(context));
      const owned = await this.mcp.readHeygenOwnedCatalog(n.def, n.token, n.guard);
      if (!owned.catalog.avatars.some(look => look.id === lookId && look.groupId === context.profile.groupId)) return fail('VIDEO_STYLE_CHILD_INVALID');
      const envelope = heygenCreativeEnvelopeV1(await this.mcp.readHeygenCreativeV1(n.def, n.token, {tool: 'get_avatar_look', arguments: {lookId}}, n.guard));
      const raw = (envelope.data ?? envelope) as Record<string, unknown>;
      const states = {pending: 'queued', queued: 'queued', processing: 'running', training: 'running', completed: 'completed', failed: 'failed'} as const;
      if (raw.id !== lookId || raw.group_id !== context.profile.groupId || typeof raw.status !== 'string' || !Object.prototype.hasOwnProperty.call(states, raw.status)) return fail('VIDEO_STYLE_LOOK_RESPONSE_INVALID');
      const state = states[raw.status as keyof typeof states];
      const imageUrl = state === 'completed' ? this.resultUrl(raw.preview_image_url) : undefined;
      if (imageUrl) await this.media.referenceDimensions(imageUrl);
      return {lookId, groupId: context.profile.groupId, ownership: 'owned', state,
        ...(imageUrl ? {imageUrl} : {})};
    },
    saveOwnedImage: async (context, look, key) => {
      if (look.groupId !== context.profile.groupId || look.ownership !== 'owned' || look.state !== 'completed') return fail('VIDEO_STYLE_CHILD_INVALID');
      const saved = await this.saveAsset(this.styleScope(context), 'image', key, look.imageUrl, `HeyGen ${context.input.name}`);
      return {mediaId: saved.mediaId, mimeType: saved.stored.mimeType as 'image/png' | 'image/jpeg' | 'image/webp'};
    },
  };

  /** Preparation reads measured bytes without declaring their uploader or source origin. */
  async inspectAccessibleAudio(scope: HeygenVoiceScopeV1, mediaId: string): Promise<Omit<HeygenOwnedAudioV1, 'origin'>> {
    await this.local(scope);
    const row = await this.connections.repository.db.media.findFirst({where: {organizationId: scope.organizationId, id: mediaId, deletedAt: null}});
    if (!row) return fail('VIDEO_VOICE_AUDIO_UNAVAILABLE');
    const measured = await this.media.inspectOwnedAudio(row.path);
    return {mediaId: row.id, organizationId: scope.organizationId, actorId: scope.actorId, label: safeLabel(row.originalName ?? row.name, 'Selected original recording'),
      contentDigest: measured.contentDigest, bytes: measured.size, mimeType: measured.mimeType, container: measured.container, codec: measured.codec,
      durationSeconds: measured.durationSeconds, sampleRate: measured.sampleRate, channels: measured.channels,
      playable: ['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/ogg'].includes(measured.mimeType),
      quality: {speech: 'unknown', speakers: 'unknown', clipping: 'unknown', noise: 'unknown'}};
  }
  async registerOriginalRecording(scope: HeygenVoiceScopeV1, mediaId: string, proof: unknown): Promise<HeygenOwnedAudioV1> {
    if (!proof || typeof proof !== 'object' || !originalProofs.has(proof)) return fail('VIDEO_VOICE_HUMAN_DECISION_REQUIRED');
    const p = proof as OriginalProof;
    if (!sameScope(scope, p) || p.mediaId !== mediaId || !p.decisionId || !digest(p.approvedDigest) || !digest(p.contentDigest) || !Number.isFinite(Date.parse(p.at))) return fail('VIDEO_VOICE_HUMAN_DECISION_REQUIRED');
    const knownGenerated = await this.store.read(scope.organizationId, 'action', `heygen-generated-audio:${subscriptionHash({organizationId: scope.organizationId, mediaId})}`);
    if (knownGenerated) return fail('VIDEO_VOICE_ORIGINAL_REQUIRED');
    const measured = await this.inspectAccessibleAudio(scope, mediaId);
    if (measured.contentDigest !== p.contentDigest) return fail('VIDEO_VOICE_ORIGINAL_CHANGED');
    const id = mediaBindingId(scope, mediaId), existing = await this.store.read<OriginalBinding>(scope.organizationId, 'action', id);
    if (existing) {
      const bound = existing.payload;
      if (existing.parentId !== parent(scope.actorId) || bound.actorId !== scope.actorId || bound.organizationId !== scope.organizationId ||
        bound.subjectDigest !== scope.subjectDigest || bound.contentDigest !== measured.contentDigest || bound.connectionId !== scope.connectionId || bound.mediaId !== mediaId)
        return fail('VIDEO_VOICE_ORIGINAL_CHANGED');
    } else {
      await this.store.put<OriginalBinding>({organizationId: scope.organizationId, kind: 'action', id, expectedRevision: 0, parentId: parent(scope.actorId), sourceIds: [],
        payload: {type: 'heygen_original_recording_declaration/v1', organizationId: scope.organizationId, actorId: scope.actorId, connectionId: scope.connectionId,
          subjectDigest: scope.subjectDigest, mediaId, contentDigest: measured.contentDigest, decisionId: p.decisionId, approvedDigest: p.approvedDigest, at: p.at}});
    }
    return {...measured, origin: 'original_recording_selected_by_person'};
  }

  readonly voiceAdapter: HeygenVoiceSetupAdapterV1 = {
    currentAccount: async scope => {
      const n = await this.native(scope); return {connectionId: scope.connectionId, subjectDigest: n.account.subjectDigest, accountGeneration: n.generation, billingType: 'subscription'};
    },
    inspectAccessibleAudio: (scope, mediaId) => this.inspectAccessibleAudio(scope, mediaId),
    readOwnedAudio: async (scope, mediaId) => {
      const record = await this.store.read<OriginalBinding>(scope.organizationId, 'action', mediaBindingId(scope, mediaId));
      const bound = record?.payload;
      if (!record || record.parentId !== parent(scope.actorId) || bound?.type !== 'heygen_original_recording_declaration/v1' ||
        bound.organizationId !== scope.organizationId || bound.actorId !== scope.actorId || bound.connectionId !== scope.connectionId || bound.subjectDigest !== scope.subjectDigest || bound.mediaId !== mediaId)
        return fail('VIDEO_VOICE_ORIGINAL_DECLARATION_REQUIRED');
      const measured = await this.inspectAccessibleAudio(scope, mediaId);
      if (measured.contentDigest !== bound.contentDigest) return fail('VIDEO_VOICE_ORIGINAL_CHANGED');
      return {...measured, origin: 'original_recording_selected_by_person'};
    },
    readVoice: async (scope, voiceId, pin) => {
      if (!privateId(voiceId) || pin !== HEYGEN_VOICE_TOOL_SCHEMAS_V1.get_voice) return fail('VIDEO_SCHEMA_CHANGED');
      const n = await this.native(scope), owned = await this.mcp.readHeygenOwnedCatalog(n.def, n.token, n.guard);
      const voice = owned.catalog.voices.find(voice => voice.id === voiceId && voice.ownership === 'owned');
      if (!voice) return fail('VIDEO_VOICE_IDENTITY_UNVERIFIED');
      const raw = heygenCreativeEnvelopeV1(await this.mcp.readHeygenCreativeV1(n.def, n.token, {tool: 'get_voice', arguments: {voiceId}}, n.guard));
      const detail = (raw.data ?? raw) as Record<string, unknown>;
      if (detail.voice_id !== voiceId || !['complete', 'completed', 'failed', 'processing', 'pending'].includes(String(detail.status))) return fail('VIDEO_VOICE_RESPONSE_INVALID');
      const setup = await this.store.read<any>(scope.organizationId, 'heygen_voice_setup', scope.setupId);
      const profileId = setup?.payload?.actorId === scope.actorId && setup.payload.organizationId === scope.organizationId ? setup.payload.input?.profileId : undefined;
      if (!profileId) return fail('VIDEO_VOICE_IDENTITY_UNVERIFIED');
      const profile = await this.profiles.read(scope.organizationId, scope.actorId, profileId, {accountDigest: scope.subjectDigest, accountGeneration: scope.accountGeneration});
      if (!profile.setupReusable || profile.defaultVoice.voiceId !== voiceId) return fail('VIDEO_VOICE_IDENTITY_UNVERIFIED');
      return {voiceId, name: safeLabel(detail.name, voice.name), owned: true, ready: ['complete', 'completed'].includes(String(detail.status)),
        origin: 'approved_existing', approvedProfileId: profileId, speechSupport: 'unknown', engines: [], localeStrategy: 'language_only'};
    },
    qualifyOperation: async (scope, tool) => {
      const n = await this.native(scope);
      await this.mcp.readHeygenCreativeSchemasV1(n.def, n.token, 'voice', n.guard);
      return {toolSchemaDigest: HEYGEN_VOICE_TOOL_SCHEMAS_V1[tool], entitlement: 'unknown', receiptContract: 'unknown', sourceRights: 'unknown', consent: 'unknown'};
    },
    dispatch: async (scope, request, hooks) => {
      if (request.toolSchemaDigest !== HEYGEN_VOICE_TOOL_SCHEMAS_V1[request.tool] || request.requestHash !== subscriptionHash({tool: request.tool, toolSchemaDigest: request.toolSchemaDigest, arguments: request.arguments}))
        return fail('VIDEO_VOICE_OPERATION_INVALID');
      const n = await this.native(scope);
      await this.mcp.mutateHeygenCreativeV1(n.def, n.token, {tool: request.tool, arguments: request.arguments}, n.guard, hooks);
    },
    encryptReceipt: raw => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Buffer.byteLength(JSON.stringify(raw)) > 1024 * 1024) return fail('VIDEO_VOICE_RECEIPT_INVALID');
      return AuthService.fixedEncryption(JSON.stringify(raw));
    },
    decryptReceipt: ciphertext => {
      let raw: unknown; try {raw = JSON.parse(AuthService.fixedDecryption(ciphertext));} catch {return fail('VIDEO_VOICE_RECEIPT_INVALID');}
      if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Buffer.byteLength(JSON.stringify(raw)) > 1024 * 1024) return fail('VIDEO_VOICE_RECEIPT_INVALID');
      return raw as Record<string, unknown>;
    },
    // Success field names are deliberately absent until actual MCP response contracts are qualified.
    importSpeechResult: async (scope, result, operationId) => {
      const saved = await this.saveAsset(scope, 'audio', operationId, this.resultUrl(result.resultRef), 'HeyGen voice audition');
      const measured = await this.inspectAccessibleAudio(scope, saved.mediaId);
      return {...measured, origin: 'generated_preview'};
    },
    verifyHumanDecision: async (scope, proof, approvedDigest) => (humanProofs.get(subscriptionHash(proof)) ?? 0) > Date.now() && proof.organizationId === scope.organizationId &&
      proof.actorId === scope.actorId && proof.approvedDigest === approvedDigest,
    assertNativeApproval: async (scope, operation, proof) => {
      if (!proof || typeof proof !== 'object' || !nativeProofs.has(proof)) return fail('VIDEO_VOICE_NATIVE_APPROVAL_REQUIRED');
      const p = proof as NativeProof;
      if (!sameScope(scope, p) || p.setupId !== scope.setupId || p.operationId !== operation.operationId || p.requestHash !== operation.requestHash || !p.decisionId ||
        !Number.isFinite(Date.parse(p.expiresAt)) || Date.parse(p.expiresAt) <= this.now().getTime()) return fail('VIDEO_VOICE_NATIVE_APPROVAL_REQUIRED');
    },
  };

  private resultUrl(raw: unknown): string {
    try {const url = new URL(typeof raw === 'string' ? raw : ''); if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error(); return url.href;}
    catch {return fail('VIDEO_CREATIVE_RESULT_URL_UNSAFE');}
  }
  private async saveAsset(scope: Scope, kind: 'image' | 'audio', stableKey: string, url: string, label: string, allowedOrigin?: string) {
    await this.local(scope);
    if (!stableKey || stableKey.length > 1000) return fail('VIDEO_CREATIVE_MEDIA_KEY_INVALID');
    const key = subscriptionHash({organizationId: scope.organizationId, actorId: scope.actorId, connectionId: scope.connectionId, subjectDigest: scope.subjectDigest, kind, stableKey});
    const pending = this.saves.get(key); if (pending) return pending;
    const save = async () => {
      const mediaId = uuidFromHash(key), receiptId = `heygen-creative-upload:${key}`;
      let receipt = await this.store.read<{actorId: string; subjectDigest: string; kind: string; stored: StoredAsset}>(scope.organizationId, 'action', receiptId);
      if (receipt && (receipt.parentId !== parent(scope.actorId) || receipt.payload.actorId !== scope.actorId || receipt.payload.subjectDigest !== scope.subjectDigest || receipt.payload.kind !== kind)) return fail('VIDEO_CREATIVE_MEDIA_BINDING_INVALID');
      if (!receipt) {
        const resultUrl = this.resultUrl(url);
        const stored = kind === 'image'
          ? await (allowedOrigin ? this.media.importImage(resultUrl, allowedOrigin) : this.media.importImage(resultUrl))
          : await this.media.importAudio(resultUrl);
        receipt = await this.store.put({organizationId: scope.organizationId, kind: 'action', id: receiptId, expectedRevision: 0,
          parentId: parent(scope.actorId), sourceIds: [], payload: {actorId: scope.actorId, subjectDigest: scope.subjectDigest, kind, stored}});
      }
      const stored = receipt.payload.stored;
      if (kind === 'audio') {
        const markerId = `heygen-generated-audio:${subscriptionHash({organizationId: scope.organizationId, mediaId})}`;
        if (!await this.store.read(scope.organizationId, 'action', markerId)) await this.store.put({organizationId: scope.organizationId, kind: 'action', id: markerId,
          expectedRevision: 0, parentId: parent(scope.actorId), sourceIds: [], payload: {type: 'heygen_generated_audio/v1', mediaId}});
      }
      await this.connections.repository.transaction(async tx => {
        const existing = await tx.media.findFirst({where: {organizationId: scope.organizationId, id: mediaId, deletedAt: null}});
        if (existing) {
          if (existing.type !== kind || existing.fileSize !== stored.size || existing.path !== stored.path) return fail('VIDEO_CREATIVE_MEDIA_BINDING_INVALID');
          return existing;
        }
        const extension = kind === 'image' ? ({'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp'} as Record<string, string>)[stored.mimeType]
          : ({'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg'} as Record<string, string>)[stored.mimeType];
        if (!extension) return fail('VIDEO_CREATIVE_MEDIA_BINDING_INVALID');
        return tx.media.create({data: {id: mediaId, organizationId: scope.organizationId, type: kind, fileSize: stored.size,
          name: `heygen-${kind}-${mediaId}.${extension}`, originalName: `${safeLabel(label, 'HeyGen preview')}.${extension}`, path: stored.path}});
      });
      return {mediaId, stored};
    };
    const result = save(); this.saves.set(key, result);
    try {return await result;} finally {this.saves.delete(key);}
  }
}
