const {loadTypeScriptModule}=require('./helpers/load-ts-module.cjs');
const base='libraries/nestjs-libraries/src/content-intelligence/social-factory/measurement/optional-analytics/';
const {LicensedAnalyticsExportAdapter}=loadTypeScriptModule(base+'licensed-export.ts');
const {SocialFactoryOptionalAnalyticsService}=loadTypeScriptModule(base+'optional-analytics.service.ts');
const now=new Date('2026-11-03T12:00:00Z');
const entry=(value=0)=>({id:'one',title:'Observed post',text:'A useful post',url:'https://example.com/post',accountId:'source-account',accountSize:1000,format:'post',metric:'views',value,observedAt:'2026-11-02T12:00:00Z',publishedAt:'2026-11-01T12:00:00Z',window:{start:'2026-11-01T12:00:00Z',end:'2026-11-02T12:00:00Z'}});
function fixture(value=0){
 const source={sourceId:'source',title:'Licensed export',sourceRevision:'snapshot',permissionRevision:'grant-v1',retainUntil:'2026-12-01T12:00:00Z',evidence:{id:'evidence',sourceId:'source',access:'licensed',rights:'permitted',ownerScope:'org',grantId:'real-license-proof',originPlatform:'web'}};
 const text=JSON.stringify({version:1,provider:'reviewed-offline-export',entries:[entry(value)]});
 const material={source:{id:'source',organizationId:'org'},snapshot:{id:'snapshot',normalizedText:text},evidence:[{excerpt:text,freshUntil:new Date('2026-11-20T12:00:00Z')}]};
 const registry={getDraftMaterial:jest.fn(async()=>material)};
 const connector=new LicensedAnalyticsExportAdapter(registry);
 const authority={read:jest.fn(async()=>({documents:[source],gaps:[],admissions:[{sourceId:'source',snapshotId:'snapshot',sourceConfigVersion:1,permissionRevision:1,rightsConfirmedAt:'2026-11-01T12:00:00Z'}]}))};
 const service=new SocialFactoryOptionalAnalyticsService([connector],undefined,authority);
 return{source,material,connector,registry,authority,service};
}
test('unsubscribed baseline works with no connector, explicit quota/budget states degrade without reads',async()=>{
 expect(await new SocialFactoryOptionalAnalyticsService().evidence('org','channel',[])).toMatchObject({status:'not_configured',documents:[],baselineAvailable:true});
 const f=fixture();const paid={...f.connector,id:'paid',estimatedCost:1,read:jest.fn()};
 expect((await new SocialFactoryOptionalAnalyticsService([paid],undefined,f.authority).evidence('org','channel',['source'],'paid',now)).status).toBe('budget_required');
 expect((await new SocialFactoryOptionalAnalyticsService([f.connector],{admit:async()=>({allowed:false,reason:'quota_limited'})},f.authority).evidence('org','channel',['source'],f.connector.id,now)).status).toBe('quota_limited');
 expect(f.registry.getDraftMaterial).not.toHaveBeenCalled();
});
test('configured licensed export uses current shared authority and retains comparable source/window/zero evidence',async()=>{
 const f=fixture();const result=await f.service.evidence('org','channel',['source'],f.connector.id,now);
 expect(f.authority.read).toHaveBeenCalledWith('org','channel',['source'],'licensed_registry_export_v1');
 expect(result.status).toBe('available');expect(result.documents[0]).toMatchObject({origin:'web',evidence:{sourceId:'source',grantId:'real-license-proof',access:'licensed'},performance:{availability:'available',value:0,accountSize:1000,format:'post',ageSeconds:86400}});
 expect(result.documents[0].retainUntil).toBe('2026-11-20T12:00:00.000Z');
});
test('missing value remains unknown and expired/source-revised/deleted evidence is refused',async()=>{
 const f=fixture(null);expect((await f.service.evidence('org','channel',['source'],f.connector.id,now)).documents[0].performance).toMatchObject({availability:'unknown'});
 f.material.snapshot.id='new-snapshot';expect((await f.service.evidence('org','channel',['source'],f.connector.id,now)).status).toBe('unavailable');
 f.material.snapshot.id='snapshot';f.material.evidence=[];expect((await f.service.evidence('org','channel',['source'],f.connector.id,now)).status).toBe('unavailable');
});
test('license origin and tenant cannot be laundered by a vendor/export or arbitrary client grant',async()=>{
 const f=fixture();f.source.evidence.originPlatform='youtube';let r=await f.service.evidence('org','channel',['source'],f.connector.id,now);expect(r.gaps).toContain('youtube_comparable_use_case_not_approved');expect(f.registry.getDraftMaterial).not.toHaveBeenCalled();
 f.source.evidence.originPlatform='web';f.source.evidence.ownerScope='foreign';r=await f.service.evidence('org','channel',['source'],f.connector.id,now);expect(r.gaps).toContain('analytics_license_required');
 f.authority.read=async()=>({documents:[],gaps:[{code:'TELEGRAM_SCOPED_CONSENT_REQUIRED'}]});r=await f.service.evidence('org','channel',['source'],f.connector.id,now);expect(r.documents).toEqual([]);expect(r.gaps).toContain('TELEGRAM_SCOPED_CONSENT_REQUIRED');
});
test('original observation retention is not reset by rereading an old export',async()=>{
 const f=fixture();const data=JSON.parse(f.material.snapshot.normalizedText);data.entries[0].observedAt='2026-09-01T12:00:00Z';data.entries[0].publishedAt='2026-08-31T12:00:00Z';data.entries[0].window={start:data.entries[0].publishedAt,end:data.entries[0].observedAt};
 f.material.snapshot.normalizedText=JSON.stringify(data);f.material.evidence[0].excerpt=f.material.snapshot.normalizedText;
 expect((await f.service.evidence('org','channel',['source'],f.connector.id,now)).status).toBe('unavailable');
});

test('actual Telegram/YouTube export URLs cannot be relabelled as ordinary web evidence',async()=>{
 for(const url of ['https://t.me/public/1','https://youtube.com/watch?v=one']){const f=fixture();const data=JSON.parse(f.material.snapshot.normalizedText);data.entries[0].url=url;f.material.snapshot.normalizedText=JSON.stringify(data);f.material.evidence[0].excerpt=f.material.snapshot.normalizedText;
 const result=await f.service.evidence('org','channel',['source'],f.connector.id,now);expect(result.documents).toEqual([]);expect(result.status).toBe('unavailable')}
});

test('missing authoritative admission never becomes persistable licensed evidence',async()=>{
 const f=fixture();f.authority.read=async()=>({documents:[f.source],gaps:[]});
 const result=await f.service.evidence('org','channel',['source'],f.connector.id,now);expect(result.documents).toEqual([]);expect(result.admissions).toEqual([]);expect(result.gaps).toContain('analytics_source_admission_required');expect(f.registry.getDraftMaterial).not.toHaveBeenCalled();
});
