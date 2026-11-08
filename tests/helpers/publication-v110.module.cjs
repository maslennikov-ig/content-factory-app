'use strict';
const previous = require('./publication-v109.module.cjs');
const { loadTypeScriptModule } = require('./load-ts-module.cjs');
const decorator = () => () => undefined;

function fixture(client, overrides = {}) {
  const f = previous.fixture(client, overrides);
  const abort = new AbortController();
  const heartbeats = [];
  const context = {
    cancellationSignal: abort.signal,
    heartbeat: details => {
      heartbeats.push(structuredClone(details));
      overrides.heartbeat?.(details, abort);
    },
  };
  const { PostActivityV110 } = loadTypeScriptModule('apps/orchestrator/src/activities/post.activity.v110.ts', {
    ...previous.dependencyMocks,
    '@nestjs/common': { ...previous.dependencyMocks['@nestjs/common'], Inject: decorator },
    '@temporalio/activity': { Context: { current: () => context } },
    '@contentfactory/nestjs-libraries/temporal/temporal.search.attribute': loadTypeScriptModule('libraries/nestjs-libraries/src/temporal/temporal.search.attribute.ts'),
  });
  f.activity = new PostActivityV110(f.service, { getSocialIntegration: () => f.provider }, {}, f.temporal, f.activity.publicationGuard);
  return { ...f, abort, heartbeats };
}

function workflow(actions, options = {}) {
  const { ActivityFailure, ApplicationFailure, ActivityCancellationType, CancelledFailure } = require('@temporalio/common');
  return loadTypeScriptModule('apps/orchestrator/src/workflows/post-workflows/post.workflow.v1.1.0.ts', {
    '@temporalio/workflow': {
      ActivityFailure, ApplicationFailure, ActivityCancellationType,
      defineSignal: name => name, setHandler() {},
      isCancellation: error => error instanceof CancelledFailure,
      workflowInfo: () => ({ workflowId: options.workflowId || 'post_p1' }),
      sleep: options.sleep || (async () => {}), startChild: actions.startChild || (async () => {}),
      proxyActivities: config => {
        options.proxies?.push(config);
        return new Proxy({}, { get: (_target, name) => async (...args) => {
          for (let attempt = 1; ; attempt++) {
            try { return await actions[name](...args); }
            catch (error) { if (error.nonRetryable || attempt >= config.retry.maximumAttempts) throw error; }
          }
        } });
      },
    },
    '@contentfactory/nestjs-libraries/services/make.is': { makeId: () => 'fixture-child' },
    '@contentfactory/nestjs-libraries/temporal/temporal.search.attribute': { postId: 'postId' },
  }).postWorkflowV110;
}

module.exports = { ...previous, fixture, workflow };
