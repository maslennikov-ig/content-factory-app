'use strict';

/**
 * «Подключение канала» in the agent chat (`content-factory-next-kcxz.19`,
 * spec §6.2 «Channel connect»): Telegram draws the onboarding's own steps
 * with the way back to the conversation; a platform with a sign-in window is
 * one button that asks the add-channel door for the window; a channel that
 * arrived since the card was made is named and opened beside the chat. Also:
 * a channel card opens the channel screen itself in the work panel.
 */

const fs = require('node:fs');
const path = require('node:path');
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
global.IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, fireEvent, render, within } = require('@testing-library/react');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');

const root = path.resolve(__dirname, '..');
const source = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const h = React.createElement;

const copy = loadTypeScriptModule('apps/frontend/src/components/agents/agent.copy.ts');
const onboarding = loadTypeScriptModule(
  'apps/frontend/src/components/onboarding/onboarding.copy.ts'
).onboardingCopy;
const ru = copy.agentCopy.ru;
const en = copy.agentCopy.en;

afterEach(cleanup);

const setup = ({ rows = [], loading = false, ok = true, body = { url: 'https://platform.example/auth' } } = {}) => {
  const calls = [];
  const guides = [];
  const card = loadWithMocks('apps/frontend/src/components/agents/agent.channel-card.tsx', {
    react: React,
    '@contentfactory/helpers/utils/custom.fetch': {
      useFetch: () => async (url, init) => {
        calls.push([url, init]);
        return { ok, status: ok ? 200 : 500, json: async () => body };
      },
    },
    '@contentfactory/frontend/components/launches/helpers/use.integration.list': {
      useIntegrationList: () => ({ data: rows, isLoading: loading }),
    },
    '@contentfactory/frontend/components/onboarding/onboarding.telegram': {
      OnboardingTelegramGuide: (props) => {
        guides.push(props);
        return h('div', { 'data-guide': 'telegram' }, props.actionLabel);
      },
    },
  });
  return { card, calls, guides };
};

const draw = async (env, connect, { threadId = 't1', words = ru, onOpen = () => {} } = {}) => {
  await act(async () => {
    render(h(env.card.ChannelConnectCard, { connect, threadId, onOpen, words }));
  });
  return document.querySelector('[data-agent-card="channel-connect"]');
};

// The card was made a minute ago; a channel created since is its own
// (review W3-19 P3-3).
const SINCE = new Date(Date.now() - 60 * 1000).toISOString();
const NOW = new Date().toISOString();
const TELEGRAM = { provider: 'telegram', name: 'Telegram', flow: 'telegram', known: ['c1'], since: SINCE };
const LINKEDIN = { provider: 'linkedin', name: 'LinkedIn', flow: 'oauth', known: [], since: SINCE };

