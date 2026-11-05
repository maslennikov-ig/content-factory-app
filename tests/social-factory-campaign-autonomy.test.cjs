const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const OriginalDate = global.Date;
const fixtureNow = OriginalDate.parse('2026-11-03T12:00:00.000Z');
global.Date = class extends OriginalDate {
  constructor(...args) { super(...(args.length ? args : [fixtureNow])); }
  static now() { return fixtureNow; }
};
test.after(() => { global.Date = OriginalDate; });
const root = path.resolve(__dirname, '..');
const base = path.join(root, 'libraries/nestjs-libraries/src/content-intelligence/social-factory');
class DomainError extends Error { constructor(code, message = code) { super(message); this.code = code; } }
const cache = new Map();
function load(file) {
  const filename = path.resolve(base, file.endsWith('.ts') ? file : `${file}.ts`);
  if (cache.has(filename)) return cache.get(filename);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, experimentalDecorators: true, emitDecoratorMetadata: true, esModuleInterop: true }, fileName: filename }).outputText;
  const module = { exports: {} };
  cache.set(filename, module.exports);
  const localRequire = request => {
    if (request === '@nestjs/common') return { Injectable: () => target => target };
    if (request.endsWith('social-factory.repository')) return { SocialFactoryRepository: class {}, SocialFactoryError: DomainError, sourceRef: id => `source:${id}`, resourceRef: (kind, id) => `resource:${kind}:${id}` };
    if (request.startsWith('.')) return load(path.relative(base, path.resolve(path.dirname(filename), request)));
    return require(request);
  };
  new Function('exports', 'require', 'module', compiled)(module.exports, localRequire, module);
  return module.exports;
}
const { CampaignService, approvalDigest } = load('campaign/campaign.service');
const { AutonomyService } = load('autonomy/autonomy.service');

// Simulates serializable commits with CAS, tenant keys, immutable events and rollback.
// Re-instantiating services over this store verifies no authority/idempotency state lives in memory.
class Store {
  rows = new Map(); queue = Promise.resolve();
  key(org, kind, id) { return JSON.stringify([org, kind, id]); }
  async transact(work) {
    const previous = this.queue; let release;
    this.queue = new Promise(resolve => { release = resolve; });
    await previous;
    const backup = structuredClone(this.rows);
    try { return await work(this); } catch (error) { this.rows = backup; throw error; } finally { release(); }
  }
  async read(org, kind, id) { return structuredClone(this.rows.get(this.key(org, kind, id)) ?? null); }
  async list(org, kind, limit = 10000, parentId) {
    const rows = [...this.rows.values()].filter(row => row.organizationId === org && row.kind === kind && (parentId === undefined || row.parentId === parentId));
    assert.ok(rows.length <= limit, 'domain query overflow must fail closed');
    return structuredClone(rows.sort((a, b) => a.id.localeCompare(b.id)));
  }
  async put(input) {
    const key = this.key(input.organizationId, input.kind, input.id); const row = this.rows.get(key);
    if (input.expectedRevision === 0 && row || input.expectedRevision > 0 && row?.revision !== input.expectedRevision) throw new DomainError('SOCIAL_FACTORY_CONFLICT');
    if (row && ['action', 'decision'].includes(input.kind)) throw new DomainError('SOCIAL_FACTORY_IMMUTABLE');
    const result = { ...structuredClone(input), parentId: input.parentId ?? row?.parentId ?? null, revision: (row?.revision ?? 0) + 1, createdAt: row?.createdAt ?? new Date(), updatedAt: new Date(), deletedAt: null };
    delete result.expectedRevision; this.rows.set(key, result); return structuredClone(result);
  }
}
function setup() { const store = new Store(); return { store, campaigns: new CampaignService(store), autonomy: new AutonomyService(store) }; }
function creation(overrides = {}) {
  return { actorId: 'user', requestId: 'request', name: 'Two weeks', timeZone: 'Europe/Moscow', startsAt: '2030-01-01', endsAt: '2030-01-14',
    allocations: [{ channelId: 'ig-a', platform: 'instagram', format: 'reel', count: 5 }, { channelId: 'ig-a', platform: 'instagram', format: 'story', count: 10, sequenceId: 'stories' }], ...overrides };
}
function material(item, overrides = {}) {
  return { version: 1, channelId: item.channelId, platform: item.platform, format: item.format, title: 'A useful guide', hook: 'One practical step', body: 'A grounded explanation.', assets: [], evidence: [], settings: {}, playbook: { version: 'v1', sourceDate: '2026-01-01' }, ...overrides };
}
async function ready(s, overrides = {}) {
  const campaign = await s.campaigns.create('org', creation({ allocations: [{ channelId: 'ig-a', platform: 'instagram', format: 'post', count: 1 }], ...overrides }));
  let { items: [item] } = await s.campaigns.get('org', campaign.id);
  item = await s.campaigns.setMaterial('org', campaign.id, item.id, { material: material(item), expectedContentRevision: item.contentRevision });
  return { campaign, item };
}
async function approve(s, campaign, item) { return s.campaigns.approve('org', campaign.id, item.id, { actorId: 'user', expectedContentRevision: item.contentRevision, digest: approvalDigest(item) }); }
function grantInput(overrides = {}) {
  return { authority: 'user', actorId: 'user', requestId: 'grant', channelIds: ['ig-a'], actions: ['prepare', 'publish', 'schedule', 'editorial_decide', 'generate_paid'], mode: 'prepare_approve', expiresAt: '2099-01-01T00:00:00.000Z', platformConsentIds: ['consent'], ...overrides };
}
function human(campaign, item, extra = {}) { return { campaignId: campaign.id, itemId: item.id, requestId: 'publish', action: 'publish', expectedContentRevision: item.contentRevision, actorId: 'user', authority: 'user', approvalDigest: approvalDigest(item), ...extra }; }
async function rejectsCode(promise, code) { await assert.rejects(promise, error => error.code === code); }

