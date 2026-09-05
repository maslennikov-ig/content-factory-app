'use strict';

/**
 * Пять экранов, которые под ролью USER предлагали работу и отказывали после
 * (`content-factory-next-fn33.90.4`, `.90.5`, `.90.6`, `.90.9`, `.90.10`,
 * `.90.12`).
 *
 * Живой прогон 05.09.2026 прошёл стенд под тремя ролями. Сервер отвечал верно
 * во всех тридцати пробах: 403 там, где дверь несёт роль. Разошлось с ним не
 * решение о доступе, а экран — он рисовал кнопки записи и узнавал об отказе
 * только после нажатия. Меню канала предлагало Пользователю «Создать пост»,
 * а Пользователю и Редактору — «Настройки канала», «Переместить в группу» и
 * «Временные интервалы»; библиотека медиа держала живой «Загрузить» и красный
 * крестик удаления; экран агента открывался и молча получал два 403.
 *
 * Решение владельца 05.09.2026: Пользователь смотрит, Редактор пишет,
 * Администратор владеет — и экран показывает это заранее.
 *
 * Проверяется здесь именно то, что видно человеку. Кто проходит дверь, держит
 * `tests/roles-matrix.guard.test.cjs` по контроллерам; этот набор держит
 * согласие экрана с ней.
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

const { act, cleanup, render, screen } = require('@testing-library/react');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');

const h = React.createElement;
const Empty = () => null;
const stub = new Proxy(
  {},
  {
    get: (_target, name) =>
      name === '__esModule' ? false : name === 'default' ? Empty : Empty,
  }
);

const translation = {
  '@contentfactory/react/translation/get.transation.service.client': {
    useT: () => (_key, fallback) => fallback,
  },
};

const MENU = 'apps/frontend/src/components/launches/menu/menu.tsx';
const MEDIA = 'apps/frontend/src/components/media/media.component.tsx';
const AGENT = 'apps/frontend/src/components/agents/agent.tsx';
const TOP_MENU = 'apps/frontend/src/components/layout/top.menu.tsx';
const WRITE_RIGHT =
  'apps/frontend/src/components/content-intelligence/content-write-right.tsx';

const source = (relative) =>
  fs.readFileSync(path.join(root, relative), 'utf8');

afterEach(() => {
  cleanup();
});

/* ------------------------------------------------------------------ меню */

const INTEGRATION = {
  id: 'itg-1',
  name: 'Стендовый канал',
  identifier: 'telegram',
  refreshNeeded: false,
  isCustomFields: false,
  customFields: null,
  disabled: false,
};

const loadChannelMenu = (role) =>
  loadWithMocks(MENU, {
    react: React,
    clsx: require('clsx'),
    dayjs: require('dayjs'),
    'copy-to-clipboard': { __esModule: true, default: () => true },
    '@prisma/client': {},
    '@mantine/hooks': { useClickOutside: () => ({ current: null }) },
    'next/navigation': { useRouter: () => ({ push: () => {} }) },
    ...translation,
    '@contentfactory/helpers/utils/custom.fetch': {
      useFetch: () => async () => ({ json: async () => ({}) }),
    },
    '@contentfactory/react/helpers/delete.dialog': { deleteDialog: () => {} },
    '@contentfactory/react/helpers/variable.context': {
      useVariables: () => ({ extensionId: '' }),
    },
    '@contentfactory/react/toaster/toaster': {
      useToaster: () => ({ show: () => {} }),
    },
    '@contentfactory/frontend/components/layout/new-modal': {
      useModals: () => ({ openModal: () => {} }),
    },
    '@contentfactory/frontend/components/layout/user.context': {
      useUser: () => ({ role }),
    },
    '@contentfactory/frontend/components/launches/calendar.context': {
      useCalendar: () => ({
        integrations: [INTEGRATION],
        reloadCalendarView: () => {},
      }),
    },
    '@contentfactory/frontend/components/launches/time.table': stub,
    '@contentfactory/frontend/components/launches/bot.picture': stub,
    '@contentfactory/frontend/components/launches/customer.modal': stub,
    '@contentfactory/frontend/components/launches/settings.modal': stub,
    '@contentfactory/frontend/components/launches/add.provider.component': stub,
    '@contentfactory/frontend/components/new-launch/add.edit.modal': stub,
    '@contentfactory/frontend/components/new-launch/modal.wrapper.component':
      stub,
  });

