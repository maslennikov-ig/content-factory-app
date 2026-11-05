import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { HggCredentialRenewalRequestV2, HggExecutionCredentialsV2, HggPilotCredentialsPortV2 } from '../../videos/subscriptions/video-hgg-pilot-credentials.v2';
import { SocialFactoryRepository } from './social-factory.repository';
import { SourceArtifactServiceV1 } from './source-artifact.service';
import { assertSourceArtifactCurrentV1 } from './source-artifact.repository';
import { digest, identity, requireValue } from './campaign/domain';
import type { ClipPreproductionV1 } from './contracts/native-clip-preproduction.v1';
import { clipProductionPrepareV1, clipProductionLaunchV1, clipLastFrameRepairLaunchV1, clipLastFrameRepairRefreshV1, clipProductionBudgetQuestionV1, clipProductionBudgetAnswerV1,
  type ClipProductionV1, type ClipProductionPublicV1, type ClipPilotFrameAssetV1 } from './contracts/native-clip-production.v1';
import { clipExecutionModeInputV2, clipReferenceLaunchV2 } from './contracts/native-clip-execution.v2';
import { clipAcceptedTextV1, clipProductionContextV1, clipPilotAuthorizationV1, clipReferenceDigestV2, CLIP_PILOT_STAGES_V1 } from './native-clip-production.binding.v1';
import { clipPilotPromptV1 } from './native-clip-pilot-prompt.v1';
import { CLIP_DELEGATED_CAP_RULE_V1, clipDelegatedCapV1, clipDelegatedAuthorizationIdV1, clipDelegatedPublicBasisV1 } from './native-clip-pilot-budget.v1';
import { NativeClipVisionReviewServiceV1 } from './native-clip-vision-review.service.v1';
import { clipVisionInputV1, clipVisionPublicV1, clipVisionModelVerifiedV1 } from './native-clip-vision.binding.v1';
import { assertClipLastFrameRepairV1, clipLastFrameRepairDigestV1, clipLastFrameRepairPromptV1, clipLastFrameRepairQuotePendingV1 } from './native-clip-last-frame-repair.binding.v1';
import type { ClipLastFrameRepairV1 } from './contracts/native-clip-production.v1';
import { questionCardId } from '../../chat/capabilities/question-card';
import { HggPilotParentPortV1 } from '../../videos/subscriptions/video-hgg-pilot-parent.port.v1';
import { HGG_PILOT_SERVICE_V1, HggPilotAuthorizationSchemaV1, type HggPilotServicePortV1, type HggPilotStageV1,
  type HggPilotExpectedV1, type HggPilotWorkspacePreparationV1,
  type HggPilotStagePreparationV1, type HggPilotStageSettledV1, type HggPilotStagePublicV1 } from '../../videos/subscriptions/video-hgg-pilot-stage.v1';

