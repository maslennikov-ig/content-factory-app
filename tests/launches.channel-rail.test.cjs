'use strict';

/**
 * Рейка каналов на `/launches` — одна геометрия в обоих состояниях.
 *
 * `content-factory-next-tu3k.13`, живой прогон 07.09.2026. Слова владельца по
 * скриншоту 0.1: «в разделе „Каналы“ очень криво выстроены иконки… обеспечить
 * их консистентность стиля»; при показе макета — «проверить не только
 * свернутую рейку каналов, но и развернутую».
 *
 * Криво было измеримо: «Добавить канал» — 40 в высоту, «Новая заготовка» — 32
 * (плотный `iconOnly`), «Чистый лист» — 40 без знака-варианта, стрелка — 32 с
 * проигнорированным `size={28}`, аватар канала — 48 с бейджем 24. Здесь
 * держится то, что должно совпасть: квадрат 40 у каждой кнопки свёрнутой
 * рейки и у аватара, тихие 32 у стрелки и «⋮», и одно состояние на всю рейку
 * вместо двух способов его прочитать.
 */

const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
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

const { cleanup, render } = require('@testing-library/react');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');

const h = React.createElement;
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const LAUNCHES = 'apps/frontend/src/components/launches/launches.component.tsx';
const ADD_PROVIDER =
  'apps/frontend/src/components/launches/add.provider.component.tsx';
const NEW_POST = 'apps/frontend/src/components/launches/new.post.tsx';
const INTAKE_DOOR = 'apps/frontend/src/components/launches/intake.door.tsx';
const RAIL = 'apps/frontend/src/components/launches/channel-rail.tsx';

const translation = {
  '@contentfactory/react/translation/get.transation.service.client': {
    useT: () => (key, fallback) => fallback ?? key,
  },
};

const empty = () => null;

/* ------------------------------------------------------------- источники */

describe('геометрия рейки записана один раз', () => {
  test('ширины рейки живут только в `channel-rail`', () => {
    expect(read(RAIL)).toContain("'md:w-[100px]'");
    expect(read(RAIL)).toContain("'md:w-[260px]'");

    for (const file of [LAUNCHES, ADD_PROVIDER, NEW_POST, INTAKE_DOOR]) {
      expect(read(file)).not.toContain('md:w-[100px]');
      expect(read(file)).not.toContain('md:w-[260px]');
    }
  });

  test('кнопки рейки читают состояние свойством, а не классом-группой', () => {
    for (const file of [ADD_PROVIDER, NEW_POST, INTAKE_DOOR]) {
      // `group-[.sidebar]` — второй способ сказать «свёрнуто», и именно он
      // разошёлся с первым: примитив получал `iconOnly` только у одной двери
      // из трёх.
      expect(read(file)).not.toContain('group-[.sidebar]');
      expect(read(file)).toContain('collapsed');
    }
  });

  test('свёрнутое состояние в экране читается одной переменной', () => {
    const source = read(LAUNCHES);
    const comparisons = source.match(/collapseMenu === '1'/g) ?? [];

    // Одно сравнение — то самое, что заводит переменную. Комментарий рядом
    // цитирует прежний вид, поэтому считается код, а не проза о нём.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    expect((code.match(/collapseMenu === '1'/g) ?? []).length).toBe(1);
    expect(comparisons.length).toBeGreaterThan(0);
  });
});

/* --------------------------------------------------------------- кнопки */

const loadAddProvider = () =>
  loadWithMocks(ADD_PROVIDER, {
    react: React,
    clsx: require('clsx'),
    lodash: require('lodash'),
    'react-hook-form': { FormProvider: empty, useForm: () => ({}) },
    'copy-to-clipboard': () => {},
    // `web3.list` тянет за собой чужой пакет со своим CSS; здесь спрашивают
    // геометрию кнопки, а не каталог провайдеров.
    '@contentfactory/frontend/components/launches/web3/web3.list': {
      web3List: [],
    },
    'next/navigation': { useRouter: () => ({ push: () => {} }) },
    yup: { object: () => ({}), string: () => ({}) },
    '@hookform/resolvers/yup': { yupResolver: () => () => {} },
    '@hookform/resolvers/class-validator': {
      classValidatorResolver: () => () => {},
    },
    ...translation,
    '@contentfactory/helpers/utils/custom.fetch': { useFetch: () => () => {} },
    '@contentfactory/frontend/components/layout/new-modal': {
      useModals: () => ({ openModal: () => {} }),
    },
    '@contentfactory/frontend/components/launches/helpers/use.integration.list':
      { useIntegrationList: () => ({ data: [] }) },
    '@contentfactory/frontend/components/layout/user.context': {
      useUser: () => ({ role: 'ADMIN' }),
    },
    '@contentfactory/react/helpers/variable.context': {
      useVariables: () => ({ billingEnabled: false }),
    },
    '@contentfactory/react/toaster/toaster': { useToaster: () => () => {} },
  }).AddProviderButton;

