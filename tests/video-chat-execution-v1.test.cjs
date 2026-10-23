const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const ROOT = '@contentfactory/nestjs-libraries/videos/video-job.service';
class VideoJobService {}
const caps = () => loadTypeScriptModule('libraries/nestjs-libraries/src/chat/capabilities/catalogue/video.capabilities.ts', {
  [ROOT]: { VideoJobService },
  '@contentfactory/backend/api/routes/media.controller': { MediaController: class MediaController {} },
}, { sources: {
  '../capability.types': 'libraries/nestjs-libraries/src/chat/capabilities/capability.types.ts',
  './selection': 'libraries/nestjs-libraries/src/chat/capabilities/catalogue/selection.ts',
} });
const ctx = (service, extras = {}) => ({ organizationId: 'org-a', userId: 'actor', language: 'ru',
  service: () => service, resolveAuthorRequest: async () => ({ messageId: 'author', text: 'Сделай видео' }), ...extras });
const launch = { draftId: 'draft', version: 3, preflightId: 'accepted-quote', requestMessageId: 'author' };

test('video chat launch binds one intent to one immutable preflight across tool replays', async () => {
  const { videoLaunch } = caps();
  const seen = [];
  const jobs = { launch: async (...args) => { seen.push(args); return { id: 'job' }; } };
  await videoLaunch.run(ctx(jobs), launch);
  await videoLaunch.run(ctx(jobs), { ...launch, requestMessageId: 'another-message' });
  expect(seen[0].slice(0, 2)).toEqual(['org-a', 'actor']);
  expect(seen[0][2]).toEqual(seen[1][2]);
  expect(seen[0][2].intentId).toMatch(/^[a-f0-9]{64}$/);
  expect(videoLaunch.risk).toBe('paid');
  expect(videoLaunch.asksInWebChat).toBe(true);
  expect(videoLaunch.door.method).toBe('launchVideoJob');
});

test('video launch refuses fabricated author provenance before entering the domain', async () => {
  const { videoLaunch } = caps();
  const submit = jest.fn();
  await expect(videoLaunch.run(ctx({ launch: submit }, { resolveAuthorRequest: async () => null }), launch))
    .rejects.toMatchObject({ code: 'VIDEO_REQUEST_NOT_AUTHORED' });
  expect(submit).not.toHaveBeenCalled();
});

test('video approval uses stored preflight, checks version and binds script/settings/cost', async () => {
  const { videoLaunch } = caps();
  const preflight = { version: 3, preflightId: 'accepted-quote', route: { provider: 'heygen', model: 'presenter' },
    payer: 'workspace_key', estimate: { usd: 0.6 }, brief: { script: 'Не 12, а 12,5.' }, settings: { provider: 'heygen', model: 'presenter', mode: 'presenter', locale: 'de-DE', duration: 15, aspectRatio: '9:16', audio: true, captions: false } };
  const read = jest.fn(async () => preflight);
  expect(await videoLaunch.approvalContent(ctx({ getPreflight: read }), launch)).toBe(preflight);
  expect(await videoLaunch.describeApproval(ctx({ getPreflight: read }), launch)).toContain('0.6 USD');
  expect(read).toHaveBeenCalledWith('org-a', 'actor', 'draft', 'accepted-quote');
  await expect(videoLaunch.describeApproval(ctx({ getPreflight: async () => ({ ...preflight, version: 4 }) }), launch))
    .rejects.toMatchObject({ code: 'VIDEO_PREFLIGHT_STALE' });
});

