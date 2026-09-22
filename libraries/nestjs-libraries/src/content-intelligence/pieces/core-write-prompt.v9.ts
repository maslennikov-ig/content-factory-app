/**
 * Tenth-walk core prompt, written whole (`content-factory-next-97dq.26`, P1).
 * Older prompt modules stay importable and untouched: a released receipt must
 * still name the exact contract its core was written by. This module reuses
 * from v8 only the enrichment lead, the repair line and the brief block titles.
 *
 * Почему переписано целиком, а не дописано.
 *
 * К 22.09.2026 системный текст сути был стопкой: одиннадцать правил v3,
 * четыре правила дополнения v5, столько же — первой сути с ресерчем v7, и три
 * «отдельных правила» v7–v8, каждое из которых заново отменяло правило 4
 * («три предложения — нормальная суть»). Модель разрешала противоречия сама.
 * Десятый заход (`cnt-24`): правило 1 «характерные фразы человека переноси
 * дословно», правило 5 «начинай с мысли человека» и подпись блока «СЛОВА
 * ЧЕЛОВЕКА (дословно)» вместе прочитались как «вставь ответ как есть» — и во
 * второй абзац сути уехал надиктованный ответ владельца с опечаткой
 * («перериентировать»), повтором устной речи («подъем для вашего бренда и как
 * рекламу для вашего бренда») и порядком слов надиктовки («на уже вашем
 * основном сайте»). Владелец: «он должен был всё это адаптировать в итоговую
 * заготовку» и «будь аккуратен в промпте, продумай, каким он в итоге должен
 * быть».
 *
 * Что здесь решено и держится.
 *
 * - **Материал описан по блокам, с доверием каждого.** Слова человека и его
 *   ответы — главный материал; дословно из них переносятся числа, имена,
 *   примеры и характерные выражения, а орфография, синтаксис надиктованной
 *   речи, заполнители и повторы правятся. Смысл, оценки и выбор слов
 *   человека при этом не меняются — правка, не спор. Подписи блоков больше
 *   не говорят «дословно»: подпись читается как инструкция.
 * - **Одно правило длины вместо четырёх.** Длина берётся из материала: мысль
 *   из трёх предложений даёт три предложения; опоры ресерча и блоки исходного
 *   материала — тоже материал, с ними суть длиннее ровно на то, что они
 *   несут. Режимные абзацы больше не отменяют «правило 4», потому что
 *   отменять нечего.
 * - **Режимы — отдельные абзацы, каждый о своём блоке:** исходный материал
 *   (чужой пост — материал для своего текста, без отсылок к нему, v8 без
 *   изменений по смыслу), опоры ресерча у первой сути, дополнение уже
 *   написанной сути, «не подтвердилось поиском». Ни один не спорит с базой.
 * - **Всё прежнее по смыслу сохранено:** ничего сверх материала (v3 §2),
 *   суть не спорит с человеком (v4 §11), служебный материал не идёт в текст
 *   (v3 §6–8), стиль и разметка (v3 §3, §9), список запрещённых оборотов
 *   (§10), осторожный статус «взято из ресерча» (v5), неподтверждённое своё
 *   (v7), исходный материал (v8), одно предложение на повторяющуюся опору
 *   (v7 §14).
 */

import {
  CORE_WRITE_BLOCK_TITLES_V8,
  CORE_WRITE_ENRICH_LEAD_V8,
  CORE_WRITE_REPAIR_V8,
} from './core-write-prompt.v8';

export const CORE_WRITE_PROMPT_VERSION = 'core-write/v9' as const;

/**
 * Подписи блоков v8, кроме двух: слова человека и ответы подписаны как
 * материал. «(дословно)» в подписи модель читала как инструкцию вставить.
 */
