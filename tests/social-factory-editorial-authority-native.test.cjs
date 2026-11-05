'use strict';
const { loadRegistry, servicesFrom, executeTool, requestContextFor, permissionsService, IDENTITY } = require('./helpers/agent-capabilities.cjs');
const { profile, permission, editorialAuthorityRows, socialFactoryEditorialAuthorityServices } = require('./fixtures/agent-scenarios/social-factory-editorial-authority-world.cjs');
const registry = loadRegistry(), catalogue = registry.CAPABILITY_CATALOGUE;
const find = id => catalogue.find(row => row.id === id);
function fixture() {
  const rows = { channels: [{ id: 'c1', providerIdentifier: 'telegram', organizationId: 'org-1' }], ...editorialAuthorityRows() }, requests = [], writes = [];
  const scoped = (_name, org) => { if (org !== 'org-1') throw new Error('wrong tenant'); };
  const ports = socialFactoryEditorialAuthorityServices({ rows, requests, writes, scoped });
  const gate = new registry.DoorPolicyGate(permissionsService());
  const invoke = (id, input, role = 'ADMIN', admitInExecute = false) => executeTool(registry.buildCapabilityTool(find(id), { entrance: 'chat', language: 'ru', gate, admitInExecute, services: servicesFrom(ports) }), find(id).input.parse(input), { requestContext: requestContextFor(registry, { ...IDENTITY, role }) });
  return { rows, requests, writes, ports, gate, invoke };
}
const summary = result => result.output.summary.untrustedData?.value ?? result.output.summary;

test('actual native editor door saves the exact person profile, reads persisted owner assertions and rejects stale revisions', async () => {
  const f = fixture(), input = { channelId: 'c1', expectedRevision: 0, profile: profile() };
  const saved = await f.invoke('channel.editorial_profile_save', input, 'EDITOR');
  expect(summary(saved)).toEqual({ channelId: 'c1', revision: 1, profile: profile() });
  expect(saved.parts).toContainEqual({ type: 'data-channel', data: { kind: 'channel', id: 'c1' } });
  expect(f.requests[0]).toEqual(['profile.save', 'org-1', profile(), 0]);
  const resolved = summary(await f.invoke('channel.editorial_profile', { channelId: 'c1' }, 'EDITOR'));
  expect(resolved.profile.audience).toBe(profile().audience); expect(resolved.facts.find(row => row.key === 'audience').provenance).toBe('owner_asserted');
  expect((await f.invoke('channel.editorial_profile_save', input, 'EDITOR')).output).toMatchObject({ ok: false, code: 'SOCIAL_FACTORY_CONFLICT' });
  expect(f.writes).toEqual([['profile.saved', 'org-1', 'c1', 1]]);
});

test('profile native input cannot spoof scope, nested profile keys or verified source evidence', async () => {
  const f = fixture(), cap = find('channel.editorial_profile_save'), input = { channelId: 'c1', expectedRevision: 0, profile: profile() };
  for (const raw of [{ ...input, actorId: 'other' }, { ...input, organizationId: 'other' }, { ...input, profile: profile({ madeUp: true }) }]) expect(cap.input.safeParse(raw).success).toBe(false);
  await expect(f.invoke(cap.id, { ...input, profile: profile({ channelId: 'other-channel' }) })).rejects.toMatchObject({ name: 'ZodError' }); expect(f.requests).toEqual([]);
  const invented = profile({ facts: [{ key: 'audience', value: profile().audience, provenance: 'verified', scope: 'channel', evidenceIds: [] }] });
  expect(cap.input.safeParse({ ...input, profile: invented }).success).toBe(false);
  await expect(f.ports.ChannelProfileServiceV1.save('org-1', invented, 0)).rejects.toThrow('channel_profile_derived_requires_snapshot');
  await expect(f.invoke(cap.id, { ...input, channelId: 'foreign', profile: profile({ channelId: 'foreign' }) })).rejects.toThrow('channel_profile_not_found');
  expect(f.writes).toEqual([]);
});

test('real role metadata denies reader writes and editor permission grants before service calls', async () => {
  const f = fixture();
  for (const [id, input, role] of [
    ['channel.editorial_profile_save', { channelId: 'c1', expectedRevision: 0, profile: profile() }, 'USER'],
    ['source.permission_save', permission(), 'EDITOR'],
    ['source.permission_revoke', { sourceId: 'registered-owned', expectedRevision: 1 }, 'EDITOR'],
  ]) expect((await f.invoke(id, input, role, true)).output.ok).toBe(false);
  expect(f.requests).toEqual([]); expect(f.writes).toEqual([]);
  expect((await f.gate.check(find('channel.editorial_profile_save').door, { ...IDENTITY, role: 'EDITOR' })).allowed).toBe(true);
  expect((await f.gate.check(find('source.permission_save').door, { ...IDENTITY, role: 'ADMIN' })).allowed).toBe(true);
  expect((await f.gate.check(find('source.permission_save').door, { ...IDENTITY, role: 'EDITOR' })).allowed).toBe(false);
  const mcp = registry.buildMcpCapabilityTools(catalogue, { language: 'en', role: 'ADMIN', services: servicesFrom(f.ports), gate: f.gate });
  expect(mcp.source_permission_save).toBeUndefined();
});

