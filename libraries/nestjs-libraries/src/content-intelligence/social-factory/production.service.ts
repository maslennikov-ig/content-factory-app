import { assertLocalReelCandidateV1,isLocalReelInputErrorV1 } from './editorial/local-reel-scenes.v1';
import type {CampaignLocalCompositionServiceV2} from './editorial/local-composition.service.v2';
import {CAMPAIGN_LOCAL_COMPOSITION_SERVICE_V2,LocalCompositionOperationV2,type LocalCompositionStartV2} from './local-composition.operation.v2';
import type {LocalCompositionOptionsV2} from '../../videos/local-reel/local-composition.v2';
import {LOCAL_COMPOSITION_EXECUTION_V2,type LocalCompositionExecutionPortV2} from '../../videos/production/local-composition-execution.port.v2';
import { getEditorialPlaybook } from './editorial/playbooks/editorial-playbooks.v1';
import { readDraftDestinationV1 } from './draft-destination.v1';
import type { LocalPreflightFailureV1 } from './autonomy/autonomy.service';
import { CampaignLocalReelServiceV1, type LocalReelCheckpointV1 } from './editorial/local-reel.service';
import { randomUUID } from 'node:crypto';
import { Injectable, Optional, Inject } from '@nestjs/common';
import { SourceArtifactServiceV1 } from './source-artifact.service';
import type { SourceArtifactRefV1, ResolvedSourceArtifactV1 } from './contracts/source-artifact.v1';
import { writingLengthOptionsSchema, type WritingLengthOption } from '@contentfactory/helpers/utils/writing-settings';
import { SocialFactoryRepository, SocialFactoryError, resourceRef, sourceRef } from './social-factory.repository';
import { CampaignService, approvalDigest } from './campaign/campaign.service';
import { AutonomyService,isLocalPreflightRecoveryAllowedV1 } from './autonomy/autonomy.service';
import { assertGrantScope } from './autonomy/grant-policy';
import { EditorialDecisionService } from './autonomy/editorial-decision.service';
import { ChannelProfileServiceV1 } from './profiles/channel-profile.v1';
import { SocialEditorialProductionV1, type EditorialProductionInputV1 } from './editorial/social-editorial-production.v1';
import { NativeEditorialMaterialService } from './editorial/native-material.service';
import { SocialFactoryLearningService } from './learning/learning.service';
import { SocialFactoryPublishingService } from './publishing/publishing.service';
import { SocialFactoryPlanningService } from './planning.service';
import { getActiveAiConfig, loadAiConfig } from '../../openai/ai.provider.config';
import { VideoProductionService } from '../../videos/production/video-production.service';
import { VideoGenerationRepository } from '../../database/prisma/video-generation/video-generation.repository';
import { videoSourceRevisionV1 } from '../../videos/video-brief.v1';
import { identity, digest } from './campaign/domain';
import type { CampaignItemV1, CampaignV1, DiscoveryCandidateV1, EditorialMaterialV1, ProductionAssetV1, SourceAdmissionV1, SocialFactoryStoreV1 } from './contracts/social-factory.v1';
import type { CampaignTextEdit } from './material-edit.service';
import type { PersonalProductionFundingV2 } from '../../videos/production/video-production.personal.v2';

export interface CampaignItemPrepareOverride {
 audioMode?:'silent'|'narrated'; sourceArtifact?: SourceArtifactRefV1; instruction?: string; language?: string; lengthChoiceId?: string; lengthGuidance?: string; targetSeconds?: number;
}
export interface CampaignPrepareInput extends CampaignItemPrepareOverride {
 campaignId: string; requestId: string; instruction: string; sourceIds?: string[]; itemIds?: string[];
 allowWebSearch?: boolean; visuals?: EditorialProductionInputV1['visuals']; itemOverrides?: Record<string, CampaignItemPrepareOverride>;
}
export interface CampaignReviseInput extends CampaignItemPrepareOverride {
 requestId: string; expectedContentRevision: number; instruction: string; sourceIds?: string[];
 visuals?: EditorialProductionInputV1['visuals'];
}
interface RevisionRequest {
 type: 'production_revision_request'; requestDigest: string; campaignId: string; itemId: string;
 contentRevision: number; prepareInput: CampaignPrepareInput;
}
type Context = { profile: EditorialProductionInputV1['profile']; profileRevision: number; brandVersionDigest: string | null; findings: EditorialProductionInputV1['findings'] };
interface Assignment { itemId: string; sourceContentRevision: number; candidate: DiscoveryCandidateV1; lengthOptions: WritingLengthOption[]; sourceArtifact?: ResolvedSourceArtifactV1 }
interface DestinationPlan {
 type: 'campaign_destination_plan'; contextDigest: string; context: Context; discoveryId?: string;
 state: 'discovering' | 'planned' | 'preflight_failed'; owner?: string; leaseUntil?: string; assignments: Assignment[]; blocker?: string;
}
/** Additive C result contract; evidence is read from the owned service, never accepted from a request. */
interface MeasuredVideoResult {
 id: string; name?: string; path: string; type: string; width?: number; height?: number; durationSeconds?: number;
 metadata?: { source: 'mp4_bytes'; sha256: string };
 captions?: { burned: 'provider_confirmed' | 'authored_timed_cues' | 'retained_scene_lineage' | 'unverified'; sourceJobIds: string[] };
 subtitles?: { id: string; mediaId: string; name: string; path: string; type: 'subtitle'; mimeType: 'text/vtt' | 'application/x-subrip';
  role: 'captions'; sha256: string; cueCount: number; source: 'provider_subtitle_file' | 'authored_timed_cues' }[];
}
interface ProductionRevisionOwner {
 type: 'production_revision_owner'; operationId: string; itemId: string; sourceContentRevision: number;
}
interface ReinspectionReceipt {
 type: 'production_reinspection'; operationId: string; expectedContentRevision: number;
 state: 'running' | 'completed' | 'failed'; owner?: string; leaseUntil?: string;
 result?: ReturnType<SocialFactoryProductionService['result']>; errorCode?: string;
}
export interface ProductionOperation {
 version: 2; id: string; campaignId: string; itemId: string; inputDigest: string; actionId: string;
 state: 'preflight_failed' | 'submitting' | 'generated' | 'artwork_running' | 'artwork_partial' | 'material_ready' | 'ready' | 'needs_video' | 'needs_revision' | 'uncertain';
 attempt: number; sourceContentRevision: number; appliedContentRevision?: number; context: Context; baseInput: EditorialProductionInputV1;
 effectiveInput?: EditorialProductionInputV1; decision?: { answer: string; [key: string]: unknown };
 campaignAuthority: { mode: CampaignV1['mode']; grantId?: string }; discoveryId: string;
 owner?: string; leaseUntil?: string; output?: unknown; sourceDigest?: string; sourceAdmissions: SourceAdmissionV1[];
 material?: EditorialMaterialV1; nativeMaterial?: EditorialMaterialV1; videoBaseMaterial?: EditorialMaterialV1;
 producerStatus?: 'ready' | 'needs_video' | 'needs_revision'; inspection?: unknown;
 partialAssets?: unknown; unregisteredAsset?: unknown; blocker?: string; blockerDetail?: string; productionId?: string;
 nativeRequestId?: string; deliveryRequiresApproval?: boolean; activeReinspection?: { id: string; expectedContentRevision: number };
 finalizedResultId?: string; finalizedRevision?: number; finalizing?: { resultId: string; owner: string; until: string };
 localReel?: LocalReelCheckpointV1; localPreflightRecovery?:LocalPreflightFailureV1; productionPreflightVersion?:1; primaryProducerAttempt?:{version:1;at:string};
 localComposition?:{id:string;requestDigest:string};
 captionOverride?: { field: 'caption' | 'body' | 'telegram'; value: string };
 captionEdit?: { id: string; actorId: string; inputDigest: string; expectedContentRevision: number; state: 'pending' | 'completed' };
}
const liveLease = (until?: string) => !!until && Date.parse(until) > Date.now();
const lease = () => new Date(Date.now() + 10 * 60_000).toISOString();
const code = (error: any) => String(error?.code || error?.getResponse?.()?.code || error?.cause?.code || error?.cause?.getResponse?.()?.code || error?.message || 'CAMPAIGN_PREPARATION_FAILED');
function requireValue(value: unknown, name: string): asserts value { if (!value) throw new SocialFactoryError(name); }
function withCaption(material: EditorialMaterialV1, override?: ProductionOperation['captionOverride']): EditorialMaterialV1 {
 const result = structuredClone(material);
 if (!override) return result;
 if (override.field === 'telegram') {
  result.body = override.value; result.caption = override.value;
  result.settings.renderedText = override.value; result.settings.renderedCaption = override.value;
 } else result[override.field] = override.value;
 return result;
}
const sourceLinks = (op: Pick<ProductionOperation, 'baseInput' | 'discoveryId'>) => [resourceRef('channel_profile', op.baseInput.profile.channelId),
 ...op.baseInput.sourceIds.map(sourceRef), resourceRef('discovery', op.discoveryId), ...op.baseInput.findings.map(f => resourceRef('finding', f.id))];

/** Persisted claims, model checkpoints, native drafts and provider revisions use the existing services. */
@Injectable()
export class SocialFactoryProductionService {
 constructor(private readonly store: SocialFactoryRepository, private readonly campaigns: CampaignService, private readonly autonomy: AutonomyService,
  private readonly decisions: EditorialDecisionService, private readonly profiles: ChannelProfileServiceV1, private readonly editorial: SocialEditorialProductionV1,
  private readonly native: NativeEditorialMaterialService, private readonly learning: SocialFactoryLearningService, private readonly publishing: SocialFactoryPublishingService,
  private readonly videos: VideoProductionService, private readonly videoRecords: VideoGenerationRepository, private readonly planning: SocialFactoryPlanningService, @Optional() private readonly sourceArtifacts?: SourceArtifactServiceV1, @Optional() private readonly localReels?: CampaignLocalReelServiceV1,
  @Optional() @Inject(CAMPAIGN_LOCAL_COMPOSITION_SERVICE_V2) private readonly localCompositions?:CampaignLocalCompositionServiceV2,@Optional() @Inject(LOCAL_COMPOSITION_EXECUTION_V2) private readonly localCompositionExecution?:LocalCompositionExecutionPortV2) {}