/** Открывает меню ⋮ и возвращает подписи его пунктов. */
const channelMenuItems = async (role) => {
  const { Menu } = loadChannelMenu(role);
  await act(async () => {
    render(
      h(Menu, {
        id: INTEGRATION.id,
        canEnable: false,
        canDisable: true,
        canChangeProfilePicture: true,
        canChangeNickName: true,
        refreshChannel: () => () => {},
        mutate: () => {},
        onChange: () => {},
      })
    );
  });
  await act(async () => {
    screen.getByRole('button', { name: 'Channel menu' }).click();
  });
  return screen
    .queryAllByRole('menuitem')
    .map((node) => node.textContent.trim());
};

describe('fn33.90.4 и .90.5 — меню канала предлагает только то, что дверь пропустит', () => {
  test('Пользователь не видит ни «Создать пост», ни один из администраторских пунктов', async () => {
    const items = await channelMenuItems('USER');

    expect(items).not.toContain('Create a new post');
    expect(items).not.toContain('Channel settings');
    expect(items).not.toContain('Move / add to group');
    expect(items).not.toContain('Edit Time Slots');
    expect(items.join(' ')).not.toContain('Change Bot');
    // Читающий пункт остаётся: идентификатор канала двери не открывает.
    expect(items).toContain('Copy Channel ID');
  });

  test('Редактор пишет посты, но каналом не распоряжается', async () => {
    const items = await channelMenuItems('EDITOR');

    expect(items).toContain('Create a new post');
    expect(items).toContain('Copy Channel ID');
    expect(items).not.toContain('Channel settings');
    expect(items).not.toContain('Move / add to group');
    expect(items).not.toContain('Edit Time Slots');
    expect(items).not.toContain('Disable Channel');
    expect(items).not.toContain('Delete');
  });

  test('Администратор видит и то и другое', async () => {
    const items = await channelMenuItems('ADMIN');

    expect(items).toContain('Create a new post');
    expect(items).toContain('Channel settings');
    expect(items).toContain('Move / add to group');
    expect(items).toContain('Edit Time Slots');
    expect(items).toContain('Delete');
  });

  test('роль читается общей функцией, а не вторым мнением о том, кто такой редактор', () => {
    const text = source(MENU);
    expect(text).toContain('isOrganizationEditor');
    expect(text).toContain('isOrganizationAdmin');
    expect(text).not.toMatch(/role\s*===\s*'(ADMIN|EDITOR|USER)'/u);
  });
});

/* ------------------------------------------------------------- медиатека */

const MEDIA_ITEM = {
  id: 'media-1',
  path: 'probe.png',
  originalName: 'probe.png',
  name: 'probe.png',
  thumbnail: null,
  alt: null,
};

