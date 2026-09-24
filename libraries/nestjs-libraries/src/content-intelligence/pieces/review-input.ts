/**
 * Текст, который читает проверка, — тот же текст, который она потом запишет.
 *
 * Передача от `content-factory-next-97dq.2` в `.3`. Каноническое тело
 * адаптации хранит выделение звёздочками (`**текст**`), и `editorHtml` делает
 * из них `<strong>` ровно один раз — когда текст кладут в пост. Проверка же
 * читала пост и разбирала его `htmlToPlainText`, который снимает все теги: до
 * модели доходил текст без выделения, а «Принять выбранные» и «Перегенерировать»
 * записывали этот текст обратно в тело. Одна проверка стирала разметку, о
 * которой с моделью договорено в `channel-directives.ts`, и звёздочки в
 * адаптации после первой же правки пропадали навсегда.
 *
 * Правило здесь одно и проверяемое: если пост — это в точности то, что
 * `editorHtml` делает из сохранённого тела, значит после написания адаптации
 * пост руками не трогали, и каноническое тело со звёздочками и есть правда.
 * Если пост отличается, правда — в посте: человек правил его в редакторе, и
 * подсунуть проверке старое тело значило бы молча откатить его правку. Тогда
 * выделение возвращают из `<strong>`/`<b>` обратно в `**`.
 *
 * Круговой эта дорога для выделения и ссылок (ссылки — `97dq.77`).
 * Правленый руками пост читается через `htmlToPlainText`, а он снимает теги:
 * список теряет маркеры, заголовок — свой уровень. Принятая правка запишет в пост то, что `editorHtml` соберёт из этих
 * слов, то есть абзацы. Это поведение было здесь до `97dq.3` и этой волной не
 * чинится — сказано, чтобы никто не прочитал «круг» шире, чем он есть
 * (`content-factory-next-97dq.3`, P2-15).
 */
import { isHttpUrl } from '@contentfactory/helpers/utils/inline-marks';
import { editorHtml } from '../brief/editor-html';
import { decodeEntities, htmlToPlainText } from '../brand-voice/html-text';

export type EditorKind = 'none' | 'normal' | 'markdown' | 'html';

/**
 * `<strong>`/`<b>` обратно в `**`, до снятия тегов.
 *
 * Пустое и многострочное выделение не переносится: `**` вокруг пустоты или
 * через абзац — это не пара, а две осиротевшие звёздочки, и `editorHtml` их
 * всё равно снимет.
 *
 * Пробелы по краям выделения выносятся НАРУЖУ маркеров, и это не вкусовщина:
 * `editorHtml` считает парой только `**` с непробельными краями, поэтому
 * `**жирно **` он парой не признает и обе звёздочки снимет. Редактор же
 * `<strong>жирно </strong>` пишет запросто — достаточно выделить слово вместе
 * со следующим пробелом. До правки такой пост терял выделение на первой же
 * проверке (`content-factory-next-97dq.3`, P2-14).
 *
 * Вложенный тег внутри выделения оставляют как есть: его слова доживут до
 * текста, когда `htmlToPlainText` снимет теги, а угадывать за редактора, где
 * там кончается жирное, — не работа этой функции.
 */
const STRONG_SPAN = /<(strong|b)\b[^>]*>([^<]*?)<\/\1\s*>/giu;
const EDGE_SPACES = /^([ \t ]*)([\s\S]*?)([ \t ]*)$/u;

export const strongToBold = (html: string): string =>
  html.replace(STRONG_SPAN, (match, _tag: string, inner: string) => {
    if (!inner.trim() || inner.includes('\n') || inner.includes('*'))
      return match;
    const [, lead, core, trail] = inner.match(EDGE_SPACES)!;
    return `${lead}**${core}**${trail}`;
  });

/**
 * `<a href>` обратно в `[слова](адрес)`, до снятия тегов
 * (`content-factory-next-97dq.77`, review-97dq75 P3-15).
 *
 * Пост, поправленный вне редактора адаптации, читался через
 * `htmlToPlainText`, и ссылка оставалась одними словами: принятая правка
 * записывала пост уже без адреса. Теперь ссылка возвращается в ту форму, в
 * которой её хранит тело (`inline-marks.ts`): голым адресом, если слова и
 * есть адрес, иначе токеном со словами. Адрес не http(s) не переносится —
 * остаются слова, как и в редакторе. Сущности в адресе не раскрываются
 * здесь: `htmlToPlainText` раскроет их один раз для всего текста.
 */
// The address quoted or bare (`href=https://…`, review F5 of the fourteenth walk).
const ANCHOR =
  /<a\b[^>]*?\bhref\s*=\s*(?:(["'])(.*?)\1|([^\s"'>]+))[^>]*>([\s\S]*?)<\/a\s*>/giu;

export const anchorsToLinks = (html: string): string =>
  html.replace(
    ANCHOR,
    (
      _match,
      _quote: string | undefined,
      quotedHref: string | undefined,
      bareHref: string | undefined,
      inner: string
    ) => {
      const rawHref = quotedHref ?? bareHref ?? '';
      const href = decodeEntities(rawHref.trim());
      const words = inner.replace(/<br\s*\/?>/giu, ' ');
      if (!isHttpUrl(href)) return words;
      const plainWords = decodeEntities(words.replace(/<[^>]*>/gu, '')).trim();
      if (!plainWords) return '';
      if (plainWords === href) return rawHref.trim();
      const tokenHref = rawHref
        .trim()
        .replace(/[\s()"<>«»]/gu, (char) => encodeURIComponent(char));
      // A link token's words hold no line break: a raw newline becomes a
      // space like `<br>`, or the token reads back as text (review F5).
      const tokenWords = words
        .replace(/\r?\n/gu, ' ')
        .replace(/[[\]]|\\(?=[\\[\]*_+])/gu, (char) => `\\${char}`);
      return `[${tokenWords}](${tokenHref})`;
    }
  );

/** Пост как текст для проверки: теги сняты, выделение и ссылки остались знаками тела. */
export const postAsReviewText = (content: string, editor: EditorKind): string =>
  editor === 'html' || editor === 'normal'
    ? htmlToPlainText(anchorsToLinks(strongToBold(content)))
    : content;

/**
 * Что проверка читает у адаптации: каноническое тело, пока пост из него
 * выводится, и сам пост, как только его правили руками.
 */
export const reviewTextOf = (
  draft: { body?: string | null; post: { content: string } },
  editor: EditorKind
): string => {
  const canonical = (draft.body ?? '').trim();
  if (canonical && editorHtml(canonical, editor) === draft.post.content)
    return draft.body!;
  return postAsReviewText(draft.post.content, editor);
};
