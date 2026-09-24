'use strict';

/**
 * `content-factory-next-fn33.141` — «Аналитика → Производство» under a
 * Russian interface printed «0 hours» and the ledger's English
 * «Publishing failed». The hours word follows the reader's language since
 * 97dq.73; the failure classifications are translated by the card now.
 */

const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const view = loadTypeScriptModule(
  'apps/frontend/src/components/platform-analytics/production.analytics.view.tsx'
);

const model = {
  days: 30,
  channelName: 'Все каналы',
  summary: {
    publishedVolume: 0,
    failureCount: 3,
    failureRate: 100,
    averageLeadTimeHours: 0,
  },
  originMix: [],
  failureReasons: [
    { reason: 'Publishing failed', count: 1 },
    { reason: 'Unknown Error', count: 1 },
    { reason: 'Rate limit exceeded', count: 1 },
  ],
};

const render = (locale) =>
  renderToStaticMarkup(
    React.createElement(view.ProductionAnalyticsView, {
      state: 'default',
      locale,
      model,
      ahead: null,
    })
  );

describe('production analytics speaks the reader language', () => {
  test('ru: hours and ledger classifications are Russian', () => {
    const markup = render('ru');
    expect(markup).toContain('0 ч');
    expect(markup).not.toContain('hours');
    expect(markup).toContain('Не удалось опубликовать');
    expect(markup).toContain('Неизвестная ошибка');
    expect(markup).not.toContain('Publishing failed');
    // A provider's own words are shown as written.
    expect(markup).toContain('Rate limit exceeded');
  });

  test('en: the classifications read as English sentences', () => {
    expect(view.productionFailureReasonLabel('Unknown Error', 'en')).toBe(
      'Unknown error'
    );
    expect(view.productionFailureReasonLabel('unknown', 'ru')).toBe(
      'Неизвестная ошибка'
    );
  });

  test('the container hands the view the interface language', () => {
    const source = fs.readFileSync(
      path.join(
        __dirname,
        '..',
        'apps/frontend/src/components/platform-analytics/production.analytics.tsx'
      ),
      'utf8'
    );
    expect(source).toMatch(/locale=\{locale\}/u);
    expect(source).toMatch(/language\.startsWith\('ru'\)/u);
  });
});
