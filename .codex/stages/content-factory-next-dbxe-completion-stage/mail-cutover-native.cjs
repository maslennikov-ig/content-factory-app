'use strict';
// Loopback proof only: immutable workflows, synthetic letters, fake provider.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {randomUUID,createHash} = require('node:crypto');
const {Worker,NativeConnection,bundleWorkflowCode} = require('@temporalio/worker');
const {Client,Connection} = require('@temporalio/client');
const {ApplicationFailure} = require('@temporalio/common');
const {temporal} = require('@temporalio/proto');
const {inspectMailQueue} = require('../../../scripts/operations/inspect-mail-queue-state.cjs');
const {loadTypeScriptModule} = require('../../../tests/helpers/load-ts-module.cjs');
const root=path.resolve(__dirname,'../../..');
const owner=randomUUID(),image='sha256:cf86707827fac99e4d1c4a47dc11b105382d796199c7bd41fb3213fb0471628e';
const docker=(...args)=>execFileSync('docker',args,{encoding:'utf8',timeout:30000}).trim();
const inventory=()=>docker('ps','-aq','--no-trunc').split('\n').filter(Boolean).sort();
const save=(name,value)=>fs.writeFileSync(path.join(__dirname,name),JSON.stringify(value,null,2)+'\n');
const json=(type,value)=>type.toObject(value,{json:true,longs:String,enums:String,bytes:String});
async function until(check,timeout=90000){const end=Date.now()+timeout;while(!await check()){if(Date.now()>end)throw Error('Owned native cutover timeout');await new Promise(r=>setTimeout(r,100));}}
async function main(){
 loadTypeScriptModule('libraries/nestjs-libraries/src/temporal/mail-log-privacy.ts').installMailLogPrivacy();
 const source=path.join(__dirname,'cutover-workflows.local.ts');
 fs.writeFileSync(source,[2,3].map(n=>`export {sendEmailWorkflowV${n}} from ${JSON.stringify(path.join(root,`apps/orchestrator/src/workflows/send.email.workflow.v${n}.ts`))};`).join('\n'));
 const bundle=await bundleWorkflowCode({workflowsPath:source,workflowInterceptorModules:[path.join(root,'libraries/nestjs-libraries/src/temporal/mail-log-privacy.workflow.ts')]});
 fs.writeFileSync(path.join(__dirname,'cutover-bundle.local.cjs'),bundle.code);
 const before=inventory();let container,native,connection,worker;const proof={schema:'mail-empty-cutover-native/v1',status:'RUNNING',owner,sdk:require('@temporalio/worker/package.json').version,image,bundleSha256:createHash('sha256').update(bundle.code).digest('hex')};
 const calls=[];let grant;const blocked=new Promise(r=>grant=r);
 try{
  container=docker('run','-d','--name','cf-dbxe31-'+owner,'--label','cf.stage=dbxe.31','--label','cf.owner='+owner,'--memory','768m','--cpus','1','-p','127.0.0.1::7233',image,'server','start-dev','--ip','0.0.0.0','--port','7233','--headless','--log-level','error');
  save('cutover-owned.local.json',{owner,container,pid:process.pid});
  const port=JSON.parse(docker('inspect',container))[0].NetworkSettings.Ports['7233/tcp'][0];assert.equal(port.HostIp,'127.0.0.1');
  const address='127.0.0.1:'+port.HostPort;
  await until(async()=>{try{native=await NativeConnection.connect({address,connectTimeout:'1 second'});return true;}catch{return false;}});
  connection=await Connection.connect({address});const client=new Client({connection});
  const options={workflowBundle:bundle,taskQueue:'main',connection:native,activities:{sendEmailV2:async(...args)=>{
   calls.push(args[1]);if(args[1]==='legacy-blocked')await blocked;
   if(args[1].startsWith('v3-fail-'))throw ApplicationFailure.nonRetryable('synthetic permanent','synthetic');
  }}};
  const state=async handle=>{
   const h=await handle.fetchHistory();const raw=await client.workflowService.describeWorkflowExecution({namespace:'default',execution:{workflowId:'send_email_v2',runId:handle.firstExecutionRunId}});
   const history=json(temporal.api.history.v1.History,h),description=json(temporal.api.workflowservice.v1.DescribeWorkflowExecutionResponse,raw);
   return {history,description,proof:inspectMailQueue(history,description)};
  };
  worker=await Worker.create(options);
  await worker.runUntil(async()=>{
   const letter=subject=>({to:'cutover@example.invalid',subject,html:'synthetic',addTo:'bottom'});
   const legacy=await client.workflow.start('sendEmailWorkflowV2',{workflowId:'send_email_v2',taskQueue:'main',args:[{queue:[letter('legacy-blocked')]}]});
   await until(()=>calls.length===1);
   await legacy.signal('sendEmail',letter('legacy-bottom'));
   await legacy.signal('sendEmail',{...letter('legacy-top'),addTo:'top'});
   await until(async()=>{try{return (await state(legacy)).proof.acceptedSignals===2;}catch{return false;}});
   const busy=await state(legacy);assert.equal(busy.proof.readyForEmptyCutover,false);assert.equal(busy.proof.pendingQueue,2);proof.busyCutoverRefused=true;
   grant();let drained;
   await until(async()=>{try{drained=await state(legacy);return drained.proof.readyForEmptyCutover;}catch{return false;}});
   assert.deepEqual(calls,['legacy-blocked','legacy-top','legacy-bottom']);
   await legacy.terminate('Owned fixture: admission closed and queue proven empty');
   assert.equal((await legacy.describe()).status.name,'TERMINATED');
   const next=await client.workflow.start('sendEmailWorkflowV3',{workflowId:'send_email_v2',taskQueue:'main',args:[{queue:[]}]});
   assert.equal((await next.describe()).type,'sendEmailWorkflowV3');
   for(let n=0;n<31;n++)await next.signal('sendEmail',letter(n%10===0?'v3-fail-'+n:'v3-success-'+n));
   let current=client.workflow.getHandle('send_email_v2');
   await until(async()=>{const d=await current.describe();return d.runId!==next.firstExecutionRunId&&calls.length===34;});
   await until(async()=>{try{return (await state(current)).proof.readyForEmptyCutover;}catch{return false;}});
   const oldHistory=await client.workflow.getHandle('send_email_v2',legacy.firstExecutionRunId).fetchHistory();
   const v3first=await client.workflow.getHandle('send_email_v2',next.firstExecutionRunId).fetchHistory();const v3second=await current.fetchHistory();
   assert.equal(v3first.events.filter(e=>e.activityTaskScheduledEventAttributes).length,30);
   assert.equal(v3first.events.filter(e=>e.activityTaskFailedEventAttributes).length,3);
   assert.equal(v3second.events.filter(e=>e.activityTaskScheduledEventAttributes).length,1);
   assert.equal(new Set(calls).size,calls.length);
   for(const [name,history] of [['legacy',oldHistory],['v3-first',v3first],['v3-second',v3second]]){
    save('cutover-history-'+name+'.local.json',json(temporal.api.history.v1.History,history));
    await Worker.runReplayHistory({workflowBundle:bundle,taskQueue:'main'},history,'send_email_v2');
   }
   proof.mail={legacyPendingPreserved:3,legacyOrderPreserved:true,duplicateEffects:0,newV3Attempts:31,newV3Failures:4,firstRunAttemptBound:30,pendingAcrossRotation:1,replays:3};
   proof.stableWorkflowIdPreserved=true;proof.emptyState=drained.proof;
   await current.terminate('Owned synthetic proof completed');
  });
  proof.status='PASS';
 }finally{
  if(worker){try{worker.shutdown();}catch{}}
  if(connection)await connection.close();if(native)await native.close();
  if(container){const i=JSON.parse(docker('inspect',container))[0];assert.equal(i.Config.Labels['cf.owner'],owner);assert.equal(i.Config.Labels['cf.stage'],'dbxe.31');docker('rm','-f','-v',container);}
  const after=inventory();assert.ok(before.every(id=>after.includes(id)));proof.cleanup={ownedRemoved:true,beforeCount:before.length,afterCount:after.length,preexistingRemoved:before.filter(id=>!after.includes(id))};
  save('mail-cutover-native.actual.json',proof);
 }
 console.log(JSON.stringify(proof));
}
main().catch(error=>{fs.writeFileSync(path.join(__dirname,'cutover-error.local.txt'),String(error.stack));console.error('mail.cutover_native_failed: raw errors withheld');process.exitCode=1;});
