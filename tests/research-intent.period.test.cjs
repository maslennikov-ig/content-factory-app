'use strict';
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const { resolveResearchIntent, admitResearchEvent, researchDayStart } = loadWithMocks('libraries/nestjs-libraries/src/content-intelligence/intake/research-intent.ts');
const now = new Date('2026-10-16T09:00:00Z');
const input = 'OpenAI пообещал целый месяц выкладывать каждый день новые фичи или давать ресеты. Вот мой последний пост об этом. Давай сделаем новый пост о всём, что OpenAI сделала после.\nOpenAI на этой неделе: главное за 6–8 октября\nTL;DR:\n- В ChatGPT пришли обновления.\n7 октября началось внедрение функции.\nА 6 октября добавили загрузку аудиофайлов.';
const frozen = () => resolveResearchIntent({ input, now, timeZone: 'Europe/Moscow' });
const event = (date, text = 'A distinct feature launched') => ({ quote: `${text} on ${date}.`, eventDate: date, eventDateQuote: `${text} on ${date}.`, material: `${text} on ${date}.` });
test('owner replay separates task from prior overview and resolves after 8 October through the pinned instant', () => {
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
test('historical task overrides the date range in a separate old example', () => {
  const intent = resolveResearchIntent({ input: '', task: 'Обзор за 2–4 сентября 2025', priorExample: 'Старый обзор за 6–8 октября 2026', now, timeZone: 'Europe/Moscow' });
  expect(intent.mode).toBe('historical');
  expect(intent.eventInterval).toEqual({ start: '2025-09-01T21:00:00.000Z', end: '2025-09-04T20:59:59.999Z' });
  expect(resolveResearchIntent({ input: 'События за 03.09.2025', now, timeZone: 'Europe/Moscow' }).eventInterval)
    .toEqual({ start: '2025-09-02T21:00:00.000Z', end: '2025-09-03T20:59:59.999Z' });
  expect(resolveResearchIntent({ input: 'Events from 2 September 2025 to 4 October 2025', now, timeZone: 'UTC' }).eventInterval)
    .toEqual({ start: '2025-09-02T00:00:00.000Z', end: '2025-10-04T23:59:59.999Z' });
});
test('explicit requested dates survive previous-event exclusions and stop at the current instant', () => {
  for (const task of [
    'Найдите события OpenAI за 9–16 октября 2026 года.',
    'Найдите события OpenAI за 9–16 октября 2026 года. Не повторяйте события прежнего обзора.',
  ]) {
    const intent = resolveResearchIntent({ input: '', task, priorExample: 'Старый текст без даты', now, timeZone: 'Europe/Moscow' });
    expect(intent.eventInterval).toEqual({ start: '2026-10-08T21:00:00.000Z', end: now.toISOString() });
    expect(intent.clarification).toBeNull();
    expect(intent.priorExample).toBe('Старый текст без даты');
  }
  const boundary = resolveResearchIntent({ input: 'Что произошло после 6–8 октября 2026?', now, timeZone: 'Europe/Moscow' });
  expect(boundary.mode).toBe('delta');
  expect(boundary.eventInterval).toEqual({ start: '2026-10-08T21:00:00.000Z', end: now.toISOString() });
});
test('excluded old ranges cannot become the requested interval; independent unknown ranges ask before search', () => {
  for (const task of [
    'Не повторяйте обзор за 6–8 октября 2026. Найдите события за 9–16 октября 2026.',
    'Найдите события за 9–16 октября 2026; прежний обзор за 6–8 октября 2026 не повторяйте.',
    'Exclude the old overview from 6–8 October 2026. Find events from 9–16 October 2026.',
  ]) {
    const intent = resolveResearchIntent({ input: task, now, timeZone: 'Europe/Moscow' });
    expect(intent.eventInterval).toEqual({ start: '2026-10-08T21:00:00.000Z', end: now.toISOString() });
    expect(intent.clarification).toBeNull();
  }
  const ambiguous = resolveResearchIntent({ input: 'События за 6–8 октября 2026 и за 9–16 октября 2026. Не повторяйте прежние события.', now });
  expect(ambiguous.eventInterval).toBeNull();
  expect(ambiguous.clarification).toBeTruthy();
  const combined = resolveResearchIntent({ input: 'Не повторяйте прежний обзор и найдите события за 10–12 октября 2026.',
    priorExample: 'Обзор за 6–8 октября 2026', now, timeZone: 'Europe/Moscow' });
  expect(combined.eventInterval).toEqual({ start: '2026-10-09T21:00:00.000Z', end: '2026-10-12T20:59:59.999Z' });
  const unclear = resolveResearchIntent({ input: 'Не повторяйте обзор за 10–12 октября 2026.',
    priorExample: 'Обзор за 6–8 октября 2026', now });
  expect(unclear.eventInterval).toBeNull();
  expect(unclear.clarification).toBeTruthy();
  const previousWeek = resolveResearchIntent({ input: 'Найдите события за предыдущую неделю 9–16 октября 2026.', now, timeZone: 'Europe/Moscow' });
  expect(previousWeek.eventInterval).toEqual({ start: '2026-10-08T21:00:00.000Z', end: now.toISOString() });
  const nested = resolveResearchIntent({ input: 'Обзор за 6–16 октября 2026 не повторяйте. Найдите события за 10–12 октября 2026.', now });
  expect(nested.eventInterval).toBeNull();
  expect(nested.clarification).toBeTruthy();
});
test('relative days use the pinned instant; calendar days use the caller zone including DST', () => {
  expect(resolveResearchIntent({ input: 'Новое за последние 3 дня', now }).eventInterval).toEqual({ start: '2026-10-13T09:00:00.000Z', end: now.toISOString() });
  expect(researchDayStart('2026-10-09', 'Europe/Moscow')).toBe('2026-10-08T21:00:00.000Z');
  expect(researchDayStart('2026-07-01', 'America/New_York')).toBe('2026-07-01T04:00:00.000Z');
});
test('rolling notes and later retrospectives admit event evidence, publication/crawl alone do not', () => {
  const intent = frozen();
  expect(admitResearchEvent(intent, { ...event('2026-10-12'), material: 'Release notes created 2024-01-01. '+event('2026-10-12').material })).toBe('admitted');
  expect(admitResearchEvent(intent, { ...event('2026-10-11'), material: 'Retrospective published 2026-10-20. '+event('2026-10-11').material })).toBe('admitted');
  expect(admitResearchEvent(intent, { quote: 'A feature launched without a date.', material: 'Updated 2026-10-16. A feature launched without a date.' })).toBe('unknown_date');
  expect(admitResearchEvent(intent, { quote: 'A feature launched without a date.', eventDate: '2026-10-16', eventDateQuote: 'Updated 2026-10-16.', material: 'Updated 2026-10-16. A feature launched without a date.' })).toBe('unknown_date');
  expect(admitResearchEvent(intent, event('2026-10-12', 'A feature will launch'))).toBe('unknown_date');
  expect(admitResearchEvent(intent, event('2026-10-12', 'OpenAI updated its feature'))).toBe('admitted');
  const oldEvent = event('2020-10-07');
  expect(admitResearchEvent(intent, { ...oldEvent, eventDate: '2026-10-12',
    eventDateQuote: `Notes for 2026-10-12. ${oldEvent.quote}`, material: `Notes for 2026-10-12. ${oldEvent.quote}` })).toBe('unknown_date');
});
test('no precise date is invented from undated or ambiguous prior coverage', () => {
  for (const priorExample of ['Обзор без дат', 'Новости 2 октября и 8 октября']) {
    const intent = resolveResearchIntent({ input: 'Что произошло после этого?', priorExample, now, timeZone: 'Europe/Moscow' });
    expect(intent.clarification).toBeTruthy();
    expect(intent.eventInterval).toBeNull();
  }
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
