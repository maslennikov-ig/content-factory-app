const {loadTypeScriptModule}=require('./helpers/load-ts-module.cjs');
const cacheWrites=[];
const base='libraries/nestjs-libraries/src/content-intelligence/social-factory/';
let aiConfig, activeConfig;
const loadConfig=jest.fn(async()=>aiConfig);
const repository=loadTypeScriptModule(base+'social-factory.repository.ts',{'../../database/prisma/prisma.service':{PrismaRepository:class{},PrismaTransaction:class{}}});
const authorityModule=loadTypeScriptModule(base+'editorial/source-authority.v1.ts',{'../../source-registry/network-policy':{redactSourceUrl:value=>value}});
const {EditorialSourceAuthorityV1}=authorityModule;
const permissionModule=loadTypeScriptModule(base+'source-permission.service.ts',{'./editorial/source-authority.v1':authorityModule,'./social-factory.repository':repository,'../source-registry/source-registry.repository':{ContentSourceRegistryRepository:class{}}});
const optionalModule=loadTypeScriptModule(base+'measurement/optional-analytics/optional-analytics.service.ts');
const {LicensedAnalyticsExportAdapter}=loadTypeScriptModule(base+'measurement/optional-analytics/licensed-export.ts');
const {SocialFactoryPlanningService}=loadTypeScriptModule(base+'planning.service.ts',{
 './editorial/source-authority.v1':authorityModule,'./source-permission.service':permissionModule,'./social-factory.repository':repository,
 './profiles/channel-profile.v1':{ChannelProfileServiceV1:class{}},'./learning/learning.service':{SocialFactoryLearningService:class{}},
 './measurement/optional-analytics/optional-analytics.service':optionalModule,'../leads/lead-topic.gateway':{LeadTopicGateway:class{}},
 '../../openai/ai.provider.config':{loadAiConfig:loadConfig,getActiveAiConfig:()=>activeConfig,withActiveAiConfig:async(_org,config,fn)=>{const previous=activeConfig;activeConfig=config;try{return await fn()}finally{activeConfig=previous}}},
 '../../redis/redis.service':{ioRedis:{}},'./discovery/redis-discovery-cache':{RedisDiscoveryCache:class{async generation(){return 'g'}async read(){return{generation:'g',result:null}}async write(...args){cacheWrites.push(args);return true}async invalidateOrganization(){}}},
});
const NOW=new Date('2026-11-03T12:00:00Z');
beforeEach(()=>{cacheWrites.length=0;activeConfig=undefined;aiConfig={provider:'openrouter',search:{provider:'tavily',apiKeys:{tavily:'synthetic-tavily',exa:'synthetic-exa'},taskProviders:{discovery:'tavily'}}};jest.useFakeTimers();jest.setSystemTime(NOW)});afterEach(()=>jest.useRealTimers());
function fixture({configured=true}={}){
 const rows=new Map();let inTx=false;const key=(org,kind,id)=>`${org}/${kind}/${id}`;
 const grant={organizationId:'org',sourceId:'source',channelIds:['channel'],revision:'1',evidenceId:'license-proof',purposes:['discovery','licensed_registry_export_v1'],basis:'licensed',origin:'web',acquisition:'licensed',sourceContext:'source',expiresAt:'2026-11-20T12:00:00Z'};
 const permission={organizationId:'org',kind:'source_permission',id:'source',revision:1,payload:grant,deletedAt:null,invalidatedAt:null,expiresAt:null};
 const text=JSON.stringify({version:1,provider:'reviewed-export',entries:[{id:'post1',title:'Maintenance decisions for workshop tools',text:'Workshop maintenance checklist for tools owners',url:'https://example.com/post',accountId:'source-account',accountSize:1000,format:'post',metric:'views',value:77,observedAt:'2026-11-02T12:00:00Z',publishedAt:'2026-11-01T12:00:00Z',window:{start:'2026-11-01T12:00:00Z',end:'2026-11-02T12:00:00Z'}}]});
 const snapshot={id:'snapshot',organizationId:'org',sourceId:'source',normalizedText:text,normalizedTitle:'Licensed maintenance export',retrievalProvider:'manual-v1',purgedAt:null,supersededAt:null,retentionUntil:new Date('2026-11-20T12:00:00Z'),providerMetadata:{origin:'web'}};
 const source={id:'source',organizationId:'org',kind:'MANUAL',currentSnapshotId:'snapshot',desiredState:'ACTIVE',rightsState:'CONFIRMED',usagePurpose:'EVIDENCE',rightsConfirmedByUserId:'owner',rightsConfirmedAt:new Date('2026-11-01T12:00:00Z'),configVersion:2,archivedAt:null,purgedAt:null,canonicalUrl:null,displayName:'Licensed maintenance export'};
 const evidence={id:'raw-evidence',organizationId:'org',sourceSnapshotId:'snapshot',excerpt:text,observedAt:new Date('2026-11-02T12:00:00Z'),freshUntil:new Date('2026-11-20T12:00:00Z'),freshnessStatus:'NOT_MONITORED',tombstone:null,locator:null,structuredData:null};
 const registry={getDraftMaterial:jest.fn(async(org,id)=>{if(org!=='org'||id!=='source')throw new Error('not found');return {source,snapshot,evidence:[evidence]}})};
 const store={
  read:async(org,kind,id)=>kind==='source_permission'&&org==='org'&&id==='source'?structuredClone(permission):structuredClone(rows.get(key(org,kind,id))??null),
  readSourcePermissionState:async(org,id)=>org==='org'&&id==='source'?{state:'present',record:structuredClone(permission)}:{state:'absent'},
  transact:async fn=>{inTx=true;try{return await fn(store)}finally{inTx=false}},
  assertSourceAdmissions:jest.fn(async(org,stamps)=>{expect(inTx).toBe(true);for(const stamp of stamps)if(org!=='org'||stamp.sourceId!=='source'||stamp.snapshotId!==snapshot.id||stamp.sourceConfigVersion!==source.configVersion||stamp.permissionRevision!==permission.revision||permission.payload.revokedAt||source.archivedAt)throw new Error('SOCIAL_FACTORY_SOURCE_CHANGED')}),
  put:jest.fn(async input=>{if(input.kind==='discovery')expect(inTx).toBe(true);const old=rows.get(key(input.organizationId,input.kind,input.id));const row={...structuredClone(input),revision:(old?.revision??0)+1};rows.set(key(input.organizationId,input.kind,input.id),row);return row}),
 };
 const authority=new EditorialSourceAuthorityV1(store,registry,()=>NOW);
 const permissions=new permissionModule.SocialFactorySourcePermissionService(store,registry,authority);
 const connector=new LicensedAnalyticsExportAdapter(registry);
 const analytics=new optionalModule.SocialFactoryOptionalAnalyticsService(configured?[connector]:[],undefined,{read:async(org,channel,ids,purpose)=>{const result=await authority.read(org,channel,ids,purpose);return {...result,documents:result.documents.flatMap(doc=>doc.evidence.map(evidence=>({...doc,evidence})))}}});
 const original=analytics.evidence.bind(analytics);analytics.evidence=jest.fn(original);
 const profile={version:1,channelId:'channel',platform:'threads',audience:'Workshop owners',promise:'Explain practical maintenance decisions',goals:['help choose'],expertise:['tools'],pillars:['maintenance'],languages:['en'],geography:[],exclusions:[],evidence:[],openQuestions:[]};
 const findings=[];const learning={forPlanning:async()=>({findings:structuredClone(findings),findingIds:findings.map(f=>f.id)})};
 const web={check:jest.fn(async()=>{throw new Error('NO_NETWORK_ALLOWED')})};
 const planning=new SocialFactoryPlanningService({resolve:async()=>({profile,revision:1})},{},permissions,learning,store,authority,web,analytics);
 return {planning,analytics,source,snapshot,permission,rows,store,web,findings};
}
test('normal planning consumes licensed export performance and atomically saves canonical source admissions',async()=>{
 const f=fixture();const result=await f.planning.discover('org','channel',{sourceIds:['source']});
 expect(result.candidates.some(c=>c.performance.availability==='available'&&c.performance.value===77&&c.performance.metric==='views')).toBe(true);
 expect(f.analytics.evidence).toHaveBeenCalled();expect(f.store.assertSourceAdmissions).toHaveBeenCalledWith('org',[{sourceId:'source',sourceConfigVersion:2,snapshotId:'snapshot',rightsConfirmedAt:'2026-11-01T12:00:00.000Z',permissionRevision:1}]);
 const saved=[...f.rows.values()].find(row=>row.kind==='discovery');expect(saved.payload.candidates[0].performance.value).toBe(77);expect(saved.sourceIds).toContain('source:source');expect(f.web.check).not.toHaveBeenCalled();expect(cacheWrites).toHaveLength(0);
});
test('unset connector retains useful grounded baseline and never invents comparable performance',async()=>{
 const f=fixture({configured:false});const result=await f.planning.discover('org','channel',{});expect(result.planningPrompts.length).toBeGreaterThan(0);expect(result.candidates).toEqual([]);expect(f.analytics.evidence).not.toHaveBeenCalled();expect(f.web.check).not.toHaveBeenCalled();
});
test('source revocation between licensed read and save prevents persisted derived discovery',async()=>{
 const f=fixture();const original=f.analytics.evidence.getMockImplementation();f.analytics.evidence.mockImplementation(async(...args)=>{const result=await original(...args);f.permission.payload.revokedAt=NOW.toISOString();f.permission.revision++;return result});
 await expect(f.planning.discover('org','channel',{sourceIds:['source']})).rejects.toThrow('SOCIAL_FACTORY_SOURCE_CHANGED');expect([...f.rows.values()].filter(row=>row.kind==='discovery')).toEqual([]);
});
test('actual current authority refuses foreign/removed export scope without a source-grant fallback',async()=>{
 const f=fixture();f.permission.payload.channelIds=['foreign'];const result=await f.planning.discover('org','channel',{sourceIds:['source']});expect(result.candidates).toEqual([]);expect(result.planningPrompts.length).toBeGreaterThan(0);expect(f.web.check).not.toHaveBeenCalled();
});

