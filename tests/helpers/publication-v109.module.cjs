const legacy = require('./publication-v106.module.cjs');
const { loadTypeScriptModule } = require('./load-ts-module.cjs');
const decorator = () => () => undefined;
const { PostActivityV109 } = loadTypeScriptModule('apps/orchestrator/src/activities/post.activity.v109.ts', {
  ...legacy.dependencyMocks,
  '@contentfactory/nestjs-libraries/temporal/temporal.search.attribute': loadTypeScriptModule('libraries/nestjs-libraries/src/temporal/temporal.search.attribute.ts'),
  '@nestjs/common': { ...legacy.dependencyMocks['@nestjs/common'], Inject: decorator },
});
function fixture(client, overrides = {}) {
  const f = legacy.fixture(client, overrides);
  f.service.getPostById = async (id, org) => id === f.client.row.id && org === f.client.row.organizationId
    ? structuredClone({ ...f.client.row, integration: f.integration }) : null;
  f.activity = new PostActivityV109(f.service, { getSocialIntegration: () => f.provider }, {}, f.temporal, {
    isCampaign: async () => false,
    claimSend: (key) => f.service.claimPublicationV106(key),
    beforeSend: async () => ({ campaign: false, execute: true }), syncReceipt: async () => {}, syncUncertain: async () => {},
  });
  return f;
}
module.exports = { ...legacy, fixture };

module.exports.workflow = function workflow(actions, workflowId = 'post_p1') {
  const { ActivityFailure, ApplicationFailure } = require('@temporalio/common');
  return loadTypeScriptModule('apps/orchestrator/src/workflows/post-workflows/post.workflow.v1.0.9.ts', {
    '@temporalio/workflow': {
      ActivityFailure, ApplicationFailure, defineSignal: name => name, setHandler() {}, isCancellation: () => false,
      workflowInfo: () => ({ workflowId }), sleep: async () => {}, startChild: actions.startChild || (async () => {}),
      proxyActivities: options => new Proxy({}, { get: (_target, name) => async (...args) => {
        for (let attempt = 1; ; attempt++) {
          try { return await actions[name](...args); }
          catch (error) { if (error.nonRetryable || attempt >= options.retry.maximumAttempts) throw error; }
        }
      } }),
    },
    '@contentfactory/nestjs-libraries/services/make.is': { makeId: () => 'fixture-child' },
    '@contentfactory/nestjs-libraries/temporal/temporal.search.attribute': { postId: 'postId' },
  }).postWorkflowV109;
};
