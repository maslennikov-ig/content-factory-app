const {nativeFixture} = require('./helpers/hgg-native-pilot-fixture.cjs');

test.each([true, false])('renewed quote fences a stale epoch before submit (stale=%s)', stale => nativeFixture(async f => {
  const hash = f.modules.registry.subscriptionHash, origin = f.qualification;
  const current = {...origin, tokenVersion: 2, qualificationId: 'qualification-v2', bindingHash: 'current-binding'};
  const core = {version: 2, renewalId: 'renew', pilotId: 'parent', originContextDigest: 'context', connectionId: 'connection', accountGeneration: 1,
    originWorkspaceBindingHash: origin.bindingHash, currentWorkspace: current, retainedReferencesDigest: hash([])};
  const credentials = {...core, executionBindingHash: hash(core)};
  const renewalId = hash({kind: 'hgg-same-grant-renewal/v1', connectionId: 'connection', generation: 1, tokenVersion: 1});
  const bindingId = hash({kind: 'hgg-execution-credential/v2', org: 'org', actor: 'actor', pilotId: 'parent', renewalId: 'renew'});
  const future = new Date('2026-02-02T00:00:00Z');
  f.rows.videoAccessPreflight.push(
    {id: renewalId, organizationId: 'org', actorId: 'actor', connectionId: 'connection', generation: 1, snapshot: {kind: 'hgg-same-grant-renewal/v1', state: 'completed', fromTokenVersion: 1, toTokenVersion: 2}},
    {id: current.qualificationId, organizationId: 'org', actorId: 'actor', connectionId: 'connection', generation: 1, expiresAt: future, snapshot: {kind: 'hgg-workspace/v1', state: 'qualified', binding: current}},
    {id: bindingId, organizationId: 'org', actorId: 'actor', connectionId: 'connection', generation: 1, expiresAt: future, snapshot: {kind: 'hgg-execution-credential/v2', credentials}},
  );
  f.connection.tokenVersion = 2;
  const actions = [];
  f.parents.adapter.assertCurrentPilotWithCredentialsV2 = async (_tx, expected) => {
    actions.push(expected.action); expect(expected.executionCredentials).toEqual(credentials); return {authorization: f.parent.authorization};
  };
  f.script('higgsfield', 'generate_image', {cost: {credits: 2, credits_exact: 2}}, {results:[{id:'00000001-1111-4111-8111-111111111111',type:'image',model:'synthetic-image',status:'queued',params:{prompt:'English first frame direction'}}]});
  const stage = f.prepare();
  const quote = await f.service.quoteWithCredentialsV2('org', 'actor', stage, credentials);
  expect(quote.canSubmit).toBe(true);
  await expect(f.service.admit('org', 'actor', quote.preflightId, 'old-consent')).rejects.toMatchObject({response: {code: 'VIDEO_PREFLIGHT_STALE'}});
  const admitted = await f.service.admit('org', 'actor', quote.preflightId, quote.approvalHash);
  const job = f.rows.videoSubscriptionJob.find(x => x.id === admitted.jobId);
  expect(job.snapshot.executionBindingHash).toBe(credentials.executionBindingHash);
  if (stale) f.connection.tokenVersion = 3;
  await f.jobs.runStep('org', job.id);
  expect(f.state.toolCalls.filter(call => call.args.params?.get_cost === false)).toHaveLength(stale ? 0 : 1);
  expect(actions).toContain('quote'); expect(actions).toContain('admit');
  if (!stale) expect(actions).toContain('submit');
}));

test('completed renewal can rebuild a missing pilot binding without another refresh', () => nativeFixture(async f => {
  const hash = f.modules.registry.subscriptionHash, originWorkspace = f.qualification;
  const input = {renewalId: 'renew', pilotId: 'parent', parentRevision: 1, requestMessageId: 'request', originContextDigest: 'context',
    connectionId: 'connection', accountGeneration: 1, originWorkspace, references: []};
  const receiptId = hash({kind: 'hgg-same-grant-renewal/v1', connectionId: 'connection', generation: 1, tokenVersion: 1});
  f.rows.videoAccessPreflight.push({id: receiptId, organizationId: 'org', actorId: 'actor', connectionId: 'connection', generation: 1,
    snapshot: {kind: 'hgg-same-grant-renewal/v1', state: 'completed', fromTokenVersion: 1, toTokenVersion: 2}});
  f.connection.tokenVersion = 2;
  f.parents.adapter.assertCredentialRenewalV2 = async () => {};
  const refresh = jest.spyOn(f.connections, 'renewOwnedGrantV1');
  const run = () => f.modules.authenticatedSession.withAuthenticatedSession('actor', 'synthetic-session', () => f.service.readCredentialBindingV2('org', 'actor', input));
  const binding = await run(); expect(binding.currentWorkspace.tokenVersion).toBe(2);
  expect(binding.currentWorkspace.workspaceId).toBe(originWorkspace.workspaceId);
  expect(await run()).toEqual(binding); expect(refresh).not.toHaveBeenCalled();
  expect(f.state.toolCalls.filter(call => ['generate_image', 'generate_video'].includes(call.name))).toHaveLength(0);
}));

