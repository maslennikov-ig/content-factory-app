'use strict';

/**
 * Review W4-23 F1: «Взять в работу» in the ideas panel beside the chat.
 *
 * The panel renders «Откуда идеи» itself. Its «Взять в работу» used to take
 * the lead and announce «Открываем «Новую заготовку»», which never opened
 * beside the chat — the lead left the queue and led nowhere. Now the panel
 * hands the taken lead to the chat's composer (the «Сделать в чате» pattern:
 * written into the field, never sent), and the notice says so. Without a
 * handler the tab claims nothing it does not do.
 */

const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/',
});
for (const key of ['window', 'document', 'navigator']) {
  Object.defineProperty(global, key, {
    configurable: true,
    value: key === 'window' ? dom.window : dom.window[key],
  });
}
global.IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, fireEvent, render, screen } = require('@testing-library/react');
const { SWRConfig } = require('swr');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const leads = loadTypeScriptModule('apps/frontend/src/components/content-intelligence/content-leads.tab.tsx');
const variables = loadTypeScriptModule('libraries/react-shared-libraries/src/helpers/variable.context.tsx');
const userContext = loadTypeScriptModule('apps/frontend/src/components/layout/user.context.tsx');
const { agentCopy } = loadTypeScriptModule('apps/frontend/src/components/agents/agent.copy.ts');

const LEAD = {
  id: 'lead-1',
  subscriptionId: 'sub-1',
  subscriptionName: 'vc.ru',
  title: 'Созвоны без повестки',
  excerpt: 'Команды тратят на созвоны до трети недели.',
  sourceUrl: 'https://vc.ru/a/1',
  publishedAt: '2026-09-26T08:00:00.000Z',
  observedAt: '2026-09-27T06:00:00.000Z',
  reasonRu: 'Свежая запись.',
  reasonEn: 'A fresh item.',
  status: 'NEW',
  dismissedAt: null,
  acceptedAt: null,
};

const SUBSCRIPTION = {
  id: 'sub-1',
  kind: 'RSS',
  displayName: 'vc.ru',
  canonicalUrl: 'https://vc.ru/rss',
  checkIntervalMinutes: 1440,
  state: 'ACTIVE',
  lastCheckedAt: null,
  lastErrorCode: null,
  leadsThisMonth: 1,
  acceptedThisMonth: 0,
  linkedAutoPost: null,
};

const ok = (body) => ({
  ok: true,
  status: 200,
  json: async () => body,
  clone() {
    return this;
  },
});

const serve = () => {
  let taken = false;
  global.fetch = async (url, init = {}) => {
    const method = String(init.method || 'GET').toUpperCase();
    if (method === 'GET' && url === '/content-intelligence/leads/subscriptions') {
      return ok({ subscriptions: [SUBSCRIPTION], capabilities: { feedCheck: true, topicCheck: true } });
    }
    if (method === 'GET' && url === '/content-intelligence/leads/queue?status=NEW') {
      return ok({ leads: taken ? [] : [LEAD] });
    }
    if (method === 'POST' && url === '/content-intelligence/leads/lead-1/accept') {
      taken = true;
      return ok({ ...LEAD, status: 'ACCEPTED' });
    }
    throw new Error(`no stub for ${method} ${url}`);
  };
};

const renderTab = async (props) => {
  await act(async () => {
    render(
      React.createElement(
        SWRConfig,
        { value: { provider: () => new Map(), dedupingInterval: 0 } },
        React.createElement(
          userContext.UserContext.Provider,
          { value: { role: 'EDITOR' } },
          React.createElement(
            variables.VariableContextComponent,
            { language: 'ru' },
            React.createElement(leads.ContentLeadsTab, props)
          )
        )
      )
    );
  });
  await act(async () => {});
};

const take = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Взять в работу' }));
  });
  await act(async () => {});
};

afterEach(() => {
  cleanup();
  delete global.fetch;
});

describe('review W4-23 F1 — «Взять в работу» beside the chat', () => {
  test('the taken lead goes to the chat, and the notice says where it is', async () => {
    serve();
    const handed = [];
    await renderTab({ takenTo: 'chat', onNavigateToBrief: (lead) => handed.push(lead.title) });

    await take();

    expect(handed).toEqual(['Созвоны без повестки']);
    expect(document.body.textContent).toContain('в поле чата');
    expect(document.body.textContent).not.toContain('Открываем «Новую заготовку»');
  });

  test('without a handler the notice claims nothing it does not do', async () => {
    serve();
    await renderTab({});

    await take();

    expect(document.body.textContent).toContain('«Созвоны без повестки» взято в работу.');
    expect(document.body.textContent).not.toContain('Открываем');
    expect(document.body.textContent).not.toContain('в поле чата');
  });

  test('the composer gets a request in both languages, and the screen only fills it', () => {
    expect(agentCopy.ru.panel.writeFromLead('Созвоны')).toBe('Напиши заготовку по взятому поводу «Созвоны»');
    expect(agentCopy.en.panel.writeFromLead('Calls')).toBe('Write a piece from the taken lead “Calls”');
    const screenSource = fs.readFileSync(
      path.join(root, 'apps/frontend/src/components/agents/agent.screen.tsx'),
      'utf8'
    );
    // Into the draft the composer shows, as «Сделать в чате» — not `setStarter`, which sends.
    expect(screenSource).toMatch(/setDraft\(words\.panel\.writeFromLead\(/);
    const panelSource = fs.readFileSync(
      path.join(root, 'apps/frontend/src/components/agents/agent.panel.tsx'),
      'utf8'
    );
    expect(panelSource).toMatch(/<ContentLeadsTab takenTo="chat" onNavigateToBrief=/);
  });
});
