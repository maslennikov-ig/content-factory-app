import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { SocialFactoryRepository } from '../../content-intelligence/social-factory/social-factory.repository';
import type { SocialFactoryRecordV1, SocialFactoryStoreV1 } from '../../content-intelligence/social-factory/contracts/social-factory.v1';
import { VideoConnectionService } from './video-connection.service';
import { HEYGEN_VOICE_TOOL_SCHEMAS_V1, HeygenVoiceIntakeSchemaV1, HeygenOwnedAudioSchemaV1, HeygenVoiceHumanDecisionSchemaV1,
  HeygenVoiceAuditionsInputSchemaV1, HeygenVoiceCloneInputSchemaV1, HeygenVoiceSelectionInputSchemaV1,
  heygenVoiceIntentDigestV1, heygenVoiceSourceDigestV1, heygenVoiceSelectionDigestV1, heygenVoiceOperationApprovalDigestV1, heygenSpeechRequestV1, heygenCloneRequestV1, voiceSetupHashV1, voiceSetupErrorV1,
  type HeygenVoiceScopeV1, type HeygenVoiceSetupAdapterV1, type HeygenVoiceHumanDecisionV1, type HeygenVoiceSetupPayloadV1,
  type HeygenVoiceSetupViewV1, type HeygenOwnedAudioV1, type HeygenVoiceOperationV1, type HeygenVoiceCandidateV1, type HeygenVoiceSelectionReceiptV1,
} from './video-heygen-voice-setup.v1';

const KIND = 'heygen_voice_setup' as const;
type Row = SocialFactoryRecordV1<HeygenVoiceSetupPayloadV1>;
const parent = (actor: string) => `heygen-voice-setup:actor:${actor}`;
const decisionId = (id: string) => `heygen-voice-setup:${id}`;
const parse = <T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> => {
  const p = schema.safeParse(value);
  return p.success ? p.data : voiceSetupErrorV1('VIDEO_VOICE_SETUP_INPUT_INVALID');
};

/** Bounded companion state for existing native operations; no scheduler or provider client. */
@Injectable()
export class HeygenVoiceSetupServiceV1 {
  constructor(readonly store: SocialFactoryRepository, readonly connections: VideoConnectionService) {}