test('completed renewal adopts an existing interrupted new workspace qualification without refreshing or selecting', () => nativeFixture(async f => {
  const hash = f.modules.registry.subscriptionHash, originWorkspace = f.qualification;
  const input = {renewalId: 'renew', pilotId: 'parent', parentRevision: 1, requestMessageId: 'request', originContextDigest: 'context', connectionId: 'connection', accountGeneration: 1, originWorkspace, references: []};
  const receiptId = hash({kind: 'hgg-same-grant-renewal/v1', connectionId: 'connection', generation: 1, tokenVersion: 1});
  const intentId = hash({kind: 'hgg-renewed-workspace/v2', org: 'org', actor: 'actor', pilotId: input.pilotId, renewalId: input.renewalId});
  const qualification = {intentId, pilotId: input.pilotId, parentRevision: input.parentRevision, connectionId: input.connectionId, accountGeneration: input.accountGeneration, workspaceId: originWorkspace.workspaceId};
  f.rows.videoAccessPreflight.push(
    {id: receiptId, organizationId: 'org', actorId: 'actor', connectionId: 'connection', generation: 1, snapshot: {kind: 'hgg-same-grant-renewal/v1', state: 'completed', fromTokenVersion: 1, toTokenVersion: 2}},
    {id: 'interrupted-workspace', organizationId: 'org', actorId: 'actor', connectionId: 'connection', generation: 1, expiresAt: new Date('2026-02-02T00:00:00Z'), snapshot: {kind: 'hgg-workspace/v1', state: 'new', input: qualification}},
  );
  f.rows.videoRouteIntent.push({organizationId: 'org', actorId: 'actor', intentId, preflightId: 'interrupted-workspace', accessDigest: hash(qualification)});
  f.connection.tokenVersion = 2; f.parents.adapter.assertCredentialRenewalV2 = async () => {};
  const refresh = jest.spyOn(f.connections, 'renewOwnedGrantV1'), before = f.state.toolCalls.length;
  const binding = await f.modules.authenticatedSession.withAuthenticatedSession('actor', 'synthetic-session', () => f.service.readCredentialBindingV2('org', 'actor', input));
  expect(binding.currentWorkspace.qualificationId).toBe('interrupted-workspace');
  expect(binding.currentWorkspace.tokenVersion).toBe(2); expect(refresh).not.toHaveBeenCalled();
  expect(f.state.toolCalls.slice(before).map(call => call.name)).toEqual(['list_workspaces']);
  expect(f.rows.videoAccessPreflight.find(row => row.id === 'interrupted-workspace').snapshot.state).toBe('qualified');
}));

test('pending grant remains unresolved without provider observation or refresh', () => nativeFixture(async f => {
  const hash = f.modules.registry.subscriptionHash, originWorkspace = f.qualification;
  const input = {renewalId: 'renew', pilotId: 'parent', parentRevision: 1, requestMessageId: 'request', originContextDigest: 'context', connectionId: 'connection', accountGeneration: 1, originWorkspace, references: []};
  const receiptId = hash({kind: 'hgg-same-grant-renewal/v1', connectionId: 'connection', generation: 1, tokenVersion: 1});
  f.rows.videoAccessPreflight.push({id: receiptId, organizationId: 'org', actorId: 'actor', connectionId: 'connection', generation: 1, snapshot: {kind: 'hgg-same-grant-renewal/v1', state: 'pending'}});
  f.parents.adapter.assertCredentialRenewalV2 = async () => {};
  const refresh = jest.spyOn(f.connections, 'renewOwnedGrantV1'), calls = f.state.toolCalls.length;
  const binding = await f.modules.authenticatedSession.withAuthenticatedSession('actor', 'synthetic-session', () => f.service.readCredentialBindingV2('org', 'actor', input));
  expect(binding).toBeNull(); expect(refresh).not.toHaveBeenCalled(); expect(f.state.toolCalls).toHaveLength(calls);
}));

