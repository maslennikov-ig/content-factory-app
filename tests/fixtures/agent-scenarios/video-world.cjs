'use strict';

/** Stateful service boundary for chat scenarios; no provider, worker or transport.
 * Domain persistence/credit rules have their own video PostgreSQL tests. Here
 * exact calls, approval, actor scope and read-versus-write effects are observed.
 */
const IDS = {
  piece: '11111111-1111-4111-8111-111111111111',
  draft: '22222222-2222-4222-8222-222222222222',
  apiJob: '33333333-3333-4333-8333-333333333333',
  apiPreflight: '44444444-4444-4444-8444-444444444444',
  media: '55555555-5555-4555-8555-555555555555',
  accessPreflight: '66666666-6666-4666-8666-666666666666',
  subscriptionJob: '77777777-7777-4777-8777-777777777777',
  resumeJob: '88888888-8888-4888-8888-888888888888',
  unknownJob: '99999999-9999-4999-8999-999999999999',
  manualJob: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  connection: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  foreignDraft: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
};
const SOURCE = 'Созвоны без повестки съедают день.';
const SETTINGS = { provider: 'higgsfield', model: 'wan-2.5', mode: 'clip', locale: 'ru', duration: 5, aspectRatio: '9:16', audio: false, captions: false };
const ACCESS = { kind: 'subscription', connectionId: IDS.connection };
const copy = (value) => structuredClone(value);
const draft = () => ({ id: IDS.draft, pieceId: IDS.piece, organizationId: 'org-1', version: 1,
  brief: { prompt: SOURCE, script: SOURCE, referenceMediaIds: [] }, settings: copy(SETTINGS) });
const job = (id, kind, state = 'completed') => ({
  id, organizationId: 'org-1', actorId: 'user-1', pieceId: IDS.piece, draftId: IDS.draft, state,
  access: kind === 'subscription' ? copy(ACCESS) : { kind: 'api', payer: 'workspace_key' },
  snapshot: { brief: draft().brief, settings: copy(SETTINGS) },
  receipt: { requestId: `receipt-${id}` },
  result: state === 'completed' ? { id: IDS.media, name: 'Созвоны.mp4' } : null,
});
const videoRows = (overrides = {}) => ({
  pieces: [{ id: IDS.piece, code: 'cnt-video', title: 'Про созвоны', body: SOURCE, archivedAt: null, questions: [], answers: [], revisions: [] }],
  video: { drafts: [draft()], jobs: [], apiPreflight: null, accessPreflight: null,
    media: [{ id: IDS.media, organizationId: 'org-1', name: 'Созвоны.mp4', type: 'video' }], ...copy(overrides) },
});
const summary = (turn, tool) => turn.outputs.find((one) => one.toolName === tool)?.output.summary.untrustedData.value;
const launchInput = (v2 = false, requestMessageId = 'msg-user-1') => ({ draftId: IDS.draft, version: 1,
  preflightId: v2 ? IDS.accessPreflight : IDS.apiPreflight, requestMessageId });