test('exact allocations count Story frames and carousel publications without multiplying per channel', async () => {
  const s = setup(); const campaign = await s.campaigns.create('org', creation({ allocations: [...creation().allocations, { channelId: 'ig-b', platform: 'instagram', format: 'carousel', count: 2, slideCount: 7 }] }));
  const { items } = await s.campaigns.get('org', campaign.id);
  assert.equal(campaign.mode, 'prepare_approve'); assert.equal(items.length, 17);
  assert.equal(items.filter(i => i.format === 'reel').length, 5); assert.equal(items.filter(i => i.format === 'story').length, 10);
  assert.ok(items.filter(i => i.format === 'story').every(i => i.sequenceId === 'stories' && i.slideCount === undefined));
  assert.deepEqual(items.filter(i => i.channelId === 'ig-b').map(i => i.slideCount), [7, 7]);
  const reels = items.filter(i => i.format === 'reel').map(i => Date.parse(i.scheduledAt));
  const intervals = reels.slice(1).map((at, i) => at - reels[i]);
  assert.ok(Math.max(...intervals) - Math.min(...intervals) <= 86400000);
  assert.equal(campaign.startsAt, '2029-12-31T21:00:00.000Z'); assert.equal(campaign.endsAt, '2030-01-14T20:59:59.999Z');
});

test('campaign trusted request idempotency survives restart and conflicting input fails without extra items', async () => {
  const s = setup(); const campaign = await s.campaigns.create('org', creation());
  assert.equal((await new CampaignService(s.store).create('org', creation())).id, campaign.id);
  await rejectsCode(s.campaigns.create('org', creation({ name: 'Different' })), 'CAMPAIGN_IDEMPOTENCY_CONFLICT');
  assert.equal((await s.store.list('org', 'campaign_item')).length, 15);
  await rejectsCode(s.campaigns.get('another-org', campaign.id), 'SOCIAL_FACTORY_NOT_FOUND');
});

test('invalid counts, ambiguous instant, slide counts and dates fail before persistence', async () => {
  const s = setup();
  for (const change of [{ timeZone: 'Mars/Olympus' }, { startsAt: '2030-02-30' }, { startsAt: '2030-01-01T12:00:00' }, { endsAt: '2029-01-01' }, { allocations: [{ channelId: 'a', platform: 'instagram', format: 'story', count: 1.5 }] }, { allocations: [{ channelId: 'a', platform: 'instagram', format: 'carousel', count: 1 }] }]) await assert.rejects(s.campaigns.create('org', creation(change)));
  assert.equal(s.store.rows.size, 0);
});

test('date-only boundaries use the campaign timezone across daylight saving changes', async () => {
  const s = setup(); const campaign = await s.campaigns.create('org', creation({ timeZone: 'America/New_York', startsAt: '2030-03-09', endsAt: '2030-03-11' }));
  assert.equal(campaign.startsAt, '2030-03-09T05:00:00.000Z'); assert.equal(campaign.endsAt, '2030-03-12T03:59:59.999Z');
});

test('approval binds immutable content+calendar revision and all edits invalidate it', async () => {
  const s = setup(); const { campaign, item } = await ready(s);
  const approved = await approve(s, campaign, item);
  const snapshot = await s.store.list('org', 'action', 1000, item.id);
  assert.equal(snapshot.length, 2); assert.equal(snapshot[1].payload.type, 'campaign_item_revision');
  const edited = await s.campaigns.setMaterial('org', campaign.id, item.id, { expectedContentRevision: item.contentRevision, material: material(item, { body: 'Changed' }) });
  assert.equal(edited.approval, undefined); assert.equal(edited.contentRevision, 3); assert.notEqual(approvalDigest(edited), approved.approval.digest);
  await rejectsCode(s.campaigns.approve('org', campaign.id, item.id, { actorId: 'user', expectedContentRevision: item.contentRevision, digest: approved.approval.digest }), 'CAMPAIGN_APPROVAL_STALE');
  const again = await approve(s, campaign, edited);
  const rescheduled = await s.campaigns.reschedule('org', campaign.id, item.id, { expectedContentRevision: again.contentRevision, scheduledAt: '2030-01-03T10:00:00Z' });
  assert.equal(rescheduled.approval, undefined); assert.equal((await s.store.list('org', 'action', 1000, item.id)).length, 4);
});

test('grant creation cannot be self-authorized and autopilot/collaborative modes require scoped user grants', async () => {
  const s = setup(); await rejectsCode(s.autonomy.grant('org', grantInput({ authority: 'agent' })), 'AUTONOMY_USER_AUTHORITY_REQUIRED');
  await rejectsCode(s.campaigns.create('org', creation({ mode: 'autopilot' })), 'AUTONOMY_GRANT_REQUIRED');
  const grant = await s.autonomy.grant('org', grantInput({ mode: 'autopilot' }));
  const campaign = await s.campaigns.create('org', creation({ mode: 'autopilot', grantId: grant.id }));
  assert.equal(campaign.mode, 'autopilot');
  await rejectsCode(s.campaigns.create('org', creation({ requestId: 'bad-channel', mode: 'autopilot', grantId: grant.id, allocations: [{ channelId: 'other', platform: 'telegram', format: 'post', count: 1 }] })), 'AUTONOMY_CHANNEL_SCOPE');
  const collab = await s.autonomy.grant('org', grantInput({ requestId: 'collab', mode: 'collaborative' }));
  assert.equal((await s.campaigns.create('org', creation({ requestId: 'collab', mode: 'collaborative', grantId: collab.id }))).mode, 'collaborative');
});

