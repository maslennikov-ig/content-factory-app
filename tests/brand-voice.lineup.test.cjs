'use strict';

/**
 * Шеренга, собранная под конкретного автора.
 *
 * Замер 27.08.2026 на трёх настоящих русских каналах: прежняя шеренга — три
 * файла документации этого репозитория — оставляла запас между потолком и
 * полом равным 57,2, 18,4 и 16,1 пункта. Шеренга из настоящих коротких текстов
 * других авторов: 44,6, 47,5 и 47,9. Разброс втрое схлопнулся в три пункта, и
 * именно поэтому она собирается на разборе, а не лежит в сборке.
 *
 * Проверяется здесь то, ошибка в чём не вызовет ни исключения, ни отказа.
 *
 * 1. Веса лежат позиционно по окнам отпечатка. Список окон — единственное, что
 *    связывает число с окном; сдвиг на одну позицию даёт другого подставного и
 *    ничем себя не выдаёт.
 * 2. Выровненный набор отказывается прикладываться к чужому отпечатку. Числа
 *    встали бы на чужие окна, голосование поехало бы, и признаков поломки не
 *    было бы никаких.
 * 3. Знаменатель — по всему, что подставной написал. Нормировка на одни лишь
 *    окна автора делает любого подставного неотличимо близким.
 * 4. Малого материала не хватает, и это отказ, а не маленькая шеренга.
 */

const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const base = 'libraries/nestjs-libraries/src/content-intelligence/brand-voice';
const ngrams = loadTypeScriptModule(`${base}/character-ngrams.ts`);
const impostors = loadTypeScriptModule(`${base}/impostors.ts`);
const lineup = loadTypeScriptModule(`${base}/lineup.ts`);

/**
 * Обе манеры длиннее четырёхсот знаков — короче голосование не судит.
 *
 * Строки перемешиваются по индексу, а не подставляются в одно и то же место:
 * двадцать четыре текста, отличающиеся одним числом, дают шесть частей, из
 * которых половина совпадает дословно, и «шесть подставных» оказывается тремя.
 */
const AUTHOR_LINES = [
  'Поставщика поменяли — старый срывал сроки третий месяц подряд.',
  'Новый возит из Челябинска, и это уже видно по журналу приёмки.',
  'Мы вчера догнали план. Правда, ценой субботней смены.',
  'Что делаем дальше? Ставим контрольную точку на среду и смотрим остатки.',
  'Отгрузка прошла по факту, без лишних слов. Приняли, пересчитали, подписали.',
  'Мастер предупредил заранее — это правильно, лучше знать за неделю.',
  'Я думал, что успеем к четвергу. Не успели, и врать тут незачем.',
  'Линию запускаем в четверг, если крепёж придёт во вторник.',
  'Смена отработала ровно. Без геройства и без простоев.',
  'Мы считали дважды, и оба раза вышло одно и то же число.',
];

const STRANGER_LINES = [
  'Проведение мероприятий по обеспечению выполнения плановых показателей осуществляется в соответствии с утверждённым регламентом.',
  'Обеспечение соблюдения установленных требований возлагается на ответственных должностных лиц структурного подразделения.',
  'Организация обеспечивает предоставление необходимой документации в согласованные сторонами сроки.',
  'Осуществление отгрузки продукции производится согласно утверждённому графику поставок на текущий период.',
  'Уведомление направляется заблаговременно, рассмотрение обращения занимает до десяти рабочих дней.',
  'Внедрение изменений запланировано на следующий отчётный период при наличии соответствующего финансирования.',
  'Проведение инвентаризации осуществляется ежеквартально при участии представителей заинтересованных служб.',
  'Согласование изменений производится в установленном порядке при участии руководителя направления.',
  'Оформление документации завершено, утверждение регламента состоялось на заседании профильной комиссии.',
  'Информирование заявителя обеспечивается ответственным подразделением после завершения проверки.',
];

/**
 * Восемь строк, а не шесть: шесть дают 394 знака, а голосование не судит
 * ничего короче четырёхсот. Шаг зависит от индекса, иначе двадцать четыре
 * текста укладываются в десять повторяющихся комбинаций и две части шеренги
 * выходят дословно одинаковыми.
 */
const woven = (bank, index, length = 8) =>
  Array.from(
    { length },
    (unused, step) => bank[(index + step * (1 + (index % 4))) % bank.length]
  ).join(' ');

const author = (index) => woven(AUTHOR_LINES, index);
/**
 * У каждого чужого текста свой хвост.
 *
 * Без него двадцать четыре текста, собранных из десяти строк, дают части с
 * совпадающими наборами строк — а частоты зависят только от того, какие буквы
 * в часть попали, так что две части выходят числом в число одинаковыми. На
 * настоящих корпусах такого не бывает; в наборе это артефакт банка, и хвост
 * его убирает, ничего не подменяя.
 */
const TAILS = [
  'Ответственный исполнитель определяется приказом по организации.',
  'Контроль возлагается на заместителя руководителя по направлению.',
  'Сведения вносятся в единый реестр учёта в трёхдневный срок.',
  'Копия направляется в архив хранения на бумажном носителе.',
  'Разъяснения предоставляются по письменному запросу заявителя.',
  'Изменения вступают в силу с момента утверждения протокола.',
  'Отчётность формируется нарастающим итогом с начала года.',
  'Регистрация обращений ведётся в порядке их поступления.',
];

