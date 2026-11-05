const {loadTypeScriptModule}=require('./helpers/load-ts-module.cjs');
const base='libraries/nestjs-libraries/src/content-intelligence/social-factory/';
const {ctaAttribution}=loadTypeScriptModule(base+'attribution/cta-policy.ts');
const capability=(platform,links,accountType='unknown')=>({platform,links,accountType,publishing:'direct'});
test('Shorts descriptions/internal links do not become external click attribution',()=>{
 expect(ctaAttribution(capability('youtube',['description'],'channel_advanced'),'short','description',true)).toMatchObject({available:false,reason:'shorts_description_urls_are_not_clickable'});
 expect(ctaAttribution(capability('youtube',['related_video']),'short','related_video',true).available).toBe(false);
});
test('profile links remain account-level even when a source item is known',()=>{
 expect(ctaAttribution(capability('instagram',['bio']),'reel','bio',true)).toEqual({available:true,level:'account'});
});
test('clickable confirmed post surfaces distinguish publication/campaign scope',()=>{
 expect(ctaAttribution(capability('telegram',['post']),'post','post',true)).toEqual({available:true,level:'post'});
 expect(ctaAttribution(capability('threads',['post']),undefined,'post',false)).toEqual({available:true,level:'campaign'});
 expect(ctaAttribution(capability('instagram',['post']),'reel','post',true).available).toBe(false);
 expect(ctaAttribution(capability('instagram',['bio']),'story','story',true).available).toBe(false);
});
test('YouTube descriptions require verified advanced feature capability',()=>{
 expect(ctaAttribution(capability('youtube',['description'],'channel'),'long_video','description',true).available).toBe(false);
 expect(ctaAttribution(capability('youtube',['description'],'channel_advanced'),'long_video','description',true)).toEqual({available:true,level:'post'});
});
const repo=loadTypeScriptModule(base+'social-factory.repository.ts',{'../../database/prisma/prisma.service':{PrismaRepository:class{},PrismaTransaction:class{}}});
class ShortLinks{} ShortLinks.provider={shortLinkDomain:'empty'};
const {SocialFactoryAttributionService}=loadTypeScriptModule(base+'attribution/attribution.service.ts',{
 '../social-factory.repository':repo,'./cta-policy':{ctaAttribution},'./publication-links':loadTypeScriptModule(base+'attribution/publication-links.ts'),'../../../short-linking/short.link.service':{ShortLinkService:ShortLinks},
 '../publishing/publishing.service':{SocialFactoryPublishingService:class{}},'../../../database/prisma/posts/posts.service':{PostsService:class{}}});
