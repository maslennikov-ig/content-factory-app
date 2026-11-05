'use strict';

/** Native chat service boundary only. Real production/inspection/storage rules
 * remain covered by the video and social-factory domain suites. No transport,
 * provider, model or database is constructed by this recorded world. */
const { loadTypeScriptModule } = require('../../helpers/load-ts-module.cjs');
const fail = code => { throw Object.assign(new Error(code), { code }); };
const { parseProductionManifestV1, videoProductionDigestV1 } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/videos/production/video-production.v1.ts',
  { '../video-brief.v1': { videoErrorV1: fail } }
);
const copy = value => structuredClone(value);
const IDS = {
  piece: '11111111-1111-4111-8111-111111111121',
  media: '22222222-2222-4222-8222-222222222221',
  production: 'sf-video-revision-1', foreign: 'sf-video-foreign', otherActor: 'sf-video-other-actor',
  recovery: 'sf-video-recovery', completed: 'sf-video-completed', rejected: 'sf-video-inspection-rejected',
  campaign: 'sf-video-campaign', item: 'sf-video-item', finalItem: 'sf-video-final-item', rejectedItem: 'sf-video-rejected-item',
  operation: 'sf-video-operation', finalOperation: 'sf-video-final-operation', rejectedOperation: 'sf-video-rejected-operation',
  finalJob: 'sf-video-final-job', sceneJob: 'sf-video-scene-job', unsentJob: 'sf-video-unsent-job',
};
const SOURCE_REVISION = 'piece-source-revision-4';
const manifest = () => parseProductionManifestV1({ version: 1, pieceId: IDS.piece, pieceRevision: SOURCE_REVISION,
  title: 'Как подготовить мастерскую', locale: 'ru', aspectRatio: '9:16', resolution: '1080p',
  durationSeconds: 30, audio: true, captions: true,
  scenes: [{ id: 'intro', kind: 'presenter', durationSeconds: 30, script: 'Проверьте инструмент перед началом работы.',
    avatarId: 'owned-presenter', voiceId: 'owned-voice', engine: 'avatar_iv' }] });
const intentId = 'social_factory_video_revision_001';
const digest = videoProductionDigestV1(manifest());
const approval = () => ({ id: 'sf-video-approval', actorId: 'user-1', expiresAt: '2099-01-01T00:00:00.000Z',
  maxTotalUsd: 3, estimatesUsd: 0.8, blockers: [], scenes: [{ sceneId: 'intro', kind: 'generation',
    jobId: IDS.sceneJob, reused: false, provider: 'heygen', model: 'heygen-avatar', payer: 'workspace_key', reservedUsd: 1 }],
  finalJobId: IDS.finalJob, final: { provider: 'heygen', model: 'hyperframes', payer: 'workspace_key', reservedUsd: 1 } });
const productionRow = (overrides = {}) => ({ id: IDS.production, organizationId: 'org-1', userId: 'user-1',
  productionId: 'sf-video-root', revision: 1, parentId: null, intentId, manifest: manifest(), digest,
  state: 'draft', approval: null, jobs: [], result: null, stoppedAt: null, ...copy(overrides) });
const measuredResult = () => ({ id: IDS.media, name: 'Мастерская.mp4', path: '/scenario/workshop.mp4', type: 'video',
  width: 1080, height: 1920, durationSeconds: 29.4, metadata: { source: 'mp4_bytes', sha256: 'a'.repeat(64) },
  captions: { burned: 'provider_confirmed', sourceJobIds: [IDS.sceneJob] }, subtitles: [] });
const videoRows = (overrides = {}) => ({ socialFactoryVideo: {
  productions: [], pieces: [{ id: IDS.piece, organizationId: 'org-1', revision: SOURCE_REVISION }],
  operations: [], items: [], launches: 0, storageRetries: 0, nativeSaves: 0, ...copy(overrides),
} });
const summary = (turn, tool) => turn.outputs.find(one => one.toolName === tool)?.output.summary?.untrustedData?.value;