  private async member(org: string, actor: string) {
    if (!org || !actor) return voiceSetupErrorV1('VIDEO_ACCESS_DENIED');
    await this.connections.repository.member(org, actor);
  }
  private async scope(org: string, actor: string, connectionId: string, setupId: string, adapter: HeygenVoiceSetupAdapterV1): Promise<HeygenVoiceScopeV1> {
    const row = await this.connections.repository.connection(org, actor, connectionId, this.connections.repository.db, false);
    if (row.provider !== 'heygen' || row.ownerId !== actor || row.state === 'revoked') return voiceSetupErrorV1('VIDEO_VOICE_ACCOUNT_UNAVAILABLE');
    const account = await adapter.currentAccount({organizationId: org, actorId: actor, connectionId});
    if (account.connectionId !== connectionId || account.billingType !== 'subscription' || !/^[a-f0-9]{64}$/.test(account.subjectDigest) ||
      account.accountGeneration !== row.generation || /^[a-f0-9]{64}$/.test(row.walletDigest ?? '') && row.walletDigest !== account.subjectDigest)
      return voiceSetupErrorV1('VIDEO_VOICE_ACCOUNT_UNAVAILABLE');
    return {organizationId: org, actorId: actor, connectionId, setupId, subjectDigest: account.subjectDigest, accountGeneration: account.accountGeneration};
  }
  private async owned(store: SocialFactoryStoreV1, org: string, actor: string, id: string): Promise<Row> {
    const row = await store.read<HeygenVoiceSetupPayloadV1>(org, KIND, id), p = row?.payload;
    if (!row || row.parentId !== parent(actor) || p?.version !== 1 || p.actorId !== actor || p.organizationId !== org || p.input?.setupId !== id ||
      p.sourceDigest !== heygenVoiceSourceDigestV1(p.input, p.original)) return voiceSetupErrorV1('VIDEO_VOICE_SETUP_UNAVAILABLE');
    const intent = await store.read<HeygenVoiceHumanDecisionV1>(org, 'decision', decisionId(p.humanIntent?.decisionId));
    if (!intent || intent.parentId !== parent(actor) || voiceSetupHashV1(intent.payload) !== voiceSetupHashV1(p.humanIntent) ||
      p.humanIntent.approvedDigest !== heygenVoiceIntentDigestV1(org, actor, p.input, p.subjectDigest, p.original)) return voiceSetupErrorV1('VIDEO_VOICE_HUMAN_DECISION_REQUIRED');
    if (p.humanSelection) {
      const selection = await store.read<HeygenVoiceSelectionReceiptV1>(org, 'decision', decisionId(p.humanSelection.decisionId));
      if (!selection || selection.parentId !== parent(actor) || voiceSetupHashV1(selection.payload) !== voiceSetupHashV1(p.humanSelection)) return voiceSetupErrorV1('VIDEO_VOICE_SELECTION_INVALID');
    }
    for (const op of p.operations) {
      if (op.toolSchemaDigest !== HEYGEN_VOICE_TOOL_SCHEMAS_V1[op.tool] || op.requestHash !== voiceSetupHashV1({tool: op.tool, toolSchemaDigest: op.toolSchemaDigest, arguments: op.arguments}))
        return voiceSetupErrorV1('VIDEO_VOICE_OPERATION_INVALID');
    }
    return row;
  }
  private put(store: SocialFactoryStoreV1, row: Row, payload: HeygenVoiceSetupPayloadV1) {
    return store.put<HeygenVoiceSetupPayloadV1>({organizationId: row.organizationId, kind: KIND, id: row.id, parentId: row.parentId!,
      expectedRevision: row.revision, payload, sourceIds: row.sourceIds});
  }
  private changeOperation(org: string, actor: string, input: {setupId: string; operationId: string},
    change: (row: Row, operation: HeygenVoiceOperationV1) => HeygenVoiceSetupPayloadV1) {
    return this.store.transact(async store => {
      const row = await this.owned(store, org, actor, input.setupId), operation = row.payload.operations.find(op => op.operationId === input.operationId);
      if (!operation) return voiceSetupErrorV1('VIDEO_VOICE_OPERATION_UNAVAILABLE');
      return this.put(store, row, change(row, operation));
    });
  }
  private async active(row: Row, adapter: HeygenVoiceSetupAdapterV1) {
    const p = row.payload, scope = await this.scope(p.organizationId, p.actorId, p.input.connectionId, row.id, adapter);
    if (scope.subjectDigest !== p.subjectDigest) return voiceSetupErrorV1('VIDEO_VOICE_ACCOUNT_CHANGED');
    return scope;
  }
  private audio(raw: unknown, scope: HeygenVoiceScopeV1, origin: HeygenOwnedAudioV1['origin'], mediaId?: string) {
    const audio = parse(HeygenOwnedAudioSchemaV1, raw);
    if (audio.organizationId !== scope.organizationId || audio.actorId !== scope.actorId ||
      (origin === 'generated_preview' ? audio.origin !== 'generated_preview' : audio.origin === 'generated_preview') || mediaId && audio.mediaId !== mediaId)
      return voiceSetupErrorV1('VIDEO_VOICE_AUDIO_UNAVAILABLE');
    return audio;
  }

  /** Server-only preparation: a prospective original declaration is not persisted yet. */
  async proposeIntake(org: string, actor: string, raw: unknown, adapter: HeygenVoiceSetupAdapterV1) {
    await this.member(org, actor);
    const input = parse(HeygenVoiceIntakeSchemaV1, raw), scope = await this.scope(org, actor, input.connectionId, input.setupId, adapter);
    if (input.intent !== 'narrator' && !input.originalMediaId) return voiceSetupErrorV1('VIDEO_VOICE_ORIGINAL_REQUIRED', 'Attach the original recording as owned Media; a transcript or generated preview is not original audio.');
    if (input.intent !== 'recorded_speech' && !input.audition || input.intent === 'recorded_speech' && input.audition) return voiceSetupErrorV1('VIDEO_VOICE_SETUP_INPUT_INVALID');
    const measured = input.originalMediaId ? adapter.inspectAccessibleAudio ? await adapter.inspectAccessibleAudio(scope, input.originalMediaId) : await adapter.readOwnedAudio(scope, input.originalMediaId) : undefined;
    const original = measured ? this.audio({...measured, origin: 'origin' in measured ? measured.origin : 'original_recording_selected_by_person'}, scope, 'original_upload', input.originalMediaId) : undefined;
    return {input, scope, ...(original ? {original} : {}), approvedDigest: heygenVoiceIntentDigestV1(org, actor, input, scope.subjectDigest, original),
      review: {setupId: input.setupId, intent: input.intent, ...(input.audition ? {audition: input.audition} : {}),
        ...(original ? {original: {mediaId: original.mediaId, label: original.label, durationSeconds: original.durationSeconds, mimeType: original.mimeType, bytes: original.bytes,
          quality: original.quality}, sourceDeclaration: 'requires_human_confirmation'} : {}), generationAuthorized: false as const}};
  }

