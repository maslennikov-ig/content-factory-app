/**
 * Ninth-walk core prompt, successor of `core-write/v6` by three rules and one
 * block title (`content-factory-next-97dq.22`, P1). Older prompt modules stay
 * importable and untouched: a released receipt must still name the exact
 * contract its core was written by.
 *
 * Что здесь нового.
 *
 * Первое: своё число, которое поиск опроверг или не нашёл, больше не стоит под
 * «факты подтверждённые». Девятый заход 22.09.2026, мысль про исландскую
 * четырёхдневку: строки «охватил 25 тысяч человек» и «производительность
 * выросла на 40%» приходили `kind: 'own'`, `origin: 'input'`,
 * `status: 'unverified'`, с заметкой источника («более 2500, а не 25 тысяч»;
 * «подтверждения роста именно на 40% нет») — и проходили `isOwnOrConfirmed` по
 * §9.5 карты раздела: своё утверждение подтверждено в момент, когда человек его
 * написал. Квитанция в тот же миг называла обе строки в `brief.ungrounded`
 * («не подтвердилось и в текст не вошло»), то есть промпт говорил модели
 * обратное тому, что продукт обещал человеку. Ту же рассогласованность v6 уже
 * убрал для строк-поправок; здесь она убирается для своих строк.
 *
 * §9.5 при этом остаётся в силе: своё слово — по-прежнему опора, и без ресерча
 * ничего не меняется. Меняется ровно один случай — когда поиск вынес по этой
 * строке вердикт и вердикт оказался не «подтверждено». Такая строка печатается
 * один раз, в своём блоке «не подтвердилось поиском», вместе с заметкой
 * источника, и отдельное правило запрещает выдавать её число за факт. Это
 * продуктовое правило «решаем за человека» (`PRODUCT.md`): ложное число автора
 * не выживает как доказанное, и спорить с автором в сути при этом не нужно.
 *
 * Второе: ПЕРВАЯ суть с ресерчем перестала быть короткой. `core-write/v5`
 * отменил правило 4 («три предложения — нормальная суть») только для
 * дополнения, где есть `existingCore`. Но шестнадцать отмеченных находок
 * приезжают в бриф и тогда, когда человек ещё не нажимал «Дополнить ресерчем»:
 * ресерч идёт на входе, суть пишется первый раз, и правило 4 побеждало весь
 * найденный материал — на восьмом заходе (18.09, `8cc5a492`) и на девятом
 * (22.09, `cnt-22`) суть выходила в два предложения. Исключение названо
 * отдельной строкой ровно по причине v5: мысль без ресерча судится тем же
 * текстом, каким судилась, и правило 4 для неё не переписано.
 *
 * Третье: суть по чужому посту получила своё правило. Разбор с галочкой «Это
 * чужой текст» приносит в бриф тему, угол, строение и пересказанные
 * утверждения поста (`intake-extract/v6`), но ни одно правило системы не
 * говорило, что с ними делать, а правила 2 («ничего сверх брифа и
 * подтверждённого») и 4 («суть короткая») читались как запрет. На стенде
 * 22.09.2026 модель при пяти утверждениях и четырёх шагах строения вернула одну
 * фразу — позицию человека. Теперь сказано прямо: позиция первой, затем то, на
 * что человек отвечает, пересказом и как предмет спора, а не как его мнение.
 */

import {
  CORE_WRITE_BLOCK_TITLES_V6,
  CORE_WRITE_ENRICH_LEAD_V6,
  CORE_WRITE_REPAIR_V6,
  coreWriteSystemV6,
} from './core-write-prompt.v6';

export const CORE_WRITE_PROMPT_VERSION = 'core-write/v7' as const;

/** Заголовки блоков v6 плюс один: неподтверждённое своё стоит отдельно. */
export const CORE_WRITE_BLOCK_TITLES_V7 = {
  ru: {
    ...CORE_WRITE_BLOCK_TITLES_V6.ru,
    unconfirmed: 'не подтвердилось поиском',
  },
  en: {
    ...CORE_WRITE_BLOCK_TITLES_V6.en,
    unconfirmed: 'not confirmed by search',
  },
} as const;

/**
 * Что модель делает с блоком «не подтвердилось поиском».
 *
 * Стоит отдельной названной строкой, а не номером: правило 1 (переносить числа
 * человека дословно) и правила дополнения 12–15 уже заняли свои номера в
 * выпущенных квитанциях, а это правило действует и с дополнением, и без него.
 */
export const CORE_WRITE_UNCONFIRMED_V7 = {
  ru: 'Отдельное правило о блоке «не подтвердилось поиском»: это числа и утверждения самого человека, которые поиск опроверг или не нашёл. Они — исключение из правила 1: даже если число стоит дословно в словах человека, как факт оно в суть не идёт. Если среди подтверждённых фактов есть строка с исправленным значением, бери значение оттуда; если такой строки нет, число не пиши вовсе, а мысль человека оставь без цифры. Не спорь с человеком и не объясняй, почему числа нет: в сути его просто нет.',
  en: 'A separate rule about the «not confirmed by search» block: these are the person’s own numbers and claims that the search contradicted or could not find. They are an exception to rule 1: even when the number stands verbatim in the person’s words, it does not enter the core as a fact. If a confirmed fact carries the corrected value, take the value from there; if there is no such line, do not write the number at all and leave the person’s thought without the figure. Do not argue with the person and do not explain why the number is gone: the core simply does not have it.',
} as const;

