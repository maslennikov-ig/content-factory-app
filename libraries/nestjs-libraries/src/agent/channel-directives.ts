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
 */
const EDITOR_LINE: Record<ChannelProviderLimits['editor'], string> = {
  none: 'This channel shows no formatting at all: no bold, no italics, no markup characters — write it plain.',
  normal:
    'Formatting is emphasis, not decoration: at most two short bold spans in the whole post.',
  markdown:
    'Formatting is emphasis, not decoration: at most two short bold spans in the whole post.',
  html: 'Formatting is emphasis, not decoration: at most two short bold spans in the whole post.',
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
  const resolved =
    profile ??
    defaultWritingProfileFor(provider.identifier, provider.contentLanguage);
  const isTelegram = provider.identifier === TELEGRAM_PROVIDER_IDENTIFIER;
  const limit = channelHardLimit(provider, options.withPicture);

  lines.push(
    options.withPicture && provider.maxCaptionLength
      ? `You are writing for ${provider.name}. The post goes out with a picture, so the text is a caption and must stay under ${limit} characters.`
      : `You are writing for ${provider.name}. The post must stay under ${limit} characters.`
  );

  const length = resolved.lengthPolicy;
  if (length === 'auto') lines.push('Choose the length that serves this material; the platform character limit still applies.');
  if (typeof length === 'object') {
    const hard = length.hardMax ? `, and never past ${length.hardMax}` : '';
    lines.push(
      `Readers of this channel expect ${length.idealMin} to ${length.idealMax} characters${hard}. ` +
        'If the voice above already gives a length of its own, follow whichever of the two ranges is tighter.'
    );
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

  if (resolved.emojiLevel !== 'auto') lines.push('For emoji, this channel setting overrides the voice and neutral core: ' + EMOJI_LINE[resolved.emojiLevel]);
  lines.push(LINK_LINE[resolved.linkPolicy]);
  lines.push(HASHTAG_LINE[resolved.hashtagPolicy]);
  if (resolved.ctaKind !== 'auto') lines.push(CTA_LINE[resolved.ctaKind]);
  lines.push(FORMAT_LINE[options.formatHint || resolved.formatPreference]);

  const notes = notesLine(resolved.notes);
  if (notes) lines.push(notes);

  if (options.foreignShingles?.length) lines.push(ANTI_COPY_LINE);

  return lines;
}
