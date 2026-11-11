import { Injectable, Optional } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { parseVideoV1, videoErrorV1 } from '../video-brief.v1';
import { subscriptionHash } from './video-provider-registry';
import { HeygenStyleServiceV1 } from './video-heygen-style.service.v1';
import { HeygenVoiceSetupServiceV1 } from './video-heygen-voice-setup.service.v1';
import { HeygenVoiceIntakeSchemaV1, HeygenVoiceSelectionInputSchemaV1, type HeygenVoiceSetupViewV1 } from './video-heygen-voice-setup.v1';
import {
  HeygenCreativeAdapterV1, heygenCreativeHumanDecisionProofV1, heygenCreativeNativeApprovalProofV1,
  heygenCreativeOriginalRecordingProofV1, heygenCreativeStyleApprovalProofV1,
} from './video-heygen-creative-adapter.v1';
import type { HeygenStyleViewV1 } from './video-heygen-style.v1';
import { heygenPersonProfileApprovalDigestV1 } from './video-heygen-person-profile.v1';

const uuid = z.string().uuid(), revision = z.number().int().positive(), digest = z.string().regex(/^[a-f0-9]{64}$/);
export const HeygenStyleOperationInputSchemaV1 = z.object({operationId: uuid}).strict();
export const HeygenStyleSubmitInputSchemaV1 = z.object({operationId: uuid, expectedRevision: revision, requestHash: digest}).strict();
export const HeygenStyleSelectInputSchemaV1 = z.object({operationId: uuid, lookId: z.string().regex(/^[A-Za-z0-9_-]{1,200}$/), expectedRevision: revision}).strict();
export const HeygenVoiceSetupReadInputSchemaV1 = z.object({setupId: uuid}).strict();
export const HeygenVoiceOperationInputSchemaV1 = z.object({setupId: uuid, operationId: uuid}).strict();
export const HeygenVoiceExecuteInputSchemaV1 = HeygenVoiceOperationInputSchemaV1.extend({requestHash: digest}).strict();

export interface HeygenStyleVoiceHumanActionV1 {
  organizationId: string; actorId: string; source: 'confirmed_chat_action' | 'authenticated_screen_action';
  toolId: string; inputHash: string; decisionId: string; approvalFingerprint: string; threadId?: string; at: string; expiresAt: string;
}
const actions = new WeakSet<object>();
/** Server-only constructor. Native callers verify the real exact fingerprint before minting. */
export function heygenStyleVoiceHumanActionV1(input: {organizationId: string; actorId: string; source: HeygenStyleVoiceHumanActionV1['source'];
  toolId: string; input: unknown; approvalFingerprint: string; threadId?: string}): HeygenStyleVoiceHumanActionV1 {
  const inputHash = subscriptionHash({toolId: input.toolId, input: input.input});
  const hex = createHash('sha256').update(JSON.stringify([input.organizationId, input.actorId, input.source, input.toolId, inputHash, input.threadId ?? null])).digest('hex');
  const now = new Date();
  const action = Object.freeze({organizationId: input.organizationId, actorId: input.actorId, source: input.source, toolId: input.toolId, inputHash,
    decisionId: `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`,
    approvalFingerprint: input.approvalFingerprint, ...(input.threadId ? {threadId: input.threadId} : {}), at: now.toISOString(), expiresAt: new Date(now.getTime() + 10 * 60_000).toISOString()});
  actions.add(action); return action;
}

