const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

/**
 * Typography that does not come from the ten tokens.
 *
 * `DESIGN.md` declares ten and `docs/design/component-authoring-rules.md` says
 * ten, not more: each carries family, size, weight, leading and tracking at
 * once and is not taken apart into separate utilities. The shipped product
 * disagreed with both — 62 uses of the token classes against some 590 sizes and
 * weights typed by hand, and no guard could see the difference, because the
 * existing style guard only checks that the monospaced tokens keep their face.
 *
 * So this is a ledger rather than a ban. It fails on `added` — a new hand-typed
 * size — and on `stale` — a line that is owed to a file which has since been
 * migrated, so the list cannot rot into a permission slip nobody reviewed. The
 * total only goes down.
 *
 * Nothing is exempt, including the provider previews. A LinkedIn or TikTok
 * preview has to look like the external platform, so it will keep its hand-set
 * type for a long time; the ledger holds those lines rather than waving them
 * through, which means the count still cannot grow there either.
 */

const repositoryRoot = path.resolve(__dirname, '..');
const LEDGER_PATH = path.join(
  repositoryRoot,
  'tests/design-typography-allowlist.json'
);

const ROOTS = [
  'apps/frontend/src',
  'libraries/react-shared-libraries/src',
  'libraries/helpers/src',
];

const rootOf = (file) =>
  ROOTS.find((root) => file === root || file.startsWith(`${root}/`)) ?? null;

const sourceFiles = (directory) =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(entryPath);
    return /\.(tsx|jsx)$/.test(entry.name) ? [entryPath] : [];
  });

/** Same AST walk the geometry ledger uses: strings and template fragments. */
const literalFragments = (file, source) => {
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.ES2022,
    true,
    file.endsWith('.jsx') ? ts.ScriptKind.JSX : ts.ScriptKind.TSX
  );
  const fragments = [];
  const visit = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      fragments.push(node.text);
      return;
    }
    if (ts.isTemplateExpression(node)) {
      fragments.push(node.head.text);
      for (const span of node.templateSpans) {
        visit(span.expression);
        fragments.push(span.literal.text);
      }
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return fragments;
};

const SIZE_SCALE = 'xs|sm|base|lg|xl|[2-9]xl';
const WEIGHTS =
  'thin|extralight|light|normal|medium|semibold|bold|extrabold|black';
const LEADING = 'none|tight|snug|normal|relaxed|loose|[0-9]+';
const TRACKING = 'tighter|tight|normal|wide|wider|widest';

/**
 * A `text-[…]` payload is a size only when it carries a length. `text-[#fff]`
 * is a colour and belongs to the hex rule; `text-[14px]` is a type size and
 * belongs here.
 */
const isLength = (payload) => /(?:\d|\.)(?:px|rem|em|pt|ch|ex)\b/.test(payload);

/**
 * Arbitrary-property syntax — `[font-size:14px]` — sets the same thing by a
 * different spelling, and would have walked straight past a check that only
 * knew `text-[…]`.
 */
const ARBITRARY_PROPERTY = new RegExp(
  `\\[(font-size|font-weight|line-height|letter-spacing):[^\\]]+\\]`,
  'g'
);

const OFF_TOKEN_PATTERNS = [
  { kind: 'arbitrary-property', re: ARBITRARY_PROPERTY },
  { kind: 'size', re: new RegExp(`(?<![\\w-])text-\\[([^\\]]+)\\]`, 'g'), guard: isLength },
  { kind: 'size', re: new RegExp(`(?<![\\w-])text-(?:${SIZE_SCALE})(?![\\w-])`, 'g') },
  {
    kind: 'weight',
    re: new RegExp(`(?<![\\w-])font-\\[([^\\]]+)\\]`, 'g'),
    guard: (payload) => /^\d+$/.test(payload.trim()),
  },
  { kind: 'weight', re: new RegExp(`(?<![\\w-])font-(?:${WEIGHTS})(?![\\w-])`, 'g') },
  { kind: 'leading', re: new RegExp(`(?<![\\w-])leading-\\[([^\\]]+)\\]`, 'g') },
  { kind: 'leading', re: new RegExp(`(?<![\\w-])leading-(?:${LEADING})(?![\\w-])`, 'g') },
  { kind: 'tracking', re: new RegExp(`(?<![\\w-])tracking-\\[([^\\]]+)\\]`, 'g') },
  { kind: 'tracking', re: new RegExp(`(?<![\\w-])tracking-(?:${TRACKING})(?![\\w-])`, 'g') },
];

