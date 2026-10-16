'use strict';
require('reflect-metadata');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const base = 'libraries/nestjs-libraries/src/content-intelligence';
let digestRows, calls;
const { IntakeService } = loadWithMocks(`${base}/intake/intake.service.ts`, {
  '@contentfactory/nestjs-libraries/openai/ai.clients': { getChatModel: async () => ({ withStructuredOutput: () => ({ invoke: async prompt => { calls.push(prompt); return { verdicts: [], findings: digestRows }; } }) }) },
  '@contentfactory/nestjs-libraries/agent/agent.graph.service': { AgentGraphService: class {} },
  '@contentfactory/nestjs-libraries/integrations/integration.manager': { IntegrationManager: class {} },
  '@contentfactory/nestjs-libraries/openai/ai.usage.service': { AiUsageService: class {} },
  '../brief/content-brief.repository': { ContentBriefRepository: class {} },
});
const now = new Date('2026-10-16T09:00:00Z');
const task = 'Давай сделаем новый пост о всём, что OpenAI сделала после этого обзора.';
const prior = 'OpenAI: главное за 6–8 октября 2026.\n7 октября началось внедрение функции.';
const brief = { inputKind: 'thought', thesis: task, position: null, goal: null, disagreement: null, audience: null, origins: {}, facts: [], ungrounded: [] };
const fixtures = [
  { id: 'old', quote: 'The old feature launched on 2026-10-07.', date: '2026-10-07' },
  { id: 'new', quote: 'The new feature launched on 2026-10-12.', date: '2026-10-12' },
  { id: 'undated', quote: 'Another feature launched without a date.', date: null },
];
const create = () => {
  calls = [];
  digestRows = fixtures.map(row => ({ evidenceId: row.id, statement: `${row.id} feature launched.`, quote: row.quote, eventDate: row.date, eventDateQuote: row.date ? row.quote : null }));
  const research = { research: jest.fn(async () => ({ provider: 'exa', facts: fixtures.map(row => ({ sourceUrl: `https://example.org/${row.id}`, text: row.quote })), sources: fixtures.map(row => ({ url: `https://example.org/${row.id}`, title: row.id, provider: 'exa', publishedAt: '2026-10-16' })) })) };
  const sources = { acceptSearchResult: jest.fn(async (_org, value) => ({ ...value, evidenceId: value.url.split('/').at(-1) })) };
  const intake = new IntakeService({}, research, sources, {}, {}, {}, {}, {}, {}, { executeAiOperation: async (_org, _op, callback) => callback() }, () => now);
  return { intake, research, sources };
};
test('existing assistant/core and manual intake share anchored intent, source admission and period response', async () => {
  const { intake, research, sources } = create();
  const context = { timeZone: 'Europe/Moscow', researchTask: task, priorExample: prior };
  const state = await intake.researchExistingCore('org', 'Existing draft must survive.', brief, 'ru', 'standard', undefined, context);
  expect(state.summary.researchIntent.eventInterval).toEqual({ start: '2026-10-08T21:00:00.000Z', end: now.toISOString() });
  expect(state.summary.periodStatus).toBe('matched');
  expect(state.filled.brief.facts.filter(row => row.kind === 'found').map(row => row.evidenceId)).toEqual(['new']);
  expect(state.filled.brief.facts.find(row => row.evidenceId === 'new').dateProvenance).toEqual({
    eventDate: '2026-10-12', eventDateQuote: fixtures[1].quote, precision: 'day', sourcePublishedAt: '2026-10-16',
  });
  expect(research.research.mock.calls[0][1]).not.toContain('7 октября началось');
  expect(research.research.mock.calls[0][2].researchIntent).toEqual(state.summary.researchIntent);
  expect(sources.acceptSearchResult.mock.calls.every(call => call[2].reuseBy === 'hash')).toBe(true);
  const plan = await intake.prepare('org', { input: task, language: 'ru', ...context, options: { researchEnabled: true } });
  const result = await intake.researchForIntake('org', task, plan, new Map(), 'standard');
  expect(result.researchIntent).toEqual(state.summary.researchIntent);
});
test('a detailed chat request preserves the period and exclusions beyond the former 300-character cut', async () => {
  const { intake, research } = create();
  const direction = `${'Ищите подтверждения только в официальных источниках, сохраните авторскую позицию. '.repeat(5)}Только события OpenAI за 9–16 октября 2026 года. Не повторяйте прежний обзор.`;
  const state = await intake.researchExistingCore('org', 'Existing draft must survive.', brief, 'ru', 'deep', direction,
    { timeZone: 'Europe/Moscow' });
  expect(state.summary.researchIntent.eventInterval).toEqual({ start: '2026-10-08T21:00:00.000Z', end: now.toISOString() });
  expect(state.summary.researchIntent.task).toContain('9–16 октября 2026');
  expect(calls[0]).toContain(direction);
  expect(research.research).toHaveBeenCalledTimes(1);
});
test('manual brief receives only the new task; older research stays unselected context', async () => {
  const { intake } = create();
  const input = `Вот мой последний пост. ${task}\nОбзор за 6–8 октября 2026\n${prior}`;
  const plan = await intake.prepare('org', { input, language: 'ru', timeZone: 'Europe/Moscow', options: { researchEnabled: true } });
  expect(plan.input).not.toContain('7 октября началось');
  expect(plan.priorExample).toContain('7 октября началось');
  const oldFact = { statement: 'Already covered.', evidenceId: 'saved-old', sourceUrl: 'https://example.org/saved-old', kind: 'found', origin: 'search', selected: true, verified: true };
  const state = await intake.researchExistingCore('org', 'Original draft.', { ...brief, facts: [oldFact] }, 'ru', 'standard', undefined,
    { timeZone: 'Europe/Moscow', researchTask: task, priorExample: prior });
  expect(state.filled.brief.facts.find(row => row.evidenceId === 'saved-old').selected).toBe(false);
});
test('unknown/old-only search names the exact period and missing event dates without recycling raw snippets', async () => {
  const { intake } = create();
  digestRows = digestRows.filter(row => row.evidenceId !== 'new');
  const state = await intake.researchExistingCore('org', 'Existing draft must survive.', brief, 'ru', 'standard', undefined,
    { timeZone: 'Europe/Moscow', researchTask: task, priorExample: prior });
  expect(state.summary.periodStatus).toBe('empty');
  expect(state.summary.gaps.join(' ')).toMatch(/2026-10-08T21:00:00/);
  expect(state.filled.brief.facts.filter(row => row.kind === 'found')).toEqual([]);
  const events = [];
  for await (const event of intake.finish('org', {}, 'user', state)) events.push(event);
  expect(events.map(event => event.name)).toEqual(['brief-filled', 'done']);
  expect(events.at(-1).pieceId).toBeNull();
});
test('ambiguous prior coverage asks one question before search/model egress', async () => {
  const { intake, research } = create();
  const state = await intake.researchExistingCore('org', 'Original draft.', brief, 'ru', 'standard', undefined,
    { timeZone: 'Europe/Moscow', researchTask: task, priorExample: 'Новости 2 октября 2026 и 8 октября 2026.' });
  expect(state.summary.periodStatus).toBe('needs_clarification');
  expect(state.summary.researchIntent.clarification).toBeTruthy();
  expect(research.research).not.toHaveBeenCalled();
  expect(calls).toEqual([]);
});
