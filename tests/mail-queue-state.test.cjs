'use strict';
const assert = require('node:assert/strict');
const { inspectMailQueue } = require('../scripts/operations/inspect-mail-queue-state.cjs');
const letter = { to: 'queue-proof@example.invalid', subject: 'proof', html: 'synthetic', addTo: 'bottom' };
const p = value => value == null ? {metadata:{encoding:Buffer.from('binary/null').toString('base64')}} :
  { metadata:{encoding:Buffer.from('json/plain').toString('base64')}, data:Buffer.from(JSON.stringify(value)).toString('base64') };
const input = args => ({payloads:args.map(p)});
function fixture(queue = []) {
  return { events:[{eventId:'1',workflowExecutionStartedEventAttributes:{workflowType:{name:'sendEmailWorkflowV2'},taskQueue:{name:'main'},input:input([{queue}])}}] };
}
function describe(h) {
  return {workflowExecutionInfo:{execution:{workflowId:'send_email_v2'},type:{name:'sendEmailWorkflowV2'},taskQueue:'main',status:'WORKFLOW_EXECUTION_STATUS_RUNNING',historyLength:h.events.length}};
}
function event(h, key, value) { const id=String(h.events.length+1);h.events.push({eventId:id,[key]:value});return id; }
function schedule(h) {return event(h,'activityTaskScheduledEventAttributes',{activityType:{name:'sendEmailV2'},taskQueue:{name:'main'},input:input([letter.to,letter.subject,letter.html,null,null])});}
test('idle empty queue permits cutover without disclosing payloads', () => {
  const h=fixture();const r=inspectMailQueue(h,describe(h));assert.equal(r.readyForEmptyCutover,true);assert.equal(r.payloadsDisclosed,false);
});
test('initial and accepted unsent letters prevent cutover', () => {
  const h=fixture([letter]);event(h,'workflowExecutionSignaledEventAttributes',{signalName:'sendEmail',input:input([letter])});
  const r=inspectMailQueue(h,describe(h));assert.equal(r.pendingQueue,2);assert.equal(r.readyForEmptyCutover,false);
});
test('scheduled in-flight delivery prevents cutover', () => {
  const h=fixture([letter]);schedule(h);const r=inspectMailQueue(h,describe(h));assert.equal(r.unsettledActivities,1);assert.equal(r.readyForEmptyCutover,false);
});
test('drained success plus finished pacing permits cutover once only', () => {
  const h=fixture([letter]);const id=schedule(h);event(h,'activityTaskCompletedEventAttributes',{scheduledEventId:id});
  event(h,'timerStartedEventAttributes',{timerId:'pace'});assert.equal(inspectMailQueue(h,describe(h)).readyForEmptyCutover,false);
  event(h,'timerFiredEventAttributes',{timerId:'pace'});const r=inspectMailQueue(h,describe(h));assert.equal(r.completedActivities,1);assert.equal(r.readyForEmptyCutover,true);
  schedule(h);assert.throws(()=>inspectMailQueue(h,describe(h)),/no admitted occurrence/);
});
test('pending workflow task or described activity prevents cutover', () => {
  const h=fixture();const id=event(h,'workflowTaskScheduledEventAttributes',{});
  assert.equal(inspectMailQueue(h,describe(h)).readyForEmptyCutover,false);
  event(h,'workflowTaskCompletedEventAttributes',{scheduledEventId:id});const d=describe(h);d.pendingActivities=[{}];
  assert.equal(inspectMailQueue(h,d).readyForEmptyCutover,false);
});
test('unsupported scope, codec and malformed shapes fail closed', () => {
  const h=fixture();const d=describe(h);d.workflowExecutionInfo.execution.workflowId='foreign';assert.throws(()=>inspectMailQueue(h,d));
  const bad=fixture([{}]);assert.throws(()=>inspectMailQueue(bad,describe(bad)),/queued mail shape/);
  const encoded=fixture();encoded.events[0].workflowExecutionStartedEventAttributes.input.payloads[0].metadata.encoding=Buffer.from('custom').toString('base64');
  assert.throws(()=>inspectMailQueue(encoded,describe(encoded)),/encoding/);
});
test('unknown events or nonmatching history/description cannot prove empty', () => {
  const h=fixture();const d=describe(h);event(h,'workflowExecutionUpdateAcceptedEventAttributes',{});
  assert.throws(()=>inspectMailQueue(h,d),/differ/);assert.throws(()=>inspectMailQueue(h,describe(h)),/Unsupported history event/);
});
test('settled failure stays visible and is never treated as success', () => {
  const h=fixture([letter]);const id=schedule(h);event(h,'activityTaskFailedEventAttributes',{scheduledEventId:id});
  const r=inspectMailQueue(h,describe(h));assert.equal(r.failedActivities,1);assert.equal(r.completedActivities,0);
});
