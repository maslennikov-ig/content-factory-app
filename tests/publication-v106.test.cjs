'use strict';
const fs = require('node:fs');
const crypto = require('node:crypto');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const { fixture, memoryClient, workflow, dependencyMocks, PUBLICATION_UNCERTAIN_V106 } = require('./helpers/publication-v106.module.cjs');

const send = f => f.activity.postSocialV106(f.integration, [f.client.row], 'initial');

test('original local counterexample: successful provider is called three times after streak RPC failure', async () => {
  const f = fixture(undefined, { streak: async () => { throw new Error('synthetic streak failure'); } });
  const { PostActivity } = loadTypeScriptModule('apps/orchestrator/src/activities/post.activity.ts', {
    ...dependencyMocks,
    '@contentfactory/nestjs-libraries/database/prisma/notifications/notification.service': { NotificationService: class {} },
    '@contentfactory/nestjs-libraries/integrations/refresh.integration.service': { RefreshIntegrationService: class {} },
    '@contentfactory/nestjs-libraries/database/prisma/integrations/integration.service': { IntegrationService: class {} },
    '@contentfactory/nestjs-libraries/database/prisma/webhooks/webhooks.service': { WebhooksService: class {} },
    '@contentfactory/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher': {},
  });
  const old = new PostActivity(f.service, {}, { getSocialIntegration: () => f.provider }, {}, {}, {}, f.temporal, {});
  for (let retry = 0; retry < 3; retry++) {
    await expect(old.postSocial(f.integration, [f.client.row])).rejects.toThrow('synthetic streak failure');
  }
  expect(f.calls.writes).toBe(3);
  expect(f.client.row.publicationJournal).toBeNull();
  expect(f.client.row.releaseId).toBeNull();
});

test('V106 workflow saves confirmation before streak/notification fail, with one provider invocation', async () => {
  const f = fixture(undefined, { streak: async () => { throw new Error('synthetic streak failure'); } });
  const notification = jest.fn(async () => { throw new Error('synthetic notification failure'); });
  const changeState = jest.fn();
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    await workflow({
      getPost: async () => f.client.row,
      getPostsListV106: (...args) => f.activity.getPostsListV106(...args),
      postSocialV106: (...args) => f.activity.postSocialV106(...args),
      startPublicationStreakV106: async key => {
        expect(f.client.row).toMatchObject({ state: 'PUBLISHED', releaseId: 'remote-1' });
        return f.activity.startPublicationStreakV106(key);
      },
      isCommentable: async () => false, inAppNotification: notification, changeState,
      sendWebhooks: async () => {}, internalPlugs: async () => [], globalPlugs: async () => [],
    })({ taskQueue: 'synthetic', postId: 'p1', organizationId: 'a' });
  } finally { warn.mockRestore(); }
  expect(f.calls).toEqual({ writes: 1, comments: 0, streak: 1 });
  expect(notification).toHaveBeenCalledTimes(3); // only the auxiliary activity retry
  expect(changeState).not.toHaveBeenCalled();
  expect(f.client.row).toMatchObject({ state: 'PUBLISHED', releaseId: 'remote-1', releaseURL: f.receipts[0].releaseURL });
  expect(f.client.row.publicationJournal.attempts).toEqual([{ operationId: 'initial', integrationId: 'channel-a', status: 'confirmed', receipts: f.receipts, auxiliaryFailure: 'streak' }]);
  expect(f.client.row.error).toContain('Публикация подтверждена');
});

test('lost activity response after durable confirmation is reconciled by rereading the receipt', async () => {
  const f = fixture();
  await send(f); // pretend the activity response was lost before Temporal received it
  const restarted = fixture(f.client);
  for (let attempt = 0; attempt < 3; attempt++) await expect(send(restarted)).resolves.toEqual(f.receipts);
  expect(f.calls.writes).toBe(1);
  expect(restarted.calls.writes).toBe(0);
});

