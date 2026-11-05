const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const ROOT = 'libraries/nestjs-libraries/src/content-intelligence/social-factory';
const file = `${ROOT}/autonomy/editorial-decision.service.ts`;
class DomainError extends Error { constructor(code, message = code) { super(message); this.code = code; } }
const repositoryModule = { SocialFactoryRepository: class SocialFactoryRepository {}, SocialFactoryError: DomainError, sourceRef: id => `source:${id}`, resourceRef: (kind, id) => `resource:${kind}:${id}` };
const domainMocks = { '../social-factory.repository': repositoryModule, './social-factory.repository': repositoryModule };
const campaignsModule = loadTypeScriptModule(`${ROOT}/campaign/campaign.service.ts`, domainMocks);
const autonomyModule = loadTypeScriptModule(`${ROOT}/autonomy/autonomy.service.ts`, domainMocks);
const profilesModule = loadTypeScriptModule(`${ROOT}/profiles/channel-profile.v1.ts`, domainMocks);
const editorialAnswer = { kind: 'editorial', answer: 'Use a practical checklist.', missingFacts: [] };
const request = extra => ({ campaignId: 'campaign', itemId: 'item', requestId: 'request', question: 'Which structure should this post use?', ...extra });

/** Serialized commits, rollback and CAS stand in only for Prisma; all domain/profile resolution is real. */
class Store {
  rows = new Map(); queue = Promise.resolve(); failCompleted = 0;
  key(org, kind, id) { return JSON.stringify([org, kind, id]); }
  async transact(work) {
    const previous = this.queue; let release; this.queue = new Promise(resolve => { release = resolve; }); await previous;
    const before = structuredClone(this.rows);
    try { return await work(this); } catch (error) { this.rows = before; throw error; } finally { release(); }
  }
  async read(org, kind, id) { return structuredClone(this.rows.get(this.key(org, kind, id)) ?? null); }
  async list(org, kind, limit = 10000, parentId) { return structuredClone([...this.rows.values()].filter(row => row.organizationId === org && row.kind === kind && (parentId === undefined || row.parentId === parentId)).slice(0, limit)); }
  async put(input) {
    if (input.kind === 'editorial' && input.payload.state === 'completed' && this.failCompleted > 0) { this.failCompleted--; throw new Error('completion write unavailable'); }
    const key = this.key(input.organizationId, input.kind, input.id); const prior = this.rows.get(key);
    if (input.expectedRevision === 0 && prior || input.expectedRevision > 0 && prior?.revision !== input.expectedRevision) throw new DomainError('SOCIAL_FACTORY_CONFLICT');
    if (prior && ['decision', 'action'].includes(input.kind)) throw new DomainError('SOCIAL_FACTORY_IMMUTABLE');
    const row = { ...structuredClone(input), revision: (prior?.revision ?? 0) + 1, parentId: input.parentId ?? prior?.parentId ?? null };
    this.rows.set(key, row); return structuredClone(row);
  }
}
async function fixture(options = {}) {
  const store = new Store();
  const campaign = { version: 1, id: 'campaign', name: 'Useful advice for finance teams', actorId: 'actor', mode: 'autopilot', state: 'active', grantId: 'grant', timeZone: 'UTC', startsAt: '2030-01-01T00:00:00Z', endsAt: '2030-01-14T23:59:59Z', itemIds: ['item'], researchIds: [], findingIds: [], allocations: [{ channelId: 'channel', platform: 'telegram', format: 'post', count: 1 }] };
  const item = { version: 1, id: 'item', campaignId: 'campaign', channelId: 'channel', format: 'post', platform: 'telegram', state: 'planned', contentRevision: 1, scheduledAt: '2030-01-03T12:00:00Z', ...(options.material ? { material: options.material } : {}) };
  const grant = { version: 1, id: 'grant', actorId: 'actor', mode: 'autopilot', channelIds: ['channel'], actions: ['prepare', 'editorial_decide'], expiresAt: '2031-01-01T00:00:00Z', platformConsentIds: [] };
  for (const [kind, payload] of [['campaign', campaign], ['campaign_item', item], ['grant', grant]]) await store.put({ organizationId: 'org', kind, id: payload.id, parentId: kind === 'campaign_item' ? campaign.id : undefined, payload, expectedRevision: 0 });
  const config = { provider: options.provider ?? 'openai', modelRouting: { advancedModel: 'configured-advanced' } };
  const generate = jest.fn(options.generate ?? (async prompt => {
    const questions=JSON.parse(prompt).questions;
    return {object: questions ? {answers:questions.map(q=>({id:q.id,...(options.answer ?? editorialAnswer)}))} : options.answer ?? editorialAnswer};
  }));
  const agentOptions = []; const loadConfig = jest.fn(async () => config);
  const usage = { executeAiOperation: jest.fn(async (_org, _operation, callback) => callback()) };
  const { EditorialDecisionService } = loadTypeScriptModule(file, {
    '@mastra/core/agent': { Agent: class { constructor(value) { agentOptions.push(value); } async generate(...args) { return generate(...args); } } },
    '../../../openai/ai.usage.service': { AiUsageService: class AiUsageService {} },
    '../../../openai/ai.provider.config': { loadAiConfig: loadConfig, requireActiveAiConfig: async () => config },
    '../../../openai/ai.clients': { getMastraAgentModelEntries: async (_org, _role, { modelId }) => ({ provider: config.provider, primaryModel: modelId, policy: { fallbackDisabled: options.fallbackDisabled ?? false }, entries: [{ model: { modelId: options.actualModel ?? modelId } }, { model: { modelId: 'fallback' } }] }) },
    '../campaign/campaign.service': campaignsModule, './autonomy.service': autonomyModule, '../profiles/channel-profile.v1': profilesModule,
    '../social-factory.repository': repositoryModule,
  });
  const campaigns = new campaignsModule.CampaignService(store); const autonomy = new autonomyModule.AutonomyService(store);
  const profiles = new profilesModule.ChannelProfileServiceV1({ store,
    integrations: { getIntegrationById: async (org, id) => org === 'org' && id === 'channel' ? { id, providerIdentifier: 'telegram', contentLanguage: 'en', deletedAt: null, writingProfile: {} } : null },
    brands: { getActiveRuntimeVersion: async org => org === 'org' ? { profile: { id: 'company-brand' }, version: { id: 'brand-v1', contentDigest: 'brand-digest', content: { project: { audiences: [{ name: 'Financial directors', need: 'Reduce reporting time' }], positioning: 'Reliable audit preparation', contentGoals: ['Qualified conversations'] }, voice: { defaultLanguage: 'en' }, guardrails: { prohibitedTopics: [], prohibitedClaims: ['Guaranteed profit'] } } } } : null },
  });
  jest.spyOn(profiles, 'resolve');
  const service = new EditorialDecisionService(campaigns, autonomy, usage, store, profiles);
  const restart = () => new EditorialDecisionService(campaigns, autonomy, usage, store, profiles);
  const change = async (kind, id, mutate) => { const row = await store.read('org', kind, id); mutate(row.payload); await store.put({ organizationId: 'org', kind, id, payload: row.payload, expectedRevision: row.revision }); };
  return { service, restart, store, generate, agentOptions, loadConfig, usage, profiles, autonomy, config, change };
}
beforeEach(() => { jest.useFakeTimers({ now: Date.parse('2030-01-01T12:00:00Z') }); });
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

