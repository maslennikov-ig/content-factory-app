'use strict';

/**
 * The agent chat's real transport composition (`content-factory-next-kcxz.29`,
 * D1 of the live walk of 27.09.2026).
 *
 * The screen sends through the AI SDK's `DefaultChatTransport` wrapped around
 * the product's `customFetch`. The SDK names `content-type` in lower case, the
 * product fetch named `Content-Type`; the browser joined the two as
 * `application/json, application/json`, the backend's JSON parser did not
 * recognise that type, and every message from the real screen was refused
 * with 400 «The body is not an object». The mock walk never saw it, because
 * its fetch was a stub.
 *
 * The runner (`helpers/agent-transport.runner.cjs`) stubs nothing between the
 * SDK and the wire: the screen's transport, the product fetch, Node's `fetch`
 * and an Express server with Nest's `express.json()` body parser. A child
 * process, because the AI SDK is ESM-only and jest does not load it.
 */

const { execFileSync } = require('node:child_process');
const path = require('node:path');

const THREAD = '6f1c1d9e-1111-4222-8333-944445555666';
let report;

beforeAll(() => {
  report = JSON.parse(
    execFileSync(process.execPath, [path.join(__dirname, 'helpers', 'agent-transport.runner.cjs')], {
      encoding: 'utf8',
      timeout: 60_000,
    })
  );
}, 90_000);

describe('the chat transport through the product fetch', () => {
  test.each([
    ['unproven-proxy', { status: 502, code: 'AGENT_FAILED', notStarted: false }],
    ['plain-proxy', { status: 502, notStarted: false }],
    ['unsafe-code', { status: 502, notStarted: false }],
    ['pre-start-context', { status: 400, code: 'AGENT_BAD_REQUEST', notStarted: true }],
    ['unproven-header-value', { status: 400, code: 'AGENT_BAD_REQUEST', notStarted: false }],
  ])('%s reports only the actual safe HTTP diagnostic', (name, diagnostic) => {
    expect(report[name].diagnostics).toEqual([diagnostic]);
    expect(report[name].error).toBeDefined();
  });
  test.each(['native-reconnect', 'observer-failure', 'network-failure'])('%s does not report a chat HTTP failure', name => {
    expect(report[name].diagnostics).toEqual([]);
  });
  test('failure diagnostics leave the response body available to the SDK and typed refusal', () => {
    expect(report['plain-proxy'].error).toContain('upstream unavailable');
    expect(report['pre-start-context'].error).toContain('AGENT_BAD_REQUEST');
    expect(report['pre-start-context'].notStarted).toBe(true);
  });
  test('SDK reconnect consumes the authenticated native thread observer', () => {
    expect(report['native-reconnect'].error).toBeUndefined();
    expect(report['native-reconnect'].seen).toEqual([{ method: 'GET', path: `/agent/threads/${THREAD}/observe` }]);
    expect(report['native-reconnect'].parts).toEqual([{ type: 'start', messageId: 'replayed' }, { type: 'finish', finishReason: 'stop' }]);
  });
  test('released native replay refreshes authoritative history without a synthetic stream or a new chat POST', () => {
    expect(report['native-replay-released'].error).toBeUndefined();
    expect(report['native-replay-released'].seen).toEqual([{ method: 'GET', path: `/agent/threads/${THREAD}/observe` }]);
    expect(report['native-replay-released'].parts).toEqual({ streamAbsent: true, hydrated: 1 });
  });
  test.each(['pre-start-context', 'pre-start-allowance'])('%s retains explicit server pre-start proof as a typed refusal', (name) => {
    expect(report[name].notStarted).toBe(true);
    expect(report[name].status).toBe(name === 'pre-start-context' ? 400 : 402);
    expect(report[name].named).toEqual([]);
  });

  test.each(['unproven-context', 'unproven-proxy', 'unproven-header-value'])('%s never fabricates pre-start proof', (name) => {
    expect(report[name].error).toBeDefined();
    expect(report[name].notStarted).toBe(false);
  });

  test('native chat core preserves pre-start proof before its error finish callback', () => {
    expect(report['native-pre-start'].parts).toEqual({
      events: [['error', true], ['finish', true, false, false]],
      status: 'error', typedError: true,
    });
  });

  test('a message reaches a JSON body parser as JSON, with one content type', () => {
    const run = report.message;
    expect(run.error).toBeUndefined();
    expect(run.seen).toEqual([
      {
        contentType: 'application/json',
        body: {
          messages: [
            { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Что у нас есть?' }] },
          ],
        },
      },
    ]);
    expect(run.parts).toEqual(['start', 'text-start', 'text-delta', 'text-end', 'finish']);
    // The server named the new thread; the screen hears it once.
    expect(run.named).toEqual([THREAD]);
  });

  test('an answer on a question card is JSON too, and names its run and call', () => {
    const run = report.resume;
    expect(run.error).toBeUndefined();
    expect(run.seen).toEqual([
      {
        contentType: 'application/json',
        body: {
          threadId: THREAD,
          messages: [],
          runId: 'run-1',
          toolCallId: 'call-1',
          resumeData: { consentGiven: true, avatarName: 'Игорь' },
        },
      },
    ]);
    expect(run.named).toEqual([]);
  });

  test('kcxz.32 N1: an answer on an approval card further up carries that card’s message', () => {
    const run = report['earlier-approval'];
    expect(run.error).toBeUndefined();
    expect(run.seen).toHaveLength(1);
    expect(run.seen[0].body.messages.map((message) => message.id)).toEqual(['a-card']);
    expect(run.seen[0].body.messages[0].parts[0]).toMatchObject({
      state: 'approval-responded',
      approval: { id: 'run-1::call-1', approved: false },
    });
  });

  test('kcxz.32 D2: the stream of an answer on a question further up first names its call', () => {
    const run = report['resume-above'];
    expect(run.error).toBeUndefined();
    expect(run.seen[0].body).toMatchObject({ runId: 'run-2', toolCallId: 'call-9', messages: [] });
    expect(run.parts).toEqual([
      ['tool-input-available', 'call-9', 'adaptation_rewrite', 'Переписать адаптацию'],
      'start',
      'text-start',
      'text-delta',
      'text-end',
      'finish',
    ]);
  });

  test('kcxz.15: every chat request names the browser’s time zone, beside one content type', () => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    for (const name of ['message', 'resume']) {
      expect(report[name].zones.length).toBeGreaterThan(0);
      expect(report[name].zones.every((one) => one === zone)).toBe(true);
    }
  });

  test('review W2 F5: the zone is the one the calendar uses — the profile’s, not the machine’s', () => {
    const run = report['profile-zone'];
    expect(run.error).toBeUndefined();
    expect(run.zones).toEqual(['Asia/Tokyo']);
  });

  test('the product fetch keeps one value per header whatever case a caller uses', () => {
    const run = report['header-case'];
    expect(run.error).toBeUndefined();
    expect(run.seen).toEqual([
      { contentType: 'application/json', body: { messages: [] } },
      { contentType: 'application/json', body: { messages: [] } },
    ]);
  });
});