  /** Server-only exact choice card; account/proof material must not be returned as tool content. */
  async proposeSelection(org: string, actor: string, raw: unknown, adapter: HeygenVoiceSetupAdapterV1) {
    await this.member(org, actor);
    const input = parse(HeygenVoiceSelectionInputSchemaV1, raw), row = await this.owned(this.store, org, actor, input.setupId), scope = await this.active(row, adapter);
    if (row.revision !== input.expectedRevision) return voiceSetupErrorV1('VIDEO_VOICE_SETUP_CHANGED');
    const candidate = input.decision === 'select' ? row.payload.candidates.find(c => c.candidateId === input.candidateId && c.revision === input.candidateRevision) : undefined;
    if (input.decision === 'select' ? !candidate || candidate.state !== 'ready' || !candidate.audio : input.candidateId !== undefined || input.candidateRevision !== undefined)
      return voiceSetupErrorV1('VIDEO_VOICE_SELECTION_INVALID');
    await this.original(row, scope, adapter);
    return {input, scope, approvedDigest: heygenVoiceSelectionDigestV1(row.payload, input), review: {setupId: row.id, connectionId: row.payload.input.connectionId,
      ...(row.payload.input.profileId ? {profileId: row.payload.input.profileId} : {}), decision: input.decision,
      ...(candidate ? {candidate: structuredClone(candidate)} : {candidateCount: row.payload.candidates.length}), generationAuthorized: false as const}};
  }

  async operationApproval(org: string, actor: string, input: {setupId: string; operationId: string}, adapter: HeygenVoiceSetupAdapterV1) {
    await this.member(org, actor);
    const row = await this.owned(this.store, org, actor, input.setupId), scope = await this.active(row, adapter), operation = row.payload.operations.find(op => op.operationId === input.operationId);
    if (!operation || operation.state !== 'prepared' || operation.accountGeneration !== scope.accountGeneration) return voiceSetupErrorV1('VIDEO_VOICE_APPROVAL_STALE');
    const candidate = row.payload.candidates.find(c => c.candidateId === operation.candidateId);
    return {scope, operation: structuredClone(operation), approvedDigest: heygenVoiceOperationApprovalDigestV1(scope, operation), review: {setupId: row.id, operationId: operation.operationId,
      operation: operation.tool, ...(row.payload.original ? {originalLabel: row.payload.original.label} : {}), ...(candidate ? {candidateName: candidate.name} : {}),
      ...(operation.tool === 'create_speech' && row.payload.input.audition ? {audition: row.payload.input.audition} : {}),
      allowedAttempts: 1, cost: null as null, costStatus: 'unknown', generationAuthorized: false as const}};
  }
  private async original(row: Row, scope: HeygenVoiceScopeV1, adapter: HeygenVoiceSetupAdapterV1) {
    if (!row.payload.original) return;
    const saved = row.payload.original, actual = this.audio(await adapter.readOwnedAudio(scope, saved.mediaId), scope, 'original_upload', saved.mediaId);
    if (actual.contentDigest !== saved.contentDigest || actual.bytes !== saved.bytes) return voiceSetupErrorV1('VIDEO_VOICE_ORIGINAL_CHANGED');
  }
  private async human(scope: HeygenVoiceScopeV1, raw: unknown, digest: string, adapter: HeygenVoiceSetupAdapterV1): Promise<HeygenVoiceHumanDecisionV1> {
    const p = HeygenVoiceHumanDecisionSchemaV1.safeParse(raw);
    if (!p.success || p.data.organizationId !== scope.organizationId || p.data.actorId !== scope.actorId || p.data.approvedDigest !== digest ||
      !await adapter.verifyHumanDecision(scope, p.data, digest)) return voiceSetupErrorV1('VIDEO_VOICE_HUMAN_DECISION_REQUIRED');
    return p.data;
  }
  private async qualified(scope: HeygenVoiceScopeV1, tool: HeygenVoiceOperationV1['tool'], adapter: HeygenVoiceSetupAdapterV1, original?: HeygenOwnedAudioV1) {
    const q = await adapter.qualifyOperation(scope, tool, original);
    if (q.toolSchemaDigest !== HEYGEN_VOICE_TOOL_SCHEMAS_V1[tool]) return voiceSetupErrorV1('VIDEO_SCHEMA_CHANGED');
    if (q.entitlement !== 'qualified') return voiceSetupErrorV1('VIDEO_VOICE_ENTITLEMENT_UNVERIFIED', 'Qualify this operation on the connected subscription; no API payer fallback is used.');
    if (q.receiptContract !== 'qualified' || tool === 'clone_voice' && !adapter.decodeCloneReceipt || tool === 'create_speech' && (!adapter.decodeSpeechReceipt || !adapter.importSpeechResult))
      return voiceSetupErrorV1('VIDEO_VOICE_RECEIPT_CONTRACT_UNQUALIFIED', 'Qualify the actual provider response and owned audio import before enabling this operation.');
    return q;
  }
  private project(row: Row, blockers: string[] = []): HeygenVoiceSetupViewV1 {
    const p = row.payload;
    if (p.input.intent !== 'narrator' && !p.original) blockers.push('VIDEO_VOICE_ORIGINAL_REQUIRED');
    if (p.original && (p.original.quality.speech !== 'present' || p.original.quality.speakers !== 'one')) blockers.push('VIDEO_VOICE_SOURCE_QUALITY_UNVERIFIED');
    if (!p.candidates.length && !p.operations.length && p.input.intent !== 'recorded_speech') blockers.push('VIDEO_VOICE_CANDIDATES_REQUIRED');
    blockers.push(...p.operations.flatMap(op => op.blocker ? [op.blocker] : []));
    return structuredClone({setupId: row.id, revision: row.revision, connectionId: p.input.connectionId, ...(p.input.profileId ? {profileId: p.input.profileId} : {}), intent: p.input.intent, ...(p.original ? {original: p.original} : {}),
      ...(p.input.audition ? {audition: p.input.audition} : {}), candidates: p.candidates,
      operations: p.operations.map(({operationId, tool, state, candidateId, voiceId, blocker, requestHash}) => ({operationId, tool, state, requestHash,
        ...(candidateId ? {candidateId} : {}), ...(voiceId ? {voiceId} : {}), ...(blocker ? {blocker} : {})})),
      ...(p.humanSelection ? {selection: {decisionId: p.humanSelection.decisionId, decision: p.humanSelection.decision,
        ...(p.humanSelection.candidateId ? {candidateId: p.humanSelection.candidateId, candidateRevision: p.humanSelection.candidateRevision} : {}), at: p.humanSelection.at}} : {}),
      blockers: [...new Set(blockers)], generationAuthorized: false});
  }

