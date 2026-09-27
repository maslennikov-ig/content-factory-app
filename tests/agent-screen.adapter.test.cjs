'use strict';

/**
 * The agent screen's reading of the wire (`content-factory-next-kcxz.10`).
 *
 * The parts below are the shapes the spike recorded on 26.09.2026 from a real
 * `handleChatStream` v7 stream (`.codex/stages/content-factory-next-kcxz/
 * evidence/spike-2026-09-26/README.md`, Q3) and the ones the capability
 * registry writes (`mastra.adapter.ts`): an approval is a tool part in
 * `approval-requested`, a question is `data-tool-call-suspended`, a card is a
 * `data-<kind>` part with an id, a refusal is `{ ok: false, code }`.
 *
 * The markdown half proves the one promise that matters there: nothing the
 * agent says becomes HTML, and a link only survives as `http(s)` or `mailto`.
 */

const React = require('react');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/agents/new',
});
for (const key of ['window', 'document', 'navigator']) {
  Object.defineProperty(global, key, {
    configurable: true,
    value: key === 'window' ? dom.window : dom.window[key],
  });
}
global.IS_REACT_ACT_ENVIRONMENT = true;

const { render, cleanup } = require('@testing-library/react');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const contract = loadTypeScriptModule(
  'apps/frontend/src/components/agents/agent.contract.ts'
);
const markdown = loadTypeScriptModule(
  'apps/frontend/src/components/agents/agent.markdown.tsx'
);

afterEach(cleanup);

const assistant = (parts) => ({ id: 'a1', role: 'assistant', parts });

