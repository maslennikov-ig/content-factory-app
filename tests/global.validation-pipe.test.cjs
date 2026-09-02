const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
require('reflect-metadata');

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

const { ValidationPipe } = require('@nestjs/common');

const { IntegrationFunctionDto } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/dtos/integrations/integration.function.dto.ts'
);

class VideoAbstract {}
Reflect.defineMetadata(
  'video',
  [{ available: true, identifier: 'test-video' }],
  VideoAbstract
);
const { VideoDto } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/dtos/videos/video.dto.ts',
  {
    '@contentfactory/nestjs-libraries/videos/video.interface': {
      VideoAbstract,
    },
  }
);

const { VideoFunctionDto } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/dtos/videos/video.function.dto.ts'
);
const { BillingSubscribeDto } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/dtos/billing/billing.subscribe.dto.ts'
);
const prismaMock = { Provider: { LOCAL: 'LOCAL' } };
const starterTemplateCatalog = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/dtos/auth/starter-template.ts'
);
const { CreateOrgUserDto } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/dtos/auth/create.org.user.dto.ts',
  {
    '@prisma/client': prismaMock,
    './starter-template': starterTemplateCatalog,
  }
);
const { LoginUserDto } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/dtos/auth/login.user.dto.ts',
  { '@prisma/client': prismaMock }
);
const { WebhooksDto } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/dtos/webhooks/webhooks.dto.ts',
  {
    '@contentfactory/nestjs-libraries/dtos/webhooks/webhook.url.validator': {
      IsSafeWebhookUrl: () => () => undefined,
    },
  }
);

const metadata = (metatype) => ({
  type: 'body',
  metatype,
  data: undefined,
});

const targetPipe = () =>
  new ValidationPipe({
    transform: true,
    whitelist: true,
  });

const billing = {
  period: 'MONTHLY',
  billing: 'STANDARD',
  utm: 'launch',
};
const createOrgUser = {
  password: 'valid-password-12',
  provider: 'LOCAL',
  providerToken: '',
  email: 'new@example.com',
  company: 'Example',
};
const loginUser = {
  password: 'secret',
  provider: 'LOCAL',
  providerToken: '',
  email: 'user@example.com',
  company: 'Provider workspace',
};
const webhook = {
  id: 'webhook-1',
  name: 'Publish complete',
  url: 'https://hooks.example.com/content-factory',
  integrations: [{ id: 'integration-1' }],
};

async function transform(pipe, metatype, value) {
  return pipe.transform(value, metadata(metatype));
}

async function loadInstalledGlobalPipe() {
  const installed = [];
  const app = {
    useGlobalPipes: (...pipes) => installed.push(...pipes),
    use: () => undefined,
    useGlobalFilters: () => undefined,
    listen: () => new Promise(() => undefined),
  };
  const logger = { log: () => undefined, warn: () => undefined, error: () => undefined };

  loadTypeScriptModule('apps/backend/src/main.ts', {
    '@contentfactory/nestjs-libraries/sentry/initialize.sentry': {
      initializeSentry: () => undefined,
    },
    '@contentfactory/helpers/swagger/load.swagger': {
      loadSwagger: () => undefined,
    },
    '@temporalio/worker': { Runtime: { install: () => undefined } },
    '@nestjs/common': { ...require('@nestjs/common'), Logger: logger },
    '@nestjs/core': { NestFactory: { create: async () => app } },
    './app.module': { AppModule: class {} },
    '@contentfactory/backend/services/auth/permissions/subscription.exception': {
      SubscriptionExceptionFilter: class {},
    },
    '@contentfactory/backend/api/routes/posts.validation.exception': {
      PostValidationExceptionFilter: class {},
    },
    '@contentfactory/nestjs-libraries/services/exception.filter': {
      HttpExceptionFilter: class {},
    },
    '@contentfactory/helpers/configuration/configuration.checker': {
      ConfigurationChecker: class {},
    },
    '@contentfactory/nestjs-libraries/chat/start.mcp': {
      startMcp: async () => undefined,
    },
    '@contentfactory/backend/cors.options': {
      buildBackendCorsOptions: () => ({}),
    },
    '@contentfactory/backend/api/routes/brand-voice.paste': {
      createVoicePasteBodyLimiter: () => (req, res, next) => next(),
    },
  });

  await new Promise((resolve) => setImmediate(resolve));
  expect(installed).toHaveLength(1);
  expect(installed[0]).toBeInstanceOf(ValidationPipe);
  return installed[0];
}