const socialFactoryVideoServices = ({ rows, requests, writes, scoped }) => {
  if (!rows.socialFactoryVideo) return {};
  const data = rows.socialFactoryVideo;
  const call = (name, org, actor, ...args) => {
    scoped(name, org);
    if (actor !== null && actor !== 'user-1') fail('VIDEO_PRODUCTION_ACTOR_MISMATCH');
    requests.push([name, org, actor, ...copy(args)]);
  };
  const owned = (table, org, id, code = 'VIDEO_PRODUCTION_NOT_FOUND') =>
    table.find(row => row.id === id && row.organizationId === org) ?? fail(code);
  const view = row => { const { organizationId, userId, intentId: _intent, ...value } = row; return copy(value); };
  const activeItem = (org, operation) => {
    const item = owned(data.items, org, operation.itemId, 'CAMPAIGN_VIDEO_SCOPE');
    if (item.campaignId !== operation.campaignId || item.contentRevision !== operation.contentRevision || item.state === 'cancelled') fail('CAMPAIGN_PRODUCTION_CONTENT_CHANGED');
    return item;
  };
  const videos = {
    createRevision: async (org, actor, input) => {
      call('production.create', org, actor, input);
      const parsed = parseProductionManifestV1(input.manifest);
      const piece = owned(data.pieces, org, parsed.pieceId, 'VIDEO_SOURCE_CHANGED');
      if (piece.revision !== parsed.pieceRevision) fail('VIDEO_SOURCE_CHANGED');
      const currentDigest = videoProductionDigestV1(parsed);
      const existing = data.productions.find(row => row.organizationId === org && row.intentId === input.intentId);
      if (existing) { if (existing.digest !== currentDigest) fail('VIDEO_PRODUCTION_INTENT_CONFLICT'); return view(existing); }
      const parent = input.parentId ? owned(data.productions, org, input.parentId) : null;
      const row = productionRow({ id: data.productions.some(row => row.id === IDS.production) ? 'sf-video-revision-2' : IDS.production,
        intentId: input.intentId, manifest: parsed, digest: currentDigest, parentId: parent?.id ?? null,
        revision: parent ? parent.revision + 1 : 1, productionId: parent?.productionId ?? 'sf-video-root' });
      data.productions.push(row); writes.push(['production.created', row.id, row.revision]); return view(row);
    },
    get: async (org, id) => { call('production.open', org, null, id); return view(owned(data.productions, org, id)); },
    preflight: async (org, actor, id, input) => {
      call('production.preflight', org, actor, id, input);
      const row = owned(data.productions, org, id);
      if (row.userId !== actor) fail('VIDEO_PRODUCTION_ACTOR_MISMATCH');
      if (!['draft', 'preflight'].includes(row.state) || row.stoppedAt) fail('VIDEO_PRODUCTION_APPROVAL_STALE');
      row.approval = { ...approval(), maxTotalUsd: input.maxTotalUsd,
        blockers: input.maxTotalUsd < 2 ? ['VIDEO_PRODUCTION_TOTAL_BUDGET_EXCEEDED'] : [] };
      row.state = 'preflight'; writes.push(['production.preflight', id, input.maxTotalUsd]); return view(row);
    },
    approveAndLaunch: async (org, actor, id, input) => {
      call('production.launch', org, actor, id, input);
      const row = owned(data.productions, org, id);
      if (row.userId !== actor || row.approval?.actorId !== actor || row.approval.id !== input.approvalId || row.digest !== input.digest) fail('VIDEO_PRODUCTION_APPROVAL_STALE');
      if (row.state === 'approved') return view(row);
      if (row.state !== 'preflight' || row.approval.blockers.length) fail('VIDEO_PRODUCTION_PREFLIGHT_BLOCKED');
      row.state = 'approved'; row.approval.acceptedAt = '2026-09-27T10:00:00.000Z';
      row.jobs = [{ id: IDS.sceneJob, state: 'accepted', receipt: null, generationAttempt: 0 },
        { id: IDS.finalJob, state: 'awaiting_assets', receipt: null, generationAttempt: 0 }];
      data.launches++; writes.push(['production.launched', id, input.approvalId]); return view(row);
    },
    stop: async (org, actor, id) => {
      call('production.stop', org, actor, id); const row = owned(data.productions, org, id);
      row.state = 'stopped'; row.stoppedAt ??= '2026-09-27T10:00:00.000Z';
      for (const job of row.jobs) if (['accepted', 'awaiting_assets'].includes(job.state)) { job.state = 'canceled'; job.costUsd = 0; }
      writes.push(['production.stopped', id]); return view(row);
    },
    retrySave: async (org, actor, id, jobId) => {
      call('production.retry-save', org, actor, id, jobId); const row = owned(data.productions, org, id);
      if (row.userId !== actor) fail('VIDEO_PRODUCTION_ACTOR_MISMATCH');
      const job = row.jobs.find(job => job.id === jobId);
      if (!job) fail('VIDEO_PRODUCTION_JOB_NOT_FOUND');
      if (job.state !== 'save_failed') fail('VIDEO_SAVE_RETRY_UNAVAILABLE');
      job.state = 'saving'; if (row.state === 'needs_attention' && !row.stoppedAt) row.state = 'approved';
      data.storageRetries++; writes.push(['production.retry-save', id, jobId]); return view(row);
    },
  };
  return { VideoProductionService: videos, SocialFactoryProductionService: {
    bindVideo: async (org, actor, campaignId, itemId, input) => {
      call('campaign.bind-video', org, actor, campaignId, itemId, input);
      const op = owned(data.operations, org, input.operationId, 'CAMPAIGN_VIDEO_SCOPE');
      if (op.campaignId !== campaignId || op.itemId !== itemId) fail('CAMPAIGN_VIDEO_SCOPE');
      activeItem(org, op);
      const piece = owned(data.pieces, org, op.pieceId, 'CAMPAIGN_VIDEO_SOURCE_MISSING');
      const production = await videos.createRevision(org, actor, { manifest: { ...input.manifest, pieceId: piece.id, pieceRevision: piece.revision },
        intentId: input.intentId, ...(input.parentId ? { parentId: input.parentId } : {}) });
      op.productionId = production.id; writes.push(['campaign.video-bound', itemId, production.id]); return production;
    },
    finalizeVideo: async (org, actor, operationId) => {
      call('campaign.finalize-video', org, actor, operationId);
      const op = owned(data.operations, org, operationId, 'CAMPAIGN_VIDEO_SCOPE');
      const row = owned(data.productions, org, op.productionId);
      if (row.state !== 'completed' || !row.result) return { state: row.state, production: view(row) };
      if (op.finalizedResultId === row.result.id) return { state: op.state, material: copy(op.material), regenerated: false };
      const item = activeItem(org, op), media = row.result;
      const job = row.jobs.find(job => job.id === row.approval?.finalJobId);
      if (job?.state !== 'completed' || job.resultMediaId !== media.id) fail('VIDEO_FINAL_RESULT_MISMATCH');
      if (media.metadata?.source !== 'mp4_bytes' || !/^[a-f0-9]{64}$/.test(media.metadata.sha256) || !media.durationSeconds || !media.width || !media.height) fail('VIDEO_ACTUAL_METADATA_REQUIRED');
      if (!['provider_confirmed', 'authored_timed_cues', 'retained_scene_lineage'].includes(media.captions?.burned) || !media.captions.sourceJobIds?.length) fail('VIDEO_CAPTIONS_UNVERIFIED');
      const ready = row.inspection?.complete === true;
      const material = { version: 1, pieceId: op.pieceId, derivationId: ready ? 'sf-final-native-draft' : undefined,
        title: row.manifest.title, script: row.manifest.scenes.map(scene => scene.script).join('\n\n'),
        assets: [{ id: media.id, mediaId: media.id, kind: 'video', role: 'final', durationSeconds: media.durationSeconds,
          width: media.width, height: media.height, videoEvidence: { metadata: media.metadata, captions: media.captions },
          provenance: { provider: 'heygen', jobId: job.id } }] };
      op.material = material; op.state = ready ? 'ready' : 'needs_revision'; op.finalizedResultId = media.id;
      item.contentRevision++; op.contentRevision = item.contentRevision; item.state = ready ? 'ready' : 'needs_input';
      item.material = copy(material); delete item.approval;
      if (ready) { data.nativeSaves++; writes.push(['campaign.video-native-saved', item.id, media.id]); }
      writes.push(['campaign.video-finalized', item.id, op.state, item.contentRevision]);
      return { state: op.state, material, inspection: copy(row.inspection) };
    },
  } };
};

module.exports = { IDS, SOURCE_REVISION, intentId, digest, manifest, approval, productionRow, measuredResult,
  videoRows, summary, socialFactoryVideoServices };
