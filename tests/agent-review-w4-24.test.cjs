'use strict';

/**
 * The correctness review of kcxz.24 — facts, own texts, the cliché check,
 * analytics and help in the chat
 * (`.codex/stages/content-factory-next-kcxz/evidence/correctness-review-w4-24.md`).
 * Behaviour, not source text:
 * - F3: the shared analytics step, with and without refreshing — the page's
 *   call unchanged, the chat's call never touching the channel;
 * - F1: «Снять» and «Вернуть» through `ContentFactService`, the step both
 *   the screen and the chat call;
 * - F11: the facts counter and the re-read hook beside the chat.
 *
 * Elsewhere: scenarios `fact-retract-superseded` (F1), `fact-add-known`
 * (F2, F4), `fact-list-add` (F2, F4), `analytics-channel-refusals` (F3, F8),
 * `text-related-slop-check` (F9); `content-fact-copy-guard.test.cjs` (F1,
 * the repository). No paid or live calls.
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

const { act, cleanup, render, waitFor } = require('@testing-library/react');
const { SWRConfig } = require('swr');
const useSWR = require('swr').default;
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');
const { loadTypeScriptModule: loadServerModule } = require('./helpers/load-ts-module.cjs');
const { loadIntegrationService } = require('./helpers/integration-service.module.cjs');

const h = React.createElement;

afterEach(() => cleanup());

/* ---- F3: the analytics step, refreshing or not --------------------------- */

describe('F3: the chat’s analytics read never changes the channel', () => {
  class RefreshToken extends Error {}
  const { IntegrationService, AnalyticsReadRefusal } = loadIntegrationService({
    '@contentfactory/nestjs-libraries/redis/redis.service': {
      ioRedis: { get: async () => null, set: async () => 'OK' },
    },
    '@contentfactory/nestjs-libraries/integrations/social.abstract': { RefreshToken },
    '@contentfactory/helpers/utils/timer': { timer: async () => undefined },
  });

  const METRICS = [{ label: 'Reactions', data: [{ total: 3, date: '2026-09-27' }] }];

  /** A channel, a platform answering `answers` in turn, and what was done. */
  const stand = ({ tokenExpiration = '2099-01-01T00:00:00.000Z', answers = [METRICS], refreshed = { accessToken: 'new' } } = {}) => {
    const done = [];
    const queue = answers.slice();
    const service = new IntegrationService(
      {
        getIntegrationById: async (org, id) => ({
          id,
          organizationId: org,
          type: 'social',
          providerIdentifier: 'telegram',
          internalId: 'internal-1',
          token: 'old',
          tokenExpiration,
        }),
        disconnectChannel: async (org, id) => done.push(['disconnect', id]),
      },
      {},
      {
        getSocialIntegration: () => ({
          analytics: async (internalId, token) => {
            done.push(['platform', token]);
            const next = queue.length > 1 ? queue.shift() : queue[0];
            if (next instanceof Error) throw next;
            return next;
          },
        }),
      },
      { inAppNotification: async () => done.push(['notify']) },
      {
        refresh: async () => {
          done.push(['refresh']);
          return refreshed;
        },
      },
      {},
      { merge: async (id, days, live) => live }
    );
    return { service, done };
  };

  const org = { id: 'org-1' };

  test('the page’s call is unchanged: an expired token is refreshed first', async () => {
    const { service, done } = stand({ tokenExpiration: '2020-01-01T00:00:00.000Z' });
    await expect(service.checkAnalytics(org, 'c1', '7')).resolves.toEqual(METRICS);
    expect(done).toEqual([['refresh'], ['platform', 'new']]);
  });

  test('the page’s call still reads a failed platform as no data', async () => {
    const { service } = stand({ answers: [new Error('timeout')] });
    await expect(service.checkAnalytics(org, 'c1', '7')).resolves.toEqual([]);
  });

  test('without refreshing, an expired token is refused before the platform is asked', async () => {
    const { service, done } = stand({ tokenExpiration: '2020-01-01T00:00:00.000Z' });
    const refused = await service
      .checkAnalytics(org, 'c1', '7', false, { mayRefresh: false })
      .catch((error) => error);
    expect(refused).toBeInstanceOf(AnalyticsReadRefusal);
    expect(refused.code).toBe('ANALYTICS_CHANNEL_NEEDS_RECONNECT');
    expect(done).toEqual([]);
  });

  test('without refreshing, «refresh me» from the platform is one request and the same refusal', async () => {
    const { service, done } = stand({ answers: [new RefreshToken('expired')] });
    await expect(service.checkAnalytics(org, 'c1', '7', false, { mayRefresh: false })).rejects.toMatchObject({
      code: 'ANALYTICS_CHANNEL_NEEDS_RECONNECT',
    });
    expect(done).toEqual([['platform', 'old']]);
  });

  test('without refreshing, a failed platform is ANALYTICS_UNAVAILABLE, not an empty answer', async () => {
    const { service, done } = stand({ answers: [new Error('timeout')] });
    await expect(service.checkAnalytics(org, 'c1', '7', false, { mayRefresh: false })).rejects.toMatchObject({
      code: 'ANALYTICS_UNAVAILABLE',
    });
    expect(done).toEqual([['platform', 'old']]);
  });

  test('without refreshing, a live token reads as before', async () => {
    const { service } = stand();
    await expect(service.checkAnalytics(org, 'c1', '7', false, { mayRefresh: false })).resolves.toEqual(METRICS);
  });
});

/* ---- F1: through the service the screen and the chat both call ---------- */