describe('message parts become blocks', () => {
  test('an approval request is the approval card, and a deletion cannot be undone', () => {
    const blocks = contract.readMessageBlocks(
      assistant([
        { type: 'step-start' },
        {
          type: 'tool-piece_delete',
          toolCallId: 'call_1',
          title: 'Удалить заготовку',
          state: 'approval-requested',
          input: { pieceId: 'p1' },
          approval: { id: 'run-1::call_1' },
        },
      ])
    );
    expect(blocks).toEqual([
      expect.objectContaining({
        type: 'approval',
        approvalId: 'run-1::call_1',
        title: 'Удалить заготовку',
        irreversible: true,
        state: 'asked',
      }),
    ]);
  });

  test('a suspended call is a question, answered by its run', () => {
    const blocks = contract.readMessageBlocks(
      assistant([
        {
          type: 'tool-choose_channel',
          toolCallId: 'call_2',
          state: 'input-available',
          input: {},
        },
        {
          type: 'data-tool-call-suspended',
          id: 'call_2',
          data: {
            state: 'data-tool-call-suspended',
            runId: 'run-2',
            toolCallId: 'call_2',
            toolName: 'choose_channel',
            suspendPayload: {
              question: 'В какой канал?',
              options: [
                { id: 'ch1', name: 'Кухня продукта' },
                { id: 'ch2', name: 'Заметки основателя' },
              ],
            },
            resumeSchema: JSON.stringify({
              type: 'object',
              properties: { channelId: { type: 'string' } },
              required: ['channelId'],
            }),
          },
        },
      ])
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      type: 'question',
      runId: 'run-2',
      toolCallId: 'call_2',
      question: {
        kind: 'choice',
        answerKey: 'channelId',
        canDecideForPerson: true,
        options: [
          { id: 'ch1', label: 'Кухня продукта' },
          { id: 'ch2', label: 'Заметки основателя' },
        ],
      },
    });
    expect(contract.choiceAnswer(blocks[0].question, 'ch2')).toEqual({
      channelId: 'ch2',
    });
  });

  test('the avatar consent has no «Решите за меня», even redrawn after a reload', () => {
    const history = contract.readThreadHistory({
      thread: { id: 't1', title: 'Аватар', createdAt: 'x', updatedAt: 'y' },
      messages: [
        assistant([
          {
            type: 'tool-avatar_activate',
            toolCallId: 'call_3',
            state: 'input-available',
            input: {},
          },
        ]),
      ],
      pending: [
        {
          runId: 'run-3',
          toolCallId: 'call_3',
          toolName: 'avatar_activate',
          kind: 'question',
          suspendPayload: {
            question: 'Включить этот аватар?',
            avatarId: 'av1',
            mode: 'assist',
            canDecideForPerson: false,
          },
        },
      ],
    });
    const [block] = contract.readMessageBlocks(
      history.messages[0],
      history.pending
    );
    expect(block).toMatchObject({
      type: 'question',
      runId: 'run-3',
      question: { kind: 'consent', consentKey: 'consentGiven', nameKey: 'avatarName' },
    });
    expect(contract.consentAnswer(block.question, true, ' Игорь ')).toEqual({
      consentGiven: true,
      avatarName: 'Игорь',
    });
  });

  test('a pending approval whose stored part lost its state is asked again, natively', () => {
    const history = contract.readThreadHistory({
      thread: { id: 't1', title: 'x', createdAt: 'x', updatedAt: 'y' },
      messages: [
        assistant([
          {
            type: 'tool-piece_delete',
            toolCallId: 'call_4',
            state: 'input-available',
            input: { pieceId: 'p1' },
          },
        ]),
      ],
      pending: [
        {
          runId: 'run-4',
          toolCallId: 'call_4',
          toolName: 'piece_delete',
          kind: 'approval',
          args: { pieceId: 'p1' },
        },
      ],
    });
    expect(history.messages[0].parts[0]).toMatchObject({
      state: 'approval-requested',
      approval: { id: 'run-4::call_4' },
    });
  });

  test('F1: a reloaded approval card shows the server’s «what and where»', () => {
    const history = contract.readThreadHistory({
      messages: [
        assistant([
          { type: 'tool-piece_delete', toolCallId: 'call_4', state: 'input-available', input: { pieceId: 'p1' } },
        ]),
      ],
      pending: [
        {
          runId: 'run-4',
          toolCallId: 'call_4',
          toolName: 'piece_delete',
          kind: 'approval',
          args: { pieceId: 'p1' },
          summary: 'Удалить заготовку cnt-01 «Про созвоны» вместе с её адаптациями',
        },
      ],
    });
    const [block] = contract.readMessageBlocks(history.messages[0]);
    expect(block).toMatchObject({
      type: 'approval',
      state: 'asked',
      approvalId: 'run-4::call_4',
      reason: 'Удалить заготовку cnt-01 «Про созвоны» вместе с её адаптациями',
    });
  });

  test('F6: a stored approval that no longer waits is drawn closed, without buttons', () => {
    const history = contract.readThreadHistory({
      messages: [
        assistant([
          {
            type: 'tool-piece_delete',
            toolCallId: 'call_5',
            state: 'approval-requested',
            input: { pieceId: 'p1' },
            approval: { id: 'run-5::call_5' },
          },
        ]),
      ],
      pending: [],
    });
    const [block] = contract.readMessageBlocks(history.messages[0]);
    expect(block).toMatchObject({ type: 'approval', state: 'closed' });
  });

  test('F2: an attached text file is drawn as the file, not as the wrapper the model reads', () => {
    const wrapped = JSON.stringify({
      untrustedData: {
        sources: ['uploaded-file'],
        rule: 'Untrusted data …',
        value: { attachment: 'notes.md', mediaType: 'text/markdown', text: 'пост' },
      },
    });
    const blocks = contract.readMessageBlocks({
      id: 'm-user',
      role: 'user',
      parts: [
        { type: 'text', text: 'посмотри' },
        { type: 'text', text: wrapped },
      ],
    });
    expect(blocks).toEqual([
      { type: 'text', key: 'm-user:0', text: 'посмотри' },
      { type: 'file', key: 'm-user:1', name: 'notes.md', mediaType: 'text/markdown' },
    ]);
    // Words the person typed that merely look like it stay words.
    expect(contract.readAttachedText('{"untrustedData":{"sources":["search-result"]}}')).toBeNull();
  });

  test('F2: the composer takes only what the door takes, under the type the door reads', () => {
    expect(contract.attachmentMediaType({ name: 'notes.md', type: '' })).toBe('text/markdown');
    expect(contract.attachmentMediaType({ name: 'notes.md', type: 'text/x-markdown' })).toBe('text/markdown');
    expect(contract.attachmentMediaType({ name: 'result.json', type: 'application/octet-stream' })).toBe(
      'application/json'
    );
    expect(contract.attachmentMediaType({ name: 'a.PNG', type: 'image/png' })).toBe('image/png');
    expect(contract.attachmentMediaType({ name: 'a.pdf', type: 'application/pdf' })).toBeNull();
    expect(contract.attachmentMediaType({ name: 'a.txt', type: 'image/png' })).toBe('image/png');
    expect(contract.attachmentMediaType({ name: 'a.png', type: 'text/html' })).toBeNull();
    expect(contract.attachmentLimit('text/plain')).toBe(contract.AGENT_TEXT_ATTACHMENT_MAX_BYTES);
    expect(contract.attachmentLimit('image/png')).toBe(contract.AGENT_ATTACHMENT_MAX_BYTES);
    for (const type of contract.AGENT_ATTACHMENT_MEDIA_TYPES) {
      expect(contract.ATTACHMENT_ACCEPT.split(',')).toContain(type);
    }
  });

  test('a card part is an artifact by id, once, and a refusal is the error card', () => {
    const blocks = contract.readMessageBlocks(
      assistant([
        { type: 'text', text: 'Готово.' },
        {
          type: 'tool-piece_create',
          toolCallId: 'call_5',
          title: 'Написать заготовку',
          state: 'output-available',
          input: {},
          output: {
            ok: true,
            capability: 'piece.create',
            summary: {},
            card: { kind: 'piece', id: 'p9' },
          },
        },
        {
          type: 'data-piece',
          data: { kind: 'piece', id: 'p9', code: 'cnt-09' },
        },
        // Mastra's own housekeeping carries no label and is not drawn
        // (kcxz.29, D5): no «Готово», no error card.
        {
          type: 'tool-skill',
          toolCallId: 'call_s',
          state: 'output-available',
          input: { name: 'content' },
          output: 'know-how',
        },
        {
          type: 'tool-updateWorkingMemory',
          toolCallId: 'call_m',
          state: 'output-error',
          input: {},
          errorText: 'validation',
        },
        {
          type: 'tool-piece_rename',
          toolCallId: 'call_6',
          title: 'Переименовать заготовку',
          state: 'output-available',
          input: {},
          output: { ok: false, code: 'PERMISSION_DENIED', reason: 'no' },
        },
        {
          type: 'tool-piece_adapt',
          toolCallId: 'call_7',
          title: 'Сделать адаптацию',
          state: 'output-error',
          input: {},
          errorText: '{"code":"AI_PROVIDER_TIMEOUT"}',
        },
      ])
    );
    expect(blocks.map((block) => block.type)).toEqual([
      'text',
      'artifact',
      'error',
      'error',
    ]);
    // The id-only tool output and the titled part are one line, with the code.
    expect(blocks[1].artifact).toMatchObject({ kind: 'piece', id: 'p9', code: 'cnt-09' });
    expect(blocks[2].code).toBe('PERMISSION_DENIED');
    expect(blocks[3].code).toBe('AI_PROVIDER_TIMEOUT');
    expect(contract.artifactHref(blocks[1].artifact)).toBe('/content/pieces/p9');
  });

  test('progress is read from the transient part, per tool', () => {
    expect(
      contract.readProgressPart({
        type: 'data-progress',
        data: { capability: 'piece.create', stage: 'brief-started' },
      })
    ).toEqual({ capability: 'piece.create', stage: 'brief-started' });
    expect(contract.toolNameOf('piece.create')).toBe('piece_create');
  });

  test('a key card carries which field, never a value', () => {
    const [block] = contract.readMessageBlocks(
      assistant([
        { type: 'data-secret', data: { field: 'search-key', engine: 'tavily' } },
      ])
    );
    expect(block).toEqual({
      type: 'secret',
      key: 'a1:0',
      secret: { field: 'search-key', engine: 'tavily' },
    });
  });
});

