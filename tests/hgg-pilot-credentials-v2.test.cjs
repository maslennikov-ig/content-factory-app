const {loadSubscriptionModules} = require('./helpers/video-subscription-provider-fixture.cjs');
const {loadTypeScriptModule} = require('./helpers/load-ts-module.cjs');

function fixture() {
  const m = loadSubscriptionModules();
  const v2 = loadTypeScriptModule('libraries/nestjs-libraries/src/videos/subscriptions/video-hgg-pilot-credentials.v2.ts', m.mocks);
  const hash = m.registry.subscriptionHash;
  const origin = {version: 1, connectionId: 'c', accountGeneration: 1, tokenVersion: 1, workspaceId: 'w', bindingHash: 'origin', qualificationId: 'old', observedAt: '2026-01-01T00:00:00Z', context: 'observed_private_owner', atomicBillingProof: false};
  const current = {...origin, tokenVersion: 2, bindingHash: 'current', qualificationId: 'new'};
  const core = {version: 2, renewalId: 'renew', pilotId: 'pilot', originContextDigest: 'context', connectionId: 'c', accountGeneration: 1, originWorkspaceBindingHash: 'origin', currentWorkspace: current, retainedReferencesDigest: 'references'};
  const credentials = {...core, executionBindingHash: hash(core)};
  const id = hash({kind: 'hgg-execution-credential/v2', org: 'org', actor: 'actor', pilotId: 'pilot', renewalId: 'renew'});
  const renewalId = hash({kind: 'hgg-same-grant-renewal/v1', connectionId: 'c', generation: 1, tokenVersion: 1});
  const rows = new Map([
    [id, {organizationId: 'org', actorId: 'actor', connectionId: 'c', generation: 1, snapshot: {credentials}}],
    [renewalId, {organizationId: 'org', actorId: 'actor', connectionId: 'c', generation: 1, snapshot: {kind: 'hgg-same-grant-renewal/v1', state: 'completed', fromTokenVersion: 1, toTokenVersion: 2}}],
    ['new', {organizationId: 'org', actorId: 'actor', expiresAt: new Date('2026-01-02T00:00:00Z'), snapshot: {kind: 'hgg-workspace/v1', state: 'qualified', binding: current}}],
  ]);
  const read = jest.fn(async ({where}) => {
    const row = rows.get(where.id);
    return row && Object.entries(where).every(([key, value]) => key === 'id' || row[key] === value) ? row : null;
  });
  const tx = {videoAccessPreflight: {findUnique: read}};
  return {credentials, origin, rows, id, renewalId, read, check: c => v2.assertHggExecutionCredentialsV2(tx, 'org', 'actor', c, origin, new Date('2026-01-01T12:00:00Z'))};
}

test('accepts only a persisted same-grant binding to the same current workspace', async () => {
  const f = fixture(); await expect(f.check(f.credentials)).resolves.toBeUndefined();
  expect(f.read.mock.calls.map(([{where}]) => where)).toEqual([
    {id: f.id, organizationId: 'org', actorId: 'actor'},
    {id: f.renewalId, organizationId: 'org', actorId: 'actor'},
    {id: 'new', organizationId: 'org', actorId: 'actor'},
  ]);
  await expect(f.check({...f.credentials, executionBindingHash: 'forged'})).rejects.toMatchObject({response: {code: 'VIDEO_PILOT_RENEWAL_INVALID'}});
  await expect(f.check({...f.credentials, currentWorkspace: {...f.credentials.currentWorkspace, workspaceId: 'other'}})).rejects.toMatchObject({response: {code: 'VIDEO_PILOT_RENEWAL_INVALID'}});
});

test('rejects a pending grant or expired current workspace qualification', async () => {
  const f = fixture(); f.rows.get(f.renewalId).snapshot.state = 'pending';
  await expect(f.check(f.credentials)).rejects.toMatchObject({response: {code: 'VIDEO_PILOT_RENEWAL_INVALID'}});
  f.rows.get(f.renewalId).snapshot.state = 'completed'; f.rows.get('new').expiresAt = new Date('2025-01-01T00:00:00Z');
  await expect(f.check(f.credentials)).rejects.toMatchObject({response: {code: 'VIDEO_PILOT_RENEWAL_INVALID'}});
});

