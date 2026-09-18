'use strict';

/**
 * Слова раздела «Контент» — два языка в одном файле, и оба обязаны быть полными.
 *
 * `content-factory-next-97dq.4`: до этой волны половина слов проверки жила
 * тернарниками `ru ? … : …` прямо в `adaptation-review.tsx`. Тернарник
 * невозможно забыть наполовину — он всегда несёт обе стороны. Словарь можно, и
 * тогда английский экран печатает `undefined` там, где русский печатает фразу.
 * Это и есть цена переезда, и вот проверка, которая её оплачивает.
 *
 * Тот же приём, что у `tests/editorial-stage.frontend-copy-parity.test.cjs`:
 * сравниваются ключи, а не переводы, плюс несколько фраз, которые владелец
 * назвал дословно 18.09.2026 и которые пересказ испортит.
 */

const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const { piecesCopy } = loadTypeScriptModule(
  'apps/frontend/src/components/content-intelligence/pieces/pieces.copy.ts'
);

const keys = (locale) => Object.keys(piecesCopy[locale]).sort();

describe('the two languages carry the same keys', () => {
  test('no key exists in one language only', () => {
    expect(keys('en')).toEqual(keys('ru'));
  });

  test('every value is a string or a function, never an empty one', () => {
    for (const locale of ['ru', 'en']) {
      for (const [key, value] of Object.entries(piecesCopy[locale])) {
        if (typeof value === 'function') {
          expect(value.length).toBeGreaterThan(0);
          continue;
        }
        expect(typeof value).toBe('string');
        expect(value.trim()).not.toBe('');
      }
    }
  });

  test('a key that takes arguments takes them in both languages', () => {
    for (const key of keys('ru')) {
      expect(typeof piecesCopy.en[key]).toBe(typeof piecesCopy.ru[key]);
      if (typeof piecesCopy.ru[key] === 'function')
        expect(piecesCopy.en[key].length).toBe(piecesCopy.ru[key].length);
    }
  });
});

describe('the words the owner named are these words, not a paraphrase', () => {
  test('the menu says what it will do to the text', () => {
    expect(piecesCopy.ru.removeAiTells).toBe('Убрать следы ИИ');
    expect(piecesCopy.ru.removeAiTellsDescription).toBe(
      'Найдём обороты, по которым текст читается как написанный ИИ, и предложим правки. Штампы уберём заодно.'
    );
    expect(piecesCopy.ru.regenerateDescription).toBe(
      'Скажете, что поменять: заголовок, абзац или весь текст.'
    );
    expect(piecesCopy.ru.compareCoreDescription).toBe(
      'Проверим, что пост говорит то же, что заготовка, и ничего не добавил от себя.'
    );
    expect(piecesCopy.ru.reviewBothDescription).toBe(
      'Следы ИИ и сверка с сутью за один проход.'
    );
    expect(piecesCopy.ru.checkFactsSearchDescription).toBe(
      'Найдём источники по каждому числу и дате.'
    );
  });

  test('the spend sentence no longer promises the first 5000 characters', () => {
    expect(piecesCopy.ru.checkFactsSpend).toBe(
      'Поиск и ИИ могут расходовать включённый лимит или средства подключённого провайдера. Источники могут охватить не все утверждения.'
    );
    expect(piecesCopy.ru.checkFactsSpend).not.toMatch(/5000/);
    expect(piecesCopy.en.checkFactsSpend).not.toMatch(/5000/);
  });

  test('the tick is honest about the text that is already written', () => {
    expect(piecesCopy.ru.textSourcesHint).toContain(
      'Отмеченные строки идут в адаптации и в следующую переписку сути. Уже написанный текст галочка не меняет.'
    );
  });

  test('one sentence about catalog findings serves both surfaces', () => {
    expect(piecesCopy.ru.slopBeforeAfter(2, 0)).toBe(
      'Штампов по каталогу: было 2 → стало 0'
    );
  });

  /*
    Решение владельца 13.09.2026: продукт говорит «мы» или «ИИ». «Модель»
    остаётся настройкам ИИ, где она и правда выбирается по имени.
    Здесь спрошено с тех слов, которые переехали в эту волну; остальные
    ждут `content-factory-next-97dq.7` и своего общего стража.
  */
  const REVIEW_KEYS = [
    'reviewWhy',
    'reviewIncomplete',
    'researchIncomplete',
    'researchStale',
    'publish',
    'regenerate',
    'regenerateDescription',
    'addResearch',
    'checkFacts',
    'checkFactsSearch',
    'checkFactsSearchDescription',
    'checkFactsSpendLabel',
    'checkFactsSpend',
    'reviewMenu',
    'removeAiTells',
    'removeAiTellsDescription',
    'compareCore',
    'compareCoreDescription',
    'reviewBoth',
    'reviewBothDescription',
    'lastChoice',
    'rewritePrompt',
    'rewriteOnlyTitle',
    'rewriteWholeText',
    'regenerating',
    'cancelAction',
    'findingSources',
    'runResearch',
    'researchDirection',
    'researchDirectionExample',
    'saving',
    'reviewing',
    'noChangesNeeded',
    'slopBeforeAfter',
    'slopCatalogNote',
    'typoPrefix',
    'acceptSelected',
    'leaveUnchanged',
    'searchSources',
    'showMarkup',
    'hideMarkup',
    'textSourcesTitle',
    'textSourcesHintLabel',
    'textSourcesHint',
  ];

  test('none of the words that moved here in this wave names a model', () => {
    for (const key of REVIEW_KEYS) {
      for (const locale of ['ru', 'en']) {
        const value = piecesCopy[locale][key];
        expect(value).toBeDefined();
        const text = typeof value === 'function' ? value(1, 2) : value;
        expect(text).not.toMatch(/модел/i);
      }
    }
  });
});