test('human publishing requires approval, and a claim executes once across service restart', async () => {
  const s = setup(); const { campaign, item } = await ready(s);
  await rejectsCode(s.autonomy.admit('org', human(campaign, item)), 'CAMPAIGN_APPROVAL_REQUIRED');
  await approve(s, campaign, item);
  const claim = await s.autonomy.admit('org', human(campaign, item));
  assert.equal(claim.execute, false); assert.equal(claim.state, 'reserved');
  assert.equal((await s.autonomy.markSubmitting('org', claim.id)).execute, true);
  assert.equal((await new AutonomyService(s.store).markSubmitting('org', claim.id)).execute, false);
  assert.equal((await s.autonomy.admit('org', human(campaign, item))).state, 'submitting');
  await rejectsCode(s.autonomy.settle('org', claim.id, { state: 'published' }), 'AUTONOMY_PROVIDER_RECEIPT_REQUIRED');
  await s.autonomy.settle('org', claim.id, { state: 'published', receipt: { provider: 'instagram', externalId: 'external', publishedAt: '2030-01-03T10:00:00Z' } });
  const published = (await s.campaigns.get('org', campaign.id)).items[0];
  assert.equal(published.publication.externalId, 'external'); assert.equal(published.publication.revision, item.contentRevision);
});

test('stop, revoke, content edit, and mode changes invalidate pending external execution', async () => {
  for (const operation of ['stop', 'revoke', 'edit', 'mode']) {
    const s = setup(); const { campaign, item } = await ready(s); await approve(s, campaign, item);
    const grant = await s.autonomy.grant('org', grantInput());
    const claim = await s.autonomy.admit('org', human(campaign, item, { grantId: grant.id }));
    if (operation === 'stop') await s.campaigns.stop('org', campaign.id, 'user');
    if (operation === 'revoke') await s.autonomy.revoke('org', grant.id, 'user');
    if (operation === 'edit') await s.campaigns.setMaterial('org', campaign.id, item.id, { expectedContentRevision: item.contentRevision, material: material(item, { body: 'changed' }) });
    if (operation === 'mode') { const next = await s.autonomy.grant('org', grantInput({ requestId: 'next', mode: 'autopilot' })); await s.campaigns.setMode('org', campaign.id, { actorId: 'user', mode: 'autopilot', grantId: next.id }); }
    await assert.rejects(s.autonomy.markSubmitting('org', claim.id), undefined, operation);
  }
});

test('unknown provider submission cannot retry; only receipt-backed reconciliation resolves it', async () => {
  const s = setup(); const { campaign, item } = await ready(s); await approve(s, campaign, item);
  const claim = await s.autonomy.admit('org', human(campaign, item)); await s.autonomy.markSubmitting('org', claim.id);
  await s.autonomy.settle('org', claim.id, { state: 'uncertain', reason: 'Provider response lost' });
  assert.deepEqual(await s.campaigns.retry('org', campaign.id), []);
  assert.equal((await s.autonomy.markSubmitting('org', claim.id)).execute, false);
  await rejectsCode(s.autonomy.admit('org', human(campaign, item, { requestId: 'another' })), 'AUTONOMY_ITEM_LOCKED');
  await rejectsCode(s.autonomy.settle('org', claim.id, { state: 'failed' }), 'AUTONOMY_INVALID_TRANSITION');
  await s.campaigns.stop('org', campaign.id, 'user');
  await s.autonomy.reconcile('org', claim.id, { state: 'published', receipt: { provider: 'instagram', externalId: 'confirmed' } });
  assert.equal((await s.campaigns.get('org', campaign.id)).items[0].state, 'published');
});

test('atomic reservations enforce aggregate and provider/payer budgets under concurrent admission', async () => {
  const s = setup(); const grant = await s.autonomy.grant('org', grantInput({ budget: { currency: 'USD', maximum: 10 }, providerBudget: { provider: 'provider', payer: 'company', currency: 'USD', maximum: 10 } }));
  const campaign = await s.campaigns.create('org', creation({ allocations: [{ channelId: 'ig-a', platform: 'instagram', format: 'post', count: 2 }], grantId: grant.id }));
  const { items } = await s.campaigns.get('org', campaign.id);
  const requests = items.map((item, i) => ({ campaignId: campaign.id, itemId: item.id, requestId: `paid-${i}`, action: 'generate_paid', expectedContentRevision: item.contentRevision, provider: 'provider', payer: 'company', cost: { currency: 'USD', maximum: 6 } }));
  const results = await Promise.allSettled(requests.map(input => s.autonomy.admit('org', input)));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.code, 'AUTONOMY_BUDGET_EXCEEDED');
  const accepted = results.find(result => result.status === 'fulfilled').value;
  await s.autonomy.markSubmitting('org', accepted.id);
  await s.autonomy.settle('org', accepted.id, { state: 'uncertain' });
  const rejected = requests.find(input => input.itemId !== accepted.itemId);
  await rejectsCode(s.autonomy.admit('org', rejected), 'AUTONOMY_BUDGET_EXCEEDED');
  await s.autonomy.reconcile('org', accepted.id, { state: 'failed', actualCost: { currency: 'USD', amount: 0 } });
  assert.equal((await s.autonomy.admit('org', rejected)).state, 'reserved');
});