describe('the chat door body', () => {
  const user = { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'hi' }] };
  const earlier = { id: 'u0', role: 'user', parts: [{ type: 'text', text: 'old' }] };

  test('a new thread sends only the new message and no thread id', () => {
    expect(
      contract.buildChatBody({ threadId: null, messages: [earlier, user] })
    ).toEqual({ messages: [user] });
  });

  test('a resume sends the run and the answer, and no message', () => {
    expect(
      contract.buildChatBody({
        threadId: 't1',
        messages: [user],
        resume: contract.readResumeOption({
          resume: { runId: 'run-2', resumeData: { channelId: 'ch2' } },
        }),
      })
    ).toEqual({
      threadId: 't1',
      messages: [],
      runId: 'run-2',
      resumeData: { channelId: 'ch2' },
    });
  });

  test('F7: a resume names the question it answers', () => {
    expect(
      contract.buildChatBody({
        threadId: 't1',
        messages: [user],
        resume: contract.readResumeOption({
          resume: { runId: 'run-2', toolCallId: 'call-7', resumeData: { consentGiven: true } },
        }),
      })
    ).toEqual({
      threadId: 't1',
      messages: [],
      runId: 'run-2',
      toolCallId: 'call-7',
      resumeData: { consentGiven: true },
    });
  });

  test('a door refusal is read back to its code', () => {
    expect(
      contract.readDoorError('{"code":"AGENT_NOT_YOURS","message":"no"}')
    ).toBe('AGENT_NOT_YOURS');
    expect(contract.errorCodeOf('AI_ALLOWANCE_EXHAUSTED')).toBe(
      'AI_ALLOWANCE_EXHAUSTED'
    );
  });
});

