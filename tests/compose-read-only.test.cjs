'use strict';

/**
 * Окно поста, открытое на чтение (`content-factory-next-fn33.90.10`).
 *
 * Живой прогон 05.09.2026 под ролью USER. Подпись «Этот пост можно читать, но
 * не менять» стояла, «Сохранить как черновик» и «Обновить» были выключены в
 * разметке — и на этом честность окна кончалась. Поле текста принимало ввод:
 * человек допечатал « ПРОБА», счётчик ушёл с 35 на 41 из 4096. Панель
 * начертаний, «Вставить медиа», «Добавить новый тег», «Повтор», этап «План» и
 * дата работали. Сама «Обновить» была нарисована тем же зелёным, что и рабочая
 * кнопка: `disabled:opacity-80` поверх общего `disabled:opacity-50` — разницы
 * в 20% никто не увидит. Заголовок окна над уже написанным постом читался
 * «Создать пост».
 *
 * Здесь два уровня. Четыре контрола проверяются нажатием: выключенный контрол
 * не только не нажимается, но и не открывает список — выбрать было бы можно, а
 * сохранить нет. Проводка окна проверяется по исходнику: собрать `manage.modal`
 * целиком в jsdom значит поднять хранилище, типтап и загрузчик, и набор станет
 * про них, а не про роль.
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

const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const MANAGE = 'apps/frontend/src/components/new-launch/manage.modal.tsx';
const EDITOR = 'apps/frontend/src/components/new-launch/editor.tsx';
const TAGS = 'apps/frontend/src/components/launches/tags.component.tsx';
const REPEAT = 'apps/frontend/src/components/launches/repeat.component.tsx';
const STAGE = 'apps/frontend/src/components/launches/editorial-stage.select.tsx';
const DATE = 'apps/frontend/src/components/launches/helpers/date.picker.tsx';

const translation = {
  '@contentfactory/react/translation/get.transation.service.client': {
    useT: () => (_key, fallback) => fallback,
  },
};

const clickOutside = { '@mantine/hooks': { useClickOutside: () => ({ current: null }) } };

afterEach(() => {
  cleanup();
});

const { TagsComponentInner } = loadWithMocks(TAGS, {
  react: React,
  clsx: require('clsx'),
  swr: { __esModule: true, default: () => ({ data: { tags: [] } }) },
  lodash: require('lodash'),
  'react-tag-autocomplete': stub,
  ...clickOutside,
  ...translation,
  '@contentfactory/helpers/utils/custom.fetch': { useFetch: () => () => {} },
  '@contentfactory/frontend/components/layout/new-modal': {
    useModals: () => ({ openModal: () => {} }),
  },
});

const { RepeatComponent } = loadWithMocks(REPEAT, {
  react: React,
  ...clickOutside,
  ...translation,
});

const { EditorialStageSelect } = loadWithMocks(STAGE, {
  react: React,
  ...clickOutside,
  '@contentfactory/react/helpers/variable.context': {
    useVariables: () => ({ language: 'ru' }),
  },
});

const { DatePicker } = loadWithMocks(DATE, {
  react: React,
  clsx: require('clsx'),
  dayjs: require('dayjs'),
  '@mantine/dates': { Calendar: Empty, TimeInput: Empty },
  ...clickOutside,
  ...translation,
  '@contentfactory/frontend/components/layout/set.timezone': {
    newDayjs: require('dayjs'),
  },
});

const dayjs = require('dayjs');

/** Рисует контрол и возвращает его кнопку. */
const control = async (element) => {
  await act(async () => {
    render(element);
  });
  return document.querySelector('button');
};

describe('fn33.90.10 — тег, повтор, этап и дата на чтении не притворяются рабочими', () => {
  test.each([
    [
      'тег',
      (disabled) =>
        h(TagsComponentInner, {
          name: 'tags',
          label: 'Tags',
          initial: [],
          allTags: { tags: [] },
          mutate: async () => {},
          onChange: () => {},
          disabled,
        }),
    ],
    [
      'повтор',
      (disabled) =>
        h(RepeatComponent, { repeat: null, onChange: () => {}, disabled }),
    ],
    [
      'этап',
      (disabled) =>
        h(EditorialStageSelect, {
          value: 'PLAN',
          onChange: () => {},
          disabled,
        }),
    ],
  ])('%s: выключен и по нажатию не открывает список', async (_name, make) => {
    const button = await control(make(true));
    expect(button.disabled).toBe(true);

    await act(async () => {
      button.click();
    });
    expect(document.querySelector('[role="menu"]')).toBeNull();

    cleanup();

    const live = await control(make(false));
    expect(live.disabled).toBe(false);
    await act(async () => {
      live.click();
    });
    expect(document.querySelector('[role="menu"]')).not.toBeNull();
  });

  test('дата: календарь не открывается и состояние объявлено', async () => {
    await act(async () => {
      render(
        h(DatePicker, {
          date: dayjs('2026-09-05T10:00:00'),
          onChange: () => {},
          disabled: true,
        })
      );
    });

    const field = document.querySelector('[aria-disabled="true"]');
    expect(field).not.toBeNull();
    expect(field.className).toContain('cursor-not-allowed');

    await act(async () => {
      field.click();
    });
    // Открытая панель приносит с собой кнопку «Close»; закрытая — ничего.
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  });
});

describe('fn33.90.10 — окно поста передаёт запрет всем органам управления', () => {
  const manage = read(MANAGE);
  const editor = read(EDITOR);

  test('четыре контрола получают запрет из одного выражения', () => {
    for (const control of [
      'TagsComponent',
      'RepeatComponent',
      'EditorialStageSelect',
      'DatePicker',
    ]) {
      const opening = manage.indexOf(`<${control}`);
      expect(opening).toBeGreaterThan(-1);
      const block = manage.slice(opening, manage.indexOf('/>', opening));
      expect(block).toContain('disabled={!canWritePosts}');
    }
  });

  test('редактор текста получает тот же запрет и снимает `contenteditable`', () => {
    expect(manage).toMatch(/<EditorWrapper[\s\S]*?readOnly=\{!canWritePosts\}/);
    // Tiptap рисует `contenteditable`; выключается он `editable`, а не рамкой.
    expect(editor).toContain('editable: !readOnly');
    expect(editor).toContain('editor.setEditable(!readOnly)');
    // Перетаскивание файла в текст — тоже запись.
    expect(editor).toContain('disabled: readOnly');
  });

  test('«Обновить» на чтении выглядит выключенной, а не просто не работает', () => {
    // 80% непрозрачности поверх общего disabled-состояния — это и есть та
    // разница, которой не видно. Общее правило кнопки даёт 50%.
    expect(manage).not.toContain('disabled:opacity-80');
  });

  test('заголовок окна называет то, что человек делает', () => {
    expect(manage).toContain("t('edit_post_title', 'Edit Post')");
    expect(manage).toContain("t('view_post_title', 'Post')");
    // «Создать пост» остаётся ровно у нового поста.
    expect(manage).toMatch(
      /!existingData\?\.integration\s*\?\s*t\('create_post_title'/
    );
  });

  test('причина запрета не только видна, но и слышна', () => {
    expect(manage).toContain('COMPOSE_BLOCK_REASON_NOTE_ID');
    expect(manage).toMatch(/aria-describedby=\{[\s\S]*?COMPOSE_BLOCK_REASON_NOTE_ID/);
  });

  test('помощник и удаление поста Пользователю не предлагаются', () => {
    expect(manage).toContain('assistantAvailable && canWritePosts');
    expect(manage).toContain('existingData?.integration && canWritePosts');
  });
});
