'use strict';

/**
 * Раздел «Помощь»: двенадцать вопросов и то, что легко сделать неправильно.
 *
 * `content-factory-next-zooh`, решение владельца 07.09.2026 (`m2eg.25`).
 * Вопросы не придуманы экраном — каждый прозвучал на живом прогоне, и ответ на
 * него жил в переписке. Поэтому первое, что здесь проверяется, — не разметка,
 * а то, что текст в продукте и текст в `docs/product/help-faq.md` совпадают
 * дословно. Ответ, который живёт в двух местах и разошёлся, хуже
 * отсутствующего: читающий поверит тому, который увидел первым, и никогда не
 * узнает, что был второй.
 *
 * Дальше — раскрытие. Строка обязана быть настоящей кнопкой с
 * `aria-expanded` и `aria-controls`: без этого клавиатура доедет до вопроса и
 * не сможет его открыть, а скринридер объявит заголовок, за которым, судя по
 * дереву, ничего нет. И состояние у каждой строки своё — открытие второго
 * вопроса не закрывает первый, потому что два ответа рядом читают чаще, чем
 * по одному.
 */

const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/help',
});
for (const key of ['window', 'document', 'navigator']) {
  Object.defineProperty(global, key, {
    configurable: true,
    value: key === 'window' ? dom.window : dom.window[key],
  });
}
global.IS_REACT_ACT_ENVIRONMENT = true;

const { cleanup, fireEvent, render } = require('@testing-library/react');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const FILES = {
  copy: 'apps/frontend/src/components/help/help.copy.ts',
  disclosure: 'apps/frontend/src/components/help/help-disclosure.tsx',
  screen: 'apps/frontend/src/components/help/help.screen.tsx',
  page: 'apps/frontend/src/app/(app)/(site)/help/page.tsx',
  menu: 'apps/frontend/src/components/layout/top.menu.tsx',
  doc: 'docs/product/help-faq.md',
};

const LOCALES = 'libraries/react-shared-libraries/src/translation/locales';

/** Язык, который читает экран. Меняется тестом перед отрисовкой. */
let language = 'ru';

const mocks = {
  'next/link': {
    __esModule: true,
    // `prefetch` — свойство роутера Next, а не атрибут DOM.
    default: ({ children, href, prefetch, ...rest }) =>
      React.createElement('a', { href, ...rest }, children),
  },
  '@contentfactory/react/helpers/variable.context': {
    useVariables: () => ({ language }),
  },
  '@contentfactory/react/translation/get.transation.service.client': {
    // Ровно то, что делает i18next: значение ключа на текущем языке, иначе
    // английская подпись по умолчанию.
    useT: () => (key, fallback) => {
      const bundle = JSON.parse(
        read(`${LOCALES}/${language}/translation.json`)
      );
      return bundle[key] ?? fallback;
    },
  },
};

const { HelpScreen } = loadWithMocks(FILES.screen, mocks);
const { helpCopy, HELP_QUESTION_IDS, HELP_CONTENT_HREF, HELP_ONBOARDING_HREF } =
  loadWithMocks(FILES.copy, mocks);

afterEach(() => {
  cleanup();
  language = 'ru';
});

const draw = () => render(React.createElement(HelpScreen, {}));
const rows = () => [...document.querySelectorAll('[data-help-question]')];
const rowFor = (id) => document.querySelector(`[data-help-question="${id}"]`);
const regionFor = (id) =>
  document
    .querySelector(`[data-help-answer="${id}"]`)
    .closest('[role="region"]');

/* ------------------------------------------------- текст и его источник */

/**
 * Разделы документа, которые являются вопросами. «Где в коде» — указатель, а
 * не вопрос, и в счёт не идёт: вопрос узнаётся по знаку в конце заголовка.
 */
