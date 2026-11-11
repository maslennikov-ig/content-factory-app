import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { v5 as uuidv5 } from 'uuid';
import { z } from 'zod';
import { VideoAccessService } from '../video-access.service';
import { parseVideoV1, videoErrorV1, videoSettingsV1, validateVideoGroundingV1, videoSourceRevisionV1 } from '../video-brief.v1';
import { subscriptionHash } from './video-provider-registry';
import { HeygenPersonProfileServiceV1 } from './video-heygen-person-profile.service.v1';
import { HeygenPersonProfileInputSchemaV1, HeygenPersonProfileConfirmationSchemaV1, heygenPersonProfileApprovalDigestV1 } from './video-heygen-person-profile.v1';
import { HeygenVideoSettingsSchemaV2, HeygenVoiceBaselineSchemaV2, HeygenVoiceEngineSettingsSchemaV2 } from './video-heygen-settings.v2';
import { readHeygenSettingsQualificationV2, assertHeygenApprovedVoiceBaselineV2 } from './video-heygen-settings-admission.v2';
import { HeygenAutopilotScopeServiceV2, HeygenAutopilotScopeInputV2 } from './video-heygen-autopilot-scope.v2';
import { HEYGEN_NATIVE_REQUEST_KIND_V2, parseHeygenAvatarRequest } from './video-heygen-avatar-request.v2';
import { HeygenStyleServiceV1 } from './video-heygen-style.service.v1';
import { HeygenCreativeAdapterV1 } from './video-heygen-creative-adapter.v1';
import { assertHeygenAppearanceLineageV2 } from './video-heygen-style-admission.v2';
import { EditorialDecisionService } from '../../content-intelligence/social-factory/autonomy/editorial-decision.service';

