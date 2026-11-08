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
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const { JSDOM } = require('jsdom');

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

  const locales = fs.readdirSync(path.join(root, 'libraries/react-shared-libraries/src/translation/locales'));
  test.each(locales)('the actual comment field retains the existing %s translation', (language) => {
    const dictionary = JSON.parse(read(`libraries/react-shared-libraries/src/translation/locales/${language}/translation.json`));
    const { ReviewComposerV1 } = loadWithMocks('apps/frontend/src/components/preview/comments.components.tsx', {
      '@contentfactory/react/translation/use-interface-language': { useInterfaceLanguage: () => language },
      '@contentfactory/react/translation/get.transation.service.client': { useT: () => (key, fallback) => dictionary[key] || fallback },
      './preview.review.context': {
        usePreviewReviewV1: () => ({ postId: 'post', guest: false, selected: null }),
        reviewComposerIdV1: () => 'comment', ReviewRequestErrorV1: class extends Error {},
      },
    });
    const dom = new JSDOM(renderToStaticMarkup(React.createElement(ReviewComposerV1)));
    try {
      const field = dom.window.document.querySelector('textarea');
      expect(field.getAttribute('placeholder')).toBe(dictionary.add_comment);
      expect(field.getAttribute('aria-label')).toBe(dictionary.add_comment);
    } finally { dom.window.close(); }
  });

  test('review copy remains stable on rerender and updates when the reader language changes', () => {
    const dom = new JSDOM('<div id="root"></div>', { url: 'https://factory.example' });
    const previous = new Map(['window', 'document', 'navigator', 'IS_REACT_ACT_ENVIRONMENT'].map(key => [key, Object.getOwnPropertyDescriptor(global, key)]));
    for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, IS_REACT_ACT_ENVIRONMENT: true })) {
      Object.defineProperty(global, key, { configurable: true, value });
    }
    let language = 'fr', reactRoot;
    const dictionaries = Object.fromEntries(['fr', 'de'].map(locale => [locale, JSON.parse(read(`libraries/react-shared-libraries/src/translation/locales/${locale}/translation.json`))]));
    const { useReviewCopyV1 } = loadWithMocks('apps/frontend/src/components/preview/review.copy.ts', {
      '@contentfactory/react/translation/use-interface-language': { useInterfaceLanguage: () => language },
      '@contentfactory/react/translation/get.transation.service.client': { useT: () => (key, fallback) => dictionaries[language][key] || fallback },
    });
    const copies = [];
    function Probe() { const copy = useReviewCopyV1(); copies.push(copy); return React.createElement('span', null, copy.add); }
    try {
      reactRoot = require('react-dom/client').createRoot(dom.window.document.getElementById('root'));
      React.act(() => reactRoot.render(React.createElement(Probe, { revision: 1 })));
      React.act(() => reactRoot.render(React.createElement(Probe, { revision: 2 })));
      expect(copies[1]).toBe(copies[0]);
      language = 'de';
      React.act(() => reactRoot.render(React.createElement(Probe, { revision: 3 })));
      expect(copies[2].add).toBe(dictionaries.de.add_comment);
      expect(copies[2]).not.toBe(copies[1]);
    } finally {
      if (reactRoot) React.act(() => reactRoot.unmount());
      for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(global, key, descriptor); else delete global[key]; }
      dom.window.close();
    }
  });
});