test('permission approval displays exact person facts; actual service normalizes registry origin and binds server actor/tenant', async () => {
  const f = fixture(), cap = find('source.permission_save'), input = permission({ origin: 'first_party' });
  expect(cap.risk).toBe('confirm');
  expect(cap.input.safeParse({ ...input, origin: undefined }).success).toBe(false);
  expect(() => registry.assertCapabilityRegistry(catalogue)).not.toThrow();
  expect(await cap.approvalContent({ language: 'ru' }, input)).toEqual(input);
  const title = await cap.describeApproval({ language: 'ru' }, input);
  for (const part of [input.sourceId, input.basis, 'editorial', 'c1', input.expiresAt, 'Публичный доступ не подтверждает права']) expect(title).toContain(part);
  expect(summary(await f.invoke(cap.id, input))).toMatchObject({ sourceId: 'registered-owned', revision: 1, permission: { origin: 'web', evidenceId: 'owner:user-1:registered-owned:1', organizationId: 'org-1', channelIds: ['c1'] } });
  expect(f.requests.slice(0, 2)).toEqual([['source.assertChannel', 'org-1', 'c1'], ['permission.save', 'org-1', 'user-1', input]]);
  const revoked = await f.invoke('source.permission_revoke', { sourceId: 'registered-owned', expectedRevision: 1 });
  expect(summary(revoked)).toEqual({ redacted: 0 });
  expect(f.requests.at(-1)).toEqual(['permission.revoke', 'org-1', 'registered-owned', 1]);
  expect(f.rows.socialFactoryEditorialAuthority.records.find(row => row.kind === 'source_permission')).toMatchObject({ revision: 2, payload: { revokedAt: expect.any(String) } });
  expect(f.rows.socialFactoryEditorialAuthority.invalidations).toEqual([['org-1', 'registered-owned'], ['org-1', 'registered-owned']]);
});

test('unknown public rights remain unknown after an explicit card; malformed and foreign scope cannot persist grants', async () => {
  const f = fixture(), cap = find('source.permission_save'), input = permission();
  for (const raw of [{ ...input, actorId: 'self' }, { ...input, organizationId: 'other' }, { ...input, evidenceId: 'model-proof' }, { ...input, basis: 'unknown' }, { ...input, telegramConsent: { evidenceId: 'claimed' } }]) expect(cap.input.safeParse(raw).success).toBe(false);
  expect((await f.invoke(cap.id, permission({ sourceId: 'public-unknown' }))).output).toMatchObject({ ok: false, code: 'SOCIAL_FACTORY_SOURCE_UNAVAILABLE' });
  expect((await f.invoke(cap.id, permission({ channelIds: ['foreign'] }))).output).toMatchObject({ ok: false, code: 'CHANNEL_NOT_FOUND' });
  expect(f.requests.filter(([name]) => name === 'permission.save')).toHaveLength(1);
  expect(f.rows.socialFactoryEditorialAuthority.sources.find(row => row.id === 'public-unknown').rightsState).toBe('UNKNOWN');
  expect(f.rows.socialFactoryEditorialAuthority.records).toEqual([]); expect(f.writes).toEqual([]);
  expect(find('source.permission_revoke').input.safeParse({ sourceId: 'registered-owned', expectedRevision: 0 }).success).toBe(false);
});

test('explicit draft profile read and save carry server destination and never emit a connected-channel card', async () => {
  const f = fixture(), id = 'local-preparation';
  const destination = { kind: 'draft', id, publishable: false };
  f.rows.socialFactoryEditorialAuthority.records.push({ organizationId: 'org-1', kind: 'draft_destination', id, revision: 1,
    payload: { ...destination, version: 1, platform: 'telegram', name: 'Учебные черновики', locale: 'ru-RU', actorId: 'user-1', requestDigest: 'owned-request' } });
  const saved = await f.invoke('channel.editorial_profile_save', { channelId: id, expectedRevision: 0, profile: profile({ channelId: id }) }, 'EDITOR');
  expect(summary(saved)).toMatchObject({ channelId: id, destination });
  expect(saved.parts).not.toContainEqual({ type: 'data-channel', data: { kind: 'channel', id } });
  expect(saved.output.card).toBeUndefined();
  const read = await f.invoke('channel.editorial_profile', { channelId: id }, 'EDITOR');
  expect(summary(read)).toMatchObject({ destination, profile: { channelId: id } });
  expect(read.parts).not.toContainEqual({ type: 'data-channel', data: { kind: 'channel', id } });
  expect(read.output.card).toBeUndefined();
  expect(f.rows.socialFactoryEditorialAuthority.records.find(row => row.kind === 'channel_profile').payload.destination).toBeUndefined();
});

test('real channel profiles retain cards even when their IDs resemble draft IDs', async () => {
  const f = fixture(), id = 'draft-real-channel';
  f.rows.channels.push({ id, organizationId: 'org-1', providerIdentifier: 'telegram' });
  for (const result of [
    await f.invoke('channel.editorial_profile_save', { channelId: id, expectedRevision: 0, profile: profile({ channelId: id }) }, 'EDITOR'),
    await f.invoke('channel.editorial_profile', { channelId: id }, 'EDITOR'),
  ]) {
    expect(summary(result).destination).toBeUndefined();
    expect(result.parts).toContainEqual({ type: 'data-channel', data: { kind: 'channel', id } });
    expect(result.output.card).toEqual({ kind: 'channel', id });
  }
});
