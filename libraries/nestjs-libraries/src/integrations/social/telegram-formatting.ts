import striptags from 'striptags';

export const TELEGRAM_CAPTION_LIMIT = 1024;

/**
 * A post's HTML as Telegram's `parse_mode: 'HTML'` accepts it.
 *
 * Telegram knows a handful of tags and refuses a message with any other, so
 * everything else is stripped to its text. Bold arrives as `<strong>`,
 * italic as `<em>` (`97dq.52`) — both renamed to Telegram's own `<b>` and
 * `<i>`; underline is `<u>` already. A link keeps only its `href`, and only
 * an http(s) one: the editors add `target` and `rel`, which Telegram does not
 * take, and any other scheme becomes plain words.
 */
export const telegramHtml = (html: string, rich = false): string => {
  let number = 0;
  const prepared = rich ? (html || '') : (html || '')
    .replace(/(<li\b[^>]*>)([\s\S]*?)(<\/li\s*>)/giu, (_all, start: string, inner: string, end: string) =>
      start + inner.replace(/<\/p\s*>\s*<p\b[^>]*>/giu, '<br>').replace(/<\/?p\b[^>]*>/giu, '') + end)
    .replace(/<(\/?)\s*(ol|ul|li)\b[^>]*>/giu, (_tag, closing: string, raw: string) => {
      const name = raw.toLowerCase();
      if (closing) return '\n';
      if (name === 'ol') { number = 0; return ''; }
      if (name === 'ul') { number = -1; return ''; }
      return number < 0 ? '• ' : `${++number}. `;
    })
    .replace(/<h[1-6]\b[^>]*>/giu, '<b>')
    .replace(/<\/h[1-6]\s*>/giu, '</b>\n\n');
  const kept = striptags(prepared, ['u', 'strong', 'b', 'em', 'i', 'a', 'p', 'br', ...(rich ? ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ol', 'ul', 'li'] : [])]);
  /*
    Every kept tag is rebuilt, never passed through (`97dq.75` review P2-6):
    attributes on <b>/<i>/<u> go, a closing tag with nothing open goes, a link
    inside a link loses its inner tags, and whatever is still open at the end
    is closed — Telegram refuses a message that breaks any of these.
  */
  const NAME: Record<string, string> = {
    strong: 'b',
    b: 'b',
    em: 'i',
    i: 'i',
    u: 'u',
    a: 'a',
    p: 'p',
    br: 'br', h1: 'h1', h2: 'h2', h3: 'h3', h4: 'h4', h5: 'h5', h6: 'h6', ol: 'ol', ul: 'ul', li: 'li',
  };
  const open: string[] = [];
  const out = kept.replace(
    /<(\/?)([a-z][a-z0-9]*)\b([^>]*)>/gi,
    (_tag, closing: string, raw: string, attrs: string) => {
      const name = NAME[raw.toLowerCase()];
      if (!name) return '';
      if (name === 'br') return closing ? '' : rich ? '<br>' : '\n';
      if (name === 'p' && !rich) return closing ? '\n\n' : '';
      if (!closing) {
        if (name === 'a') {
          const href = /\bhref\s*=\s*"([^"]*)"/i.exec(attrs)?.[1] ?? '';
          const inLink = open.includes('a') || open.includes('drop-a');
          if (inLink || !/^https?:\/\/[^\s"<>]+$/i.test(href)) {
            open.push('drop-a');
            return '';
          }
          open.push('a');
          return `<a href="${href}">`;
        }
        open.push(name);
        return `<${name}>`;
      }
      const wanted = name === 'a' ? ['a', 'drop-a'] : [name];
      const at = open.map((one) => wanted.includes(one)).lastIndexOf(true);
      if (at < 0) return '';
      // Close what was opened inside it first, so the tags stay nested.
      const inner = open.splice(at);
      return inner
        .reverse()
        .map((one) => (one === 'drop-a' ? '' : `</${one}>`))
        .join('');
    }
  );
  const result = (
    out +
    open
      .reverse()
      .map((one) => (one === 'drop-a' ? '' : `</${one}>`))
      .join('')
  );
  return rich ? result : result.replace(/\n{3,}/gu, '\n\n').replace(/\n\n$/u, '\n');
};