test('status and retry-save call tenant-scoped shared doors and return media references', async () => {
  const { videoStatus, videoRetrySave } = caps();
  const get = jest.fn(async () => ({ id: 'job', state: 'completed', mediaId: 'owned-media', pieceId: 'piece' }));
  const retrySave = jest.fn(async () => ({ id: 'job', state: 'saving' }));
  const state = await videoStatus.run(ctx({ get }), { jobId: 'job' });
  expect(get).toHaveBeenCalledWith('org-a', 'job');
  expect(videoStatus.risk).toBe('read');
  expect(videoStatus.cardOf(state)).toMatchObject({ kind: 'media', id: 'library', videoJobId: 'job', pieceId: 'piece' });
  await videoRetrySave.run(ctx({ retrySave }), { jobId: 'job' });
  expect(retrySave).toHaveBeenCalledWith('org-a', 'actor', 'job');
  expect(videoRetrySave.risk).toBe('write');
});

const execution = () => loadTypeScriptModule('libraries/nestjs-libraries/src/videos/video-execution.v1.ts', {
  './video-job.service': { VideoJobService },
});

test('starter uses stable workflow IDs and opaque args; explicit saving gets a separate cycle', async () => {
  const { VideoExecutionV1 } = execution();
  const start = jest.fn(async () => ({}));
  const starter = new VideoExecutionV1({ client: { getRawClient: () => ({ workflow: { start } }) } });
  await starter.start('org-a', 'job');
  await starter.start('org-a', 'job', 2);
  expect(start.mock.calls[0]).toEqual(['videoGenerationWorkflowV1', {
    workflowId: 'video-v1:job', taskQueue: 'main', args: [{ organizationId: 'org-a', jobId: 'job' }], workflowIdReusePolicy: 'ALLOW_DUPLICATE_FAILED_ONLY',
  }]);
  expect(start.mock.calls[1][1].workflowId).toBe('video-v1:job:save:2');
});

test('recovery dispatches persisted pending jobs and isolates a temporary dispatch failure', async () => {
  const { VideoExecutionRecoveryV1 } = execution();
  const start = jest.fn().mockRejectedValueOnce(new Error('transport')).mockResolvedValue(undefined);
  const recoverPending = jest.fn(async () => [{ organizationId: 'org-a', id: 'a', runCycle: 0 }, { organizationId: 'org-b', id: 'b', runCycle: 2 }]);
  const recovery = new VideoExecutionRecoveryV1({ recoverPending }, { start });
  await recovery.recover();
  expect(start.mock.calls).toEqual([['org-a', 'a', 0], ['org-b', 'b', 2]]);
  await recovery.recover();
  expect(recoverPending).toHaveBeenCalledTimes(2);
});

const workflow = (step, expire, sleep, continueAsNew = jest.fn()) => loadTypeScriptModule('apps/orchestrator/src/workflows/video-generation.workflow.v1.ts', {
  '@temporalio/workflow': { proxyActivities: (options) => {
    expect(options.retry.maximumAttempts).toBe(1);
    return { stepVideoGenerationV1: step, expireVideoGenerationV1: expire };
  }, sleep, continueAsNew },
});

test('workflow durable polling stops at owned-media completion and tolerates storage interruption', async () => {
  const step = jest.fn().mockRejectedValueOnce(new Error('storage')).mockResolvedValueOnce({ state: 'saving', done: false }).mockResolvedValueOnce({ state: 'completed', done: true });
  const sleep = jest.fn(async () => {});
  const expire = jest.fn();
  const { videoGenerationWorkflowV1 } = workflow(step, expire, sleep);
  const input = { organizationId: 'org-a', jobId: 'job' };
  expect(await videoGenerationWorkflowV1(input)).toEqual({ state: 'completed', done: true });
  expect(step).toHaveBeenCalledTimes(3);
  expect(sleep.mock.calls).toEqual([[10000], [10000]]);
  expect(expire).not.toHaveBeenCalled();
});