const loadNewPost = () =>
  loadWithMocks(NEW_POST, {
    react: React,
    ...translation,
    dayjs: require('dayjs'),
    '@contentfactory/helpers/utils/custom.fetch': { useFetch: () => () => {} },
    '@contentfactory/frontend/components/layout/new-modal': {
      useModals: () => ({ openModal: () => {} }),
    },
    '@contentfactory/frontend/components/launches/calendar.context': {
      useCalendar: () => ({ integrations: [], sets: [] }),
    },
    '@contentfactory/frontend/components/launches/calendar': {
      SetSelectionModal: empty,
    },
    '@contentfactory/frontend/components/new-launch/compose.modal': {
      useOpenPostEditor: () => () => {},
    },
    '@contentfactory/frontend/components/new-launch/modal.wrapper.component': {
      ModalWrapperComponent: empty,
    },
    '@contentfactory/frontend/components/layout/user.context': {
      useUser: () => ({ role: 'ADMIN' }),
    },
  }).NewPost;

const loadIntakeDoor = () =>
  loadWithMocks(INTAKE_DOOR, {
    react: React,
    ...translation,
    '@contentfactory/frontend/components/layout/new-modal': {
      useModals: () => ({ openModal: () => {} }),
    },
    '@contentfactory/frontend/components/launches/calendar.context': {
      CalendarWeekProvider: empty,
      useCalendar: () => ({}),
    },
    '@contentfactory/frontend/components/content-intelligence/intake/intake.container':
      { IntakeContainer: empty },
    '@contentfactory/frontend/components/layout/user.context': {
      useUser: () => ({ role: 'ADMIN' }),
    },
  }).IntakeDoor;

const classesOf = (element) => (element?.className || '').split(/\s+/);

afterEach(cleanup);

describe('свёрнутая рейка: каждая кнопка — квадрат 40', () => {
  const doors = () => [
    ['«Добавить канал»', loadAddProvider()],
    ['«Пост»', loadNewPost()],
    ['«Заготовка»', loadIntakeDoor()],
  ];

  test('свёрнуто — 40×40 со знаком и именем для чтения с экрана', () => {
    for (const [name, Door] of doors()) {
      cleanup();
      render(h(Door, { collapsed: true }));
      const button = document.querySelector('button');

      expect([name, classesOf(button).includes('h-[40px]')]).toEqual([
        name,
        true,
      ]);
      expect([name, classesOf(button).includes('w-[40px]')]).toEqual([
        name,
        true,
      ]);
      expect([name, Boolean(button.getAttribute('aria-label'))]).toEqual([
        name,
        true,
      ]);
      // Свёрнуто у двери остаётся знак, а не подпись.
      expect([name, button.textContent.trim()]).toEqual([name, '']);
    }
  });

  test('развёрнуто — та же высота 40 и подпись, которая помещается', () => {
    for (const [name, Door] of doors()) {
      cleanup();
      render(h(Door, { collapsed: false }));
      const button = document.querySelector('button');

      expect([name, classesOf(button).includes('h-[40px]')]).toEqual([
        name,
        true,
      ]);
      expect([name, classesOf(button).includes('w-[40px]')]).toEqual([
        name,
        false,
      ]);
      expect([name, button.textContent.trim().length > 0]).toEqual([
        name,
        true,
      ]);
      // Подпись развёрнутой пары — одно слово: половина строки рейки это
      // 110px, и «Blank page» рядом со знаком туда не встаёт.
      expect([name, button.textContent.trim().split(/\s+/).length]).toEqual([
        name,
        name === '«Добавить канал»' ? 2 : 1,
      ]);
    }
  });

  test('приглашение клиента — тихая кнопка 32, и только в развёрнутой рейке', () => {
    const AddProviderButton = loadAddProvider();

    render(h(AddProviderButton, { collapsed: false }));
    const invite = document.querySelectorAll('button')[1];
    expect(invite).not.toBeUndefined();
    expect(classesOf(invite)).toEqual(
      expect.arrayContaining(['h-[32px]', 'w-[32px]', 'bg-transparent'])
    );

    cleanup();
    render(h(AddProviderButton, { collapsed: true }));
    expect(document.querySelectorAll('button')).toHaveLength(1);
  });

  test('главное действие отличается только заливкой', () => {
    const NewPost = loadNewPost();
    render(h(NewPost, { collapsed: false }));
    expect(classesOf(document.querySelector('button'))).toContain(
      'bg-cf-accent'
    );

    cleanup();
    const IntakeDoor = loadIntakeDoor();
    render(h(IntakeDoor, { collapsed: false }));
    const secondary = classesOf(document.querySelector('button'));
    expect(secondary).toContain('bg-cf-surface');
    expect(secondary).toContain('border-cf-border-control');
  });
});

/* ---------------------------------------------------------- строка канала */