export const CORE_WRITE_BLOCK_TITLES_V9 = {
  ru: {
    ...CORE_WRITE_BLOCK_TITLES_V8.ru,
    person: 'СЛОВА ЧЕЛОВЕКА (как он их написал; материал, не готовый текст)',
    answers: 'ОТВЕТЫ НА ВОПРОСЫ (мысли человека; материал, не готовые предложения)',
  },
  en: {
    ...CORE_WRITE_BLOCK_TITLES_V8.en,
    person: 'THE PERSON’S WORDS (as written; material, not finished text)',
    answers: 'ANSWERS TO THE QUESTIONS (the person’s thoughts; material, not finished sentences)',
  },
} as const;

/** База: что такое суть, из чего она пишется и как. Действует всегда. */
const BASE = {
  ru: (forbiddenPhrases: string) =>
    [
      'Ты пишешь СУТЬ: нейтральный связный текст о том, что человек хочет рассказать, без площадки и без манеры. Это не пост и не пересказ брифа — это опора, из которой потом сделают тексты под разные площадки. Читать её будут как готовый текст, а не как черновик или протокол.',
      '',
      'ИЗ ЧЕГО ПИСАТЬ. Материал приходит блоками, и у каждого своё доверие.',
      '— «Слова человека» и «ответы на вопросы» — главный материал. Часто это надиктовка или быстрая запись: с опечатками, заполнителями, повторами и порядком слов устной речи. Переносится дословно: числа, имена, даты, примеры и характерные выражения человека («удобная лазейка», «подъём для бренда»), его короткие фразы и резкие оценки — это голос, и его не сглаживай. Правится: опечатки и орфография; слова-заполнители устной речи («вернее», «может быть», «какие-нибудь», «тут важно, конечно», «уже», «в общем»); мысль, сказанная двумя оборотами подряд, пишется один раз; порядок слов надиктованной фразы выпрямляется. Не меняется: смысл, оценки и позиция, а слова человека остаются его словами, а не синонимами получше — править орфографию и синтаксис можно, спорить с человеком, смягчать его или договаривать за него нельзя. Ответ на вопрос не вставляй блоком и не переписывай предложение в предложение: возьми из него мысли и уложи туда, где они работают на тезис. Выбранный вариант ответа пиши от первого лица автора. Пример: было «Тут важно, конечно, прочитать договор, договор, вернее, оферту, но всегда можно найти там удобный пункт для того, чтобы перерасчитать цену уже по своей ставке» — стало «Важно прочитать оферту: там всегда найдётся удобный пункт, чтобы пересчитать цену по своей ставке».',
      '— Бриф (тезис, позиция, адресат) — то, что модель поняла из материала; в тексте это опора, не цитата. Поле «возражение» — не для сути (см. правило 3).',
      '— «Факты подтверждённые» — можно утверждать как факт: сверено поиском или памятью либо сказано самим человеком.',
      '— «Взято из ресерча» и «материал по ссылке (не подтверждено)» — внешние опоры, а не подтверждение: сохраняй их осторожный статус и не выдавай за проверенные факты.',
      '— Служебное — не материал: адреса, «вот ссылка», «см.», вопросы к модели, «хочу написать о…», «я бы хотел в этот раз написать об…», «давай про…» — это передача и намерение, а не слова для текста; их тема и прочитанный источник используются только по смыслу, а рамка и адрес в суть не идут. Вопросы человека — тема текста, а не цитаты и не вопросы читателю.',
      '',
      'КАК ПИСАТЬ, все правила обязательные:',
      '1) начинай с мысли человека, которая ближе всего к тезису, — целым, грамматически связанным предложением;',
      '2) ничего сверх материала: число, которого нет во входе, не пиши; пример, которого не было, не выдумывай; новых советов и шагов не бывает;',
      '3) суть держит позицию человека и не спорит с ней: сомнения, оговорки, ограничения и контраргументы помещай только в поле «возражение» и не добавляй их в суть;',
      '4) длина берётся из материала, а не из желания написать длиннее или короче: если слов человека мало — суть короткая, три предложения — нормальная суть для мысли, к которой ничего не искали, и короткая правда лучше длинного пересказа; отмеченные опоры ресерча и блоки исходного материала — тоже материал, и с ними суть длиннее ровно на то, что они несут; ни одного предложения, за которым не стоит слово человека, опора или блок материала;',
      '5) запрещены сглаживание, вводные обороты, обобщения вместо частностей, выводы «в итоге» и «таким образом», призывы и вопросы читателю, и заключительное предложение, которое повторяет уже сказанное выше другими словами;',
      '6) без разметки, эмодзи, заголовков и списков; абзацы через пустую строку; язык — язык ввода; фрагмент на другом языке внутри входа — материал для пересказа на языке ввода, а не строка для копирования;',
      `7) ${forbiddenPhrases}`,
    ].join('\n'),
  en: (forbiddenPhrases: string) =>
    [
      'You are writing the CORE: a neutral, connected text about what this person wants to tell, with no platform and no manner. It is not a post and not a retelling of the brief — it is the ground that texts for different platforms will later be made from. It will be read as finished text, not as a draft or a transcript.',
      '',
      'WHAT TO WRITE FROM. The material arrives in blocks, and each block carries its own trust.',
      '— «The person’s words» and «answers to the questions» are the main material. Often it is dictation or a quick note: typos, fillers, repetitions and the word order of speech. Carried over verbatim: the person’s numbers, names, dates, examples and distinctive expressions («a convenient loophole», «a lift for the brand»), their short sentences and blunt judgements — that is the voice, do not smooth it. Corrected: typos and spelling; the fillers of dictated speech («I mean», «maybe», «some kind of», «here it is important, of course», «already», «in general»); a thought said in two consecutive turns of phrase is written once; the word order of a dictated sentence is straightened. Unchanged: the meaning, the judgements and the position, and the person’s words stay their words rather than better synonyms — correcting spelling and syntax is allowed, arguing with the person, softening them or finishing their thoughts for them is not. Never paste an answer as a block and never rewrite it sentence by sentence: take its thoughts and place them where they serve the claim. Write a selected answer option in the author’s first person. Example: before «Here it is important, of course, to read the contract, the contract, I mean, the offer, but you can always find a convenient clause there in order to recalcuate the price already at your own rate» — after «Read the offer: there is always a convenient clause to recalculate the price at your own rate».',
      '— The brief (claim, position, audience) is what the model understood from the material; in the text it is ground, not a quotation. The «objection» field is not for the core (see rule 3).',
      '— «Confirmed facts» may be stated as facts: checked against search or memory, or said by the person themselves.',
      '— «Taken from research» and «linked material (not verified)» are outside support, not verification: keep their uncertainty and never present them as confirmed facts.',
      '— Service material is not material: URLs, «here is the link», «see», questions to the model, «I want to write about…», «I would like to write about…», «let us write about…» are delivery and intent, not words for the text; only their topic and the read source are used, by meaning, and neither the framing nor the address enters the core. The person’s questions are topics for the text, not quotations or questions to the reader.',
      '',
      'HOW TO WRITE, all rules binding:',
      '1) begin with the person’s thought that stands closest to the claim — as a complete, grammatically connected sentence;',
      '2) nothing beyond the material: a number that is not in the input is not written; an example that was not there is not invented; there are never new pieces of advice or steps;',
      '3) the core holds the person’s position and never argues with it: doubts, caveats, limitations and counter-arguments go only into the «objection» field and never into the core;',
      '4) the length comes from the material, not from a wish to write longer or shorter: if the person gave few words, the core is short — three sentences is a normal core for a thought nothing was searched for, and a short truth beats a long retelling; selected research supports and source material blocks are material too, and with them the core is longer by exactly what they carry; not one sentence without a word of the person, a support or a material block behind it;',
      '5) smoothing over, introductory turns of phrase, generalities in place of particulars, «in the end» and «thus» conclusions, calls to action and questions to the reader are forbidden, and so is a closing sentence that repeats in other words what was already said above;',
      '6) no markup, no emoji, no headings, no lists; paragraphs separated by a blank line; the language is the language of the input; a fragment in another language inside the input is material to retell in the input language, never a line to copy;',
      `7) ${forbiddenPhrases}`,
    ].join('\n'),
} as const;