const videoServices = ({ rows, requests, writes, scoped }) => {
  if (!rows.video) return {};
  const data = rows.video;
  const fail = (code) => { throw Object.assign(new Error(code), { code }); };
  const call = (name, org, actor, ...args) => {
    scoped(name, org);
    if (actor !== null && actor !== 'user-1') fail('VIDEO_ACCESS_DENIED');
    requests.push([name, org, actor, ...copy(args)]);
  };
  const owned = (items, org, id) => items.find((one) => one.id === id && one.organizationId === org) ?? fail('VIDEO_NOT_FOUND');
  const current = (org, id, version) => {
    const row = owned(data.drafts, org, id);
    if (version !== undefined && row.version !== version) fail('VIDEO_DRAFT_CHANGED');
    return row;
  };
  const view = (row) => {
    const { organizationId, actorId, receipt, intentId, preflightId, ...publicRow } = row;
    return copy(publicRow);
  };
  const apiApproval = (org, id) => {
    const row = current(org, id);
    return { id, version: row.version, preflightId: IDS.apiPreflight, brief: copy(row.brief), settings: copy(row.settings),
      payer: 'workspace_key', estimate: { usd: 0.25 }, maxCostUsd: 1 };
  };
  const accessApproval = (org, input) => {
    const row = current(org, input.draftId, input.version);
    return { id: IDS.accessPreflight, preflightId: IDS.accessPreflight, draftId: row.id, version: row.version,
      brief: copy(row.brief), settings: copy(row.settings), access: copy(input.access),
      quote: { amount: '8', unit: 'higgsfield_credit' }, perJob: '10', perMonth: '100', remaining: '100', accountGeneration: 1, providerBillingCap: false };
  };
  const launch = (org, actor, input, approval, id, access) => {
    if (!approval || approval.preflightId !== input.preflightId) fail('VIDEO_PREFLIGHT_STALE');
    current(org, approval.draftId ?? approval.id, approval.version);
    const existing = data.jobs.find((one) => one.organizationId === org && one.intentId === input.intentId);
    if (existing) return view(existing);
    const saved = { ...job(id, access.kind, 'accepted'), receipt: null, actorId: actor,
      access: copy(access), preflightId: input.preflightId, intentId: input.intentId };
    data.jobs.push(saved);
    writes.push(['video.launched', id, input.preflightId]);
    return view(saved);
  };
  return {
    VideoJobService: {
      catalog: async (org) => { call('video.catalog', org, null); return { routes: [{ ...SETTINGS, available: true }] }; },
      prepare: async (org, actor, input) => {
        call('video.prepare', org, actor, input);
        if (input.pieceId !== IDS.piece || input.prepareWithAi !== false) fail('VIDEO_SCENARIO_RAW_DRAFT_REQUIRED');
        const saved = { ...draft(), settings: copy(input.settings) };
        data.drafts.push(saved); writes.push(['video.prepared', saved.id]); return view(saved);
      },
      listDrafts: async (org, pieceId) => { call('video.drafts', org, null, pieceId); return data.drafts.filter((one) => one.organizationId === org && (!pieceId || one.pieceId === pieceId)).map(view); },
      readDraft: async (org, id) => { call('video.draft', org, null, id); return view(current(org, id)); },
      updateDraft: async (org, actor, id, input) => {
        call('video.edit', org, actor, id, input);
        const saved = current(org, id, input.version);
        for (const key of ['prompt', 'script']) if (input[key] !== undefined) saved.brief[key] = input[key];
        saved.version += 1; data.apiPreflight = null; data.accessPreflight = null;
        writes.push(['video.edited', id, saved.version]); return view(saved);
      },
      preflight: async (org, actor, id) => {
        call('video.preflight', org, actor, id); data.apiPreflight = apiApproval(org, id);
        writes.push(['video.preflight', IDS.apiPreflight]); return copy(data.apiPreflight);
      },
      getPreflight: async (org, actor, id, preflightId) => {
        call('video.approval', org, actor, id, preflightId);
        if (!data.apiPreflight || data.apiPreflight.preflightId !== preflightId || data.apiPreflight.id !== id) fail('VIDEO_PREFLIGHT_STALE');
        current(org, id, data.apiPreflight.version); return copy(data.apiPreflight);
      },
      launch: async (org, actor, input) => {
        call('video.launch', org, actor, input);
        return launch(org, actor, input, data.apiPreflight, IDS.apiJob, { kind: 'api', payer: 'workspace_key' });
      },
      list: async (org, pieceId) => { call('video.jobs', org, null, pieceId); return data.jobs.filter((one) => one.organizationId === org && one.access.kind === 'api' && (!pieceId || one.pieceId === pieceId)).map(view); },
      get: async (org, id) => { call('video.status', org, null, id); return view(owned(data.jobs, org, id)); },
      cancel: async (org, actor, id) => {
        call('video.cancel', org, actor, id); const saved = owned(data.jobs, org, id);
        if (saved.state !== 'queued' || !saved.receipt) fail('VIDEO_CANCEL_UNAVAILABLE');
        saved.state = 'canceled'; writes.push(['video.canceled', id]); return view(saved);
      },
      retrySave: async (org, actor, id) => {
        call('video.retry-save', org, actor, id); const saved = owned(data.jobs, org, id);
        if (saved.state !== 'save_failed') fail('VIDEO_SAVE_RETRY_UNAVAILABLE');
        saved.state = 'saving'; writes.push(['video.retry-save', id]); return view(saved);
      },
    },
    VideoAccessService: {
      choices: async (org, actor) => { call('video.access-v2', org, actor); return { workspaceEnabled: true, connections: [{ id: IDS.connection, provider: 'higgsfield', unit: 'higgsfield_credit' }], providers: [] }; },
      preflight: async (org, actor, input) => {
        call('video.preflight-v2', org, actor, input);
        if (JSON.stringify(input.access) !== JSON.stringify(ACCESS)) fail('VIDEO_ACCESS_DENIED');
        data.accessPreflight = accessApproval(org, input); writes.push(['video.preflight-v2', IDS.accessPreflight]); return copy(data.accessPreflight);
      },
      approval: async (org, actor, id) => {
        call('video.approval-v2', org, actor, id);
        if (!data.accessPreflight || data.accessPreflight.id !== id) fail('VIDEO_PREFLIGHT_STALE');
        current(org, data.accessPreflight.draftId, data.accessPreflight.version); return copy(data.accessPreflight);
      },
      repository: { db: { videoAccessPreflight: { findFirst: async ({ where }) => {
        call('video.saved-approval-v2', where.organizationId, where.actorId, where.id);
        const saved = data.accessPreflight;
        return saved?.id === where.id ? { id: saved.id, draftId: saved.draftId, draftVersion: saved.version } : null;
      } } } },
      launch: async (org, actor, input) => {
        call('video.launch-v2', org, actor, input);
        return launch(org, actor, input, data.accessPreflight, IDS.subscriptionJob, ACCESS);
      },
      list: async (org, actor, pieceId) => { call('video.jobs-v2', org, actor, pieceId); return data.jobs.filter((one) => one.organizationId === org && (!pieceId || one.pieceId === pieceId)).map(view); },
      get: async (org, actor, id) => { call('video.status-v2', org, actor, id); return view(owned(data.jobs, org, id)); },
      attach: async (org, actor, input) => {
        call('video.manual-v2', org, actor, input); const saved = current(org, input.draftId, input.version);
        const media = owned(data.media, org, input.mediaId);
        const attachment = { ...job(IDS.manualJob, 'api'), access: { kind: 'manual' }, draftVersion: saved.version,
          cost: { amount: null, unit: null, certainty: 'external_unknown' }, result: { id: media.id, name: media.name } };
        data.jobs.push(attachment); writes.push(['video.attached', attachment.id, media.id]); return view(attachment);
      },
      action: async (org, actor, id, action) => {
        call('video.action-v2', org, actor, id, action); const saved = owned(data.jobs, org, id);
        if (saved.actorId !== actor) fail('VIDEO_ACCESS_DENIED');
        if (action === 'retry-save' && saved.state === 'save_failed') saved.state = 'saving';
        else if (action === 'resume' && ['reauth_required', 'status_delayed'].includes(saved.state) && saved.receipt) saved.state = 'queued';
        else fail('VIDEO_SAVE_RETRY_UNAVAILABLE');
        writes.push(['video.action-v2', id, action]); return view(saved);
      },
    },
  };
};

module.exports = { IDS, SOURCE, SETTINGS, ACCESS, draft, job, videoRows, videoServices, summary, launchInput };
