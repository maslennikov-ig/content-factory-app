import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { HeygenChatControlsServiceV1 } from './video-heygen-chat-controls.service.v1';
import { videoErrorV1, parseVideoV1, videoSettingsV1, validateVideoGroundingV1, videoSourceRevisionV1 } from '../video-brief.v1';
import { subscriptionHash } from './video-provider-registry';
import { HeygenVideoSettingsSchemaV2, heygenVideoRecipeV2 } from './video-heygen-settings.v2';
import { assertHeygenAppearanceLineageV2 } from './video-heygen-style-admission.v2';
import { HEYGEN_NATIVE_REQUEST_KIND_V1 } from './video-heygen-avatar-admission.v1';
import { HEYGEN_NATIVE_REQUEST_KIND_V2 } from './video-heygen-avatar-request.v2';
import { HEYGEN_PERFORMANCE_KEYS_V1, HeygenPerformanceValuesSchemaV1, resolveHeygenPerformanceV1, compileHeygenPerformanceV1,
  type HeygenPerformanceKeyV1, type HeygenPerformanceValuesV1 } from './video-heygen-performance.v1';
import { HEYGEN_PERFORMANCE_KIND_V1, HeygenPerformanceRecordSchemaV1, heygenPerformanceRecordIdV1,
  heygenPerformancePlanDigestV1, heygenPerformanceMatchesDraftV1, type HeygenPerformanceRecordV1 } from './video-heygen-performance-record.v1';
import { HEYGEN_PERFORMANCE_FEEDBACK_KIND_V1, HeygenPerformanceFeedbackFragmentSchemaV1, HeygenPerformanceFeedbackIdSchemaV1,
  HeygenPerformanceFeedbackRecordSchemaV1, HeygenPerformanceFeedbackRenderSchemaV1, HeygenPerformanceWishResolutionSchemaV1,
  type HeygenPerformanceFeedbackRecordV1, type HeygenPerformanceFeedbackViewV1 } from './video-heygen-performance-record.v1';
import type { SocialFactoryStoreV1 } from '../../content-intelligence/social-factory/contracts/social-factory.v1';

const base = z.object({draftId: z.string().uuid(), version: z.number().int().positive(), expectedRevision: z.number().int().nonnegative()}).strict();
export const HeygenPerformanceApplySchemaV1 = base.extend({changes: HeygenPerformanceValuesSchemaV1.omit({wish: true}).partial().extend({wish: z.string().max(500).optional()}).strict().optional(),
  releaseFields: z.array(z.enum(HEYGEN_PERFORMANCE_KEYS_V1)).max(HEYGEN_PERFORMANCE_KEYS_V1.length).optional(), rationale: z.string().max(700).optional(),
  wishResolution: HeygenPerformanceWishResolutionSchemaV1.optional(), feedbackId: HeygenPerformanceFeedbackIdSchemaV1.optional()}).strict();
export const HeygenPerformancePreferenceSchemaV1 = base;
export const HeygenPerformanceFeedbackSchemaV1 = base.extend({text: z.string().min(1).max(1500).refine(value => !!value.trim()),
  fragment: HeygenPerformanceFeedbackFragmentSchemaV1.optional(), render: HeygenPerformanceFeedbackRenderSchemaV1.optional()}).strict();
const correctionChanges = HeygenPerformanceValuesSchemaV1.pick({gaze: true, facialIntensity: true, gestures: true}).partial().strict();
export const HeygenPerformanceFeedbackCorrectionSchemaV1 = base.extend({feedbackId: HeygenPerformanceFeedbackIdSchemaV1,
  changes: correctionChanges}).strict();
type FeedbackClient = Pick<Prisma.TransactionClient, 'videoSubscriptionJob' | 'media'>;
const preferenceKind = 'heygen_performance_preference' as const;
const parent = (actor: string) => `heygen-performance:actor:${actor}`;
const preferenceId = (actor: string, binding: any) => `heygen-performance-pref:${subscriptionHash([actor, binding.connectionId, binding.subjectDigest, binding.profileId])}`;
const viewDraft = (draft: any) => ({id: draft.id, pieceId: draft.pieceId, pieceRevision: draft.pieceRevision,
  version: draft.version, brief: draft.brief, settings: draft.settings});

