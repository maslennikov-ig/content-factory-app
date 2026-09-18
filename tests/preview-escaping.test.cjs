'use strict';

/**
 * Предпросмотр показывает написанное, а не выполняет его.
 *
 * Разбор корректности второго выпуска волны `content-factory-next-97dq`, P1-2.
 * Строка, которую предпросмотр отдаёт в `dangerouslySetInnerHTML`, — это выход
 * `stripHtmlValidation('normal', …)`, то есть ТЕКСТ с уже снятым
 * экранированием. Человек, написавший в теле
 * `<img src=x onerror=alert(document.domain)>`, хранится экранированным — и
 * возвращался разметкой ровно здесь. React не выполнит вставленный так
 * `<script>`, но `onerror` у картинки срабатывает.
 *
 * Тот же расчёт был скопирован в семь мест, поэтому и проверяется он в одном:
 * `previewContent`. Плюс два настоящих рисования — общий предпросмотр и один
 * предпросмотр площадки, — чтобы «в одном месте» не осталось словом.
 */

const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/launches',
});
for (const key of ['window', 'document', 'navigator']) {
  Object.defineProperty(global, key, {
    configurable: true,
    value: key === 'window' ? dom.window : dom.window[key],
  });
}
global.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const { cleanup, render } = require('@testing-library/react');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const h = React.createElement;

const { previewContent } = loadTypeScriptModule(
  'apps/frontend/src/components/launches/helpers/preview.content.tsx'
);
const { IntegrationContext } = loadTypeScriptModule(
  'apps/frontend/src/components/launches/helpers/use.integration.ts'
);
const { GeneralPreviewComponent } = loadTypeScriptModule(
  'apps/frontend/src/components/launches/general.preview.component.tsx'
);
const { TiktokPreview } = loadTypeScriptModule(
  'apps/frontend/src/components/new-launch/providers/tiktok/tiktok.preview.tsx'
);

// Общий предпросмотр берёт переводы клиентским `useT`, а тот подвешивает
// рисование, пока язык не загружен. Без этого контейнер оказывается пустым и
// проверка «текста нет» была бы зелёной ни о чём.
beforeAll(async () => {
  const i18n = loadTypeScriptModule(
    'libraries/react-shared-libraries/src/translation/i18next.ts'
  ).default;
  if (!i18n.isInitialized) {
    await new Promise((resolve) => i18n.on('initialized', resolve));
  }
  await i18n.loadLanguages(['en', 'ru']);
});

afterEach(cleanup);

/** Тело, как его хранит редактор: человек написал тег буквами. */
const INJECTION =
  '<p>Смотрите: &lt;img src=x onerror=alert(document.domain)&gt;</p>';
const BOLD = '<p><strong>bold</strong> и обычный текст</p>';
const MENTION =
  '<p>Привет <span data-mention-id="42" data-mention-label="Ivan">Ivan</span></p>';

const draw = (Component, content) =>
  render(
    h(
      IntegrationContext.Provider,
      {
        value: {
          integration: {
            id: '1',
            identifier: 'tiktok',
            name: 'Канал',
            picture: '',
            display: '@channel',
          },
          allIntegrations: [],
          // Картинка здесь не украшение: предпросмотр площадки рисует ленту
          // вложений и без неё падает на пустом списке — так же, как падал бы
          // в приложении.
          value: [{ content, image: [{ id: 'm1', path: '/uploads/one.jpg' }] }],
          date: undefined,
        },
      },
      h(Component, { maximumCharacters: 10000 })
    )
  );

