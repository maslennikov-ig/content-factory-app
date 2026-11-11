import { HttpException, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { parseVideoV1, videoErrorV1, videoSettingsV1 } from '../video-brief.v1';
import { downloadVideoAssetV1, inspectCreativeImageBytesV1 } from '../video-media.v1';
import { heygenCreativeEnvelopeV1 } from './video-heygen-creative-native.v1';
import { assertHeygenPerformanceDraftV1 } from './video-heygen-performance-record.v1';
import {
  HEYGEN_PERFORMANCE_SCENE_TOOL_SCHEMAS_V1, heygenPerformanceSceneHashV1, prepareHeygenPerformanceScenesV1,
  type HeygenPerformanceSceneQualificationV1,
} from './video-heygen-performance-scene.v1';
import { HeygenPerformanceServiceV1 } from './video-heygen-performance.service.v1';
import { compileHeygenPerformanceV1, heygenPerformanceSceneDirectionsV1 } from './video-heygen-performance.v1';
import { heygenVideoRecipeV2 } from './video-heygen-settings.v2';

export const HeygenPerformanceScenePrepareSchemaV1 = z.object({draftId: z.string().uuid(),
  version: z.number().int().positive(), expectedRevision: z.number().int().nonnegative()}).strict();
const lookId = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/);
export const HeygenOwnedLookPreviewSchemaV1 = z.object({draftId: z.string().uuid(), version: z.number().int().positive(), lookId}).strict();
const previewDetail = z.object({id: lookId, group_id: lookId, status: z.literal('completed'),
  preview_image_url: z.string().max(4096).url()});
const previewOrigin = 'https://files2.heygen.ai';
const previewUnavailable = () => videoErrorV1('VIDEO_PROFILE_PREVIEW_UNAVAILABLE', 404);

type ToolShape = {name: string; inputSchema: unknown; outputSchema?: unknown};
type Limitation = {code: string; remedy: string; sceneId?: string};
const toolReadRefusals = new Set(['VIDEO_MCP_UNAVAILABLE', 'VIDEO_SCHEMA_UNSUPPORTED', 'VIDEO_SCHEMA_CHANGED',
  'VIDEO_RESPONSE_TIMEOUT', 'VIDEO_RESPONSE_TOO_LARGE', 'VIDEO_TOOL_UNAVAILABLE']);
const errorCode = (error: unknown) => error instanceof HttpException ? (error.getResponse() as {code?: string}).code : undefined;

async function studioSchemas(inspect: () => Promise<ToolShape[]>): Promise<HeygenPerformanceSceneQualificationV1['route']['toolSchemas']> {
  let tools: ToolShape[];
  try { tools = await inspect(); }
  catch (error) {
    if (toolReadRefusals.has(errorCode(error) ?? '')) return {};
    throw error;
  }
  return Object.fromEntries(Object.keys(HEYGEN_PERFORMANCE_SCENE_TOOL_SCHEMAS_V1).flatMap(name => {
    const matches = tools.filter(tool => tool.name === name);
    return matches.length === 1 ? [[name, heygenPerformanceSceneHashV1(matches[0])]] : [];
  }));
}

/** Read-only route review of the exact current draft. Studio discovery can never admit a create. */
@Injectable()
export class HeygenPerformanceSceneServiceV1 {
  constructor(readonly performance: HeygenPerformanceServiceV1) {}