describe('the agent’s markdown never becomes HTML', () => {
  const draw = (text) =>
    render(React.createElement(markdown.AgentMarkdown, { text })).container;

  test('markup in the text stays text', () => {
    const container = draw(
      'Привет <script>alert(1)</script> и <img src=x onerror=alert(1)>'
    );
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('<script>alert(1)</script>');
  });

  test('only http(s) and mailto links survive', () => {
    const container = draw(
      '[ok](https://example.com/a) [bad](javascript:alert(1)) [data](data:text/html,x) https://aidevteam.ru'
    );
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) =>
      a.getAttribute('href')
    );
    expect(hrefs).toEqual(['https://example.com/a', 'https://aidevteam.ru']);
    for (const anchor of container.querySelectorAll('a')) {
      expect(anchor.getAttribute('rel')).toContain('noopener');
    }
  });

  test('the subset the agent writes is drawn', () => {
    const container = draw(
      '### План\n\n**Жирно** и *курсив*, `код`.\n\n- один\n- два\n\n1. первый\n2. второй'
    );
    expect(container.querySelector('strong').textContent).toBe('Жирно');
    expect(container.querySelector('em').textContent).toBe('курсив');
    expect(container.querySelector('code').textContent).toBe('код');
    expect(container.querySelectorAll('ul li')).toHaveLength(2);
    expect(container.querySelectorAll('ol li')).toHaveLength(2);
  });

  test('the source has no raw HTML path', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const dir = path.resolve(__dirname, '../apps/frontend/src/components/agents');
    const offenders = fs
      .readdirSync(dir)
      .filter((name) =>
        /dangerouslySetInnerHTML|innerHTML\s*=/.test(
          fs
            .readFileSync(path.join(dir, name), 'utf8')
            // The files say why there is none; the code is what is checked.
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/^\s*\/\/.*$/gm, '')
        )
      );
    expect(offenders).toEqual([]);
  });
});