test('workflow 24h cutoff persists uncertainty through domain expiry without another submit', async () => {
  let now = 0;
  const clock = jest.spyOn(Date, 'now').mockImplementation(() => now);
  try {
    const step = jest.fn(async () => ({ state: 'running', done: false }));
    const expire = jest.fn(async () => ({ state: 'uncertain', done: true }));
    const { videoGenerationWorkflowV1 } = workflow(step, expire, async () => { now += 24 * 3600 * 1000; });
    expect(await videoGenerationWorkflowV1({ organizationId: 'org-a', jobId: 'job' })).toEqual({ state: 'uncertain', done: true });
    expect(step).toHaveBeenCalledTimes(1);
    expect(expire).toHaveBeenCalledWith({ organizationId: 'org-a', jobId: 'job' });
  } finally { clock.mockRestore(); }
});

test.each(['busy lease', 'temporary storage failure'])('workflow keeps durable expiry pending after %s', async scenario => {
  const step = jest.fn();
  const expire = scenario === 'busy lease'
    ? jest.fn(async () => ({state: 'running', done: false}))
    : jest.fn(async () => {throw new Error('temporary storage outage');});
  const sleep = jest.fn(async () => {});
  const next = jest.fn(async () => ({state: 'continued', done: false}));
  const {videoGenerationWorkflowV1} = workflow(step, expire, sleep, next);
  const input = {organizationId: 'org-a', jobId: 'job'};
  const deadline = Date.now() - 1;
  await expect(videoGenerationWorkflowV1(input, deadline)).resolves.toEqual({state: 'continued', done: false});
  expect(step).not.toHaveBeenCalled();
  expect(expire).toHaveBeenCalledWith(input);
  expect(sleep).toHaveBeenCalledWith(10000);
  expect(next).toHaveBeenCalledWith(input, deadline);
});


test('paid video launch binds native approval to immutable preflight content', async () => {
  const { approvalContentDigest } = loadTypeScriptModule('libraries/nestjs-libraries/src/chat/capabilities/approval-summary.ts');
  const { videoLaunch } = caps();
  const preflight = { version: 3, preflightId: 'accepted-quote', brief: { script: 'Не 12, а 12,5.' } };
  const first = await approvalContentDigest([videoLaunch], () => ({ getPreflight: async () => preflight }), ctx({}), 'video_launch', launch);
  const changed = await approvalContentDigest([videoLaunch], () => ({ getPreflight: async () => ({ ...preflight, brief: { script: '12.' } }) }), ctx({}), 'video_launch', launch);
  expect(first).toMatch(/^[a-f0-9]+$/);
  expect(changed).not.toBe(first);
});

test('starter accepts a running duplicate and propagates outages for the recovery scanner', async () => {
  const { WorkflowExecutionAlreadyStartedError } = require('@temporalio/client');
  const { VideoExecutionV1 } = execution();
  const start = jest.fn()
    .mockRejectedValueOnce(new WorkflowExecutionAlreadyStartedError('Already started', 'video-v1:job', 'videoGenerationWorkflowV1'))
    .mockRejectedValueOnce(new Error('unavailable'))
    .mockResolvedValueOnce({});
  const starter = new VideoExecutionV1({ client: { getRawClient: () => ({ workflow: { start } }) } });
  await expect(starter.start('org-a', 'job')).resolves.toBeUndefined();
  await expect(starter.start('org-a', 'job')).rejects.toThrow('unavailable');
  await expect(starter.start('org-a', 'job')).resolves.toBeUndefined();
  expect(start.mock.calls.map(([, options]) => options.workflowId)).toEqual(['video-v1:job', 'video-v1:job', 'video-v1:job']);
  expect(start.mock.calls.every(([, options]) => options.workflowIdReusePolicy === 'ALLOW_DUPLICATE_FAILED_ONLY')).toBe(true);
});


test('workflow resets history after 100 steps without resetting its original deadline', async () => {
  const step = jest.fn(async () => ({ state: 'running', done: false }));
  const next = jest.fn(async () => ({ state: 'continued', done: false }));
  const { videoGenerationWorkflowV1 } = workflow(step, jest.fn(), async () => {}, next);
  const input = { organizationId: 'org-a', jobId: 'job' };
  const deadlineAt = Date.now() + 10000000;
  await videoGenerationWorkflowV1(input, deadlineAt);
  expect(step).toHaveBeenCalledTimes(100);
  expect(next).toHaveBeenCalledWith(input, deadlineAt);
});

