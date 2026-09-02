/**
 * The one HTML shell every product email is rendered into, plus the handful of
 * content blocks a caller assembles a body from.
 *
 * Drawn from `docs/design/desert-lab/email/` (`Main.dc.html` is the reference
 * artboard, `ActionLight.dc.html` the light one, `Anatomy.dc.html` the assembly
 * sheet). Everything here obeys the constraints in
 * `docs/prompts/email-template-design-brief.md`, and they are not stylistic
 * preferences — they are what mail clients actually render:
 *
 * - Tables and inline styles only. Outlook on Windows lays email out with the
 *   Word engine: no `flex`, no CSS gradient, no `position`, no `box-shadow`,
 *   no `backdrop-filter`. A `border`, never a shadow, separates surfaces.
 * - Every visible property is repeated inline on its own element. Mobile Gmail
 *   strips `<head>`, so nothing the email needs may live only in a stylesheet.
 * - `px` only. `rem` resolves unpredictably across clients.
 * - Colour is set inline on every text element, because clients that recolour
 *   for the reader's dark mode do it by heuristic, and an inherited colour is
 *   what they get wrong. The action is a filled button rather than a bare
 *   link for the same reason: a fill holds its contrast whatever the client
 *   did to the background behind it.
 * - No external image, font or tracking pixel. The `Cf` mark is a bordered
 *   table cell with the letters in it — readable with images switched off.
 * - `border-radius` on a table is ignored by Outlook. Expected degradation:
 *   the corner stays square and nothing else moves.
 *
 * Two themes, one of them conditional. The inline values are the dark theme
 * and they are what every client gets by default; the light theme is a
 * `prefers-color-scheme` block in `<head>` that repaints the same elements
 * through their `cf-*` classes. A client that reads it (Apple Mail and
 * friends) shows the light artboard to a reader whose system is light; a
 * client that strips `<head>` (mobile Gmail) never sees the block and keeps
 * the dark email, which is complete on its own. Every declaration in that
 * block carries `!important` — without it an inline style wins on
 * specificity and the light theme would silently do nothing.
 *
 * This file deliberately has no imports, for the same reason
 * `locale/backend-strings.ts` has none: several suites load it and its callers
 * through `tests/helpers/load-ts-module.cjs`, which resolves an import only if
 * the test names it in a mock map. An import here would make every one of
 * those suites carry one. That is also why `escapeEmailHtml` is a second copy
 * of the escaping in the string catalog rather than a shared import.
 */

export const EMAIL_SANS =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export const EMAIL_MONO =
  'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

/**
 * desert-lab dark theme, the values from `docs/design/desert-lab/tokens.css`.
 * Dark is the product's primary theme and the one that ships inline: it is
 * what a client renders when it tells us nothing about the reader.
 */
export const EMAIL_COLORS = {
  canvas: '#14150F',
  surface: '#1C1E16',
  surfaceSubtle: '#22241B',
  ink: '#ECEBDF',
  inkMuted: '#A6A794',
  border: '#33362A',
  borderStrong: '#4B4F3E',
  accent: '#7FB03A',
  accentInk: '#0F1409',
  signature: '#C8922A',
} as const;

/**
 * The light theme from the same file's `:root` block, which is what
 * `ActionLight.dc.html` was drawn with. Two values differ from their dark
 * counterparts in a way that is easy to miss: the words on the button turn
 * white where the dark theme has near-black, and the `Cf` mark is the darker
 * ochre `#9C6A16` rather than `#C8922A` — the dark theme's ochre on the light
 * card comes to about 2.2:1 and would not be readable.
 */
export const EMAIL_COLORS_LIGHT = {
  canvas: '#EFE9DB',
  surface: '#FBF8F0',
  surfaceSubtle: '#E4DDCB',
  ink: '#22231A',
  inkMuted: '#5C5D4C',
  border: '#D3CAB3',
  borderStrong: '#B0A68A',
  accent: '#3F6B2E',
  accentInk: '#FFFFFF',
  signature: '#9C6A16',
} as const;

