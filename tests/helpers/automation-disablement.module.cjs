'use strict';

const { loadIntegrationService } = require('./integration-service.module.cjs');
const { loadWithMocks } = require('./load-ts-with-mocks.cjs');
const { loadTypeScriptModule } = require('./load-ts-module.cjs');
const { IntegrationService } = loadIntegrationService();

const input = { plugId: 'plug', postId: 'remote-post', delay: 10, totalRuns: 3, currentRun: 1 };
const internalInput = { post: 'remote-post', originalIntegration: 'source', integration: 'target',
  plugName: 'repost', orgId: 'org', delay: 10, information: { text: 'Synthetic content' } };

function fixture(repository) {
  const source = { id: 'source', organizationId: 'org', providerIdentifier: 'synthetic',
    disabled: false, deletedAt: null, token: 'synthetic-sensitive-token' };
  const target = { ...source, id: 'target' };
  const state = { plug: { id: 'plug', organizationId: 'org', activated: true,
    plugFunction: 'promote', data: JSON.stringify([{ name: 'text', value: 'Synthetic content' }]),
    integration: source }, source, target };
  const provider = { promote: jest.fn(async () => false), repost: jest.fn(async () => undefined) };
  const manager = {
    getSocialIntegration: jest.fn(() => provider),
    getAllPlugs: jest.fn(() => [{ identifier: 'synthetic', plugs: [{ methodName: 'promote' }] }]),
    getInternalPlugs: jest.fn(() => ({ internalPlugs: [{ identifier: 'repost', methodName: 'repost' }] })),
  };
  const repo = repository || {
    getPlug: jest.fn(async () => state.plug && structuredClone(state.plug)),
    getIntegrationById: jest.fn(async (org, id) => org === 'org' ? structuredClone(state[id] || null) : null),
  };
  const service = new IntegrationService(repo, {}, manager, {}, {}, {}, {});
  return { state, provider, manager, repo, service };
}

function activityFor(service) {
  const decorator = () => () => undefined;
  const mocks = {
    '@nestjs/common': { Injectable: decorator },
    'nestjs-temporal-core': { Activity: decorator, ActivityMethod: decorator, TemporalService: class {} },
  };
  for (const [request, name] of [
    ['database/prisma/posts/posts.service', 'PostsService'],
    ['database/prisma/notifications/notification.service', 'NotificationService'],
    ['database/prisma/integrations/integration.service', 'IntegrationService'],
    ['database/prisma/webhooks/webhooks.service', 'WebhooksService'],
    ['database/prisma/subscriptions/subscription.service', 'SubscriptionService'],
    ['integrations/integration.manager', 'IntegrationManager'],
    ['integrations/refresh.integration.service', 'RefreshIntegrationService'],
  ]) mocks['@contentfactory/nestjs-libraries/' + request] = { [name]: class {} };
  const { PostActivity } = loadWithMocks('apps/orchestrator/src/activities/post.activity.ts', mocks);
  const activity = Object.create(PostActivity.prototype);
  activity._integrationService = service;
  return activity;
}

// Actual workflow function and old activity, controlled clock/initial publication.
// This deliberately does not claim native Temporal replay or provider acceptance.
async function runScheduled(version, f, { kind = 'global', onWake = () => {}, extraGlobal = [] } = {}) {
  const activity = activityFor(f.service);
  const cachedPost = { id: 'post', organizationId: 'org', state: 'QUEUE', settings: '{}',
    publishDate: new Date('2000-01-01Z'), integration: structuredClone(f.state.source) };
  const calls = { wakes: 0, processPlug: 0, processInternalPlug: 0, scheduled: false };
  const receipt = [{ id: 'post', postId: 'remote-post', releaseURL: 'https://synthetic.invalid/post' }];
  const actions = {
    getPost: async () => cachedPost, getPostsList: async () => [cachedPost],
    getPostsListV106: async () => [cachedPost], postSocial: async () => receipt,
    postSocialV106: async () => receipt, updatePost: async () => {}, changeState: async () => {},
    inAppNotification: async () => {}, sendWebhooks: async () => {}, startPublicationStreakV106: async () => {},
    internalPlugs: async () => kind === 'internal' ? [{ ...internalInput, type: 'internal-plug' }] : [],
    globalPlugs: async () => {
      calls.scheduled = true;
      return kind === 'global' ? [{ plugId: input.plugId, type: 'global', delay: 10, totalRuns: 3 }, ...extraGlobal] : [];
    },
    processPlug: async (data) => { calls.processPlug++; return activity.processPlug(data); },
    processInternalPlug: async (data) => { calls.processInternalPlug++; return activity.processInternalPlug(data); },
  };
  const { ActivityFailure, ApplicationFailure } = require('@temporalio/common');
  const name = 'postWorkflowV10' + version;
  const workflow = loadTypeScriptModule(`apps/orchestrator/src/workflows/post-workflows/post.workflow.v1.0.${version}.ts`, {
    '@temporalio/workflow': {
      ActivityFailure, ApplicationFailure, defineSignal: n => n, setHandler: () => {},
      workflowInfo: () => ({ workflowId: 'post_fixture' }),
      sleep: async () => { if (calls.scheduled) { calls.wakes++; await onWake(calls.wakes); } },
      startChild: async () => { throw new Error('Unexpected repeat child'); },
      proxyActivities: () => new Proxy({}, { get: (_target, key) => async (...args) => {
        if (!actions[key]) throw new Error('Unexpected fixture activity: ' + String(key));
        return actions[key](...args);
      } }),
    },
    '@contentfactory/nestjs-libraries/services/make.is': { makeId: () => 'fixture-child' },
    '@contentfactory/nestjs-libraries/temporal/temporal.search.attribute': { postId: 'postId' },
  })[name];
  await workflow({ taskQueue: 'synthetic', postId: 'post', organizationId: 'org', postNow: true });
  return calls;
}

module.exports = { fixture, input, internalInput, runScheduled };
