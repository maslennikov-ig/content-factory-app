import { createHash } from 'node:crypto';
import { parseFragment, type ChildNode, type Element } from 'parse5';
import { lookup } from 'mime-types';

export const TELEGRAM_RICH_MEDIA_LIMIT = 10;
export const TELEGRAM_RICH_HTML_LIMIT = 20000;

type MediaType = 'photo' | 'video' | 'animation' | 'audio' | 'voice_note' | 'document';

export type TelegramRichAttachment = {
  id: string;
  media: { type: MediaType; media: string };
};

type RichLayout = {
  html: string;
  media: TelegramRichAttachment[];
  inline: boolean;
};

export type StoredTelegramRichLayout = {
  html: string;
  mediaIds: string[];
  previewHash: string;
};

export class TelegramRichLayoutError extends Error {}

export const telegramRichTextHash = (text: string): string =>
  createHash('sha256').update(text).digest('hex');

const HTML_TAGS = new Set([
  'a', 'b', 'i', 'u', 's', 'code', 'mark', 'sub', 'sup',
  'p', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre', 'footer', 'hr',
  'ul', 'ol', 'li', 'input', 'blockquote', 'cite', 'aside',
  'img', 'video', 'audio', 'figure', 'figcaption',
  'caption', 'table', 'tbody', 'thead', 'tfoot', 'tr', 'th', 'td',
  'details', 'summary',
  'tg-spoiler', 'tg-reference', 'tg-emoji', 'tg-time', 'tg-math', 'tg-math-block',
  'tg-document', 'tg-map', 'tg-collage', 'tg-slideshow', 'tg-button', 'tg-button-row',
]);
const TAG_ALIASES: Readonly<Record<string, string>> = {
  strong: 'b', em: 'i', ins: 'u', strike: 's', del: 's',
};
const TRANSPARENT = new Set(['div', 'span', 'tbody', 'thead', 'tfoot']);
const VOID = new Set(['br', 'hr', 'img', 'input', 'tg-map']);
const MEDIA_SCHEMES: Readonly<Record<string, string>> = {
  img: 'photo', video: 'video', audio: 'audio', 'tg-document': 'document',
};
const BLOCK_MEDIA_PARENTS = new Set(['', 'figure', 'tg-collage', 'tg-slideshow', 'details', 'li']);
const ANCHOR = /^[a-z0-9][a-z0-9_.:-]{0,63}$/i;
const INTEGER = /^-?\d{1,10}$/;
const ENUM_LIST = /^(?:1|a|A|i|I)$/;
const ALIGN = /^(?:left|center|right)$/;
const BUTTON_STYLE = /^(?:danger|success|primary|link)$/;
const TAG_NAMESPACE = 'http://www.w3.org/1999/xhtml';

function reject(message: string): never {
  throw new TelegramRichLayoutError(message);
}

function escape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function attribute(name: string, value: string): string {
  return ` ${name}="${escape(value)}"`;
}

function pick(attrs: Map<string, string>, name: string, pattern: RegExp): string {
  const value = attrs.get(name);
  if (value === undefined) return '';
  if (!pattern.test(value)) reject(`Invalid ${name} in Telegram rich HTML.`);
  return attribute(name, value);
}

function flag(attrs: Map<string, string>, name: string): string {
  return attrs.has(name) ? ` ${name}` : '';
}

