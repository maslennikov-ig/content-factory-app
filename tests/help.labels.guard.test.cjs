'use strict';

/**
 * Раздел «Помощь» называет только те подписи, которые экран правда показывает.
 *
 * `content-factory-next-2q28.8`, 25.09.2026. Ответы помощи велели открыть
 * меню «Ещё ▾», нажать «Перегенерировать» и найти вкладку «ИИ» — всего этого
 * на экранах уже не было. Каждый раз экран меняли, а ответ оставался, и
 * `tests/help.screen.test.cjs` этого видеть не мог: он сверяет помощь с
 * `docs/product/help-faq.md`, то есть текст с текстом, а не текст с продуктом.
 *
 * Здесь каждая подпись в «ёлочках» из русского вопроса и ответа ищется в
 * русских словах продукта — целой строкой или в «ёлочках» внутри строки:
 * значениях русской локали и строковых литералах
 * фронтенда и общих React-библиотек (там живут `*.copy.ts` и слова, выписанные
 * прямо в компонентах, как у `channel-plan-mode.tsx`). Комментарии не
 * считаются: в них старые подписи живут годами, и по ним тест бы прошёл.
 * Путь «Настройки → Способы входа» проверяется по частям.
 *
 * Подпись, которой нет в продукте, может быть только чужой — например,
 * настройкой самого Telegram. Такие стоят в списке ниже с причиной, и список
 * держится в обе стороны: новая чужая подпись должна попасть в него явно, а
 * запись, которая больше не нужна, должна из него уйти.
 */

const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');

const root = path.resolve(__dirname, '..');

const HELP_COPY = 'apps/frontend/src/components/help/help.copy.ts';
const RU_LOCALE =
  'libraries/react-shared-libraries/src/translation/locales/ru/translation.json';
const SOURCE_ROOTS = [
  'apps/frontend/src',
  'libraries/react-shared-libraries/src',
];

/**
 * Файлы, чьи русские строки — не подписи продукта: сцены стенда и витрины
 * держат выдуманные данные, а сам раздел помощи не может подтверждать себя.
 */
const NOT_PRODUCT_WORDS = [
  /(^|\/)help\/help\.copy\.ts$/,
  /\.review-scenes?\.tsx?$/,
  /\.showcase\.tsx?$/,
  /(^|\/)interface-review\//,
  /\.(test|spec|stories)\.tsx?$/,
];

/** Подписи чужих экранов, которые помощь называет по делу. */
const FOREIGN_LABELS = new Map([
  [
    'Подписывать сообщения',
    'Настройка самого канала в Telegram, а не экран продукта.',
  ],
]);

const normalize = (text) =>
  text.replace(/ /g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

const CYRILLIC = /[А-Яа-яЁё]/;

/** Каждая строка из кода: литералы, куски шаблонов и текст JSX. */
const literalsOf = (file) => {
  const text = fs.readFileSync(file, 'utf8');
  const source = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    false,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const found = [];
  const visit = (node) => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      node.kind === ts.SyntaxKind.TemplateHead ||
      node.kind === ts.SyntaxKind.TemplateMiddle ||
      node.kind === ts.SyntaxKind.TemplateTail ||
      node.kind === ts.SyntaxKind.JsxText
    ) {
      if (CYRILLIC.test(node.text)) found.push(normalize(node.text));
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
};

const walk = (dir, out = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      walk(full, out);
    } else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
};

const productWords = () => {
  const words = Object.values(
    JSON.parse(fs.readFileSync(path.join(root, RU_LOCALE), 'utf8'))
  )
    .filter((value) => typeof value === 'string')
    .map(normalize);
  for (const base of SOURCE_ROOTS) {
    for (const file of walk(path.join(root, base))) {
      const relative = path.relative(root, file).split(path.sep).join('/');
      if (NOT_PRODUCT_WORDS.some((pattern) => pattern.test(relative))) continue;
      words.push(...literalsOf(file));
    }
  }
  return words;
};

/** Подписи в «ёлочках»; путь «А → Б» — это две подписи. */
const quotedLabels = (text) =>
  [...text.matchAll(/«([^«»]+)»/g)]
    .flatMap((match) => match[1].split(/\s+→\s+/))
    .map((label) => label.trim())
    .filter(Boolean);

const { helpCopy } = loadWithMocks(HELP_COPY, {});

/**
 * Подпись совпадает со строкой продукта целиком — кнопка, вкладка, заголовок,
 * фраза экрана — или стоит внутри неё в тех же «ёлочках». Просто кусок
 * строки не годится: «Перегенерировать» нашлось бы в «Что перегенерировать?»,
 * хотя такой кнопки давно нет.
 */
const edges = /^[\s.,:;!?…]+|[\s.,:;!?…]+$/g;
const bare = (text) => normalize(text).replace(edges, '');

const labelIndex = (words) => {
  const whole = new Set();
  for (const value of words) {
    whole.add(bare(value));
    for (const match of value.matchAll(/«([^«»]+)»/g)) whole.add(bare(match[1]));
  }
  return whole;
};

describe('помощь называет подписи, которые есть на экранах', () => {
  const index = labelIndex(productWords());
  const exists = (label) => index.has(bare(label));

  test('в словах продукта есть что искать', () => {
    // Сбор, который ничего не нашёл, пропустил бы любую подпись.
    for (const known of ['Переписать по настройкам', 'Какими ключами работаем']) {
      expect(exists(known)).toBe(true);
    }
  });

  test('каждая подпись из русского вопроса и ответа есть в продукте', () => {
    const missing = [];
    for (const item of helpCopy.ru.questions) {
      for (const label of quotedLabels(`${item.question}\n${item.answer}`)) {
        if (FOREIGN_LABELS.has(label) || exists(label)) continue;
        missing.push(`${item.id}: «${label}»`);
      }
    }
    expect({
      missing,
      hint: missing.length
        ? 'Помощь называет подпись, которой нет ни в русской локали, ни в строках фронтенда. Поправьте ответ по экрану (и docs/product/help-faq.md тем же коммитом); чужую подпись, например Telegram, внесите в FOREIGN_LABELS с причиной.'
        : 'все на месте',
    }).toEqual({ missing: [], hint: 'все на месте' });
  });

  test('список чужих подписей не держит лишнего', () => {
    const quoted = new Set(
      helpCopy.ru.questions.flatMap((item) =>
        quotedLabels(`${item.question}\n${item.answer}`)
      )
    );
    const stale = [...FOREIGN_LABELS.keys()].filter(
      (label) => !quoted.has(label) || exists(label)
    );
    expect(stale).toEqual([]);
    for (const reason of FOREIGN_LABELS.values()) {
      expect(reason.trim().length).toBeGreaterThan(0);
    }
  });
});
