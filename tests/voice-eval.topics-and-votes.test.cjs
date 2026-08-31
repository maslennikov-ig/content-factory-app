'use strict';

/**
 * Шестнадцать тем и приёмка, читаемая по той мерке, по которой решает продукт.
 *
 * Два свойства, и оба про то, чем прогон 27.08.2026 закончился ничем.
 *
 * Интервалы накрывали ноль почти везде, и причина не в числе прогонов: бутстрап
 * ресемплит ТЕМЫ, так что восемь тем, сгенерированных пять раз, это восемь
 * наблюдений, а не сорок. Второй прогон по тем же восьми темам добавляет
 * наблюдений внутри темы и почти не двигает интервал.
 *
 * Колонка «автор ближе» считалась по абсолютному расстоянию — мерке, которую
 * эпик похоронил: тот же прогон на обрезке 800 и 823 знака менял знак вывода.
 * Приёмка `pl1.5` требует 80% и требует их от голосования.
 */

const { measure, render } = require('../scripts/evidence/voice-eval/measure.cjs');
const { pairedTest } = require('../scripts/evidence/voice-eval/ruler.cjs');
const { TOPICS, TOPICS_VERSION } = require('../scripts/evidence/voice-eval/topics.cjs');

describe('реестр тем', () => {
  it('шестнадцать тем, и все различимы', () => {
    expect(TOPICS).toHaveLength(16);
    expect(new Set(TOPICS.map((one) => one.id)).size).toBe(16);
    expect(new Set(TOPICS.map((one) => one.request)).size).toBe(16);
  });

  it('версия двинута: прогоны до и после несравнимы', () => {
    // Доля закрытого разрыва берётся по медиане тем, а состав тем изменился.
    // Читать старую цифру рядом с новой — это сравнивать два разных вопроса.
    expect(TOPICS_VERSION).not.toBe('voice-eval-topics/1.0.0');
    expect(TOPICS_VERSION).toMatch(/^voice-eval-topics\/1\.1\.0$/);
  });

  it('первые восемь остались собой', () => {
    // Иначе несравнимость двух прогонов держалась бы на том, что тема
    // незаметно поменяла формулировку, а не на версии списка.
    expect(TOPICS.slice(0, 8).map((one) => one.id)).toEqual([
      't1',
      't2',
      't3',
      't4',
      't5',
      't6',
      't7',
      't8',
    ]);
    expect(TOPICS[0].request).toBe(
      'How you decide what to work on next week.'
    );
  });

  it('темы нейтральны к профессии', () => {
    // «Наш релизный процесс» дал бы инженеру фору перед учителем, а весь смысл
    // эпика в обратном.
    const all = TOPICS.map((one) => one.request.toLowerCase()).join(' ');
    for (const trade of [
      'code',
      'deploy',
      'release',
      'sprint',
      'customer',
      'marketing',
      'sales',
      'server',
    ]) {
      expect(all).not.toContain(trade);
    }
  });
});

describe('парная доля считает ничью ничьёй', () => {
  it('на расстояниях оба числа совпадают', () => {
    const result = pairedTest([0.1, 0.2], [0.3, 0.4]);

    expect(result.share).toBe(1);
    expect(result.auc).toBe(1);
    expect(result.tiedShare).toBe(0);
  });

  it('совпадение больше не засчитывается автору в поражение', () => {
    const result = pairedTest([0.5, 0.5], [0.5, 0.9]);

    // Две пары из четырёх — ничьи. Старое число называет их проигрышем и даёт
    // 50%; площадь под кривой даёт 75%, и это то же самое, что «мерка не
    // различает половину пар», сказанное честно.
    expect(result.share).toBe(0.5);
    expect(result.auc).toBe(0.75);
    expect(result.tiedShare).toBe(0.5);
  });
});

/* -------------------------------------------------------------------------
 * Отчёт measure на выдуманном прогоне: настоящих генераций тут нет и не надо.
 * ---------------------------------------------------------------------- */

