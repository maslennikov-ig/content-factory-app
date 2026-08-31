const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { execFileSync } = require('node:child_process');

const repositoryRoot = path.resolve(__dirname, '..');

const COLORS_SCSS = 'apps/frontend/src/app/colors.scss';
const TAILWIND_CONFIG = 'apps/frontend/tailwind.config.cjs';
const PAIRS_TABLE = 'docs/design/desert-lab/contrast-pairs.md';

/**
 * The table is the contract, so its shape is asserted rather than assumed: a
 * silently renamed role or a dropped row would otherwise turn this suite green
 * while checking nothing.
 */
const EXPECTED_PAIR_COUNT = 47;
const INFORMATIVE = 'инф.';

const read = (relative) =>
  fs.readFileSync(path.join(repositoryRoot, relative), 'utf8');

/** Collects `role -> hex` for one theme block of colors.scss. */
function themePalette(scss, selector) {
  const block = new RegExp(`${selector}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(scss);
  if (!block) throw new Error(`${COLORS_SCSS} has no ${selector} block`);

  const palette = {};
  for (const [, name, value] of block[1].matchAll(
    /(--cf-[a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g
  )) {
    palette[name.slice('--cf-'.length)] = value.toUpperCase();
  }
  return palette;
}

/** Parses the five-column table of `contrast-pairs.md`. */
function contrastPairs(markdown) {
  return markdown
    .split('\n')
    .filter((line) => line.startsWith('|'))
    .map((line) =>
      line
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim())
    )
    .filter(
      (cells) =>
        cells.length === 5 &&
        cells[0] !== 'Группа' &&
        !/^-+$/.test(cells[0])
    )
    .map(([group, foreground, background, threshold, purpose]) => ({
      group,
      foreground,
      background,
      threshold: threshold === INFORMATIVE ? null : Number(threshold),
      purpose,
    }));
}

// WCAG 2.x relative luminance, quoted verbatim by contrast-pairs.md.
const relativeLuminance = (hex) => {
  const channels = [1, 3, 5]
    .map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
};

const contrast = (a, b) => {
  const x = relativeLuminance(a);
  const y = relativeLuminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

const scss = read(COLORS_SCSS);
const themes = {
  light: themePalette(scss, '\\.light'),
  dark: themePalette(scss, '\\.dark'),
};
const pairs = contrastPairs(read(PAIRS_TABLE));
const enforced = pairs.filter((pair) => pair.threshold !== null);
const modes = Object.keys(themes);

describe('Content Factory contrast pairs', () => {
  test(`checks the agreed ${EXPECTED_PAIR_COUNT} pairs`, () => {
    expect(pairs).toHaveLength(EXPECTED_PAIR_COUNT);
    expect(enforced.length).toBeGreaterThan(0);

    for (const pair of pairs) {
      expect([4.5, 3, null]).toContain(pair.threshold);
    }
  });

  test.each(modes)('defines every paired role in the %s theme', (mode) => {
    const roles = [
      ...new Set(pairs.flatMap((p) => [p.foreground, p.background])),
    ].sort();

    expect(roles.length).toBeGreaterThan(0);
    expect(roles.filter((role) => !(role in themes[mode]))).toEqual([]);
  });

  test.each(modes)('meets every threshold in the %s theme', (mode) => {
    const palette = themes[mode];

    const violations = enforced
      .map((pair) => ({
        ...pair,
        ratio: contrast(palette[pair.foreground], palette[pair.background]),
      }))
      .filter((pair) => pair.ratio < pair.threshold)
      .map(
        (pair) =>
          `${pair.foreground} on ${pair.background} — ` +
          `${pair.ratio.toFixed(2)}:1 < ${pair.threshold}:1 (${pair.purpose})`
      );

    expect(violations).toEqual([]);
  });
});

/**
 * The table above proves the palette is sound; it says nothing about where a
 * role is actually used. `accent-ink` is the one role whose whole meaning is
 * positional — it is the ink *on* an accent fill, dark in the dark theme and
 * white in the light one — so away from that fill it disappears into the
 * surface in both themes at once. That is how a research-source link ended up
 * at 1.11:1. This half reads the markup and checks the position.
 */

/** Resolves a Tailwind colour alias to a literal hex per theme. */
function tailwindPalette() {
  const tailwind = require(path.join(repositoryRoot, TAILWIND_CONFIG));
  const declarations = (body) => {
    const out = {};
    for (const match of body.matchAll(/(--[a-zA-Z0-9-]+):\s*([^;]+);/g)) {
      out[match[1]] = match[2].trim();
    }
    return out;
  };
  const theme = {
    light: declarations(/\.light\s*\{([\s\S]*?)\n\}/.exec(scss)[1]),
    dark: declarations(/\.dark\s*\{([\s\S]*?)\n\}/.exec(scss)[1]),
  };
  const bridge = declarations(
    /\.light,\s*\n\.dark\s*\{([\s\S]*?)\n\}/.exec(scss)[1]
  );

  const resolve = (value, mode, depth = 0) => {
    if (depth > 8) return null;
    const text = String(value).trim();
    const hex = /^#([0-9a-fA-F]{6})\b/.exec(text);
    if (hex) return `#${hex[1]}`;
    const reference = /^var\(\s*(--[a-zA-Z0-9-]+)/.exec(text);
    if (!reference) return null;
    const next =
      reference[1] in theme[mode] ? theme[mode][reference[1]] : bridge[reference[1]];
    return next === undefined ? null : resolve(next, mode, depth + 1);
  };

  const flatten = (value, prefix) => {
    const out = {};
    for (const [name, entry] of Object.entries(value)) {
      const alias = prefix ? `${prefix}-${name}` : name;
      if (typeof entry === 'string') {
        const light = resolve(entry, 'light');
        const dark = resolve(entry, 'dark');
        if (light && dark) out[alias] = { light, dark };
      } else if (entry && typeof entry === 'object') {
        Object.assign(out, flatten(entry, alias));
      }
    }
    return out;
  };
  return flatten(tailwind.theme.extend.colors, '');
}

/** Every literal fragment of one `className`, conditional branches included. */
function classNamesOf(element) {
  const parts = [];
  const collect = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      parts.push(node.text);
      return;
    }
    if (ts.isTemplateExpression(node)) {
      parts.push(node.head.text);
      for (const span of node.templateSpans) {
        parts.push(span.literal.text);
        collect(span.expression);
      }
      return;
    }
    node.forEachChild(collect);
  };
  for (const attribute of element.attributes.properties) {
    if (attribute.name?.escapedText === 'className') collect(attribute);
  }
  return parts.join(' ');
}

