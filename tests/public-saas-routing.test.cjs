const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('typescript');

const repositoryRoot = path.resolve(__dirname, '..');

function loadProxy({ joinResult = {} } = {}) {
  const filename = path.join(repositoryRoot, 'apps/frontend/src/proxy.ts');
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const NextResponse = {
    next: ({ request }) => {
      const cookieWrites = [];
      return {
        type: 'next',
        requestHeaders: request.headers,
        cookieWrites,
        cookies: { set: (...args) => cookieWrites.push(args) },
      };
    },
    redirect: (url) => {
      const cookieWrites = [];
      return {
        type: 'redirect',
        url: String(url),
        cookieWrites,
        cookies: { set: (...args) => cookieWrites.push(args) },
      };
    },
  };
  const internalFetchCalls = [];
  const mocks = {
    'next/server': { NextResponse },
    '@contentfactory/helpers/subdomain/subdomain.management': {
      getCookieUrlFromDomain: () => 'localhost',
    },
    '@contentfactory/helpers/utils/internal.fetch': {
      internalFetch: async (url, options) => {
        internalFetchCalls.push({ url, options });
        return { json: async () => joinResult };
      },
    },
    '@contentfactory/react/translation/i18n.config': {
      cookieName: 'i18next',
      headerName: 'x-i18next-current-language',
      languageFromBcp47: () => 'en',
      languageTags: ['en'],
      languages: ['en'],
    },
  };
  const loaded = { exports: {} };
  new Function('require', 'module', 'exports', compiled)(
    (request) => mocks[request] ?? require(request),
    loaded,
    loaded.exports
  );
  return { ...loaded.exports, internalFetchCalls };
}

