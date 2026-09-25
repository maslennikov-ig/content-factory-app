import {
  CHANNEL_NOTES_LIMIT,
  TELEGRAM_PROVIDER_IDENTIFIER,
  defaultWritingProfileFor,
  type ChannelWritingProfileV1,
} from '@contentfactory/nestjs-libraries/content-intelligence/channels/channel-writing-profile';
import {
  EMOJI_DEFAULT_POST_CHARS,
  EMOJI_DENSITY,
  emojiRangeFor,
  isEmojiDensity,
  readEmojiLevel,
  type EmojiDensity,
  type StoredEmojiLevel,
} from '@contentfactory/nestjs-libraries/content-intelligence/channels/emoji-ceiling';
import type { IntakeFormatV1 } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';

/**
 * Что генератору говорят о канале, в который он пишет.
 *
 * `content-factory-next-tu3k.2`. До этой волны продукт знал о канале ровно
 * одно — язык (`Integration.contentLanguage`), — и писал в Telegram так же, как
 * в рассылку: без оглядки на пуш-уведомление, на длину абзаца и на то, что
 * хэштеги здесь не работают. Лимит знаков площадка знала (`maxLength` у
 * провайдера, `AutopostService.maximumCharacters`), но до промпта он не доходил.
 *
 * Форма строк — та же, что у голоса: пункты списка вровень с остальным
 * промптом (`voice-directives.ts`), и по той же причине — выбирать промпту
 * лучшую форму значило бы смешать исправление с переделкой. Строки канала
 * встают после примеров автора и до guardrails: канал — это обычай площадки,
 * он сильнее привычек и слабее запретов области.
 *
 * Числа — из материалов владельца от 20.05.2026, каталог
 * `/home/me/code/content-factory/docs/research/channel-playbooks/telegram/raw/`
 * (`compass-artifact-2026-05-telegram-playbook.md`,
 * `deep-research-report-2026-05-telegram-playbook.md`): пуш показывает первые
 * 80–180 знаков, абзац — 2–4 строки, призыв один, восемь слов подряд из чужого
 * материала — уже копия. Взяты числа и границы; ни одна строка промпта оттуда
 * не переписана.
 */

/** То, что о площадке знает сам провайдер, и ничего сверх этого. */
export type ChannelProviderLimits = {
  identifier: string;
  name: string;
  contentLanguage?: string | null;
  maxLength: number;
  maxCaptionLength?: number | null;
  editor: 'none' | 'normal' | 'markdown' | 'html';
};

export type ChannelDirectiveOptions = {
  /** Пост уйдёт с картинкой: у части площадок это другой, меньший лимит. */
  withPicture?: boolean;
  /** Формат, выбранный для этого поста; без него действует формат карточки. */
  formatHint?: IntakeFormatV1 | null;
  /**
   * Куски чужого текста, который дали на вход.
   *
   * Здесь нужен только ответ «был ли чужой текст»: сами куски сравнивает
   * антикопия после черновика. Но передаётся список, а не флаг, — чтобы у
   * вызывающего не появилось второго места, где решается, что чужой текст был.
   */
  foreignShingles?: string[] | null;
  /**
   * Ссылки из задания, которые велено сохранить (`97dq.29`). Сильнее политики
   * ссылок карточки: человек сказал «сохранить», и «без ссылок» в карточке —
   * умолчание для поста, а не запрет на его прямую просьбу. На стенде
   * 22.09.2026 адаптация без этой строки оставила одну ссылку из трёх.
   */
  keepLinks?: string[] | null;
  /**
   * The author's link for the post (`97dq.75`): the answer to «Какую ссылку
   * поставить в пост?» or the post's own «Ссылка для поста». `url: null` —
   * «Без ссылки». `forPost` — set on this post, which outranks a channel that
   * says «no links»; the piece's answer does not. Absent — nobody answered,
   * and only the general link rule applies.
   */
  authorLink?: { url: string | null; forPost?: boolean; text?: string } | null;
  /**
   * «Для этого поста» (`content-factory-next-97dq.38`): разовые настройки
   * одной адаптации. Сильнее карточки канала и аватара, слабее запретов о
   * фактах, копировании и голосе.
   */
  post?: ChannelPostOverrides | null;
};

/**
 * Разовые настройки поста, как их передаёт заготовка (`IntakePostOverridesV1`).
 *
 * Обращения («на ты / на вы») здесь нет с одиннадцатого захода (`97dq.45`):
 * владелец убрал опцию из продукта — она специфична для языка, и кто её
 * хочет, пишет её в «Пожелании». Сохранённое раньше у аватара, канала или
 * поста значение в промпт больше не попадает.
 */