test('failed local preparation can be corrected and sent without reconciling a provider write that never began', async () => {
  const f = fixture();
  let fail = true;
  f.service.updateTags = async (_org, posts) => {
    if (fail) throw new Error('synthetic local preparation failure; token=private-extra');
    return posts;
  };
  await expect(send(f)).rejects.toMatchObject({ type: 'publication_preparation_failed', nonRetryable: true });
  expect(f.calls.writes).toBe(0);
  expect(f.client.row).toMatchObject({ state: 'ERROR', content: 'Synthetic post' });
  expect(f.client.row.publicationJournal).toBeNull();
  expect(JSON.stringify(f.client.row)).not.toContain('private-extra');
  // A person corrects and queues the same post through the normal save flow.
  fail = false;
  f.client.row.state = 'QUEUE';
  f.client.row.content = 'Corrected post';
  await expect(send(f)).resolves.toEqual(f.receipts);
  expect(f.calls.writes).toBe(1);
  expect(f.client.row).toMatchObject({ state: 'PUBLISHED', content: 'Corrected post' });
  expect(f.client.row.publicationJournal.attempts).toHaveLength(1);
});

test('a confirmed receipt is recoverable even when subscription checking is unavailable', async () => {
  const before = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = 'inert-local-fixture';
  const f = fixture();
  const subscription = jest.fn().mockResolvedValueOnce({ id: 'synthetic-subscription' })
    .mockRejectedValue(new Error('synthetic billing outage'));
  f.activity.subscriptions = { getSubscription: subscription };
  try {
    await expect(send(f)).resolves.toEqual(f.receipts);
    await expect(send(f)).resolves.toEqual(f.receipts);
    expect(f.calls.writes).toBe(1);
    expect(subscription).toHaveBeenCalledTimes(1);
  } finally {
    if (before === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = before;
  }
});

test('subscription refusal before sending leaves a readable preparation failure, not an uncertain write', async () => {
  const before = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = 'inert-local-fixture';
  const f = fixture();
  f.activity.subscriptions = { getSubscription: async () => null };
  try {
    await expect(send(f)).rejects.toMatchObject({ type: 'publication_preparation_failed', nonRetryable: true });
    expect(f.calls.writes).toBe(0);
    expect(f.client.row.state).toBe('ERROR');
    expect(f.client.row.publicationJournal).toBeNull();
  } finally {
    if (before === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = before;
  }
});

test('a late preparation failure cannot clear another invocation\'s pending publication claim', async () => {
  const f = fixture();
  await f.repository.claimPublicationV106(f.key);
  const before = structuredClone(f.client.row);
  await f.repository.markPublicationPreparationFailureV106(f.key);
  expect(f.client.row).toEqual(before);
  await expect(send(f)).rejects.toMatchObject({ type: 'publication_uncertain' });
  expect(f.calls.writes).toBe(0);
});

test('provider write with lost provider response stays visible and never retries, even as a new repeat generation', async () => {
  const f = fixture(undefined, { write: async () => { throw new Error('possibly committed, token=must-not-be-stored'); } });
  await expect(send(f)).rejects.toMatchObject({ type: 'publication_uncertain', nonRetryable: true });
  const restarted = fixture(f.client);
  await expect(send(restarted)).rejects.toMatchObject({ type: 'publication_uncertain' });
  await expect(restarted.activity.postSocialV106(restarted.integration, [restarted.client.row], 'repeat:new-child')).rejects.toMatchObject({ type: 'publication_uncertain' });
  expect(f.calls.writes).toBe(1);
  expect(restarted.calls.writes).toBe(0);
  expect(f.client.row).toMatchObject({ state: 'ERROR', error: PUBLICATION_UNCERTAIN_V106 });
  expect(JSON.stringify(f.client.row)).not.toContain('must-not-be-stored');
  expect(f.client.row.publicationJournal.attempts[0].status).toBe('pending');
});

test('receipt-save failure never resends; authoritative receipt reconciles the pending claim without provider calls', async () => {
  const f = fixture();
  f.service.confirmPublicationV106 = async () => { throw new Error('synthetic DB outage after write'); };
  await expect(send(f)).rejects.toMatchObject({ type: 'publication_uncertain' });
  const restarted = fixture(f.client);
  await expect(send(restarted)).rejects.toMatchObject({ type: 'publication_uncertain' });
  await restarted.service.confirmPublicationV106(f.key, f.receipts);
  await expect(send(restarted)).resolves.toEqual(f.receipts);
  expect(f.calls.writes).toBe(1);
  expect(restarted.calls.writes).toBe(0);
  expect(restarted.client.row.error).toBeNull();
  await expect(restarted.service.confirmPublicationV106(f.key, [{ ...f.receipts[0], postId: 'different' }])).rejects.toThrow('Conflicting');
});

test('overlapping deliveries have one admitted provider call, with pending claims never stolen', async () => {
  let finish;
  const remote = new Promise(resolve => { finish = resolve; });
  const f = fixture(undefined, { write: () => remote });
  const first = send(f);
  while (!f.calls.writes) await Promise.resolve();
  await expect(send(f)).rejects.toMatchObject({ type: 'publication_uncertain' });
  finish(f.receipts);
  await expect(first).resolves.toEqual(f.receipts);
  expect(f.calls.writes).toBe(1);
  expect(f.client.row.state).toBe('PUBLISHED');
});

test('comments have their own durable claims and cannot repeat on a lost response', async () => {
  const f = fixture();
  const comment = () => f.activity.postCommentV106('parent-remote', undefined, f.integration, [f.client.row], 'initial');
  await expect(comment()).resolves.toEqual(f.receipts);
  await expect(comment()).resolves.toEqual(f.receipts);
  expect(f.calls).toMatchObject({ writes: 0, comments: 1 });
});

test('extra provider payload fields are excluded from the durable receipt', async () => {
  const f = fixture();
  f.provider.post = async () => [{ ...f.receipts[0], token: 'synthetic-sensitive-extra' }];
  await expect(send(f)).resolves.toEqual(f.receipts);
  expect(JSON.stringify(f.client.row.publicationJournal)).not.toContain('synthetic-sensitive-extra');
});

test('malformed persisted journal blocks sending instead of assuming a fresh operation', async () => {
  const f = fixture(memoryClient({ publicationJournal: { version: 999, attempts: [] } }));
  await expect(send(f)).rejects.toThrow('Invalid publication journal');
  expect(f.calls.writes).toBe(0);
});

test('workflow uncertain outcome makes no outer retries or token refresh attempts', async () => {
  const f = fixture(undefined, { write: async () => { throw new Error('possibly committed'); } });
  const refresh = jest.fn(), auxiliary = jest.fn();
  await expect(workflow({
    getPost: async () => f.client.row,
    getPostsListV106: (...args) => f.activity.getPostsListV106(...args),
    postSocialV106: (...args) => f.activity.postSocialV106(...args),
    refreshTokenWithCause: refresh, startPublicationStreakV106: auxiliary,
  })({ taskQueue: 'synthetic', postId: 'p1', organizationId: 'a' })).resolves.toBe(false);
  expect(f.calls.writes).toBe(1);
  expect(refresh).not.toHaveBeenCalled();
  expect(auxiliary).not.toHaveBeenCalled();
});

test('V106 repeat workflow admits a published root with a distinct operation and starts V106 children', async () => {
  const f = fixture(memoryClient({ state: 'PUBLISHED', releaseId: 'earlier', intervalInDays: 1 }));
  const child = jest.fn();
  const run = workflow({
    getPost: async () => f.client.row,
    getPostsListV106: (...args) => f.activity.getPostsListV106(...args),
    postSocialV106: (...args) => f.activity.postSocialV106(...args),
    startPublicationStreakV106: async () => {}, inAppNotification: async () => {},
    sendWebhooks: async () => {}, internalPlugs: async () => [], globalPlugs: async () => [],
    startChild: child,
  }, 'post_p1_repeat-child');
  await run({ taskQueue: 'synthetic', postId: 'p1', organizationId: 'a', postNow: true });
  expect(f.calls.writes).toBe(1);
  expect(f.client.row.publicationJournal.attempts[0].operationId).toBe('repeat:post_p1_repeat-child');
  expect(child.mock.calls[0][0]).toBe(run);
  expect(child.mock.calls[0][1].args[0].postNow).toBe(true);
});

test('explicit repeat generations have distinct receipts and old retries cannot overwrite a newer projection', async () => {
  const f = fixture();
  await send(f);
  f.provider.post = async () => { f.calls.writes++; return [{ ...f.receipts[0], postId: 'repeat-remote' }]; };
  await f.activity.postSocialV106(f.integration, [f.client.row], 'repeat:child-1');
  await expect(send(f)).resolves.toEqual(f.receipts);
  expect(f.calls.writes).toBe(2);
  expect(f.client.row.releaseId).toBe('repeat-remote');
  expect(f.client.row.publicationJournal.attempts).toHaveLength(2);
});

test.each([{ receipts: [] }, { receipts: [{ id: 'foreign-post', postId: 'bad', releaseURL: '', status: 'published' }] }])('invalid provider receipt %j remains uncertain', async ({ receipts }) => {
  const f = fixture(undefined, { write: async () => receipts });
  await expect(send(f)).rejects.toMatchObject({ type: 'publication_uncertain' });
  await expect(send(f)).rejects.toMatchObject({ type: 'publication_uncertain' });
  expect(f.calls.writes).toBe(1);
  expect(f.client.row.state).toBe('ERROR');
});

test.each([{ state: 'DRAFT' }, { deletedAt: new Date('2020-01-01Z') }, { organizationId: 'b' }, { integrationId: 'foreign' }, { releaseId: 'legacy-confirmed' }])('ineligible or historical post %j makes zero writes', async initial => {
  const f = fixture(memoryClient(initial));
  await expect(send(f)).rejects.toMatchObject({ type: 'publication_refused' });
  expect(f.calls.writes).toBe(0);
});

test('all legacy workflow bodies and activity publication methods remain intact', () => {
  const baseline = require('./publication-v106-legacy.baseline.json');
  for (const [file, digest] of Object.entries(baseline)) {
    expect(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')).toBe(digest);
  }

});

test('new ordinary/recovery/repeat starts select V108 while accepted V106/V107 contracts stay registered', () => {
  const read = p => fs.readFileSync(p, 'utf8');
  expect(read('libraries/nestjs-libraries/src/database/prisma/posts/posts.service.ts')).toContain("workflow.start('postWorkflowV108'");
  expect(read('apps/orchestrator/src/activities/post.activity.v108.ts')).toContain("signalWithStart('postWorkflowV108'");
  expect(read('libraries/nestjs-libraries/src/temporal/infinite.workflow.register.ts')).toContain("start('missingPostWorkflowV109'");
  expect(read('apps/orchestrator/src/workflows/post-workflows/post.workflow.v1.0.8.ts')).toContain('startChild(postWorkflowV108');
  expect(read('apps/orchestrator/src/workflows/post-workflows/post.workflow.v1.0.7.ts')).toContain('startChild(postWorkflowV107');
  expect(read('apps/orchestrator/src/activities/post.activity.v107.ts')).toContain("signalWithStart('postWorkflowV107'");
  // Already started V106 histories keep their recovery/child targets.
  expect(read('apps/orchestrator/src/activities/post.activity.v106.ts')).toContain("signalWithStart('postWorkflowV106'");
  expect(read('apps/orchestrator/src/workflows/post-workflows/post.workflow.v1.0.6.ts')).toContain('startChild(postWorkflowV106');
  const index = read('apps/orchestrator/src/workflows/index.ts');
  expect(index).toContain("export * from './post-workflows/post.workflow.v1.0.5'");
  expect(index).toContain("export * from './post-workflows/post.workflow.v1.0.6'");
  expect(index).toContain("export * from './post-workflows/post.workflow.v1.0.7'");
  expect(index).toContain("export * from './post-workflows/post.workflow.v1.0.8'");
  expect(index).toContain("export * from './missing.post.workflow.v106'");
  expect(index).toContain("export * from './missing.post.workflow.v107'");
  expect(index).toContain("export * from './missing.post.workflow.v108'");
});