function loadPublicCopy() {
  const filename = path.join(
    repositoryRoot,
    'apps/frontend/src/components/public-saas/public-copy.ts'
  );
  const source = fs.readFileSync(filename, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const loaded = { exports: {} };
  new Function('require', 'module', 'exports', compiled)(
    (request) => {
      if (
        request ===
        '@contentfactory/react/translation/get.transation.service.client'
      ) {
        return { useT: () => (key) => `translated:${key}` };
      }
      return require(request);
    },
    loaded,
    loaded.exports
  );
  return { ...loaded.exports, source };
}

const requestFor = (pathname, authenticated = false, pendingInvite) => ({
  nextUrl: new URL(`http://localhost:4200${pathname}`),
  cookies: {
    get: (name) => {
      if (authenticated && name === 'auth') return { value: 'signed-token' };
      if (pendingInvite && name === 'pending-team-invitation') {
        return { value: pendingInvite };
      }
      return undefined;
    },
  },
  headers: new Headers(),
});

// Shaped like what `AuthService.signJWT` hands to an invited teammate: three
// base64url segments. The proxy now tells this apart from a campaign tag.
const inviteToken =
  'eyJhbGciOiJIUzI1NiJ9.eyJpZCI6ImludjEyIiwib3JnSWQiOiJvcmcifQ.c2lnbmF0dXJlLXZhbHVl';

describe('public SaaS route boundary', () => {
  test('publishes only the explicit public allowlist without a session', async () => {
    const { proxy, PUBLIC_PATHS } = loadProxy();
    expect(PUBLIC_PATHS).toEqual([
      '/',
      '/product',
      '/security',
      '/docs',
      '/demo',
      '/privacy',
      '/terms',
      '/subprocessors',
    ]);

    for (const pathname of PUBLIC_PATHS) {
      await expect(proxy(requestFor(pathname))).resolves.toMatchObject({
        type: 'next',
      });
    }
    await expect(proxy(requestFor('/launches'))).resolves.toMatchObject({
      type: 'redirect',
      url: expect.stringContaining('/auth'),
    });
    await expect(proxy(requestFor('/product/private'))).resolves.toMatchObject({
      type: 'redirect',
      url: expect.stringContaining('/auth'),
    });
  });

  test('handles an organization invite before the public home allowlist', async () => {
    const anonymous = loadProxy();
    const inviteEntry = await anonymous.proxy(
      requestFor(`/?org=${inviteToken}`)
    );
    const confirmation = `http://localhost:4200/join-org?org=${inviteToken}`;
    expect(inviteEntry).toMatchObject({
      type: 'redirect',
      url: `http://localhost:4200/auth?returnUrl=${encodeURIComponent(
        confirmation
      )}`,
      cookieWrites: [
        [
          'pending-team-invitation',
          inviteToken,
          expect.objectContaining({ httpOnly: true }),
        ],
      ],
    });
    expect(anonymous.internalFetchCalls).toHaveLength(0);

    const inviteCapture = await anonymous.proxy(
      requestFor(`/auth?org=${inviteToken}`)
    );
    expect(inviteCapture).toMatchObject({
      type: 'redirect',
      url: `http://localhost:4200/auth?returnUrl=${encodeURIComponent(
        confirmation
      )}`,
      cookieWrites: [
        [
          'pending-team-invitation',
          inviteToken,
          expect.objectContaining({ httpOnly: true }),
        ],
      ],
    });
    await expect(anonymous.proxy(requestFor('/auth'))).resolves.toMatchObject({
      type: 'next',
    });

    const authenticated = loadProxy();
    await expect(
      authenticated.proxy(requestFor(`/?org=${inviteToken}`, true))
    ).resolves.toMatchObject({
      type: 'redirect',
      url: confirmation,
    });
    await expect(
      authenticated.proxy(requestFor(`/join-org?org=${inviteToken}`, true))
    ).resolves.toMatchObject({ type: 'next' });
    await expect(
      authenticated.proxy(
        requestFor(`/join-org?org=${inviteToken}`, true, inviteToken)
      )
    ).resolves.toMatchObject({
      type: 'next',
      cookieWrites: [
        [
          'pending-team-invitation',
          '',
          expect.objectContaining({ maxAge: -1 }),
        ],
      ],
    });
    expect(authenticated.internalFetchCalls).toEqual([]);

    await expect(
      authenticated.proxy(requestFor('/auth/login', true, inviteToken))
    ).resolves.toMatchObject({
      type: 'redirect',
      url: confirmation,
      cookieWrites: [
        [
          'pending-team-invitation',
          '',
          expect.objectContaining({ maxAge: -1 }),
        ],
      ],
    });
  });

  test('keeps the marketing home for an ?org= value that is not an invite token', async () => {
    for (const value of [
      'acme',
      '',
      'header.payload',
      'header..signature',
      'partner referral',
      `${inviteToken}.extra`,
    ]) {
      const visitor = loadProxy();
      await expect(
        visitor.proxy(requestFor(`/?org=${encodeURIComponent(value)}`))
      ).resolves.toMatchObject({ type: 'next' });
      expect(visitor.internalFetchCalls).toHaveLength(0);
    }
  });

  test('sends a signed-in home request to the existing application root', async () => {
    const { proxy } = loadProxy();
    await expect(proxy(requestFor('/', true))).resolves.toMatchObject({
      type: 'redirect',
      url: 'http://localhost:4200/analytics',
    });
    await expect(proxy(requestFor('/product', true))).resolves.toMatchObject({
      type: 'next',
    });
  });

  test('ships every public page inside the isolated public route group', () => {
    for (const route of [
      '',
      'product',
      'security',
      'docs',
      'demo',
      'privacy',
      'terms',
      'subprocessors',
    ]) {
      const page = path.join(
        repositoryRoot,
        'apps/frontend/src/app/(public)',
        route,
        'page.tsx'
      );
      expect(fs.existsSync(page)).toBe(true);
    }
    const layout = fs.readFileSync(
      path.join(repositoryRoot, 'apps/frontend/src/app/(public)/layout.tsx'),
      'utf8'
    );
    expect(layout).toContain('<LayoutContext>');
    expect(layout).toContain('<PublicShell>{children}</PublicShell>');
  });

  test('maps public copy keys through the shared translation contract', () => {
    const { usePublicCopy, source } = loadPublicCopy();
    const copy = usePublicCopy();

    expect(copy('tryDemo')).toBe('translated:public_saas_try_demo');
    expect(copy('tenantIsolationTitle')).toBe(
      'translated:public_saas_tenant_isolation_title'
    );
    expect(copy('docsScheduleTitle')).toBe(
      'translated:public_saas_docs_schedule_title'
    );
    expect(source).toContain('const t = useT();');
    expect(source).not.toMatch(/\bPUBLIC_COPY\b|\buseVariables\b/);
    expect(source).not.toMatch(/Try the demo|Попробовать демо/);
  });

  test('keeps public claims decision-safe and every promotional CTA on the demo', () => {
    const roots = [
      'apps/frontend/src/app/(public)',
      'apps/frontend/src/components/public-saas',
    ];
    const sources = roots
      .flatMap((root) => {
        const visit = (directory) =>
          fs
            .readdirSync(path.join(repositoryRoot, directory), {
              withFileTypes: true,
            })
            .flatMap((entry) =>
              entry.isDirectory()
                ? visit(path.join(directory, entry.name))
                : /\.(ts|tsx)$/.test(entry.name)
                ? [
                    fs.readFileSync(
                      path.join(repositoryRoot, directory, entry.name),
                      'utf8'
                    ),
                  ]
                : []
            );
        return visit(root);
      })
      .join('\n');

    expect(sources).not.toMatch(
      /\bpricing\b|\bprice\b|\btrial\b|no[ -]card|self[ -]host/i
    );
    // `/auth/register` is the API endpoint the form posts to; it has never
    // been a page, and a CTA pointing at it is a 404 in a green button.
    expect(sources).not.toContain('href="/auth/register"');
    expect(sources).toContain('href="/demo"');
    expect(sources).toContain("copy('tryDemo')");
    expect(sources).toContain("copy('signUp')");
  });

  test('separates the sign-in entry from the one registration CTA', () => {
    const shell = fs.readFileSync(
      path.join(
        repositoryRoot,
        'apps/frontend/src/components/public-saas/public-shell.tsx'
      ),
      'utf8'
    );

    // The control that carries the sign-in label has to name the login route
    // itself. A returning visitor sent to `/auth` lands on the register form.
    const label = shell.indexOf("copy('signIn')");
    expect(label).toBeGreaterThan(-1);
    const control = shell.slice(shell.lastIndexOf('<Link', label), label);
    expect(control).toContain('href="/auth/login"');

    // And the new visitor gets the opposite: the register form, as the only
    // filled control in the header.
    const signUp = shell.indexOf("copy('signUp')");
    expect(signUp).toBeGreaterThan(-1);
    const primary = shell.slice(shell.lastIndexOf('<Link', signUp), signUp);
    expect(primary).toContain('href="/auth"');
    expect(primary).toContain('PRIMARY_FILL');

    const header = shell.slice(0, shell.indexOf('</header>'));
    expect(header).toContain("copy('signIn')");
    expect(header).toContain("copy('signUp')");
    // The header no longer sells the demo. The page body offers it beside
    // every registration CTA, which is where a visitor is deciding.
    expect(header).not.toContain("copy('tryDemo')");
  });
});

/**
 * The public home page, rendered.
 *
 * Reading the file as text proved the last version had two `<section>`s and
 * four `min-w-0`s, which is a description of a layout rather than of a page. It
 * could not have caught a scene whose copy key was missing from the bundle, a
 * "Soon" marker quietly dropped from a capability that does not exist yet, or a
 * primary CTA pointing at a route that is not the registration form — and those
 * are the three ways this page can be wrong in a way that matters.
 *
 * So it is rendered, through the real English bundle and the real platform
 * registry. A key that is absent renders as an empty string and fails here.
 */
// Compiled on first use: `componentMocks` is declared further down this file,
// and the mocks are what make the page renderable at all.
let publicHome;
const homeMarkup = () => {
  publicHome ??= loadComponent(
    'apps/frontend/src/components/public-saas/public-home.tsx',
    componentMocks
  ).PublicHome;
  return renderToStaticMarkup(h(publicHome));
};

describe('public home page', () => {
  test('tells the six stages of one process, in order, once each', () => {
    const markup = homeMarkup();
    const stages = [
      'public_saas_stage_idea',
      'public_saas_stage_draft',
      'public_saas_stage_adapt',
      'public_saas_stage_approve',
      'public_saas_stage_publish',
      'public_saas_stage_analytics',
    ].map((key) => enBundle[key]);

    // Every scene is anchored, so the strip above and the header can reach it.
    for (const id of [
      'idea',
      'draft',
      'adapt',
      'approve',
      'platforms',
      'analytics',
      'signup',
    ]) {
      expect(markup).toContain(`id="${id}"`);
    }

    // The strip under the hero names all six, in process order. It is the
    // page's index, so a stage missing from it is a stage a visitor cannot
    // discover without scrolling the whole page.
    // The same words label the path inside the hero panel, so the strip is the
    // later of the two — its `aria-label`, not the hero's caption.
    const stripStart = markup.lastIndexOf(enBundle.public_saas_process_label);
    const strip = markup.slice(stripStart, markup.indexOf('</nav>', stripStart));
    const stripPositions = stages.map((stage) => strip.indexOf(stage));
    expect(stripPositions.every((position) => position > -1)).toBe(true);
    expect([...stripPositions].sort((a, b) => a - b)).toEqual(stripPositions);

    // The scenes themselves then run in the same order, one heading each,
    // every one from the bundle rather than a raw key.
    const sceneHeadings = [
      'public_saas_idea_title',
      'public_saas_draft_title',
      'public_saas_adapt_title',
      'public_saas_approve_title',
      'public_saas_platforms_title',
      'public_saas_analytics_title',
    ];
    const scenePositions = sceneHeadings.map((key) =>
      markup.indexOf(enBundle[key])
    );
    expect(scenePositions.every((position) => position > -1)).toBe(true);
    expect([...scenePositions].sort((a, b) => a - b)).toEqual(scenePositions);

    for (const key of [
      'public_saas_home_title',
      ...sceneHeadings,
      'public_saas_cta_title',
    ]) {
      expect(enBundle[key]).toEqual(expect.any(String));
      expect(markup).toContain(enBundle[key]);
      expect(markup).not.toContain(key);
    }
  });

  test('offers registration as the only primary action, with the demo beside it', () => {
    const markup = homeMarkup();
    const signUp = enBundle.public_saas_sign_up;
    const demo = enBundle.public_saas_try_demo;

    // Two CTA pairs — hero and closing — and both go to the same two routes.
    const primaries = [
      ...markup.matchAll(new RegExp(`<a[^>]*>${signUp}</a>`, 'g')),
    ].map((match) => match[0]);
    expect(primaries).toHaveLength(2);
    for (const anchor of primaries) {
      expect(anchor).toContain('href="/auth"');
      expect(anchor).toContain('bg-cf-accent');
      expect(anchor).toContain('text-cf-accent-ink');
    }

    const secondaries = [
      ...markup.matchAll(new RegExp(`<a[^>]*>${demo}</a>`, 'g')),
    ].map((match) => match[0]);
    expect(secondaries).toHaveLength(2);
    for (const anchor of secondaries) {
      expect(anchor).toContain('href="/demo"');
      // Visually secondary: an outlined surface, not a second green button.
      expect(anchor).not.toContain('bg-cf-accent ');
      expect(anchor).toContain('border-cf-border-control');
    }
  });

  test('marks every capability that does not exist yet, in words', () => {
    const markup = homeMarkup();
    const soon = enBundle.public_saas_soon;

    // Three: the multilingual research scene, brand voice, and the learning
    // loop. Colour is not the carrier — the word is, and it is repeated at
    // each place rather than stated once at the top.
    expect([...markup.matchAll(new RegExp(soon, 'g'))]).toHaveLength(4);
    for (const key of [
      'public_saas_idea_title',
      'public_saas_brand_voice_title',
      'public_saas_analytics_loop_title',
    ]) {
      expect(markup).toContain(enBundle[key]);
    }

    // And the two that are marked have to be marked with the warning role,
    // which is spent on nothing else on this page.
    expect(markup).toContain('border-cf-warning');
  });

  test('builds the platform roster from the shared registry, marks included', () => {
    const markup = homeMarkup();
    const families = loadComponent(
      'libraries/react-shared-libraries/src/platform/platform.families.ts',
      {}
    );

    // Every identifier the registry places, named — no separately curated
    // marketing list to drift away from what the product connects to.
    expect(families.KNOWN_PLATFORMS.length).toBeGreaterThan(30);
    for (const identifier of families.KNOWN_PLATFORMS) {
      expect(families.PLATFORM_NAMES[identifier]).toEqual(expect.any(String));
      expect(markup).toContain(`data-platform="${identifier}"`);
    }

    // The claim is the one the product truth allows, and the roster behind it
    // is longer than the number in it.
    expect(enBundle.public_saas_platforms_body).toMatch(/more than 30/i);
    expect(enBundle.public_saas_platforms_note).toMatch(/differs|not the same/i);
    expect(markup).toContain(enBundle.public_saas_platforms_note);
  });

  test('labels the analytics figures as demo data and promises no growth', () => {
    const markup = homeMarkup();

    expect(markup).toContain(enBundle.public_saas_demo_data);
    expect(markup).toContain(enBundle.public_saas_analytics_depth_note);
    // A figure a visitor could read as a result the product produced.
    expect(markup).not.toMatch(/\+\s?\d+\s?%/);
    expect(markup).not.toMatch(/\bgrowth\b|\bincrease your\b|\bguarantee/i);
  });

  test('keeps the hero and its product shot able to shrink', () => {
    const markup = homeMarkup();

    // The hero heading is the one marketing size, and it has to be allowed to
    // break: a 56px unbreakable Russian compound at 390px is a scrollbar.
    expect(markup).toMatch(
      /class="cf-display-xl[^"]*\[overflow-wrap:anywhere\]/
    );
    const home = fs.readFileSync(
      path.join(
        repositoryRoot,
        'apps/frontend/src/components/public-saas/public-home.tsx'
      ),
      'utf8'
    );
    const shots = fs.readFileSync(
      path.join(
        repositoryRoot,
        'apps/frontend/src/components/public-saas/home-shots.tsx'
      ),
      'utf8'
    );
    // Every grid column and every panel can shrink below its content, which is
    // the whole difference between a page that reflows and one that scrolls
    // sideways.
    expect(home).toContain('grid min-w-0');
    expect(shots).toContain('min-w-0');
    expect(shots).not.toMatch(/\boverflow-x-scroll\b/);
  });
});

