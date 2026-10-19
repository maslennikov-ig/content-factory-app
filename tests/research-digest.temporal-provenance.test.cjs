'use strict';

const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const { resolveResearchIntent } = loadWithMocks('libraries/nestjs-libraries/src/content-intelligence/intake/research-intent.ts');
const { settleResearchDigestV3 } = loadWithMocks('libraries/nestjs-libraries/src/content-intelligence/intake/research-digest.v3.ts');
const now = new Date('2026-10-16T12:00:00Z');
const researchIntent = resolveResearchIntent({ input: 'Find events from 9–16 October 2026.', now, timeZone: 'Europe/Moscow', temporal: { mode: 'historical', eventInterval: { start: '2026-10-09', end: '2026-10-16' } } });
const quote = 'We are introducing the Orbit workspace for teams.';
const context = `October 15, 2026\nOrbit for teams\n${quote}`;
const source = { evidenceId: 'source-15', url: 'https://events.example/notes', title: 'Release notes', excerpt: context };
const input = { language: 'en', level: 'standard', subject: researchIntent.task, researchIntent, claims: [], sources: [source] };
const finding = (overrides = {}) => ({ evidenceId: source.evidenceId, statement: 'Teams can now use the Orbit workspace.', quote, eventDate: '2026-10-15', eventDateQuote: context, ...overrides });

test.each(['[E: source-15]', 'E:source-15', 'evidence: source-15', source.url])('date provenance follows the same accepted source alias as quote validation: %s', evidenceId => {
  const settled = settleResearchDigestV3({ verdicts: [], findings: [finding({ evidenceId })] }, input);
  expect(settled.findings).toHaveLength(1);
  expect(settled.findings[0].dateProvenance.eventDate).toBe('2026-10-15');
});

test('removing a source citation label from the statement does not detach its event date', () => {
  const settled = settleResearchDigestV3({ verdicts: [], findings: [finding({ statement: 'Teams can now use the Orbit workspace. [E:source-15]' })] }, input);
  expect(settled.findings).toHaveLength(1);
  expect(settled.findings[0].statement).not.toContain('[E:');
});

test('an earlier invalid quote cannot steal the provenance of the accepted finding', () => {
  const settled = settleResearchDigestV3({ verdicts: [], findings: [
    finding({ quote: null, eventDate: null, eventDateQuote: null }), finding(),
  ] }, input);
  expect(settled.findings).toHaveLength(1);
  expect(settled.findings[0].dateProvenance.eventDate).toBe('2026-10-15');
  expect(settled.rejected.findings).toBe(1);
});

test('event context uses the same punctuation normalization as the already accepted verbatim quote', () => {
  const originalQuote = 'We are introducing “Orbit” — a workspace for teams.';
  const original = `October 15, 2026\n${originalQuote}`;
  const normalizedQuote = 'We are introducing "Orbit" - a workspace for teams.';
  const settled = settleResearchDigestV3({ verdicts: [], findings: [finding({ quote: normalizedQuote, eventDateQuote: `October 15, 2026 ${normalizedQuote}` })] }, { ...input, sources: [{ ...source, excerpt: original }] });
  expect(settled.findings).toHaveLength(1);
});

test('source absence and missing event date stay rejected with bounded diagnostic counts', () => {
  const metadata = `Published October 15, 2026. ${quote}`;
  const settled = settleResearchDigestV3({ verdicts: [], findings: [finding({ eventDateQuote: 'This passage is absent from the source.' })] }, { ...input, sources: [{ ...source, excerpt: metadata }] });
  expect(settled.findings).toEqual([]);
  expect(settled.periodRejected.unknown_date).toBe(1);
  expect(settled.periodRejectionReasons.invalid_event_context).toBe(1);
  const missing = settleResearchDigestV3({ verdicts: [], findings: [finding({ eventDate: null, eventDateQuote: null })] }, input);
  expect(missing.findings).toEqual([]);
  expect(missing.periodRejectionReasons.missing_event_date).toBe(1);
  expect(JSON.stringify(missing.periodRejectionReasons)).not.toContain(quote);
});