const loadMediaBox = (role) =>
  loadWithMocks(MEDIA, {
    react: React,
    swr: {
      __esModule: true,
      default: () => ({
        data: { results: [MEDIA_ITEM], pages: 1 },
        mutate: () => {},
        isLoading: false,
      }),
    },
    clsx: require('clsx'),
    lodash: require('lodash'),
    'react-sortablejs': stub,
    'use-debounce': { useDebounce: (value) => [value] },
    'zustand/react/shallow': { useShallow: (fn) => fn },
    '@prisma/client': {},
    '@uppy/react': stub,
    ...translation,
    '@contentfactory/react/form/input': stub,
    '@contentfactory/react/toaster/toaster': {
      useToaster: () => ({ show: () => {} }),
    },
    '@contentfactory/react/helpers/video.frame': stub,
    '@contentfactory/react/helpers/use.media.directory': {
      useMediaDirectory: () => ({ set: (value) => value }),
    },
    '@contentfactory/react/helpers/delete.dialog': { deleteDialog: () => {} },
    '@contentfactory/react/helpers/variable.context': {
      useVariables: () => ({ language: 'en' }),
    },
    '@contentfactory/helpers/utils/custom.fetch': { useFetch: () => () => {} },
    '@contentfactory/helpers/utils/has.extension': { hasExtension: () => false },
    '@contentfactory/frontend/components/media/new.uploader': {
      useUppyUploader: () => ({ on: () => {}, cancelAll: () => {} }),
    },
    '@contentfactory/frontend/components/layout/user.context': {
      useUser: () => ({ role }),
    },
    '@contentfactory/frontend/components/layout/drop.files': {
      DropFiles: ({ children }) => h('div', null, children),
    },
    '@contentfactory/frontend/components/layout/loading': stub,
    '@contentfactory/frontend/components/layout/new-modal': {
      useModals: () => ({
        openModal: () => {},
        closeAll: () => {},
        closeById: () => {},
        closeCurrent: () => {},
      }),
    },
    '@contentfactory/frontend/components/launches/ai.image': stub,
    '@contentfactory/frontend/components/launches/ai.video': stub,
    '@contentfactory/frontend/components/launches/helpers/use.values': {
      useSettings: () => ({}),
    },
    '@contentfactory/frontend/components/launches/helpers/media.settings.component':
      stub,
    '@contentfactory/frontend/components/third-parties/third-party.media': stub,
    '@contentfactory/frontend/components/third-parties/third-party.media-library':
      stub,
    '@contentfactory/frontend/components/new-launch/store': {
      useLaunchStore: () => () => {},
    },
    '@contentfactory/frontend/components/media/image-editor/image-editor-modal':
      stub,
    '@contentfactory/frontend/components/media/image-editor/upload-edited-media':
      { uploadEditedMedia: () => {} },
    '@contentfactory/frontend/components/media/image-editor/media-completion': {
      completeEditedMedia: () => {},
      completeMediaBoxEditorSave: () => {},
      replaceEditedAttachment: () => [],
    },
  });

const renderMediaBox = async (role) => {
  const { MediaBox } = loadMediaBox(role);
  await act(async () => {
    render(
      h(MediaBox, {
        setMedia: () => {},
        closeModal: () => {},
        standalone: true,
      })
    );
  });
};

describe('fn33.90.9 и .90.12 — библиотека медиа читается всеми, пополняет её редактор', () => {
  test('Пользователю «Загрузить» не нажимается и объяснена, а крестика удаления нет', async () => {
    await renderMediaBox('USER');

    const upload = screen.getByRole('button', { name: /Upload/ });
    expect(upload.disabled).toBe(true);

    const note = document.querySelector('[data-media-read-only="library"]');
    expect(note).not.toBeNull();
    // Причина не только видна, но и слышна: кнопка на неё ссылается.
    expect(upload.getAttribute('aria-describedby')).toBe(note.id);

    expect(document.querySelector('[data-testid="delete-media"]')).toBeNull();
    expect(document.body.innerHTML).not.toContain('DeleteCircleIcon');
    // Список остаётся читаемым — чтение библиотеки роли не несёт.
    expect(document.body.textContent).toContain('probe.png');
  });

  test.each([['EDITOR'], ['ADMIN']])(
    '%s загружает и удаляет как раньше',
    async (role) => {
      await renderMediaBox(role);

      expect(screen.getByRole('button', { name: /Upload/ }).disabled).toBe(
        false
      );
      expect(
        document.querySelector('[data-media-read-only="library"]')
      ).toBeNull();
    }
  );
});

/* ----------------------------------------------------------------- агент */