/**
 * The three published legal documents.
 *
 * They are the only public pages whose words are not translation keys: the text
 * is markdown written by a person, read at request time, and it lags the
 * interface by fourteen languages. So the things worth holding are the ones a
 * visitor would notice — the routes are open without a session, the footer
 * reaches them, a language with no document falls back and says so, and the
 * prose survives being written right to left.
 */

const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const h = React.createElement;

const enBundle = JSON.parse(
  fs.readFileSync(
    path.join(
      repositoryRoot,
      'libraries/react-shared-libraries/src/translation/locales/en/translation.json'
    ),
    'utf8'
  )
);

const interpolate = (text, values) =>
  String(text ?? '').replace(/{{(\w+)}}/g, (whole, name) =>
    values && name in values ? values[name] : whole
  );

/**
 * Compiles a repository component and the siblings it imports, substituting the
 * path-aliased packages. The real `public-copy` and the real English bundle go
 * through, so a key that exists in the component but not in the locale file
 * shows up here as an empty string rather than as a passing test.
 */
function loadComponent(relativePath, mocks) {
  const cache = new Map();
  const compile = (absolute) => {
    if (cache.has(absolute)) return cache.get(absolute).exports;
    const compiled = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), {
      fileName: absolute,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2021,
        esModuleInterop: true,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText;
    const loaded = { exports: {} };
    cache.set(absolute, loaded);
    const directory = path.dirname(absolute);
    const localRequire = (request) => {
      if (Object.prototype.hasOwnProperty.call(mocks, request)) {
        return mocks[request];
      }
      if (!request.startsWith('.')) return require(request);
      for (const suffix of ['', '.tsx', '.ts']) {
        const candidate = path.resolve(directory, request + suffix);
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          return compile(candidate);
        }
      }
      throw new Error(`cannot resolve ${request} from ${directory}`);
    };
    new Function(
      'exports',
      'require',
      'module',
      '__filename',
      '__dirname',
      compiled
    )(loaded.exports, localRequire, loaded, absolute, directory);
    return loaded.exports;
  };
  return compile(path.join(repositoryRoot, relativePath));
}

