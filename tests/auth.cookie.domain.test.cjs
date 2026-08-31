const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const repositoryRoot = path.resolve(__dirname, '..');

function loadTypeScriptModule(relativePath) {
  const filename = path.join(repositoryRoot, relativePath);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
      esModuleInterop: true,
    },
  }).outputText;
  const loaded = { exports: {} };
  new Function(
    'exports',
    'require',
    'module',
    '__filename',
    '__dirname',
    compiled
  )(loaded.exports, require, loaded, filename, path.dirname(filename));
  return loaded.exports;
}

const { getCookieUrlFromDomain } = loadTypeScriptModule(
  'libraries/helpers/src/subdomain/subdomain.management.ts'
);

beforeEach(() => {
  delete process.env.AUTH_COOKIE_DOMAIN;
});

afterAll(() => {
  delete process.env.AUTH_COOKIE_DOMAIN;
});

describe('cookie scope', () => {
  test('a subdomain deployment keeps its session to itself', () => {
    // The instance shares `aidevteam.ru` with unrelated products. A cookie
    // scoped to the registrable domain would be sent to all of them.
    expect(getCookieUrlFromDomain('https://factory.aidevteam.ru')).toBe(
      'factory.aidevteam.ru'
    );
    expect(getCookieUrlFromDomain('https://factory.aidevteam.ru')).not.toMatch(
      /^\./
    );
  });

  test('an apex deployment is unaffected', () => {
    expect(getCookieUrlFromDomain('https://example.com')).toBe('example.com');
  });

  test('localhost still works for development', () => {
    expect(getCookieUrlFromDomain('http://localhost:4200')).toBe('localhost');
  });

  test('a deployment that spans subdomains has to say so', () => {
    process.env.AUTH_COOKIE_DOMAIN = '.example.com';
    expect(getCookieUrlFromDomain('https://app.example.com')).toBe(
      '.example.com'
    );
  });
});
