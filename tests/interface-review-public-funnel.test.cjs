'use strict';

const path = require('node:path');

const capturePath = path.resolve(
  __dirname,
  '../scripts/evidence/capture-public-funnel.cjs'
);

const {
  CAPTURE_MATRIX,
  inspectRequestLedger,
} = require(capturePath);

describe('public funnel browser evidence contract', () => {
  test('covers every public route at both widths, themes and authored locales', () => {
    expect(CAPTURE_MATRIX).toHaveLength(40);
    expect(
      new Set(CAPTURE_MATRIX.map(({ route }) => route))
    ).toEqual(new Set(['/', '/product', '/security', '/docs', '/demo']));
    expect(new Set(CAPTURE_MATRIX.map(({ width }) => width))).toEqual(
      new Set([390, 1440])
    );
    expect(new Set(CAPTURE_MATRIX.map(({ theme }) => theme))).toEqual(
      new Set(['light', 'dark'])
    );
    expect(new Set(CAPTURE_MATRIX.map(({ locale }) => locale))).toEqual(
      new Set(['ru', 'en'])
    );
  });

  test('permits public documents and the one coarse same-origin growth mutation', () => {
    const result = inspectRequestLedger(
      [
        { method: 'GET', url: 'http://127.0.0.1:4200/demo', resourceType: 'document' },
        { method: 'GET', url: 'http://127.0.0.1:4200/_next/static/app.js', resourceType: 'script' },
        { method: 'POST', url: 'http://127.0.0.1:4200/public-growth-events', resourceType: 'fetch' },
      ],
      'http://127.0.0.1:4200'
    );

    expect(result.external).toEqual([]);
    expect(result.disallowedMutations).toEqual([]);
    expect(result.allowedGrowthPosts).toHaveLength(1);
  });

  test.each([
    ['tenant mutation', 'POST', '/posts'],
    ['AI call', 'POST', '/ai/generate'],
    ['Temporal call', 'POST', '/temporal/workflows'],
    ['OAuth call', 'GET', '/oauth/authorize'],
    ['publish call', 'POST', '/publish'],
    ['account call', 'POST', '/auth/register'],
    ['paid-provider call', 'POST', '/stripe/checkout'],
  ])('rejects a %s from the anonymous browser ledger', (_label, method, pathname) => {
    const result = inspectRequestLedger(
      [{ method, url: `http://127.0.0.1:4200${pathname}`, resourceType: 'fetch' }],
      'http://127.0.0.1:4200'
    );

    expect(result.disallowedSensitive).toHaveLength(1);
  });

  test('rejects every external request without persisting request headers or bodies', () => {
    const result = inspectRequestLedger(
      [{
        method: 'POST',
        url: 'https://provider.invalid/v1/generate',
        resourceType: 'fetch',
        headers: { authorization: 'secret' },
        postData: 'private visitor text',
      }],
      'http://127.0.0.1:4200'
    );

    expect(result.external).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(JSON.stringify(result)).not.toContain('private visitor text');
  });
});
