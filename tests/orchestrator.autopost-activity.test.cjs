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
    },
  }).outputText;
  const loaded = { exports: {} };
  const localRequire = (request) =>
    Object.prototype.hasOwnProperty.call(mocks, request)
      ? mocks[request]
      : require(request);
  localRequire.resolve = (request) =>
    request === './workflows'
      ? path.join(path.dirname(filename), 'workflows', 'index.ts')
      : require.resolve(request, { paths: [path.dirname(filename)] });
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

describe('orchestrator autopost activity registration', () => {
  test('registers the Temporal activity wrapper that exposes autoPost', () => {
    class PostActivity {}
    class AutopostActivity {}
    class AutopostDraftV2Activity {}
    class AutopostService {}
    class EmailActivity {}
    class EmailActivityV2 {}
    class IntegrationsActivity {}
    class AnalyticsActivityV1 {}
    class NewsletterActivityV1 {}
    class ContentLeadCheckActivity {}
    class DatabaseModule {}
    class HealthController {}
    let registeredActivities;

    loadTypeScriptModule('apps/orchestrator/src/app.module.ts', {
      '@nestjs/common': { Module: () => (target) => target },
      '@contentfactory/orchestrator/activities/post.activity': { PostActivity },
      '@contentfactory/orchestrator/activities/autopost.activity': {
        AutopostActivity,
      },
      '@contentfactory/orchestrator/activities/autopost-draft-v2.activity': {
        AutopostDraftV2Activity,
      },
      '@contentfactory/nestjs-libraries/temporal/temporal.module': {
        getTemporalModule(_isWorker, _workflows, activities) {
          registeredActivities = activities;
          return class TemporalModule {};
        },
      },
      '@contentfactory/nestjs-libraries/database/prisma/database.module': {
        DatabaseModule,
      },
      '@contentfactory/nestjs-libraries/database/prisma/autopost/autopost.service':
        {
          AutopostService,
        },
      '@contentfactory/orchestrator/activities/email.activity': {
        EmailActivity,
      },
      '@contentfactory/orchestrator/activities/email.activity.v2': {
        EmailActivityV2,
      },
      '@contentfactory/orchestrator/activities/integrations.activity': {
        IntegrationsActivity,
      },
      '@contentfactory/orchestrator/health.controller': { HealthController },
      '@contentfactory/orchestrator/activities/analytics.activity.v1': {
        AnalyticsActivityV1,
      },
      '@contentfactory/orchestrator/activities/newsletter.activity.v1': {
        NewsletterActivityV1,
      },
      '@contentfactory/orchestrator/activities/content-lead-check.activity': {
        ContentLeadCheckActivity,
      },
    });

    expect(registeredActivities).toContain(AutopostActivity);
    expect(registeredActivities).toContain(AutopostDraftV2Activity);
    expect(registeredActivities).not.toContain(AutopostService);
  });

  test('V2 activity forwards the trusted workflow tenant and id to the draft-only service path', async () => {
    const noOpDecorator = () => (target) => target;
    const { AutopostDraftV2Activity } = loadTypeScriptModule(
      'apps/orchestrator/src/activities/autopost-draft-v2.activity.ts',
      {
        '@nestjs/common': { Injectable: noOpDecorator },
        'nestjs-temporal-core': {
          Activity: noOpDecorator,
          ActivityMethod: noOpDecorator,
        },
        '@contentfactory/nestjs-libraries/database/prisma/autopost/autopost.service':
          {
            AutopostService: class {},
          },
      }
    );
    const calls = [];
    const activity = new AutopostDraftV2Activity({
      startAutopostDraftV2: async (organizationId, id) => {
        calls.push({ organizationId, id });
        return { type: 'draft' };
      },
    });

    await expect(
      activity.autoPostDraftV2({ id: 'autopost-1', organizationId: 'org-a' })
    ).resolves.toEqual({ type: 'draft' });
    expect(calls).toEqual([{ organizationId: 'org-a', id: 'autopost-1' }]);
  });

  test('V2 workflow propagates a permanent activity failure instead of sleeping for another pass', async () => {
    const sleep = jest.fn(async () => {
      throw new Error('workflow incorrectly continued');
    });
    const { autoPostDraftV2Workflow } = loadTypeScriptModule(
      'apps/orchestrator/src/workflows/autopost-draft-v2.workflow.ts',
      {
        '@temporalio/workflow': {
          proxyActivities: () => ({
            autoPostDraftV2: async () => {
              throw new Error('permanent activity failure');
            },
          }),
          sleep,
        },
      }
    );

    await expect(
      autoPostDraftV2Workflow({
        id: 'autopost-1',
        organizationId: 'org-a',
        immediately: true,
      })
    ).rejects.toThrow('permanent activity failure');
    expect(sleep).not.toHaveBeenCalled();
  });
});
