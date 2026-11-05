const {nativeFixture, codeOf} = require('./helpers/hgg-native-pilot-fixture.cjs');

const allowMembers = f => {
  f.db.userOrganization.findFirst = async ({where}) =>
    ['org', 'second-org'].includes(where.organizationId) && ['actor', 'foreign-actor'].includes(where.userId)
      ? {role: 'ADMIN', user: {activated: true}} : null;
};
const leaseRows = f => f.rows.videoAccessPreflight.filter(row => row.access?.kind === 'hgg-pilot-context-lease/v1');

test('one owned connection serializes two authorised organisations through the same global lease', () => nativeFixture(async f => {
  allowMembers(f);
  let enter, release;
  const entered = new Promise(resolve => { enter = resolve; });
  const held = new Promise(resolve => { release = resolve; });
  const active = f.service.workspace.withContext('org', 'actor', 'connection', 'parent', 1, async () => {
    enter(); await held; return 'first-result';
  });
  await entered;
  const second = jest.fn(async () => 'second-result');
  let blocked;
  try {
    await f.service.workspace.withContext('second-org', 'actor', 'connection', 'parent', 1, second);
  } catch (error) { blocked = error;
  } finally { release(); }
  expect(codeOf(blocked)).toBe('VIDEO_PILOT_CONNECTION_BUSY');
  expect(await active).toBe('first-result');
  expect(second).not.toHaveBeenCalled();
  expect(await f.service.workspace.withContext('second-org', 'actor', 'connection', 'parent', 1, second)).toBe('second-result');
  expect(leaseRows(f)).toHaveLength(1);
  expect(leaseRows(f)[0]).toMatchObject({organizationId: 'org', actorId: 'actor', connectionId: 'connection'});
}));

test.each(['foreign-actor', 'disabled-grant'])('global lease refuses %s before any lease read or claim', mode => nativeFixture(async f => {
  allowMembers(f);
  if (mode === 'disabled-grant') f.db.videoSubscriptionGrant.findUnique = async () => ({enabled: false});
  const read = jest.spyOn(f.db.videoAccessPreflight, 'findUnique').mockClear();
  const claim = jest.spyOn(f.db.videoAccessPreflight, 'updateMany').mockClear();
  const callback = jest.fn();
  let failure;
  try { await f.service.workspace.withContext('second-org', mode === 'foreign-actor' ? mode : 'actor', 'connection', 'parent', 1, callback); }
  catch (error) { failure = error; }
  expect(codeOf(failure)).toBe('VIDEO_REAUTH_REQUIRED');
  expect(read).not.toHaveBeenCalled(); expect(claim).not.toHaveBeenCalled(); expect(callback).not.toHaveBeenCalled();
}));

test('late global-lease release cannot clear the random owner of a successor', () => nativeFixture(async f => {
  const successorExpiry = new Date(f.runtime.now().getTime() + 240000);
  expect(await f.service.workspace.withContext('org', 'actor', 'connection', 'parent', 1, async () => {
    const lease = leaseRows(f)[0];
    lease.snapshot = {...lease.snapshot, owner: 'successor-owner'};
    lease.expiresAt = successorExpiry;
    return 'callback-result';
  })).toBe('callback-result');
  expect(leaseRows(f)[0].snapshot.owner).toBe('successor-owner');
  expect(leaseRows(f)[0].expiresAt).toEqual(successorExpiry);
}));

// The grant belongs to the person; all granted organisations share its token.
async function withRenewal(run) {
  return nativeFixture(async f => {
    const previous = process.env.NEXT_PUBLIC_BACKEND_URL;
    process.env.NEXT_PUBLIC_BACKEND_URL = f.origin;
    const input = {connectionId: 'connection', accountGeneration: 1, tokenVersion: 1, pilotId: 'parent', parentRevision: 1};
    const assertParent = jest.fn(async tx => { expect(tx).toBe(f.db); });
    const renew = () => f.modules.authenticatedSession.withAuthenticatedSession('actor', 'synthetic-session', () => f.connections.renewOwnedGrantV1('org', 'actor', input, assertParent));
    try { return await run({...f, input, assertParent, renew}); }
    finally { if (previous === undefined) delete process.env.NEXT_PUBLIC_BACKEND_URL; else process.env.NEXT_PUBLIC_BACKEND_URL = previous; }
  });
}

test.each(['running', 'failed'])("same-grant renewal refuses another organisation's %s job with possible liability", state => withRenewal(async f => {
  f.rows.videoSubscriptionJob.push({id: 'foreign-org-job', organizationId: 'second-org', actorId: 'actor', connectionId: 'connection', state,
    ...(state === 'failed' ? {submittedAt: f.runtime.now(), actualCost: null} : {})});
  const metadata = jest.spyOn(f.oauth, 'metadata').mockResolvedValue({});
  const refresh = jest.spyOn(f.oauth, 'refresh');
  await expect(f.renew()).rejects.toMatchObject({response: {code: 'VIDEO_PILOT_CONNECTION_BUSY'}});
  expect(f.assertParent).toHaveBeenCalledTimes(2); expect(metadata).toHaveBeenCalledTimes(1); expect(refresh).not.toHaveBeenCalled();
  expect(f.rows.videoAccessPreflight.some(row => row.snapshot?.kind === 'hgg-same-grant-renewal/v1')).toBe(false);
}));

test('a completed same-org grant receipt is idempotent without another refresh', () => withRenewal(async f => {
  const id = f.modules.registry.subscriptionHash({kind: 'hgg-same-grant-renewal/v1', connectionId: 'connection', generation: 1, tokenVersion: 1});
  const snapshot = {kind: 'hgg-same-grant-renewal/v1', state: 'completed', fromTokenVersion: 1, toTokenVersion: 2};
  f.rows.videoAccessPreflight.push({id, organizationId: 'org', actorId: 'actor', connectionId: 'connection', generation: 1, snapshot});
  f.connection.tokenVersion = 2;
  const metadata = jest.spyOn(f.oauth, 'metadata'), refresh = jest.spyOn(f.oauth, 'refresh');
  expect(await f.renew()).toEqual(snapshot); expect(await f.renew()).toEqual(snapshot);
  expect(metadata).not.toHaveBeenCalled(); expect(refresh).not.toHaveBeenCalled();
  expect(f.rows.videoAccessPreflight.filter(row => row.id === id)).toHaveLength(1);
}));
