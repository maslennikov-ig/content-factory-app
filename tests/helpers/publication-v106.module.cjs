'use strict';
require('reflect-metadata');
const { Prisma } = require('@prisma/client');
const { loadTypeScriptModule } = require('./load-ts-module.cjs');
const { loadWithMocks } = require('./load-ts-with-mocks.cjs');
const { loadPostsService } = require('./posts-service.module.cjs');
const { PostsRepository } = loadWithMocks('libraries/nestjs-libraries/src/database/prisma/posts/posts.repository.ts', {
  '@contentfactory/nestjs-libraries/database/prisma/prisma.service': { PrismaRepository: class {}, PrismaTransaction: class {} },
});
const { PUBLICATION_UNCERTAIN_V106 } = loadWithMocks('libraries/nestjs-libraries/src/database/prisma/posts/publication-store.v106.ts');
const decorator = () => () => undefined;
const dependencyMocks = {
  '@nestjs/common': { Injectable: decorator },
  'nestjs-temporal-core': { Activity: decorator, ActivityMethod: decorator, TemporalService: class {} },
  '@contentfactory/nestjs-libraries/database/prisma/posts/posts.service': { PostsService: class {} },
  '@contentfactory/nestjs-libraries/integrations/integration.manager': { IntegrationManager: class {} },
  '@contentfactory/nestjs-libraries/database/prisma/subscriptions/subscription.service': { SubscriptionService: class {} },
  '@contentfactory/helpers/utils/strip.html.validation': { stripHtmlValidation: (_editor, content) => content },
  '@contentfactory/nestjs-libraries/temporal/temporal.search.attribute': { organizationId: 'organizationId', postId: 'postId' },
};
const { PostActivityV106 } = loadTypeScriptModule('apps/orchestrator/src/activities/post.activity.v106.ts', dependencyMocks);

function memoryClient(initial = {}) {
  const row = { id: 'p1', organizationId: 'a', integrationId: 'channel-a',
    state: 'QUEUE', deletedAt: null, publicationJournal: null, releaseId: null,
    releaseURL: null, error: null, content: 'Synthetic post', settings: '{}', image: '[]',
    publishDate: new Date('2000-01-01Z'), ...initial };
  function matches(where) {
    return Object.entries(where).every(([k, v]) => {
      if (v && typeof v === 'object' && 'equals' in v) {
        return v.equals === Prisma.DbNull ? row[k] === null : JSON.stringify(row[k]) === JSON.stringify(v.equals);
      }
      if (v && typeof v === 'object' && 'in' in v) return v.in.includes(row[k]);
      return row[k] === v;
    });
  }
  return { row, post: {
    findFirst: async ({ where }) => matches(where) ? structuredClone(row) : null,
    updateMany: async ({ where, data }) => {
      if (!matches(where)) return { count: 0 };
      Object.assign(row, structuredClone(data));
      return { count: 1 };
    },
  } };
}

function fixture(client = memoryClient(), overrides = {}) {
  const integration = { id: 'channel-a', organizationId: 'a', internalId: 'synthetic',
    token: 'inert-fixture-token', providerIdentifier: 'synthetic', name: 'Synthetic', disabled: false };
  const receipts = [{ id: 'p1', postId: 'remote-1', releaseURL: 'https://synthetic.invalid/1', status: 'published' }];
  const key = { organizationId: 'a', postId: 'p1', integrationId: integration.id, operationId: 'initial' };
  const repository = new PostsRepository({ model: client });
  const service = Object.create(loadPostsService().PostsService.prototype);
  service._postRepository = repository;
  service.updateTags = async (_org, posts) => posts;
  service.updateMedia = async () => [];
  service.getPostsRecursively = async () => [{ ...client.row, integration }];
  const calls = { writes: 0, comments: 0, streak: 0 };
  const provider = {
    editor: 'normal',
    post: async (...args) => { calls.writes++; return overrides.write ? overrides.write(...args) : receipts; },
    comment: async (...args) => { calls.comments++; return overrides.comment ? overrides.comment(...args) : receipts; },
  };
  const temporal = { client: { getRawClient: () => ({ workflow: {
    start: async (...args) => { calls.streak++; if (overrides.streak) return overrides.streak(...args); },
    signalWithStart: overrides.signalWithStart || (async () => {}),
  } }) } };
  const activity = new PostActivityV106(service, { getSocialIntegration: () => provider }, {}, temporal);
  return { client, repository, service, integration, receipts, key, calls, provider, temporal, activity };
}

function workflow(actions, workflowId = 'post_p1') {
  const { ActivityFailure, ApplicationFailure } = require('@temporalio/common');
  return loadTypeScriptModule('apps/orchestrator/src/workflows/post-workflows/post.workflow.v1.0.6.ts', {
    '@temporalio/workflow': {
      ActivityFailure, ApplicationFailure, defineSignal: n => n, setHandler: () => {},
      workflowInfo: () => ({ workflowId }), sleep: async () => {},
      startChild: actions.startChild || (async () => {}),
      proxyActivities: options => new Proxy({}, { get: (_target, name) => async (...args) => {
        for (let attempt = 1; ; attempt++) {
          try { return await actions[name](...args); }
          catch (error) { if (error.nonRetryable || attempt >= options.retry.maximumAttempts) throw error; }
        }
      } }),
    },
    '@contentfactory/nestjs-libraries/services/make.is': { makeId: () => 'fixture-child' },
    '@contentfactory/nestjs-libraries/temporal/temporal.search.attribute': { postId: 'postId' },
  }).postWorkflowV106;
}

module.exports = { fixture, memoryClient, workflow, dependencyMocks, PUBLICATION_UNCERTAIN_V106 };