test('calls only the configured advanced model inside admission and persists truthful inferred metadata', async () => {
  const f = await fixture(); const result = await f.service.answer('org', 'actor', request());
  expect(f.usage.executeAiOperation).toHaveBeenCalledWith('org', 'agent', expect.any(Function), 'agent');
  expect(f.agentOptions[0].model).toEqual([{ model: { modelId: 'configured-advanced' }, maxRetries: 0 }]);
  expect(result).toMatchObject({ factStatus: 'inferred', kind: 'editorial', model: { provider: 'openai', model: 'configured-advanced', role: 'agent' } });
  expect((await f.store.list('org', 'decision'))).toHaveLength(1);
});
test('completed repeats survive service restart without another model invocation or usage admission', async () => {
  const f = await fixture(); const first = await f.service.answer('org', 'actor', request());
  expect(await f.restart().answer('org', 'actor', request())).toEqual(first);
  expect(f.generate).toHaveBeenCalledTimes(1); expect(f.usage.executeAiOperation).toHaveBeenCalledTimes(1);
});
test('concurrent requests have one durable paid claim; pending replay cannot invoke the model', async () => {
  let entered; let complete;
  const started = new Promise(resolve => { entered = resolve; }); const gate = new Promise(resolve => { complete = resolve; });
  const f = await fixture({ generate: async () => { entered(); return gate; } });
  const first = f.service.answer('org', 'actor', request()); await started;
  await expect(f.restart().answer('org', 'actor', request())).rejects.toHaveProperty('code', 'AUTONOMY_EDITORIAL_UNCERTAIN');
  complete({ object: editorialAnswer }); await first;
  expect(f.generate).toHaveBeenCalledTimes(1); expect(f.usage.executeAiOperation).toHaveBeenCalledTimes(1);
});
test('the same request identity with different question, campaign, item or grant rejects before spending', async () => {
  const f = await fixture(); await f.service.answer('org', 'actor', request());
  for (const change of [{ question: 'A different question' }, { campaignId: 'different' }, { itemId: 'different' }, { grantId: 'different' }]) await expect(f.service.answer('org', 'actor', request(change))).rejects.toHaveProperty('code', 'AUTONOMY_IDEMPOTENCY_CONFLICT');
  expect(f.generate).toHaveBeenCalledTimes(1);
});
test('a lost model response remains uncertain across restart and is never automatically invoked again', async () => {
  const f = await fixture({ generate: async () => { throw new Error('response lost'); } });
  await expect(f.service.answer('org', 'actor', request())).rejects.toHaveProperty('code', 'AUTONOMY_EDITORIAL_UNCERTAIN');
  expect((await f.store.list('org', 'editorial'))[0].payload.state).toBe('uncertain');
  await expect(f.restart().answer('org', 'actor', request())).rejects.toHaveProperty('code', 'AUTONOMY_EDITORIAL_UNCERTAIN');
  expect(f.generate).toHaveBeenCalledTimes(1);
});
test('a model output checkpoint retries domain persistence without another paid call', async () => {
  const f = await fixture(); const decide = jest.spyOn(f.autonomy, 'decide').mockRejectedValueOnce(new Error('decision storage unavailable'));
  await expect(f.service.answer('org', 'actor', request())).rejects.toThrow('decision storage unavailable');
  expect((await f.store.list('org', 'editorial'))[0].payload.state).toBe('checkpoint');
  decide.mockRestore(); const result = await f.restart().answer('org', 'actor', request());
  expect(result.answer).toBe(editorialAnswer.answer); expect(f.generate).toHaveBeenCalledTimes(1);
});
test('a crash after decision commit replays the same decision from the saved output without paying again', async () => {
  const f = await fixture(); f.store.failCompleted = 1;
  await expect(f.service.answer('org', 'actor', request())).rejects.toThrow('completion write unavailable');
  const saved = (await f.store.list('org', 'decision'))[0].payload;
  expect(await f.restart().answer('org', 'actor', request())).toEqual(saved);
  expect(f.generate).toHaveBeenCalledTimes(1); expect((await f.store.list('org', 'decision'))).toHaveLength(1);
});
test.each(['revoked', 'missing'])('%s grant prevents all model spending', async state => {
  const f = await fixture();
  if (state === 'revoked') await f.change('grant', 'grant', grant => { grant.revokedAt = '2029-01-01T00:00:00Z'; });
  else await f.change('campaign', 'campaign', campaign => { delete campaign.grantId; });
  await expect(f.service.answer('org', 'actor', request())).rejects.toHaveProperty('code', state === 'revoked' ? 'AUTONOMY_GRANT_INACTIVE' : 'AUTONOMY_GRANT_REQUIRED');
  expect(f.generate).not.toHaveBeenCalled(); expect(f.usage.executeAiOperation).not.toHaveBeenCalled(); expect(f.loadConfig).not.toHaveBeenCalled();
});
test('cold-start prompt uses real resolved company/channel audience, goals, facts and open brief before material exists', async () => {
  const f = await fixture(); await f.service.answer('org', 'actor', request());
  const prompt = JSON.parse(f.generate.mock.calls[0][0]);
  expect(f.profiles.resolve).toHaveBeenCalledWith('org', 'channel');
  expect(prompt.channelProfiles[0].profile.audience).toBe('Financial directors: Reduce reporting time');
  expect(prompt.channelProfiles[0].profile.goals).toEqual(['Qualified conversations']);
  expect(prompt.channelProfiles[0].facts).toContainEqual(expect.objectContaining({ key: 'audience', provenance: 'owner_asserted', scope: 'company' }));
  expect(prompt.question).toBe(request().question); expect(prompt.item.material).toBeNull();
  expect(prompt.campaign.name).toBe('Useful advice for finance teams');
});
test('an absent advanced profile blocks explicitly instead of claiming a base model was advanced', async () => {
  const f = await fixture(); delete f.config.modelRouting.advancedModel;
  await expect(f.service.answer('org', 'actor', request())).rejects.toHaveProperty('code', 'AUTONOMY_ADVANCED_MODEL_REQUIRED');
  await expect(f.restart().answer('org', 'actor', request())).rejects.toHaveProperty('code', 'AUTONOMY_ADVANCED_MODEL_REQUIRED');
  expect(f.generate).not.toHaveBeenCalled(); expect(f.usage.executeAiOperation).not.toHaveBeenCalled();
});
test('a substituted fallback entry is blocked before the model call', async () => {
  const f = await fixture({ actualModel: 'different-fallback' });
  await expect(f.service.answer('org', 'actor', request())).rejects.toHaveProperty('code', 'AUTONOMY_ADVANCED_MODEL_UNAVAILABLE');
  expect(f.generate).not.toHaveBeenCalled();
});
test('checkpoint replay rechecks current authority after the model returned and never pays again', async () => {
  const f = await fixture({ generate: async () => { await f.change('grant', 'grant', grant => { grant.revokedAt = '2029-01-01T00:00:00Z'; }); return { object: editorialAnswer }; } });
  await expect(f.service.answer('org', 'actor', request())).rejects.toHaveProperty('code', 'AUTONOMY_GRANT_INACTIVE');
  expect((await f.store.list('org', 'editorial'))[0].payload.state).toBe('checkpoint');
  await expect(f.restart().answer('org', 'actor', request())).rejects.toHaveProperty('code', 'AUTONOMY_GRANT_INACTIVE');
  expect(f.generate).toHaveBeenCalledTimes(1); expect((await f.store.list('org', 'decision'))).toHaveLength(0);
});
test('company fact, permission and budget responses remain missing inputs and never self-authorize', async () => {
  const f = await fixture({ answer: { kind: 'budget', answer: 'Spend unlimited money', missingFacts: ['Owner budget limit'] } });
  const result = await f.service.answer('org', 'actor', request({ question: 'What budget may we spend?' }));
  expect(result.answer).toBeUndefined(); expect(result.factStatus).toBe('unknown'); expect(result.missingFacts).toEqual(['Owner budget limit']);
  expect((await f.store.read('org', 'campaign_item', 'item')).payload.state).toBe('needs_input');
});

