/**
 * Русские правила проверки на ИИ-штампы. Первая очередь.
 *
 * `content-factory-next-tu3k.3`, решение владельца 06.09.2026: проверка
 * показывает находки и ничего не правит сама.
 *
 * Источники (переписаны здесь, код не копировался):
 *  - каталог владельца `ai-text-checker.md` (признаки A1–A43, слой B, слой C)
 *    — оттуда взяты состав признаков, пороги вопросов по площадкам и
 *    известные границы ложных срабатываний;
 *  - `voice-check/scripts/lint_ru.py` владельца — местные правила поверх
 *    апстрима и, что важнее, их исключения;
 *  - `smixs/humanizer-ru` (`lint.py`), лицензия MIT — списки оборотов класса A,
 *    WARN_PHRASES, смягчители и метрики ритма. Идея и словари переиспользованы
 *    по условиям MIT, реализация написана здесь.
 *
 * Три границы ложных срабатываний соблюдены намеренно, каждая проверена
 * измерением автора, а не вкусом:
 *  - существительные на «-ость» («надёжность», «связность») — это названия
 *    измеряемых свойств, а не оценка;
 *  - «я считаю», «я думаю» — подпись автора, а не рамка косвенной речи, и
 *    правила рамки здесь нет;
 *  - одиночный усилитель без следующего слова («Совершенно.») не считается.
 * Правила «длинное тире» и «разделитель ---» в списке отсутствуют осознанно:
 * в русском тире часто обязательно грамматически, а частота тире у автора
 * (4,6 на 1000 знаков) совпадает с нормой корпуса. Тире осталось только как
 * метрика плотности с порогом 8.
 */
import { AI_ARTEFACT_MARKERS } from '../brand-voice/ai-artefacts';
import {
  LEFT,
  RIGHT,
  WORD_CHAR,
  phrases,
  type SlopRule,
} from './slop-rules.types';

const W = WORD_CHAR;

/* ---- класс A: метки, которые оставляет чат-бот ---------------------------- */

/**
 * Разметка чат-ботов и следы копипаста. Ошибка без обсуждения: такого в
 * тексте человека не бывает вовсе.
 *
 * Часть узоров уже собрана в `brand-voice/ai-artefacts.ts` для защиты корпуса
 * от чужих образцов — они переиспользованы, а не переписаны второй раз.
 */
const ARTEFACT_EXTRA = [
  ':contentReference\\[oaicite:\\d+\\]',
  'oai_citation:\\d+',
  '\\boaicite:\\d+',
  '\\bturn\\d+(?:search|file|fetch|image|news|video|ref)\\d+',
  'utm_source=(?:chatgpt|copilot)\\.com',
  'referrer=grok\\.com',
  'grok_card://',
  'grok_render_citation_card_json',
  '<grok-card\\b',
  'vertexaisearch\\S*grounding-api-redirect',
  '\\[cite_start\\]',
  '\\[cite:\\s*\\d+',
  '\\[span_\\d+\\]',
  '\\]\\(sandbox:/mnt/data/',
  'ppl-ai-file-upload',
  'INSERT_SOURCE_URL',
  'PASTE_\\w+_URL_HERE',
  '\\bURL_HERE\\b',
  '\\b20\\d\\d-XX-XX\\b',
];

export const ARTEFACT_PATTERN = new RegExp(
  [
    ...AI_ARTEFACT_MARKERS.map((marker) => marker.pattern.source),
    ...ARTEFACT_EXTRA,
  ].join('|'),
  'gi'
);

/**
 * Невидимые символы. Предупреждение, а не ошибка: их ставят и рассылочные
 * системы. ZWJ внутри эмодзи-последовательности — норма, ловим только вне её.
 */
const EMOJI_CH = '[\\p{Extended_Pictographic}\\u{1F3FB}-\\u{1F3FF}]';
export const ZERO_WIDTH_PATTERN = new RegExp(
  `[\\u200B\\u200C\\u2060\\uFEFF]|(?<!${EMOJI_CH})\\u200D|\\u200D(?!${EMOJI_CH})`,
  'gu'
);

/* ---- словари -------------------------------------------------------------- */

const OTSENKI = [
  'эффективн',
  'качественн',
  'надёжн',
  'надежн',
  'мощн',
  'удобн',
  'отличн',
  'превосходн',
  'потрясающ',
  'впечатляющ',
  'внушительн',
  'солидн',
  'достойн',
  'оптимальн',
  'уникальн',
  'инновационн',
  'революционн',
  'прорывн',
  'продвинут',
  'безупречн',
  'первоклассн',
  'беспрецедентн',
  'колоссальн',
  'грандиозн',
  'выдающ',
];

