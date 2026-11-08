'use strict';
const fs = require('node:fs');
const crypto = require('node:crypto');
const { CancelledFailure, ActivityCancellationType } = require('@temporalio/common');
const { fixture, memoryClient, workflow } = require('./helpers/publication-v110.module.cjs');
const send = f => f.activity.postSocialV110(f.integration, [f.client.row], 'initial');
const resume = f => fixture(f.client);

test.each(['inspect', 'preparing', 'claiming'])('worker cancellation at %s before claim leaves durable eligibility ready', async stopAt => {
  const f = fixture(undefined, { heartbeat: ({ stage }, abort) => { if (stage === stopAt) abort.abort(new CancelledFailure('WORKER_SHUTDOWN')); } });
  await expect(send(f)).rejects.toBeInstanceOf(CancelledFailure);
  expect(f.client.row.publicationJournal).toBeNull();
  expect(f.client.row.state).toBe('QUEUE');
  expect(f.calls.writes).toBe(0);
  const next = resume(f);
  await expect(send(next)).resolves.toEqual(next.receipts);
  expect(next.calls.writes).toBe(1);
});

test('worker cancellation after claim prevents send and retains uncertainty across recovery', async () => {
  const f = fixture(undefined, { heartbeat: ({ stage }, abort) => { if (stage === 'submitting') abort.abort(new CancelledFailure('WORKER_SHUTDOWN')); } });
  await expect(send(f)).rejects.toMatchObject({ type: 'publication_uncertain', nonRetryable: true });
  expect(f.client.row.publicationJournal.attempts[0].status).toBe('pending');
  expect(f.calls.writes).toBe(0);
  const next = resume(f);
  await expect(send(next)).rejects.toMatchObject({ type: 'publication_uncertain' });
  expect(next.calls.writes).toBe(0);
});

test('lost provider response after send remains uncertain; a new worker never retries the write', async () => {
  const f = fixture(undefined, { write: async () => { throw new CancelledFailure('WORKER_SHUTDOWN'); } });
  await expect(send(f)).rejects.toMatchObject({ type: 'publication_uncertain', nonRetryable: true });
  expect(f.calls.writes).toBe(1);
  const next = resume(f);
  await expect(send(next)).rejects.toMatchObject({ type: 'publication_uncertain' });
  expect(next.calls.writes).toBe(0);
  expect(f.client.row.state).toBe('ERROR');
});

test('a received provider ID is durably confirmed despite cancellation and heartbeat failure before receipt storage', async () => {
  const f = fixture(undefined, { heartbeat: ({ stage }, abort) => {
    if (stage === 'confirming') { abort.abort(new CancelledFailure('WORKER_SHUTDOWN')); throw new Error('Synthetic heartbeat failure'); }
  } });
  await expect(send(f)).resolves.toEqual(f.receipts);
  expect(f.client.row).toMatchObject({ state: 'PUBLISHED', releaseId: 'remote-1' });
  const next = resume(f);
  next.service.updateMedia = async () => { throw new Error('Preparation must not run on receipt replay'); };
  await expect(send(next)).resolves.toEqual(f.receipts);
  expect(next.calls.writes).toBe(0);
  expect(next.heartbeats.map(one => one.stage)).toEqual(['inspect', 'confirmed']);
});

test('lost confirmation acknowledgement and auxiliary failure cannot cause another provider call', async () => {
  const f = fixture();
  const confirm = f.service.confirmPublicationV110.bind(f.service);
  f.service.confirmPublicationV110 = async (...args) => { await confirm(...args); throw new Error('Synthetic lost database reply'); };
  await expect(send(f)).rejects.toMatchObject({ type: 'publication_uncertain' });
  expect(f.client.row.releaseId).toBe('remote-1');
  const next = resume(f);
  next.activity.publicationGuard.syncReceipt = jest.fn().mockRejectedValueOnce(new Error('Synthetic projection failure')).mockResolvedValue(undefined);
  await expect(send(next)).rejects.toThrow('Synthetic projection failure');
  await expect(send(next)).resolves.toEqual(f.receipts);
  expect(next.calls.writes).toBe(0);
});