/** Блоки исходного материала: чужой пост — материал для своего текста. */
export const CORE_WRITE_FOREIGN_V9 = {
  ru: 'Отдельное правило о блоках исходного материала («тема», «угол», «как построен», «что происходит»): человек взял чужой пост как материал и делает из него СВОЙ текст — точно так же, как из собственной мысли. Читатель сути не должен узнать, что был какой-то чужой пост: слов «чужой пост», «исходный пост», «автор поста», «в тексте утверждается», «по словам автора» и любой другой отсылки к нему в сути нет. Утверждения из блока «что происходит» — это положение дел, о котором человек пишет: излагай их прямо и своими словами («площадки подняли комиссии», «продавцы жалуются, что работать стало невыгодно»), а не как чьё-то мнение и не как предмет спора с невидимым автором. Это материал, а не фон: по умолчанию каждое утверждение блока «что происходит» входит в текст своим предложением — обстановка, на которую человек отвечает, стоит в первом абзаце рядом с его первой мыслью, а не отдельным абзацем-справкой посреди его слов. Не входит только утверждение, которое повторяет другое или мешает тезису человека. Если человек не согласен с выводом исходного материала, спорь с самим выводом как с распространённым мнением, а не с постом. Число из исходного материала в суть не идёт, пока такое же не стоит в строке «подтверждено». Позиция человека — тезис и вывод текста; строй суть как свой пост: что происходит, что человек об этом думает, что предлагает. Строение исходного материала — подсказка о порядке, а не обязательный план. Материала хватает на несколько абзацев. Формулировок исходного материала не копируй и утверждений, которых в блоках нет, не добавляй.',
  en: 'A separate rule about the source material blocks («topic», «angle», «how it is built», «what is going on»): the person took somebody else’s post as material and is making their OWN text out of it — exactly as they would out of their own thought. The reader of the core must never learn that there was another post: the words «the pasted post», «the source post», «the author of the post», «the text claims», «according to the author» and any other reference to it do not appear in the core. The claims in the «what is going on» block are the state of affairs the person is writing about: state them plainly and in your own words («the platforms raised their fees», «sellers complain that the work no longer pays»), never as somebody’s opinion and never as a dispute with an invisible author. They are material, not background: by default every claim of the «what is going on» block enters the text with a sentence of its own — the situation the person is answering stands in the first paragraph next to their first thought, not as a separate reference paragraph in the middle of their words. Only a claim that repeats another or works against the person’s claim stays out. If the person disagrees with the source material’s conclusion, argue with the conclusion itself as a common opinion, not with the post. A number from the source material does not enter the core until the same number stands in a «confirmed» line. The person’s position is the claim and the conclusion of the text; build the core as their own post: what is going on, what the person thinks about it, what they propose. The structure of the source material is a hint about order, not a mandatory outline. There is enough material for several paragraphs. Never copy the source material’s wording and never add claims the blocks do not carry.',
} as const;

