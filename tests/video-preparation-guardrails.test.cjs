const {loadTypeScriptModule:load}=require('./helpers/load-ts-module.cjs');
const BASE='libraries/nestjs-libraries/src/';
const brief=load(`${BASE}videos/video-brief.v1.ts`);
const piece={id:'11111111-1111-4111-8111-111111111111',title:'Current summit',body:'Current summit',brief:{},language:'en',updatedAt:new Date('2030-01-01T00:00:00Z')};
const source={ref:{version:1,kind:'piece',pieceId:piece.id,revision:'e'.repeat(64)},actorId:'owner',organizationId:'org',title:piece.title,
  text:'Current summit on 12 November 2026. Speakers remain unconfirmed. Archive: 2024, 2025, March 6–7, September 19–20. '+ 'Historical background. '.repeat(250),locale:'en',contentDigest:'f'.repeat(64)};
const settings={provider:'heygen',model:'heygen-avatar',mode:'presenter',locale:'en',duration:20,aspectRatio:'9:16',engine:'avatar_iv',audio:true,captions:true};
const input=(policy='adaptable')=>({pieceId:piece.id,sourceArtifact:source.ref,settings,prepareWithAi:true,scriptPolicy:policy});
const short={prompt:'An invitation spoken to camera.',script:'Join the current summit on 12 November 2026. Speakers remain unconfirmed.'};
const codeOf=error=>error?.getResponse?.()?.code;

test('long pinned adaptable source grounds a short current-event script without mandating archive numbers; exact and explicit facts remain mandatory',()=>{
  const draft=brief.compileVideoBriefV1(piece,brief.VideoPrepareSchemaV1.parse(input()),source);
  expect(draft.sourceArtifact).toBe(source);expect(draft.script).toBe(source.text.trim());
  expect(draft.facts[0].policy).toBe('context_only');
  expect(()=>brief.validateVideoGroundingV1({...draft,...short},settings)).not.toThrow();
  expect(()=>brief.validateVideoGroundingV1({...draft,...short,script:short.script+' Meet 999 teams.'},settings)).toThrow();
  const exact=brief.compileVideoBriefV1(piece,brief.VideoPrepareSchemaV1.parse(input('exact')),source);
  expect(exact.facts[0].policy).toBe('must_include');
  expect(()=>brief.validateVideoGroundingV1({...exact,...short},settings)).toThrow();
  const mandatory=brief.editVideoBriefV1(draft,{...draft,facts:draft.facts.map(fact=>({...fact,policy:'must_include'}))},settings);
  expect(()=>brief.validateVideoGroundingV1({...mandatory,...short},settings)).toThrow();
});