const i18nConfig = loadComponent(
  'libraries/react-shared-libraries/src/translation/i18n.config.ts',
  {}
);

const componentMocks = {
  'next/link': ({ href, children, ...rest }) =>
    h('a', { href, ...rest }, children),
  '@contentfactory/react/translation/i18n.config': i18nConfig,
  '@contentfactory/react/translation/get.transation.service.client': {
    // `t(key)`, `t(key, values)` and `t(key, 'Default')` are all in use. A key
    // the bundle does not carry still renders as an empty string, so a missing
    // translation fails a rendered assertion rather than printing its own name.
    useT: () => (key, second, third) => {
      const values = second && typeof second === 'object' ? second : third;
      const fallback = typeof second === 'string' ? second : undefined;
      return interpolate(enBundle[key] ?? fallback ?? '', values);
    },
  },
  '@contentfactory/react/helpers/variable.context': {
    useVariables: () => ({ language: 'en', backendUrl: '' }),
  },
  '@contentfactory/react/platform/platform.badge': {
    // Named by identifier so the roster assertion can check the registry
    // reached the page, without this test owning the asset path.
    PlatformBadge: ({ identifier, name }) =>
      h('span', { 'data-platform': identifier, 'aria-label': name }),
  },
  '@contentfactory/react/platform/platform.families': loadComponent(
    'libraries/react-shared-libraries/src/platform/platform.families.ts',
    {}
  ),
  '@contentfactory/react/choice/tabs': loadComponent(
    'libraries/react-shared-libraries/src/choice/tabs.tsx',
    {}
  ),
  '@contentfactory/frontend/components/layout/language.presentation':
    loadComponent(
      'apps/frontend/src/components/layout/language.presentation.ts',
      {}
    ),
  '@contentfactory/frontend/components/ui/surface': {
    EmptyState: ({ title, description, className }) =>
      h(
        'div',
        { className, 'data-testid': 'legal-unavailable' },
        h('p', {}, title),
        h('p', {}, description)
      ),
  },
  '@contentfactory/frontend/components/layout/source.link': {
    SourceLink: ({ className }) => h('a', { className, href: '/source' }, 'Source'),
  },
  '@contentfactory/frontend/components/ui/brand/cf-mark': {
    CfMark: () => h('span', {}, 'Cf'),
  },
};

