'use strict';
const {setup, THREAD, scenario, domain, denied} = require('./helpers/native-clip-production.fixture.cjs');

async function ready(options = {}) {
  const f = await setup(options);
  if (options.mode !== 'autopilot') await f.service.setExecutionModeV2(f.ids.org, f.ids.actor, THREAD, {pilotId: f.pilotId, mode: 'review'});
  await f.prepare();
  const q = await f.service.budgetQuestion(f.ids.org, f.ids.actor, THREAD, f.pilotId, 'human-budget', 'ru');
  await f.service.answerBudget(f.ids.org, f.ids.actor, THREAD, f.pilotId, 'human-budget', q, {answer: '10'});
  const first = (await f.service.open(f.ids.org, f.ids.actor, THREAD, f.pilotId)).production.executionApproval;
  const launch = {pilotId: f.pilotId, preflightId: first.preflightId, approvalHash: first.approvalHash};
  return {f, launch};
}
test('review mode shows exact scenario approval, cannot create images before it, then durably parks the actual pair before video', async () => {
  const {f, launch} = await ready();
  const approval = await f.service.approval(f.ids.org, f.ids.actor, launch);
  expect(approval).toMatchObject({executionMode: 'review', scenario});
  expect(f.calls.some(c => c.startsWith('admit:'))).toBe(false);
  const firstRow = [...f.stages.values()].find(r => r.stage === 'first_frame');
  await denied(f.service.assertCurrentPilot(f.db, f.expected(firstRow, 'submit', launch.approvalHash)), 'CLIP_WHOLE_PILOT_APPROVAL_REQUIRED');
  await f.service.launch(f.ids.org, f.ids.actor, THREAD, launch);
  await f.settle('first_frame'); const event = await f.settle('last_frame');
  expect(f.calls.filter(c => c.startsWith('admit:'))).toEqual(['admit:first_frame', 'admit:last_frame']);
  expect(f.calls.filter(c => c.startsWith('vision:'))).toHaveLength(1);
  let view = (await f.service.open(f.ids.org, f.ids.actor, THREAD, f.pilotId)).production;
  expect(view.executionV2).toMatchObject({mode: 'review', referenceApproval: {state: 'awaiting_approval', canApprove: true}});
  expect(f.parent().payload.production.stagePlans.clip).toBeUndefined();
  expect(f.calls).not.toContain('quote:clip');
  // Direct preparation/admission of a clip cannot turn an event into owner consent.
  await f.service.ensurePlan(f.ids.org, f.ids.actor, f.pilotId, 'clip');
  const plan = f.parent().payload.production.stagePlans.clip;
  await f.hgg.quote(f.ids.org, f.ids.actor, plan);
  const clip = [...f.stages.values()].find(r => r.stage === 'clip' && !r.planningOnly);
  await denied(f.service.assertCurrentPilot(f.db, f.expected(clip, 'submit', domain.digest('attempt'))), 'CLIP_REFERENCE_APPROVAL_REQUIRED');
  await f.service.onStageSettled(event); await f.prepare();
  expect(f.calls.filter(c => c.startsWith('admit:'))).toHaveLength(2);
  view = (await f.service.open(f.ids.org, f.ids.actor, THREAD, f.pilotId)).production;
  const refs = view.executionV2.referenceApproval;
  const input = {pilotId: f.pilotId, referenceDigest: refs.referenceDigest};
  const shown = await f.service.referenceApprovalV2(f.ids.org, f.ids.actor, input);
  expect(shown.frames.map(a => a.ownedMediaId)).toEqual(['owned-first_frame', 'owned-last_frame']);
  await f.service.launchReviewedClipV2(f.ids.org, f.ids.actor, THREAD, input);
  await f.service.launchReviewedClipV2(f.ids.org, f.ids.actor, THREAD, input);
  await f.service.onStageSettled(event);
  expect(f.calls.filter(c => c.startsWith('admit:'))).toEqual(['admit:first_frame', 'admit:last_frame', 'admit:clip']);
});
test('new unselected pilot defaults to review; prepared or paid policies cannot be switched or old consents reinterpreted', async () => {
  const f = await setup({executionMode: 'new_default'}); await f.prepare();
  expect(f.parent().payload.production.executionV2).toEqual({version: 2, mode: 'review'});
  await denied(f.service.setExecutionModeV2(f.ids.org, f.ids.actor, THREAD, {pilotId: f.pilotId, mode: 'autopilot'}), 'CLIP_EXECUTION_MODE_LOCKED');
  const {f: paid, launch} = await ready(); await paid.service.launch(paid.ids.org, paid.ids.actor, THREAD, launch);
  const old = structuredClone(paid.parent().payload);
  await denied(paid.service.setExecutionModeV2(paid.ids.org, paid.ids.actor, THREAD, {pilotId: paid.pilotId, mode: 'autopilot'}), 'CLIP_EXECUTION_MODE_LOCKED');
  expect(paid.parent().payload).toEqual(old);
});
test.each(['source', 'frame', 'stop', 'budget', 'digest'])('reference acceptance refuses changed %s without buying a video', async changed => {
  const {f, launch} = await ready(); await f.service.launch(f.ids.org, f.ids.actor, THREAD, launch);
  await f.settle('first_frame'); await f.settle('last_frame');
  const refs = (await f.service.open(f.ids.org, f.ids.actor, THREAD, f.pilotId)).production.executionV2.referenceApproval;
  const input = {pilotId: f.pilotId, referenceDigest: refs.referenceDigest};
  if (changed === 'source') await f.editPost('New source');
  if (changed === 'frame') f.parent().payload.production.framePair.assets[1].byteSha256 = '0'.repeat(64);
  if (changed === 'stop') await f.service.stop(f.ids.org, f.ids.actor, THREAD, f.pilotId, 'human-stop');
  if (changed === 'budget') f.parent().payload.production.authorization.value.pilotLimit = '100';
  if (changed === 'digest') input.referenceDigest = '0'.repeat(64);
  await expect(f.service.launchReviewedClipV2(f.ids.org, f.ids.actor, THREAD, input)).rejects.toBeDefined();
  expect(f.calls).not.toContain('admit:clip');
  expect(f.parent().payload.production.executionV2.referencesApproval).toBeUndefined();
});
test('delayed human pair approval works after original image quotes expire and requests the clip price only afterward', async () => {
  const {f, launch} = await ready(); await f.service.launch(f.ids.org, f.ids.actor, THREAD, launch);
  await f.settle('first_frame'); await f.settle('last_frame');
  const refs = (await f.service.open(f.ids.org, f.ids.actor, THREAD, f.pilotId)).production.executionV2.referenceApproval;
  for (const row of f.stages.values()) row.public.quote.localAdmissionExpiresAt = '2000-01-01T00:00:00Z';
  expect(f.parent().payload.production.stagePlans.clip).toBeUndefined();
  expect(f.calls).not.toContain('quote:clip');
  await f.service.launchReviewedClipV2(f.ids.org, f.ids.actor, THREAD, {pilotId: f.pilotId, referenceDigest: refs.referenceDigest});
  expect(f.calls.slice(-2)).toEqual(['quote:clip', 'admit:clip']);
});
test('persisted V1 absent-policy pilot keeps its original context hash and automatic chain without reinterpretation', async () => {
  const f = await setup(); await f.prepare();
  const p = f.parent().payload;
  delete p.production.executionV2; delete p.executionModeV2;
  p.production.contextDigest = require('./helpers/native-clip-production.fixture.cjs').binding.clipProductionContextV1(p, p.production);
  const expected = domain.digest({version: 1, source: p.source, policy: p.policy, scenarioDigest: domain.digest(scenario),
    acceptedTextReviewDigest: domain.digest(JSON.parse(p.stages.at(-1).raw)), acceptedTextReviewInputHash: p.stages.at(-1).inputDigest,
    outputLocale: p.outputLocale, request: p.production.request, connectionId: p.production.connectionId, accountGeneration: p.production.accountGeneration,
    workspaceBindingHash: p.production.workspace.bindingHash, imageSettings: p.production.imageSettings, videoResolution: p.production.videoResolution, budgetMode: 'owner_entered'});
  expect(p.production.contextDigest).toBe(expected);
  const q = await f.service.budgetQuestion(f.ids.org, f.ids.actor, THREAD, f.pilotId, 'old-budget', 'ru');
  await f.service.answerBudget(f.ids.org, f.ids.actor, THREAD, f.pilotId, 'old-budget', q, {answer: '10'});
  const approval = (await f.service.open(f.ids.org, f.ids.actor, THREAD, f.pilotId)).production.executionApproval;
  await f.service.launch(f.ids.org, f.ids.actor, THREAD, {pilotId: f.pilotId, preflightId: approval.preflightId, approvalHash: approval.approvalHash});
  const originalConsent = structuredClone(f.parent().payload.production.authorization.executionApproval);
  await f.settle('first_frame'); await f.settle('last_frame'); await f.settle('clip');
  expect(f.calls.filter(c => c.startsWith('admit:'))).toEqual(['admit:first_frame', 'admit:last_frame', 'admit:clip']);
  expect(f.parent().payload.production.authorization.executionApproval).toEqual(originalConsent);
  expect((await f.service.open(f.ids.org, f.ids.actor, THREAD, f.pilotId)).production.executionV2).toBeUndefined();
});