  async intake(org: string, actor: string, raw: unknown, adapter: HeygenVoiceSetupAdapterV1, intentProof: HeygenVoiceHumanDecisionV1): Promise<HeygenVoiceSetupViewV1> {
    await this.member(org, actor);
    const input = parse(HeygenVoiceIntakeSchemaV1, raw), scope = await this.scope(org, actor, input.connectionId, input.setupId, adapter);
    if (input.intent !== 'narrator' && !input.originalMediaId) return voiceSetupErrorV1('VIDEO_VOICE_ORIGINAL_REQUIRED', 'Attach the original recording as owned Media; a transcript or generated preview is not original audio.');
    if (input.intent !== 'recorded_speech' && !input.audition || input.intent === 'recorded_speech' && input.audition) return voiceSetupErrorV1('VIDEO_VOICE_SETUP_INPUT_INVALID');
    const original = input.originalMediaId ? this.audio(await adapter.readOwnedAudio(scope, input.originalMediaId), scope, 'original_upload', input.originalMediaId) : undefined;
    const approved = await this.human(scope, intentProof, heygenVoiceIntentDigestV1(org, actor, input, scope.subjectDigest, original), adapter);
    const payload: HeygenVoiceSetupPayloadV1 = {version: 1, organizationId: org, actorId: actor, input, subjectDigest: scope.subjectDigest,
      sourceDigest: heygenVoiceSourceDigestV1(input, original), ...(original ? {original} : {}), humanIntent: approved, operations: [],
      candidates: input.intent === 'recorded_speech' && original ? [{candidateId: input.setupId, revision: 1, name: original.label, origin: 'recorded_speech', state: 'ready', audio: original}] : []};
    const saved = await this.store.transact(async store => {
      const prior = await store.read<HeygenVoiceSetupPayloadV1>(org, KIND, input.setupId);
      if (prior) {
        const owned = await this.owned(store, org, actor, input.setupId);
        if (voiceSetupHashV1(owned.payload.input) !== voiceSetupHashV1(input) || owned.payload.humanIntent.decisionId !== approved.decisionId) return voiceSetupErrorV1('VIDEO_VOICE_SETUP_CHANGED');
        return owned;
      }
      await store.put({organizationId: org, kind: 'decision', id: decisionId(approved.decisionId), parentId: parent(actor), expectedRevision: 0, sourceIds: [], payload: approved});
      return store.put({organizationId: org, kind: KIND, id: input.setupId, parentId: parent(actor), expectedRevision: 0,
        sourceIds: original ? [original.mediaId] : [], payload});
    });
    return this.project(saved);
  }
  async read(org: string, actor: string, setupId: string, adapter: HeygenVoiceSetupAdapterV1): Promise<HeygenVoiceSetupViewV1> {
    await this.member(org, actor);
    const row = await this.owned(this.store, org, actor, setupId);
    try {await this.active(row, adapter);} catch {return this.project(row, ['VIDEO_VOICE_ACCOUNT_UNAVAILABLE']);}
    return this.project(row);
  }