describe('F1: a superseded fact is neither retracted nor restored, by the service', () => {
  const CONTEXT = 'libraries/nestjs-libraries/src/content-intelligence/context';
  const mocks = {
    '@nestjs/common': { Injectable: () => (target) => target, Inject: () => () => undefined, Optional: () => () => undefined },
    '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
      PrismaRepository: class {},
      PrismaTransaction: class {},
    },
  };
  const { ContentFactService } = loadServerModule(`${CONTEXT}/content-fact.service.ts`, mocks);
  const { ContentFactRepository } = loadServerModule(`${CONTEXT}/content-fact.repository.ts`, mocks);

  const serviceOver = (rows) => {
    const matches = (row, where) =>
      Object.entries(where).every(([key, want]) =>
        want && typeof want === 'object' ? row[key] !== want.not : (row[key] ?? null) === want
      );
    const client = {
      contentFact: {
        findFirst: async ({ where }) => {
          const row = rows.find((one) => matches(one, where));
          return row ? { ...row, evidenceLinks: [] } : null;
        },
        updateMany: async ({ where, data }) => {
          const found = rows.filter((one) => matches(one, where));
          for (const row of found) Object.assign(row, data);
          return { count: found.length };
        },
      },
    };
    return new ContentFactService(
      new ContentFactRepository({ model: client }, { model: { $transaction: async (work) => work(client) } })
    );
  };

  test('«Снять» on a superseded fact is refused and writes nothing', async () => {
    const rows = [{ id: 'old', organizationId: 'org-1', status: 'SUPERSEDED' }];
    await expect(serviceOver(rows).retractFact('org-1', 'user-1', 'old')).rejects.toMatchObject({
      code: 'CONTENT_CONTEXT_FACT_SUPERSEDED',
    });
    expect(rows[0].status).toBe('SUPERSEDED');
  });

  test('«Вернуть» refuses a retracted fact whose correction exists', async () => {
    const rows = [
      { id: 'old', organizationId: 'org-1', status: 'RETRACTED' },
      { id: 'copy', organizationId: 'org-1', status: 'VERIFIED', supersedesFactId: 'old' },
    ];
    await expect(serviceOver(rows).restoreFact('org-1', 'user-1', 'old')).rejects.toMatchObject({
      code: 'CONTENT_CONTEXT_FACT_SUPERSEDED',
    });
    expect(rows[0].status).toBe('RETRACTED');
  });

  test('«Вернуть» still brings back a retracted fact without a correction', async () => {
    const rows = [{ id: 'mine', organizationId: 'org-1', status: 'RETRACTED', verifiedAt: null }];
    const back = await serviceOver(rows).restoreFact('org-1', 'user-1', 'mine');
    expect(back.status).toBe('VERIFIED');
  });
});

/* ---- F11: the facts counter and the re-read hook ------------------------ */

describe('F11: «Откуда факты» beside the chat reads again when a fact action finishes', () => {
  const contract = loadTypeScriptModule('apps/frontend/src/components/agents/agent.contract.ts');
  const { useRevalidateWhenCountGrows } = loadTypeScriptModule('apps/frontend/src/components/agents/agent.revalidate.ts');

  const done = (toolName, output = { ok: true }) => ({
    type: `tool-${toolName}`,
    toolCallId: `call-${toolName}`,
    state: 'output-available',
    input: {},
    output,
  });
  const message = (parts) => ({ id: 'm', role: 'assistant', parts });

  test('adds, retractions and restores count; reads and refusals do not', () => {
    expect(
      contract.factCallsOf([
        message([
          done('facts_list'),
          done('facts_add'),
          done('facts_retract'),
          done('facts_restore'),
          done('facts_add', { ok: false, code: 'FACT_DATE_PAST' }),
          done('ideas_add'),
        ]),
      ])
    ).toBe(3);
    expect(contract.factCallsOf([])).toBe(0);
  });

  const FACTS = '/content-intelligence/facts';

  const stand = () => {
    const reads = { [FACTS]: 0, '/integrations/list': 0 };
    const answers = { [FACTS]: 'first' };
    let setCount;
    const Facts = () => {
      const { data } = useSWR(FACTS, () => {
        reads[FACTS] += 1;
        return Promise.resolve(answers[FACTS]);
      }, { dedupingInterval: 0 });
      useSWR('/integrations/list', () => {
        reads['/integrations/list'] += 1;
        return Promise.resolve('channels');
      }, { dedupingInterval: 0 });
      return h('p', { 'data-shown': data ?? 'none' }, data ?? 'none');
    };
    const Chat = () => {
      const [count, set] = React.useState(2);
      setCount = set;
      useRevalidateWhenCountGrows(count, FACTS);
      return h(Facts);
    };
    render(h(SWRConfig, { value: { provider: () => new Map() } }, h(Chat)));
    return {
      reads,
      answers,
      shown: () => document.querySelector('[data-shown]').getAttribute('data-shown'),
      count: (value) => act(async () => setCount(value)),
    };
  };

  test('the count the thread loaded with is only remembered; a new action re-reads the facts only', async () => {
    const screen = stand();
    await waitFor(() => expect(screen.shown()).toBe('first'));
    expect(screen.reads).toEqual({ [FACTS]: 1, '/integrations/list': 1 });

    screen.answers[FACTS] = 'second';
    await screen.count(3);
    await waitFor(() => expect(screen.shown()).toBe('second'));
    expect(screen.reads).toEqual({ [FACTS]: 2, '/integrations/list': 1 });

    // The same count again reads nothing.
    await screen.count(3);
    expect(screen.reads[FACTS]).toBe(2);
  });
});
