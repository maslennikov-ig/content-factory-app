const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const base='libraries/nestjs-libraries/src/content-intelligence/social-factory/';
const repo=loadTypeScriptModule(base+'social-factory.repository.ts', {'../../database/prisma/prisma.service':{PrismaRepository:class{},PrismaTransaction:class{}}});
const types=loadTypeScriptModule(base+'measurement/measurement.types.ts');
const policy=loadTypeScriptModule(base+'measurement/provider-measurement.policy.ts');
const {SocialFactoryMeasurementService}=loadTypeScriptModule(base+'measurement/measurement.service.ts',{
  '../social-factory.repository':repo,'../../../database/prisma/posts/posts.service':{PostsService:class{}},'./measurement.types':types,'./provider-measurement.policy':policy,'./youtube-analytics-grant':loadTypeScriptModule(base+'measurement/youtube-analytics-grant.ts')});
const evaluate=loadTypeScriptModule(base+'learning/evaluate-experiment.ts',{'../measurement/measurement.types':types});
const {SocialFactoryLearningService}=loadTypeScriptModule(base+'learning/learning.service.ts',{
  '../social-factory.repository':repo,'../measurement/measurement.types':types,'../measurement/measurement.service':{SocialFactoryMeasurementService},'./evaluate-experiment':evaluate});
const now=new Date('2026-11-03T12:00:00Z');

function setup(platform='instagram') {
 const rows=new Map(); const key=(org,kind,id)=>`${org}/${kind}/${id}`;
 const live=r=>r&&!r.deletedAt&&!r.invalidatedAt&&(!r.expiresAt||r.expiresAt>now);
 const store={
  read:async(org,kind,id)=>{const r=rows.get(key(org,kind,id));return live(r)?structuredClone(r):null},
  put:async(input)=>{const k=key(input.organizationId,input.kind,input.id),old=rows.get(k);
   if((old?.revision??0)!==input.expectedRevision)throw new Error('conflict');
   const r={...input,revision:input.expectedRevision+1,sourceIds:input.sourceIds??[],parentId:input.parentId??null,deletedAt:null,invalidatedAt:null}; rows.set(k,structuredClone(r));return structuredClone(r)},
  page:async(org,kind,q={})=>{const all=[...rows.values()].filter(r=>r.organizationId===org&&r.kind===kind&&live(r)&&(!q.cursor||r.id>q.cursor)&&(!q.parentId||r.parentId===q.parentId)).sort((a,b)=>a.id.localeCompare(b.id)); const items=all.slice(0,q.limit??100);return {items:structuredClone(items),nextCursor:all.length>items.length?items.at(-1).id:null}},
  transact:async(fn)=>fn(store),
  remove:async(org,kind,id,revision)=>{const r=rows.get(key(org,kind,id));if(!r||r.revision!==revision)throw new Error('conflict');await cascade([r]);r.deletedAt=now},
  invalidateBySource:async(org,id)=>cascade([...rows.values()].filter(r=>r.organizationId===org&&r.sourceIds.includes(repo.sourceRef(id)))),
  purgeExpired:async(org,date)=>cascade([...rows.values()].filter(r=>r.organizationId===org&&!r.invalidatedAt&&r.expiresAt&&r.expiresAt<=date)),
 };
 async function cascade(initial){const queue=[...initial],seen=new Set();while(queue.length){const r=queue.shift(),k=key(r.organizationId,r.kind,r.id);if(seen.has(k))continue;seen.add(k);queue.push(...[...rows.values()].filter(c=>c.organizationId===r.organizationId&&c.sourceIds.includes(repo.resourceRef(r.kind,r.id))));r.payload={redacted:true};r.sourceIds=[];r.invalidatedAt=now;r.revision++}return seen.size}
 const item={version:1,id:'item',campaignId:'campaign',channelId:'channel',platform,format:platform==='youtube'?'short':'reel',state:'published',contentRevision:2,postId:'post',
  publication:{externalId:'external',provider:platform,publishedAt:'2026-11-02T12:00:00Z',revision:1}};
 const post={id:'post',state:'PUBLISHED',organizationId:'org',integrationId:'channel',releaseId:'external',integration:{id:'channel',organizationId:'org',providerIdentifier:platform,token:'local-fixture-token',disabled:false,refreshNeeded:false}};
 const posts={getPostById:jest.fn(async(id,org)=>org==='org'?post:null),checkPostAnalytics:jest.fn(async()=>[{label:'Views',data:[{total:'0',date:'2026-11-03'}]},{label:'Likes',data:[{total:'',date:'2026-11-03'}]}])};
 const measure=new SocialFactoryMeasurementService(store,posts,()=>now);const learning=new SocialFactoryLearningService(store,measure);
 return {store,rows,item,post,posts,measure,learning,init:()=>store.put({organizationId:'org',kind:'campaign_item',id:'item',payload:item,expectedRevision:0})};
}