test('a concurrent Prisma unique-key claim conflict resolves to the durable pending operation without paying again', async () => {
  let entered; let complete;
  const started = new Promise(resolve => { entered = resolve; }); const gate = new Promise(resolve => { complete = resolve; });
  const f = await fixture({ generate: async () => { entered(); return gate; } });
  const first = f.service.answer('org', 'actor', request()); await started;
  jest.spyOn(f.store, 'transact').mockRejectedValueOnce(new DomainError('SOCIAL_FACTORY_CONFLICT'));
  await expect(f.restart().answer('org', 'actor', request())).rejects.toHaveProperty('code', 'AUTONOMY_EDITORIAL_UNCERTAIN');
  complete({ object: editorialAnswer }); await first;
  expect(f.generate).toHaveBeenCalledTimes(1); expect(f.usage.executeAiOperation).toHaveBeenCalledTimes(1);
});

test('a known no-call config block can resume the same request after configuration repair', async()=>{
 const f=await fixture();delete f.config.modelRouting.advancedModel;
 await expect(f.service.answer('org','actor',request())).rejects.toHaveProperty('code','AUTONOMY_ADVANCED_MODEL_REQUIRED');
 expect(f.generate).not.toHaveBeenCalled();
 f.config.modelRouting.advancedModel='configured-advanced';
 const answer=await f.restart().answer('org','actor',request());
 expect(answer.answer).toBe(editorialAnswer.answer);expect(f.generate).toHaveBeenCalledTimes(1);
 await f.restart().answer('org','actor',request());expect(f.generate).toHaveBeenCalledTimes(1);
});

