import { isPublicationConsentIdV1, readPublicationConsentV1 } from '../publishing/publication-consent.v1';
import { readDraftDestinationV1 } from '../draft-destination.v1';
import { Injectable } from '@nestjs/common';
import type { AutonomyDecisionV1, AutonomyGrantV1, CampaignItemV1, CampaignV1, EvidenceV1, SocialFactoryStoreV1 } from '../contracts/social-factory.v1';
import { SocialFactoryRepository, sourceRef } from '../social-factory.repository';
import { approvalDigest, digest, identity, mustRead, requireValue, validApproval, validInstant, validTimeZone } from '../campaign/domain';
import { assertGrantScope, GrantAction } from './grant-policy';
import type { SourceArtifactRefV1 } from '../contracts/source-artifact.v1';

export interface GrantInput extends Omit<AutonomyGrantV1, 'version' | 'id' | 'revokedAt'> {
  /** Set by an authenticated user route, never forwarded from model tool arguments. */
  authority: 'user'; requestId: string;
}
export interface AdmitActionInput {
  campaignId: string; itemId: string; requestId: string; action: GrantAction; expectedContentRevision: number;
  grantId?: string; actorId?: string; authority?: 'user' | 'agent'; approvalDigest?: string;
  provider?: string; payer?: string; cost?: { currency: string; maximum: number };
  requiredConsentId?: string; consentIds?: string[]; postId?: string; alsoRequire?: GrantAction[];
}
/** Private single-operation local QA authority; no flag permits production or remote resources. */
export function isLocalPreflightRecoveryAllowedV1(operationId:string,inputDigest:string){
  if(process.env.NODE_ENV!=='development'||process.env.CF_LOCAL_PREFLIGHT_RECOVERY_OPERATION!==operationId||process.env.CF_LOCAL_PREFLIGHT_RECOVERY_DIGEST!==inputDigest||!/^[a-f0-9]{64}$/.test(inputDigest??''))return false;
  const loopback=new Set(['localhost','127.0.0.1','[::1]']);
  try{
    const frontend=new URL(process.env.FRONTEND_URL??''),backend=new URL(process.env.BACKEND_INTERNAL_URL??''),database=new URL(process.env.DATABASE_URL??'');
    return [frontend,backend].every(url=>['http:','https:'].includes(url.protocol)&&loopback.has(url.hostname)&&!url.username&&!url.password)&&
      ['postgres:','postgresql:'].includes(database.protocol)&&loopback.has(database.hostname)&&[...database.searchParams.keys()].every(key=>['schema','connection_limit','pool_timeout','connect_timeout','sslmode'].includes(key));
  }catch{return false;}
}
export interface LocalPreflightFailureV1 {version:1;operationId:string;reason:'EDITORIAL_FORMAT_UNSUPPORTED';producerAttempted:false;previousBlocker:string;actorId:string;checkedAt:string;inputDigest:string}
export type ActionState = 'reserved' | 'submitting' | 'prepared' | 'published' | 'scheduled' | 'failed' | 'uncertain' | 'cancelled';
export interface ActionClaim extends AdmitActionInput {
  id: string; type: 'autonomy_action'; revision: number; state: ActionState; createdAt: string; execute: boolean;
  /** Server-captured campaign authority; callers cannot select a historical grant binding. */
  campaignAuthority?: { grantId: string | null; mode: CampaignV1['mode'] };
  receipt?: { provider: string; externalId: string; publishedAt?: string; url?: string };
  actualCost?: { currency: string; amount: number }; reason?: string; localPreflightFailure?:LocalPreflightFailureV1;
}
export interface ActionOutcome {
  state: Exclude<ActionState, 'reserved' | 'submitting'>;
  receipt?: ActionClaim['receipt']; postId?: string; reason?: string; actualCost?: ActionClaim['actualCost']; localPreflightFailure?:LocalPreflightFailureV1;
}
interface StoredGrant extends AutonomyGrantV1 { requestDigest: string }
interface ActionEvent extends Omit<ActionOutcome, 'state'> { type: 'autonomy_action_event'; sequence: number; at: string; state: Exclude<ActionState, 'reserved'> }
export interface DecisionInput extends Omit<AutonomyDecisionV1, 'version' | 'createdAt' | 'evidenceIds'> {
  requestId: string; authority: 'user' | 'agent'; grantId?: string; evidence: EvidenceV1[]; sourceArtifact?: SourceArtifactRefV1; expectedContentRevision?: number;
  /** Server-captured before the paid editorial call; rechecked before persisting its answer. */
  campaignAuthority?: ActionClaim['campaignAuthority'];
  factStatus: 'verified' | 'owner_asserted' | 'inferred' | 'unknown'; missingFacts?: string[];
}