const offTokenTypography = (fragment) => {
  const found = [];
  for (const { re, guard } of OFF_TOKEN_PATTERNS) {
    re.lastIndex = 0;
    for (const match of fragment.matchAll(re)) {
      if (guard && !guard(match[1] ?? '')) continue;
      found.push(match[0]);
    }
  }
  return found;
};

const collect = () => {
  const occurrences = new Map();
  for (const root of ROOTS) {
    for (const filePath of sourceFiles(path.join(repositoryRoot, root))) {
      const file = path.relative(repositoryRoot, filePath);
      const source = fs.readFileSync(filePath, 'utf8');
      for (const fragment of literalFragments(file, source)) {
        for (const value of offTokenTypography(fragment)) {
          const key = `${file}\0${value}`;
          occurrences.set(key, (occurrences.get(key) ?? 0) + 1);
        }
      }
    }
  }
  return occurrences;
};

describe('Content Factory typography ledger', () => {
  test('adds no typography outside the ten tokens and shrinks its exact debt ledger', () => {
    const ledger = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
    const actual = collect();
    const invalid = [];
    const added = [];
    const stale = [];

    const sections = ledger.sections ?? {};
    const declaredRoots = Object.keys(sections).sort();
    if (declaredRoots.join('\n') !== [...ROOTS].sort().join('\n')) {
      invalid.push(
        `ledger sections must cover exactly the scanned roots, received ${declaredRoots.join(', ')}`
      );
    }

    const allowed = new Map();
    let declaredSectionTotal = 0;

    for (const [root, section] of Object.entries(sections)) {
      let counted = 0;
      for (const [file, values] of Object.entries(section.allowances ?? {})) {
        // A section accounts for its own root only, so a component that moves
        // between the app and the library shows up as `stale` in one and
        // `added` in the other rather than quietly staying level.
        if (rootOf(file) !== root) {
          invalid.push(`${file}: allowance is filed under ${root}, which does not own it`);
          continue;
        }
        for (const [value, count] of Object.entries(values)) {
          if (!Number.isInteger(count) || count <= 0) {
            invalid.push(`${file}: ${value} must allow a positive whole number`);
            continue;
          }
          allowed.set(`${file}\0${value}`, count);
          counted += count;
        }
      }
      if (section.total !== counted) {
        invalid.push(`${root}: section declares ${section.total}, allowances hold ${counted}`);
      }
      declaredSectionTotal += section.total ?? 0;
    }

    if (declaredSectionTotal !== ledger.total) {
      invalid.push(
        `sections declare ${declaredSectionTotal} in total, ledger declares ${ledger.total}`
      );
    }

    for (const [key, count] of actual) {
      const budget = allowed.get(key) ?? 0;
      if (count > budget) {
        const [file, value] = key.split('\0');
        added.push(`${file}: ${value} occurs ${count} time(s), allowed ${budget}`);
      }
    }

    for (const [key, budget] of allowed) {
      const count = actual.get(key) ?? 0;
      if (count < budget) {
        const [file, value] = key.split('\0');
        stale.push(`${file}: ${value} occurs ${count} time(s), allowed ${budget}`);
      }
    }

    const actualTotal = [...actual.values()].reduce((sum, n) => sum + n, 0);

    expect({
      invalid,
      added: added.sort(),
      stale: stale.sort(),
      fix: 'use one of the cf-* typography tokens',
    }).toEqual({
      invalid: [],
      added: [],
      stale: [],
      fix: 'use one of the cf-* typography tokens',
    });

    // The ledger may only ever describe less than it did.
    expect(actualTotal).toBeLessThanOrEqual(ledger.total);
  });

  test('recognises a hand-typed size, weight, leading and tracking', () => {
    // The collector is the whole guard. If it stops matching, the ledger goes
    // green by measuring nothing.
    expect(offTokenTypography('text-[14px] font-[600]')).toEqual([
      'text-[14px]',
      'font-[600]',
    ]);
    expect(offTokenTypography('text-sm font-bold')).toEqual([
      'text-sm',
      'font-bold',
    ]);
    expect(offTokenTypography('leading-[1.7] tracking-[0.08em]')).toEqual([
      'leading-[1.7]',
      'tracking-[0.08em]',
    ]);
  });

  test('sees the arbitrary-property spelling of the same thing', () => {
    expect(offTokenTypography('[font-size:14px] [font-weight:600]')).toEqual([
      '[font-size:14px]',
      '[font-weight:600]',
    ]);
  });

  test('does not see type set from an inline style object', () => {
    // Recorded rather than fixed. `style={{ fontSize: 14 }}` never reaches a
    // class string, so this scanner cannot see it, and `ChannelMark` uses
    // exactly that to hold the 13px-on-32px proportion — which is why it is
    // absent from the ledger. Closing this needs an AST pass over JSX
    // attributes, not another regular expression.
    expect(offTokenTypography('style={{ fontSize: 14 }}')).toEqual([]);
  });

  test('leaves colour, alignment and family to the rules that own them', () => {
    expect(offTokenTypography('text-cf-ink text-center text-start')).toEqual([]);
    expect(offTokenTypography('text-[#ffffff]')).toEqual([]);
    expect(offTokenTypography('font-mono font-sans')).toEqual([]);
    // The tokens themselves are the answer, not the offence.
    expect(offTokenTypography('cf-body-sm cf-label-md cf-caption')).toEqual([]);
  });
});

