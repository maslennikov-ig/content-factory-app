'use strict';

/**
 * `content-factory-next-fn33.144` and item 6 of `97dq.43` — the post preview
 * (`/p/:id` and the calendar's preview) read «Add a comment...» and «September
 * 5, 2026 5:00 AM» under a Russian interface. The placeholder is a translated
 * key now and the date is the product's one localized date-time.
 */

const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

describe('post preview speaks the reader language', () => {
  test('the date is written the way the reader language writes one', async () => {
    const i18next = loadTypeScriptModule(
      'libraries/react-shared-libraries/src/translation/i18next.ts'
    ).default;
    const { RenderPreviewDate } = loadTypeScriptModule(
      'apps/frontend/src/components/preview/render.preview.date.tsx'
    );
    try {
      await i18next.changeLanguage('ru');
      const markup = renderToStaticMarkup(
        React.createElement(RenderPreviewDate, {
          date: '2026-09-05T05:00:00.000Z',
        })
      );
      expect(markup).toMatch(/^\d{2}\.09\.2026, \d{1,2}:00$/u);
      expect(markup).not.toMatch(/September|AM|PM|сентябрь/u);
    } finally {
      await i18next.changeLanguage('en');
    }
  });

  test('the comment field placeholder is a translated key in every locale', () => {
    const source = read('apps/frontend/src/components/preview/comments.components.tsx');
    expect(source).not.toContain('Add a comment...');
    expect(source).toMatch(/placeholder=\{t\('add_comment'/u);
    const ru = JSON.parse(
      read('libraries/react-shared-libraries/src/translation/locales/ru/translation.json')
    );
    expect(ru.add_comment).toBe('Добавить комментарий');
  });
});
