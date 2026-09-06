'use strict';

/**
 * Восьми слов подряд из чужого поста в нашем не бывает.
 *
 * `content-factory-next-tu3k.3`. Проверяется ровно то, за что правило отвечает:
 * порог (семь — не находка, восемь — находка), слияние соседних совпадений в
 * один отрезок, безразличие к регистру, «ё» и знакам препинания, и главное —
 * что границы указывают в исходную строку, а не в её очищенную копию. Без
 * последнего подсветить перенос в редакторе нельзя.
 */

const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const MODULE =
  'libraries/nestjs-libraries/src/content-intelligence/text-quality/anti-copy.ts';

const {
  ANTI_COPY_MIN_WORDS,
  normalisedWords,
  wordShingles,
  sharedRuns,
  antiCopyReport,
} = loadTypeScriptModule(MODULE);

/** Восемь слов подряд, ровно порог. */
const EIGHT = 'склад показывает остатки в реальном времени каждый день';
/** Те же слова без последнего: семь. */
const SEVEN = 'склад показывает остатки в реальном времени каждый';

const foreignOf = (text) => new Set(wordShingles(text));

describe('порог: семь слов — совпадение речи, восемь — перенос', () => {
  test('восемь слов подряд', () => {
    expect(ANTI_COPY_MIN_WORDS).toBe(8);
  });

  test('семь общих слов ничего не находят', () => {
    const foreign = foreignOf(`Мы решили, что ${SEVEN} год.`);
    const report = antiCopyReport(`У нас ${SEVEN} месяц.`, foreign, {});

    expect(report.clean).toBe(true);
    expect(report.runs).toEqual([]);
    expect(report.minWords).toBe(8);
    expect(report.retried).toBe(false);
  });

  test('восемь общих слов дают один отрезок', () => {
    const foreign = foreignOf(`В отчёте сказано: ${EIGHT}.`);
    const runs = sharedRuns(`Итог простой. ${EIGHT}. Это всё.`, foreign);

    expect(runs).toHaveLength(1);
    expect(normalisedWords(runs[0].text)).toHaveLength(8);
  });

  test('чужого текста нет — находок нет', () => {
    expect(sharedRuns(`Итог. ${EIGHT}.`, new Set())).toEqual([]);
    expect(sharedRuns(`Итог. ${EIGHT}.`, [])).toEqual([]);
  });
});

describe('соседние совпадения сливаются в один отрезок', () => {
  test('шестнадцать перенесённых слов — одна находка, а не девять', () => {
    const stolen = `${EIGHT} и ещё восемь слов подряд из того же поста`;
    const foreign = foreignOf(`Чужой пост: ${stolen}.`);

    const runs = sharedRuns(`Начало своё. ${stolen}. Конец свой.`, foreign);

    expect(runs).toHaveLength(1);
    expect(normalisedWords(runs[0].text).length).toBeGreaterThanOrEqual(16);
  });

  test('два отрезка через свой текст остаются двумя', () => {
    const second = 'поставщик держит график поставок вторую неделю без единого срыва';
    const foreign = new Set([
      ...wordShingles(EIGHT),
      ...wordShingles(second),
    ]);

    const runs = sharedRuns(
      `${EIGHT}. Дальше я пишу своими словами про цех. ${second}.`,
      foreign
    );

    expect(runs).toHaveLength(2);
    expect(runs[0].start).toBeLessThan(runs[1].start);
  });
});

describe('различия набора совпадением не считаются', () => {
  test('регистр, «ё» и знаки препинания не мешают', () => {
    const foreign = foreignOf('Всё чётко: склад, остатки и сроки видны сразу.');

    const runs = sharedRuns(
      'ВСЕ ЧЕТКО — склад; остатки, и сроки видны сразу!',
      foreign
    );

    expect(runs).toHaveLength(1);
  });

  test('нормализация слов сводит «ё» к «е» и снимает регистр', () => {
    expect(normalisedWords('Всё Чётко, ага!')).toEqual(['все', 'четко', 'ага']);
  });

  test('окна чужого текста не повторяются', () => {
    const repeated = `${EIGHT} ${EIGHT}`;
    const shingles = wordShingles(repeated);

    expect(new Set(shingles).size).toBe(shingles.length);
  });

  test('текста короче окна не хватает на отпечаток', () => {
    expect(wordShingles(SEVEN)).toEqual([]);
  });
});

describe('границы указывают в исходную строку', () => {
  test('текст находки — это срез кандидата по её же числам', () => {
    const foreign = foreignOf(`Источник пишет: ${EIGHT}.`);
    const candidate = `Мой зачин. ${EIGHT}. Мой вывод.`;

    const [run] = sharedRuns(candidate, foreign);

    expect(candidate.slice(run.start, run.end)).toBe(run.text);
    expect(run.start).toBeGreaterThan(0);
    expect(run.end).toBeLessThanOrEqual(candidate.length);
  });

  test('HTML из редактора: перенос находится, числа остаются в исходной разметке', () => {
    const foreign = foreignOf(`Чужой пост. ${EIGHT}.`);
    const candidate = `<p>Мой зачин.</p><p><strong>${EIGHT}</strong>.</p>`;

    const [run] = sharedRuns(candidate, foreign);

    expect(run).toBeDefined();
    // Срез по этим числам попадает в тот же HTML, а не в его очищенную копию:
    // иначе подсветка в редакторе уехала бы на длину каждого тега.
    expect(candidate.slice(run.start, run.end)).toBe(run.text);
    expect(run.text).not.toContain('<');
  });

  test('теги и сущности не становятся словами', () => {
    expect(normalisedWords('<p>раз&nbsp;два</p>')).toEqual(['раз', 'два']);
  });
});

describe('отчёт для квитанции', () => {
  test('повторный заход отмечен, а находка осталась', () => {
    const foreign = foreignOf(`Чужой пост. ${EIGHT}.`);

    const report = antiCopyReport(`Мой зачин. ${EIGHT}.`, foreign, {
      retried: true,
    });

    expect(report).toMatchObject({ minWords: 8, retried: true, clean: false });
    expect(report.runs).toHaveLength(1);
  });

  test('порог можно опустить, и тогда находкой станут пять слов', () => {
    const foreign = new Set(wordShingles('склад остатки сроки видны сразу', 5));

    const report = antiCopyReport('Итог: склад остатки сроки видны сразу.', foreign, {
      minWords: 5,
    });

    expect(report.minWords).toBe(5);
    expect(report.clean).toBe(false);
  });
});
