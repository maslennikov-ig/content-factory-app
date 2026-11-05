const {createProviderFixture,codeOf}=require('./video-subscription-provider-fixture.cjs');
const {loadTypeScriptModule}=require('./load-ts-module.cjs');
const {createHash,randomUUID}=require('node:crypto');
const {Prisma}=require('@prisma/client');
const root='libraries/nestjs-libraries/src/';
const inventory=['generate_image','generate_video','jobs_wait','list_workspaces','select_workspace','models_explore'].map(name=>({name,inputSchema:{type:'object',properties:{}}}));
const registry=loadTypeScriptModule(root+'videos/subscriptions/video-provider-registry.ts');
const schemaDigest=registry.subscriptionHash([...inventory].sort((a,b)=>a.name.localeCompare(b.name)));
inventory.push({name:'ads_studio_synthetic',inputSchema:{type:'object',properties:{}}});
const nativeWireSchemaDigest=registry.subscriptionHash([...inventory].sort((a,b)=>a.name.localeCompare(b.name)));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const retained=(raw,id)=>Buffer.from(JSON.stringify({source:'a'.repeat(40),schemaDigest,accountGeneration:1,request:{id},raw}));
const evidence={imageDetail:retained({id:'synthetic-image',name:'GPT Image 2.5',provider_name:'OpenAI',output_type:'image'},'image_model'),videoCatalogue:retained({items:[{id:'synthetic-video',name:'Kling 4.0',provider_name:'Kling',output_type:'video'}]},'video_catalogue')};
const pins={schemaDigest,nativeWireSchemaDigests:[schemaDigest,nativeWireSchemaDigest],imageDetail:{sha256:sha(evidence.imageDetail),name:'GPT Image 2.5',provider:'OpenAI'},videoCatalogue:{sha256:sha(evidence.videoCatalogue),name:'Kling 4.0',provider:'Kling'}};
const quoteContract=loadTypeScriptModule(root+'videos/subscriptions/video-hgg-pilot-quote.v1.ts',{'./video-hgg-pilot-evidence.v1':{HGG_PILOT_EVIDENCE_V1:pins}});
const source={pilotId:'parent',parentRevision:1,sourceArtifactRef:{version:1,kind:'piece',pieceId:'synthetic-piece',revision:'1'.repeat(64)},sourceContentDigest:'2'.repeat(64),scenarioDigest:'3'.repeat(64),acceptedTextReviewDigest:'4'.repeat(64),acceptedTextReviewInputHash:'5'.repeat(64)};
const parameter=(name,options,type='string')=>({name,type,required:'optional',...(options?{options}:{min:3,max:30})});
const nativeModels={image:{id:'synthetic-image',name:'GPT Image 2.5',provider_name:'OpenAI',description:'Synthetic metadata only',output_type:'image',parameters:[parameter('variant',['flare','sunburst']),parameter('quality',['low','high']),parameter('resolution',['1k','2k'])],medias:[{name:'medias',type:'image',roles:['image_references']}],aspect_ratios:['9:16']},video:{id:'synthetic-video',name:'Kling 4.0',provider_name:'Kling',description:'Synthetic metadata only',output_type:'video',parameters:[parameter('mode',['image-to-video']),parameter('resolution',['720p','1080p']),parameter('duration',null,'number')],medias:[{name:'medias',type:'image',roles:['start_image','end_image']}],aspect_ratios:['9:16']}};
const modelResults=()=>[{items:[clone(nativeModels.image)],has_more:false},{items:[clone(nativeModels.video)],has_more:false}];
const workspace={id:'synthetic-private-workspace',name:null,type:'private',user_role:'owner',is_selected:true,plan_type:'synthetic',credits:100};
const clone=v=>v instanceof Date?new Date(v):v instanceof Prisma.Decimal?new Prisma.Decimal(v):Array.isArray(v)?v.map(clone):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,clone(x)])):v;
function match(row,where={}){
 for(const [k,v] of Object.entries(where)){
  if(v===undefined)continue;
  if(k==='OR'){if(!v.some(x=>match(row,x)))return false;continue;}
  if(k==='AND'){if(!(Array.isArray(v)?v:[v]).every(x=>match(row,x)))return false;continue;}
  if(k==='organizationId_intentId'){if(!match(row,v))return false;continue;}
  if(v&&typeof v==='object'&&!Array.isArray(v)&&!(v instanceof Date)){
   if(v.path){let x=row[k];for(const p of v.path)x=x?.[p];if(x!==v.equals)return false;continue;}
   if(v.in&&!v.in.includes(row[k]))return false;
   if(v.notIn&&v.notIn.includes(row[k]))return false;
   if('lte'in v&&!(row[k]<=v.lte))return false;if('lt'in v&&!(row[k]<v.lt))return false;if('gt'in v&&!(row[k]>v.gt))return false;
   if('not'in v&&row[k]===v.not)return false;
  }else if(v instanceof Date ? !(row[k] instanceof Date)||row[k].getTime()!==v.getTime() : row[k]!==v)return false;
 }
 return true;
}
function database(now){
 const rows={videoAccessPreflight:[],videoRouteIntent:[],videoSubscriptionJob:[],media:[]};
 const db={};
 for(const key of Object.keys(rows))db[key]={
  findFirst:async({where}={})=>clone(rows[key].find(r=>match(r,where))??null),
  findUnique:async({where})=>clone(rows[key].find(r=>match(r,where))??null),
  findFirstOrThrow:async(args)=>{const row=await db[key].findFirst(args);if(!row)throw Error('Synthetic row missing');return row;},
  findUniqueOrThrow:async(args)=>db[key].findFirstOrThrow(args),
  findMany:async({where}={})=>rows[key].filter(r=>match(r,where)).map(clone),
  create:async({data})=>{if(key==='videoSubscriptionJob'&&rows[key].some(r=>r.preflightId===data.preflightId||r.organizationId===data.organizationId&&r.intentId===data.intentId))throw Error('Synthetic unique');
   const row={id:randomUUID(),createdAt:now(),updatedAt:now(),actualCost:null,leaseUntil:null,leaseOwner:null,submitAttempts:0,pollAttempts:0,saveAttempts:0,runCycle:0,resultMediaId:null,receipt:null,storedFile:null,costCertainty:'unknown',errorCode:null,deletedAt:null,...clone(data)};rows[key].push(row);return clone(row);},
  updateMany:jest.fn(async({where,data})=>{let count=0;for(const row of rows[key])if(match(row,where)){for(const[k,v]of Object.entries(data))row[k]=v&&typeof v==='object'&&'increment'in v?(row[k]||0)+v.increment:clone(v);count++;}return{count};}),
 };
 let tail=Promise.resolve();db.transaction=fn=>{const operation=tail.then(async()=>{const saved=clone(rows);try{return await fn(db);}catch(e){for(const k of Object.keys(rows))rows[k]=saved[k];throw e;}});tail=operation.catch(()=>{});return operation;};
 return{db,rows};
}
async function nativeFixture(run){
 const f=await createProviderFixture({now:'2026-02-01T00:00:00Z',moduleMocks:{'./video-hgg-pilot-evidence.v1':{HGG_PILOT_EVIDENCE_V1:pins},'./video-hgg-pilot-quote.v1':quoteContract,'../subscriptions/video-hgg-pilot-quote.v1':quoteContract}});
 const oldSecret=process.env.JWT_SECRET;process.env.JWT_SECRET='native-pilot-test-only';
 try{
  f.state.tools.higgsfield=clone(inventory);const def=f.runtime.definition('higgsfield');const tokens=f.issueTokens('higgsfield');
  const {AuthService}=loadTypeScriptModule('libraries/helpers/src/auth/auth.service.ts');
  const connection={id:'connection',ownerId:'actor',provider:'higgsfield',issuer:def.issuer,resource:def.resource,state:'discovery_required',walletDigest:'unverified:synthetic',generation:1,tokenVersion:1,encryptedTokens:AuthService.fixedEncryption(JSON.stringify(tokens)),expiresAt:new Date('2026-02-01T01:00:00Z'),unit:'higgsfield_credit',perJob:null,perMonth:null};
  const {db,rows}=database(()=>f.runtime.now());
  db.userOrganization={findFirst:async({where})=>where.userId==='actor'&&where.organizationId==='org'?{role:'ADMIN',user:{activated:true}}:null};
  db.videoSubscriptionConnection={findMany:async({where})=>match(connection,where)?[clone(connection)]:[],findFirst:async({where})=>match(connection,where)?clone(connection):null};
  db.videoSubscriptionGrant={findUnique:async()=>({enabled:true})};db.videoSubscriptionWorkspacePolicy={findUnique:async()=>({enabled:true})};
  const {VideoSubscriptionRepository}=loadTypeScriptModule(root+'database/prisma/video-subscription/video-subscription.repository.ts',f.modules.mocks);
  const repository=new VideoSubscriptionRepository(db);repository.transaction=fn=>db.transaction(fn);
  const connections=new f.modules.connection.VideoConnectionService(repository,f.runtime,f.oauth);
  const register=(file,aliases=[])=>f.modules.register(file,aliases);
  const contracts=register('subscriptions/video-hgg-pilot-stage.v1',['./video-hgg-pilot-stage.v1']);
  const {HggPilotParentPortV1}=register('subscriptions/video-hgg-pilot-parent.port.v1',['./video-hgg-pilot-parent.port.v1']);const parents=new HggPilotParentPortV1();
  const parent={revision:1,stopped:false,vision:false,executionApproved:true,authorization:{id:'owner-fact',unit:'higgsfield_credit',pilotLimit:'50',stageLimit:'50',stages:['first_frame','last_frame','clip'],funding:'credits'}};
  const assertions=[];let continuation=async()=>{};
  parents.bind({assertCurrentPilot:async(tx,expected)=>{expect(tx).toBe(db);assertions.push(clone(expected));if(expected.action!=='quote'&&!parent.executionApproved)throw new (require('@nestjs/common').HttpException)({code:'VIDEO_PILOT_EXECUTION_APPROVAL_REQUIRED'},409);if(parent.stopped)throw new (require('@nestjs/common').HttpException)({code:'VIDEO_PILOT_STOPPED'},409);if(expected.stage==='clip'&&expected.action!=='quote'&&!parent.vision)throw new (require('@nestjs/common').HttpException)({code:'VIDEO_PILOT_VISION_REQUIRED'},409);return {authorization:parent.authorization};},assertWorkspaceSelection:async()=>{},onStageSettled:async event=>continuation(event)});
  const {HggPilotWorkspaceServiceV1}=register('subscriptions/video-hgg-workspace.service.v1',['./video-hgg-workspace.service.v1']);const workspaces=new HggPilotWorkspaceServiceV1(repository,connections,f.mcp,parents);
  const {HiggsfieldPilotProviderV1}=register('providers/higgsfield-pilot.provider.v1',['../providers/higgsfield-pilot.provider.v1']);const provider=new HiggsfieldPilotProviderV1(f.mcp);
  const media={assertOwnedImage:jest.fn(async file=>{if(file.byteSha256==='changed')throw Error('Changed synthetic bytes');}),importResult:jest.fn(async(_url,type,resolution)=>({name:type==='image'?'synthetic.png':'synthetic.mp4',path:`https://owned.invalid/${randomUUID()}`,size:100,mime:type==='image'?'image/png':'video/mp4',width:type==='video'&&resolution==='720p'?720:1080,height:type==='video'&&resolution==='720p'?1280:1920,byteSha256:sha(Buffer.from(_url)),...(type==='video'?{durationSeconds:5}:{})}))};
  const execution={dispatch:jest.fn(async()=>{})};
  const shared={write:async(org,id,owner,data)=>{const updated=await db.videoSubscriptionJob.updateMany({where:{id,organizationId:org,leaseOwner:owner,leaseUntil:{gt:f.runtime.now()}},data});if(updated.count!==1)throw Error('Synthetic lease lost');}};
  const {HggPilotServiceV1}=register('subscriptions/video-hgg-pilot.service.v1');const service=new HggPilotServiceV1(repository,connections,provider,workspaces,parents,execution,media);
  const {HggPilotJobServiceV1}=register('subscriptions/video-hgg-pilot-job.service.v1');const jobs=new HggPilotJobServiceV1(repository,connections,shared,provider,workspaces,parents,media);
  f.script('higgsfield','list_workspaces',...Array.from({length:100},()=>({workspaces:[clone(workspace)]})));
  f.script('higgsfield','models_explore',...modelResults());
  const qualification=await f.modules.authenticatedSession.withAuthenticatedSession('actor','synthetic-session',()=>workspaces.qualify('org','actor',{intentId:'workspace-intent',pilotId:'parent',parentRevision:1,connectionId:'connection',accountGeneration:1,workspaceId:workspace.id}));
  const prepare=(slot='first',inputSource=source)=>({intentId:slot+'-intent',connectionId:'connection',accountGeneration:1,workspaceQualificationId:qualification.qualificationId,publicOutputLocale:'en',input:{version:1,kind:'image_frame',slot,source:clone(inputSource),prompt:'English '+slot+' frame direction',settings:{variant:'flare',quality:'high',resolution:'1k'},references:[]},references:[]});
  return await run({...f,db,rows,connection,repository,connections,parents,parent,assertions,provider,media,execution,service,jobs,qualification,prepare,setContinuation:fn=>{continuation=fn;},source:clone(source),contracts,nativeModels,modelResults});
 }finally{if(oldSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=oldSecret;await f.close();}
}
module.exports={nativeFixture,codeOf,workspace,quoteContract,evidence,nativeModels,modelResults};