export type ChannelPostOverrides = {
  length?: 'shorter' | 'longer' | null;
  wish?: string | null;
  takeaway?: string | null;
  /*
    Поля карточки канала на одну адаптацию (`97dq.48`, вариант A). Значат
    ровно то же, что в карточке, — строки берутся из тех же таблиц ниже, —
    но помечены «только для этого поста» и стоят над заметкой владельца.
    `lengthPolicy` главнее `length`.
  */
  lengthPolicy?: Exclude<ChannelWritingProfileV1['lengthPolicy'], 'provider_max'> | null;
  /** Old stops read as today's densities (`97dq.96`). */
  emojiLevel?: StoredEmojiLevel | null;
  linkPolicy?: ChannelWritingProfileV1['linkPolicy'] | null;
  hashtagPolicy?: ChannelWritingProfileV1['hashtagPolicy'] | null;
  ctaKind?: ChannelWritingProfileV1['ctaKind'] | null;
};

/** Во сколько раз «Короче» и «Длиннее» меняют диапазон канала. */
export const POST_LENGTH_SCALE = { shorter: 0.6, longer: 1.5 } as const;

/** Предел строки «Пожелание» и ответа «что унести» в промпте. */
export const POST_WISH_LIMIT = 500;

/**
 * Диапазон канала под «Короче» / «Длиннее» — ×0,6 и ×1,5, не выше того,
 * что примет площадка. Возвращает `null`, когда масштабировать нечего:
 * карточка без диапазона («длину держит площадка» или «решает модель»).
 */
export const scaledLengthRange = (
  policy: ChannelWritingProfileV1['lengthPolicy'],
  length: 'shorter' | 'longer',
  limit: number
): { idealMin: number; idealMax: number; hardMax: number | null } | null => {
  if (typeof policy !== 'object' || !policy) return null;
  const factor = POST_LENGTH_SCALE[length];
  const scale = (value: number) =>
    Math.max(1, Math.min(limit, Math.round(value * factor)));
  return {
    idealMin: scale(policy.idealMin),
    idealMax: scale(policy.idealMax),
    hardMax: policy.hardMax ? scale(policy.hardMax) : null,
  };
};

/** Слова человека в инструктивной части — с той же оградой, что заметка карточки. */
const fenced = (value: string | null | undefined, limit: number): string | null => {
  if (typeof value !== 'string') return null;
  const clean = value.replace(/\s+/g, ' ').replace(/[«»]/g, '"').trim();
  if (!clean) return null;
  return clean.length <= limit ? clean : `${clean.slice(0, limit).trimEnd()}…`;
};

/**
 * Сколько знаков площадка примет на самом деле.
 *
 * Одна картинка превращает текст в подпись со своим, вчетверо меньшим потолком
 * (Telegram: 4096 против 1024). Спрашивается у провайдера, а не считается от
 * `maxLength`: у площадки без подписей `maxCaptionLength` просто нет, и гадать
 * там не о чем.
 */
export const channelHardLimit = (
  provider: ChannelProviderLimits,
  withPicture?: boolean
): number =>
  withPicture && provider.maxCaptionLength
    ? provider.maxCaptionLength
    : provider.maxLength;

/**
 * How dense the emoji of a stop are, in words — said beside the count when
 * the post has no length of its own to count against.
 */
export const EMOJI_DENSITY_WORD: Record<EmojiDensity, string> = {
  few: 'a few emoji',
  medium: 'a moderate number of emoji',
  many: 'many emoji',
  max: 'as many emoji as fit',
};

/**
 * The emoji rule for a level and the length the prompt asks for.
 *
 * `97dq.96` (owner, 25.09.2026): a stop is a density, not a count — a long
 * read and a short post at «Средне» carry different numbers. The count comes
 * from the same length the prompt gives (`emojiRangeFor`): «Use 2 to 5 emoji
 * in the whole post (about one per 200–350 characters)». Without a length
 * (`auto`, «длину держит площадка») it is counted against
 * `EMOJI_DEFAULT_POST_CHARS` and the density is said in words, so the writer
 * scales it to the length it chooses. Every stop but «Без эмодзи» asks for at
 * least one: «fewer is fine» read as «none is fine» (sixteenth walk). The count
 * past the most is a text finding (`emoji-over-ceiling`); too few is not.
 *
 * `auto` says nothing. Exported for the suite, which pins the lines.
 */