  /** The browser gets only image bytes from the currently owned same-group look. */
  async readOwnedLookPreview(org: string, actor: string, raw: unknown) {
    const input = parseVideoV1(HeygenOwnedLookPreviewSchemaV1, raw);
    const {access, profiles} = this.performance.controls;
    await access.repository.member(org, actor);
    const currentDraft = async () => {
      const draft = await access.apiRepository.draft(org, input.draftId);
      if (!draft || draft.userId !== actor) return videoErrorV1('VIDEO_DRAFT_NOT_FOUND', 404);
      if (draft.version !== input.version) return videoErrorV1('VIDEO_DRAFT_CHANGED', 409);
      await access.api.assertCurrentSource(org, actor, draft);
      return draft;
    };
    const draft = await currentDraft();
    const native = videoSettingsV1(draft.settings).heygenV2;
    if (!native) return videoErrorV1('VIDEO_PERFORMANCE_NATIVE_REQUIRED', 409);
    const {binding, settings} = native;
    const credential = await access.connections.token(org, actor, binding.connectionId, binding.accountGeneration,
      'discovery', {allowRefresh: false});
    if (credential.connection.provider !== 'heygen') return videoErrorV1('VIDEO_PROVIDER_INVALID', 409);
    const def = await access.connections.connectable(org, 'heygen');
    const provider = access.subscriptions.heygen;
    const {token, assertUsable} = credential;
    const account = await provider.nativeAccount(def, token, assertUsable);
    if (account.subjectDigest !== binding.subjectDigest) return videoErrorV1('VIDEO_CONNECTION_CHANGED', 409);
    const {catalog} = await provider.readOwnedCatalog(def, token, assertUsable);
    const {groupId} = settings;
    const assertProfile = async (): Promise<void> => {
      const profile = await profiles.resolve(org, actor, {connectionId: binding.connectionId, profileId: binding.profileId, groupId},
        {accountDigest: account.subjectDigest, accountGeneration: credential.connection.generation});
      if (profile.revision !== binding.profileRevision || profile.digest !== binding.profileDigest)
        return videoErrorV1('VIDEO_PROFILE_CHANGED', 409);
    };
    await assertProfile();
    if (!catalog.avatars.some(look => look.id === input.lookId && look.groupId === groupId && look.ownership === 'owned' && look.selectableForDraft))
      return previewUnavailable();
    const group = await provider.readOwnedAvatarGroup(def, token, {avatarId: input.lookId, groupId}, assertUsable);
    if (group.avatarId !== input.lookId || group.groupId !== groupId || !['accepted', 'not_applicable'].includes(group.consentState))
      return previewUnavailable();
    const envelope = heygenCreativeEnvelopeV1(await provider.mcp.readHeygenCreativeV1(def, token,
      {tool: 'get_avatar_look', arguments: {lookId: input.lookId}}, assertUsable));
    const detail = previewDetail.safeParse(envelope.data === undefined ? envelope : envelope.data);
    if (!detail.success || detail.data.id !== input.lookId || detail.data.group_id !== groupId) return previewUnavailable();
    const url = new URL(detail.data.preview_image_url);
    if (url.origin !== previewOrigin || url.username || url.password || url.hash) return previewUnavailable();
    await assertUsable();
    let image: {bytes: Buffer; contentType: 'image/png' | 'image/jpeg' | 'image/webp'};
    try {
      const bytes = await downloadVideoAssetV1(url.href, 5 * 1024 * 1024, 12_000, previewOrigin);
      const {mimeType} = await inspectCreativeImageBytesV1(bytes);
      image = {bytes, contentType: mimeType};
    } catch { return previewUnavailable(); }
    await currentDraft();
    await assertProfile();
    await assertUsable();
    return image;
  }