test('heartbeat sends only bounded stages every15s and clears its timer on settlement', async () => {
  jest.useFakeTimers();
  let release;
  const f = fixture(undefined, { write: () => new Promise(resolve => { release = resolve; }) });
  try {
    const pending = send(f);
    for (let step = 0; step < 30 && !release; step++) await Promise.resolve();
    expect(typeof release).toBe('function');
    expect(f.heartbeats.map(one => one.stage)).toEqual(['inspect', 'preparing', 'claiming', 'submitting']);
    await jest.advanceTimersByTimeAsync(30_000);
    expect(f.heartbeats.slice(-2).map(one => one.stage)).toEqual(['submitting', 'submitting']);
    release(f.receipts);
    await expect(pending).resolves.toEqual(f.receipts);
    expect(f.heartbeats.slice(-2).map(one => one.stage)).toEqual(['confirming', 'confirmed']);
    for (const beat of f.heartbeats) expect(Object.keys(beat).sort()).toEqual(['stage', 'version']);
    expect(jest.getTimerCount()).toBe(0);
  } finally { jest.useRealTimers(); }
});

test('ordinary and campaign activity calls both pass through the same guard', async () => {
  const f = fixture();
  f.activity.publicationGuard.claimSend = jest.fn(() => Promise.resolve({ status: 'refused' }));
  await expect(send(f)).rejects.toMatchObject({ type: 'publication_refused' });
  expect(f.activity.publicationGuard.claimSend).toHaveBeenCalledTimes(1);
  expect(f.calls.writes).toBe(0);
});

test('new workflow configures heartbeat timeout and propagates cancellation without sending auxiliaries', async () => {
  const f = fixture();
  const proxies = [];
  const cancelled = new CancelledFailure('Synthetic workflow cancellation');
  const notification = jest.fn();
  await expect(workflow({ getPost: async () => f.client.row, getPostsListV110: async () => [{ ...f.client.row, integration: f.integration }], postSocialV110: async () => { throw cancelled; }, inAppNotification: notification }, { proxies })({ taskQueue: 'synthetic', postId: 'p1', organizationId: 'a' })).rejects.toBe(cancelled);
  const publication = proxies.find(one => one.heartbeatTimeout);
  expect(publication).toMatchObject({ startToCloseTimeout: '10 minute', heartbeatTimeout: '1 minute', taskQueue: 'synthetic', cancellationType: ActivityCancellationType.WAIT_CANCELLATION_COMPLETED });
  expect(notification).not.toHaveBeenCalled();
});

test('new repeat children and recovery start V110 while existing jobs receive poke with USE_EXISTING', async () => {
  const f = fixture(memoryClient({ intervalInDays: 1 }));
  const startChild = jest.fn();
  await workflow({ getPost: async () => f.client.row, getPostsListV110: (...args) => f.activity.getPostsListV110(...args), postSocialV110: (...args) => f.activity.postSocialV110(...args), startPublicationStreakV110: async () => {}, inAppNotification: async () => {}, sendWebhooksV108: async () => {}, internalPlugs: async () => [], globalPlugs: async () => [], startChild })({ taskQueue: 'synthetic', postId: 'p1', organizationId: 'a' });
  expect(startChild.mock.calls[0][0].name).toBe('postWorkflowV110');
  const signal = jest.fn(async () => {});
  f.service.searchForMissingThreeHoursPosts = async () => [{ ...f.client.row, integration: f.integration }];
  f.temporal.client.getRawClient = () => ({ workflow: { signalWithStart: signal } });
  await f.activity.searchForMissingThreeHoursPostsV111();
  expect(signal.mock.calls[0][0]).toBe('postWorkflowV110');
  expect(signal.mock.calls[0][1]).toMatchObject({ workflowId: 'post_p1', workflowIdConflictPolicy: 'USE_EXISTING', signal: 'poke' });
});

