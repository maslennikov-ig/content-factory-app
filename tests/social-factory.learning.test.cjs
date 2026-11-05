const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const base = 'libraries/nestjs-libraries/src/content-intelligence/social-factory/';
const { observedNumber, publicationMetrics } = loadTypeScriptModule(base + 'measurement/provider-measurement.policy.ts');
const types = loadTypeScriptModule(base + 'measurement/measurement.types.ts');
const { evaluateExperiment } = loadTypeScriptModule(base + 'learning/evaluate-experiment.ts', { '../measurement/measurement.types': types });
const now = new Date('2026-11-03T12:00:00Z');
const experiment = { version: 1, id: 'trial', channelId: 'channel', dimension: 'hook', metric: 'Views', objective: 'maximize',
  baseline: { label: 'Plain hook', itemIds: ['a','b','c'] }, candidate: { label: 'Question hook', itemIds: ['d','e','f'] },
  comparisonWindowHours: 24, createdAt: '2026-11-01T12:00:00Z', endsAt: '2026-11-05T12:00:00Z', status: 'planned' };
const observation = (itemId, value, patch = {}) => ({ version: 1, id: itemId+'-obs', campaignId: 'campaign', itemId,
  channelId:'channel', accountId:'channel', platform:'instagram', publicationId:itemId+'-external', revision:1, format:'reel',
  value, metric:'Views', unit:'count', availability:'available', source:'provider:instagram:postAnalytics', access:'first_party',
  observedAt:now.toISOString(), authorizationCheckedAt:now.toISOString(), expiresAt:'2026-11-20T12:00:00Z', derivationAllowed:true,
  window:{kind:'lifetime',start:'2026-11-02T12:00:00Z',end:now.toISOString(),ageSeconds:86400},
  evidence:[{id:'evidence',sourceId:'source',rights:'permitted',expiresAt:'2026-11-20T12:00:00Z'}], ...patch });
const evidence = () => ['a','b','c','d','e','f'].map((id,index)=>observation(id,index<3?10:30));

test('unknown numeric data never becomes zero, real zero stays available; no slide metrics promised', () => {
  for (const value of [undefined,null,'','  ','bad',NaN,Infinity,false,-1]) expect(observedNumber(value)).toBeNull();
  expect(observedNumber('0')).toBe(0);
  expect(publicationMetrics('instagram')).not.toContain('Slide retention');
  expect(publicationMetrics('telegram')).toEqual([]);
});
test('bounded evidence produces proposed temporary association, preserving exploration', () => {
  const result = evaluateExperiment(experiment,evidence(),now);
  expect(result.state).toBe('finding');
  expect(result.finding).toMatchObject({status:'proposed',sampleSize:6,interpretation:'association',explorationShare:0.25,
    comparison:{baseline:10,candidate:30,baselineCount:3,candidateCount:3}});
  expect(result.finding.expiresAt).toBe('2026-11-20T12:00:00.000Z');
});
test('repeat observations do not increase the sample size', () => {
  const repeated = Array.from({length:20}, (_,index)=>observation('a',10,{id:'a'+index}));
  expect(evaluateExperiment(experiment,[...repeated,observation('d',100)],now).state).toBe('insufficient');
});
test('missing, expired, revoked and policy-restricted evidence cannot generate a winner', () => {
  for (const patch of [{value:null,availability:'unknown'},{expiresAt:now.toISOString()},{derivationAllowed:false},
    {evidence:[{id:'evidence',sourceId:'source',rights:'restricted'}]}]) {
    expect(evaluateExperiment(experiment,evidence().map(v=>({...v,...patch})),now).state).toBe('insufficient');
  }
});
test('different publication ages/accounts/windows and unrelated tenants cannot be compared', () => {
  expect(evaluateExperiment(experiment,evidence().map(v=>({...v,window:{...v.window,ageSeconds:v.itemId==='d'?864000:86400}})),now).state).toBe('insufficient');
  expect(evaluateExperiment(experiment,evidence().map(v=>v.itemId==='d'?{...v,accountId:'other-account'}:v),now).state).toBe('incomparable');
  expect(evaluateExperiment(experiment,evidence().map(v=>({...v,channelId:'other-channel'})),now).state).toBe('insufficient');
});
test('true zero does not fabricate infinite uplift and noisy results stay inconclusive', () => {
  expect(evaluateExperiment(experiment,evidence().map(v=>({...v,value:0})),now).state).toBe('inconclusive');
  const noisy = [0,100,1,40,30,50].map((v,i)=>observation('abcdef'[i],v));
  expect(evaluateExperiment(experiment,noisy,now).state).toBe('inconclusive');
});
