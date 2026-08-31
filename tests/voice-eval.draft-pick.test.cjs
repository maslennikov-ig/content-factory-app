'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  selectOne,
  permutations,
} = require('../scripts/evidence/voice-eval/draft-pick.cjs');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

/**
 * Стенд считает отбор продуктовым правилом и никаким другим.
 *
 * Своей арифметики у стенда нет намеренно: он существует ровно затем, чтобы
 * судить тем же. Однажды это уже стоило месяца — стенд звал `measureSimilarity`
 * тремя аргументами и мерил абсолютным порогом, пока продукт решал
 * относительным, и колонка «похоже» во всех отчётах читалась 100% у любого
 * варианта.
 *
 * Здесь проверяется, что цикл отбора на стенде — это тот же потолок, то же
 * условие выхода и тот же выбор лучшего, что стоят в графе.
 */

const rules = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/agent/draft-pick.ts'
);

describe('отбор на стенде — правило продукта', () => {
  test('прошедший первым черновик останавливает счётчик', () => {
    expect(selectOne([0.4, 0.9, 0.9], 0.25)).toEqual({
      drafts: 1,
      pickedIndex: 0,
      first: 0.4,
      chosen: 0.4,
      passed: true,
    });
  });

  test('не прошёл — покупается следующий, и отбор кончается на прошедшем', () => {
    expect(selectOne([0.1, 0.4, 0.9], 0.25)).toEqual({
      drafts: 2,
      pickedIndex: 1,
      first: 0.1,
      chosen: 0.4,
      passed: true,
    });
  });

  test('потолок продукта — потолок стенда', () => {
    const outcome = selectOne([0.1, 0.2, 0.15, 0.9], 0.25);
    expect(outcome.drafts).toBe(rules.MAX_DRAFT_ATTEMPTS);
    // Четвёртый черновик не куплен, поэтому его голоса в ответе нет.
    expect(outcome.chosen).toBe(0.2);
    expect(outcome.passed).toBe(false);
  });

  test('материала меньше потолка — считается по тому, что оплачено', () => {
    expect(selectOne([0.1, 0.2], 0.25)).toMatchObject({
      drafts: 2,
      chosen: 0.2,
    });
  });

  test('порядок черновиков усредняется, а не берётся как записан', () => {
    expect(permutations([1, 2])).toEqual([
      [1, 2],
      [2, 1],
    ]);
    expect(permutations([1, 2, 3])).toHaveLength(6);
  });

  test('индекс выбранного отдаётся наружу — по нему читается вторая мерка', () => {
    // Без него проверку на переподгонку поставить не на что: надо знать, какой
    // именно из трёх оплаченных черновиков ушёл дальше, чтобы спросить о нём
    // мерку, которая в отборе не участвовала.
    expect(selectOne([0.1, 0.2, 0.15], 0.25).pickedIndex).toBe(1);
    expect(selectOne([0.4, 0.9], 0.25).pickedIndex).toBe(0);
  });
});

describe('у стенда нет своего порога', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'scripts/evidence/voice-eval/draft-pick.cjs'),
    'utf8'
  );

  test('правило отбора берётся из модуля, который стоит в графе', () => {
    expect(source).toContain(
      "loadTypeScriptModule(\n  'libraries/nestjs-libraries/src/agent/draft-pick.ts'\n)"
    );
    expect(source).toContain('rules.needsAnotherDraft');
    expect(source).toContain('rules.bestDraftIndex');
    expect(source).toContain('rules.MAX_DRAFT_ATTEMPTS');
  });

  test('точка «похоже» читается из отчёта, а не из константы в скрипте', () => {
    expect(source).toContain("first.ruler?.calibration?.high");
    // Ни одного собственного порога: единственные числа в файле — коды выхода
    // и ширины колонок.
    expect(source).not.toMatch(/accepts\s*=\s*0\./u);
  });

  test('интервалы считает продуктовый бутстрап, ресемплящий темы', () => {
    expect(source).toContain("require('./paired.cjs')");
    expect(source).toContain('clusterByTopic');
    // Своего перемешивания и своих процентилей здесь нет: ресемпл по темам —
    // требование обоих ресерчей, и второе его исполнение однажды разойдётся
    // с первым.
    expect(source).not.toContain('Math.random');
  });

  test('проверка на переподгонку читает мерку, которой не отбирали', () => {
    // Отбор берёт максимум по голосам, и любая величина, по которой выбирали,
    // у best-of-k завышена по построению. Отличить приближение к автору от
    // выбора удачной выборки может только независимая мерка, поэтому отбор
    // идёт по голосам, а результат читается по второму отчёту.
    expect(source).toContain('secondByKey');
    expect(source).toContain('outcome.pickedIndex');
    expect(source).toContain('second-${model}-cut${cut}.json');
  });
});
