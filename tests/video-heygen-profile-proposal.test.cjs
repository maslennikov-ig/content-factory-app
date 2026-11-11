const {loadTypeScriptModule:load}=require('./helpers/load-ts-module.cjs');
const {HeygenChatControlsServiceV1:Service}=load('libraries/nestjs-libraries/src/videos/subscriptions/video-heygen-chat-controls.service.v1.ts',{
  '../../content-intelligence/social-factory/autonomy/editorial-decision.service':{EditorialDecisionService:class{}},
});
const profile=()=>({profileId:'11111111-1111-4111-8111-111111111111',expectedRevision:0,connectionId:'22222222-2222-4222-8222-222222222222',displayName:'Saved presenter',aliases:[],preferredForName:false,
  groupIds:['group_one'],preferredGroupId:'group_one',sourceLooks:[{groupId:'group_one',lookId:'look_one',roles:['style_base','appearance']}],preferredSourceLookId:'look_one',defaultAppearanceLookId:'look_one',
  defaultVoice:{voiceId:'voice_one',baseline:{locale:'ru-RU',speed:1,pitch:0,volume:1}}});
function fixture(saved){
 const profiles={read:jest.fn(async()=>saved)},service=new Service(profiles,{},null,null,null);
 service.observed=async()=>({accountDigest:'a'.repeat(64),accountGeneration:1,catalog:{avatars:[{id:'look_one',groupId:'group_one',name:'Owned studio look'}],voices:[{id:'voice_one',name:'Original voice',engines:[]}]}});
 return {service,profiles};
}
test('a new catalog selection preserves the original voice default without inventing a TTS engine',async()=>{
 const {service}=fixture();const p=await service.proposeProfile('org','actor',profile());
 expect(p.profile.defaultVoice).toEqual(profile().defaultVoice);expect(p.requiresHumanConfirmation).toBe(true);
 for(const defaultVoice of [{...profile().defaultVoice,engine:'heygen_voice'},
  {...profile().defaultVoice,baseline:{...profile().defaultVoice.baseline,engineSettings:{engine_type:'heygen_voice'}}}]){
  await expect(service.proposeProfile('org','actor',{...profile(),defaultVoice})).rejects.toMatchObject({response:{code:'VIDEO_VOICE_ENGINE_UNAVAILABLE'}});
 }
});
test('an unchanged actual human-selected engine baseline can be retained but a model-selected replacement cannot',async()=>{
 const selected={...profile(),expectedRevision:2,defaultVoice:{...profile().defaultVoice,engine:'starfish'}};
 const {service,profiles}=fixture({connectionId:selected.connectionId,revision:2,setupReusable:true,defaultVoice:selected.defaultVoice});
 await expect(service.proposeProfile('org','actor',selected)).resolves.toMatchObject({profile:{defaultVoice:selected.defaultVoice}});
 expect(profiles.read).toHaveBeenCalled();
 await expect(service.proposeProfile('org','actor',{...selected,defaultVoice:{...selected.defaultVoice,engine:'heygen_voice'}})).rejects.toMatchObject({response:{code:'VIDEO_VOICE_ENGINE_UNAVAILABLE'}});
});
