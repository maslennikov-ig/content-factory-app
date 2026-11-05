const {loadTypeScriptModule}=require('./helpers/load-ts-module.cjs');
const decorator=()=>()=>{};
function load(file,name,overrides={}){return loadTypeScriptModule(`libraries/nestjs-libraries/src/integrations/social/${file}.provider.ts`,{}, {resolve(request){
 if(request in overrides)return overrides[request];
 if(request.endsWith('/social.abstract'))return {SocialAbstract:class{},BadBody:Error};
 if(request.startsWith('@contentfactory/')&&!request.endsWith('/analytics.data'))return new Proxy({}, {get:(_,key)=>['Rules','Plug','PostPlug','Tool'].includes(key)?decorator:()=>{}});
 return undefined;
}})[name];}
const FacebookInstagram=load('instagram','InstagramProvider');
const StandaloneInstagram=load('instagram.standalone','InstagramStandaloneProvider',{'@contentfactory/nestjs-libraries/integrations/social/instagram.provider':{InstagramProvider:FacebookInstagram}});
const {providerCapability}=loadTypeScriptModule('libraries/nestjs-libraries/src/content-intelligence/social-factory/publishing/provider-capabilities.ts');
const integration={id:'channel',organizationId:'org',internalId:'owned-account',providerIdentifier:'instagram-standalone',token:'synthetic-only',disabled:false,refreshNeeded:false,deletedAt:null,additionalSettings:JSON.stringify([{key:'account_type',value:'BUSINESS'}])};
const originalFetch=global.fetch;
afterEach(()=>{global.fetch=originalFetch;});
test.each([[FacebookInstagram,'https://graph.facebook.com/v20.0/owned-account?fields=id,account_type',{id:'owned-account',account_type:'BUSINESS'},'business'],[StandaloneInstagram,'https://graph.instagram.com/v21.0/me?fields=user_id,account_type',{user_id:'owned-account',account_type:'MEDIA_CREATOR'},'creator']])('reads actual connected account type at the provider-owned fixed route',async(Provider,url,body,type)=>{
 global.fetch=jest.fn(async()=>({ok:true,json:async()=>body}));
 expect(await new Provider().readAccountType(integration)).toBe(type);
 expect(global.fetch.mock.calls[0][0]).toBe(url);expect(global.fetch.mock.calls[0][1]).toMatchObject({headers:{Authorization:'Bearer synthetic-only'},redirect:'error'});
 expect(url).not.toContain('synthetic-only');
});
test.each([{user_id:'foreign-account',account_type:'BUSINESS'},{user_id:'owned-account',account_type:'PERSONAL'}])('foreign or unsupported account result remains unknown',async body=>{
 global.fetch=jest.fn(async()=>({ok:true,json:async()=>body}));expect(await new StandaloneInstagram().readAccountType(integration)).toBe('unknown');
});
test('disconnected accounts do not call the network; unavailable provider responses remain unknown',async()=>{
 global.fetch=jest.fn(async()=>({ok:false}));const provider=new StandaloneInstagram();
 expect(await provider.readAccountType({...integration,disabled:true})).toBe('unknown');expect(global.fetch).not.toHaveBeenCalled();
 expect(await provider.readAccountType(integration)).toBe('unknown');
});
test('actual unknown account result overrides an untrusted stored business hint at the publishing service boundary',async()=>{
 const {SocialFactoryPublishingService}=loadTypeScriptModule('libraries/nestjs-libraries/src/content-intelligence/social-factory/publishing/publishing.service.ts',{
 '../social-factory.repository':{SocialFactoryRepository:class{},SocialFactoryError:class extends Error{}},'../campaign/campaign.service':{CampaignService:class{}},'../autonomy/autonomy.service':{AutonomyService:class{}},'../../../database/prisma/integrations/integration.service':{IntegrationService:class{}},'../../../integrations/integration.manager':{IntegrationManager:class{}},'../../pieces/piece.service':{PieceService:class{}},'../../pieces/piece.repository':{PieceRepository:class{}},'../../../database/prisma/posts/posts.service':{PostsService:class{}},
 });
 const provider={post(){},readAccountType:jest.fn(async()=> 'unknown')};
 const service=new SocialFactoryPublishingService({}, {}, {}, {getIntegrationById:async()=>integration},{getSocialIntegration:()=>provider},{},{},{});
 expect((await service.capability('org','channel')).formats).not.toContain('story');
 provider.readAccountType.mockResolvedValue('business');expect((await service.capability('org','channel')).formats).toContain('story');
 provider.readAccountType.mockResolvedValue('creator');expect((await service.capability('org','channel')).formats).not.toContain('story');
});