  async prepareAuditions(org: string, actor: string, raw: unknown, adapter: HeygenVoiceSetupAdapterV1): Promise<HeygenVoiceSetupViewV1> {
    await this.member(org, actor);
    const input = parse(HeygenVoiceAuditionsInputSchemaV1, raw), row = await this.owned(this.store, org, actor, input.setupId), p = row.payload;
    if (row.revision !== input.expectedRevision || p.candidates.length || p.humanSelection || p.input.intent === 'recorded_speech' || !p.input.audition)
      return voiceSetupErrorV1('VIDEO_VOICE_SETUP_CHANGED');
    if (new Set(input.candidates.map(c => c.candidateId)).size !== input.candidates.length || new Set(input.candidates.map(c => voiceSetupHashV1({...c, candidateId: null}))).size !== input.candidates.length)
      return voiceSetupErrorV1('VIDEO_VOICE_CANDIDATES_DUPLICATE');
    const scope = await this.active(row, adapter); await this.original(row, scope, adapter);
    await this.qualified(scope, 'create_speech', adapter);
    const candidates: HeygenVoiceCandidateV1[] = [], operations = [...p.operations];
    for (const spec of input.candidates) {
      if (operations.some(op => op.operationId === spec.candidateId)) return voiceSetupErrorV1('VIDEO_VOICE_OPERATION_INVALID');
      const voice = await adapter.readVoice(scope, spec.voiceId, HEYGEN_VOICE_TOOL_SCHEMAS_V1.get_voice);
      const clonedHere = p.operations.some(op => op.tool === 'clone_voice' && op.state === 'completed' && op.voiceId === spec.voiceId);
      const approvedExisting = voice.origin === 'approved_existing' && !!p.input.profileId && voice.approvedProfileId === p.input.profileId;
      if (p.input.intent === 'reproduce_person' && !clonedHere && !approvedExisting && !(voice.origin === 'personal_clone' && voice.originSourceDigest === p.original?.contentDigest))
        return voiceSetupErrorV1('VIDEO_VOICE_IDENTITY_UNVERIFIED', 'Use the approved person voice or a clone proven to derive from this original recording.');
      if (p.input.intent === 'narrator' && voice.origin === 'personal_clone') return voiceSetupErrorV1('VIDEO_VOICE_INTENT_MISMATCH');
      const request = heygenSpeechRequestV1(spec, p.input.audition, voice);
      const name = typeof voice.name === 'string' && voice.name.trim() && !/https?:\/\/|\bbearer\s|[\u0000-\u001f]/iu.test(voice.name) ? voice.name.slice(0, 120) : 'Voice audition';
      candidates.push({candidateId: spec.candidateId, revision: 1, voiceId: spec.voiceId, name, origin: clonedHere ? 'personal_clone' : voice.origin,
        spec, requestedLocale: p.input.audition.locale, localeStrategy: spec.engine === 'elevenlabs' ? 'language_only' : voice.localeStrategy, state: 'prepared'});
      operations.push({...request, operationId: spec.candidateId, accountGeneration: scope.accountGeneration, candidateId: spec.candidateId, state: 'prepared'});
    }
    return this.project(await this.put(this.store, row, {...p, candidates, operations}));
  }

  async prepareClone(org: string, actor: string, raw: unknown, adapter: HeygenVoiceSetupAdapterV1): Promise<HeygenVoiceSetupViewV1> {
    await this.member(org, actor);
    const input = parse(HeygenVoiceCloneInputSchemaV1, raw), row = await this.owned(this.store, org, actor, input.setupId), p = row.payload;
    if (row.revision !== input.expectedRevision || p.input.intent !== 'reproduce_person' || !p.original || p.candidates.length || p.humanSelection || p.operations.some(op => op.tool === 'clone_voice'))
      return voiceSetupErrorV1('VIDEO_VOICE_SETUP_CHANGED');
    if (p.original.quality.speech !== 'present' || p.original.quality.speakers !== 'one') return voiceSetupErrorV1('VIDEO_VOICE_SOURCE_QUALITY_UNVERIFIED');
    const scope = await this.active(row, adapter); await this.original(row, scope, adapter);
    const q = await this.qualified(scope, 'clone_voice', adapter, p.original);
    if (!q.ownedOriginalAssetId || q.sourceRights !== 'confirmed' || q.consent !== 'confirmed') return voiceSetupErrorV1('VIDEO_VOICE_CLONE_SOURCE_UNVERIFIED');
    const request = heygenCloneRequestV1(input, q.ownedOriginalAssetId, p.input.audition?.locale);
    return this.project(await this.put(this.store, row, {...p, operations: [...p.operations, {...request, operationId: input.operationId, accountGeneration: scope.accountGeneration, state: 'prepared'}]}));
  }

