const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const { ChannelProfileServiceV1 } = loadTypeScriptModule('libraries/nestjs-libraries/src/content-intelligence/social-factory/profiles/channel-profile.v1.ts', { '../social-factory.repository': { sourceRef: id => `source:${id}`, resourceRef: (kind,id) => `resource:${kind}:${id}` } });
const org = 'org-a';
const profile = (id, audience, platform = 'telegram') => ({ version:1, channelId:id, platform, audience, promise:'', goals:[], expertise:[], pillars:[], languages:[], geography:[], exclusions:['competitors'], evidence:[], openQuestions:[] });
const company = {project:{audiences:[{name:'founders',need:'planning'}],oneLineDescription:'Plan content',contentGoals:['educate']},voice:{defaultLanguage:'ru'},guardrails:{prohibitedTopics:['personal data'],prohibitedClaims:[]}};
function setup() {
  const rows = new Map();
  const channels = {a:{id:'a',providerIdentifier:'telegram',contentLanguage:'ru',deletedAt:null,writingProfile:null},b:{id:'b',providerIdentifier:'telegram',contentLanguage:'en',deletedAt:null,writingProfile:null},insta:{id:'insta',providerIdentifier:'instagram-standalone',contentLanguage:'ru',deletedAt:null,writingProfile:null}};
  let brandAlive=true, versionAvailable=true, beforeTransaction=async()=>{};
  let activeVersion='v1';
  const store = { read:async (tenant,kind,id)=>rows.get(`${tenant}:${kind}:${id}`)||null, page:async (tenant,kind,{parentId})=>({items:[...rows.entries()].filter(([key,row])=>key.startsWith(`${tenant}:${kind}:`) && row.parentId===parentId).map(([,row])=>row),nextCursor:null}), put:async ({organizationId,kind,id,payload,expectedRevision,parentId,sourceIds})=>{const key=`${organizationId}:${kind}:${id}`, old=rows.get(key); if((old?.revision||0)!==expectedRevision) throw Error('conflict'); const result={id,payload,revision:expectedRevision+1,parentId,sourceIds,createdAt:new Date()}; rows.set(key,result); return result;}, transact:async work=>{await beforeTransaction();return work(store);}, assertSourceAdmissions:async()=>{}, assertBrandProfileVersion:async (tenant,stamp)=>{if(tenant!==org || !brandAlive || !versionAvailable || stamp.profileId!=='brand' || !['v1','v2'].includes(stamp.versionId) || stamp.contentDigest!=='digest') throw Error('channel_profile_brand_unavailable');}, invalidateBySource:async (tenant,id)=>{for(const [key,row] of rows) if(key.startsWith(`${tenant}:`) && row.sourceIds?.includes(`source:${id}`)) rows.delete(key);} };
  const brands = {getActiveRuntimeVersion:async ()=>({profile:{id:'brand'},version:{id:activeVersion,content:company,contentDigest:'digest'}}),getOverview:async (_,__,id)=>({profile:id==='brand'?{activeVersionId:'v1'}:null}),getPublishedRuntimeVersion:async()=>({profile:{id:'brand'},version:{id:'v1',content:company,contentDigest:'digest'}})};
  const service = new ChannelProfileServiceV1({store,brands,integrations:{getIntegrationById:async (tenant,id)=>tenant===org?channels[id]||null:null}}); service.testStore=store; service.setBrandVersion=(value)=>{activeVersion=value;}; service.setBeforeTransaction=fn=>{beforeTransaction=fn;}; service.removeBrand=()=>{brandAlive=false;}; service.removeVersion=()=>{versionAvailable=false;}; return service;
}
test('cold start draws on company context, labels unknown and asks localized questions', async()=>{
 const s=setup(), result=await s.resolve(org,'a'); assert.equal(result.profile.audience,'founders: planning'); assert.equal(result.profile.promise,'Plan content'); assert.deepEqual(result.profile.goals,['educate']); assert.ok(result.profile.openQuestions.some(x=>x.id==='missing:expertise' && /опыт/.test(x.question) && x.requiredFor.length===0)); assert.equal(result.sourceRecommendation,true); assert.equal(result.facts.find(x=>x.key==='audience').provenance,'owner_asserted');
});
test('channel choices override company, exclusions accumulate, tenants and revisions stay isolated', async()=>{
 const s=setup(); await s.save(org,profile('a','owners'),0); await s.save(org,profile('b','engineers'),0);
 const a=await s.resolve(org,'a'), b=await s.resolve(org,'b'); assert.equal(a.profile.audience,'owners'); assert.equal(b.profile.audience,'engineers'); assert.deepEqual(a.profile.exclusions,['personal data','competitors']); assert.equal(a.revision,1);
 await assert.rejects(s.save(org,profile('a','other'),0),/conflict/); await assert.rejects(s.resolve('org-b','a'),/not_found/); await assert.rejects(s.save(org,{...profile('a','x'),brandProfileId:'other-org-avatar'},1),/brand_unavailable/);
});
test('standalone Instagram resolves to same platform contract', async()=>{const s=setup(); await s.save(org,profile('insta','local','instagram'),0); assert.equal((await s.resolve(org,'insta')).profile.platform,'instagram');});