describe('the channel connect card', () => {
  test('Telegram: the onboarding’s own steps, coming back to this conversation', async () => {
    const env = setup({ rows: [{ id: 'c1', name: 'Старый', identifier: 'telegram' }] });
    const card = await draw(env, TELEGRAM);
    expect(card.textContent).toContain(ru.connect.kind);
    expect(card.textContent).toContain(ru.connect.telegramTitle);
    expect(env.guides.at(-1)).toEqual(
      expect.objectContaining({
        words: onboarding.ru.telegram,
        actionLabel: onboarding.ru.steps.channel.action,
        redirectUrl: '/agents/t1',
      })
    );
  });

  test('a platform window: one button asking the add-channel door, with the way back', async () => {
    const env = setup();
    const card = await draw(env, LINKEDIN);
    expect(card.textContent).toContain(ru.connect.oauthLead('LinkedIn'));
    await act(async () =>
      fireEvent.click(within(card).getByRole('button', { name: ru.connect.oauthAction('LinkedIn') }))
    );
    expect(env.calls).toEqual([
      [`/integrations/social/linkedin?redirectUrl=${encodeURIComponent('/agents/t1')}`, undefined],
    ]);
    expect(card.querySelector('[role="alert"]')).toBeNull();
  });

  test('the door refusing: it says so and offers «Каналы», the button stays', async () => {
    const env = setup({ body: { err: true } });
    const card = await draw(env, LINKEDIN, { words: en });
    await act(async () =>
      fireEvent.click(within(card).getByRole('button', { name: en.connect.oauthAction('LinkedIn') }))
    );
    expect(card.querySelector('[role="alert"]').textContent).toBe(en.connect.oauthFailed);
    expect(within(card).getByRole('button', { name: en.connect.oauthAction('LinkedIn') })).toBeTruthy();
  });

  test('a channel that arrived since the card: named, and opened beside the chat', async () => {
    const opened = [];
    const env = setup({
      rows: [
        { id: 'c1', name: 'Старый', identifier: 'telegram', createdAt: '2026-01-01T00:00:00.000Z' },
        { id: 'c2', name: 'Заметки из цеха', identifier: 'telegram', createdAt: NOW },
      ],
    });
    const card = await draw(env, TELEGRAM, { onOpen: (artifact) => opened.push(artifact) });
    expect(card.textContent).toContain(ru.connect.connected('Заметки из цеха'));
    expect(card.querySelector('[role="status"]').textContent).toBe(ru.connect.connectedLead);
    expect(env.guides).toEqual([]);
    await act(async () =>
      fireEvent.click(within(card).getByRole('button', { name: ru.connect.openChannel }))
    );
    expect(opened).toEqual([
      expect.objectContaining({ kind: 'channel', id: 'c2', title: 'Заметки из цеха' }),
    ]);
  });

  test('a half-finished connection is not a connected channel: the steps stay (P3-3)', async () => {
    const env = setup({
      rows: [{ id: 'c2', name: 'Заметки из цеха', identifier: 'telegram', createdAt: NOW, inBetweenSteps: true }],
    });
    const card = await draw(env, TELEGRAM);
    expect(card.textContent).not.toContain(ru.connect.connected('Заметки из цеха'));
    expect(env.guides).toHaveLength(1);
  });

  test('a failed return from the platform is said on the card in plain words (P3-4)', async () => {
    window.history.replaceState({}, '', '/agents/t1?precondition=true');
    try {
      const env = setup();
      const card = await draw(env, LINKEDIN);
      expect(card.querySelector('[role="alert"]').textContent).toBe(ru.connect.returnPrecondition);
    } finally {
      window.history.replaceState({}, '', '/agents/t1');
      cleanup();
    }
    window.history.replaceState({}, '', '/agents/t1?msg=Token%20expired');
    try {
      const env = setup();
      const card = await draw(env, LINKEDIN, { words: en });
      expect(card.querySelector('[role="alert"]').textContent).toBe(en.connect.returnFailed('Token expired'));
    } finally {
      window.history.replaceState({}, '', '/agents/t1');
    }
  });

  test('the mobile shell opens the window outside, as «Каналы» does there', async () => {
    const sent = [];
    window.ReactNativeWebView = { postMessage: (message) => sent.push(JSON.parse(message)) };
    try {
      const env = setup();
      const card = await draw(env, LINKEDIN);
      await act(async () =>
        fireEvent.click(within(card).getByRole('button', { name: ru.connect.oauthAction('LinkedIn') }))
      );
      expect(env.calls[0][0]).toBe(
        `/integrations/social/linkedin?redirectUrl=${encodeURIComponent('contentfactory://integrations')}`
      );
      expect(sent).toEqual([{ type: 'open-external', url: 'https://platform.example/auth' }]);
    } finally {
      delete window.ReactNativeWebView;
    }
  });

  test('while the channels are read: a status line, not the steps', async () => {
    const env = setup({ loading: true });
    const card = await draw(env, TELEGRAM);
    expect(card.querySelector('[role="status"]')).not.toBeNull();
    expect(env.guides).toEqual([]);
  });

  test('both languages frame the card', () => {
    for (const words of [ru, en]) {
      for (const key of ['kind', 'telegramTitle', 'oauthFailed', 'returnPrecondition', 'checking', 'connectedLead', 'openChannel']) {
        expect(typeof words.connect[key]).toBe('string');
        expect(words.connect[key].length).toBeGreaterThan(0);
      }
    }
  });
});

describe('the work panel opens a channel as its own screen', () => {
  test('`channel` artifacts render `ChannelScreen` with the id, embedded', () => {
    const panel = source('apps/frontend/src/components/agents/agent.panel.tsx');
    expect(panel).toContain("artifact.kind === 'channel'");
    expect(panel).toContain('<ChannelScreen key={artifact.id} channelId={artifact.id} embedded />');
    const screen = source('apps/frontend/src/components/channels/channel-screen.tsx');
    expect(screen).toContain('const id = channelId ?? params?.id;');
  });

  test('the connect card is drawn in the conversation, never opened beside it', () => {
    const contract = loadTypeScriptModule('apps/frontend/src/components/agents/agent.contract.ts');
    expect(contract.isArtifactKind('channel')).toBe(true);
    expect(contract.isArtifactKind('channel-connect')).toBe(false);
    const message = {
      id: 'm1',
      role: 'assistant',
      parts: [
        {
          type: 'tool-channel_connect',
          toolCallId: 'call-1',
          title: 'Подключить канал',
          state: 'output-available',
          input: { provider: 'telegram' },
          output: { ok: true, capability: 'channel.connect', summary: {}, card: { kind: 'channel-connect', id: 'telegram' } },
        },
        {
          type: 'data-channel-connect',
          data: { kind: 'channel-connect', id: 'telegram', provider: 'telegram', name: 'Telegram', flow: 'telegram', known: [] },
        },
      ],
    };
    const blocks = contract.readMessageBlocks(message);
    expect(blocks.map((block) => block.type)).toEqual(['connect']);
    expect(contract.artifactsOf([message])).toEqual([]);
  });
});