test('only a definite model-not-found rejection uses the configured fallback and persists provenance', async () => {
  const missing = Object.assign(new Error('No selected model'), {statusCode: 404, responseBody: JSON.stringify({error:{code:'model_not_found'}})});
  const generate = jest.fn().mockRejectedValueOnce(missing).mockResolvedValue({object: editorialAnswer});
  const f = await fixture({generate});
  const answer = await f.service.answer('org', 'actor', request());
  expect(answer.model).toMatchObject({model:'fallback', selectedModel:'configured-advanced', fallbackReason:'MODEL_NOT_FOUND', attemptedModels:['configured-advanced','fallback']});
  expect(f.agentOptions.map(row=>row.model[0].model.modelId)).toEqual(['configured-advanced','fallback']);
  expect(f.usage.executeAiOperation).toHaveBeenCalledTimes(1);
  expect(await f.restart().answer('org','actor',request())).toEqual(answer);
  expect(generate).toHaveBeenCalledTimes(2);
});

test.each([true, false])('model-not-found exhausts configured candidates without enabling disabled fallback (%s)', async fallbackDisabled => {
  const error=Object.assign(new Error('missing'),{statusCode:404,code:'model_not_found'});
  const f=await fixture({fallbackDisabled,generate:async()=>{throw error;}});
  await expect(f.service.answer('org','actor',request())).rejects.toHaveProperty('code','AUTONOMY_ADVANCED_MODEL_UNAVAILABLE');
  expect(f.generate).toHaveBeenCalledTimes(fallbackDisabled?1:2);
  expect((await f.store.list('org','editorial'))[0].payload.state).toBe('blocked');
});

