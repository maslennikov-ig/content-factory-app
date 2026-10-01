const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const striptags = require('striptags');
const corpus = require('./fixtures/html-extraction-corpus.json');
const frozen = require('./fixtures/html-extraction-legacy.json');
const { spawnSync } = require('node:child_process');

const findDepth = new Function('element', frozen.findDepthBody);
const oldExtract = new Function(
  'JSDOM',
  'findDepth',
  'load',
  frozen.extractBody
);
const oldAutopost = new Function(
  'JSDOM',
  'striptags',
  'html',
  frozen.autopostBody
);
const safeFetch = jest.fn();
const paths = {
  extract: 'libraries/nestjs-libraries/src/openai/extract.content.service.ts',
  autopost:
    'libraries/nestjs-libraries/src/database/prisma/autopost/autopost.service.ts',
  helper: 'libraries/helpers/src/utils/html.extraction.ts',
};

// Execute the real TS services/helper; unrelated DI/AI dependencies cannot run.
function load(relativePath, rejectJsdom = false) {
  const filename = path.resolve(__dirname, '..', relativePath);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
      esModuleInterop: true,
      experimentalDecorators: true,
    },
  }).outputText;
  const module = { exports: {} };
  const localRequire = (request) => {
    if (request === 'jsdom') {
      if (rejectJsdom) throw new Error('Production HTML path loaded JSDOM');
      return { JSDOM };
    }
    if (request === '@contentfactory/helpers/utils/html.extraction')
      return load(paths.helper, rejectJsdom);
    if (request.endsWith('/ssrf.safe.fetch'))
      return { fetchSafePublicHttpsUrl: safeFetch };
    if (
      [
        'parse5',
        'parse5/lib/tree-adapters/default',
        'striptags',
        'dayjs',
        'zod',
        '@nestjs/common',
      ].includes(request)
    )
      return require(request);
    if (request === 'rss-parser') return class {};
    if (
      request.startsWith('@contentfactory/') ||
      request.startsWith('@langchain/') ||
      ['nestjs-temporal-core', '@temporalio/common', '@prisma/client'].includes(
        request
      )
    ) {
      return new Proxy(
        {},
        { get: (_target, key) => (key === '__esModule' ? false : class {}) }
      );
    }
    throw new Error(`Unexpected dependency ${request}`);
  };
  new Function(
    'exports',
    'require',
    'module',
    '__filename',
    '__dirname',
    compiled
  )(module.exports, localRequire, module, filename, path.dirname(filename));
  return module.exports;
}

const { ExtractContentService } = load(paths.extract);
const { AutopostService } = load(paths.autopost);
const url = 'https://fixture.example/article';
const encoded = (value) =>
  value === undefined ? { type: 'undefined' } : { type: 'string', value };
beforeEach(() => safeFetch.mockReset());

describe('legacy-compatible HTML services: frozen image438 oracle', () => {
  test.each(corpus)('ExtractContentService: $id', async ({ id, html }) => {
    safeFetch.mockResolvedValue({ text: async () => html });
    const oracle = oldExtract(JSDOM, findDepth, html);
    expect(encoded(oracle)).toEqual(
      frozen.savedOracleResults.find((row) => row.id === id).extractExpected
    );
    expect(await new ExtractContentService().extractContent(url)).toBe(oracle);
    expect(safeFetch).toHaveBeenCalledTimes(1);
    expect(safeFetch).toHaveBeenCalledWith(url);
  });
  test.each(corpus)('AutopostService.loadUrl: $id', async ({ id, html }) => {
    safeFetch.mockResolvedValue({ text: async () => html });
    const oracle = oldAutopost(JSDOM, striptags, html);
    expect(encoded(oracle)).toEqual(
      frozen.savedOracleResults.find((row) => row.id === id).autopostExpected
    );
    expect(await new AutopostService().loadUrl(url)).toBe(oracle);
    expect(safeFetch).toHaveBeenCalledTimes(1);
    expect(safeFetch).toHaveBeenCalledWith(url);
  });
  test('extraction propagates safe-fetch failure unchanged', async () => {
    const error = new Error('Unsafe URL');
    safeFetch.mockRejectedValue(error);
    await expect(new ExtractContentService().extractContent(url)).rejects.toBe(
      error
    );
  });
  test('extraction propagates response-text failure unchanged', async () => {
    const error = new Error('Read failed');
    safeFetch.mockResolvedValue({
      text: async () => {
        throw error;
      },
    });
    await expect(new ExtractContentService().extractContent(url)).rejects.toBe(
      error
    );
  });
  test.each(['fetch', 'text'])(
    'autopost returns empty string for %s failure',
    async (where) => {
      const error = new Error('Fixture failure');
      if (where === 'fetch') safeFetch.mockRejectedValue(error);
      else
        safeFetch.mockResolvedValue({
          text: async () => {
            throw error;
          },
        });
      expect(await new AutopostService().loadUrl(url)).toBe('');
    }
  );
  test.each(['extract', 'autopost'])(
    '%s production import closure rejects any JSDOM load',
    (service) => {
      expect(() => load(paths[service], true)).not.toThrow();
    }
  );
});

describe('shared pure helper boundary', () => {
  test('version-bound default adapter exists and other parse5 callers are unchanged', () => {
    expect(require('parse5/package.json').version).toBe('6.0.1');
    const parse5 = require('parse5');
    const adapter = require('parse5/lib/tree-adapters/default');
    const insertion = adapter.insertTextBefore;
    const html = corpus.find((row) => row.id === 'table-foster-parenting').html;
    const original = parse5.serialize(parse5.parse(html));
    const helper = load(paths.helper, true);
    helper.extractHeadingHtmlText(html);
    helper.extractAutopostHtmlText(html);
    expect(adapter.insertTextBefore).toBe(insertion);
    expect(parse5.serialize(parse5.parse(html))).toBe(original);
  });
  test.each(corpus)(
    'pure helper matches frozen JSDOM oracle: $id',
    ({ html }) => {
      const helper = load(paths.helper, true);
      expect(helper.extractHeadingHtmlText(html)).toBe(
        oldExtract(JSDOM, findDepth, html)
      );
      expect(helper.extractAutopostHtmlText(html)).toBe(
        oldAutopost(JSDOM, striptags, html)
      );
    }
  );
  test('fresh helper import and execution load zero JSDOM modules, including transitive edges', () => {
    const script = `
      const fs=require('node:fs'),ts=require('typescript'),Module=require('node:module');
      const filename=${JSON.stringify(
        path.resolve(__dirname, '..', paths.helper)
      )};
      const realLoad=Module._load;
      Module._load=function(request,...args){if(request==='jsdom'||request.includes('/jsdom/'))throw new Error('JSDOM loaded');return realLoad.call(this,request,...args)};
      const compiled=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
      const loaded={exports:{}};
      new Function('exports','require','module',compiled)(loaded.exports,require,loaded);
      if(loaded.exports.extractHeadingHtmlText('<h1>A</h1>')!=='A')throw new Error('Extraction changed');
      if(loaded.exports.extractAutopostHtmlText('<p>B</p>')!=='B')throw new Error('Body changed');
      if(Object.keys(require.cache).some(file=>file.includes('/jsdom/')))throw new Error('JSDOM retained');
    `;
    const result = spawnSync(process.execPath, ['-e', script], {
      cwd: path.resolve(__dirname, '..'),
      encoding: 'utf8',
    });
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
  });
});
