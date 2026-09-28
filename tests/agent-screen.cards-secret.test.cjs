'use strict';

/**
 * The key in the agent chat (`content-factory-next-kcxz.20`, spec §1.5, §6.2
 * «Secret»): the key card posts the key straight to the AI settings door from
 * the browser, the same body the settings screen sends, and gives the chat
 * back only words; on «Ключи системы» a search key card takes nothing (the
 * own keys sleep there, 97dq.6). The composer refuses to send a message that
 * holds a key, takes the key out of the field and says where a key goes.
 */

const React = require('react');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/agents/t1',
});
for (const key of ['window', 'document', 'navigator']) {
  Object.defineProperty(global, key, {
    configurable: true,
    value: key === 'window' ? dom.window : dom.window[key],
  });
}
// `next/link` (the card's «Открыть на экране») schedules its prefetch on `self`.
global.self = dom.window;
global.IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, fireEvent, render, waitFor } = require('@testing-library/react');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');

const h = React.createElement;
const ru = loadTypeScriptModule('apps/frontend/src/components/agents/agent.copy.ts').agentCopy.ru;

afterEach(cleanup);

/** An obvious fake that still has a key's shape. */
const FAKE_KEY = 'sk-or-v1-FAKEFAKEFAKEFAKEFAKEFAKE44444444';

const setupCard = ({ role = 'ADMIN', settings, fresh }) => {
  const calls = [];
  const reads = [];
  const card = loadWithMocks('apps/frontend/src/components/agents/agent.secret-card.tsx', {
    react: React,
    swr: {
      __esModule: true,
      default: (key) => {
        reads.push(key);
        // `fresh`: what the door answers when the card reads again right
        // before saving (review W3-20 F3); the cache still holds `settings`.
        return { data: key ? settings : undefined, mutate: async () => fresh ?? settings };
      },
    },
    '@contentfactory/helpers/utils/custom.fetch': {
      useFetch: () => async (url, init) => {
        calls.push([url, init]);
        return { ok: true, status: 200, json: async () => settings };
      },
    },
    '@contentfactory/frontend/components/layout/user.context': {
      useUser: () => ({ role }),
    },
  });
  return { card, calls, reads };
};

const drawCard = async (env, secret, onContinue = () => {}) => {
  await act(async () => {
    render(h(env.card.SecretCard, { secret, onContinue, words: ru }));
  });
  // The first render may wait for the translations the settings module loads.
  return waitFor(() => {
    const card = document.querySelector('[data-agent-card="secret"]');
    if (!card) throw new Error('the card is not drawn yet');
    return card;
  });
};

