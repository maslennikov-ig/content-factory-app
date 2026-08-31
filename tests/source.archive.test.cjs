const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const ts = require('typescript');

const repositoryRoot = path.resolve(__dirname, '..');
const read = (relativePath) =>
  fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');

const git = (...args) =>
  execFileSync('git', args, { cwd: repositoryRoot, encoding: 'utf8' });

/**
 * The AGPL-3.0 section 13 source offer.
 *
 * This deployment is reachable over a network, so it owes every user the
 * Corresponding Source of the exact version answering them — which a repository
 * branch cannot be, since it moves on. The product therefore serves its own
 * source. Three things have to hold for that to be a real offer rather than a
 * claim:
 *
 *   1. the archive is the deployed commit, and carries no secret and no history
 *   2. the route answers someone with no session
 *   3. the link is somewhere a person actually looks
 *
 * One test each, plus the file-name contract that ties the build script, the
 * Dockerfile and the controller together — three files that must agree on one
 * path and have no compiler to tell them when they stop agreeing.
 */

const loadTypeScriptModule = (relativePath, mocks = {}) => {
  const filename = path.join(repositoryRoot, relativePath);
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      experimentalDecorators: true,
    },
  });
  const loaded = { exports: {} };
  const localRequire = (request) =>
    Object.prototype.hasOwnProperty.call(mocks, request)
      ? mocks[request]
      : require(request);

  new Function('require', 'module', 'exports', outputText)(
    localRequire,
    loaded,
    loaded.exports
  );
  return loaded.exports;
};

/**
 * Nest's decorators are metadata this test has no use for, and importing the
 * real package would drag the whole framework in for four pure functions.
 */
const passthroughDecorator = () => () => undefined;
const loadSourceController = () =>
  loadTypeScriptModule('apps/backend/src/api/routes/source.controller.ts', {
    '@nestjs/common': {
      Controller: passthroughDecorator,
      Get: passthroughDecorator,
      Header: passthroughDecorator,
      HttpException: class HttpException extends Error {
        constructor(message, status) {
          super(message);
          this.status = status;
        }
      },
      StreamableFile: class StreamableFile {
        constructor(stream, options) {
          this.stream = stream;
          this.options = options;
        }
      },
    },
    '@nestjs/swagger': { ApiTags: passthroughDecorator },
  });