test('formats, posting windows, exclusions, consent and payer constrain grants', async () => {
  for (const [change, extra, code] of [
    [{ formats: ['reel'] }, {}, 'AUTONOMY_FORMAT_SCOPE'],
    [{ timeZone: 'UTC', postingWindows: [{ daysOfWeek: [0, 1, 2, 3, 4, 5, 6], start: '00:00', end: '00:01' }] }, { action: 'schedule' }, 'AUTONOMY_POSTING_WINDOW'],
    [{ exclusions: ['grounded'] }, {}, 'AUTONOMY_EXCLUDED_CONTENT'],
    [{ platformConsentIds: [] }, { requiredConsentId: 'consent' }, 'AUTONOMY_PLATFORM_CONSENT_REQUIRED'],
    [{ budget: { currency: 'USD', maximum: 50 }, providerBudget: { provider: 'provider', payer: 'company', currency: 'USD', maximum: 50 } }, { action: 'generate_paid', provider: 'provider', payer: 'other', cost: { currency: 'USD', maximum: 3 } }, 'AUTONOMY_PROVIDER_BUDGET_EXCEEDED'],
  ]) {
    const s = setup(); const { campaign, item } = await ready(s); await approve(s, campaign, item);
    const grant = await s.autonomy.grant('org', grantInput(change));
    await rejectsCode(s.autonomy.admit('org', human(campaign, item, { grantId: grant.id, ...extra })), code);
  }
});

test('pending reservation checks grant expiry at execution', async () => {
  const s = setup(); const { campaign, item } = await ready(s); await approve(s, campaign, item);
  const grant = await s.autonomy.grant('org', grantInput());
  const claim = await s.autonomy.admit('org', human(campaign, item, { grantId: grant.id }));
  const record = await s.store.read('org', 'grant', grant.id); record.payload.expiresAt = '2000-01-01T00:00:00Z';
  await s.store.put({ organizationId: 'org', kind: 'grant', id: grant.id, payload: record.payload, expectedRevision: record.revision });
  await rejectsCode(s.autonomy.markSubmitting('org', claim.id), 'AUTONOMY_GRANT_INACTIVE');
});

test('decisions preserve evidence and missing facts only block dependent items; agents cannot authorize rights', async () => {
  const s = setup(); const { campaign, item } = await ready(s);
  const grant = await s.autonomy.grant('org', grantInput());
  const input = { actorId: 'agent', authority: 'agent', requestId: 'question', campaignId: campaign.id, itemId: item.id, grantId: grant.id, kind: 'missing_fact', question: 'Does the company hold a certificate?', evidence: [], factStatus: 'unknown', missingFacts: ['Certificate'] };
  await rejectsCode(s.autonomy.decide('org', { ...input, answer: 'Yes' }), 'AUTONOMY_MISSING_FACT_CANNOT_BE_INVENTED');
  const decision = await s.autonomy.decide('org', input);
  assert.equal(decision.answer, undefined); assert.equal(decision.factStatus, 'unknown');
  assert.equal((await s.campaigns.get('org', campaign.id)).items[0].state, 'needs_input');
  await rejectsCode(s.autonomy.decide('org', { ...input, requestId: 'permission', kind: 'permission', answer: 'Granted', factStatus: 'inferred' }), 'AUTONOMY_CANNOT_SELF_AUTHORIZE');
  await rejectsCode(s.autonomy.decide('org', { ...input, requestId: 'invent', kind: 'editorial', answer: 'Certified', factStatus: 'verified', missingFacts: [] }), 'AUTONOMY_FACT_UNVERIFIED');
  const evidence = { id: 'source', source: 'company-upload', capturedAt: '2026-01-01T00:00:00Z', access: 'upload', rights: 'permitted', factStatus: 'verified' };
  const grounded = await s.autonomy.decide('org', { ...input, requestId: 'editorial', kind: 'editorial', answer: 'Explain the uploaded specification', factStatus: 'verified', evidence: [evidence], missingFacts: [] });
  assert.deepEqual(grounded.evidenceIds, ['source']); assert.deepEqual(grounded.evidence, [evidence]);
});

test('a publish reservation can bind a scheduled native post and remains guarded until send', async () => {
  const s = setup(); const { campaign, item } = await ready(s); await approve(s, campaign, item);
  const claim = await s.autonomy.admit('org', human(campaign, item, { alsoRequire: ['schedule'] }));
  const linked = await s.autonomy.bindPost('org', claim.id, { postId: 'native-post', scheduled: true });
  assert.equal(linked.state, 'scheduled'); assert.equal(linked.postId, 'native-post');
  assert.equal((await s.autonomy.findActionForPost('org', 'native-post')).id, claim.id);
  assert.equal((await s.autonomy.markSubmitting('org', claim.id)).execute, true);
});