export type EmailDirection = 'ltr' | 'rtl';

/** The two right-to-left locales the backend catalog ships. */
const RTL_LOCALES = ['he', 'ar'];

export function emailDirection(locale?: string): EmailDirection {
  return typeof locale === 'string' && RTL_LOCALES.includes(locale)
    ? 'rtl'
    : 'ltr';
}

function startEdge(dir: EmailDirection): 'left' | 'right' {
  return dir === 'rtl' ? 'right' : 'left';
}

export function escapeEmailHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const LINK_STYLE = `color: ${EMAIL_COLORS.accent}; text-decoration: underline;`;

/**
 * Gives an `<a>` that carries no inline style one, so it is legible on the
 * dark card instead of falling back to the client's default blue. It also
 * gets `cf-link`, so the light theme can repaint it.
 *
 * Bodies reach the shell from several places — the string catalog's footer
 * line, a digest message, a caller that has not moved to the blocks below —
 * and a link inside any of them would otherwise inherit nothing. A tag that
 * already has a `style` attribute (every button and fallback link this file
 * builds) is left exactly as it is.
 */
export function styleBareLinks(html: string): string {
  return html.replace(/<a\b(?![^>]*\bstyle\s*=)([^>]*)>/gi, (_match, rest) => {
    const attributes = String(rest).replace(/\s+$/, '');
    return `<a${attributes} class="cf-link" style="${LINK_STYLE}">`;
  });
}

/**
 * A paragraph of body copy. `text` is plain text and is escaped: use it for
 * a value that came from a user or an environment variable.
 */
export function emailParagraph(
  text: string,
  dir: EmailDirection = 'ltr'
): string {
  return emailRichParagraph(escapeEmailHtml(text), dir);
}

/**
 * The same paragraph, for HTML that is already trusted — a catalog string
 * with its `<br />` and its parameters escaped on the way in.
 */
export function emailRichParagraph(
  html: string,
  dir: EmailDirection = 'ltr'
): string {
  return `
<tr>
  <td class="cf-ink" align="${startEdge(dir)}" style="padding: 16px 24px 0 24px; font-family: ${EMAIL_SANS}; font-size: 16px; font-weight: 400; line-height: 25px; color: ${EMAIL_COLORS.ink}; text-align: ${startEdge(dir)}; word-break: break-word;">${html}</td>
</tr>`;
}

/**
 * A short label above a value block — the field name in a details list.
 */
export function emailLabel(text: string, dir: EmailDirection = 'ltr'): string {
  return `
<tr>
  <td class="cf-ink-muted" align="${startEdge(dir)}" style="padding: 20px 24px 0 24px; font-family: ${EMAIL_MONO}; font-size: 12px; font-weight: 600; letter-spacing: 0.04em; line-height: 16px; color: ${EMAIL_COLORS.inkMuted}; text-transform: uppercase; text-align: ${startEdge(dir)};">${escapeEmailHtml(text)}</td>
</tr>`;
}

/**
 * An address, a name, an identifier — anything that must be read character by
 * character and may be longer than the card. Monospace on the subtle surface,
 * broken inside 600px rather than stretching the email.
 */
export function emailValue(value: string, dir: EmailDirection = 'ltr'): string {
  return `
<tr>
  <td style="padding: 8px 24px 0 24px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse: collapse; width: 100%;">
      <tr>
        <td class="cf-value cf-ink" align="${startEdge(dir)}" style="padding: 12px 14px 12px 14px; background-color: ${EMAIL_COLORS.surfaceSubtle}; border: 1px solid ${EMAIL_COLORS.border}; border-radius: 8px; font-family: ${EMAIL_MONO}; font-size: 14px; font-weight: 400; line-height: 21px; color: ${EMAIL_COLORS.ink}; word-break: break-all; text-align: ${startEdge(dir)};">${escapeEmailHtml(value)}</td>
      </tr>
    </table>
  </td>
</tr>`;
}