export const HeygenProfileSaveSchemaV1 = z.object({
  profile: HeygenPersonProfileConfirmationSchemaV1,
  selectionDigest: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export const HeygenProfileResolveSchemaV1 = z.object({connectionId: z.string().uuid(), profileId: z.string().uuid().optional(),
  name: z.string().min(1).max(120).optional(), groupId: z.string().max(200).optional(), lookId: z.string().max(200).optional()}).strict();
const overrides = HeygenVideoSettingsSchemaV2.omit({version: true, sourceLookId: true, sourceGroupId: true, appearanceLookId: true,
  groupId: true, animationReferenceLookId: true, voiceId: true, sourceMode: true, audioAssetId: true, voiceSettings: true}).partial()
  .extend({voiceSettings: HeygenVoiceBaselineSchemaV2.optional(),
    brandGlossaryId: HeygenVideoSettingsSchemaV2.shape.brandGlossaryId.nullable(),
    background: HeygenVideoSettingsSchemaV2.shape.background.nullable()}).strict();
export const HeygenChatPrepareSchemaV2 = z.object({draftId: z.string().uuid(), version: z.number().int().positive(), connectionId: z.string().uuid(),
  profileId: z.string().uuid().optional(), name: z.string().min(1).max(120).optional(), groupId: z.string().max(200).optional(),
  sourceLookId: z.string().max(200).optional(), appearanceLookId: z.string().max(200).optional(), animationReferenceLookId: z.string().max(200).optional(),
  styleOperationId: z.string().uuid().optional(), backgroundAssetId: z.string().min(1).max(200).optional(),
  overrides: overrides.optional()}).strict();
export const HeygenGlossaryEditSchemaV1 = z.object({draftId: z.string().uuid(), version: z.number().int().positive(),
  glossaryId: z.string().min(1).max(200).nullable()}).strict();
export const HeygenBackgroundEditSchemaV1 = z.object({draftId: z.string().uuid(), version: z.number().int().positive(),
  backgroundAssetId: z.string().min(1).max(200).nullable()}).strict();

/** Coordinates the existing catalog and private companion store. Never generates or spends. */
@Injectable()
export class HeygenChatControlsServiceV1 {
  constructor(readonly profiles: HeygenPersonProfileServiceV1, readonly access: VideoAccessService, readonly scopes: HeygenAutopilotScopeServiceV2,
    readonly editorial: EditorialDecisionService, readonly styles: HeygenStyleServiceV1, readonly creative: HeygenCreativeAdapterV1) {}

  private assetContext(org: string) {
    return {organizationId: org, media: this.access.media, mediaRow: (organizationId: string, id: string) =>
      this.access.apiRepository.media(organizationId, id)};
  }

  private async observed(org: string, actor: string, connectionId: string) {
    const credential = await this.access.connections.token(org, actor, connectionId, undefined, 'discovery');
    if (credential.connection.provider !== 'heygen') return videoErrorV1('VIDEO_PROVIDER_INVALID', 409);
    const def = await this.access.connections.connectable(org, 'heygen');
    const assets = await this.access.assets(org, actor, connectionId);
    if (!assets.catalog) return videoErrorV1('VIDEO_SUBSCRIPTION_OPTION_UNAVAILABLE', 409);
    const account = await this.access.subscriptions.heygen.nativeAccount(def, credential.token, credential.assertUsable);
    await credential.assertUsable();
    return {catalog: assets.catalog, accountDigest: account.subjectDigest, accountGeneration: credential.connection.generation};
  }

  async proposeProfile(org: string, actor: string, value: unknown) {
    const input = parseVideoV1(HeygenPersonProfileInputSchemaV1, value);
    const observed = await this.observed(org, actor, input.connectionId);
    const avatarIds = new Set(input.sourceLooks.map(look => look.lookId));
    const looks = observed.catalog.avatars.filter(look => avatarIds.has(look.id));
    const voice = observed.catalog.voices.find(voice => voice.id === input.defaultVoice.voiceId);
    if (looks.length !== avatarIds.size || !voice) return videoErrorV1('VIDEO_SUBSCRIPTION_OPTION_UNAVAILABLE', 409);
    if (input.defaultVoice.engine || input.defaultVoice.baseline?.engineSettings) {
      // A private voice catalog proves ownership, not a TTS engine. In
      // particular, "HeyGen" in the provider name does not select heygen_voice.
      // Retain a genuinely saved human baseline; never invent one at setup.
      const saved = input.expectedRevision > 0 ? await this.profiles.read(org, actor, input.profileId, observed) : null;
      if (!saved?.setupReusable || saved.connectionId !== input.connectionId || saved.revision !== input.expectedRevision ||
        subscriptionHash(saved.defaultVoice) !== subscriptionHash(input.defaultVoice)) return videoErrorV1('VIDEO_VOICE_ENGINE_UNAVAILABLE', 409);
    }
    const selectionDigest = subscriptionHash({profile: input, accountDigest: observed.accountDigest, looks, voice});
    return {profile: input, selectionDigest, name: input.displayName,
      looks: looks.map(look => ({id: look.id, name: look.name, groupId: look.groupId})),
      voice: {id: voice.id, name: voice.name},
      generated: false, submitted: false, requiresHumanConfirmation: true};
  }

  /** Only a native argument-bound confirmation or an authenticated screen action calls this method. */
  async saveProfile(org: string, actor: string, value: unknown, source: 'authenticated_screen_action' | 'confirmed_chat_action', decisionId: string = randomUUID()) {
    const input = parseVideoV1(HeygenProfileSaveSchemaV1, value);
    if (source === 'confirmed_chat_action' && !z.string().uuid().safeParse(decisionId).success) {
      if (typeof decisionId !== 'string' || !decisionId.trim() || decisionId.length > 500)
        return videoErrorV1('VIDEO_PROFILE_HUMAN_DECISION_REQUIRED', 409);
      // Native tool-call IDs are provider-defined, not UUIDs. Preserve their
      // exact identity in a deterministic, actor/profile/selection-bound UUID
      // without weakening the domain's human decision schema or replay fence.
      decisionId = uuidv5(JSON.stringify(['heygen-profile-native-decision/v1', org, actor,
        input.profile.profileId, input.profile.connectionId, input.selectionDigest, decisionId]),
        '9f005ae0-746d-5d71-8b8f-0b9f9f6b9201');
    }
    const proposal = await this.proposeProfile(org, actor, input.profile);
    if (proposal.selectionDigest !== input.selectionDigest) return videoErrorV1('VIDEO_PROFILE_SELECTION_CHANGED', 409);
    const observed = await this.observed(org, actor, input.profile.connectionId);
    // A reconnect or resource change between proposal and save must not change the reviewed identity.
    const lookIds = new Set(input.profile.sourceLooks.map(look => look.lookId));
    const looks = observed.catalog.avatars.filter(look => lookIds.has(look.id));
    const voice = observed.catalog.voices.find(voice => voice.id === input.profile.defaultVoice.voiceId);
    if (subscriptionHash({profile: input.profile, accountDigest: observed.accountDigest, looks, voice}) !== input.selectionDigest)
      return videoErrorV1('VIDEO_PROFILE_SELECTION_CHANGED', 409);
    const previous = input.profile.expectedRevision > 0
      ? await this.profiles.read(org, actor, input.profile.profileId, observed) : null;
    return this.profiles.saveHumanConfirmed(org, actor, input.profile, {
      decisionId, source, approvedDigest: heygenPersonProfileApprovalDigestV1(org, actor, input.profile, observed.accountDigest),
      previewMediaBindings: previous?.sourceLooks.flatMap(look => look.previewMediaId
        ? [{lookId: look.lookId, groupId: look.groupId, mediaId: look.previewMediaId}] : []),
      observedAt: this.access.connections.runtime.now().toISOString(), ...observed,
    });
  }

  async listProfiles(org: string, actor: string, connectionId: string, cursor?: string) {
    const pageCursor = parseVideoV1(z.string().uuid().optional(), cursor);
    const observed = await this.observed(org, actor, connectionId);
    return this.profiles.list(org, actor, {connectionId, ...(pageCursor ? {cursor: pageCursor} : {})}, observed);
  }
  async resolveProfile(org: string, actor: string, value: unknown) {
    const input = parseVideoV1(HeygenProfileResolveSchemaV1, value);
    return this.profiles.resolve(org, actor, {...input, connectionId: input.connectionId!}, await this.observed(org, actor, input.connectionId));
  }
  async profilePreview(org: string, actor: string, profileId: string, lookId: string) {
    const profile = await this.profiles.read(org, actor, profileId);
    const selected = profile.sourceLooks.find(look => look.lookId === lookId);
    const image = selected?.previewMediaId ? await this.access.apiRepository.media(org, selected.previewMediaId) : null;
    if (!image || image.type !== 'image') return videoErrorV1('VIDEO_PROFILE_PREVIEW_UNAVAILABLE', 404);
    return {id: image.id, path: image.path, name: image.name, type: 'image' as const};
  }

  async advancedOptions(org: string, actor: string, draftId: string, version: number) {
    parseVideoV1(HeygenGlossaryEditSchemaV1, {draftId, version, glossaryId: null});
    await this.access.repository.member(org, actor);
    const draft = await this.access.apiRepository.draft(org, draftId);
    if (!draft || draft.userId !== actor) return videoErrorV1('VIDEO_DRAFT_NOT_FOUND', 404);
    if (draft.version !== version) return videoErrorV1('VIDEO_DRAFT_CHANGED', 409);
    const native = videoSettingsV1(draft.settings).heygenV2;
    if (!native) return videoErrorV1('VIDEO_PERFORMANCE_NATIVE_REQUIRED', 409);
    const {binding, settings} = native;
    const credential = await this.access.connections.token(org, actor, binding.connectionId, binding.accountGeneration,
      'discovery', {allowRefresh: false});
    const def = await this.access.connections.connectable(org, 'heygen');
    const options = await this.access.subscriptions.heygen.mcp.readHeygenAdvancedOptionsV1(def, credential.token, {
      subjectDigest: binding.subjectDigest, voiceId: settings.voiceId,
      appearance: {lookId: settings.appearanceLookId, groupId: settings.groupId}, includeGlossaries: true, includeAssets: true, browse: true,
    }, credential.assertUsable);
    const current = await this.access.apiRepository.draft(org, draftId);
    if (current?.version !== version) return videoErrorV1('VIDEO_DRAFT_CHANGED', 409);
    return {draftId, draftVersion: version, selectedGlossaryId: settings.brandGlossaryId ?? null,
      selectedVoiceEngine: settings.voiceSettings?.engineSettings?.engine_type ?? null, ...options};
  }

  async saveGlossary(org: string, actor: string, raw: unknown) {
    const input = parseVideoV1(HeygenGlossaryEditSchemaV1, raw);
    return this.saveQualifiedSettings(org, actor, await this.performanceContext(org, actor, input.draftId, input.version,
      {brandGlossaryId: input.glossaryId ?? undefined}));
  }

  async saveBackground(org: string, actor: string, raw: unknown) {
    const input = parseVideoV1(HeygenBackgroundEditSchemaV1, raw);
    return this.saveQualifiedSettings(org, actor, await this.performanceContext(org, actor, input.draftId, input.version,
      {backgroundAssetId: input.backgroundAssetId}));
  }

  private async saveQualifiedSettings(org: string, actor: string, context: Awaited<ReturnType<HeygenChatControlsServiceV1['performanceContext']>>) {
    const {draft, inner, binding, qualification} = context;
    this.access.subscriptions.heygen.nativeRecipeV2(binding, inner, (draft.brief as any).script, qualification);
    const settings = videoSettingsV1({...context.settings, heygenV2: {binding, settings: inner}});
    await context.guard();
    await this.access.api.assertCurrentSource(org, actor, draft);
    const saved = subscriptionHash(settings) === subscriptionHash(draft.settings) ? draft
      : await this.access.apiRepository.editDraft(org, draft.id, draft.version, draft.brief as any, settings);
    return {id: saved.id, pieceId: saved.pieceId, pieceRevision: saved.pieceRevision, version: saved.version, brief: saved.brief,
      settings: saved.settings, selectedGlossaryId: inner.brandGlossaryId ?? null, generated: false, submitted: false};
  }

  /** Current server observations for performance preparation; no caller-supplied qualification. */
  async performanceContext(org: string, actor: string, draftId: string, version: number,
    options?: {brandGlossaryId: string | undefined} | {scenePreparation: true} | {backgroundAssetId: string | null}) {
    const draft = await this.access.apiRepository.draft(org, draftId);
    if (!draft || draft.userId !== actor) return videoErrorV1('VIDEO_DRAFT_NOT_FOUND', 404);
    if (draft.version !== version) return videoErrorV1('VIDEO_DRAFT_CHANGED', 409);
    const settings = videoSettingsV1(draft.settings), v = settings.heygenV2;
    if (!v) return videoErrorV1('VIDEO_PERFORMANCE_NATIVE_REQUIRED', 409);
    await this.access.api.assertCurrentSource(org, actor, draft);
    const scenePreparation = !!options && 'scenePreparation' in options;
    const credential = await this.access.connections.token(org, actor, v.binding.connectionId, v.binding.accountGeneration,
      'discovery', {allowRefresh: !scenePreparation});
    if (credential.connection.provider !== 'heygen') return videoErrorV1('VIDEO_PROVIDER_INVALID', 409);
    if (v.binding.sourcePin.pieceId !== draft.pieceId || v.binding.sourcePin.sourceRevision !== draft.pieceRevision)
      return videoErrorV1('VIDEO_PROFILE_CHANGED', 409);
    if (v.binding.appearanceLineage) await assertHeygenAppearanceLineageV2(this.access.repository.db, org, actor, v);
    const profile = await this.profiles.freeze(org, actor, {connectionId: v.binding.connectionId, profileId: v.binding.profileId,
      expectedRevision: v.binding.profileRevision, expectedDigest: v.binding.profileDigest,
      groupId: v.settings.sourceGroupId, lookId: v.settings.sourceLookId, appearanceLookId: v.binding.appearanceLineage ? undefined : v.settings.appearanceLookId,
      animationReferenceLookId: v.settings.animationReferenceLookId},
      {accountDigest: v.binding.subjectDigest, accountGeneration: credential.connection.generation});
    assertHeygenApprovedVoiceBaselineV2(profile, v.settings);
    const def = await this.access.connections.connectable(org, 'heygen');
    const inner = {...v.settings};
    if (options && 'brandGlossaryId' in options) inner.brandGlossaryId = options.brandGlossaryId;
    if (options && 'backgroundAssetId' in options) {
      inner.background = options.backgroundAssetId
        ? await this.creative.bindOwnedBackgroundImage({organizationId: org, actorId: actor, connectionId: v.binding.connectionId!,
          subjectDigest: v.binding.subjectDigest!, accountGeneration: v.binding.accountGeneration!}, options.backgroundAssetId) : undefined;
    }
    if (inner.brandGlossaryId === undefined) delete inner.brandGlossaryId;
    if (inner.background === undefined) delete inner.background;
    const mcp = this.access.subscriptions.heygen.mcp;
    const qualification = await readHeygenSettingsQualificationV2(mcp, def, credential.token, v.binding, inner, credential.assertUsable, this.assetContext(org));
    return {draft, settings, binding: v.binding, inner, qualification, guard: credential.assertUsable,
      ...(scenePreparation ? {inspectSceneTools: async () => (await mcp.discoverQualification(def, credential.token, credential.assertUsable)).inventory} : {})};
  }

  /** Compose a clip recipe without changing reusable profile defaults or its human decision. */
  async prepareSettings(org: string, actor: string, raw: unknown) {
    const input = parseVideoV1(HeygenChatPrepareSchemaV2, raw);
    if (input.backgroundAssetId && input.overrides?.background) return videoErrorV1('VIDEO_REQUEST_INVALID', 400);
    const draft = await this.access.apiRepository.draft(org, input.draftId);
    if (!draft || draft.userId !== actor) return videoErrorV1('VIDEO_DRAFT_NOT_FOUND', 404);
    if (draft.version !== input.version) return videoErrorV1('VIDEO_DRAFT_CHANGED', 409);
    const brief = draft.brief as any;
    if (brief.scriptPolicy !== 'exact') return videoErrorV1('VIDEO_EXACT_SCRIPT_REQUIRED', 409);
    await this.access.api.assertCurrentSource(org, actor, draft);
    const observed = await this.observed(org, actor, input.connectionId);
    const derived = input.styleOperationId ? await this.styles.freezeAppearance(org, actor, input.styleOperationId, input.appearanceLookId) : null;
    const profile = await this.profiles.freeze(org, actor, {connectionId: input.connectionId, profileId: input.profileId, name: input.name,
      groupId: input.groupId ?? derived?.groupId, lookId: input.sourceLookId ?? derived?.baseLookId, appearanceLookId: derived ? undefined : input.appearanceLookId,
      animationReferenceLookId: input.animationReferenceLookId}, observed);
    if (derived && (derived.profileId !== profile.profileId || derived.profileRevision !== profile.profileRevision || derived.profileDigest !== profile.profileDigest || derived.baseLookId !== profile.baseLookId))
      return videoErrorV1('VIDEO_STYLE_LINEAGE_CHANGED', 409);
    const current = videoSettingsV1(draft.settings);
    const {brandGlossaryId, background: requestedBackground, ...chosen} = input.overrides ?? {};
    const sameAccount = current.heygenV2?.binding.connectionId === input.connectionId &&
      current.heygenV2.binding.subjectDigest === observed.accountDigest && current.heygenV2.binding.accountGeneration === observed.accountGeneration;
    const currentInner = sameAccount ? current.heygenV2?.settings : undefined;
    const glossary = brandGlossaryId === null ? undefined : brandGlossaryId ?? currentInner?.brandGlossaryId;
    const chosenEngine = chosen.voiceSettings?.engineSettings ?? profile.voiceBaseline?.engineSettings ??
      (profile.voiceEngine ? {engine_type: profile.voiceEngine} : undefined);
    if (chosenEngine && !HeygenVoiceEngineSettingsSchemaV2.safeParse(chosenEngine).success) return videoErrorV1('VIDEO_VOICE_ENGINE_UNAVAILABLE', 409);
    const background = input.backgroundAssetId ? await this.creative.bindOwnedBackgroundImage({organizationId: org, actorId: actor,
      connectionId: input.connectionId, subjectDigest: observed.accountDigest, accountGeneration: observed.accountGeneration}, input.backgroundAssetId)
      : requestedBackground === null ? undefined : requestedBackground ?? currentInner?.background;
    const inner = HeygenVideoSettingsSchemaV2.parse({version: 2, sourceLookId: profile.baseLookId, sourceGroupId: profile.groupId,
      appearanceLookId: derived?.appearanceLookId ?? profile.appearanceLookId, groupId: profile.groupId,
      ...(profile.animationReferenceLookId ? {animationReferenceLookId: profile.animationReferenceLookId} : {}),
      sourceMode: 'text', voiceId: profile.voiceId, engine: {type: 'avatar_iv'}, resolution: '720p', aspectRatio: current.aspectRatio,
      outputFormat: 'mp4', durationSeconds: current.duration, captions: current.captions ? 'burned' : 'none', ...chosen,
      ...(glossary ? {brandGlossaryId: glossary} : {}),
      ...(background ? {background} : {}),
      voiceSettings: {...profile.voiceBaseline, locale: current.locale, ...chosen.voiceSettings, ...(chosenEngine ? {engineSettings: chosenEngine} : {})}});
    assertHeygenApprovedVoiceBaselineV2(profile, inner);
    const binding = {profileId: profile.profileId, profileRevision: profile.profileRevision, profileDigest: profile.profileDigest,
      connectionId: input.connectionId, subjectDigest: observed.accountDigest, accountGeneration: observed.accountGeneration,
      ...(derived ? {appearanceLineage: {operationId: derived.operationId, operationRevision: derived.operationRevision,
        requestHash: derived.requestHash, mediaId: derived.mediaId, lineageDigest: derived.lineageDigest}} : {}),
      sourcePin: {pieceId: draft.pieceId, sourceRevision: draft.pieceRevision, ...(brief.sourceArtifact ? {sourceArtifact: brief.sourceArtifact.ref} : {})}};
    const credential = await this.access.connections.token(org, actor, input.connectionId, observed.accountGeneration, 'discovery');
    const def = await this.access.connections.connectable(org, 'heygen');
    const qualification = await readHeygenSettingsQualificationV2(this.access.subscriptions.heygen.mcp, def, credential.token, binding, inner, credential.assertUsable, this.assetContext(org));
    const recipe = this.access.subscriptions.heygen.nativeRecipeV2(binding, inner, brief.script, qualification);
    const settings = videoSettingsV1({...current, provider: 'heygen', model: 'heygen-avatar', mode: 'presenter', avatarId: inner.appearanceLookId,
      voiceId: inner.voiceId, engine: inner.engine.type, locale: inner.voiceSettings!.locale, duration: inner.durationSeconds,
      resolution: inner.resolution, aspectRatio: inner.aspectRatio, audio: true, captions: inner.captions !== 'none', heygenV2: {binding, settings: inner}});
    validateVideoGroundingV1(brief, settings);
    await credential.assertUsable();
    await this.access.api.assertCurrentSource(org, actor, draft);
    const saved = subscriptionHash(settings) === subscriptionHash(draft.settings) ? draft
      : await this.access.apiRepository.editDraft(org, draft.id, draft.version, brief, settings);
    return {id: saved.id, pieceId: saved.pieceId, version: saved.version, brief: saved.brief, settings: saved.settings,
      profile: {id: profile.profileId, revision: profile.profileRevision}, recipeHash: recipe.recipeHash,
      access: {kind: 'subscription' as const, connectionId: input.connectionId}, generated: false, submitted: false,
      artifactName: inner.title ?? 'HeyGen — video settings', requiresPreflight: true};
  }

  async previewScope(org: string, actor: string, raw: unknown) {
    const input = parseVideoV1(HeygenAutopilotScopeInputV2, raw);
    const observed = await this.observed(org, actor, input.connectionId);
    await this.profiles.freeze(org, actor, {connectionId: input.connectionId, profileId: input.profileId,
      expectedRevision: input.profileRevision, expectedDigest: input.profileDigest}, observed);
    const profile = await this.profiles.read(org, actor, input.profileId, observed);
    const piece = await this.access.apiRepository.piece(org, input.pieceId);
    if (!piece || videoSourceRevisionV1(piece) !== input.sourceRevision) return videoErrorV1('VIDEO_SOURCE_CHANGED', 409);
    return {input, presenter: profile.displayName, voice: observed.catalog.voices.find(voice => voice.id === profile.defaultVoice.voiceId)?.name,
      source: {id: piece.id, title: piece.title, revision: input.sourceRevision}, providerBillingCap: false,
      accountBindingDigest: subscriptionHash({subjectDigest: observed.accountDigest, connectionId: input.connectionId}), publicationAuthorized: false};
  }
  async authorizeScope(org: string, actor: string, threadId: string, raw: unknown, decisionId: string) {
    const {input} = await this.previewScope(org, actor, raw);
    const observed = await this.observed(org, actor, input.connectionId);
    return this.scopes.authorize(org, actor, threadId, input,
      {id: decisionId, subjectDigest: observed.accountDigest, now: this.access.connections.runtime.now()});
  }

  async launchScoped(org: string, actor: string, threadId: string, scopeId: string, preflightId: string) {
    const approval = await this.access.approval(org, actor, preflightId, true);
    const row = await this.access.repository.db.videoAccessPreflight.findFirst({where: {id: preflightId, organizationId: org, actorId: actor}});
    if (!row) return videoErrorV1('VIDEO_PREFLIGHT_STALE', 409);
    const request = parseHeygenAvatarRequest(row.request);
    if (request.kind !== HEYGEN_NATIVE_REQUEST_KIND_V2) return videoErrorV1('VIDEO_AUTOPILOT_VERSION_REQUIRED', 409);
    const {binding} = request.recipe;
    const observed = await this.observed(org, actor, binding.connectionId);
    await this.profiles.freeze(org, actor, {connectionId: binding.connectionId, profileId: binding.profileId,
      expectedRevision: binding.profileRevision, expectedDigest: binding.profileDigest}, observed);
    if (observed.accountDigest !== request.subjectDigest) return videoErrorV1('VIDEO_CONNECTION_CHANGED', 409);
    const claim = await this.scopes.claim(org, actor, threadId, scopeId, {preflightId, recipeHash: request.recipe.recipeHash,
      subjectDigest: request.subjectDigest, connectionId: binding.connectionId, profileId: binding.profileId,
      profileRevision: binding.profileRevision, profileDigest: binding.profileDigest, pieceId: binding.sourcePin.pieceId,
      sourceRevision: binding.sourcePin.sourceRevision, approvalExpiresAt: approval.expiresAt}, this.access.connections.runtime.now());
    return this.access.launch(org, actor, {preflightId, intentId: claim.intentId}, {scopeId, threadId, intentId: claim.intentId, preflightId, recipeHash: request.recipe.recipeHash});
  }

  async creativeDecision(org: string, actor: string, threadId: string, input: {
    scopeId: string; draftId: string; requestId: string; question: string;
  }, executorModelId: string) {
    if (!executorModelId) return videoErrorV1('VIDEO_DISTINCT_EXPERT_UNVERIFIED', 409);
    const initialScope = await this.scopes.read(org, actor, threadId, input.scopeId, this.access.connections.runtime.now());
    const draft = await this.access.apiRepository.draft(org, input.draftId);
    if (!draft || draft.userId !== actor) return videoErrorV1('VIDEO_DRAFT_NOT_FOUND', 404);
    const settings = videoSettingsV1(draft.settings), binding = settings.heygenV2?.binding;
    if (!binding) return videoErrorV1('VIDEO_AUTOPILOT_VERSION_REQUIRED', 409);
    const assertCurrentScope = async (): Promise<void> => {
      const scope = await this.scopes.read(org, actor, threadId, input.scopeId, this.access.connections.runtime.now());
      const current = await this.access.apiRepository.draft(org, input.draftId);
      if (!current || current.userId !== actor || current.version !== draft.version || subscriptionHash(current.settings) !== subscriptionHash(draft.settings))
        return videoErrorV1('VIDEO_DRAFT_CHANGED', 409);
      for (const key of ['profileId', 'profileRevision', 'profileDigest', 'connectionId'] as const)
        if (scope[key] !== binding[key]) return videoErrorV1('VIDEO_AUTOPILOT_SCOPE_CHANGED', 409);
      if (scope.pieceId !== draft.pieceId || scope.sourceRevision !== draft.pieceRevision || scope.subjectDigest !== binding.subjectDigest)
        return videoErrorV1('VIDEO_AUTOPILOT_SCOPE_CHANGED', 409);
      await this.access.api.assertCurrentSource(org, actor, current);
      const observed = await this.observed(org, actor, binding.connectionId);
      await this.profiles.freeze(org, actor, {connectionId: binding.connectionId, profileId: binding.profileId,
        expectedRevision: binding.profileRevision, expectedDigest: binding.profileDigest}, observed);
      if (observed.accountDigest !== scope.subjectDigest) return videoErrorV1('VIDEO_CONNECTION_CHANGED', 409);
    };
    const {claims, expertAttempts, ...immutableScope} = initialScope;
    return this.editorial.decideVideoCreative(org, actor, {requestId: input.requestId, question: input.question, executorModelId,
      scope: {grantId: initialScope.id, scopeDigest: subscriptionHash(immutableScope), draftId: draft.id, draftRevision: draft.version,
        sourceDigest: draft.pieceRevision, profileId: binding.profileId, profileRevision: binding.profileRevision, profileDigest: binding.profileDigest},
      context: {speech: (draft.brief as any).script, ordinarySettings: settings.heygenV2!.settings}},
      {assertCurrentScope, claimExpertAttempt: key => this.scopes.claimExpertAttempt(org, actor, threadId, input.scopeId, key, this.access.connections.runtime.now())});
  }
}
