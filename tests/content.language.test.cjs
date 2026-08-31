require('reflect-metadata');

const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { plainToInstance } = require('class-transformer');
const { validate } = require('class-validator');

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
  const evaluate = new Function(
    'exports',
    'require',
    'module',
    '__filename',
    '__dirname',
    compiled
  );
  const localRequire = (request) =>
    Object.prototype.hasOwnProperty.call(mocks, request)
      ? mocks[request]
      : require(request);
  evaluate(
    loaded.exports,
    localRequire,
    loaded,
    filename,
    path.dirname(filename)
  );
  return loaded.exports;
}

const { GeneratorDto } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/dtos/generator/generator.dto.ts'
);
const { AutopostDto } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/dtos/autopost/autopost.dto.ts',
  {
    '@contentfactory/nestjs-libraries/dtos/webhooks/webhook.url.validator': {
      IsSafeWebhookUrl: () => () => undefined,
    },
  }
);
const { IntegrationContentLanguageDto } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/dtos/integrations/integration.content.language.dto.ts'
);

const validGenerator = {
  research: 'A sufficiently long research topic',
  isPicture: false,
  format: 'one_long',
  tone: 'company',
};

const validAutopost = {
  title: 'Feed',
  content: '',
  lastUrl: '',
  onSlot: true,
  syncLast: true,
  url: 'https://example.com/feed.xml',
  active: true,
  addPicture: false,
  generateContent: true,
  integrations: [{ id: 'integration' }],
};

describe('content language contract', () => {
  test.each(['en', 'ru'])(
    'generator accepts the supported language %s',
    async (language) => {
      const dto = plainToInstance(GeneratorDto, {
        ...validGenerator,
        language,
      });

      await expect(validate(dto)).resolves.toEqual([]);
    }
  );

  test.each([undefined, 'de'])(
    'generator rejects an absent or unsupported language (%s)',
    async (language) => {
      const dto = plainToInstance(GeneratorDto, {
        ...validGenerator,
        ...(language === undefined ? {} : { language }),
      });
      const errors = await validate(dto);

      expect(errors.map((error) => error.property)).toContain('language');
    }
  );

  test.each(['en', 'ru'])(
    'autopost accepts the supported language %s',
    async (language) => {
      const dto = plainToInstance(AutopostDto, {
        ...validAutopost,
        language,
      });

      await expect(validate(dto)).resolves.toEqual([]);
    }
  );

  test.each([undefined, 'de'])(
    'autopost rejects an absent or unsupported language (%s)',
    async (language) => {
      const dto = plainToInstance(AutopostDto, {
        ...validAutopost,
        ...(language === undefined ? {} : { language }),
      });
      const errors = await validate(dto);

      expect(errors.map((error) => error.property)).toContain('language');
    }
  );

  test.each(['en', 'ru'])(
    'channel accepts the supported language %s',
    async (contentLanguage) => {
      const dto = plainToInstance(IntegrationContentLanguageDto, {
        contentLanguage,
      });

      await expect(validate(dto)).resolves.toEqual([]);
    }
  );

  test.each([undefined, 'de'])(
    'channel rejects an absent or unsupported language (%s)',
    async (contentLanguage) => {
      const dto = plainToInstance(IntegrationContentLanguageDto, {
        ...(contentLanguage === undefined ? {} : { contentLanguage }),
      });
      const errors = await validate(dto);

      expect(errors.map((error) => error.property)).toContain(
        'contentLanguage'
      );
    }
  );
});
