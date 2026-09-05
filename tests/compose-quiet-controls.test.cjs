'use strict';

/**
 * Два контрола окна поста, которые пугали или молчали раньше времени.
 *
 * `content-factory-next-fn33.76`, живой прогон владельца 04.09.2026.
 *
 * Счётчик символов встречал человека красным восклицательным знаком до
 * первой буквы: без канала — красной плашкой без числа, с каналом — красным
 * «0/4096». Пустой черновик — это не ошибка, а начало работы; красный цвет
 * здесь называет ошибкой то, что человек ещё не успел сделать. Состояний у
 * счётчика теперь три, и третье — спокойное.
 *
 * «Повторять публикацию каждые…» читалось как незаполненное поле: многоточие
 * там, где обычно стоит значение. Это кнопка выбора, и подписана она теперь
 * как кнопка выбора — с выбранным значением или со словами «не повторять».
 *
 * Лента голоса в предпросмотре предлагала «Что применено» и «Выбрать», не
 * говоря, что именно выбирают. Слово «аватар» стояло только строкой выше.
 */

const path = require('node:path');
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
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const h = React.createElement;

let storeState = {};

const translation = {
  '@contentfactory/react/translation/get.transation.service.client': {
    useT: () => (key, fallback) => fallback ?? key,
  },
};

const { InformationComponent } = loadWithMocks(
  'apps/frontend/src/components/launches/information.component.tsx',
  {
    ...translation,
    '@contentfactory/frontend/components/new-launch/store': {
      useLaunchStore: (selector) => selector(storeState),
    },
    'zustand/react/shallow': { useShallow: (fn) => fn },
    '@contentfactory/react/platform/platform.badge': {
      PlatformBadge: () => h('span'),
    },
    '@contentfactory/react/helpers/safe.image': {
      __esModule: true,
      default: () => h('span'),
    },
  }
);

const { RepeatComponent } = loadWithMocks(
  'apps/frontend/src/components/launches/repeat.component.tsx',
  translation
);

const { voiceCopy } = loadTypeScriptModule(
  path.join(__dirname, '..', 'apps/frontend/src/components/brand-voice/voice-copy.ts')
);

afterEach(cleanup);

const drawCounter = (props) => {
  const { container } = render(
    h(InformationComponent, {
      chars: {},
      isPicture: false,
      text: '',
      ...props,
    })
  );
  return container.querySelector('[data-compose-counter]');
};

describe('счётчик символов не спорит с пустым черновиком', () => {
  beforeEach(() => {
    storeState = {
      current: 'one',
      selectedIntegrations: [],
      internal: [],
      integrations: [{ id: 'one', name: 'Telegram', stripLinks: false }],
    };
  });

  it('до первого символа счётчик спокоен и всё-таки считает', () => {
    const badge = drawCounter({ totalChars: 0, totalAllowedChars: 4096 });

    expect(badge.getAttribute('data-compose-counter')).toBe('pristine');
    expect(badge.textContent).toContain('0/4096');
    expect(badge.className).not.toContain('#FF3F3F');
  });

  it('без выбранного канала пустой черновик тоже не ошибка', () => {
    storeState = { ...storeState, current: 'global' };
    const badge = drawCounter({ totalChars: 0, totalAllowedChars: 0 });

    expect(badge.getAttribute('data-compose-counter')).toBe('pristine');
    expect(badge.className).not.toContain('#FF3F3F');
  });

  it('настоящее превышение остаётся красным', () => {
    const badge = drawCounter({ totalChars: 5000, totalAllowedChars: 4096 });

    expect(badge.getAttribute('data-compose-counter')).toBe('invalid');
    expect(badge.className).toContain('#FF3F3F');
  });

  it('текст в пределах предела по-прежнему подтверждается', () => {
    const badge = drawCounter({ totalChars: 12, totalAllowedChars: 4096 });

    expect(badge.getAttribute('data-compose-counter')).toBe('valid');
  });
});

describe('повтор публикации подписан как кнопка выбора', () => {
  const drawRepeat = (repeat) => {
    const { container } = render(
      h(RepeatComponent, { repeat, onChange: () => {} })
    );
    return container.querySelector('button');
  };

  it('без выбора кнопка называет отсутствие повтора словами', () => {
    const button = drawRepeat(null);

    expect(button.textContent).toContain('Repeat');
    expect(button.textContent).toContain('do not repeat');
    expect(button.textContent).not.toContain('...');
  });

  it('с выбором кнопка показывает выбранное значение', () => {
    const button = drawRepeat(7);

    expect(button.textContent).toContain('Week');
    expect(button.textContent).not.toContain('...');
  });
});

describe('лента голоса называет, что именно выбирают', () => {
  it('обе подписи произносят «аватар»', () => {
    for (const locale of ['ru', 'en']) {
      const word = locale === 'ru' ? 'ватар' : 'vatar';
      expect(voiceCopy[locale].ribbonWhatApplied).toContain(word);
      expect(voiceCopy[locale].ribbonChoose).toContain(word);
    }
  });
});