export function emojiLine(
  level: unknown,
  length?: { min: number; max: number } | null
): string {
  const read = readEmojiLevel(level, 'auto' as const);
  if (read === 'auto') return '';
  if (read === 'none') return 'No emoji.';
  const density = EMOJI_DENSITY[read];
  const per = `one per ${density.densest}–${density.sparsest} characters`;
  if (!length) {
    const range = emojiRangeFor(read, EMOJI_DEFAULT_POST_CHARS)!;
    return `Use ${EMOJI_DENSITY_WORD[read]}: about ${per}, which is ${range.min} to ${range.max} in a post of ${EMOJI_DEFAULT_POST_CHARS} characters; scale that to the length you write, use at least 1, place them where they fit the meaning, never as list bullets.`;
  }
  const range = emojiRangeFor(read, length.min, length.max)!;
  if (range.min === range.max) {
    const one = range.min === 1;
    return `Use ${range.min} emoji in the whole post (about ${per}) where ${one ? 'it fits' : 'they fit'} the meaning, never as ${one ? 'a list bullet' : 'list bullets'}.`;
  }
  return `Use ${range.min} to ${range.max} emoji in the whole post (about ${per}) where they fit the meaning, never as list bullets.`;
}

/**
 * The core is written for no platform and without emoji (`core-write`); the
 * writer is told to carry it verbatim. With a setting that asks for emoji this
 * line says which rule wins (`97dq.83`).
 *
 * Review of 97dq.81-85, P2-1: an untouched Telegram channel stores `few`, and
 * without this line the writer copied the emoji-free core verbatim. Every
 * density asks for at least one emoji (`97dq.96`), so every density gets it.
 */
export const EMOJI_CORE_LINE =
  "The neutral core has no emoji only because it is written for no platform; that is not this post's rule. Adding emoji as the emoji setting says is a change this platform requires, not a departure from the core.";

/** The line about the core's missing emoji for a stored level, or none. */
export const emojiCoreLineOf = (level: unknown): string | null =>
  isEmojiDensity(readEmojiLevel(level, 'auto' as const)) ? EMOJI_CORE_LINE : null;

const LINK_LINE: Record<ChannelWritingProfileV1['linkPolicy'], string> = {
  auto: 'Choose whether and where links help; never invent a URL.',
  none: 'No links in the post.',
  end: 'At most one link, and it goes at the end, after the last sentence.',
  inline: 'Links may appear inline, next to the claim or action they support.',
};

const HASHTAG_LINE: Record<
  ChannelWritingProfileV1['hashtagPolicy'],
  string
> = {
  auto: 'Choose whether hashtags help this post and channel.',
  none: 'No hashtags.',
  end_1_3: 'One to three hashtags, all of them at the very end.',
  free: 'Hashtags may be used when they help readers find the topic; choose them by meaning.',
};

/**
 * Призыв — ровно один, и вид у него назван.
 *
 * Унаследованная строка «Try to put some call to action at the end of the post»
 * не говорила ни какой призыв, ни сколько их; на выходе получалось три подряд.
 * `none` здесь — не молчание карточки, а её решение: у канала без измеренного
 * обычая приделанный призыв и есть тот самый штамп, из-за которого текст читают
 * как машинный.
 */
const CTA_LINE: Record<ChannelWritingProfileV1['ctaKind'], string> = {
  auto: '',
  none: 'Do not bolt a call to action onto the end; stop when the thought is finished.',
  question: 'End with exactly one open question to the reader.',
  comment: 'End by asking for one thing in the comments, and nothing else.',
  link: 'End with exactly one link to follow, and nothing after it.',
  subscribe: 'End with exactly one invitation to subscribe.',
  reply: 'End by asking the reader to reply, once.',
};

/**
 * Строение поста под выбранный формат — форма, без единого числа.
 *
 * Числа по форматам лежат в `FORMAT_LENGTHS_TELEGRAM` и принадлежат карточке и
 * экрану входа: они предлагают человеку диапазон. В промпте диапазон один — тот,
 * что человек в карточке оставил, — иначе модель получила бы две длины сразу и
 * выбрала бы третью.
 */
const FORMAT_LINE: Record<IntakeFormatV1, string> = {
  auto: 'Choose the shape that fits what there is to say.',
  opinion:
    'Shape: an opinion — one claim, the reason for it, and what follows from it.',
  announcement:
    'Shape: an announcement — what happened, what changes for the reader, what to do now.',
  list: 'Shape: a list — a short lead, then items that each stand on their own.',
  expert:
    'Shape: an expert breakdown — the question, how it actually works, and the catch most people miss.',
  case: 'Shape: a case — the starting point, what was done, what came out of it, what it cost.',
  story:
    'Shape: a story — a scene, a turn, and what it left behind. No moral spelled out at the end.',
};

