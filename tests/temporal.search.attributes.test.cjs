const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const repositoryRoot = path.resolve(__dirname, '..');

function loadTypeScriptModule(relativePath, mocks = {}) {
  const filename = path.join(repositoryRoot, relativePath);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
      esModuleInterop: true,
      experimentalDecorators: true,
    },
  }).outputText;
  const loaded = { exports: {} };
  const localRequire = (request) =>
    Object.prototype.hasOwnProperty.call(mocks, request)
      ? mocks[request]
      : require(request);

  new Function(
    'exports',
    'require',
    'module',
    '__filename',
    '__dirname',
    compiled
  )(loaded.exports, localRequire, loaded, filename, path.dirname(filename));
  return loaded.exports;
}

const nestMocks = {
  '@nestjs/common': {
    Global: () => (target) => target,
    Injectable: () => (target) => target,
    Module: () => (target) => target,
  },
  'nestjs-temporal-core': {},
  '@temporalio/client': {},
};

// The definitions the workflows attach, loaded from source rather than
// restated here: a test that repeated them could not catch them drifting.
const searchAttributes = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/temporal/temporal.search.attribute.ts'
);

const { TemporalRegister } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/temporal/temporal.register.ts',
  {
    ...nestMocks,
    '@contentfactory/nestjs-libraries/temporal/temporal.search.attribute':
      searchAttributes,
  }
);

const KEYWORD = 2;
const TEXT = 1;

function registerWith(customAttributes) {
  const operatorService = {
    listSearchAttributes: jest.fn(async () => ({ customAttributes })),
    addSearchAttributes: jest.fn(async () => ({})),
  };
  const client = {
    client: {
      getRawClient: () => ({ connection: { operatorService } }),
    },
  };
  return { register: new TemporalRegister(client), operatorService };
}

beforeEach(() => {
  delete process.env.TEMPORAL_TLS;
  process.env.TEMPORAL_NAMESPACE = 'test-namespace';
});

afterAll(() => {
  delete process.env.TEMPORAL_NAMESPACE;
});

describe('Temporal search attribute registration', () => {
  test('both identifiers are keywords, not free text', () => {
    expect(searchAttributes.organizationId).toEqual({
      name: 'organizationId',
      type: 'KEYWORD',
    });
    expect(searchAttributes.postId).toEqual({
      name: 'postId',
      type: 'KEYWORD',
    });
  });

  test('registers what the namespace is missing', async () => {
    const { register, operatorService } = registerWith({});

    await register.onModuleInit();

    expect(operatorService.addSearchAttributes).toHaveBeenCalledWith({
      namespace: 'test-namespace',
      searchAttributes: { organizationId: KEYWORD, postId: KEYWORD },
    });
  });

  test.each([
    ['numeric enum', KEYWORD],
    ['short name', 'KEYWORD'],
    ['proto name', 'INDEXED_VALUE_TYPE_KEYWORD'],
  ])('accepts an already registered namespace (%s)', async (_label, value) => {
    const { register, operatorService } = registerWith({
      organizationId: value,
      postId: value,
    });

    await register.onModuleInit();

    expect(operatorService.addSearchAttributes).not.toHaveBeenCalled();
  });

  test('refuses to run against a namespace that typed them differently', async () => {
    // The pre-KEYWORD shape. Registration would report success and every
    // workflow start would then fail inside the SDK instead.
    const { register, operatorService } = registerWith({
      organizationId: TEXT,
      postId: TEXT,
    });

    await expect(register.onModuleInit()).rejects.toThrow(
      /organizationId, postId.*another type/is
    );
    expect(operatorService.addSearchAttributes).not.toHaveBeenCalled();
  });

  test('stays out of the way when TLS points at a managed cluster', async () => {
    process.env.TEMPORAL_TLS = 'true';
    const { register, operatorService } = registerWith({});

    await register.onModuleInit();

    expect(operatorService.listSearchAttributes).not.toHaveBeenCalled();
    expect(operatorService.addSearchAttributes).not.toHaveBeenCalled();
  });
});