test.each([{}, {statusCode:429}, {statusCode:401}, {statusCode:404,code:'endpoint_not_found'}, {statusCode:503}])('ambiguous and unrelated errors never trigger a second expert call: %j', async shape => {
  const f=await fixture({generate:async()=>{throw Object.assign(new Error('unavailable'),shape);}});
  await expect(f.service.answer('org','actor',request())).rejects.toHaveProperty('code','AUTONOMY_EDITORIAL_UNCERTAIN');
  await expect(f.restart().answer('org','actor',request())).rejects.toHaveProperty('code','AUTONOMY_EDITORIAL_UNCERTAIN');
  expect(f.generate).toHaveBeenCalledTimes(1);
});

test('all scoped editorial clarification types resolve and survive restart without new calls', async()=>{
  const f=await fixture();
  const types=['angle','structure','length','hook','cta','tone','visual','format'];
  const input={campaignId:'campaign',itemId:'item',requestId:'questions',questions:types.map(type=>({id:type,type,question:`Choose ${type} from the saved brief.`}))};
  const answers=await f.service.answerQuestions('org','actor',input);
  expect(answers.complete).toBe(true);expect(answers.decisions.map(row=>row.type)).toEqual(types);
  expect(answers.decisions.every(row=>row.decision.factStatus==='inferred')).toBe(true);
  expect(await f.restart().answerQuestions('org','actor',input)).toEqual(answers);
  expect(f.generate).toHaveBeenCalledTimes(1);
  expect(new Set(answers.decisions.map(row=>row.decision.model.operationId)).size).toBe(1);
});

