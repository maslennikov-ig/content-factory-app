'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { once } = require('node:events');
const sdk = require('nostr-tools');
const RealWebSocket = require('ws');
const { loadWithMocks } = require('./load-ts-with-mocks.cjs');
const source = 'libraries/nestjs-libraries/src/integrations/social/nostr.provider.ts';
// Inert, public fixture material; never a live identity or credential.
const hexKey = '01'.repeat(32);
const author = sdk.getPublicKey(new Uint8Array(32).fill(1));
const details = [{ id: 'local-post', message: 'Synthetic note', media: [], settings: {} }];
const sensitive = 'inert-sensitive-canary';
const ack = (socket, event, accepted = true, reason = '') =>
  socket.emit('message', Buffer.from(JSON.stringify(['OK', event.id, accepted, reason])));

function load(t, Socket, password) {
  const priorWebSocket = global.WebSocket;
  t.after(() => { global.WebSocket = priorWebSocket; });
  let signatures = 0;
  const { NostrProvider } = loadWithMocks(source, {
    '@contentfactory/nestjs-libraries/integrations/social.abstract': { SocialAbstract: class {} },
    '@contentfactory/helpers/auth/auth.service': {
      AuthService: { verifyJWT: () => ({ password }) },
    },
    'ws': Socket,
    'nostr-tools': {
      ...sdk,
      SimplePool: class { get() { throw new Error('metadata queries are outside publishing'); } },
      finalizeEvent: (...args) => { signatures++; return sdk.finalizeEvent(...args); },
    },
  });
  return { provider: new NostrProvider(), signatures: () => signatures };
}