/** One private draft/plan transaction. Provider reads qualify settings; only existing launch capabilities may spend. */
@Injectable()
export class HeygenPerformanceServiceV1 {
  constructor(readonly controls: HeygenChatControlsServiceV1) {}
  private get store() {return this.controls.profiles.store;}

  private async owned(org: string, actor: string, id: string, version?: number) {
    if (!z.string().uuid().safeParse(id).success) return videoErrorV1('VIDEO_DRAFT_NOT_FOUND', 404);
    await this.controls.access.repository.member(org, actor);
    const draft = await this.controls.access.apiRepository.draft(org, id);
    if (!draft || draft.userId !== actor) return videoErrorV1('VIDEO_DRAFT_NOT_FOUND', 404);
    if (version !== undefined && draft.version !== version) return videoErrorV1('VIDEO_DRAFT_CHANGED', 409);
    if (!videoSettingsV1(draft.settings).heygenV2) return videoErrorV1('VIDEO_PERFORMANCE_NATIVE_REQUIRED', 409);
    return draft;
  }

  private async stored(org: string, actor: string, id: string, store: SocialFactoryStoreV1 = this.store) {
    const row = await store.read<unknown>(org, HEYGEN_PERFORMANCE_KIND_V1, heygenPerformanceRecordIdV1(actor, id));
    if (!row) return null;
    const parsed = HeygenPerformanceRecordSchemaV1.safeParse(row.payload);
    if (!parsed.success || parsed.data.actorId !== actor || parsed.data.draftId !== id || row.parentId !== parent(actor) ||
      parsed.data.planDigest !== heygenPerformancePlanDigestV1(parsed.data)) return videoErrorV1('VIDEO_PERFORMANCE_PLAN_INVALID', 409);
    return {...row, payload: parsed.data};
  }

  private view(draft: any, row: Awaited<ReturnType<HeygenPerformanceServiceV1['stored']>>, initial?: HeygenPerformanceValuesV1) {
    const fallback = resolveHeygenPerformanceV1({proposed: initial});
    if (initial) for (const key of HEYGEN_PERFORMANCE_KEYS_V1) fallback.origins[key] = 'default';
    const value = row?.payload, current = value ? heygenPerformanceMatchesDraftV1(value, draft) : false;
    return {draftId: draft.id, draftVersion: draft.version, revision: row?.revision ?? 0,
      values: value?.values ?? fallback.values, lockedFields: value?.lockedFields ?? fallback.lockedFields,
      origins: value?.origins ?? fallback.origins, rationale: value?.rationale ?? '',
      wishDigest: subscriptionHash(value?.values.wish ?? fallback.values.wish),
      wishResolution: value?.wishResolution ?? null,
      limitations: [...(value?.limitations ?? []), ...(value && !current ? [{field: 'draft', code: 'draft_changed',
        message: 'The saved script or settings changed. Review and apply the delivery again before generation.'}] : [])],
      applied: !!value?.applied && current,
      effectiveSettings: current ? {expressiveness: draft.settings.heygenV2.settings.expressiveness ?? null,
        motionPrompt: draft.settings.heygenV2.settings.motionPrompt ?? null} : null,
      generated: false as const, submitted: false as const};
  }

  async read(org: string, actor: string, draftId: string) {
    const draft = await this.owned(org, actor, draftId), row = await this.stored(org, actor, draft.id);
    const binding = (draft.settings as any).heygenV2.binding;
    const saved = !row ? await this.store.read<any>(org, preferenceKind, preferenceId(actor, binding)) : null;
    const initial = saved?.payload?.actorId === actor && saved.payload.profileDigest === binding.profileDigest
      ? HeygenPerformanceValuesSchemaV1.safeParse(saved.payload.values) : null;
    const view = this.view(draft, row, initial?.success ? {...initial.data, context: 'general'} : undefined);
    if (!row && initial?.success) {
      const locked = z.array(z.enum(HEYGEN_PERFORMANCE_KEYS_V1)).safeParse(saved.payload.lockedFields ?? []);
      if (locked.success) {
        view.lockedFields = locked.data.filter(key => key !== 'context');
        for (const key of view.lockedFields) view.origins[key] = 'manual';
      }
    }
    return view;
  }