  async execute(org: string, actor: string, input: {setupId: string; operationId: string}, adapter: HeygenVoiceSetupAdapterV1, nativeApproval: unknown): Promise<HeygenVoiceSetupViewV1> {
    await this.member(org, actor);
    let row = await this.owned(this.store, org, actor, input.setupId), op = row.payload.operations.find(op => op.operationId === input.operationId);
    if (!op) return voiceSetupErrorV1('VIDEO_VOICE_OPERATION_UNAVAILABLE');
    if (op.state !== 'prepared') return op.rawReceiptEncrypted && op.state !== 'completed' ? this.recover(org, actor, input, adapter) : this.project(row);
    const scope = await this.active(row, adapter);
    if (op.accountGeneration !== scope.accountGeneration) return voiceSetupErrorV1('VIDEO_VOICE_APPROVAL_STALE');
    await this.original(row, scope, adapter);
    const qualified = await this.qualified(scope, op.tool, adapter, row.payload.original);
    if (op.tool === 'clone_voice' && (!qualified.ownedOriginalAssetId || qualified.sourceRights !== 'confirmed' || qualified.consent !== 'confirmed' ||
      (op.arguments.audio as {asset_id?: string})?.asset_id !== qualified.ownedOriginalAssetId)) return voiceSetupErrorV1('VIDEO_VOICE_CLONE_SOURCE_UNVERIFIED');
    const request = {tool: op.tool, toolSchemaDigest: op.toolSchemaDigest, arguments: op.arguments, requestHash: op.requestHash};
    let ownsDispatch = false;
    try {
      await adapter.dispatch(scope, request, {
        beforeDispatch: async () => {
          const current = await this.owned(this.store, org, actor, input.setupId), currentOp = current.payload.operations.find(value => value.operationId === input.operationId)!;
          const account = await this.active(current, adapter);
          if (!currentOp || currentOp.state !== 'prepared' || currentOp.requestHash !== request.requestHash || account.accountGeneration !== op!.accountGeneration)
            return voiceSetupErrorV1('VIDEO_VOICE_APPROVAL_STALE');
          await this.original(current, account, adapter);
          if (currentOp.tool === 'create_speech') {
            const candidate = current.payload.candidates.find(value => value.candidateId === currentOp.candidateId);
            if (!candidate?.spec || !current.payload.input.audition) return voiceSetupErrorV1('VIDEO_VOICE_OPERATION_INVALID');
            const voice = await adapter.readVoice(account, candidate.spec.voiceId, HEYGEN_VOICE_TOOL_SCHEMAS_V1.get_voice);
            if (heygenSpeechRequestV1(candidate.spec, current.payload.input.audition, voice).requestHash !== currentOp.requestHash) return voiceSetupErrorV1('VIDEO_VOICE_APPROVAL_STALE');
          }
          await adapter.assertNativeApproval(account, currentOp, nativeApproval);
          row = await this.changeOperation(org, actor, input, (latest, selected) => {
            if (selected.state !== 'prepared' || selected.requestHash !== request.requestHash) return voiceSetupErrorV1('VIDEO_VOICE_APPROVAL_STALE');
            return {...latest.payload, operations: latest.payload.operations.map(value => value.operationId === input.operationId ? {...value, state: 'dispatched'} : value)};
          });
          ownsDispatch = true;
        },
        afterResponse: async raw => {
          const text = JSON.stringify(raw);
          if (!raw || typeof raw !== 'object' || Array.isArray(raw) || typeof text !== 'string' || Buffer.byteLength(text) > 1024 * 1024) return voiceSetupErrorV1('VIDEO_VOICE_RECEIPT_INVALID');
          if (!ownsDispatch) return voiceSetupErrorV1('VIDEO_VOICE_OPERATION_INVALID');
          const encrypted = adapter.encryptReceipt(raw);
          if (typeof encrypted !== 'string' || !encrypted) return voiceSetupErrorV1('VIDEO_VOICE_RECEIPT_INVALID');
          row = await this.changeOperation(org, actor, input, (current, currentOp) => {
            if (currentOp.state !== 'dispatched') return voiceSetupErrorV1('VIDEO_VOICE_OPERATION_INVALID');
            return {...current.payload, operations: current.payload.operations.map(value => value.operationId === input.operationId ? {...value, state: 'receipt_saved', rawReceiptEncrypted: encrypted} : value)};
          });
        },
      });
    } catch {
      row = await this.owned(this.store, org, actor, input.setupId);
      const currentOp = row.payload.operations.find(value => value.operationId === input.operationId)!;
      if (ownsDispatch && currentOp.state === 'dispatched') row = await this.changeOperation(org, actor, input, (current, selected) => ({...current.payload,
        operations: current.payload.operations.map(value => value.operationId === input.operationId && selected.state === 'dispatched' ? {...value, state: 'uncertain', blocker: 'VIDEO_VOICE_OPERATION_UNCERTAIN'} : value)}));
      return this.project(row, currentOp.state === 'prepared' ? ['VIDEO_VOICE_OPERATION_NOT_DISPATCHED'] : []);
    }
    row = await this.owned(this.store, org, actor, input.setupId); op = row.payload.operations.find(value => value.operationId === input.operationId)!;
    if (op.rawReceiptEncrypted) return this.recover(org, actor, input, adapter);
    if (ownsDispatch && op.state === 'dispatched') row = await this.changeOperation(org, actor, input, (current, selected) => ({...current.payload,
      operations: current.payload.operations.map(value => value.operationId === input.operationId && selected.state === 'dispatched' ? {...value, state: 'uncertain', blocker: 'VIDEO_VOICE_OPERATION_UNCERTAIN'} : value)}));
    return this.project(row, op.state === 'prepared' ? ['VIDEO_VOICE_OPERATION_NOT_DISPATCHED'] : []);
  }

