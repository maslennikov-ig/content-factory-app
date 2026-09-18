import striptags from 'striptags';
import { parseFragment, serialize } from 'parse5';
import { createEntityDecoder } from './html-entities';

/**
 * Сущности, которые получатель простого текста видеть не должен.
 *
 * X, Bluesky, Facebook и предпросмотр на странице печатают то, что им дали,
 * буквально: `&lt;` у них так и останется пятью знаками. Поэтому для них
 * сущности снимаются — но ровно один раз и ровно после `striptags`, см. ниже.
 */
const TEXT_ENTITIES = [
  ['&gt;', '>'],
  ['&lt;', '<'],
  ['&amp;', '&'],
  ['&nbsp;', ' '],
  ['&quot;', '"'],
  ['&#0?39;', "'"],
] as const;

/**
 * Разэкранирование для получателя простого текста.
 *
 * Два правила, и каждое стоило дефекта:
 *
 *  1. **После `striptags`, а не до.** Тело хранится экранированным: человек,
 *     написавший в адаптации `<b>жирный</b>` буквами, хранится как
 *     `&lt;b&gt;жирный&lt;/b&gt;`. Снять экранирование до `striptags` значит
 *     отдать стрипперу текст в виде тегов — он их выбросит, и от написанного
 *     человеком останется «жирный». После — останется ровно то, что он писал.
 *  2. **Один проход.** `&amp;lt;` — это буквы «&lt;», а не знак «меньше»;
 *     цепочка из двух `.replace` делала из него `<`. См. `html-entities.ts`.
 */
const decodeForText = createEntityDecoder(TEXT_ENTITIES);

/**
 * Единственная сущность, которую снимают и получателю разметки.
 *
 * Разбор корректности второго выпуска, P1-1. Первое, что делает помощник, —
 * `serialize(parseFragment(val))`, а сериализатор parse5 экранирует ровно пять
 * вещей (`parse5/lib/serializer/index.js:164-173`): в тексте `&`, U+00A0, `<`
 * и `>`, в значении атрибута `&`, U+00A0 и `"`. То есть `&nbsp;` появляется в
 * теле сам, от неразрывного пробела, которого человек не писал сущностью:
 * русская типографика, вставленный текст и ответ модели дают U+00A0 постоянно.
 *
 * Из этих пяти четыре несут смысл разметки и обязаны остаться экранированными.
 * `&nbsp;` не несёт никакого, а Telegram из именованных сущностей понимает
 * только `&lt;`, `&gt;`, `&amp;` и `&quot;` — и требует, чтобы всякий `&` вне
 * сущности был экранирован. Значит `5&nbsp;000` в посте либо печатается
 * шестью знаками, либо валит отправку с `can't parse entities`.
 *
 * Разворачивается он в обычный пробел, а не в U+00A0, потому что так делал
 * выпущенный помощник: цепочка снимала `&nbsp;` в пробел, и на обычных телах
 * выход обязан совпасть с выпущенным до знака. Неразрывный пробел был бы
 * вернее типографски — это отдельное решение о продукте, а не починка дефекта.
 */
const MARKUP_ENTITIES = [['&nbsp;', ' ']] as const;

const decodeForMarkup = createEntityDecoder(MARKUP_ENTITIES);

const bold = {
  a: '𝗮',
  b: '𝗯',
  c: '𝗰',
  d: '𝗱',
  e: '𝗲',
  f: '𝗳',
  g: '𝗴',
  h: '𝗵',
  i: '𝗶',
  j: '𝗷',
  k: '𝗸',
  l: '𝗹',
  m: '𝗺',
  n: '𝗻',
  o: '𝗼',
  p: '𝗽',
  q: '𝗾',
  r: '𝗿',
  s: '𝘀',
  t: '𝘁',
  u: '𝘂',
  v: '𝘃',
  w: '𝘄',
  x: '𝘅',
  y: '𝘆',
  z: '𝘇',
  A: '𝗔',
  B: '𝗕',
  C: '𝗖',
  D: '𝗗',
  E: '𝗘',
  F: '𝗙',
  G: '𝗚',
  H: '𝗛',
  I: '𝗜',
  J: '𝗝',
  K: '𝗞',
  L: '𝗟',
  M: '𝗠',
  N: '𝗡',
  O: '𝗢',
  P: '𝗣',
  Q: '𝗤',
  R: '𝗥',
  S: '𝗦',
  T: '𝗧',
  U: '𝗨',
  V: '𝗩',
  W: '𝗪',
  X: '𝗫',
  Y: '𝗬',
  Z: '𝗭',
  '1': '𝟭',
  '2': '𝟮',
  '3': '𝟯',
  '4': '𝟰',
  '5': '𝟱',
  '6': '𝟲',
  '7': '𝟳',
  '8': '𝟴',
  '9': '𝟵',
  '0': '𝟬',
};

