'use strict';

/**
 * The chat door's body ceiling through the real HTTP stack (review W4-25
 * vision F1).
 *
 * `POST /agent/chat` carries pictures inline since the owner decision of
 * 28.09.2026 («агент видит картинки»), but got express's 100 KB default: a
 * screenshot met a bare 413 before the door read it. The scenario runner calls
 * the controller with an object and could not see that. Here a real `express()`
 * app mounts the limiter as `main.ts` does, then Nest's own default parser
 * (`express.json()`, 100 KB, registered after it as Nest registers it), then
 * the door's real `parseAgentChatBody` — and real HTTP requests of about 1 MB
 * and about 9 MB of pictures go through it. A body over the door's own bounds
 * is refused with the chat's code, not express's.
 */

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const express = require('express');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const { loadCapabilityModule } = require('./helpers/agent-capabilities.cjs');

const request = loadCapabilityModule('../conductor/agent-chat.request.ts');
const contract = loadCapabilityModule('agent-parts.contract.ts');
const limiter = loadTypeScriptModule('apps/backend/src/api/routes/agent-chat.body.ts', {}, {
  sources: {
    '@contentfactory/nestjs-libraries/chat/capabilities/agent-parts.contract':
      'libraries/nestjs-libraries/src/chat/capabilities/agent-parts.contract.ts',
  },
});

const PNG_HEAD = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** A "PNG" of `bytes` bytes: the signature, then filler. */
const picture = (bytes) =>
  Buffer.concat([PNG_HEAD, Buffer.alloc(bytes - PNG_HEAD.length, 7)]).toString('base64');

const body = (sizes) =>
  JSON.stringify({
    messages: [
      {
        id: 'msg-user-1',
        role: 'user',
        parts: [
          { type: 'text', text: 'Что на картинках?' },
          ...sizes.map((size, index) => ({
            type: 'file',
            mediaType: 'image/png',
            filename: `p${index}.png`,
            url: `data:image/png;base64,${picture(size)}`,
          })),
        ],
      },
    ],
  });

let server;
let port;

beforeAll(async () => {
  const app = express();
  app.use(['/agent/chat'], limiter.createAgentChatBodyLimiter());
  // Nest registers its own parser after `main.ts`'s own middleware.
  app.use(express.json());
  app.post('/agent/chat', (req, res) => {
    try {
      const parsed = request.parseAgentChatBody(req.body);
      res.json({ pictures: parsed.pictures?.length ?? 0 });
    } catch (error) {
      res.status(error.getStatus?.() ?? 500).json(error.getResponse?.() ?? { message: String(error) });
    }
  });
  // A neighbouring door keeps express's default.
  app.post('/agent/threads', (_req, res) => res.json({ ok: true }));
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  port = server.address().port;
});

afterAll(() => new Promise((resolve) => server.close(resolve)));

const post = (route, payload, headers = {}) =>
  new Promise((resolve, reject) => {
    const outgoing = http.request(
      {
        host: '127.0.0.1',
        port,
        path: route,
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
      },
      (response) => {
        let text = '';
        response.on('data', (chunk) => (text += chunk));
        response.on('end', () => {
          let parsed = null;
          try {
            parsed = text ? JSON.parse(text) : null;
          } catch {
            parsed = text;
          }
          resolve({ status: response.statusCode, body: parsed });
        });
      }
    );
    outgoing.on('error', reject);
    outgoing.end(payload);
  });

describe('POST /agent/chat body ceiling (review W4-25 vision F1)', () => {
  test('the ceiling is the door’s own pictures bound as base64, plus the envelope', () => {
    const base64 = Math.ceil((contract.AGENT_ATTACHMENTS_TOTAL_MAX_BYTES * 4) / 3);
    expect(limiter.AGENT_CHAT_MAX_BODY_BYTES).toBeGreaterThan(base64);
    expect(limiter.AGENT_CHAT_MAX_BODY_BYTES).toBeLessThanOrEqual(base64 + 2 * 1024 * 1024);
  });

  test('about 1 MB of pictures reaches the door and is read', async () => {
    const payload = body([1024 * 1024 - 64 * 1024]);
    expect(Buffer.byteLength(payload)).toBeGreaterThan(1_000_000);
    expect(await post('/agent/chat', payload)).toEqual({ status: 200, body: { pictures: 1 } });
  });

  test('about 9 MB of pictures — two, under the door’s bounds — reaches the door and is read', async () => {
    const payload = body([3_400_000, 3_400_000]);
    expect(Buffer.byteLength(payload)).toBeGreaterThan(9_000_000);
    expect(await post('/agent/chat', payload)).toEqual({ status: 200, body: { pictures: 2 } });
  });

  test('a body over the ceiling is refused with the chat’s code, stated or chunked', async () => {
    const payload = body([5_000_000, 5_000_000, 2_000_000]);
    expect(Buffer.byteLength(payload)).toBeGreaterThan(limiter.AGENT_CHAT_MAX_BODY_BYTES);
    const stated = await post('/agent/chat', payload, { 'content-length': Buffer.byteLength(payload) });
    expect(stated).toMatchObject({ status: 413, body: { code: 'AGENT_BAD_REQUEST' } });
    const chunked = await post('/agent/chat', payload, { 'transfer-encoding': 'chunked' });
    expect(chunked).toMatchObject({ status: 413, body: { code: 'AGENT_BAD_REQUEST' } });
  });

  test('the thread doors beside it keep express’s own default', async () => {
    const payload = JSON.stringify({ title: 'x'.repeat(200_000) });
    expect((await post('/agent/threads', payload)).status).toBe(413);
  });

  test('main.ts mounts the limiter on the chat door', () => {
    const main = fs.readFileSync(path.join(__dirname, '..', 'apps/backend/src/main.ts'), 'utf8');
    expect(main).toMatch(/app\.use\(\['\/agent\/chat'\], createAgentChatBodyLimiter\(\)\)/);
  });
});
