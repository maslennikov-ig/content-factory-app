'use strict';

const { loadTypeScriptModule } = require('./load-ts-module.cjs');
const BASE_TIME = Date.parse('2000-01-01T00:00:00Z');

async function runClockWorkflow(version, options = {}) {
  const elapsed = () => Date.now() - BASE_TIME;
  const advance = ms => jest.setSystemTime(Date.now() + ms);
  const calls = { sleeps: [], actions: [], children: [], payloads: [], names: [], webhooks: [], proxies: [] };
  const integration = { id: 'channel', organizationId: 'org', providerIdentifier: 'synthetic',
    name: 'Synthetic', disabled: false, token: 'synthetic-token' };
  const post = { id: 'post', organizationId: 'org', state: 'QUEUE', settings: '{}',
    publishDate: new Date(BASE_TIME + (options.publishAt || 0)), integration,
    intervalInDays: options.repeatAt === undefined ? 0 : options.repeatAt / 86400000,
    ...options.post };
  const receipts = [{ id: 'post', postId: 'remote-post', releaseURL: 'https://synthetic.invalid/post' }];
  let attempts = 0;
  class ApplicationFailure extends Error { constructor(type) { super(type); this.type = type; } }
  class ActivityFailure extends Error { constructor(type) { super(type); this.cause = new ApplicationFailure(type); } }
  const postSocial = async (...args) => {
    advance(options.publicationTime || 0);
    return options.publication ? options.publication(...args) : receipts;
  };
  const sendWebhooks = async (...args) => {
    calls.webhooks.push(args);
    advance(options.webhookTime || 0);
    return options.webhook ? options.webhook(...args) : undefined;
  };
  const actions = {
    getPost: async () => post, getPostsList: async () => [post], getPostsListV106: async () => [post],
    postSocial, postSocialV106: postSocial, startPublicationStreakV106: async () => {},
    inAppNotification: async () => {}, updatePost: async () => {}, changeState: async () => {},
    sendWebhooks, sendWebhooksV108: sendWebhooks,
    internalPlugs: async () => {
      advance(options.discoveryTime || 0);
      return options.internal || [];
    },
    globalPlugs: async () => options.global === undefined
      ? [{ type: 'global', plugId: 'global', delay: 1000, totalRuns: 3 }] : options.global,
    getIntegrationById: async () => integration,
    refreshTokenWithCause: async () => { advance(options.refreshTime || 0); return { accessToken: 'refreshed-synthetic' }; },
    processPlug: async data => {
      calls.payloads.push(data);
      calls.actions.push({ kind: 'global', id: data.plugId, at: elapsed() });
      advance(options.actionTime || 0);
      if (options.refreshFirst && attempts++ === 0) throw new ActivityFailure('refresh_token');
      return options.processPlug ? options.processPlug(data) : options.globalResult || false;
    },
    processInternalPlug: async data => {
      calls.payloads.push(data);
      calls.actions.push({ kind: 'internal', id: data.integration, at: elapsed() });
      advance(options.actionTime || 0);
    },
  };
  const name = 'postWorkflowV10' + version;
  const fn = loadTypeScriptModule(`apps/orchestrator/src/workflows/post-workflows/post.workflow.v1.0.${version}.ts`, {
    '@temporalio/workflow': {
      ActivityFailure, ApplicationFailure, defineSignal: n => n, setHandler: () => {},
      isCancellation: require('@temporalio/workflow').isCancellation,
      workflowInfo: () => ({ workflowId: 'post_fixture' }),
      sleep: async ms => {
        if (!Number.isFinite(ms) || ms < 0) throw new Error('Invalid fixture sleep: ' + ms);
        calls.sleeps.push(ms); advance(ms);
      },
      startChild: async (child, args) => { calls.children.push({ at: elapsed(), name: child.name, args }); },
      proxyActivities: settings => new Proxy({}, { get: (_target, key) => async (...args) => {
        calls.names.push(key);
        calls.proxies.push({ name: key, settings });
        if (!actions[key]) throw new Error('Unexpected clock fixture activity: ' + String(key));
        return actions[key](...args);
      } }),
    },
    '@contentfactory/nestjs-libraries/services/make.is': { makeId: () => 'fixture-child' },
    '@contentfactory/nestjs-libraries/temporal/temporal.search.attribute': loadTypeScriptModule(
      'libraries/nestjs-libraries/src/temporal/temporal.search.attribute.ts'),
  })[name];
  calls.result = await fn({ taskQueue: 'synthetic', postId: post.id, organizationId: post.organizationId,
    postNow: options.postNow === undefined ? true : options.postNow });
  return calls;
}

module.exports = { BASE_TIME, runClockWorkflow };