test('all preexisting post/recovery activity and workflow files retain exact bytes', () => {
  for (const [file, digest] of Object.entries(require('./publication-v110-legacy.baseline.json'))) expect(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')).toBe(digest);
});


test('the ordinary/campaign UI start consumer dispatches new work to V110', async () => {
  const f = fixture();
  const start = jest.fn(async () => ({}));
  f.service.stopPostWorkflows = jest.fn(async () => {});
  f.service._temporalService = { client: { getRawClient: () => ({ workflow: { start } }) } };
  await expect(f.service.startWorkflow('synthetic', 'p1', 'a', 'QUEUE')).resolves.toBe(true);
  expect(start).toHaveBeenCalledWith('postWorkflowV110', expect.objectContaining({ workflowId: 'post_p1', taskQueue: 'main' }));
});

test('V111 recovery rotates history after100 hourly scans', async () => {
  const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
  const scan = jest.fn(async () => {}), sleep = jest.fn(async () => {}), continuation = jest.fn(async () => {});
  const { missingPostWorkflowV111 } = loadTypeScriptModule('apps/orchestrator/src/workflows/missing.post.workflow.v111.ts', {
    '@temporalio/workflow': { proxyActivities: () => ({ searchForMissingThreeHoursPostsV111: scan }), sleep, continueAsNew: continuation },
  });
  await missingPostWorkflowV111();
  expect(scan).toHaveBeenCalledTimes(100);
  expect(sleep).toHaveBeenCalledTimes(100);
  expect(sleep).toHaveBeenCalledWith('1 hour');
  expect(continuation).toHaveBeenCalledTimes(1);
});

test('sanitized provider reason survives persistence and recovery without permitting another send', async () => {
 const message = 'Meta: недостаточно прав. Проверьте роль администратора, доступ к каналу и разрешение на публикацию; затем подключите канал заново при необходимости.';
 const f = fixture(undefined, {write:async()=>{throw Error(message);}});
 f.integration.providerIdentifier='instagram';
 await expect(send(f)).rejects.toMatchObject({type:'publication_uncertain'});
 expect(f.client.row.error).toContain(message);
 expect(f.client.row.error).toContain('автоматическая повторная отправка заблокирована');
 expect(f.client.row.publicationJournal.attempts[0]).toMatchObject({status:'pending',diagnosticV110:{provider:'meta',code:'permissions'}});
 const next=resume(f);
 await expect(send(next)).rejects.toMatchObject({type:'publication_uncertain'});
 expect(f.client.row.error).toContain(message);
 expect(next.calls.writes).toBe(0);
});

test.each([
 ['telegram',{error_code:400}], ['vk',{error:{error_code:5}}],
 ['facebook',{error:{code:4}}], ['youtube',{error:{code:403}}],
])('%s persists only its allowlisted static diagnostic', async (identifier, body) => {
 const {providerErrorDiagnostic,publicProviderDiagnosticV110,publicPendingProviderDiagnosticTextV110}=require('./helpers/load-ts-module.cjs').loadTypeScriptModule('libraries/nestjs-libraries/src/integrations/social/provider-error-diagnostic.ts');
 const provider=identifier==='facebook'?'meta':identifier;
 const message=providerErrorDiagnostic(provider,body).value;
 const f=fixture(undefined,{write:async()=>{throw Object.assign(Error(message),{response:{private:'inert-token private-caption'}});}});
 f.integration.providerIdentifier=identifier;
 await expect(send(f)).rejects.toMatchObject({type:'publication_uncertain'});
 expect(f.client.row.error).toContain(publicPendingProviderDiagnosticTextV110(publicProviderDiagnosticV110(identifier,Error(message))));
 expect(f.client.row.error).not.toMatch(/повторите попытку|перед повторной попыткой/);
 expect(JSON.stringify(f.client.row)).not.toMatch(/inert-token|private-caption/);
});

test('raw and near-match provider messages remain omitted from durable failure projection', async () => {
 const f=fixture(undefined,{write:async()=>{throw Error('Meta: недостаточно прав. inert-token private-caption');}});
 f.integration.providerIdentifier='facebook';
 await expect(send(f)).rejects.toMatchObject({type:'publication_uncertain'});
 expect(f.client.row.publicationJournal.attempts[0].diagnosticV110).toBeUndefined();
 expect(JSON.stringify(f.client.row)).not.toMatch(/inert-token|private-caption/);
});

test('late authoritative confirmation clears stale V110 uncertainty', async () => {
 const f=fixture();
 await f.service.claimPublicationV106(f.key);
 await f.service.markPublicationUncertainV110(f.key,{provider:'meta',code:'permissions'});
 await f.service.confirmPublicationV110(f.key,f.receipts);
 expect(f.client.row).toMatchObject({state:'PUBLISHED',releaseId:'remote-1',error:null});
});

test('V110 confirmation preserves optional-thumbnail warnings after clearing its stale uncertainty', async () => {
 const {YOUTUBE_THUMBNAIL_FAILED_STATUS,YOUTUBE_THUMBNAIL_WARNING}=require('./helpers/load-ts-module.cjs').loadTypeScriptModule('libraries/nestjs-libraries/src/integrations/publication-warnings.ts');
 const f=fixture();
 await f.service.claimPublicationV106(f.key);
 await f.service.markPublicationUncertainV110(f.key,{provider:'youtube',code:'permissions'});
 await f.service.confirmPublicationV110(f.key,[{...f.receipts[0],status:YOUTUBE_THUMBNAIL_FAILED_STATUS}]);
 expect(f.client.row).toMatchObject({state:'PUBLISHED',releaseId:'remote-1',error:YOUTUBE_THUMBNAIL_WARNING});
});

test('diagnostic CAS cannot overwrite a receipt confirmed between read and update', async () => {
 const f=fixture();
 await f.service.claimPublicationV106(f.key);
 const update=f.client.post.updateMany;
 let raced=false;
 f.client.post.updateMany=async args=>{
  if(!raced && args.data.state==='ERROR'){
   raced=true;
   await f.service.confirmPublicationV110(f.key,f.receipts);
  }
  return update(args);
 };
 await f.service.markPublicationUncertainV110(f.key,{provider:'meta',code:'permissions'});
 expect(f.client.row).toMatchObject({state:'PUBLISHED',error:null,releaseId:'remote-1'});
 expect(f.client.row.publicationJournal.attempts[0].status).toBe('confirmed');
});

test('V110 diagnostic writes remain tenant scoped and strip unchecked diagnostic fields', async () => {
 const f=fixture();
 await f.service.claimPublicationV106(f.key);
 await f.service.markPublicationUncertainV110({...f.key,organizationId:'foreign'},{provider:'meta',code:'permissions'});
 expect(f.client.row.publicationJournal.attempts[0].diagnosticV110).toBeUndefined();
 await f.service.markPublicationUncertainV110(f.key,{provider:'meta',code:'permissions',raw:'private-caption'});
 expect(f.client.row.publicationJournal.attempts[0].diagnosticV110).toEqual({provider:'meta',code:'permissions'});
});

test('an older confirmed operation cannot be downgraded by a different pending repeat claim', async () => {
 const f=fixture();
 await send(f);
 await f.service.claimPublicationV106({...f.key,operationId:'repeat:new'});
 await f.service.markPublicationUncertainV110(f.key,{provider:'meta',code:'permissions'});
 expect(f.client.row).toMatchObject({state:'PUBLISHED',releaseId:'remote-1'});
 expect(f.client.row.publicationJournal.attempts[0].status).toBe('confirmed');
 expect(f.client.row.publicationJournal.attempts[1].diagnosticV110).toBeUndefined();
});
