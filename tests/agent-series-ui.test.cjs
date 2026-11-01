'use strict';
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
for (const key of ['window', 'document', 'navigator']) Object.defineProperty(global, key, { configurable: true, value: key === 'window' ? dom.window : dom.window[key] });
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { render, cleanup, fireEvent, screen, within } = require('@testing-library/react');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');
const { groupSeriesBlocks, seriesQualityReview } = loadTypeScriptModule('apps/frontend/src/components/agents/agent.series.ts');
const { SeriesCard } = loadTypeScriptModule('apps/frontend/src/components/agents/agent.series-card.tsx');
const baseWords = loadTypeScriptModule('apps/frontend/src/components/agents/agent.copy.ts').agentCopy.ru;
const words = baseWords;
const part = (i, overrides = {}) => ({ type: 'artifact', key: `part-${i}`, removed: false, artifact: { kind: 'adaptation', id: `a${i}`, title: null, code: null, data: { pieceId: 'p', channel: { id: 'c', name: 'Канал' }, series: { id: 's', index: i, total: 3 }, ...overrides } } });
const groups = blocks => groupSeriesBlocks(blocks.map(b => [b]));
afterEach(cleanup);
test('groups by native series, material and channel, sorts native index and leaves interleaved events alone', () => {
  const text = { type: 'text', key: 'text', text: 'other' };
  const unrelated = part(2, { series: { id: 's', index: 2, total: 3 }, pieceId: 'another' });
  const channel = part(3, { channel: { id: 'other', name: 'Other' } });
  const plain = part(4, { series: undefined });
  const grouped = groups([part(2), text, unrelated, channel, plain, part(1), part(3)]);
  expect(grouped).toHaveLength(5);
  expect(grouped[0].type).toBe('series');
  expect(grouped[0].members.map(b => b.artifact.data.series.index)).toEqual([1, 2, 3]);
  expect(grouped[1].blocks[0]).toBe(text);
  expect(grouped[2].members[0]).toBe(unrelated);
  expect(grouped[3].members[0]).toBe(channel);
  expect(grouped[4].blocks[0]).toBe(plain);
});
test('partial streams keep stable group identity and reject incomplete or invalid identity', () => {
  const first = groups([part(2)])[0], next = groups([part(2), part(1)])[0];
  expect(first.key).toBe(next.key);
  expect(groups([part(2, { pieceId: null }), part(2, { channel: null }), part(2, { series: { id: 's', index: 0, total: 3 } }), part(1, { series: { id: 'single', index: 1, total: 1 } })]).every(g => g.type === 'blocks')).toBe(true);
});
test('series starts collapsed, opens individual member, keeps expansion while streaming and marks open member', () => {
  const onOpen = jest.fn(), members = [part(2), part(3)];
  const ui = (list, openArtifact = null) => React.createElement(SeriesCard, { members: list, openArtifact, onOpen, words });
  const { rerender, unmount } = render(ui(members));
  const trigger = screen.getByRole('button', { expanded: false });
  expect(trigger.textContent).toContain('Канал');
  fireEvent.click(trigger);
  expect(screen.getByRole('button', { expanded: true })).toBeTruthy();
  rerender(ui([part(1), ...members]));
  expect(screen.getByRole('button', { expanded: true })).toBeTruthy();
  const region = screen.getByRole('region');
  const buttons = within(region).getAllByRole('button', { name: /Открыть/ });
  fireEvent.click(buttons[0]);
  expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1' }));
  rerender(ui([part(1), ...members], part(1).artifact));
  expect(region.textContent).toContain(words.card.openedBeside);
  unmount();
  render(ui([part(1), ...members]));
  expect(screen.getByRole('button', { expanded: false })).toBeTruthy();
});
test('uses each loaded saved first line literally, without inventing a title or fetching', () => {
  const { SWRConfig } = require('swr');
  const { PIECES_API } = loadTypeScriptModule('apps/frontend/src/components/content-intelligence/pieces/pieces.adapter.ts');
  const rows = [{ id: 'a1', body: 'Первый факт\nПродолжение', platform: 'telegram', state: 'draft', createdAt: '2026-01-01T00:00:00.000Z' }, { id: 'a2', body: 'Второй факт\nПродолжение', platform: 'telegram', state: 'draft', createdAt: '2026-01-01T00:00:00.000Z' }];
  const fallback = { [PIECES_API.detail('p')]: { adaptations: rows, targets: [] } };
  render(React.createElement(SWRConfig, { value: { provider: () => new Map(), fallback } },
    React.createElement(SeriesCard, { members: [part(1), part(2)], openArtifact: null, onOpen: jest.fn(), words })));
  fireEvent.click(screen.getByRole('button', { expanded: false }));
  expect(screen.getByText(/Первый факт/)).toBeTruthy();
  expect(screen.getByText(/Второй факт/)).toBeTruthy();
  expect(screen.queryByText(/Продолжение/)).toBeNull();
  expect(screen.getAllByText('Канал')).toHaveLength(1);
});
test('the latest response can expose every member immediately, preserving exact artifact-opening actions', () => {
  const onOpen = jest.fn();
  render(React.createElement(SeriesCard, { members: [part(1), part(2), part(3)], openArtifact: null, onOpen, words, defaultOpen: true }));
  const region = screen.getByRole('region');
  const links = within(region).getAllByRole('button', { name: /Открыть/ });
  expect(links).toHaveLength(3);
  links.forEach(button => fireEvent.click(button));
  expect(onOpen.mock.calls.map(([artifact]) => artifact.id)).toEqual(['a1', 'a2', 'a3']);
});
test('twelve persisted native artifact events remain distinct after a history reload', () => {
  const { readMessageBlocks } = loadTypeScriptModule('apps/frontend/src/components/agents/agent.contract.ts');
  const native = index => ({ type: 'data-adaptation', data: { id: `saved-${index}`, pieceId: 'p', channel: { id: 'c', name: 'Канал' }, series: { id: 'persisted', index, total: 12 } } });
  const message = { id: 'message', role: 'assistant', parts: [...Array.from({ length: 11 }, (_, i) => native(i + 2)), native(1)] };
  const saved = JSON.parse(JSON.stringify(message));
  const result = groups(readMessageBlocks(saved));
  expect(result).toHaveLength(1);
  expect(result[0].members.map(row => row.artifact.id)).toEqual(Array.from({ length: 12 }, (_, i) => `saved-${i + 1}`));
});

