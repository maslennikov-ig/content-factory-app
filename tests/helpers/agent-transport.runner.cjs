'use strict';

/**
 * Plays the agent chat's real transport composition for
 * `tests/agent-transport.test.cjs` (`content-factory-next-kcxz.29`, D1) and
 * prints what the server received as JSON. A child process: the AI SDK is
 * ESM-only and the jest runner does not load it.
 *
 * Nothing is stubbed between the SDK and the wire: the transport the screen
 * builds (`agent.transport.ts`), the product fetch (`customFetch`), Node's own
 * `fetch`, and an Express server with the same `express.json()` body parser
 * Nest uses.
 */

const http = require('node:http');
const express = require('express');
const { loadTypeScriptModule } = require('./load-tsx.cjs');

const { customFetch } = loadTypeScriptModule(
  'libraries/helpers/src/utils/custom.fetch.func.ts'
);
const { createAgentTransport } = loadTypeScriptModule(
  'apps/frontend/src/components/agents/agent.transport.ts'
);

const THREAD = '6f1c1d9e-1111-4222-8333-944445555666';

const readAll = async (stream) => {
  const parts = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return parts;
    parts.push(value);
  }
};

(async () => {
  const seen = [];
  // The zone header each request carried (kcxz.15), beside the body.
  const zones = [];
  const app = express();
  app.use(express.json());
  app.post('/agent/chat', (req, res) => {
    seen.push({ contentType: req.headers['content-type'], body: req.body ?? null });
    zones.push(req.headers['x-agent-timezone'] ?? null);
    if (!req.body || typeof req.body !== 'object' || !Array.isArray(req.body.messages)) {
      res.status(400).json({ code: 'AGENT_BAD_REQUEST', message: 'The body is not an object.' });
      return;
    }
    res.status(200);
    res.setHeader('content-type', 'text/event-stream');
    res.setHeader('x-vercel-ai-ui-message-stream', 'v1');
    res.setHeader('x-agent-thread-id', THREAD);
    for (const part of [
      { type: 'start', messageId: 'm-1' },
      { type: 'text-start', id: 't1' },
      { type: 'text-delta', id: 't1', delta: 'Есть две заготовки.' },
      { type: 'text-end', id: 't1' },
      { type: 'finish', finishReason: 'stop' },
    ]) {
      res.write(`data: ${JSON.stringify(part)}\n\n`);
    }
    res.end('data: [DONE]\n\n');
  });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const report = {};
  const play = async (name, run) => {
    seen.length = 0;
    zones.length = 0;
    const named = [];
    try {
      const parts = await run(named);
      report[name] = { seen: [...seen], zones: [...zones], named, parts: parts ?? [] };
    } catch (error) {
      report[name] = { seen: [...seen], zones: [...zones], named, error: String(error?.message ?? error) };
    }
  };
  const transport = (thread, named) =>
    createAgentTransport({
      request: customFetch({ baseUrl }),
      currentThread: () => thread,
      onThread: (id) => named.push(id),
    });

  await play('message', async (named) =>
    (
      await readAll(
        await transport(null, named).sendMessages({
          chatId: 'chat-1',
          trigger: 'submit-message',
          messageId: undefined,
          abortSignal: undefined,
          messages: [
            { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Что у нас есть?' }] },
          ],
        })
      )
    ).map((part) => part.type)
  );
  await play('resume', async (named) =>
    (
      await readAll(
        await transport(THREAD, named).sendMessages({
          chatId: 'chat-1',
          trigger: 'submit-message',
          messageId: 'a1',
          abortSignal: undefined,
          body: {
            resume: {
              runId: 'run-1',
              toolCallId: 'call-1',
              resumeData: { consentGiven: true, avatarName: 'Игорь' },
            },
          },
          messages: [],
        })
      )
    ).map((part) => part.type)
  );
  // kcxz.32 N1: «Нет» on an approval card further up — the SDK names the
  // message the card is in; the body carries that message, not the last one.
  const earlierCard = {
    id: 'a-card',
    role: 'assistant',
    parts: [
      {
        type: 'tool-plan_publish_now',
        toolCallId: 'call-1',
        state: 'approval-responded',
        input: { pieceId: 'p1', adaptationId: 'a1' },
        approval: { id: 'run-1::call-1', approved: false },
      },
    ],
  };
  const later = [
    { id: 'u3', role: 'user', parts: [{ type: 'text', text: 'Что в плане?' }] },
    { id: 'a-later', role: 'assistant', parts: [{ type: 'text', text: 'Одна бронь.' }] },
  ];
  await play('earlier-approval', async (named) =>
    (
      await readAll(
        await transport(THREAD, named).sendMessages({
          chatId: 'chat-1',
          trigger: 'submit-message',
          messageId: 'a-card',
          abortSignal: undefined,
          messages: [earlierCard, ...later],
        })
      )
    ).map((part) => part.type)
  );
  // kcxz.32 D2: an answer on a question card further up — the stream first
  // names the call it continues, so the chat core can take its output.
  await play('resume-above', async (named) =>
    (
      await readAll(
        await transport(THREAD, named).sendMessages({
          chatId: 'chat-1',
          trigger: 'submit-message',
          messageId: 'a-later',
          abortSignal: undefined,
          body: {
            resume: { runId: 'run-2', toolCallId: 'call-9', cardId: 'c'.repeat(32), resumeData: { changeIds: [] } },
          },
          messages: [
            {
              id: 'a-question',
              role: 'assistant',
              parts: [{ type: 'tool-adaptation_rewrite', toolCallId: 'call-9', state: 'input-available', title: 'Переписать адаптацию', input: { adaptationId: 'a1' } }],
            },
            ...later,
          ],
        })
      )
    ).map((part) => (part.type === 'tool-input-available' ? [part.type, part.toolCallId, part.toolName, part.title] : part.type))
  );
  // The zone chosen in the profile, as the calendar reads it (review W2 F5):
  // `getTimezone()` of `set.timezone.tsx` prefers `localStorage.timezone`.
  await play('profile-zone', async (named) => {
    const hadWindow = 'window' in globalThis;
    // A browser page on the frontend's own address, as the screen runs.
    globalThis.window = globalThis.window ?? { location: new URL(`${baseUrl}/agents`) };
    globalThis.localStorage = { getItem: (key) => (key === 'timezone' ? 'Asia/Tokyo' : null) };
    try {
      return (
        await readAll(
          await transport(THREAD, named).sendMessages({
            chatId: 'chat-1',
            trigger: 'submit-message',
            messageId: undefined,
            abortSignal: undefined,
            messages: [{ id: 'u2', role: 'user', parts: [{ type: 'text', text: 'Поставь на 10:00' }] }],
          })
        )
      ).map((part) => part.type);
    } finally {
      delete globalThis.localStorage;
      if (!hadWindow) delete globalThis.window;
    }
  });
  await play('header-case', async () => {
    const request = customFetch({ baseUrl });
    await request('/agent/chat', {
      method: 'POST',
      headers: new Headers({ 'content-type': 'application/json' }),
      body: JSON.stringify({ messages: [] }),
    });
    await request('/agent/chat', {
      method: 'POST',
      headers: { 'CONTENT-TYPE': 'application/json' },
      body: JSON.stringify({ messages: [] }),
    });
    return [];
  });

  await new Promise((resolve) => server.close(resolve));
  process.stdout.write(JSON.stringify(report));
})().catch((error) => {
  process.stderr.write(String(error?.stack || error));
  process.exit(1);
});