const loadAgent = (role) =>
  loadWithMocks(AGENT, {
    react: React,
    clsx: require('clsx'),
    lodash: require('lodash'),
    swr: { __esModule: true, default: () => ({ data: [] }) },
    'react-use-cookie': { __esModule: true, default: () => ['0', () => {}] },
    'next/link': { __esModule: true, default: Empty },
    'next/navigation': {
      useParams: () => ({}),
      usePathname: () => '/agents',
      useRouter: () => ({ push: () => {} }),
    },
    ...translation,
    '@contentfactory/helpers/utils/custom.fetch': { useFetch: () => () => {} },
    '@contentfactory/helpers/utils/use.wait.for.class': {
      useWaitForClass: () => false,
    },
    '@contentfactory/react/platform/platform.badge': stub,
    '@contentfactory/react/platform/platform.symbol': stub,
    '@contentfactory/react/layout': { OpeningBand: Empty },
    '@contentfactory/frontend/components/media/media.component': stub,
    '@contentfactory/frontend/components/launches/launches.component': {
      SVGLine: Empty,
    },
    '@contentfactory/frontend/components/layout/user.context': {
      useUser: () => ({ role }),
    },
  });

describe('fn33.90.6 — экран агента объясняет отказ вместо двух тихих 403', () => {
  test('Пользователь видит объяснение, а не пустой чат', async () => {
    const { Agent } = loadAgent('USER');
    await act(async () => {
      render(h(Agent, null, h('div', null, 'чат')));
    });

    expect(document.body.textContent).toContain('The agent writes posts');
    expect(document.body.textContent).toContain('editor role');
    // Обстановка вокруг пустоты не рисуется: разговора нет, значит нет и
    // ленты разговоров.
    expect(document.body.textContent).not.toContain('чат');
  });

  test.each([['EDITOR'], ['ADMIN']])('%s получает чат', async (role) => {
    const { Agent } = loadAgent(role);
    await act(async () => {
      render(h(Agent, null, h('div', null, 'чат')));
    });

    expect(document.body.textContent).toContain('чат');
    expect(document.body.textContent).not.toContain('The agent writes posts');
  });

  test('пункт «Агент» в левом меню Пользователю не показывается', () => {
    const { filterMenu } = loadWithMocks(TOP_MENU, {
      react: React,
      ...translation,
      '@contentfactory/react/helpers/variable.context': {
        useVariables: () => ({ isGeneral: true }),
      },
    });

    const items = [{ name: 'Agent', path: '/agents', requireEditor: true }];
    expect(filterMenu(items, { role: 'USER' }, false)).toHaveLength(0);
    expect(filterMenu(items, { role: 'EDITOR' }, false)).toHaveLength(1);
    expect(filterMenu(items, { role: 'ADMIN' }, false)).toHaveLength(1);
    // Незнакомая роль — не разрешение, ровно как в таблице уровней.
    expect(filterMenu(items, { role: 'WHATEVER' }, false)).toHaveLength(0);
  });
});

/* ------------------------------------------------- право записи из сеанса */

describe('fn33.90.8 — право записи известно из сеанса, а не из первого отказа', () => {
  test('роль читается заранее, тариф по-прежнему узнаётся из ответа', () => {
    const {
      writeRightFromRole,
      readWriteRight,
      WRITE_ALLOWED,
    } = loadWithMocks(WRITE_RIGHT, { react: React });

    expect(writeRightFromRole('USER')).toEqual({
      allowed: false,
      refusal: 'role',
    });
    expect(writeRightFromRole('EDITOR')).toEqual(WRITE_ALLOWED);
    expect(writeRightFromRole('ADMIN')).toEqual(WRITE_ALLOWED);
    expect(writeRightFromRole(undefined)).toEqual({
      allowed: false,
      refusal: 'role',
    });
    // Предел тарифа не считается в браузере и приходит только ответом.
    expect(readWriteRight({ status: 402 })).toEqual({
      allowed: false,
      refusal: 'plan',
    });
  });
});