test('retry touches only failed/needs-input items and leaves complete/uncertain materials unchanged', async () => {
  const s = setup(); const campaign = await s.campaigns.create('org', creation({ allocations: [{ channelId: 'ig-a', platform: 'instagram', format: 'post', count: 4 }] }));
  const { items } = await s.campaigns.get('org', campaign.id);
  for (const [i, state] of ['published', 'uncertain', 'failed', 'needs_input'].entries()) {
    const record = await s.store.read('org', 'campaign_item', items[i].id); record.payload.state = state; record.payload.material = material(items[i]);
    await s.store.put({ organizationId: 'org', kind: 'campaign_item', id: items[i].id, payload: record.payload, expectedRevision: record.revision });
  }
  const changed = await s.campaigns.retry('org', campaign.id); assert.equal(changed.length, 2);
  assert.ok(changed.every(item => item.state === 'ready'));
  const after = (await s.campaigns.get('org', campaign.id)).items;
  assert.deepEqual(after.slice(0, 2).map(i => i.state), ['published', 'uncertain']);
});

test('typed source dependencies affect content and decisions while allocations/grants remain independent', async () => {
  const s = setup(); const { campaign, item } = await ready(s);
  const evidence = { id: 'snippet-1', sourceId: 'canonical-source', source: 'upload', capturedAt: '2026-01-01T00:00:00Z', access: 'upload', rights: 'permitted', factStatus: 'owner_asserted' };
  await s.campaigns.setMaterial('org', campaign.id, item.id, { expectedContentRevision: item.contentRevision, material: material(item, { evidence: [evidence] }), editorialId: 'editorial', discoveryIds: ['research'] });
  assert.deepEqual((await s.store.read('org', 'campaign_item', item.id)).sourceIds, ['source:canonical-source', 'resource:editorial:editorial', 'resource:discovery:research']);
  assert.equal((await s.store.read('org', 'campaign', campaign.id)).sourceIds, undefined);
  const grant = await s.autonomy.grant('org', grantInput());
  assert.equal((await s.store.read('org', 'grant', grant.id)).sourceIds, undefined);
  const decision = { authority: 'user', actorId: 'user', requestId: 'owner', campaignId: campaign.id, question: 'Which specialty?', answer: 'Uploaded specialty', kind: 'editorial', evidence: [evidence], factStatus: 'owner_asserted' };
  const asserted = await s.autonomy.decide('org', decision);
  assert.equal(asserted.factStatus, 'owner_asserted');
  const records = await s.store.list('org', 'decision'); assert.deepEqual(records[0].sourceIds, ['source:canonical-source']);
  await rejectsCode(s.autonomy.decide('org', { ...decision, requestId: 'unverified', factStatus: 'verified' }), 'AUTONOMY_FACT_UNVERIFIED');
});

test('missing user facts survive retry until content is explicitly replaced', async () => {
  const s = setup(); const { campaign, item } = await ready(s);
  await s.autonomy.decide('org', { authority: 'user', actorId: 'user', requestId: 'missing', campaignId: campaign.id, itemId: item.id, question: 'Actual business fact?', kind: 'missing_fact', evidence: [], factStatus: 'unknown', missingFacts: ['Actual business fact'] });
  assert.deepEqual(await s.campaigns.retry('org', campaign.id), []);
  assert.equal((await s.campaigns.get('org', campaign.id)).items[0].state, 'needs_input');
});

test('native enqueue failure releases reservation without pretending an external submission happened', async () => {
  const s = setup(); const { campaign, item } = await ready(s); await approve(s, campaign, item);
  const claim = await s.autonomy.admit('org', human(campaign, item));
  assert.equal((await s.autonomy.settle('org', claim.id, { state: 'failed', reason: 'Native schedule failed before dispatch' })).state, 'failed');
  assert.equal((await s.campaigns.retry('org', campaign.id)).length, 1);
});

test('provider receipt remains immutable and binding tolerates a completed immediate send', async () => {
  const s = setup(); const { campaign, item } = await ready(s); await approve(s, campaign, item);
  const claim = await s.autonomy.admit('org', human(campaign, item));
  await s.autonomy.bindPost('org', claim.id, { postId: 'post' });
  await s.autonomy.markSubmitting('org', claim.id);
  assert.equal((await s.autonomy.bindPost('org', claim.id, { postId: 'post', scheduled: true })).state, 'submitting');
  await s.autonomy.settle('org', claim.id, { state: 'published', postId: 'post', receipt: { provider: 'ig', externalId: 'external' } });
  assert.equal((await s.autonomy.bindPost('org', claim.id, { postId: 'post' })).state, 'published');
  await rejectsCode(s.autonomy.settle('org', claim.id, { state: 'published', receipt: { provider: 'ig', externalId: 'another' } }), 'AUTONOMY_RECEIPT_CONFLICT');
});

test('unknown paid generation reconciles completion without creating another paid request', async () => {
  const s = setup(); const { campaign, item } = await ready(s);
  const grant = await s.autonomy.grant('org', grantInput({ budget: { currency: 'USD', maximum: 10 } }));
  const claim = await s.autonomy.admit('org', { campaignId: campaign.id, itemId: item.id, action: 'generate_paid', expectedContentRevision: item.contentRevision, grantId: grant.id, requestId: 'paid', provider: 'provider', payer: 'company', cost: { currency: 'USD', maximum: 5 } });
  await s.autonomy.markSubmitting('org', claim.id); await s.autonomy.settle('org', claim.id, { state: 'uncertain' });
  const completed = await s.autonomy.reconcile('org', claim.id, { state: 'prepared', actualCost: { currency: 'USD', amount: 4 } });
  assert.equal(completed.state, 'prepared'); assert.equal(completed.actualCost.amount, 4);
  assert.equal((await s.campaigns.get('org', campaign.id)).items[0].state, 'ready');
});