const USILITELI = [
  'абсолютно',
  'совершенно',
  'полностью',
  'максимально',
  'минимально',
  'предельно',
  'крайне',
  'весьма',
  'чрезвычайно',
  'невероятно',
  'по-настоящему',
  'поистине',
  'подлинно',
  'безоговорочно',
  'радикально',
  'кардинально',
  'напрочь',
  'начисто',
];

const VVODNYE = [
  'безусловно',
  'бесспорно',
  'разумеется',
  'очевидно',
  'несомненно',
  'естественно',
  'на самом деле',
  'по сути',
  'в принципе',
  'в сущности',
  'казалось бы',
  'как ни странно',
  'судя по всему',
  'таким образом',
  'стало быть',
  'собственно',
  'впрочем',
  'иначе говоря',
  'другими словами',
  'проще говоря',
  'строго говоря',
  'само собой',
  'одним словом',
  'прежде всего',
];

const SOFTENERS = [
  'возможно',
  'вероятно',
  'по-видимому',
  'как правило',
  'в некоторых случаях',
  'скорее всего',
  'обычно',
  'в зависимости от',
  'в большинстве случаев',
  'потенциально',
];

/* ---- правила -------------------------------------------------------------- */

export const RU_RULES: SlopRule[] = [
  {
    id: 'artefact',
    severity: 'error',
    kind: 'regex',
    scope: 'raw',
    pattern: ARTEFACT_PATTERN,
    hint: {
      ru: 'Метка чат-бота или следа копипаста. Уберите её из текста.',
      en: 'A chatbot marker or a paste artefact. Remove it from the text.',
    },
  },
  {
    id: 'zero-width',
    severity: 'warn',
    kind: 'regex',
    scope: 'raw',
    pattern: ZERO_WIDTH_PATTERN,
    hint: {
      ru: 'Невидимый символ. Такое оставляют редакторы и рассылки — проверьте источник.',
      en: 'A zero-width character. Editors and mailing tools leave these — check the source.',
    },
  },
  {
    id: 'negative-parallelism',
    severity: 'error',
    kind: 'regex',
    pattern: new RegExp(
      `${LEFT}не (?:просто|только)${RIGHT}(?:[^.!?\\n]{0,80}?${LEFT}но и${RIGHT})?` +
        `|${LEFT}речь ид[её]т не только` +
        `|${LEFT}нет [^,.!?\\n]{1,40}, нет `,
      'giu'
    ),
    hint: {
      ru: '«Не просто X, а Y» — самый частый ход машины. Скажите прямо, что это.',
      en: '“Not just X, but Y” is the commonest machine move. Say plainly what it is.',
    },
  },
  {
    id: 'contrast-tail',
    severity: 'warn',
    kind: 'regex',
    pattern: new RegExp(
      '[^.!?\\n]{10,90},\\s+(?:а|но) не\\s+' +
        '(?!вышло|получилось|сработало|удалось|пришлось)[^.!?\\n]{2,60}',
      'giu'
    ),
    hint: {
      ru: 'Хвост «а не …». Выкиньте вторую половину: если смысл цел, её и не должно быть.',
      en: 'A “but not …” tail. Drop the second half: if the sense survives, it did not belong.',
    },
  },
  {
    id: 'chopped-drama',
    severity: 'error',
    kind: 'regex',
    pattern: /(?:Без|Ноль) [^.!?\n]{1,35}[.!] (?:Без|Ноль) /gu,
    hint: {
      ru: 'Рубленый драматизм: «Без кода. Без настроек.» Соберите обратно в одну фразу.',
      en: 'Chopped drama: “No code. No setup.” Put it back into one sentence.',
    },
  },
  {
    id: 'math-signs',
    severity: 'warn',
    kind: 'regex',
    pattern: new RegExp(`[≈≥≤≠±⇒←→]|\\s[=><&]\\s|${LEFT}vs\\.?${RIGHT}`, 'giu'),
    hint: {
      ru: 'Математический знак в прозе. В посте это слово: «примерно», «против», «и».',
      en: 'A mathematical sign in prose. In a post it is a word: “about”, “versus”, “and”.',
    },
  },
  {
    id: 'participle-cliche',
    severity: 'warn',
    kind: 'regex',
    pattern: phrases([
      'подчёркивая',
      'демонстрируя',
      'свидетельствуя',
      'способствуя',
      'обеспечивая',
      'отражая',
      'символизируя',
      'воплощая',
      'формируя',
    ]),
    hint: {
      ru: 'Деепричастный штамп — самый глубокий признак машины. Сделайте из него глагол.',
      en: 'A participle cliché — the deepest machine tell. Turn it into a verb.',
    },
  },
  {
    id: 'inflated-significance',
    severity: 'warn',
    kind: 'regex',
    pattern: phrases([
      'играет ключевую роль',
      'играет решающую роль',
      'играют ключевую роль',
      'знаменует собой',
      `краеугольн${W}* камн${W}*`,
      `неоценим${W}* вклад`,
      'задаёт вектор',
      `неизгладим${W}* след`,
      `нов${W}* эру`,
    ]),
    hint: {
      ru: 'Раздутая значимость. Замените на то, что произошло на самом деле.',
      en: 'Inflated significance. Replace it with what actually happened.',
    },
  },
  {
    id: 'promo-words',
    severity: 'warn',
    kind: 'regex',
    pattern: phrases([
      'может похвастаться',
      'в самом сердце',
      `захватывающ${W}* дух`,
      `непревзойдённ${W}*`,
      `неповторим${W}*`,
      'раскрывает потенциал',
      'не может не впечатлять',
    ]),
    hint: {
      ru: 'Рекламный оборот. Читателю передаётся факт, а не восторг.',
      en: 'Advertising language. A reader takes in a fact, not enthusiasm.',
    },
  },
  {
    id: 'weasel-attribution',
    severity: 'warn',
    kind: 'regex',
    pattern: phrases([
      'по мнению экспертов',
      'аналитики отмечают',
      'исследователи утверждают',
      'наблюдатели отмечают',
      'эксперты полагают',
      'ряд специалистов',
      'согласно различным источникам',
      'по имеющимся данным',
      'по данным отраслевых',
    ]),
    hint: {
      ru: 'Размытая ссылка. Назовите, кто именно это сказал, или уберите утверждение.',
      en: 'A vague attribution. Name who said it, or drop the claim.',
    },
  },
  {
    id: 'copula-avoidance',
    severity: 'warn',
    kind: 'regex',
    pattern: phrases([
      'представляет собой',
      'выступает в роли',
      'служит основой',
      'олицетворяет',
      'воплощает в себе',
    ]),
    hint: {
      ru: 'Обход простого «это». Поставьте тире и назовите вещь своим именем.',
      en: 'Avoiding a plain “is”. Say the thing directly.',
    },
  },
  {
    id: 'template-transition',
    severity: 'warn',
    kind: 'regex',
    pattern: phrases([
      'важно отметить',
      'следует подчеркнуть',
      'необходимо учитывать',
      'стоит обратить внимание',
      'нельзя не упомянуть',
      'стоит отметить',
      'важно подчеркнуть',
      'необходимо отметить',
    ]),
    hint: {
      ru: 'Шаблонный переход. Начните сразу с того, что важно.',
      en: 'A template transition. Start with the thing that matters.',
    },
  },
  {
    id: 'chatbot-frame',
    severity: 'warn',
    kind: 'regex',
    pattern: phrases([
      'отличный вопрос',
      'надеюсь, это поможет',
      'надеюсь, было полезно',
      'дайте знать',
      'буду рад помочь',
      'вы абсолютно правы',
      'если хотите, я могу',
    ]),
    hint: {
      ru: 'Рамка чат-бота. В посте её быть не может: это остаток переписки.',
      en: 'A chatbot frame. It cannot belong in a post — it is left over from a chat.',
    },
  },
  {
    id: 'stock-opening',
    severity: 'warn',
    kind: 'regex',
    pattern: phrases([
      'в современном мире',
      'на сегодняшний день',
      'в настоящее время',
      'как известно',
      'не секрет, что',
      'ни для кого не секрет',
      'каждый из нас',
    ]),
    hint: {
      ru: 'Дежурный зачин. Первая фраза — уже факт, а не разгон.',
      en: 'A stock opening. The first sentence is already a fact, not a run-up.',
    },
  },
  {
    id: 'pseudo-depth',
    severity: 'warn',
    kind: 'regex',
    pattern: phrases([
      'если копнуть глубже',
      'глубинная проблема',
      'настоящий вопрос в том',
      'в конечном счёте',
      'все упускают',
      'большинство упускает',
      'никто не расскажет',
      'никто не говорит о',
      'главная ошибка большинства',
      'чего вам не расскажут',
    ]),
    hint: {
      ru: 'Псевдоглубина: обещание тайны вместо самой мысли.',
      en: 'Pseudo-depth: a promise of a secret instead of the thought itself.',
    },
  },
  {
    id: 'announcement',
    severity: 'warn',
    kind: 'regex',
    pattern: phrases([
      'давайте разберёмся',
      'погрузимся в',
      'вот что нужно знать',
      'без лишних слов',
      'об этом ниже',
      'об этом позже',
      'дальше будет видно',
      'представьте',
      'вот она:',
      'скажу прямо',
      'давайте начистоту',
      'вот в чём штука',
      'если по-честному',
    ]),
    hint: {
      ru: 'Объявление вместо содержания. Абзац начинается со своего первого факта.',
      en: 'An announcement instead of content. A paragraph starts with its first fact.',
    },
  },
  {
    id: 'performative-honesty',
    severity: 'warn',
    kind: 'metric',
    metric: 'count-over',
    threshold: 1,
    pattern: new RegExp(`${LEFT}честн${W}*`, 'giu'),
    hint: {
      ru: 'Перформативная честность. Один раз — оговорка, дальше — приём: факт говорит сам.',
      en: 'Performative honesty. Once is a caveat; beyond that it is a device — the fact speaks.',
    },
  },
  {
    id: 'bureaucratic',
    severity: 'warn',
    kind: 'regex',
    pattern: phrases([
      'в рамках',
      'на данный момент',
      `осуществля${W}*`,
      'данный',
      'данная',
      'данное',
      'данные',
      `вышеупомянут${W}*`,
      'в целях',
      'на основании',
      'в соответствии с',
      `надлежащ${W}*`,
      'имеет место быть',
      'для того чтобы',
      'в связи с тем, что',
      'в случае если',
    ]),
    hint: {
      ru: 'Канцелярит. Скажите то же самое человеческим глаголом.',
      en: 'Bureaucratic language. Say the same thing with a plain verb.',
    },
  },
  {
    id: 'vvodnye',
    severity: 'warn',
    kind: 'regex',
    // Вводное ловится там, где оно паразит: в начале предложения или после
    // запятой. В середине фразы это часто настоящее слово.
    pattern: new RegExp(
      `(?:^|(?<=[.!?…]\\s)|(?<=,\\s))(?:${VVODNYE.join('|')})${RIGHT}`,
      'gimu'
    ),
    hint: {
      ru: 'Вводное слово-паразит. Уберите — фраза станет короче и не потеряет ничего.',
      en: 'A filler introductory word. Remove it: the sentence loses nothing.',
    },
  },
  {
    id: 'evaluation-without-fact',
    severity: 'warn',
    kind: 'regex',
    // Существительные на «-ость» выведены намеренно: «надёжность» и
    // «связность» у автора — названия измеряемых свойств, а не оценки.
    pattern: new RegExp(
      `${LEFT}(?:${OTSENKI.map((stem) => stem.replace(/ё/g, '[её]')).join('|')})` +
        `(?!ост[ьияюей])${W}*${RIGHT}`,
      'giu'
    ),
    hint: {
      ru: 'Оценка на месте факта. Поставьте число, сценарий или случай.',
      en: 'An evaluation where a fact belongs. Put a number, a scene or a case there.',
    },
  },
  {
    id: 'intensifier',
    severity: 'warn',
    kind: 'regex',
    // Только перед словом: одиночный усилитель в разговорной вставке
    // («Совершенно.») — это голос человека, а не штамп.
    pattern: new RegExp(`${LEFT}(?:${USILITELI.join('|')})\\s+${W}{4,}`, 'giu'),
    hint: {
      ru: 'Усилитель поверх оценки. Он ничего не добавляет к факту.',
      en: 'An intensifier stacked on an evaluation. It adds nothing to the fact.',
    },
  },
  {
    id: 'vague-quantity',
    severity: 'warn',
    kind: 'regex',
    pattern: new RegExp(
      `${LEFT}(?:более|свыше|около|порядка|примерно|не менее|не более)\\s+\\d` +
        `|${LEFT}в\\s+топ-\\d` +
        `|${LEFT}в тройке лидеров` +
        `|${LEFT}одни из лидеров` +
        `|${LEFT}лидирующие позиции`,
      'giu'
    ),
    hint: {
      ru: 'Размытое количество. Назовите точное число или не называйте вовсе.',
      en: 'A vague quantity. Give the exact number or none at all.',
    },
  },
  {
    id: 'softener-cascade',
    severity: 'warn',
    kind: 'metric',
    metric: 'per-sentence',
    threshold: 3,
    pattern: phrases(SOFTENERS),
    hint: {
      ru: 'Каскад смягчений в одной фразе. Одно-два — речь, три — уклонение.',
      en: 'A cascade of hedges in one sentence. One or two is speech; three is evasion.',
    },
  },
];
