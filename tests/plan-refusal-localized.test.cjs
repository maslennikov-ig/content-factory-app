'use strict';

/**
 * Отказ по тарифу: одна плашка, и в ней написана причина.
 *
 * `content-factory-next-nkei` и вторая половина `content-factory-next-fn33.105`.
 *
 * Общий обработчик на 402 открывал `deleteDialog((await response.json())
 * .message, 'Move to billing', 'Payment Required')`. Тело отказа собирает
 * `SubscriptionExceptionFilter`, и его `message` — английская фраза,
 * написанная для API: на русском экране человек получал английский текст с
 * английским заголовком и английской кнопкой. Ровно так же, как у отказа по
 * роли (`tests/role-refusal-localized.test.cjs`), язык знает только клиент,
 * поэтому таблица переводов живёт здесь, а английская фраза — ключ, под
 * которым она приходит. Этот набор — нитка между двумя файлами: переписали
 * фразу на сервере, и экран молча вернулся бы к английскому.
 *
 * Второе правило — про две плашки. Отказ, который называет себя (`code` в
 * теле), принадлежит поверхности, которая спрашивала: раздел «Контент» и окно
 * поста печатают его сами и своими словами. Общая модалка поверх них была бы
 * вторым сообщением о том же. На 403 это правило уже действовало; теперь то же
 * и на 402.
 */

const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const repositoryRoot = path.resolve(__dirname, '..');
const read = (relative) =>
  fs.readFileSync(path.join(repositoryRoot, relative), 'utf8');

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
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');

const SCREEN = 'apps/frontend/src/components/layout/layout.context.tsx';
const FILTER =
  'apps/backend/src/services/auth/permissions/subscription.exception.ts';

/** Пределы тарифа, которые фильтр умеет назвать. Роль сюда не входит. */
const PLAN_REFUSALS = [
  'You have reached the maximum number of posts for your subscription. Please upgrade your subscription to add more posts.',
  'You have reached the maximum number of channels for your subscription. Please upgrade your subscription to add more channels.',
  'You have reached the maximum number of webhooks for your subscription. Please upgrade your subscription to add more webhooks.',
  'You have reached the maximum number of generated videos for your subscription. Please upgrade your subscription to generate more videos.',
];

const LOCALES = [
  'en', 'he', 'ru', 'zh', 'fr', 'es', 'pt', 'de',
  'it', 'ja', 'ko', 'ar', 'tr', 'vi', 'bn', 'ka_ge',
];

const KEYS = [
  'plan_refusal_title',
  'plan_refusal_billing',
  'plan_refusal_posts',
  'plan_refusal_channels',
  'plan_refusal_webhooks',
  'plan_refusal_videos',
  'plan_refusal_generic',
];

let dialogs = [];
let opened = [];

const LayoutContext = loadWithMocks(SCREEN, {
  '@contentfactory/helpers/utils/custom.fetch': {
    FetchWrapperComponent: (props) => {
      captured = props.afterRequest;
      return React.createElement('div', null, props.children);
    },
  },
  '@contentfactory/react/helpers/delete.dialog': {
    deleteDialog: async (message, confirmButton, title, cancelButton) => {
      dialogs.push({ message, confirmButton, title, cancelButton });
      return false;
    },
  },
  '@contentfactory/frontend/components/layout/new-modal': {
    areYouSure: async (options) => {
      dialogs.push(options);
      return true;
    },
  },
  '@contentfactory/frontend/app/(app)/auth/return.url.component': {
    useReturnUrl: () => ({ getAndClear: () => null }),
  },
  '@contentfactory/react/helpers/variable.context': {
    useVariables: () => ({ backendUrl: '/api', isSecured: true }),
  },
  '@contentfactory/react/translation/i18next': {
    __esModule: true,
    default: { t: (key, fallback) => `[${key}]${fallback}` },
  },
}).default;

let captured = null;

const answer = (status, body) => ({
  status,
  headers: { get: () => null },
  json: async () => body,
});

const call = async (response) => {
  dialogs = [];
  opened = [];
  window.open = (url) => opened.push(url);
  render(React.createElement(LayoutContext, { children: 'x' }));
  return captured('/posts', {}, response);
};

afterEach(cleanup);

describe('отказ по тарифу говорит на языке экрана', () => {
  it.each(PLAN_REFUSALS)('«%s» переведена, а не напечатана как пришла', async (
    sentence
  ) => {
    await call(answer(402, { statusCode: 402, message: sentence }));

    expect(dialogs).toHaveLength(1);
    const shown = dialogs[0];
    const text = shown.message ?? shown.description;
    expect(text).toMatch(/^\[plan_refusal_/);
    expect(text).not.toBe(sentence);
    expect(shown.confirmButton ?? shown.approveLabel).toContain(
      'plan_refusal_billing'
    );
    expect(shown.title).toContain('plan_refusal_title');
  });

  it('незнакомый предел всё-таки называет тариф', async () => {
    await call(
      answer(402, { statusCode: 402, message: 'Something new from the server' })
    );

    expect(dialogs).toHaveLength(1);
    const text = dialogs[0].message ?? dialogs[0].description;
    expect(text).toContain('Something new from the server');
  });

  it('пустое тело не оставляет модалку без описания', async () => {
    await call({
      status: 402,
      headers: { get: () => null },
      json: async () => {
        throw new Error('no body');
      },
    });

    expect(dialogs).toHaveLength(1);
    const text = dialogs[0].message ?? dialogs[0].description;
    expect(text).toContain('plan_refusal_generic');
  });
});

describe('плашка одна', () => {
  it('экран, назвавший отказ сам, общей модалки не получает', async () => {
    await call(
      answer(402, {
        statusCode: 402,
        code: 'CONTENT_EVIDENCE_REQUIRED',
        message: 'Current evidence is required.',
      })
    );

    expect(dialogs).toEqual([]);
  });

  it('то же правило на 403 не сломано', async () => {
    await call(
      answer(403, {
        code: 'CONTENT_CONTEXT_DRAFT_ONLY',
        message: 'A post built from evidence stays a draft.',
      })
    );

    expect(dialogs).toEqual([]);
  });
});

describe('таблица держится за фильтр и за локали', () => {
  it('экран знает каждый предел, который умеет прислать фильтр', () => {
    const filter = read(FILTER);
    const screen = read(SCREEN);
    for (const sentence of PLAN_REFUSALS) {
      expect(filter).toContain(sentence);
      expect(screen).toContain(sentence);
    }
  });

  it.each(LOCALES)('%s несёт каждый ключ модалки', (locale) => {
    const bundle = JSON.parse(
      read(
        `libraries/react-shared-libraries/src/translation/locales/${locale}/translation.json`
      )
    );
    for (const key of KEYS) {
      expect(typeof bundle[key]).toBe('string');
      expect(bundle[key].trim()).not.toBe('');
    }
  });
});
