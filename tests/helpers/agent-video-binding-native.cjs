'use strict';
// Actual Nest HTTP + source service/controller/resolver + installed native Memory.
// Identity middleware and domain records are local fixtures; no model/provider call.
const assert=require('node:assert/strict');
const {Memory}=require('@mastra/memory');
const {InMemoryStore}=require('@mastra/core/storage');
const {Test}=require('@nestjs/testing');
const {ThrottlerModule}=require('@nestjs/throttler');
const {NotFoundException}=require('@nestjs/common');
const {loadTypeScriptModule}=require('./load-ts-module.cjs');
const noOp=()=>()=>undefined;
class VideoJobService {}
class MastraService {}
class AiUsageService {}
class VideoAccessService {}
const markers={
  '@contentfactory/nestjs-libraries/videos/video-job.service':{VideoJobService},
  '@contentfactory/nestjs-libraries/chat/mastra.service':{MastraService},
  '@contentfactory/nestjs-libraries/openai/ai.usage.service':{AiUsageService},
  '@contentfactory/nestjs-libraries/videos/video-access.service':{VideoAccessService},
  '@mastra/ai-sdk':{handleChatStream:()=>{throw Error('No model');}},
  '@mastra/ai-sdk/ui':{toAISdkMessages:messages=>messages},
  '@mastra/core/processors':{RegexFilterProcessor:class{},UnicodeNormalizer:class{}},
  '@nestjs/swagger':{ApiTags:noOp},
  '@contentfactory/backend/services/auth/permissions/permissions.ability':loadTypeScriptModule('apps/backend/src/services/auth/permissions/permissions.ability.ts'),
  '@contentfactory/backend/services/auth/permissions/permission.exception.class':loadTypeScriptModule('apps/backend/src/services/auth/permissions/permission.exception.class.ts'),
};
for(const [path,name] of [
  ['content-intelligence/pieces/piece.service','PieceService'],['content-intelligence/social-factory/social-factory.service','SocialFactoryService'],
  ['content-intelligence/brand-voice/voice.service','VoiceService'],['database/prisma/integrations/integration.service','IntegrationService'],
  ['content-intelligence/context/content-fact.service','ContentFactService'],['content-intelligence/leads/content-lead.service','ContentLeadService'],['database/prisma/media/media.service','MediaService'],
])markers[`@contentfactory/nestjs-libraries/${path}`]={[name]:class{}};
const {AgentThreadsService}=loadTypeScriptModule('libraries/nestjs-libraries/src/chat/conductor/agent-threads.service.ts',markers);
markers['@contentfactory/nestjs-libraries/chat/conductor/agent-threads.service']={AgentThreadsService};
const {AgentController}=loadTypeScriptModule('apps/backend/src/api/routes/agent.controller.ts',markers);
const {AgentWorkContextResolver}=loadTypeScriptModule('libraries/nestjs-libraries/src/chat/conductor/work-context.resolver.ts',markers);
const {AGENT_WORKSPACE_METADATA_KEY:KEY,AGENT_WORKSPACE_VERSION:VERSION}=loadTypeScriptModule('libraries/nestjs-libraries/src/chat/conductor/work-context.ts');
async function main(){
 const memory=new Memory({storage:new InMemoryStore(),options:{semanticRecall:false,workingMemory:{enabled:true,scope:'resource'}}});
 let writes=0,reads=0;
 const nativeUpdate=memory.updateThread.bind(memory);
 memory.updateThread=async args=>{if(args.metadata?.[KEY]){writes++;await new Promise(resolve=>setTimeout(resolve,15));}return nativeUpdate(args);};
 const drafts=new Map([['draft-a',{id:'draft-a',pieceId:'piece-a',organizationId:'org-a'}],['draft-b',{id:'draft-b',pieceId:'piece-b',organizationId:'org-a'}],['shared-draft',{id:'shared-draft',pieceId:'piece-shared',organizationId:'org-a',ownerId:'another-author'}],['foreign-draft',{id:'foreign-draft',pieceId:'piece-foreign',organizationId:'org-b'}]]);
 const jobs={get:async(org,id)=>{reads++;if(org!=='org-a'||id!=='job-a')throw new NotFoundException({code:'VIDEO_JOB_NOT_FOUND'});return{id,draftId:'draft-a',pieceId:'piece-a'};},readDraft:async(org,id)=>{reads++;const row=drafts.get(id);if(!row||row.organizationId!==org)throw new NotFoundException({code:'VIDEO_DRAFT_NOT_FOUND'});return{id:row.id,pieceId:row.pieceId,version:1,brief:{script:'Saved'},settings:{}};}};
 const resolver=new AgentWorkContextResolver({services:token=>{assert.equal(token,VideoJobService);return jobs;},gate:{check:async()=>({allowed:true})},capabilities:[{id:'video.status',door:{}},{id:'video.draft',door:{}},{id:'media.library',door:{}}]});
 const mastra={conductor:async()=>({getMemory:async()=>memory,listSuspendedRuns:async()=>({runs:[]})}),validateWorkArtifact:(...args)=>resolver.validateArtifact(...args)};
 const threads=new AgentThreadsService(mastra);
 const module=await Test.createTestingModule({imports:[ThrottlerModule.forRoot([{ttl:60000,limit:20}])],controllers:[AgentController],providers:[{provide:MastraService,useValue:mastra},{provide:AgentThreadsService,useValue:threads},{provide:AiUsageService,useValue:{}},{provide:VideoAccessService,useValue:{}}]}).compile();
 const app=module.createNestApplication({logger:false});
 app.use((req,res,next)=>{req.org={id:req.headers['x-org']||'org-a',createdAt:'2026-01-01T00:00:00Z',users:[{role:'EDITOR'}]};req.user={id:req.headers['x-user']||'user-a',language:'ru'};next();});
 await app.listen(0,'127.0.0.1');
 const post=(id,body,headers={})=>new Promise((resolve,reject)=>{const bytes=JSON.stringify(body);const req=require('node:http').request({host:'127.0.0.1',port:app.getHttpServer().address().port,path:`/agent/threads/${id}/video-binding`,method:'POST',headers:{'content-type':'application/json','content-length':Buffer.byteLength(bytes),...headers}},res=>{let text='';res.on('data',chunk=>text+=chunk);res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(text)}));});req.on('error',reject);req.end(bytes);});
 const artifact=(id,extra={})=>({kind:'media',id:'library',videoDraftId:id,...extra});
 const oldRef={kind:'piece',id:'old-piece'},workContext={version:'assistant-work-context/v1',kind:'piece',id:'old-piece'},writingSelection={channelId:'keep-channel',avatarId:'keep-avatar'};
 const create=async(id,refs=[oldRef],resourceId='org-a:user-a')=>memory.createThread({threadId:id,resourceId,title:'Preserve title',metadata:{unrelated:{keep:8},workingMemory:'Initial legacy memory',[KEY]:{version:VERSION,workContext,writingSelection,artifacts:refs,activeArtifact:refs[0]??null}}});
 try{
  await create('parallel');await memory.updateWorkingMemory({threadId:'parallel',resourceId:'org-a:user-a',workingMemory:'Latest resource memory'});
  const concurrent=await Promise.all(['draft-a','draft-b'].map(id=>post('parallel',{artifact:artifact(id)})));
  assert.deepEqual(concurrent.map(r=>r.status),[200,200]);
  const stored=await memory.getThreadById({threadId:'parallel'}),workspace=stored.metadata[KEY];
  assert.deepEqual(new Set(workspace.artifacts.map(ref=>ref.videoDraftId||ref.id)),new Set(['old-piece','draft-a','draft-b']));
  assert.equal(workspace.artifacts.length,3);assert.equal(workspace.activeArtifact.videoDraftId,'draft-b');
  assert.deepEqual(workspace.workContext,workContext);assert.deepEqual(workspace.writingSelection,writingSelection);assert.deepEqual(stored.metadata.unrelated,{keep:8});assert.equal(stored.title,'Preserve title');
  assert.equal(await memory.getWorkingMemory({threadId:'parallel',resourceId:'org-a:user-a'}),'Latest resource memory');
  assert.deepEqual(concurrent[1].body,{workspace});
  const again=await post('parallel',{artifact:artifact('draft-b')});assert.equal(again.status,200);assert.equal(again.body.workspace.artifacts.length,3);
  const before=JSON.stringify((await memory.getThreadById({threadId:'parallel'})).metadata),count=writes;
  for(const headers of [{'x-user':'other-user'},{'x-org':'org-b'}]){const beforeReads=reads;const r=await post('parallel',{artifact:artifact('draft-a')},headers);assert.equal(r.status,403);assert.equal(reads,beforeReads);}
  for(const body of [{artifact:artifact('foreign-draft')},{artifact:artifact('missing-draft')},{artifact:artifact('draft-a',{pieceId:'wrong-piece'})},{artifact:artifact('draft-b',{videoJobId:'job-a'})},{artifact:{kind:'piece',id:'piece-a'}},{artifact:{kind:'media',id:'library'}},{artifact:artifact('draft-a'),artifacts:[]},{artifact:artifact('draft-a',{prompt:'Injected'})}]){const r=await post('parallel',body);assert.ok([400,404].includes(r.status),JSON.stringify(r));}
  assert.equal(writes,count);assert.equal(JSON.stringify((await memory.getThreadById({threadId:'parallel'})).metadata),before);
  const full=Array.from({length:24},(_,i)=>({kind:'piece',id:`old-${i}`}));await create('full-thread',full);const fullBefore=JSON.stringify((await memory.getThreadById({threadId:'full-thread'})).metadata),fullWrites=writes;
  const rejected=await post('full-thread',{artifact:artifact('draft-a')});assert.equal(rejected.status,409);assert.equal(rejected.body.code,'AGENT_VIDEO_BINDING_FULL');assert.equal(writes,fullWrites);assert.equal(JSON.stringify((await memory.getThreadById({threadId:'full-thread'})).metadata),fullBefore);
  await create('at-limit',[...full.slice(0,23),artifact('draft-a')]);assert.equal((await post('at-limit',{artifact:artifact('draft-a')})).status,200);assert.equal((await memory.getThreadById({threadId:'at-limit'})).metadata[KEY].artifacts.length,24);
  await create('shared');assert.equal((await post('shared',{artifact:artifact('shared-draft')})).status,200); // Accessible workspace ref is not OAuth/spend authority.
  await create('capacity-race',full.slice(0,23));const bounded=await Promise.all(['draft-a','draft-b'].map(id=>post('capacity-race',{artifact:artifact(id)})));assert.deepEqual(bounded.map(r=>r.status).sort(),[200,409]);const refs=(await memory.getThreadById({threadId:'capacity-race'})).metadata[KEY].artifacts;assert.equal(refs.length,24);assert.deepEqual(refs.slice(0,23),full.slice(0,23));
  process.stdout.write(JSON.stringify({passed:true,concurrentBindings:2,foreignThreadDenied:true,invalidRefsNoMutation:true,capacityNoEviction:true,sharedReferenceNotSpendAuthority:true,nativeMemoryPreserved:true}));
 }finally{await app.close();}
}
main().catch(error=>{process.stderr.write(String(error.stack||error));process.exitCode=1;});