/**
 * Разметка — та, которую площадка вообще показывает.
 *
 * Спрашивается у провайдера (`editor`), а не у карточки: это не обычай канала,
 * а его устройство. Канал без разметки покажет `<b>` как есть, и звёздочки в
 * тексте — тоже; канал с разметкой её примет, и тогда предел ставит уже
 * исследование — выделение работает, пока оно редкое.
 *
 * Синтаксис назван (`content-factory-next-97dq.2`). Владелец, 18.09.2026: «в
 * адаптации есть звёздочки… Markdown-разметка не срабатывает». Модель писала
 * `**жирный**` и раньше — просто потому, что так пишут все, — а продукт об
 * этом не договаривался ни с ней, ни с собой: в пост уходили звёздочки. Теперь
 * форма одна и сказана здесь, а перевод в разметку площадки делает
 * `brief/editor-html.ts`. Редакторы без выделения получают прямой запрет:
 * сказать «не больше двух выделений» каналу, который покажет их знаками, —
 * значит попросить те самые звёздочки.
 */
const EDITOR_LINE: Record<ChannelProviderLimits['editor'], string> = {
  none: 'This channel shows no formatting at all: no bold, no italics, no markup characters — write it plain.',
  normal:
    'This channel shows no formatting at all: no bold, no italics, no markup characters — write it plain.',
  markdown:
    'Formatting is emphasis, not decoration: write bold as **text**, and use at most two short bold spans in the whole post.',
  html: 'Formatting is emphasis, not decoration: write bold as **text**, and use at most two short bold spans in the whole post.',
};

/**
 * Слова человека из карточки — как выученное правило аватара, и с той же
 * оградой.
 *
 * Текст писал человек, а попадает он в инструктивную часть промпта, поэтому:
 * переводы строк снимаются, чтобы заметка не дописала в блок собственную
 * строку; кавычки-ёлочки внутри заменяются на прямые, чтобы она не закрыла
 * ограду раньше времени; длина режется по тому же пределу, что и правило.
 */
/**
 * The owner's note outranks the card's defaults, and only them.
 *
 * On the stand (18.09.2026) the card said «призыв — вопрос» and the note said
 * «последняя строка — „Считайте вместе с нами“»; with both lines equal the
 * model welded them into one sentence. The note is the more specific and the
 * more recent word of the same person, so it wins over length, emoji, call to
 * action and shape. It never lifts the rules on facts, copying or voice: the
 * note is still a person's text inside the instruction block.
 */
/**
 * The author's link, in the writer's words (`97dq.75`). Exported for the
 * suite, which pins both lines: the writer may use only this link, or links
 * already in the author's material and sources — never one of its own.
 */
export const AUTHOR_LINK_LINE = (url: string): string =>
  `The author chose this link for the post: <${url}>. It is the only link you may add: put it in exactly as written, character for character, once, where it fits by meaning. Links already in the author's material or sources may stay; never invent any other URL.${placeholderNote(url)}`;

/**
 * The author's link as the model sees it (`content-factory-next-97dq.91`).
 *
 * Production, 24.09.2026: a percent-encoded Wikipedia address cost the
 * adaptation hundreds of output tokens, and the answer was cut inside it —
 * `Failed to parse … Unterminated string`. An address copied character by
 * character is also where a model corrupts it. So the generator hands the
 * model this token instead of the address and puts the address back after the
 * answer is parsed (`restoreAuthorLink`). The anchor words stay the model's
 * own, or «Текст ссылки» when the author filled it.
 */
export const AUTHOR_LINK_PLACEHOLDER = '{{AUTHOR_LINK}}';

const placeholderNote = (url: string): string =>
  url === AUTHOR_LINK_PLACEHOLDER
    ? ` ${AUTHOR_LINK_PLACEHOLDER} stands for the address: write that token exactly as it is, and the real address takes its place after you answer.`
    : '';

/**
 * The token, tolerant of the forms a model bends it into (review F3 of the
 * fifteenth walk): one or two braces, `<{{ AUTHOR_LINK }}>`, any case, a
 * Markdown-escaped underscore or brace (`{{AUTHOR\_LINK}}`,
 * `\{\{AUTHOR_LINK\}\}`), a hyphen, dash or space for the underscore.
 */