  async prepare(org: string, actor: string, raw: unknown) {
    const input = parseVideoV1(HeygenPerformanceScenePrepareSchemaV1, raw);
    const controls = this.performance.controls;
    const readCurrent = async () => {
      const view = await this.performance.read(org, actor, input.draftId);
      if (view.draftVersion !== input.version) return videoErrorV1('VIDEO_DRAFT_CHANGED', 409);
      if (view.revision !== input.expectedRevision) return videoErrorV1('VIDEO_PERFORMANCE_CHANGED', 409);
      return view;
    };
    const view = await readCurrent();
    const context = await controls.performanceContext(org, actor, input.draftId, input.version, {scenePreparation: true});
    const {binding, draft, inner, qualification} = context;
    const brief = draft.brief as {scriptPolicy?: unknown; script?: unknown};
    const speech = brief.script;
    if (brief.scriptPolicy !== 'exact' || typeof speech !== 'string' || !speech.trim()) return videoErrorV1('VIDEO_EXACT_SCRIPT_REQUIRED', 409);

    const values = view.wishResolution ? {...view.values, wish: ''} : view.values;
    const directions = heygenPerformanceSceneDirectionsV1(values);
    // Keep the full monologue in one physical scene. There is no measured audio
    // or reviewed beat boundary here that could safely qualify a short accent cut.
    const scene = {sceneId: 'presenter', semanticBeatId: 'monologue', start: 0, end: speech.length, ...directions};
    let route: 'studio' | 'single_clip_avatar_v' = 'studio';
    let status: 'limited' | 'single_clip_available' = 'limited';
    const limitations: Limitation[] = [];
    let sceneDigest: string | undefined;

    if (inner.engine.type === 'avatar_v') {
      const compiled = compileHeygenPerformanceV1(values, inner, qualification);
      const motionPrompt = compiled.overrides.motionPrompt;
      if (motionPrompt) {
        try {
          const recipe = heygenVideoRecipeV2(binding, {...inner, ...compiled.overrides}, speech, qualification);
          route = 'single_clip_avatar_v';
          sceneDigest = recipe.recipeHash;
        } catch (error) {
          if (errorCode(error) !== 'VIDEO_HEYGEN_SETTING_UNAVAILABLE') throw error;
        }
        if (route === 'single_clip_avatar_v') {
          if (inner.motionPrompt !== motionPrompt || inner.expressiveness !== undefined || view.effectiveSettings?.motionPrompt !== motionPrompt) {
            limitations.push({code: 'apply_delivery', remedy: 'Apply the current delivery to this Avatar V clip, then review the exact request.'});
          } else {
            try {
              await assertHeygenPerformanceDraftV1(controls.profiles.store, org, actor, draft);
              status = 'single_clip_available';
            } catch (error) {
              if (errorCode(error) !== 'VIDEO_PERFORMANCE_CUE_UNAVAILABLE') throw error;
              limitations.push({code: 'required_cue', remedy: 'Resolve the required delivery settings before preparing the Avatar V request.'});
            }
          }
        }
      }
    }

    if (route === 'studio') {
      if (!context.inspectSceneTools) return videoErrorV1('VIDEO_MCP_UNAVAILABLE', 409);
      const prepared = prepareHeygenPerformanceScenesV1({version: 1, binding, settings: {...inner, motionPrompt: undefined},
        exactSpeech: speech, scenes: [{...scene, exactText: speech}]}, {settings: qualification,
        route: {kind: 'heygen-personal-studio-mcp/v1', connectionId: binding.connectionId, subjectDigest: binding.subjectDigest,
          accountGeneration: binding.accountGeneration, toolSchemas: await studioSchemas(context.inspectSceneTools),
          entitlement: 'unverified', resultContract: 'unverified', attemptContract: 'unverified'}});
      sceneDigest = prepared.preparationDigest;
      if (values.gaze === 'camera') limitations.push({code: 'frontal_look',
        remedy: 'Review a front-facing source of the same person with eyes toward the lens. Approve the look explicitly and retain the saved voice.'});
      const ref = qualification.animationReference;
      const validReference = !!inner.animationReferenceLookId && ref?.lookId === inner.animationReferenceLookId &&
        ref.groupId === inner.groupId && ref.avatarType === 'digital_twin' && ref.owned && ref.ready &&
        ['accepted', 'not_applicable'].includes(ref.consentState);
      if (qualification.appearance.avatarType === 'photo_avatar' && !validReference) limitations.push({code: 'avatar_v_reference',
        remedy: 'For Avatar V photo motion, explicitly select a ready, owned and consent-qualified digital-twin reference from this appearance group.'});
      for (const {code, remedy, sceneId} of prepared.limitations) limitations.push({code, remedy, ...(sceneId ? {sceneId} : {})});
    }

    await context.guard();
    await controls.access.api.assertCurrentSource(org, actor, draft);
    const current = await readCurrent();
    if (heygenPerformanceSceneHashV1(view.values) !== heygenPerformanceSceneHashV1(current.values))
      return videoErrorV1('VIDEO_PERFORMANCE_CHANGED', 409);
    return {draftId: draft.id, draftVersion: draft.version, revision: view.revision, status, route,
      scenes: [scene], limitations, preparationDigest: heygenPerformanceSceneHashV1({draftId: draft.id, version: draft.version,
        revision: view.revision, sceneDigest, status, route, limitations}), operationCount: status === 'single_clip_available' ? 1 : null,
      cost: 'unknown' as const, timing: 'scene_level_no_frame_guarantee' as const, dispatchAuthorized: false as const,
      generated: false as const, submitted: false as const};
  }
}