/** Elements carrying `token`, each with the class lists of its JSX ancestors. */
function elementsUsing(source, token) {
  const found = [];
  const walk = (node, ancestors) => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      const classes = classNamesOf(opening);
      if (new RegExp(`(^|[\\s:!])${token}(\\s|$)`).test(classes)) {
        found.push({
          line:
            source.getLineAndCharacterOfPosition(opening.getStart(source)).line +
            1,
          chain: [classes, ...ancestors],
        });
      }
      node.forEachChild((child) => walk(child, [classes, ...ancestors]));
      return;
    }
    node.forEachChild((child) => walk(child, ancestors));
  };
  walk(source, []);
  return found;
}

describe('Content Factory accent ink stays on its fill', () => {
  const aliases = tailwindPalette();

  test('resolves the bridged background aliases it relies on', () => {
    // Half the inherited markup fills with `bg-forth` or `bg-btnPrimary`
    // rather than `bg-cf-accent`. If the bridge stops resolving, every one of
    // those turns into an unjudgeable element and the guard goes quiet.
    for (const alias of ['cf-accent', 'cf-surface', 'forth', 'btnPrimary']) {
      expect(aliases[alias]).toBeDefined();
    }
    expect(aliases['forth'].dark).toBe(aliases['cf-accent'].dark);
  });

  test('never prints accent ink on a surface it cannot be read on', () => {
    const files = execFileSync(
      'grep',
      ['-rl', 'text-cf-accent-ink', 'apps/frontend/src', '--include=*.tsx'],
      { cwd: repositoryRoot, encoding: 'utf8' }
    )
      .trim()
      .split('\n')
      .filter(Boolean);

    const failures = [];
    for (const file of files) {
      const source = ts.createSourceFile(
        file,
        fs.readFileSync(path.join(repositoryRoot, file), 'utf8'),
        ts.ScriptTarget.ES2022,
        true,
        ts.ScriptKind.TSX
      );

      for (const { line, chain } of elementsUsing(source, 'text-cf-accent-ink')) {
        // The nearest ancestor that paints a background is the one the ink
        // lands on. A conditional class list offers several: `bg-cf-accent`
        // next to `bg-btnSimple` means one branch fills with the accent and
        // the other does not carry the ink at all, so one readable candidate
        // is enough.
        const candidates = chain
          .map((classes) =>
            [...new Set(classes.match(/bg-[A-Za-z0-9-]+/g) || [])]
              .map((name) => ({ name, hex: aliases[name.slice('bg-'.length)] }))
              .filter((candidate) => candidate.hex)
          )
          .find((level) => level.length);

        // Nothing in this file paints the background — an icon handed to a
        // component that fills elsewhere. Not this guard's call to make.
        if (!candidates) continue;

        const readable = candidates.filter((candidate) =>
          modes.every(
            (mode) =>
              contrast(themes[mode]['accent-ink'], candidate.hex[mode]) >= 4.5
          )
        );
        if (readable.length) continue;

        failures.push(
          `${file}:${line} text-cf-accent-ink on ` +
            candidates
              .map(
                (candidate) =>
                  `${candidate.name} (` +
                  modes
                    .map(
                      (mode) =>
                        `${mode} ${contrast(
                          themes[mode]['accent-ink'],
                          candidate.hex[mode]
                        ).toFixed(2)}:1`
                    )
                    .join(', ') +
                  ')'
              )
              .join(', ')
        );
      }
    }

    expect(failures).toEqual([]);
  });
});
