const fs = require('node:fs');
const path = require('node:path');

const { scan } = require('../scripts/branding/brand-scan.cjs');
const {
  translatableKeys,
  localeNames,
  readLocale,
  isFilled,
} = require('../scripts/i18n/collect-ui-keys.cjs');

const repositoryRoot = path.resolve(__dirname, '..');
const fixtureRoot = fs.mkdtempSync(
  path.join(require('node:os').tmpdir(), 'cf-branding-fixtures-')
);
const fixtureLinks = [];

const installFixture = (relativePath, contents) => {
  const fixtureName = path.basename(relativePath);
  const fixturePath = path.join(fixtureRoot, fixtureName);
  const linkPath = path.join(repositoryRoot, relativePath);
  fs.writeFileSync(fixturePath, contents, 'utf8');
  fs.symlinkSync(fixturePath, linkPath);
  fixtureLinks.push({ fixturePath, linkPath });
  return linkPath;
};

const removeFixtures = () => {
  for (const { fixturePath, linkPath } of fixtureLinks.splice(0)) {
    fs.rmSync(linkPath, { force: true });
    fs.rmSync(fixturePath, { force: true });
  }
};

afterAll(() => {
  removeFixtures();
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
});

const read = (relativePath) =>
  fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');

describe('Content Factory brand boundary', () => {
  test('leaves no unexplained Postiz/Gitroom reference on a user-facing surface', () => {
    const { violations } = scan();

    const report = violations
      .map(
        (violation) => `${violation.file}:${violation.line}: ${violation.text}`
      )
      .join('\n');

    expect(report).toBe('');
  });

  test('ships an upstream-free Content Factory SDK and scans its public files', () => {
    const sdkFiles = [
      'apps/sdk/src/index.ts',
      'apps/sdk/README.md',
      'apps/sdk/package.json',
    ];

    for (const file of sdkFiles) {
      expect(read(file)).not.toMatch(
        /postiz|gitroom|postiz-app|api\.postiz\.com|Nevo David/i
      );
    }

    const relativePath = 'apps/sdk/src/__brand_scan_sdk_fixture__.ts';
    installFixture(relativePath, "export const sdkName = 'Postiz';\n");

    const { violations } = scan();
    expect(violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: relativePath,
          kind: 'user-facing',
        }),
      ])
    );
  });

  test('still explains the references the licence and upstream provenance need', () => {
    const { allowed } = scan();
    const rules = new Set(allowed.map((entry) => entry.rule));

    expect(read('README.md')).toContain(
      'Проект развивается на основе [Postiz](https://github.com/gitroomhq/postiz-app)'
    );
    expect(read('README.md')).toContain(
      'распространяются по [GNU AGPL-3.0](LICENSE)'
    );

    // The attribution rule is the one allowance that can never be retired, so
    // it is the one worth asserting still fires. Asserting on rules that a
    // successful rebrand is supposed to empty would fail at the moment the
    // work succeeds, which is how the retired import-alias assertion behaved.
    expect(rules.has('upstream-source-attribution')).toBe(true);

    // AGPL attribution itself is never touched by the rebrand.
    expect(read('LICENSE')).toContain('GNU AFFERO GENERAL PUBLIC LICENSE');
  });

  test('covers the surfaces outside the frontend a user still reads', () => {
    // Product e-mail is written by a Temporal workflow and the MCP display name
    // is read by external clients; neither is under apps/frontend.
    expect(
      read('apps/orchestrator/src/workflows/digest.email.workflow.ts')
    ).toContain('[Content Factory] Your latest notifications');
    expect(read('libraries/nestjs-libraries/src/chat/start.mcp.ts')).toContain(
      "name: 'Content Factory MCP'"
    );

    const fixtures = [
      'apps/orchestrator/src/__brand_scan_orchestrator_fixture__.ts',
      'libraries/nestjs-libraries/src/chat/__brand_scan_chat_fixture__.ts',
    ];
    for (const fixture of fixtures) {
      installFixture(fixture, "export const visibleProduct = 'Postiz';\n");
    }

    const { violations } = scan();
    for (const fixture of fixtures) {
      expect(violations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ file: fixture, kind: 'user-facing' }),
        ])
      );
    }
  });

  test('keeps the product name in every locale that names the product', () => {
    const localesRoot = path.join(
      repositoryRoot,
      'libraries/react-shared-libraries/src/translation/locales'
    );
    const source = JSON.parse(
      read(
        'libraries/react-shared-libraries/src/translation/locales/en/translation.json'
      )
    );
    const brandedKeys = Object.keys(source).filter(
      (key) =>
        typeof source[key] === 'string' &&
        source[key].includes('Content Factory')
    );

    // The name is never translated, so a value that lost it either kept the old
    // brand — possibly transliterated, which the ASCII scan cannot see — or
    // dropped the product name altogether.
    expect(brandedKeys.length).toBeGreaterThan(0);

    const drifted = [];
    for (const locale of fs.readdirSync(localesRoot)) {
      if (locale === 'en') continue;
      const file = path.join(localesRoot, locale, 'translation.json');
      if (!fs.existsSync(file)) continue;
      const translations = JSON.parse(fs.readFileSync(file, 'utf8'));
      for (const key of brandedKeys) {
        const value = translations[key];
        if (typeof value !== 'string' || !value.trim()) continue;
        if (!value.includes('Content Factory'))
          drifted.push(`${locale}:${key}`);
      }
    }

    expect(drifted).toEqual([]);
  });

  test('translates every string the interface renders, in every locale', () => {
    // A `t('key', 'English default')` call renders the English default when the
    // key is absent, so a missing key is invisible in testing and shows up as a
    // half-translated screen instead. The surfaces are discovered from the
    // source rather than listed here: a hand-kept list silently stops covering
    // the screen someone adds tomorrow, which is exactly how these gaps opened.
    const { translatable, interpolated } = translatableKeys();
    expect(translatable.size).toBeGreaterThan(0);

    // Recorded, not hidden: a default built at runtime from a JavaScript value
    // cannot be moved into a locale file without freezing that value into every
    // language. Translating one means rewriting its call site to interpolate.
    expect(interpolated.sort()).toEqual([
      'are_you_sure_revoke_access',
      'channel_connected_description',
      'no_matching_integrations',
      'select_the_page_or_account',
    ]);

    const gaps = [];
    for (const locale of localeNames()) {
      const translations = readLocale(locale);
      for (const key of translatable.keys()) {
        if (!isFilled(translations[key])) gaps.push(`${locale}:${key}`);
      }
    }

    expect(gaps).toEqual([]);
  });

  test('rejects a generic display name that reintroduces the legacy brand', () => {
    const relativePath =
      'apps/frontend/src/__brand_scan_display_name_fixture__.ts';
    installFixture(relativePath, "export const visibleProduct = { name: 'postiz' };\n");

    const { violations } = scan();

    expect(violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: relativePath,
          kind: 'user-facing',
        }),
      ])
    );
  });

  test('does not accept a visible string just because it says "upstream"', () => {
    const relativePath = 'apps/frontend/src/__brand_scan_upstream_fixture__.ts';
    // The upstream allowance covers the provenance link, not any sentence that
    // happens to contain the word.
    installFixture(
      relativePath,
      "export const banner = 'Syncing upstream from Postiz failed';\n"
    );

    const { violations } = scan();

    expect(violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: relativePath,
          kind: 'user-facing',
        }),
      ])
    );
  });

  // Nothing upstream is frozen any more. The identifiers this test used to
  // protect - the deep-link scheme and the pricing capability flag - were
  // renamed once it was established that neither is persisted: the scheme is
  // registered with no operating system here, and the flag is static pricing
  // configuration rather than a database column. What is worth asserting now is
  // that each rename actually took, in the one place that defines it.
  test('defines every renamed identifier under this product, not upstream', () => {
    expect(read('tsconfig.base.json')).toContain('@contentfactory/');
    expect(read('apps/backend/src/api/routes/auth.controller.ts')).toContain(
      'contentfactory://auth/callback'
    );
    expect(
      read(
        'libraries/nestjs-libraries/src/database/prisma/subscriptions/pricing.ts'
      )
    ).toContain('featured_plan');
    expect(read('libraries/nestjs-libraries/src/chat/mastra.service.ts')).toContain(
      "'content-factory':"
    );
    // The agent key is looked up by string in three separate places; a rename
    // that missed one would leave the chat surface asking for an agent the
    // registry does not have.
    expect(read('libraries/nestjs-libraries/src/chat/start.mcp.ts')).toContain(
      "getAgent('content-factory')"
    );
    expect(read('apps/frontend/src/components/agents/agent.chat.tsx')).toContain(
      'agent="content-factory"'
    );
  });

  test('names Content Factory on the surfaces a person sees first', () => {
    const rootLayout = read('apps/frontend/src/app/(app)/layout.tsx');
    expect(rootLayout).toContain("default: 'Content Factory'");
    expect(rootLayout).toContain("template: '%s · Content Factory'");

    expect(read('apps/frontend/src/app/(app)/auth/layout.tsx')).toContain(
      'Wordmark'
    );
    expect(read('apps/extension/manifest.json')).toContain('Content Factory');
    expect(read('apps/frontend/src/app/manifest.ts')).toContain(
      "name: 'Content Factory'"
    );
  });

  test('ships the brand assets the metadata points at', () => {
    for (const asset of [
      'apps/frontend/public/icon.svg',
      'apps/frontend/public/icon-192.png',
      'apps/frontend/public/icon-512.png',
      'apps/frontend/public/apple-icon.png',
      'apps/frontend/public/favicon.ico',
      'apps/frontend/public/opengraph-image.png',
    ]) {
      expect(fs.statSync(path.join(repositoryRoot, asset)).isFile()).toBe(true);
    }

    // The inherited marks and the auth marketing wall are gone for good.
    for (const removed of [
      'apps/frontend/public/postiz.svg',
      'apps/frontend/public/postiz-text.svg',
      'apps/frontend/public/postiz-fav.png',
      'apps/frontend/public/auth/avatars',
      'libraries/react-shared-libraries/src/helpers/testomonials.tsx',
    ]) {
      expect(fs.existsSync(path.join(repositoryRoot, removed))).toBe(false);
    }
  });

  test('does not disable focus globally and keeps one focus ring', () => {
    const globals = read('apps/frontend/src/app/global.scss');

    expect(globals).not.toMatch(/body \*\s*\{[^}]*outline:\s*none/);
    expect(globals).toContain(':focus-visible');
    expect(globals).toContain('prefers-reduced-motion');
  });
});