export interface EmailActionOptions {
  /** The words on the button. */
  label: string;
  /** Where it goes. Also printed underneath as plain text. */
  url: string;
  /**
   * The line introducing the plain-text copy of the URL — pass the translated
   * `email_action_fallback_hint`. Omit it only for a second action under a
   * first one that already carries the line.
   */
  fallbackHint?: string;
  dir?: EmailDirection;
}

/**
 * The action: a filled button, and under it the same URL as selectable text.
 *
 * The button is a `<td>` with the fill and a block-level `<a>` inside it, not
 * a styled link — that is what survives a client stripping link styling, and
 * the 46px it comes to (13px padding either side of a 20px line) clears the
 * 44px touch target.
 */
export function emailAction(options: EmailActionOptions): string {
  const dir = options.dir ?? 'ltr';
  const url = escapeEmailHtml(options.url);
  const align = startEdge(dir);

  return `
<tr>
  <td align="${align}" style="padding: 24px 24px 0 24px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="${align}" style="border-collapse: collapse;">
      <tr>
        <td class="cf-btn" align="center" style="background-color: ${EMAIL_COLORS.accent}; border-radius: 8px;">
          <a class="cf-btn-label" href="${url}" style="display: inline-block; padding: 13px 28px 13px 28px; font-family: ${EMAIL_SANS}; font-size: 16px; font-weight: 600; line-height: 20px; color: ${EMAIL_COLORS.accentInk}; text-decoration: none;">${escapeEmailHtml(options.label)}</a>
        </td>
      </tr>
    </table>
  </td>
</tr>${
    options.fallbackHint
      ? `
<tr>
  <td class="cf-ink-muted" align="${align}" style="padding: 20px 24px 0 24px; font-family: ${EMAIL_SANS}; font-size: 13px; font-weight: 400; line-height: 20px; color: ${EMAIL_COLORS.inkMuted}; text-align: ${align};">${escapeEmailHtml(options.fallbackHint)}</td>
</tr>`
      : ''
  }
<tr>
  <td align="${align}" style="padding: 6px 24px 0 24px; text-align: ${align};">
    <a class="cf-link" href="${url}" dir="ltr" style="font-family: ${EMAIL_MONO}; font-size: 13px; line-height: 20px; color: ${EMAIL_COLORS.accent}; text-decoration: underline; word-break: break-all; unicode-bidi: isolate;">${url}</a>
  </td>
</tr>`;
}

/**
 * The whole body of the commonest email there is: a paragraph, then one
 * button with its fallback address underneath.
 *
 * Six call sites across three services were writing the same two calls in the
 * same order; this is that shape named once. It takes translated text rather
 * than catalog keys because this file has no imports — see the note at the
 * top — so the caller does the four lookups and this decides the layout.
 */
export function emailActionBody(options: {
  intro: string;
  label: string;
  url: string;
  fallbackHint: string;
  dir?: EmailDirection;
}): string {
  const dir = options.dir ?? 'ltr';
  return (
    emailRichParagraph(options.intro, dir) +
    emailAction({
      label: options.label,
      url: options.url,
      fallbackHint: options.fallbackHint,
      dir,
    })
  );
}

/**
 * A second, quieter action for the rare email that carries two — the internal
 * agency review, where approve and decline are equal choices and only one of
 * them may wear the accent.
 */
export function emailQuietAction(options: EmailActionOptions): string {
  const dir = options.dir ?? 'ltr';
  const url = escapeEmailHtml(options.url);
  const align = startEdge(dir);

  return `
<tr>
  <td align="${align}" style="padding: 12px 24px 0 24px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="${align}" style="border-collapse: collapse;">
      <tr>
        <td class="cf-quiet" align="center" style="background-color: ${EMAIL_COLORS.surfaceSubtle}; border: 1px solid ${EMAIL_COLORS.borderStrong}; border-radius: 8px;">
          <a class="cf-quiet-label" href="${url}" style="display: inline-block; padding: 12px 27px 12px 27px; font-family: ${EMAIL_SANS}; font-size: 16px; font-weight: 600; line-height: 20px; color: ${EMAIL_COLORS.ink}; text-decoration: none;">${escapeEmailHtml(options.label)}</a>
        </td>
      </tr>
    </table>
  </td>
</tr>
<tr>
  <td align="${align}" style="padding: 6px 24px 0 24px; text-align: ${align};">
    <a class="cf-link" href="${url}" dir="ltr" style="font-family: ${EMAIL_MONO}; font-size: 13px; line-height: 20px; color: ${EMAIL_COLORS.accent}; text-decoration: underline; word-break: break-all; unicode-bidi: isolate;">${url}</a>
  </td>
</tr>`;
}