  async apply(org: string, actor: string, raw: unknown, source: 'assistant' | 'manual') {
    const input = parseVideoV1(HeygenPerformanceApplySchemaV1, raw);
    if (source === 'assistant' && input.releaseFields?.length) return videoErrorV1('VIDEO_PERFORMANCE_MANUAL_REQUIRED', 409);
    if (source === 'manual' && input.wishResolution) return videoErrorV1('VIDEO_PERFORMANCE_INTERPRETATION_REQUIRED', 409);
    const draft = await this.owned(org, actor, input.draftId, input.version), previous = await this.stored(org, actor, draft.id);
    if ((previous?.revision ?? 0) !== input.expectedRevision) return videoErrorV1('VIDEO_PERFORMANCE_CHANGED', 409);
    const initial = previous ? {values: previous.payload.values, origins: previous.payload.origins, lockedFields: previous.payload.lockedFields}
      : await this.read(org, actor, draft.id);
    let correctionFields: HeygenPerformanceKeyV1[] = [];
    if (input.feedbackId) {
      await this.feedbackRecord(this.store, org, actor, draft.id, input.feedbackId);
      const correction = parseVideoV1(correctionChanges, input.changes);
      correctionFields = Object.keys(correction) as Array<keyof typeof correction>;
      if (!correctionFields.length || input.releaseFields?.length || input.wishResolution || correctionFields.some(key => initial.lockedFields.includes(key)))
        return videoErrorV1('VIDEO_PERFORMANCE_CORRECTION_UNAVAILABLE', 409);
    }
    const resolved = resolveHeygenPerformanceV1({current: initial.values, currentOrigins: initial.origins as any, lockedFields: initial.lockedFields,
      ...(source === 'manual' ? {manual: input.changes, releaseFields: input.releaseFields} : {proposed: input.changes})});
    const context = await this.controls.performanceContext(org, actor, draft.id, draft.version);
    const mappedValuesDigest = (fields: readonly string[]) => subscriptionHash(Object.fromEntries(fields.map(field => [field, resolved.values[field as keyof HeygenPerformanceValuesV1]])));
    let wishResolution = previous?.payload.wishResolution;
    if (wishResolution && (wishResolution.wishDigest !== subscriptionHash(resolved.values.wish) || wishResolution.valuesDigest !== mappedValuesDigest(wishResolution.fields))) wishResolution = undefined;
    if (input.wishResolution) {
      if (!resolved.values.wish.trim() || input.wishResolution.wishDigest !== subscriptionHash(resolved.values.wish)) return videoErrorV1('VIDEO_PERFORMANCE_WISH_CHANGED', 409);
      wishResolution = {...input.wishResolution, valuesDigest: mappedValuesDigest(input.wishResolution.fields)};
    }
    const compiled = compileHeygenPerformanceV1(wishResolution ? {...resolved.values, wish: ''} : resolved.values, context.inner, context.qualification);
    const overrides = {...compiled.overrides};
    // A duration target is not measured audio. Retain the intent and limitation,
    // but never dispatch a motion request on that basis through this clip route.
    if (compiled.limitations.some(item => item.code === 'duration_target_unverified')) overrides.motionPrompt = undefined;
    const inner = HeygenVideoSettingsSchemaV2.parse({...context.inner, ...overrides});
    const recipe = heygenVideoRecipeV2(context.binding, inner, (draft.brief as any).script, context.qualification);
    const settings = videoSettingsV1({...context.settings, heygenV2: {binding: context.binding, settings: inner}});
    validateVideoGroundingV1(draft.brief as any, settings);
    await context.guard();
    const withoutDigest = {type: 'heygen_performance_plan/v1' as const, actorId: actor, draftId: draft.id, draftVersion: draft.version + 1,
      sourceRevision: draft.pieceRevision, scriptDigest: subscriptionHash((draft.brief as any).script), settingsDigest: subscriptionHash(settings),
      profileId: context.binding.profileId, profileDigest: context.binding.profileDigest, connectionId: context.binding.connectionId,
      accountGeneration: context.binding.accountGeneration, ...resolved, limitations: compiled.limitations,
      requiredFields: [...new Set([...(wishResolution?.fields ?? []), ...correctionFields])], ...(wishResolution ? {wishResolution} : {}),
      rationale: input.rationale ?? previous?.payload.rationale ?? '', ...(input.feedbackId ? {feedbackId: input.feedbackId} : {}),
      applied: compiled.limitations.length === 0};
    const payload = HeygenPerformanceRecordSchemaV1.parse({...withoutDigest, planDigest: heygenPerformancePlanDigestV1(withoutDigest)});
    try {
      return await this.store.transactVideoDraft(async (store, tx) => {
        const current = await tx.videoPromptDraft.findFirst({where: {organizationId: org, userId: actor, id: draft.id, version: draft.version}});
        if (!current || subscriptionHash(current.settings) !== subscriptionHash(draft.settings) || subscriptionHash(current.brief) !== subscriptionHash(draft.brief))
          return videoErrorV1('VIDEO_DRAFT_CHANGED', 409);
        if (input.feedbackId) await this.feedbackRecord(store, org, actor, draft.id, input.feedbackId);
        const piece = await tx.contentPiece.findFirst({where: {organizationId: org, id: draft.pieceId, archivedAt: null}});
        if (!piece || videoSourceRevisionV1(piece) !== draft.pieceRevision) return videoErrorV1('VIDEO_SOURCE_CHANGED', 409);
        const artifact = (draft.brief as any)?.sourceArtifact?.ref;
        if (artifact) await store.assertArtifactSource?.(org, actor, artifact);
        const profile = await store.read<any>(org, 'heygen_person_profile', context.binding.profileId);
        if (!profile || profile.revision !== context.binding.profileRevision || profile.payload.approvedDigest !== context.binding.profileDigest)
          return videoErrorV1('VIDEO_PROFILE_CHANGED', 409);
        if (context.binding.appearanceLineage) await assertHeygenAppearanceLineageV2(tx, org, actor, {binding: context.binding, settings: inner});
        const connection = await tx.videoSubscriptionConnection.findFirst({where: {id: context.binding.connectionId, ownerId: actor,
          generation: context.binding.accountGeneration, state: {not: 'revoked'}}});
        if (!connection) return videoErrorV1('VIDEO_CONNECTION_CHANGED', 409);
        const saved = await store.put({organizationId: org, kind: HEYGEN_PERFORMANCE_KIND_V1, id: heygenPerformanceRecordIdV1(actor, draft.id),
          expectedRevision: input.expectedRevision, parentId: parent(actor), payload,
          sourceIds: [`resource:heygen_person_profile:${context.binding.profileId}`, `resource:video_draft:${draft.id}`,
            ...(input.feedbackId ? [`resource:${HEYGEN_PERFORMANCE_FEEDBACK_KIND_V1}:${input.feedbackId}`] : [])]});
        const changed = await tx.videoPromptDraft.updateMany({where: {organizationId: org, userId: actor, id: draft.id, version: draft.version},
          data: {settings: settings as any, version: {increment: 1}, preflight: Prisma.DbNull}});
        if (changed.count !== 1) return videoErrorV1('VIDEO_DRAFT_CHANGED', 409);
        const next = {...draft, version: draft.version + 1, settings};
        return {...this.view(next, {...saved, payload} as any), draft: viewDraft(next), recipeHash: recipe.recipeHash,
          majorAccentBudget: compiled.majorAccentBudget};
      });
    } catch (error: any) {
      if (error?.code === 'SOCIAL_FACTORY_CONFLICT') return videoErrorV1('VIDEO_PERFORMANCE_CHANGED', 409);
      throw error;
    }
  }