test('video media artifact IDs persist distinctly and cannot decorate unrelated card kinds', () => {
  const { parseAgentWorkspacePatch, sameAgentArtifact, workContextForArtifact } = loadTypeScriptModule('libraries/nestjs-libraries/src/chat/conductor/work-context.ts');
  const ref = { kind: 'media', id: 'library', pieceId: 'piece', videoJobId: 'job-a', videoDraftId: 'draft-a' };
  expect(parseAgentWorkspacePatch({ artifacts: [ref] }).artifacts).toEqual([ref]);
  expect(sameAgentArtifact(ref, { ...ref, videoJobId: 'job-b' })).toBe(false);
  expect(workContextForArtifact(ref)).toEqual({ version: 'assistant-work-context/v1', ...ref });
  expect(() => parseAgentWorkspacePatch({ artifacts: [{ ...ref, kind: 'piece', id: 'piece' }] })).toThrow();
});

test('workspace validates video artifact through tenant-scoped job reads and rejects mismatched pieces', async () => {
  const mocks = { '@contentfactory/nestjs-libraries/videos/video-job.service': { VideoJobService } };
  for (const [path, name] of [
    ['content-intelligence/pieces/piece.service', 'PieceService'],
    ['content-intelligence/brand-voice/voice.service', 'VoiceService'],
    ['database/prisma/integrations/integration.service', 'IntegrationService'],
    ['content-intelligence/context/content-fact.service', 'ContentFactService'],
    ['content-intelligence/leads/content-lead.service', 'ContentLeadService'],
    ['database/prisma/media/media.service', 'MediaService'],
  ]) mocks[`@contentfactory/nestjs-libraries/${path}`] = { [name]: class {} };
  mocks['@contentfactory/nestjs-libraries/user/organization.roles'] = {};
  const { AgentWorkContextResolver } = loadTypeScriptModule('libraries/nestjs-libraries/src/chat/conductor/work-context.resolver.ts', mocks);
  const get = jest.fn(async (org) => { if (org !== 'org-a') throw new Error('VIDEO_JOB_NOT_FOUND'); return { pieceId: 'piece', draftId: 'draft' }; });
  const resolver = new AgentWorkContextResolver({ services: () => ({ get, readDraft: async () => ({id: 'draft', pieceId: 'piece', version: 1}) }), gate: { check: async () => ({ allowed: true }) }, capabilities: [
    { id: 'video.status', door: {} }, { id: 'video.draft', door: {} }, { id: 'media.library', door: {} },
  ] });
  const ref = { kind: 'media', id: 'library', videoJobId: 'job', pieceId: 'piece' };
  await expect(resolver.validateArtifact(ctx({}), ref)).resolves.toEqual(ref);
  expect(get).toHaveBeenCalledWith('org-a', 'job');
  await expect(resolver.validateArtifact(ctx({}, { organizationId: 'org-b' }), ref)).rejects.toThrow('VIDEO_JOB_NOT_FOUND');
  await expect(resolver.validateArtifact(ctx({}), { ...ref, pieceId: 'other-piece' })).rejects.toThrow();
});