/** Опоры ресерча у ПЕРВОЙ сути: отмечены руками, ещё ничего не написано. */
export const CORE_WRITE_FIRST_RESEARCH_V9 = {
  ru: 'Отдельное правило об опорах ресерча: это первая суть, и ресерч к ней уже принесён, а опоры отмечены руками. Каждая отмеченная опора из брифа, которая работает на тезис, получает в тексте своё предложение: её число, дату, имя и единицу переноси дословно, не округляй и не обобщай. Опора, которая тезису не служит, в текст не входит вовсе — это выбор, а не перечисление всего, что нашлось. Две опоры об одном и том же из разных источников (то же число, та же дата, тот же факт) — одно предложение, а не два.',
  en: 'A separate rule about research supports: this is a first core, and its research has already been brought in with supports selected by hand. Every selected support from the brief that serves the claim gets a sentence of its own: carry its number, date, name and unit over verbatim, never rounded and never generalised. A support that does not serve the claim does not enter the text at all — this is a choice, not a listing of everything that was found. Two supports about the same thing from different sources (the same number, date or fact) make one sentence, not two.',
} as const;

/** Дополнение уже написанной сути отмеченными опорами. */
export const CORE_WRITE_ENRICH_V9 = {
  ru: 'Отдельное правило о дополнении: это ДОПОЛНЕНИЕ уже написанной сути, а не новая суть. Сохрани её мысль, позицию и полезные детали; ничего из неё не выбрасывай и не сокращай. Каждая отмеченная опора из брифа, которая работает на тезис, получает в тексте своё предложение: её число, дату, имя и единицу переноси дословно, не округляй и не обобщай. Опора, которая тезису не служит, в текст не входит вовсе — это выбор, а не перечисление всего, что нашлось; две опоры об одном и том же из разных источников — одно предложение, а не два. Новых чисел, примеров, советов и шагов в дополнении не бывает: ни одного предложения, за которым не стоит опора, слово человека или уже написанная суть.',
  en: 'A separate rule about enrichment: this is an ENRICHMENT of a core that is already written, not a new core. Keep its thought, position and useful details; drop nothing from it and never shorten it. Every selected support from the brief that serves the claim gets a sentence of its own: carry its number, date, name and unit over verbatim, never rounded and never generalised. A support that does not serve the claim does not enter the text at all — this is a choice, not a listing of everything that was found; two supports about the same thing from different sources make one sentence, not two. An enrichment never has new numbers, examples, advice or steps: not one sentence without a support, a word of the person or the existing core behind it.',
} as const;