test('explicit business/account facts, rights, budget and consent never invoke a model or invent answers',async()=>{
  const f=await fixture(); const types=['business_fact','account_features','rights','budget','permission'];
  const input={campaignId:'campaign',itemId:'item',requestId:'facts',questions:types.map(type=>({id:type,type,question:`Missing actual ${type}`}))};
  const answers=await f.service.answerQuestions('org','actor',input);
  expect(answers.complete).toBe(false);expect(answers.missingFacts).toHaveLength(types.length);
  expect(answers.decisions.every(row=>!row.decision.answer&&row.decision.factStatus==='unknown')).toBe(true);
  expect((await f.store.read('org','campaign_item','item')).payload.state).toBe('needs_input');
  expect(f.generate).not.toHaveBeenCalled();expect(f.usage.executeAiOperation).not.toHaveBeenCalled();
  expect(await f.restart().answerQuestions('org','actor',input)).toEqual(answers);
});

test('invalid or repeated clarification identities reject the whole batch before spending',async()=>{
  const f=await fixture();
  for(const questions of [[{id:'q',type:'invented',question:'Which?'}],[{id:'q',type:'tone',question:'Which?'},{id:'q',type:'hook',question:'Which?'}]]) {
    await expect(f.service.answerQuestions('org','actor',{campaignId:'campaign',requestId:'q',questions})).rejects.toHaveProperty('code','AUTONOMY_QUESTIONS_INVALID');
  }
  expect(f.generate).not.toHaveBeenCalled();
});

const sourceContext=()=>({ref:{version:1,kind:'adaptation',pieceId:'piece',adaptationId:'adaptation',postId:'post',revision:'a'.repeat(64)},actorId:'actor',organizationId:'org',title:'Selected post',text:'Exact edited post.',locale:'en',contentDigest:require('node:crypto').createHash('sha256').update('Exact edited post.').digest('hex')});
test('selected source snapshot is shared by one creative batch and retained independently of the prompt',async()=>{
  const f=await fixture(); const sourceArtifact=sourceContext();
  const input={campaignId:'campaign',itemId:'item',requestId:'source-batch',sourceArtifact,questions:[{id:'angle',type:'angle',question:'Choose the angle.'},{id:'visual',type:'visual',question:'Choose the visuals.'}]};
  const result=await f.service.answerQuestions('org','actor',input);
  expect(JSON.parse(f.generate.mock.calls[0][0]).sourceArtifact).toEqual(sourceArtifact);
  expect(result.decisions.every(row=>JSON.stringify(row.decision.sourceArtifact)===JSON.stringify(sourceArtifact.ref))).toBe(true);
  expect((await f.store.list('org','editorial'))[0].payload.sourceArtifact).toEqual(sourceArtifact);
  expect(await f.restart().answerQuestions('org','actor',input)).toEqual(result);expect(f.generate).toHaveBeenCalledTimes(1);
  await expect(f.restart().answerQuestions('org','actor',{...input,sourceArtifact:{...sourceArtifact,text:'Changed selected post.',contentDigest:require('node:crypto').createHash('sha256').update('Changed selected post.').digest('hex'),ref:{...sourceArtifact.ref,revision:'c'.repeat(64)}}})).rejects.toHaveProperty('code','AUTONOMY_IDEMPOTENCY_CONFLICT');
});
test.each(['actorId','organizationId'])('foreign resolved source %s is rejected before any expert or fact decision',async key=>{
  const f=await fixture();
  await expect(f.service.answerQuestions('org','actor',{campaignId:'campaign',itemId:'item',requestId:'foreign',sourceArtifact:{...sourceContext(),[key]:'foreign'},questions:[{id:'fact',type:'business_fact',question:'Missing facts'}]})).rejects.toHaveProperty('code','AUTONOMY_SOURCE_CONTEXT_INVALID');
  expect(f.generate).not.toHaveBeenCalled();expect((await f.store.list('org','decision'))).toHaveLength(0);
});
test('missing or duplicate batch answers remain uncertain without inventing a creative choice or repeating generation',async()=>{
  const f=await fixture({generate:async()=>({object:{answers:[{id:'angle',...editorialAnswer},{id:'angle',...editorialAnswer}]}})});
  const input={campaignId:'campaign',itemId:'item',requestId:'incomplete',questions:[{id:'angle',type:'angle',question:'Angle?'},{id:'tone',type:'tone',question:'Tone?'}]};
  await expect(f.service.answerQuestions('org','actor',input)).rejects.toHaveProperty('code','AUTONOMY_EDITORIAL_UNCERTAIN');
  await expect(f.restart().answerQuestions('org','actor',input)).rejects.toHaveProperty('code','AUTONOMY_EDITORIAL_UNCERTAIN');
  expect(f.generate).toHaveBeenCalledTimes(1);
});
test('a content edit during the expert call rejects all returned choices at the old revision',async()=>{
  const f=await fixture({generate:async()=>{await f.change('campaign_item','item',item=>{item.contentRevision++;});return {object:editorialAnswer};}});
  await expect(f.service.answer('org','actor',request())).rejects.toHaveProperty('code','AUTONOMY_EDITORIAL_CONTEXT_CHANGED');
  expect((await f.store.list('org','decision'))).toHaveLength(0);expect(f.generate).toHaveBeenCalledTimes(1);
});