test('source revocation during submission cannot erase a receipt or publish the replacement revision', async () => {
  const s = setup(); const { campaign, item } = await ready(s); await approve(s, campaign, item);
  const claim = await s.autonomy.admit('org', human(campaign, item)); await s.autonomy.markSubmitting('org', claim.id);
  const current = await s.store.read('org', 'campaign_item', item.id);
  current.payload.contentRevision++; current.payload.state = 'uncertain';
  delete current.payload.material; delete current.payload.approval;
  current.payload.blocker = { code: 'SOURCE_REVOKED', detail: 'Source withdrawn while provider was processing.' };
  await s.store.put({ organizationId: 'org', kind: 'campaign_item', id: item.id, payload: current.payload, expectedRevision: current.revision });
  const outcome = await s.autonomy.settle('org', claim.id, { state: 'published', receipt: { provider: 'instagram', externalId: 'accepted-before-revoke' } });
  assert.equal(outcome.state, 'published'); assert.equal(outcome.receipt.externalId, 'accepted-before-revoke');
  const revised = (await s.campaigns.get('org', campaign.id)).items[0];
  assert.equal(revised.state, 'needs_input'); assert.equal(revised.contentRevision, item.contentRevision + 1);
  assert.equal(revised.publication.revision, item.contentRevision); assert.equal(revised.blocker.code, 'SOURCE_REVOKED');
});

test('scheduled publish admission checks planned window while execution checks actual time', async () => {
  const s = setup(); const { campaign, item } = await ready(s);
  // Choose a fixed local slot guaranteed to differ from the execution hour without relying on today's date.
  const plannedHour = new Date().getUTCHours() < 12 ? 14 : 2;
  const start = `${String(plannedHour).padStart(2, '0')}:00`;
  const end = `${String(plannedHour + 1).padStart(2, '0')}:00`;
  const scheduled = await s.campaigns.reschedule('org', campaign.id, item.id, { scheduledAt: `2030-01-02T${start}:00Z`, expectedContentRevision: item.contentRevision });
  await approve(s, campaign, scheduled);
  const grant = await s.autonomy.grant('org', grantInput({ timeZone: 'UTC', postingWindows: [{ daysOfWeek: [0, 1, 2, 3, 4, 5, 6], start, end }] }));
  const claim = await s.autonomy.admit('org', human(campaign, scheduled, { grantId: grant.id, alsoRequire: ['schedule'] }));
  assert.equal(claim.state, 'reserved');
  await rejectsCode(s.autonomy.markSubmitting('org', claim.id), 'AUTONOMY_POSTING_WINDOW');
});

test('native replies recheck current grant after the root part was submitted', async () => {
  const s = setup(); const { campaign, item } = await ready(s); await approve(s, campaign, item);
  const grant = await s.autonomy.grant('org', grantInput());
  const claim = await s.autonomy.admit('org', human(campaign, item, { grantId: grant.id }));
  assert.equal((await s.autonomy.assertSubmitting('org', claim.id)).execute, false);
  assert.equal((await s.autonomy.markSubmitting('org', claim.id)).execute, true);
  assert.equal((await s.autonomy.assertSubmitting('org', claim.id)).execute, true);
  await s.autonomy.revoke('org', grant.id, 'user');
  await rejectsCode(s.autonomy.assertSubmitting('org', claim.id), 'AUTONOMY_GRANT_INACTIVE');
  assert.equal((await s.autonomy.getAction('org', claim.id)).state, 'submitting');
  // Revocation blocks future parts while confirmed accepted provider work remains reconcilable.
  await s.autonomy.settle('org', claim.id, { state: 'uncertain', reason: 'Root accepted; remaining replies stopped.' });
  assert.equal((await s.autonomy.assertSubmitting('org', claim.id)).execute, false);
});

test('same-mode replacement with a narrower grant blocks pending automatic publishes and Threads replies', async () => {
  for (const explicitGrant of [false, true]) {
    for (const rootAlreadySubmitted of [false, true]) {
      const s = setup();
      const original = await s.autonomy.grant('org', grantInput({ mode: 'autopilot' }));
      const { campaign, item } = await ready(s, { mode: 'autopilot', grantId: original.id });
      const claim = await s.autonomy.admit('org', { campaignId: campaign.id, itemId: item.id, requestId: 'automatic-publish', action: 'publish', expectedContentRevision: item.contentRevision, ...(explicitGrant ? { grantId: original.id } : {}) });
      if (rootAlreadySubmitted) assert.equal((await s.autonomy.markSubmitting('org', claim.id)).execute, true);
      const narrower = await s.autonomy.grant('org', grantInput({ requestId: 'narrower', mode: 'autopilot', actions: ['prepare'] }));
      await s.campaigns.setMode('org', campaign.id, { actorId: 'user', mode: 'autopilot', grantId: narrower.id });
      await rejectsCode(rootAlreadySubmitted ? s.autonomy.assertSubmitting('org', claim.id) : s.autonomy.markSubmitting('org', claim.id), 'AUTONOMY_GRANT_SUPERSEDED');
      assert.equal((await s.autonomy.getAction('org', claim.id)).state, rootAlreadySubmitted ? 'submitting' : 'reserved');
      if (rootAlreadySubmitted) {
        await s.autonomy.settle('org', claim.id, { state: 'published', receipt: { provider: 'instagram', externalId: 'accepted-original-submission' } });
        assert.equal((await s.autonomy.getAction('org', claim.id)).receipt.externalId, 'accepted-original-submission');
      }
    }
  }
});

