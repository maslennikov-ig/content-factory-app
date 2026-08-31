'use strict';

const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { JSDOM } = require('jsdom');
const ts = require('typescript');

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/product',
  pretendToBeVisual: true,
});
for (const key of ['window', 'document', 'navigator']) {
  Object.defineProperty(global, key, {
    configurable: true,
    value: key === 'window' ? dom.window : dom.window[key],
  });
}
global.IS_REACT_ACT_ENVIRONMENT = true;

const { cleanup, fireEvent, render, screen } = require('@testing-library/react');

const repositoryRoot = path.resolve(__dirname, '..');
const cache = new Map();
const suffixes = ['', '.tsx', '.ts', '/index.tsx', '/index.ts'];

const copy = (key) =>
  ({
    navProduct: 'Product',
    navPlatforms: 'Platforms',
    navSecurity: 'Security',
    navDocs: 'Docs',
    navDemo: 'Demo',
    navSections: 'Sections',
    signIn: 'Sign in',
    signUp: 'Sign up',
    legalNav: 'Legal',
  })[key] ?? key;

const mocks = {
  'next/link': {
    __esModule: true,
    default: React.forwardRef(function TestLink(
      { href, children, ...props },
      ref
    ) {
      return React.createElement('a', { ref, href, ...props }, children);
    }),
  },
  'next/navigation': { usePathname: () => '/product' },
  // The theme switch is browser-only by design, so the shell loads it through
  // `next/dynamic`. The header contract is about the two actions on the right,
  // not about what the switch renders, so the loader is enough here.
  'next/dynamic': {
    __esModule: true,
    default: (_loader, options) =>
      function TestDynamic() {
        return options && options.loading ? options.loading() : null;
      },
  },
  '@contentfactory/frontend/components/ui/brand/cf-mark': {
    CfMark: () => React.createElement('span', { 'aria-hidden': true }),
  },
  '@contentfactory/frontend/components/layout/source.link': {
    SourceLink: (props) => React.createElement('a', props, 'Source'),
  },
  './legal-content': { LEGAL_DOCUMENTS: [], LEGAL_ROUTES: {} },
  './public-copy': { usePublicCopy: () => copy },
  // The language menu reaches into cookies, the variable context and the choice
  // menu primitives. None of that decides header geometry.
  './public-language': {
    PublicLanguage: () => React.createElement('span', null, 'Language'),
  },
};

function resolveLocal(fromDirectory, request) {
  let base;
  if (request.startsWith('.')) base = path.resolve(fromDirectory, request);
  else if (request.startsWith('@contentfactory/frontend/')) {
    base = path.join(
      repositoryRoot,
      'apps/frontend/src',
      request.slice('@contentfactory/frontend/'.length)
    );
  } else if (request.startsWith('@contentfactory/react/')) {
    // Same mapping `tsconfig.base.json` gives the applications, so a shared
    // primitive resolves here exactly as it does in the build.
    base = path.join(
      repositoryRoot,
      'libraries/react-shared-libraries/src',
      request.slice('@contentfactory/react/'.length)
    );
  } else return null;

  for (const suffix of suffixes) {
    const candidate = base + suffix;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  throw new Error(`Cannot resolve ${request} from ${fromDirectory}`);
}

function loadFile(filename) {
  if (cache.has(filename)) return cache.get(filename).exports;
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const loaded = { exports: {} };
  cache.set(filename, loaded);
  const localRequire = (request) => {
    if (Object.prototype.hasOwnProperty.call(mocks, request)) {
      return mocks[request];
    }
    const local = resolveLocal(path.dirname(filename), request);
    return local ? loadFile(local) : require(request);
  };
  new Function('require', 'module', 'exports', compiled)(
    localRequire,
    loaded,
    loaded.exports
  );
  return loaded.exports;
}

const buttonModule = () =>
  loadFile(
    path.join(
      repositoryRoot,
      'libraries/react-shared-libraries/src/form/button-link.tsx'
    )
  );
const publicShellPath = path.join(
  repositoryRoot,
  'apps/frontend/src/components/public-saas/public-shell.tsx'
);
const publicShellModule = () => loadFile(publicShellPath);
const homePartsModule = () =>
  loadFile(
    path.join(
      repositoryRoot,
      'apps/frontend/src/components/public-saas/home-parts.tsx'
    )
  );

afterEach(cleanup);

describe('public header actions', () => {
  // The header used to carry two Button-shaped links, "Sign in" and "Try demo".
  // The public page rebuild made the demo a demo and left one filled action:
  // signing up. Signing in became quiet text on purpose — a returning visitor's
  // errand, not the page's offer. The rule survives the redesign even though its
  // subject changed: the action a visitor is meant to press must take its
  // geometry from the shared landing control, never from pixels retyped here.
  test('draw the filled action from the shared landing control, not from inline geometry', () => {
    const { HEADER_ACTION, PRIMARY_FILL } = homePartsModule();
    const { PublicShell } = publicShellModule();

    render(
      React.createElement(
        PublicShell,
        null,
        React.createElement('p', null, 'Body')
      )
    );

    const signUp = screen.getByRole('link', { name: 'Sign up' });
    const signIn = screen.getByRole('link', { name: 'Sign in' });

    // The one filled action is exactly the shared constants, nothing appended.
    const expected = new Set(`${HEADER_ACTION} ${PRIMARY_FILL}`.split(/\s+/));
    expect(new Set(Array.from(signUp.classList))).toEqual(expected);

    for (const className of [
      'cf-control-h',
      'rounded-[8px]',
      'transition-colors',
      'duration-state',
      'motion-reduce:transition-none',
      'focus-visible:outline-cf-focus',
      'cf-pressed-fill',
    ]) {
      expect(signUp.classList.contains(className)).toBe(true);
    }

    // Quiet or filled, an action a keyboard reaches has to show where it is.
    expect(signIn.classList.contains('focus-visible:outline-cf-focus')).toBe(
      true
    );

    // `cf-control-h` is 44px on a phone and 40px from md up. A literal height on
    // a link would silently drop the mobile touch target back to 40px. The
    // reserved box the theme switch renders while loading is not a link and is
    // deliberately square, so it stays out of this.
    const literalHeight = Array.from(document.querySelectorAll('a'))
      .filter((node) => /\bh-\[\d+px\]/.test(node.className))
      .map((node) => node.textContent);
    expect(literalHeight).toEqual([]);
  });

  test('keeps an aria-disabled link out of navigation and the tab order', () => {
    const { ButtonLink } = buttonModule();
    const onClick = jest.fn();
    render(
      React.createElement(
        ButtonLink,
        { href: '/demo', disabled: true, onClick },
        'Unavailable demo'
      )
    );

    const link = screen.getByText('Unavailable demo');
    expect(link.getAttribute('aria-disabled')).toBe('true');
    expect(link.tabIndex).toBe(-1);
    expect(fireEvent.click(link)).toBe(false);
    expect(onClick).not.toHaveBeenCalled();
    expect(link.classList.contains('aria-disabled:pointer-events-none')).toBe(
      true
    );
  });
});