const underlineMap = {
  a: 'a̲',
  b: 'b̲',
  c: 'c̲',
  d: 'd̲',
  e: 'e̲',
  f: 'f̲',
  g: 'g̲',
  h: 'h̲',
  i: 'i̲',
  j: 'j̲',
  k: 'k̲',
  l: 'l̲',
  m: 'm̲',
  n: 'n̲',
  o: 'o̲',
  p: 'p̲',
  q: 'q̲',
  r: 'r̲',
  s: 's̲',
  t: 't̲',
  u: 'u̲',
  v: 'v̲',
  w: 'w̲',
  x: 'x̲',
  y: 'y̲',
  z: 'z̲',
  A: 'A̲',
  B: 'B̲',
  C: 'C̲',
  D: 'D̲',
  E: 'E̲',
  F: 'F̲',
  G: 'G̲',
  H: 'H̲',
  I: 'I̲',
  J: 'J̲',
  K: 'K̲',
  L: 'L̲',
  M: 'M̲',
  N: 'N̲',
  O: 'O̲',
  P: 'P̲',
  Q: 'Q̲',
  R: 'R̲',
  S: 'S̲',
  T: 'T̲',
  U: 'U̲',
  V: 'V̲',
  W: 'W̲',
  X: 'X̲',
  Y: 'Y̲',
  Z: 'Z̲',
  '1': '1̲',
  '2': '2̲',
  '3': '3̲',
  '4': '4̲',
  '5': '5̲',
  '6': '6̲',
  '7': '7̲',
  '8': '8̲',
  '9': '9̲',
  '0': '0̲',
};