 private async formatPreflight(org:string,actorId:string,item:CampaignItemV1,store:SocialFactoryStoreV1=this.store){
  if(item.destination){
   const row=await store.read(org,'draft_destination',item.channelId);requireValue(row,'DRAFT_DESTINATION_INVALID');
   const destination=readDraftDestinationV1(row.payload,item.channelId);
   requireValue(destination.actorId===actorId && destination.platform===item.platform && item.destination.id===item.channelId && item.destination.publishable===false,'DRAFT_DESTINATION_ACTOR_MISMATCH');
  }
  try{getEditorialPlaybook(item.platform,item.format,item.destination);}catch(error:any){throw new SocialFactoryError('EDITORIAL_FORMAT_UNSUPPORTED',error.message,400);}
 }
 private async recoverLocalPreflight(org:string,actorId:string,operationId:string,expectedContentRevision:number){
  return this.store.transact(async store=>{
   const row=await store.read<ProductionOperation>(org,'editorial',operationId);requireValue(row,'CAMPAIGN_PRODUCTION_MISSING');
   const current=await this.current(org,row.payload,store);await this.formatPreflight(org,actorId,current.item,store);
   const proof=await new AutonomyService(store as SocialFactoryRepository).reconcileLocalPreflightFailure(org,actorId,operationId,expectedContentRevision);
   return store.put<ProductionOperation>({organizationId:org,kind:'editorial',id:operationId,parentId:row.parentId??undefined,expectedRevision:row.revision,
    payload:{...row.payload,state:'preflight_failed',blocker:'EDITORIAL_FORMAT_UNSUPPORTED',localPreflightRecovery:proof},sourceIds:row.sourceIds});
  });
 }
 private async context(org: string, channelId: string): Promise<Context> {
  const selected = await this.profiles.resolve(org, channelId);
  const learned = await this.learning.forPlanning(org, channelId);
  return { profile: selected.profile, profileRevision: selected.revision, brandVersionDigest: selected.brandVersionDigest, findings: learned.findings };
 }
 private selected(input: CampaignPrepareInput, items: CampaignItemV1[]) {
  requireValue(input.requestId?.trim() && input.instruction?.trim(), 'CAMPAIGN_PRODUCTION_INPUT_REQUIRED');
  requireValue(!input.itemIds?.some(id => !items.some(item => item.id === id)) && !Object.keys(input.itemOverrides ?? {}).some(id => !items.some(item => item.id === id)), 'CAMPAIGN_ITEM_SCOPE');
  return items.filter(item => !input.itemIds || input.itemIds.includes(item.id));
 }
 private options(item: CampaignItemV1, candidate: DiscoveryCandidateV1, instruction: string): WritingLengthOption[] {
  if (item.platform !== 'telegram') return [];
  const ru = /[а-яё]/iu.test(instruction + candidate.title);
  const scope = Math.min(2600, Math.max(800, Math.round((instruction.length * 0.7 + candidate.angle.length * 3 + candidate.evidence.length * 220 + 650) / 50) * 50));
  const min = Math.round(scope * 0.55 / 50) * 50, max = Math.round(scope * 0.8 / 50) * 50;
  const title = candidate.title.slice(0, 65);
  return writingLengthOptionsSchema.parse([
   { id: identity('length', item.id, candidate.id, 'focused'), label: ru ? `Коротко: ${title}` : `Focused: ${title}`,
    description: ru ? `Одна практическая мысль по теме «${title}», с заголовком и выводом.` : `One practical point about “${title}”, with a title and takeaway.`,
    lengthRange: { idealMin: min, idealMax: max, hardMax: 4096 }, recommended: candidate.evidence.length < 3 },
   { id: identity('length', item.id, candidate.id, 'explanation'), label: ru ? `Разбор: ${title}` : `Explained: ${title}`,
    description: ru ? `Контекст, применение и ограничения темы «${title}»; с заголовком и завершением.` : `Context, application and limits of “${title}”, including title and closing.`,
    lengthRange: { idealMin: scope, idealMax: Math.min(3900, Math.round(scope * 1.35 / 50) * 50), hardMax: 4096 }, recommended: candidate.evidence.length >= 3 },
  ]);
 }
 private fallback(context: Context, ordinal: number, item: CampaignItemV1, instruction: string, prompts: { pillar: string; angle: string }[]): DiscoveryCandidateV1 {
  const pillar = prompts[ordinal % Math.max(1, prompts.length)]?.pillar || context.profile.pillars[ordinal % Math.max(1, context.profile.pillars.length)] || context.profile.expertise[0] || context.profile.promise || instruction;
  const angle = prompts[ordinal % Math.max(1, prompts.length)]?.angle || `${pillar}: ${context.profile.audience}`;
  const ru = context.profile.languages[0]?.toLowerCase().startsWith('ru') || /[а-яё]/iu.test(instruction);
  const questions = ru
   ? ['первый практический шаг', 'типичная ошибка и её последствия', 'критерии выбора', 'учебный пример', 'вопросы перед началом', 'сравнение вариантов', 'подготовительный чек-лист', 'признаки проблемы', 'простое объяснение термина', 'план обслуживания', 'что и зачем измерять', 'порядок внедрения', 'компромиссы в ресурсах', 'когда передавать задачу', 'проверка результата', 'как снизить риск', 'границы применения', 'как подготовить команду', 'выбор при ограниченном времени', 'разбор спорного совета', 'как проверить источник', 'когда стоит остановиться', 'что уточнить у специалиста', 'какие данные собрать', 'как избежать лишних действий', 'как объяснить решение клиенту', 'порядок проверки качества', 'ошибка на этапе подготовки', 'как сравнить результаты', 'что изменить в следующем цикле', 'памятка для самостоятельной работы']
   : ['practical first step', 'common mistake and its limits', 'decision criteria', 'worked fictional example', 'questions to ask before acting', 'comparison of alternatives', 'preparation checklist', 'warning signs to notice', 'terminology explained', 'maintenance planning', 'what to measure and why', 'implementation workflow', 'resource tradeoffs', 'handoff criteria', 'review after implementation', 'how to reduce risk', 'limits of applicability', 'preparing the team', 'choosing under time constraints', 'examining disputed advice', 'checking a source', 'when to stop', 'questions for a specialist', 'data to collect', 'avoiding unnecessary work', 'explaining the decision to a customer', 'quality checks', 'preparation mistakes', 'comparing outcomes', 'what to change next time', 'a self-service checklist'];
  return { id: identity('owner_brief_candidate', item.id, String(ordinal)), channelId: item.channelId,
   title: `${pillar} — ${questions[ordinal % questions.length]}`, angle: `${angle}. ${questions[ordinal % questions.length]}.`,
   relevance: { score: 1, reason: ru ? 'Тема предложена по описанию канала и задаче владельца.' : 'Topic proposed from the channel brief and owner task.' }, performance: { availability: 'unknown' }, evidence: [] };
 }

 /** Read/research-only planning. Telegram choices are returned before any model claim. */
 async plan(org: string, actorId: string, input: CampaignPrepareInput) {
  requireValue(actorId, 'CAMPAIGN_ACTOR_REQUIRED');
  const { campaign, items } = await this.campaigns.get(org, input.campaignId);
  requireValue(campaign.state === 'active', 'CAMPAIGN_NOT_ACTIVE');
  const selectedItems = this.selected(input, items), plans: any[] = [], questions: any[] = [], invalid=new Set<string>();
  for(const item of selectedItems)try{await this.formatPreflight(org,actorId,item);}catch(error){invalid.add(item.id);plans.push({itemId:item.id,state:'needs_input',code:code(error)});}
  const selected=selectedItems.filter(item=>!invalid.has(item.id));
  const artifactByItem = new Map<string, ResolvedSourceArtifactV1>();
  for (const item of selected) {
   const ref = input.itemOverrides?.[item.id]?.sourceArtifact ?? input.sourceArtifact;
   if (ref) { requireValue(this.sourceArtifacts, 'SOURCE_ARTIFACT_SERVICE_REQUIRED'); artifactByItem.set(item.id, await this.sourceArtifacts.resolve(org, actorId, ref)); }
  }
  for (const channelId of [...new Set(selected.map(item => item.channelId))]) {
   const destination = selected.filter(item => item.channelId === channelId), context = await this.context(org, channelId);
   const contextDigest = digest({ ...(artifactByItem.size ? {sourceArtifacts: destination.map(item => artifactByItem.get(item.id)?.ref ?? null)} : {}), context, instruction: input.instruction, allowWebSearch: input.allowWebSearch === true, sourceIds: [...new Set(input.sourceIds ?? [])].sort() });
   const id = identity('production_plan', org, campaign.id, input.requestId, channelId), owner = randomUUID();
   let claim = await this.store.transact(async store => {
    const row = await store.read<DestinationPlan>(org, 'editorial', id);
    if (row) {
     requireValue(row.payload.contextDigest === contextDigest, 'CAMPAIGN_PRODUCTION_CONTEXT_CHANGED');
     if (row.payload.state === 'planned' || liveLease(row.payload.leaseUntil)) return { row, execute: false };
    }
    const currentCampaign = await store.read<CampaignV1>(org, 'campaign', campaign.id);
    requireValue(currentCampaign?.payload.grantId === campaign.grantId && currentCampaign?.payload.mode === campaign.mode, 'AUTONOMY_GRANT_SUPERSEDED');
    await new AutonomyService(store as SocialFactoryRepository).assertUnpricedPreparationAllowed(org, campaign.grantId,
     () => this.planning.unpricedPreparationProviders(org, channelId, input));
    if (row) {
     return { row: await store.put<DestinationPlan>({ organizationId: org, kind: 'editorial', id, parentId: campaign.id, expectedRevision: row.revision,
      payload: { ...row.payload, owner, leaseUntil: lease() } }), execute: true };
    }
    return { row: await store.put<DestinationPlan>({ organizationId: org, kind: 'editorial', id, parentId: campaign.id, expectedRevision: 0,
     payload: { type: 'campaign_destination_plan', contextDigest, context, state: 'discovering', assignments: [], owner, leaseUntil: lease() } as DestinationPlan,
     sourceIds: (input.sourceIds ?? []).map(sourceRef) }), execute: true };
   });
   if (claim.execute) {
    let research: Awaited<ReturnType<SocialFactoryPlanningService['discover']>>;
    try {
     research = await this.planning.discover(org, channelId, { sourceIds: input.sourceIds ?? [], allowWebSearch: input.allowWebSearch === true }, async billingProviders => {
      await this.store.transact(async store => {
       const current = await store.read<CampaignV1>(org, 'campaign', campaign.id);
       requireValue(current?.payload.grantId === campaign.grantId && current?.payload.mode === campaign.mode, 'AUTONOMY_GRANT_SUPERSEDED');
       await new AutonomyService(store as SocialFactoryRepository).assertUnpricedPreparationAllowed(org, campaign.grantId, billingProviders);
      });
     });
    } catch (error) {
     if (code(error) === 'AUTONOMY_COST_ESTIMATE_UNAVAILABLE') await this.store.transact(async store => {
      const current = await store.read<DestinationPlan>(org, 'editorial', id);
      if (current?.payload.owner === owner) await store.put<DestinationPlan>({ organizationId: org, kind: 'editorial', id, parentId: campaign.id, expectedRevision: current.revision,
       payload: { ...current.payload, state: 'preflight_failed', owner: undefined, leaseUntil: undefined, blocker: code(error) }, sourceIds: current.sourceIds });
     });
     throw error;
    }
    requireValue(digest(research.profile) === digest(context.profile) && research.profileRevision === context.profileRevision && digest(research.findings) === digest(context.findings), 'CAMPAIGN_PRODUCTION_CONTEXT_CHANGED');
    const candidates = research.candidates;
    const assignments = destination.map((item, ordinal): Assignment => {
     const artifact = artifactByItem.get(item.id);
     const candidate = artifact ? { id: identity('source_candidate', item.id, artifact.ref.revision), channelId: item.channelId, title: artifact.title, angle: input.itemOverrides?.[item.id]?.instruction || input.instruction, relevance: {score: 1, reason: 'Adapt the exact selected saved source.'}, performance: {availability: 'unknown' as const}, evidence: [] } : ordinal < candidates.length ? candidates[ordinal] : this.fallback(context, ordinal, item, input.instruction, research.planningPrompts);
     return { itemId: item.id, sourceContentRevision: item.contentRevision, candidate, ...(artifact ? {sourceArtifact: artifact} : {}),
      lengthOptions: this.options(item, candidate, input.itemOverrides?.[item.id]?.instruction || input.instruction) };
    });
    claim = await this.store.transact(async store => {
     const row = await store.read<DestinationPlan>(org, 'editorial', id);
     requireValue(row?.payload.owner === owner, 'CAMPAIGN_PRODUCTION_LEASE_LOST');
     const saved = await store.put<DestinationPlan>({ organizationId: org, kind: 'editorial', id, parentId: campaign.id, expectedRevision: row.revision,
      payload: { ...row.payload, state: 'planned', assignments, discoveryId: research.id, owner: undefined, leaseUntil: undefined },
      sourceIds: [resourceRef('channel_profile', channelId), resourceRef('discovery', research.id), ...(input.sourceIds ?? []).map(sourceRef), ...context.findings.map(f => resourceRef('finding', f.id))] });
     const current = await store.read<CampaignV1>(org, 'campaign', campaign.id); requireValue(current?.payload.state === 'active', 'CAMPAIGN_NOT_ACTIVE');
     if (!current.payload.researchIds.includes(research.id) || context.findings.some(finding => !current.payload.findingIds.includes(finding.id))) await store.put({ organizationId: org, kind: 'campaign', id: campaign.id, expectedRevision: current.revision,
      payload: { ...current.payload, researchIds: [...new Set([...current.payload.researchIds, research.id])], findingIds: [...new Set([...current.payload.findingIds, ...context.findings.map(finding => finding.id)])] } });
     return { row: saved, execute: true };
    });
   }
   for (const item of selected.filter(item => item.channelId === channelId)) {
    const assignment = claim.row.payload.assignments.find(entry => entry.itemId === item.id);
    if (!assignment) { plans.push({ itemId: item.id, state: 'planning' }); continue; }
    const override = input.itemOverrides?.[item.id] ?? {};
    const singleTelegram = selected.filter(entry => entry.platform === 'telegram').length === 1;
    const lengthChoiceId = override.lengthChoiceId ?? (singleTelegram ? input.lengthChoiceId : undefined);
    const option = assignment.lengthOptions.find(entry => entry.id === lengthChoiceId);
    const lengthGuidance = override.lengthGuidance ?? (singleTelegram ? input.lengthGuidance : undefined) ?? (option ? `${option.label}: ${option.lengthRange.idealMin}–${option.lengthRange.idealMax} characters including headline and closing; maximum ${option.lengthRange.hardMax}.` : undefined);
    const needsChoice = item.platform === 'telegram' && campaign.mode !== 'autopilot' && (!lengthChoiceId || !lengthGuidance);
    const question = `${assignment.candidate.title}: ${context.profile.languages[0]?.startsWith('ru') ? 'какую длину выбрать для этого материала?' : 'which length should this material use?'}`;
    const plan = { ...assignment, context, discoveryId: claim.row.payload.discoveryId!, lengthChoiceId, lengthGuidance,
     state: needsChoice ? 'needs_length' : 'planned', ...(needsChoice ? { question } : {}) };
    plans.push(plan); if (needsChoice) questions.push({ itemId: item.id, channelId, question, lengthOptions: assignment.lengthOptions });
   }
  }
  return { campaignId: campaign.id, items: plans, questions };
 }