test('licensed source without the export purpose is never promoted to comparable metrics',async()=>{
 const f=fixture();f.permission.payload.purposes=['discovery'];const result=await f.planning.discover('org','channel',{sourceIds:['source']});
 expect(result.candidates.every(c=>c.performance.availability!=='available')).toBe(true);expect(f.analytics.evidence).not.toHaveBeenCalled();
});
test('document revision strings cannot replace authoritative save admissions',async()=>{
 const f=fixture();const original=f.analytics.evidence.getMockImplementation();f.analytics.evidence.mockImplementation(async(...args)=>({...await original(...args),admissions:[]}));
 await expect(f.planning.discover('org','channel',{sourceIds:['source']})).rejects.toMatchObject({code:'SOCIAL_FACTORY_SOURCE_ADMISSION_REQUIRED'});expect([...f.rows.values()].filter(row=>row.kind==='discovery')).toEqual([]);
});
test('accepted finding changes the next ordinary plan and retains finding lineage',async()=>{
 const f=fixture({configured:false});const before=await f.planning.discover('org','channel',{});
 const finding={id:'finding',status:'accepted',channelIds:['channel'],statement:'Prefer a concrete maintenance question hook',uncertainty:'Association only',observationIds:['o'],sourceIds:['outcome-source'],expiresAt:'2026-11-20T12:00:00Z'};
 f.findings.push(finding);await f.store.put({organizationId:'org',kind:'finding',id:'finding',payload:finding,expectedRevision:0});
 const after=await f.planning.discover('org','channel',{});expect(after.findingIds).toEqual(['finding']);expect(after.planningPrompts[0].angle).not.toBe(before.planningPrompts[0].angle);expect(after.planningPrompts[0].angle).toContain(finding.statement);
 expect(f.rows.get('org/discovery/'+after.id).sourceIds).toContain('resource:finding:finding');
});