/**
 * The `Cf` mark: a bordered cell with the atomic number and the letters, the
 * same construction the interface uses and for the same reason — it renders
 * from text, so it survives images being switched off. Kept `dir="ltr"` even
 * in a right-to-left email: the mark is a mark, not a sentence.
 */
function renderMark(): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" dir="ltr" style="border-collapse: collapse;">
                    <tr>
                      <td class="cf-mark" style="width: 24px; height: 24px; border: 1px solid ${EMAIL_COLORS.signature}; border-radius: 4px; padding: 2px 3px 2px 3px; line-height: 1;">
                        <div class="cf-mark-ink" style="font-family: ${EMAIL_MONO}; font-size: 7px; font-weight: 600; line-height: 8px; color: ${EMAIL_COLORS.signature}; text-align: left;">98</div>
                        <div class="cf-mark-ink" style="font-family: ${EMAIL_MONO}; font-size: 11px; font-weight: 600; line-height: 12px; color: ${EMAIL_COLORS.signature}; text-align: center;">Cf</div>
                      </td>
                    </tr>
                  </table>`;
}

/**
 * The light theme, as the only stylesheet this email carries.
 *
 * Every declaration is `!important` on purpose: the dark value sits inline on
 * the same element, and an inline declaration beats a stylesheet rule of any
 * specificity. Without `!important` this block parses, matches, and changes
 * nothing at all — which looks exactly like a client that ignores the media
 * query, and is the reason this is a guarded rule rather than a convention.
 */
function lightSchemeStyles(): string {
  const l = EMAIL_COLORS_LIGHT;
  return `@media (prefers-color-scheme: light) {
  .cf-canvas { background-color: ${l.canvas} !important; }
  .cf-card { background-color: ${l.surface} !important; border-color: ${l.borderStrong} !important; }
  .cf-divider { border-bottom-color: ${l.border} !important; }
  .cf-rule { background-color: ${l.border} !important; }
  .cf-ink { color: ${l.ink} !important; }
  .cf-ink-muted { color: ${l.inkMuted} !important; }
  .cf-mark { border-color: ${l.signature} !important; }
  .cf-mark-ink { color: ${l.signature} !important; }
  .cf-btn { background-color: ${l.accent} !important; }
  .cf-btn-label { color: ${l.accentInk} !important; }
  .cf-quiet { background-color: ${l.surfaceSubtle} !important; border-color: ${l.borderStrong} !important; }
  .cf-quiet-label { color: ${l.ink} !important; }
  .cf-value { background-color: ${l.surfaceSubtle} !important; border-color: ${l.border} !important; }
  .cf-link { color: ${l.accent} !important; }
}`;
}

export interface EmailDocumentOptions {
  /** Resolved backend locale — sets `lang` and the writing direction. */
  locale: string;
  /** Also the email's subject line; rendered as the card's heading. */
  subject: string;
  /** Body rows: `<tr>` blocks from the builders above, or a caller's HTML. */
  bodyHtml: string;
  /** `EMAIL_FROM_NAME`, shown in the footer. */
  senderName: string;
  /** The translated `email_footer_notification_preferences` line. */
  footerHtml: string;
}

/**
 * Wraps a body in the card and returns a complete document.
 *
 * A whole `<html>` document, not a fragment: this is the single outermost
 * wrapper for every product email, so the `<head>` here is the only one there
 * should be. `color-scheme` names both themes, because the email really does
 * carry both — telling a client `dark` only would invite it to invert the
 * light half by itself. Clients that read neither meta tag still get a
 * readable email, because the dark theme is complete inline.
 *
 * `bodyHtml` is trusted HTML by contract — the same contract `sendEmailSync`
 * has always had with its callers. `subject` is treated as text and escaped.
 */
export function renderEmailDocument(options: EmailDocumentOptions): string {
  const dir = emailDirection(options.locale);
  const align = startEdge(dir);
  const subject = escapeEmailHtml(options.subject);
  const lang = escapeEmailHtml(options.locale.replace('_', '-'));
  const markSpacing = dir === 'rtl' ? 'padding-right: 12px' : 'padding-left: 12px';

  return `<!doctype html>