const legalContent = loadComponent(
  'apps/frontend/src/components/public-saas/legal-content.ts',
  {}
);
const { LegalDocumentView } = loadComponent(
  'apps/frontend/src/components/public-saas/legal-document.tsx',
  componentMocks
);

const legalSourceFiles = [
  'apps/frontend/src/components/public-saas/legal-content.ts',
  'apps/frontend/src/components/public-saas/legal-documents.ts',
  'apps/frontend/src/components/public-saas/legal-document.tsx',
  'apps/frontend/src/components/public-saas/legal-page.tsx',
  'apps/frontend/src/components/public-saas/public-shell.tsx',
];

const readSource = (relativePath) =>
  fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');

const withDocuments = (files) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-legal-'));
  for (const [name, body] of Object.entries(files)) {
    fs.writeFileSync(path.join(directory, name), body);
  }
  return directory;
};

// Stands in for what the authors are writing into `src/content/legal`. The real
// files are another agent's to add, and fourteen of the sixteen languages do
// not exist yet, so the fallback has to be provable without them.
const privacyEn = [
  '---',
  'title: Privacy policy',
  'updated: 2026-08-19',
  'language: en',
  '---',
  '',
  '## What is collected',
  '',
  'The workspace stores the content you write and the channels you connect.',
  'Nothing else is read.',
  '',
  '- Account email',
  '- Connected channel identifiers',
  '',
  'Write to [the operator](mailto:hello@example.test) to ask for a copy.',
  '',
  '| Purpose | Retained |',
  '| --- | --- |',
  '| Draft content | Until deleted |',
  '',
].join('\n');