describe('строка предпросмотра несёт только свою разметку', () => {
  test('написанный буквами тег остаётся буквами', () => {
    const [{ text }] = previewContent([{ content: INJECTION }], {
      identifier: 'x',
    });

    expect(text).not.toMatch(/<img/i);
    expect(text).toContain('&lt;img src=x onerror=alert(document.domain)&gt;');
  });

  test('разметка в строке — только `<mark>` и `<span>` упоминания', () => {
    const [{ text }] = previewContent([{ content: MENTION }], {
      identifier: 'x',
    });

    expect(text.replace(/<\/?(?:mark|span)(?:\s[^>]*)?>/gi, '')).not.toMatch(
      /[<>]/
    );
    expect(text).toContain('Ivan');
  });

  test('имя канала впереди тоже экранируется', () => {
    const [{ text }] = previewContent([{ content: '<p>тело</p>' }], {
      identifier: 'instagram',
      lead: { text: '<img src=x onerror=alert(1)>', className: 'font-[600]' },
    });

    expect(text).not.toMatch(/<img/i);
    expect(text).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  test('выделение по-прежнему доезжает начертанием', () => {
    const [{ text }] = previewContent([{ content: BOLD }], { identifier: 'x' });

    expect(text).toContain('𝗯𝗼𝗹𝗱');
  });
});

describe('расчёт живёт в одном месте', () => {
  const fs = require('node:fs');
  const path = require('node:path');

  const repositoryRoot = path.resolve(__dirname, '..');
  const HELPER =
    'apps/frontend/src/components/launches/helpers/preview.content.tsx';

  const sources = (directory) =>
    fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return sources(entryPath);
      return /\.(tsx|ts)$/.test(entry.name) ? [entryPath] : [];
    });

  test('обрезку с `<mark>` собирает только `preview.content.tsx`', () => {
    // Этот кусок был скопирован в семь файлов, и починка экранирования в одном
    // из них ничего не значила бы для остальных шести. Возвращение копии —
    // красный тест, а не находка следующего разбора.
    const offenders = sources(
      path.join(repositoryRoot, 'apps/frontend/src')
    ).filter((file) =>
      fs.readFileSync(file, 'utf8').includes('<mark class="bg-red-500"')
    );

    expect(
      offenders.map((file) => path.relative(repositoryRoot, file))
    ).toEqual([HELPER]);
  });

  test('каждый предпросмотр берёт строку у помощника', () => {
    const previews = [
      'apps/frontend/src/components/launches/general.preview.component.tsx',
      'apps/frontend/src/components/new-launch/providers/facebook/facebook.preview.tsx',
      'apps/frontend/src/components/new-launch/providers/instagram/instagram.preview.tsx',
      'apps/frontend/src/components/new-launch/providers/linkedin/linkedin.preview.tsx',
      'apps/frontend/src/components/new-launch/providers/pinterest/pinterest.preview.tsx',
      'apps/frontend/src/components/new-launch/providers/tiktok/tiktok.preview.tsx',
      'apps/frontend/src/components/new-launch/providers/youtube/youtube.preview.tsx',
    ];

    for (const preview of previews) {
      expect({
        preview,
        source: fs
          .readFileSync(path.join(repositoryRoot, preview), 'utf8')
          .includes('previewContent(topValue'),
      }).toEqual({ preview, source: true });
    }
  });
});

describe('нарисованный предпросмотр', () => {
  test.each([
    ['общий', () => GeneralPreviewComponent],
    ['площадки', () => TiktokPreview],
  ])('%s: картинки в разметке нет, текст виден', (_name, component) => {
    const view = draw(component(), INJECTION);

    // Ни одной картинки, кроме аватара канала: тег, написанный человеком,
    // элементом не стал.
    const injected = [...view.container.querySelectorAll('img')].filter(
      (image) => (image.getAttribute('src') || '') === 'x'
    );
    expect(injected).toHaveLength(0);
    expect(view.container.textContent).toContain(
      'Смотрите: <img src=x onerror=alert(document.domain)>'
    );
  });

  test.each([
    ['общий', () => GeneralPreviewComponent],
    ['площадки', () => TiktokPreview],
  ])('%s: выделение видно', (_name, component) => {
    const view = draw(component(), BOLD);

    expect(view.container.textContent).toContain('𝗯𝗼𝗹𝗱');
  });
});
