'use strict';

const {
  IDENTITY, INJECTION, loadRegistry, servicesFrom, requestContextFor, executeTool,
} = require('./helpers/agent-capabilities.cjs');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const DOMAIN = 'libraries/nestjs-libraries/src/content-intelligence/social-factory';

class DomainError extends Error {
  constructor(code, message = code, status = 409) { super(message); this.code = code; this.status = status; }
}
const repositoryModule = {
  SocialFactoryRepository: class SocialFactoryRepository {}, SocialFactoryError: DomainError,
  sourceRef: id => `source:${id}`, resourceRef: (kind, id) => `resource:${kind}:${id}`,
};
const domainMocks = {
  '../social-factory.repository': repositoryModule,
  './social-factory.repository': repositoryModule,
};
const campaignModule = loadTypeScriptModule(`${DOMAIN}/campaign/campaign.service.ts`, domainMocks);
const autonomyModule = loadTypeScriptModule(`${DOMAIN}/autonomy/autonomy.service.ts`, domainMocks);
const { SocialFactoryService } = loadTypeScriptModule(`${DOMAIN}/social-factory.service.ts`, {
  ...domainMocks,
  './campaign/campaign.service': campaignModule,
  './autonomy/autonomy.service': autonomyModule,
  './learning/learning.service': { SocialFactoryLearningService: class SocialFactoryLearningService {} },
  '../../database/prisma/integrations/integration.service': { IntegrationService: class IntegrationService {} },
});

/** Serializable, tenant-keyed store with CAS/immutable-event checks; no mocked domain methods. */
class MemoryStore {
  rows = new Map(); queue = Promise.resolve();
  key(org, kind, id) { return JSON.stringify([org, kind, id]); }
  async transact(work) {
    const previous = this.queue; let release;
    this.queue = new Promise(resolve => { release = resolve; }); await previous;
    const before = structuredClone(this.rows);
    try { return await work(this); } catch (error) { this.rows = before; throw error; } finally { release(); }
  }
  async read(org, kind, id) { return structuredClone(this.rows.get(this.key(org, kind, id)) ?? null); }
  async list(org, kind, limit = 10000, parentId) {
    const rows = [...this.rows.values()].filter(row => row.organizationId === org && row.kind === kind && (parentId === undefined || row.parentId === parentId));
    if (rows.length > limit) throw new DomainError('SOCIAL_FACTORY_PAGE_REQUIRED');
    return structuredClone(rows.sort((a, b) => a.id.localeCompare(b.id)));
  }
  async purgeExpired() { return 0; }
  async put(input) {
    const key = this.key(input.organizationId, input.kind, input.id); const existing = this.rows.get(key);
    if (input.expectedRevision === 0 && existing || input.expectedRevision > 0 && existing?.revision !== input.expectedRevision) throw new DomainError('SOCIAL_FACTORY_CONFLICT');
    if (existing && ['action', 'decision'].includes(input.kind)) throw new DomainError('SOCIAL_FACTORY_IMMUTABLE');
    const row = { ...structuredClone(input), parentId: input.parentId ?? existing?.parentId ?? null, revision: (existing?.revision ?? 0) + 1, createdAt: existing?.createdAt ?? new Date(), updatedAt: new Date(), deletedAt: null };
    delete row.expectedRevision; this.rows.set(key, row); return structuredClone(row);
  }
}
const integrations = {
  getIntegrationById: async (org, id) => org === IDENTITY.organizationId && id === 'instagram-owned'
    ? { id, providerIdentifier: 'instagram-standalone', deletedAt: null }
    : null,
};
function domain(store = new MemoryStore(), sourceArtifacts) {
  const campaigns = new campaignModule.CampaignService(store);
  const autonomy = new autonomyModule.AutonomyService(store);
  const learning = { forPlanning: jest.fn(async (org, id) => ({ findings: (await store.list(org, 'finding')).map(record => record.payload).filter(finding => finding.status === 'accepted' && Date.parse(finding.expiresAt) > Date.now() && finding.channelIds.includes(id)) })) };
  const factory = new SocialFactoryService(campaigns, autonomy, store, integrations, learning,sourceArtifacts);
  return { store, campaigns, autonomy, factory, learning };
}
const registry = loadRegistry();
const find = id => registry.CAPABILITY_CATALOGUE.find(capability => capability.id === id);
const nativeTools = (service,extra={}) => registry.buildMastraCapabilityTools(registry.CAPABILITY_CATALOGUE, {
  services: servicesFrom({ SocialFactoryService: service,...extra }), language: 'ru',
});
const createInput = (extra = {}) => ({ requestId: 'author-message-51', name: INJECTION, timeZone: 'Europe/Moscow', startsAt: '2031-03-02', endsAt: '2031-03-15',
  allocations: [{ channelId: 'instagram-owned', platform: 'instagram', format: 'reel', count: 5 }, { channelId: 'instagram-owned', platform: 'instagram', format: 'story', count: 10, sequenceId: 'sequence' }], ...extra });