test('active video context resolves current tenant-owned draft and job data and round-trips its identity', async () => {
  const { parseAgentWorkContext, artifactForWorkContext, workContextForArtifact } = loadTypeScriptModule('libraries/nestjs-libraries/src/chat/conductor/work-context.ts');
  const mocks = { '@contentfactory/nestjs-libraries/videos/video-job.service': { VideoJobService } };
  for (const [path, name] of [
    ['content-intelligence/pieces/piece.service', 'PieceService'],
    ['content-intelligence/brand-voice/voice.service', 'VoiceService'],
    ['database/prisma/integrations/integration.service', 'IntegrationService'],
    ['content-intelligence/context/content-fact.service', 'ContentFactService'],
    ['content-intelligence/leads/content-lead.service', 'ContentLeadService'],
    ['database/prisma/media/media.service', 'MediaService'],
  ]) mocks[`@contentfactory/nestjs-libraries/${path}`] = { [name]: class {} };
  mocks['@contentfactory/nestjs-libraries/user/organization.roles'] = {};
  const { AgentWorkContextResolver } = loadTypeScriptModule('libraries/nestjs-libraries/src/chat/conductor/work-context.resolver.ts', mocks);
  let version = 1;
  const readDraft = jest.fn(async (org, id) => {
    if (org !== 'org-a') throw Object.assign(new Error('VIDEO_DRAFT_NOT_FOUND'), { code: 'VIDEO_DRAFT_NOT_FOUND' });
    return { id, pieceId: 'piece', version, brief: { script: `Current script ${version}` }, settings: { mode: 'presenter' } };
  });
  const get = jest.fn(async (org, id) => ({ id, pieceId: 'piece', draftId: 'draft', state: 'running', snapshot: { brief: { prompt: 'Old submitted text. '.repeat(2000), script: 'Old submitted script. '.repeat(2000) } } }));
  const resolver = new AgentWorkContextResolver({ services: () => ({ readDraft, get }), gate: { check: async () => ({ allowed: true }) }, capabilities: [
    { id: 'video.status', door: {} }, { id: 'video.draft', door: {} }, { id: 'media.library', door: {} },
  ] });
  const ref = { kind: 'media', id: 'library', pieceId: 'piece', videoJobId: 'job', videoDraftId: 'draft' };
  const context = workContextForArtifact(ref);
  expect(parseAgentWorkContext(context)).toEqual(context);
  expect(artifactForWorkContext(context)).toEqual(ref);
  const initial = await resolver.resolve(ctx({}), context);
  expect(initial.data).toMatchObject({ videoJob: { id: 'job', state: 'running' }, videoDraft: { id: 'draft', version: 1, brief: { script: 'Current script 1' } } });
  version = 2;
  const fresh = await resolver.resolve(ctx({}), initial.context, { refresh: true });
  expect(fresh.data.videoDraft.brief.script).toBe('Current script 2');
  expect(fresh.context.revision).not.toBe(initial.context.revision);
  expect(readDraft).toHaveBeenCalledWith('org-a', 'draft');
  expect(get).toHaveBeenCalledWith('org-a', 'job');
  const jobOnly = await resolver.resolve(ctx({}), {version: context.version, kind: 'media', videoJobId: 'job'});
  expect(jobOnly.data.videoDraft).toMatchObject({id: 'draft', version: 2, brief: {script: 'Current script 2'}});
  await expect(resolver.resolve(ctx({}, { organizationId: 'org-b' }), context)).rejects.toThrow();
  await expect(resolver.resolve(ctx({}), { ...context, pieceId: 'foreign-piece' })).rejects.toThrow();
  expect(() => parseAgentWorkContext({ ...context, kind: 'piece' })).toThrow();
});

test('paid video approval describes an estimate and reservation without implying a provider cap', async () => {
  const { videoLaunch } = caps();
  const preflight = { version: 3, preflightId: 'accepted-quote', maxCostUsd: 2, payer: 'workspace_key', estimate: { usd: 0.6 },
    settings: { provider: 'heygen', model: 'heygen-avatar', mode: 'presenter', locale: 'ru', duration: 30, aspectRatio: '9:16', resolution: '720p', audio: true, captions: false } };
  expect(await videoLaunch.describeApproval(ctx({ getPreflight: async () => preflight }), launch)).toContain('резервация 2 USD');
  expect(await videoLaunch.describeApproval(ctx({ getPreflight: async () => preflight }), launch)).not.toMatch(/\(предел /);
  expect(await videoLaunch.describeApproval(ctx({ getPreflight: async () => preflight }), launch)).toContain('не предел списания');
});
