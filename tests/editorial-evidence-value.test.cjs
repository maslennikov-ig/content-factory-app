'use strict';
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const base = 'libraries/nestjs-libraries/src/content-intelligence/intake/';
const { briefEvidenceEnvelope } = loadWithMocks(base + 'evidence-envelope.ts');
const { briefFillPromptV15 } = loadWithMocks(base + 'intake.prompts.v15.ts');
const { ADAPTATION_COVERAGE_REVIEW_RULES } = loadWithMocks('libraries/nestjs-libraries/src/agent/adaptation-coverage.ts');

test('brief receives the full bounded source passage and distinct publication and retrieval metadata', () => {
  const ending = 'Starting today the product is available in the API.';
  const evidence = briefEvidenceEnvelope({ evidenceId: 'one', url: 'https://example.org', title: 'Announcement',
    publishedAt: '2026-01-04', fetchedAt: '2026-01-09T10:00:00Z', excerpt: 'x'.repeat(500) + ending }, 8000);
  expect(evidence.passage).toContain(ending);
  expect(evidence).toMatchObject({ publishedAt: '2026-01-04', fetchedAt: '2026-01-09T10:00:00Z' });
  const prompt = briefFillPromptV15({ language: 'en', originalRequest: 'Explain the update', material: 'Explain the update', materialKind: 'instruction',
    requestClock: { asOf: '2026-01-09T10:00:00Z', timezone: 'UTC' }, researchEnabled: false,
    fixed: [], decided: [], avatar: [], channel: [], facts: [], evidence: [evidence] });
  expect(prompt).toContain(ending);
  expect(prompt).toContain('Neither by itself dates a launch or availability');
  expect(prompt).toContain('primary announcement saying availability starts today');
});

test('existing advisory review checks useful benefits and access in context without imposing a CTA on poetry', () => {
  expect(ADAPTATION_COVERAGE_REVIEW_RULES).toContain('practical benefit');
  expect(ADAPTATION_COVERAGE_REVIEW_RULES).toContain('poetry, reflection');
  expect(ADAPTATION_COVERAGE_REVIEW_RULES).toContain('suggested experiment from a verified product capability');
  expect(ADAPTATION_COVERAGE_REVIEW_RULES).toContain('independently confirmed availability despite partial research');
  expect(ADAPTATION_COVERAGE_REVIEW_RULES).toContain('later platform announcement does not date global launch');
});
