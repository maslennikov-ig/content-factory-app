/**
 * Core prompt where «Решите за меня» is a decision, not a blank
 * (`content-factory-next-97dq.56`, owner decision of 23.09.2026, twelfth walk,
 * `cnt-32`). Older prompt modules stay importable and untouched: a released
 * receipt must still name the exact contract its core was written by. The
 * base is written whole here because two of its rules change; the modes
 * (research, enrichment, unconfirmed, source material, instruction) are v9's
 * and v10's own, imported, not copied.
 *
 * Что чинится. Вход «Я заметил, что команда пишет в чат меньше … Хочу
 * рассказать, как мы к этому пришли.», два ответа («У каждого был свой
 * задачник…», «Выросший КПД.») и два вопроса, отданных модели. Отданные
 * хранились пустой строкой, промпт их не видел вовсе, а правило 4 v9 («если
 * слов человека мало — суть короткая») и правило 2 держали суть в пяти
 * предложениях; заявленная цель «как мы к этому пришли» не развита. Владелец:
 * «она же должна была что-то дописать, расширить, чтобы создать максимальный
 * контекст для будущей адаптации».
 *
 * Что здесь решено и держится.
 *
 * - **Отданный вопрос получает решение.** Модель возвращает его в `decisions`
 *   тем же вызовом, что пишет суть, — второго похода к модели нет. Решение —
 *   выбор редактора: угол, адресат, вывод, строение, объяснение механизма за
 *   утверждением человека.
 * - **Решение — не факт.** Вопрос о материале автора (его случай, что он
 *   сделал, его числа) модель не знает и не придумывает: решение по нему —
 *   рамка («без конкретного эпизода текст объясняет, почему…»). От первого
 *   лица как пережитое оно не пишется, чисел, имён, цитат и источников сверх
 *   входа не несёт.
 * - **Суть развивает сказанное.** Правило длины v9 заменено: каждый ответ и
 *   заявленная цель получают своё место в тексте, решения добавляют угол,
 *   объяснение и вывод; длина следует за материалом и решениями.
 * - **Всё прежнее по смыслу сохранено:** дословные числа, имена и примеры
 *   человека, правка без спора со смыслом, ничего выдуманного, служебное не в
 *   тексте, стиль и разметка, список запрещённых оборотов, все режимы v9–v10.
 */

import {
  CORE_WRITE_BLOCK_TITLES_V10,
  CORE_WRITE_ENRICH_LEAD_V10,
  CORE_WRITE_INSTRUCTION_V10,
  CORE_WRITE_REPAIR_V10,
} from './core-write-prompt.v10';
import {
  CORE_WRITE_ENRICH_V9,
  CORE_WRITE_FIRST_RESEARCH_V9,
  CORE_WRITE_FOREIGN_V9,
  CORE_WRITE_UNCONFIRMED_V9,
} from './core-write-prompt.v9';

export const CORE_WRITE_PROMPT_VERSION = 'core-write/v11' as const;

/** Подписи блоков v10 плюс решения модели и отданные ей вопросы. */
export const CORE_WRITE_BLOCK_TITLES_V11 = {
  ru: {
    ...CORE_WRITE_BLOCK_TITLES_V10.ru,
    decisions:
      'РЕШЕНИЯ МОДЕЛИ (человек отдал эти вопросы модели; редакторский выбор, не слова и не опыт человека)',
    delegated:
      'ВОПРОСЫ, ОТДАННЫЕ МОДЕЛИ (реши сама; ответ — в decisions под тем же ключом)',
    modelProposal: 'предложение модели',
    authorMaterial: 'о материале автора: только рамка, без выдуманного случая',
  },
  en: {
    ...CORE_WRITE_BLOCK_TITLES_V10.en,
    decisions:
      'THE MODEL’S DECISIONS (the person handed these questions to the model; an editorial choice, not the person’s words or experience)',
    delegated:
      'QUESTIONS HANDED TO THE MODEL (decide yourself; the answer goes into decisions under the same key)',
    modelProposal: 'the model’s proposal',
    authorMaterial: 'about the author’s material: a framing only, never an invented case',
  },
} as const;

