const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function loadTypeScriptModule(relativePath, mocks = {}) {
  const filename = path.resolve(__dirname, '..', relativePath);
  const source = fs.readFileSync(filename, 'utf8');
  const compiled = ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
      esModuleInterop: true,
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
    },
  }).outputText;
  const loaded = { exports: {} };
  const localRequire = (request) =>
    Object.prototype.hasOwnProperty.call(mocks, request)
      ? mocks[request]
      : require(request);
  const evaluate = new Function(
    'exports',
    'require',
    'module',
    '__filename',
    '__dirname',
    compiled
  );
  evaluate(
    loaded.exports,
    localRequire,
    loaded,
    filename,
    path.dirname(filename)
  );
  return loaded.exports;
}

const integrationUpdate = jest.fn();

const { IntegrationRepository } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/database/prisma/integrations/integration.repository.ts',
  {
    '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
      PrismaRepository: class {},
    },
    '@contentfactory/nestjs-libraries/upload/upload.factory': {
      UploadFactory: {
        createStorage: () => ({ uploadSimple: jest.fn() }),
      },
    },
    '@contentfactory/nestjs-libraries/dtos/integrations/integration.time.dto': {
      IntegrationTimeDto: class {},
    },
    '@contentfactory/nestjs-libraries/dtos/plugs/plug.dto': {
      PlugDto: class {},
    },
    '@contentfactory/nestjs-libraries/services/make.is': {
      makeId: () => 'generated-id',
    },
  }
);

const repository = new IntegrationRepository(
  { model: { integration: { update: integrationUpdate } } },
  {},
  {},
  {},
  {},
  {}
);

describe('per-channel content language persistence', () => {
  beforeEach(() => {
    integrationUpdate.mockReset();
    integrationUpdate.mockResolvedValue({
      id: 'channel-1',
      contentLanguage: 'ru',
    });
  });

  test('updates only a channel owned by the current organization', async () => {
    await repository.updateContentLanguage('organization-1', 'channel-1', 'ru');

    expect(integrationUpdate).toHaveBeenCalledWith({
      where: {
        id: 'channel-1',
        organizationId: 'organization-1',
      },
      data: {
        contentLanguage: 'ru',
      },
      select: {
        id: true,
        contentLanguage: true,
      },
    });
  });
});