test.each(['binding', 'renewal', 'qualification'].flatMap(kind => ['organizationId', 'actorId'].map(field => [kind, field])))('refuses a persisted %s belonging to another %s', async (kind, field) => {
  const f = fixture(), id = kind === 'binding' ? f.id : kind === 'renewal' ? f.renewalId : 'new';
  f.rows.get(id)[field] = 'foreign';
  await expect(f.check(f.credentials)).rejects.toMatchObject({response: {code: 'VIDEO_PILOT_RENEWAL_INVALID'}});
});

test('a mixed pair retains the original first frame and the renewed last-frame provenance', async () => {
  const m = loadSubscriptionModules();
  const stageContract = loadTypeScriptModule('libraries/nestjs-libraries/src/videos/subscriptions/video-hgg-pilot-stage.v1.ts', m.mocks);
  const policy = loadTypeScriptModule('libraries/nestjs-libraries/src/videos/subscriptions/video-hgg-pilot-policy.v1.ts', {...m.mocks, './video-hgg-pilot-stage.v1': stageContract});
  const f = fixture(); const source = {pilotId: 'pilot', parentRevision: 1};
  const first = {jobId: 'j1', ownedMediaId: 'm1', byteSha256: 'first', providerJobId: 'p1', workspaceBindingHash: 'origin'};
  const last = {jobId: 'j2', ownedMediaId: 'm2', byteSha256: 'last', providerJobId: 'p2', workspaceBindingHash: 'current'};
  const asset = (reference, slot) => ({slot, ownedMediaId: reference.ownedMediaId, byteSha256: reference.byteSha256, providerMediaId: reference.providerJobId, connectionId: 'c', accountGeneration: 1});
  const makeJob = (reference, slot, credentials) => ({id: reference.jobId, state: 'completed', connectionId: 'c', generation: 1, resultMediaId: reference.ownedMediaId,
    request: {kind: 'hgg-pilot-stage/v1', stage: slot, workspace: f.origin, compiled: {input: {source}}, ...(credentials ? {executionCredentials: credentials} : {})},
    storedFile: {path: reference.ownedMediaId, byteSha256: reference.byteSha256}, receipt: {kind: 'image', profile: 'hgg_pilot_job_v1', jobId: reference.providerJobId}});
  const jobs = {j1: makeJob(first, 'first_frame'), j2: makeJob(last, 'last_frame', f.credentials)};
  const tx = {videoSubscriptionJob: {findFirst: async ({where}) => jobs[where.id]}, media: {findFirst: async ({where}) => ({id: where.id, type: 'image', path: where.id})}};
  const stage = {stage: 'clip', workspace: f.origin, executionCredentials: f.credentials, references: [first, last], compiled: {input: {kind: 'video', source, frames: [asset(first, 'first'), asset(last, 'last')]}}};
  await expect(policy.hggPilotReferencesV1(tx, 'org', 'actor', stage, true)).resolves.toBe(true);
  jobs.j2.request.executionCredentials = {...f.credentials, executionBindingHash: 'forged'};
  await expect(policy.hggPilotReferencesV1(tx, 'org', 'actor', stage, true)).rejects.toMatchObject({response: {code: 'VIDEO_PILOT_REFERENCE_INVALID'}});
});

test('renewed epoch changes approval hash while legacy hash remains stable', () => {
  const m = loadSubscriptionModules();
  const contract = loadTypeScriptModule('libraries/nestjs-libraries/src/videos/subscriptions/video-hgg-pilot-stage.v1.ts', m.mocks);
  const stage = {requestHash: 'content', localAdmissionExpiresAt: '2026-01-01T00:10:00Z'};
  const old = contract.hggPilotApprovalHashV1(stage, 'quote', {id: 'budget'});
  expect(contract.hggPilotApprovalHashV1({...stage, executionCredentials: {executionBindingHash: 'new-epoch'}}, 'quote', {id: 'budget'})).not.toBe(old);
  expect(contract.hggPilotApprovalHashV1(stage, 'quote', {id: 'budget'})).toBe(old);
});