const KIND = 'video_composition' as const;
type Parent = ClipPreproductionV1 & {production?: ClipProductionV1};
const errorCode = (error: unknown) => {
  const value = (error as any)?.code ?? (error as any)?.getResponse?.()?.code;
  return typeof value === 'string' && /^[A-Z_]+$/.test(value) ? value : 'CLIP_PRODUCTION_UNAVAILABLE';
};
const hashPattern = /^[a-f0-9]{64}$/;
/** One saved parent and finite cap; a last-frame repair needs its own consent. C owns paid jobs. */
@Injectable()
export class NativeClipProductionServiceV1 implements OnModuleInit {
  constructor(private readonly repository: SocialFactoryRepository, private readonly sources: SourceArtifactServiceV1,
    @Inject(HGG_PILOT_SERVICE_V1) private readonly hgg: HggPilotServicePortV1, private readonly parents: HggPilotParentPortV1,
    private readonly vision: NativeClipVisionReviewServiceV1) {}
  onModuleInit() { this.parents.bind(this); }
  private async row(store: SocialFactoryRepository, org: string, actor: string, thread: string | undefined, id: string) {
    const row = await store.read<Parent>(org, KIND, id);
    requireValue(row?.payload.type === 'native_clip_preproduction' && row.payload.version === 1, 'CLIP_PREPRODUCTION_NOT_FOUND');
    requireValue(row.payload.actorId === actor && (!thread || row.payload.threadId === thread), 'CLIP_PREPRODUCTION_ACCESS_DENIED');
    return row;
  }
  private context(p: Parent) {
    const prod = p.production; requireValue(prod, 'CLIP_PRODUCTION_CONTEXT_REQUIRED');requireValue(!prod.stopped, 'CLIP_PILOT_STOPPED');
    requireValue(prod.workspace && prod.connectionId && prod.accountGeneration, 'CLIP_PRODUCTION_CONTEXT_REQUIRED');
    requireValue(prod.contextDigest === clipProductionContextV1(p, prod), 'CLIP_PRODUCTION_CONTEXT_CHANGED'); return prod;
  }
  private authorization(p: Parent) {
    return clipPilotAuthorizationV1(this.context(p));
  }
  private renewalScope(p: Parent) {
    const prod=this.context(p),repair=assertClipLastFrameRepairV1(p,prod);
    requireValue(prod.firstFrame && prod.framePair && !prod.stagePlans.clip && !repair.approval && !repair.snapshot?.jobId &&
      !['approved','vision_pending','reviewed'].includes(repair.state), 'CLIP_CREDENTIAL_RENEWAL_UNAVAILABLE');
    requireValue(!Object.values(prod.stageSnapshots??{}).some(stage=>stage.jobId && stage.state!=='saved'), 'CLIP_CREDENTIAL_RENEWAL_UNAVAILABLE');
    return prod;
  }
  private assertCredentialEnvelope(p: Parent, credentials: HggExecutionCredentialsV2) {
    const prod=this.context(p),claim=prod.credentialRenewalsV2?.find(item=>item.input.renewalId===credentials.renewalId);
    requireValue(claim && credentials.version===2 && credentials.pilotId===claim.input.pilotId &&
      credentials.originContextDigest===prod.contextDigest && credentials.connectionId===prod.connectionId &&
      credentials.accountGeneration===prod.accountGeneration && credentials.originWorkspaceBindingHash===prod.workspace!.bindingHash &&
      credentials.retainedReferencesDigest===digest(claim.input.references) &&
      credentials.currentWorkspace.workspaceId===prod.workspace!.workspaceId && credentials.currentWorkspace.connectionId===prod.connectionId &&
      credentials.currentWorkspace.accountGeneration===prod.accountGeneration && credentials.currentWorkspace.context==='observed_private_owner' &&
      credentials.currentWorkspace.tokenVersion>prod.workspace!.tokenVersion && hashPattern.test(credentials.executionBindingHash),
      'CLIP_EXECUTION_CREDENTIALS_CHANGED');
    return claim;
  }
  async credentialRenewalApproval(org:string,actor:string,raw:unknown,thread?:string) {
    const {pilotId}=clipProductionPrepareV1.parse(raw),row=await this.row(this.repository,org,actor,thread,pilotId),prod=this.renewalScope(row.payload);
    await this.sources.assertCurrent(org,actor,row.payload.source);
    return {pilotId,threadId:row.payload.threadId,contextDigest:prod.contextDigest,firstFrameDigest:digest(prod.firstFrame),
      repairId:prod.lastFrameRepair!.id,repairBindingDigest:prod.lastFrameRepair!.bindingDigest,authorizationDigest:digest(prod.authorization?.value),
      scope:'same_oauth_grant_only' as const,quote:false,generation:false};
  }
  async renewCredentialsV2(org:string,actor:string,thread:string,request:{messageId:string;text:string},raw:unknown) {
    const {pilotId}=clipProductionPrepareV1.parse(raw),row=await this.row(this.repository,org,actor,thread,pilotId),prod=this.renewalScope(row.payload);
    await this.sources.assertCurrent(org,actor,row.payload.source);
    requireValue(request.messageId && request.text.trim() && ![row.payload.request.messageId,prod.request.messageId,prod.lastFrameRepair!.request.messageId].includes(request.messageId),
      'CLIP_NEW_CREDENTIAL_RENEWAL_REQUEST_REQUIRED');
    const api=this.hgg as HggPilotServicePortV1 & Partial<HggPilotCredentialsPortV2>;
    requireValue(api.renewCredentialBindingV2 && api.readCredentialBindingV2, 'CLIP_CREDENTIAL_RENEWAL_UNAVAILABLE');
    let claim=prod.credentialRenewalsV2?.at(-1),created=false;
    if(!claim){
      await this.update(org,actor,pilotId,async(p,revision,store)=>{
        const current=this.renewalScope(p);await store.assertArtifactSource!(org,actor,p.source.ref);
        if(current.credentialRenewalsV2?.length)return false;
        claim={version:2,request:structuredClone(request),state:'pending',input:{renewalId:identity('clip_credential_renewal_v2',pilotId,request.messageId),
          pilotId,parentRevision:revision+1,requestMessageId:request.messageId,originContextDigest:current.contextDigest,
          connectionId:current.connectionId!,accountGeneration:current.accountGeneration!,originWorkspace:structuredClone(current.workspace!),
          references:structuredClone(current.framePair!.receipts)}};
        current.credentialRenewalsV2=[claim];created=true;
      });
      if(!created)return this.open(org,actor,thread,pilotId);
    }else if(claim.request.messageId===request.messageId)requireValue(claim.request.text===request.text,'CLIP_CREDENTIAL_RENEWAL_CHANGED');
    if(claim!.state==='completed')return this.open(org,actor,thread,pilotId);
    // A lost provider/parent acknowledgement never authorizes another rotation.
    const credentials=created ? await api.renewCredentialBindingV2!(org,actor,claim!.input) : await api.readCredentialBindingV2!(org,actor,claim!.input);
    requireValue(credentials,'CLIP_CREDENTIAL_RENEWAL_UNCONFIRMED');
    await this.update(org,actor,pilotId,async(p,_revision,store)=>{
      this.renewalScope(p);await store.assertArtifactSource!(org,actor,p.source.ref);
      const saved=this.assertCredentialEnvelope(p,credentials!);
      requireValue(digest(saved.input)===digest(claim!.input),'CLIP_CREDENTIAL_RENEWAL_CHANGED');
      if(saved.state==='completed'){requireValue(digest(saved.credentials)===digest(credentials),'CLIP_EXECUTION_CREDENTIALS_CHANGED');return false;}
      saved.state='completed';saved.credentials=structuredClone(credentials!);p.production!.executionCredentialsV2=structuredClone(credentials!);
    });
    return this.open(org,actor,thread,pilotId);
  }
  async assertCredentialRenewalV2(tx:Prisma.TransactionClient,expected:HggCredentialRenewalRequestV2 & {organizationId:string;actorId:string}) {
    const row=await tx.socialFactoryRecord.findFirst({where:{organizationId:expected.organizationId,kind:KIND,id:expected.pilotId,deletedAt:null,invalidatedAt:null}}),p=row?.payload as unknown as Parent;
    requireValue(row && p?.actorId===expected.actorId && p.type==='native_clip_preproduction','CLIP_PREPRODUCTION_ACCESS_DENIED');
    const prod=this.renewalScope(p),claim=prod.credentialRenewalsV2?.find(item=>item.input.renewalId===expected.renewalId);
    const {organizationId:_org,actorId:_actor,...input}=expected;
    requireValue(claim && digest(claim.input)===digest(input) && claim.request.messageId===expected.requestMessageId && claim.request.text.trim() &&
      expected.parentRevision<=row.revision && expected.originContextDigest===prod.contextDigest && expected.connectionId===prod.connectionId &&
      expected.accountGeneration===prod.accountGeneration && digest(expected.originWorkspace)===digest(prod.workspace) &&
      digest(expected.references)===digest(prod.lastFrameRepair!.previous.framePair.receipts), 'CLIP_CREDENTIAL_RENEWAL_CHANGED');
    await assertSourceArtifactCurrentV1(tx,expected.organizationId,expected.actorId,p.source.ref);
    for(const [index,receipt] of expected.references.entries()){
      const original=prod.lastFrameRepair!.previous.framePair,asset=original.assets[index];
      requireValue(asset && receipt.ownedMediaId===asset.ownedMediaId && receipt.byteSha256===asset.byteSha256 &&
        asset.connectionId===prod.connectionId && asset.accountGeneration===prod.accountGeneration &&
        receipt.workspaceBindingHash===prod.workspace!.bindingHash,'CLIP_FRAME_BYTES_CHANGED');
      const media=await tx.media.findFirst({where:{organizationId:expected.organizationId,id:receipt.ownedMediaId,type:'image',deletedAt:null}});
      requireValue(media && media.path===original.paths[index],'CLIP_FRAME_BYTES_CHANGED');
      requireValue((await tx.media.updateMany({where:{organizationId:expected.organizationId,id:media.id,path:media.path,updatedAt:media.updatedAt,deletedAt:null},data:{updatedAt:media.updatedAt}})).count===1,'CLIP_FRAME_BYTES_CHANGED');
    }
    requireValue((await tx.socialFactoryRecord.updateMany({where:{organizationId:expected.organizationId,kind:KIND,id:row.id,revision:row.revision,deletedAt:null,invalidatedAt:null},data:{updatedAt:row.updatedAt}})).count===1,'CLIP_PRODUCTION_CONTEXT_CHANGED');
  }
  async assertCurrentPilotWithCredentialsV2(tx:Prisma.TransactionClient,expected:HggPilotExpectedV1 & {executionCredentials:HggExecutionCredentialsV2}) {
    const row=await tx.socialFactoryRecord.findFirst({where:{organizationId:expected.organizationId,kind:KIND,id:expected.input.source.pilotId,deletedAt:null,invalidatedAt:null}}),p=row?.payload as unknown as Parent;
    requireValue(row && p?.actorId===expected.actorId,'CLIP_PREPRODUCTION_ACCESS_DENIED');
    const claim=this.assertCredentialEnvelope(p,expected.executionCredentials);
    requireValue(claim.state==='completed' && digest(p.production!.executionCredentialsV2)===digest(expected.executionCredentials) &&
      digest(claim.credentials)===digest(expected.executionCredentials),'CLIP_EXECUTION_CREDENTIALS_CHANGED');
    if(expected.stage==='last_frame')requireValue(p.production!.lastFrameRepair?.quoteRefreshes?.at(-1)?.executionBindingHash===expected.executionCredentials.executionBindingHash,
      'CLIP_EXECUTION_CREDENTIALS_CHANGED');
    return this.assertCurrentPilot(tx,expected);
  }
  private async quoteForCredentials(org:string,actor:string,prod:ClipProductionV1,plan:HggPilotStagePreparationV1) {
    if(!prod.executionCredentialsV2)return this.hgg.quote(org,actor,plan);
    const api=this.hgg as HggPilotServicePortV1 & Partial<HggPilotCredentialsPortV2>;
    requireValue(api.quoteWithCredentialsV2,'CLIP_EXECUTION_CREDENTIALS_UNAVAILABLE');
    return api.quoteWithCredentialsV2!(org,actor,plan,prod.executionCredentialsV2);
  }
  private async frameForCredentials(org:string,actor:string,prod:ClipProductionV1,preflightId:string) {
    if(!prod.executionCredentialsV2)return this.hgg.frameReceipt(org,actor,preflightId);
    const api=this.hgg as HggPilotServicePortV1 & Partial<HggPilotCredentialsPortV2>;
    requireValue(api.frameReceiptWithCredentialsV2,'CLIP_EXECUTION_CREDENTIALS_UNAVAILABLE');
    return api.frameReceiptWithCredentialsV2!(org,actor,preflightId,prod.executionCredentialsV2);
  }
  private async update(org: string, actor: string, id: string, work: (p: Parent, revision: number, store: SocialFactoryRepository) => void | boolean | Promise<void | boolean>) {
    return this.repository.transact(async store => {
      const row = await this.row(store as SocialFactoryRepository, org, actor, undefined, id);
      if (await work(row.payload, row.revision, store as SocialFactoryRepository) === false) return false;
      await store.put({organizationId: org, kind: KIND, id, expectedRevision: row.revision, payload: row.payload});
      return true;
    });
  }
  async setExecutionModeV2(org: string, actor: string, thread: string, raw: unknown) {
    const input = clipExecutionModeInputV2.parse(raw);
    await this.row(this.repository, org, actor, thread, input.pilotId);
    await this.update(org, actor, input.pilotId, p => {
      requireValue(!p.production, 'CLIP_EXECUTION_MODE_LOCKED');
      p.executionModeV2 = {version: 2, mode: input.mode};
    });
    return {pilotId: input.pilotId, mode: input.mode};
  }
  async prepare(org: string, actor: string, thread: string, request: {messageId: string; text: string}, raw: unknown, budgetMode: 'owner_entered' | 'delegated_quote_bound' = 'owner_entered') {
    const {pilotId} = clipProductionPrepareV1.parse(raw), initial = await this.row(this.repository, org, actor, thread, pilotId);
    clipAcceptedTextV1(initial.payload); await this.sources.assertCurrent(org, actor, initial.payload.source);
    requireValue(request.messageId && request.text.trim() && request.messageId !== initial.payload.request.messageId, 'CLIP_NEW_PRODUCTION_REQUEST_REQUIRED');
    if (!initial.payload.production) await this.update(org, actor, pilotId, (p, revision) => {
      if (p.production) return; clipAcceptedTextV1(p);
      const selectionAuthorizationId = identity('clip_pilot_preparation', org, actor, pilotId, request.messageId);
      const prod: ClipProductionV1 = {version: 1, contextDigest: '', request, outputLocale: p.outputLocale,
        executionV2: {version: 2, mode: p.executionModeV2?.mode ?? 'review'},
        imageSettings: {variant: 'flare', quality: 'high', resolution: '1k'}, videoResolution: '720p', budgetMode, stagePlans: {}, settledEvents: [], blockers: [],
        workspaceIntent: {intentId: identity('clip_pilot_workspace', org, actor, pilotId, request.messageId), parentRevision: revision + 1, selectionAuthorizationId}};
      prod.contextDigest = clipProductionContextV1(p, prod); p.production = prod;
    });
    let row = await this.row(this.repository, org, actor, thread, pilotId), prod = row.payload.production!;
    requireValue((prod.budgetMode ?? 'owner_entered') === budgetMode, 'CLIP_PRODUCTION_BUDGET_MODE_CHANGED');
    if (!prod.workspace) {
      requireValue(!prod.connectionId && !prod.accountGeneration && prod.workspaceIntent, 'CLIP_PRODUCTION_CONTEXT_CHANGED');
      const workspace = await this.hgg.discoverWorkspace(org, actor, {...prod.workspaceIntent, pilotId});
      await this.update(org, actor, pilotId, p => {
        const current = p.production!;
        requireValue(digest(current.workspaceIntent) === digest(prod.workspaceIntent) && !current.stopped && current.contextDigest === clipProductionContextV1(p, current), 'CLIP_PRODUCTION_CONTEXT_CHANGED');
        requireValue(workspace.context === 'observed_private_owner' && workspace.connectionId && workspace.accountGeneration > 0 && hashPattern.test(workspace.bindingHash), 'CLIP_PRODUCTION_CONTEXT_CHANGED');
        current.workspace = workspace; current.connectionId = workspace.connectionId; current.accountGeneration = workspace.accountGeneration;
        current.contextDigest = clipProductionContextV1(p, current);
      });
    }
    await this.ensurePlan(org, actor, pilotId, 'first_frame');
    await this.drive(org, actor, pilotId, 'first_frame', false);
    if (budgetMode === 'delegated_quote_bound' && !prod.authorization) await this.prepareDelegatedCap(org, actor, pilotId);
    // An explicit continuation may apply an already captured paid review after
    // process loss. Opening the card never reaches this path or calls models.
    row = await this.row(this.repository, org, actor, thread, pilotId); prod = row.payload.production!;
    if (prod.stagePlans.last_frame && ['captured', 'reviewed'].includes(prod.vision?.state ?? '')) {
      const last = await this.hgg.getByIntent(org, actor, prod.stagePlans.last_frame.intentId);
      if (last?.state === 'saved' && last.jobId) await this.onStageSettled({eventId: last.jobId, organizationId: org, actorId: actor, pilotId, stage: 'last_frame', jobId: last.jobId});
    }
    return this.open(org, actor, thread, pilotId);
  }
  async budgetPrompt(org: string, actor: string, thread: string, id: string, language: string) {
    const row = await this.row(this.repository, org, actor, thread, id), prod = this.context(row.payload);
    await this.sources.assertCurrent(org, actor, row.payload.source);
    requireValue(prod.budgetMode !== 'delegated_quote_bound', 'CLIP_DELEGATED_BUDGET_DOES_NOT_ASK_PERSON');
    const payload = clipProductionBudgetQuestionV1.parse({question: language === 'ru'
      ? 'Какой общий лимит кредитов Higgsfield вы разрешаете для одного пилота: первый кадр, последний кадр и один клип? Введите только положительное число. Последующие цены ещё неизвестны; при нехватке лимита запуск остановится. Это локальный лимит допуска, а не предел списания провайдера.'
      : 'What total Higgsfield credit limit do you authorize for one pilot: first frame, last frame and one clip? Enter only a positive number. Later prices are unknown; insufficient budget stops further work. This is a local admission limit, not a provider billing cap.',
      options: [], questionPurpose: 'fact', canDecideForPerson: false});
    requireValue(!prod.authorization, 'CLIP_BUDGET_PERSON_ANSWER_REQUIRED'); return payload;
  }
  async budgetQuestion(org: string, actor: string, thread: string, id: string, toolCallId: string, language: string) {
    const payload = await this.budgetPrompt(org, actor, thread, id, language);
    requireValue(toolCallId, 'CLIP_BUDGET_PERSON_ANSWER_REQUIRED');
    await this.update(org, actor, id, p => { const current = this.context(p);
      requireValue(!current.budgetQuestion || current.budgetQuestion.toolCallId === toolCallId && current.budgetQuestion.contextDigest === current.contextDigest && current.budgetQuestion.cardId === questionCardId(payload),
        'CLIP_BUDGET_QUESTION_ALREADY_OPEN');
      current.budgetQuestion = {contextDigest: current.contextDigest, cardId: questionCardId(payload), requestMessageId: current.request.messageId, toolCallId}; });
    return payload;
  }
  async answerBudget(org: string, actor: string, thread: string, id: string, toolCallId: string, payload: unknown, answer: unknown) {
    await this.row(this.repository, org, actor, thread, id);
    const question = clipProductionBudgetQuestionV1.parse(payload), reply = clipProductionBudgetAnswerV1.parse(answer), ownerAnswer = reply.answer;
    // No wallet balance, model argument, infinity, delegation or per-job default can become this fact.
    requireValue(/^(?:0|[1-9][0-9]{0,11})(?:\.[0-9]{1,6})?$/.test(ownerAnswer) && Number(ownerAnswer) > 0, 'CLIP_FINITE_PILOT_BUDGET_REQUIRED');
    await this.repository.transact(async store => {
      const row = await this.row(store as SocialFactoryRepository, org, actor, thread, id), p = row.payload, prod = this.context(p), saved = prod.budgetQuestion;
      await store.assertArtifactSource!(org, actor, p.source.ref);
      requireValue(saved && saved.contextDigest === prod.contextDigest && saved.cardId === questionCardId(question) && saved.toolCallId === toolCallId && saved.requestMessageId === prod.request.messageId,
        'CLIP_BUDGET_ANSWER_BINDING_INVALID');
      const value = HggPilotAuthorizationSchemaV1.parse({id: digest({contextDigest: prod.contextDigest, cardId: saved.cardId, ownerAnswer}), unit: 'higgsfield_credit',
        pilotLimit: ownerAnswer, stageLimit: ownerAnswer, stages: [...CLIP_PILOT_STAGES_V1], funding: 'credits'});
      if (prod.authorization) requireValue(digest(prod.authorization.value) === digest(value), 'CLIP_BUDGET_ANSWER_BINDING_INVALID');
      else prod.authorization = {value, contextDigest: prod.contextDigest, ownerAnswer, cardId: saved.cardId, requestMessageId: saved.requestMessageId, toolCallId};
      await store.put({organizationId: org, kind: KIND, id, expectedRevision: row.revision, payload: p});
    });
    return this.open(org, actor, thread, id);
  }
  private source(p: Parent, id: string, revision: number) {
    const text = clipAcceptedTextV1(p);
    return {pilotId: id, parentRevision: revision, sourceArtifactRef: p.source.ref, sourceContentDigest: p.source.contentDigest,
      scenarioDigest: text.scenarioDigest, acceptedTextReviewDigest: text.acceptedTextReviewDigest, acceptedTextReviewInputHash: text.acceptedTextReviewInputHash};
  }
  private async prepareDelegatedCap(org: string, actor: string, id: string) {
    await this.update(org, actor, id, (p, revision) => {
      const prod = this.context(p); requireValue(prod.budgetMode === 'delegated_quote_bound', 'CLIP_PRODUCTION_BUDGET_MODE_CHANGED');
      if (prod.clipPlanningPlan || prod.authorization) return;
      prod.clipPlanningPlan = {intentId: identity('clip_pilot_planning_cost', org, actor, id, prod.contextDigest), connectionId: prod.connectionId!,
        accountGeneration: prod.accountGeneration!, workspaceQualificationId: prod.workspace!.qualificationId, publicOutputLocale: p.outputLocale,
        input: {version: 1, kind: 'video', source: this.source(p, id, revision + 1), prompt: clipPilotPromptV1(clipAcceptedTextV1(p).scenario, 'clip'),
          resolution: prod.videoResolution, frames: []}, references: []};
    });
    const row = await this.row(this.repository, org, actor, undefined, id), prod = this.context(row.payload);
    if (prod.authorization) return;
    const planning = await this.hgg.quotePlanningClip(org, actor, prod.clipPlanningPlan!);
    await this.update(org, actor, id, p => {this.context(p).clipPlanningQuote = planning;});
    const first = await this.hgg.getByIntent(org, actor, prod.stagePlans.first_frame!.intentId);
    if (!first?.quote || !planning.quote || !hashPattern.test(first.bindingHash) || !hashPattern.test(planning.bindingHash) ||
      Date.parse(first.quote.localAdmissionExpiresAt) <= Date.now() || Date.parse(planning.quote.localAdmissionExpiresAt) <= Date.now()) {
      await this.update(org, actor, id, p => {p.production!.blockers = ['CLIP_OPERATIONAL_CAP_QUOTES_REQUIRED'];}); return;
    }
    await this.repository.transact(async store => {
      const row = await this.row(store as SocialFactoryRepository, org, actor, undefined, id), p = row.payload, current = this.context(p);
      await store.assertArtifactSource!(org, actor, p.source.ref);
      if (current.authorization) return; // A later price can never silently raise an established cap.
      requireValue(current.budgetMode === 'delegated_quote_bound' && !current.budgetQuestion && !planning.jobId && planning.canSubmit === false &&
        planning.approvalHash === null && current.clipPlanningPlan?.input.kind === 'video' && current.clipPlanningPlan.input.frames.length === 0 &&
        current.clipPlanningPlan.references.length === 0 && digest(current.clipPlanningPlan) === digest(prod.clipPlanningPlan), 'CLIP_DELEGATED_QUOTE_BASIS_INVALID');
      const basis = {contextDigest: current.contextDigest, rule: CLIP_DELEGATED_CAP_RULE_V1, lastFrameTerm: 'estimate_same_as_first' as const,
        firstFrame: {preflightId: first.preflightId, bindingHash: first.bindingHash, amount: first.quote!.amount, capturedAt: first.quote!.capturedAt, inputDigest: digest(current.stagePlans.first_frame!.input)},
        clipPlanning: {preflightId: planning.preflightId, bindingHash: planning.bindingHash, amount: planning.quote!.amount, capturedAt: planning.quote!.capturedAt, inputDigest: digest(current.clipPlanningPlan.input)}};
      const limit = clipDelegatedCapV1(basis), value = HggPilotAuthorizationSchemaV1.parse({id: clipDelegatedAuthorizationIdV1(current, basis), unit: 'higgsfield_credit',
        pilotLimit: limit, stageLimit: limit, stages: [...CLIP_PILOT_STAGES_V1], funding: 'credits'});
      current.authorization = {source: 'delegated_quote_bound', value, contextDigest: current.contextDigest, requestMessageId: current.request.messageId,
        rawOwnerInstruction: current.request.text, basis, basisDigest: digest(basis)};
      current.blockers = current.blockers.filter(code => code !== 'CLIP_OPERATIONAL_CAP_QUOTES_REQUIRED');
      await store.put({organizationId: org, kind: KIND, id, expectedRevision: row.revision, payload: p});
    });
  }
  private async ensurePlan(org: string, actor: string, id: string, stage: HggPilotStageV1) {
    await this.update(org, actor, id, (p, revision) => {
      const prod = this.context(p); if (prod.stagePlans[stage]) return;
      const text = clipAcceptedTextV1(p), source = this.source(p, id, revision + 1), pair = prod.framePair;
      const first = prod.firstFrame?.asset, refs = stage === 'first_frame' ? [] : stage === 'last_frame' ? prod.firstFrame ? [prod.firstFrame.receipt] : [] : pair?.receipts ?? [];
      if (stage !== 'first_frame') requireValue(first && refs.length === (stage === 'clip' ? 2 : 1), 'CLIP_OWNED_FRAME_PAIR_REQUIRED');
      const prompt = clipPilotPromptV1(text.scenario, stage);
      const input: HggPilotStagePreparationV1['input'] = stage === 'clip'
        ? {version: 1, kind: 'video', source, prompt, frames: pair!.assets, resolution: prod.videoResolution}
        : {version: 1, kind: 'image_frame', slot: stage === 'first_frame' ? 'first' : 'last', source, prompt, settings: prod.imageSettings, references: stage === 'last_frame' && first ? [first] : []};
      prod.stagePlans[stage] = {intentId: identity('clip_pilot_stage', org, actor, id, prod.contextDigest, stage), connectionId: prod.connectionId!, accountGeneration: prod.accountGeneration!,
        workspaceQualificationId: prod.workspace!.qualificationId, publicOutputLocale: p.outputLocale, input, references: refs};
    });
  }
  private async snapshot(org: string, actor: string, id: string, stage: HggPilotStageV1, value: HggPilotStagePublicV1) {
    await this.update(org, actor, id, p => {p.production!.stageSnapshots ??= {}; p.production!.stageSnapshots[stage] = value;});
  }
  private async drive(org: string, actor: string, id: string, stage: HggPilotStageV1, allowSubmit = true) {
    const row = await this.row(this.repository, org, actor, undefined, id), prod = this.context(row.payload), plan = prod.stagePlans[stage]!;
    requireValue(plan, 'CLIP_STAGE_PLAN_REQUIRED'); await this.sources.assertCurrent(org, actor, row.payload.source);
    const prior = await this.hgg.getByIntent(org, actor, plan.intentId);
    if (prior?.jobId) return prior;
    let value = await this.quoteForCredentials(org, actor, prod, plan); await this.snapshot(org, actor, id, stage, value);
    const referenceConsent = stage !== 'clip' || prod.executionV2?.mode !== 'review' ||
      prod.executionV2.referencesApproval?.contextDigest === prod.contextDigest && prod.executionV2.referencesApproval.referenceDigest === clipReferenceDigestV2(row.payload, prod);
    if (allowSubmit && referenceConsent && prod.authorization?.executionApproval?.contextDigest === prod.contextDigest && value.approvalHash && value.canSubmit && value.localInputValidated && !value.jobId) {
      value = await this.hgg.admit(org, actor, value.preflightId, value.approvalHash); await this.snapshot(org, actor, id, stage, value);
    }
    return value;
  }
  /** The event is not human consent. Review mode parks durably without even requesting a clip quote. */
  private async continueClip(org: string, actor: string, id: string) {
    const row = await this.row(this.repository, org, actor, undefined, id), prod = this.context(row.payload);
    if (prod.executionV2?.mode === 'review' && (!prod.executionV2.referencesApproval ||
      prod.executionV2.referencesApproval.contextDigest !== prod.contextDigest || prod.executionV2.referencesApproval.referenceDigest !== clipReferenceDigestV2(row.payload, prod))) return;
    await this.ensurePlan(org, actor, id, 'clip');
    await this.drive(org, actor, id, 'clip');
  }
  async launch(org: string, actor: string, thread: string, raw: unknown) {
    const input = clipProductionLaunchV1.parse(raw), row = await this.row(this.repository, org, actor, thread, input.pilotId), saved = row.payload.production?.authorization?.executionApproval;
    if (saved && saved.preflightId === input.preflightId && saved.approvalHash === input.approvalHash && row.payload.production?.stagePlans.first_frame) {
      const existing = await this.hgg.getByIntent(org, actor, row.payload.production.stagePlans.first_frame.intentId);
      if (existing?.jobId) return this.open(org, actor, thread, input.pilotId);
    }
    const prod = this.context(row.payload);
    if (saved) requireValue(saved.contextDigest === prod.contextDigest && saved.preflightId === input.preflightId && saved.approvalHash === input.approvalHash, 'CLIP_PILOT_APPROVAL_CHANGED');
    else {
      const view = (await this.open(org, actor, thread, input.pilotId)).production!;
      requireValue(view.executionApproval.current && view.executionApproval.canApprove && view.executionApproval.preflightId === input.preflightId && view.executionApproval.approvalHash === input.approvalHash, 'CLIP_PILOT_APPROVAL_CHANGED');
      await this.repository.transact(async store => {
        const current = await this.row(store as SocialFactoryRepository, org, actor, thread, input.pilotId), currentProd = this.context(current.payload);
        await store.assertArtifactSource!(org, actor, current.payload.source.ref); requireValue(this.authorization(current.payload), 'CLIP_FINITE_PILOT_BUDGET_REQUIRED');
        if (currentProd.authorization!.executionApproval) requireValue(digest(currentProd.authorization!.executionApproval) === digest({contextDigest: currentProd.contextDigest, preflightId: input.preflightId, approvalHash: input.approvalHash}), 'CLIP_PILOT_APPROVAL_CHANGED');
        else currentProd.authorization!.executionApproval = {contextDigest: currentProd.contextDigest, preflightId: input.preflightId, approvalHash: input.approvalHash};
        await store.put({organizationId: org, kind: KIND, id: input.pilotId, expectedRevision: current.revision, payload: current.payload});
      });
    }
    await this.drive(org, actor, input.pilotId, 'first_frame'); return this.open(org, actor, thread, input.pilotId);
  }
  /** Invoked inside C's reservation and submitting transactions. Physical progress revisions may advance. */
  async assertCurrentPilot(tx: Prisma.TransactionClient, expected: HggPilotExpectedV1) {
    const id = expected.input.source.pilotId, row = await tx.socialFactoryRecord.findFirst({where: {organizationId: expected.organizationId, kind: KIND, id, deletedAt: null, invalidatedAt: null}});
    const p = row?.payload as unknown as Parent;
    requireValue(row && p?.actorId === expected.actorId && p.type === 'native_clip_preproduction', 'CLIP_PREPRODUCTION_ACCESS_DENIED');
    const prod = this.context(p), planning = expected.stage === 'clip' && expected.input.kind === 'video' && expected.input.frames.length === 0;
    const repair = prod.lastFrameRepair && expected.stage === 'last_frame' && digest(prod.lastFrameRepair.plan.input) === digest(expected.input)
      ? assertClipLastFrameRepairV1(p, prod) : undefined;
    const plan = repair ? repair.plan : planning ? prod.clipPlanningPlan : prod.stagePlans[expected.stage];
    requireValue(!planning || expected.action === 'quote', 'CLIP_PLANNING_QUOTE_CANNOT_SUBMIT');
    requireValue(plan && digest(plan.input) === digest(expected.input) && plan.publicOutputLocale === expected.publicOutputLocale && expected.publicOutputLocale === p.outputLocale &&
      prod.workspace!.bindingHash === expected.workspaceBindingHash && plan.connectionId === prod.connectionId && plan.accountGeneration === prod.accountGeneration &&
      plan.input.source.parentRevision <= row.revision && hashPattern.test(expected.requestHash) && hashPattern.test(expected.modelBindingHash), 'CLIP_STAGE_BINDING_CHANGED');
    const quoteBinding = repair ? repair.snapshot?.bindingHash : planning ? prod.clipPlanningQuote?.bindingHash : prod.stageSnapshots?.[expected.stage]?.bindingHash;
    requireValue(!quoteBinding || quoteBinding === expected.requestHash, 'CLIP_STAGE_BINDING_CHANGED');
    const text = clipAcceptedTextV1(p), source = expected.input.source;
    requireValue(expected.input.prompt === (repair ? clipLastFrameRepairPromptV1(p,repair) : clipPilotPromptV1(text.scenario, expected.stage)) && (expected.input.kind === 'image_frame'
      ? expected.input.slot === (expected.stage === 'first_frame' ? 'first' : 'last') && expected.stage !== 'clip' && digest(expected.input.settings) === digest(prod.imageSettings) && expected.input.references.length === (expected.stage === 'first_frame' ? 0 : 1)
      : expected.stage === 'clip' && expected.input.resolution === prod.videoResolution && expected.input.frames.length === (planning ? 0 : 2)), 'CLIP_STAGE_BINDING_CHANGED');
    requireValue(digest(source.sourceArtifactRef) === digest(p.source.ref) && source.sourceContentDigest === p.source.contentDigest && source.scenarioDigest === text.scenarioDigest &&
      source.acceptedTextReviewDigest === text.acceptedTextReviewDigest && source.acceptedTextReviewInputHash === text.acceptedTextReviewInputHash, 'CLIP_STAGE_BINDING_CHANGED');
    const assets = (expected.input.kind === 'video' ? expected.input.frames : expected.input.references) as ClipPilotFrameAssetV1[];
    const settings = expected.input.kind === 'video' ? {mode: 'image-to-video', resolution: expected.input.resolution ?? '1080p', duration: 5, aspect_ratio: '9:16', count: 1} : {...expected.input.settings, aspect_ratio: '9:16', count: 1};
    requireValue(expected.inputOrderDigest === digest(assets) && expected.settingsHash === digest(settings), 'CLIP_STAGE_BINDING_CHANGED');
    await assertSourceArtifactCurrentV1(tx, expected.organizationId, expected.actorId, p.source.ref);
    for (const asset of assets) {
      const pairIndex = asset.slot === 'first' ? 0 : 1, pinned = asset.slot === 'first' ? prod.firstFrame?.asset : prod.framePair?.assets[1];
      requireValue(pinned && digest(pinned) === digest(asset), 'CLIP_FRAME_BYTES_CHANGED');
      const media = await tx.media.findFirst({where: {id: asset.ownedMediaId, organizationId: expected.organizationId, deletedAt: null, type: 'image'}});
      requireValue(media && media.path === (asset.slot === 'first' ? prod.firstFrame?.path : prod.framePair?.paths[pairIndex]), 'CLIP_FRAME_BYTES_CHANGED');
      requireValue((await tx.media.updateMany({where: {id: media.id, organizationId: expected.organizationId, path: media.path, deletedAt: null, updatedAt: media.updatedAt}, data: {updatedAt: media.updatedAt}})).count === 1, 'CLIP_FRAME_BYTES_CHANGED');
    }
    if (expected.stage === 'clip' && !planning) {
      const vision = clipVisionPublicV1(p, prod, true);
      requireValue(vision?.current && vision.state === 'reviewed' && vision.verdict === 'accept' && !vision.findings.length &&
        prod.vision && clipVisionModelVerifiedV1(p, prod.vision) &&
        prod.vision.inputDigest === digest(clipVisionInputV1(p, prod)), 'CLIP_CURRENT_VISION_REVIEW_REQUIRED');
      if (expected.action !== 'quote' && prod.executionV2?.mode === 'review') {
        const approval = prod.executionV2.referencesApproval;
        requireValue(approval && approval.contextDigest === prod.contextDigest && approval.referenceDigest === clipReferenceDigestV2(p, prod),
          'CLIP_REFERENCE_APPROVAL_REQUIRED');
      }
    }
    const authorization = this.authorization(p);
    if (repair && expected.action !== 'quote') requireValue(!clipLastFrameRepairQuotePendingV1(repair), 'CLIP_REPAIR_QUOTE_REFRESH_PENDING');
    if (repair && expected.action !== 'quote') requireValue(repair.approval && repair.approval.approvalHash === expected.approvalHash &&
      repair.approval.preflightId === repair.snapshot?.preflightId, 'CLIP_REPAIR_APPROVAL_REQUIRED');
    if (expected.action !== 'quote') requireValue(authorization && prod.authorization!.executionApproval?.contextDigest === prod.contextDigest && expected.approvalHash,
      'CLIP_WHOLE_PILOT_APPROVAL_REQUIRED');
    requireValue((await tx.socialFactoryRecord.updateMany({where: {organizationId: expected.organizationId, kind: KIND, id, revision: row.revision, deletedAt: null, invalidatedAt: null}, data: {updatedAt: row.updatedAt}})).count === 1,
      'CLIP_PRODUCTION_CONTEXT_CHANGED');
    return {authorization: planning ? null : authorization,...(repair && authorization?{lastFrameRepair:{version:1 as const,repairId:repair.id,intentId:repair.plan.intentId,
      previousJobId:repair.previous.snapshot.jobId!,previousPreflightId:repair.previous.snapshot.preflightId,previousRequestHash:repair.previous.snapshot.bindingHash,
      requestHash:expected.requestHash,authorizationId:authorization.id,bindingDigest:repair.bindingDigest}}:{})};
  }
  async assertWorkspaceSelection(tx: Prisma.TransactionClient, expected: HggPilotWorkspacePreparationV1 & {organizationId: string; actorId: string}) {
    const row = await tx.socialFactoryRecord.findFirst({where: {organizationId: expected.organizationId, kind: KIND, id: expected.pilotId, deletedAt: null, invalidatedAt: null}}), p = row?.payload as unknown as Parent, prod = p?.production;
    requireValue(row && p.actorId === expected.actorId && prod && !prod.stopped && prod.request.messageId !== p.request.messageId &&
      prod.contextDigest === clipProductionContextV1(p, prod) && prod.workspaceIntent?.selectionAuthorizationId === expected.selectionAuthorizationId &&
      prod.workspaceIntent.intentId === expected.intentId && prod.workspaceIntent.parentRevision === expected.parentRevision && expected.parentRevision <= row.revision,
      'CLIP_WORKSPACE_PREPARATION_REQUIRED');
    await assertSourceArtifactCurrentV1(tx, expected.organizationId, expected.actorId, p.source.ref);
    requireValue((await tx.socialFactoryRecord.updateMany({where: {organizationId: expected.organizationId, kind: KIND, id: expected.pilotId, revision: row.revision}, data: {updatedAt: row.updatedAt}})).count === 1, 'CLIP_PRODUCTION_CONTEXT_CHANGED');
  }
  async onStageSettled(event: HggPilotStageSettledV1) {
    const {organizationId: org, actorId: actor, pilotId: id, stage} = event;
    let row = await this.row(this.repository, org, actor, undefined, id), prod = row.payload.production!, plan = prod?.stagePlans[stage];
    if (stage === 'last_frame' && prod?.lastFrameRepair) {
      requireValue(event.eventId===event.jobId,'CLIP_STAGE_EVENT_INVALID');
      if (prod.lastFrameRepair.previous.snapshot.jobId===event.jobId) return;
      const repaired=await this.hgg.getByIntent(org,actor,prod.lastFrameRepair.plan.intentId);
      if (repaired?.jobId===event.jobId) return this.settleLastFrameRepair(event,repaired);
    }
    requireValue(plan && event.eventId === event.jobId, 'CLIP_STAGE_EVENT_INVALID');
    if (prod.settledEvents.some(saved => saved.eventId === event.eventId && saved.state === 'applied') &&
      !(stage === 'last_frame' && ['captured', 'reviewed'].includes(prod.vision?.state ?? ''))) return;
    const settled = await this.hgg.getByIntent(org, actor, plan.intentId);
    requireValue(settled && settled.jobId === event.jobId && settled.pilotId === id && settled.stage === stage, 'CLIP_STAGE_EVENT_INVALID');
    try {this.context(row.payload);await this.sources.assertCurrent(org, actor, row.payload.source);} catch (error) {
      await this.update(org, actor, id, p => {
        p.production!.blockers = [errorCode(error)];
        const existing = p.production!.settledEvents.find(saved => saved.eventId === event.eventId);
        if (existing) existing.state = 'applied'; else p.production!.settledEvents.push({eventId: event.eventId, stage, state: 'applied'});
      }); return;
    }
    await this.update(org, actor, id, p => { const current = this.context(p);
      if (!current.settledEvents.some(saved => saved.eventId === event.eventId)) current.settledEvents.push({eventId: event.eventId, stage, state: 'started'});
      current.stageSnapshots ??= {}; current.stageSnapshots[stage] = settled;
    });
    if (settled.state !== 'saved' || !settled.result) {
      await this.update(org, actor, id, p => {p.production!.blockers = [settled.errorCode ?? 'CLIP_STAGE_RESULT_UNAVAILABLE']; p.production!.settledEvents.find(saved => saved.eventId === event.eventId)!.state = 'applied';}); return;
    }
    if (stage === 'first_frame' || stage === 'last_frame') {
      const receipt = await this.hgg.frameReceipt(org, actor, settled.preflightId);
      requireValue(receipt.ownedMediaId === settled.result.ownedMediaId && receipt.byteSha256 === settled.result.byteSha256 && receipt.workspaceBindingHash === prod.workspace!.bindingHash &&
        receipt.connectionId === prod.connectionId && receipt.accountGeneration === prod.accountGeneration, 'CLIP_FRAME_BYTES_CHANGED');
      await this.update(org, actor, id, p => {
        const current = this.context(p), core = {ownedMediaId: receipt.ownedMediaId, byteSha256: receipt.byteSha256,
          providerMediaId: receipt.providerMediaId, connectionId: receipt.connectionId, accountGeneration: receipt.accountGeneration};
        if (stage === 'first_frame') current.firstFrame = {receipt, asset: {...core, slot: 'first'}, path: settled.result!.path};
        else {requireValue(current.firstFrame && current.firstFrame.asset.ownedMediaId !== core.ownedMediaId, 'CLIP_OWNED_FRAME_PAIR_REQUIRED');
          current.framePair = {receipts: [current.firstFrame.receipt, receipt], assets: [current.firstFrame.asset, {...core, slot: 'last'}], paths: [current.firstFrame.path, settled.result!.path]};}
      });
      if (stage === 'first_frame') {await this.ensurePlan(org, actor, id, 'last_frame'); await this.drive(org, actor, id, 'last_frame');}
      else {
        const vision = await this.vision.review(org, actor, id);
        if (vision.state === 'running' || vision.state === 'captured') requireValue(false, 'CLIP_VISION_CONTINUATION_PENDING');
        if (vision.state === 'reviewed') {await this.update(org, actor, id, p => {p.production!.blockers = [];});await this.continueClip(org, actor, id);}
        else await this.update(org, actor, id, p => {p.production!.blockers = [vision.blocker ?? 'CLIP_CURRENT_VISION_REVIEW_REQUIRED'];});
      }
    }
    await this.update(org, actor, id, p => {p.production!.settledEvents.find(saved => saved.eventId === event.eventId)!.state = 'applied';});
  }
  async prepareLastFrameRepair(org: string, actor: string, thread: string, request: {messageId:string;text:string}, raw: unknown) {
    const {pilotId}=clipProductionPrepareV1.parse(raw), row=await this.row(this.repository,org,actor,thread,pilotId), prod=this.context(row.payload);
    await this.sources.assertCurrent(org,actor,row.payload.source);
    if (prod.lastFrameRepair) {
      const r=assertClipLastFrameRepairV1(row.payload,prod);
      requireValue(r.request.messageId===request.messageId && r.request.text===request.text,'CLIP_REPAIR_ATTEMPT_EXISTS');
      if (r.approval) {
        // Explicit continuation can apply a captured review or finish a saved
        // accepted pair after process loss. Opening the card never enters here.
        if (r.state==='vision_pending' || r.state==='reviewed') {
          const saved=await this.hgg.getByIntent(org,actor,r.plan.intentId);
          if(saved?.state==='saved' && saved.jobId)await this.onStageSettled({eventId:saved.jobId,jobId:saved.jobId,organizationId:org,actorId:actor,pilotId,stage:'last_frame'});
        }
        return this.open(org,actor,thread,pilotId);
      }
      if(r.snapshot)return this.open(org,actor,thread,pilotId);
    } else {
      const vision=clipVisionPublicV1(row.payload,prod,true);
      requireValue(request.messageId && request.text.trim() && request.messageId!==prod.request.messageId && request.messageId!==row.payload.request.messageId,'CLIP_NEW_REPAIR_REQUEST_REQUIRED');
      requireValue(vision?.current && vision.state==='needs_input' && vision.verdict==='blocked' && vision.findings.length &&
        prod.firstFrame && prod.framePair && prod.stagePlans.last_frame && !prod.stagePlans.clip && this.authorization(row.payload) && prod.authorization?.executionApproval,'CLIP_REPAIR_NOT_AVAILABLE');
      const first=await this.hgg.getByIntent(org,actor,prod.stagePlans.first_frame!.intentId), last=await this.hgg.getByIntent(org,actor,prod.stagePlans.last_frame.intentId);
      requireValue(first?.state==='saved' && last?.state==='saved' && first.result?.ownedMediaId===prod.firstFrame.asset.ownedMediaId &&
        first.result.byteSha256===prod.firstFrame.asset.byteSha256 && last.result?.ownedMediaId===prod.framePair.assets[1].ownedMediaId &&
        last.result.byteSha256===prod.framePair.assets[1].byteSha256,'CLIP_REPAIR_NOT_AVAILABLE');
      await this.update(org,actor,pilotId,async(p,revision,store)=>{
        const current=this.context(p);
        if(current.lastFrameRepair){requireValue(current.lastFrameRepair.request.messageId===request.messageId && current.lastFrameRepair.request.text===request.text,'CLIP_REPAIR_ATTEMPT_EXISTS');return false;}
        await store.assertArtifactSource!(org,actor,p.source.ref);
        requireValue(digest(current.framePair)===digest(prod.framePair) && digest(current.vision)===digest(prod.vision) && !current.stagePlans.clip,'CLIP_REPAIR_BINDING_CHANGED');
        const r={version:1 as const,id:identity('clip_last_frame_repair',org,actor,pilotId,request.messageId,current.vision!.inputDigest),pilotId,
          request:structuredClone(request),contextDigest:current.contextDigest,firstFrameDigest:digest(current.firstFrame),authorizationDigest:digest(current.authorization!.value),
          reason:current.vision!.result!.findings.map(f=>f.detail).join('\n'),bindingDigest:'',
          previous:structuredClone({plan:current.stagePlans.last_frame!,snapshot:last!,framePair:current.framePair!,vision:current.vision!}),
          state:'preparing' as const} as ClipLastFrameRepairV1;
        r.bindingDigest=clipLastFrameRepairDigestV1(r);
        r.plan={...structuredClone(r.previous.plan),intentId:identity('clip_last_frame_repair_stage',r.id),
          input:{version:1,kind:'image_frame',slot:'last',source:this.source(p,pilotId,revision+1),prompt:clipLastFrameRepairPromptV1(p,r),
            settings:structuredClone(current.imageSettings),references:[structuredClone(current.firstFrame!.asset)]},references:[structuredClone(current.firstFrame!.receipt)]};
        current.lastFrameRepair=r;assertClipLastFrameRepairV1(p,current);
      });
    }
    const current=await this.row(this.repository,org,actor,thread,pilotId), r=assertClipLastFrameRepairV1(current.payload,this.context(current.payload));
    const quote=await this.quoteForCredentials(org,actor,prod,r.plan);
    await this.update(org,actor,pilotId,p=>{const saved=assertClipLastFrameRepairV1(p,this.context(p));requireValue(saved.id===r.id,'CLIP_REPAIR_APPROVAL_CHANGED');
      if(saved.snapshot || saved.quoteRefreshes?.length || saved.approval)return false;
      saved.snapshot=quote;saved.state='awaiting_approval';});
    return this.open(org,actor,thread,pilotId);
  }
  async lastFrameRepairApproval(org:string,actor:string,raw:unknown){
    const input=clipLastFrameRepairLaunchV1.parse(raw), row=await this.row(this.repository,org,actor,undefined,input.pilotId),r=assertClipLastFrameRepairV1(row.payload,this.context(row.payload));
    await this.sources.assertCurrent(org,actor,row.payload.source);
    const quote=await this.hgg.getByIntent(org,actor,r.plan.intentId);
    requireValue(r.id===input.repairId && r.state==='awaiting_approval' && !r.approval && !clipLastFrameRepairQuotePendingV1(r) && quote && !quote.jobId && quote.preflightId===input.preflightId && quote.approvalHash===input.approvalHash &&
      quote.localInputValidated && quote.ownerLimit?.authorized && quote.quote && Date.parse(quote.quote.localAdmissionExpiresAt)>Date.now() &&
      quote.blockers.every(code=>code==='VIDEO_PILOT_REPAIR_APPROVAL_REQUIRED'),'CLIP_REPAIR_APPROVAL_CHANGED');
    return {pilotId:input.pilotId,repairId:r.id,threadId:row.payload.threadId,bindingDigest:r.bindingDigest,contextDigest:r.contextDigest,
      firstFrameDigest:r.firstFrameDigest,source:row.payload.source.ref,reason:r.reason,requestMessageId:r.request.messageId,quoteRefreshId:r.quoteRefreshes?.at(-1)?.id??null,
      preflightId:quote.preflightId,approvalHash:quote.approvalHash,quote:quote.quote,ownerLimit:quote.ownerLimit};
  }
  async refreshLastFrameRepairQuote(org:string,actor:string,thread:string,request:{messageId:string;text:string},raw:unknown){
    const input=clipLastFrameRepairRefreshV1.parse(raw),row=await this.row(this.repository,org,actor,thread,input.pilotId),prod=this.context(row.payload),r=assertClipLastFrameRepairV1(row.payload,prod);
    requireValue(!prod.credentialRenewalsV2?.some(claim=>claim.state==='pending'),'CLIP_CREDENTIAL_RENEWAL_PENDING');
    await this.sources.assertCurrent(org,actor,row.payload.source);
    requireValue(r.id===input.repairId && request.messageId && request.text.trim() &&
      ![r.request.messageId,prod.request.messageId,row.payload.request.messageId].includes(request.messageId),'CLIP_NEW_QUOTE_REFRESH_REQUEST_REQUIRED');
    requireValue(!prod.credentialRenewalsV2?.some(claim=>claim.request.messageId===request.messageId),'CLIP_NEW_QUOTE_REFRESH_REQUEST_REQUIRED');
    const prior=r.quoteRefreshes?.find(refresh=>refresh.request.messageId===request.messageId);
    if(prior)requireValue(prior.request.text===request.text,'CLIP_REPAIR_QUOTE_REFRESH_CHANGED');
    const recoveredRequest=r.quoteRefreshes?.flatMap(refresh=>refresh.recoveryRequests??[]).find(author=>author.messageId===request.messageId);
    if(recoveredRequest){requireValue(recoveredRequest.text===request.text,'CLIP_REPAIR_QUOTE_REFRESH_CHANGED');return this.open(org,actor,thread,input.pilotId);}
    const recover=r.quoteRefreshes?.at(-1);
    let supersede:string|undefined,observedExpired:HggPilotStagePublicV1|undefined;
    if(recover && ['pending','failed'].includes(recover.state)){
      requireValue(!r.approval,'CLIP_REPAIR_QUOTE_REFRESH_UNAVAILABLE');
      const captured=await this.hgg.getByIntent(org,actor,r.plan.intentId);
      if(this.isRefreshedRepairQuote(recover.previousSnapshot,captured)){
        await this.saveRefreshedRepairQuote(org,actor,input.pilotId,recover.id,captured!,request);
        return this.open(org,actor,thread,input.pilotId);
      }
      requireValue(!captured?.jobId,'CLIP_REPAIR_QUOTE_REFRESH_UNAVAILABLE');
      if(prior?.state==='pending')return this.open(org,actor,thread,input.pilotId);
      if(prod.executionCredentialsV2)requireValue(recover.state==='failed','CLIP_REPAIR_QUOTE_REFRESH_PENDING');
      if(!prior && this.isExpiredRepairQuoteForCredentials(prod,captured)){supersede=recover.id;observedExpired=captured!;}
      else requireValue(false,recover.state==='pending'?'CLIP_REPAIR_QUOTE_REFRESH_PENDING':'CLIP_REPAIR_QUOTE_REFRESH_UNCONFIRMED');
    }
    if(prior)return this.open(org,actor,thread,input.pilotId);
    requireValue(!r.approval && (supersede ? ['preparing','blocked'].includes(r.state) : !clipLastFrameRepairQuotePendingV1(r) && r.state==='awaiting_approval'),'CLIP_REPAIR_QUOTE_REFRESH_UNAVAILABLE');
    const saved=observedExpired??await this.hgg.getByIntent(org,actor,r.plan.intentId);
    requireValue(this.isExpiredRepairQuoteForCredentials(prod,saved) && r.snapshot?.quote && !r.snapshot.jobId && r.snapshot.preflightId===saved!.preflightId && r.snapshot.bindingHash===saved!.bindingHash,
      'CLIP_REPAIR_QUOTE_REFRESH_UNAVAILABLE');
    const refreshId=identity('clip_repair_quote_refresh',r.id,request.messageId);
    const claimed=await this.update(org,actor,input.pilotId,async(p,_revision,store)=>{
      const current=assertClipLastFrameRepairV1(p,this.context(p));await store.assertArtifactSource!(org,actor,p.source.ref);
      const duplicate=current.quoteRefreshes?.find(refresh=>refresh.id===refreshId);
      if(duplicate){requireValue(duplicate.request.text===request.text,'CLIP_REPAIR_QUOTE_REFRESH_CHANGED');return false;}
      const interrupted=supersede?current.quoteRefreshes?.find(item=>item.id===supersede):undefined;
      requireValue(current.id===r.id && !current.approval && (supersede ? interrupted && !interrupted.supersededBy && ['pending','failed'].includes(interrupted.state) : !clipLastFrameRepairQuotePendingV1(current) && current.state==='awaiting_approval') &&
        digest(current.snapshot)===digest(r.snapshot),'CLIP_REPAIR_QUOTE_REFRESH_CHANGED');
      if(interrupted && p.production!.executionCredentialsV2){
        requireValue(interrupted.state==='failed','CLIP_REPAIR_QUOTE_REFRESH_PENDING');
        current.snapshot=saved!;
      }else if(interrupted){
        // Only a positively expired QUOTED preflight may start another price
        // claim. Never reissue quote_pending or arbitrary quote_failed calls.
        interrupted.state='failed';interrupted.supersededBy=refreshId;interrupted.errorCode??='CLIP_REPAIR_QUOTE_REFRESH_SUPERSEDED';
        interrupted.snapshot??=structuredClone(saved!);current.snapshot=saved!;
      }
      (current.quoteRefreshes??=[]).push({version:1,id:refreshId,request:structuredClone(request),repairBindingDigest:current.bindingDigest,
        previousSnapshot:structuredClone(current.snapshot!),state:'pending',
        ...(p.production!.executionCredentialsV2?{executionBindingHash:p.production!.executionCredentialsV2.executionBindingHash,...(interrupted?{priorRefreshId:interrupted.id}:{})}:{})});
      current.state='preparing';
    });
    if(!claimed)return this.open(org,actor,thread,input.pilotId);
    let fresh:HggPilotStagePublicV1|undefined;
    try{
      // C reuses exactly this expired, unsubmitted intent/preflight and archives
      // priorQuotes. Its existing expiry-bound hash requires fresh consent.
      fresh=await this.quoteForCredentials(org,actor,prod,r.plan);
      requireValue(this.isRefreshedRepairQuote(saved!,fresh),'CLIP_REPAIR_QUOTE_REFRESH_UNCONFIRMED');
      await this.saveRefreshedRepairQuote(org,actor,input.pilotId,refreshId,fresh);
    }catch(error){
      await this.update(org,actor,input.pilotId,p=>{const current=p.production!.lastFrameRepair!,refresh=current.quoteRefreshes?.find(item=>item.id===refreshId);
        if(refresh?.state==='pending'){refresh.state='failed';refresh.errorCode=errorCode(error);if(fresh)refresh.snapshot=structuredClone(fresh);current.state='blocked';}});
      throw error;
    }
    return this.open(org,actor,thread,input.pilotId);
  }
  private isExpiredRepairQuote(saved:HggPilotStagePublicV1|null|undefined){
    return !!saved && !saved.jobId && saved.state==='awaiting_approval' && !saved.errorCode && !!saved.quote &&
      Date.parse(saved.quote.localAdmissionExpiresAt)<=Date.now() && saved.blockers.length>0 && saved.blockers.every(code=>code==='VIDEO_PREFLIGHT_STALE');
  }
  private isExpiredRepairQuoteForCredentials(prod:ClipProductionV1,saved:HggPilotStagePublicV1|null|undefined){
    if(!prod.executionCredentialsV2)return this.isExpiredRepairQuote(saved);
    // This is eligibility for a NEW authored price attempt, not evidence that
    // the old attempt never dispatched. C atomically rechecks quoted/expired,
    // no job/submit and current epoch before its strictly quote-mode request.
    const completed=prod.credentialRenewalsV2?.find(claim=>claim.state==='completed' && digest(claim.credentials)===digest(prod.executionCredentialsV2));
    return !!completed && !!saved && !saved.jobId && saved.state==='awaiting_approval' && !saved.errorCode && !!saved.quote &&
      Date.parse(saved.quote.localAdmissionExpiresAt)<=Date.now() && saved.blockers.length>0 &&
      saved.blockers.every(code=>code==='VIDEO_PREFLIGHT_STALE'||code==='VIDEO_CONNECTION_CHANGED');
  }
  private isRefreshedRepairQuote(previous:HggPilotStagePublicV1,fresh:HggPilotStagePublicV1|null|undefined){
    return !!fresh && !fresh.jobId && fresh.state==='awaiting_approval' && !fresh.errorCode && fresh.localInputValidated &&
      fresh.pilotId===previous.pilotId && fresh.stage==='last_frame' && fresh.preflightId===previous.preflightId && fresh.bindingHash===previous.bindingHash &&
      !!fresh.quote && !!fresh.approvalHash && fresh.approvalHash!==previous.approvalHash &&
      Date.parse(fresh.quote.localAdmissionExpiresAt)>Date.now() && Date.parse(fresh.quote.localAdmissionExpiresAt)>Date.parse(previous.quote!.localAdmissionExpiresAt);
  }
  private async saveRefreshedRepairQuote(org:string,actor:string,pilotId:string,refreshId:string,fresh:HggPilotStagePublicV1,recoveryRequest?:{messageId:string;text:string}){
    await this.update(org,actor,pilotId,async(p,_revision,store)=>{
      const current=assertClipLastFrameRepairV1(p,this.context(p)),refresh=current.quoteRefreshes?.find(item=>item.id===refreshId);
      await store.assertArtifactSource!(org,actor,p.source.ref);requireValue(refresh,'CLIP_REPAIR_QUOTE_REFRESH_CHANGED');
      if(refresh.state==='completed'){
        requireValue(refresh.snapshot?.approvalHash===fresh.approvalHash && refresh.snapshot?.preflightId===fresh.preflightId,'CLIP_REPAIR_QUOTE_REFRESH_CHANGED');
        return false;
      }
      requireValue(!refresh.supersededBy && ['pending','failed'].includes(refresh.state) && !current.approval && this.isRefreshedRepairQuote(refresh.previousSnapshot,fresh),'CLIP_REPAIR_QUOTE_REFRESH_CHANGED');
      if(recoveryRequest && recoveryRequest.messageId!==refresh.request.messageId){
        const old=refresh.recoveryRequests?.find(request=>request.messageId===recoveryRequest.messageId);
        requireValue(!old || old.text===recoveryRequest.text,'CLIP_REPAIR_QUOTE_REFRESH_CHANGED');
        if(!old)(refresh.recoveryRequests??=[]).push(structuredClone(recoveryRequest));
      }
      refresh.snapshot=structuredClone(fresh);refresh.state='completed';current.snapshot=fresh;current.state='awaiting_approval';
    });
  }
  async launchLastFrameRepair(org:string,actor:string,thread:string,raw:unknown){
    const input=clipLastFrameRepairLaunchV1.parse(raw),row=await this.row(this.repository,org,actor,thread,input.pilotId),r=assertClipLastFrameRepairV1(row.payload,this.context(row.payload));
    requireValue(r.id===input.repairId,'CLIP_REPAIR_APPROVAL_CHANGED');
    if(r.approval){requireValue(r.approval.preflightId===input.preflightId && r.approval.approvalHash===input.approvalHash,'CLIP_REPAIR_APPROVAL_CHANGED');
      if((await this.hgg.getByIntent(org,actor,r.plan.intentId))?.jobId)return this.open(org,actor,thread,input.pilotId);
    }else{
      const validated=await this.lastFrameRepairApproval(org,actor,input);
      await this.update(org,actor,input.pilotId,async(p,_revision,store)=>{const current=assertClipLastFrameRepairV1(p,this.context(p));
        await store.assertArtifactSource!(org,actor,p.source.ref);
        requireValue(!clipLastFrameRepairQuotePendingV1(current),'CLIP_REPAIR_QUOTE_REFRESH_PENDING');
        if(current.approval){requireValue(current.approval.preflightId===input.preflightId && current.approval.approvalHash===input.approvalHash,'CLIP_REPAIR_APPROVAL_CHANGED');return false;}
        requireValue(current.state==='awaiting_approval' && current.snapshot?.preflightId===validated.preflightId && current.snapshot.approvalHash===validated.approvalHash &&
          (current.quoteRefreshes?.at(-1)?.id??null)===validated.quoteRefreshId && Date.parse(validated.quote.localAdmissionExpiresAt)>Date.now(),'CLIP_REPAIR_APPROVAL_CHANGED');
        current.approval={preflightId:input.preflightId,approvalHash:input.approvalHash};current.state='approved';});
    }
    // C atomically checks the fresh quote, same authorization, ALL old reserves
    // and its unique preflight job. An uncertain submit is never a new intent.
    let value:HggPilotStagePublicV1;
    try{value=await this.hgg.admit(org,actor,input.preflightId,input.approvalHash);}
    catch(error){
      // A racing identical launch may already have committed THIS preflight.
      // Only that positive job receipt permits a readback; never retry submit.
      if(errorCode(error)==='CLIP_PRODUCTION_CONTEXT_CHANGED'){
        const saved=await this.hgg.getByIntent(org,actor,r.plan.intentId);
        if(saved?.jobId && saved.preflightId===input.preflightId)return this.open(org,actor,thread,input.pilotId);
      }
      throw error;
    }
    await this.update(org,actor,input.pilotId,p=>{requireValue(p.production!.lastFrameRepair?.id===r.id,'CLIP_REPAIR_BINDING_CHANGED');p.production!.lastFrameRepair!.snapshot=value;});
    return this.open(org,actor,thread,input.pilotId);
  }
  private async settleLastFrameRepair(event:HggPilotStageSettledV1,settled:HggPilotStagePublicV1){
    const {organizationId:org,actorId:actor,pilotId:id}=event;
    let row=await this.row(this.repository,org,actor,undefined,id),r=row.payload.production!.lastFrameRepair!;
    if(r.state==='blocked' && (r.promoted || r.snapshot?.state==='saved'))return;
    if(r.state==='reviewed'){
      const clip=row.payload.production!.stagePlans.clip;
      if(clip && (await this.hgg.getByIntent(org,actor,clip.intentId))?.jobId)return;
    }
    await this.update(org,actor,id,p=>{p.production!.lastFrameRepair!.snapshot=settled;});
    if(settled.state!=='saved' || !settled.result){await this.update(org,actor,id,p=>{p.production!.lastFrameRepair!.state='blocked';p.production!.blockers=[settled.errorCode??'CLIP_STAGE_RESULT_UNAVAILABLE'];});return;}
    try{
      row=await this.row(this.repository,org,actor,undefined,id);r=assertClipLastFrameRepairV1(row.payload,this.context(row.payload));
      await this.sources.assertCurrent(org,actor,row.payload.source);
      requireValue(r.approval?.preflightId===settled.preflightId && settled.jobId===event.jobId,'CLIP_REPAIR_APPROVAL_CHANGED');
      const receipt=await this.frameForCredentials(org,actor,this.context(row.payload),settled.preflightId);
      await this.update(org,actor,id,p=>{
        const prod=this.context(p),current=assertClipLastFrameRepairV1(p,prod);
        requireValue(receipt.jobId===event.jobId && receipt.ownedMediaId===settled.result!.ownedMediaId && receipt.byteSha256===settled.result!.byteSha256 &&
          receipt.workspaceBindingHash===(prod.executionCredentialsV2?.currentWorkspace.bindingHash??prod.workspace!.bindingHash) && receipt.connectionId===prod.connectionId && receipt.accountGeneration===prod.accountGeneration &&
          receipt.ownedMediaId!==prod.firstFrame!.asset.ownedMediaId && receipt.ownedMediaId!==current.previous.framePair.assets[1].ownedMediaId,'CLIP_FRAME_BYTES_CHANGED');
        if(!current.promoted){
          const asset={slot:'last' as const,ownedMediaId:receipt.ownedMediaId,byteSha256:receipt.byteSha256,providerMediaId:receipt.providerMediaId,connectionId:receipt.connectionId,accountGeneration:receipt.accountGeneration};
          prod.framePair={receipts:[prod.firstFrame!.receipt,receipt],assets:[prod.firstFrame!.asset,asset],paths:[prod.firstFrame!.path,settled.result!.path]};
          prod.stagePlans.last_frame=current.plan;prod.stageSnapshots??={};prod.stageSnapshots.last_frame=settled;
          // The old rejected result remains in current.previous.vision. Only
          // a NEW byte-bound pair can claim a fresh ordinary vision operation.
          prod.vision=undefined;current.promoted=true;current.state='vision_pending';
        }
      });
      const vision=await this.vision.review(org,actor,id);
      if(vision.state==='running' || vision.state==='captured')return;
      if(vision.state==='reviewed'){
        const latest=await this.row(this.repository,org,actor,undefined,id),prod=this.context(latest.payload),review=clipVisionPublicV1(latest.payload,prod,true);
        requireValue(review?.current && review.verdict==='accept' && !review.findings.length && !review.blocker &&
          clipVisionModelVerifiedV1(latest.payload, prod.vision),
          'CLIP_CURRENT_VISION_REVIEW_REQUIRED');
      }
      await this.update(org,actor,id,p=>{p.production!.lastFrameRepair!.state=vision.state==='reviewed'?'reviewed':'blocked';p.production!.blockers=vision.state==='reviewed'?[]:[vision.blocker??'CLIP_CURRENT_VISION_REVIEW_REQUIRED'];});
      if(vision.state==='reviewed')await this.continueClip(org,actor,id);
    }catch(error){await this.update(org,actor,id,p=>{p.production!.lastFrameRepair!.state='blocked';p.production!.blockers=[errorCode(error)];});}
  }
  async stop(org: string, actor: string, thread: string, id: string, requestMessageId: string) {
    await this.row(this.repository, org, actor, thread, id);
    await this.update(org, actor, id, p => {requireValue(p.production, 'CLIP_PRODUCTION_CONTEXT_REQUIRED');p.production.stopped = {requestMessageId};p.production.blockers = ['CLIP_PILOT_STOPPED'];});
    return this.open(org, actor, thread, id);
  }
  async recover(org: string, actor: string, thread: string, id: string, stage: HggPilotStageV1, action: 'status_read' | 'retry_save') {
    const row = await this.row(this.repository, org, actor, thread, id), repair=stage==='last_frame'?row.payload.production?.lastFrameRepair:undefined,
      plan = repair?.plan ?? row.payload.production?.stagePlans[stage];
    requireValue(plan, 'CLIP_STAGE_PLAN_REQUIRED');
    const saved = await this.hgg.getByIntent(org, actor, plan.intentId);
    requireValue(saved?.recoveryActions.includes(action), 'CLIP_STAGE_RECOVERY_UNAVAILABLE');
    const value = await this.hgg.recover(org, actor, saved.preflightId, action);
    if(repair)await this.update(org,actor,id,p=>{p.production!.lastFrameRepair!.snapshot=value;});else await this.snapshot(org, actor, id, stage, value);
    return this.open(org, actor, thread, id);
  }
  async recoverVisionFencedV1(org: string, actor: string, thread: string, request: {messageId:string;text:string}, raw: unknown) {
    const {pilotId}=clipProductionPrepareV1.parse(raw);
    await this.row(this.repository,org,actor,thread,pilotId);
    requireValue(request.messageId && request.text.trim(), 'CLIP_VISION_RECOVERY_REQUEST_REQUIRED');
    await this.vision.recoverFencedV1(org,actor,thread,pilotId,request.messageId);
    return this.open(org,actor,thread,pilotId);
  }
  async approval(org: string, actor: string, raw: unknown) {
    const input = clipProductionLaunchV1.parse(raw), row = await this.row(this.repository, org, actor, undefined, input.pilotId), p = row.payload, text = clipAcceptedTextV1(p);
    const view = await this.open(org, actor, p.threadId, input.pilotId), prod = view.production;
    requireValue(prod && prod.executionApproval.preflightId === input.preflightId && prod.executionApproval.approvalHash === input.approvalHash, 'CLIP_PILOT_APPROVAL_CHANGED');
    const visionSelection = p.production!.vision ? {model: p.production!.vision.selectedModel, provider: p.production!.vision.selectedProvider ?? p.policy.provider} : await this.vision.configuredSelection(org, p);
    return {pilotId: input.pilotId, threadId: p.threadId, pieceId: p.source.ref.pieceId, sourceArtifact: p.source.ref, sourceContentDigest: p.source.contentDigest,
      scenarioDigest: text.scenarioDigest, acceptedTextReviewDigest: text.acceptedTextReviewDigest, acceptedTextReviewInputHash: text.acceptedTextReviewInputHash,
      ...(p.production!.executionV2 ? {executionMode: p.production!.executionV2.mode, scenario: text.scenario} : {}),
      executionApproval: prod.executionApproval, authorization: prod.authorization, firstQuote: prod.stages.find(stage => stage.stage === 'first_frame')?.quote ?? null,
      imageSettings: p.production!.imageSettings, videoResolution: p.production!.videoResolution, visionModel: visionSelection.model, visionProvider: visionSelection.provider, visionModelState: p.production!.vision ? 'selected' : 'configured_pending', outputLocale: p.outputLocale};
  }
  async referenceApprovalV2(org: string, actor: string, raw: unknown) {
    const input = clipReferenceLaunchV2.parse(raw), row = await this.row(this.repository, org, actor, undefined, input.pilotId), p = row.payload, prod = this.context(p);
    requireValue(prod.executionV2?.mode === 'review', 'CLIP_REFERENCE_APPROVAL_REQUIRED');
    const view = (await this.open(org, actor, p.threadId, input.pilotId)).production!, refs = view.executionV2?.referenceApproval;
    requireValue(refs?.canApprove && refs.referenceDigest === input.referenceDigest,
      'CLIP_REFERENCE_APPROVAL_CHANGED');
    return {version: 2, pilotId: input.pilotId, mode: 'review', sourceArtifact: p.source.ref, sourceContentDigest: p.source.contentDigest,
      scenario: clipAcceptedTextV1(p).scenario, referenceDigest: refs.referenceDigest,
      frames: prod.framePair!.assets.map(({slot, ownedMediaId, byteSha256}, index) => ({slot, ownedMediaId, byteSha256, path: prod.framePair!.paths[index]})),
      quote: null as null, priceCheckedAfterApproval: true, maximumVideos: 1,
      authorization: view.authorization, visionReview: view.visionReview};
  }
  async launchReviewedClipV2(org: string, actor: string, thread: string, raw: unknown) {
    const input = clipReferenceLaunchV2.parse(raw), row = await this.row(this.repository, org, actor, thread, input.pilotId), prod = this.context(row.payload);
    const old = prod.executionV2?.referencesApproval;
    if (old) {
      requireValue(old.contextDigest === prod.contextDigest && old.referenceDigest === input.referenceDigest &&
        old.referenceDigest === clipReferenceDigestV2(row.payload, prod), 'CLIP_REFERENCE_APPROVAL_CHANGED');
      const existing = prod.stagePlans.clip && await this.hgg.getByIntent(org, actor, prod.stagePlans.clip.intentId);
      if (existing?.jobId) return this.open(org, actor, thread, input.pilotId);
    } else {
      await this.referenceApprovalV2(org, actor, input);
      await this.update(org, actor, input.pilotId, p => {
        const current = this.context(p);
        requireValue(current.executionV2?.mode === 'review' && clipReferenceDigestV2(p, current) === input.referenceDigest && !current.executionV2.referencesApproval,
          'CLIP_REFERENCE_APPROVAL_CHANGED');
        current.executionV2.referencesApproval = {contextDigest: current.contextDigest, referenceDigest: input.referenceDigest};
      });
    }
    await this.continueClip(org, actor, input.pilotId);
    return this.open(org, actor, thread, input.pilotId);
  }
  async open(org: string, actor: string, thread: string, id: string) {
    const row = await this.row(this.repository, org, actor, thread, id); let current = true;
    try {await this.sources.assertCurrent(org, actor, row.payload.source);} catch {current = false;}
    return {pilotId: id, pieceId: row.payload.source.ref.pieceId, threadId: row.payload.threadId, production: await this.projection(org, actor, id, row.payload, current)};
  }
  async projection(org: string, actor: string, id: string, p: Parent, sourceCurrent: boolean): Promise<ClipProductionPublicV1 | undefined> {
    const prod = p.production; if (!prod) return undefined;
    let current = sourceCurrent, authorization: ReturnType<NativeClipProductionServiceV1['authorization']> = null;
    try {this.context(p); authorization = this.authorization(p);} catch {current = false;}
    const stages: HggPilotStagePublicV1[] = [], blockers = [...prod.blockers];
    for (const stage of CLIP_PILOT_STAGES_V1) if (prod.stagePlans[stage]) {
      const repair=stage==='last_frame'?prod.lastFrameRepair:undefined,plan=repair?.plan??prod.stagePlans[stage]!;
      try {const saved = await this.hgg.getByIntent(org, actor, plan.intentId);if (saved) stages.push(saved);}
      catch (error) {const saved = repair?.snapshot??prod.stageSnapshots?.[stage];if (saved) stages.push({...saved, state: 'input_changed', canSubmit: false, approvalHash: null, blockers: [errorCode(error)]});blockers.push(errorCode(error));}
    }
    const first = stages.find(stage => stage.stage === 'first_frame'), approved = current && !!prod.authorization?.executionApproval && prod.authorization.executionApproval.contextDigest === prod.contextDigest;
    const pairCurrent = !!prod.framePair && prod.framePair.assets.every(asset => {
      const saved = stages.find(stage => stage.stage === (asset.slot === 'first' ? 'first_frame' : 'last_frame'));
      return saved?.state === 'saved' && saved.result?.ownedMediaId === asset.ownedMediaId && saved.result.byteSha256 === asset.byteSha256;
    });
    const repair=prod.lastFrameRepair,repairStage=stages.find(stage=>stage.stage==='last_frame');
    let repairCurrent=current;
    if(repair)try{assertClipLastFrameRepairV1(p,prod);}catch{repairCurrent=false;}
    const visionReview = clipVisionPublicV1(p, prod, current && pairCurrent), clip = stages.find(stage => stage.stage === 'clip');
    let referenceDigest: string | null = null;
    if (prod.executionV2?.mode === 'review' && current && pairCurrent && visionReview?.current && visionReview.state === 'reviewed' && visionReview.verdict === 'accept' && !visionReview.findings.length && !visionReview.blocker && clipVisionModelVerifiedV1(p, prod.vision))
      referenceDigest = clipReferenceDigestV2(p, prod);
    const savedReferences = prod.executionV2?.referencesApproval;
    const referencesApproved = !!referenceDigest && savedReferences?.contextDigest === prod.contextDigest && savedReferences.referenceDigest === referenceDigest;
    const canApproveReferences = !!referenceDigest && approved && !savedReferences && !clip?.jobId && !!authorization;
    return {version: 1, outputLocale: p.outputLocale, stages, visionReview,
      ...(prod.executionV2 ? {executionV2: {version: 2 as const, mode: prod.executionV2.mode, referenceApproval: {
        state: !current || savedReferences && !referencesApproved ? 'stale' as const : referencesApproved ? 'approved' as const : referenceDigest ? 'awaiting_approval' as const : 'not_ready' as const,
        referenceDigest, canApprove: canApproveReferences}}} : {}),
      ...(prod.credentialRenewalsV2?.length?{credentialRenewal:{state:prod.credentialRenewalsV2.at(-1)!.state,requiresFreshQuote:true as const}}:{}),
      ...(repair?{lastFrameRepair:{id:repair.id,current:repairCurrent,state:repair.state,reason:repair.reason,approved:!!repair.approval,
        canApprove:repairCurrent && repair.state==='awaiting_approval' && !repair.approval && !clipLastFrameRepairQuotePendingV1(repair) && !!repairStage?.approvalHash && !repairStage.jobId && !!repairStage.localInputValidated &&
          !!repairStage.ownerLimit?.authorized && !!repairStage.quote && Date.parse(repairStage.quote.localAdmissionExpiresAt)>Date.now() &&
          repairStage.blockers.every(code=>code==='VIDEO_PILOT_REPAIR_APPROVAL_REQUIRED'),
        preflightId:repairStage?.preflightId??null,approvalHash:repairStage?.approvalHash??null,quote:repairStage?.quote??null,remaining:repairStage?.ownerLimit?.remaining??null}}:{}),
      settings: {image: prod.imageSettings, video: {resolution: prod.videoResolution, durationSeconds: 5, aspectRatio: '9:16'}},
      authorization: {state: !current ? 'stale' : authorization ? 'authorized' : prod.budgetQuestion ? 'awaiting_answer' : 'missing', unit: 'higgsfield_credit', pilotLimit: authorization?.pilotLimit ?? null,
        includedStages: authorization?.stages ?? [...CLIP_PILOT_STAGES_V1], executionApproved: approved,
        limitSource: prod.budgetMode === 'delegated_quote_bound' ? 'owner_delegated_necessary_one_pilot' : 'owner_entered',
        ...(prod.authorization?.source === 'delegated_quote_bound' ? {capBasis: clipDelegatedPublicBasisV1(prod.authorization.basis)} : {})},
      executionApproval: {scope: 'one_pilot', current, canApprove: current && !!authorization && !approved && !!first?.approvalHash && !!first.localInputValidated && !!first.ownerLimit?.authorized && !first.jobId,
        approved, preflightId: first?.preflightId ?? null, approvalHash: first?.approvalHash ?? null, bindingHash: digest({contextDigest: prod.contextDigest, authorizationId: authorization?.id ?? null, firstIntent: prod.stagePlans.first_frame?.intentId ?? null}),
        includedStages: [...CLIP_PILOT_STAGES_V1], laterPricesUnknown: true, providerBillingCap: false}, blockers: [...new Set(blockers)]};
  }
}