function serviceFixture(){
 const rows=new Map();const key=(org,kind,id)=>`${org}/${kind}/${id}`;
 const store={read:async(org,kind,id)=>rows.get(key(org,kind,id))??null,put:async(input)=>{const row={...input,revision:input.expectedRevision+1};rows.set(key(input.organizationId,input.kind,input.id),row);return row},purgeExpired:async()=>0};
 rows.set('org/campaign/campaign',{payload:{allocations:[{channelId:'channel'}]}});
 rows.set('org/campaign_item/item',{payload:{campaignId:'campaign',channelId:'channel',platform:'telegram',format:'post',postId:'post',publication:{externalId:'external',revision:1}}});
 const short={convertTextToShortLinks:jest.fn(async(id,urls)=>urls),getStatistics:jest.fn(async()=>[]),getAllLinks:jest.fn(async()=>[])};
 const publishing={capability:jest.fn(async()=>({...capability('telegram',['post','bio']),channelId:'channel'}))};
 const posts={getPostById:jest.fn(async()=>({state:'PUBLISHED',organizationId:'org',integrationId:'channel',releaseId:'external',content:''}))};
 return{rows,store,short,publishing,posts,service:new SocialFactoryAttributionService(store,short,publishing,posts)};
}
test('link creation preserves stable UTM identity, no subscription baseline, and tenant scope',async()=>{
 const f=serviceFixture();const input={campaignId:'campaign',channelId:'channel',itemId:'item',surface:'post',targetUrl:'https://business.example/contact',requestId:'same'};
 let result=await f.service.createLink('org',input,new Date('2026-11-03T12:00:00Z'));
 expect(result.link).toMatchObject({level:'post',clickAvailability:'unavailable'});expect(new URL(result.link.trackingUrl).searchParams.get('utm_content')).toBe('item');
 expect(new URL(result.link.trackingUrl).searchParams.get('utm_term')).toBe(result.link.id);
 await f.service.createLink('org',input);expect(f.short.convertTextToShortLinks).not.toHaveBeenCalled();
 await expect(f.service.createLink('foreign',input)).rejects.toMatchObject({code:'ATTRIBUTION_CAMPAIGN_SCOPE'});
 expect(await f.service.clicks('org',result.link.id)).toMatchObject({availability:'unsupported',value:null});
});
test('exact CRM UTM receipt uses persisted link and current publication without requiring a paid click provider',async()=>{
 const f=serviceFixture();const result=await f.service.createLink('org',{campaignId:'campaign',channelId:'channel',itemId:'item',surface:'post',targetUrl:'https://business.example/contact',requestId:'crm'},new Date('2026-11-03T12:00:00Z'));
 expect(await f.service.trackingEvidence('org',result.link.id,new Date('2026-11-04T12:00:00Z'))).toMatchObject({status:'unavailable',reason:'tracking_link_not_verified_in_published_revision'});
 f.posts.getPostById.mockResolvedValue({state:'PUBLISHED',organizationId:'org',integrationId:'channel',releaseId:'external',content:result.link.trackingUrl});
 expect(await f.service.trackingEvidence('org',result.link.id,new Date('2026-11-04T12:00:00Z'))).toMatchObject({status:'available',link:{id:result.link.id,level:'post'},fields:{link:result.link.id,campaign:'campaign',source:'telegram',medium:'social',content:'item'}});
 expect(f.short.getStatistics).not.toHaveBeenCalled();
 f.publishing.capability.mockResolvedValue({...capability('telegram',[]),channelId:'channel'});
 expect((await f.service.trackingEvidence('org',result.link.id,new Date('2026-11-04T12:00:00Z'))).status).toBe('unavailable');
 expect((await f.service.trackingEvidence('foreign',result.link.id,new Date('2026-11-04T12:00:00Z'))).status).toBe('unavailable');
});
test('CRM link evidence retains account/campaign levels, rejects expired/legacy links and protects existing utm_term',async()=>{
 const f=serviceFixture();const input={campaignId:'campaign',channelId:'channel',surface:'bio',targetUrl:'https://business.example/contact',requestId:'utm'};
 await expect(f.service.createLink('org',{...input,targetUrl:'https://business.example/contact?utm_term=owner-keyword'},new Date('2026-11-03T12:00:00Z'))).rejects.toMatchObject({code:'ATTRIBUTION_UTM_TERM_CONFLICT'});
 expect([...f.rows.keys()].filter(k=>k.startsWith('org/attribution/'))).toHaveLength(0);
 const account=await f.service.createLink('org',input,new Date('2026-11-03T12:00:00Z'));
 expect(await f.service.trackingEvidence('org',account.link.id,new Date('2026-11-04T12:00:00Z'))).toMatchObject({status:'available',link:{level:'account'}});
 expect((await f.service.trackingEvidence('org',account.link.id,new Date('2026-12-04T12:00:00Z'))).status).toBe('unavailable');
 const campaign=await f.service.createLink('org',{...input,surface:'post',requestId:'campaign'},new Date('2026-11-03T12:00:00Z'));
 expect(await f.service.trackingEvidence('org',campaign.link.id,new Date('2026-11-04T12:00:00Z'))).toMatchObject({status:'available',link:{level:'campaign'}});
 const row=f.rows.get(`org/attribution/${account.link.id}`);const legacy=new URL(row.payload.shortening.taggedUrl);legacy.searchParams.delete('utm_term');row.payload.shortening.taggedUrl=legacy.toString();
 expect((await f.service.trackingEvidence('org',account.link.id,new Date('2026-11-04T12:00:00Z'))).reason).toBe('exact_tracking_utm_receipt_absent');
});
test('profile attribution and manually asserted customer links never become post-exact verified joins',async()=>{
 const f=serviceFixture();const result=await f.service.createLink('org',{campaignId:'campaign',channelId:'channel',itemId:'item',surface:'bio',targetUrl:'https://business.example/contact',requestId:'profile'});
 expect(result.link.level).toBe('account');expect(new URL(result.link.trackingUrl).searchParams.has('utm_content')).toBe(false);
 const claim=await f.service.claimLead('org',result.link.id,'actual-human',{leadId:'canonical-crm-deal',evidenceRef:'owner-evidence'});
 expect(claim).toMatchObject({confidence:'owner_reported',level:'account'});expect(claim).not.toHaveProperty('payment');
});
test('provider clicks are only reported for a tracking URL verified in exact published content',async()=>{
 const f=serviceFixture();ShortLinks.provider.shortLinkDomain='short.example';
 try {f.short.convertTextToShortLinks.mockResolvedValue(['https://short.example/one']);
 const result=await f.service.createLink('org',{campaignId:'campaign',channelId:'channel',itemId:'item',surface:'post',targetUrl:'https://business.example/contact',requestId:'clicks'});
 expect((await f.service.clicks('org',result.link.id)).availability).toBe('unknown');expect(f.short.getStatistics).not.toHaveBeenCalled();
 f.posts.getPostById.mockResolvedValue({state:'PUBLISHED',organizationId:'org',integrationId:'channel',releaseId:'external',content:'Click https://short.example/one-other'});expect((await f.service.clicks('org',result.link.id)).availability).toBe('unknown');
 f.posts.getPostById.mockResolvedValue({state:'PUBLISHED',organizationId:'org',integrationId:'channel',releaseId:'external',content:'Click https://short.example/one'});f.short.getStatistics.mockResolvedValue([{short:'https://short.example/one',original:'https://business.example/contact',clicks:'0'}]);
 expect(await f.service.clicks('org',result.link.id)).toMatchObject({availability:'available',value:0,level:'post'});
 }finally{ShortLinks.provider.shortLinkDomain='empty'}
});

