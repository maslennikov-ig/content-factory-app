'use strict';

/**
 * The substance a post is written from, for the topics the stand already uses.
 *
 * Every run before 2026-08-25 generated from a bare topic and nothing else,
 * and the texts showed it: the owner's own posts carry his figures — «$26,300
 * в месяц», «ROI 4 853x», «12 000 API-вызовов» — in 46% of them, and no
 * generated post carried a figure at all. The model was right not to invent
 * one. It had none.
 *
 * That is §1.7 of the research digest, which both answers call the most
 * important finding for the product: **style and substance are inseparable**.
 * An author whose habit is to bring his own measurements cannot be reproduced
 * by a voice block, because the habit is not a stylistic lever — it is having
 * something to measure. A run that withholds material is measuring how well a
 * voice survives having nothing to say.
 *
 * ## Why these facts and not the author's own
 *
 * They are written here, flat and dry, and deliberately not extracted from the
 * corpus. Facts lifted out of his posts would carry his phrasing, and a run
 * where the model is handed his sentences and scored on sounding like him
 * measures copying. What travels here is numbers and plain statements; the
 * arrows, the emoji, the telegraphic fragments and the headline are the
 * voice's job, and whether they appear is exactly the question.
 *
 * They are also neutral about trade and seniority, for the same reason the
 * topics are: a fact about release engineering would give an engineer a home
 * advantage over a teacher, and the epic's whole point is that a number from
 * one author proves nothing.
 *
 * ## The shape
 *
 * `ContentContextEnvelopeResultV1` as `AgentGraphService.research` reads it:
 * facts carry a citation id and a temporal kind, evidence carries a title, an
 * excerpt and a url. The graph puts them in the prompt inside the untrusted
 * block and turns on `usedCitationIds` in the schema, which is the shipped
 * behaviour and the reason this is a fixture rather than a second prompt.
 */

const MATERIAL_VERSION = 'voice-eval-material/1.0.0';

/** A fact as the envelope carries one. `STATIC` never goes stale. */
const fact = (id, statement) => ({
  citationId: id,
  statement,
  temporalKind: 'STATIC',
  freshUntil: '2027-01-01',
  evidenceCitationIds: [],
});

const evidence = (id, title, excerpt, url) => ({
  citationId: id,
  title,
  excerpt,
  url,
  retrievedAt: '2026-08-01',
  publishedAt: '2026-07-15',
});

/**
 * Three or four figures per topic, and one source.
 *
 * Enough to write from and not enough to write itself: the numbers answer
 * "what happened", never "what it means", so the position in the post is the
 * author's and the arithmetic is the material's.
 */
const MATERIAL = {
  t1: {
    facts: [
      fact('f1', 'В прошлом квартале из 34 запланированных задач до конца доведены 19.'),
      fact('f2', 'Задачи, у которых был назван измеримый результат, доводились в 81 % случаев; остальные — в 28 %.'),
      fact('f3', 'Среднее время от постановки до первой правки плана — 6 дней.'),
    ],
    evidence: [
      evidence('e1', 'Отчёт по кварталу', 'Сводка по 34 задачам: статус, срок, результат.', 'https://example.org/q-report'),
    ],
  },
  t2: {
    facts: [
      fact('f1', 'На переделку ушло 3 дня работы и около 5 200 ₽ оплаченных вызовов модели.'),
      fact('f2', 'Автотесты и кросс-проверки были зелёными: 0 найденных дефектов.'),
      fact('f3', 'После смены порядка проверки доля переделок упала с 41 % до 12 % за два месяца.'),
    ],
    evidence: [
      evidence('e1', 'Журнал прогонов', 'Сто двенадцать прогонов с отметками о переделке.', 'https://example.org/runs'),
    ],
  },
  t3: {
    facts: [
      fact('f1', 'Сравнивались 7 инструментов, замер занял 2 недели и 12 000 вызовов.'),
      fact('f2', 'Разброс цены между самым дорогим и самым дешёвым — 42 раза при разнице качества 9 %.'),
      fact('f3', 'Инструмент, выбранный по цене, был заменён через 5 недель; выбранный по замеру — работает 11 месяцев.'),
    ],
    evidence: [
      evidence('e1', 'Таблица сравнения', 'Семь инструментов, цена за тысячу операций, доля ошибок.', 'https://example.org/tools'),
    ],
  },
  t4: {
    facts: [
      fact('f1', 'В дни без совещаний на работу руками уходит 5 ч 10 мин, в дни с совещаниями — 1 ч 40 мин.'),
      fact('f2', 'Переключений между задачами в хороший день — 4, в обычный — 17.'),
      fact('f3', 'Из 22 рабочих дней месяца без совещаний прошли 6.'),
    ],
    evidence: [
      evidence('e1', 'Замер календаря', 'Разметка 22 рабочих дней по типам занятости.', 'https://example.org/calendar'),
    ],
  },
  t5: {
    facts: [
      fact('f1', 'Из 40 человек вне отрасли объяснение через аналогию поняли 33, объяснение через термины — 9.'),
      fact('f2', 'Среднее объяснение, которое дослушивают, укладывается в 45 секунд.'),
      fact('f3', 'Слово, требующее второго объяснения, встречается в 7 из 10 первых попыток.'),
    ],
    evidence: [
      evidence('e1', 'Записи разговоров', 'Сорок коротких разговоров, размеченных по пониманию.', 'https://example.org/talks'),
    ],
  },
  t6: {
    facts: [
      fact('f1', 'Привычка держалась 358 дней из 365; пропущено 7 дней подряд в феврале.'),
      fact('f2', 'Время на неё — 20 минут в день, 119 часов за год.'),
      fact('f3', 'За год из неё вышли 46 записей, из которых 11 стали материалами.'),
    ],
    evidence: [
      evidence('e1', 'Дневник', 'Триста шестьдесят пять отметок и сводка по месяцам.', 'https://example.org/diary'),
    ],
  },
  t7: {
    facts: [
      fact('f1', 'Из 60 работ, названных готовыми, к переделке вернулись 14.'),
      fact('f2', 'В 12 из этих 14 случаев не был назван человек, который примет результат.'),
      fact('f3', 'Проверка «кому это отдаём» занимает 4 минуты и снимает 80 % возвратов.'),
    ],
    evidence: [
      evidence('e1', 'Реестр работ', 'Шестьдесят работ со статусом и причиной возврата.', 'https://example.org/registry'),
    ],
  },
  t8: {
    facts: [
      fact('f1', 'Из 28 просьб за квартал приняты 19, и 8 из принятых сорвали свой срок.'),
      fact('f2', 'Отказ в первый день занимает 3 минуты; отказ на второй неделе — в среднем 2 часа разговоров.'),
      fact('f3', 'После введения одного вопроса «что не сделаем вместо этого» доля принятых упала с 68 % до 39 %.'),
    ],
    evidence: [
      evidence('e1', 'Учёт просьб', 'Двадцать восемь просьб с решением и сроком.', 'https://example.org/requests'),
    ],
  },
};

/** The envelope for a topic, or an empty one when the run carries no material. */
const materialFor = (topicId) =>
  MATERIAL[topicId] ?? { facts: [], evidence: [] };

module.exports = { MATERIAL, MATERIAL_VERSION, materialFor };