<html lang="${lang}" dir="${dir}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light dark" />
<meta name="supported-color-schemes" content="light dark" />
<title>${subject}</title>
<style>
${lightSchemeStyles()}
</style>
</head>
<body class="cf-canvas" style="margin: 0; padding: 0; background-color: ${EMAIL_COLORS.canvas};">
<table class="cf-canvas" role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" dir="${dir}" style="border-collapse: collapse; background-color: ${EMAIL_COLORS.canvas}; margin: 0; padding: 0;">
  <tr>
    <td class="cf-canvas" align="center" style="padding: 24px 16px 24px 16px; background-color: ${EMAIL_COLORS.canvas};">

      <table class="cf-card" role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" dir="${dir}" style="border-collapse: collapse; width: 100%; max-width: 600px; background-color: ${EMAIL_COLORS.surface}; border: 1px solid ${EMAIL_COLORS.borderStrong}; border-radius: 8px;">

        <tr>
          <td class="cf-divider" align="${align}" style="padding: 20px 24px 20px 24px; border-bottom: 1px solid ${EMAIL_COLORS.border};">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" dir="${dir}" style="border-collapse: collapse;">
              <tr>
                <td valign="middle" style="width: 24px;">
                  ${renderMark()}
                </td>
                <td class="cf-ink" valign="middle" style="${markSpacing}; font-family: ${EMAIL_SANS}; font-size: 16px; font-weight: 600; letter-spacing: -0.01em; line-height: 24px; color: ${EMAIL_COLORS.ink};">Content&nbsp;Factory</td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td align="${align}" style="padding: 32px 24px 8px 24px;">
            <h1 class="cf-ink" style="margin: 0; font-family: ${EMAIL_SANS}; font-size: 26px; font-weight: 650; letter-spacing: -0.02em; line-height: 32px; color: ${EMAIL_COLORS.ink}; text-align: ${align}; word-break: break-word;">${subject}</h1>
          </td>
        </tr>
${styleBareLinks(options.bodyHtml)}

        <tr>
          <td style="padding: 32px 24px 0 24px;">
            <div class="cf-rule" style="height: 1px; line-height: 1px; font-size: 0; background-color: ${EMAIL_COLORS.border};">&nbsp;</div>
          </td>
        </tr>

        <tr>
          <td align="${align}" style="padding: 20px 24px 24px 24px;">
            <div class="cf-ink-muted" style="font-family: ${EMAIL_MONO}; font-size: 12px; font-weight: 600; letter-spacing: 0.04em; line-height: 16px; color: ${EMAIL_COLORS.inkMuted}; text-transform: uppercase; text-align: ${align};">${escapeEmailHtml(options.senderName)}</div>
            <div class="cf-ink-muted" style="padding-top: 6px; font-family: ${EMAIL_SANS}; font-size: 13px; font-weight: 400; line-height: 20px; color: ${EMAIL_COLORS.inkMuted}; text-align: ${align};">${styleBareLinks(options.footerHtml)}</div>
          </td>
        </tr>

      </table>

    </td>
  </tr>
</table>
</body>
</html>`;
}

/**
 * A body that is not built from the blocks above — a digest message, a
 * notification, any caller still handing over a fragment of its own. Wrapped
 * in one body row so it lands inside the card with the right colour and
 * measure instead of leaking out of the table.
 */
export function wrapLooseBody(
  html: string,
  dir: EmailDirection = 'ltr'
): string {
  return emailRichParagraph(html, dir);
}
