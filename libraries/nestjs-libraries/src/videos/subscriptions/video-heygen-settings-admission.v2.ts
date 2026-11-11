import type { VideoMcpClient, VideoTokenGuard } from './video-mcp-client';
import type { SubscriptionEndpoint } from './video-provider-registry';
import { HttpException } from '@nestjs/common';
import { videoErrorV1 } from '../video-brief.v1';
import { HEYGEN_SETTINGS_SCHEMA_V2, type HeygenRecipeBindingV2, type HeygenVideoSettingsV2, type HeygenSettingsQualificationV2 } from './video-heygen-settings.v2';
import type { HeygenPersonProfileFrozenV1 } from './video-heygen-person-profile.v1';
import type { VideoMediaV1 } from '../video-media.v1';
import { HEYGEN_BACKGROUND_ASSET_ORIGIN_V1 } from './video-heygen-advanced-qualification.v1';

type OwnedMediaAccess = {
  organizationId: string;
  media: Pick<VideoMediaV1, 'inspectOwnedImage' | 'inspectRemoteImage'>;
  mediaRow: (organizationId: string, mediaId: string) => Promise<{type: string | null; path: string} | null>;
};

const imageChanged = (): never => {
  throw new HttpException({code: 'VIDEO_HEYGEN_SETTING_UNAVAILABLE', setting: 'background_asset', reason: 'background_asset_content_mismatch',
    remedy: 'Choose an owned HeyGen image with a current matching local copy.'}, 409);
};

export function assertHeygenApprovedVoiceBaselineV2(profile: HeygenPersonProfileFrozenV1, settings: HeygenVideoSettingsV2) {
  const engine = settings.voiceSettings?.engineSettings, saved = profile.voiceBaseline?.engineSettings;
  if (settings.voiceId !== profile.voiceId || engine && !profile.voiceEngine && !saved ||
    profile.voiceEngine && engine?.engine_type !== profile.voiceEngine ||
    saved && (!engine || saved.engine_type !== engine.engine_type || 'model' in saved && saved.model && (!('model' in engine) || engine.model !== saved.model)))
    throw new HttpException({code: 'VIDEO_HEYGEN_SETTING_UNAVAILABLE', setting: 'voice_engine',
      remedy: 'Keep the human-selected saved voice engine/model. Qualify it before rendering; never substitute the provider default.'}, 409);
}

