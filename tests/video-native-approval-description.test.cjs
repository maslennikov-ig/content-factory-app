const {loadCapabilityModule:load}=require('./helpers/agent-capabilities.cjs');
const {videoLaunchV2}=load('catalogue/video-access.capabilities.v2.ts');
test.each(['ru','en'])('native %s approval describes the actual saved model, output and duration',async language=>{
  const value={draftId:'draft',version:2,unknownPrice:true,selection:{avatar:'Studio look',voice:'Original voice'},remaining:'82',
    settings:{locale:'ru-RU',engine:'avatar_v',resolution:'1080p',aspectRatio:'4:5',duration:73}};
  const text=await videoLaunchV2.describeApproval({language,service:()=>({approval:async()=>value})},{draftId:'draft',version:2,preflightId:'approval'});
  for(const actual of ['Studio look','Original voice','avatar_v','1080p','4:5','73','82'])expect(text).toContain(actual);
  expect(text).not.toContain('720p');expect(text).not.toContain('9:16');
  expect(text).toMatch(/не сообщает|does not provide/);
});
