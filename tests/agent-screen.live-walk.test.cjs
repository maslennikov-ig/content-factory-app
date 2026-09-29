'use strict';

/**
 * The agent screen after the live walk of 27.09.2026
 * (`content-factory-next-kcxz.29`; evidence
 * `.codex/stages/content-factory-next-kcxz/evidence/live-stand-2026-09-27/`).
 *
 * Each block below is one defect the walk found with a real model and a real
 * browser, held here at the level where it lived: the gate that unmounted the
 * conversation (D2), the piece that stayed open after its deletion (D6), the
 * questions nobody was told about (D4), the raw code on a refusal (D7), the
 * allowance line a turn behind and in another language (D8), and the phone
 * screen that scrolled the document instead of the conversation (D11).
 */

const fs = require('node:fs');
const path = require('node:path');
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

const { act, cleanup, render } = require('@testing-library/react');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const root = path.resolve(__dirname, '..');
const source = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const h = React.createElement;

const contract = loadTypeScriptModule('apps/frontend/src/components/agents/agent.contract.ts');
const copy = loadTypeScriptModule('apps/frontend/src/components/agents/agent.copy.ts');
const cards = loadTypeScriptModule('apps/frontend/src/components/agents/agent.cards.tsx');
const ru = copy.agentCopy.ru;

afterEach(cleanup);

describe('D2 — a streaming turn is never unmounted by the availability check', () => {
  const loadGate = (availability) =>
    loadWithMocks('apps/frontend/src/components/agents/agent.availability.tsx', {
      react: React,
      '@contentfactory/react/translation/get.transation.service.client': {
        useT: () => (_key, fallback) => fallback,
      },
      '@contentfactory/frontend/components/agents/assistant-availability': {
        useAssistantAvailability: () => availability.current,
      },
      '@contentfactory/frontend/components/ui/surface': {
        RestrictedState: ({ title }) => h('p', null, title),
      },
    });

  test('once the conversation opened, a revalidation does not swap it for «Checking»', async () => {
    const availability = { current: 'checking' };
    const { AgentAvailabilityGate } = loadGate(availability);
    let mounts = 0;
    const Conversation = () => {
      React.useEffect(() => {
        mounts += 1;
      }, []);
      return h('p', null, 'разговор');
    };
    const tree = () => h(AgentAvailabilityGate, null, h(Conversation));

    let view;
    await act(async () => {
      view = render(tree());
    });
    expect(document.body.textContent).toContain('Checking');

    for (const next of ['available', 'checking', 'unavailable', 'unknown', 'checking']) {
      availability.current = next;
      await act(async () => view.rerender(tree()));
      expect(document.body.textContent).toContain('разговор');
    }
    expect(mounts).toBe(1);
  });

  test('before it opened, «AI is not connected» still replaces the conversation', async () => {
    const { AgentAvailabilityGate } = loadGate({ current: 'unavailable' });
    await act(async () => {
      render(h(AgentAvailabilityGate, null, h('p', null, 'разговор')));
    });
    expect(document.body.textContent).not.toContain('разговор');
  });

  test('a loaded thread is not swapped for the skeleton or the error on revalidation', () => {
    const screen = source('apps/frontend/src/components/agents/agent.screen.tsx');
    expect(screen).toContain('if (load && !history.data && history.isLoading)');
    expect(screen).toContain('if (load && !history.data && history.error)');
    expect(screen).toContain('revalidateOnReconnect: false');
  });
});

describe('D6 — a deleted piece closes and stops offering itself', () => {
  const created = {
    id: 'a1',
    role: 'assistant',
    parts: [
      {
        type: 'tool-piece_create',
        toolCallId: 'c1',
        title: 'Написать заготовку',
        state: 'output-available',
        input: { text: 'мысль' },
        output: { ok: true, card: { kind: 'piece', id: 'p9' } },
      },
      { type: 'data-piece', data: { kind: 'piece', id: 'p9', code: 'cnt-09', questions: 4 } },
    ],
  };
  const deleted = {
    id: 'a2',
    role: 'assistant',
    parts: [
      {
        type: 'tool-piece_delete',
        toolCallId: 'c2',
        title: 'Удалить заготовку',
        state: 'output-available',
        input: { pieceId: 'p9' },
        output: { ok: true, summary: { pieceId: 'p9', deleted: true } },
        approval: { id: 'r::c2', approved: true },
      },
    ],
  };

  test('a finished `piece_delete` removes the piece; a refused one does not', () => {
    expect([...contract.removedArtifactsOf([created, deleted])]).toEqual(['piece:p9']);
    const refused = structuredClone(deleted);
    refused.parts[0].output = { ok: false, code: 'PIECE_NOT_FOUND' };
    expect([...contract.removedArtifactsOf([created, refused])]).toEqual([]);
  });

  test('the line of the deleted piece says so and has nothing to open', async () => {
    const removed = contract.removedArtifactsOf([created, deleted]);
    const [line] = contract
      .readMessageBlocks(created, [], removed)
      .filter((block) => block.type === 'artifact');
    expect(line.removed).toBe(true);
    await act(async () => {
      render(
        h(cards.ArtifactLine, {
          artifact: line.artifact,
          open: false,
          removed: line.removed,
          onOpen: () => {},
          words: ru,
        })
      );
    });
    expect(document.body.textContent).toContain('удалено');
    expect(document.querySelector('button')).toBeNull();
  });

  test('the conversation closes the panel when its piece is deleted', () => {
    const conversation = source('apps/frontend/src/components/agents/agent.conversation.tsx');
    expect(conversation).toContain('if (openKey && removed.has(openKey)) artifactGone.current();');
    const screen = source('apps/frontend/src/components/agents/agent.screen.tsx');
    expect(screen).toContain('onArtifactRemoved={closeArtifact}');
  });
});