/** Server-only observations; a supplied schema/account/capability object is never authority. */
export async function readHeygenSettingsQualificationV2(mcp: VideoMcpClient, def: SubscriptionEndpoint, token: string,
  binding: HeygenRecipeBindingV2, settings: HeygenVideoSettingsV2, guard: VideoTokenGuard, mediaAccess?: OwnedMediaAccess): Promise<HeygenSettingsQualificationV2> {
  const account = await mcp.readHeygenAccountV1(def, token, guard);
  if (account.subjectDigest !== binding.subjectDigest) return videoErrorV1('VIDEO_CONNECTION_CHANGED', 409);
  const {catalog} = await mcp.readHeygenOwnedCatalog(def, token, guard);
  const observations = new Map<string, any>();
  for (const id of [...new Set([settings.sourceLookId, settings.appearanceLookId, settings.animationReferenceLookId].filter((v): v is string => !!v))]) {
    const look = catalog.avatars.find(look => look.id === id);
    if (!look?.groupId || !look.avatarType) return videoErrorV1('VIDEO_SUBSCRIPTION_OPTION_UNAVAILABLE', 409);
    const group = await mcp.readHeygenOwnedAvatarGroup(def, token, {avatarId: id, groupId: look.groupId}, guard);
    const population = catalog.avatars.filter(candidate => candidate.groupId === look.groupId);
    const photoOnlyAnimation = group.looksCount !== undefined && group.looksCount > 0 && group.looksCount === population.length &&
      population.every(candidate => candidate.avatarType === 'photo_avatar');
    observations.set(id, {lookId: id, groupId: look.groupId, ready: look.selectableForDraft && !['failed', 'training'].includes(look.state),
      owned: look.ownership === 'owned', consentState: group.consentState, avatarType: look.avatarType, engines: look.engines,
      ...(photoOnlyAnimation ? {photoOnlyAnimation: true} : {})});
  }
  const source = observations.get(settings.sourceLookId), voice = catalog.voices.find(voice => voice.id === settings.voiceId);
  const voiceId = settings.voiceSettings?.engineSettings ? settings.voiceId : undefined;
  const glossaryId = settings.sourceMode === 'text' ? settings.brandGlossaryId : undefined;
  const background = settings.background?.type === 'image' ? settings.background : undefined;
  const audioAssetId = settings.sourceMode === 'audio_asset' ? settings.audioAssetId : undefined;
  const appearance = settings.removeBackground === true ? {lookId: settings.appearanceLookId, groupId: settings.groupId} : undefined;
  let backgroundQualified = false;
  const advanced = voiceId || glossaryId || background || audioAssetId || appearance
    ? await mcp.readHeygenAdvancedOptionsV1(def, token, {subjectDigest: binding.subjectDigest, voiceId, glossaryId,
      backgroundAssetId: background?.assetId, audioAssetId, appearance}, guard, background && mediaAccess ? async image => {
        if (image.assetId !== background.assetId) return imageChanged();
        const owned = await mediaAccess.mediaRow(mediaAccess.organizationId, background.mediaId);
        if (owned?.type !== 'image') return imageChanged();
        const local = await mediaAccess.media.inspectOwnedImage(owned.path).catch(imageChanged);
        if (local.contentDigest !== background.contentDigest) return imageChanged();
        const remote = await mediaAccess.media.inspectRemoteImage(image.url, HEYGEN_BACKGROUND_ASSET_ORIGIN_V1)
          .catch(() => videoErrorV1('VIDEO_HEYGEN_BACKGROUND_DOWNLOAD_UNAVAILABLE', 409));
        if (remote.contentDigest !== local.contentDigest) return imageChanged();
        backgroundQualified = true;
      } : undefined)
    : undefined;
  // Provider identity is useful evidence, but it cannot bind the selected local
  // file or an original recording to the provider asset's bytes.
  const unqualifiedAsset = (!backgroundQualified ? advanced?.backgroundAsset : undefined) ?? advanced?.audioAsset;
  if (unqualifiedAsset) throw new HttpException({code: 'VIDEO_HEYGEN_SETTING_UNAVAILABLE', ...unqualifiedAsset.limitation}, 409);
  await guard();
  return {schemaDigest: HEYGEN_SETTINGS_SCHEMA_V2, connectionId: binding.connectionId, subjectDigest: binding.subjectDigest,
    accountGeneration: binding.accountGeneration, resolutions: account.plan === 'creator' ? ['720p', '1080p'] : ['720p'],
    source: {lookId: source.lookId, groupId: source.groupId, ready: source.ready, owned: source.owned, consentState: source.consentState},
    appearance: {...observations.get(settings.appearanceLookId), ...(advanced?.matting ? {matting: advanced.matting.matting} : {})},
    ...(settings.animationReferenceLookId ? {animationReference: observations.get(settings.animationReferenceLookId)} : {}),
    ...(voice ? {voice: {voiceId: voice.id, ready: voice.state === 'available' && (advanced?.voice?.voice.ready ?? true),
      owned: voice.ownership === 'owned', locales: voice.locales,
      ...(advanced?.voice ? {engineTypes: advanced.voice.voice.engineTypes} : {})}} : {}),
    ...(backgroundQualified && background ? {ownedBackgroundAssetIds: [background.assetId]} : {}),
    ...(advanced?.glossary?.owned ? {ownedGlossaryIds: [advanced.glossary.glossaryId]} : {})};
}