describe('the key card', () => {
  test('on «Ключи системы» the AI key card says saving moves to the own key, and posts the key alone', async () => {
    const env = setupCard({
      settings: { usageMode: 'included', provider: 'openai', workspaceProvider: 'openai', hasKey: false, searchDepth: 'advanced' },
    });
    const continued = [];
    const card = await drawCard(env, { field: 'workspace-key' }, (text) => continued.push(text));
    expect(card.textContent).toContain(ru.secret.workspaceLeadSystem);
    const field = card.querySelector('input');
    await act(async () => {
      fireEvent.change(field, { target: { value: FAKE_KEY } });
    });
    // The card says which provider the key is saved for: the prefix names it
    // (review W3-20 F2), whatever the workspace's provider was.
    expect(card.textContent).toContain(ru.secret.savesFor('OpenRouter'));
    await act(async () => {
      fireEvent.submit(card.querySelector('form'));
    });
    expect(env.calls).toHaveLength(1);
    const [url, init] = env.calls[0];
    expect(url).toBe('/settings/ai');
    expect(init.method).toBe('POST');
    // The key, its provider and the mode it means — nothing cached (F3).
    expect(JSON.parse(init.body)).toEqual({
      usageMode: 'workspace_key',
      provider: 'openrouter',
      apiKey: FAKE_KEY,
    });
    // The field forgets the key; the chat gets words, never the key.
    expect(card.querySelector('input')).toBeNull();
    expect(card.textContent).toContain(ru.secret.saved);
    await act(async () => {
      fireEvent.click([...card.querySelectorAll('button')].find((b) => b.textContent === ru.secret.continue));
    });
    expect(continued).toEqual([ru.secret.continueText]);
    expect(continued.join('')).not.toContain('FAKE');
  });

  test('on «Ключи системы» a search key card takes nothing: the own search keys sleep there', async () => {
    const env = setupCard({ settings: { usageMode: 'included', provider: 'openai' } });
    const card = await drawCard(env, { field: 'search-key', engine: 'tavily' });
    expect(card.textContent).toContain(ru.secret.searchAsleep);
    expect(card.querySelector('input')).toBeNull();
    expect(card.querySelector('button[type="submit"]')).toBeNull();
    expect(env.calls).toEqual([]);
  });

  test('on the own key a search key goes under its engine only', async () => {
    const env = setupCard({
      settings: { usageMode: 'workspace_key', provider: 'openrouter', textModel: 'm', workspaceSearchKeys: { exa: false } },
    });
    const card = await drawCard(env, { field: 'search-key', engine: 'exa' });
    await act(async () => {
      fireEvent.change(card.querySelector('input'), { target: { value: 'exa-fake-key' } });
    });
    await act(async () => {
      fireEvent.submit(card.querySelector('form'));
    });
    const body = JSON.parse(env.calls[0][1].body);
    // The key alone: no mode, no models, no provider (review W3-20 F3).
    expect(body).toEqual({ searchApiKeys: { exa: 'exa-fake-key' } });
  });

  const typeAndSubmit = async (card, value) => {
    await act(async () => {
      fireEvent.change(card.querySelector('input'), { target: { value } });
    });
    await act(async () => {
      fireEvent.submit(card.querySelector('form'));
    });
  };

  test('a key of another provider or engine is refused on the card, and nothing is posted (F2)', async () => {
    const env = setupCard({ settings: { usageMode: 'workspace_key', workspaceProvider: 'openai', hasKey: true } });
    const ai = await drawCard(env, { field: 'workspace-key' });
    await typeAndSubmit(ai, 'sk-ant-api03-FAKEFAKEFAKEFAKEFAKEFAKE');
    expect(ai.textContent).toContain(ru.secret.wrongKey('Anthropic', 'OpenAI / OpenRouter'));
    expect(ai.querySelector('button[type="submit"]').disabled).toBe(true);
    cleanup();
    const tavily = await drawCard(env, { field: 'search-key', engine: 'tavily' });
    await typeAndSubmit(tavily, FAKE_KEY);
    expect(tavily.textContent).toContain(ru.secret.wrongKey('OpenRouter', 'Tavily'));
    expect(env.calls).toEqual([]);
  });

  test('a key with no telling prefix is saved for the workspace’s own provider, shown on the card', async () => {
    const env = setupCard({ settings: { usageMode: 'workspace_key', provider: 'openrouter', workspaceProvider: 'openrouter', hasKey: false } });
    const card = await drawCard(env, { field: 'workspace-key' });
    await act(async () => {
      fireEvent.change(card.querySelector('input'), { target: { value: 'custom-proxy-key-0000' } });
    });
    expect(card.textContent).toContain(ru.secret.savesFor('OpenRouter'));
    await act(async () => {
      fireEvent.submit(card.querySelector('form'));
    });
    expect(JSON.parse(env.calls[0][1].body)).toEqual({
      usageMode: 'workspace_key',
      provider: 'openrouter',
      apiKey: 'custom-proxy-key-0000',
    });
  });

  test('a stale card reads the settings again before saving: moved to «Ключи системы» since, a search key is not posted (F3)', async () => {
    const env = setupCard({
      settings: { usageMode: 'workspace_key', workspaceSearchKeys: {} },
      fresh: { usageMode: 'included', workspaceSearchKeys: {} },
    });
    const card = await drawCard(env, { field: 'search-key', engine: 'tavily' });
    await typeAndSubmit(card, 'tvly-dev-FAKEFAKEFAKEFAKE9999');
    expect(env.calls).toEqual([]);
  });

  test('on «Ключи системы» the AI key card does not say a dormant key is saved (F8)', async () => {
    const env = setupCard({ settings: { usageMode: 'included', workspaceProvider: 'openai', hasKey: true } });
    const card = await drawCard(env, { field: 'workspace-key' });
    expect(card.querySelector('input').getAttribute('placeholder')).toBe(ru.secret.placeholder);
  });

  test('a search key card says «saved» for the workspace’s own key only, not the system one (F9)', async () => {
    const own = setupCard({
      settings: { usageMode: 'workspace_key', searchKeys: { tavily: true }, workspaceSearchKeys: { tavily: false } },
    });
    const card = await drawCard(own, { field: 'search-key', engine: 'tavily' });
    expect(card.querySelector('input').getAttribute('placeholder')).toBe(ru.secret.placeholder);
    cleanup();
    const saved = setupCard({
      settings: { usageMode: 'workspace_key', searchKeys: { tavily: true }, workspaceSearchKeys: { tavily: true } },
    });
    const again = await drawCard(saved, { field: 'search-key', engine: 'tavily' });
    expect(again.querySelector('input').getAttribute('placeholder')).toBe(ru.secret.placeholderStored);
  });

  test('an editor reads who enters the key, and the settings door is not asked', async () => {
    const env = setupCard({ role: 'EDITOR', settings: { usageMode: 'included' } });
    const card = await drawCard(env, { field: 'workspace-key' });
    expect(card.textContent).toContain(ru.secret.notAdmin);
    expect(card.querySelector('input')).toBeNull();
    expect(env.reads).toEqual([null]);
    expect(env.calls).toEqual([]);
  });
});

describe('the composer refuses to send a key', () => {
  const setupComposer = () => {
    const sent = [];
    const composer = loadWithMocks('apps/frontend/src/components/agents/agent.composer.tsx', {
      react: React,
      '@contentfactory/frontend/components/ui/allowance-hint': { AllowanceHint: () => null },
    });
    return { composer, sent };
  };

  test('a pasted key is taken out of the field, nothing is sent, and the notice says where keys go', async () => {
    const env = setupComposer();
    await act(async () => {
      render(
        h(env.composer.AgentComposer, {
          busy: false,
          queued: false,
          onSubmit: (message) => env.sent.push(message),
          onStop: () => {},
          words: ru,
        })
      );
    });
    const field = document.querySelector('textarea');
    await act(async () => {
      fireEvent.change(field, { target: { value: `вот ключ ${FAKE_KEY} поставь` } });
    });
    await act(async () => {
      fireEvent.submit(document.querySelector('form'));
    });
    expect(env.sent).toEqual([]);
    expect(document.querySelector('textarea').value).toBe('вот ключ поставь');
    expect(document.body.textContent).toContain(ru.composer.keyPasted);
    // Words without a key go as they are.
    await act(async () => {
      fireEvent.submit(document.querySelector('form'));
    });
    expect(env.sent).toEqual([{ text: 'вот ключ поставь', files: [] }]);
  });
});
