'use strict';

const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

jest.mock('next/font/local', () => ({
  __esModule: true,
  default: () => ({ className: 'font-sans', variable: 'font-variable' }),
}));

const editorRoot = 'apps/frontend/src/components/media/image-editor';
const routeFile =
  'apps/frontend/src/app/(stand)/interface-review/image-editor/[scene]/page.tsx';

test('renders the real editor shell for every required review state with Cyrillic content', async () => {
  const { scene, ImageEditorReviewScene } = loadTypeScriptModule(
    `${editorRoot}/image-editor.review-scene.tsx`
  );
  expect(scene.states).toEqual([
    'loading',
    'default',
    'selected',
    'success',
    'error',
    'restricted',
    'disabled',
    'long-content',
  ]);
  for (const state of scene.states) {
    const markup = renderToStaticMarkup(
      React.createElement(ImageEditorReviewScene, {
        context: { state, theme: 'dark', locale: 'ru', viewport: 390 },
      })
    );
    expect(markup).toContain('data-product-surface="image-editor"');
    expect(markup).toContain('data-surface-state="' + state + '"');
    expect(markup).toContain('Привет, мир');
    expect(markup).toContain('role="dialog"');
  }
});

test('routes only the accepted image-editor scene through query context', async () => {
  const route = loadTypeScriptModule(routeFile);
  const output = await route.default({
    params: Promise.resolve({ scene: 'editor' }),
    searchParams: Promise.resolve({
      state: 'selected',
      theme: 'light',
      locale: 'en',
      viewport: '1440',
    }),
  });
  const markup = renderToStaticMarkup(output);
  expect(markup).toContain('data-interface-review-scene="image-editor/editor"');
  expect(markup).toContain('data-interface-review-state="selected"');
});

test('exposes explicit text and drawing style controls in the production editor shell', () => {
  const { ImageEditorReviewScene } = loadTypeScriptModule(
    `${editorRoot}/image-editor.review-scene.tsx`
  );
  const markup = renderToStaticMarkup(
    React.createElement(ImageEditorReviewScene, {
      context: {
        state: 'selected',
        theme: 'light',
        locale: 'ru',
        viewport: 1440,
      },
    })
  );
  for (const label of [
    'Шрифт',
    'Размер текста',
    'Выравнивание',
    'Цвет текста',
    'Цвет кисти',
    'Толщина кисти',
  ]) {
    expect(markup).toContain(label);
  }
  expect(markup).toContain('Geologica');
  expect(markup).toContain('JetBrains Mono');
});

test('the interactive review harness exposes an in-memory export receipt without persistence', () => {
  const { ImageEditorReviewScene } = loadTypeScriptModule(
    `${editorRoot}/image-editor.review-scene.tsx`
  );
  const markup = renderToStaticMarkup(
    React.createElement(ImageEditorReviewScene, {
      context: {
        state: 'default',
        theme: 'light',
        locale: 'ru',
        viewport: 1440,
      },
    })
  );
  expect(markup).toContain('data-review-original-id="review-source"');
  expect(markup).toContain('data-review-export-type=""');
  expect(markup).toContain('data-review-export-bytes="0"');
  expect(markup).toContain('data-review-saved-id=""');
  expect(markup).toContain('<canvas aria-label="Холст изображения"></canvas>');
  expect(markup).not.toContain('<canvas class="invisible"');
});