/** The controller lists in api.module.ts, read from the syntax tree. */
const controllerLists = () => {
  const filename = path.join(
    repositoryRoot,
    'apps/backend/src/api/api.module.ts'
  );
  const source = ts.createSourceFile(
    filename,
    fs.readFileSync(filename, 'utf8'),
    ts.ScriptTarget.Latest,
    true
  );
  const lists = {};
  const names = (node) =>
    node.elements
      .map((element) =>
        ts.isIdentifier(element)
          ? element.text
          : ts.isSpreadElement(element) && ts.isIdentifier(element.expression)
          ? `...${element.expression.text}`
          : null
      )
      .filter(Boolean);

  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isArrayLiteralExpression(node.initializer)
    ) {
      lists[node.name.text] = names(node.initializer);
    }
    if (
      ts.isPropertyAssignment(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'controllers' &&
      ts.isArrayLiteralExpression(node.initializer)
    ) {
      lists.controllers = names(node.initializer);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return lists;
};

describe('Corresponding Source offer', () => {
  test('the archive is the deployed commit, without secrets, history or tooling', () => {
    // The one that matters. `git archive` carries tracked files only, so no
    // .env can reach it, and it carries a tree rather than a history, so the
    // personal e-mail address in the commit log never becomes public.
    for (const directory of ['.beads', '.codex', '.claude']) {
      expect(git('check-attr', 'export-ignore', '--', directory).trim()).toBe(
        `${directory}: export-ignore: set`
      );
    }

    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-source-'));
    const archive = path.join(workspace, 'archive.tar.gz');
    try {
      // The same prefix shape the release script uses, so the assertions below
      // read paths the way a person unpacking the published archive sees them.
      git('archive', '--format=tar.gz', '--prefix=cf/', '-o', archive, 'HEAD');
      const entries = execFileSync('tar', ['-tzf', archive], {
        encoding: 'utf8',
      })
        .split('\n')
        .filter(Boolean);

      const excluded = entries.filter((entry) =>
        /(^|\/)\.(beads|codex|claude)\//.test(entry)
      );
      expect(excluded).toEqual([]);

      // `.env.example` is a committed template and belongs in the source; a
      // real `.env` is untracked and cannot be here at all.
      const envFiles = entries.filter((entry) =>
        /(^|\/)\.env(\.|$)/.test(entry)
      );
      expect(envFiles).toEqual(['cf/.env.example']);

      // Nothing that would hand over the repository's history.
      expect(entries.filter((entry) => /(^|\/)\.git\//.test(entry))).toEqual(
        []
      );

      // What a person needs in order to rebuild this version.
      const required = [
        'LICENSE',
        'README.md',
        'package.json',
        'pnpm-lock.yaml',
        'Dockerfile',
        'libraries/nestjs-libraries/src/database/prisma/schema.prisma',
      ];
      const stripped = new Set(
        entries.map((entry) => entry.replace(/^cf\//, ''))
      );
      for (const file of required) expect(stripped.has(file)).toBe(true);
    } finally {
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  }, 120000);

  test('answers a visitor with no session', () => {
    const lists = controllerLists();

    // Registered, and outside the list the auth middleware is applied to. A
    // future author moving it into that list turns the licence offer into a
    // members-only page, which is the failure this asserts against.
    expect(lists.controllers).toContain('SourceController');
    expect(lists.authenticatedController).not.toContain('SourceController');
    expect(lists.controllers).toContain('...authenticatedController');

    // Nothing in the controller itself asks for a user, an organization or a
    // permission either.
    const controller = read('apps/backend/src/api/routes/source.controller.ts');
    expect(controller).not.toMatch(
      /CheckPolicies|UseGuards|AuthMiddleware|GetOrgFromRequest|@Req\b/
    );

    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-source-'));
    try {
      const manifest = {
        commit: 'a'.repeat(40),
        shortCommit: 'a'.repeat(12),
        archive: 'content-factory-source.tar.gz',
        downloadName: `content-factory-${'a'.repeat(12)}.tar.gz`,
        bytes: 10485760,
        sha256: 'b'.repeat(64),
        builtAt: '2026-08-17T00:00:00Z',
      };
      fs.writeFileSync(
        path.join(workspace, 'source.json'),
        JSON.stringify(manifest)
      );
      fs.writeFileSync(path.join(workspace, manifest.archive), 'archive');

      process.env.SOURCE_ARCHIVE_DIRECTORY = workspace;
      const module = loadSourceController();
      const controllerInstance = new module.SourceController();

      const page = controllerInstance.page();
      expect(page).toContain(manifest.commit);
      expect(page).toContain(manifest.sha256);
      expect(page).toContain('AGPL');

      const file = controllerInstance.archive();
      expect(file.options).toMatchObject({
        type: 'application/gzip',
        length: manifest.bytes,
      });
      expect(file.options.disposition).toContain(manifest.downloadName);
      // Nothing consumes the stream here, and this workspace is about to go
      // away underneath it. Nest owns that error in production; this test only
      // has to stop an orphaned handle taking the runner down with it.
      file.stream.on('error', () => undefined);
      file.stream.destroy();

      // An image built without the archive says so rather than serving a page
      // that offers nothing, or a download that dies inside the framework.
      process.env.SOURCE_ARCHIVE_DIRECTORY = path.join(workspace, 'absent');
      expect(() => controllerInstance.page()).toThrow(/source archive/i);
      expect(() => controllerInstance.archive()).toThrow(/source archive/i);

      fs.rmSync(path.join(workspace, manifest.archive));
      process.env.SOURCE_ARCHIVE_DIRECTORY = workspace;
      expect(() => controllerInstance.page()).toThrow(/source archive/i);

      // The public address is the one nginx publishes, not the internal path.
      expect(
        module.publicSourceUrl({
          NEXT_PUBLIC_BACKEND_URL: 'https://example.test/api/',
        })
      ).toBe('https://example.test/api/public/source');
    } finally {
      delete process.env.SOURCE_ARCHIVE_DIRECTORY;
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });

  test('offers the link where a person looks, signed in or not', () => {
    // Without a session: the public footer, on every public page, beside the
    // licence. That is where a legal offer is looked for, and a stranger with
    // no account is exactly who section 13 is about.
    const shell = read(
      'apps/frontend/src/components/public-saas/public-shell.tsx'
    );
    expect(shell.slice(shell.indexOf('<footer'))).toMatch(/<SourceLink\b/);

    // Signed in: Settings → About, together with the version the offer is an
    // offer *of*. The tab has to be registered as well as rendered, or the
    // panel is unreachable.
    const settings = read(
      'apps/frontend/src/components/layout/settings.component.tsx'
    );
    expect(settings).toContain("tab: 'about'");
    expect(settings).toContain('<AboutProjectComponent />');
    expect(
      read('apps/frontend/src/components/settings/about-project.component.tsx')
    ).toMatch(/<SourceLink\b/);

    // And nowhere it was shouting. The persistent rail put a licence errand
    // beside the product's own navigation on every signed-in screen, and the
    // sign-in column gave it a place of its own on the one screen whose single
    // job is signing in. Both are reachable now without being sold.
    expect(
      read('apps/frontend/src/components/new-layout/sidebar.tsx')
    ).not.toMatch(/<SourceLink\b/);
    expect(read('apps/frontend/src/app/(app)/auth/layout.tsx')).not.toMatch(
      /<SourceLink\b/
    );

    const link = read('apps/frontend/src/components/layout/source.link.tsx');
    expect(link).toContain('/public/source');

    // The FAQ answer used to state the licence and stop there, which is the gap
    // that made this work necessary.
    const faq = read('apps/frontend/src/components/billing/faq.component.tsx');
    expect(faq).toContain('sourceHref');
    expect(faq).toContain('faq_download_the_source');

    const locales = path.join(
      repositoryRoot,
      'libraries/react-shared-libraries/src/translation/locales'
    );
    for (const locale of fs.readdirSync(locales)) {
      const file = path.join(locales, locale, 'translation.json');
      if (!fs.existsSync(file)) continue;
      const translations = JSON.parse(fs.readFileSync(file, 'utf8'));
      for (const key of [
        'source_code',
        'source_code_hint',
        'faq_download_the_source',
      ]) {
        expect(typeof translations[key]).toBe('string');
        expect(translations[key].trim()).not.toBe('');
      }
      expect(translations.faq_we_are_proudly_open_source).toMatch(
        /AGPL[- ]?3\.0/
      );
    }
  });

  test('build script, image and controller agree on one path', () => {
    const script = read('scripts/release/make-source-archive.sh');
    const dockerfile = read('Dockerfile');
    const controller = read('apps/backend/src/api/routes/source.controller.ts');

    // Three files, no compiler between them. A rename in one of them and the
    // image builds a Source page that cannot find its own archive.
    for (const file of ['content-factory-source.tar.gz', 'source.json']) {
      expect(script).toContain(file);
      expect(dockerfile).toContain(`var/source/${file}`);
    }
    expect(controller).toContain("'source.json'");
    expect(controller).toContain("'var', 'source'");

    // The archive must be the commit, and the image is built from the working
    // tree, so a tree that differs from HEAD has to stop the release. The rule
    // moved into `tree-differences.sh` on 30.08.2026 — the suite receipt rests
    // on the same fact from the other side — so follow it there rather than
    // letting this assertion pass on a script that no longer checks anything.
    expect(script).toContain('tree-differences.sh');
    expect(script).toMatch(/exit 1/);

    const shared = read('scripts/release/tree-differences.sh');
    expect(shared).toContain('git status --porcelain');
    // `var/docker` is not excluded: the image runs what is in it.
    expect(shared).toContain("':(exclude,top)var/source'");
    expect(shared).not.toMatch(/':\(exclude,top\)var'/);

    // The archive is ignored rather than committed: it contains the tree.
    expect(read('.gitignore')).toContain('/var/source/');
  });
});
