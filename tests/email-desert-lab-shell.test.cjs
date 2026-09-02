const fs = require('node:fs');
const path = require('node:path');
const { loadTypeScriptModule, repositoryRoot } = require('./helpers/load-ts-module.cjs');

/**
 * The wrapper every product email is rendered into
 * (`libraries/nestjs-libraries/src/emails/email.template.ts`), against the
 * accepted design in `docs/design/desert-lab/email/` and against what mail
 * clients actually do with HTML.
 *
 * The wrapper it replaced was written for a browser: a CSS gradient, a flex
 * row, `backdrop-filter`, a shadow, sizes in `rem`. Outlook on Windows lays
 * email out with the Word engine and renders none of that, and mobile Gmail
 * throws `<head>` away, so a stylesheet cannot rescue the dark theme. These
 * tests hold the two rules that follow from that — table markup, and every
 * visible property inline on its own element — because both are the kind of
 * thing a later edit undoes without noticing.
 */
const template = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/emails/email.template.ts'
);
const {
  EMAIL_COLORS,
  emailAction,
  emailDirection,
  emailLabel,
  emailQuietAction,
  emailRichParagraph,
  emailValue,
  renderEmailDocument,
  styleBareLinks,
  wrapLooseBody,
} = template;

const catalog = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/locale/backend-strings.ts'
);

function render(overrides = {}) {
  const dir = emailDirection(overrides.locale ?? 'en');
  return renderEmailDocument({
    locale: 'en',
    subject: 'Activate your account',
    bodyHtml:
      emailRichParagraph('Confirm this address.', dir) +
      emailAction({
        label: 'Activate account',
        url: 'https://factory.example.test/auth/activate/9f3c2ab1',
        fallbackHint: 'Button not working? Copy this link:',
        dir,
      }),
    senderName: 'Content Factory',
    footerHtml: catalog.translateBackendString(
      'email_footer_notification_preferences',
      'en',
      { link: 'https://factory.example.test/settings' }
    ),
    ...overrides,
  });
}

/**
 * Source with its comments removed — the guards below read what the file
 * emits, and a comment recalling what the markup used to be is not that.
 */
