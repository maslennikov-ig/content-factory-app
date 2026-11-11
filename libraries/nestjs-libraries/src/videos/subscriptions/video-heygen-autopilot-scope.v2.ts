import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { SocialFactoryRepository } from '../../content-intelligence/social-factory/social-factory.repository';
import { VideoSubscriptionRepository } from '../../database/prisma/video-subscription/video-subscription.repository';
import { subscriptionHash } from './video-provider-registry';
import { parseVideoV1, videoErrorV1 } from '../video-brief.v1';

const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const HeygenAutopilotScopeInputV2 = z.object({
  id: z.string().uuid(), connectionId: z.string().uuid(), profileId: z.string().uuid(),
  profileRevision: z.number().int().positive(), profileDigest: digest,
  pieceId: z.string().uuid(), sourceRevision: z.string().min(1).max(200),
  maxJobs: z.number().int().min(1).max(5), expiresAt: z.string().datetime(),
  unknownDebitAcknowledged: z.literal(true),
  maxExpertCalls: z.number().int().min(0).max(3),
}).strict();
type ScopeInput = z.infer<typeof HeygenAutopilotScopeInputV2>;
type Claim = {preflightId: string; recipeHash: string; intentId: string; claimedAt: string};
export type HeygenAutopilotScopeV2 = ScopeInput & {
  kind: 'heygen_autopilot_scope_v2'; actorId: string; threadId: string; subjectDigest: string;
  humanDecisionId: string; createdAt: string; claims: Claim[]; expertAttempts: string[]; stoppedAt?: string;
};
const KIND = 'heygen_video_scope' as const;
const intent = (scopeId: string, preflightId: string) => {
  const h = createHash('sha256').update(`heygen-scoped-launch:v2:${scopeId}:${preflightId}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

/** A bounded human authorization in the shared store, separate from the chat-mode preference. */
@Injectable()
export class HeygenAutopilotScopeServiceV2 {
  constructor(readonly store: SocialFactoryRepository, readonly membership: VideoSubscriptionRepository) {}

  async authorize(org: string, actor: string, threadId: string, raw: unknown,
    decision: {id: string; subjectDigest: string; now: Date}) {
    await this.membership.member(org, actor);
    const input = parseVideoV1(HeygenAutopilotScopeInputV2, raw);
    if (!threadId || !decision.id || !digest.safeParse(decision.subjectDigest).success ||
      Date.parse(input.expiresAt) <= decision.now.getTime() || Date.parse(input.expiresAt) > decision.now.getTime() + 86_400_000)
      return videoErrorV1('VIDEO_AUTOPILOT_SCOPE_INVALID', 409);
    return this.store.transact(async store => {
      const existing = await store.read<HeygenAutopilotScopeV2>(org, KIND, input.id);
      if (existing) {
        const {kind, actorId, threadId: savedThread, subjectDigest, humanDecisionId, createdAt, claims, expertAttempts, ...saved} = existing.payload;
        if (actorId !== actor || savedThread !== threadId || subjectDigest !== decision.subjectDigest ||
          subscriptionHash(saved) !== subscriptionHash(input)) return videoErrorV1('VIDEO_AUTOPILOT_SCOPE_CONFLICT', 409);
        return this.view(existing.payload);
      }
      const payload: HeygenAutopilotScopeV2 = {...input, kind: 'heygen_autopilot_scope_v2', actorId: actor, threadId,
        subjectDigest: decision.subjectDigest, humanDecisionId: decision.id, createdAt: decision.now.toISOString(), claims: [], expertAttempts: []};
      await store.put({organizationId: org, kind: KIND, id: input.id, expectedRevision: 0, payload, parentId: threadId,
        expiresAt: new Date(input.expiresAt), sourceIds: [`resource:heygen_person_profile:${input.profileId}`]});
      return this.view(payload);
    });
  }

  private view(scope: HeygenAutopilotScopeV2) {
    const {subjectDigest, humanDecisionId, actorId, ...safe} = scope;
    return {...safe, jobsRemaining: scope.maxJobs - scope.claims.length, providerBillingCap: false,
      note: 'The request count is bounded; the provider debit remains unknown. No publishing authorization.'};
  }

  async read(org: string, actor: string, threadId: string, id: string, now = new Date()): Promise<HeygenAutopilotScopeV2> {
    await this.membership.member(org, actor);
    const row = await this.store.read<HeygenAutopilotScopeV2>(org, KIND, id);
    if (!row || row.parentId !== threadId || row.payload.kind !== 'heygen_autopilot_scope_v2' ||
      row.payload.actorId !== actor || row.payload.threadId !== threadId) return videoErrorV1('VIDEO_AUTOPILOT_SCOPE_NOT_FOUND', 404);
    if (Date.parse(row.payload.expiresAt) <= now.getTime()) return videoErrorV1('VIDEO_AUTOPILOT_SCOPE_EXPIRED', 409);
    if (row.payload.stoppedAt) return videoErrorV1('VIDEO_AUTOPILOT_SCOPE_STOPPED', 409);
    return row.payload;
  }
  async stop(org: string, actor: string, threadId: string, id: string, now = new Date()) {
    await this.membership.member(org, actor);
    return this.store.transact(async store => {
      const row = await store.read<HeygenAutopilotScopeV2>(org, KIND, id);
      if (!row || row.payload.actorId !== actor || row.payload.threadId !== threadId || row.parentId !== threadId)
        return videoErrorV1('VIDEO_AUTOPILOT_SCOPE_NOT_FOUND', 404);
      if (row.payload.stoppedAt) return this.view(row.payload);
      const payload = {...row.payload, stoppedAt: now.toISOString()};
      await store.put({organizationId: org, kind: KIND, id, expectedRevision: row.revision, payload});
      return {...this.view(payload), action: 'Future stages stopped; no remote cancellation is claimed.'};
    });
  }

  async claimExpertAttempt(org: string, actor: string, threadId: string, id: string, attemptKey: string, now = new Date()) {
    if (!attemptKey || attemptKey.length > 500) return videoErrorV1('VIDEO_AUTOPILOT_SCOPE_INVALID', 409);
    await this.membership.member(org, actor);
    return this.store.transact(async store => {
      const row = await store.read<HeygenAutopilotScopeV2>(org, KIND, id), scope = row?.payload;
      if (!row || !scope || scope.actorId !== actor || scope.threadId !== threadId || row.parentId !== threadId)
        return videoErrorV1('VIDEO_AUTOPILOT_SCOPE_NOT_FOUND', 404);
      if (Date.parse(scope.expiresAt) <= now.getTime()) return videoErrorV1('VIDEO_AUTOPILOT_SCOPE_EXPIRED', 409);
      if (scope.stoppedAt) return videoErrorV1('VIDEO_AUTOPILOT_SCOPE_STOPPED', 409);
      if (scope.expertAttempts.includes(attemptKey)) return;
      if (scope.expertAttempts.length >= scope.maxExpertCalls)
        return videoErrorV1('VIDEO_AUTOPILOT_EXPERT_LIMIT', 409);
      await store.put({organizationId: org, kind: KIND, id, expectedRevision: row.revision,
        payload: {...scope, expertAttempts: [...scope.expertAttempts, attemptKey]}});
    });
  }

  /** Claim once before any dispatch. Lost responses recover exactly this preflight/intent, never another create. */
  async claim(org: string, actor: string, threadId: string, id: string, expected: {
    preflightId: string; recipeHash: string; subjectDigest: string; connectionId: string; profileId: string;
    profileRevision: number; profileDigest: string; pieceId: string; sourceRevision: string; approvalExpiresAt: string;
  }, now = new Date()) {
    await this.membership.member(org, actor);
    return this.store.transact(async store => {
      const row = await store.read<HeygenAutopilotScopeV2>(org, KIND, id);
      const scope = row?.payload;
      if (!row || !scope || scope.kind !== 'heygen_autopilot_scope_v2' || row.parentId !== threadId ||
        scope.actorId !== actor || scope.threadId !== threadId) return videoErrorV1('VIDEO_AUTOPILOT_SCOPE_NOT_FOUND', 404);
      for (const key of ['subjectDigest', 'connectionId', 'profileId', 'profileRevision', 'profileDigest', 'pieceId', 'sourceRevision'] as const)
        if (scope[key] !== expected[key]) return videoErrorV1('VIDEO_AUTOPILOT_SCOPE_CHANGED', 409);
      if (scope.stoppedAt) return videoErrorV1('VIDEO_AUTOPILOT_SCOPE_STOPPED', 409);
      const previous = scope.claims.find(claim => claim.preflightId === expected.preflightId);
      if (previous) {
        if (previous.recipeHash !== expected.recipeHash) return videoErrorV1('VIDEO_AUTOPILOT_SCOPE_CHANGED', 409);
        return previous;
      }
      if (Date.parse(scope.expiresAt) <= now.getTime() || Date.parse(scope.expiresAt) < Date.parse(expected.approvalExpiresAt))
        return videoErrorV1('VIDEO_AUTOPILOT_SCOPE_EXPIRED', 409);
      if (scope.claims.length >= scope.maxJobs) return videoErrorV1('VIDEO_AUTOPILOT_SCOPE_EXHAUSTED', 409);
      const claim = {preflightId: expected.preflightId, recipeHash: expected.recipeHash,
        intentId: intent(id, expected.preflightId), claimedAt: now.toISOString()};
      await store.put({organizationId: org, kind: KIND, id, expectedRevision: row.revision, parentId: threadId,
        payload: {...scope, claims: [...scope.claims, claim]}});
      return claim;
    });
  }
}

export interface HeygenScopedJobBindingV2 {scopeId: string; threadId: string; intentId: string; preflightId: string; recipeHash: string}
/** Stop and the exact paid-attempt fence share this row lock; grants never come from model arguments. */
export async function assertHeygenScopedJobV2(tx: Pick<Prisma.TransactionClient, 'socialFactoryRecord'>, org: string, actor: string,
  bound: HeygenScopedJobBindingV2, request: any, now: Date) {
  const where: Prisma.SocialFactoryRecordWhereInput = {kind: KIND, id: bound.scopeId,
    parentId: bound.threadId, deletedAt: null, invalidatedAt: null};
  const row = await tx.socialFactoryRecord.findFirst({where: {...where, organizationId: org}}), scope = row?.payload as unknown as HeygenAutopilotScopeV2 | undefined;
  if (!row || !scope || scope.actorId !== actor || scope.threadId !== bound.threadId || scope.stoppedAt ||
    Date.parse(scope.expiresAt) <= now.getTime() || request.recipe?.recipeHash !== bound.recipeHash ||
    !scope.claims.some(claim => claim.preflightId === bound.preflightId && claim.intentId === bound.intentId && claim.recipeHash === bound.recipeHash))
    return videoErrorV1('VIDEO_AUTOPILOT_SCOPE_STOPPED', 409);
  const binding = request.recipe.binding;
  for (const key of ['profileId', 'profileRevision', 'profileDigest', 'connectionId', 'subjectDigest'] as const)
    if (scope[key] !== binding[key]) return videoErrorV1('VIDEO_AUTOPILOT_SCOPE_CHANGED', 409);
  if (scope.pieceId !== binding.sourcePin.pieceId || scope.sourceRevision !== binding.sourcePin.sourceRevision)
    return videoErrorV1('VIDEO_AUTOPILOT_SCOPE_CHANGED', 409);
  const locked = await tx.socialFactoryRecord.updateMany({where: {...where, organizationId: org, revision: row.revision}, data: {revision: row.revision}});
  if (locked.count !== 1) return videoErrorV1('VIDEO_AUTOPILOT_SCOPE_CHANGED', 409);
}