describe('manual edits before the next deliberate user turn', () => {
  test.each(['sdk-preflight-failure', 'sdk-post-failure'])('%s captures the SDK user message before network work', name => {
    const run = report[name];
    expect(run.error).toBeUndefined();
    expect(run.parts.status).toBe('error');
    expect(run.parts.userMessage.id).toEqual(expect.any(String));
    expect(run.captured).toEqual([{ message: run.parts.userMessage, historyReads: 0, posts: 0 }]);
    expect(run.parts.userMessage.parts).toEqual([{ type: 'text', text: 'Сохранить черновик.' }]);
    expect(run.historyReads).toHaveLength(1);
    expect(run.seen).toHaveLength(name === 'sdk-post-failure' ? 1 : 0);
    if (name === 'sdk-post-failure') expect(run.seen[0].body.messages).toEqual([run.parts.userMessage]);
  });
  test.each(['native-reconnect', 'resume', 'resume-above', 'native-question', 'native-approval', 'earlier-approval', 'regenerate'])('%s does not capture a user submission', name => {
    expect(report[name].captured).toEqual([]);
  });
  test.each(['message', 'inline-saved', 'queued-context', 'queued-null'])('%s captures one deliberate instruction', name => {
    expect(report[name].captured).toHaveLength(1);
    expect(report[name].captured[0].message).toEqual(report[name].seen[0].body.messages[0]);
  });
  test('an inline save refreshes the implicit selected revision before the sole POST, without a focus event', () => {
    const run = report['inline-saved'];
    expect(run.error).toBeUndefined();
    expect(run.historyReads).toHaveLength(1);
    expect(run.historyReads[0].zone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
    expect(run.seen).toHaveLength(1);
    expect(run.seen[0].body.workContext).toEqual({ version: 'assistant-work-context/v1', kind: 'piece', id: 'p1', revision: 'after-inline-save' });
  });
  test.each(['queued-context', 'regenerate', 'native-question', 'native-approval'])('%s preserves its existing binding and performs no preflight', name => {
    const run = report[name];
    expect(run.error).toBeUndefined();
    expect(run.historyReads).toEqual([]);
    expect(run.seen).toHaveLength(1);
    expect(run.seen[0].body.workContext.revision).toBe('before-inline-save');
  });
  test.each(['read-refused', 'read-disconnect', 'read-other-target', 'selection-changed', 'thread-changed'])('%s is proven before start and never submits the model request', name => {
    const run = report[name];
    expect(run.historyReads).toHaveLength(1);
    expect(run.seen).toEqual([]);
    expect(run.notStarted).toBe(true);
    expect(run.diagnostics).toEqual([]);
  });
  test('an explicit queued null context stays null without a preflight', () => {
    const run = report['queued-null'];
    expect(run.error).toBeUndefined();
    expect(run.historyReads).toEqual([]);
    expect(run.seen).toHaveLength(1);
    expect(run.seen[0].body.workContext).toBeNull();
  });
  test('Stop during the free context read prevents the paid POST', () => {
    const run = report['stopped-before-post'];
    expect(run.historyReads).toHaveLength(1);
    expect(run.seen).toEqual([]);
    expect(run.error).toBeDefined();
    expect(run.preStartSignals).toBe(1);
  });
});

  test.each(['writing-new', 'writing-refresh-race', 'writing-save-await'])('%s freezes channel and avatar before asynchronous preparation', mode => {
    expect(report[mode].seen[0].body.writingSelection).toEqual({ channelId: 'channel-original', avatarId: 'avatar-original' });
  });
  test('queued and cleared choices stay explicit, native answers do not send the new writing target', () => {
    expect(report['writing-queued'].seen[0].body.writingSelection).toEqual({ channelId: 'queued-channel' });
    expect(report['writing-cleared'].seen[0].body.writingSelection).toEqual({});
    expect(report['writing-native-question'].seen[0].body.writingSelection).toBeUndefined();
  });

  test('failed selection save is a typed pre-start refusal and never sends a model request', () => {
    expect(report['writing-save-refused'].seen).toEqual([]);
    expect(report['writing-save-refused'].notStarted).toBe(true);
  });