const reviewData = (missingRequirements, unsupportedClaims = [], status = 'partial') => ({
  qualityReview: { untrustedData: { sources: ['workspace-text'], value: { status, missingRequirements, unsupportedClaims } } },
});
test('one collection-wide review is shown after all member rows, not as a verdict on its first carrier', () => {
  const list = [part(1, reviewData(['В первом посте два вопроса', 'Замечание о третьем посте'])), part(2), part(3)];
  render(React.createElement(SeriesCard, { members: list, openArtifact: null, onOpen: jest.fn(), words, defaultOpen: true }));
  expect(screen.queryByRole('button', { name: words.card.qualityReview.summary })).toBeNull();
  const trigger = screen.getByRole('button', { name: words.card.qualityReview.seriesSummary, expanded: false });
  expect(document.querySelectorAll('[data-agent-artifact="adaptation"]')).toHaveLength(3);
  for (const row of document.querySelectorAll('[data-agent-artifact="adaptation"]')) expect(row.contains(trigger)).toBe(false);
  fireEvent.click(trigger);
  expect(screen.getByText(words.card.qualityReview.seriesSaved)).toBeTruthy();
  expect(screen.getByText('В первом посте два вопроса')).toBeTruthy();
  expect(screen.getByText('Замечание о третьем посте')).toBeTruthy();
});
test('series notes retain distinct findings, deduplicate repeats, reject untrusted shape/other identities and never imply a pass', () => {
  const first = part(1, reviewData(['Original note'], ['Source gap']));
  const repeat = part(2, reviewData(['Original note', 'Another note']));
  const foreign = part(3, { ...reviewData(['Other material']), pieceId: 'other' });
  const input = JSON.stringify([first, repeat, foreign]);
  expect(seriesQualityReview([first, repeat, foreign])).toEqual({ status: 'partial', missingRequirements: ['Original note', 'Another note'], unsupportedClaims: ['Source gap'] });
  expect(JSON.stringify([first, repeat, foreign])).toBe(input);
  expect(seriesQualityReview([part(1), part(2)])).toBeNull();
  expect(seriesQualityReview([part(1, { qualityReview: { status: 'partial', missingRequirements: ['Unsigned'] } })])).toBeNull();
  expect(seriesQualityReview([{ ...first, removed: true }, part(2)])).toBeNull();
  expect(seriesQualityReview([part(1, reviewData([], [], 'unavailable'))]).status).toBe('unavailable');
});
test('neutral artifact actions and series-review scope copy are available in all existing assistant locales', () => {
  const { agentWordsFor } = loadTypeScriptModule('apps/frontend/src/components/agents/agent.copy.ts');
  const { batchSeriesWordsFor } = loadTypeScriptModule('apps/frontend/src/components/agents/agent.batch-series.copy.ts');
  for (const language of ['ru', 'en', 'de', 'fr', 'es', 'it', 'pt', 'tr', 'ar', 'he', 'ka', 'bn', 'ja', 'ko', 'vi', 'zh']) {
    const copy = agentWordsFor(language).card, expected = batchSeriesWordsFor(language).artifact;
    expect(copy.openBeside).toBe(expected.open);
    expect(copy.openedBeside).toBe(expected.opened);
    expect(copy.qualityReview.seriesSummary).toBe(expected.seriesSummary);
    expect(copy.qualityReview.seriesSaved).toBe(expected.seriesSaved);
    expect(copy.qualityReview.seriesSaved.length).toBeGreaterThan(15);
  }
  expect(agentWordsFor('ru').card.openBeside).toBe('Открыть');
  expect(agentWordsFor('en').card.openBeside).toBe('Open');
});
