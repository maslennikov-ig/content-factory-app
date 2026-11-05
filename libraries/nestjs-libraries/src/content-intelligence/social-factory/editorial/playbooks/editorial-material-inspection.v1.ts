import { localSceneTextDigestV1 } from '../local-reel-scenes.v1';
import { localCompositionEvidenceV2 } from '../local-composition-evidence.v2';
import type {
  EditorialMaterialV1,
  JsonValueV1,
  ProductionAssetV1,
} from '../../contracts/social-factory.v1';
import { getEditorialPlaybook } from './editorial-playbooks.v1';

export type EditorialMaterialIssueV1 = {
  code: string;
  field: string;
  detail: string;
};
export type EditorialMaterialInspectionV1 = {
  /** Structural production readiness only; never a publishing/rights approval. */
  complete: boolean;
  issues: EditorialMaterialIssueV1[];
  reviewRequired: readonly string[];
};

const text = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;
const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const object = (value: unknown): value is Record<string, JsonValueV1> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

function restrictedRegistryUrl(value: unknown): boolean {
  if (!text(value)) return false;
  try {
    const host = new URL(value).hostname.toLowerCase().replace(/\.$/, '');
    return [
      't.me',
      'telegram.me',
      'telegram.org',
      'telegram.dog',
      'youtube.com',
      'youtu.be',
      'youtube-nocookie.com',
    ].some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

/** The caller must resolve this evidence from the owned video job, never from user input. */
function hasVerifiedBurnedCaptions(video: ProductionAssetV1 | undefined): boolean {
  if (!video || !text(video.provenance?.jobId)) return false;
  // The shared asset contract is owned by stream A; this narrow type is
  // temporary until its additive videoEvidence field is integrated.
  const evidence = (video as ProductionAssetV1 & { videoEvidence?: {
    metadata?: { source?: unknown; sha256?: unknown };
    captions?: { burned?: unknown; sourceJobIds?: unknown };
  } }).videoEvidence;
  const ids = evidence?.captions?.sourceJobIds;
  if (evidence?.metadata?.source !== 'mp4_bytes' || typeof evidence.metadata.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/i.test(evidence.metadata.sha256) || !Array.isArray(ids) ||
      !ids.length || !ids.every(text)) return false;
  if (evidence.captions?.burned === 'provider_confirmed') return ids.includes(video.provenance.jobId);
  return evidence.captions?.burned === 'retained_scene_lineage';
}

/**
 * Called on assembled EditorialMaterialV1 before it is offered for approval.
 * Metadata can establish structural readiness, not file playability/readability.
 * The media service must resolve mediaId within the requesting organization.
 */
export function inspectEditorialMaterial(
  platform: string,
  format: string,
  material: EditorialMaterialV1,
  inspectedAt = new Date().toISOString()
): EditorialMaterialInspectionV1 {
  const issues: EditorialMaterialIssueV1[] = [];
  const fail = (code: string, field: string, detail: string) =>
    issues.push({ code, field, detail });
  let book;
  try {
    book = getEditorialPlaybook(platform, format, material?.destination && material.destination.id===material.channelId?material.destination:undefined);
  } catch {
    return {
      complete: false,
      issues: [
        {
          code: 'unsupported_format',
          field: 'format',
          detail: `No production playbook for ${platform}/${format}.`,
        },
      ],
      reviewRequired: [],
    };
  }
  if (!material || typeof material !== 'object') {
    return {
      complete: false,
      issues: [
        {
          code: 'missing_material',
          field: 'material',
          detail: 'Assemble the material before inspection.',
        },
      ],
      reviewRequired: book.review,
    };
  }
  if (
    material.version !== 1 ||
    material.platform !== platform ||
    material.format !== format
  ) {
    fail(
      'material_mismatch',
      'platform/format/version',
      'Inspect the exact destination and format of this revision.'
    );
  }
  if (!text(material.channelId))
    fail(
      'missing_channel',
      'channelId',
      'Bind the material to its actual channel.'
    );
  if (!text(material.title))
    fail('missing_title', 'title', 'Write an explicit, truthful title.');
  if (!text(material.hook))
    fail('missing_hook', 'hook', 'Supply the actual opening text.');
  if (
    material.playbook?.version !== book.version ||
    material.playbook?.sourceDate !== '2026-11-03'
  ) {
    fail(
      'playbook_mismatch',
      'playbook',
      'Record the version and source date of the playbook actually used.'
    );
  }
  const settings = object(material.settings) ? material.settings : {};
  if (!text(material.cta) && material.ctaSurface !== 'none') {
    fail(
      'missing_cta',
      'cta',
      'Write a relevant next step or explicitly select ctaSurface=none.'
    );
  }
  if (text(material.cta) && material.ctaSurface === 'none') {
    fail(
      'contradictory_cta_surface',
      'ctaSurface',
      'Select the actual surface for this CTA, or remove the CTA text.'
    );
  }
  if (
    text(material.cta) &&
    ![
      'post',
      'bio',
      'story',
      'description',
      'related_video',
      'reply',
      'none',
    ].includes(String(material.ctaSurface))
  ) {
    fail(
      'missing_cta_surface',
      'ctaSurface',
      'Name the actual CTA surface so publishing can check its availability.'
    );
  }

  const evidence = (
    Array.isArray(material.evidence) ? material.evidence : []
  ).filter((entry, index) => {
    if (entry && typeof entry === 'object') return true;
    fail(
      'invalid_evidence',
      `evidence[${index}]`,
      'Supply an evidence object.'
    );
    return false;
  });
  // An observation ID identifies this evidence row; only sourceId identifies
  // the source referenced by asset provenance and source invalidation.
  const sourceIds = new Set(
    evidence.map((entry) => entry.sourceId).filter(text)
  );
  const now = Date.parse(inspectedAt);
  if (!Number.isFinite(now))
    fail(
      'invalid_inspection_time',
      'inspectedAt',
      'Use a valid observation timestamp.'
    );
  for (const [index, entry] of evidence.entries()) {
    if (entry.rights !== 'permitted')
      fail(
        'unresolved_source_rights',
        `evidence[${index}]`,
        'Resolve source rights before material approval.'
      );
    if (
      !text(entry.id) ||
      !text(entry.source) ||
      !Number.isFinite(Date.parse(entry.capturedAt))
    ) {
      fail(
        'invalid_evidence',
        `evidence[${index}]`,
        'Evidence needs an ID, source and valid capture timestamp.'
      );
    }
    if (
      entry.expiresAt &&
      (!Number.isFinite(Date.parse(entry.expiresAt)) ||
        Date.parse(entry.expiresAt) <= now)
    ) {
      fail(
        'expired_evidence',
        `evidence[${index}]`,
        'Refresh or withdraw expired source evidence.'
      );
    }
    if (entry.revokedAt !== undefined) {
      fail(
        'revoked_source_permission',
        `evidence[${index}].revokedAt`,
        'Withdraw material derived from a revoked source permission.'
      );
    }
    if (
      entry.consentExpiresAt !== undefined &&
      (!Number.isFinite(Date.parse(entry.consentExpiresAt)) ||
        Date.parse(entry.consentExpiresAt) <= now)
    ) {
      fail(
        'expired_source_permission',
        `evidence[${index}].consentExpiresAt`,
        'Renew the source permission before editorial reuse.'
      );
    }
    // Acquisition is not ownership: a public URL, upload or first_party access
    // label cannot erase known third-party origin (notably Telegram).
    const ownSource =
      entry.originPlatform === 'first_party' ||
      (entry.access === 'first_party' && !text(entry.originPlatform));
    // The producer resolves this metadata from canonical IDs server-side,
    // never from evidence or permissions supplied by the chat model.
    const authority = entry as typeof entry & {
      permissionBasis?: 'registry_confirmed' | 'scoped_grant';
      rightsConfirmedAt?: string;
    };
    const registryConfirmed =
      authority.permissionBasis === 'registry_confirmed';
    const registryAllowed =
      registryConfirmed &&
      text(entry.sourceId) &&
      text(entry.ownerScope) &&
      text(entry.sourceRevision) &&
      text(authority.rightsConfirmedAt) &&
      Number.isFinite(Date.parse(authority.rightsConfirmedAt)) &&
      Date.parse(authority.rightsConfirmedAt) <= now &&
      entry.purpose === 'editorial' &&
      ['web', 'first_party'].includes(String(entry.originPlatform)) &&
      !restrictedRegistryUrl(entry.sourceUrl);
    if (registryConfirmed && !registryAllowed) {
      fail(
        'invalid_registry_authority',
        `evidence[${index}]`,
        'Resolve current registered-source rights server-side; restricted origins require a scoped grant.'
      );
    }
    if (
      !ownSource &&
      !registryAllowed &&
      (!text(entry.grantId) ||
        entry.purpose !== 'editorial' ||
        !text(entry.consentExpiresAt))
    ) {
      fail(
        'missing_editorial_permission',
        `evidence[${index}]`,
        'Supply an active source grant scoped to editorial reuse; discovery-only permission is insufficient.'
      );
    }
  }
  const assets = (Array.isArray(material.assets) ? material.assets : []).filter(
    (entry, index) => {
      if (entry && typeof entry === 'object') return true;
      fail(
        'invalid_asset',
        `assets[${index}]`,
        'Supply a finished media asset object.'
      );
      return false;
    }
  );
  const assetIds = new Set<string>();
  for (const [index, asset] of assets.entries()) {
    if (!text(asset.id) || assetIds.has(asset.id))
      fail(
        'invalid_asset_id',
        `assets[${index}].id`,
        'Use a unique real asset ID.'
      );
    assetIds.add(asset.id);
    if (
      !['image', 'video', 'audio', 'subtitle', 'document'].includes(asset.kind)
    ) {
      fail(
        'invalid_asset_kind',
        `assets[${index}].kind`,
        'Use a supported production asset kind.'
      );
    }
    if (!text(asset.mediaId))
      fail(
        'unfinished_asset',
        `assets[${index}].mediaId`,
        'Import the finished asset into the media library; a prompt or provider job ID is insufficient.'
      );
    if (
      !text(asset.mimeType) ||
      (['image', 'video', 'audio'].includes(asset.kind) &&
        !asset.mimeType.startsWith(`${asset.kind}/`))
    ) {
      fail(
        'invalid_asset_type',
        `assets[${index}].mimeType`,
        'Use the MIME type of the actual media.'
      );
    }
    if (
      !asset.provenance ||
      !text(asset.provenance.revision) ||
      !Array.isArray(asset.provenance.sourceIds)
    ) {
      fail(
        'missing_asset_provenance',
        `assets[${index}].provenance`,
        'Retain asset revision and source provenance.'
      );
    } else {
      for (const id of asset.provenance.sourceIds)
        if (!sourceIds.has(id)) {
          fail(
            'unknown_asset_source',
            `assets[${index}].provenance.sourceIds`,
            `Resolve source ${id} in material evidence.`
          );
        }
    }
    if (asset.kind === 'image' || asset.kind === 'video') {
      if (
        !finite(asset.width) ||
        asset.width <= 0 ||
        !finite(asset.height) ||
        asset.height <= 0
      ) {
        fail(
          'missing_asset_dimensions',
          `assets[${index}]`,
          'Read dimensions from the finished asset.'
        );
      }
    }
    if (
      asset.kind === 'video' &&
      (!finite(asset.durationSeconds) || asset.durationSeconds <= 0)
    ) {
      fail(
        'missing_video_duration',
        `assets[${index}].durationSeconds`,
        'Read duration from the finished video.'
      );
    }
  }
  const requiredAsset = (kind: ProductionAssetV1['kind'], role?: string) => {
    const found = assets.find(
      (asset) => asset.kind === kind && (!role || asset.role === role)
    );
    if (!found)
      fail(
        'missing_finished_asset',
        `assets.${role || kind}`,
        `Supply the finished ${role || kind} asset.`
      );
    return found;
  };

  if (platform === 'telegram') {
    if (!text(material.body))
      fail('missing_body', 'body', 'Supply the complete post body.');
    if (!text(settings.lengthChoiceId))
      fail(
        'missing_length_choice',
        'settings.lengthChoiceId',
        'Retain the negotiated material-specific length choice.'
      );
    const media = assets.some(
      (asset) => asset.kind === 'image' || asset.kind === 'video'
    );
    const parsed = media ? settings.renderedCaption : settings.renderedText;
    if (!text(parsed))
      fail(
        'parsed_text_required',
        media ? 'settings.renderedCaption' : 'settings.renderedText',
        'Supply final entity-parsed text from the existing Telegram formatter.'
      );
    else if (parsed.length > (media ? 1024 : 4096))
      fail(
        'telegram_text_limit',
        media ? 'caption' : 'body',
        'Use an explicit continuation; do not truncate formatted content.'
      );
    if (
      text(settings.telegramTextContinuation) &&
      settings.telegramTextContinuation.length > 4096
    ) {
      fail(
        'telegram_continuation_limit',
        'settings.telegramTextContinuation',
        'Split the continuation into explicit messages within the selected route limit.'
      );
    }
    if (
      media &&
      text(material.body) &&
      material.body !== material.caption &&
      !text(settings.telegramTextContinuation)
    ) {
      fail(
        'telegram_body_delivery',
        'settings.telegramTextContinuation',
        'Provide the text continuation when a distinct full body is not delivered in the caption.'
      );
    }
  }

  if (platform === 'threads') {
    const posts = Array.isArray(material.posts) ? material.posts : [];
    if (posts.length < 2)
      fail(
        'missing_thread_posts',
        'posts',
        'Supply the starter and at least one substantive follow-up.'
      );
    for (const [index, post] of posts.entries()) {
      if (!object(post) || post.index !== index + 1 || !text(post.text)) {
        fail(
          'invalid_thread_post',
          `posts[${index}]`,
          'Supply nonempty post text with consecutive 1-based indexes.'
        );
      }
    }
    const maxCharacters = settings.maxPostCharacters;
    if (finite(maxCharacters) && maxCharacters > 0)
      for (const [index, post] of posts.entries()) {
        if (
          object(post) &&
          text(post.text) &&
          post.text.length > maxCharacters
        ) {
          fail(
            'thread_text_limit',
            `posts[${index}].text`,
            'Split or edit this post using the selected provider limit.'
          );
        }
      }
  }

  if (format === 'carousel' || format === 'story') {
    const slides = (
      Array.isArray(material.slides) ? material.slides : []
    ).filter((entry, index) => {
      if (entry && typeof entry === 'object') return true;
      fail('invalid_slide', `slides[${index}]`, 'Supply a slide object.');
      return false;
    });
    if (format === 'story' ? slides.length !== 1 : slides.length < 2) {
      fail(
        'invalid_frame_count',
        'slides',
        format === 'story'
          ? 'One Story material is exactly one frame; group separate items into a sequence.'
          : 'A carousel needs at least two finished slides.'
      );
    }
    if (format === 'carousel' && settings.slideCount !== slides.length) {
      fail(
        'missing_slide_count',
        'settings.slideCount',
        'Record the explicit number of carousel slides.'
      );
    }
    for (const [index, slide] of slides.entries()) {
      if (slide.index !== index + 1 || !text(slide.text))
        fail(
          'invalid_slide',
          `slides[${index}]`,
          'Supply readable copy in consecutive 1-based slide order.'
        );
      const asset = assets.find((candidate) => candidate.id === slide.assetId);
      if (
        !asset ||
        (asset.kind !== 'image' &&
          !(format === 'story' && asset.kind === 'video'))
      ) {
        fail(
          'missing_slide_asset',
          `slides[${index}].assetId`,
          'Resolve this frame to its finished image/video, not a visual prompt.'
        );
      }
    }
    if (format === 'carousel' && !text(material.caption))
      fail(
        'missing_caption',
        'caption',
        'Supply a complete publication caption.'
      );
  }

  const videoFormat = ['reel', 'short', 'long_video'].includes(format);
  if (videoFormat) {
    if (!text(material.script))
      fail(
        'missing_script',
        'script',
        'Supply the complete spoken script, not an outline.'
      );
    if (!text(material.caption))
      fail(
        'missing_caption',
        'caption',
        'Supply the post caption or video description.'
      );
    const video = requiredAsset('video', 'final');
    const local=video?.videoEvidence?.localSilent;
    const silentLocal=!!local && local.version===1 && local.speech===false && video?.provenance.provider==='local-reel.v1' && video.provenance.jobId===local.renderKey && /^[a-f0-9]{64}$/.test(video.videoEvidence!.metadata.sha256) && material.sourceArtifact?.revision===local.sourceArtifact.revision && local.sceneTextDigest===localSceneTextDigestV1(material);
    const localComposition=localCompositionEvidenceV2(material,video);
    const screenOnly=!!localComposition?.screenOnly && !!material.scenes?.length && material.scenes.every(scene=>!text(scene.spokenText)&&text(scene.screenText));
    const localCaptions=!!localComposition && (localComposition.captions.kind==='retained_source'||localComposition.captions.kind==='authored_timed_text'&&localComposition.textRendering.physicalBurn&&localComposition.textRendering.speechCaptionCount>0);
    if (!silentLocal && !screenOnly && !localCaptions && !hasVerifiedBurnedCaptions(video)) requiredAsset('subtitle', 'captions');
    if (format !== 'short' || platform === 'tiktok')
      requiredAsset('image', 'cover');
    const scenes = Array.isArray(material.scenes) ? material.scenes : [];
    if (!scenes.length)
      fail(
        'missing_scenes',
        'scenes',
        'Supply complete timed scenes with narration and visual intent.'
      );
    let previousEnd = 0;
    for (const [index, scene] of scenes.entries()) {
      if (
        !object(scene) ||
        scene.index !== index + 1 ||
        !(silentLocal||screenOnly?text(scene.screenText??scene.spokenText):text(scene.spokenText)) ||
        !text(scene.visualIntent) ||
        !finite(scene.startSeconds) ||
        !finite(scene.endSeconds) ||
        scene.startSeconds < 0 ||
        scene.endSeconds <= scene.startSeconds ||
        Math.abs(scene.startSeconds - previousEnd) > 0.1
      ) {
        fail(
          'invalid_scene',
          `scenes[${index}]`,
          'Use ordered contiguous scenes with complete spoken text and matching visual intent.'
        );
      }
      if (object(scene) && finite(scene.endSeconds))
        previousEnd = scene.endSeconds;
    }
    if (
      video &&
      finite(video.durationSeconds) &&
      scenes.length &&
      Math.abs(previousEnd - video.durationSeconds) > 1
    ) {
      fail(
        'scene_duration_mismatch',
        'scenes',
        'The complete scene timing must cover the actual final video.'
      );
    }
    if (format === 'long_video') {
      const chapters = Array.isArray(settings.chapterStarts)
        ? settings.chapterStarts
        : [];
      if (
        chapters.length < 2 ||
        chapters[0] !== 0 ||
        chapters.some(
          (value, index) =>
            !finite(value) ||
            (index > 0 &&
              (!finite(chapters[index - 1]) ||
                value <= Number(chapters[index - 1]))) ||
            (video &&
              finite(video.durationSeconds) &&
              value >= video.durationSeconds)
        )
      ) {
        fail(
          'invalid_chapters',
          'settings.chapterStarts',
          'Supply ordered chapter starts beginning at zero and within the final duration.'
        );
      }
    }
  }
  if (
    platform === 'youtube' &&
    format === 'short' &&
    text(material.cta) &&
    ['description', 'post'].includes(String(material.ctaSurface))
  ) {
    fail(
      'short_nonclickable_cta',
      'ctaSurface',
      'Use an available related-video/profile surface or an on-platform next step; Shorts description/comment URLs are non-clickable.'
    );
  }
  return { complete: issues.length === 0, issues, reviewRequired: book.review };
}
