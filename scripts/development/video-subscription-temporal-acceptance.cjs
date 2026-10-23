#!/usr/bin/env node
'use strict';
require('reflect-metadata');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {Client,Connection}=require('@temporalio/client');
const {Worker,NativeConnection,Runtime,DefaultLogger,bundleWorkflowCode}=require('@temporalio/worker');
const {create,assertDisposableDatabaseV1}=require('../../tests/helpers/video-subscription-domain.fixture.cjs');
const {loadTypeScriptModule}=require('../../tests/helpers/load-ts-module.cjs');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function waitFor(predicate,timeout=30000){const end=Date.now()+timeout;while(!await predicate()){if(Date.now()>end)throw new Error('Subscription Temporal acceptance deadline');await delay(100);}}
async function boundedResult(handles, timeout = 70000) {
  let timer;
  try { return await Promise.race([Promise.all(handles.map(h => h.result())), new Promise((_, reject) => {timer = setTimeout(() => reject(new Error('Subscription workflow result deadline')), timeout);})]); }
  finally { clearTimeout(timer); }
}
async function main(){
  assertDisposableDatabaseV1(process.env.CF_VIDEO_DATABASE_URL);
  const address=process.env.CF_VIDEO_TEMPORAL_ADDRESS;
  if(process.env.CF_VIDEO_TEMPORAL_DISPOSABLE!=='1'||!/^127\.0\.0\.1:[1-9]\d{3,4}$/.test(address||''))throw new Error('Dedicated loopback Temporal required');
  Runtime.install({logger:new DefaultLogger('WARN')});
  let f,connection,native,worker,running;const handles=[];
  try{
    connection=await Connection.connect({address,connectTimeout:'15 seconds'});native=await NativeConnection.connect({address});
    const client=new Client({connection,namespace:'default'});f=await create(process.env.CF_VIDEO_DATABASE_URL);
    const {VideoSubscriptionExecution}=loadTypeScriptModule('libraries/nestjs-libraries/src/videos/subscriptions/video-subscription-execution.ts',{'./video-subscription-job.service':{VideoSubscriptionJobService:f.subscriptions.constructor,SUBSCRIPTION_PENDING:['accepted','submitting','queued','running','saving']}});
    const starter=new VideoSubscriptionExecution({client:{getRawClient:()=>client}});
    f.subscriptionExecution.start=starter.start.bind(starter);
    const {VideoSubscriptionActivityV1}=loadTypeScriptModule('apps/orchestrator/src/activities/video-subscription.activity.v1.ts',{'@contentfactory/nestjs-libraries/videos/subscriptions/video-subscription-job.service':{VideoSubscriptionJobService:f.subscriptions.constructor}});
    const workflowBundle=await bundleWorkflowCode({workflowsPath:path.resolve('apps/orchestrator/src/workflows/video-subscription.workflow.v1.ts')});
    const newWorker=async()=>{const activity=new VideoSubscriptionActivityV1(f.subscriptions);return Worker.create({connection:native,namespace:'default',taskQueue:'main',workflowBundle,activities:{stepVideoSubscriptionV1:activity.stepVideoSubscriptionV1.bind(activity),expireVideoSubscriptionV1:activity.expireVideoSubscriptionV1.bind(activity)}});};
    worker=await newWorker();running=worker.run();
    const jobs=[];
    for(const provider of ['higgsfield','heygen']){const ready=await f.readySubscription({provider});const job=await f.access.launch(f.org.id,f.user.id,ready.launch);jobs.push(job);handles.push(client.workflow.getHandle(`video-subscription-v1:${job.id}:0`));}
    await waitFor(async()=>await f.db.videoSubscriptionJob.count({where:{id:{in:jobs.map(j=>j.id)},state:'queued'}})===2);
    const before=await f.db.videoSubscriptionJob.findMany({where:{id:{in:jobs.map(j=>j.id)}},orderBy:{id:'asc'},select:{id:true,receipt:true}});
    assert.equal(f.provider.state.submits.length,2);
    worker.shutdown();await running;running=undefined;
    // Separate worker and domain instances, same persisted receipts/history/storage.
    f.restartSubscriptions();worker=await newWorker();running=worker.run();
    const completed=await boundedResult(handles);
    assert.deepEqual(completed,[{state:'completed',done:true},{state:'completed',done:true}]);
    const after=await f.db.videoSubscriptionJob.findMany({where:{id:{in:jobs.map(j=>j.id)}},orderBy:{id:'asc'},select:{id:true,state:true,receipt:true,resultMediaId:true,submitAttempts:true}});
    for(let i=0;i<after.length;i++){assert.deepEqual(after[i].receipt,before[i].receipt);assert.equal(after[i].submitAttempts,1);assert.ok(after[i].resultMediaId);assert.deepEqual((await f.access.download(f.org.id,f.user.id,after[i].id)).bytes,f.mp4);
      const history=await handles[i].fetchHistory();const start=history.events.find(e=>e.workflowExecutionStartedEventAttributes).workflowExecutionStartedEventAttributes;
      assert.deepEqual(JSON.parse(Buffer.from(start.input.payloads[0].data).toString()),{organizationId:f.org.id,jobId:jobs[i].id});
    }
    assert.equal(f.provider.state.submits.length,2);
    const lostReady=await f.readySubscription();f.provider.script('higgsfield','generate_clip','lost');
    const lost=await f.access.launch(f.org.id,f.user.id,lostReady.launch);const lostHandle=client.workflow.getHandle(`video-subscription-v1:${lost.id}:0`);handles.push(lostHandle);
    const outcome=await lostHandle.result();assert.deepEqual(outcome,{state:'submission_unknown',done:true});
    assert.equal(f.provider.state.submits.length,3);
    await f.access.launch(f.org.id,f.user.id,lostReady.launch);assert.equal(f.provider.state.submits.length,3);

    // Reproduce both reviewed exhaustion cases through the actual workflow,
    // then explicitly recover the same receipts with a fresh worker/service.
    const recoveryJobs = [], exhaustedHandles = [];
    for (const provider of ['higgsfield', 'heygen']) {
      const ready = await f.readySubscription({provider});
      const job = await f.access.launch(f.org.id, f.user.id, ready.launch);
      recoveryJobs.push({id: job.id, provider});
      const handle = client.workflow.getHandle(`video-subscription-v1:${job.id}:0`);
      exhaustedHandles.push(handle); handles.push(handle);
    }
    await waitFor(async () => await f.db.videoSubscriptionJob.count({where: {id: {in: recoveryJobs.map(j => j.id)}, state: 'queued'}}) === 2);
    worker.shutdown(); await running; running = undefined;
    const exhaustedBefore = await f.db.videoSubscriptionJob.findMany({where: {id: {in: recoveryJobs.map(j => j.id)}}});
    const pollsBeforeRecovery = f.provider.state.polls.length;
    for (const job of recoveryJobs) await f.db.videoSubscriptionJob.update({where: {id: job.id}, data: job.provider === 'higgsfield'
      ? {createdAt: new Date(f.provider.runtime.now().getTime() - 86400_001)} : {pollAttempts: 8640}});
    f.restartSubscriptions(); worker = await newWorker(); running = worker.run();
    assert.deepEqual(await boundedResult(exhaustedHandles), [{state: 'status_delayed', done: true}, {state: 'status_delayed', done: true}]);
    assert.equal(f.provider.state.polls.length, pollsBeforeRecovery);
    worker.shutdown(); await running; running = undefined;
    const resumedHandles = [];
    for (const job of recoveryJobs) {
      await f.access.action(f.org.id, f.user.id, job.id, 'resume');
      const handle = client.workflow.getHandle(`video-subscription-v1:${job.id}:1`);
      resumedHandles.push(handle); handles.push(handle);
    }
    const submitsBeforeRecovery = f.provider.state.submits.length;
    f.restartSubscriptions(); worker = await newWorker(); running = worker.run();
    assert.deepEqual(await boundedResult(resumedHandles), [{state: 'completed', done: true}, {state: 'completed', done: true}]);
    const resumed = await f.db.videoSubscriptionJob.findMany({where: {id: {in: recoveryJobs.map(j => j.id)}}});
    for (const job of resumed) {
      assert.deepEqual(job.receipt, exhaustedBefore.find(before => before.id === job.id).receipt);
      assert.equal(job.submitAttempts, 1); assert.equal(job.pollAttempts, 1); assert.equal(job.runCycle, 1);
      assert.equal(job.statusDeadlineAt.getTime(), f.provider.runtime.now().getTime() + 86400_000);
      assert.deepEqual((await f.access.download(f.org.id, f.user.id, job.id)).bytes, f.mp4);
      const handle = resumedHandles[recoveryJobs.findIndex(j => j.id === job.id)];
      const history = await handle.fetchHistory();
      const start = history.events.find(e => e.workflowExecutionStartedEventAttributes).workflowExecutionStartedEventAttributes;
      assert.deepEqual(JSON.parse(Buffer.from(start.input.payloads[0].data).toString()), {organizationId: f.org.id, jobId: job.id});
    }
    assert.equal(f.provider.state.submits.length, submitsBeforeRecovery);

    // A completed receipt with an expired file URL survives reconnect and
    // save-only retry. The new worker must refresh that receipt, never submit.
    const saveReady = await f.readySubscription();
    f.transport.downloadFailures = 2;
    const saveJob = await f.access.launch(f.org.id, f.user.id, saveReady.launch);
    const saveHandle = client.workflow.getHandle(`video-subscription-v1:${saveJob.id}:0`); handles.push(saveHandle);
    assert.deepEqual(await boundedResult([saveHandle]), [{state: 'save_failed', done: true}]);
    const saveBefore = await f.db.videoSubscriptionJob.findUniqueOrThrow({where: {id: saveJob.id}});
    assert.ok(saveBefore.receipt); assert.equal(saveBefore.resultMediaId, null);
    worker.shutdown(); await running; running = undefined;
    await f.connections.disconnect(f.org.id, f.user.id, saveReady.connectionId);
    const reconnected = await f.connect(); assert.equal(reconnected.id, saveReady.connectionId);
    f.transport.downloadFailures = 1;
    const submitsBeforeSave = f.provider.state.submits.length, pollsBeforeSave = f.provider.state.polls.length;
    await f.access.action(f.org.id, f.user.id, saveJob.id, 'retry-save');
    const retryHandle = client.workflow.getHandle(`video-subscription-v1:${saveJob.id}:1`); handles.push(retryHandle);
    f.restartSubscriptions(); worker = await newWorker(); running = worker.run();
    assert.deepEqual(await boundedResult([retryHandle]), [{state: 'completed', done: true}]);
    const saved = await f.db.videoSubscriptionJob.findUniqueOrThrow({where: {id: saveJob.id}});
    assert.deepEqual(saved.receipt, saveBefore.receipt); assert.ok(saved.generation > saveBefore.generation);
    assert.equal(saved.submitAttempts, 1); assert.equal(saved.runCycle, 1); assert.ok(saved.resultMediaId);
    assert.deepEqual((await f.access.download(f.org.id, f.user.id, saved.id)).bytes, f.mp4);
    assert.equal(f.provider.state.submits.length, submitsBeforeSave);
    assert.equal(f.provider.state.polls.length, pollsBeforeSave + 1);
    const recovery = {
      exhausted: resumed.map(job => ({id: job.id, provider: job.provider, cause: job.provider === 'higgsfield' ? '24h_deadline' : 'poll_budget', state: job.state,
        runCycle: job.runCycle, submitAttempts: job.submitAttempts, pollAttempts: job.pollAttempts, statusDeadlineAt: job.statusDeadlineAt, receipt: job.receipt, resultMediaId: job.resultMediaId})),
      reconnectSave: {id: saved.id, state: saved.state, generationBefore: saveBefore.generation, generationAfter: saved.generation,
        runCycle: saved.runCycle, submitAttempts: saved.submitAttempts, receipt: saved.receipt, resultMediaId: saved.resultMediaId, refreshedExistingReceipt: true},
      extraSubmits: 0, ownedDownloadsMatch: true,
    };
    const receipt={status:'PASS',boundary:'Actual dedicated Temporal worker restarts + V1 versioned subscription workflow/activity + real Prisma/storage + local HTTP OAuth/MCP; provider schema, quality and billing synthetic',address,workerRestart:true,opaqueWorkflowPayloads:true,jobs:after,lost:{id:lost.id,state:outcome.state,submitAttempts:1},recovery,providerCounters:{submits:f.provider.state.submits.length,quotes:f.provider.state.quotes.length,polls:f.provider.state.polls.length},noReplayAfterRestart:true};
    const output=process.env.CF_VIDEO_TEMPORAL_EVIDENCE||'.codex/stages/content-factory-next-zlq6-subscriptions-20261023/temporal.actual.json';fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(receipt,null,2));process.stdout.write(JSON.stringify(receipt,null,2)+'\n');
  }finally{for(const h of handles)await h.terminate('Task-owned acceptance cleanup').catch(()=>{});if(worker&&running){worker.shutdown();await running.catch(()=>{});}if(native)await native.close();if(connection)await connection.close();if(f)await f.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