 async prepare(org: string, actorId: string, input: CampaignPrepareInput) {
  const { campaign, items } = await this.campaigns.get(org, input.campaignId);
  requireValue(campaign.state === 'active', 'CAMPAIGN_NOT_ACTIVE');
  const selected = this.selected(input, items), results: any[] = [];
  let planned: Awaited<ReturnType<SocialFactoryProductionService['plan']>> | undefined;
  for (const item of selected) {
   const ownership = await this.store.read<ProductionRevisionOwner>(org, 'action', identity('production_revision_owner', org, item.id, String(item.contentRevision)));
   const refs = (item as CampaignItemV1 & { sourceRecordRefs?: string[] }).sourceRecordRefs ?? [];
   const linked = (await Promise.all(refs.filter(ref => ref.startsWith('resource:editorial:')).map(ref => this.store.read<ProductionOperation>(org, 'editorial', ref.slice('resource:editorial:'.length)))))
    .filter(row => row?.payload.version === 2 && row.payload.itemId === item.id && row.payload.appliedContentRevision === item.contentRevision);
   requireValue(linked.length <= 1, 'CAMPAIGN_PRODUCTION_REVISION_CONFLICT');
   const id = linked[0]?.id ?? ownership?.payload.operationId ?? identity('editorial', org, item.id, input.requestId), prior = linked[0] ?? await this.store.read<ProductionOperation>(org, 'editorial', id);
   if (prior?.payload.captionEdit?.state === 'pending') { results.push({ itemId: item.id, state: 'in_progress', operationId: id, code: 'CAMPAIGN_CAPTION_SAVE_REQUIRED', regenerated: false }); continue; }
   if (['published', 'scheduled', 'cancelled'].includes(item.state)) { results.push({ itemId: item.id, state: item.state, regenerated: false }); continue; }
   if (['submitting', 'uncertain'].includes(item.state) && (!prior || prior.payload.state === 'ready')) { results.push({ itemId: item.id, state: item.state, regenerated: false }); continue; }
   if (!prior && item.material && ['ready', 'awaiting_approval', 'approved'].includes(item.state)) { if(item.material.sourceArtifact){ requireValue(this.sourceArtifacts,'SOURCE_ARTIFACT_SERVICE_REQUIRED'); await this.sourceArtifacts.resolve(org,actorId,item.material.sourceArtifact); } results.push({ itemId: item.id, state: item.state, material: item.material, regenerated: false }); continue; }
   try {
    if (prior && ['ready', 'needs_video', 'needs_revision', 'artwork_partial', 'uncertain'].includes(prior.payload.state)) {
     await this.current(org, prior.payload);
     if(prior.payload.state==='uncertain' && prior.payload.blocker==='Unsupported editorial format: instagram/post' && isLocalPreflightRecoveryAllowedV1(prior.id,prior.payload.inputDigest)){
      const recovered=await this.recoverLocalPreflight(org,actorId,id,item.contentRevision),saved=recovered.payload,base=saved.baseInput;
      const frozen:CampaignPrepareInput={campaignId:saved.campaignId,requestId:input.requestId,instruction:base.brief.instruction,itemIds:[item.id],sourceIds:base.sourceIds,visuals:base.visuals,
       itemOverrides:{[item.id]:{instruction:base.brief.instruction,audioMode:base.brief.audioMode,language:base.brief.language,lengthChoiceId:base.brief.lengthChoiceId,lengthGuidance:base.brief.lengthGuidance,targetSeconds:base.brief.targetSeconds,...(base.sourceArtifact?{sourceArtifact:base.sourceArtifact.ref}:{})}}};
      results.push(await this.executeItem(org,actorId,campaign,item,frozen,{context:saved.context,candidate:base.candidate,sourceArtifact:base.sourceArtifact,
       sourceContentRevision:saved.sourceContentRevision,discoveryId:saved.discoveryId,lengthOptions:[],lengthChoiceId:base.brief.lengthChoiceId,lengthGuidance:base.brief.lengthGuidance}));continue;
     }
     else{if (prior.payload.state === 'ready') await this.autopublish(org, actorId, prior.payload);
      results.push(this.result(prior.payload, false)); continue;}
    }
    if (prior && ['submitting', 'artwork_running'].includes(prior.payload.state) && liveLease(prior.payload.leaseUntil)) {
     results.push({ itemId: item.id, state: 'in_progress', operationId: id, regenerated: false }); continue;
    }
    planned ??= await this.plan(org, actorId, input);
    const assignment = planned.items.find(entry => entry.itemId === item.id);
    if (!assignment || assignment.state !== 'planned') { results.push({ itemId: item.id, state: assignment?.state ?? 'needs_input', code:assignment?.code, lengthOptions: assignment?.lengthOptions, question: assignment?.question, regenerated: false }); continue; }
    results.push(await this.executeItem(org, actorId, campaign, item, input, assignment));
   } catch (error: any) { results.push({ itemId: item.id, state: 'needs_input', code: code(error), ...(code(error) === 'AUTONOMY_COST_ESTIMATE_UNAVAILABLE' ? {detail: error.message} : {}), operationId: id, regenerated: false }); }
  }
  return { campaignId: campaign.id, items: results, questions: planned?.questions ?? [] };
 }
 private result(op: ProductionOperation, regenerated: boolean) {
  return { campaignId:op.campaignId, itemId: op.itemId, expectedContentRevision:op.appliedContentRevision??op.sourceContentRevision, format:op.baseInput.format, sourceArtifact:op.baseInput.sourceArtifact?.ref, state: op.state === 'artwork_partial' ? 'needs_input' : op.state, operationId: op.id, material: op.nativeMaterial ?? op.material,
   inspection: op.inspection, code: op.blocker, ...(op.blockerDetail ? {detail: op.blockerDetail} : {}), partialAssets: op.partialAssets, unregisteredAsset: op.unregisteredAsset, regenerated };
 }
 private async current(org: string, op: ProductionOperation, store: SocialFactoryStoreV1 = this.store, checkSource = true) {
  if (checkSource && op.baseInput.sourceArtifact) {
   const source = op.baseInput.sourceArtifact; requireValue(this.sourceArtifacts && source.organizationId === org && source.actorId === op.baseInput.actorId, 'SOURCE_ARTIFACT_ACCESS_DENIED');
   if (store !== this.store) { requireValue(store.assertArtifactSource, 'SOURCE_ARTIFACT_TRANSACTION_REQUIRED'); await store.assertArtifactSource(org, source.actorId, source.ref); }
   else await this.sourceArtifacts.assertCurrent(org, source.actorId, source);
  }
  const campaign = await store.read<CampaignV1>(org, 'campaign', op.campaignId), item = await store.read<CampaignItemV1>(org, 'campaign_item', op.itemId);
  requireValue(campaign?.payload.state === 'active' && item?.payload.campaignId === op.campaignId && !['cancelled', 'published'].includes(item.payload.state), 'CAMPAIGN_NOT_ACTIVE');
  requireValue(campaign.payload.mode === op.campaignAuthority.mode && campaign.payload.grantId === op.campaignAuthority.grantId, 'AUTONOMY_GRANT_SUPERSEDED');
  if (op.campaignAuthority.grantId) assertGrantScope((await new AutonomyService(store as SocialFactoryRepository).getGrant(org, op.campaignAuthority.grantId)), campaign.payload, item.payload, 'prepare');
  requireValue(item.payload.contentRevision === (op.appliedContentRevision ?? op.sourceContentRevision), 'CAMPAIGN_PRODUCTION_CONTENT_CHANGED');
  return { campaign: campaign.payload, item: item.payload };
 }
 private async checkpoint(org: string, id: string, owner: string, update: Partial<ProductionOperation>) {
  return this.store.transact(async store => {
   const row = await store.read<ProductionOperation>(org, 'editorial', id); requireValue(row?.payload.owner === owner, 'CAMPAIGN_PRODUCTION_LEASE_LOST');
   return store.put<ProductionOperation>({ organizationId: org, kind: 'editorial', id, parentId: row.payload.campaignId, expectedRevision: row.revision,
    payload: { ...row.payload, ...update }, sourceIds: row.sourceIds });
  });
 }
 private async executeItem(org: string, actorId: string, campaign: CampaignV1, item: CampaignItemV1, input: CampaignPrepareInput, assignment: any) {
  let id = identity('editorial', org, item.id, input.requestId);
  const revisionOwnerId = identity('production_revision_owner', org, item.id, String(assignment.sourceContentRevision));
  const existingOwner = await this.store.read<ProductionRevisionOwner>(org, 'action', revisionOwnerId);
  if (existingOwner) id = existingOwner.payload.operationId;
  const owner = randomUUID(), override = input.itemOverrides?.[item.id] ?? {};
  const baseInput: EditorialProductionInputV1 = { organizationId: org, actorId, profile: assignment.context.profile, candidate: assignment.candidate,
   format: item.format, sourceIds: input.sourceIds ?? [], findings: assignment.context.findings,
   ...(assignment.sourceArtifact ? {sourceArtifact: assignment.sourceArtifact} : {}), ...(item.destination ? {destination: item.destination} : {}),
   brief: { ...(override.audioMode??input.audioMode?{audioMode:override.audioMode??input.audioMode}:{}), instruction: override.instruction || input.instruction, language: override.language || input.language || assignment.context.profile.languages[0] || 'en',
    lengthChoiceId: assignment.lengthChoiceId, lengthGuidance: assignment.lengthGuidance, slideCount: item.slideCount, targetSeconds: override.targetSeconds ?? input.targetSeconds }, visuals: input.visuals };
  await this.formatPreflight(org,actorId,item);
  const inputDigest = digest({ baseInput, context: assignment.context, sourceContentRevision: assignment.sourceContentRevision, scheduledAt: item.scheduledAt });
  requireValue(!['reel', 'short', 'long_video'].includes(item.format) || Number.isFinite(baseInput.brief.targetSeconds) && baseInput.brief.targetSeconds! > 0 && baseInput.brief.targetSeconds! <= 600, 'EDITORIAL_VIDEO_DURATION_REQUIRED');
  requireValue(baseInput.sourceIds.length <= 20 && baseInput.sourceIds.every(id => typeof id === 'string' && id.trim()), 'EDITORIAL_INVALID_CONTEXT');
  requireValue(digest(await this.context(org, item.channelId)) === digest(assignment.context), 'CAMPAIGN_PRODUCTION_CONTEXT_CHANGED');
  const beforeClaim = await this.store.read<ProductionOperation>(org, 'editorial', id);
  if (!beforeClaim || beforeClaim.payload.state === 'preflight_failed') {
   const config = await loadAiConfig(org);
   requireValue(Boolean(config.apiKey?.trim()), 'AI_PROVIDER_NOT_CONFIGURED');
   if (campaign.mode === 'autopilot') requireValue(config.modelRouting?.advancedModel?.trim(), 'AUTONOMY_ADVANCED_MODEL_REQUIRED');
  }
  const claimed = await this.store.transact(async store => {
   if(baseInput.sourceArtifact){ requireValue(store.assertArtifactSource,'SOURCE_ARTIFACT_TRANSACTION_REQUIRED'); await store.assertArtifactSource(org,actorId,baseInput.sourceArtifact.ref); }
   const ownership = await store.read<ProductionRevisionOwner>(org, 'action', revisionOwnerId);
   if (ownership) {
    requireValue(ownership.payload.type === 'production_revision_owner' && ownership.payload.itemId === item.id &&
     ownership.payload.sourceContentRevision === assignment.sourceContentRevision, 'CAMPAIGN_PRODUCTION_REVISION_CONFLICT');
    id = ownership.payload.operationId;
   } else {
    // Adopt pre-fence checkpoints without permitting a new request id to bypass them.
    const legacy = (await store.list<ProductionOperation>(org, 'editorial', 10000, campaign.id)).filter(row =>
     row.payload.version === 2 && row.payload.itemId === item.id && row.payload.sourceContentRevision === assignment.sourceContentRevision);
    requireValue(legacy.length <= 1, 'CAMPAIGN_PRODUCTION_REVISION_CONFLICT');
    if (legacy.length) id = legacy[0].id;
    await store.put<ProductionRevisionOwner>({ organizationId: org, kind: 'action', id: revisionOwnerId, parentId: item.id, expectedRevision: 0,
     payload: { type: 'production_revision_owner', operationId: id, itemId: item.id, sourceContentRevision: assignment.sourceContentRevision }, sourceIds: [resourceRef('editorial', id)] });
   }
   const prior = await store.read<ProductionOperation>(org, 'editorial', id);
   if (prior) {
    requireValue(prior.payload.captionEdit?.state !== 'pending', 'CAMPAIGN_CAPTION_SAVE_REQUIRED');
    requireValue(prior.payload.inputDigest === inputDigest, 'CAMPAIGN_PRODUCTION_INTENT_CHANGED');
    if (prior.payload.owner && liveLease(prior.payload.leaseUntil)) return { operation: prior.payload, execute: false };
    if (['submitting', 'artwork_running'].includes(prior.payload.state)) {
     if (liveLease(prior.payload.leaseUntil)) return { operation: prior.payload, execute: false };
     const state = prior.payload.output === undefined ? 'uncertain' : 'artwork_partial';
     if (state === 'uncertain') await new AutonomyService(store as SocialFactoryRepository).settle(org, prior.payload.actionId, { state: 'uncertain', reason: 'Worker lease expired without a durable model result.' });
     const next = await store.put<ProductionOperation>({ organizationId: org, kind: 'editorial', id, parentId: campaign.id, expectedRevision: prior.revision,
      payload: { ...prior.payload, state, blocker: state === 'uncertain' ? 'MODEL_RESULT_REQUIRES_RECONCILIATION' : 'ARTWORK_RESULT_REQUIRES_RECONCILIATION', owner: undefined, leaseUntil: undefined }, sourceIds: prior.sourceIds });
     return { operation: next.payload, execute: false };
    }
    if (prior.payload.state === 'preflight_failed') {
     const bound = new AutonomyService(store as SocialFactoryRepository);
     await new CampaignService(store as SocialFactoryRepository).retry(org, campaign.id, [item.id]);
     const attempt = prior.payload.attempt + 1;
     const reservation = await bound.admit(org, { campaignId: campaign.id, itemId: item.id, requestId: `${id}:attempt:${attempt}`, action: 'prepare',
      expectedContentRevision: prior.payload.sourceContentRevision, actorId, authority: campaign.mode === 'autopilot' ? 'agent' : 'user' });
     const admission = await bound.markSubmitting(org, reservation.id);
     const next = await store.put<ProductionOperation>({ organizationId: org, kind: 'editorial', id, parentId: campaign.id, expectedRevision: prior.revision,
      payload: { ...prior.payload, productionPreflightVersion:1, campaignAuthority: { mode: campaign.mode, ...(campaign.grantId ? { grantId: campaign.grantId } : {}) }, actionId: reservation.id, attempt, state: admission.execute ? 'submitting' : 'uncertain', owner, leaseUntil: lease(), blocker: undefined, blockerDetail: undefined }, sourceIds: prior.sourceIds });
     return { operation: next.payload, execute: admission.execute };
    }
    if (!['generated', 'material_ready'].includes(prior.payload.state)) return { operation: prior.payload, execute: false };
    await this.current(org, prior.payload, store);
    const next = await store.put<ProductionOperation>({ organizationId: org, kind: 'editorial', id, parentId: campaign.id, expectedRevision: prior.revision,
     payload: { ...prior.payload, productionPreflightVersion:1, owner, leaseUntil: lease(), state: prior.payload.state === 'generated' ? 'artwork_running' : 'material_ready' }, sourceIds: prior.sourceIds });
    return { operation: next.payload, execute: true };
   }
   requireValue(item.contentRevision === assignment.sourceContentRevision, 'CAMPAIGN_PRODUCTION_CONTENT_CHANGED');
   const autonomy = new AutonomyService(store as SocialFactoryRepository);
   const reservation = await autonomy.admit(org, { campaignId: campaign.id, itemId: item.id, requestId: id, action: 'prepare', expectedContentRevision: item.contentRevision,
    actorId, authority: campaign.mode === 'autopilot' ? 'agent' : 'user' });
   const admitted = await autonomy.markSubmitting(org, reservation.id);
   const op: ProductionOperation = { version: 2, productionPreflightVersion:1, id, campaignId: campaign.id, itemId: item.id, inputDigest, actionId: reservation.id,
    attempt: 1, sourceContentRevision: item.contentRevision, context: assignment.context, baseInput, sourceAdmissions: [], discoveryId: assignment.discoveryId,
    campaignAuthority: { mode: campaign.mode, ...(campaign.grantId ? { grantId: campaign.grantId } : {}) },
    state: admitted.execute ? 'submitting' : 'uncertain', ...(admitted.execute ? { owner, leaseUntil: lease() } : { blocker: 'MODEL_RESULT_REQUIRES_RECONCILIATION' }) };
   const revisionRequest = await store.read<RevisionRequest>(org, 'editorial', input.requestId);
   const lineage = sourceLinks(op);
   if (revisionRequest?.payload.type === 'production_revision_request') {
    requireValue(revisionRequest.payload.campaignId === campaign.id && revisionRequest.payload.itemId === item.id && revisionRequest.payload.contentRevision === item.contentRevision, 'CAMPAIGN_REVISION_CONFLICT');
    lineage.push(resourceRef('editorial', input.requestId));
   }
   const row = await store.put<ProductionOperation>({ organizationId: org, kind: 'editorial', id, parentId: campaign.id, payload: op, expectedRevision: 0, sourceIds: lineage });
   return { operation: row.payload, execute: admitted.execute };
  });
  if (!claimed.execute) return this.result(claimed.operation, false);
  let op = claimed.operation;
  try {
   if (op.state === 'material_ready') return this.apply(org, actorId, op, owner, false);
   let request = op.effectiveInput ?? op.baseInput;
   const assertPrimaryCost = async () => {
    const permission = await this.autonomy.assertSubmitting(org, op.actionId); requireValue(permission.execute, 'AUTONOMY_ACTION_NOT_EXECUTABLE');
    await this.autonomy.assertUnpricedPreparationAllowed(org, permission.grantId, async () => [(getActiveAiConfig(org) ?? await loadAiConfig(org)).provider]);
   };
   if (op.output === undefined) await assertPrimaryCost();
   if (op.output === undefined && campaign.mode === 'autopilot' && !op.decision) {
    await this.autonomy.assertSubmitting(org, op.actionId);
    const batch = await this.decisions.answerQuestions(org, actorId, { campaignId: campaign.id, itemId: item.id, requestId: id + '-editorial',
     ...(request.sourceArtifact ? {sourceArtifact: request.sourceArtifact} : {}), questions: [
      {id:'angle',type:'angle',question:`Choose an angle preserving the exact selected source and task: ${request.brief.instruction}`},
      {id:'structure',type:'structure',question:`Choose the structure for ${item.format}, preserving explicit slide count ${item.slideCount ?? 'not supplied'} and facts.`},
      ...(!request.brief.lengthGuidance && assignment.lengthOptions.length ? [{id:'length',type:'length' as const,question:`Choose length from these exact material options: ${JSON.stringify(assignment.lengthOptions)}`}] : [])] });
    requireValue(batch.complete && !batch.missingFacts.length, 'AUTONOMY_MISSING_EDITORIAL_INPUT');
    const answer = batch.decisions.map(row => `${row.type}: ${row.decision.answer}`).join('\n');
    const decision = {answer,decisions:batch.decisions};
    request = { ...request, brief: { ...request.brief, instruction: `${request.brief.instruction}\n\nPersisted editorial decisions (inferred preferences): ${answer}`,
     lengthChoiceId: request.brief.lengthChoiceId || identity('delegated_length', id, answer), lengthGuidance: request.brief.lengthGuidance || answer } };
    op = (await this.checkpoint(org, id, owner, { decision, effectiveInput: request })).payload;
   }
   if (op.output === undefined) {
    const permission = await this.autonomy.assertSubmitting(org, op.actionId); requireValue(permission.execute, 'AUTONOMY_ACTION_NOT_EXECUTABLE');
   } else { await this.current(org, op); }
   requireValue(digest(await this.context(org, item.channelId)) === digest(op.context), 'CAMPAIGN_PRODUCTION_CONTEXT_CHANGED');
   const generated = await this.editorial.produce(request, { output: op.output, sourceDigest: op.sourceDigest, onBeforePrimary:async()=>{await assertPrimaryCost();op=(await this.checkpoint(org,id,owner,{primaryProducerAttempt:{version:1,at:new Date().toISOString()}})).payload;}, onGenerated: async (output, context) => {
    const currentContext = await this.context(org, item.channelId);
    let changedCode = digest(currentContext) !== digest(op.context) ? 'CAMPAIGN_PRODUCTION_CONTEXT_CHANGED' : undefined;
    if(op.baseInput.sourceArtifact)try{ await this.sourceArtifacts!.assertCurrent(org,actorId,op.baseInput.sourceArtifact); }catch(error){changedCode=code(error);}
    const changed = !!changedCode;
    await this.store.transact(async store => {
     const row = await store.read<ProductionOperation>(org, 'editorial', id); requireValue(row?.payload.owner === owner, 'CAMPAIGN_PRODUCTION_LEASE_LOST');
     await this.current(org, row.payload, store, false); await store.assertSourceAdmissions(org, context.sourceAdmissions);
     await store.put<ProductionOperation>({ organizationId: org, kind: 'editorial', id, parentId: campaign.id, expectedRevision: row.revision,
      payload: { ...row.payload, output, sourceDigest: context.sourceDigest, sourceAdmissions: context.sourceAdmissions,
       state: changed ? 'needs_revision' : 'artwork_running', ...(changed ? { blocker: changedCode } : {}) }, sourceIds: row.sourceIds });
    });
    if (changed) {
     await this.autonomy.settle(org, op.actionId, { state: 'prepared' });
     throw new SocialFactoryError(changedCode!);
    }
   } });
   const checkpoint = await this.store.read<ProductionOperation>(org, 'editorial', id); requireValue(checkpoint?.payload.owner === owner, 'CAMPAIGN_PRODUCTION_LEASE_LOST');
   // The structured result is known before native persistence; older producers may not invoke onGenerated for a restored output.
   if ((await this.autonomy.getAction(org, op.actionId)).state === 'submitting') await this.autonomy.settle(org, op.actionId, { state: 'prepared' });
   op = (await this.checkpoint(org, id, owner, { state: 'material_ready', material: generated.material, producerStatus: generated.status,
    inspection: 'inspection' in generated ? generated.inspection : undefined, ...(generated.status === 'needs_video' ? { videoBaseMaterial: generated.material } : {}) })).payload;
   return await this.apply(org, actorId, op, owner, claimed.operation.output === undefined);
  } catch (error: any) {
   const row = await this.store.read<ProductionOperation>(org, 'editorial', id);
   if (row?.payload.owner === owner && !['ready', 'needs_video', 'needs_revision'].includes(row.payload.state)) {
    const partial = error?.cause?.partialAssets ?? error?.cause?.saved;
    const unregistered = error?.cause?.unregistered;
    const knownOutput = row.payload.output !== undefined;
    const noModel = !knownOutput && ['AUTONOMY_COST_ESTIMATE_UNAVAILABLE','SOURCE_ARTIFACT_STALE','SOURCE_ARTIFACT_NOT_FOUND','SOURCE_ARTIFACT_ACCESS_DENIED','AUTONOMY_MISSING_EDITORIAL_INPUT','EDITORIAL_INVALID_INPUT','EDITORIAL_SOURCE_PERMISSION_REQUIRED','EDITORIAL_SOURCE_REVISION_REQUIRED','EDITORIAL_LENGTH_CHOICE_REQUIRED','EDITORIAL_VIDEO_DURATION_REQUIRED','EDITORIAL_INVALID_CONTEXT','EDITORIAL_FACT_EVIDENCE_REQUIRED','EDITORIAL_CANDIDATE_PERMISSION_REQUIRED','EDITORIAL_PROFILE_PERMISSION_REQUIRED','EDITORIAL_CHANNEL_MISMATCH','AI_PROVIDER_NOT_CONFIGURED','AI_CONFIG_NOT_FOUND','AUTONOMY_ADVANCED_MODEL_REQUIRED','AUTONOMY_ADVANCED_MODEL_UNAVAILABLE','AUTONOMY_AI_CONFIGURATION_CHANGED','AUTONOMY_EVIDENCE_UNAVAILABLE'].includes(code(error));
    const state = noModel ? 'preflight_failed' : row.payload.state === 'material_ready' ? 'material_ready' : partial?.length || unregistered ? 'artwork_partial' : knownOutput ? 'generated' : 'uncertain';
    await this.checkpoint(org, id, owner, { state, owner: undefined, leaseUntil: undefined, partialAssets: partial, unregisteredAsset: unregistered,
     ...(error.material ? { material: error.material } : {}), blocker: code(error), blockerDetail: code(error) === 'AUTONOMY_COST_ESTIMATE_UNAVAILABLE' ? error.message : undefined });
    if (knownOutput && (await this.autonomy.getAction(org, op.actionId)).state === 'submitting') await this.autonomy.settle(org, op.actionId, { state: 'prepared' });
    if (noModel) await this.autonomy.settle(org, op.actionId, { state: 'failed', reason: code(error) === 'AUTONOMY_COST_ESTIMATE_UNAVAILABLE' ? `${code(error)}: ${error.message}` : code(error) });
    else if (!knownOutput) await this.autonomy.settle(org, op.actionId, { state: 'uncertain', reason: 'Model result not durably captured. Automatic replay is blocked.' });
   }
   throw error;
  }
 }
 private async apply(org: string, actorId: string, op: ProductionOperation, owner: string, regenerated: boolean, suppressDelivery = false,onApplied?:(store:SocialFactoryStoreV1,final:ProductionOperation)=>Promise<void>) {
  await this.current(org, op);
  requireValue(digest(await this.context(org, op.baseInput.profile.channelId)) === digest(op.context), 'CAMPAIGN_PRODUCTION_CONTEXT_CHANGED');
  requireValue(op.material && op.producerStatus, 'CAMPAIGN_PRODUCTION_MATERIAL_MISSING');
  const language = op.baseInput.brief.language.startsWith('ru') ? 'ru' : 'en';
  let material = op.nativeMaterial ?? op.material;
  if (op.producerStatus !== 'needs_revision' && !op.nativeMaterial) {
   material = await this.native.save(org, actorId, { campaignId: op.campaignId, itemId: op.itemId,
    requestId: op.nativeRequestId ?? `${op.id}-native-${op.sourceContentRevision}-${digest(op.material)}`, material, scheduledAt: (await this.campaigns.get(org, op.campaignId)).items.find(item => item.id === op.itemId)!.scheduledAt,
    sourceAdmissions: op.sourceAdmissions }, language);
   op = (await this.checkpoint(org, op.id, owner, { nativeMaterial: material })).payload;
  }
  requireValue(digest(await this.context(org, op.baseInput.profile.channelId)) === digest(op.context), 'CAMPAIGN_PRODUCTION_CONTEXT_CHANGED');
  const final = await this.store.transact(async store => {
   const row = await store.read<ProductionOperation>(org, 'editorial', op.id); requireValue(row?.payload.owner === owner, 'CAMPAIGN_PRODUCTION_LEASE_LOST');
   const current = await this.current(org, row.payload, store); await store.assertSourceAdmissions(org, row.payload.sourceAdmissions);
   const updated = await new CampaignService(store as SocialFactoryRepository).setMaterial(org, op.campaignId, op.itemId, { material,
    expectedContentRevision: current.item.contentRevision, editorialId: op.id, discoveryIds: [op.discoveryId] });
   if (op.producerStatus !== 'ready') {
    const item = await store.read<CampaignItemV1>(org, 'campaign_item', op.itemId); requireValue(item, 'CAMPAIGN_ITEM_SCOPE');
    await store.put({ organizationId: org, kind: 'campaign_item', id: item.id, expectedRevision: item.revision,
     payload: { ...item.payload, state: 'needs_input', blocker: { code: op.producerStatus === 'needs_video' ? 'FINISHED_VIDEO_REQUIRED' : 'EDITORIAL_REVISION_REQUIRED',
      detail: op.producerStatus === 'needs_video' ? 'A finished provider video is required.' : 'Editorial inspection requires revision before approval.' } }, sourceIds: item.sourceIds });
   }
   const final = (await store.put<ProductionOperation>({ organizationId: org, kind: 'editorial', id: op.id, parentId: op.campaignId, expectedRevision: row.revision,
    payload: { ...row.payload, material, ...(op.producerStatus === 'needs_video' ? { videoBaseMaterial: material } : row.payload.videoBaseMaterial && row.payload.captionOverride ? {
     videoBaseMaterial: { ...withCaption(row.payload.videoBaseMaterial, row.payload.captionOverride), pieceId: material.pieceId, derivationId: material.derivationId } } : {}), state: op.producerStatus!,
     ...(row.payload.captionEdit ? { captionEdit: { ...row.payload.captionEdit, state: 'completed' as const } } : {}),
     appliedContentRevision: updated.contentRevision, owner: undefined, leaseUntil: undefined, activeReinspection: undefined }, sourceIds: row.sourceIds })).payload;
   if (row.payload.activeReinspection) {
    const receipt = await store.read<ReinspectionReceipt>(org, 'editorial', row.payload.activeReinspection.id);
    requireValue(receipt?.payload.owner === owner && receipt.payload.state === 'running', 'CAMPAIGN_REINSPECTION_LEASE_LOST');
    await store.put<ReinspectionReceipt>({ organizationId: org, kind: 'editorial', id: receipt.id, parentId: op.id, expectedRevision: receipt.revision,
     payload: { ...receipt.payload, state: 'completed', result: this.result(final, false), owner: undefined, leaseUntil: undefined }, sourceIds: receipt.sourceIds });
   }
   await onApplied?.(store,final);
   return final;
  });
  if (final.state === 'ready' && !suppressDelivery) await this.autopublish(org, actorId, final);
  return this.result(final, regenerated);
 }
 private async autopublish(org: string, actorId: string, op: ProductionOperation) {
  if (op.deliveryRequiresApproval) return;
  if ((await this.campaigns.get(org,op.campaignId)).items.find(item=>item.id===op.itemId)?.destination?.kind==='draft') return;
  const { campaign, item } = await this.current(org, op);
  requireValue(digest(await this.context(org, op.baseInput.profile.channelId)) === digest(op.context), 'CAMPAIGN_PRODUCTION_CONTEXT_CHANGED');
  if (campaign.mode !== 'autopilot' || ['published', 'scheduled', 'submitting', 'uncertain'].includes(item.state)) return;
  const approved = await this.store.transact(async store => {
   const current = await this.current(org, op, store), record = await store.read<ProductionOperation>(org, 'editorial', op.id);
   requireValue(record, 'CAMPAIGN_PRODUCTION_MISSING');
   if (record.payload.deliveryRequiresApproval) return null;
   const grant = current.campaign.grantId ? await new AutonomyService(store as SocialFactoryRepository).getGrant(org, current.campaign.grantId) : null;
   let allowed = !!grant && grant.actions.includes('schedule') && grant.actions.includes('publish');
   if (allowed && grant) {
    try { assertGrantScope(grant, current.campaign, current.item, 'schedule'); assertGrantScope(grant, current.campaign, current.item, 'publish', new Date(), new Date(current.item.scheduledAt)); }
    catch { allowed = false; }
   }
   if (!allowed) {
    await store.put<ProductionOperation>({ organizationId: org, kind: 'editorial', id: op.id, expectedRevision: record.revision,
     payload: { ...record.payload, deliveryRequiresApproval: true, blocker: 'AUTONOMY_DELIVERY_APPROVAL_REQUIRED' }, sourceIds: record.sourceIds });
    return null;
   }
   return new CampaignService(store as SocialFactoryRepository).approve(org, current.campaign.id, current.item.id,
    { actorId: `autopilot:${actorId}`, expectedContentRevision: current.item.contentRevision, digest: approvalDigest(current.item) });
  });
  if (!approved) return;
  await this.publishing.deliver(org, { campaignId: campaign.id, itemId: item.id, requestId: `${op.id}-publish-${approved.contentRevision}`, action: 'schedule',
   expectedContentRevision: approved.contentRevision, approvalDigest: approvalDigest(approved), actorId, authority: 'agent' }, op.baseInput.brief.language.startsWith('ru') ? 'ru' : 'en');
 }
 /** Explicitly authorized paid revision. A transport retry resumes this one revision rather than creating another. */
 async revise(org: string, actorId: string, campaignId: string, itemId: string, input: CampaignReviseInput) {
  requireValue(actorId && input.requestId?.trim() && input.instruction?.trim() && Number.isSafeInteger(input.expectedContentRevision) && input.expectedContentRevision > 0, 'CAMPAIGN_REVISION_INPUT_REQUIRED');
  const id = identity('production_revision_request', org, actorId, input.requestId), requestDigest = digest({ campaignId, itemId, input });
  const request = await this.store.transact(async store => {
   const existing = await store.read<RevisionRequest>(org, 'editorial', id);
   if (existing) {
    requireValue(existing.payload.type === 'production_revision_request' && existing.payload.requestDigest === requestDigest, 'CAMPAIGN_REVISION_IDEMPOTENCY_CONFLICT');
    return existing.payload;
   }
   const bound = new CampaignService(store as SocialFactoryRepository), selected = await bound.get(org, campaignId);
   const item = selected.items.find(entry => entry.id === itemId); requireValue(item, 'CAMPAIGN_ITEM_SCOPE');
   requireValue(item.contentRevision === input.expectedContentRevision, 'CAMPAIGN_REVISION_CONFLICT');
   const previous = (await store.list<ProductionOperation>(org, 'editorial', 10000, campaignId)).filter(row => row.payload.version === 2 && row.payload.itemId === itemId);
   requireValue(!previous.some(row => row.payload.captionEdit?.state === 'pending' || ['submitting', 'artwork_running', 'artwork_partial', 'uncertain'].includes(row.payload.state) || row.payload.owner && liveLease(row.payload.leaseUntil) || liveLease(row.payload.finalizing?.until)), 'CAMPAIGN_REVISION_PREVIOUS_WORK_PENDING');
   for (const row of previous.filter(row => row.payload.productionId)) {
    const video = await this.videos.get(org, row.payload.productionId!);
    requireValue(!['approved', 'running', 'submitting'].includes(video.state) && !video.jobs.some(job => ['submitting', 'queued', 'running', 'saving', 'submit_uncertain', 'save_failed', 'awaiting_assets'].includes(job.state)), 'CAMPAIGN_REVISION_PREVIOUS_WORK_PENDING');
   }
   const prior = previous.sort((a, b) => (b.payload.appliedContentRevision ?? b.payload.sourceContentRevision) - (a.payload.appliedContentRevision ?? a.payload.sourceContentRevision))[0]?.payload;
   const priorInput = prior?.effectiveInput ?? prior?.baseInput;
   const instruction = item.material ? `${input.instruction}

Previous editorial draft to revise (not new evidence or permission): ${JSON.stringify({ title: item.material.title, hook: item.material.hook, body: item.material.body, caption: item.material.caption, script: item.material.script, posts: item.material.posts, scenes: item.material.scenes, slides: item.material.slides?.map(slide => ({ index: slide.index, text: slide.text })) })}` : input.instruction;
   requireValue(instruction.length <= 20000, 'CAMPAIGN_REVISION_CONTEXT_TOO_LARGE');
   const next = await bound.beginRevision(org, campaignId, itemId, input.expectedContentRevision);
   const override: CampaignItemPrepareOverride = { instruction, audioMode:input.audioMode??priorInput?.brief.audioMode, sourceArtifact: input.sourceArtifact ?? priorInput?.sourceArtifact?.ref, language: input.language ?? priorInput?.brief.language,
    lengthChoiceId: input.lengthChoiceId ?? priorInput?.brief.lengthChoiceId, lengthGuidance: input.lengthGuidance ?? priorInput?.brief.lengthGuidance,
    targetSeconds: input.targetSeconds ?? priorInput?.brief.targetSeconds };
   const payload: RevisionRequest = { type: 'production_revision_request', requestDigest, campaignId, itemId, contentRevision: next.contentRevision,
    prepareInput: { campaignId, requestId: id, instruction, itemIds: [itemId], sourceIds: input.sourceIds ?? priorInput?.sourceIds ?? [],
     visuals: input.visuals ?? priorInput?.visuals, itemOverrides: { [itemId]: override } } };
   await store.put<RevisionRequest>({ organizationId: org, kind: 'editorial', id, parentId: campaignId, expectedRevision: 0, payload,
    sourceIds: [...(prior ? [resourceRef('editorial', prior.id)] : []), ...(payload.prepareInput.sourceIds ?? []).map(sourceRef)] });
   return payload;
  });
  const production = await this.prepare(org, actorId, request.prepareInput);
  return { campaignId, itemId, contentRevision: request.contentRevision, production, resumeInput: request.prepareInput };
 }
 /** Caption-only video edits share the continuation's CAS and local-save receipt.
  * No manifest, scene job, model checkpoint or provider input is changed. */
 async editCaption(org: string, actorId: string, input: CampaignTextEdit, language: 'ru' | 'en' = 'ru') {
  requireValue(actorId && input.body?.trim() && input.body.length <= 100000 && input.postIndex === undefined, 'CAMPAIGN_TEXT_REQUIRED');
  const inputDigest = digest({ actorId, ...input, body: input.body.trim() });
  const id = identity('video_caption_edit', org, actorId, input.campaignId, input.itemId, String(input.expectedContentRevision), inputDigest), owner = randomUUID();
  const claimed = await this.store.transact(async store => {
   const detail = await new CampaignService(store as SocialFactoryRepository).get(org, input.campaignId);
   const item = detail.items.find(row => row.id === input.itemId);
   requireValue(item?.material && ['reel', 'short', 'long_video'].includes(item.format), 'CAMPAIGN_MATERIAL_REQUIRED');
   const operations = (await store.list<ProductionOperation>(org, 'editorial', 10000, input.campaignId)).filter(row => row.payload.version === 2 && row.payload.itemId === item.id);
   const rows = operations.filter(row => row.payload.captionEdit?.id === id || (item as CampaignItemV1 & { sourceRecordRefs?: string[] }).sourceRecordRefs?.includes(resourceRef('editorial', row.id)));
   requireValue(rows.length === 1, 'CAMPAIGN_VIDEO_CAPTION_EDIT_BLOCKED');
   const row = rows[0], operation = row.payload;
   await this.current(org, operation, store);
   if (operation.captionEdit?.id === id && operation.captionEdit.state === 'completed') return { done: true as const, item };
   const resuming = operation.captionEdit?.id === id && operation.captionEdit.state === 'pending';
   requireValue((['needs_video', 'needs_revision', 'ready'].includes(operation.state) || resuming && operation.state === 'material_ready') &&
    !liveLease(operation.leaseUntil) && !liveLease(operation.finalizing?.until) &&
    !['scheduled', 'published', 'submitting', 'uncertain', 'cancelled'].includes(item.state) &&
    (!operation.captionEdit || operation.captionEdit.state === 'completed' || resuming), 'CAMPAIGN_VIDEO_CAPTION_EDIT_BLOCKED');
   if (operation.productionId) {
    const production = await this.videos.get(org, operation.productionId);
    requireValue(['completed', 'stopped'].includes(production.state) && production.jobs.every(job =>
     ['completed', 'failed', 'canceled'].includes(job.state)), 'CAMPAIGN_VIDEO_CAPTION_EDIT_BLOCKED');
   }
   await store.assertSourceAdmissions(org, operation.sourceAdmissions);
   let next = operation;
   if (!resuming) {
    requireValue(item.contentRevision === input.expectedContentRevision, 'CAMPAIGN_REVISION_CONFLICT');
    const override: NonNullable<ProductionOperation['captionOverride']> = { field: item.platform === 'telegram' ? 'telegram' : 'caption', value: input.body.trim() };
    const material = withCaption(item.material, override); delete material.pieceId; delete material.derivationId;
    const revised = await new CampaignService(store as SocialFactoryRepository).setMaterial(org, input.campaignId, item.id,
     { material, expectedContentRevision: item.contentRevision, editorialId: row.id, discoveryIds: [operation.discoveryId] });
    const fresh = await store.read<CampaignItemV1>(org, 'campaign_item', item.id); requireValue(fresh, 'CAMPAIGN_ITEM_SCOPE');
    await store.put({ organizationId: org, kind: 'campaign_item', id: item.id, expectedRevision: fresh.revision,
     payload: { ...fresh.payload, state: 'needs_input', blocker: item.blocker ?? { code: 'CAMPAIGN_CAPTION_SAVE_REQUIRED', detail: 'The edited caption must be saved as a new native draft.' } }, sourceIds: fresh.sourceIds });
    next = { ...operation, state: 'material_ready', producerStatus: operation.state as 'ready' | 'needs_video' | 'needs_revision',
     material, nativeMaterial: undefined, appliedContentRevision: revised.contentRevision, captionOverride: override,
     ...(operation.videoBaseMaterial ? { videoBaseMaterial: withCaption(operation.videoBaseMaterial, override) } : {}),
     nativeRequestId: id, deliveryRequiresApproval: true,
     captionEdit: { id, actorId, inputDigest, expectedContentRevision: input.expectedContentRevision, state: 'pending' } };
   }
   const saved = await store.put<ProductionOperation>({ organizationId: org, kind: 'editorial', id: row.id, parentId: row.parentId,
    expectedRevision: row.revision, payload: { ...next, owner, leaseUntil: lease() }, sourceIds: row.sourceIds });
   return { done: false as const, operation: saved.payload };
  });
  if (claimed.done) return claimed.item;
  try {
   await this.apply(org, actorId, claimed.operation, owner, false, true);
   return (await this.campaigns.get(org, input.campaignId)).items.find(item => item.id === input.itemId)!;
  } catch (error) {
   await this.store.transact(async store => {
    const row = await store.read<ProductionOperation>(org, 'editorial', claimed.operation.id);
    if (row?.payload.owner === owner) await store.put<ProductionOperation>({ organizationId: org, kind: 'editorial', id: row.id,
     expectedRevision: row.revision, payload: { ...row.payload, owner: undefined, leaseUntil: undefined, blocker: code(error) }, sourceIds: row.sourceIds });
   });
   throw error;
  }
 }
 /** Explicit inspection of a captured output. This path never opens a model admission or publishes. */
 async reinspect(org: string, actorId: string, operationId: string, input: { expectedContentRevision: number }) {
  requireValue(actorId && Number.isSafeInteger(input?.expectedContentRevision) && input.expectedContentRevision > 0, 'CAMPAIGN_REINSPECTION_INPUT_REQUIRED');
  const initial = await this.store.read<ProductionOperation>(org, 'editorial', operationId);
  requireValue(initial?.payload.version === 2, 'CAMPAIGN_PRODUCTION_MISSING');
  requireValue(initial.payload.output !== undefined && initial.payload.state !== 'uncertain' && initial.payload.sourceDigest, 'CAMPAIGN_REINSPECTION_OUTPUT_REQUIRED');
  await this.current(org, initial.payload);
  requireValue(digest(await this.context(org, initial.payload.baseInput.profile.channelId)) === digest(initial.payload.context), 'CAMPAIGN_PRODUCTION_CONTEXT_CHANGED');
  const repairId = identity('production_reinspection', org, operationId, String(input.expectedContentRevision)), owner = randomUUID();
  const claimed = await this.store.transact(async store => {
   const row = await store.read<ProductionOperation>(org, 'editorial', operationId); requireValue(row?.payload.version === 2, 'CAMPAIGN_PRODUCTION_MISSING');
   requireValue(row.payload.output !== undefined && row.payload.sourceDigest && row.payload.state !== 'uncertain', 'CAMPAIGN_REINSPECTION_OUTPUT_REQUIRED');
   const current = await this.current(org, row.payload, store);
   const receipt = await store.read<ReinspectionReceipt>(org, 'editorial', repairId);
   if (receipt?.payload.state === 'completed') return { execute: false as const, result: receipt.payload.result!, operation: row.payload };
   if (receipt?.payload.state === 'running' && liveLease(receipt.payload.leaseUntil)) return { execute: false as const,
    result: { itemId: row.payload.itemId, state: 'in_progress', operationId, repairId, regenerated: false }, operation: row.payload };
   requireValue(current.item.contentRevision === input.expectedContentRevision, 'CAMPAIGN_REVISION_CONFLICT');
   requireValue(receipt?.payload.state !== 'running' || row.payload.state === 'material_ready', 'CAMPAIGN_REINSPECTION_RECONCILIATION_REQUIRED');
   requireValue(!['submitting', 'artwork_running'].includes(row.payload.state) || receipt?.payload.state === 'running', 'CAMPAIGN_REINSPECTION_RECONCILIATION_REQUIRED');
   requireValue(!['published', 'scheduled', 'submitting', 'uncertain', 'cancelled'].includes(current.item.state), 'CAMPAIGN_REINSPECTION_ITEM_LOCKED');
   requireValue(!row.payload.owner || !liveLease(row.payload.leaseUntil), 'CAMPAIGN_REINSPECTION_IN_PROGRESS');
   const storedMaterial = row.payload.nativeMaterial ?? row.payload.material;
   const visual = ['story', 'carousel'].includes(row.payload.baseInput.format);
   const video = ['reel', 'short', 'long_video'].includes(row.payload.baseInput.format);
   requireValue(row.payload.captionEdit?.state !== 'pending', 'CAMPAIGN_VIDEO_CAPTION_EDIT_BLOCKED');
   requireValue(!video || !row.payload.productionId, 'CAMPAIGN_REINSPECTION_VIDEO_BOUND');
   const retainedCover = video && row.payload.state === 'needs_video' && storedMaterial?.assets.length === 1 &&
    storedMaterial.assets[0].kind === 'image' && storedMaterial.assets[0].role === 'cover' && storedMaterial.assets[0].mimeType === 'image/png';
   requireValue(!storedMaterial?.assets.length || visual || retainedCover, 'CAMPAIGN_REINSPECTION_RETAINED_FORMAT_UNSUPPORTED');
   const retained = (visual || retainedCover) && storedMaterial?.assets.length ? storedMaterial : undefined;
   const partial = row.payload.partialAssets as { id?: string }[] | undefined;
   requireValue(!row.payload.unregisteredAsset && (!partial?.length || partial.every(asset => retained?.assets.some(known => known.mediaId === asset.id))), 'CAMPAIGN_REINSPECTION_ASSETS_RECONCILIATION_REQUIRED');
   await store.assertSourceAdmissions(org, row.payload.sourceAdmissions);
   await store.put<ReinspectionReceipt>({ organizationId: org, kind: 'editorial', id: repairId, parentId: operationId, expectedRevision: receipt?.revision ?? 0,
    payload: { type: 'production_reinspection', operationId, expectedContentRevision: input.expectedContentRevision, state: 'running', owner, leaseUntil: lease() },
    sourceIds: [resourceRef('editorial', operationId)] });
   const operation = (await store.put<ProductionOperation>({ organizationId: org, kind: 'editorial', id: operationId, parentId: row.payload.campaignId,
    expectedRevision: row.revision, payload: { ...row.payload, owner, leaseUntil: lease(), state: 'artwork_running', deliveryRequiresApproval: true,
     activeReinspection: { id: repairId, expectedContentRevision: input.expectedContentRevision }, nativeRequestId: repairId }, sourceIds: row.sourceIds })).payload;
   return { execute: true as const, operation, retained };
  });
  if (!claimed.execute) return claimed.result;
  let operation = claimed.operation;
  try {
   // Additive B restore contract. Only captured output and its own retained media are supplied.
   const restore: NonNullable<Parameters<SocialEditorialProductionV1['produce']>[1]> = {
    output: operation.output, sourceDigest: operation.sourceDigest, ...(claimed.retained ? { retainedMaterial: structuredClone(claimed.retained) } : {}) };
   const produced = await this.editorial.produce(operation.effectiveInput ?? operation.baseInput, restore);
   const action = await this.autonomy.getAction(org, operation.actionId);
   if (action.state === 'submitting') await this.autonomy.settle(org, action.id, { state: 'prepared' });
   operation = (await this.checkpoint(org, operationId, owner, { state: 'material_ready', producerStatus: produced.status,
    material: withCaption(produced.material, operation.captionOverride), nativeMaterial: undefined, inspection: 'inspection' in produced ? produced.inspection : undefined,
    partialAssets: undefined, unregisteredAsset: undefined, blocker: undefined })).payload;
   return await this.apply(org, actorId, operation, owner, false, true);
  } catch (error: any) {
   await this.store.transact(async store => {
    const row = await store.read<ProductionOperation>(org, 'editorial', operationId), receipt = await store.read<ReinspectionReceipt>(org, 'editorial', repairId);
    if (row?.payload.owner !== owner || receipt?.payload.owner !== owner) return;
    const partial = error?.cause?.partialAssets ?? error?.cause?.saved, unregistered = error?.cause?.unregistered;
    await store.put<ProductionOperation>({ organizationId: org, kind: 'editorial', id: operationId, parentId: row.payload.campaignId, expectedRevision: row.revision,
     payload: { ...row.payload, state: partial?.length || unregistered ? 'artwork_partial' : row.payload.state === 'material_ready' ? 'material_ready' : initial.payload.state,
      owner: undefined, leaseUntil: undefined, activeReinspection: undefined, ...(partial ? { partialAssets: partial } : {}), ...(unregistered ? { unregisteredAsset: unregistered } : {}), blocker: code(error) }, sourceIds: row.sourceIds });
    await store.put<ReinspectionReceipt>({ organizationId: org, kind: 'editorial', id: repairId, parentId: operationId, expectedRevision: receipt.revision,
     payload: { ...receipt.payload, state: 'failed', errorCode: code(error), owner: undefined, leaseUntil: undefined }, sourceIds: receipt.sourceIds });
   });
   throw error;
  }
 }
 async get(org: string, operationId: string) {
  const row = await this.store.read<ProductionOperation>(org, 'editorial', operationId); requireValue(row?.payload.version === 2 && row.payload.baseInput, 'CAMPAIGN_PRODUCTION_MISSING'); return this.result(row.payload, false);
 }
 private localCompositionV2(){
  requireValue(this.localCompositions,'LOCAL_COMPOSITION_UNAVAILABLE');
  return new LocalCompositionOperationV2(this.store,this.localCompositions,{
   material:op=>withCaption(op.videoBaseMaterial??op.material!,op.captionOverride),
   current:(org,op,store)=>this.current(org,op,store),preflight:(org,actor,item,store)=>this.formatPreflight(org,actor,item,store),
   sourceProduction:async(org,actor,op,manifest)=>manifest.sourceProductionRevisionId?this.videos.localSourceEvidenceV2(org,actor,manifest.sourceProductionRevisionId,(op.videoBaseMaterial??op.material)?.pieceId):undefined,
   inspect:(org,material)=>this.editorial.finalizeVideo(org,{...material,assets:material.assets.filter(a=>a.kind!=='video'&&a.kind!=='subtitle')},material.assets.filter(a=>a.kind==='video')),
   apply:(org,actor,op,owner,complete)=>this.apply(org,actor,op,owner,false,true,complete),
  },this.localCompositionExecution);
 }
 composeLocalVideoV2(org:string,actor:string,input:LocalCompositionStartV2){return this.localCompositionV2().start(org,actor,input);}
 localVideoCompositionV2(org:string,actor:string,operationId:string,compositionId:string){return this.localCompositionV2().open(org,actor,operationId,compositionId);}
 stopLocalVideoCompositionV2(org:string,actor:string,operationId:string,compositionId:string){return this.localCompositionV2().stop(org,actor,operationId,compositionId);}
 runLocalVideoCompositionV2(org:string,operationId:string,compositionId:string,options?:LocalCompositionOptionsV2){return this.localCompositionV2().run(org,operationId,compositionId,options);}
 /** Account-free silent composition of this exact saved source and selected item. No paid admission. */
 async renderLocal(org:string,actorId:string,input:{operationId:string;expectedContentRevision:number}){
  requireValue(this.localReels && actorId && Number.isSafeInteger(input.expectedContentRevision),'LOCAL_REEL_INPUT_REQUIRED');
  const owner=randomUUID();
  const claimed=await this.store.transact(async store=>{
   const row=await store.read<ProductionOperation>(org,'editorial',input.operationId);
   requireValue(row?.payload.version===2 && row.payload.baseInput.sourceArtifact && row.payload.baseInput.actorId===actorId,'LOCAL_REEL_SOURCE_REQUIRED');
   const current=await this.current(org,row.payload,store);
   requireValue(current.item.contentRevision===input.expectedContentRevision,'CAMPAIGN_REVISION_CONFLICT');
   await this.formatPreflight(org,actorId,current.item,store);assertLocalReelCandidateV1(org,actorId,row.payload,current.campaign,current.item);
   requireValue(current.item.format==='reel' && row.payload.material && !row.payload.productionId && row.payload.captionEdit?.state!=='pending','LOCAL_REEL_ITEM_SCOPE');
   if(row.payload.state==='ready' && row.payload.localReel?.asset)return {done:true as const,operation:row.payload};
   requireValue(['needs_video','material_ready'].includes(row.payload.state) && !liveLease(row.payload.leaseUntil),'LOCAL_REEL_IN_PROGRESS');
   const next=await store.put<ProductionOperation>({organizationId:org,kind:'editorial',id:row.id,parentId:row.parentId??undefined,expectedRevision:row.revision,
    payload:{...row.payload,owner,leaseUntil:lease()},sourceIds:row.sourceIds});
   return {done:false as const,operation:next.payload};
  });
  if(claimed.done)return this.result(claimed.operation,false);
  let op=claimed.operation;
  try{
   const material=await this.localReels.produce(org,op.baseInput.sourceArtifact!,op.videoBaseMaterial??op.material!,op.baseInput.visuals?.imageMediaIds??[],op.localReel??{},
    async localReel=>{op=(await this.checkpoint(org,op.id,owner,{localReel})).payload;},async()=>{await this.current(org,op);},op.id);
   const inspection=await this.editorial.finalizeVideo(org,{...material,assets:material.assets.filter(a=>a.kind!=='video')},material.assets.filter(a=>a.kind==='video'));
   op=(await this.checkpoint(org,op.id,owner,{state:'material_ready',material:inspection.material,producerStatus:inspection.status,inspection:inspection.inspection,
    nativeMaterial:undefined,nativeRequestId:identity('local_reel_native',op.id,op.localReel!.rendered!.renderKey),deliveryRequiresApproval:true})).payload;
   return await this.apply(org,actorId,op,owner,false,true);
  }catch(error){
   const failed=(await this.checkpoint(org,op.id,owner,{owner:undefined,leaseUntil:undefined,blocker:code(error)})).payload;
   if(isLocalReelInputErrorV1(code(error)))return {...this.result(failed,false),localRender:{state:'needs_input',reason:code(error),primaryPreparation:'saved',primaryRetryAllowed:false}};
   throw error;
  }
 }
 async bindVideo(org: string, actorId: string, campaignId: string, itemId: string, input: { operationId: string; manifest: unknown; intentId: string; parentId?: string; funding?: PersonalProductionFundingV2 }) {
  const record = await this.store.read<ProductionOperation>(org, 'editorial', input.operationId);
  requireValue(record?.payload.campaignId === campaignId && record.payload.itemId === itemId && record.payload.material?.pieceId, 'CAMPAIGN_VIDEO_SCOPE');
  requireValue(record.payload.captionEdit?.state !== 'pending' && !liveLease(record.payload.leaseUntil), 'CAMPAIGN_VIDEO_CAPTION_EDIT_BLOCKED');
  await this.current(org, record.payload);
  const piece = await this.videoRecords.piece(org, (record.payload.videoBaseMaterial ?? record.payload.material).pieceId!); requireValue(piece, 'CAMPAIGN_VIDEO_SOURCE_MISSING');
  const production = await this.videos.createRevision(org, actorId, { manifest: { ...(input.manifest as object), pieceId: piece.id, pieceRevision: videoSourceRevisionV1(piece) }, intentId: input.intentId, parentId: input.parentId, ...(input.funding !== undefined ? { funding: input.funding } : {}) });
  await this.store.transact(async store => {
   const row = await store.read<ProductionOperation>(org, 'editorial', record.id); requireValue(row, 'CAMPAIGN_PRODUCTION_MISSING'); await this.current(org, row.payload, store);
   requireValue(row.payload.captionEdit?.state !== 'pending' && !liveLease(row.payload.leaseUntil), 'CAMPAIGN_VIDEO_CAPTION_EDIT_BLOCKED');
   requireValue(!liveLease(row.payload.finalizing?.until), 'CAMPAIGN_VIDEO_FINALIZATION_IN_PROGRESS');
   await store.put<ProductionOperation>({ organizationId: org, kind: 'editorial', id: row.id, expectedRevision: row.revision,
    payload: { ...row.payload, productionId: production.id }, parentId: campaignId, sourceIds: row.sourceIds });
  });
  return production;
 }
 async finalizeVideo(org: string, actorId: string, operationId: string) {
  const row = await this.store.read<ProductionOperation>(org, 'editorial', operationId);
  requireValue(row?.payload.productionId && row.payload.material, 'CAMPAIGN_VIDEO_SCOPE');
  requireValue(row.payload.captionEdit?.state !== 'pending' && !liveLease(row.payload.leaseUntil), 'CAMPAIGN_VIDEO_CAPTION_EDIT_BLOCKED');
  const production = await this.videos.get(org, row.payload.productionId, actorId);
  if (!production.result || production.state !== 'completed') return { state: production.state, production };
  const media = production.result as MeasuredVideoResult;
  const personal = 'funding' in production && production.funding?.kind === 'personal_subscription';
  const jobId = production.approval?.finalJobId, job = jobId ? personal ? await this.videos.finalResultJob(org, production.id, jobId) : await this.videoRecords.job(org, jobId) : null;
  requireValue(job?.state === 'completed' && job.id === jobId && job.resultMediaId === media.id && media.type === 'video', 'VIDEO_FINAL_RESULT_MISMATCH');
  const duration = media.durationSeconds;
  requireValue(Number.isFinite(duration) && duration! > 0, 'VIDEO_ACTUAL_DURATION_REQUIRED');
  requireValue(Number.isSafeInteger(media.width) && media.width! > 0 && Number.isSafeInteger(media.height) && media.height! > 0 &&
   media.metadata?.source === 'mp4_bytes' && /^[a-f0-9]{64}$/.test(media.metadata.sha256), 'VIDEO_ACTUAL_METADATA_REQUIRED');
  const captions = media.captions;
  requireValue(captions && ['provider_confirmed', 'authored_timed_cues', 'retained_scene_lineage'].includes(captions.burned) &&
   Array.isArray(captions.sourceJobIds) && captions.sourceJobIds.length > 0 && captions.sourceJobIds.every(id => typeof id === 'string' && id.trim()), 'VIDEO_CAPTIONS_UNVERIFIED');
  const subtitles = media.subtitles ?? [];
  requireValue(Array.isArray(subtitles) && new Set(subtitles.map(subtitle => subtitle.mediaId)).size === subtitles.length && subtitles.every(subtitle =>
   subtitle.id && subtitle.mediaId && subtitle.mediaId !== media.id && subtitle.path && subtitle.type === 'subtitle' && subtitle.role === 'captions' &&
   ['text/vtt', 'application/x-subrip'].includes(subtitle.mimeType) && /^[a-f0-9]{64}$/.test(subtitle.sha256) && Number.isSafeInteger(subtitle.cueCount) && subtitle.cueCount > 0 &&
   ['provider_subtitle_file', 'authored_timed_cues'].includes(subtitle.source)), 'VIDEO_SUBTITLE_EVIDENCE_INVALID');
  if (captions.burned === 'authored_timed_cues') requireValue(subtitles.some(subtitle => subtitle.mimeType === 'text/vtt' && subtitle.source === 'authored_timed_cues'), 'VIDEO_AUTHORED_CAPTIONS_FILE_REQUIRED');
  const resultId = digest({ productionId: production.id, revision: production.revision, productionDigest: production.digest, jobId,
   mediaId: media.id, path: media.path, duration, width: media.width, height: media.height, metadata: media.metadata, captions, subtitles });
  if (row.payload.finalizedResultId === resultId) return { state: row.payload.state, material: row.payload.nativeMaterial ?? row.payload.material, regenerated: false };
  const owner = randomUUID();
  const claimed = await this.store.transact(async store => {
   const latest = await store.read<ProductionOperation>(org, 'editorial', operationId); requireValue(latest?.payload.productionId === production.id, 'CAMPAIGN_VIDEO_REVISION_CHANGED');
   requireValue(latest.payload.captionEdit?.state !== 'pending' && !liveLease(latest.payload.leaseUntil), 'CAMPAIGN_VIDEO_CAPTION_EDIT_BLOCKED');
   if (latest.payload.finalizedResultId === resultId || liveLease(latest.payload.finalizing?.until)) return false;
   await this.current(org, latest.payload, store);
   await store.put<ProductionOperation>({ organizationId: org, kind: 'editorial', id: operationId, expectedRevision: latest.revision,
    payload: { ...latest.payload, finalizing: { resultId, owner, until: lease() } }, sourceIds: latest.sourceIds }); return true;
  });
  if (!claimed) return { state: 'in_progress', production };
  try {
   const base = structuredClone(row.payload.videoBaseMaterial ?? row.payload.material), manifest = production.manifest;
   let at = 0;
   base.scenes = manifest.scenes.map((scene, index) => {
    const scenePlan = production.approval?.scenes.find(entry => entry.sceneId === scene.id), sceneJob = production.jobs.find(entry => entry.id === scenePlan?.jobId);
    const sceneResult = sceneJob?.result as Partial<MeasuredVideoResult> | undefined;
    const measured = sceneJob?.state === 'completed' && sceneResult?.metadata?.source === 'mp4_bytes' && /^[a-f0-9]{64}$/.test(sceneResult.metadata.sha256) ? sceneResult.durationSeconds : undefined;
    const seconds = Number.isFinite(measured) && measured! > 0 ? measured! : scene.durationSeconds;
    const result = { index: index + 1, startSeconds: at, endSeconds: at + seconds, spokenText: scene.script,
     visualIntent: scene.prompt || scene.title || base.scenes?.[index]?.visualIntent || scene.kind };
    at += seconds; return result;
   });
   base.script = manifest.scenes.map(scene => scene.script).filter(Boolean).join('\n\n');
   // A revised final replaces earlier video/caption outputs while retaining authored scenes and artwork.
   base.assets = base.assets.filter(asset => asset.kind !== 'video' && !(asset.kind === 'subtitle' && asset.role === 'captions'));
   const sourceIds = base.evidence.flatMap(e => e.sourceId ? [e.sourceId] : []);
   const provenance = { provider: job.provider, jobId: job.id, revision: `${production.id}:${production.revision}:${resultId}`, sourceIds };
   const finished: ProductionAssetV1[] = [{ id: media.id, mediaId: media.id, kind: 'video', mimeType: 'video/mp4', role: 'final',
    url: media.path, durationSeconds: duration, width: media.width, height: media.height,
    videoEvidence: { metadata: { source: 'mp4_bytes', sha256: media.metadata!.sha256 }, captions: { burned: captions.burned, sourceJobIds: [...captions.sourceJobIds] } }, provenance },
    ...subtitles.map((subtitle): ProductionAssetV1 => ({ id: subtitle.id, mediaId: subtitle.mediaId, kind: 'subtitle', mimeType: subtitle.mimeType, role: 'captions', url: subtitle.path,
     provenance: { ...provenance, revision: `${provenance.revision}:${subtitle.source}:${subtitle.sha256}:${subtitle.cueCount}` } }))];
   const checked = await this.editorial.finalizeVideo(org, base, finished);
   // Inspection is authoritative, including captions, aspect/metadata and actual duration.
   const state = checked.status === 'ready' && checked.inspection.complete ? 'ready' : 'needs_revision';
   const current = await this.current(org, row.payload);
   let material = checked.material;
   if (state === 'ready') material = await this.native.save(org, actorId, { campaignId: row.payload.campaignId, itemId: row.payload.itemId,
    requestId: `${operationId}-final-${production.id}-${production.revision}-${resultId}`, material, scheduledAt: current.item.scheduledAt, sourceAdmissions: row.payload.sourceAdmissions }, row.payload.baseInput.brief.language.startsWith('ru') ? 'ru' : 'en');
   const saved = await this.store.transact(async store => {
    const latest = await store.read<ProductionOperation>(org, 'editorial', operationId); requireValue(latest?.payload.finalizing?.owner === owner && latest.payload.productionId === production.id, 'CAMPAIGN_VIDEO_REVISION_CHANGED');
    const live = await this.current(org, latest.payload, store); await store.assertSourceAdmissions(org, latest.payload.sourceAdmissions);
    const item = await new CampaignService(store as SocialFactoryRepository).setMaterial(org, latest.payload.campaignId, latest.payload.itemId,
     { material, expectedContentRevision: live.item.contentRevision, editorialId: operationId, discoveryIds: [latest.payload.discoveryId] });
    if (state !== 'ready') {
     const record = await store.read<CampaignItemV1>(org, 'campaign_item', item.id); requireValue(record, 'CAMPAIGN_ITEM_SCOPE');
     await store.put({ organizationId: org, kind: 'campaign_item', id: item.id, expectedRevision: record.revision, payload: { ...record.payload, state: 'needs_input', blocker: { code: 'EDITORIAL_REVISION_REQUIRED', detail: JSON.stringify(checked.inspection.issues) } }, sourceIds: record.sourceIds });
    }
    return (await store.put<ProductionOperation>({ organizationId: org, kind: 'editorial', id: operationId, expectedRevision: latest.revision,
     payload: { ...latest.payload, state, material, nativeMaterial: state === 'ready' ? material : undefined, inspection: checked.inspection,
      finalizedResultId: resultId, finalizedRevision: production.revision, appliedContentRevision: item.contentRevision, finalizing: undefined }, sourceIds: latest.sourceIds })).payload;
   });
   if (state === 'ready') await this.autopublish(org, actorId, saved);
   return { state, material, inspection: checked.inspection };
  } catch (error) {
   const latest = await this.store.read<ProductionOperation>(org, 'editorial', operationId);
   if (latest?.payload.finalizing?.owner === owner) await this.store.put<ProductionOperation>({ organizationId: org, kind: 'editorial', id: operationId, expectedRevision: latest.revision,
    payload: { ...latest.payload, finalizing: undefined, blocker: code(error) }, sourceIds: latest.sourceIds });
   throw error;
  }
 }
}
