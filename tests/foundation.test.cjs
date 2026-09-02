const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { execFileSync } = require('node:child_process');

const repositoryRoot = path.resolve(__dirname, '..');
const packageJson = require(path.join(repositoryRoot, 'package.json'));

/** Runs one self-contained frontend module outside the browser. */
function loadTypeScriptModule(relativePath) {
  const filename = path.join(repositoryRoot, relativePath);
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const loaded = { exports: {} };
  new Function('require', 'module', 'exports', outputText)(
    require,
    loaded,
    loaded.exports
  );
  return loaded.exports;
}

/** Resolves a Tailwind colour alias to a literal hex in one theme. */
function buildPalette() {
  const tailwind = require(path.join(
    repositoryRoot,
    'apps/frontend/tailwind.config.cjs'
  ));
  const scss = fs.readFileSync(
    path.join(repositoryRoot, 'apps/frontend/src/app/colors.scss'),
    'utf8'
  );

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
    const name = reference[1];
    const next = name in theme[mode] ? theme[mode][name] : bridge[name];
    if (next === undefined) return null;
    return resolve(next, mode, depth + 1);
  };

  const palette = {};
  for (const [name, value] of Object.entries(tailwind.theme.extend.colors)) {
    if (typeof value !== 'string') continue;
    const light = resolve(value, 'light');
    const dark = resolve(value, 'dark');
    if (light && dark) palette[name] = { light, dark };
  }
  return palette;
}

const relativeLuminance = (hex) => {
  const channels = [1, 3, 5]
    .map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((c) =>
      c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
    );
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
};