test('a retained legacy checkpoint after decision commit keeps the original idempotency digest',async()=>{
  const f=await fixture();f.store.failCompleted=1;
  const decide=jest.spyOn(f.autonomy,'decide');
  await expect(f.service.answer('org','actor',request())).rejects.toThrow('completion write unavailable');
  const oldInput={...decide.mock.calls[0][1]};delete oldInput.expectedContentRevision;
  const {digest}=loadTypeScriptModule(`${ROOT}/campaign/domain.ts`,domainMocks);
  const operation=(await f.store.list('org','editorial'))[0];
  await f.change('editorial',operation.id,row=>{delete row.decisionFenceVersion;});
  const row=(await f.store.list('org','decision'))[0];
  // Load a historical immutable row representing the pre-fence stored input.
  const historical=f.store.rows.get(f.store.key('org','decision',row.id));historical.payload.requestDigest=digest(oldInput);
  const restored=await f.restart().answer('org','actor',request());
  expect(restored.answer).toBe(editorialAnswer.answer);expect(f.generate).toHaveBeenCalledTimes(1);
});

test('OpenRouter numeric404 typed not_found on the completion route can reject an exact model before output',async()=>{
 const error=Object.assign(new Error('model unavailable'),{statusCode:404,url:'https://openrouter.ai/api/v1/chat/completions',responseBody:JSON.stringify({error:{code:404,message:'Model configured-advanced not found.',metadata:{error_type:'not_found'}}})});
 const generate=jest.fn().mockRejectedValueOnce(error).mockResolvedValue({object:editorialAnswer});
 const f=await fixture({provider:'openrouter',generate});
 const result=await f.service.answer('org','actor',request());
 expect(result.model).toMatchObject({provider:'openrouter',model:'fallback',fallbackReason:'MODEL_NOT_FOUND'});
 expect(generate).toHaveBeenCalledTimes(2);
});
test.each([
 {statusCode:200},
 {url:'https://openrouter.ai/api/v1/files/file'},
 {body:{error:{code:404,message:'File is missing',metadata:{error_type:'not_found'}}}},
 {body:{error:{code:404,message:'Model configured-advanced not found.',metadata:{error_type:'not_found'}},id:'gen-already-started'}},
 {body:{error:{code:404,message:'Model configured-advanced not found.',metadata:{error_type:'not_found'}},choices:[{message:{content:'partial'}}]}}
])('OpenRouter missing resource, wrong route or generation output never permits fallback (%j)',async override=>{
 const {body,...fields}=override;
 const error=Object.assign(new Error('not found'),{statusCode:404,url:'https://openrouter.ai/api/v1/chat/completions',responseBody:JSON.stringify(body??{error:{code:404,message:'Model configured-advanced not found.',metadata:{error_type:'not_found'}}})},fields);
 const f=await fixture({provider:'openrouter',generate:async()=>{throw error;}});
 await expect(f.service.answer('org','actor',request())).rejects.toHaveProperty('code','AUTONOMY_EDITORIAL_UNCERTAIN');
 expect(f.generate).toHaveBeenCalledTimes(1);
});