const stranger = (index) =>
  `${woven(STRANGER_LINES, index)} ${TAILS[index % TAILS.length]}`;

const print = ngrams.buildCharacterNgramProfile(
  Array.from({ length: 14 }, (unused, index) => ({ text: author(index) }))
);
const FOREIGN = Array.from({ length: 24 }, (unused, index) => stranger(index));

describe('шеренга под автора', () => {
  it('веса лежат позиционно по окнам отпечатка', () => {
    const set = lineup.buildLineup(FOREIGN, print, 'ru');

    expect(set.impostors).toHaveLength(lineup.LINEUP_SIZE);
    for (const one of set.impostors) {
      expect(Array.isArray(one)).toBe(true);
      expect(one).toHaveLength(print.grams.length);
    }
  });

  it('знаменатель считается по всему, что подставной написал', () => {
    const set = lineup.buildLineup(FOREIGN, print, 'ru');

    /**
     * Чужой пишет не про то же, что автор, поэтому его доли на окнах автора
     * заметно не дотягивают до единицы. Если бы знаменатель брался только по
     * этим окнам, сумма встала бы ровно в единицу — и любой подставной оказался
     * бы неотличимо похож на автора.
     */
    for (const one of set.impostors) {
      const sum = one.reduce((total, rate) => total + rate, 0);
      expect(sum).toBeGreaterThan(0);
      expect(sum).toBeLessThan(0.9);
    }
  });

  it('выровненный набор не прикладывается к чужому отпечатку', () => {
    const set = lineup.buildLineup(FOREIGN, print, 'ru');
    const otherPrint = ngrams.buildCharacterNgramProfile(
      Array.from({ length: 14 }, (unused, index) => ({ text: stranger(index) }))
    );

    const mine = impostors.impostorVote(author(99), print, set);
    const wrong = impostors.impostorVote(stranger(99), otherPrint, set);

    expect(mine.votes).not.toBeNull();
    expect(wrong.votes).toBeNull();
    expect(wrong.reason).toBe('NO_IMPOSTORS');
  });

  it('свой текст выигрывает у шеренги чаще чужого', () => {
    const set = lineup.buildLineup(FOREIGN, print, 'ru');

    const mine = impostors.impostorVote(author(99), print, set).votes;
    const theirs = impostors.impostorVote(stranger(99), print, set).votes;

    expect(mine).toBeGreaterThan(theirs);
  });

  it('малого материала не хватает, и это отказ', () => {
    expect(
      lineup.buildLineup(FOREIGN.slice(0, lineup.MIN_LINEUP_TEXTS - 1), print, 'ru')
    ).toBeNull();
    expect(lineup.buildLineup(FOREIGN, null, 'ru')).toBeNull();
  });

  it('части не пересекаются: шесть подставных, а не шесть копий одного', () => {
    const set = lineup.buildLineup(FOREIGN, print, 'ru');
    const rendered = set.impostors.map((one) => JSON.stringify(one));

    expect(new Set(rendered).size).toBe(set.impostors.length);
  });

  it('материал шеренги и отрицательные примеры не пересекаются', () => {
    const split = lineup.splitForeign(FOREIGN);

    expect(split.lineup.length + split.negatives.length).toBe(FOREIGN.length);
    for (const one of split.negatives) {
      expect(split.lineup).not.toContain(one);
    }
    expect(split.negatives.length).toBeGreaterThan(0);
  });

  it('отрицательный пример из шеренги набирает меньше, чем не из неё', () => {
    /**
     * То, ради чего разделение и заведено. Текст, участвовавший в постройке
     * подставного, проигрывает своему же подставному почти всегда — и порог,
     * снятый на таких, ложится на пол. Ошибка бесшумная: чужие проходят в трёх
     * процентах случаев, всё выглядит прекрасно, и только генерации внезапно
     * проходят тоже. Замер 27.08.2026: 23% против 2% у одного из авторов.
     */
    const split = lineup.splitForeign(FOREIGN);
    const clean = lineup.buildLineup(split.lineup, print, 'ru');
    const tainted = lineup.buildLineup(FOREIGN, print, 'ru');
    const probe = split.negatives[0];

    const outside = impostors.impostorVote(probe, print, clean).votes;
    const inside = impostors.impostorVote(probe, print, tainted).votes;

    expect(outside).toBeGreaterThanOrEqual(inside);
  });

  it('набор помнит, под какой отпечаток собран, и как', () => {
    const set = lineup.buildLineup(FOREIGN, print, 'ru');

    expect(set.alignedTo).toBe(impostors.fingerprintOf(print));
    expect(set.size).toBe(print.size);
    expect(set.locale).toBe('ru');
    expect(set.version).toContain(lineup.LINEUP_VERSION);
    // Ни одного чужого предложения — только числа.
    expect(JSON.stringify(set)).not.toContain('Проведение мероприятий');
  });
});