function link(href: string): string {
  if (
    (href.startsWith('#') && ANCHOR.test(href.slice(1))) ||
    /^mailto:[^\s<>"@]+@[^\s<>"@]+$/i.test(href) ||
    /^tel:\+?[\d().-]{3,30}$/.test(href) ||
    /^tg:\/\/user\?id=[1-9]\d{0,19}$/.test(href)
  ) return href;
  if (!/^https?:\/\/[^\s<>"\\]+$/i.test(href)) reject('Unsupported Telegram link.');
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return reject('Invalid Telegram link.');
  }
  if (url.username || url.password) reject('Telegram links cannot include credentials.');
  return href;
}

function mediaType(scheme: string, path: string): MediaType {
  const mime = lookup(path.split(/[?#]/)[0]) || '';
  if (scheme === 'photo' && mime.startsWith('image/')) return 'photo';
  if (scheme === 'video') {
    if (mime === 'image/gif') return 'animation';
    if (mime === 'video/mp4') return 'video';
  }
  if (scheme === 'audio') {
    if (mime === 'audio/ogg' || mime === 'audio/opus') return 'voice_note';
    if (mime === 'audio/mpeg' || mime === 'audio/mp4' || mime === 'audio/x-m4a') return 'audio';
  }
  if (scheme === 'document' && mime) return 'document';
  return reject('Attachment type does not match its Telegram media tag.');
}

function mediaEntry(index: number, type: MediaType): TelegramRichAttachment {
  const id = `media_${index + 1}`;
  return { id, media: { type, media: `attach://${id}` } };
}

function buttonAttributes(attrs: Map<string, string>): string {
  const type = attrs.get('type');
  const style = pick(attrs, 'style', BUTTON_STYLE);
  if (type === 'url') {
    const url = attrs.get('url') ?? '';
    if (!/^https?:\/\//i.test(url) && !url.startsWith('tg://user?id=')) {
      reject('Telegram buttons need an HTTP(S) URL or Telegram user link.');
    }
    return attribute('type', type) + style + attribute('url', link(url));
  }
  if (type === 'copy_text') {
    const text = attrs.get('text') ?? '';
    if (!text.trim() || text.length > 256) reject('Telegram copy buttons need 1–256 characters.');
    return attribute('type', type) + style + attribute('text', text);
  }
  if (type === 'disabled') return attribute('type', type) + style;
  return reject('Supported Telegram channel buttons are url, copy_text and disabled.');
}

function tagAttributes(tag: string, attrs: Map<string, string>, parent: string): string {
  switch (tag) {
    case 'a': {
      const href = attrs.get('href');
      return href === undefined ? pick(attrs, 'name', ANCHOR) : attribute('href', link(href));
    }
    case 'code': return parent === 'pre' ? pick(attrs, 'class', /^language-[a-z0-9_+#.-]{1,40}$/i) : '';
    case 'ol': return pick(attrs, 'start', INTEGER) + pick(attrs, 'type', ENUM_LIST) + flag(attrs, 'reversed');
    case 'li': return pick(attrs, 'value', INTEGER) + pick(attrs, 'type', ENUM_LIST);
    case 'input':
      if (parent !== 'li' || attrs.get('type') !== 'checkbox') reject('Only list checkboxes are supported in Telegram rich HTML.');
      return ' type="checkbox"' + flag(attrs, 'checked');
    case 'blockquote': return flag(attrs, 'expandable');
    case 'table': return flag(attrs, 'bordered') + flag(attrs, 'striped') + flag(attrs, 'compact');
    case 'td':
    case 'th':
      return pick(attrs, 'colspan', /^[1-9]\d{0,2}$/) + pick(attrs, 'rowspan', /^[1-9]\d{0,2}$/)
        + pick(attrs, 'align', ALIGN) + pick(attrs, 'valign', /^(?:top|middle|bottom)$/);
    case 'details': return flag(attrs, 'open');
    case 'tg-reference':
      if (!attrs.has('name')) reject('Telegram references need a name.');
      return pick(attrs, 'name', ANCHOR);
    case 'tg-emoji':
      if (!attrs.has('emoji-id')) reject('Telegram custom emoji need emoji-id.');
      return pick(attrs, 'emoji-id', /^\d{1,20}$/);
    case 'tg-time':
      if (!attrs.has('unix') || !attrs.has('format')) reject('Telegram dates need unix and format.');
      return pick(attrs, 'unix', /^-?\d{1,12}$/) + pick(attrs, 'format', /^[a-zA-Z]{1,12}$/);
    case 'tg-map': {
      const lat = attrs.get('lat') ?? '';
      const lon = attrs.get('lon') ?? '';
      const coordinate = /^-?\d{1,3}(?:\.\d{1,12})?$/;
      if (!coordinate.test(lat) || !coordinate.test(lon) || Math.abs(Number(lat)) > 90 || Math.abs(Number(lon)) > 180) {
        reject('Telegram maps need valid latitude and longitude.');
      }
      return attribute('lat', lat) + attribute('lon', lon) + pick(attrs, 'zoom', /^(?:[1-9]|1[0-9]|20)$/);
    }
    case 'tg-button': return buttonAttributes(attrs);
    case 'tg-button-row': return pick(attrs, 'align', ALIGN);
    default: return '';
  }
}

/**
 * Compile Telegram-only HTML separately from the browser-safe post preview.
 * The only media sources emitted are multipart slots tied to workspace files.
 */
export function compileTelegramRichLayout(html: string, paths: readonly string[]): RichLayout {
  if (!html || html.length > TELEGRAM_RICH_HTML_LIMIT || paths.length > TELEGRAM_RICH_MEDIA_LIMIT) {
    reject('Telegram rich HTML or attachment count exceeds the supported limit.');
  }
  const bound = new Map<number, TelegramRichAttachment>();

  function render(nodes: ChildNode[], parent = '', depth = 0): string {
    if (depth > 32) reject('Telegram rich HTML is nested too deeply.');
    return nodes.map(node => {
      if ('value' in node && node.nodeName === '#text') return escape(node.value);
      if (!('tagName' in node)) return '';
      const element: Element = node;
      const tag = Object.prototype.hasOwnProperty.call(TAG_ALIASES, element.tagName) ? TAG_ALIASES[element.tagName] : element.tagName;
      if (element.namespaceURI !== TAG_NAMESPACE) reject('Foreign markup is not supported in Telegram rich HTML.');
      if (TRANSPARENT.has(tag)) return render(element.childNodes, parent, depth + 1);
      if (!HTML_TAGS.has(tag)) reject('Unsupported tag in Telegram rich HTML.');
      const attrs = new Map(element.attrs.map(({ name, value }) => [name, value]));
      const scheme = Object.prototype.hasOwnProperty.call(MEDIA_SCHEMES, tag) ? MEDIA_SCHEMES[tag] : undefined;
      if (scheme) {
        const src = attrs.get('src') ?? '';
        if (tag === 'img' && /^tg:\/\/emoji\?id=\d{1,20}$/.test(src)) {
          return '<img' + attribute('src', src) + attribute('alt', (attrs.get('alt') ?? '').slice(0, 32)) + '/>';
        }
        if (!BLOCK_MEDIA_PARENTS.has(parent)) reject('Telegram media must be a separate block, outside paragraphs and headings.');
        const slot = /^tg:\/\/(photo|video|audio|document)\?id=media_(10|[1-9])$/.exec(src);
        if (!slot || slot[1] !== scheme) reject('Use a matching tg:// media reference to an owned attachment.');
        const index = Number(slot[2]) - 1;
        if (!paths[index] || bound.has(index)) reject('Each Telegram media slot must refer to a distinct supplied attachment.');
        bound.set(index, mediaEntry(index, mediaType(scheme, paths[index])));
        const opening = '<' + tag + attribute('src', src) + flag(attrs, 'tg-spoiler');
        return tag === 'img' ? opening + '/>' : opening + '></' + tag + '>';
      }

      const opening = '<' + tag + tagAttributes(tag, attrs, parent);
      if (VOID.has(tag)) return opening + '/>';
      return opening + '>' + render(element.childNodes, tag, depth + 1) + '</' + tag + '>';
    }).join('');
  }

  // HTML5 treats custom elements as non-void, but Telegram documents a self-closing map.
  const parsed = parseFragment(html.replace(/<tg-map(\s[^<>]*?)\/\s*>/gi, '<tg-map$1></tg-map>'));
  let formatted = render(parsed.childNodes);
  const inline = bound.size > 0;
  if (inline && bound.size !== paths.length) reject('Place every supplied Telegram attachment in the rich HTML.');
  if (!inline && paths.length) {
    const images = paths.map((path, index) => {
      const entry = mediaEntry(index, mediaType('photo', path));
      bound.set(index, entry);
      return `<img src="tg://photo?id=${entry.id}"/>`;
    }).join('');
    formatted += paths.length > 1 ? '<tg-collage>' + images + '</tg-collage>' : images;
  }
  if (formatted.length > TELEGRAM_RICH_HTML_LIMIT) reject('Formatted Telegram HTML exceeds the supported limit.');
  return { html: formatted, inline, media: paths.map((_, index) => bound.get(index)!) };
}