const privacyHe = [
  '---',
  'title: מדיניות פרטיות',
  'updated: 2026-08-19',
  'language: he',
  '---',
  '',
  '## מה נאסף',
  '',
  'סביבת העבודה שומרת את התוכן שכתבתם.',
  '',
].join('\n');

describe('public legal documents', () => {
  test('opens the three legal routes to a visitor with no session', async () => {
    const { proxy, PUBLIC_PATHS } = loadProxy();

    for (const id of legalContent.LEGAL_DOCUMENTS) {
      const { href } = legalContent.LEGAL_ROUTES[id];
      expect(PUBLIC_PATHS).toContain(href);
      await expect(proxy(requestFor(href))).resolves.toMatchObject({
        type: 'next',
      });
      // The allowlist is exact, not a prefix: a route that merely starts with
      // a legal path stays behind the session.
      await expect(
        proxy(requestFor(`${href}/internal`))
      ).resolves.toMatchObject({
        type: 'redirect',
        url: expect.stringContaining('/auth'),
      });
    }
  });

  test('keeps the legal routes public for a signed-in visitor too', async () => {
    const { proxy } = loadProxy();
    for (const id of legalContent.LEGAL_DOCUMENTS) {
      await expect(
        proxy(requestFor(legalContent.LEGAL_ROUTES[id].href, true))
      ).resolves.toMatchObject({ type: 'next' });
    }
  });

  test('ships one route file per document and names it in every locale', () => {
    for (const id of legalContent.LEGAL_DOCUMENTS) {
      const route = legalContent.LEGAL_ROUTES[id];
      expect(route.href).toBe(`/${id}`);
      const page = path.join(
        repositoryRoot,
        'apps/frontend/src/app/(public)',
        id,
        'page.tsx'
      );
      expect(fs.existsSync(page)).toBe(true);
      // The browser title comes from the same key the footer link uses, so a
      // tab and a link can never disagree about what the page is called.
      expect(fs.readFileSync(page, 'utf8')).toContain(
        `t('public_saas_legal_${id}')`
      );
    }
  });

  test('links every legal document from the public footer', () => {
    const shell = readSource(
      'apps/frontend/src/components/public-saas/public-shell.tsx'
    );
    const footer = shell.slice(shell.indexOf('<footer'));
    expect(footer).toContain('LEGAL_DOCUMENTS.map');
    expect(footer).toContain('LEGAL_ROUTES[id].href');
    expect(footer).toContain('copy(LEGAL_ROUTES[id].copyKey)');
    expect(footer).toContain("aria-label={copy('legalNav')}");

    const { PUBLIC_COPY_KEYS } = loadPublicCopy();
    for (const id of legalContent.LEGAL_DOCUMENTS) {
      expect(PUBLIC_COPY_KEYS).toContain(
        legalContent.LEGAL_ROUTES[id].copyKey
      );
    }
  });

  test('reads front matter and the markdown a legal document is written in', () => {
    const parsed = legalContent.parseLegalDocument(privacyEn);
    expect(parsed).toMatchObject({
      title: 'Privacy policy',
      updated: '2026-08-19',
      language: 'en',
    });
    expect(parsed.blocks.map((block) => block.kind)).toEqual([
      'heading',
      'paragraph',
      'list',
      'paragraph',
      'table',
    ]);
    expect(parsed.blocks[0]).toMatchObject({ level: 2, id: 'legal-section-1' });
    // A soft line break inside a paragraph is a break in the source, not in
    // the sentence.
    expect(parsed.blocks[1].spans[0].text).toContain(
      'you connect. Nothing else is read.'
    );
    expect(parsed.blocks[2].items).toHaveLength(2);
    expect(parsed.blocks[4].rows[0][1][0].text).toBe('Until deleted');
  });

  test('refuses a link target that is not plain web or mail', () => {
    const spans = legalContent.parseLegalSpans(
      '[safe](https://example.test) [inside](/security) [unsafe](javascript:alert(1))'
    );
    expect(spans.filter((span) => span.kind === 'link')).toEqual([
      { kind: 'link', text: 'safe', href: 'https://example.test' },
      { kind: 'link', text: 'inside', href: '/security' },
    ]);
    expect(
      spans.some(
        (span) => span.kind === 'text' && span.text.includes('javascript:')
      )
    ).toBe(true);
  });

  test('serves the visitor language, then English, then Russian', () => {
    const { loadLegalDocument, legalLanguageOrder } = loadComponent(
      'apps/frontend/src/components/public-saas/legal-documents.ts',
      { '@contentfactory/react/translation/i18n.config': i18nConfig }
    );

    expect(legalLanguageOrder('tr')).toEqual(['tr', 'en', 'ru']);
    expect(legalLanguageOrder('en')).toEqual(['en', 'ru']);

    const all = withDocuments({
      'privacy.en.md': privacyEn,
      'privacy.ru.md': privacyEn.replace('language: en', 'language: ru'),
      'privacy.he.md': privacyHe,
    });
    expect(loadLegalDocument('privacy', 'he', all)).toMatchObject({
      requested: 'he',
      served: 'he',
    });
    expect(loadLegalDocument('privacy', 'tr', all)).toMatchObject({
      requested: 'tr',
      served: 'en',
    });

    const russianOnly = withDocuments({ 'privacy.ru.md': privacyEn });
    expect(loadLegalDocument('privacy', 'tr', russianOnly)).toMatchObject({
      served: 'ru',
    });
    expect(loadLegalDocument('terms', 'tr', russianOnly)).toBeNull();
  });

  test('says nothing about translation when the visitor got their own language', () => {
    const parsed = legalContent.parseLegalDocument(privacyEn);
    const markup = renderToStaticMarkup(
      h(LegalDocumentView, {
        documentId: 'privacy',
        content: { ...parsed, requested: 'en', served: 'en' },
      })
    );

    expect(markup).toContain('Privacy policy');
    expect(markup).toContain('Updated 2026-08-19');
    expect(markup).toContain('What is collected');
    expect(markup).not.toContain('is not available in your language');
  });

  test('tells a visitor, in their own language, that they are reading another', () => {
    const parsed = legalContent.parseLegalDocument(privacyEn);
    const markup = renderToStaticMarkup(
      h(LegalDocumentView, {
        documentId: 'privacy',
        content: { ...parsed, requested: 'tr', served: 'en' },
      })
    );

    // The notice is rendered through the shipped bundle, so this fails if the
    // key is missing rather than quietly printing the key name.
    expect(enBundle.public_saas_legal_translation_pending).toContain(
      '{{language}}'
    );
    expect(markup).toContain(
      'This document is not available in your language yet. You are reading the English version.'
    );
  });

  test('gives the document its own language and direction, not the visitor’s', () => {
    const parsed = legalContent.parseLegalDocument(privacyHe);
    const markup = renderToStaticMarkup(
      h(LegalDocumentView, {
        documentId: 'privacy',
        content: { ...parsed, requested: 'en', served: 'he' },
      })
    );

    expect(markup).toMatch(/<article[^>]*lang="he"/);
    expect(markup).toMatch(/<article[^>]*dir="rtl"/);
    expect(markup).toMatch(/<h1[^>]*dir="rtl"/);
    expect(markup).toContain('text-start');
  });

  test('offsets long-form text with logical properties only', () => {
    const physical =
      /(?:^|[\s"'`{])!?(?:[a-z-]+:)*(?:ml|mr|pl|pr|border-l|border-r|rounded-l|rounded-r|inset-l|inset-r|left|right)-|\btext-(?:left|right)\b/;
    const offenders = legalSourceFiles.filter((file) =>
      physical.test(readSource(file))
    );
    expect(offenders).toEqual([]);

    const view = readSource(
      'apps/frontend/src/components/public-saas/legal-document.tsx'
    );
    expect(view).toContain('ps-[24px]');
    expect(view).toContain('max-w-[70ch]');
  });

  test('degrades to a stated unavailable page when no language has the document', () => {
    const markup = renderToStaticMarkup(
      h(LegalDocumentView, { documentId: 'subprocessors', content: null })
    );

    expect(markup).toContain('Subprocessors');
    expect(markup).toContain(enBundle.public_saas_legal_unavailable_title);
    expect(markup).toContain(enBundle.public_saas_legal_unavailable_body);
    expect(markup).toContain('data-testid="legal-unavailable"');
  });

  test('keeps the legal pages inside the cf token vocabulary', () => {
    for (const file of legalSourceFiles) {
      const source = readSource(file);
      expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|text-white/);
      expect(source).not.toMatch(/customColor/);
    }
  });
});