function fixture({output=short,providerError,writeError}={}){
  const {AsyncLocalStorage}=require('node:async_hooks');const active=new AsyncLocalStorage();
  const chain=load(`${BASE}openai/ai.text-chain.ts`);const rows=[];
  const config={usageMode:'workspace_key',provider:'openai',apiKey:'synthetic-only',textModel:'synthetic-text',imageModel:'synthetic-image',search:{enabled:false,apiKey:''}};
  const configModule={AiProviderNotConfigured:class extends Error{},loadAiConfig:async()=>config,getActiveAiConfig:org=>active.getStore()?.org===org?config:undefined,getActiveAiOrganizationId:()=>active.getStore()?.org,
    withActiveAiConfig:(org,config,run)=>active.run({org},run),withoutActiveAiConfig:run=>active.run(undefined,run),setAiProviderSettingReader:()=>{},setInstanceAiDefaultsReader:()=>{},INSTANCE_AI_DEFAULTS_ID:'instance'};
  const prisma={aiUsageRecord:{create:jest.fn(async({data})=>{const row={id:'usage-1',...data};rows.push(row);return row;}),update:jest.fn(async({data})=>Object.assign(rows[0],data)),deleteMany:jest.fn()}};
  const {AiUsageService}=load(`${BASE}openai/ai.usage.service.ts`,{
    '@contentfactory/nestjs-libraries/openai/ai.provider.config':configModule,
    '@contentfactory/nestjs-libraries/openai/ai.text-chain':chain,
    '@contentfactory/nestjs-libraries/database/prisma/prisma.service':{PrismaService:class{}},
  });
  const usage=new AiUsageService(prisma);const parse=jest.fn(async()=>{
    chain.currentUsageLedger().record({model:'synthetic-text',attempt:1,promptTokens:8355,completionTokens:224,costUsd:0.01});
    if(providerError)throw providerError;return {choices:[{message:{parsed:output}}]};
  });
  const mocks={'../openai/ai.usage.service':{AiUsageService},'../openai/ai.provider.config':configModule,
    '../openai/ai.clients':{getModelForRole:async()=> 'synthetic-text',getOpenAiClient:async()=>({chat:{completions:{parse}}})}};
  for(const [path,name] of [['../database/prisma/video-generation/video-generation.repository','VideoGenerationRepository'],['./video-credentials.service','VideoCredentialsService'],['./providers/higgsfield.provider','HiggsfieldProviderV1'],['./providers/heygen.provider','HeygenProviderV1'],['./video-media.v1','VideoMediaV1'],['./video-composition.provider.v1','VideoCompositionProviderV1'],['../content-intelligence/social-factory/source-artifact.service','SourceArtifactServiceV1']])mocks[path]={[name]:class{}};
  const {VideoJobService}=load(`${BASE}videos/video-job.service.ts`,mocks);
  const repository={piece:jest.fn(async()=>piece),references:jest.fn(async()=>[]),createDraft:jest.fn(async data=>{if(writeError)throw writeError;return {...data,id:'draft-1',version:1};})};
  const service=new VideoJobService(repository,{},usage,{},{},{},{},undefined,{resolve:jest.fn(async()=>source),assertCurrent:jest.fn(async()=>{})});
  return {service,repository,parse,rows,prisma,VideoJobService};
}
test('known exact-script number refusal keeps one failed charged text admission, no draft, actionable native code and unchanged HTTP body',async()=>{
  const f=fixture();const warning=jest.spyOn(console,'warn').mockImplementation(()=>{});
  try{
    const cap=load(`${BASE}chat/capabilities/catalogue/video.capabilities.ts`,{'@contentfactory/backend/api/routes/media.controller':{MediaController:class{}},'@contentfactory/nestjs-libraries/videos/video-job.service':{VideoJobService:f.VideoJobService}}).videoPrepare;
    const error=await cap.run({organizationId:'org',userId:'owner',language:'ru',service:()=>f.service},input('exact')).catch(error=>error);
    expect(error.code).toBe('VIDEO_REQUIRED_NUMBER_MISSING');expect(codeOf(error)).toBe(error.code);expect(error.getStatus()).toBe(400);
    expect(error.getResponse()).toEqual({code:'VIDEO_REQUIRED_NUMBER_MISSING'});expect(error.spentNothing).not.toBe(true);expect(error.canReviseInput).toBe(true);
    expect(error.message).toContain('неизменённый запрос');expect(f.repository.createDraft).not.toHaveBeenCalled();expect(f.parse).toHaveBeenCalledTimes(1);
    expect(f.rows).toHaveLength(1);expect(f.rows[0]).toMatchObject({status:'failed',operation:'text_generation',promptTokens:8355,completionTokens:224,costUsd:0.01});
    expect(f.prisma.aiUsageRecord.update.mock.calls.filter(([call])=>call.data.status==='failed')).toHaveLength(1);expect(f.prisma.aiUsageRecord.deleteMany).not.toHaveBeenCalled();
    const diagnostic=JSON.stringify(warning.mock.calls);expect(diagnostic).toContain('generated_text_validation');expect(diagnostic).toContain('VIDEO_REQUIRED_NUMBER_MISSING');expect(diagnostic).not.toContain(source.text);expect(diagnostic).not.toContain('synthetic-only');
  }finally{warning.mockRestore();}
});
test('unknown provider and createDraft failures keep their original uncertainty; no retry or invented validation code',async()=>{
  const warning=jest.spyOn(console,'warn').mockImplementation(()=>{});
  try{
    const unknown=new Error('private upstream diagnostic');const first=fixture({providerError:unknown});
    await expect(first.service.prepare('org','owner',input())).rejects.toBe(unknown);expect(unknown.code).toBeUndefined();expect(first.parse).toHaveBeenCalledTimes(1);expect(first.repository.createDraft).not.toHaveBeenCalled();
    expect(JSON.stringify(warning.mock.calls)).not.toContain(unknown.message);
    const write=new (require('@nestjs/common').HttpException)({code:'VIDEO_REQUIRED_NUMBER_MISSING'},400);const second=fixture({writeError:write});
    await expect(second.service.prepare('org','owner',input())).rejects.toBe(write);expect(write.code).toBeUndefined();expect(second.repository.createDraft).toHaveBeenCalledTimes(1);expect(second.parse).toHaveBeenCalledTimes(1);
    expect(second.rows[0].status).toBe('succeeded');
  }finally{warning.mockRestore();}
});
