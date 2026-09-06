/**
 * Текст → разметка, которую редактор и провайдеры уже понимают.
 *
 * Вынесено из `content-brief.compose.ts` без единой правки поведения
 * (`content-factory-next-tu3k.1`): вход одной мыслью сохраняет черновик тем же
 * путём, что и бриф, и второй `escape`, написанный рядом, — это второе место,
 * где однажды забудут про амперсанд. Сборка брифа импортирует эти же функции
 * отсюда и осталась той же.
 */

export const escape = (value: string) =>
  value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;');

export const paragraph = (value?: string | null) =>
  value && value.trim() ? `<p>${escape(value.trim())}</p>` : '';

/**
 * Абзацы сгенерированного текста, каждый своим `<p>`.
 *
 * Пустая строка — граница абзаца, одиночный перевод строки внутри абзаца
 * сохраняется как пробел: модель ставит их произвольно, а лишний `<p>` на
 * каждой строке превратил бы телеграм-пост в лесенку.
 *
 * Редактор канала решает, нужна ли разметка вообще. `html` и `normal` её ждут;
 * `none` и `markdown` — нет, и там текст остаётся собой. Список редакторов —
 * `SocialProvider.editor`, третьей таблицы у продукта нет.
 */
export const editorHtml = (
  text: string,
  editor: 'none' | 'normal' | 'markdown' | 'html'
): string => {
  const body = (text || '').replace(/\r\n?/gu, '\n').trim();
  if (!body) return '';
  if (editor !== 'html' && editor !== 'normal') return body;
  return body
    .split(/\n{2,}/u)
    .map((block) => paragraph(block.replace(/\n/gu, ' ')))
    .filter(Boolean)
    .join('');
};