const contrast = (a, b) => {
  const x = relativeLuminance(a);
  const y = relativeLuminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

describe('Content Factory foundation', () => {
  test('loads every locale bundle that ships in the repository', () => {
    const localeRoot = path.join(
      repositoryRoot,
      'libraries/react-shared-libraries/src/translation/locales'
    );
    const directories = fs
      .readdirSync(localeRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    const config = fs.readFileSync(
      path.join(
        repositoryRoot,
        'libraries/react-shared-libraries/src/translation/i18n.config.ts'
      ),
      'utf8'
    );
    const fallback = /fallbackLng\s*=\s*'([a-z_]+)'/.exec(config)?.[1];
    const configured = [
      fallback,
      ...config.matchAll(/^\s*'([a-z_]+)',?$/gm),
    ].map((match) => (Array.isArray(match) ? match[1] : match));

    expect([...new Set(configured)].sort()).toEqual(directories);
  });

  test('pins the supported Postiz toolchain and license boundary', () => {
    const nvmVersion = fs
      .readFileSync(path.join(repositoryRoot, '.nvmrc'), 'utf8')
      .trim();

    expect(nvmVersion).toBe('22.23.2');
    expect(packageJson.engines.node).toBe('>=22.12.0 <23.0.0');
    expect(packageJson.volta.node).toBe('22.23.2');
    expect(packageJson.packageManager).toBe('pnpm@10.6.1');
    expect(packageJson.license).toBe('AGPL-3.0');
  });

  test.each(['apps/frontend', 'apps/backend', 'apps/orchestrator'])(
    'retains the Postiz application workspace %s',
    (workspace) => {
      expect(
        fs.statSync(path.join(repositoryRoot, workspace)).isDirectory()
      ).toBe(true);
    }
  );

  test('self-hosts the shared application font for deterministic builds', () => {
    const fontConsumers = [
      'apps/frontend/src/app/(app)/layout.tsx',
      'apps/frontend/src/app/(extension)/layout.tsx',
      'apps/frontend/src/app/(provider)/layout.tsx',
      'apps/frontend/src/components/new-layout/layout.component.tsx',
    ];

    for (const consumer of fontConsumers) {
      const source = fs.readFileSync(
        path.join(repositoryRoot, consumer),
        'utf8'
      );

      expect(source).not.toContain('next/font/google');
      expect(source).toContain('@contentfactory/frontend/styles/fonts');
    }

    for (const asset of [
      'apps/frontend/src/styles/fonts/geologica/Geologica-Variable.ttf',
      'apps/frontend/src/styles/fonts/geologica/OFL.txt',
      'apps/frontend/src/styles/fonts/geologica/SOURCE.md',
      'apps/frontend/src/styles/fonts/jetbrains-mono/JetBrainsMono-Variable.ttf',
      'apps/frontend/src/styles/fonts/jetbrains-mono/OFL.txt',
      'apps/frontend/src/styles/fonts/jetbrains-mono/SOURCE.md',
      // The image editor's content face. Vendored under the same rule as the
      // two interface faces: the file, its licence and where it came from all
      // live beside each other, and the build never asks a font CDN.
      'apps/frontend/src/styles/fonts/golos-text/GolosText-Variable.ttf',
      'apps/frontend/src/styles/fonts/golos-text/OFL.txt',
      'apps/frontend/src/styles/fonts/golos-text/SOURCE.md',
    ]) {
      expect(fs.statSync(path.join(repositoryRoot, asset)).isFile()).toBe(true);
    }
  });

  test('renders every root layout in the language of the request', () => {
    // The browser language detector cannot run on the server, so anything that
    // reads the resolved language there silently produces English while the
    // browser produces the cookie language, and React reports a hydration
    // mismatch. Every root layout must take the language from the request.
    const rootLayouts = [
      'apps/frontend/src/app/(app)/layout.tsx',
      'apps/frontend/src/app/(extension)/layout.tsx',
      'apps/frontend/src/app/(provider)/layout.tsx',
    ];

    for (const layout of rootLayouts) {
      const source = fs.readFileSync(path.join(repositoryRoot, layout), 'utf8');

      expect(source).toContain('await resolveRequestLanguage()');
      expect(source).toContain('language={language}');
      // A hardcoded language reintroduces the mismatch for every other locale.
      expect(source).not.toMatch(/language="[a-z]{2}"/);
      // WCAG 3.1.1: the document has to declare its own language, and it has to
      // be declared on the server so the first paint is already correct.
      expect(source).toContain('lang={language}');
      expect(source).toContain('dir={languageDirection(language)}');
    }

    // How the request language is resolved, and the fact that the shared
    // server i18next instance is never switched to it, are behaviour rather
    // than text: `tests/language.negotiation.test.cjs` runs two overlapping
    // requests and checks each keeps its own language.
  });

  test('never prints white text on a background the bridge resolves to light', () => {
    // Light is the default theme and `--cf-accent` is light in the dark one, so
    // `text-white` next to a bridged `bg-*` alias is a contrast bug in at least
    // one theme. This caught eight places the first rebrand pass missed.
    const palette = buildPalette();
    expect(Object.keys(palette).length).toBeGreaterThan(10);

    const files = execFileSync(
      'grep',
      ['-rl', 'text-white', 'apps/frontend/src', '--include=*.tsx'],
      { cwd: repositoryRoot, encoding: 'utf8' }
    )
      .trim()
      .split('\n')
      .filter(Boolean);

    const failures = [];
    for (const file of files) {
      const lines = fs
        .readFileSync(path.join(repositoryRoot, file), 'utf8')
        .split('\n');
      lines.forEach((line, index) => {
        if (!/text-white/.test(line)) return;
        for (const match of line.matchAll(/\bbg-([a-zA-Z0-9]+)\b/g)) {
          const entry = palette[match[1]];
          if (!entry) continue;
          for (const mode of ['light', 'dark']) {
            const ratio = contrast('#ffffff', entry[mode]);
            if (ratio < 4.5) {
              failures.push(
                `${file}:${index + 1} white on bg-${match[1]} (${mode} ${
                  entry[mode]
                }) = ${ratio.toFixed(2)}:1`
              );
            }
          }
        }
      });
    }

    expect(failures).toEqual([]);
  });

  test('keeps every intentional text-white use on an exact shrinking allowlist', () => {
    const allowedCounts = {
      'apps/frontend/src/app/global.scss': 2,
      'apps/frontend/src/components/launches/calendar.tsx': 2,
      'apps/frontend/src/components/launches/creation.method.badge.tsx': 1,
      'apps/frontend/src/components/launches/customer.modal.tsx': 1,
      'apps/frontend/src/components/launches/helpers/top.title.component.tsx': 2,
      'apps/frontend/src/components/launches/information.component.tsx': 3,
      'apps/frontend/src/components/launches/tags.component.tsx': 1,
      'apps/frontend/src/components/launches/web3/providers/telegram.provider.tsx': 1,
      'apps/frontend/src/components/layout/announcement.banner.tsx': 1,
      'apps/frontend/src/components/new-launch/editor.tsx': 1,
      'apps/frontend/src/components/new-launch/providers/pinterest/pinterest.preview.tsx': 1,
      'apps/frontend/src/components/new-launch/providers/tiktok/tiktok.preview.tsx': 1,
      'apps/frontend/src/components/new-launch/select.current.tsx': 1,
      'apps/frontend/src/components/third-parties/slider.component.tsx': 2,
      'apps/frontend/src/components/third-parties/third-party.media-library.tsx': 1,
    };
    const actualCounts = {};
    const visit = (directory) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) visit(absolute);
        if (!entry.isFile() || !/\.(tsx|scss)$/.test(entry.name)) continue;
        const count = (
          fs.readFileSync(absolute, 'utf8').match(/text-white/g) || []
        ).length;
        if (count) {
          actualCounts[path.relative(repositoryRoot, absolute)] = count;
        }
      }
    };
    visit(path.join(repositoryRoot, 'apps/frontend/src'));

    expect(actualCounts).toEqual(allowedCounts);
  });
});

