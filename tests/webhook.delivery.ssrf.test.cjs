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

// The real dispatcher module, so the escape hatch is exercised as shipped
// rather than as a stub: `getSsrfSafeDispatcher` reads the environment on
// every call and hands back the pinning undici Agent, or `undefined` when a
// self-hoster has opted out.
const dispatcherModule = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/dtos/webhooks/ssrf.safe.dispatcher.ts',
  {
    './webhook.url.validator': loadTypeScriptModule(
      'libraries/nestjs-libraries/src/dtos/webhooks/webhook.url.validator.ts'
    ),
  }
);
const { ssrfSafeDispatcher, getSsrfSafeDispatcher } = dispatcherModule;

const noopDecorator = () => () => undefined;
const identityClassDecorator = () => (target) => target;

const { WebhookController } = loadTypeScriptModule(
  'apps/backend/src/api/routes/webhooks.controller.ts',
  {
    '@nestjs/common': {
      Body: noopDecorator,
      Controller: identityClassDecorator,
      Delete: noopDecorator,
      Get: noopDecorator,
      Param: noopDecorator,
      Post: noopDecorator,
      Put: noopDecorator,
      Query: noopDecorator,
    },
    '@nestjs/swagger': { ApiTags: identityClassDecorator },
    '@contentfactory/nestjs-libraries/user/org.from.request': {
      GetOrgFromRequest: noopDecorator,
    },
    '@contentfactory/nestjs-libraries/database/prisma/webhooks/webhooks.service':
      { WebhooksService: class {} },
    '@contentfactory/backend/services/auth/permissions/permissions.ability': {
      CheckPolicies: noopDecorator,
    },
    '@contentfactory/nestjs-libraries/dtos/webhooks/webhooks.dto': {
      OnlyURL: class {},
      UpdateDto: class {},
      WebhooksDto: class {},
    },
    '@contentfactory/backend/services/auth/permissions/permission.exception.class':
      {
        AuthorizationActions: { Create: 'create' },
        Sections: { WEBHOOKS: 'webhooks' },
      },
    '@contentfactory/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher':
      dispatcherModule,
  }
);

const { PostActivity } = loadTypeScriptModule(
  'apps/orchestrator/src/activities/post.activity.ts',
  {
    '@nestjs/common': { Injectable: identityClassDecorator },
    'nestjs-temporal-core': {
      Activity: identityClassDecorator,
      ActivityMethod: noopDecorator,
      TemporalService: class {},
    },
    '@contentfactory/nestjs-libraries/database/prisma/posts/posts.service': {
      PostsService: class {},
    },
    '@contentfactory/nestjs-libraries/database/prisma/notifications/notification.service':
      { NotificationService: class {}, NotificationType: {} },
    '@prisma/client': { State: {} },
    '@contentfactory/helpers/utils/strip.html.validation': {
      stripHtmlValidation: (value) => value,
    },
    '@contentfactory/nestjs-libraries/integrations/integration.manager': {
      IntegrationManager: class {},
    },
    '@contentfactory/nestjs-libraries/integrations/social/social.integrations.interface':
      {},
    '@contentfactory/nestjs-libraries/integrations/refresh.integration.service':
      { RefreshIntegrationService: class {} },
    '@contentfactory/helpers/utils/timer': { timer: async () => undefined },
    '@contentfactory/nestjs-libraries/database/prisma/integrations/integration.service':
      { IntegrationService: class {} },
    '@contentfactory/nestjs-libraries/database/prisma/webhooks/webhooks.service':
      { WebhooksService: class {} },
    '@temporalio/common': { TypedSearchAttributes: class {} },
    '@contentfactory/nestjs-libraries/temporal/temporal.search.attribute': {
      organizationId: 'organizationId',
      postId: 'postId',
    },
    '@contentfactory/nestjs-libraries/database/prisma/subscriptions/subscription.service':
      { SubscriptionService: class {} },
    '@contentfactory/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher':
      dispatcherModule,
  }
);

const WEBHOOK_URL = 'https://8.8.8.8/hook';

function postActivityWith(webhooks) {
  return new PostActivity(
    { getPostByForWebhookId: async () => ({ id: 'post-1' }) },
    {},
    {},
    {},
    {},
    { getWebhooks: async () => webhooks },
    {},
    {}
  );
}

describe('webhook delivery SSRF boundary', () => {
  const originalFetch = global.fetch;
  const originalDisable = process.env.DISABLE_SSRF_PROTECTION;
  let calls;

  beforeEach(() => {
    calls = [];
    global.fetch = async (url, options) => {
      calls.push({ url, options });
      return { status: 200, ok: true };
    };
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalDisable === undefined) {
      delete process.env.DISABLE_SSRF_PROTECTION;
    } else {
      process.env.DISABLE_SSRF_PROTECTION = originalDisable;
    }
  });

  test('POST /webhooks/send connects through the pinning dispatcher and never follows a redirect', async () => {
    delete process.env.DISABLE_SSRF_PROTECTION;
    const controller = new WebhookController({});

    await expect(
      controller.sendWebhook({ hello: 'world' }, { url: WEBHOOK_URL })
    ).resolves.toEqual({ send: true });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(WEBHOOK_URL);
    expect(calls[0].options.dispatcher).toBe(ssrfSafeDispatcher);
    expect(calls[0].options.redirect).toBe('manual');
    expect(calls[0].options.method).toBe('POST');
  });

  test('webhook delivery after publishing connects through the pinning dispatcher', async () => {
    delete process.env.DISABLE_SSRF_PROTECTION;
    const activity = postActivityWith([
      { url: WEBHOOK_URL, integrations: [] },
    ]);

    await activity.sendWebhooks('post-1', 'org-1', 'integration-1');

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(WEBHOOK_URL);
    expect(calls[0].options.dispatcher).toBe(ssrfSafeDispatcher);
    expect(calls[0].options.redirect).toBe('manual');
  });

  test('both call sites keep the documented DISABLE_SSRF_PROTECTION opt-out', async () => {
    process.env.DISABLE_SSRF_PROTECTION = 'true';
    expect(getSsrfSafeDispatcher()).toBeUndefined();

    await new WebhookController({}).sendWebhook({}, { url: WEBHOOK_URL });
    await postActivityWith([{ url: WEBHOOK_URL, integrations: [] }]).sendWebhooks(
      'post-1',
      'org-1',
      'integration-1'
    );

    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call.options.dispatcher).toBeUndefined();
      expect(call.options.redirect).toBe('manual');
    }
  });

  test('both call sites still swallow a delivery failure', async () => {
    global.fetch = async () => {
      throw new Error('connect ECONNREFUSED');
    };

    await expect(
      new WebhookController({}).sendWebhook({}, { url: WEBHOOK_URL })
    ).resolves.toEqual({ send: true });
    await expect(
      postActivityWith([{ url: WEBHOOK_URL, integrations: [] }]).sendWebhooks(
        'post-1',
        'org-1',
        'integration-1'
      )
    ).resolves.toBeUndefined();
  });
});
