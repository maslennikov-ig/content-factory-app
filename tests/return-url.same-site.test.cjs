/**
 * The address to come back to after signing in must be on this site.
 *
 * `ReturnUrlComponent` keeps `?returnUrl=` in `localStorage` and the layout
 * follows it with `window.location.href` after a successful sign-in. Any
 * absolute address used to qualify, which made the sign-in form an open
 * redirect: the password was typed on the real domain, the person landed
 * wherever the link said. Since the 04.09.2026 wave the invitation path puts
 * `returnUrl` on the ordinary route, so the check is held here.
 */
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const repositoryRoot = path.resolve(__dirname, '..');
const file = path.join(
  repositoryRoot,
  'apps/frontend/src/app/(app)/auth/return.url.component.tsx'
);

function loadComponentModule() {
  const source = fs.readFileSync(file, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.React,
    },
  }).outputText;
  const mocks = {
    react: { useCallback: (fn) => fn, useEffect: () => undefined },
    'next/navigation': { useSearchParams: () => new URLSearchParams() },
  };
  const loaded = { exports: {} };
  new Function('require', 'module', 'exports', compiled)(
    (request) => mocks[request] ?? require(request),
    loaded,
    loaded.exports
  );
  return loaded.exports;
}

describe('returnUrl stays on this site', () => {
  const { isSameSiteReturnUrl } = loadComponentModule();
  const origin = 'https://factory.example.test';

  test('accepts an address on the same origin', () => {
    expect(
      isSameSiteReturnUrl(`${origin}/join-org?org=a.b.c`, origin)
    ).toBe(true);
  });

  test.each([
    ['another site', 'https://evil.example/'],
    ['the same host over plain http', 'http://factory.example.test/'],
    ['a subdomain', 'https://x.factory.example.test/'],
    ['a scheme that is not a page', 'javascript:alert(1)'],
    ['a relative path', '/join-org'],
    ['nothing', ''],
  ])('refuses %s', (_, value) => {
    expect(isSameSiteReturnUrl(value, origin)).toBe(false);
  });

  test('the stored value is checked again when it is read back', () => {
    const source = fs.readFileSync(file, 'utf8');
    const getAndClear = source.slice(source.indexOf('getAndClear'));
    expect(getAndClear).toMatch(/isSameSiteReturnUrl\(data/);
  });
});