test('an explicit old grant cannot override the campaign current grant on a new automatic request', async () => {
  const s = setup();
  const original = await s.autonomy.grant('org', grantInput({ mode: 'autopilot' }));
  const { campaign, item } = await ready(s, { mode: 'autopilot', grantId: original.id });
  const narrower = await s.autonomy.grant('org', grantInput({ requestId: 'narrower', mode: 'autopilot', actions: ['prepare'] }));
  await s.campaigns.setMode('org', campaign.id, { actorId: 'user', mode: 'autopilot', grantId: narrower.id });
  await rejectsCode(s.autonomy.admit('org', { campaignId: campaign.id, itemId: item.id, requestId: 'old-explicit-grant', action: 'publish', expectedContentRevision: item.contentRevision, grantId: original.id }), 'AUTONOMY_GRANT_SUPERSEDED');
});

test('explicit action grants work without a campaign default but cannot survive later authority replacement', async () => {
  const s = setup(); const { campaign, item } = await ready(s); await approve(s, campaign, item);
  const original = await s.autonomy.grant('org', grantInput());
  const claim = await s.autonomy.admit('org', { campaignId: campaign.id, itemId: item.id, requestId: 'explicit-action', action: 'publish', expectedContentRevision: item.contentRevision, grantId: original.id });
  const narrower = await s.autonomy.grant('org', grantInput({ requestId: 'narrower', actions: ['prepare'] }));
  await s.campaigns.setMode('org', campaign.id, { actorId: 'user', mode: 'prepare_approve', grantId: narrower.id });
  await rejectsCode(s.autonomy.markSubmitting('org', claim.id), 'AUTONOMY_GRANT_SUPERSEDED');
});

test('trusted explicit human approval remains usable after automatic grant replacement', async () => {
  const s = setup();
  const original = await s.autonomy.grant('org', grantInput());
  const { campaign, item } = await ready(s, { grantId: original.id }); await approve(s, campaign, item);
  const claim = await s.autonomy.admit('org', human(campaign, item));
  const narrower = await s.autonomy.grant('org', grantInput({ requestId: 'narrower', actions: ['prepare'] }));
  await s.campaigns.setMode('org', campaign.id, { actorId: 'user', mode: 'prepare_approve', grantId: narrower.id });
  assert.equal((await s.autonomy.markSubmitting('org', claim.id)).execute, true);
});

test('removing the campaign grant invalidates its queued automatic reservation', async () => {
  const s = setup(); const original = await s.autonomy.grant('org', grantInput());
  const { campaign, item } = await ready(s, { grantId: original.id }); await approve(s, campaign, item);
  const claim = await s.autonomy.admit('org', { campaignId: campaign.id, itemId: item.id, requestId: 'automatic-publish', action: 'publish', expectedContentRevision: item.contentRevision });
  await s.campaigns.setMode('org', campaign.id, { actorId: 'user', mode: 'prepare_approve' });
  await rejectsCode(s.autonomy.markSubmitting('org', claim.id), 'AUTONOMY_GRANT_SUPERSEDED');
});

test('agent editorial decisions cannot use an old explicit grant over the newer campaign grant', async () => {
  const s = setup(); const original = await s.autonomy.grant('org', grantInput());
  const { campaign, item } = await ready(s, { grantId: original.id });
  const narrower = await s.autonomy.grant('org', grantInput({ requestId: 'narrow-editorial', actions: ['prepare'] }));
  await s.campaigns.setMode('org', campaign.id, { actorId: 'user', mode: 'prepare_approve', grantId: narrower.id });
  await rejectsCode(s.autonomy.decide('org', { actorId: 'agent', authority: 'agent', requestId: 'stale-editorial', campaignId: campaign.id, itemId: item.id, grantId: original.id, kind: 'editorial', question: 'Which angle?', answer: 'Explain the practical steps.', factStatus: 'inferred', evidence: [] }), 'AUTONOMY_GRANT_SUPERSEDED');
  assert.equal((await s.store.list('org', 'decision')).length, 0);
});

test('paid editorial checkpoint cannot persist after campaign authority changes during the model call', async () => {
  for (const removed of [false, true]) {
    const s = setup(); const original = await s.autonomy.grant('org', grantInput());
    const { campaign, item } = await ready(s, { grantId: original.id });
    const campaignAuthority = { grantId: original.id, mode: campaign.mode };
    if (removed) await s.campaigns.setMode('org', campaign.id, { actorId: 'user', mode: campaign.mode });
    else {
      const replacement = await s.autonomy.grant('org', grantInput({ requestId: 'replacement-editorial' }));
      await s.campaigns.setMode('org', campaign.id, { actorId: 'user', mode: campaign.mode, grantId: replacement.id });
    }
    await rejectsCode(s.autonomy.decide('org', { actorId: 'agent', authority: 'agent', requestId: 'paid-editorial', campaignId: campaign.id, itemId: item.id, grantId: original.id, campaignAuthority, kind: 'editorial', question: 'Which angle?', answer: 'Explain the practical steps.', factStatus: 'inferred', evidence: [] }), 'AUTONOMY_GRANT_SUPERSEDED');
    assert.equal((await s.store.list('org', 'decision')).length, 0);
  }
});