/** Shares screen/native calls and existing stores. It never accepts authority in product input. */
@Injectable()
export class HeygenStyleVoiceServiceV1 {
  constructor(readonly styles: HeygenStyleServiceV1, readonly voices: HeygenVoiceSetupServiceV1,
    @Optional() readonly creative?: HeygenCreativeAdapterV1) {}
  private adapter() {return this.creative ?? videoErrorV1('VIDEO_CREATIVE_ADAPTER_UNAVAILABLE', 409);}
  private human(org: string, actor: string, toolId: string, input: unknown, proof: HeygenStyleVoiceHumanActionV1) {
    if (!proof || !actions.has(proof) || proof.organizationId !== org || proof.actorId !== actor || proof.toolId !== toolId ||
      proof.inputHash !== subscriptionHash({toolId, input}) || !proof.approvalFingerprint || Date.parse(proof.expiresAt) <= Date.now())
      return videoErrorV1('VIDEO_HUMAN_DECISION_REQUIRED', 409);
    return proof;
  }
  private styleArtifact(value: HeygenStyleViewV1) {
    return {...value, artifact: {kind: 'heygen_style_operation' as const, id: value.operationId, name: value.name, reopenTool: 'video.heygen_style_status'}};
  }
  private voiceArtifact(value: HeygenVoiceSetupViewV1) {
    return {...value, artifact: {kind: 'heygen_voice_setup' as const, id: value.setupId, name: value.original?.label ?? 'Voice setup', reopenTool: 'video.heygen_voice_status'},
      ...(value.profileId && value.selection?.decision === 'select' ? {profileApply: {profileId: value.profileId, tool: 'video.heygen_voice_apply_selected', createsVoice: false}} : {})};
  }
  async stylePrepare(org: string, actor: string, raw: unknown) {return this.styleArtifact(await this.styles.prepare(org, actor, raw));}
  async styleStatus(org: string, actor: string, operationId: string) {return this.styleArtifact(await this.styles.read(org, actor, operationId));}
  async styleRecover(org: string, actor: string, operationId: string) {return this.styleArtifact(await this.styles.recover(org, actor, operationId));}
  async styleSelect(org: string, actor: string, raw: unknown) {
    const input = parseVideoV1(HeygenStyleSelectInputSchemaV1, raw);
    return this.styleArtifact(await this.styles.selectOwnedPreview(org, actor, input.operationId, {lookId: input.lookId!, expectedRevision: input.expectedRevision!}));
  }
  async styleReview(org: string, actor: string, raw: unknown) {
    const input = parseVideoV1(HeygenStyleSubmitInputSchemaV1, raw), value = await this.styles.read(org, actor, input.operationId);
    if (input.expectedRevision !== value.revision || input.requestHash !== value.requestHash) return videoErrorV1('VIDEO_STYLE_OPERATION_CHANGED', 409);
    const profile = await this.styles.profiles.read(org, actor, value.profileId);
    const base = profile.observations.looks.find(look => look.lookId === value.baseLookId && look.groupId === value.groupId);
    return {operationId: value.operationId, requestHash: value.requestHash, revision: value.revision, name: value.name,
      profileName: profile.displayName, baseLookName: base?.name ?? value.name, baseLookId: value.baseLookId, groupId: value.groupId,
      prompt: value.prompt, referenceMediaIds: value.referenceMediaIds, blockers: value.blockers,
      allowedAttempts: 1, resultKind: 'image' as const, cost: null as null, costStatus: 'unknown', generationAuthorized: false as const};
  }
  async styleSubmit(org: string, actor: string, raw: unknown, proof: HeygenStyleVoiceHumanActionV1) {
    const input = parseVideoV1(HeygenStyleSubmitInputSchemaV1, raw), human = this.human(org, actor, 'video.heygen_style_submit', input, proof);
    await this.styleReview(org, actor, input);
    const adapter = this.adapter();
    return this.styleArtifact(await this.styles.submit(org, actor, input.operationId, async context => {
      const authorization = {decisionId: human.decisionId, scopeId: human.approvalFingerprint, organizationId: org, actorId: actor,
        operationId: context.operationId, requestHash: context.requestHash, connectionId: context.connectionId,
        accountDigest: context.accountDigest, accountGeneration: context.accountGeneration, expiresAt: human.expiresAt, funding: 'personal_subscription' as const};
      return adapter.authorizeStyle(context, heygenCreativeStyleApprovalProofV1(authorization));
    }));
  }
  async voiceIntakeReview(org: string, actor: string, raw: unknown) {
    const proposed = await this.voices.proposeIntake(org, actor, raw, this.adapter().voiceAdapter);
    return {...proposed.review, reviewDigest: proposed.approvedDigest};
  }
  async voiceIntake(org: string, actor: string, raw: unknown, proof: HeygenStyleVoiceHumanActionV1) {
    const input = parseVideoV1(HeygenVoiceIntakeSchemaV1, raw), human = this.human(org, actor, 'video.heygen_voice_intake', input, proof), adapter = this.adapter();
    const proposed = await this.voices.proposeIntake(org, actor, input, adapter.voiceAdapter);
    if (proposed.original) await adapter.registerOriginalRecording(proposed.scope, proposed.original.mediaId, heygenCreativeOriginalRecordingProofV1({
      organizationId: org, actorId: actor, connectionId: proposed.scope.connectionId, subjectDigest: proposed.scope.subjectDigest,
      accountGeneration: proposed.scope.accountGeneration, mediaId: proposed.original.mediaId, contentDigest: proposed.original.contentDigest,
      decisionId: human.decisionId, approvedDigest: proposed.approvedDigest, at: human.at}));
    const decision = heygenCreativeHumanDecisionProofV1({decisionId: human.decisionId, organizationId: org, actorId: actor,
      source: human.source, approvedDigest: proposed.approvedDigest, at: human.at});
    return this.voiceArtifact(await this.voices.intake(org, actor, input, adapter.voiceAdapter, decision));
  }
  async voiceStatus(org: string, actor: string, setupId: string) {return this.voiceArtifact(await this.voices.read(org, actor, setupId, this.adapter().voiceAdapter));}
  async voicePrepareAuditions(org: string, actor: string, raw: unknown) {return this.voiceArtifact(await this.voices.prepareAuditions(org, actor, raw, this.adapter().voiceAdapter));}
  async voicePrepareClone(org: string, actor: string, raw: unknown) {return this.voiceArtifact(await this.voices.prepareClone(org, actor, raw, this.adapter().voiceAdapter));}
  async voiceOperationReview(org: string, actor: string, raw: unknown) {
    const input = parseVideoV1(HeygenVoiceExecuteInputSchemaV1, raw), proposed = await this.voices.operationApproval(org, actor, {setupId: input.setupId!, operationId: input.operationId!}, this.adapter().voiceAdapter);
    if (input.requestHash !== proposed.operation.requestHash) return videoErrorV1('VIDEO_VOICE_APPROVAL_STALE', 409);
    return {...proposed.review, requestHash: proposed.operation.requestHash, reviewDigest: proposed.approvedDigest};
  }
  async voiceExecute(org: string, actor: string, raw: unknown, proof: HeygenStyleVoiceHumanActionV1) {
    const input = parseVideoV1(HeygenVoiceExecuteInputSchemaV1, raw), human = this.human(org, actor, 'video.heygen_voice_execute', input, proof), adapter = this.adapter();
    const operationInput = {setupId: input.setupId!, operationId: input.operationId!};
    const proposed = await this.voices.operationApproval(org, actor, operationInput, adapter.voiceAdapter);
    if (input.requestHash !== proposed.operation.requestHash) return videoErrorV1('VIDEO_VOICE_APPROVAL_STALE', 409);
    const approval = heygenCreativeNativeApprovalProofV1(proposed.scope, {operationId: input.operationId, requestHash: proposed.operation.requestHash,
      decisionId: human.decisionId, expiresAt: human.expiresAt});
    return {...this.voiceArtifact(await this.voices.execute(org, actor, operationInput, adapter.voiceAdapter, approval)), requestedOperationId: input.operationId};
  }
  async voiceRecover(org: string, actor: string, raw: unknown) {
    const input = parseVideoV1(HeygenVoiceOperationInputSchemaV1, raw);
    return this.voiceArtifact(await this.voices.recover(org, actor, {setupId: input.setupId!, operationId: input.operationId!}, this.adapter().voiceAdapter));
  }
  async voiceSelectionReview(org: string, actor: string, raw: unknown) {
    const proposed = await this.voices.proposeSelection(org, actor, raw, this.adapter().voiceAdapter);
    const profile = proposed.review.profileId ? await this.styles.profiles.read(org, actor, proposed.review.profileId,
      {accountDigest: proposed.scope.subjectDigest, accountGeneration: proposed.scope.accountGeneration}) : null;
    return {...proposed.review, ...(profile ? {profileName: profile.displayName, profileRevision: profile.revision} : {}),
      reviewDigest: subscriptionHash({choice: proposed.approvedDigest, profileDigest: profile?.digest ?? null, profileRevision: profile?.revision ?? null})};
  }
  async voiceSelect(org: string, actor: string, raw: unknown, proof: HeygenStyleVoiceHumanActionV1) {
    const input = parseVideoV1(HeygenVoiceSelectionInputSchemaV1, raw), human = this.human(org, actor, 'video.heygen_voice_select', input, proof), adapter = this.adapter();
    const proposed = await this.voices.proposeSelection(org, actor, input, adapter.voiceAdapter);
    const decision = heygenCreativeHumanDecisionProofV1({decisionId: human.decisionId, organizationId: org, actorId: actor,
      source: human.source, approvedDigest: proposed.approvedDigest, at: human.at});
    const profile = proposed.review.profileId && input.decision === 'select' ? await this.styles.profiles.read(org, actor, proposed.review.profileId,
      {accountDigest: proposed.scope.subjectDigest, accountGeneration: proposed.scope.accountGeneration}) : null;
    const saved = await this.voices.selectHumanConfirmed(org, actor, input, adapter.voiceAdapter, decision,
      profile ? {profileId: profile.profileId, priorVoiceHash: subscriptionHash(profile.defaultVoice)} : undefined);
    return input.decision === 'select' && saved.profileId ? this.applySelectedVoice(org, actor, saved.setupId, saved) : this.voiceArtifact(saved);
  }
  /** Reapply only an already saved actual human choice; no clone, speech, new identity or second question. */
  async applySelectedVoice(org: string, actor: string, setupId: string, saved?: HeygenVoiceSetupViewV1) {
    const adapter = this.adapter(), view = saved ?? await this.voices.read(org, actor, setupId, adapter.voiceAdapter), output = this.voiceArtifact(view);
    if (!view.profileId || view.selection?.decision !== 'select') return {...output, profileApplication: {state: 'not_applicable' as const}};
    try {
      const selected = await this.voices.selectedVoice(org, actor, setupId, adapter.voiceAdapter);
      if (selected.sourceMode !== 'text') return {...output, profileApplication: {state: 'recorded_audio_retained' as const, profileId: view.profileId}};
      if (selected.profileId !== view.profileId || selected.connectionId !== view.connectionId) return videoErrorV1('VIDEO_VOICE_SELECTION_INVALID', 409);
      const observed = await adapter.readProfileCatalog(org, actor, view.connectionId);
      const profile = await this.styles.profiles.read(org, actor, view.profileId, observed);
      if (profile.connectionId !== view.connectionId) return videoErrorV1('VIDEO_PROFILE_ACCOUNT_CHANGED', 409);
      const defaultVoice = {voiceId: selected.voiceId!, engine: selected.engine!, baseline: selected.baseline!};
      if (subscriptionHash(profile.defaultVoice) === subscriptionHash(defaultVoice))
        return {...output, profileApplication: {state: 'applied' as const, profileId: profile.profileId, profileRevision: profile.revision}};
      if (!selected.profileTarget || selected.profileTarget.profileId !== profile.profileId) return videoErrorV1('VIDEO_PROFILE_VOICE_BINDING_REQUIRED', 409);
      if (subscriptionHash(profile.defaultVoice) !== selected.profileTarget.priorVoiceHash) return videoErrorV1('VIDEO_PROFILE_VOICE_CHANGED', 409);
      const preferences = {profileId: profile.profileId, expectedRevision: profile.revision, connectionId: profile.connectionId,
        displayName: profile.displayName, aliases: profile.aliases, preferredForName: profile.preferredForName,
        ...(profile.editorialPersonaId ? {editorialPersonaId: profile.editorialPersonaId} : {}), groupIds: profile.groupIds, preferredGroupId: profile.preferredGroupId,
        sourceLooks: profile.sourceLooks, preferredSourceLookId: profile.preferredSourceLookId,
        ...(profile.defaultAppearanceLookId ? {defaultAppearanceLookId: profile.defaultAppearanceLookId} : {}),
        ...(profile.defaultAnimationReferenceLookId ? {defaultAnimationReferenceLookId: profile.defaultAnimationReferenceLookId} : {}), defaultVoice};
      const approvedDigest = heygenPersonProfileApprovalDigestV1(org, actor, preferences, observed.accountDigest);
      const hex = subscriptionHash({kind: 'heygen-selected-voice-profile/v1', decisionId: selected.decisionId, profileId: profile.profileId, approvedDigest});
      const decisionId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
      const applied = await this.styles.profiles.saveHumanConfirmed(org, actor, preferences, {
        decisionId, source: selected.decisionSource, approvedDigest, accountDigest: observed.accountDigest, accountGeneration: observed.accountGeneration,
        observedAt: selected.selectedAt, catalog: observed.catalog,
        // Inherit exact unchanged preview bindings from the existing approved profile; the writer checks owned image Media again.
        previewMediaBindings: profile.sourceLooks.flatMap(look => look.previewMediaId ? [{groupId: look.groupId, lookId: look.lookId, mediaId: look.previewMediaId}] : []),
      });
      return {...output, profileApplication: {state: 'applied' as const, profileId: applied.profileId, profileRevision: applied.revision}};
    } catch (error: any) {
      const code = error?.getResponse?.()?.code;
      return {...output, profileApplication: {state: 'pending' as const, profileId: view.profileId,
        blocker: typeof code === 'string' && /^VIDEO_[A-Z_]+$/.test(code) ? code : 'VIDEO_PROFILE_VOICE_APPLY_UNAVAILABLE', retryTool: 'video.heygen_voice_apply_selected'}};
    }
  }
}