const unwrap = output => output.summary.untrustedData?.value ?? output.summary;
const call = (tool, input, identity = IDENTITY) => executeTool(tool, input, { requestContext: requestContextFor(registry, identity) });

beforeEach(() => { jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2030-01-01T12:00:00.000Z')); });
afterEach(() => { jest.restoreAllMocks(); });

describe('persistent campaigns through native chat capabilities', () => {
  test('create → restart services → open preserves exact saved allocation, tenant actor and campaign card', async () => {
    const first = domain(); const tools = nativeTools(first.factory);
    const created = await call(tools.campaign_create, createInput());
    expect(created.output.ok).toBe(true);
    const id = unwrap(created.output).id;
    expect(created.parts).toEqual([{ type: 'data-campaign', data: { kind: 'campaign', id } }]);
    expect(created.output.card).toEqual({ kind: 'campaign', id });
    expect(registry.isUntrustedData(created.model.value.summary)).toBe(true);
    const stored = await first.campaigns.get(IDENTITY.organizationId, id);
    expect(stored.campaign.actorId).toBe(IDENTITY.userId); expect(stored.campaign.name).toBe(INJECTION);
    expect(stored.campaign.mode).toBe('prepare_approve'); expect(stored.items).toHaveLength(15);
    expect(stored.items.filter(item => item.format === 'reel')).toHaveLength(5);
    expect(stored.items.filter(item => item.format === 'story')).toHaveLength(10);
    expect(stored.items.every(item => item.state === 'planned')).toBe(true);
    const restarted = domain(first.store);
    const opened = await call(nativeTools(restarted.factory).campaign_open, { campaignId: id });
    expect(opened.output.ok).toBe(true); expect(unwrap(opened.output)).toMatchObject({ id, total: 15, mode: 'prepare_approve', state: 'active' });
    expect(opened.output.card).toEqual(created.output.card);
    const replay = await call(nativeTools(restarted.factory).campaign_create, createInput());
    expect(unwrap(replay.output).id).toBe(id); expect((await first.store.list(IDENTITY.organizationId, 'campaign_item')).length).toBe(15);
  });

  test('native create cannot inject tenant/user authority or silently select autopilot', async () => {
    const s = domain(); const tools = nativeTools(s.factory);
    for (const injected of [{ organizationId: 'foreign' }, { actorId: 'foreign-user' }, { userId: 'foreign-user' }, { authority: 'user' }, { mode: 'autopilot' }]) {
      const result = await call(tools.campaign_create, createInput(injected));
      expect(result.model.value).toMatchObject({ ok: false, code: 'CAPABILITY_INPUT_INVALID' });
    }
    expect(s.store.rows.size).toBe(0);
  });

  test('opening a foreign campaign or creating for a foreign channel reveals no saved material', async () => {
    const s = domain(); const tools = nativeTools(s.factory);
    const created = await call(tools.campaign_create, createInput()); const id = unwrap(created.output).id;
    const foreign = await call(tools.campaign_open, { campaignId: id }, { ...IDENTITY, organizationId: 'foreign' });
    expect(foreign.output.ok).toBe(false); expect(JSON.stringify(foreign.model)).not.toContain(INJECTION);
    const absent = await call(tools.campaign_create, createInput({ requestId: 'foreign-destination', allocations: [{ channelId: 'not-owned', platform: 'instagram', format: 'reel', count: 1 }] }));
    expect(absent.output.ok).toBe(false); expect((await s.store.list(IDENTITY.organizationId, 'campaign')).length).toBe(1);
  });

  test('actual service consumes accepted channel findings and excludes foreign or expired findings', async () => {
    const s = domain();
    for (const [organizationId, id, expiresAt] of [[IDENTITY.organizationId, 'accepted', '2032-01-01T00:00:00Z'], [IDENTITY.organizationId, 'expired', '2029-01-01T00:00:00Z'], ['foreign', 'foreign', '2032-01-01T00:00:00Z']]) {
      await s.store.put({ organizationId, kind: 'finding', id, expectedRevision: 0, payload: { id, status: 'accepted', channelIds: ['instagram-owned'], expiresAt } });
    }
    const created = await call(nativeTools(s.factory).campaign_create, createInput());
    const saved = await s.campaigns.get(IDENTITY.organizationId, unwrap(created.output).id);
    expect(saved.campaign.findingIds).toEqual(['accepted']);
    expect(s.learning.forPlanning).toHaveBeenCalledTimes(1);
    expect(s.learning.forPlanning).toHaveBeenCalledWith(IDENTITY.organizationId, 'instagram-owned');
    const rejected = await call(nativeTools(s.factory).campaign_create, createInput({ requestId: 'foreign-finding', findingIds: ['foreign'] }));
    expect(rejected.output.ok).toBe(false);
  });

  test('approval capability fingerprints actual stored material and rejects a stale saved revision', async () => {
    const s = domain(); const tools = nativeTools(s.factory);
    const created = await call(tools.campaign_create, createInput()); const id = unwrap(created.output).id;
    let { items: [item] } = await s.campaigns.get(IDENTITY.organizationId, id);
    const material = { version: 1, channelId: item.channelId, platform: item.platform, format: item.format, title: INJECTION, hook: 'Hook', body: 'Original', assets: [], evidence: [], settings: {}, playbook: { version: 'v1', sourceDate: '2026-11-03' } };
    item = await s.campaigns.setMaterial(IDENTITY.organizationId, id, item.id, { expectedContentRevision: item.contentRevision, material });
    const input = { campaignId: id, itemId: item.id, expectedContentRevision: item.contentRevision, digest: campaignModule.approvalDigest(item) };
    expect(tools.campaign_approve.requireApproval(input)).toBe(true);
    const approvedContent = await find('campaign.approve').approvalContent({ organizationId: IDENTITY.organizationId, service: servicesFrom({ SocialFactoryService: s.factory }) }, input);
    expect(approvedContent.material.body).toBe('Original'); expect(approvedContent.approvalDigest).toBe(input.digest);
    await s.campaigns.setMaterial(IDENTITY.organizationId, id, item.id, { expectedContentRevision: item.contentRevision, material: { ...material, body: 'Changed after card' } });
    const refused = await call(tools.campaign_approve, input);
    expect(refused.output.ok).toBe(false);
    const changed = (await s.campaigns.get(IDENTITY.organizationId, id)).items.find(row => row.id === item.id);
    expect(changed.approval).toBeUndefined(); expect(changed.material.body).toBe('Changed after card');
  });
});


test('native campaign read supplies exact render arguments and immutable source ref after restart',async()=>{
 let stale=false;
 const sources={assertCurrent:async()=>{if(stale)throw new DomainError('SOURCE_ARTIFACT_STALE');}};
 const first=domain(new MemoryStore(),sources),tools=nativeTools(first.factory),created=await call(tools.campaign_create,createInput({allocations:[{channelId:'instagram-owned',platform:'instagram',format:'reel',count:2}]}));
 const campaignId=unwrap(created.output).id,initial=unwrap((await call(tools.campaign_open,{campaignId})).output),selected=initial.items[0];
 const ref={version:1,kind:'adaptation',pieceId:'source-piece',adaptationId:'source-variant',revision:'a'.repeat(64)};
 const material={version:1,channelId:selected.channelId,platform:'instagram',format:'reel',title:'Selected post',hook:'Hook',body:'Body',assets:[],settings:{},evidence:[],playbook:{version:'v1',sourceDate:'2026-11-03'},sourceArtifact:ref};
 const item=await first.campaigns.setMaterial(IDENTITY.organizationId,campaignId,selected.itemId,{material,expectedContentRevision:selected.contentRevision,editorialId:'saved-op'});
 await first.store.put({organizationId:IDENTITY.organizationId,kind:'editorial',id:'saved-op',parentId:campaignId,expectedRevision:0,payload:{version:2,id:'saved-op',itemId:item.id,appliedContentRevision:item.contentRevision,baseInput:{sourceArtifact:{ref,actorId:IDENTITY.userId}}}});
 const restarted=domain(first.store,sources),seen=[];
 const port={renderLocal:async(org,actor,input)=>{seen.push([org,actor,input]);expect(input).toEqual({operationId:'saved-op',expectedContentRevision:item.contentRevision});return {campaignId,itemId:item.id,expectedContentRevision:item.contentRevision+1,state:'ready',operationId:input.operationId};}};
 const afterTools=nativeTools(restarted.factory,{SocialFactoryProductionService:port});
 const opened=unwrap((await call(afterTools.campaign_open,{campaignId})).output),owned=opened.items.find(x=>x.itemId===selected.itemId);
 expect(owned).toMatchObject({operationId:'saved-op',contentRevision:item.contentRevision,format:'reel',sourceArtifact:ref,sourceStatus:{state:'current'}});
 const renderArgs=find('campaign.render_local_reel').input.parse({operationId:owned.operationId,expectedContentRevision:owned.contentRevision});
 const rendered=await call(afterTools.campaign_render_local_reel,renderArgs);
 expect(rendered.output.ok).toBe(true);expect(rendered.output.card).toEqual({kind:'campaign',id:campaignId});expect(seen).toEqual([[IDENTITY.organizationId,IDENTITY.userId,renderArgs]]);
 stale=true;const savedSibling=opened.items.find(x=>x.itemId!==selected.itemId),changed=unwrap((await call(afterTools.campaign_open,{campaignId})).output);
 expect(changed.items.find(x=>x.itemId===selected.itemId)).toMatchObject({state:'needs_input',sourceStatus:{state:'stale',code:'SOURCE_ARTIFACT_STALE'},blocker:{code:'SOURCE_ARTIFACT_STALE'}});
 expect(changed.items.find(x=>x.itemId===savedSibling.itemId)).toEqual(savedSibling);
});

test('explicit account-free destination is canonical and never supplies publication grants',async()=>{
 const s=domain(),{DraftDestinationServiceV1}=loadTypeScriptModule(`${DOMAIN}/draft-destination.v1.ts`,domainMocks),drafts=new DraftDestinationServiceV1(s.store);
 const tools=nativeTools(s.factory,{DraftDestinationServiceV1:drafts});
 const input={requestId:'account-free',name:'Учебные черновики',platform:'instagram',locale:'ru-RU'};
 const created=unwrap((await call(tools.campaign_draft_destination_create,input)).output);expect(created.destination).toMatchObject({kind:'draft',publishable:false,actorId:IDENTITY.userId});
 expect(unwrap((await call(tools.campaign_draft_destination_create,input)).output)).toEqual(created);
 const result=await call(tools.campaign_create,createInput({requestId:'account-free-campaign',allocations:[{channelId:created.destination.id,platform:'instagram',format:'carousel',slideCount:10,count:1}]}));
 const campaign=await s.campaigns.get(IDENTITY.organizationId,unwrap(result.output).id);expect(campaign.items[0].destination).toEqual({kind:'draft',id:created.destination.id,publishable:false});
 for(const slideCount of [1,11,100])expect(find('campaign.create').input.safeParse(createInput({allocations:[{channelId:created.destination.id,platform:'instagram',format:'carousel',slideCount,count:1}]})).success).toBe(false);
 await expect(s.factory.grant(IDENTITY.organizationId,{requestId:'forbidden',actorId:IDENTITY.userId,channelIds:[created.destination.id],actions:['publish']})).rejects.toMatchObject({code:'DRAFT_DESTINATION_NOT_PUBLISHABLE'});
});

test('native campaign read exposes only proven local preflight continuation with exact usable inputs and no state or usage mutation',async()=>{
 const s=domain(),{DraftDestinationServiceV1}=loadTypeScriptModule(`${DOMAIN}/draft-destination.v1.ts`,domainMocks),drafts=new DraftDestinationServiceV1(s.store),prepare=jest.fn(async(_org,_actor,input)=>({campaignId:input.campaignId,items:[]})),usage={executeAiOperation:jest.fn(()=>{throw Error('read must not admit AI');})};
 const tools=nativeTools(s.factory,{DraftDestinationServiceV1:drafts,SocialFactoryProductionService:{prepare},AiUsageService:usage});
 const destination=unwrap((await call(tools.campaign_draft_destination_create,{requestId:'read-offer-draft',name:'Local text drafts',platform:'instagram',locale:'ru'})).output).destination;
 const campaignId=unwrap((await call(tools.campaign_create,createInput({requestId:'read-offer-campaign',allocations:[{channelId:destination.id,platform:'instagram',format:'post',count:1}]}))).output).id;
 const original=await s.campaigns.get(IDENTITY.organizationId,campaignId),item=original.items[0],claim=await s.autonomy.admit(IDENTITY.organizationId,{campaignId,itemId:item.id,requestId:'original-preparation',action:'prepare',expectedContentRevision:item.contentRevision,actorId:IDENTITY.userId,authority:'user'});
 await s.autonomy.markSubmitting(IDENTITY.organizationId,claim.id);await s.autonomy.settle(IDENTITY.organizationId,claim.id,{state:'uncertain',reason:'Model result not durably captured. Automatic replay is blocked.'});
 const operationId='legacy-local-op',inputDigest='a'.repeat(64);
 await s.store.put({organizationId:IDENTITY.organizationId,kind:'editorial',id:operationId,parentId:campaignId,expectedRevision:0,payload:{version:2,id:operationId,campaignId,itemId:item.id,actionId:claim.id,inputDigest,sourceContentRevision:item.contentRevision,state:'uncertain',blocker:'Unsupported editorial format: instagram/post',campaignAuthority:{mode:original.campaign.mode,grantId:original.campaign.grantId},baseInput:{organizationId:IDENTITY.organizationId,actorId:IDENTITY.userId,destination:{kind:'draft',id:destination.id,publishable:false},format:'post',profile:{channelId:destination.id,platform:'instagram'},brief:{instruction:'Keep the author text about SEVEN minutes.',language:'ru'},sourceIds:[]}}});
 const keys=['NODE_ENV','FRONTEND_URL','BACKEND_INTERNAL_URL','DATABASE_URL','CF_LOCAL_PREFLIGHT_RECOVERY_OPERATION','CF_LOCAL_PREFLIGHT_RECOVERY_DIGEST'],previous=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 Object.assign(process.env,{NODE_ENV:'development',FRONTEND_URL:'http://127.0.0.1:9991',BACKEND_INTERNAL_URL:'http://127.0.0.1:9992',DATABASE_URL:'postgresql://fixture:fixture@127.0.0.1:9993/fixture',CF_LOCAL_PREFLIGHT_RECOVERY_OPERATION:operationId,CF_LOCAL_PREFLIGHT_RECOVERY_DIGEST:inputDigest});
 try{
  const before=structuredClone([...s.store.rows]),read=await call(tools.campaign_open,{campaignId}),visible=unwrap(read.output).items[0];
  expect(visible).toMatchObject({itemId:item.id,contentRevision:item.contentRevision,operationId,state:'uncertain',blocker:{code:'UNCERTAIN'},continuation:{kind:'local_preflight',reason:'EDITORIAL_FORMAT_UNSUPPORTED',primaryProducerAttempted:false,nextAction:'campaign.prepare',expectedContentRevision:item.contentRevision}});
  expect(registry.isUntrustedData(read.model.value.summary)).toBe(true);
  expect(visible.continuation.input).toMatchObject({campaignId,itemIds:[item.id],instruction:'Keep the author text about SEVEN minutes.'});
  expect([...s.store.rows]).toEqual(before);expect(usage.executeAiOperation).not.toHaveBeenCalled();expect(prepare).not.toHaveBeenCalled();
  const input=find('campaign.prepare').input.parse(visible.continuation.input);await call(tools.campaign_prepare,input);
  expect(prepare).toHaveBeenCalledWith(IDENTITY.organizationId,IDENTITY.userId,input);
  for(const actor of [undefined,'another-editor']){
   const restricted=actor===undefined?await s.factory.detail(IDENTITY.organizationId,campaignId):unwrap((await call(tools.campaign_open,{campaignId},{...IDENTITY,userId:actor})).output);
   expect(restricted.items[0].continuation).toBeUndefined();expect(restricted.items[0].state).toBe('uncertain');
  }
  delete process.env.CF_LOCAL_PREFLIGHT_RECOVERY_OPERATION;
  const disabled=unwrap((await call(tools.campaign_open,{campaignId})).output).items[0];expect(disabled.continuation).toBeUndefined();expect(disabled.blocker.code).toBe('UNCERTAIN');expect([...s.store.rows]).toEqual(before);
  process.env.CF_LOCAL_PREFLIGHT_RECOVERY_OPERATION=operationId;
  for(const [field,value] of [['productionPreflightVersion',1],['primaryProducerAttempt',{version:1,at:'2026-11-04T12:00:00Z'}],['outputSourceDigest','already-known']]){
   const row=await s.store.read(IDENTITY.organizationId,'editorial',operationId);row.payload[field]=value;await s.store.put({...row,expectedRevision:row.revision});const frozen=structuredClone([...s.store.rows]);
   const denied=unwrap((await call(tools.campaign_open,{campaignId})).output).items[0];expect(denied.continuation).toBeUndefined();expect(denied.state).toBe('uncertain');expect([...s.store.rows]).toEqual(frozen);
   const restore=await s.store.read(IDENTITY.organizationId,'editorial',operationId);delete restore.payload[field];await s.store.put({...restore,expectedRevision:restore.revision});
  }

 }finally{for(const key of keys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}}
});

test('saved silent Reel exposes only local rendering continuation with its exact current source and no primary replay',async()=>{
 const sourceRef={version:1,kind:'adaptation',pieceId:'saved-source',adaptationId:'saved-post',revision:'a'.repeat(64)},source={ref:sourceRef,actorId:IDENTITY.userId,organizationId:IDENTITY.organizationId,title:'Edited source',text:'Контрольная отметка: ДЕВЯТЬ минут',locale:'ru',contentDigest:'b'.repeat(64)},sourcePort={assertCurrent:jest.fn(async()=>source)};
 const s=domain(new MemoryStore(),sourcePort),{DraftDestinationServiceV1}=loadTypeScriptModule(`${DOMAIN}/draft-destination.v1.ts`,domainMocks),drafts=new DraftDestinationServiceV1(s.store),renderLocal=jest.fn(async(_org,_actor,input)=>({campaignId,itemId,state:'ready',operationId:input.operationId})),prepare=jest.fn();
 const tools=nativeTools(s.factory,{DraftDestinationServiceV1:drafts,SocialFactoryProductionService:{renderLocal,prepare}}),destination=unwrap((await call(tools.campaign_draft_destination_create,{requestId:'silent-read-draft',name:'Local silent drafts',platform:'instagram',locale:'ru'})).output).destination;
 const campaignId=unwrap((await call(tools.campaign_create,createInput({requestId:'silent-read-campaign',allocations:[{channelId:destination.id,platform:'instagram',format:'reel',count:1}]}))).output).id;
 const initial=await s.campaigns.get(IDENTITY.organizationId,campaignId),itemId=initial.items[0].id,texts=['Выберите задачу','Проверьте один результат','Сохраните вывод','Контрольная отметка: ДЕВЯТЬ минут'];
 const material={version:1,sourceArtifact:sourceRef,destination:{kind:'draft',id:destination.id,publishable:false},channelId:destination.id,platform:'instagram',format:'reel',title:'Три шага',hook:'С чего начать проверку?',body:'Сохранённый текст.',script:'План. Готовые файлы не созданы.',caption:'Три шага проверки.',assets:[],settings:{},evidence:[],playbook:{version:'social-editorial/v1',sourceDate:'2026-11-03'},scenes:texts.map((text,index)=>({index:index+1,startSeconds:index*2,endSeconds:(index+1)*2,spokenText:'',visualIntent:`На экране${index===3?' точная строка':''}: «${text}».`}))};
 const item=await s.campaigns.setMaterial(IDENTITY.organizationId,campaignId,itemId,{material,expectedContentRevision:initial.items[0].contentRevision,editorialId:'saved-silent-op'});
 const row=await s.store.read(IDENTITY.organizationId,'campaign_item',itemId);row.payload.state='needs_input';row.payload.blocker={code:'FINISHED_VIDEO_REQUIRED',detail:'A finished provider video is required.'};await s.store.put({...row,expectedRevision:row.revision});
 await s.store.put({organizationId:IDENTITY.organizationId,kind:'editorial',id:'saved-silent-op',parentId:campaignId,expectedRevision:0,payload:{version:2,id:'saved-silent-op',campaignId,itemId,state:'needs_video',producerStatus:'needs_video',sourceContentRevision:initial.items[0].contentRevision,appliedContentRevision:item.contentRevision,blocker:'LOCAL_REEL_SCENE_INVALID',output:{script:material.script,scenes:material.scenes},material,videoBaseMaterial:material,campaignAuthority:{mode:initial.campaign.mode,grantId:initial.campaign.grantId},baseInput:{organizationId:IDENTITY.organizationId,actorId:IDENTITY.userId,format:'reel',sourceArtifact:source,profile:{channelId:destination.id,platform:'instagram'},brief:{targetSeconds:8}}}});
 const before=structuredClone([...s.store.rows]),opened=unwrap((await call(tools.campaign_open,{campaignId})).output).items[0];
 expect(opened).toMatchObject({state:'needs_input',blocker:{code:'FINISHED_VIDEO_REQUIRED'},localRender:{state:'ready_to_render',primaryPreparation:'saved',primaryRetryAllowed:false},continuation:{kind:'local_render',nextAction:'campaign.render_local_reel',speech:false,primaryRetryAllowed:false,sourceArtifact:sourceRef,input:{operationId:'saved-silent-op',expectedContentRevision:item.contentRevision}}});
 expect([...s.store.rows]).toEqual(before);expect(prepare).not.toHaveBeenCalled();expect(renderLocal).not.toHaveBeenCalled();
 const args=find('campaign.render_local_reel').input.parse(opened.continuation.input);await call(tools.campaign_render_local_reel,args);expect(renderLocal).toHaveBeenCalledWith(IDENTITY.organizationId,IDENTITY.userId,args);expect(prepare).not.toHaveBeenCalled();
 const foreign=unwrap((await call(tools.campaign_open,{campaignId},{...IDENTITY,userId:'another-editor'})).output).items[0];expect(foreign.continuation).toBeUndefined();
 sourcePort.assertCurrent.mockRejectedValueOnce(new DomainError('SOURCE_ARTIFACT_STALE'));const stale=unwrap((await call(tools.campaign_open,{campaignId})).output).items[0];expect(stale.continuation).toBeUndefined();expect(stale.sourceStatus.state).toBe('stale');expect([...s.store.rows]).toEqual(before);
});

test('native open supplies server digest and schedule directly to approve across service reload',async()=>{
 const first=domain(),tools=nativeTools(first.factory);
 const campaignId=unwrap((await call(tools.campaign_create,createInput({allocations:[{channelId:'instagram-owned',platform:'instagram',format:'story',count:1}]}))).output).id;
 const initial=unwrap((await call(tools.campaign_open,{campaignId})).output).items[0];
 const material={version:1,channelId:initial.channelId,platform:initial.platform,format:initial.format,title:'Owned story',hook:'Hook',body:'Exact public copy',assets:[],evidence:[],settings:{},playbook:{version:'v1',sourceDate:'2026-11-03'}};
 await first.campaigns.setMaterial(IDENTITY.organizationId,campaignId,initial.itemId,{expectedContentRevision:initial.contentRevision,material});
 const restarted=domain(first.store),after=nativeTools(restarted.factory);
 const item=unwrap((await call(after.campaign_open,{campaignId})).output).items[0];
 expect(item.approvalDigest).toMatch(/^[a-f0-9]{64}$/);expect(item.scheduledAt).toBe((await restarted.campaigns.get(IDENTITY.organizationId,campaignId)).items[0].scheduledAt);
 const args=find('campaign.approve').input.parse({campaignId,itemId:item.itemId,expectedContentRevision:item.contentRevision,digest:item.approvalDigest});
 expect((await call(after.campaign_approve,args)).output.ok).toBe(true);
 expect((await restarted.campaigns.get(IDENTITY.organizationId,campaignId)).items[0].approval).toMatchObject({digest:item.approvalDigest,revision:item.contentRevision});
 await restarted.campaigns.setMaterial(IDENTITY.organizationId,campaignId,item.itemId,{expectedContentRevision:item.contentRevision,material:{...material,body:'Changed copy'}});
 expect((await call(after.campaign_approve,args)).output.ok).toBe(false);
});

test('native campaign reload opens its exact persisted current video revision through the actual video read service',async()=>{
 const first=domain(),tools=nativeTools(first.factory);
 const campaignId=unwrap((await call(tools.campaign_create,createInput({allocations:[{channelId:'instagram-owned',platform:'instagram',format:'reel',count:2}]}))).output).id;
 const initial=unwrap((await call(tools.campaign_open,{campaignId})).output).items;
 const material={version:1,channelId:initial[0].channelId,platform:'instagram',format:'reel',title:'Two scenes',hook:'Hook',body:'Body',assets:[],evidence:[],settings:{},playbook:{version:'v1',sourceDate:'2026-11-03'}};
 const item=await first.campaigns.setMaterial(IDENTITY.organizationId,campaignId,initial[0].itemId,{expectedContentRevision:initial[0].contentRevision,material});
 const productionId='11111111-1111-4111-8111-111111111111';
 for(const [id,revision,bound]of[['current-op',item.contentRevision,productionId],['historical-op',item.contentRevision-1,'old-production']])await first.store.put({organizationId:IDENTITY.organizationId,kind:'editorial',id,parentId:campaignId,expectedRevision:0,payload:{version:2,id,campaignId,itemId:item.id,appliedContentRevision:revision,productionId:bound,baseInput:{}}});
 const token=class{};
 const {VideoProductionService}=loadTypeScriptModule('libraries/nestjs-libraries/src/videos/production/video-production.service.ts',{
  '../../database/prisma/video-production/video-production.repository':{VideoProductionRepository:token},'../../database/prisma/video-generation/video-generation.repository':{VideoGenerationRepository:token,VIDEO_PENDING_V1:[]},
  '../video-job.service':{VideoJobService:token},'../video-credentials.service':{VideoCredentialsService:token},'../video-media.v1':{VideoMediaV1:token},'../providers/heygen.provider':{HeygenProviderV1:token},'../providers/higgsfield.provider':{HiggsfieldProviderV1:token},'./video-production.personal.service.v2':{VideoProductionPersonalServiceV2:token},
 });
 const manifest={version:1,title:'Saved two scenes',scenes:[{id:'first',script:'Unchanged opening'},{id:'second',script:'Selected closing'}]};
 const saved={organizationId:IDENTITY.organizationId,id:productionId,productionId:'stable-video-family',revision:2,parentId:'saved-parent',manifest,digest:'saved-manifest-digest',state:'draft',approval:null};
 const repo={read:jest.fn(async(org,id)=>org===IDENTITY.organizationId&&id===productionId?structuredClone(saved):null)};
 const forbidden=new Proxy({},{get:()=>()=>{throw new Error('metadata read must not dispatch provider work');}});
 const videos=new VideoProductionService(repo,forbidden,forbidden,forbidden,forbidden,forbidden,forbidden,forbidden,forbidden,forbidden);
 const restarted=domain(first.store),after=nativeTools(restarted.factory,{VideoProductionService:videos});
 const items=unwrap((await call(after.campaign_open,{campaignId})).output).items,selected=items.find(row=>row.itemId===item.id);
 expect(selected).toMatchObject({productionId,operationId:'current-op',contentRevision:item.contentRevision});expect(items.find(row=>row.itemId!==item.id).productionId).toBeUndefined();
 const opened=await call(after.video_production_open,find('video.production_open').input.parse({productionId:selected.productionId}));
 expect(opened.output.ok).toBe(true);expect(unwrap(opened.output)).toMatchObject({id:productionId,revision:2,parentId:'saved-parent',manifest});
 expect(repo.read).toHaveBeenCalledWith(IDENTITY.organizationId,productionId);
 await expect(call(after.video_production_open,{productionId:selected.productionId},{...IDENTITY,organizationId:'foreign'})).rejects.toMatchObject({response:{code:'VIDEO_PRODUCTION_NOT_FOUND'},status:404});
});

test('native open exposes bounded historical decision provenance without prompt, evidence, actor or audit payloads',async()=>{
 const s=domain(),tools=nativeTools(s.factory),campaignId=unwrap((await call(tools.campaign_create,createInput())).output).id;
 const item=unwrap((await call(tools.campaign_open,{campaignId})).output).items[0];
 for(let i=0;i<14;i++)await s.store.put({organizationId:IDENTITY.organizationId,kind:'decision',id:`decision-${i}`,parentId:campaignId,expectedRevision:0,payload:{version:1,campaignId,itemId:item.itemId,kind:'editorial',factStatus:'inferred',answer:'A'.repeat(700),question:'PRIVATE_PROMPT',actorId:'PRIVATE_ACTOR',evidence:[{private:'PRIVATE_EVIDENCE'}],requestDigest:'PRIVATE_AUDIT',createdAt:`2030-01-01T00:00:${String(i).padStart(2,'0')}.000Z`,model:{provider:'openrouter',model:'configured-model',role:'agent',selectedModel:'selected-model',attemptedModels:['selected-model','configured-model'],operationId:'saved-expert-op',fallbackReason:'MODEL_NOT_FOUND',secret:'PRIVATE_MODEL_FIELD'}}});
 await s.store.put({organizationId:'foreign',kind:'decision',id:'foreign-decision',parentId:campaignId,expectedRevision:0,payload:{campaignId,answer:'PRIVATE_FOREIGN'}});
 const before=structuredClone([...s.store.rows]);
 const result=await call(nativeTools(domain(s.store).factory).campaign_open,{campaignId}),opened=unwrap(result.output);
 expect(opened.decisionsScope).toBe('saved_history');expect(opened.decisionsTruncated).toBe(true);expect(opened.decisions).toHaveLength(12);
 expect(opened.decisions[0]).toMatchObject({id:'decision-13',itemId:item.itemId,kind:'editorial',factStatus:'inferred',answerPreview:'A'.repeat(500),answerTruncated:true,model:{provider:'openrouter',model:'configured-model',role:'agent',operationId:'saved-expert-op'}});
 expect(JSON.stringify(result.model)).not.toMatch(/PRIVATE_|requestDigest|question|actorId|evidence/);expect([...s.store.rows]).toEqual(before);
});
