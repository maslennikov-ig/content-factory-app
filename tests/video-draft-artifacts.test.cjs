const {loadTypeScriptModule:load}=require('./helpers/load-ts-module.cjs');
const ROOT='libraries/nestjs-libraries/src/videos/';
const {videoDraftTitle}=load('libraries/helpers/src/utils/video-draft-title.ts');
const ids={piece:'11111111-1111-4111-8111-111111111111',ru:'22222222-2222-4222-8222-222222222222',en:'33333333-3333-4333-8333-333333333333'};
function fixture(){
  const mocks={'../openai/ai.clients':{},'../openai/ai.provider.config':{}};
  for(const [path,name] of [['../database/prisma/video-generation/video-generation.repository','VideoGenerationRepository'],['../openai/ai.usage.service','AiUsageService'],['./video-credentials.service','VideoCredentialsService'],['./providers/higgsfield.provider','HiggsfieldProviderV1'],['./providers/heygen.provider','HeygenProviderV1'],['./video-media.v1','VideoMediaV1'],['./video-composition.provider.v1','VideoCompositionProviderV1'],['../content-intelligence/social-factory/source-artifact.service','SourceArtifactServiceV1']])mocks[path]={[name]:class{}};
  const {VideoJobService}=load(`${ROOT}video-job.service.ts`,mocks);
  const rows=['ru','en'].map(locale=>({id:ids[locale],organizationId:'org',pieceId:ids.piece,version:locale==='en'?2:1,
    brief:{keyMessage:'Dubai summit invitation',script:locale==='en'?'Welcome to the summit. '.padEnd(449,'A'):'Приглашение. '.padEnd(134,'Б'),prompt:'Speak to camera.'},
    settings:{provider:'heygen',mode:'presenter',locale},userId:'owner',updatedAt:new Date('2030-01-01T00:00:00Z')}));
  const repository={drafts:jest.fn(async(org,pieceId,selected,actor)=>rows.filter(row=>row.organizationId===org&&(!pieceId||row.pieceId===pieceId)&&(!selected||selected.includes(row.id))&&(!actor||row.userId===actor))),draft:jest.fn(async(org,id)=>rows.find(row=>row.organizationId===org&&row.id===id)),createDraft:jest.fn()};
  const service=new VideoJobService(repository,{}, {},{},{},{},{});
  return {service,repository,rows,VideoJobService};
}
test('existing RU/EN draft metadata lists clear names, then opens the same English v2/449 script without creating an artifact copy',async()=>{
  const f=fixture();const metadata=await f.service.listDrafts('org',undefined,undefined,true);
  expect(metadata.map(row=>row.title)).toEqual(['Dubai summit invitation · HeyGen · Russian · Video script · v1','Dubai summit invitation · HeyGen · English · Video script · v2']);
  expect(metadata.every(row=>!('brief' in row))).toBe(true);
  const saved=await f.service.readDraft('org',metadata[1].id);
  expect(saved).toMatchObject({id:ids.en,pieceId:ids.piece,version:2,title:metadata[1].title});expect(saved.brief.script).toBe(f.rows[1].brief.script);expect(saved.brief.script).toHaveLength(449);
  expect(f.repository.createDraft).not.toHaveBeenCalled();
  expect(await f.service.listDrafts('org',undefined,[ids.ru],true)).toEqual([metadata[0]]);
  expect(await f.service.listDrafts('foreign',undefined,[ids.en],true)).toEqual([]);
  expect(await f.service.listDrafts('org',undefined,undefined,true,'foreign-actor')).toEqual([]);
  const findMany=jest.fn(async()=>[]);
  const {VideoGenerationRepository}=load('libraries/nestjs-libraries/src/database/prisma/video-generation/video-generation.repository.ts',{'../prisma.service':{PrismaService:class{}}});
  await new VideoGenerationRepository({videoPromptDraft:{findMany}}).drafts('org',undefined,[ids.en],'owner');
  expect(findMany.mock.calls[0][0].where).toEqual({organizationId:'org',id:{in:[ids.en]},userId:'owner'});
  expect(videoDraftTitle({version:2,settings:{provider:'heygen',mode:'presenter',locale:'en'},brief:{intent:'Short invitation to the current summit',keyMessage:'A much longer summary with archive numbers'}})).toBe('Short invitation to the current summit · HeyGen · English · Video script · v2');
});
test('prepare/edit/read native cards name their actual saved draft; historical media-library cards restore distinct drafts and latest version title',async()=>{
  const f=fixture();const caps=load('libraries/nestjs-libraries/src/chat/capabilities/catalogue/video.capabilities.ts',{'@contentfactory/backend/api/routes/media.controller':{MediaController:class{}},'@contentfactory/nestjs-libraries/videos/video-job.service':{VideoJobService:f.VideoJobService}});
  const ui=load('apps/frontend/src/components/agents/agent.contract.ts');
  const ru=await f.service.readDraft('org',ids.ru);const en=await f.service.readDraft('org',ids.en);
  for(const capability of [caps.videoPrepare,caps.videoEdit,caps.videoReadDraft])expect(capability.cardOf(en)).toEqual({kind:'media',id:'library',pieceId:ids.piece,videoDraftId:ids.en,title:en.title});
  const messages=[{id:'assistant-1',role:'assistant',parts:[
    {type:'data-media',data:{kind:'media',id:'library',pieceId:ids.piece,videoDraftId:ru.id}},
    {type:'data-media',data:{kind:'media',id:'library',pieceId:ids.piece,videoDraftId:en.id}},
    {type:'data-media',data:{kind:'media',id:'library',pieceId:ids.piece,videoDraftId:en.id,title:en.title}},
  ]}];
  const artifacts=ui.artifactsOf(messages);expect(artifacts).toHaveLength(2);expect(artifacts.map(ui.artifactKey)).toEqual([`media:library:video::${ids.ru}`,`media:library:video::${ids.en}`]);
  expect(artifacts[1].title).toBe(en.title);expect(ui.artifactHref(artifacts[1])).toContain(`draftId=${ids.en}`);
  const workspace=ui.readAgentWorkspace({version:'assistant-workspace/v1',workContext:null,artifacts:artifacts.map(ui.artifactRefOf),activeArtifact:ui.artifactRefOf(artifacts[1])});
  expect(workspace.artifacts).toHaveLength(2);expect(workspace.activeArtifact.videoDraftId).toBe(ids.en);
  const legacy={id:'old-edit',role:'assistant',parts:[{type:'tool-video_edit',toolCallId:'edit',state:'output-available',input:{draftId:ids.en},output:{ok:true,card:{kind:'media',id:'library'}}}]};
  const recovered=ui.artifactsOf([legacy,...messages]);
  expect(recovered.map(ui.artifactKey)).toEqual(expect.arrayContaining([`media:library:video::${ids.en}`]));
  expect(recovered).toHaveLength(2);
  const library={...legacy,id:'open-library',parts:[{type:'data-media',data:{kind:'media',id:'library'}}]};
  expect(ui.artifactsOf([library])[0].data.videoDraftId).toBeUndefined();
});