describe('D4 — a new piece says how many questions wait', () => {
  test('the line of a piece with open questions tells the person to answer them', async () => {
    await act(async () => {
      render(
        h(cards.ArtifactLine, {
          artifact: { kind: 'piece', id: 'p9', title: null, code: 'cnt-09', data: { questions: 4 } },
          open: false,
          onOpen: () => {},
          words: ru,
        })
      );
    });
    expect(document.body.textContent).toContain('4 вопроса ждут ответа');
  });

  test('Russian counts agree with the number', () => {
    expect(ru.card.pieceQuestions(1)).toMatch(/^1 вопрос ждёт/);
    expect(ru.card.pieceQuestions(5)).toMatch(/^5 вопросов ждут/);
    expect(ru.card.pieceQuestions(22)).toMatch(/^22 вопроса ждут/);
  });
});

describe('D7, D9 — refusals in product words, never a raw code as the answer', () => {
  const renderError = async (props) => {
    await act(async () => {
      render(h(cards.ErrorCard, { title: 'Включить аватар', words: ru, ...props }));
    });
    return document.body.textContent;
  };

  test('an avatar that is not ready is explained, with no code line', async () => {
    const text = await renderError({ code: 'VOICE_FIELDS_INCOMPLETE', refusal: true });
    expect(text).toContain('Аватар ещё не готов');
    expect(text).not.toContain('VOICE_FIELDS_INCOMPLETE');
    expect(text).not.toContain('обычно этого хватает');
  });

  test('an unknown refusal does not advise trying again', async () => {
    const text = await renderError({ code: 'SOMETHING_NEW', refusal: true });
    expect(text).toContain('в ответе ниже');
    expect(text).not.toContain('обычно этого хватает');
  });

  test('a provider that rejects the request points at the settings', async () => {
    const text = await renderError({ title: null, code: 'AI_PROVIDER_REJECTED' });
    expect(text).toContain('Настройки → ИИ');
    expect(text).not.toContain('обычно этого хватает');
  });

  test('every error code of the wire has words in both languages', () => {
    for (const code of [...contract.AGENT_ERROR_CODES, ...contract.AGENT_DOOR_ERROR_CODES]) {
      expect(Object.keys(copy.agentCopy.ru.error.codes)).toContain(code);
      expect(Object.keys(copy.agentCopy.en.error.codes)).toContain(code);
    }
  });
});

describe('D8 — the allowance line follows the turn, in the screen’s language', () => {
  test('every finished turn refreshes the allowance line', () => {
    const conversation = source('apps/frontend/src/components/agents/agent.conversation.tsx');
    const finish = conversation.slice(conversation.indexOf('onFinish: () => {'));
    expect(finish.slice(0, 400)).toContain('mutate(ALLOWANCE_API)');
  });

  test('the agent screen reads its language where `t()` does', () => {
    const dir = path.join(root, 'apps/frontend/src/components/agents');
    for (const name of fs.readdirSync(dir)) {
      const text = fs.readFileSync(path.join(dir, name), 'utf8');
      expect([name, /useVariables\(\)/.test(text)]).toEqual([name, false]);
    }
    expect(source('apps/frontend/src/components/agents/agent.screen.tsx')).toContain(
      'useInterfaceLanguage()'
    );
  });
});

describe('D11 — at 390 px the conversation scrolls, not the document', () => {
  test('below `md` the screen is exactly the viewport under the header and does not grow', () => {
    const screen = source('apps/frontend/src/components/agents/agent.screen.tsx');
    const className = /data-agent-screen=""[\s\S]*?className="([^"]+)"/.exec(screen)[1].split(' ');
    expect(className).toEqual(
      expect.arrayContaining(['h-[calc(100dvh-56px)]', 'flex-none', 'min-h-0', 'md:flex-1', 'md:h-auto'])
    );
    expect(className).not.toContain('flex-1');
  });
});