test('captures exact receipt/revision/account with honest zero/missing values and retry key',async()=>{
 const s=setup();await s.init();const result=await s.measure.capture('org','item','request-1',now);
 expect(result.find(v=>v.metric==='Views')).toMatchObject({value:0,availability:'available',revision:1,publicationId:'external',accountId:'channel',window:{kind:'lifetime',ageSeconds:86400}});
 expect(result.find(v=>v.metric==='Likes')).toMatchObject({value:null,availability:'unknown'});
 await s.measure.capture('org','item','request-1',now);expect(s.posts.checkPostAnalytics).toHaveBeenCalledTimes(1);
 expect([...s.rows.values()].filter(r=>r.kind==='observation')).toHaveLength(6);
});
test('tenant/publication mismatches never call provider analytics',async()=>{
 const s=setup();await s.init();await expect(s.measure.capture('other','item','req',now)).rejects.toMatchObject({code:'MEASUREMENT_ITEM_NOT_FOUND'});
 s.post.releaseId='another-revision';await expect(s.measure.capture('org','item','req',now)).rejects.toMatchObject({code:'MEASUREMENT_PUBLICATION_MISMATCH'});
 expect(s.posts.checkPostAnalytics).not.toHaveBeenCalled();
});
test('Telegram unsupported and disconnected accounts never become zero metrics',async()=>{
 const a=setup('telegram');await a.init();expect((await a.measure.capture('org','item','req',now))[0]).toMatchObject({availability:'unsupported',value:null});
 expect(a.posts.checkPostAnalytics).not.toHaveBeenCalled();
 const b=setup();await b.init();b.post.integration.disabled=true;await expect(b.measure.capture('org','item','req')).rejects.toMatchObject({code:'MEASUREMENT_ACCESS_REVOKED'});
});
test('YouTube raw counters remain accessible without enabling unapproved derivatives',async()=>{
 const s=setup('youtube');await s.init();const result=await s.measure.capture('org','item','req',now);
 expect(result[0]).toMatchObject({availability:'available',derivationAllowed:false,access:'first_party'});
});
test('revocation purges observations and finding payload, preserving campaign items',async()=>{
 const s=setup();await s.init();const [o]=await s.measure.capture('org','item','req',now);
 await s.store.put({organizationId:'org',kind:'finding',id:'f',payload:{statement:'private learned result'},expectedRevision:0,sourceIds:[repo.resourceRef('observation',o.id)]});
 s.post.integration.disabled=true;expect(await s.measure.validObservations('org',['item'],now)).toEqual([]);
 expect(await s.store.read('org','finding','f')).toBeNull();expect(s.rows.get('org/finding/f').payload).toEqual({redacted:true});
 expect(await s.store.read('org','campaign_item','item')).not.toBeNull();
});
test('future planning only consumes accepted active same-channel evidence, expiration scrubs bytes',async()=>{
 const s=setup();await s.init();const observations=await s.measure.capture('org','item','req',now);
 const finding={version:1,id:'f',channelIds:['channel'],status:'accepted',statement:'prefer this hook',sampleSize:6,observationIds:[observations[0].id],expiresAt:'2026-11-20T12:00:00Z',explorationShare:0.25};
 await s.store.put({organizationId:'org',kind:'finding',id:'f',payload:finding,expectedRevision:0,parentId:'channel',expiresAt:new Date(finding.expiresAt),sourceIds:[repo.resourceRef('observation',observations[0].id)]});
 expect((await s.learning.forPlanning('org','channel',now)).findingIds).toEqual(['f']);
 expect((await s.learning.forPlanning('other','channel',now)).findingIds).toEqual([]);
 expect((await s.learning.forPlanning('org','other-channel',now)).findingIds).toEqual([]);
 expect((await s.learning.forPlanning('org','channel',new Date('2026-12-20T12:00:00Z'))).findingIds).toEqual([]);
 expect(s.rows.get('org/finding/f').payload).toEqual({redacted:true});
});
test('experiment allocation must be bounded, distinct and pre-publication',async()=>{
 const s=setup();await s.init();const input={channelId:'channel',dimension:'hook',metric:'Views',objective:'maximize',baseline:{label:'a',itemIds:['item','b','c']},candidate:{label:'b',itemIds:['item','d','e']},comparisonWindowHours:24,endsAt:'2026-11-10T12:00:00Z'};
 await expect(s.learning.proposeExperiment('org',input,now)).rejects.toMatchObject({code:'EXPERIMENT_OVERLAPPING_ITEMS'});
 input.candidate.itemIds=['d','e','f'];await expect(s.learning.proposeExperiment('org',input,now)).rejects.toMatchObject({code:'EXPERIMENT_MUST_BE_PLANNED_BEFORE_PUBLICATION'});
});

