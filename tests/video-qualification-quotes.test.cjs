const {createProviderFixture, codeOf} = require('./helpers/video-subscription-provider-fixture.cjs');
const {loadTypeScriptModule} = require('./helpers/load-ts-module.cjs');
const {contract, evidence, imageInput, videoInput, inventory} = require('./helpers/hgg-pilot-quote-fixture.cjs');
const {AuthService} = loadTypeScriptModule('libraries/helpers/src/auth/auth.service.ts');
const root = 'libraries/nestjs-libraries/src/';
const oldSecret = process.env.JWT_SECRET;
beforeAll(() => {process.env.JWT_SECRET = 'qualification-quote-test-only';});
afterAll(() => {if (oldSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = oldSecret;});
const rejects = async (promise, code) => {let error; try {await promise;} catch (e) {error = e;} expect(codeOf(error)).toBe(code);};
async function fixture(run) {
  const f = await createProviderFixture({now: '2026-02-01T00:00:00Z', moduleMocks: {'./video-hgg-pilot-quote.v1': contract}});
  try {
    f.state.tools.higgsfield = structuredClone(inventory);
    const original = f.runtime.definition.bind(f.runtime);
    f.runtime.definition = p => ({...original(p), enabled: false, identityEndpoint: undefined, schemaDigests: []});
    const def = f.runtime.definition('higgsfield'), tokens = f.issueTokens('higgsfield');
    const row = {id: 'connection', ownerId: 'actor', provider: 'higgsfield', issuer: def.issuer, resource: def.resource, state: 'discovery_required',
      walletDigest: 'unverified:synthetic', generation: 1, tokenVersion: 1, encryptedTokens: AuthService.fixedEncryption(JSON.stringify(tokens)), expiresAt: new Date('2026-02-01T01:00:00Z')};
    const flags = {role: 'ADMIN', grant: true, policy: true};
    const db = {userOrganization: {findFirst: async ({where}) => where.organizationId === 'org' ? {role: flags.role, user: {activated: true}} : null},
      videoSubscriptionConnection: {findFirst: async ({where}) => where.id === row.id && where.ownerId === row.ownerId ? {...row} : null,
        updateMany: jest.fn(() => {throw new Error('Quote fixture forbids connection writes');})},
      videoSubscriptionGrant: {findUnique: async () => ({enabled: flags.grant})}, videoSubscriptionWorkspacePolicy: {findUnique: async () => ({enabled: flags.policy})}};
    const {VideoSubscriptionRepository} = loadTypeScriptModule(root + 'database/prisma/video-subscription/video-subscription.repository.ts', f.modules.mocks);
    const repository = new VideoSubscriptionRepository(db), connections = new f.modules.connection.VideoConnectionService(repository, f.runtime, f.oauth);
    const {VideoQualificationQuoteService} = f.modules.register('subscriptions/video-qualification-quote.service', []);
    const service = new VideoQualificationQuoteService(repository, connections, f.mcp);
    for (const tool of ['generate_image', 'generate_video']) f.script('higgsfield', tool, {cost: {credits: 3, credits_exact: 3.75}});
    const hooks = {beforeSession: jest.fn(async () => {}), beforeQuote: jest.fn(async () => {}), afterQuote: jest.fn(async () => {})};
    const inspect = (input = videoInput, options = {}) => f.modules.authenticatedSession.withAuthenticatedSession(options.sessionActor || 'actor', 'synthetic-session', () =>
      service.inspect(options.org || 'org', options.actor || 'actor', row.id, options.generation ?? 1, input, evidence, hooks));
    return await run({...f, row, flags, db, hooks, inspect});
  } finally {await f.close();}
}
test.each([imageInput, videoInput])('real SDK verifies full inventory and sends exactly one cost-only request (%s)', input => fixture(async f => {
  const before = {...f.row}, result = await f.inspect(input);
  expect(result.quote.cost).toEqual({credits: 3, creditsExact: 3.75});
  expect(result).toMatchObject({walletVerified: false, generationReady: false, paidSubmitEnabled: false});
  expect(f.state.rpc.filter(r => r.method === 'initialize')).toHaveLength(1);
  expect(f.state.rpc.filter(r => r.method === 'tools/list')).toHaveLength(1);
  expect(f.state.toolCalls).toHaveLength(1); expect(f.state.toolCalls[0].args.params.get_cost).toBe(true);
  expect(f.state.toolCalls[0].args.params.count).toBe(1);
  expect(f.row).toEqual(before); expect(f.db.videoSubscriptionConnection.updateMany).not.toHaveBeenCalled();
  expect(f.state.refreshes).toHaveLength(0); expect(f.state.submits).toHaveLength(0); expect(f.state.polls).toHaveLength(0);
  expect(f.hooks.beforeQuote).toHaveBeenCalledTimes(1); expect(f.hooks.afterQuote).toHaveBeenCalledTimes(1);
}));
test('schema drift fails before tools/call; accepted catalogue cannot waive fresh inventory', () => fixture(async f => {
  f.state.tools.higgsfield.push({name: 'new_tool', inputSchema: {type: 'object'}});
  await rejects(f.inspect(), 'VIDEO_SCHEMA_CHANGED'); expect(f.state.toolCalls).toHaveLength(0); expect(f.hooks.beforeQuote).not.toHaveBeenCalled();
}));
test.each(['tool', 'args', 'get_cost'])('transport refuses substituted %s without sending a tool call', change => fixture(async f => {
  const {Client} = require('@modelcontextprotocol/sdk/client/index.js'), original = Client.prototype.callTool;
  const spy = jest.spyOn(Client.prototype, 'callTool').mockImplementation(function(request, ...rest) {
    const changed = change === 'tool' ? {...request, name: 'generate_clip'} : {...request, arguments: {...request.arguments,
      params: {...request.arguments.params, ...(change === 'get_cost' ? {get_cost: false} : {duration: 10})}}};
    return original.call(this, changed, ...rest);
  });
  try {await rejects(f.inspect(), 'VIDEO_TOOL_UNAVAILABLE'); expect(f.state.toolCalls).toHaveLength(0);} finally {spy.mockRestore();}
}));
test.each(['role', 'grant', 'generation'])('revoked %s between inventory and quote prevents sending', kind => fixture(async f => {
  f.hooks.beforeQuote.mockImplementation(async () => {if (kind === 'role') f.flags.role = 'USER'; else if (kind === 'grant') f.flags.grant = false; else f.row.generation++;});
  await rejects(f.inspect(), kind === 'role' ? 'VIDEO_ACCESS_DENIED' : kind === 'grant' ? 'VIDEO_REAUTH_REQUIRED' : 'VIDEO_CONNECTION_CHANGED'); expect(f.state.toolCalls).toHaveLength(0);
}));
test.each([{actor: 'other'}, {org: 'other'}, {sessionActor: 'other'}])('actor/org/session mismatch fails before any network (%j)', options => fixture(async f => {
  await rejects(f.inspect(videoInput, options), 'VIDEO_ACCESS_DENIED'); expect(f.state.egress).toHaveLength(0);
}));
test('expired token stops without automatic refresh or metadata', () => fixture(async f => {
  f.row.expiresAt = new Date('2026-01-01T00:00:00Z');
  await rejects(f.inspect(), 'VIDEO_REAUTH_REQUIRED'); expect(f.state.egress).toHaveLength(0); expect(f.state.refreshes).toHaveLength(0);
}));
test('unexpected job response is captured privately once, rejected and never polled or retried', () => fixture(async f => {
  f.state.scripts.higgsfield.generate_video = [{cost: {credits: 1, credits_exact: 1}, results: [{id: 'unexpected-job'}]}];
  await rejects(f.inspect(), 'VIDEO_QUOTE_UNEXPECTED_JOB');
  expect(f.hooks.afterQuote).toHaveBeenCalledTimes(1); expect(f.state.toolCalls).toHaveLength(1); expect(f.state.polls).toHaveLength(0);
}));
test('caller mutation during guard cannot replace frozen source or wire parameters', () => fixture(async f => {
  const input = structuredClone(videoInput);
  f.hooks.beforeSession.mockImplementation(async () => {input.prompt = 'Changed during await'; input.frames.reverse();});
  await f.inspect(input);
  expect(f.state.toolCalls[0].args.params.prompt).toBe(videoInput.prompt);
  expect(f.state.toolCalls[0].args.params.medias[0].role).toBe('start_image');
}));
test('cost-only profile does not open the normal generation allowlist', () => fixture(async f => {
  await rejects(f.mcp.call(f.runtime.definition('higgsfield'), 'token', 'generate_video', {params: {get_cost: false}}), 'VIDEO_TOOL_UNAVAILABLE');
  expect(f.state.egress).toHaveLength(0);
}));
test('quote response retains the 1 MiB cap and reports only the local quote phase', () => fixture(async f => {
  f.state.scripts.higgsfield.generate_video = [{cost: {credits: 1, credits_exact: 1}, padding: 'x'.repeat(1024 * 1024)}];
  let error; try {await f.inspect();} catch (e) {error = e;}
  expect(error.getResponse()).toMatchObject({code: 'VIDEO_RESPONSE_TOO_LARGE', qualification: {phase: 'qualification/quote', maximumBytes: 1048576}});
  expect(f.state.toolCalls).toHaveLength(1); expect(f.hooks.afterQuote).not.toHaveBeenCalled();
}));
test('allowance-choice response stops without choosing a balance or retrying', () => fixture(async f => {
  f.state.scripts.higgsfield.generate_video = [{unlim_choice: {message: 'Untrusted question', model: 'synthetic-video'}}];
  await rejects(f.inspect(), 'VIDEO_FUNDING_CHOICE_REQUIRED');
  expect(f.state.toolCalls).toHaveLength(1); expect(f.state.toolCalls[0].args.params).not.toHaveProperty('use_unlim');
}));
