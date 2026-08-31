'use strict';

/**
 * Ranking and the operating point, kept apart on purpose.
 *
 * The epic carried two numbers that looked like a contradiction: the paired
 * test separated the author from generated text in 64.4% of pairs, and the
 * threshold rejected one generation in twenty-four. They are not in conflict —
 * they are an AUC and a miss rate, and reading them as one number is what sent
 * an earlier session to repair a threshold while the question was whether the
 * feature ranks at all.
 *
 * What this file holds is the arithmetic of telling them apart, plus the two
 * properties the relative decision has to keep: a vote is bounded, and the
 * impostors are built from disjoint text so that three prints are three
 * opinions rather than one opinion three times.
 */

const {
  auc,
  operatingPoint,
  chunk,
  stripMarkdown,
  impostorPrints,
  CONTROL_FILES,
} = require('../scripts/evidence/voice-eval/discrimination.cjs');

describe('AUC отвечает на вопрос «ранжирует ли признак»', () => {
  it('полное разделение — единица', () => {
    expect(auc([0.1, 0.2, 0.3], [0.7, 0.8])).toBe(1);
  });

  it('полное разделение наоборот — ноль', () => {
    expect(auc([0.7, 0.8], [0.1, 0.2, 0.3])).toBe(0);
  });

  it('совпадающие распределения — монета', () => {
    expect(auc([0.5, 0.5], [0.5, 0.5])).toBe(0.5);
  });

  it('ничья считается половиной, а не победой', () => {
    // Четыре пары: три выигранных и одна ничья, то есть 3,5 из 4.
    expect(auc([0.4, 0.5], [0.5, 0.6])).toBe(0.875);
  });

  it('пустая сторона молчит, а не выдаёт ноль', () => {
    expect(auc([], [0.5])).toBeNull();
    expect(auc([0.5], [])).toBeNull();
  });
});

describe('рабочая точка отвечает на другой вопрос', () => {
  /**
   * Именно этот случай и произошёл на корпусе владельца: признак ранжирует
   * заметно лучше монеты, а порог при этом пропускает всех.
   */
  it('хорошее ранжирование уживается с полным пропуском', () => {
    const ours = [0.50, 0.55, 0.60];
    const theirs = [0.62, 0.65, 0.70];

    expect(auc(ours, theirs)).toBe(1);
    const point = operatingPoint(0.7634, ours, theirs);
    expect(point.missRate).toBe(1);
    expect(point.ownRejectedShare).toBe(0);
  });

  it('строгий порог меняет обе ошибки сразу', () => {
    const point = operatingPoint(0.55, [0.5, 0.55, 0.6], [0.62, 0.65, 0.7]);

    expect(point.ownRejected).toBe(1);
    expect(point.impostorAccepted).toBe(0);
  });
});

describe('чужой текст берётся из закреплённого коммита', () => {
  it('четыре документа, и ни один не читается из рабочего дерева', () => {
    expect(CONTROL_FILES).toHaveLength(4);
    CONTROL_FILES.forEach((file) => expect(file).toMatch(/^docs\//u));
  });

  it('разметка снимается, а текст остаётся', () => {
    const clean = stripMarkdown(
      '## Заголовок\n\n- пункт с `кодом` и [ссылкой](https://x.y)\n\n```\nblock\n```\n'
    );

    expect(clean).not.toContain('##');
    expect(clean).not.toContain('```');
    expect(clean).not.toContain('https://x.y');
    expect(clean).toContain('пункт');
    expect(clean).toContain('ссылкой');
  });

  it('куски делаются длиной с пост, а не со страницу', () => {
    const paragraph = `${'слово '.repeat(60)}\n\n`;
    const pieces = chunk(paragraph.repeat(6), 900);

    expect(pieces.length).toBeGreaterThan(1);
    pieces.forEach((one) => expect(one.length).toBeGreaterThan(200));
  });
});

describe('подставные — три мнения, а не одно трижды', () => {
  /** Три манеры, по четыре текста каждая, и трети корпуса совпадают с ними. */
  const MANNERS = [
    'Регламент устанавливает порядок согласования документации между подразделениями организации. ',
    'Yesterday I finally shipped the migration and wrote down what broke along the way. ',
    'Смеркалось, и над рекой поднимался туман, в котором тонули крыши дальней деревни. ',
  ];
  const texts = Array.from({ length: 12 }, (_, index) =>
    MANNERS[Math.floor(index / 4)].repeat(6) + `Фрагмент ${index}.`
  );

  it('строятся из непересекающихся третей корпуса', () => {
    const rates = impostorPrints(texts, 3);

    expect(rates).toHaveLength(3);
    // Карты частот, а не усечённые слепки: сравнение идёт по окнам автора, и
    // подставной обязан отвечать про окна, которых в своём профиле не держал.
    rates.forEach((one) => expect(one instanceof Map).toBe(true));
    const signatures = rates.map((one) =>
      [...one.keys()].sort().slice(0, 20).join('|')
    );
    expect(new Set(signatures).size).toBe(3);
  });

  it('корпуса, которого не хватает на три слепка, не притворяются', () => {
    expect(impostorPrints(texts.slice(0, 3), 3)).toEqual([]);
  });
});