const loadMenuComponent = () =>
  loadWithMocks(LAUNCHES, {
    react: React,
    clsx: require('clsx'),
    lodash: require('lodash'),
    'react-dnd': {
      useDrag: () => [{}, () => {}, () => {}],
      useDrop: () => [{ isOver: false }, () => {}],
    },
    'react-use-cookie': { __esModule: true, default: () => ['0', () => {}] },
    'next/navigation': {
      useRouter: () => ({ push: () => {} }),
      useSearchParams: () => new URLSearchParams(),
    },
    ...translation,
    '@contentfactory/helpers/utils/custom.fetch': { useFetch: () => () => {} },
    '@contentfactory/frontend/components/layout/loading': {
      LoadingComponent: empty,
    },
    '@contentfactory/frontend/components/layout/user.context': {
      useUser: () => ({ role: 'ADMIN', totalChannels: 10 }),
    },
    '@contentfactory/frontend/components/launches/menu/menu': {
      Menu: () =>
        h('button', {
          type: 'button',
          'aria-label': 'Channel menu',
          'data-channel-menu': '',
        }),
    },
    '@contentfactory/frontend/components/launches/calendar.context': {
      CalendarWeekProvider: empty,
      useCalendar: () => ({}),
    },
    './calendar': { Calendar: empty },
    './intake.door': { IntakeDoor: empty },
    '@contentfactory/frontend/components/launches/filters': { Filters: empty },
    '@contentfactory/frontend/components/launches/helpers/dnd.provider': {
      DNDProvider: empty,
    },
    '@contentfactory/frontend/components/launches/add.provider.component': {
      AddProviderButton: empty,
    },
    '@contentfactory/frontend/components/launches/new.post': { NewPost: empty },
    '@contentfactory/frontend/components/launches/helpers/use.integration.list':
      { useIntegrationList: () => ({ isLoading: false, data: [] }) },
    '@contentfactory/frontend/components/onboarding/onboarding': {
      Onboarding: empty,
    },
    '@contentfactory/react/helpers/variable.context': {
      useVariables: () => ({ billingEnabled: false }),
    },
    '@contentfactory/react/toaster/toaster': { useToaster: () => () => {} },
  }).MenuComponent;

const channel = {
  id: 'one',
  name: 'Тестовая группа Content Factory',
  identifier: 'telegram',
  picture: '',
  disabled: false,
  changeProfilePicture: false,
  changeNickName: false,
};

const drawRow = (collapsed, integration = channel) => {
  const MenuComponent = loadMenuComponent();
  render(
    h(MenuComponent, {
      collapsed,
      integration,
      mutate: () => {},
      update: () => {},
      continueIntegration: () => () => {},
      refreshChannel: () => () => {},
      totalNonDisabledChannels: 1,
    })
  );
};

describe('строка канала: аватар 40, бейдж 16, «⋮» тихая 32', () => {
  test('запасной знак канала — квадрат 40 в обоих состояниях', () => {
    for (const collapsed of [false, true]) {
      cleanup();
      drawRow(collapsed);
      const mark = document.querySelector('span[style*="width: 40px"]');
      expect(mark).not.toBeNull();
      expect(mark.style.height).toBe('40px');
    }
  });

  test('картинка канала занимает тот же квадрат и не сжимается', () => {
    drawRow(false, { ...channel, picture: 'https://example.test/a.png' });
    const image = document.querySelector('img');

    expect(image.getAttribute('width')).toBe('40');
    expect(classesOf(image)).toEqual(
      expect.arrayContaining([
        'w-[40px]',
        'h-[40px]',
        'min-w-[40px]',
        'min-h-[40px]',
        'rounded-[8px]',
      ])
    );
  });

  test('бейдж площадки — половина аватара', () => {
    drawRow(false);
    const badge = document.querySelector('.w-\\[16px\\]');

    expect(badge).not.toBeNull();
    expect(classesOf(badge)).toContain('h-[16px]');
  });

  test('«⋮» стоит в гнезде 32 у края строки, свёрнуто — под аватаром', () => {
    drawRow(false);
    let slot = document.querySelector('[data-channel-menu]').parentElement;
    expect(classesOf(slot)).toEqual(
      expect.arrayContaining(['h-[32px]', 'w-[32px]', 'shrink-0'])
    );
    // Развёрнутая строка — ряд: аватар, имя, «⋮».
    expect(classesOf(slot.parentElement)).not.toContain('flex-col');

    cleanup();
    drawRow(true);
    slot = document.querySelector('[data-channel-menu]').parentElement;
    expect(classesOf(slot)).toEqual(
      expect.arrayContaining(['h-[32px]', 'w-[32px]'])
    );
    // Свёрнутая — колонка по той же оси.
    expect(classesOf(slot.parentElement)).toEqual(
      expect.arrayContaining(['flex-col', 'items-center'])
    );
  });

  test('имя канала слышно и в свёрнутой рейке', () => {
    drawRow(true);
    const name = document.querySelector('[role="Handle"]');

    expect(name.textContent).toBe(channel.name);
    expect(classesOf(name)).toContain('sr-only');

    cleanup();
    drawRow(false);
    const visible = document.querySelector('[role="Handle"]');
    expect(classesOf(visible)).toEqual(
      expect.arrayContaining(['text-ellipsis', 'overflow-hidden'])
    );
    expect(classesOf(visible)).not.toContain('sr-only');
  });

  test('свёрнутая строка подсказывает имя наведением', () => {
    drawRow(true);
    const row = document.querySelector('[data-tooltip-id="tooltip"]');

    expect(row.getAttribute('data-tooltip-content')).toBe(channel.name);
  });
});