test.each([0, 5])('direct expert refuses finite total budget %s before usage admission or model start',async maximum=>{
 const f=await fixture();await f.change('grant','grant',grant=>{grant.budget={currency:'USD',maximum};});
 for(let i=0;i<2;i++)await expect(f.restart().answer('org','actor',request())).rejects.toMatchObject({code:'AUTONOMY_COST_ESTIMATE_UNAVAILABLE',message:expect.stringContaining('not dispatched')});
 const operation=(await f.store.list('org','editorial'))[0].payload;
 expect(operation).toMatchObject({state:'blocked',errorCode:'AUTONOMY_COST_ESTIMATE_UNAVAILABLE'});expect(operation.attempts).toBeUndefined();
 expect(f.usage.executeAiOperation).not.toHaveBeenCalled();expect(f.generate).not.toHaveBeenCalled();
});
test.each(['included','workspace_key'])('direct expert preserves arbitrary payer scope under %s billing',async usageMode=>{
 const f=await fixture({provider:'openrouter'});f.config.usageMode=usageMode;f.config.modelRouting.advancedModel='openai/model-through-router';
 await f.change('grant','grant',grant=>{grant.providerBudget={provider:'openrouter',payer:'owner-custom-payer',currency:'USD',maximum:0};});
 await expect(f.service.answer('org','actor',request())).rejects.toHaveProperty('code','AUTONOMY_COST_ESTIMATE_UNAVAILABLE');
 expect(f.usage.executeAiOperation).not.toHaveBeenCalled();expect(f.generate).not.toHaveBeenCalled();
});
test('direct expert keeps an unrelated Higgsfield credit cap separate from OpenAI text',async()=>{
 const f=await fixture();await f.change('grant','grant',grant=>{grant.providerBudget={provider:'higgsfield',payer:'personal',currency:'CRD',maximum:0};});
 expect((await f.service.answer('org','actor',request())).answer).toBe(editorialAnswer.answer);expect(f.generate).toHaveBeenCalledTimes(1);
});
test('fact-only decisions still record missing owner facts under a finite zero budget without a model',async()=>{
 const f=await fixture();await f.change('grant','grant',grant=>{grant.budget={currency:'USD',maximum:0};});
 const result=await f.service.answerQuestions('org','actor',{campaignId:'campaign',itemId:'item',requestId:'fact-batch',questions:[{id:'rights',type:'rights',question:'Which image rights are actually held?'}]});
 expect(result.complete).toBe(false);expect(result.missingFacts).toEqual(['Which image rights are actually held?']);expect(f.generate).not.toHaveBeenCalled();expect(f.usage.executeAiOperation).not.toHaveBeenCalled();
});
test('checkpoint and completed expert replays finish under a matching cap without fresh model admission',async()=>{
 const f=await fixture({provider:'openai'});await f.change('grant','grant',grant=>{grant.providerBudget={provider:'openrouter',payer:'own',currency:'USD',maximum:0};});
 const decide=jest.spyOn(f.autonomy,'decide').mockRejectedValueOnce(new Error('decision store unavailable'));
 await expect(f.service.answer('org','actor',request())).rejects.toThrow('decision store unavailable');
 f.config.provider='openrouter';decide.mockRestore();
 const result=await f.restart().answer('org','actor',request());expect(result.answer).toBe(editorialAnswer.answer);
 expect(await f.restart().answer('org','actor',request())).toEqual(result);expect(f.generate).toHaveBeenCalledTimes(1);expect(f.usage.executeAiOperation).toHaveBeenCalledTimes(1);
});