test('revoking a source clears its derived snapshot while preserving owner profile', async()=>{
 const s=setup(); const base=profile('a','owners'); base.promise='Owner promise'; base.goals=['Owner goal']; await s.save(org, base,0);
 const derived=profile('a','invented derived audience'); derived.expertise=['verified later']; derived.fieldEvidence={expertise:['ev1']}; derived.facts=[{key:'expertise',value:['verified later'],provenance:'verified',scope:'channel',evidenceIds:['ev1']}]; derived.evidence=[{id:'ev1',sourceId:'source-1',source:'Owner data',capturedAt:'2026-01-01T00:00:00Z',access:'first_party',rights:'permitted',factStatus:'verified',purpose:'editorial',grantId:'grant-1'}];
 await assert.rejects(s.save(org,derived,1),/derived_requires_snapshot/);
 const stamp={sourceId:'source-1',sourceConfigVersion:1,snapshotId:'snap',rightsConfirmedAt:'2026-01-01',permissionRevision:1}; const saved=await s.saveDerived(org,derived,1,[stamp]); assert.deepEqual(saved.snapshot.sourceIds,['source:source-1','source:brand-profile:brand:version:v1','resource:channel_profile:a']);
 const before=await s.resolve(org,'a'); assert.equal(before.profile.audience,'owners'); assert.deepEqual(before.profile.expertise,['verified later']); assert.equal(before.facts.find(x=>x.key==='expertise').provenance,'inferred');
 await s.testStore.invalidateBySource(org,'source-1'); const after=await s.resolve(org,'a'); assert.equal(after.profile.audience,'owners'); assert.equal(after.profile.promise,'Owner promise'); assert.deepEqual(after.profile.goals,['Owner goal']); assert.deepEqual(after.profile.expertise,[]);
});
test('editing the base makes a derived snapshot stale; a new snapshot can be saved', async()=>{
 const s=setup(); await s.save(org,profile('a','owners'),0); const derived=profile('a',''); derived.expertise=['example']; await s.saveDerived(org,derived,1);
 await s.save(org,profile('a','new owners'),2); const result=await s.resolve(org,'a'); assert.equal(result.profile.audience,'new owners'); assert.deepEqual(result.profile.expertise,[]); await assert.rejects(s.saveDerived(org,derived,1),/base_changed/); await s.saveDerived(org,derived,3); assert.deepEqual((await s.resolve(org,'a')).profile.expertise,['example']);
});

test('expired and revoked sources cannot create a derived snapshot', async()=>{
 const s=setup(); await s.save(org,profile('a','owners'),0); const derived=profile('a',''); derived.evidence=[{id:'e',sourceId:'s',source:'source',capturedAt:'2020-01-01',access:'upload',rights:'permitted',factStatus:'inferred',consentExpiresAt:'2020-01-02'}];
 await assert.rejects(s.saveDerived(org,derived,1),/source_unavailable/); derived.evidence[0].consentExpiresAt='2099-01-01'; derived.evidence[0].revokedAt='2020-01-01'; await assert.rejects(s.saveDerived(org,derived,1),/source_unavailable/);
});

test('changing brand version discards old derived snapshot even with the same content digest', async()=>{
 const s=setup(); await s.save(org,profile('a','owners'),0); const derived=profile('a',''); derived.expertise=['derived']; await s.saveDerived(org,derived,1); assert.deepEqual((await s.resolve(org,'a')).profile.expertise,['derived']); s.setBrandVersion('v2'); assert.deepEqual((await s.resolve(org,'a')).profile.expertise,[]);
});

test('revoking the selected snapshot never revives an older snapshot', async()=>{
 const s=setup(); await s.save(org,profile('a','owner'),0); const older=profile('a',''); older.expertise=['old']; await s.saveDerived(org,older,1);
 const newer=profile('a',''); newer.expertise=['new']; newer.evidence=[{id:'ev',sourceId:'source-b',source:'B',capturedAt:'2020-01-01',access:'first_party',rights:'permitted',factStatus:'owner_asserted'}]; await s.saveDerived(org,newer,2,[{sourceId:'source-b',sourceConfigVersion:1,snapshotId:'snap',rightsConfirmedAt:'2026-01-01',permissionRevision:1}]); assert.deepEqual((await s.resolve(org,'a')).profile.expertise,['new']);
 await s.testStore.invalidateBySource(org,'source-b'); const result=await s.resolve(org,'a'); assert.deepEqual(result.profile.expertise,[]); assert.equal(result.profile.audience,'owner');
});