test('campaign cost inspection includes text billing, keyed search and only its eligible fallback',async()=>{
 const f=fixture();f.web.paidResearchEnabled=true;
 expect(await f.planning.unpricedPreparationProviders('org','channel',{allowWebSearch:true})).toEqual(['openrouter','tavily','exa']);
 aiConfig.search.taskProviders.discovery='exa';
 expect(await f.planning.unpricedPreparationProviders('org','channel',{allowWebSearch:true})).toEqual(['openrouter','exa','tavily']);
 aiConfig.search.apiKeys={exa:'synthetic-exa'};
 expect(await f.planning.unpricedPreparationProviders('org','channel',{allowWebSearch:true})).toEqual(['openrouter','exa']);
 expect(f.web.check).not.toHaveBeenCalled();expect(f.analytics.evidence).not.toHaveBeenCalled();
});
test.each([false,true])('source-only or disabled/community planning exposes no paid search route (requested=%s)',async allowWebSearch=>{
 const f=fixture();f.web.paidResearchEnabled=false;
 expect(await f.planning.unpricedPreparationProviders('org','channel',{sourceIds:['source'],allowWebSearch})).toEqual([]);
 expect(loadConfig).not.toHaveBeenCalled();expect(f.web.check).not.toHaveBeenCalled();expect(f.analytics.evidence).not.toHaveBeenCalled();
});
test('positive licensed analytics cost has unknown billing scope and cannot silently bypass a cap',async()=>{
 const f=fixture();jest.spyOn(f.analytics,'capabilities').mockReturnValue([{id:'licensed_registry_export_v1',configured:true,estimatedCost:1,rightsRequired:true}]);
 expect(await f.planning.unpricedPreparationProviders('org','channel',{sourceIds:['source']})).toEqual([undefined]);
 f.permission.payload.purposes=['discovery'];
 expect(await f.planning.unpricedPreparationProviders('org','channel',{sourceIds:['source']})).toEqual([]);
 expect(f.analytics.evidence).not.toHaveBeenCalled();expect(loadConfig).not.toHaveBeenCalled();
});