@Injectable()
export class AutonomyService {
  constructor(private readonly repository: SocialFactoryRepository) {}
  async grant(organizationId: string, input: GrantInput): Promise<AutonomyGrantV1> {
    requireValue(input.authority === 'user' && input.actorId && input.requestId, 'AUTONOMY_USER_AUTHORITY_REQUIRED');
    requireValue(validInstant(input.expiresAt) && Date.parse(input.expiresAt) > Date.now(), 'AUTONOMY_GRANT_EXPIRY');
    requireValue(['prepare_approve', 'collaborative', 'autopilot'].includes(input.mode), 'AUTONOMY_INVALID_MODE');
    requireValue(Array.isArray(input.channelIds) && input.channelIds.length > 0 && input.channelIds.every(id => typeof id === 'string' && id.length > 0), 'AUTONOMY_CHANNEL_SCOPE');
    requireValue(Array.isArray(input.actions) && input.actions.length > 0 && input.actions.every(action => ['prepare', 'editorial_decide', 'schedule', 'publish', 'generate_paid'].includes(action)), 'AUTONOMY_ACTION_SCOPE');
    requireValue(Array.isArray(input.platformConsentIds) && input.platformConsentIds.every(id => typeof id === 'string' && !!id), 'AUTONOMY_CONSENT_INVALID');
    requireValue(!input.formats || input.formats.length > 0 && input.formats.every(format => ['post', 'thread', 'carousel', 'story', 'reel', 'short', 'long_video'].includes(format)), 'AUTONOMY_FORMAT_SCOPE');
    requireValue(!input.exclusions || input.exclusions.every(term => typeof term === 'string' && term.trim().length > 0), 'AUTONOMY_EXCLUSIONS_INVALID');
    if (input.timeZone) requireValue(validTimeZone(input.timeZone), 'AUTONOMY_INVALID_TIMEZONE');
    if (input.postingWindows?.length) {
      requireValue(input.timeZone && validTimeZone(input.timeZone), 'AUTONOMY_WINDOW_TIMEZONE');
      for (const window of input.postingWindows) requireValue(Array.isArray(window.daysOfWeek) && window.daysOfWeek.length > 0 && window.daysOfWeek.every(day => Number.isInteger(day) && day >= 0 && day <= 6) && /^([01]\d|2[0-3]):[0-5]\d$/.test(window.start) && /^([01]\d|2[0-3]):[0-5]\d$/.test(window.end) && window.start < window.end, 'AUTONOMY_WINDOW_INVALID');
    }
    for (const budget of [input.budget, input.providerBudget]) if (budget) requireValue(/^[A-Z]{3}$/.test(budget.currency) && Number.isFinite(budget.maximum) && budget.maximum >= 0, 'AUTONOMY_BUDGET_INVALID');
    if (input.providerBudget) requireValue(input.providerBudget.provider && input.providerBudget.payer, 'AUTONOMY_PAYER_REQUIRED');
    const id = identity('grant', organizationId, input.actorId, input.requestId);
    const requestDigest = digest(input);
    return this.repository.transact(async store => {
      const existing = await store.read<StoredGrant>(organizationId, 'grant', id);
      if (existing) {
        requireValue(existing.payload.requestDigest === requestDigest, 'AUTONOMY_IDEMPOTENCY_CONFLICT');
        return existing.payload;
      }
      if (input.campaignId) await mustRead<CampaignV1>(store, organizationId, 'campaign', input.campaignId);
      const { authority, requestId, ...fields } = input;
      const grant: StoredGrant = { ...structuredClone(fields), version: 1, id, requestDigest };
      return (await store.put({ organizationId, kind: 'grant', id, payload: grant, parentId: input.campaignId, expectedRevision: 0 })).payload;
    });
  }
  async revoke(organizationId: string, grantId: string, actorId: string): Promise<AutonomyGrantV1> {
    requireValue(actorId, 'AUTONOMY_USER_AUTHORITY_REQUIRED');
    return this.repository.transact(async store => {
      const record = await mustRead<AutonomyGrantV1>(store, organizationId, 'grant', grantId);
      if (record.payload.revokedAt) return record.payload;
      record.payload.revokedAt = new Date().toISOString();
      // Queued claims are checked again at execution. In-flight provider work remains reconcilable.
      return (await store.put({ organizationId, kind: 'grant', id: grantId, payload: record.payload, expectedRevision: record.revision })).payload;
    });
  }
  async getGrant(organizationId: string, grantId: string): Promise<AutonomyGrantV1> {
    return (await mustRead<AutonomyGrantV1>(this.repository, organizationId, 'grant', grantId)).payload;
  }
  /** No certified monetary quote exists for these preparation routes. Count admission is not a budget reservation.
   * Callers check current authority separately and supply server-resolved billing providers, never model names.
   * An unknown provider/payer cannot prove exemption from a provider cap; an explicitly different provider can.
   */
  async assertUnpricedPreparationAllowed(organizationId: string, grantId: string | undefined,
    billingProviders: () => Promise<readonly (string | undefined)[]>): Promise<void> {
    if (!grantId) return;
    const grant = await this.getGrant(organizationId, grantId);
    if (!grant.budget && !grant.providerBudget) return;
    const providers = await billingProviders();
    const cappedProvider = grant.providerBudget?.provider.trim().toLowerCase();
    const applies = providers.length > 0 && (grant.budget || grant.providerBudget && providers.some(provider =>
      !provider?.trim() || provider.trim().toLowerCase() === cappedProvider));
    requireValue(!applies, 'AUTONOMY_COST_ESTIMATE_UNAVAILABLE',
      'A supported maximum cost estimate is unavailable for this paid preparation step. The request was not dispatched; the budget limit is preserved. The service must supply a certified estimate before this step can run.');
  }
  async decide(organizationId: string, input: DecisionInput): Promise<AutonomyDecisionV1> {
    requireValue(input.actorId && input.requestId && input.question?.trim(), 'AUTONOMY_DECISION_INVALID');
    requireValue(['editorial', 'missing_fact', 'rights', 'budget', 'permission'].includes(input.kind) && ['verified', 'owner_asserted', 'inferred', 'unknown'].includes(input.factStatus), 'AUTONOMY_DECISION_INVALID');
    requireValue(Array.isArray(input.evidence), 'AUTONOMY_EVIDENCE_REQUIRED');
    for (const evidence of input.evidence) requireValue(evidence.id && evidence.source && validInstant(evidence.capturedAt) && (!evidence.expiresAt || Date.parse(evidence.expiresAt) > Date.now()), 'AUTONOMY_EVIDENCE_INVALID');
    if (input.factStatus === 'owner_asserted' && input.authority !== 'user') requireValue(input.evidence.some(e => e.factStatus === 'owner_asserted' && e.rights === 'permitted' && ['first_party', 'upload'].includes(e.access)), 'AUTONOMY_OWNER_ASSERTION_MISSING');
    if (input.factStatus === 'verified') requireValue(input.evidence.length > 0 && input.evidence.every(e => e.factStatus === 'verified' && e.rights === 'permitted'), 'AUTONOMY_FACT_UNVERIFIED');
    if (input.factStatus === 'unknown' || input.kind === 'missing_fact') requireValue(!input.answer && !!input.missingFacts?.length, 'AUTONOMY_MISSING_FACT_CANNOT_BE_INVENTED');
    return this.repository.transact(async store => {
      const id = identity('decision', organizationId, input.actorId, input.requestId);
      const existing = await store.read<AutonomyDecisionV1 & { requestDigest: string }>(organizationId, 'decision', id);
      if (existing) { requireValue(existing.payload.requestDigest === digest(input), 'AUTONOMY_IDEMPOTENCY_CONFLICT'); return existing.payload; }
      const campaign = (await mustRead<CampaignV1>(store, organizationId, 'campaign', input.campaignId)).payload;
      const item = input.itemId ? await mustRead<CampaignItemV1>(store, organizationId, 'campaign_item', input.itemId) : undefined;
      requireValue(campaign.state === 'active' && (!item || item.payload.campaignId === campaign.id), 'AUTONOMY_CAMPAIGN_SCOPE');
      if (input.expectedContentRevision !== undefined) requireValue(item?.payload.contentRevision === input.expectedContentRevision, 'AUTONOMY_EDITORIAL_CONTEXT_CHANGED');
      if (input.authority !== 'user') {
        const grantId = input.grantId ?? campaign.grantId;
        requireValue(grantId, 'AUTONOMY_GRANT_REQUIRED');
        requireValue(!campaign.grantId || grantId === campaign.grantId, 'AUTONOMY_GRANT_SUPERSEDED');
        if (input.campaignAuthority) requireValue(input.campaignAuthority.grantId === (campaign.grantId ?? null) && input.campaignAuthority.mode === campaign.mode, 'AUTONOMY_GRANT_SUPERSEDED');
        const grant = (await mustRead<AutonomyGrantV1>(store, organizationId, 'grant', grantId)).payload;
        assertGrantScope(grant, campaign, item?.payload, 'editorial_decide');
        requireValue(input.kind === 'editorial' || !input.answer, 'AUTONOMY_CANNOT_SELF_AUTHORIZE');
      }
      const decision = { version: 1 as const, campaignId: input.campaignId, ...(input.itemId ? { itemId: input.itemId } : {}), kind: input.kind,
        question: input.question, ...(input.answer ? { answer: input.answer } : {}), evidenceIds: input.evidence.map(e => e.id), evidence: structuredClone(input.evidence),
        factStatus: input.factStatus, missingFacts: input.missingFacts ?? [], ...(input.model ? { model: input.model } : {}), ...(input.sourceArtifact ? {sourceArtifact: structuredClone(input.sourceArtifact)} : {}), ...(input.campaignAuthority ? { campaignAuthority: input.campaignAuthority } : {}), actorId: input.actorId,
        createdAt: new Date().toISOString(), requestDigest: digest(input) };
      await store.put({ organizationId, kind: 'decision', id, parentId: campaign.id, payload: decision, sourceIds: input.evidence.flatMap(e => e.sourceId ? [sourceRef(e.sourceId)] : []), expectedRevision: 0 });
      if (item && (input.kind === 'missing_fact' || input.factStatus === 'unknown') && !['published', 'submitting', 'uncertain', 'cancelled'].includes(item.payload.state)) {
        item.payload.state = 'needs_input'; delete item.payload.approval;
        item.payload.blocker = { code: 'MISSING_FACT', detail: input.missingFacts!.join('; ') };
        await store.put({ organizationId, kind: 'campaign_item', id: item.id, payload: item.payload, expectedRevision: item.revision });
      }
      return decision;
    });
  }
  async admit(organizationId: string, input: AdmitActionInput): Promise<ActionClaim> {
    requireValue(input.requestId && input.campaignId && input.itemId, 'AUTONOMY_ACTION_IDENTITY');
    requireValue(!input.alsoRequire || input.alsoRequire.every(action => ['prepare', 'editorial_decide', 'schedule', 'publish', 'generate_paid'].includes(action)), 'AUTONOMY_ACTION_SCOPE');
    requireValue(['prepare', 'editorial_decide', 'schedule', 'publish', 'generate_paid'].includes(input.action), 'AUTONOMY_ACTION_SCOPE');
    const id = identity('claim', organizationId, input.campaignId, input.itemId, input.requestId);
    return this.repository.transact(async store => {
      const existing = await store.read<ActionClaim & { requestDigest: string }>(organizationId, 'action', id);
      if (existing) {
        requireValue(existing.payload.requestDigest === digest(input), 'AUTONOMY_IDEMPOTENCY_CONFLICT');
        return this.actionState(store, organizationId, existing.payload);
      }
      const campaign = (await mustRead<CampaignV1>(store, organizationId, 'campaign', input.campaignId)).payload;
      const itemRecord = await mustRead<CampaignItemV1>(store, organizationId, 'campaign_item', input.itemId);
      const item = itemRecord.payload;
      requireValue(!['submitting', 'uncertain', 'published', 'cancelled'].includes(item.state), 'AUTONOMY_ITEM_LOCKED');
      if (item.actionId) {
        const prior = await this.actionState(store, organizationId, (await mustRead<ActionClaim>(store, organizationId, 'action', item.actionId)).payload);
        requireValue(!['reserved', 'submitting', 'uncertain'].includes(prior.state), 'AUTONOMY_ACTION_PENDING');
      }
      const claim: ActionClaim & { requestDigest: string } = { ...structuredClone(input), grantId: input.grantId ?? campaign.grantId,
        authority: input.authority ?? 'agent', campaignAuthority: { grantId: campaign.grantId ?? null, mode: campaign.mode }, id, type: 'autonomy_action', revision: item.contentRevision,
        state: 'reserved', execute: false, createdAt: new Date().toISOString(), requestDigest: digest(input) };
      await this.authorize(store, organizationId, campaign, item, claim);
      await this.checkBudget(store, organizationId, claim);
      await store.put({ organizationId, kind: 'action', id, parentId: claim.grantId ?? campaign.id, payload: claim, expectedRevision: 0 });
      item.actionId = id;
      if (input.action === 'prepare' || input.action === 'generate_paid') item.state = 'preparing';
      await store.put({ organizationId, kind: 'campaign_item', id: item.id, payload: item, expectedRevision: itemRecord.revision });
      return claim;
    });
  }
  async bindPost(organizationId: string, actionId: string, input: { postId: string; scheduled?: boolean }): Promise<CampaignItemV1> {
    requireValue(input.postId, 'AUTONOMY_POST_REQUIRED');
    return this.repository.transact(async store => {
      const claim = await this.actionState(store, organizationId, (await mustRead<ActionClaim>(store, organizationId, 'action', actionId)).payload);
      requireValue(claim.action === 'publish', 'AUTONOMY_INVALID_TRANSITION');
      const item = await mustRead<CampaignItemV1>(store, organizationId, 'campaign_item', claim.itemId);
      requireValue(item.payload.actionId === actionId && item.payload.contentRevision === claim.revision, 'AUTONOMY_ACTION_SUPERSEDED');
      if (['submitting', 'published', 'uncertain'].includes(claim.state) && item.payload.postId === input.postId) return item.payload;
      requireValue(claim.state === 'reserved', 'AUTONOMY_INVALID_TRANSITION');
      requireValue(!item.payload.postId || item.payload.postId === input.postId, 'AUTONOMY_POST_CONFLICT');
      item.payload.postId = input.postId;
      const campaign = (await mustRead<CampaignV1>(store, organizationId, 'campaign', claim.campaignId)).payload;
      await this.authorize(store, organizationId, campaign, item.payload, claim);
      if (input.scheduled) item.payload.state = 'scheduled';
      return (await store.put({ organizationId, kind: 'campaign_item', id: item.id, payload: item.payload, expectedRevision: item.revision })).payload;
    });
  }
  async getAction(organizationId: string, actionId: string): Promise<ActionClaim> {
    return this.actionState(this.repository, organizationId, (await mustRead<ActionClaim>(this.repository, organizationId, 'action', actionId)).payload);
  }
  async findActionForPost(organizationId: string, postId: string): Promise<ActionClaim | null> {
    const items = await this.repository.list<CampaignItemV1>(organizationId, 'campaign_item');
    const item = items.find(entry => entry.payload.postId === postId)?.payload;
    return item?.actionId ? this.getAction(organizationId, item.actionId) : null;
  }
  async markSubmitting(organizationId: string, actionId: string): Promise<ActionClaim> {
    return this.repository.transact(async store => {
      const claim = await this.actionState(store, organizationId, (await mustRead<ActionClaim>(store, organizationId, 'action', actionId)).payload);
      if (claim.state !== 'reserved') return { ...claim, execute: false };
      const campaign = (await mustRead<CampaignV1>(store, organizationId, 'campaign', claim.campaignId)).payload;
      const item = await mustRead<CampaignItemV1>(store, organizationId, 'campaign_item', claim.itemId);
      requireValue(item.payload.actionId === actionId, 'AUTONOMY_ACTION_SUPERSEDED');
      await this.authorize(store, organizationId, campaign, item.payload, claim, 'execute');
      await this.event(store, organizationId, claim, { state: 'submitting' });
      item.payload.state = 'submitting';
      await store.put({ organizationId, kind: 'campaign_item', id: item.id, payload: item.payload, expectedRevision: item.revision });
      return { ...claim, state: 'submitting', execute: true };
    });
  }
  /** Recheck an already claimed multi-part submission before the next native part.
   * The publisher retains per-part idempotency in its native receipt journal.
   */
  async assertSubmitting(organizationId: string, actionId: string): Promise<ActionClaim> {
    return this.repository.transact(async store => {
      const claim = await this.actionState(store, organizationId, (await mustRead<ActionClaim>(store, organizationId, 'action', actionId)).payload);
      if (claim.state !== 'submitting') return { ...claim, execute: false };
      const campaign = (await mustRead<CampaignV1>(store, organizationId, 'campaign', claim.campaignId)).payload;
      const item = (await mustRead<CampaignItemV1>(store, organizationId, 'campaign_item', claim.itemId)).payload;
      requireValue(item.actionId === actionId, 'AUTONOMY_ACTION_SUPERSEDED');
      await this.authorize(store, organizationId, campaign, item, claim, 'execute');
      return { ...claim, execute: true };
    });
  }
  async settle(organizationId: string, actionId: string, outcome: ActionOutcome): Promise<ActionClaim> {
    return this.finish(organizationId, actionId, outcome, false);
  }
  /** Only call with a real provider reconciliation result. An uncertain submission never becomes a fresh claim. */
  async reconcile(organizationId: string, actionId: string, outcome: ActionOutcome): Promise<ActionClaim> {
    return this.finish(organizationId, actionId, outcome, true);
  }
  /** Same read-only eligibility guard is used by the native offer and by the writer transaction. */
  private async localPreflightCandidate(store:SocialFactoryStoreV1,org:string,actorId:string,operationId:string,expectedContentRevision:number){
      const row=await store.read<any>(org,'editorial',operationId),op=row?.payload;
      requireValue(isLocalPreflightRecoveryAllowedV1(operationId,op?.inputDigest) && op?.productionPreflightVersion===undefined && op?.primaryProducerAttempt===undefined && op?.version===2 && op.state==='uncertain' && op.blocker==='Unsupported editorial format: instagram/post' &&
        op.baseInput?.format==='post' && op.baseInput.profile?.platform==='instagram' && op.baseInput.actorId===actorId &&
        op.baseInput.organizationId===org && op.baseInput.destination?.kind==='draft' && op.baseInput.destination.publishable===false &&
        op.baseInput.destination.id===op.baseInput.profile.channelId && !op.owner && !op.leaseUntil &&
        op.output===undefined && op.sourceDigest===undefined && op.outputSourceDigest===undefined && !op.producerStatus && !op.inspection && !op.videoBaseMaterial && !op.material && !op.nativeMaterial && !op.partialAssets && !op.unregisteredAsset && !op.productionId && !op.localReel &&
        op.appliedContentRevision===undefined && op.sourceContentRevision===expectedContentRevision,'AUTONOMY_LOCAL_PREFLIGHT_RECONCILIATION_DENIED');
      const campaign=await mustRead<CampaignV1>(store,org,'campaign',op.campaignId);
      requireValue(campaign.payload.state==='active' && campaign.payload.mode===op.campaignAuthority?.mode && campaign.payload.grantId===op.campaignAuthority?.grantId,'AUTONOMY_LOCAL_PREFLIGHT_RECONCILIATION_DENIED');
      const claim=await this.actionState(store,org,(await mustRead<ActionClaim>(store,org,'action',op.actionId)).payload);
      const item=await mustRead<CampaignItemV1>(store,org,'campaign_item',op.itemId);
      if(campaign.payload.grantId)assertGrantScope((await mustRead<AutonomyGrantV1>(store,org,'grant',campaign.payload.grantId)).payload,campaign.payload,item.payload,'prepare');
      const target=await store.read<any>(org,'draft_destination',op.baseInput.destination.id);
      requireValue(target,'AUTONOMY_LOCAL_PREFLIGHT_RECONCILIATION_DENIED');
      const destination=readDraftDestinationV1(target.payload,op.baseInput.destination.id);
      requireValue(destination.actorId===actorId && destination.platform==='instagram' && claim.state==='uncertain' && claim.action==='prepare' &&
        claim.actorId===actorId && !claim.provider && !claim.receipt && claim.campaignId===op.campaignId && claim.itemId===op.itemId && claim.revision===expectedContentRevision &&
        item.payload.campaignId===op.campaignId && item.payload.state==='uncertain' && item.payload.actionId===op.actionId && item.payload.contentRevision===expectedContentRevision &&
        item.payload.destination?.kind==='draft' && item.payload.destination.id===destination.id && item.payload.destination.publishable===false,
        'AUTONOMY_LOCAL_PREFLIGHT_RECONCILIATION_DENIED');
      return op;
  }
  /** An offer, not a reconciliation: no event, claim, item or operation is written here. */
  async localPreflightContinuation(org:string,actorId:string,operationId:string,expectedContentRevision:number){
    try{
      const op=await this.localPreflightCandidate(this.repository,org,actorId,operationId,expectedContentRevision),base=op.baseInput;
      return {kind:'local_preflight' as const,reason:'EDITORIAL_FORMAT_UNSUPPORTED' as const,primaryProducerAttempted:false as const,nextAction:'campaign.prepare' as const,expectedContentRevision,
        detail:'The historical uncertainty came from a verified local rejection before primary admission. Continue the same saved operation with nextAction and input; the write rechecks the proof.',
        input:{campaignId:op.campaignId,requestId:op.id,instruction:base.brief.instruction,itemIds:[op.itemId],sourceIds:base.sourceIds,visuals:base.visuals,
          itemOverrides:{[op.itemId]:{instruction:base.brief.instruction,language:base.brief.language,lengthChoiceId:base.brief.lengthChoiceId,
            lengthGuidance:base.brief.lengthGuidance,targetSeconds:base.brief.targetSeconds,...(base.sourceArtifact?{sourceArtifact:base.sourceArtifact.ref}:{})}}}};
    }catch{return null;}
  }
  /** Exact legacy local rejection before primary producer admission; never a provider receipt or unknown-output reset. */
  async reconcileLocalPreflightFailure(org:string,actorId:string,operationId:string,expectedContentRevision:number):Promise<LocalPreflightFailureV1>{
    return this.repository.transact(async store=>{
      const op=await this.localPreflightCandidate(store,org,actorId,operationId,expectedContentRevision);
      const proof:LocalPreflightFailureV1={version:1,operationId,reason:'EDITORIAL_FORMAT_UNSUPPORTED',producerAttempted:false,previousBlocker:op.blocker,actorId,checkedAt:new Date().toISOString(),inputDigest:op.inputDigest};
      await new AutonomyService(store as SocialFactoryRepository).finish(org,op.actionId,{state:'failed',reason:'EDITORIAL_FORMAT_UNSUPPORTED: primary producer admission was not reached.',localPreflightFailure:proof},true);
      return proof;
    });
  }
  private async finish(org: string, actionId: string, outcome: ActionOutcome, reconciliation: boolean): Promise<ActionClaim> {
    requireValue(['prepared', 'published', 'scheduled', 'failed', 'uncertain', 'cancelled'].includes(outcome.state), 'AUTONOMY_OUTCOME_INVALID');
    if (outcome.state === 'published') requireValue(outcome.receipt?.provider && outcome.receipt.externalId, 'AUTONOMY_PROVIDER_RECEIPT_REQUIRED');
    if (outcome.receipt?.publishedAt) requireValue(validInstant(outcome.receipt.publishedAt), 'AUTONOMY_RECEIPT_INVALID');
    if (outcome.actualCost) requireValue(/^[A-Z]{3}$/.test(outcome.actualCost.currency) && Number.isFinite(outcome.actualCost.amount) && outcome.actualCost.amount >= 0, 'AUTONOMY_COST_INVALID');
    return this.repository.transact(async store => {
      const claim = await this.actionState(store, org, (await mustRead<ActionClaim>(store, org, 'action', actionId)).payload);
      if (claim.state === outcome.state && claim.state !== 'uncertain') {
        requireValue(!outcome.receipt || digest(claim.receipt) === digest(outcome.receipt), 'AUTONOMY_RECEIPT_CONFLICT');
        return claim;
      }
      requireValue(claim.state === 'submitting' || claim.state === 'reserved' && ['cancelled', 'failed'].includes(outcome.state) || claim.state === 'uncertain' && reconciliation && ['published', 'prepared', 'failed', 'cancelled'].includes(outcome.state), 'AUTONOMY_INVALID_TRANSITION');
      requireValue(outcome.state !== 'prepared' || ['prepare', 'generate_paid', 'editorial_decide'].includes(claim.action), 'AUTONOMY_INVALID_TRANSITION');
      requireValue(outcome.state !== 'published' || claim.action === 'publish', 'AUTONOMY_INVALID_TRANSITION');
      requireValue(outcome.state !== 'scheduled' || claim.action === 'schedule', 'AUTONOMY_INVALID_TRANSITION');
      if (outcome.receipt && claim.provider) requireValue(outcome.receipt.provider === claim.provider, 'AUTONOMY_PROVIDER_MISMATCH');
      if (outcome.actualCost && !claim.cost) requireValue(outcome.actualCost.amount === 0, 'AUTONOMY_UNRESERVED_COST');
      if (outcome.actualCost && claim.cost) requireValue(outcome.actualCost.currency === claim.cost.currency, 'AUTONOMY_CURRENCY_MISMATCH');
      await this.event(store, org, claim, outcome);
      const item = await store.read<CampaignItemV1>(org, 'campaign_item', claim.itemId);
      if (item?.payload.actionId === actionId) {
        const sameRevision = item.payload.contentRevision === claim.revision;
        // A provider receipt describes the submitted revision, even if its source was revoked in flight.
        // Keep the replacement revision blocked; the immutable action retains the historical outcome.
        item.payload.state = sameRevision ? (outcome.state === 'prepared' ? 'ready' : outcome.state) : (outcome.state === 'uncertain' ? 'uncertain' : 'needs_input');
        if (outcome.postId) item.payload.postId = outcome.postId;
        if (outcome.state === 'published') item.payload.publication = { provider: outcome.receipt!.provider, externalId: outcome.receipt!.externalId,
          ...(outcome.receipt!.url ? { url: outcome.receipt!.url } : {}), publishedAt: outcome.receipt!.publishedAt ?? new Date().toISOString(), revision: claim.revision };
        if (outcome.reason && sameRevision) item.payload.blocker = { code: outcome.state.toUpperCase(), detail: outcome.reason };
        await store.put({ organizationId: org, kind: 'campaign_item', id: item.id, payload: item.payload, expectedRevision: item.revision });
      }
      return { ...claim, ...structuredClone(outcome), execute: false };
    });
  }
  private async authorize(store: SocialFactoryStoreV1, org: string, campaign: CampaignV1, item: CampaignItemV1, claim: ActionClaim, phase: 'reserve' | 'execute' = 'reserve') {
    requireValue(campaign.state === 'active' && item.campaignId === campaign.id && !['published', 'cancelled', 'uncertain'].includes(item.state), 'AUTONOMY_CAMPAIGN_INACTIVE');
    requireValue(claim.expectedContentRevision === item.contentRevision && claim.revision === item.contentRevision, 'CAMPAIGN_REVISION_CONFLICT');
    requireValue(!item.blocker, 'AUTONOMY_ITEM_BLOCKED');
    const grantGoverned = claim.authority !== 'user' || claim.action === 'generate_paid' || (claim.cost?.maximum ?? 0) > 0;
    if (grantGoverned) {
      // A campaign's current grant is authoritative. Explicit per-action grants remain
      // usable when no campaign grant exists, but cannot override a replacement.
      requireValue(!campaign.grantId || claim.grantId === campaign.grantId, 'AUTONOMY_GRANT_SUPERSEDED');
      if (claim.campaignAuthority) {
        requireValue(claim.campaignAuthority.grantId === (campaign.grantId ?? null) && claim.campaignAuthority.mode === campaign.mode, 'AUTONOMY_GRANT_SUPERSEDED');
      } else {
        // Legacy reservations without a binding fail closed unless their grant is current.
        requireValue(claim.grantId === campaign.grantId, 'AUTONOMY_GRANT_SUPERSEDED');
      }
    }
    if (claim.action === 'publish' || claim.action === 'schedule') {
      requireValue(item.material, 'CAMPAIGN_MATERIAL_REQUIRED');
      requireValue(item.material.evidence.every(e => e.rights === 'permitted' && !e.revokedAt && (!e.expiresAt || Date.parse(e.expiresAt) > Date.now()) && (!e.consentExpiresAt || Date.parse(e.consentExpiresAt) > Date.now())), 'AUTONOMY_RIGHTS_MISSING');
      if (campaign.mode !== 'autopilot' || claim.authority === 'user') requireValue(validApproval(item) && (!claim.approvalDigest || claim.approvalDigest === approvalDigest(item)), 'CAMPAIGN_APPROVAL_REQUIRED');
    }
    if (claim.authority === 'user') requireValue(claim.actorId, 'AUTONOMY_USER_AUTHORITY_REQUIRED');
    const perItemConsent = isPublicationConsentIdV1(claim.requiredConsentId);
    if (perItemConsent) requireValue(await readPublicationConsentV1(store, org, item, claim), 'AUTONOMY_PLATFORM_CONSENT_REQUIRED');
    const needsGrant = claim.authority !== 'user' && !(claim.action === 'prepare' && campaign.mode === 'prepare_approve') || claim.action === 'generate_paid';
    if (claim.grantId || needsGrant) {
      requireValue(claim.grantId, 'AUTONOMY_GRANT_REQUIRED');
      const grant = (await mustRead<AutonomyGrantV1>(store, org, 'grant', claim.grantId)).payload;
      const plannedPublish = phase === 'reserve' && claim.action === 'publish' && claim.alsoRequire?.includes('schedule') ? new Date(item.scheduledAt) : undefined;
      assertGrantScope(grant, campaign, item, claim.action, new Date(), plannedPublish);
      for (const action of claim.alsoRequire ?? []) assertGrantScope(grant, campaign, item, action);
      if (claim.requiredConsentId && !perItemConsent) requireValue(grant.platformConsentIds.includes(claim.requiredConsentId), 'AUTONOMY_PLATFORM_CONSENT_REQUIRED');
    } else if (claim.requiredConsentId && !perItemConsent) requireValue(claim.consentIds?.includes(claim.requiredConsentId), 'AUTONOMY_PLATFORM_CONSENT_REQUIRED');
    if (claim.grantId) {
      const grant = (await mustRead<AutonomyGrantV1>(store, org, 'grant', claim.grantId)).payload;
      if (grant.exclusions?.length && item.material) requireValue(!grant.exclusions.some(term => JSON.stringify(item.material).toLocaleLowerCase().includes(term.toLocaleLowerCase())), 'AUTONOMY_EXCLUDED_CONTENT');
    }
    if (claim.action === 'generate_paid') requireValue(claim.cost && claim.provider && claim.payer, 'AUTONOMY_PAID_ESTIMATE_REQUIRED');
    if (claim.cost) requireValue(Number.isFinite(claim.cost.maximum) && claim.cost.maximum >= 0 && /^[A-Z]{3}$/.test(claim.cost.currency), 'AUTONOMY_COST_INVALID');
  }
  private async checkBudget(store: SocialFactoryStoreV1, org: string, claim: ActionClaim) {
    if (!claim.cost) return;
    if (!claim.grantId && claim.cost.maximum === 0) return;
    requireValue(claim.grantId, 'AUTONOMY_BUDGET_GRANT_REQUIRED');
    const grant = (await mustRead<AutonomyGrantV1>(store, org, 'grant', claim.grantId)).payload;
    requireValue(claim.cost.maximum === 0 || grant.budget || grant.providerBudget, 'AUTONOMY_BUDGET_REQUIRED');
    let total = 0; let providerTotal = 0;
    for (const record of await store.list<ActionClaim>(org, 'action', 10000, claim.grantId)) {
      if (record.payload.type !== 'autonomy_action' || !record.payload.cost) continue;
      const action = await this.actionState(store, org, record.payload);
      const amount = action.actualCost?.amount ?? (['failed', 'cancelled'].includes(action.state) ? 0 : action.cost!.maximum);
      if (action.cost!.currency === claim.cost.currency) total += amount;
      if (action.provider === claim.provider && action.payer === claim.payer && action.cost!.currency === claim.cost.currency) providerTotal += amount;
    }
    if (grant.budget) requireValue(grant.budget.currency === claim.cost.currency && total + claim.cost.maximum <= grant.budget.maximum, 'AUTONOMY_BUDGET_EXCEEDED');
    if (grant.providerBudget) requireValue(grant.providerBudget.provider === claim.provider && grant.providerBudget.payer === claim.payer && grant.providerBudget.currency === claim.cost.currency && providerTotal + claim.cost.maximum <= grant.providerBudget.maximum, 'AUTONOMY_PROVIDER_BUDGET_EXCEEDED');
  }
  private async actionState(store: SocialFactoryStoreV1, org: string, action: ActionClaim): Promise<ActionClaim> {
    requireValue(action.type === 'autonomy_action', 'AUTONOMY_ACTION_INVALID');
    const events = await store.list<ActionEvent>(org, 'action', 1000, action.id);
    const ordered = events.map(row => row.payload).filter(event => event.type === 'autonomy_action_event').sort((a, b) => a.sequence - b.sequence);
    return { ...action, ...Object.assign({}, ...ordered), type: 'autonomy_action', execute: false };
  }
  private async event(store: SocialFactoryStoreV1, org: string, claim: ActionClaim, outcome: { state: Exclude<ActionState, 'reserved'> } & Omit<ActionOutcome, 'state'>) {
    const events = await store.list<ActionEvent>(org, 'action', 1000, claim.id);
    const sequence = Math.max(0, ...events.map(row => row.payload.sequence ?? 0)) + 1;
    await store.put({ organizationId: org, kind: 'action', id: identity('actionevent', claim.id, String(sequence)), parentId: claim.id,
      payload: { ...structuredClone(outcome), type: 'autonomy_action_event', sequence, at: new Date().toISOString() }, expectedRevision: 0 });
  }
}