export const stripHtmlValidation = (
  type: 'none' | 'normal' | 'markdown' | 'html',
  val: string,
  replaceBold = false,
  none = false,
  plain = false,
  convertMentionFunction?: (idOrHandle: string, name: string) => string
): string => {
  if (plain) {
    return val;
  }

  const value = serialize(parseFragment(val));

  if (type === 'none') {
    return decodeForText(striptags(value));
  }

  // Получатель разметки: Listmonk вставляет это в HTML-кампанию, WordPress
  // пишет содержимым записи, Telegram отправляет с `parse_mode: HTML`.
  //
  // `content-factory-next-97dq.11`: здесь стояло разэкранирование, и оно
  // превращало безопасно хранимый текст в живую разметку. Тело, где написано
  // `&lt;script&gt;`, уходило в письмо тегом `<script>` — а с галочкой «это
  // чужой текст» содержимое адаптации приходит извне.
  //
  // Для получателя разметки экранирование снимать не нужно и нельзя: `&lt;`
  // и есть правильный способ сказать «знак меньше» в HTML, читатель увидит
  // именно его. Снятие ещё и портило написанное: `a &lt; b` уезжало в письмо
  // как `a < b`, то есть как начало тега, а в Telegram — как разметка, которую
  // его разборщик не принимает. Остаётся отбор разрешённых тегов и одна
  // сущность, которую сюда кладёт сам parse5, — см. `MARKUP_ENTITIES`.
  if (type === 'html') {
    return decodeForMarkup(
      striptags(convertMention(value, convertMentionFunction), [
        'ul',
        'li',
        'h1',
        'h2',
        'h3',
        'p',
        'strong',
        'u',
        'a',
      ])
    );
  }

  // Markdown остаётся как был, с одной правкой: сущности снимаются после
  // `striptags` и одним проходом. Раньше `&amp;` снимался до него, и пара
  // проходов делала из написанного буквами `&amp;lt;` знак «меньше».
  //
  // Почему для markdown экранирование всё же снимается, в отличие от `html`:
  // получатели тут разные. Discord и Lemmy напечатают `&lt;` пятью знаками,
  // а Medium и dev.to прочитают его как разметку. Одного верного ответа на
  // оба у общего помощника нет, и выбор в пользу одного из них — это решение
  // о продукте, а не о защите; поведение здесь не меняется.
  if (type === 'markdown') {
    return decodeForText(
      striptags(
        convertMention(
          value
            .replace(/<h1>([.\s\S]*?)<\/h1>/g, (match, p1) => {
              return `<h1># ${p1}</h1>\n`;
            })
            .replace(/<h2>([.\s\S]*?)<\/h2>/g, (match, p1) => {
              return `<h2>## ${p1}</h2>\n`;
            })
            .replace(/<h3>([.\s\S]*?)<\/h3>/g, (match, p1) => {
              return `<h3>### ${p1}</h3>\n`;
            })
            .replace(/<u>([.\s\S]*?)<\/u>/g, (match, p1) => {
              return `<u>__${p1}__</u>`;
            })
            .replace(/<strong>([.\s\S]*?)<\/strong>/g, (match, p1) => {
              return `<strong>**${p1}**</strong>`;
            })
            .replace(/<li.*?>([.\s\S]*?)<\/li.*?>/gm, (match, p1) => {
              return `<li>- ${p1.replace(/\n/gm, '')}</li>`;
            })
            .replace(/<p>([.\s\S]*?)<\/p>/g, (match, p1) => {
              return `<p>${p1}</p>\n`;
            })
            .replace(
              /<a.*?href="([.\s\S]*?)".*?>([.\s\S]*?)<\/a>/g,
              (match, p1, p2) => {
                return `<a href="${p1}">[${p2}](${p1})</a>`;
              }
            ),
          convertMentionFunction
        )
      )
    );
  }

  if (value.indexOf('<p>') === -1 && !none) {
    return value;
  }

  // Абзацы становятся переводами строк. Сущности здесь больше не снимаются:
  // это делает `decodeForText` на выходе каждой из трёх веток ниже, после
  // `striptags` и один раз.
  const html = (value || '')
    .replace(/^<p[^>]*>/i, '')
    .replace(/<p[^>]*>/gi, '\n')
    .replace(/<\/p>/gi, '');

  if (none) {
    return decodeForText(striptags(html));
  }

  if (replaceBold) {
    const processedHtml = convertMention(
      convertToAscii(
        html
          .replace(
            /<a.*?href="([.\s\S]*?)".*?>([.\s\S]*?)<\/a>/g,
            (match, p1, p2) => {
              return `<a href="${p1}">${p1}</a>`;
            }
          )
          .replace(/<ul>/, '\n<ul>')
          .replace(/<\/ul>\n/, '</ul>')
          .replace(/<li.*?>([.\s\S]*?)<\/li.*?>/gm, (match, p1) => {
            return `<li><p>- ${p1.replace(/\n/gm, '')}\n</p></li>`;
          })
      ),
      convertMentionFunction
    );

    // Ветки `&𝗹𝘁;` и `&l̲t̲;` здесь больше нет, потому что нет и причины:
    // `convertToAscii` не трогает сущности, поэтому `&lt;` внутри выделения
    // остаётся `&lt;` и снимается обычным проходом.
    return decodeForText(striptags(processedHtml));
  }

  // Strip all other tags
  return decodeForText(striptags(html, ['ul', 'li', 'h1', 'h2', 'h3']));
};

export const convertMention = (
  value: string,
  process?: (idOrHandle: string, name: string) => string
) => {
  if (!process) {
    return value;
  }

  return value.replace(
    /<span.*?data-mention-id="([.\s\S]*?)"[.\s\S]*?>([.\s\S]*?)<\/span>/gi,
    (match, id, name) => {
      return `<span>` + process(id, name) + `</span>`;
    }
  );
};

/**
 * Либо целая сущность, либо один знак.
 *
 * Начертание — это про буквы, а `&lt;` буквами не является: это один знак,
 * записанный пятью. Раньше выделение переводило и его, из `&lt;` получалось
 * `&𝗹𝘁;`, и внизу помощника стояли четыре строки, вручную узнающие такие
 * обломки. Здесь сущность узнаётся целиком и остаётся собой.
 */
const ENTITY_OR_CHARACTER =
  /&(?:[a-z][a-z0-9]{1,9}|#\d{1,6}|#x[0-9a-f]{1,6});|[\s\S]/gi;

const convertLetters = (value: string, map: Record<string, string>): string =>
  value.replace(ENTITY_OR_CHARACTER, (chunk) =>
    chunk.length > 1 ? chunk : map[chunk] || chunk
  );

export const convertToAscii = (value: string): string => {
  return value
    .replace(/<strong>(.+?)<\/strong>/gi, (match, p1) => {
      return match.replace(p1, convertLetters(p1, bold));
    })
    .replace(/<u>(.+?)<\/u>/gi, (match, p1) => {
      return match.replace(p1, convertLetters(p1, underlineMap));
    });
};