const readSource = (relativePath) =>
  fs
    .readFileSync(path.join(repositoryRoot, relativePath), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

describe('the shell is email markup, not page markup', () => {
  const html = render();

  // Each of these is a property Outlook's Word engine does not implement, or
  // a unit clients resolve inconsistently. The old wrapper used every one.
  test.each([
    ['a CSS gradient', /linear-gradient|radial-gradient/i],
    ['flexbox', /display\s*:\s*flex/i],
    ['backdrop-filter', /backdrop-filter/i],
    ['a shadow', /box-shadow/i],
    ['positioning', /position\s*:\s*(absolute|relative|fixed)/i],
    ['rem units', /\d\s*rem\b/i],
  ])('carries no %s', (_label, pattern) => {
    expect(html).not.toMatch(pattern);
  });

  test('lays the card out with tables', () => {
    expect(html).toMatch(/<table[^>]+role="presentation"/);
  });

  test('loads nothing from anywhere: no image, no external font, no pixel', () => {
    expect(html).not.toMatch(/<img\b/i);
    expect(html).not.toMatch(/@font-face/i);
    expect(html).not.toMatch(/src\s*=\s*"https?:/i);
    expect(html).not.toMatch(/<link\b/i);
  });

  test('tells a client that reads it that the email carries both themes', () => {
    expect(html).toContain('<meta name="color-scheme" content="light dark" />');
    expect(html).toContain(
      '<meta name="supported-color-schemes" content="light dark" />'
    );
  });

  test('is one document, not a document inside a document', () => {
    expect(html.match(/<html\b/gi)).toHaveLength(1);
    expect(html.match(/<head\b/gi)).toHaveLength(1);
    expect(html.match(/<body\b/gi)).toHaveLength(1);
  });

});

/**
 * The light theme is the one thing here that lives in a stylesheet, and it is
 * allowed to because it is an addition: the dark email underneath it is whole
 * without it. Three ways this goes wrong quietly, one test each — the block
 * missing, a declaration losing its `!important` (an inline style then wins
 * and the light theme does nothing at all, while looking like a client that
 * ignores the media query), and the dark values migrating out of the inline
 * attributes into the stylesheet, which mobile Gmail throws away.
 */
describe('the light theme is an addition, never the only copy', () => {
  const html = render();
  const styleBlock = html.match(/<style>([\s\S]*?)<\/style>/i);

  test('there is exactly one stylesheet and it is the light scheme', () => {
    expect(html.match(/<style\b/gi)).toHaveLength(1);
    expect(styleBlock).not.toBeNull();
    expect(styleBlock[1]).toContain('@media (prefers-color-scheme: light)');
  });

  test('every declaration in it is !important, or an inline style beats it', () => {
    const declarations = [
      ...styleBlock[1].matchAll(/([a-z-]+)\s*:\s*([^;{}]+);/g),
    ].map((m) => `${m[1]}: ${m[2].trim()}`);

    expect(declarations.length).toBeGreaterThan(10);
    expect(declarations.filter((d) => !d.includes('!important'))).toEqual([]);
  });

  test('it repaints through classes the markup actually carries', () => {
    // Against an email that uses every block there is, so a selector for
    // something only the agency review draws is checked too.
    const everyBlock = render({
      bodyHtml:
        emailRichParagraph('A paragraph.', 'ltr') +
        emailLabel('Website', 'ltr') +
        emailValue('https://example.test', 'ltr') +
        emailAction({
          label: 'Approve',
          url: 'https://example.test/approve',
          fallbackHint: 'Copy this link:',
        }) +
        emailQuietAction({
          label: 'Decline',
          url: 'https://example.test/decline',
        }),
    });
    const selectors = [...styleBlock[1].matchAll(/\.([a-z-]+)\s*\{/g)].map(
      (m) => m[1]
    );
    expect(selectors.length).toBeGreaterThan(10);
    const absent = selectors.filter(
      (name) => !new RegExp(`class="[^"]*\\b${name}\\b`).test(everyBlock)
    );
    expect(absent).toEqual([]);
  });

  test('the light palette is the one from the design tokens', () => {
    // `signature` is the trap: the light theme's ochre is the darker #9C6A16,
    // not the dark theme's #C8922A, which on the light card is unreadable.
    expect(template.EMAIL_COLORS_LIGHT.signature).toBe('#9C6A16');
    expect(template.EMAIL_COLORS_LIGHT.accentInk).toBe('#FFFFFF');
    expect(template.EMAIL_COLORS.accentInk).toBe('#0F1409');
    expect(styleBlock[1]).toContain('#9C6A16');
    expect(styleBlock[1]).not.toContain('#C8922A');
  });

  test('throwing the stylesheet away still leaves a whole dark email', () => {
    const withoutHead = html.replace(/<head>[\s\S]*?<\/head>/i, '');
    for (const value of [
      EMAIL_COLORS.canvas,
      EMAIL_COLORS.surface,
      EMAIL_COLORS.ink,
      EMAIL_COLORS.inkMuted,
      EMAIL_COLORS.accent,
      EMAIL_COLORS.accentInk,
      EMAIL_COLORS.signature,
      EMAIL_COLORS.border,
      EMAIL_COLORS.borderStrong,
    ]) {
      expect(withoutHead).toContain(value);
    }
    // …and none of the light values are inline, which would mean the two
    // themes had been swapped over.
    expect(withoutHead).not.toContain(template.EMAIL_COLORS_LIGHT.canvas);
    expect(withoutHead).not.toContain(template.EMAIL_COLORS_LIGHT.surface);
  });
});

/**
 * A client stripping `<head>` and a client repainting colours by heuristic
 * both come to the same requirement: colour lives on the element that shows
 * the text, never on an ancestor.
 */
test('every element that sets a type size also sets its own colour', () => {
  const html = render();
  const uncoloured = [];
  for (const [, style] of html.matchAll(/style="([^"]*)"/g)) {
    if (!/font-size\s*:/.test(style)) continue;
    // `font-size: 0` is the hairline divider — it shows no text to colour.
    if (/font-size\s*:\s*0\b/.test(style)) continue;
    if (!/(^|[;\s])color\s*:/.test(style)) uncoloured.push(style);
  }
  expect(uncoloured).toEqual([]);
});

test('the Cf mark is drawn from text, so images being off costs nothing', () => {
  const html = render();
  expect(html).toContain('>Cf</div>');
  expect(html).toContain('>98</div>');
  expect(html).toMatch(/border:\s*1px solid #C8922A/);
});

describe('the action', () => {
  const html = render();

  test('is a filled button, not a bare link on the background', () => {
    expect(html).toMatch(
      /<td class="cf-btn" align="center" style="background-color: #7FB03A; border-radius: 8px;">/
    );
    expect(html).toContain('color: #0F1409; text-decoration: none;');
  });

  test('leaves the same address behind as plain text', () => {
    const occurrences = html.match(
      /https:\/\/factory\.example\.test\/auth\/activate\/9f3c2ab1/g
    );
    // Once as the button's href, once as the fallback href, once as its text.
    expect(occurrences).toHaveLength(3);
    expect(html).toContain('Button not working? Copy this link:');
  });

  test('escapes a URL instead of letting it close the attribute', () => {
    const injected = emailAction({
      label: 'Go',
      url: 'https://example.test/" onmouseover="alert(1)',
      fallbackHint: 'hint',
    });
    expect(injected).not.toContain('onmouseover="alert(1)"');
    expect(injected).toContain('&quot; onmouseover=&quot;alert(1)');
  });
});

test('a subject with markup in it is shown, not run', () => {
  const html = render({ subject: 'Team <script>alert(1)</script> & co' });
  expect(html).not.toContain('<script>');
  expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; co');
});

describe('right-to-left is a mirrored layout, not a translated one', () => {
  test('Hebrew and Arabic resolve to rtl, everything else to ltr', () => {
    expect(emailDirection('he')).toBe('rtl');
    expect(emailDirection('ar')).toBe('rtl');
    expect(emailDirection('ru')).toBe('ltr');
    expect(emailDirection(undefined)).toBe('ltr');
  });

  test('the document and its cells turn around', () => {
    const html = render({ locale: 'he', subject: 'הפעילו את החשבון' });
    expect(html).toContain('<html lang="he" dir="rtl">');
    expect(html).toContain('text-align: right;');
    expect(html).toContain('padding-right: 12px');
    // The only thing still left-aligned is the atomic number in the corner of
    // the `Cf` mark: a mark is a mark, it does not mirror with the sentence.
    expect(html.match(/text-align: left;/g)).toHaveLength(1);
  });

  test('the URL under the button stays left-to-right inside the mirrored cell', () => {
    const html = emailAction({
      label: 'הפעלת החשבון',
      url: 'https://factory.example.test/a/1',
      fallbackHint: 'העתיקו את הקישור',
      dir: 'rtl',
    });
    expect(html).toContain('dir="ltr"');
    expect(html).toContain('unicode-bidi: isolate');
  });
});

describe('a body that was not built from these blocks still lands inside the card', () => {
  test('finished rows are passed through untouched', () => {
    const rows = emailValue('reader@example.test', 'ltr');
    expect(render({ bodyHtml: rows })).toContain('reader@example.test');
    expect(rows.trim().startsWith('<tr')).toBe(true);
  });

  test('a loose fragment is wrapped in one body row', () => {
    const wrapped = wrapLooseBody('First item<br />Second item', 'ltr');
    expect(wrapped.trim().startsWith('<tr')).toBe(true);
    expect(wrapped).toContain('First item<br />Second item');
    expect(wrapped).toContain('color: #ECEBDF');
  });

  test('a link with no style of its own is given the accent, not the client default', () => {
    const styled = styleBareLinks('go <a href="https://example.test">here</a>');
    expect(styled).toContain('color: #7FB03A; text-decoration: underline;');
  });

  test('a link that already has a style keeps it', () => {
    const button = emailAction({
      label: 'Go',
      url: 'https://example.test',
      fallbackHint: 'hint',
    });
    expect(styleBareLinks(button)).toBe(button);
  });
});

test('a long address wraps inside the card instead of stretching it', () => {
  const html = emailValue(
    'maslennikov.igor.workspace@sluzhba-podderzhki.example.test',
    'ltr'
  );
  expect(html).toContain('word-break: break-all');
});

/**
 * Source-level, because the failure these catch is a whole email written the
 * old way beside the new shell rather than a wrong value inside it.
 */
describe('no caller builds its own email around the shared one', () => {
  const callers = [
    'libraries/nestjs-libraries/src/services/email.service.ts',
    'libraries/nestjs-libraries/src/database/prisma/agencies/agencies.service.ts',
    'libraries/nestjs-libraries/src/database/prisma/organizations/organization.service.ts',
  ];

  test.each(callers)('%s opens no document of its own', (relativePath) => {
    const source = readSource(relativePath);
    expect(source).not.toMatch(/<html\b/i);
    expect(source).not.toMatch(/<head\b/i);
    expect(source).not.toMatch(/<body\b/i);
  });

  test.each(callers)('%s carries no browser-only styling', (relativePath) => {
    const source = readSource(relativePath);
    expect(source).not.toMatch(/linear-gradient/i);
    expect(source).not.toMatch(/backdrop-filter/i);
    expect(source).not.toMatch(/display\s*:\s*flex/i);
    expect(source).not.toMatch(/box-shadow/i);
  });
});