test.each(['organizationId', 'actorId'])('a foreign completed renewal %s is not adopted or observed', field => nativeFixture(async f => {
  const originWorkspace = f.qualification;
  const input = {renewalId: 'renew', pilotId: 'parent', parentRevision: 1, requestMessageId: 'request', originContextDigest: 'context', connectionId: 'connection', accountGeneration: 1, originWorkspace, references: []};
  const id = f.modules.registry.subscriptionHash({kind: 'hgg-same-grant-renewal/v1', connectionId: 'connection', generation: 1, tokenVersion: 1});
  f.rows.videoAccessPreflight.push({id, organizationId: 'org', actorId: 'actor', connectionId: 'connection', generation: 1,
    snapshot: {kind: 'hgg-same-grant-renewal/v1', state: 'completed', fromTokenVersion: 1, toTokenVersion: 2}, [field]: 'foreign'});
  f.connection.tokenVersion = 2; f.parents.adapter.assertCredentialRenewalV2 = async () => {};
  const refresh = jest.spyOn(f.connections, 'renewOwnedGrantV1'), models = jest.spyOn(f.service.workspace, 'models'), qualify = jest.spyOn(f.service.workspace, 'qualify');
  const before = f.state.toolCalls.length;
  const result = await f.modules.authenticatedSession.withAuthenticatedSession('actor', 'synthetic-session', () => f.service.readCredentialBindingV2('org', 'actor', input));
  expect(result).toBeNull(); expect(refresh).not.toHaveBeenCalled(); expect(models).not.toHaveBeenCalled(); expect(qualify).not.toHaveBeenCalled();
  expect(f.state.toolCalls).toHaveLength(before);
}));

test('historical quote remains readable after token rotation without a new provider call', () => nativeFixture(async f => {
  f.script('higgsfield', 'generate_image', {cost: {credits: 2, credits_exact: 2}});
  const old = await f.service.quote('org', 'actor', f.prepare());
  const calls = f.state.toolCalls.length;
  f.connection.tokenVersion = 2;
  const historical = await f.service.getByIntent('org', 'actor', 'first-intent');
  expect(historical.preflightId).toBe(old.preflightId); expect(historical.bindingHash).toBe(old.bindingHash);
  expect(historical.quote.amount).toBe(old.quote.amount); expect(historical.canSubmit).toBe(false);
  expect(historical.blockers).toContain('VIDEO_CONNECTION_CHANGED');
  expect(f.state.toolCalls).toHaveLength(calls);
}));

test('a new epoch refreshes only an expired unsubmitted quote with the same content intent', () => nativeFixture(async f => {
  f.script('higgsfield', 'generate_image', {cost: {credits: 2, credits_exact: 2}}, {cost: {credits: 3, credits_exact: 3}});
  const plan = f.prepare(), old = await f.service.quote('org', 'actor', plan), hash = f.modules.registry.subscriptionHash;
  f.advance(11 * 60 * 1000); f.connection.tokenVersion = 2;
  const origin = f.qualification, current = {...origin, tokenVersion: 2, qualificationId: 'qualification-v2', bindingHash: 'current-binding'};
  const core = {version: 2, renewalId: 'renew', pilotId: 'parent', originContextDigest: 'context', connectionId: 'connection', accountGeneration: 1,
    originWorkspaceBindingHash: origin.bindingHash, currentWorkspace: current, retainedReferencesDigest: hash([])};
  const credentials = {...core, executionBindingHash: hash(core)};
  const grantId = hash({kind: 'hgg-same-grant-renewal/v1', connectionId: 'connection', generation: 1, tokenVersion: 1});
  const bindingId = hash({kind: 'hgg-execution-credential/v2', org: 'org', actor: 'actor', pilotId: 'parent', renewalId: 'renew'});
  f.rows.videoAccessPreflight.push(
    {id: grantId, organizationId: 'org', actorId: 'actor', connectionId: 'connection', generation: 1, snapshot: {kind: 'hgg-same-grant-renewal/v1', state: 'completed', fromTokenVersion: 1, toTokenVersion: 2}},
    {id: current.qualificationId, organizationId: 'org', actorId: 'actor', connectionId: 'connection', generation: 1, expiresAt: new Date('2026-02-02T00:00:00Z'), snapshot: {kind: 'hgg-workspace/v1', state: 'qualified', binding: current}},
    {id: bindingId, organizationId: 'org', actorId: 'actor', connectionId: 'connection', generation: 1, snapshot: {credentials}},
  );
  f.parents.adapter.assertCurrentPilotWithCredentialsV2 = async () => ({authorization: f.parent.authorization});
  const fresh = await f.service.quoteWithCredentialsV2('org', 'actor', plan, credentials);
  expect(fresh.preflightId).toBe(old.preflightId); expect(fresh.bindingHash).toBe(old.bindingHash);
  expect(fresh.approvalHash).not.toBe(old.approvalHash); expect(fresh.quote.amount).toBe('3');
  const saved = f.rows.videoAccessPreflight.find(row => row.id === fresh.preflightId);
  expect(saved.snapshot.priorQuotes).toHaveLength(1); expect(f.rows.videoSubscriptionJob).toHaveLength(0);
  expect(f.state.toolCalls.filter(call => call.args.params?.get_cost === false)).toHaveLength(0);
}));