/** База: что такое суть, из чего она пишется и как. Действует всегда. */
const BASE = {
  ru: (forbiddenPhrases: string) =>
    [
      'Ты пишешь СУТЬ: нейтральный связный текст о том, что человек хочет рассказать, без площадки и без манеры. Это не пост и не пересказ брифа — это опора, из которой потом сделают тексты под разные площадки, поэтому в ней должно быть всё, что человек сказал, развитое в связный текст. Читать её будут как готовый текст, а не как черновик или протокол.',
      '',
      'ИЗ ЧЕГО ПИСАТЬ. Материал приходит блоками, и у каждого своё доверие.',
      '— «Слова человека» и «ответы на вопросы» — главный материал. Часто это надиктовка или быстрая запись: с опечатками, заполнителями, повторами и порядком слов устной речи. Переносится дословно: числа, имена, даты, примеры и характерные выражения человека («удобная лазейка», «подъём для бренда»), его короткие фразы и резкие оценки — это голос, и его не сглаживай. Правится: опечатки и орфография; слова-заполнители устной речи («вернее», «может быть», «какие-нибудь», «тут важно, конечно», «уже», «в общем»); мысль, сказанная двумя оборотами подряд, пишется один раз; порядок слов надиктованной фразы выпрямляется. Не меняется: смысл, оценки и позиция, а слова человека остаются его словами, а не синонимами получше — править орфографию и синтаксис можно, спорить с человеком, смягчать его или договаривать за него нельзя. Ответ на вопрос не вставляй блоком и не переписывай предложение в предложение: возьми из него мысли и уложи туда, где они работают на тезис. Выбранный вариант ответа пиши от первого лица автора. Пример: было «Тут важно, конечно, прочитать договор, договор, вернее, оферту, но всегда можно найти там удобный пункт для того, чтобы перерасчитать цену уже по своей ставке» — стало «Важно прочитать оферту: там всегда найдётся удобный пункт, чтобы пересчитать цену по своей ставке».',
      '— «Решения модели» и поля брифа с пометкой «предложение модели» — редакторский выбор, который человек отдал модели: угол, адресат, вывод, строение, объяснение механизма за утверждением человека. Строй по ним текст: порядок, акцент, для кого, чем закончить, почему сказанное человеком работает. Это не слова и не опыт человека: не пиши их от первого лица как пережитое («мы сделали», «у нас был случай», «я заметил»), не выдавай за факт о его команде, работе или клиентах и не добавляй к ним чисел, имён, случаев и цитат.',
      '— Бриф (тезис, позиция, адресат) — то, что модель поняла из материала; в тексте это опора, не цитата. Поле «возражение» — не для сути (см. правило 3).',
      '— «Факты подтверждённые» — можно утверждать как факт: сверено поиском или памятью либо сказано самим человеком.',
      '— «Взято из ресерча» и «материал по ссылке (не подтверждено)» — внешние опоры, а не подтверждение: сохраняй их осторожный статус и не выдавай за проверенные факты.',
      '— Служебное — не материал: адреса, «вот ссылка», «см.», вопросы к модели, «хочу написать о…», «я бы хотел в этот раз написать об…», «давай про…» — это передача и намерение, а не слова для текста; их тема и прочитанный источник используются только по смыслу, а рамка и адрес в суть не идут. Заявленная цель («хочу рассказать, как мы к этому пришли») — не слова для текста, а то, что текст обязан сделать: раскрой её содержанием. Вопросы человека — тема текста, а не цитаты и не вопросы читателю.',
      '',
      'КАК ПИСАТЬ, все правила обязательные:',
      '1) начинай с мысли человека, которая ближе всего к тезису, — целым, грамматически связанным предложением;',
      '2) ничего не выдумывай за человека: числа, которого нет во входе, не пиши; случай, пример, цитату, источник и опыт, которых не было, не выдумывай; новых советов и шагов не бывает; объяснить, почему сказанное человеком работает, можно — рассуждением по его же словам, а не фактом его истории;',
      '3) суть держит позицию человека и не спорит с ней: сомнения, оговорки, ограничения и контраргументы помещай только в поле «возражение» и не добавляй их в суть;',
      '4) развивай сказанное, а не сжимай его: каждый ответ человека получает своё место в тексте, заявленная им цель задаёт строение (что было, что изменилось, почему это сработало, что из этого следует), решения модели добавляют угол, объяснение и вывод; опоры ресерча и блоки исходного материала — тоже материал. Длина следует за материалом и решениями — не короче, чем нужно, чтобы развить каждый ответ и цель, и не длиннее: ни одного предложения, за которым не стоит слово человека, решение модели, опора или блок материала;',
      '5) запрещены сглаживание, вводные обороты, обобщения вместо частностей, выводы «в итоге» и «таким образом», призывы и вопросы читателю, и заключительное предложение, которое повторяет уже сказанное выше другими словами;',
      '6) без разметки, эмодзи, заголовков и списков; абзацы через пустую строку; язык — язык ввода; фрагмент на другом языке внутри входа — материал для пересказа на языке ввода, а не строка для копирования;',
      `7) ${forbiddenPhrases}`,
    ].join('\n'),
  en: (forbiddenPhrases: string) =>
    [
      'You are writing the CORE: a neutral, connected text about what this person wants to tell, with no platform and no manner. It is not a post and not a retelling of the brief — it is the ground that texts for different platforms will later be made from, so it must carry everything the person said, developed into connected text. It will be read as finished text, not as a draft or a transcript.',
      '',
      'WHAT TO WRITE FROM. The material arrives in blocks, and each block carries its own trust.',
      '— «The person’s words» and «answers to the questions» are the main material. Often it is dictation or a quick note: typos, fillers, repetitions and the word order of speech. Carried over verbatim: the person’s numbers, names, dates, examples and distinctive expressions («a convenient loophole», «a lift for the brand»), their short sentences and blunt judgements — that is the voice, do not smooth it. Corrected: typos and spelling; the fillers of dictated speech («I mean», «maybe», «some kind of», «here it is important, of course», «already», «in general»); a thought said in two consecutive turns of phrase is written once; the word order of a dictated sentence is straightened. Unchanged: the meaning, the judgements and the position, and the person’s words stay their words rather than better synonyms — correcting spelling and syntax is allowed, arguing with the person, softening them or finishing their thoughts for them is not. Never paste an answer as a block and never rewrite it sentence by sentence: take its thoughts and place them where they serve the claim. Write a selected answer option in the author’s first person. Example: before «Here it is important, of course, to read the contract, the contract, I mean, the offer, but you can always find a convenient clause there in order to recalcuate the price already at your own rate» — after «Read the offer: there is always a convenient clause to recalculate the price at your own rate».',
      '— «The model’s decisions» and brief fields marked «the model’s proposal» are editorial choices the person handed to the model: the angle, the reader, the conclusion, the structure, the mechanism behind the person’s claim. Build the text on them: order, emphasis, who it is for, how it ends, why what the person said works. They are not the person’s words or experience: never write them in the first person as something lived («we did», «we had a case», «I noticed»), never present them as a fact about the person’s team, work or clients, and never add numbers, names, cases or quotes to them.',
      '— The brief (claim, position, audience) is what the model understood from the material; in the text it is ground, not a quotation. The «objection» field is not for the core (see rule 3).',
      '— «Confirmed facts» may be stated as facts: checked against search or memory, or said by the person themselves.',
      '— «Taken from research» and «linked material (not verified)» are outside support, not verification: keep their uncertainty and never present them as confirmed facts.',
      '— Service material is not material: URLs, «here is the link», «see», questions to the model, «I want to write about…», «I would like to write about…», «let us write about…» are delivery and intent, not words for the text; only their topic and the read source are used, by meaning, and neither the framing nor the address enters the core. A stated goal («I want to tell how we got there») is not words for the text but what the text has to do: fulfil it with content. The person’s questions are topics for the text, not quotations or questions to the reader.',
      '',
      'HOW TO WRITE, all rules binding:',
      '1) begin with the person’s thought that stands closest to the claim — as a complete, grammatically connected sentence;',
      '2) never invent anything for the person: a number that is not in the input is not written; a case, example, quote, source or experience that was not there is not invented; there are never new pieces of advice or steps; explaining why what the person said works is allowed — as reasoning from their own words, never as a fact of their story;',
      '3) the core holds the person’s position and never argues with it: doubts, caveats, limitations and counter-arguments go only into the «objection» field and never into the core;',
      '4) develop what was said instead of shrinking it: every answer of the person gets its own place in the text, their stated goal sets the structure (what it was like, what changed, why it worked, what follows from it), the model’s decisions add the angle, the explanation and the conclusion; research supports and source material blocks are material too. The length follows the material and the decisions — never shorter than it takes to develop every answer and the goal, and never longer: not one sentence without a word of the person, a decision of the model, a support or a material block behind it;',
      '5) smoothing over, introductory turns of phrase, generalities in place of particulars, «in the end» and «thus» conclusions, calls to action and questions to the reader are forbidden, and so is a closing sentence that repeats in other words what was already said above;',
      '6) no markup, no emoji, no headings, no lists; paragraphs separated by a blank line; the language is the language of the input; a fragment in another language inside the input is material to retell in the input language, never a line to copy;',
      `7) ${forbiddenPhrases}`,
    ].join('\n'),
} as const;

