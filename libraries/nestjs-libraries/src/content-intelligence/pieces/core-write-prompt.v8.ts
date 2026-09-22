/**
 * Tenth-walk core prompt, successor of `core-write/v7` by one rule and four
 * block titles (`content-factory-next-97dq.24`, P1). Older prompt modules stay
 * importable and untouched: a released receipt must still name the exact
 * contract its core was written by.
 *
 * Что здесь поменялось и почему.
 *
 * Правило v7 о чужом посте велело модели «пересказать, на что человек
 * отвечает, как предмет спора». Модель сделала ровно это: на десятом заходе
 * 22.09.2026 (`cnt-23`) второй абзац сути читался «Чужой пост связывает…
 * автор поста пишет… он предлагает» — рецензия на чужой текст, а не свой
 * текст. Владелец назвал, что должно быть на самом деле: «мы должны создавать
 * то же самое, как когда мы пишем свой пост, просто берём чужой пост и из него
 * делаем свой». То есть чужой пост — материал, как и собственная мысль, а не
 * собеседник, которого надо представить читателю.
 *
 * Отсюда два изменения. Заголовки блоков больше не говорят «что чужой пост
 * утверждает»: модель повторяла подпись блока в тексте. И правило говорит
 * прямо: утверждения исходного поста — это положение дел, о котором человек
 * пишет; слов «чужой пост», «автор поста», «в тексте утверждается» в сути нет;
 * позиция человека — тезис и вывод; строится это как свой пост — что
 * происходит, что человек об этом думает, что предлагает. Правило 06.09.2026
 * (числа чужого поста только после проверки поиском) записано в то же правило
 * той же строкой, что и раньше, — только теперь оно стоит рядом с тем, что
 * с остальным материалом делать можно.
 *
 * Всё остальное — правила первой сути с ресерчем, блок «не подтвердилось
 * поиском», правила дополнения — v7 без изменений.
 */

import {
  CORE_WRITE_BLOCK_TITLES_V7,
  CORE_WRITE_ENRICH_LEAD_V7,
  CORE_WRITE_REPAIR_V7,
  coreWriteSystemV7,
} from './core-write-prompt.v7';

export const CORE_WRITE_PROMPT_VERSION = 'core-write/v8' as const;

/**
 * Заголовки блоков v7, кроме четырёх: блоки взятого из чужого поста подписаны
 * как материал, а не как чья-то речь. Подпись «что чужой пост утверждает»
 * возвращалась в суть словами «чужой пост связывает».
 */
export const CORE_WRITE_BLOCK_TITLES_V8 = {
  ru: {
    ...CORE_WRITE_BLOCK_TITLES_V7.ru,
    topic: 'тема исходного материала',
    angle: 'угол исходного материала',
    structure: 'как построен исходный материал (подсказка, не план)',
    claims: 'что происходит по исходному материалу (пересказ; числа отсюда не проверены)',
  },
  en: {
    ...CORE_WRITE_BLOCK_TITLES_V7.en,
    topic: 'topic of the source material',
    angle: 'angle of the source material',
    structure: 'how the source material is built (a hint, not an outline)',
    claims: 'what is going on per the source material (a retelling; its numbers are unverified)',
  },
} as const;

/**
 * Что модель делает с блоками исходного материала.
 *
 * Названной строкой без номера, как и в v7: действует для первой сути, для
 * дополнения и вместе с ресерчем.
 */
export const CORE_WRITE_FOREIGN_V8 = {
  ru: 'Отдельное правило о блоках исходного материала («тема», «угол», «как построен», «что происходит»): человек взял чужой пост как материал и делает из него СВОЙ текст — точно так же, как из собственной мысли. Читатель сути не должен узнать, что был какой-то чужой пост: слов «чужой пост», «исходный пост», «автор поста», «в тексте утверждается», «по словам автора» и любой другой отсылки к нему в сути нет. Утверждения из блока «что происходит» — это положение дел, о котором человек пишет: излагай их прямо и своими словами («площадки подняли комиссии», «продавцы жалуются, что работать стало невыгодно»), а не как чьё-то мнение и не как предмет спора с невидимым автором. Это материал, а не фон: каждое утверждение, на которое опирается позиция человека или без которого она непонятна, получает в тексте своё предложение — рядом с той мыслью человека, которую оно объясняет, а не отдельным абзацем-справкой посреди его слов. Если человек не согласен с выводом исходного материала, спорь с самим выводом как с распространённым мнением, а не с постом. Число из исходного материала в суть не идёт, пока такое же не стоит в строке «подтверждено». Позиция человека — тезис и вывод текста; строй суть как свой пост: что происходит, что человек об этом думает, что предлагает. Строение исходного материала — подсказка о порядке, а не обязательный план. Правило 4 здесь не действует: материала хватает на несколько абзацев. Формулировок исходного материала не копируй и утверждений, которых в блоках нет, не добавляй.',
  en: 'A separate rule about the source material blocks («topic», «angle», «how it is built», «what is going on»): the person took somebody else’s post as material and is making their OWN text out of it — exactly as they would out of their own thought. The reader of the core must never learn that there was another post: the words «the pasted post», «the source post», «the author of the post», «the text claims», «according to the author» and any other reference to it do not appear in the core. The claims in the «what is going on» block are the state of affairs the person is writing about: state them plainly and in your own words («the platforms raised their fees», «sellers complain that the work no longer pays»), never as somebody’s opinion and never as a dispute with an invisible author. They are material, not background: every claim the person’s position rests on, or without which it cannot be understood, gets a sentence of its own — next to the thought of the person it explains, not as a separate reference paragraph in the middle of their words. If the person disagrees with the source material’s conclusion, argue with the conclusion itself as a common opinion, not with the post. A number from the source material does not enter the core until the same number stands in a «confirmed» line. The person’s position is the claim and the conclusion of the text; build the core as their own post: what is going on, what the person thinks about it, what they propose. The structure of the source material is a hint about order, not a mandatory outline. Rule 4 does not apply here: there is enough material for several paragraphs. Never copy the source material’s wording and never add claims the blocks do not carry.',
} as const;

export const coreWriteSystemV8 = (
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
    // Правило v7 о чужом посте сюда не входит: его место занимает v8.
    coreWriteSystemV7(language, forbiddenPhrases, {
      enrichment: options.enrichment,
      firstWithResearch: options.firstWithResearch,
      unconfirmed: options.unconfirmed,
      foreign: false,
    }),
    options.foreign ? CORE_WRITE_FOREIGN_V8[language] : '',
  ]
    .filter(Boolean)
    .join('\n');

export const CORE_WRITE_ENRICH_LEAD_V8 = CORE_WRITE_ENRICH_LEAD_V7;
export const CORE_WRITE_REPAIR_V8 = CORE_WRITE_REPAIR_V7;