  /** Decode/import only; never sends clone/speech again, including after lost saving. */
  async recover(org: string, actor: string, input: {setupId: string; operationId: string}, adapter: HeygenVoiceSetupAdapterV1): Promise<HeygenVoiceSetupViewV1> {
    await this.member(org, actor);
    const row = await this.owned(this.store, org, actor, input.setupId), p = row.payload, op = p.operations.find(op => op.operationId === input.operationId);
    if (!op) return voiceSetupErrorV1('VIDEO_VOICE_OPERATION_UNAVAILABLE');
    if (op.state === 'completed' || !op.rawReceiptEncrypted) return this.project(row);
    const scope = await this.active(row, adapter); let voiceId: string | undefined, audio: HeygenOwnedAudioV1 | undefined;
    try {
      const raw = adapter.decryptReceipt(op.rawReceiptEncrypted);
      if (op.tool === 'clone_voice') {
        const result = adapter.decodeCloneReceipt?.(raw);
        if (!result || !/^[A-Za-z0-9_-]{1,200}$/.test(result.voiceId)) return voiceSetupErrorV1('VIDEO_VOICE_RECEIPT_UNRECOGNIZED');
        voiceId = result.voiceId;
      } else {
        const result = adapter.decodeSpeechReceipt?.(raw);
        if (!result || !adapter.importSpeechResult) return voiceSetupErrorV1('VIDEO_VOICE_RECEIPT_UNRECOGNIZED');
        audio = this.audio(await adapter.importSpeechResult(scope, result, op.operationId), scope, 'generated_preview');
        if (!audio.playable || audio.mediaId === p.original?.mediaId || audio.contentDigest === p.original?.contentDigest) return voiceSetupErrorV1('VIDEO_VOICE_PREVIEW_INVALID');
      }
    } catch (e: any) {
      const code = e?.getResponse?.()?.code === 'VIDEO_VOICE_RECEIPT_UNRECOGNIZED' ? 'VIDEO_VOICE_RECEIPT_UNRECOGNIZED' : 'VIDEO_VOICE_RESULT_SAVE_PENDING';
      return this.project(await this.changeOperation(org, actor, input, (current, selected) => ({...current.payload,
        operations: current.payload.operations.map(value => value.operationId === op.operationId && selected.state !== 'completed' ? {...value, state: 'uncertain', blocker: code} : value)})));
    }
    return this.project(await this.changeOperation(org, actor, input, (current, selected) => {
      if (selected.state === 'completed') return current.payload;
      if (selected.rawReceiptEncrypted !== op.rawReceiptEncrypted) return voiceSetupErrorV1('VIDEO_VOICE_OPERATION_INVALID');
      return {...current.payload, candidates: current.payload.candidates.map(candidate => candidate.candidateId === op.candidateId && audio ? {...candidate, audio, state: 'ready', revision: candidate.revision + 1} : candidate),
        operations: current.payload.operations.map(value => value.operationId === op.operationId ? {...value, state: 'completed', blocker: undefined, ...(voiceId ? {voiceId} : {})} : value)};
    }));
  }

