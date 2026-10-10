'use strict';
// Deliberate failing diagnostic of the immutable baseline; no network.
// Fixed synthetic signer isolates acknowledgement from the separate HEX-key bug.
const assert = require('node:assert/strict');
const { loadWithMocks } = require('../../../tests/helpers/load-ts-with-mocks.cjs');
const baseline = 'de533317b9cd8ff9a970ca7d5c915a2008b27ca4';
const sent = { id: 'signed-new-event' };
let mode = 'older';
let closed = 0;
const { NostrProvider } = loadWithMocks(
  'libraries/nestjs-libraries/src/integrations/social/nostr.provider.ts', {
    '@contentfactory/nestjs-libraries/integrations/social.abstract': { SocialAbstract: class {} },
    '@contentfactory/helpers/auth/auth.service': {
      AuthService: { verifyJWT: () => ({ password: '01'.repeat(32) }) },
    },
    'nostr-tools': {
      SimplePool: class {},
      finalizeEvent: () => sent,
      Relay: { connect: async () => ({
        subscribe: (_filters, callbacks) => mode === 'older'
          ? callbacks.onevent({ id: 'older-author-event' }) : callbacks.oneose(),
        publish: async () => { if (mode === 'failure') throw new Error('synthetic rejection'); },
        close: () => { closed++; },
      }) },
    },
  }, baseline
);
(async () => {
  const provider = new NostrProvider();
  const post = () => provider.post('synthetic-author', 'inert-token',
    [{ id: 'local-post', message: 'Synthetic', media: [] }]);
  const older = await post();
  mode = 'eose';
  const empty = await post();
  mode = 'failure';
  const before = closed;
  const failed = await post();
  console.log(JSON.stringify({ baseline, sentId: sent.id, returnedOlder: older,
    returnedEose: empty, returnedAllFailed: failed, closedAfterFailure: closed - before }));
  assert.equal(older[0].postId, sent.id, 'legacy returned an unrelated older author event');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
