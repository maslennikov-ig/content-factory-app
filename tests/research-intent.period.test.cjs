'use strict';
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const { resolveResearchIntent, admitResearchEvent, researchDayStart } = loadWithMocks('libraries/nestjs-libraries/src/content-intelligence/intake/research-intent.ts');
const now = new Date('2026-10-16T09:00:00Z');
const input = 'OpenAI пообещал целый месяц выкладывать каждый день новые фичи или давать ресеты. Вот мой последний пост об этом. Давай сделаем новый пост о всём, что OpenAI сделала после.\nOpenAI на этой неделе: главное за 6–8 октября\nTL;DR:\n- В ChatGPT пришли обновления.\n7 октября началось внедрение функции.\nА 6 октября добавили загрузку аудиофайлов.';
const temporal = { mode: 'delta', priorCoverageEnd: '2026-10-08' };
const frozen = () => resolveResearchIntent({ input, task: 'Найди изменения после 8 октября 2026.',
  priorExample: 'Обзор за 6–8 октября 2026.', temporal, now, timeZone: 'Europe/Moscow' });
const event = (date, text = 'A distinct feature launched') => ({ quote: `${text} on ${date}.`, eventDate: date, eventDateQuote: `${text} on ${date}.`, material: `${text} on ${date}.` });

test('the model-selected after-8-October boundary survives the original reference dates', () => {
  const intent = frozen();
  expect(intent.mode).toBe('delta');
  expect(intent.task).not.toContain('TL;DR');
  expect(intent.eventInterval).toEqual({ start: '2026-10-08T21:00:00.000Z', end: now.toISOString() });
  expect(intent.priorCoverageEnd).toBe('2026-10-08T20:59:59.999Z');
  expect(intent.clarification).toBeNull();
  expect(admitResearchEvent(intent, event('2026-10-07'))).toBe('outside_period');
  expect(admitResearchEvent(intent, event('2026-10-09'))).toBe('admitted');
  expect(admitResearchEvent(intent, event('2026-10-17'))).toBe('outside_period');
});

test.each([
  'События нового периода; старый обзор за 6–8 октября 2026 оставь контекстом.',
  'Use the following reference only for comparison: 6–8 October 2026.',
  'Material: dates 6–16 October 2026 are quoted, not the requested boundary.',
])('the same structured meaning survives independent wording: %s', task => {
  const intent = resolveResearchIntent({ input: task, now, timeZone: 'Europe/Moscow',
    temporal: { mode: 'historical', eventInterval: { start: '2026-10-10', end: '2026-10-12' } } });
  expect(intent.eventInterval).toEqual({ start: '2026-10-09T21:00:00.000Z', end: '2026-10-12T20:59:59.999Z' });
  expect(intent.task).toBe(task);
});

test('ordinary text is not parsed for authoritative task, example or temporal meaning', () => {
  const intent = resolveResearchIntent({ input, now, timeZone: 'Europe/Moscow' });
  expect(intent.task).toBe(input);
  expect(intent.priorExample).toBeNull();
  expect(intent.eventInterval).toBeNull();
  expect(intent.clarification).toBeNull();
});

test('explicit machine dates use the caller calendar, exact instants stay exact and future end stops at the trusted clock', () => {
  const explicit = resolveResearchIntent({ input: 'historical investigation', now, timeZone: 'America/New_York',
    temporal: { mode: 'historical', eventInterval: { start: '2026-07-01', end: '2026-07-02' } } });
  expect(explicit.eventInterval).toEqual({ start: '2026-07-01T04:00:00.000Z', end: '2026-07-03T03:59:59.999Z' });
  const instant = resolveResearchIntent({ input: 'recent changes', now, temporal: { mode: 'recent', eventInterval: {
    start: '2026-10-13T09:00:00Z', end: '2026-10-20T09:00:00Z' } } });
  expect(instant.eventInterval).toEqual({ start: '2026-10-13T09:00:00.000Z', end: now.toISOString() });
  expect(researchDayStart('2026-07-01', 'America/New_York')).toBe('2026-07-01T04:00:00.000Z');
});

test.each([
  { mode: 'delta' },
  { mode: 'historical', eventInterval: { start: '2026-02-30', end: '2026-03-02' } },
  { mode: 'historical', eventInterval: { start: '2026-10-13', end: '2026-10-12' } },
])('invalid or missing structured temporal boundaries produce an explicit unresolved outcome: %j', temporal => {
  const intent = resolveResearchIntent({ input: 'request', temporal, now });
  expect(intent.eventInterval).toBeNull();
  expect(intent.clarification).toBeTruthy();
});

test('calendar admission checks quote integrity and interval without interpreting neighbouring future text', () => {
  const intent = frozen();
  const quote = 'Alpha launched on 2026-10-12. Beta will launch in December.';
  expect(admitResearchEvent(intent, { quote, eventDate: '2026-10-12', eventDateQuote: quote, material: quote })).toBe('admitted');
  expect(admitResearchEvent(intent, { ...event('2026-10-12'), eventDateQuote: 'Invented date context.' })).toBe('unknown_date');
  expect(admitResearchEvent(intent, { ...event('2026-10-12'), eventDate: null })).toBe('unknown_date');
  expect(admitResearchEvent(intent, { ...event('2026-10-12'), eventDate: '2026-02-30' })).toBe('unknown_date');
});

test('the common digest admits only dated new events, including rolling notes, and returns an honest empty result', () => {
  const { settleResearchDigestV3 } = loadWithMocks('libraries/nestjs-libraries/src/content-intelligence/intake/research-digest.v3.ts');
  const rows = [
    { evidenceId: 'old', statement: 'The previous feature launched.', quote: 'The old feature launched on 2026-10-07.', eventDate: '2026-10-07' },
    { evidenceId: 'new', statement: 'The new feature launched.', quote: 'The new feature launched on 2026-10-12.', eventDate: '2026-10-12' },
    { evidenceId: 'undated', statement: 'Another feature launched.', quote: 'Another feature launched without a date.', eventDate: null },
    { evidenceId: 'rolling', statement: 'The rolling feature launched.', quote: 'The rolling feature launched on 2026-10-11.', eventDate: '2026-10-11' },
  ].map(row => ({ ...row, eventDateQuote: row.eventDate ? row.quote : null }));
  const digestInput = { language: 'en', level: 'standard', subject: frozen().task, claims: [], researchIntent: frozen(),
    sources: rows.map(row => ({ evidenceId: row.evidenceId, url: `https://example.org/${row.evidenceId}`, title: row.evidenceId, excerpt: row.quote })) };
  const result = settleResearchDigestV3({ verdicts: [], findings: rows }, digestInput);
  expect(result.findings.map(row => row.evidenceId)).toEqual(['new', 'rolling']);
  expect(result.periodRejected).toEqual({ outside_period: 1, unknown_date: 1, clarification: 0, prior_coverage: 0 });
  expect(settleResearchDigestV3({ verdicts: [], findings: [rows[0], rows[2]] }, digestInput).findings).toEqual([]);
});