  async selectHumanConfirmed(org: string, actor: string, raw: unknown, adapter: HeygenVoiceSetupAdapterV1, proof: HeygenVoiceHumanDecisionV1,
    profileTarget?: {profileId: string; priorVoiceHash: string}): Promise<HeygenVoiceSetupViewV1> {
    await this.member(org, actor);
    const input = parse(HeygenVoiceSelectionInputSchemaV1, raw), row = await this.owned(this.store, org, actor, input.setupId), p = row.payload, scope = await this.active(row, adapter);
    if (profileTarget && (profileTarget.profileId !== p.input.profileId || !/^[a-f0-9]{64}$/.test(profileTarget.priorVoiceHash))) return voiceSetupErrorV1('VIDEO_VOICE_SELECTION_INVALID');
    const candidate = input.decision === 'select' ? p.candidates.find(c => c.candidateId === input.candidateId && c.revision === input.candidateRevision) : undefined;
    if (input.decision === 'select' ? !candidate || candidate.state !== 'ready' || !candidate.audio : input.candidateId !== undefined || input.candidateRevision !== undefined)
      return voiceSetupErrorV1('VIDEO_VOICE_SELECTION_INVALID');
    await this.original(row, scope, adapter);
    if (candidate?.audio) {
      const actual = this.audio(await adapter.readOwnedAudio(scope, candidate.audio.mediaId), scope, candidate.origin === 'recorded_speech' ? 'original_upload' : 'generated_preview', candidate.audio.mediaId);
      if (!actual.playable || actual.contentDigest !== candidate.audio.contentDigest) return voiceSetupErrorV1('VIDEO_VOICE_PREVIEW_INVALID');
    }
    const approved = await this.human(scope, proof, heygenVoiceSelectionDigestV1(p, input), adapter);
    const receipt: HeygenVoiceSelectionReceiptV1 = {...approved, setupId: row.id, subjectDigest: p.subjectDigest, sourceDigest: p.sourceDigest, decision: input.decision,
      ...(profileTarget ? {profileTarget: structuredClone(profileTarget)} : {}),
      ...(candidate ? {candidateId: candidate.candidateId, candidateRevision: candidate.revision, ...(candidate.voiceId ? {voiceId: candidate.voiceId} : {}), candidateDigest: voiceSetupHashV1(candidate)} : {})};
    const saved = await this.store.transact(async store => {
      const current = await this.owned(store, org, actor, input.setupId);
      const prior = await store.read<HeygenVoiceSelectionReceiptV1>(org, 'decision', decisionId(approved.decisionId));
      if (prior) {
        if (voiceSetupHashV1(prior.payload) !== voiceSetupHashV1(receipt) || current.payload.humanSelection?.decisionId !== approved.decisionId) return voiceSetupErrorV1('VIDEO_VOICE_SELECTION_INVALID');
        return current;
      }
      if (current.revision !== input.expectedRevision || current.revision !== row.revision) return voiceSetupErrorV1('VIDEO_VOICE_SETUP_CHANGED');
      await store.put({organizationId: org, kind: 'decision', id: decisionId(approved.decisionId), parentId: parent(actor), expectedRevision: 0, sourceIds: current.sourceIds, payload: receipt});
      return this.put(store, current, {...current.payload, humanSelection: receipt});
    });
    return this.project(saved);
  }

  /** Same-account token renewal keeps the person's decision; no per-video audition. */
  async selectedVoice(org: string, actor: string, setupId: string, adapter: HeygenVoiceSetupAdapterV1) {
    await this.member(org, actor);
    const row = await this.owned(this.store, org, actor, setupId), p = row.payload, scope = await this.active(row, adapter), selected = p.humanSelection;
    if (!selected || selected.decision !== 'select' || selected.subjectDigest !== scope.subjectDigest || selected.sourceDigest !== p.sourceDigest) return voiceSetupErrorV1('VIDEO_VOICE_SELECTION_REQUIRED');
    const candidate = p.candidates.find(c => c.candidateId === selected.candidateId && c.revision === selected.candidateRevision);
    if (!candidate || !candidate.audio || voiceSetupHashV1(candidate) !== selected.candidateDigest) return voiceSetupErrorV1('VIDEO_VOICE_SELECTION_INVALID');
    await this.original(row, scope, adapter);
    const actual = this.audio(await adapter.readOwnedAudio(scope, candidate.audio.mediaId), scope, candidate.origin === 'recorded_speech' ? 'original_upload' : 'generated_preview', candidate.audio.mediaId);
    if (!actual.playable || actual.contentDigest !== candidate.audio.contentDigest) return voiceSetupErrorV1('VIDEO_VOICE_PREVIEW_INVALID');
    return structuredClone({setupId, connectionId: p.input.connectionId, ...(p.input.profileId ? {profileId: p.input.profileId} : {}),
      decisionId: selected.decisionId, decisionSource: selected.source, selectedAt: selected.at, candidateId: candidate.candidateId, candidateRevision: candidate.revision,
      ...(selected.profileTarget ? {profileTarget: selected.profileTarget} : {}),
      ...(candidate.origin === 'recorded_speech' ? {sourceMode: 'audio_asset' as const, originalMediaId: candidate.audio.mediaId, contentDigest: candidate.audio.contentDigest}
        : {sourceMode: 'text' as const, voiceId: candidate.voiceId!, engine: candidate.spec!.engine, baseline: {locale: candidate.requestedLocale!, speed: candidate.spec!.speed,
          ...(candidate.spec!.engine === 'elevenlabs' && candidate.spec!.modelId ? {engineSettings: {engine_type: 'elevenlabs' as const, model: candidate.spec!.modelId}} : {})}}), generationAuthorized: false});
  }
}
