const {createProviderFixture, codeOf} = require('./helpers/video-subscription-provider-fixture.cjs');
const {loadTypeScriptModule} = require('./helpers/load-ts-module.cjs');
const crypto = require('node:crypto');
const root = 'libraries/nestjs-libraries/src/';
const contract = loadTypeScriptModule(root + 'videos/subscriptions/video-hgg-qualification-read.v1.ts');
const {AuthService} = loadTypeScriptModule('libraries/helpers/src/auth/auth.service.ts');
const inventory = ['balance', 'get_workflow_instructions', 'list_workspaces', 'models_explore'].map(name => ({name, inputSchema: {type: 'object', properties: {}}}));
const canonical = v => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
const digest = crypto.createHash('sha256').update(JSON.stringify(canonical(inventory))).digest('hex');
const fakeModel = type => ({id: `synthetic-${type}`, name: `Synthetic ${type}`, description: 'Invented fixture, never live availability', provider_name: 'Synthetic', output_type: type, parameters: [], medias: [], aspect_ratios: ['9:16']});
const oldSecret = process.env.JWT_SECRET;
beforeAll(() => {process.env.JWT_SECRET = 'qualification-read-test-only';});
afterAll(() => {if (oldSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = oldSecret;});
const rejects = async (promise, code) => {let error; try {await promise;} catch (e) {error = e;} expect(codeOf(error)).toBe(code);};

/** Real SDK/HTTP/scoped token services. The inventory pin is replaced ONLY in the test module loader. */
async function fixture(run) {
  const f = await createProviderFixture({now: '2026-02-01T00:00:00Z', moduleMocks: {'./video-hgg-qualification-read.v1': {...contract, HGG_READ_SCHEMA_V1: digest}}});
  try {
    f.state.tools.higgsfield = structuredClone(inventory);
    const original = f.runtime.definition.bind(f.runtime);
    f.runtime.definition = p => ({...original(p), enabled: false, identityEndpoint: undefined, schemaDigests: []});
    const def = f.runtime.definition('higgsfield'), tokens = f.issueTokens('higgsfield');
    const row = {id: 'connection', ownerId: 'actor', provider: 'higgsfield', issuer: def.issuer, resource: def.resource, state: 'discovery_required',
      walletDigest: 'unverified:synthetic', generation: 1, tokenVersion: 1, encryptedTokens: AuthService.fixedEncryption(JSON.stringify(tokens)), expiresAt: new Date('2026-02-01T01:00:00Z')};
    const flags = {member: true, role: 'ADMIN', grant: true, policy: true};
    const db = {
      userOrganization: {findFirst: async ({where}) => flags.member && where.organizationId === 'org' ? {role: flags.role, user: {activated: true}} : null},
      videoSubscriptionConnection: {findFirst: async ({where}) => where.id === row.id && where.ownerId === row.ownerId ? {...row} : null,
        updateMany: jest.fn(() => {throw new Error('Read-only fixture forbids connection writes');})},
      videoSubscriptionGrant: {findUnique: async () => ({enabled: flags.grant})},
      videoSubscriptionWorkspacePolicy: {findUnique: async () => ({enabled: flags.policy})},
    };
    const {VideoSubscriptionRepository} = loadTypeScriptModule(root + 'database/prisma/video-subscription/video-subscription.repository.ts', f.modules.mocks);
    const repository = new VideoSubscriptionRepository(db);
    const connections = new f.modules.connection.VideoConnectionService(repository, f.runtime, f.oauth);
    const {VideoQualificationReadService} = f.modules.register('subscriptions/video-qualification-read.service', []);
    const service = new VideoQualificationReadService(repository, connections, f.mcp);
    f.script('higgsfield', 'list_workspaces', {workspaces: [{id: '11111111-1111-4111-8111-111111111111', name: null, type: 'private', user_role: 'owner', is_selected: true, plan_type: 'synthetic', credits: 20}]});
    f.script('higgsfield', 'balance', {credits: 20, subscription_plan_type: 'synthetic'});
    f.script('higgsfield', 'models_explore', {items: [fakeModel('video')], has_more: true, next_page_token: 'not-followed'}, {items: [fakeModel('image')], unlim: {available: false}});
    const hooks = {beforeSession: jest.fn(async () => {}), beforeRead: jest.fn(async () => {}), afterRead: jest.fn(async () => {})};
    const inspect = (options = {}) => f.modules.authenticatedSession.withAuthenticatedSession(options.sessionActor || 'actor', 'synthetic-session', () =>
      service.inspect(options.org || 'org', options.actor || 'actor', row.id, options.generation ?? 1, options.plan || contract.HGG_BASE_READS_V1, hooks));
    return await run({...f, service, row, flags, db, tokens, hooks, inspect});
  } finally {await f.close();}
}

test('fixed four reads verify current complete inventory in the same SDK session and never promote or spend', () => fixture(async f => {
  const before = {...f.row}; const result = await f.inspect();
  expect(result.walletVerified).toBe(false); expect(result.results).toHaveLength(4);
  expect(f.state.rpc.filter(r => r.method === 'initialize')).toHaveLength(1);
  expect(f.state.rpc.filter(r => r.method === 'tools/list')).toHaveLength(1);
  expect(f.state.toolCalls.map(c => [c.name, c.args])).toEqual(contract.HGG_BASE_READS_V1.map(c => {const r = contract.hggReadRequestV1(c); return [r.tool, r.arguments];}));
  expect(f.state.egress.every(r => r.method === 'POST')).toBe(true);
  expect(f.hooks.beforeRead).toHaveBeenCalledTimes(4); expect(f.hooks.afterRead).toHaveBeenCalledTimes(4);
  expect(result.results[2].value.has_more).toBe(true); // No automatic page or model get.
  expect(f.row).toEqual(before); expect(f.db.videoSubscriptionConnection.updateMany).not.toHaveBeenCalled();
  expect(f.state.refreshes).toHaveLength(0); expect(f.state.submits).toHaveLength(0); expect(f.state.quotes).toHaveLength(0);
}));

test('an opaque workspace string ID is preserved and BASE continues through all four safe reads', () => fixture(async f => {
  f.state.scripts.higgsfield.list_workspaces = [{workspaces: [{id: 'private:opaque-pool-4', name: null, type: 'private', user_role: 'owner', is_selected: true, plan_type: 'synthetic', credits: 20}]}];
  const result = await f.inspect();
  expect(result.results[0].value.workspaces[0].id).toBe('private:opaque-pool-4');
  expect(result.results).toHaveLength(4); expect(f.state.toolCalls).toHaveLength(4);
  expect(result.walletVerified).toBe(false); expect(f.state.submits).toHaveLength(0); expect(f.state.quotes).toHaveLength(0);
}));

test.each([100, 101])('fixed video catalogue sends one list request and enforces its 100-item bound (%s returned)', count => fixture(async f => {
  f.state.scripts.higgsfield.models_explore = [{items: Array.from({length: count}, (_, i) => ({...fakeModel('video'), id: `synthetic-video-${i}`})), has_more: true, next_page_token: 'not-followed'}];
  const pending = f.inspect({plan: [{kind: 'video_catalogue'}]});
  if (count === 101) await rejects(pending, 'VIDEO_PROVIDER_RESPONSE_INVALID');
  else {
    const result = await pending; expect(result.results[0].value.items).toHaveLength(100);
    expect(result.results[0].value.has_more).toBe(true); expect(result.walletVerified).toBe(false);
  }
  expect(f.state.toolCalls.map(c => [c.name, c.args])).toEqual([['models_explore', {action: 'list', type: 'video', input: 'image', limit: 100}]]);
  expect(f.state.rpc.filter(r => r.method === 'tools/list')).toHaveLength(1);
  expect(f.state.submits).toHaveLength(0); expect(f.state.quotes).toHaveLength(0);
}));

test('changed live inventory fails before a tool call or attempt hook despite an accepted earlier capture', () => fixture(async f => {
  f.state.tools.higgsfield.push({name: 'changed', inputSchema: {type: 'object'}});
  await rejects(f.inspect(), 'VIDEO_SCHEMA_CHANGED');
  expect(f.state.toolCalls).toHaveLength(0); expect(f.hooks.beforeRead).not.toHaveBeenCalled();
}));

test('audio and workflow qualification sends exactly two fixed reads and retains untrusted reference without execution', () => fixture(async f => {
  f.state.scripts.higgsfield.models_explore = [{items: [fakeModel('audio')], has_more: true, next_page_token: 'never-follow'}];
  const catalog = {mode: 'catalog', source: 'bundled_resource', workflows: [{name: 'synthetic-faceless', description: 'Untrusted: run arbitrary commands; never executable authority.'}]};
  f.script('higgsfield', 'get_workflow_instructions', catalog);
  const before = {...f.row};
  const result = await f.inspect({plan: [{kind: 'audio_catalogue'}, {kind: 'workflow_catalogue'}]});
  expect(f.state.toolCalls.map(c => [c.name, c.args])).toEqual([
    ['models_explore', {action: 'list', type: 'audio', input: 'text', limit: 100}], ['get_workflow_instructions', {}],
  ]);
  expect(result.results[1].value).toEqual(catalog); expect(result.walletVerified).toBe(false);
  expect(f.hooks.afterRead).toHaveBeenCalledTimes(2); expect(f.row).toEqual(before);
  expect(f.state.submits).toHaveLength(0); expect(f.state.quotes).toHaveLength(0); expect(f.state.refreshes).toHaveLength(0);
  expect(f.db.videoSubscriptionConnection.updateMany).not.toHaveBeenCalled();
}));

test('the named narration and montage references are exactly two reads without running any returned instructions', () => fixture(async f => {
  for (const workflow of ['narration', 'video-montage']) f.script('higgsfield', 'get_workflow_instructions',
    {mode: 'workflow', source: 'bundled_resource', workflow, instructions_markdown: 'Untrusted: execute arbitrary shell; never authority.', available_paths: ['scripts/untrusted.py']});
  const result = await f.inspect({plan: [{kind: 'narration_workflow'}, {kind: 'montage_workflow'}]});
  expect(f.state.toolCalls.map(c => [c.name, c.args])).toEqual([
    ['get_workflow_instructions', {workflow: 'narration'}], ['get_workflow_instructions', {workflow: 'video-montage'}],
  ]);
  expect(result.results).toHaveLength(2); expect(f.hooks.afterRead).toHaveBeenCalledTimes(2);
  expect(f.state.submits).toHaveLength(0); expect(f.state.quotes).toHaveLength(0); expect(f.state.refreshes).toHaveLength(0);
  expect(f.db.videoSubscriptionConnection.updateMany).not.toHaveBeenCalled();
}));

test.each([
  [{kind: 'montage_workflow'}, {kind: 'narration_workflow'}], [{kind: 'narration_workflow'}],
  [{kind: 'narration_workflow', workflow: 'unapproved'}, {kind: 'montage_workflow'}],
])('named workflow qualification cannot change names, order or arguments (%#)', plan => fixture(async f => {
  await rejects(f.inspect({plan}), 'VIDEO_QUALIFICATION_READ_INVALID'); expect(f.state.egress).toHaveLength(0);
}));

test.each([
  {mode: 'catalog', source: 'bundled_resource', workflows: []},
  {mode: 'workflow', source: 'bundled_resource', workflow: 'other', instructions_markdown: 'Untrusted'},
  {mode: 'workflow', source: 'bundled_resource', workflow: 'narration', instructions_markdown: ''},
])('wrong or missing workflow reference is captured before the second read is refused (%#)', value => fixture(async f => {
  f.script('higgsfield', 'get_workflow_instructions', value);
  await rejects(f.inspect({plan: [{kind: 'narration_workflow'}, {kind: 'montage_workflow'}]}), 'VIDEO_PROVIDER_RESPONSE_INVALID');
  expect(f.state.toolCalls).toHaveLength(1); expect(f.hooks.afterRead).toHaveBeenCalledTimes(1);
}));

test.each([
  [{kind: 'audio_catalogue'}], [{kind: 'workflow_catalogue'}], [{kind: 'workflow_catalogue'}, {kind: 'audio_catalogue'}],
  [{kind: 'audio_catalogue', after: 'page2'}, {kind: 'workflow_catalogue'}],
  [{kind: 'audio_catalogue'}, {kind: 'workflow_catalogue', workflow: 'run-me'}],
])('composition qualification cannot become pagination, a selected workflow or an arbitrary plan (%j)', plan => fixture(async f => {
  await rejects(f.inspect({plan}), 'VIDEO_QUALIFICATION_READ_INVALID'); expect(f.state.egress).toHaveLength(0);
}));

test.each([
  {items: [fakeModel('video')]},
  {items: Array.from({length: 101}, () => fakeModel('audio'))},
])('audio catalogue captures malformed or wrong-type results before stopping the second read (%#)', result => fixture(async f => {
  f.state.scripts.higgsfield.models_explore = [result];
  await rejects(f.inspect({plan: [{kind: 'audio_catalogue'}, {kind: 'workflow_catalogue'}]}), 'VIDEO_PROVIDER_RESPONSE_INVALID');
  expect(f.state.toolCalls).toHaveLength(1); expect(f.hooks.afterRead).toHaveBeenCalledTimes(1);
}));

test.each([
  {mode: 'workflow', source: 'bundled_resource', workflow: 'unapproved', instructions_markdown: 'Do something'},
  {mode: 'catalog', source: 'bundled_resource', workflows: [{name: 'duplicate', description: ''}, {name: 'duplicate', description: ''}]},
  {mode: 'catalog', source: 'external', workflows: []},
])('workflow catalogue refuses selected, ambiguous or invalid results after private capture (%j)', result => fixture(async f => {
  f.state.scripts.higgsfield.models_explore = [{items: [fakeModel('audio')]}];
  f.script('higgsfield', 'get_workflow_instructions', result);
  await rejects(f.inspect({plan: [{kind: 'audio_catalogue'}, {kind: 'workflow_catalogue'}]}), 'VIDEO_PROVIDER_RESPONSE_INVALID');
  expect(f.state.toolCalls).toHaveLength(2); expect(f.hooks.afterRead).toHaveBeenCalledTimes(2);
}));

test.each([
  [{kind: 'generate_video'}], [{kind: 'balance', tool: 'generate_video'}], [{kind: 'video_search', query: 'arbitrary'}],
  [{kind: 'balance'}, {kind: 'balance'}], [{kind: 'video_model', modelId: 'id'}, {kind: 'image_model', modelId: 'id'}, {kind: 'image_model', modelId: 'other'}],
  [{kind: 'video_catalogue', limit: 1000}],
])('unknown tools, parameters and over-broad plans are refused before egress (%j)', plan => fixture(async f => {
  await rejects(f.inspect({plan}), 'VIDEO_QUALIFICATION_READ_INVALID'); expect(f.state.egress).toHaveLength(0);
}));

test.each(['tool', 'args'])('transport rejects a substituted SDK %s before the provider sees a read', change => fixture(async f => {
  const {Client} = require('@modelcontextprotocol/sdk/client/index.js'); const original = Client.prototype.callTool;
  const spy = jest.spyOn(Client.prototype, 'callTool').mockImplementation(function (request, ...rest) {
    return original.call(this, change === 'tool' ? {...request, name: 'generate_video'} : {...request, arguments: {...request.arguments, get_cost: true}}, ...rest);
  });
  try {await rejects(f.inspect(), 'VIDEO_TOOL_UNAVAILABLE'); expect(f.state.toolCalls).toHaveLength(0);}
  finally {spy.mockRestore();}
}));

test.each(['actor', 'session', 'admin', 'org', 'grant', 'generation', 'expired', 'policy'])('current %s guard rejects before metadata or token refresh', boundary => fixture(async f => {
  const options = {};
  if (boundary === 'actor') options.actor = 'foreign';
  if (boundary === 'session') options.sessionActor = 'foreign';
  if (boundary === 'admin') f.flags.role = 'EDITOR';
  if (boundary === 'org') options.org = 'foreign';
  if (boundary === 'grant') f.flags.grant = false;
  if (boundary === 'generation') options.generation = 2;
  if (boundary === 'expired') f.row.expiresAt = new Date('2026-01-01');
  if (boundary === 'policy') f.flags.policy = false;
  const code = ['actor', 'session', 'admin', 'org'].includes(boundary) ? 'VIDEO_ACCESS_DENIED' : boundary === 'generation' ? 'VIDEO_CONNECTION_CHANGED' : boundary === 'policy' ? 'VIDEO_CONNECTION_UNAVAILABLE' : 'VIDEO_REAUTH_REQUIRED';
  await rejects(f.inspect(options), code); expect(f.state.egress).toHaveLength(0); expect(f.state.refreshes).toHaveLength(0);
  expect(f.hooks.beforeSession).not.toHaveBeenCalled();
}));

test('revocation after recording an attempt prevents the first read', () => fixture(async f => {
  f.hooks.beforeRead.mockImplementationOnce(async () => {f.flags.grant = false;});
  await rejects(f.inspect(), 'VIDEO_REAUTH_REQUIRED'); expect(f.state.toolCalls).toHaveLength(0);
}));

test('operator role loss after one read prevents the next call', () => fixture(async f => {
  f.hooks.afterRead.mockImplementationOnce(async () => {f.flags.role = 'EDITOR';});
  await rejects(f.inspect(), 'VIDEO_ACCESS_DENIED'); expect(f.state.toolCalls).toHaveLength(1);
}));

test('ordinary read response limit stays 1 MiB inside the schema-qualified session', () => fixture(async f => {
  f.state.respondMcp = ({res, rpc}) => {
    if (rpc.method !== 'tools/call') return false;
    res.writeHead(200, {'content-type': 'application/json'}); res.write('x'.repeat(1024 * 1024 + 1)); return true;
  };
  await rejects(f.inspect(), 'VIDEO_RESPONSE_TOO_LARGE'); expect(f.state.toolCalls).toHaveLength(1);
  expect(f.hooks.afterRead).not.toHaveBeenCalled();
}));

test('the whole fixed read session has a deadline and does not continue after a stalled response', () => fixture(async f => {
  const nativeTimeout = global.setTimeout;
  const clock = jest.spyOn(global, 'setTimeout').mockImplementation((fn, ms, ...args) => nativeTimeout(fn, ms === 180_000 ? 100 : ms, ...args));
  f.state.respondMcp = ({res, rpc}) => {
    if (rpc.method !== 'tools/call') return false;
    res.writeHead(200, {'content-type': 'application/json'}); res.write('{'); return true;
  };
  try {await rejects(f.inspect(), 'VIDEO_RESPONSE_TIMEOUT'); expect(f.state.toolCalls).toHaveLength(1);}
  finally {clock.mockRestore();}
}));

test.each([{}, {credits: '20', subscription_plan_type: 'synthetic'}, {error: 'private remote error text'}])('missing/error balance is captured privately then stops all subsequent reads (%j)', value => fixture(async f => {
  f.state.scripts.higgsfield.balance = [value];
  await rejects(f.inspect(), value.error ? 'VIDEO_PROVIDER_TOOL_ERROR' : 'VIDEO_PROVIDER_RESPONSE_INVALID');
  expect(f.state.toolCalls).toHaveLength(2); expect(f.hooks.afterRead).toHaveBeenCalledTimes(2);
}));

test('details require a root-selected type-matching ID in the retained catalogue and never select the first result', () => {
  const base = {video: {items: [fakeModel('video')]}, image: {items: [fakeModel('image')]}};
  expect(contract.hggDetailReadsV1({videoId: 'synthetic-video'}, base)).toEqual([{kind: 'video_model', modelId: 'synthetic-video'}]);
  for (const selection of [{}, {videoId: 'invented'}, {videoId: 'synthetic-image'}, {imageId: 'synthetic-image', tool: 'generate_image'}]) expect(() => contract.hggDetailReadsV1(selection, base)).toThrow();
});

test('a type-matching model get stays a read and checks the returned exact model ID', () => fixture(async f => {
  f.state.scripts.higgsfield.models_explore = [fakeModel('video')];
  const result = await f.inspect({plan: [{kind: 'video_model', modelId: 'synthetic-video'}]});
  expect(result.results).toHaveLength(1); expect(f.state.toolCalls.map(c => c.args)).toEqual([{action: 'get', model_id: 'synthetic-video'}]);
}));
