'use strict';
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const root = 'libraries/nestjs-libraries/src/content-intelligence/intake/';
const { settleResearchDigestV5 } = loadWithMocks(root + 'research-digest.v5.ts');
const { resolveResearchIntent, resolveResearchIntentV2 } = loadWithMocks(root + 'research-intent.ts');
const header = 'Release Cedar 4.7 on 2025-05-29';
const quote = 'The new snapshot interface allows a reader to retain its current view.';
const source = { evidenceId: 'source-1', url: 'https://official.example/releases/cedar', title: header,
  excerpt: header + '\n\n' + 'Other documented changes. '.repeat(100) + '\n\n' + quote };
const row = (changes = {}) => ({ evidenceId: source.evidenceId, statement: 'Появился интерфейс снимков.', quote,
  relevance: 'substantive', alreadyCovered: false, eventDate: '2025-05-29', eventDateQuote: header,
  dateBasis: 'event', eventStatus: 'occurred', ...changes });
const intent = resolveResearchIntent({ input: 'Изменения за указанный день.', now: new Date('2026-10-19T00:00:00Z'),
  temporal: { mode: 'historical', eventInterval: { start: '2025-05-29', end: '2025-05-29' } } });
const input = (changes = {}) => ({ language: 'ru', level: 'standard', subject: 'Документированные изменения.',
  claims: [], sources: [source], researchIntent: intent, ...changes });
const answer = finding => ({ verdicts: [], findings: [finding], assessment: { status: 'sufficient',
  summary: 'Подтверждённое изменение.', coveredNeeds: ['Изменение'], gaps: [], suggestedQueries: [] } });

test('a dated section heading can support a distant item without a spliced quotation', () => {
  const result = settleResearchDigestV5(answer(row()), input());
  expect(result.findings).toHaveLength(1);
  expect(result.findings[0].quote).toBe(quote);
  expect(result.findings[0].dateProvenance.eventDateQuote).toBe(header);
});

test('an exact date quotation classified as publication is distinguishable from a missing source span', () => {
  const result = settleResearchDigestV5(answer(row({ dateBasis: 'publication' })), input());
  expect(result.findings).toEqual([]);
  expect(result.periodDiagnostics.modelDateAssessment).toMatchObject({
    basis: { publication: 1 }, eventStatus: { occurred: 1 }, quote: { matched: 1, not_in_source: 0 },
  });
  const invented = settleResearchDigestV5(answer(row({ eventDateQuote: 'Invented dated heading on 2025-05-29' })), input());
  expect(invented.findings).toEqual([]);
  expect(invented.periodDiagnostics.modelDateAssessment.quote.not_in_source).toBe(1);
});

test('a version comparison can use its identified source date without requiring a dated event', () => {
  const general = resolveResearchIntent({ input: 'Сравнить названные версии.', now: new Date('2026-10-19T00:00:00Z') });
  const result = settleResearchDigestV5(answer(row({ eventDate: null, eventDateQuote: null,
    dateBasis: 'publication', eventStatus: 'unknown' })), input({ researchIntent: general }));
  expect(result.findings).toHaveLength(1);
  expect(result.assessment.status).toBe('sufficient');
  expect(result.periodDiagnostics).toBeUndefined();
});

test('explicit temporal scope still rejects a supported event outside the requested interval', () => {
  const result = settleResearchDigestV5(answer(row({ eventDate: '2025-05-28' })), input());
  expect(result.findings).toEqual([]);
  expect(result.periodDiagnostics.rejected.outside_period).toBe(1);
});

test('a model delta label without time boundaries does not block a version comparison', () => {
  const args = { input: 'Сравнить названные версии.', now: new Date('2026-10-19T00:00:00Z'),
    temporal: { mode: 'delta', exclusions: ['Не повторять уже описанную возможность.'] } };
  const result = resolveResearchIntentV2(args);
  expect(result.clarification).toBeNull();
  expect(result.eventInterval).toBeNull();
  expect(result.mode).toBe('general');
  expect(result.exclusions).toEqual(args.temporal.exclusions);
  // Frozen callers keep their earlier contract.
  expect(resolveResearchIntent(args).clarification).toBeTruthy();
});

test('explicit valid boundaries are consumed even when the descriptive model mode is general', () => {
  const result = resolveResearchIntentV2({ input: 'События за указанный день.', now: new Date('2026-10-19T00:00:00Z'),
    temporal: { mode: 'general', eventInterval: { start: '2025-05-29', end: '2025-05-29' } } });
  expect(result.clarification).toBeNull();
  expect(result.eventInterval).toEqual({ start: '2025-05-29T00:00:00.000Z', end: '2025-05-29T23:59:59.999Z' });
  const invalid = resolveResearchIntentV2({ input: 'Некорректные машинные границы.', now: new Date('2026-10-19T00:00:00Z'),
    temporal: { mode: 'general', eventInterval: { start: '2025-02-30', end: '2025-05-29' } } });
  expect(invalid.clarification).toBeTruthy();
  expect(invalid.eventInterval).toBeNull();
});

test('actual prior coverage constrains V2 regardless of a descriptive mode label', () => {
  const base = { input: 'Новые сведения после заданной границы.', now: new Date('2026-10-19T00:00:00Z') };
  const overlap = resolveResearchIntentV2({ ...base, temporal: { mode: 'general', priorCoverageEnd: '2025-05-29',
    eventInterval: { start: '2025-05-28', end: '2025-05-30' } } });
  expect(overlap.clarification).toContain('overlaps');
  const after = resolveResearchIntentV2({ ...base, temporal: { mode: 'general', priorCoverageEnd: '2025-05-29' } });
  expect(after.clarification).toBeNull();
  expect(after.eventInterval).toEqual({ start: '2025-05-30T00:00:00.000Z', end: base.now.toISOString() });
});