const TOKEN_SOURCE = String.raw`<?(?:\\?\{){1,2}\s*author(?:[\s_\u2010-\u2015-]|\\)*link\s*(?:\\?\}){1,2}>?`;
const PLACEHOLDER_PATTERN = new RegExp(TOKEN_SOURCE, 'giu');
/** `[words](token)`, for an editor that shows only a bare address. */
const WORDS_ON_PLACEHOLDER = new RegExp(
  String.raw`\[([^\]\n]+)\]\(\s*${TOKEN_SOURCE}\s*\)`,
  'giu'
);
/**
 * What may be left of the token after the restore: any braced form above, or
 * the bare upper-case name a model wrote without its braces. The bare name
 * must be upper case with its underscore: «author link» in a sentence is
 * the author's words, not a token.
 */
const LEFTOVER_TOKEN = new RegExp(String.raw`[ \t]*${TOKEN_SOURCE}`, 'giu');
const LEFTOVER_BARE = /[ \t]*\bAUTHOR\\?_LINK\b/gu;
const LEFTOVER_WORDS = new RegExp(
  String.raw`\[([^\]\n]+)\]\(\s*(?:${TOKEN_SOURCE}|AUTHOR\\?_LINK)\s*\)`,
  'giu'
);

/**
 * The author's address in place of the token. An editor that shows links on
 * words keeps `[words](url)`; a plain editor keeps the bare address, so a
 * `[words](token)` there becomes «words url». The address is inserted by a
 * function, never as a replacement pattern: a `$` in it stays a `$`.
 */
export const restoreAuthorLink = (
  text: string,
  url: string,
  onWords: boolean
): string => {
  const plain = onWords
    ? text
    : text.replace(WORDS_ON_PLACEHOLDER, (_match, words: string) => `${words} ${AUTHOR_LINK_PLACEHOLDER}`);
  return plain.replace(PLACEHOLDER_PATTERN, () => url);
};

/**
 * The token in place of the author's address in text that reaches the prompt
 * (review of the fifteenth walk, W1 residual risk). The core, the answers and
 * the material may already hold the address; the model would then see both
 * the address and the token and could write the link twice. The decoded form
 * of a percent-encoded address is replaced as well.
 */
export const tokenizeAuthorLink = (text: string, url: string): string => {
  if (!text || !url) return text;
  const forms = new Set([url]);
  try {
    forms.add(decodeURI(url));
  } catch {
    /* not a valid percent-encoding: the address as written only */
  }
  let out = text;
  for (const form of [...forms].sort((a, b) => b.length - a.length)) {
    if (form) out = out.split(form).join(AUTHOR_LINK_PLACEHOLDER);
  }
  return out;
};

/** `tokenizeAuthorLink` over every string of a value (hints, lists). */
export const tokenizeAuthorLinkDeep = <T>(value: T, url: string): T => {
  if (typeof value === 'string') return tokenizeAuthorLink(value, url) as T;
  if (Array.isArray(value))
    return value.map((item) => tokenizeAuthorLinkDeep(item, url)) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>))
      out[key] = tokenizeAuthorLinkDeep(item, url);
    return out as T;
  }
  return value;
};

/**
 * The last check before an adaptation is saved (review F3 of the fifteenth
 * walk): a token the restore did not recognise must not reach the published
 * text. `[words](token)` keeps its words; the token itself is removed.
 * `found` says how many were stripped, for the caller's log line.
 */
export const stripLeftoverAuthorLink = (
  text: string
): { text: string; found: number } => {
  let found = 0;
  const out = text
    .replace(LEFTOVER_WORDS, (_match, words: string) => {
      found += 1;
      return words;
    })
    .replace(LEFTOVER_TOKEN, () => {
      found += 1;
      return '';
    })
    .replace(LEFTOVER_BARE, () => {
      found += 1;
      return '';
    });
  return { text: out, found };
};

/** `stripLeftoverAuthorLink` over every string of a value. */
export const stripLeftoverAuthorLinkDeep = <T>(
  value: T
): { value: T; found: number } => {
  let found = 0;
  const walk = (item: unknown): unknown => {
    if (typeof item === 'string') {
      const result = stripLeftoverAuthorLink(item);
      found += result.found;
      return result.text;
    }
    if (Array.isArray(item)) return item.map(walk);
    if (item && typeof item === 'object') {
      const out: Record<string, unknown> = {};
      for (const [key, inner] of Object.entries(item as Record<string, unknown>))
        out[key] = walk(inner);
      return out;
    }
    return item;
  };
  const next = walk(value) as T;
  return { value: found ? next : value, found };
};

/** `restoreAuthorLink` over every string of a parsed answer. */
export const restoreAuthorLinkDeep = <T>(value: T, url: string, onWords: boolean): T => {
  if (typeof value === 'string') return restoreAuthorLink(value, url, onWords) as T;
  if (Array.isArray(value))
    return value.map((item) => restoreAuthorLinkDeep(item, url, onWords)) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>))
      out[key] = restoreAuthorLinkDeep(item, url, onWords);
    return out as T;
  }
  return value;
};