  async savePreference(org: string, actor: string, raw: unknown) {
    const input = parseVideoV1(HeygenPerformancePreferenceSchemaV1, raw);
    const draft = await this.owned(org, actor, input.draftId, input.version), row = await this.stored(org, actor, draft.id);
    if (!row || row.revision !== input.expectedRevision || !heygenPerformanceMatchesDraftV1(row.payload, draft))
      return videoErrorV1('VIDEO_PERFORMANCE_CHANGED', 409);
    const binding = (draft.settings as any).heygenV2.binding, id = preferenceId(actor, binding);
    await this.store.transactVideoDraft(async (store, tx) => {
      const live = await tx.videoPromptDraft.findFirst({where: {organizationId: org, userId: actor, id: draft.id, version: input.version}});
      const current = await store.read<any>(org, HEYGEN_PERFORMANCE_KIND_V1, row.id);
      if (!live || !current || current.revision !== row.revision || !heygenPerformanceMatchesDraftV1(row.payload, live))
        return videoErrorV1('VIDEO_PERFORMANCE_CHANGED', 409);
      const old = await store.read(org, preferenceKind, id);
      await store.put({organizationId: org, kind: preferenceKind, id, expectedRevision: old?.revision ?? 0, parentId: parent(actor),
        payload: {type: 'heygen_performance_preference/v1', actorId: actor, profileId: binding.profileId,
          profileDigest: binding.profileDigest, values: row.payload.values,
          lockedFields: row.payload.lockedFields.filter(key => key !== 'context')}, sourceIds: [`resource:heygen_person_profile:${binding.profileId}`]});
    });
    return {...this.view(draft, row), preferenceSaved: true as const};
  }

