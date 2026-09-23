import {
  CHANNEL_NOTES_LIMIT,
  TELEGRAM_PROVIDER_IDENTIFIER,
  defaultWritingProfileFor,
  type ChannelWritingProfileV1,
} from '@contentfactory/nestjs-libraries/content-intelligence/channels/channel-writing-profile';
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
  emojiLevel?: ChannelWritingProfileV1['emojiLevel'] | null;
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

const EMOJI_LINE: Record<ChannelWritingProfileV1['emojiLevel'], string> = {
  auto: '',
  none: 'No emoji.',
  few: 'Use one to three emoji, of no more than two kinds, and never as list bullets.',
  many: 'Emoji are welcome when they fit the meaning; use 3–6 emoji freely in a post.',
};

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
  const chose = {
    length: Boolean(post?.lengthPolicy),
    emoji: Boolean(post?.emojiLevel),
    link: Boolean(post?.linkPolicy),
    hashtag: Boolean(post?.hashtagPolicy),
    cta: Boolean(post?.ctaKind),
  };
  const resolved: ChannelWritingProfileV1 = {
    ...channel,
    ...(post?.lengthPolicy ? { lengthPolicy: post.lengthPolicy } : {}),
    ...(post?.emojiLevel ? { emojiLevel: post.emojiLevel } : {}),
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
  if (chose.length) {
    if (typeof length === 'object') {
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
    lines.push(
      `For this post the author asked for a ${postLength} text than this channel usually gets: aim for ${scaled.idealMin} to ${scaled.idealMax} characters${hard}. ` +
        'This outranks any other length given in this prompt.'
    );
  } else {
    if (length === 'auto') lines.push('Choose the length that serves this material; the platform character limit still applies.');
    if (typeof length === 'object') {
      const hard = length.hardMax ? `, and never past ${length.hardMax}` : '';
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

  if (resolved.emojiLevel !== 'auto')
    lines.push(
      chose.emoji
        ? forPost('for emoji, this setting overrides the channel, the voice and neutral core: ' + EMOJI_LINE[resolved.emojiLevel])
        : 'For emoji, this channel setting overrides the voice and neutral core: ' + EMOJI_LINE[resolved.emojiLevel]
    );
  lines.push(
    chose.link ? forPost(LINK_LINE[resolved.linkPolicy]) : LINK_LINE[resolved.linkPolicy]
  );
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