/**
 * The author's link on words (`97dq.79`, fourteenth walk, B2). Owner: «ссылка
 * вставилась топорно… в Telegram можно прям вставлять ссылку… чтобы она была
 * кликабельная, какой-то текст для нее делать». A channel whose editor shows
 * links on words (`html`, `markdown`) gets the link as `[words](url)` — the
 * same grammar `brief/editor-html.ts` turns into `<a href>` — and never as a
 * bare address. With «Текст ссылки» filled, exactly those words carry it;
 * without, the writer picks 2–5 meaningful words of its own sentence. Plain
 * editors keep `AUTHOR_LINK_LINE`: there a link is only its address.
 */
export const AUTHOR_LINK_WORDS_LINE = (url: string, text?: string | null): string => {
  const words = fenced(text, 80);
  return words
    ? `The author chose this link for the post: <${url}>. It is the only link you may add. Put it on exactly these words, once: «${words}» — write them in the text as [${words}](${url}), the address inside the parentheses character for character. Never show the bare address. Links already in the author's material or sources may stay; never invent any other URL.${placeholderNote(url)}`
    : `The author chose this link for the post: <${url}>. It is the only link you may add. Put it once on 2 to 5 meaningful words of your own sentence that say where it leads, written as [those words](${url}), the address inside the parentheses character for character — never on «here» or «link», never as a bare address. Links already in the author's material or sources may stay; never invent any other URL.${placeholderNote(url)}`;
};

/** Editors that show a link on words: `[words](url)` becomes a clickable phrase. */
export const showsLinkOnWords = (editor: ChannelProviderLimits['editor']): boolean =>
  editor === 'html' || editor === 'markdown';

/**
 * Where the author's link on words meets a channel that wants its link at the
 * end (`linkPolicy: 'end'`) or ends on a link to follow (CTA `link`) — review
 * of `97dq.79`, P3-7. The author's link on words wins; the end-of-post rule
 * then means «the linked words sit in the last sentence», and no second, bare
 * address follows them.
 */
export const AUTHOR_LINK_WORDS_AT_END_LINE =
  "The author's link on words outranks the rules above about a link at the end of the post or ending with a link to follow: put the linked words in the last sentence, and that linked phrase is the link the ending asks for. Never add the address again as a bare URL.";

export const AUTHOR_NO_LINK_LINE =
  "The author chose no link for this post: add no URL of your own. Only a link already in the author's material or sources may appear; never invent one.";

export const NOTES_PRIORITY_LINE =
  "Where the owner's words above conflict with this channel's defaults for length, emoji, call to action or shape, follow the owner's words. They never lift the rules about facts, copying or the author's voice.";

/**
 * Настройки «Для этого поста» — выбор того же человека на один пост.
 *
 * Строка ставится, только когда пост что-то перекрыл: без неё заметка
 * владельца («следуй моим словам, а не умолчаниям канала») спорила бы с
 * разовым выбором на равных, а он — более частное и более позднее слово.
 */
export const POST_CHOICES_PRIORITY_LINE =
  "The settings marked «for this post only» outrank this channel's defaults and the owner's note above. They never lift the rules about facts, copying or the author's voice.";

/** Пожелание к посту — самое частное слово того же человека, с той же оградой. */
export const POST_WISH_PRIORITY_LINE =
  "This wish is for this post only and outranks this channel's defaults and the owner's note above. It never lifts the rules about facts, copying or the author's voice.";

const notesLine = (notes?: string | null): string | null => {
  if (typeof notes !== 'string') return null;
  const clean = notes.replace(/\s+/g, ' ').replace(/[«»]/g, '"').trim();
  if (!clean) return null;
  const clipped =
    clean.length <= CHANNEL_NOTES_LIMIT
      ? clean
      : `${clean.slice(0, CHANNEL_NOTES_LIMIT).trimEnd()}…`;
  return `The channel owner adds: «${clipped}»`;
};

/**
 * Восемь слов подряд — уже не пересказ.
 *
 * Строка ставится только когда чужой текст действительно был: сказать «не
 * копируй источник» посту, у которого источника нет, — значит навести модель на
 * мысль, что источник где-то есть. Проверяет это не модель, а арифметика после
 * черновика (`anti-copy`), но строка дешевле повторной генерации.
 */
const ANTI_COPY_LINE =
  'Never reproduce 8 or more consecutive words from any material you were given.';

