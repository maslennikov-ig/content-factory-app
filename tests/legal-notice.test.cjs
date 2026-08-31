/**
 * The notice shown where personal data is actually collected.
 *
 * Registration writes an email address, a bcrypt hash and the caller's IP to
 * the database before an administrator approves anything. On the running
 * instance the form said none of that and linked to none of the three legal
 * documents the same product was publishing at /terms, /privacy and
 * /subprocessors — because the notice hid itself whenever
 * NEXT_PUBLIC_TERMS_URL and NEXT_PUBLIC_PRIVACY_URL were empty, and nobody had
 * filled them in. An empty variable is not the same fact as an absent document,
 * and this suite holds the two apart.
 */

const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/auth',
});

for (const key of Object.getOwnPropertyNames(dom.window)) {
  if (key in global) continue;
  Object.defineProperty(global, key, {
    configurable: true,
    get: () => dom.window[key],
  });
}
for (const key of ['window', 'document', 'navigator']) {
  Object.defineProperty(global, key, {
    configurable: true,
    value: key === 'window' ? dom.window : dom.window[key],
  });
}
global.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const ts = require('typescript');
const { cleanup, render, screen } = require('@testing-library/react');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const repositoryRoot = path.resolve(__dirname, '..');
const noticeFile = path.join(
  repositoryRoot,
  'apps/frontend/src/components/auth/legal.notice.tsx'
);

// The real resolver, not a stand-in: the whole defect lived in what an empty
// variable resolves to.
const legalLinks = loadTypeScriptModule(
  'apps/frontend/src/components/auth/legal-links.ts'
);

const loadNotice = (variables) => {
  const compiled = ts.transpileModule(fs.readFileSync(noticeFile, 'utf8'), {
    fileName: noticeFile,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;

  const mocks = {
    '@contentfactory/react/helpers/variable.context': {
      useVariables: () => variables,
    },
    '@contentfactory/react/translation/get.transation.service.client': {
      useT: () => (_key, fallback) => fallback,
    },
    './legal-links': legalLinks,
  };

  const loaded = { exports: {} };
  new Function(
    'require',
    'module',
    'exports',
    compiled
  )((request) => mocks[request] ?? require(request), loaded, loaded.exports);
  return loaded.exports.LegalNotice;
};

afterEach(cleanup);

describe('registration legal notice', () => {
  test('links to the product’s own documents when the deployment sets nothing', () => {
    const LegalNotice = loadNotice({ termsUrl: '', privacyUrl: '' });
    render(React.createElement(LegalNotice));

    expect(
      screen.getByRole('link', { name: 'Terms of Service' }).getAttribute('href')
    ).toBe('/terms');
    expect(
      screen.getByRole('link', { name: 'Privacy Policy' }).getAttribute('href')
    ).toBe('/privacy');
  });

  test('an operator hosting their own documents still wins', () => {
    const LegalNotice = loadNotice({
      termsUrl: 'https://example.test/tos',
      privacyUrl: 'https://example.test/privacy',
    });
    render(React.createElement(LegalNotice));

    expect(
      screen.getByRole('link', { name: 'Terms of Service' }).getAttribute('href')
    ).toBe('https://example.test/tos');
    expect(
      screen.getByRole('link', { name: 'Privacy Policy' }).getAttribute('href')
    ).toBe('https://example.test/privacy');
  });

  test('names what registration stores and that approval does not stop it', () => {
    const LegalNotice = loadNotice({ termsUrl: '', privacyUrl: '' });
    const { container } = render(React.createElement(LegalNotice));
    const text = container.textContent;

    expect(text).toContain('email address');
    expect(text).toContain('hash of your password');
    expect(text).toContain('IP address');
    expect(text).toContain('approves it');
  });
});