  async feedback(org: string, actor: string, raw: unknown) {
    const input = parseVideoV1(HeygenPerformanceFeedbackSchemaV1, raw);
    const draft = await this.owned(org, actor, input.draftId, input.version), row = await this.stored(org, actor, draft.id);
    if ((row?.revision ?? 0) !== input.expectedRevision) return videoErrorV1('VIDEO_PERFORMANCE_CHANGED', 409);
    const save = () => this.store.transactVideoDraft(async (store, tx) => {
      const live = await tx.videoPromptDraft.findFirst({where: {organizationId: org, userId: actor, id: draft.id, version: input.version}});
      const current = await store.read<unknown>(org, HEYGEN_PERFORMANCE_KIND_V1, heygenPerformanceRecordIdV1(actor, draft.id));
      if (!live || (current?.revision ?? 0) !== input.expectedRevision || subscriptionHash(live.brief) !== subscriptionHash(draft.brief) ||
        subscriptionHash(live.settings) !== subscriptionHash(draft.settings))
        return videoErrorV1('VIDEO_PERFORMANCE_CHANGED', 409);
      const result = input.render ? await this.ownedFeedbackRender(tx, org, actor, draft, input.render.jobId) : undefined;
      const script = result ? result.script : (live.brief as {script?: unknown} | null)?.script;
      if (typeof script !== 'string') return videoErrorV1('VIDEO_PERFORMANCE_FRAGMENT_CHANGED', 409);
      const fragment = input.fragment ?? null;
      if (fragment && (fragment.end <= fragment.start || fragment.end > script.length || script.slice(fragment.start, fragment.end) !== fragment.exactText))
        return videoErrorV1('VIDEO_PERFORMANCE_FRAGMENT_CHANGED', 409);
      const startMs = input.render?.startMs, endMs = input.render?.endMs;
      if (startMs !== undefined || endMs !== undefined) {
        if (!result?.render.durationMs) return videoErrorV1('VIDEO_PERFORMANCE_DURATION_UNAVAILABLE', 409);
        if (startMs === undefined || endMs === undefined || startMs >= endMs || endMs > result.render.durationMs)
          return videoErrorV1('VIDEO_PERFORMANCE_TIME_RANGE_INVALID', 409);
      }
      const draftVersion = result?.draftVersion ?? live.version;
      const sourceRevision = result?.sourceRevision ?? live.pieceRevision;
      const scriptDigest = subscriptionHash(script);
      const planDigest = row && row.payload.draftVersion === draftVersion && row.payload.scriptDigest === scriptDigest &&
        row.payload.sourceRevision === sourceRevision && row.payload.settingsDigest === subscriptionHash(result?.settings ?? live.settings) ? row.payload.planDigest : null;
      const render = result && {...result.render, ...(startMs !== undefined && endMs !== undefined ? {startMs, endMs} : {})};
      const payload = HeygenPerformanceFeedbackRecordSchemaV1.parse({type: 'heygen_performance_feedback/v1', actorId: actor,
        draftId: draft.id, draftVersion, planDigest, sourceRevision, scriptDigest, text: input.text, fragment, ...(render ? {render} : {})});
      // Keep the original draft-only ID formula so a retry of a historical request returns the original observation.
      const identity = render ? [actor, draft.id, draftVersion, render.jobId, render.mediaId, render.receiptDigest,
        render.requestDigest, startMs ?? null, endMs ?? null, input.text, fragment]
        : [actor, draft.id, draftVersion, input.expectedRevision, input.text, fragment];
      const id = `heygen-performance-feedback:${subscriptionHash(identity)}`;
      if (!await store.read(org, HEYGEN_PERFORMANCE_FEEDBACK_KIND_V1, id)) {
        await store.put({organizationId: org, kind: HEYGEN_PERFORMANCE_FEEDBACK_KIND_V1, id, expectedRevision: 0, parentId: draft.id,
          payload, sourceIds: [`resource:video_draft:${draft.id}`, ...(render ? [`resource:video_subscription_job:${render.jobId}`] : [])]});
      }
      return {...this.view(draft, row), feedbackId: id, feedbackSaved: true as const};
    });
    try { return await save(); }
    catch (error: any) {
      if (error?.code === 'SOCIAL_FACTORY_CONFLICT') return save();
      throw error;
    }
  }