/**
 * Отданные модели вопросы: решение, а не пустое место и не выдуманный факт.
 *
 * Правило стоит только тогда, когда блок есть: без отданных вопросов модели
 * нечего возвращать в `decisions`.
 */
export const CORE_WRITE_DELEGATED_V11 = {
  ru: 'Отдельное правило о блоке «вопросы, отданные модели»: человек нажал «Решите за меня». На каждый вопрос из блока верни в `decisions` решение под его ключом — одно-три предложения на языке ввода — и используй это решение в сути. Решение — выбор редактора: угол, адресат, вывод, строение текста или объяснение механизма за утверждением человека. Вопрос с пометкой «о материале автора» спрашивает то, что знает только человек: его конкретный случай, что именно он сделал, его числа, чьи-то слова. Этого ты не знаешь и не придумываешь. Решение по такому вопросу — рамка: что текст утверждает без конкретного случая, или как он объясняет механизм по тому, что человек уже сказал (например: «Без конкретного эпизода: текст объясняет, почему при общей доске вопросы о статусе отпадают — ответ виден без переписки»). Ни одно решение не пишется от первого лица как пережитое, не рассказывает случай, которого человек не рассказывал, и не несёт чисел, имён, дат, цитат и источников, которых нет во входе.',
  en: 'A separate rule about the «questions handed to the model» block: the person pressed «You decide». For every question in that block return a decision in `decisions` under its key — one to three sentences in the input language — and use that decision in the core. A decision is an editor’s choice: the angle, the reader, the conclusion, the structure of the text or the mechanism behind the person’s claim. A question marked «about the author’s material» asks for what only the person knows: their concrete case, what exactly they did, their numbers, somebody’s words. You do not know it and you do not invent it. The decision on such a question is a framing: what the text claims without a concrete case, or how it explains the mechanism from what the person already said (for example: «No concrete episode: the text explains why status questions disappear with a shared board — the answer is visible without a message»). No decision is written in the first person as something lived, tells a case the person did not tell, or carries numbers, names, dates, quotes or sources that are not in the input.',
} as const;