// Regression: review intent and exact collection provenance survive repeated work.
test('collection timestamps represent provider completion and retry never refreshes retention',async()=>{
 const s=setup();await s.init();let tick=new Date('2026-11-03T11:00:00Z');s.measure.clock=()=>tick;
 s.posts.checkPostAnalytics.mockImplementationOnce(async()=>{tick=new Date('2026-11-03T12:00:00Z');return [{label:'Views',data:[{total:'20',date:'2026-11-03'}]}]});
 const [first]=await s.measure.capture('org','item','clock');expect(first.observedAt).toBe(tick.toISOString());
 expect(first.window.ageSeconds).toBe(86400);tick=new Date('2026-11-04T12:00:00Z');
 const [again]=await s.measure.capture('org','item','clock');expect(again.observedAt).toBe(first.observedAt);expect(again.expiresAt).toBe(first.expiresAt);
});
test('accepted/withdrawn finding review survives identical recomputation',async()=>{
 const s=setup();const observation=id=>({version:1,id:id+'obs',campaignId:'c',itemId:id,channelId:'channel',accountId:'channel',platform:'instagram',format:'reel',metric:'Views',value:'abc'.includes(id)?10:30,unit:'count',availability:'available',source:'provider',access:'first_party',observedAt:now.toISOString(),expiresAt:'2026-11-20T12:00:00Z',derivationAllowed:true,window:{kind:'lifetime',ageSeconds:86400},evidence:[{id:'evidence-'+id,sourceId:'canonical-source',rights:'permitted'}]});
 const observations=[...'abcdef'].map(observation);s.measure.validObservations=async()=>observations;
 await s.store.put({organizationId:'org',kind:'experiment',id:'trial',expectedRevision:0,payload:{id:'trial',channelId:'channel',dimension:'hook',metric:'Views',objective:'maximize',baseline:{label:'Plain',itemIds:['a','b','c']},candidate:{label:'Question',itemIds:['d','e','f']},comparisonWindowHours:24,endsAt:'2026-11-05T12:00:00Z',status:'planned'}});
 for(const value of observations)await s.store.put({organizationId:'org',kind:'observation',id:value.id,payload:value,expectedRevision:0});
 let result=await s.learning.evaluate('org','trial',now);expect(result.finding.sourceIds).toEqual(['canonical-source']);
 let row=await s.store.read('org','finding',result.finding.id);await s.learning.review('org',row.id,row.revision,'accept',now);
 result=await s.learning.evaluate('org','trial',new Date(now.getTime()+3600000));expect(result.finding.status).toBe('accepted');expect(result.finding.computedAt).toBe(now.toISOString());
 row=await s.store.read('org','finding',result.finding.id);await s.learning.review('org',row.id,row.revision,'withdraw',now);
 observations[3].value=80;result=await s.learning.evaluate('org','trial',now);expect(result.state).toBe('withdrawn');
});
test('accepted YouTube amendment is tenant/channel/API-client/use-case bound and revocable',async()=>{
 const saved=process.env.YOUTUBE_CLIENT_ID;process.env.YOUTUBE_CLIENT_ID='test-api-client';
 try {const s=setup('youtube');await s.init();await s.store.put({organizationId:'org',kind:'channel_profile',id:'channel',payload:{channelId:'channel',platform:'youtube'},expectedRevision:0});
 await s.measure.recordYouTubeAmendment('org','channel','human-admin',{acceptanceReference:'verified-policy-decision',acceptedAt:'2026-11-01T12:00:00Z',expiresAt:'2026-12-01T12:00:00Z',expectedRevision:0},now);
 const [allowed]=await s.measure.capture('org','item','accepted');expect(allowed.derivationAllowed).toBe(true);
 process.env.YOUTUBE_CLIENT_ID='another-api-client';const [denied]=await s.measure.capture('org','item','changed');expect(denied.derivationAllowed).toBe(false);
 process.env.YOUTUBE_CLIENT_ID='test-api-client';await s.measure.revokeYouTubeAmendment('org','channel',1);expect(await s.store.read('org','observation',allowed.id)).toBeNull();
 await s.measure.recordYouTubeAmendment('org','channel','human-admin',{acceptanceReference:'renewed-proof',acceptedAt:'2026-11-03T11:00:00Z',expiresAt:'2026-12-02T12:00:00Z',expectedRevision:2},now);
 const [renewed]=await s.measure.capture('org','item','renewed');expect(renewed.derivationAllowed).toBe(true);expect(renewed.derivationGrantRevision).toBe(3);
 }finally{if(saved===undefined)delete process.env.YOUTUBE_CLIENT_ID;else process.env.YOUTUBE_CLIENT_ID=saved}
});

