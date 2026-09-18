import { stripHtmlValidation } from '@contentfactory/helpers/utils/strip.html.validation';
import { textSlicer } from '@contentfactory/helpers/utils/count.length';
import { escape } from '@contentfactory/nestjs-libraries/content-intelligence/brief/editor-html';

/**
 * Текст поста для предпросмотра: то, что уйдёт в канал, плюс разметка самого
 * предпросмотра — упоминание и отрезанный хвост.
 *
 * Здесь это живёт по двум причинам, и вторая — дефект.
 *
 * **Одно место вместо семи.** Этот расчёт был скопирован слово в слово в
 * `general.preview.component.tsx` и в шесть превью площадок; седьмая,
 * Instagram, отличалась одной строкой имени канала впереди. Один и тот же
 * дефект приходилось бы чинить семь раз — что и показал разбор корректности
 * второго выпуска, перечислив десять точек внедрения.
 *
 * **Экранирование.** Разбор корректности второго выпуска, P1-2. Результат
 * `stripHtmlValidation('normal', …)` — это ТЕКСТ: теги сняты, сущности
 * разэкранированы. Дальше он попадал в `dangerouslySetInnerHTML` как есть, и
 * написанное человеком буквами возвращалось разметкой:
 *
 * ```
 * человек пишет:  Смотрите: <img src=x onerror=alert(document.domain)>
 * хранится:       <p>Смотрите: &lt;img src=x onerror=…&gt;</p>
 * предпросмотр:   Смотрите: <img src=x onerror=…>   ← и браузер это выполнял
 * ```
 *
 * React не выполнит так вставленный `<script>`, но `onerror` у картинки
 * срабатывает. С галочкой «это чужой текст» содержимое адаптации приходит
 * извне — ровно та модель угрозы, из которой написана починка `97dq.11` для
 * Listmonk и WordPress.
 *
 * Поэтому текст экранируется обратно, и разметкой в строке остаётся только то,
 * что добавляет сам предпросмотр: `<span>` упоминания, `<mark>` отрезанного
 * хвоста и необязательное имя канала впереди.
 *
 * Почему не `sanitizePostContent` (DOMPurify), которым вставляет
 * `post.preview.tsx` и который чистит тело на входе в `create.post.dto.ts`:
 * там в строке есть настоящая разметка, которую надо сохранить, а здесь её
 * нет и быть не должно. DOMPurify на этой строке сделал бы два лишних дела —
 * выбросил бы `<mark>` (его нет в списке разрешённых тегов) и **удалил** бы
 * `<img …>`, то есть стёр бы написанное человеком вместо того, чтобы его
 * показать. Экранирование показывает написанное и не выполняет ничего.
 *
 * Одно следствие названо здесь, чтобы его не искали: тело без единого `<p>`
 * помощник возвращает разметкой как есть (ранний возврат в
 * `strip.html.validation.ts`), и такое тело теперь видно в предпросмотре
 * тегами. Это правда о канале: в него уйдёт ровно та же строка.
 */
export type PreviewPost = {
  content: string;
  image?: Array<{ id: string; path: string }>;
};

export type PreviewContent = {
  text: string;
  images?: PreviewPost['image'];
};

/** Метка упоминания: то, чем оно живёт между снятием тегов и вставкой `<span>`. */
const MENTION_MARK = /\[\[\[([.\s\S]*?)]]]/;

const MENTION_SPAN =
  /<span.*?data-mention-id="([.\s\S]*?)"[.\s\S]*?>([.\s\S]*?)<\/span>/gi;

/**
 * Упоминание — единственная разметка, которую предпросмотр возвращает тексту.
 *
 * Как и было: заменяется первое вхождение в каждой половине, а не все. Метка
 * `[[[имя]]]` знаков разметки не содержит, поэтому переживает экранирование
 * целой, а имя внутри неё экранируется вместе с остальным текстом.
 */
const withMention = (text: string): string =>
  escape(text).replace(
    MENTION_MARK,
    (match, name) =>
      `<span class="font-bold font-[arial]" style="color: var(--cf-accent)">${name}</span>`
  );

export const previewContent = (
  posts: PreviewPost[],
  options: {
    /** Идентификатор площадки: по нему считается место обрезки. */
    identifier?: string;
    maximumCharacters?: number;
    /**
     * Подпись впереди текста — имя канала у Instagram. Площадка приносит своё
     * оформление, экранирование остаётся здесь: имя канала приходит из чужого
     * аккаунта и разметкой становиться не должно.
     */
    lead?: { text?: string; className: string };
  } = {}
): PreviewContent[] =>
  (posts || []).map((post) => {
    const newContent = stripHtmlValidation(
      'normal',
      (post.content || '').replace(
        MENTION_SPAN,
        (match, id, name) => `[[[${name}]]]`
      ),
      true
    );

    const { start, end } = textSlicer(
      options.identifier || '',
      options.maximumCharacters || 10000,
      newContent
    );

    const lead = options.lead
      ? `<strong class="${options.lead.className}">${escape(
          options.lead.text || ''
        )} </strong>`
      : '';

    return {
      text:
        lead +
        withMention(newContent.slice(start, end)) +
        `<mark class="bg-red-500" data-tooltip-id="tooltip" data-tooltip-content="This text will be cropped">` +
        withMention(newContent.slice(end)) +
        `</mark>`,
      images: post.image,
    };
  });