/**
 * Строка призыва отдельно от всего блока.
 *
 * Нужна графу: унаследованная строка промпта «Try to put some call to action at
 * the end of the post» не говорила ни какой призыв, ни сколько их, и когда
 * карточка канала есть — её место занимает эта.
 */
export const channelCtaLine = (
  kind: ChannelWritingProfileV1['ctaKind']
): string => CTA_LINE[kind];

export function channelInstructionLines(
  profile: ChannelWritingProfileV1 | null | undefined,
  provider: ChannelProviderLimits,
  options: ChannelDirectiveOptions = {}
): string[] {
  const lines: string[] = [];
  const channel =
    profile ??
    defaultWritingProfileFor(provider.identifier, provider.contentLanguage);
  /*
    «Для этого поста» (`97dq.48`) перекрывает карточку поле за полем, а не
    встаёт рядом: две политики эмодзи сразу модель усредняет в третью. Строку
    берёт та же таблица, что у карточки, и помечает её разовой.
  */
  const post = options.post ?? null;
  // An old stop set on the post reads as today's density (`97dq.96`).
  const postEmoji = readEmojiLevel(post?.emojiLevel, null);
  const chose = {
    length: Boolean(post?.lengthPolicy),
    emoji: Boolean(postEmoji),
    link: Boolean(post?.linkPolicy),
    hashtag: Boolean(post?.hashtagPolicy),
    cta: Boolean(post?.ctaKind),
  };
  const resolved: ChannelWritingProfileV1 = {
    ...channel,
    ...(post?.lengthPolicy ? { lengthPolicy: post.lengthPolicy } : {}),
    ...(postEmoji ? { emojiLevel: postEmoji } : {}),
    ...(post?.linkPolicy ? { linkPolicy: post.linkPolicy } : {}),
    ...(post?.hashtagPolicy ? { hashtagPolicy: post.hashtagPolicy } : {}),
    ...(post?.ctaKind ? { ctaKind: post.ctaKind } : {}),
  };
  const forPost = (line: string) => `For this post only: ${line}`;
  const isTelegram = provider.identifier === TELEGRAM_PROVIDER_IDENTIFIER;
  const limit = channelHardLimit(provider, options.withPicture);

  lines.push(
    options.withPicture && provider.maxCaptionLength
      ? `You are writing for ${provider.name}. The post goes out with a picture, so the text is a caption and must stay under ${limit} characters.`
      : `You are writing for ${provider.name}. The post must stay under ${limit} characters.`
  );

  const length = resolved.lengthPolicy;
  // Длина карточкой (`97dq.48`) снимает «Короче / Длиннее» старого клиента.
  const postLength = chose.length ? null : options.post?.length;
  const scaled = postLength ? scaledLengthRange(length, postLength, limit) : null;
  /*
    The length the emoji count is worked out from (`97dq.96`): the same range
    this prompt gives. None given — the emoji line says the density in words.
  */
  let emojiLength: { min: number; max: number } | null = null;
  if (chose.length) {
    if (typeof length === 'object') {
      emojiLength = {
        min: Math.min(limit, length.idealMin),
        max: Math.min(limit, length.idealMax),
      };
      const hard = length.hardMax
        ? `, and never past ${Math.min(limit, length.hardMax)}`
        : '';
      lines.push(
        forPost(
          `aim for ${Math.min(limit, length.idealMin)} to ${Math.min(limit, length.idealMax)} characters${hard}. This outranks any other length given in this prompt.`
        )
      );
    } else {
      lines.push(
        forPost(
          'choose the length that serves this material; the platform character limit still applies. This outranks any other length given in this prompt.'
        )
      );
    }
  } else if (scaled) {
    /*
      «Иногда пост побольше, иногда поменьше» (владелец, 22.09.2026): разовая
      длина заменяет диапазон канала, а не встаёт рядом с ним — две длины
      сразу модель усредняет в третью.
    */
    const hard = scaled.hardMax ? `, and never past ${scaled.hardMax}` : '';
    emojiLength = { min: scaled.idealMin, max: scaled.idealMax };
    lines.push(
      `For this post the author asked for a ${postLength} text than this channel usually gets: aim for ${scaled.idealMin} to ${scaled.idealMax} characters${hard}. ` +
        'This outranks any other length given in this prompt.'
    );
  } else {
    if (length === 'auto') lines.push('Choose the length that serves this material; the platform character limit still applies.');
    if (typeof length === 'object') {
      const hard = length.hardMax ? `, and never past ${length.hardMax}` : '';
      emojiLength = { min: length.idealMin, max: length.idealMax };
      lines.push(
        `Readers of this channel expect ${length.idealMin} to ${length.idealMax} characters${hard}. ` +
          'If the voice above already gives a length of its own, follow whichever of the two ranges is tighter.'
      );
    }
    if (postLength === 'shorter')
      lines.push('For this post the author asked for a noticeably shorter text than usual: keep only what carries the claim. This outranks any other length given in this prompt.');
    if (postLength === 'longer')
      lines.push('For this post the author asked for a noticeably longer text than usual: develop the material that is there, never pad it and never add facts. This outranks any other length given in this prompt.');
  }

  if (isTelegram) {
    lines.push(
      'The first 80–180 characters are what the notification preview shows, so the fact, the number or the disagreement goes there — not a greeting and not a wind-up.'
    );
    lines.push(
      'Keep paragraphs to 2–4 lines with a blank line between them; a wall of text is not read here.'
    );
    lines.push(EDITOR_LINE[provider.editor]);
  } else if (provider.editor === 'none') {
    lines.push(EDITOR_LINE.none);
  }

  const emojiRule = emojiLine(resolved.emojiLevel, emojiLength);
  if (emojiRule)
    lines.push(
      chose.emoji
        ? forPost('for emoji, this setting overrides the channel, the voice and neutral core: ' + emojiRule)
        : 'For emoji, this channel setting overrides the voice and neutral core: ' + emojiRule
    );
  const emojiCore = emojiCoreLineOf(resolved.emojiLevel);
  if (emojiCore) lines.push(emojiCore);
  lines.push(
    chose.link ? forPost(LINK_LINE[resolved.linkPolicy]) : LINK_LINE[resolved.linkPolicy]
  );
  /*
    The author's link (`97dq.75`). Where links are off, «Без ссылки» says
    nothing the link rule has not said (review P2-5). A link set on this post
    outranks the channel's «no links», but never the post's own «no links»:
    two choices on the same post, and the stricter one stands (review P3-12).
  */
  const author = options.authorLink;
  const linksOff = resolved.linkPolicy === 'none';
  // On words where the channel shows them (`97dq.79`); a bare address elsewhere.
  const authorLine = (url: string) =>
    showsLinkOnWords(provider.editor)
      ? AUTHOR_LINK_WORDS_LINE(url, author?.text)
      : AUTHOR_LINK_LINE(url);
  let linkOnWords = false;
  if (author) {
    if (author.url === null) {
      if (!linksOff || author.forPost) lines.push(AUTHOR_NO_LINK_LINE);
    } else if (!linksOff) {
      lines.push(authorLine(author.url));
      linkOnWords = showsLinkOnWords(provider.editor);
    } else if (author.forPost && !chose.link) {
      lines.push(
        forPost(`${authorLine(author.url)} This overrides the link rule above.`)
      );
      linkOnWords = showsLinkOnWords(provider.editor);
    }
  }
  if (options.keepLinks?.length) {
    lines.push(
      'The person asked to keep these links, and this overrides the link rule above: every one of them appears in the post exactly as written, character for character, once, where it belongs by meaning — none may be dropped, shortened or merged: ' +
        options.keepLinks.map((link) => `<${link}>`).join(', ')
    );
  }
  lines.push(
    chose.hashtag
      ? forPost(HASHTAG_LINE[resolved.hashtagPolicy])
      : HASHTAG_LINE[resolved.hashtagPolicy]
  );
  if (resolved.ctaKind !== 'auto')
    lines.push(
      chose.cta ? forPost(CTA_LINE[resolved.ctaKind]) : CTA_LINE[resolved.ctaKind]
    );
  if (linkOnWords && (resolved.linkPolicy === 'end' || resolved.ctaKind === 'link'))
    lines.push(AUTHOR_LINK_WORDS_AT_END_LINE);
  lines.push(FORMAT_LINE[options.formatHint || resolved.formatPreference]);

  const notes = notesLine(resolved.notes);
  if (notes) lines.push(notes, NOTES_PRIORITY_LINE);
  if (Object.values(chose).some(Boolean)) lines.push(POST_CHOICES_PRIORITY_LINE);

  const takeaway = fenced(options.post?.takeaway, POST_WISH_LIMIT);
  if (takeaway)
    lines.push(
      `What the author wants readers to leave with after this post: «${takeaway}». Build the post so that this is what stays with the reader.`
    );
  const wish = fenced(options.post?.wish, POST_WISH_LIMIT);
  if (wish) lines.push(`The author's wish for this post only: «${wish}»`, POST_WISH_PRIORITY_LINE);

  if (options.foreignShingles?.length) lines.push(ANTI_COPY_LINE);

  return lines;
}