/**
 * The one marketing size.
 *
 * A landing hero is the single place in this product that legitimately needs
 * type above the 32px the work scale stops at, and there are exactly two ways
 * to give it one: a hand-typed size inside a component — which the ledger above
 * refuses, and rightly — or a named token in the canonical layer. This holds
 * the second answer to the same standard as the ten: it is declared where they
 * are declared, it carries family, size, weight, leading and tracking together,
 * and it is spent only on the public landing. A work screen reaching for it is
 * the failure this guards against, because that is how a marketing size becomes
 * the product's tenth heading level by accident.
 */
const PRODUCT_TOKENS = [
  '.cf-heading-xl',
  '.cf-heading-lg',
  '.cf-heading-md',
  '.cf-body-lg',
  '.cf-body-md',
  '.cf-body-sm',
  '.cf-label-md',
  '.cf-label-sm',
  '.cf-caption',
  '.cf-display-num',
];

const MARKETING_TOKEN = '.cf-display-xl';

/** The measurement token has to stay on the monospaced face to do its job. */
const MEASUREMENT_TOKEN = '.cf-display-num';

/** The typography components the Tailwind config actually registers. */
const declaredTypographyTokens = () => {
  const config = require(path.join(
    repositoryRoot,
    'apps/frontend/tailwind.config.cjs'
  ));
  const declared = {};
  for (const plugin of config.plugins ?? []) {
    const handler = typeof plugin === 'function' ? plugin : plugin?.handler;
    if (typeof handler !== 'function') continue;
    try {
      handler({
        addComponents: (components) => {
          for (const [name, body] of Object.entries(components)) {
            if (/^\.cf-(display|heading|body|label|caption)/.test(name)) {
              declared[name] = body;
            }
          }
        },
        addUtilities: () => {},
        addBase: () => {},
        addVariant: () => {},
        matchUtilities: () => {},
        e: (value) => value,
        theme: (key) => (key === 'screens.md' ? '768px' : undefined),
      });
    } catch {
      // Other plugins in this config need a fuller Tailwind context than this
      // stub gives them. Only the typography layer matters here.
    }
  }
  return declared;
};