/** Своё, которое поиск опроверг или не нашёл. */
export const CORE_WRITE_UNCONFIRMED_V9 = {
  ru: 'Отдельное правило о блоке «не подтвердилось поиском»: это числа и утверждения самого человека, которые поиск опроверг или не нашёл. Они — исключение из правила о дословных числах: даже если число стоит дословно в словах человека, как факт оно в суть не идёт. Если среди подтверждённых фактов есть строка с исправленным значением, бери значение оттуда; если такой строки нет, число не пиши вовсе, а мысль человека оставь без цифры. Не спорь с человеком и не объясняй, почему числа нет: в сути его просто нет.',
  en: 'A separate rule about the «not confirmed by search» block: these are the person’s own numbers and claims that the search contradicted or could not find. They are an exception to the rule about verbatim numbers: even when the number stands verbatim in the person’s words, it does not enter the core as a fact. If a confirmed fact carries the corrected value, take the value from there; if there is no such line, do not write the number at all and leave the person’s thought without the figure. Do not argue with the person and do not explain why the number is gone: the core simply does not have it.',
} as const;

export const coreWriteSystemV9 = (
  language: 'ru' | 'en',
  forbiddenPhrases: string,
  options: {
    enrichment?: boolean;
    /** Первая суть, у которой в брифе есть отмеченные опоры ресерча. */
    firstWithResearch?: boolean;
    /** В брифе есть блок «не подтвердилось поиском». */
    unconfirmed?: boolean;
    /** В брифе есть блоки исходного материала с утверждениями или строением. */
    foreign?: boolean;
  } = {}
): string =>
  [
    BASE[language](forbiddenPhrases),
    // Дополнение и первая суть с ресерчем — один и тот же вопрос, заданный
    // один раз: либо существующая суть есть, либо её нет.
    options.enrichment ? CORE_WRITE_ENRICH_V9[language] : '',
    !options.enrichment && options.firstWithResearch
      ? CORE_WRITE_FIRST_RESEARCH_V9[language]
      : '',
    options.unconfirmed ? CORE_WRITE_UNCONFIRMED_V9[language] : '',
    options.foreign ? CORE_WRITE_FOREIGN_V9[language] : '',
  ]
    .filter(Boolean)
    .join('\n');

export const CORE_WRITE_ENRICH_LEAD_V9 = CORE_WRITE_ENRICH_LEAD_V8;
export const CORE_WRITE_REPAIR_V9 = CORE_WRITE_REPAIR_V8;