  async feedbackRead(org: string, actor: string, draftId: string, jobId?: string): Promise<HeygenPerformanceFeedbackViewV1> {
    const draft = await this.owned(org, actor, draftId);
    return this.store.transactVideoDraft(async (store, tx) => {
      const live = await tx.videoPromptDraft.findFirst({where: {organizationId: org, userId: actor, id: draftId, version: draft.version}});
      if (!live) return videoErrorV1('VIDEO_PERFORMANCE_CHANGED', 409);
      const plan = await this.stored(org, actor, draftId, store);
      const result = jobId === undefined ? undefined : await this.ownedFeedbackRender(tx, org, actor, draft, jobId);
      const rows = await tx.socialFactoryRecord.findMany({where: {organizationId: org, kind: HEYGEN_PERFORMANCE_FEEDBACK_KIND_V1,
        parentId: draftId, deletedAt: null, invalidatedAt: null, OR: [{expiresAt: null}, {expiresAt: {gt: new Date()}}],
        AND: [{payload: {path: ['actorId'], equals: actor}}, ...(result ? [{payload: {path: ['render', 'jobId'], equals: result.render.jobId}}] : [])]},
        orderBy: [{createdAt: 'desc'}, {id: 'asc'}], take: 40});
      const observations = rows.flatMap(row => {
        const value = this.parseFeedbackRecord(row, actor, draftId);
        if (!value || result && (value.render?.receiptDigest !== result.render.receiptDigest || value.render.requestDigest !== result.render.requestDigest ||
          value.render.mediaId !== result.render.mediaId)) return [];
        const render = value.render ? HeygenPerformanceFeedbackRenderSchemaV1.parse({jobId: value.render.jobId,
          startMs: value.render.startMs, endMs: value.render.endMs}) : null;
        return [{id: row.id, draftVersion: value.draftVersion, text: value.text, createdAt: row.createdAt.toISOString(), fragment: value.fragment, render}];
      });
      return {draftId, draftVersion: draft.version, revision: plan?.revision ?? 0, observations,
        target: result ? {kind: 'render', draftVersion: result.draftVersion, jobId: result.render.jobId, durationMs: result.render.durationMs}
          : {kind: 'draft', draftVersion: draft.version}};
    });
  }