/**
 * The measured number.
 *
 * `display-num` is the tenth product token and the third monospaced one. It
 * exists because a screen whose subject is a measurement — characters
 * collected, average sentence length, the value of a style scale — was setting
 * that number in `heading-xl`, where Geologica reads it as a title and its
 * proportional digits shift the whole line every time the figure is recomputed.
 * A monospaced face at the same 32px reads as an instrument, and its digits do
 * not move.
 *
 * Two things are guarded here rather than left to review. It has to be
 * monospaced, because a sans family on it turns the measurement back into a
 * heading and buys nothing. And it has to be a product token, not a second
 * marketing size: it is declared beside the other nine, carries the whole decision at
 * once, and is free to appear on work screens — which is the entire difference
 * between it and `cf-display-xl`.
 */
describe('Content Factory measurement display token', () => {
  test('declares display-num on the monospaced face at the top of the product scale', () => {
    const declared = declaredTypographyTokens();
    const measurement = declared[MEASUREMENT_TOKEN];

    expect(measurement).toMatchObject({
      fontFamily: expect.stringContaining('--font-cf-mono'),
      fontSize: '32px',
      fontWeight: '600',
      lineHeight: '1.1',
    });

    // A sans family would make it `heading-xl` with extra steps.
    expect(measurement.fontFamily).not.toContain('--font-cf-sans');

    // It is a measurement, so it sits at the top of the product scale rather
    // than above it: same size as the largest heading, different face.
    expect(measurement.fontSize).toBe(declared['.cf-heading-xl'].fontSize);

    // No breakpoint. 32px fits 390px; the marketing token needed one because
    // 56px does not, and that is a difference worth keeping visible.
    expect(measurement['@media (min-width: 768px)']).toBeUndefined();
  });
});

describe('Content Factory marketing display token', () => {
  test('declares one named marketing size beside the ten product tokens', () => {
    const declared = declaredTypographyTokens();

    expect(Object.keys(declared).sort()).toEqual(
      [...PRODUCT_TOKENS, MARKETING_TOKEN].sort()
    );

    const display = declared[MARKETING_TOKEN];
    // A token carries the whole decision, not a size on its own — that is the
    // rule the ten follow and the reason they are components rather than a
    // `fontSize` scale entry.
    expect(display).toMatchObject({
      fontFamily: expect.stringContaining('--font-cf-sans'),
      fontSize: '36px',
      fontWeight: '650',
      lineHeight: expect.any(String),
      letterSpacing: expect.any(String),
    });

    // 56px on a 390px screen is an overflow, not a heading. The token owns the
    // breakpoint so no call site has to retype it.
    const responsive = display['@media (min-width: 768px)'];
    expect(responsive).toMatchObject({ fontSize: '56px' });

    // It has to be bigger than the largest product heading, or it is not a
    // display size and the extension bought nothing.
    expect(Number.parseInt(responsive.fontSize, 10)).toBeGreaterThan(
      Number.parseInt(declared['.cf-heading-xl'].fontSize, 10)
    );
  });

  test('spends the marketing size on the public landing and nowhere else', () => {
    const users = [];
    for (const root of ROOTS) {
      for (const filePath of sourceFiles(path.join(repositoryRoot, root))) {
        const file = path.relative(repositoryRoot, filePath);
        const source = fs.readFileSync(filePath, 'utf8');
        for (const fragment of literalFragments(file, source)) {
          if (/(?:^|\s)cf-display-xl(?:\s|$)/.test(fragment)) {
            users.push(file);
            break;
          }
        }
      }
    }

    expect(users.length).toBeGreaterThan(0);
    expect(
      users.filter(
        (file) => !file.startsWith('apps/frontend/src/components/public-saas/')
      )
    ).toEqual([]);
  });
});