test('same-request replay and direct reads recheck revoked account before returning stored evidence',async()=>{
 const s=setup();await s.init();const [first]=await s.measure.capture('org','item','replay');expect(first.availability).toBe('available');
 s.post.integration.disabled=true;await expect(s.measure.capture('org','item','replay')).rejects.toMatchObject({code:'MEASUREMENT_ACCESS_REVOKED'});
 expect(await s.measure.listForItem('org','item',now)).toEqual([]);expect(s.rows.get('org/observation/'+first.id).payload).toEqual({redacted:true});expect(await s.store.read('org','campaign_item','item')).not.toBeNull();
});

test('actual channel-profile save envelope enables the scoped YouTube amendment path',async()=>{
 const saved=process.env.YOUTUBE_CLIENT_ID;process.env.YOUTUBE_CLIENT_ID='test-api-client';
 try {
  const s=setup('youtube');await s.init();
  const {ChannelProfileServiceV1}=loadTypeScriptModule(base+'profiles/channel-profile.v1.ts',{'../social-factory.repository':repo});
  const producer=new ChannelProfileServiceV1({store:s.store,integrations:{getIntegrationById:async(org,id)=>org==='org'&&id==='channel'?{id,providerIdentifier:'youtube',contentLanguage:'en',deletedAt:null,writingProfile:null}:null},brands:{}});
  await producer.save('org',{version:1,channelId:'channel',platform:'youtube',audience:'Workshop owners',promise:'Explain tools',goals:['help choose'],expertise:['tools'],pillars:['maintenance'],languages:['en'],geography:[],exclusions:[],evidence:[],openQuestions:[]},0);
  expect((await s.store.read('org','channel_profile','channel')).payload.format).toBe('channel-profile-base/v1');
  await s.measure.recordYouTubeAmendment('org','channel','human-admin',{acceptanceReference:'reviewed-amendment',acceptedAt:'2026-11-01T12:00:00Z',expiresAt:'2026-12-01T12:00:00Z',expectedRevision:0},now);
  const [observation]=await s.measure.capture('org','item','wrapped-profile');expect(observation.derivationAllowed).toBe(true);
  await expect(s.measure.recordYouTubeAmendment('foreign','channel','human-admin',{acceptanceReference:'proof',acceptedAt:'2026-11-01T12:00:00Z',expiresAt:'2026-12-01T12:00:00Z',expectedRevision:0},now)).rejects.toMatchObject({code:'YOUTUBE_AMENDMENT_CHANNEL_SCOPE'});
 }finally{if(saved===undefined)delete process.env.YOUTUBE_CLIENT_ID;else process.env.YOUTUBE_CLIENT_ID=saved}
});