  async proposeFeedbackCorrection(org: string, actor: string, raw: unknown) {
    const input = parseVideoV1(HeygenPerformanceFeedbackCorrectionSchemaV1, raw);
    const draft = await this.owned(org, actor, input.draftId, input.version);
    const current = await this.read(org, actor, draft.id);
    if (current.revision !== input.expectedRevision || current.draftVersion !== draft.version)
      return videoErrorV1('VIDEO_PERFORMANCE_CHANGED', 409);
    await this.feedbackRecord(this.store, org, actor, draft.id, input.feedbackId);
    const keys = Object.keys(input.changes) as Array<keyof typeof input.changes>;
    if (!keys.length) return videoErrorV1('VIDEO_PERFORMANCE_CORRECTION_UNAVAILABLE', 409);
    const lockedFields = keys.filter(key => current.lockedFields.includes(key));
    const changes = correctionChanges.parse(Object.fromEntries(keys.filter(key => !lockedFields.includes(key)).map(key => [key, input.changes[key]])));
    return {draftId: draft.id, draftVersion: draft.version, expectedRevision: current.revision, feedbackId: input.feedbackId,
      changes, lockedFields, generated: false as const, submitted: false as const};
  }

  private parseFeedbackRecord(row: {id: string; parentId: string | null; payload: unknown}, actor: string, draftId: string) {
    const value = HeygenPerformanceFeedbackRecordSchemaV1.safeParse(row.payload);
    return row.parentId === draftId && HeygenPerformanceFeedbackIdSchemaV1.safeParse(row.id).success && value.success &&
      value.data.draftId === draftId && value.data.actorId === actor ? value.data : null;
  }

  private async feedbackRecord(store: SocialFactoryStoreV1, org: string, actor: string, draftId: string, id: string) {
    const row = await store.read<unknown>(org, HEYGEN_PERFORMANCE_FEEDBACK_KIND_V1, id);
    const value = row && this.parseFeedbackRecord(row, actor, draftId);
    return value ?? videoErrorV1('VIDEO_PERFORMANCE_FEEDBACK_NOT_FOUND', 404);
  }

  private async ownedFeedbackRender(tx: FeedbackClient, org: string, actor: string, draft: {id: string; pieceId: string}, jobId: string) {
    if (!z.string().uuid().safeParse(jobId).success) return videoErrorV1('VIDEO_JOB_NOT_FOUND', 404);
    const job = await tx.videoSubscriptionJob.findFirst({where: {id: jobId, organizationId: org, actorId: actor,
      draftId: draft.id, pieceId: draft.pieceId, provider: 'heygen', state: 'completed'}});
    const kind = (job?.request as {kind?: string} | null)?.kind;
    const receiptId = (job?.receipt as {id?: string} | null)?.id;
    const stored = job?.storedFile as {path?: string; metadata?: {source?: string; durationSeconds?: number}} | null;
    const snapshot = job?.snapshot as {brief?: {script?: string}; settings?: unknown} | null;
    const script = snapshot?.brief?.script;
    if (!job || !job.resultMediaId || !stored?.path || typeof receiptId !== 'string' || !receiptId || typeof script !== 'string' ||
      kind !== HEYGEN_NATIVE_REQUEST_KIND_V1 && kind !== HEYGEN_NATIVE_REQUEST_KIND_V2)
      return videoErrorV1('VIDEO_JOB_NOT_FOUND', 404);
    const media = await tx.media.findFirst({where: {id: job.resultMediaId, organizationId: org, deletedAt: null, type: 'video', path: stored.path}});
    if (!media) return videoErrorV1('VIDEO_JOB_NOT_FOUND', 404);
    const ms = stored.metadata?.source === 'mp4_bytes' ? Math.floor((stored.metadata.durationSeconds ?? 0) * 1000) : 0;
    const render: NonNullable<HeygenPerformanceFeedbackRecordV1['render']> = {jobId, mediaId: media.id,
      receiptDigest: subscriptionHash(receiptId), requestDigest: subscriptionHash(job.request), durationMs: Number.isSafeInteger(ms) && ms > 0 ? ms : null};
    return {draftVersion: job.draftVersion, sourceRevision: job.pieceRevision, script, settings: snapshot?.settings, render};
  }
}