test('snapshot rejects missing or revoked source admission in the write transaction',async()=>{
 const s=setup();await s.save(org,profile('a','owner'),0);const derived=profile('a','');derived.evidence=[{id:'e',sourceId:'s',source:'S',capturedAt:'2026-01-01',access:'first_party',rights:'permitted',factStatus:'unknown'}];
 await assert.rejects(s.saveDerived(org,derived,1),/source_admission_required/);s.testStore.assertSourceAdmissions=async()=>{throw Error('SOURCE_CHANGED');};await assert.rejects(s.saveDerived(org,derived,1,[{sourceId:'s',sourceConfigVersion:1,snapshotId:'snap',rightsConfirmedAt:'2026-01-01',permissionRevision:1}]),/SOURCE_CHANGED/);assert.equal((await s.resolve(org,'a')).profile.audience,'owner');
});
test('authoritative manual and licensed source evidence survives derived profile save and resolve',async()=>{
 const {EditorialSourceAuthorityV1}=loadTypeScriptModule('libraries/nestjs-libraries/src/content-intelligence/social-factory/editorial/source-authority.v1.ts');const now=new Date('2026-11-03T12:00:00Z'), future=new Date('2027-01-01T00:00:00Z');
 for (const licensed of [false,true]) {
  const s=setup();await s.save(org,profile('a','owner'),0);
  const snapshot={id:'snap',organizationId:org,sourceId:'source',normalizedTitle:'Owner note',retrievalProvider:licensed?'source-fetch-v1':'manual-v1',retentionUntil:future,purgedAt:null,supersededAt:null,providerMetadata:null,requestedCanonicalUrl:null,finalCanonicalUrl:null};
  const source={id:'source',organizationId:org,kind:licensed?'URL':'MANUAL',canonicalUrl:licensed?'https://example.com/guide':null,displayName:'Source',currentSnapshotId:'snap',desiredState:'ACTIVE',rightsState:'CONFIRMED',usagePurpose:'EVIDENCE',rightsConfirmedByUserId:'owner',rightsConfirmedAt:now,freshUntil:licensed?future:null,configVersion:1,archivedAt:null,purgedAt:null};
  const evidence={id:'ev',organizationId:org,sourceSnapshotId:'snap',excerpt:'Example source material',observedAt:now,freshUntil:licensed?future:null,freshnessStatus:licensed?'FRESH':'NOT_MONITORED',tombstone:null,locator:null,structuredData:null};
  const grant={state:'present',record:{organizationId:org,kind:'source_permission',id:'source',revision:1,deletedAt:null,invalidatedAt:null,expiresAt:null,payload:{organizationId:org,sourceId:'source',revision:'grant-v1',purposes:['licensed_registry_export_v1'],basis:'licensed',evidenceId:'grant-evidence',expiresAt:future.toISOString(),origin:'web',acquisition:'licensed',sourceContext:'registered source',channelIds:['a']}}};
  const reader=new EditorialSourceAuthorityV1({readSourcePermissionState:async()=>licensed?grant:{state:'absent'}},{getDraftMaterial:async()=>({source,snapshot,evidence:[evidence]})},()=>now);
  const result=await reader.read(org,'a',['source'],licensed?'licensed_registry_export_v1':'editorial_generation');assert.equal(result.gaps.length,0);const derived=profile('a','');derived.expertise=['Supported subject'];derived.evidence=result.documents[0].evidence;derived.fieldEvidence={expertise:['ev']};
  const saved=await s.saveDerived(org,derived,1,result.admissions);assert.ok(saved.snapshot.sourceIds.includes('source:source'));const resolved=await s.resolve(org,'a');assert.equal(resolved.profile.audience,'owner');assert.deepEqual(resolved.profile.expertise,['Supported subject']);assert.equal(resolved.profile.evidence[0].permissionBasis,licensed?'scoped_grant':'registry_confirmed');assert.equal(resolved.profile.evidence[0].factStatus,'unknown');
 }
});

for (const removal of ['brand', 'version']) test(`deletion of ${removal} after initial read prevents saving a derived snapshot`,async()=>{
 const s=setup();await s.save(org,profile('a','owner'),0);const derived=profile('a','');derived.expertise=['derived'];
 s.setBeforeTransaction(async()=>{if(removal==='brand') s.removeBrand();else s.removeVersion();});
 await assert.rejects(s.saveDerived(org,derived,1),/brand_unavailable/);
 const stored=await s.testStore.read(org,'channel_profile','a');assert.equal(stored.revision,1);assert.equal(stored.payload.profile.audience,'owner');assert.equal(stored.payload.snapshotId,undefined);
});

test('switching the selected version during generation only makes that snapshot stale',async()=>{
 const s=setup();await s.save(org,profile('a','owner'),0);const derived=profile('a','');derived.expertise=['derived'];
 s.setBeforeTransaction(async()=>s.setBrandVersion('v2'));
 await s.saveDerived(org,derived,1);
 const stored=await s.testStore.read(org,'channel_profile','a');assert.equal(stored.revision,2);assert.equal(stored.payload.profile.audience,'owner');
 const resolved=await s.resolve(org,'a');assert.equal(resolved.profile.audience,'owner');assert.deepEqual(resolved.profile.expertise,[]);
});

test('a missing transaction brand fence fails closed before writing a snapshot',async()=>{
 const s=setup();await s.save(org,profile('a','owner'),0);delete s.testStore.assertBrandProfileVersion;
 await assert.rejects(s.saveDerived(org,profile('a',''),1),/brand_fence_unavailable/);
 const stored=await s.testStore.read(org,'channel_profile','a');assert.equal(stored.revision,1);assert.equal(stored.payload.snapshotId,undefined);
});
