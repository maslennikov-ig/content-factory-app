'use strict';
require('reflect-metadata');
const { loadTypeScriptModule } = require('./load-ts-module.cjs');
const { loadWithMocks } = require('./load-ts-with-mocks.cjs');
const { loadPostsService } = require('./posts-service.module.cjs');
const { dependencyMocks } = require('./publication-v106.module.cjs');
const dispatcher = loadTypeScriptModule('libraries/nestjs-libraries/src/dtos/webhooks/ssrf.safe.dispatcher.ts');
const { PostsRepository } = loadWithMocks('libraries/nestjs-libraries/src/database/prisma/posts/posts.repository.ts', {
  '@contentfactory/nestjs-libraries/database/prisma/prisma.service': { PrismaRepository: class {}, PrismaTransaction: class {} },
});
const mocks = { ...dependencyMocks,
  '@contentfactory/nestjs-libraries/database/prisma/webhooks/webhooks.service': { WebhooksService: class {} },
  '@contentfactory/nestjs-libraries/database/prisma/notifications/notification.service': { NotificationService: class {}, NotificationType: {} },
  '@contentfactory/nestjs-libraries/integrations/refresh.integration.service': { RefreshIntegrationService: class {} },
  '@contentfactory/nestjs-libraries/database/prisma/integrations/integration.service': { IntegrationService: class {} },
  '@contentfactory/helpers/utils/timer': { timer: async () => {} },
  '@contentfactory/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher': dispatcher,
  '@contentfactory/nestjs-libraries/temporal/temporal.search.attribute': loadTypeScriptModule(
    'libraries/nestjs-libraries/src/temporal/temporal.search.attribute.ts'),
};

// A generic in-memory Prisma seam: the actual repository supplies every filter
// and selected field. Missing tenant/channel filters therefore admit foreign rows.
function matches(row, where) {
  return Object.entries(where).every(([key, value]) => value && typeof value === 'object'
    ? matches(row[key] || {}, value) : row[key] === value);
}
function project(row, select) {
  return Object.fromEntries(Object.entries(select).filter(([, value]) => value).map(([key, value]) =>
    [key, value === true ? row[key] : project(row[key], value.select)]));
}

function fixture() {
  const integration = { id: 'channel', organizationId: 'org', providerIdentifier: 'synthetic',
    name: 'Synthetic', picture: null, type: 'social', token: 'synthetic-sensitive-token' };
  const post = { id: 'local-post', organizationId: 'org', integrationId: 'channel', integration,
    content: 'Synthetic public text', publishDate: new Date('2000-01-01T00:00:00Z'),
    releaseId: 'remote-post', releaseURL: 'https://synthetic.invalid/published', state: 'PUBLISHED',
    deletedAt: null, parentPostId: null, publicationJournal: { syntheticSensitive: true } };
  const foreign = { ...post, id: 'foreign-post', organizationId: 'foreign', integrationId: 'foreign-channel',
    content: 'synthetic-sensitive-foreign-text', integration: { ...integration, id: 'foreign-channel', organizationId: 'foreign' } };
  const rows = [post, foreign];
  const queries = [];
  const lookup = (query, many) => {
    queries.push(query);
    const found = rows.filter(row => matches(row, query.where)).map(row => project(row, query.select));
    return many ? found : found[0] || null;
  };
  const repository = new PostsRepository({ model: { post: {
    findMany: async query => lookup(query, true), findFirst: async query => lookup(query, false),
  } } });
  const posts = Object.create(loadPostsService().PostsService.prototype);
  posts._postRepository = repository;
  const hooks = [ { organizationId: 'org', url: 'https://synthetic.invalid/hook', integrations: [] },
    { organizationId: 'foreign', url: 'https://synthetic.invalid/foreign', integrations: [] } ];
  const webhooks = { getWebhooks: async org => hooks.filter(hook => hook.organizationId === org) };
  const starts = [];
  const temporal = { client: { getRawClient: () => ({ workflow: {
    signalWithStart: async (...args) => starts.push(args),
  } }) } };
  const old = () => {
    const { PostActivity } = loadTypeScriptModule('apps/orchestrator/src/activities/post.activity.ts', mocks);
    return new PostActivity(posts, {}, {}, {}, {}, webhooks, temporal, {});
  };
  const current = () => {
    const { PostActivityV108 } = loadTypeScriptModule('apps/orchestrator/src/activities/post.activity.v108.ts', mocks);
    return new PostActivityV108(posts, webhooks, temporal);
  };
  return { rows, post, foreign, integration, repository, posts, hooks, queries, starts, old, current, dispatcher };
}

module.exports = { fixture, mocks, dispatcher };
