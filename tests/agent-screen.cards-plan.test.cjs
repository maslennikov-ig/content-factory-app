'use strict';

/**
 * The agent's plan slot card (`content-factory-next-kcxz.16`, spec §6.2,
 * canvas C `_c_slot`): the channel, the local time, the state in words, and
 * the page's way back — «Отменить бронь» through the post-settings door with
 * the page's own payload, «Снять с расписания» through the unschedule door.
 * Also: the thread history asks with the browser's zone, as the chat does.
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

const { act, cleanup, fireEvent, render, waitFor, within } = require('@testing-library/react');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');

const root = path.resolve(__dirname, '..');
const source = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const h = React.createElement;

const copy = loadTypeScriptModule('apps/frontend/src/components/agents/agent.copy.ts');
const pieces = loadTypeScriptModule(
  'apps/frontend/src/components/content-intelligence/pieces/pieces.copy.ts'
).piecesCopy;
const adapter = loadTypeScriptModule(
  'apps/frontend/src/components/content-intelligence/pieces/pieces.adapter.ts'
);
const cell = loadTypeScriptModule(
  'apps/frontend/src/components/content-intelligence/pieces/adaptation.cell.tsx'
);
const ru = copy.agentCopy.ru;
const en = copy.agentCopy.en;

afterEach(cleanup);

const AT = '2026-10-02T16:30:00.000Z';
const plan = (state, extra = {}) => ({
  kind: 'plan',
  id: 'a1',
  title: null,
  code: null,
  data: {
    kind: 'plan',
    id: 'a1',
    pieceId: 'p1',
    channel: { id: 'c1', name: 'AiDevTeam', provider: 'telegram' },
    at: AT,
    state,
    ...extra,
  },
});

const setup = ({ ok = true, body = {}, pieces: loaded = {} } = {}) => {
  const calls = [];
  const mutated = [];
  const reads = [];
  const cards = loadWithMocks('apps/frontend/src/components/agents/agent.plan-card.tsx', {
    react: React,
    swr: {
      __esModule: true,
      // The piece as the page's key holds it (kcxz.34, F1); `loaded` is keyed
      // by that key and read on every render, so a test can change it.
      default: (key, _fetcher, options) => {
        reads.push([key, options]);
        return { data: key ? loaded[key] : undefined };
      },
      useSWRConfig: () => ({ mutate: (key) => mutated.push(key) }),
    },
    '@contentfactory/helpers/utils/custom.fetch': {
      useFetch: () => async (url, init) => {
        calls.push([url, init]);
        return { ok, json: async () => body };
      },
    },
    'next/link': {
      __esModule: true,
      default: ({ href, prefetch: _prefetch, children, ...rest }) => h('a', { href, ...rest }, children),
    },
  });
  return { cards, calls, mutated, reads };
};

const renderPlan = async (artifact, options) => {
  const env = setup(options);
  const draw = () => h(env.cards.PlanCard, { artifact, open: false, onOpen: () => {}, words: ru });
  let view;
  await act(async () => {
    view = render(draw());
  });
  await waitFor(() => expect(document.querySelector('[data-agent-card="plan"]')).not.toBeNull());
  const redraw = async () => {
    await act(async () => {
      view.rerender(draw());
    });
  };
  return { ...env, redraw, card: document.querySelector('[data-agent-card="plan"]') };
};

/** The piece door's answer with one adaptation `a1`, read by the page's reader. */
const pieceWith = (adaptation) =>
  adapter.readPieceDetail({
    piece: { id: 'p1', code: 'cnt-1', title: 'Пост' },
    adaptations: [
      {
        id: 'a1',
        pieceId: 'p1',
        kind: 'post',
        platform: 'telegram',
        integrationId: 'c1',
        integrationName: 'AiDevTeam',
        createdAt: '2026-09-27T10:00:00.000Z',
        ...adaptation,
      },
    ],
  });