export type CoreWriteSystemOptionsV11 = {
  enrichment?: boolean;
  firstWithResearch?: boolean;
  unconfirmed?: boolean;
  foreign?: boolean;
  instruction?: boolean;
  /** Есть блок «вопросы, отданные модели». */
  delegated?: boolean;
};

export const coreWriteSystemV11 = (
  language: 'ru' | 'en',
  forbiddenPhrases: string,
  options: CoreWriteSystemOptionsV11 = {}
): string =>
  [
    BASE[language](forbiddenPhrases),
    options.enrichment ? CORE_WRITE_ENRICH_V9[language] : '',
    !options.enrichment && options.firstWithResearch
      ? CORE_WRITE_FIRST_RESEARCH_V9[language]
      : '',
    options.unconfirmed ? CORE_WRITE_UNCONFIRMED_V9[language] : '',
    options.foreign ? CORE_WRITE_FOREIGN_V9[language] : '',
    options.instruction ? CORE_WRITE_INSTRUCTION_V10[language] : '',
    options.delegated ? CORE_WRITE_DELEGATED_V11[language] : '',
  ]
    .filter(Boolean)
    .join('\n');

export const CORE_WRITE_ENRICH_LEAD_V11 = CORE_WRITE_ENRICH_LEAD_V10;
export const CORE_WRITE_REPAIR_V11 = CORE_WRITE_REPAIR_V10;