function fake(t, behavior = (s, e) => ack(s, e), options = {}) {
  const sockets = [], frames = [], deadlines = new Map();
  t.mock.method(global, 'setTimeout', (callback, ms) => {
    assert.equal(ms, 6000, 'deadline covers connection and response together');
    const handle = {};
    deadlines.set(handle, callback);
    return handle;
  });
  t.mock.method(global, 'clearTimeout', handle => deadlines.delete(handle));
  const expire = () => { for (const callback of [...deadlines.values()]) callback(); };
  class Socket extends EventEmitter {
    constructor(url) {
      super();
      assert.match(url, /^wss:\/\//);
      if (options.constructorError) throw new Error(sensitive);
      this.index = sockets.length;
      this.terminated = 0;
      sockets.push(this);
      queueMicrotask(() => {
        if (options.connectError) this.emit('error', new Error(sensitive));
        else if (!options.connectStall) this.emit('open');
        if (!this.terminated) expire();
      });
    }
    send(frame, callback) {
      const packet = JSON.parse(frame);
      assert.equal(packet[0], 'EVENT');
      assert.equal(packet.length, 2);
      const event = packet[1];
      assert.equal(event.id, sdk.getEventHash(event));
      assert.equal(sdk.verifyEvent(event), true, 'actual installed Schnorr signature');
      frames.push(frame);
      behavior(this, event);
      callback(options.writeError ? new Error(sensitive) : undefined);
    }
    terminate() {
      this.terminated++;
      this.emit('close');
      // ws termination can asynchronously emit an error after close/timeout.
      queueMicrotask(() => this.emit('error', new Error(sensitive)));
    }
  }
  const loaded = load(t, Socket, Object.hasOwn(options, 'password') ? options.password : hexKey);
  const post = (posts = details, identity = author) => loaded.provider.post(identity, 'inert-token', posts);
  t.after(() => {
    assert.equal(deadlines.size, 0, 'no provider deadline survives');
    for (const socket of sockets) {
      assert.equal(socket.terminated, 1, 'every acquired socket is terminated once');
      assert.equal(socket.listenerCount('open'), 0);
      assert.equal(socket.listenerCount('message'), 0);
    }
  });
  return { ...loaded, post, sockets, frames };
}

test('matching positive OK returns exactly the signed ID, local ID and URL; sign once', async t => {
  const f = fake(t);
  const [response] = await f.post();
  const event = JSON.parse(f.frames[0])[1];
  assert.deepEqual(response, { id: 'local-post', postId: event.id,
    releaseURL: `https://primal.net/e/${event.id}`, status: 'completed' });
  assert.equal(event.pubkey, author);
  assert.equal(f.signatures(), 1);
  assert.equal(f.frames.length, 5);
  assert.ok(f.frames.every(frame => frame === f.frames[0]));
});

test('older EVENT, EOSE and wrong-ID OK before valid acknowledgement do not change the result', async t => {
  const f = fake(t, (socket, event) => {
    for (const reply of [['EVENT', 'subscription', { ...event, id: 'older-id' }],
      ['EOSE', 'subscription'], ['OK', 'different-id', true, '']]) {
      socket.emit('message', Buffer.from(JSON.stringify(reply)));
    }
    ack(socket, event);
  });
  const [response] = await f.post();
  assert.equal(response.postId, JSON.parse(f.frames[0])[1].id);
});

const unacknowledged = [
  ['older author event only', event => ['EVENT', 'subscription', { ...event, id: 'older-id' }]],
  ['empty EOSE', () => ['EOSE', 'subscription']],
  ['wrong event ID', () => ['OK', 'different-id', true, '']],
  ['matching negative OK', event => ['OK', event.id, false, 'blocked: synthetic']],
  ['truthy string acceptance', event => ['OK', event.id, 'true', '']],
  ['numeric acceptance', event => ['OK', event.id, 1, '']],
  ['missing reason', event => ['OK', event.id, true]],
  ['non-string reason', event => ['OK', event.id, true, {}]],
  ['notice', () => ['NOTICE', sensitive]],
  ['object masquerading as OK', event => ({ 0: 'OK', 1: event.id, 2: true, 3: '' })],
  ['empty reply', () => null],
];
for (const [name, reply] of unacknowledged) {
  test(`${name} cannot report completed`, async t => {
    const f = fake(t, (socket, event) => socket.emit('message', Buffer.from(JSON.stringify(reply(event)))));
    await assert.rejects(f.post(), { message: 'Nostr publication not acknowledged' });
    assert.equal(f.frames.length, 5);
  });
}

test('malformed JSON is ignored and a later matching OK still succeeds', async t => {
  const f = fake(t, (socket, event) => {
    socket.emit('message', Buffer.from('{invalid'));
    ack(socket, event);
  });
  assert.equal((await f.post())[0].status, 'completed');
});

test('matching duplicate acceptance is valid confirmation of that same event', async t => {
  const f = fake(t, (socket, event) => ack(socket, event, true, 'duplicate: already have this event'));
  assert.equal((await f.post())[0].postId, JSON.parse(f.frames[0])[1].id);
});

test('ambiguous first send falls back with identical timestamp, signature and event ID', async t => {
  const f = fake(t, (socket, event) => {
    if (socket.index === 0) socket.emit('close'); // peer may have stored the event; no OK received
    else ack(socket, event, socket.index === 1, 'synthetic');
  });
  const [response] = await f.post();
  assert.ok(f.frames.every(frame => frame === f.frames[0]));
  assert.equal(f.signatures(), 1);
  assert.equal(response.postId, JSON.parse(f.frames[1])[1].id);
});

test('later failures cannot erase an earlier positive acknowledgement', async t => {
  const f = fake(t, (socket, event) => ack(socket, event, socket.index === 0, 'synthetic'));
  assert.equal((await f.post())[0].status, 'completed');
});

for (const [name, options, action] of [
  ['constructor failure', { constructorError: true }],
  ['connection error', { connectError: true }],
  ['connection never opens', { connectStall: true }],
  ['write callback error', { writeError: true }, () => {}],
  ['send throws', {}, () => { throw new Error(sensitive); }],
  ['close before acknowledgement', {}, socket => socket.emit('close')],
  ['open connection without acknowledgement', {}, () => {}],
]) {
  test(`${name} is bounded, closes acquired sockets and exposes no sensitive detail`, async t => {
    const f = fake(t, action || (() => {}), options);
    await assert.rejects(f.post(), { message: 'Nostr publication not acknowledged' });
    assert.equal(f.signatures(), 1);
    assert.equal(f.sockets.length, options.constructorError ? 0 : 5);
  });
}

for (const password of [undefined, '', 'g'.repeat(64), '01', new Uint8Array(32)]) {
  test(`invalid HEX key (${typeof password}/${password?.length || 0}) opens no socket`, async t => {
    const f = fake(t, undefined, { password });
    await assert.rejects(f.post(), { message: 'Invalid Nostr signing key' });
    assert.equal(f.sockets.length, 0);
    assert.equal(f.signatures(), 0);
  });
}

test('valid HEX with a different channel identity opens no socket', async t => {
  const f = fake(t);
  await assert.rejects(f.post(details, '02'.repeat(32)), { message: 'Nostr signing identity mismatch' });
  assert.equal(f.sockets.length, 0);
});

test('uppercase HEX uses the actual byte key and media content stays compatible', async t => {
  const key = 'ab'.repeat(32);
  const f = fake(t, undefined, { password: key.toUpperCase() });
  const posts = [{ ...details[0], media: [{ path: 'https://synthetic.invalid/image' }] }];
  await f.post(posts, sdk.getPublicKey(Buffer.from(key, 'hex')));
  assert.equal(JSON.parse(f.frames[0])[1].content, 'Synthetic note\n\nhttps://synthetic.invalid/image');
});

for (const lastId of [undefined, 'last-comment-id']) {
  test(`comment linkage preserves ${lastId ? 'last reply' : 'original post'}`, async t => {
    const f = fake(t);
    const [response] = await f.provider.comment(author, 'root-post-id', lastId, 'inert-token', details, {});
    const event = JSON.parse(f.frames[0])[1];
    assert.deepEqual(event.tags, [['e', lastId || 'root-post-id', '', 'reply'], ['p', author]]);
    assert.equal(response.id, 'local-post');
    assert.equal(response.postId, event.id);
    assert.equal(response.status, 'completed');
  });
}

test('a comment rejected by every relay never returns completed', async t => {
  const f = fake(t, (socket, event) => ack(socket, event, false, 'synthetic refusal'));
  await assert.rejects(
    f.provider.comment(author, 'root-post-id', 'last-comment-id', 'inert-token', details, {}),
    { message: 'Nostr publication not acknowledged' }
  );
  assert.deepEqual(JSON.parse(f.frames[0])[1].tags,
    [['e', 'last-comment-id', '', 'reply'], ['p', author]]);
});

test('actual V106 claim stores the acknowledged Nostr ID; later activity retry returns it without sends', async t => {
  const f = fake(t);
  const { fixture } = require('./publication-v106.module.cjs');
  const claim = fixture(undefined, { write: (...args) => f.provider.post(...args) });
  claim.integration.internalId = author;
  claim.integration.providerIdentifier = 'nostr';
  const send = () => claim.activity.postSocialV106(claim.integration, [claim.client.row], 'initial');
  const response = await send();
  assert.equal(claim.client.row.state, 'PUBLISHED');
  assert.equal(claim.client.row.releaseId, JSON.parse(f.frames[0])[1].id);
  assert.deepEqual(await send(), response);
  assert.equal(claim.calls.writes, 1);
  assert.equal(f.frames.length, 5);
});

test('actual V106 uncertain claim refuses another provider invocation after missing OK', async t => {
  const f = fake(t, () => {});
  const { fixture } = require('./publication-v106.module.cjs');
  const claim = fixture(undefined, { write: (...args) => f.provider.post(...args) });
  claim.integration.internalId = author;
  claim.integration.providerIdentifier = 'nostr';
  const send = () => claim.activity.postSocialV106(claim.integration, [claim.client.row], 'initial');
  for (let attempt = 0; attempt < 2; attempt++) {
    await assert.rejects(send(), error => error.type === 'publication_uncertain' && error.nonRetryable);
  }
  assert.equal(claim.client.row.releaseId, null);
  assert.equal(claim.calls.writes, 1);
  assert.equal(f.frames.length, 5);
  assert.ok(f.frames.every(frame => frame === f.frames[0]));
  assert.ok(!JSON.stringify(claim.client.row).includes(sensitive));
});

for (const accept of [true, false]) {
  test(`real ws loopback ${accept ? 'lost-OK fallback then acceptance' : 'all-relay refusal'}`, async t => {
    const server = new RealWebSocket.WebSocketServer({ host: '127.0.0.1', port: 0 });
    const frames = [], sockets = [];
    t.after(async () => {
      for (const socket of sockets) socket.terminate();
      for (const client of server.clients) client.terminate();
      await new Promise(resolve => server.close(resolve));
    });
    await once(server, 'listening');
    let connections = 0;
    server.on('connection', socket => {
      const index = connections++;
      socket.on('error', () => {});
      socket.on('message', frame => {
        const [command, event] = JSON.parse(frame.toString());
        assert.equal(command, 'EVENT');
        assert.equal(sdk.verifyEvent(event), true);
        frames.push(frame.toString());
        if (accept && index === 0) { socket.close(); return; }
        socket.send(JSON.stringify(['EVENT', 'older', { ...event, id: 'older-id' }]));
        socket.send(JSON.stringify(['EOSE', 'older']));
        socket.send(JSON.stringify(['OK', 'wrong-id', true, '']));
        socket.send(JSON.stringify(['OK', event.id, accept, 'synthetic loopback']));
      });
    });
    class LocalSocket extends RealWebSocket {
      constructor(url) {
        assert.match(url, /^wss:\/\//); // all public targets are replaced, never contacted
        super(`ws://127.0.0.1:${server.address().port}`);
        this.terminations = 0;
        sockets.push(this);
      }
      terminate() { this.terminations++; return super.terminate(); }
    }
    const f = load(t, LocalSocket, hexKey);
    const result = f.provider.post(author, 'inert-token', details);
    if (accept) assert.equal((await result)[0].postId, JSON.parse(frames[0])[1].id);
    else await assert.rejects(result, { message: 'Nostr publication not acknowledged' });
    await Promise.all(sockets.map(socket => socket.readyState === RealWebSocket.CLOSED
      ? undefined : once(socket, 'close')));
    assert.equal(frames.length, 5);
    assert.ok(frames.every(frame => frame === frames[0]));
    assert.equal(f.signatures(), 1);
    assert.ok(sockets.every(socket => socket.terminations === 1));
    assert.ok(sockets.every(socket => socket.readyState === RealWebSocket.CLOSED));
  });
}