const docQuestions = () =>
  read(FILES.doc)
    .split(/^## /m)
    .slice(1)
    .map((section) => {
      const lines = section.split('\n');
      return {
        question: lines[0].trim(),
        answer: lines.slice(1).join('\n').trim(),
      };
    })
    .filter((section) => section.question.endsWith('?'));

/** Обратные кавычки — разметка документа, переносы строк — его ширина. */
const normalize = (text) => text.replace(/`/g, '').replace(/\s+/g, ' ').trim();

describe('текст раздела и документ говорят одно и то же', () => {
  test('в документе ровно двенадцать вопросов, и они в том же порядке', () => {
    expect(docQuestions().map((section) => section.question)).toEqual(
      helpCopy.ru.questions.map((item) => item.question)
    );
  });

  test('каждый ответ совпадает с документом дословно', () => {
    const divergent = [];
    const fromDoc = docQuestions();
    helpCopy.ru.questions.forEach((item, index) => {
      const inDoc = fromDoc[index];
      if (!inDoc) return;
      if (normalize(inDoc.answer) !== normalize(item.answer)) {
        divergent.push(item.id);
      }
    });

    expect({
      divergent,
      hint: divergent.length
        ? `Ответ разошёлся с docs/product/help-faq.md: ${divergent.join(
            ', '
          )}. Документ — источник; правка идёт в оба файла одним коммитом.`
        : 'в согласии',
    }).toEqual({ divergent: [], hint: 'в согласии' });
  });

  test('английский набор — те же двенадцать и ничего не пустует', () => {
    expect(helpCopy.en.questions.map((item) => item.id)).toEqual([
      ...HELP_QUESTION_IDS,
    ]);
    expect(helpCopy.ru.questions.map((item) => item.id)).toEqual([
      ...HELP_QUESTION_IDS,
    ]);
    for (const item of helpCopy.en.questions) {
      expect(item.question.length).toBeGreaterThan(0);
      expect(item.answer.length).toBeGreaterThan(0);
    }
    // Перевод, а не копия русского текста.
    for (const item of helpCopy.en.questions) {
      expect(item.answer).not.toMatch(/[А-Яа-яЁё]/);
    }
  });
});

/* --------------------------------------------------------------- экран */

describe('экран показывает все двенадцать вопросов', () => {
  test('каждый вопрос нарисован, в порядке списка', () => {
    draw();
    expect(rows().map((row) => row.dataset.helpQuestion)).toEqual([
      ...HELP_QUESTION_IDS,
    ]);
    for (const item of helpCopy.ru.questions) {
      expect(rowFor(item.id).textContent).toContain(item.question);
    }
  });

  test('ответы на месте и связаны со своими вопросами', () => {
    draw();
    for (const item of helpCopy.ru.questions) {
      const answer = document.querySelector(`[data-help-answer="${item.id}"]`);
      expect(answer.textContent).toBe(item.answer);
      const region = regionFor(item.id);
      expect(region.getAttribute('aria-labelledby')).toBe(rowFor(item.id).id);
      expect(rowFor(item.id).getAttribute('aria-controls')).toBe(region.id);
    }
  });

  test('первый вопрос раскрыт, остальные закрыты', () => {
    draw();
    const [first, ...rest] = rows();
    expect(first.getAttribute('aria-expanded')).toBe('true');
    expect(regionFor(first.dataset.helpQuestion).hidden).toBe(false);
    for (const row of rest) {
      expect(row.getAttribute('aria-expanded')).toBe('false');
      expect(regionFor(row.dataset.helpQuestion).hidden).toBe(true);
    }
  });

  test('нажатие раскрывает закрытый вопрос и не трогает соседей', () => {
    draw();
    const [first, second] = rows();

    fireEvent.click(second);

    expect(second.getAttribute('aria-expanded')).toBe('true');
    expect(regionFor(second.dataset.helpQuestion).hidden).toBe(false);
    // Состояние у каждой строки своё: открытый первый вопрос остаётся открытым.
    expect(first.getAttribute('aria-expanded')).toBe('true');
    expect(regionFor(first.dataset.helpQuestion).hidden).toBe(false);
  });

  test('повторное нажатие закрывает вопрос', () => {
    draw();
    const [first] = rows();

    fireEvent.click(first);

    expect(first.getAttribute('aria-expanded')).toBe('false');
    expect(regionFor(first.dataset.helpQuestion).hidden).toBe(true);
  });

  test('вопрос — настоящая кнопка, до неё доезжает клавиатура', () => {
    draw();
    for (const row of rows()) {
      expect(row.tagName).toBe('BUTTON');
      expect(row.getAttribute('type')).toBe('button');
      expect(row.hasAttribute('disabled')).toBe(false);
    }
  });

  test('заголовок и подпись — на языке экрана', () => {
    draw();
    const heading = document.querySelector('h1');
    expect(heading.textContent).toBe('Помощь');
    expect(document.body.textContent).toContain(helpCopy.ru.pageLead);

    cleanup();
    language = 'en';
    draw();
    expect(document.querySelector('h1').textContent).toBe('Help');
    expect(document.body.textContent).toContain(helpCopy.en.pageLead);
    expect(rowFor('roles').textContent).toContain(
      helpCopy.en.questions.find((item) => item.id === 'roles').question
    );
  });

  test('строка «Где найти» ведёт на существующие адреса', () => {
    draw();
    expect(document.querySelector('[data-help-link="content"]').textContent).toBe(
      helpCopy.ru.whereContent
    );
    expect(
      document
        .querySelector('[data-help-link="onboarding"]')
        .getAttribute('href')
    ).toBe(HELP_ONBOARDING_HREF);
    expect(
      document.querySelector('[data-help-link="content"]').getAttribute('href')
    ).toBe(HELP_CONTENT_HREF);
    // Оба адреса — экраны, которые уже есть в дереве маршрутов.
    expect(
      fs.existsSync(
        path.join(root, 'apps/frontend/src/app/(app)/(site)/settings/page.tsx')
      )
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(root, 'apps/frontend/src/app/(app)/(site)/content/page.tsx')
      )
    ).toBe(true);

    cleanup();
    language = 'en';
    draw();
    expect(document.querySelector('[data-help-link="content"]').textContent).toBe(
      helpCopy.en.whereContent
    );
  });
});

/* ------------------------------------------------- пункт меню и маршрут */

describe('дверь в раздел', () => {
  const menu = () => read(FILES.menu);

  test('пункт «Помощь» стоит последним в рабочем меню', () => {
    const source = menu();
    const help = source.indexOf("path: '/help'");
    expect(help).toBeGreaterThan(-1);
    // После последнего пункта рабочей группы и до административной, которую
    // сидбар рисует отдельным блоком.
    expect(help).toBeGreaterThan(source.indexOf("path: '/third-party'"));
    expect(help).toBeLessThan(source.indexOf("path: '/billing'"));
  });

  test('пункт виден каждой роли и не прячется', () => {
    const source = menu();
    const start = source.indexOf("name: t('help', 'Help')");
    expect(start).toBeGreaterThan(-1);
    const item = source.slice(start, source.indexOf("path: '/help'", start));
    for (const gate of ['role:', 'requireEditor', 'requireBilling', 'hide:']) {
      expect(item).not.toContain(gate);
    }
  });

  test('заголовок вкладки браузера берётся тем же ключом', () => {
    expect(read(FILES.page)).toContain(
      "export const generateMetadata = pageTitle('help', 'Help');"
    );
  });

  test('ключ `help` есть во всех шестнадцати локалях и переведён на русский', () => {
    const locales = fs.readdirSync(path.join(root, LOCALES)).sort();
    expect(locales.length).toBe(16);

    const missing = [];
    for (const locale of locales) {
      const bundle = JSON.parse(read(`${LOCALES}/${locale}/translation.json`));
      if (typeof bundle.help !== 'string' || !bundle.help.trim()) {
        missing.push(locale);
      }
    }
    expect(missing).toEqual([]);

    const ru = JSON.parse(read(`${LOCALES}/ru/translation.json`));
    expect(ru.help).toBe('Помощь');
    const en = JSON.parse(read(`${LOCALES}/en/translation.json`));
    expect(en.help).toBe('Help');
  });
});

/* ------------------------------------------------------------ материал */

describe('раскрывашка написана на общих примитивах', () => {
  test('строку рисует общая кнопка, а не своя разметка', () => {
    const source = read(FILES.disclosure);
    expect(source).toContain(
      "from '@contentfactory/frontend/components/ui/disclosure'"
    );
    expect(source).not.toMatch(/<button[\s>]/);
    // Своей краски у неё нет: цвета приходят токенами `cf`.
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  test('экран берёт каркас у общих примитивов', () => {
    expect(read(FILES.screen)).toContain("from '@contentfactory/react/layout'");
  });
});