describe('Content Factory frontend survives its own stored data', () => {
  const { parseResearchSources } = loadTypeScriptModule(
    'apps/frontend/src/components/new-launch/research.sources.ts'
  );

  test('reads the sources a post was saved with', () => {
    const stored = JSON.stringify([
      {
        title: 'A source',
        url: 'https://example.com/a',
        publishedAt: '2026-01-05',
      },
      { title: 'Undated', url: 'https://example.com/b' },
    ]);

    expect(parseResearchSources(stored)).toEqual([
      {
        title: 'A source',
        url: 'https://example.com/a',
        publishedAt: '2026-01-05',
      },
      { title: 'Undated', url: 'https://example.com/b', publishedAt: null },
    ]);
  });

  test.each([
    ['a truncated write', '[{"title":"A source","url":"https://ex'],
    ['a value that is not a list', '{"title":"A source"}'],
    ['an empty column', ''],
    ['nothing at all', undefined],
  ])('shows no sources rather than throwing on %s', (_name, stored) => {
    expect(parseResearchSources(stored)).toEqual([]);
  });

  test('drops entries the editor could not render', () => {
    const stored = JSON.stringify([
      null,
      { url: 'https://example.com/no-title' },
      { title: { text: 'an object' }, url: 'https://example.com/c' },
      { title: 'Kept', url: 'https://example.com/d', publishedAt: 7 },
    ]);

    expect(parseResearchSources(stored)).toEqual([
      { title: 'Kept', url: 'https://example.com/d', publishedAt: null },
    ]);
  });
});

describe('Content Factory Telegram connect word', () => {
  const { generateConnectWord, CONNECT_WORD_LENGTH } = loadTypeScriptModule(
    'apps/frontend/src/components/launches/web3/providers/connect.word.ts'
  );
  // The pattern the backend DTO enforces on the way back in.
  const ACCEPTED = /^[A-Za-z0-9_-]{4,64}$/;

  test('stays inside the alphabet and length the backend accepts', () => {
    const word = generateConnectWord();

    expect(word).toMatch(ACCEPTED);
    expect(word.length).toBe(CONNECT_WORD_LENGTH);
    expect(CONNECT_WORD_LENGTH).toBeGreaterThanOrEqual(16);
  });

  test('does not repeat itself', () => {
    // `makeId(4)` drew from 62^4 ≈ 14.8 million with `Math.random`, and this
    // word is the only secret binding a pending request to the chat that
    // answers it.
    const words = new Set(
      Array.from({ length: 2000 }, () => generateConnectWord())
    );

    expect(words.size).toBe(2000);
  });

  test('refuses to invent a word without a secure random source', () => {
    const secure = globalThis.crypto;
    try {
      // @ts-ignore — deleting the global is the point of the check.
      delete globalThis.crypto;
      expect(() => generateConnectWord()).toThrow(/secure random/i);
    } finally {
      globalThis.crypto = secure;
    }
  });

  test('is the word the Telegram connect flow actually uses', () => {
    const provider = fs.readFileSync(
      path.join(
        repositoryRoot,
        'apps/frontend/src/components/launches/web3/providers/telegram.provider.tsx'
      ),
      'utf8'
    );

    expect(provider).toContain('generateConnectWord()');
    expect(provider).not.toContain('makeId');
  });
});