/**
 * Что говорят ПЕРВОЙ сути, когда ресерч уже принесён и опоры отмечены.
 *
 * Счёт тот же, что у дополнения (`CORE_WRITE_ENRICH_V5`, правила 13–15):
 * предложение на каждую работающую опору, дословные числа, выбор вместо
 * перечисления. Отличается только строка 12 — она называет случай, в котором
 * правило 4 не действует. С правилами дополнения этот блок не встречается
 * никогда: либо существующая суть есть, либо её нет.
 */
export const CORE_WRITE_FIRST_RESEARCH_V7 = {
  ru: [
    '12) это ПЕРВАЯ суть, и ресерч к ней уже принесён, а опоры отмечены руками: правило 4 здесь не действует — «суть короткая» и «три предложения — нормальная суть» сказаны про мысль, к которой ничего не искали;',
    '13) каждая отмеченная опора из брифа, которая работает на тезис, получает в тексте своё предложение: её число, дату, имя и единицу переноси дословно, не округляй и не обобщай;',
    '14) опора, которая тезису не служит, в текст не входит вовсе — это выбор, а не перечисление всего, что нашлось; две опоры об одном и том же из разных источников (то же число, та же дата, тот же факт) — одно предложение, а не два;',
    '15) длина берётся из материала, а не из желания написать длиннее: ни одного предложения, за которым не стоит опора или слово человека; новых чисел, примеров, советов и шагов в сути не бывает.',
  ].join('\n'),
  en: [
    '12) this is a FIRST core, and its research has already been brought in with supports selected by hand: rule 4 does not apply here — «the core is short» and «three sentences is a normal core» are said about a thought nothing was searched for;',
    '13) every selected support from the brief that serves the claim gets a sentence of its own: carry its number, date, name and unit over verbatim, never rounded and never generalised;',
    '14) a support that does not serve the claim does not enter the text at all — this is a choice, not a listing of everything that was found; two supports about the same thing from different sources (the same number, date or fact) make one sentence, not two;',
    '15) the length comes from the material, not from a wish to write longer: not one sentence without a support or a word of the person behind it; a core never has new numbers, examples, advice or steps.',
  ].join('\n'),
} as const;

/**
 * Что модель делает с блоками чужого поста.
 *
 * Тоже названной строкой без номера: действует и для первой сути, и для
 * дополнения, и вместе с ресерчем. Читатель сути чужого поста не видел, а
 * позиция человека — ответ на него; без пересказа предмета спора позиция
 * повисает одной фразой, из которой адаптации нечего взять.
 */
export const CORE_WRITE_FOREIGN_V7 = {
  ru: 'Отдельное правило о блоках чужого поста («тема», «угол», «строение», «что чужой пост утверждает»): человек отвечает на чужой пост, а читатель сути этого поста не видел. Правило 4 здесь не действует. Начни с позиции человека — она и есть тезис, если тезиса нет. Затем перескажи своими словами, на что он отвечает: каждое утверждение чужого поста, без которого позиция человека непонятна, получает своё предложение — как предмет спора («площадки объясняют…», «продавцы пишут…»), а не как мнение человека и не как доказанный факт. Строение чужого поста — подсказка, о чём он, а не порядок сути. Не копируй формулировок чужого поста и не добавляй утверждений, которых в блоках нет.',
  en: 'A separate rule about the pasted post blocks («topic», «angle», «structure», «what the pasted post claims»): the person is answering somebody else’s post, and the reader of the core has not seen it. Rule 4 does not apply here. Open with the person’s position — it is the claim when there is none. Then retell, in your own words, what they are answering: every claim of the pasted post without which the person’s position cannot be understood gets a sentence of its own — as the matter in dispute («the platforms explain…», «sellers write…»), never as the person’s opinion and never as a proven fact. The structure of the pasted post says what it is about, not the order of the core. Never copy the pasted post’s wording and never add claims the blocks do not carry.',
} as const;

export const coreWriteSystemV7 = (
  language: 'ru' | 'en',
  forbiddenPhrases: string,
  options: {
    enrichment?: boolean;
    /** Первая суть, у которой в брифе есть отмеченные опоры ресерча. */
    firstWithResearch?: boolean;
    /** В брифе есть блок «не подтвердилось поиском». */
    unconfirmed?: boolean;
    /** В брифе есть блоки чужого поста с утверждениями или строением. */
    foreign?: boolean;
  } = {}
): string =>
  [
    coreWriteSystemV6(language, forbiddenPhrases, {
      enrichment: options.enrichment,
    }),
    // Дополнение и первая суть с ресерчем — один и тот же вопрос, заданный
    // один раз: правила дополнения уже стоят в строках 12–15 выше.
    !options.enrichment && options.firstWithResearch
      ? CORE_WRITE_FIRST_RESEARCH_V7[language]
      : '',
    options.unconfirmed ? CORE_WRITE_UNCONFIRMED_V7[language] : '',
    options.foreign ? CORE_WRITE_FOREIGN_V7[language] : '',
  ]
    .filter(Boolean)
    .join('\n');

export const CORE_WRITE_ENRICH_LEAD_V7 = CORE_WRITE_ENRICH_LEAD_V6;
export const CORE_WRITE_REPAIR_V7 = CORE_WRITE_REPAIR_V6;
