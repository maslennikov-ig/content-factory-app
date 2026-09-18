/**
 * Текст → разметка, которую редактор и провайдеры уже понимают.
 *
 * Вынесено из `content-brief.compose.ts` без единой правки поведения
 * (`content-factory-next-tu3k.1`): вход одной мыслью сохраняет черновик тем же
 * путём, что и бриф, и второй `escape`, написанный рядом, — это второе место,
 * где однажды забудут про амперсанд. Сборка брифа импортирует эти же функции
 * отсюда и осталась той же.
 */

import {
  boldPairsOrStrayMarkers,
  stripBoldMarkers,
  stripStrayBoldMarkers,
} from '@contentfactory/helpers/utils/bold-markers';

export { stripBoldMarkers } from '@contentfactory/helpers/utils/bold-markers';

export const escape = (value: string) =>
  value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;');

export const paragraph = (value?: string | null) =>
  value && value.trim() ? `<p>${escape(value.trim())}</p>` : '';

/**
 * Выделение: одна форма в хранении, разметка площадки — на выходе.
 *
 * `content-factory-next-97dq.2`, находка восьмого захода: «в адаптации есть
 * звёздочки… Markdown-разметка не срабатывает». Тело адаптации хранится
 * простым текстом, и жирное в нём записано как `**текст**` — это то, что
 * модель пишет сама и о чём с ней теперь договорено (`channel-directives.ts`).
 * Превращается оно здесь и только здесь, иначе мест, знающих про звёздочки,
 * стало бы столько же, сколько дверей, кладущих текст в пост.
 *
 * Сама грамматика живёт не здесь, а в `@contentfactory/helpers/utils/bold-markers`:
 * ту же пару обязан читать экран заготовки, иначе предпросмотр обещает одно
 * выделение, а в канал уходит другое (разбор корректности, P2-13). Здесь
 * остаётся только перевод в разметку площадки.
 *
 * Непарный маркер, прижатый к слову, не публикуется никогда: звёздочки в
 * вышедшем посте — это ровно та поломка, из-за которой всё написано. А
 * одинокий `**` между пробелами — не маркер, а текст (`2 ** 3 = 8`), и он
 * остаётся на месте.
 */

/** Экранированная строка → `<strong>`; одинокие маркеры снимаются. */
export const boldToStrong = (escaped: string): string =>
  escaped.replace(boldPairsOrStrayMarkers(), (_match, inner?: string) =>
    inner === undefined ? '' : `<strong>${inner}</strong>`
  );

/**
 * Абзацы сгенерированного текста, каждый своим `<p>`.
 *
 * Пустая строка — граница абзаца, одиночный перевод строки внутри абзаца
 * сохраняется как пробел: модель ставит их произвольно, а лишний `<p>` на
 * каждой строке превратил бы телеграм-пост в лесенку.
 *
 * Редактор канала решает, что делать с разметкой. `html` принимает теги — там
 * появляется `<strong>`, и Telegram уже своим путём делает из него `<b>`.
 * `normal` ждёт абзацы, но выделения не показывает — маркеры снимаются.
 * `markdown` понимает `**текст**` сам, поэтому пары остаются собой; но и там
 * непарный маркер снимается — Discord и Medium напечатали бы его буквально
 * (разбор корректности, P1-4), а `**a\nb**` у них вообще стало бы жирным,
 * которого страница не показывала. `none` не показывает ничего — остаётся
 * голый текст. Список редакторов — `SocialProvider.editor`, третьей таблицы у
 * продукта нет.
 */
export const editorHtml = (
  text: string,
  editor: 'none' | 'normal' | 'markdown' | 'html'
): string => {
  const body = (text || '').replace(/\r\n?/gu, '\n').trim();
  if (!body) return '';
  if (editor === 'markdown') return stripStrayBoldMarkers(body);
  if (editor === 'none') return stripBoldMarkers(body);
  const inline = editor === 'html' ? boldToStrong : stripBoldMarkers;
  return body
    .split(/\n{2,}/u)
    .map((block) =>
      block
        .split('\n')
        .map((line) => inline(escape(line)))
        .join(' ')
        .trim()
    )
    .filter(Boolean)
    .map((inner) => `<p>${inner}</p>`)
    .join('');
};