test('planning cost scope uses the active admitted provider and search keys ahead of changed storage',async()=>{
 const f=fixture();f.web.paidResearchEnabled=true;
 activeConfig={provider:'openai',search:{provider:'exa',apiKeys:{exa:'synthetic-active-exa'}}};
 expect(await f.planning.unpricedPreparationProviders('org','channel',{allowWebSearch:true})).toEqual(['openai','exa']);
 expect(loadConfig).not.toHaveBeenCalled();expect(f.web.check).not.toHaveBeenCalled();
});

test('guarded planning binds the inspected config through the actual gateway even when settings change',async()=>{
 const f=fixture();f.web.paidResearchEnabled=true;
 const inspected=aiConfig;let checked;
 const beforePaid=jest.fn(async resolve=>{checked=await resolve();aiConfig={provider:'openai',search:{provider:'exa',apiKeys:{exa:'new-synthetic-key'}}};});
 f.web.check.mockImplementation(async()=>{expect(activeConfig).toBe(inspected);return {disabled:false,items:[]};});
 await f.planning.discover('org','channel',{sourceIds:['source'],allowWebSearch:true},beforePaid);
 expect(checked).toEqual(['openrouter','tavily','exa']);expect(f.web.check).toHaveBeenCalled();expect(activeConfig).toBeUndefined();
});
test('a pre-dispatch cost refusal propagates before optional analytics or web work',async()=>{
 const f=fixture();const error=Object.assign(new Error('cost estimate unavailable'),{code:'AUTONOMY_COST_ESTIMATE_UNAVAILABLE'});
 await expect(f.planning.discover('org','channel',{sourceIds:['source'],allowWebSearch:true},async()=>{throw error;})).rejects.toBe(error);
 expect(f.analytics.evidence).not.toHaveBeenCalled();expect(f.web.check).not.toHaveBeenCalled();expect(f.rows.size).toBe(0);
});
test('an unbudgeted planning callback need not resolve new AI configuration',async()=>{
 const f=fixture();f.web.paidResearchEnabled=true;
 await f.planning.discover('org','channel',{sourceIds:['source'],allowWebSearch:false},async()=>{});
 expect(loadConfig).not.toHaveBeenCalled();expect(f.analytics.evidence).toHaveBeenCalled();
});

test('a source becoming a paid licensed export after preflight is checked again before connector dispatch',async()=>{
 const f=fixture();f.permission.payload.purposes=['discovery'];
 jest.spyOn(f.analytics,'capabilities').mockReturnValue([{id:'licensed_registry_export_v1',configured:true,estimatedCost:1,rightsRequired:true}]);
 const seen=[];const error=Object.assign(new Error('cost estimate unavailable'),{code:'AUTONOMY_COST_ESTIMATE_UNAVAILABLE'});
 const guard=async resolve=>{const providers=await resolve();seen.push(providers);if(providers.includes(undefined))throw error;f.permission.payload.purposes=['discovery','licensed_registry_export_v1'];};
 await expect(f.planning.discover('org','channel',{sourceIds:['source'],allowWebSearch:false},guard)).rejects.toBe(error);
 expect(seen).toEqual([[],[undefined]]);expect(f.analytics.evidence).not.toHaveBeenCalled();expect(f.web.check).not.toHaveBeenCalled();expect(f.rows.size).toBe(0);
});