/** Длиннее четырёхсот знаков: короче голосование не проводится вовсе. */
const SAMPLES = Array.from({ length: 12 }, (unused, index) => ({
  contentHash: `hash-${index}`,
  text:
    `Сел разбирать очередной прогон, и вот что вышло. Взял ${index + 3} замера ` +
    'и посчитал руками, потому что глазами такое не ловится. Вышло хуже, чем ' +
    'я ждал: цифра не держится между прогонами. Записал, чтобы не забыть. ' +
    'Ты бы тоже записал, если бы два раза подряд поверил своей же памяти. ' +
    'Дальше буду мерить только парами, иначе это гадание, а не работа. ' +
    'Отдельно проверил, не в обрезке ли дело: обрезал на восьмистах знаках и ' +
    'на восьмистах двадцати трёх — знак перевернулся, и это меня добило.',
}));

const CLERICAL =
  'Настоящий регламент устанавливает порядок согласования проектной документации между структурными подразделениями организации. ' +
  'Согласование осуществляется в течение десяти рабочих дней с момента поступления комплекта документов. ' +
  'В случае выявления несоответствий документация возвращается инициатору с указанием причин возврата и сроков устранения замечаний. ' +
  'Ответственность за соблюдение установленных сроков возлагается на руководителей структурных подразделений организации.';

const generations = ['none', 'product'].flatMap((variantId) =>
  TOPICS.slice(0, 8).map((topic, index) => ({
    variantId,
    topicId: topic.id,
    runId: 'r1',
    text: index % 2 ? CLERICAL : `${CLERICAL} Пункт ${index} применяется.`,
  }))
);

const pulled = {
  corpus: { name: 'fixture', label: 'вымышленный', language: 'ru' },
  samples: SAMPLES,
};

describe('отчёт несёт парную долю по голосам рядом с расстоянием', () => {
  const report = measure({ pulled, generations, cut: 600 });

  it('у каждого варианта есть обе доли', () => {
    report.variants.forEach((variant) => {
      expect(variant.paired.share).not.toBeNull();
      expect(variant.pairedVotes.auc).not.toBeNull();
      expect(variant.pairedVotes.tiedShare).not.toBeNull();
    });
  });

  it('доля по голосам считается по голосам, а не по расстоянию', () => {
    const variant = report.variants.find((one) => one.id === 'product');
    const measurableVotes = variant.perTopic.filter(
      (row) => row.votes !== null && row.votes !== undefined
    ).length;

    // Пары — это отложенные тексты автора против измеримых генераций, и
    // считаны они на голосах: сторона автора берётся из `holdoutVotes`, а не
    // из `holdout`, где лежат расстояния.
    expect(measurableVotes).toBeGreaterThan(0);
    expect(report.author.holdoutVoteCount).toBeGreaterThan(0);
    expect(variant.pairedVotes.pairs).toBe(
      report.author.holdoutVoteCount * measurableVotes
    );
  });

  it('колонка двигается вслед за голосами, а не за расстоянием', () => {
    /**
     * Тот же отчёт на генерации, написанной манерой автора.
     *
     * Против канцелярита автор выигрывает почти всегда; против собственной
     * манеры — нет, и колонка обязана это показать. Проверка на само число
     * была бы проверкой фикстуры; проверка на направление — проверка того,
     * что считается голос, а не что-то другое.
     */
    const mimic = ['none', 'product'].flatMap((variantId) =>
      TOPICS.slice(0, 8).map((topic, index) => ({
        variantId,
        topicId: topic.id,
        runId: 'r1',
        text: `${SAMPLES[index % SAMPLES.length].text} И ещё раз о том же.`,
      }))
    );
    const mimicked = measure({ pulled, generations: mimic, cut: 600 });

    const votesAgainst = (one) =>
      one.variants.find((row) => row.id === 'product').pairedVotes.auc;

    expect(votesAgainst(report)).toBeGreaterThan(votesAgainst(mimicked));
  });

  it('приёмка эпика названа по голосам и с ничьими', () => {
    expect(report.overallPairedVotes.auc).not.toBeNull();

    const printed = render(report);
    expect(printed).toContain('парный тест по голосам — цель эпика 80%');
    expect(printed).toMatch(/ничьих/);
    // Расстояние остаётся в отчёте: расхождение двух мерок — это результат, а
    // не повод молча выбрать ту, что удобнее.
    expect(printed).toContain('парный тест против всей генерации по расстоянию');
  });

  it('таблица называет обе колонки своими именами', () => {
    const printed = render(report);

    expect(printed).toContain('автор ближе по расстоянию');
    expect(printed).toContain('автор ближе по голосам');
  });
});