describe('the plan slot card', () => {
  test('a reservation: channel, local time as the page writes it, «В плане», «Отменить бронь»', async () => {
    const { card } = await renderPlan(plan('reserve'));
    const moment = cell.cellDate('draft', AT, true);
    expect(card.textContent).toContain('AiDevTeam');
    expect(card.textContent).toContain(moment);
    expect(card.querySelector('[data-agent-plan-state]').textContent).toBe('В плане');
    expect(card.textContent).toContain(ru.plan.reserveNote);
    expect(within(card).getByRole('button', { name: 'Отменить бронь' })).toBeTruthy();
    expect(within(card).queryByRole('button', { name: pieces.ru.unschedule })).toBeNull();
    expect(within(card).getByRole('link', { name: /Открыть на экране/ }).getAttribute('href')).toBe(
      `/content/pieces/p1?tab=c1&when=${encodeURIComponent(AT)}`
    );
  });

  test('«Отменить бронь» goes through the page’s post-settings door with the page’s payload', async () => {
    const { card, calls, mutated } = await renderPlan(plan('reserve'));
    await act(async () => fireEvent.click(within(card).getByRole('button', { name: 'Отменить бронь' })));
    // kcxz.32 N4: the page's «Снять из плана» — back to «как в канале» when
    // the channel keeps it a draft, else its own «Без плана» (decided under
    // the channel lock), never a bare pinned draft.
    expect(adapter.DROP_RESERVE).toEqual({ planMode: null, expectedChannelMode: 'draft' });
    expect(calls).toEqual([
      [
        adapter.PIECES_API.postSettings('p1', 'c1'),
        { method: 'PUT', body: JSON.stringify(adapter.buildPostSettingsPayload(adapter.DROP_RESERVE)) },
      ],
    ]);
    expect(JSON.parse(calls[0][1].body)).toEqual({ planMode: null, expectedChannelMode: 'draft' });
    expect(mutated).toEqual([adapter.PIECES_API.detail('p1')]);
    expect(card.querySelector('[data-agent-plan-state]').textContent).toBe(pieces.ru.planRowDraft);
    expect(card.textContent).toContain(ru.plan.cancelled);
  });

  test('a queued post: «В очереди · выйдет сама» and «Снять с расписания» through the unschedule door', async () => {
    const { card, calls } = await renderPlan(plan('scheduled'));
    expect(card.querySelector('[data-agent-plan-state]').textContent).toBe('В очереди · выйдет сама');
    expect(card.textContent).toContain(cell.cellDate('queued', AT));
    await act(async () =>
      fireEvent.click(within(card).getByRole('button', { name: pieces.ru.unschedule }))
    );
    expect(calls).toEqual([[adapter.PIECES_API.unschedule('p1', 'a1'), { method: 'POST' }]]);
    expect(card.textContent).toContain(pieces.ru.unscheduledDone);
  });

  test('a refusal says the door’s words and keeps the state', async () => {
    const { card } = await renderPlan(plan('scheduled'), { ok: false, body: {} });
    await act(async () =>
      fireEvent.click(within(card).getByRole('button', { name: pieces.ru.unschedule }))
    );
    expect(within(card).getByRole('alert').textContent).toBe(pieces.ru.scheduleFailed);
    expect(card.querySelector('[data-agent-plan-state]').textContent).toBe('В очереди · выйдет сама');
  });

  test('a draft and a published post have no action; words in both languages', async () => {
    const { card } = await renderPlan(plan('published'));
    expect(card.querySelector('[data-agent-plan-state]').textContent).toBe('Опубликовано');
    expect(within(card).queryByRole('button', { name: /Отменить бронь|Снять с расписания/ })).toBeNull();
    expect(ru.plan.states.draft).toBe(pieces.ru.planRowDraft);
    expect(en.plan.states).toEqual({
      reserve: 'In the plan',
      scheduled: 'Queued · goes out by itself',
      draft: pieces.en.planRowDraft,
      published: 'Published',
      // Sent and did not go out: the piece page's word (review W2 F14).
      error: 'Did not go out',
    });
    expect(en.plan.unschedule).toBe(pieces.en.unschedule);
  });

  test('the conversation draws a plan as this card, and the panel opens its channel tab at its time', () => {
    const conversation = source('apps/frontend/src/components/agents/agent.conversation.tsx');
    expect(conversation).toMatch(/block\.artifact\.kind === 'plan' && !block\.removed\)\s*\{\s*return \(\s*<PlanCard/);
    const panel = source('apps/frontend/src/components/agents/agent.panel.tsx');
    expect(panel).toContain("artifact.kind === 'adaptation' || artifact.kind === 'plan'");
    expect(panel).toContain('initialWhen: when');
  });
});

describe('the plan card says where the post stands now (kcxz.34, F1)', () => {
  const KEY = adapter.PIECES_API.detail('p1');
  const MOVED = '2026-10-01T09:00:00.000Z';

  test('it reads the piece through the page’s key, once, without reading again on focus', async () => {
    const { reads } = await renderPlan(plan('scheduled'));
    expect(reads[0][0]).toBe(KEY);
    expect(reads[0][1]).toEqual({ revalidateOnFocus: false, revalidateOnReconnect: false });
  });

  test('a queued card whose post was taken off the queue: a draft, no «Снять с расписания»', async () => {
    const { card } = await renderPlan(plan('scheduled'), {
      pieces: { [KEY]: pieceWith({ state: 'draft', date: MOVED, plan: { status: 'draft', date: MOVED } }) },
    });
    expect(card.querySelector('[data-agent-plan-state]').textContent).toBe(pieces.ru.planRowDraft);
    expect(card.textContent).not.toContain('выйдет сама');
    expect(within(card).queryByRole('button', { name: pieces.ru.unschedule })).toBeNull();
  });

  test('a cancelled reserve: no «Отменить бронь», no reserve note', async () => {
    const { card } = await renderPlan(plan('reserve'), {
      pieces: { [KEY]: pieceWith({ state: 'draft', date: AT, plan: { status: 'draft', date: AT } }) },
    });
    expect(card.querySelector('[data-agent-plan-state]').textContent).toBe(pieces.ru.planRowDraft);
    expect(within(card).queryByRole('button', { name: 'Отменить бронь' })).toBeNull();
    expect(card.textContent).not.toContain(ru.plan.reserveNote);
  });

  test('a post moved elsewhere shows its new time; still queued, still its way back', async () => {
    const { card } = await renderPlan(plan('scheduled'), {
      pieces: { [KEY]: pieceWith({ state: 'queued', date: MOVED, plan: { status: 'queued', date: MOVED } }) },
    });
    expect(card.textContent).toContain(cell.cellDate('queued', MOVED));
    expect(card.textContent).not.toContain(cell.cellDate('queued', AT));
    expect(within(card).getByRole('button', { name: pieces.ru.unschedule })).toBeTruthy();
  });

  test('a draft card whose post is queued now offers «Снять с расписания»', async () => {
    const { card } = await renderPlan(plan('draft'), {
      pieces: { [KEY]: pieceWith({ state: 'queued', date: AT, plan: { status: 'queued', date: AT } }) },
    });
    expect(card.querySelector('[data-agent-plan-state]').textContent).toBe('В очереди · выйдет сама');
    expect(within(card).getByRole('button', { name: pieces.ru.unschedule })).toBeTruthy();
  });

  test('the piece has no such post any more: no way back is offered', async () => {
    const piece = pieceWith({ state: 'queued', date: AT });
    const { card } = await renderPlan(plan('scheduled'), {
      pieces: { [KEY]: { ...piece, adaptations: [] } },
    });
    expect(within(card).queryByRole('button', { name: pieces.ru.unschedule })).toBeNull();
  });

  test('after its own action the card says «draft» until the piece is read again, then the piece', async () => {
    const loaded = { [KEY]: pieceWith({ state: 'queued', date: AT, plan: { status: 'queued', date: AT } }) };
    const { card, mutated, redraw } = await renderPlan(plan('scheduled'), { pieces: loaded });
    await act(async () =>
      fireEvent.click(within(card).getByRole('button', { name: pieces.ru.unschedule }))
    );
    expect(mutated).toEqual([KEY]);
    // The key still holds the old piece: the card's own answer stands.
    expect(card.querySelector('[data-agent-plan-state]').textContent).toBe(pieces.ru.planRowDraft);
    loaded[KEY] = pieceWith({ state: 'draft', date: AT, plan: { status: 'draft', date: AT } });
    await redraw();
    expect(card.querySelector('[data-agent-plan-state]').textContent).toBe(pieces.ru.planRowDraft);
    expect(within(card).queryByRole('button', { name: pieces.ru.unschedule })).toBeNull();
  });

  test('a refusal reads the piece again too, so a stale card corrects itself', async () => {
    const { card, mutated } = await renderPlan(plan('scheduled'), {
      ok: false,
      body: { code: 'ADAPTATION_NOT_QUEUED' },
    });
    await act(async () =>
      fireEvent.click(within(card).getByRole('button', { name: pieces.ru.unschedule }))
    );
    expect(mutated).toEqual([KEY]);
  });

  test('the live reader words a slot as the server does', () => {
    const data = loadWithMocks('apps/frontend/src/components/agents/agent.piece-data.ts', {
      react: React,
      swr: { __esModule: true, default: () => ({}) },
      '@contentfactory/helpers/utils/custom.fetch': { useFetch: () => async () => ({}) },
    });
    const slot = (adaptation) => data.livePlanSlot(pieceWith(adaptation), 'a1');
    expect(slot({ state: 'published', date: AT })).toEqual({ state: 'published', at: AT });
    expect(slot({ state: 'queued', date: AT })).toEqual({ state: 'scheduled', at: AT });
    expect(slot({ state: 'error', date: AT })).toEqual({ state: 'error', at: AT });
    expect(slot({ state: 'draft', date: AT, plan: { status: 'reserved', date: MOVED } })).toEqual({
      state: 'reserve',
      at: MOVED,
    });
    expect(slot({ state: 'draft', date: null })).toEqual({ state: 'draft', at: null });
    expect(data.livePlanSlot({ ...pieceWith({ state: 'draft' }), adaptations: [] }, 'a1')).toBeNull();
  });
});

describe('kcxz.38 — a post that is gone, and a draft’s date', () => {
  const KEY = adapter.PIECES_API.detail('p1');
  const MOVED = '2026-10-01T12:00:00.000Z';

  test('P3-3: the piece has no such post any more — «Этого поста больше нет», no stored state, no time, no action', async () => {
    const piece = pieceWith({ state: 'queued', date: AT });
    const { card } = await renderPlan(plan('scheduled'), {
      pieces: { [KEY]: { ...piece, adaptations: [] } },
    });
    const state = card.querySelector('[data-agent-plan-state]');
    expect(state.getAttribute('data-agent-plan-state')).toBe('gone');
    expect(state.textContent).toBe('Этого поста больше нет');
    expect(card.textContent).not.toContain('В очереди');
    expect(card.textContent).not.toContain(cell.cellDate('queued', AT));
    expect(card.textContent).not.toContain(ru.plan.when);
    expect(card.getAttribute('aria-label')).toBe('В плане: AiDevTeam — Этого поста больше нет');
    expect(within(card).queryAllByRole('button')).toHaveLength(0);
    expect(within(card).queryAllByRole('link')).toHaveLength(0);
    expect(card.querySelector('footer')).toBeNull();
  });

  test('P3-3: a reserve that is gone has no reserve note either', async () => {
    const piece = pieceWith({ state: 'draft' });
    const { card } = await renderPlan(plan('reserve'), {
      pieces: { [KEY]: { ...piece, adaptations: [] } },
    });
    expect(card.querySelector('[data-agent-plan-state]').textContent).toBe(ru.plan.gone);
    expect(card.textContent).not.toContain(ru.plan.reserveNote);
    expect(within(card).queryByRole('button', { name: 'Отменить бронь' })).toBeNull();
  });

  test('until the piece is read, the stored slot stands (nothing is called gone)', async () => {
    const { card } = await renderPlan(plan('scheduled'));
    expect(card.querySelector('[data-agent-plan-state]').getAttribute('data-agent-plan-state')).toBe('scheduled');
  });

  test('a draft with a date reads it as the draft’s date, not a time it goes out', async () => {
    const { card } = await renderPlan(plan('reserve'), {
      pieces: { [KEY]: pieceWith({ state: 'draft', date: MOVED, plan: { status: 'draft', date: MOVED } }) },
    });
    const moment = cell.cellDate('draft', MOVED, true);
    expect(card.querySelector('[data-agent-plan-state]').textContent).toBe(pieces.ru.planRowDraft);
    expect(within(card).getByText(`Дата ${moment}`)).toBeTruthy();
    const facts = [...card.querySelectorAll('dt')].map((node) => node.textContent);
    expect(facts).toEqual([ru.plan.channel, 'Дата']);
    expect(card.getAttribute('aria-label')).toBe(`В плане: AiDevTeam, Дата ${moment} — Черновик`);
    expect(card.textContent).not.toContain('выйдет');
  });

  test('a draft without a date shows no time row; other states keep «Время»', async () => {
    const { card } = await renderPlan(plan('draft', { at: null }));
    expect([...card.querySelectorAll('dt')].map((node) => node.textContent)).toEqual([ru.plan.channel]);
    cleanup();
    const queued = await renderPlan(plan('scheduled'));
    expect([...queued.card.querySelectorAll('dt')].map((node) => node.textContent)).toEqual([
      ru.plan.channel,
      ru.plan.when,
    ]);
  });

  test('the words in both languages', () => {
    expect(ru.plan.gone).toBe('Этого поста больше нет');
    expect(en.plan.gone).toBe('This post is no longer there');
    expect(ru.plan.draftWhen).toBe('Дата');
    expect(en.plan.draftWhen).toBe('Date');
    expect(ru.plan.draftMoment('01.10 15:00')).toBe('Дата 01.10 15:00');
    expect(en.plan.draftMoment('01.10 15:00')).toBe('Dated 01.10 15:00');
  });
});

describe('the thread history asks in the browser’s zone', () => {
  test('the history request carries the zone header the chat door gets', () => {
    const screen = source('apps/frontend/src/components/agents/agent.screen.tsx');
    expect(screen).toMatch(/const zone = screenTimeZone\(\);\s*const response = await request\(url, zone \? \{ headers: \{ \[AGENT_TIMEZONE_HEADER\]: zone \} \} : \{\}\);/);
  });
});