test('lost shortener response leaves durable claim; retry reconciles without duplicate submission',async()=>{
 const f=serviceFixture();ShortLinks.provider.shortLinkDomain='short.example';
 try{f.short.convertTextToShortLinks.mockRejectedValueOnce(new Error('response lost after create'));
 const input={campaignId:'campaign',channelId:'channel',itemId:'item',surface:'post',targetUrl:'https://business.example/contact',requestId:'stable-short'};
 const first=await f.service.createLink('org',input);expect(first.status).toBe('uncertain');
 const retry=await f.service.createLink('org',input);expect(retry.status).toBe('uncertain');expect(f.short.convertTextToShortLinks).toHaveBeenCalledTimes(1);
 f.short.getAllLinks.mockResolvedValue([{short:'https://short.example/recovered',original:first.link.shortening.taggedUrl,clicks:'0'}]);
 const recovered=await f.service.createLink('org',input);expect(recovered.status).toBe('available');expect(recovered.link.trackingUrl).toBe('https://short.example/recovered');expect(f.short.convertTextToShortLinks).toHaveBeenCalledTimes(1);
 }finally{ShortLinks.provider.shortLinkDomain='empty'}
});

test('publication URL verification rejects overlapping prefixes and honors full HTML href/query targets',()=>{
 const {publicationContainsExactUrl:has}=loadTypeScriptModule(base+'attribution/publication-links.ts');
 expect(has('https://short.example/one-other','https://short.example/one')).toBe(false);
 expect(has('Click https://short.example/one','https://short.example/one')).toBe(true);
 expect(has('<a href="https://short.example/one-other">https://short.example/one</a>','https://short.example/one')).toBe(false);
 expect(has('<a href="https://short.example/one?a=1&amp;b=2">Open</a>','https://short.example/one?a=1&b=2')).toBe(true);
 expect(has('<a href="https://short.example/one?a=1&amp;b=3">Open</a>','https://short.example/one?a=1&b=2')).toBe(false);
 expect(has('[Open](https://short.example/one)','https://short.example/one')).toBe(true);
 expect(has('<code>https://short.example/one</code>','https://short.example/one')).toBe(false);
});