test('date-only cold start uses tentative local daytime while configured slots and explicit instants survive', async()=>{
 const s=setup();const campaign=await s.campaigns.create('org',creation({requestId:'daytime'}));const items=(await s.campaigns.get('org',campaign.id)).items;
 assert.equal(campaign.scheduleBasis,'tentative');assert.ok(items.every(item=>new Intl.DateTimeFormat('en-US',{timeZone:'Europe/Moscow',hour:'2-digit',hourCycle:'h23'}).format(new Date(item.scheduledAt))==='12'));
 const configured=await s.campaigns.create('org',creation({requestId:'configured',slotMinutesUtc:{'ig-a':[600]}}));assert.equal(configured.scheduleBasis,'channel');
 assert.ok((await s.campaigns.get('org',configured.id)).items.every(item=>new Date(item.scheduledAt).getUTCHours()===10));
 const explicit=await s.campaigns.create('org',creation({requestId:'explicit',startsAt:'2030-01-01T00:00:00Z',endsAt:'2030-01-01T01:00:00Z'}));assert.equal(explicit.scheduleBasis,'explicit');assert.ok((await s.campaigns.get('org',explicit.id)).items.every(item=>new Date(item.scheduledAt).getUTCHours()===0));
});

test('explicit selected-item revision preserves immutable history and siblings while clearing old material/approval',async()=>{
 const s=setup();const {campaign,item}=await ready(s,{allocations:[{channelId:'ig-a',platform:'instagram',format:'post',count:2}]});
 const approved=await approve(s,campaign,item);
 const before=await s.campaigns.get('org',campaign.id),sibling=before.items.find(row=>row.id!==item.id);
 const oldHistory=JSON.stringify((await s.store.list('org','action')).filter(row=>row.payload.type==='campaign_item_revision'));
 const revised=await s.campaigns.beginRevision('org',campaign.id,item.id,approved.contentRevision);
 assert.equal(revised.contentRevision,approved.contentRevision+1);assert.equal(revised.state,'planned');assert.equal(revised.material,undefined);assert.equal(revised.approval,undefined);
 assert.deepEqual((await s.campaigns.get('org',campaign.id)).items.find(row=>row.id===sibling.id),sibling);
 assert.ok(oldHistory.includes('A grounded explanation.'));assert.ok(JSON.stringify(await s.store.list('org','action')).includes('A grounded explanation.'));
 await rejectsCode(s.campaigns.beginRevision('org',campaign.id,item.id,approved.contentRevision),'CAMPAIGN_REVISION_CONFLICT');
});
test('explicit revision cannot unlock scheduled or active generation items',async()=>{
 for(const state of ['scheduled','preparing']){
  const s=setup();const {campaign,item}=await ready(s);const row=await s.store.read('org','campaign_item',item.id);
  await s.store.put({organizationId:'org',kind:'campaign_item',id:item.id,expectedRevision:row.revision,payload:{...row.payload,state}});
  await rejectsCode(s.campaigns.beginRevision('org',campaign.id,item.id,item.contentRevision),'CAMPAIGN_REVISION_ITEM_LOCKED');
 }
});

test('all three working modes survive service restart and a mode switch does not approve or publish material', async () => {
  const s = setup(); const {campaign,item} = await ready(s);
  const grant = await s.autonomy.grant('org', grantInput({requestId:'persisted-modes',mode:'autopilot',actions:['prepare','editorial_decide']}));
  for(const mode of ['collaborative','prepare_approve','autopilot']) {
    await s.campaigns.setMode('org',campaign.id,{actorId:'user',mode,...(mode==='autopilot'?{grantId:grant.id}:{})});
    const saved=await new CampaignService(s.store).get('org',campaign.id);
    assert.equal(saved.campaign.mode,mode);
    assert.equal(saved.items[0].contentRevision,item.contentRevision);
    assert.equal(saved.items[0].approval,undefined);assert.equal(saved.items[0].publication,undefined);
  }
});

test('unpriced preparation respects finite applicable caps and preserves proven unrelated/free routes',async()=>{
 const s=setup();
 const capped=await s.autonomy.grant('org',grantInput({budget:{currency:'USD',maximum:0}}));
 await rejectsCode(s.autonomy.assertUnpricedPreparationAllowed('org',capped.id,async()=>['openai']),'AUTONOMY_COST_ESTIMATE_UNAVAILABLE');
 await s.autonomy.assertUnpricedPreparationAllowed('org',capped.id,async()=>[]);
 const provider=await s.autonomy.grant('org',grantInput({requestId:'provider-grant',providerBudget:{provider:'higgsfield',payer:'owner-defined',currency:'CRD',maximum:0}}));
 await s.autonomy.assertUnpricedPreparationAllowed('org',provider.id,async()=>['openai','tavily']);
 await rejectsCode(s.autonomy.assertUnpricedPreparationAllowed('org',provider.id,async()=>[undefined]),'AUTONOMY_COST_ESTIMATE_UNAVAILABLE');
 await rejectsCode(s.autonomy.assertUnpricedPreparationAllowed('org',provider.id,async()=>['higgsfield']),'AUTONOMY_COST_ESTIMATE_UNAVAILABLE');
 assert.equal((await s.store.list('org','action')).length,0,'a refusal must not invent a zero-cost reservation');
});
test('unbudgeted or absent grants never need a price or billing-config lookup',async()=>{
 const s=setup(),grant=await s.autonomy.grant('org',grantInput());
 const forbidden=async()=>{assert.fail('no budget means no cost-route resolution');};
 await s.autonomy.assertUnpricedPreparationAllowed('org',grant.id,forbidden);
 await s.autonomy.assertUnpricedPreparationAllowed('org',undefined,forbidden);
});