describe('global DTO whitelist compatibility', () => {
  test('the pipe installed by main strips an unknown DTO field without rejecting the request', async () => {
    const pipe = await loadInstalledGlobalPipe();
    const result = await transform(pipe, IntegrationFunctionDto, {
      name: 'refresh',
      id: 'integration-1',
      data: { token: { value: 'provider-owned' } },
      unexpected: 'remove-me',
    });

    expect(result).toEqual({
      name: 'refresh',
      id: 'integration-1',
      data: { token: { value: 'provider-owned' } },
    });
  });

  test.each([
    [
      'IntegrationFunctionDto.data',
      IntegrationFunctionDto,
      {
        name: 'refresh',
        id: 'integration-1',
        data: { token: { value: 'provider-owned' }, flags: ['a', 'b'] },
      },
    ],
    [
      'VideoDto.customParams',
      VideoDto,
      {
        type: 'test-video',
        output: 'vertical',
        customParams: { prompt: 'hello', media: [{ path: '/one.png' }] },
      },
    ],
    [
      'VideoFunctionDto.params',
      VideoFunctionDto,
      {
        identifier: 'test-video',
        functionName: 'preview',
        params: { frame: { index: 4 }, enabled: true },
      },
    ],
    ['BillingSubscribeDto.utm', BillingSubscribeDto, billing],
    ['CreateOrgUserDto declared fields', CreateOrgUserDto, createOrgUser],
    [
      'LoginUserDto provider fields',
      LoginUserDto,
      loginUser,
    ],
    ['WebhooksDto.id', WebhooksDto, webhook],
  ])('preserves %s and its nested provider payload', async (_name, dto, input) => {
    await expect(transform(targetPipe(), dto, input)).resolves.toEqual(input);
  });

  test.each([
    ['BillingSubscribeDto.utm', BillingSubscribeDto, billing, 'utm'],
    ['LoginUserDto.company', LoginUserDto, loginUser, 'company'],
    ['WebhooksDto.id', WebhooksDto, webhook, 'id'],
  ])('%s is optional but rejects a non-string value', async (_name, dto, input, field) => {
    const absent = { ...input };
    delete absent[field];
    await expect(transform(targetPipe(), dto, absent)).resolves.toEqual(absent);

    await expect(
      transform(targetPipe(), dto, { ...input, [field]: { invalid: true } })
    ).rejects.toMatchObject({ status: 400 });
  });

  test('strips a retired starterTemplate field from a stale registration request without rejecting it', async () => {
    // content-factory-next-pdbe removed the starter-template picker and its
    // DTO field. A tab left open from before the change can still submit the
    // old field; the pipe's `whitelist: true` must silently drop it, the same
    // way it already drops any other field the DTO does not declare.
    const result = await transform(targetPipe(), CreateOrgUserDto, {
      ...createOrgUser,
      starterTemplate: 'content-workflow',
    });

    expect(result).toEqual(createOrgUser);
    expect(result).not.toHaveProperty('starterTemplate');
  });

  test('keeps metatype Object unchanged because inline object contracts are not DTO-filtered', async () => {
    const input = { known: 'value', providerPayload: { arbitrary: true } };

    await expect(transform(targetPipe(), Object, input)).resolves.toBe(input);
  });
});
