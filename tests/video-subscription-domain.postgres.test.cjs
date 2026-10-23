const { randomUUID } = require('node:crypto');
const fixture = require('./helpers/video-subscription-domain.fixture.cjs');
const { codeOf } = require('./helpers/video-subscription-provider-fixture.cjs');
const databaseUrl = process.env.CF_VIDEO_DATABASE_URL;
if (databaseUrl) fixture.assertDisposableDatabaseV1(databaseUrl);
const domain = databaseUrl ? describe : describe.skip;
const withFixture = async run => { const f = await fixture.create(databaseUrl); try { return await run(f); } finally { await f.close(); } };
const rejectsCode = async (promise, code) => { let error; try { await promise; } catch (e) { error = e; } expect(codeOf(error)).toBe(code); };

domain('subscription admission persists actor, wallet, exact Decimal credits and immutable approval', () => {
  jest.setTimeout(30000);

  test('unset credit limits and unknown/mismatched quotes never admit a job', () => withFixture(async f => {
    const connection = await f.connect('higgsfield', {limits: false});
    const draft = await f.prepare();
    const input = {draftId: draft.id, version: draft.version, access: {kind: 'subscription', connectionId: connection.id}};
    await rejectsCode(f.access.preflight(f.org.id, f.user.id, input), 'VIDEO_CREDIT_LIMITS_UNSET');
    await f.connections.limits(f.org.id, f.user.id, connection.id, '0.25', '1');
    for (const quote of [{kind: 'quote', unit: 'USD', credits: '0.01'}, {kind: 'quote', unit: 'higgsfield_credit', credits: null}, {kind: 'quote', unit: 'higgsfield_credit', credits: '0.1', job_id: 'already-generated'}]) {
      f.provider.script('higgsfield', 'generate_clip', quote);
      await rejectsCode(f.access.preflight(f.org.id, f.user.id, input), 'VIDEO_PRICE_UNAVAILABLE');
    }
    expect(await f.db.videoSubscriptionJob.count({where: {organizationId: f.org.id}})).toBe(0);
    expect(f.provider.state.submits).toHaveLength(0);
  }));

  test('two workspaces concurrently reserve one shared wallet allowance', () => withFixture(async f => {
    const connection = await f.connect('higgsfield', {perJob: '0.2', perMonth: '0.3'});
    await f.connections.grant(f.otherOrg.id, f.user.id, connection.id);
    const first = await f.readySubscription({connectionId: connection.id});
    const second = await f.readySubscription({connectionId: connection.id, org: f.otherOrg.id});
    const results = await Promise.allSettled([first, second].map(r => f.access.launch(r.org, r.actor, r.launch)));
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(r => r.status === 'rejected').map(r => codeOf(r.reason))).toEqual(['VIDEO_MONTHLY_CREDIT_LIMIT_EXCEEDED']);
    const jobs = await f.db.videoSubscriptionJob.findMany({where: {connectionId: connection.id}});
    expect(jobs).toHaveLength(1); expect(jobs[0].reserved.toFixed()).toBe('0.2');
    expect(f.provider.state.submits).toHaveLength(0);
  }));

  test('exact decimal reservations allow three tenths and refuse a fourth tenth', () => withFixture(async f => {
    f.provider.state.quoteAmount = '0.1';
    const connection = await f.connect('higgsfield', {perJob: '0.1', perMonth: '0.3'});
    const ready = [];
    for (let i = 0; i < 4; i++) ready.push(await f.readySubscription({connectionId: connection.id}));
    for (const r of ready.slice(0, 2)) await f.access.launch(r.org, r.actor, r.launch);
    const outcomes = await Promise.allSettled(ready.slice(2).map(r => f.access.launch(r.org, r.actor, r.launch)));
    expect(outcomes.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter(r => r.status === 'rejected').map(r => codeOf(r.reason))).toEqual(['VIDEO_MONTHLY_CREDIT_LIMIT_EXCEEDED']);
    const reserved = await f.db.videoSubscriptionJob.aggregate({where: {connectionId: connection.id}, _sum: {reserved: true}});
    expect(reserved._sum.reserved.toFixed()).toBe('0.3');
  }));

  test('unresolved obligations survive UTC month rollover; owner reconciliation remains explicitly distinct', () => withFixture(async f => {
    const connection = await f.connect('higgsfield', {perJob: '0.2', perMonth: '0.3'});
    const first = await f.readySubscription({connectionId: connection.id});
    const job = await f.access.launch(first.org, first.actor, first.launch);
    f.provider.script('higgsfield', 'generate_clip', 'lost'); await f.subscriptions.runStep(first.org, job.id);
    const now = f.provider.runtime.now();
    f.provider.setNow(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 2, 12)));
    const second = await f.readySubscription({connectionId: connection.id});
    await rejectsCode(f.access.launch(second.org, second.actor, second.launch), 'VIDEO_MONTHLY_CREDIT_LIMIT_EXCEEDED');
    const reconciled = await f.subscriptions.reconcile(first.org, first.actor, job.id, '0.125', 'Synthetic owner statement for retained local job');
    expect(reconciled.cost).toEqual({amount: '0.125', unit: 'higgsfield_credit', certainty: 'owner_reconciled'});
    const admitted = await f.access.launch(second.org, second.actor, second.launch);
    expect(admitted.state).toBe('accepted'); expect(f.provider.state.submits).toHaveLength(1);
  }));

  test('saved approval and immutable job bind exact script/settings/account/schema/quote and actor', () => withFixture(async f => {
    const r = await f.readySubscription({presenter: true});
    await rejectsCode(f.access.approval(r.org, f.otherUser.id, r.preflight.id), 'VIDEO_PREFLIGHT_NOT_FOUND');
    await rejectsCode(f.access.launch(r.org, f.otherUser.id, r.launch), 'VIDEO_PREFLIGHT_NOT_FOUND');
    const saved = await f.access.approval(r.org, r.actor, r.preflight.id);
    expect(saved).toEqual(r.preflight); expect(saved.providerBillingCap).toBe(false);
    expect(saved.quote).toMatchObject({amount: '0.125', unit: 'heygen_credit', source: 'provider_quote', upperBound: null});
    const job = await f.access.launch(r.org, r.actor, r.launch);
    const row = await f.db.videoSubscriptionJob.findUniqueOrThrow({where: {id: job.id}});
    expect(row.actorId).toBe(r.actor); expect(row.connectionId).toBe(r.connectionId);
    expect(row.request.schemaDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(row.snapshot).toEqual({brief: saved.brief, settings: saved.settings}); expect(row.quote).toEqual(saved.quote);
    await f.service.updateDraft(r.org, r.actor, r.draft.id, {version: r.draft.version, script: `${r.draft.brief.script}\nНовое предложение.`});
    expect((await f.db.videoSubscriptionJob.findUniqueOrThrow({where: {id: job.id}})).snapshot).toEqual(row.snapshot);
    const replay = await f.access.launch(r.org, r.actor, r.launch); expect(replay.id).toBe(job.id);
    expect(f.provider.state.submits).toHaveLength(0);
  }));

  test.each(['limits', 'draft', 'account', 'schema', 'expires'])('changed %s invalidates the reviewed approval before submission', changed => withFixture(async f => {
    const r = await f.readySubscription();
    if (changed === 'limits') await f.connections.limits(r.org, r.actor, r.connectionId, '0.5', '10');
    if (changed === 'draft') await f.service.updateDraft(r.org, r.actor, r.draft.id, {version: r.draft.version, prompt: `${r.draft.brief.prompt}\nНовый кадр.`});
    if (changed === 'account') await f.connect();
    if (changed === 'schema') f.provider.state.tools.higgsfield[0].inputSchema.properties.model.enum.push('unreviewed-model');
    if (changed === 'expires') f.provider.advance(300001);
    let error; try { await f.access.launch(r.org, r.actor, r.launch); } catch (e) { error = e; }
    expect(['VIDEO_PREFLIGHT_STALE', 'VIDEO_DRAFT_CHANGED', 'VIDEO_SCHEMA_UNSUPPORTED']).toContain(codeOf(error));
    expect(await f.db.videoSubscriptionJob.count({where: {organizationId: r.org}})).toBe(0);
    expect(f.provider.state.submits).toHaveLength(0);
  }));

  test('same actor intent is idempotent; another route/actor cannot reuse it', () => withFixture(async f => {
    const r = await f.readySubscription();
    const results = await Promise.all([f.access.launch(r.org, r.actor, r.launch), f.access.launch(r.org, r.actor, r.launch)]);
    expect(results[0].id).toBe(results[1].id);
    const another = await f.readySubscription({connectionId: r.connectionId});
    await rejectsCode(f.access.launch(r.org, r.actor, {...another.launch, intentId: r.launch.intentId}), 'VIDEO_INTENT_MISMATCH');
    await rejectsCode(f.access.launch(r.org, f.otherUser.id, r.launch), 'VIDEO_INTENT_MISMATCH');
    expect(await f.db.videoSubscriptionJob.count({where: {organizationId: r.org}})).toBe(1);
    expect(await f.db.videoRouteIntent.count({where: {organizationId: r.org}})).toBe(1);
  }));

  test('an alternate client intent replay is durably bound and cannot later switch access', () => withFixture(async f => {
    const r = await f.readySubscription(); const first = await f.access.launch(r.org, r.actor, r.launch);
    const alias = randomUUID(); expect((await f.access.launch(r.org, r.actor, {...r.launch,intentId:alias})).id).toBe(first.id);
    expect(await f.db.videoRouteIntent.count({where:{organizationId:r.org}})).toBe(2);
    const api = await f.access.preflight(r.org,r.actor,{draftId:r.draft.id,version:r.draft.version,access:{kind:'api',payer:'workspace_key'}});
    await rejectsCode(f.access.launch(r.org,r.actor,{preflightId:api.id,intentId:alias}),'VIDEO_INTENT_MISMATCH');
    expect(await f.db.videoGenerationJob.count({where:{organizationId:r.org}})).toBe(0);
    expect(await f.db.videoSubscriptionJob.count({where:{organizationId:r.org}})).toBe(1);
  }));

  test('API route keeps its USD payer and delegates to existing V1 jobs without subscription writes', () => withFixture(async f => {
    const draft = await f.prepare();
    const preflight = await f.access.preflight(f.org.id, f.user.id, {draftId: draft.id, version: draft.version, access: {kind: 'api', payer: 'workspace_key'}});
    expect(preflight.quote.unit).toBe('USD');
    const job = await f.access.launch(f.org.id, f.user.id, {preflightId: preflight.id, intentId: randomUUID()});
    expect(job.access).toEqual({kind: 'api', payer: 'workspace_key'});
    const row = await f.db.videoGenerationJob.findUniqueOrThrow({where: {id: job.id}}); expect(row.payer).toBe('workspace_key');
    expect(await f.db.videoSubscriptionJob.count({where: {organizationId: f.org.id}})).toBe(0);
    expect(f.provider.state.submits).toHaveLength(0);
  }));
});
