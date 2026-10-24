'use strict';
// Real local product/native storage and services; only external inference/search
// are frozen. No production data, keys, schema or provider endpoint is reused.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '../..');
const OWNER = 'cf-chat-5961-local-domain/v1';
const REQUEST = 'Соберите подтверждённые обновления с 9 по 23 октября 2026 включительно. Старый пост за 6–8 октября — только пример, его утверждения не считать доказательствами. Подготовьте заготовку и черновик для Telegram. Задайте необходимые вопросы здесь и после ответов продолжите автоматически.';
const CORE = 'Обновления за 9–23 октября 2026\n\n9 октября: Alpha добавила нативные сессии. 23 октября: Beta сохраняет прерванные потоки. Обещание ежедневного выпуска из старого поста не подтверждено.\n\nИсточники: https://primary.example/alpha и https://primary.example/beta';
const writePrivate = (file, value) => { fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value, null, 2), { mode: 0o600 }); fs.chmodSync(file, 0o600); };
const loadTs = () => { process.env.TS_NODE_PROJECT = path.join(ROOT, 'tsconfig.json'); process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: 'commonjs' }); require('ts-node/register/transpile-only'); require('tsconfig-paths/register'); require('reflect-metadata'); };
const lib = file => require(path.join(ROOT, 'libraries/nestjs-libraries/src', file));
const backend = file => require(path.join(ROOT, 'apps/backend/src', file));
function installEnv(stand) {
  for (const key of Object.keys(process.env)) if (!['HOME','USER','LOGNAME','PATH','SHELL','LANG','LC_ALL','TMPDIR','TERM'].includes(key)) delete process.env[key];
  Object.assign(process.env, stand.env);
}
async function prepare() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-chat-5961-'));
  fs.chmodSync(directory, 0o700);
  const suffix = randomUUID().slice(0, 8);
  const database = `cf_chat_5961_20261024_${suffix}`;
  const { Client } = require('pg');
  const admin = new Client({ connectionString: 'postgresql://cf-dev:cf-dev-pwd@127.0.0.1:5433/cf-dev-db' });
  await admin.connect();
  try { for (const name of [database, `${database}_mastra`]) { await admin.query(`CREATE DATABASE "${name}"`); await admin.query(`COMMENT ON DATABASE "${name}" IS '${OWNER}'`); } } finally { await admin.end(); }
  const env = {
    NODE_ENV:'development',PORT:'3496',FRONTEND_URL:'http://localhost:4296',MAIN_URL:'http://localhost:4296',NEXT_PUBLIC_URL:'http://localhost:4296',
    NEXT_PUBLIC_BACKEND_URL:'http://localhost:3496',BACKEND_INTERNAL_URL:'http://localhost:3496',
    DATABASE_URL:`postgresql://cf-dev:cf-dev-pwd@127.0.0.1:5433/${database}?connection_limit=8`,
    MASTRA_DATABASE_URL:`postgresql://cf-dev:cf-dev-pwd@127.0.0.1:5433/${database}_mastra`,
    REDIS_URL:'redis://127.0.0.1:6380/15',JWT_SECRET:randomUUID()+randomUUID(),NOT_SECURED:'true',API_LIMIT:'10000',
    STORAGE_PROVIDER:'local',UPLOAD_DIRECTORY:path.join(directory,'uploads'),NEXT_PUBLIC_UPLOAD_DIRECTORY:'/uploads',
    EMAIL_PROVIDER:'',DISABLE_REGISTRATION:'true',MCP_ENABLED:'',NEXT_TELEMETRY_DISABLED:'1',RUN_CRON:'',
    TEMPORAL_ADDRESS:'127.0.0.1:1',TEMPORAL_NAMESPACE:`cf-chat-5961-${suffix}`,
  };
  fs.mkdirSync(env.UPLOAD_DIRECTORY,{mode:0o700});
  const stand = { owner:OWNER,repo:ROOT,directory,database,env,request:REQUEST,createdAt:new Date().toISOString() };
  const file = path.join(directory,'stand.json'); writePrivate(file,stand);
  execFileSync('pnpm',['exec','prisma','db','push','--schema','libraries/nestjs-libraries/src/database/prisma/schema.prisma','--skip-generate'], {cwd:ROOT,env:{...process.env,...env},stdio:'pipe'});
  installEnv(stand); loadTs();
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  const { AuthService } = require(path.join(ROOT,'libraries/helpers/src/auth/auth.service.ts'));
  try {
    const organization=await prisma.organization.create({data:{name:`Synthetic chat acceptance ${suffix}`,apiKey:randomUUID()}});
    const user=await prisma.user.create({data:{email:`chat-5961-${suffix}@example.invalid`,name:'Локальная проверка',providerName:'LOCAL',activated:true,password:AuthService.hashPassword(randomUUID()),timezone:180,language:'ru',sendSuccessEmails:false,sendFailureEmails:false,sendStreakEmails:false}});
    await prisma.userOrganization.create({data:{organizationId:organization.id,userId:user.id,role:'ADMIN'}});
    const avatar=await prisma.projectBrandProfile.create({data:{organizationId:organization.id,name:'Локальный редактор',kind:'BRAND',isDefault:true}});
    await prisma.aiProviderSetting.create({data:{organizationId:organization.id,provider:'openrouter',usageMode:'workspace_key',apiKey:AuthService.fixedEncryption('synthetic-no-provider-key'),textModel:'openai/gpt-6-luna',searchEnabled:true}});
    const channel=await prisma.integration.create({data:{organizationId:organization.id,internalId:`synthetic-${suffix}`,name:'Telegram — локальный черновик',providerIdentifier:'telegram',type:'social',token:'synthetic-unused-token',contentLanguage:'ru',planMode:'draft'}});
    stand.actor={organizationId:organization.id,userId:user.id,avatarId:avatar.id,channelId:channel.id,auth:AuthService.signSessionJWT(user)};
    env.CF_LOCAL_AUTH_TOKEN=stand.actor.auth;
    writePrivate(file,stand);
    writePrivate(path.join(directory,'frontend.env'),Object.entries(env).map(([key,value])=>`${key}=${JSON.stringify(value)}`).join('\n')+'\n');
    writePrivate(path.join(directory,'storage-state.json'),{cookies:[{name:'auth',value:stand.actor.auth,domain:'localhost',path:'/',expires:-1,httpOnly:false,secure:false,sameSite:'Lax'},{name:'showorg',value:organization.id,domain:'localhost',path:'/',expires:-1,httpOnly:false,secure:false,sameSite:'Lax'},{name:'NEXT_LOCALE',value:'ru',domain:'localhost',path:'/',expires:-1,httpOnly:false,secure:false,sameSite:'Lax'}],origins:[]});
  } finally { await prisma.$disconnect(); }
  return {file,directory,database};
}
function loadStand(file) {
  const stand=JSON.parse(fs.readFileSync(file,'utf8'));
  if(stand.owner!==OWNER||stand.repo!==ROOT||!/^cf_chat_5961_20261024_[a-f0-9]{8}$/.test(stand.database))throw new Error('Fixture ownership mismatch');
  for(const key of ['DATABASE_URL','MASTRA_DATABASE_URL','REDIS_URL'])if(!['127.0.0.1','localhost'].includes(new URL(stand.env[key]).hostname))throw new Error('Only loopback fixture services allowed');
  if(new URL(stand.env.DATABASE_URL).pathname!=='/'+stand.database||new URL(stand.env.MASTRA_DATABASE_URL).pathname!=='/'+stand.database+'_mastra'||new URL(stand.env.REDIS_URL).pathname!=='/15')throw new Error('Fixture storage ownership mismatch');
  return stand;
}
function denyExternalNetwork() {
  const allowed=url=>['127.0.0.1','localhost','[::1]'].includes(new URL(url).hostname);
  const original=global.fetch;
  global.fetch=(url,options)=>{const target=typeof url==='string'||url instanceof URL?String(url):url.url;if(!allowed(target))throw new Error('LOCAL_FIXTURE_EXTERNAL_NETWORK_DENIED');return original(url,options);};
  for(const protocol of ['http','https']) {
    const module=require(`node:${protocol}`);
    for(const method of ['request','get']) { const original=module[method]; module[method]=function(target,...rest){const host=typeof target==='object'&&!(target instanceof URL)?target.hostname??target.host:new URL(target).hostname;if(!['localhost','127.0.0.1','[::1]'].includes(String(host).split(':')[0]))throw new Error('LOCAL_FIXTURE_EXTERNAL_NETWORK_DENIED');return original.call(this,target,...rest);}; }
  }
}
// Consume the public AI SDK tool-result prompt contract. Internal provider
// metadata is deliberately absent after the product's prompt projection.
function collectNativeToolResults(prompt) {
  const capabilityByTool = {
    research_search: 'research.search', piece_create: 'piece.create',
    'piece_create_from-research': 'piece.create.from-research',
    piece_answer: 'piece.answer', piece_read: 'piece.read', piece_adapt: 'piece.adapt',
  };
  const outputs = [];
  for (const message of Array.isArray(prompt) ? prompt : []) {
    if (message?.role !== 'tool' || !Array.isArray(message.content)) continue;
    for (const part of message.content) {
      if (part?.type !== 'tool-result' || !capabilityByTool[part.toolName]) continue;
      const output = part.output?.type === 'json' ? part.output.value : part.output;
      if (!output || typeof output !== 'object' || Array.isArray(output) || typeof output.ok !== 'boolean') continue;
      outputs.push({ ...output, capability: capabilityByTool[part.toolName] });
    }
  }
  return outputs;
}
function installFrozenProviders(stand) {
  const audit=entry=>fs.appendFileSync(path.join(stand.directory,'provider-audit.jsonl'),JSON.stringify({at:new Date().toISOString(),...entry})+'\n',{mode:0o600});
  const {RunnableLambda}=require('@langchain/core/runnables');
  const clients=lib('openai/ai.clients.ts');
  const brief=()=>({goal:'Обзор двух подтверждённых изменений за 9–23 октября 2026',thesis:'Два документированных изменения',position:null,disagreement:null,audience:'читатели Telegram',format:'list',facts:[],origins:{goal:'input',thesis:'model',audience:'input',format:'model'},options:{thesis:['Два изменения'],position:[],audience:[],disagreement:[]},inputSufficient:true,
    questions:[{field:'thesis',question:'Какой акцент выбрать для обзора за 9–23 октября 2026? Сохраним точные даты и ссылки на источники, а неподтверждённое обещание из старого поста оставим явным пробелом.',options:Array.from({length:7},(_,i)=>`Вариант ${i+1}: `+'Практические изменения для читателя с проверенной датой и источником. '.repeat(6))},{field:'position',question:'Как обозначить границы подтверждённых сведений?',options:['Нейтрально перечислить изменения','Подчеркнуть отсутствие доказательств ежедневных релизов']}],
    understanding:{version:'intake-request/v1',goal:REQUEST,materials:[],constraints:{research:'allowed',temporal:{start:'2026-10-09',end:'2026-10-23'}}}});
  clients.getChatModel=async(_org,_temperature,_tokens,role)=>{
    const response = schema => RunnableLambda.from(async prompt=>{
      audit({type:'structured-model',role});
      if(role==='draft')return{text:CORE};
      if(role==='review')return{status:'passed',missingRequirements:[],unsupportedClaims:[],questions:[],supported:true,complete:true,gaps:[],relevant:true};
      if(role==='classify')return{category:'technology',topic:'software'};
      if(role==='adapt'){
        const text=typeof prompt?.toString==='function'?prompt.toString():String(prompt);
        const ids=[...new Set([...text.matchAll(/\[([A-Za-z0-9_-]+)\]\s+(?:FACT|EVIDENCE)/g)].map(match=>match[1]))];
        const content={content:CORE,usedCitationIds:ids};
        const array=schema?.shape?.content?._def?.typeName==='ZodArray';
        return{hook:'Два документированных изменения',content:array?[content,{content:'Подтверждений ежедневных выпусков за весь период нет.',usedCitationIds:ids}]:content,questions:[]};
      }
      return brief();
    });
    const runnable=response();runnable.withStructuredOutput=schema=>response(schema);return runnable;
  };
  const {WebResearchService}=lib('openai/web.research.service.ts');
  WebResearchService.prototype.research=async(_org,query)=>{audit({type:'frozen-search',query});return{summary:'9 октября Alpha добавила нативные сессии. 23 октября Beta сохраняет прерванные потоки. Ежедневный выпуск не подтверждён.',readerAssessment:{version:'fixture-review/v1',status:'partial',requestedDate:'2026-10-23',requestedPeriod:{start:'2026-10-09',end:'2026-10-23'},coverage:[{question:'Два документированных обновления',status:'supported'},{question:'Ежедневные выпуски',status:'missing'}]},sources:[{url:'https://primary.example/alpha',title:'Alpha',publishedAt:'2026-10-09T12:00:00Z',text:'2026-10-09. Alpha added native sessions.'},{url:'https://primary.example/beta',title:'Beta',publishedAt:'2026-10-23T12:00:00Z',text:'2026-10-23. Beta preserves interrupted streams.'}],facts:[{factKey:'alpha',statement:'Alpha добавила нативные сессии.',quote:'Alpha added native sessions.',sourceUrl:'https://primary.example/alpha',dateProvenance:{eventDate:'2026-10-09',basis:'source'}},{factKey:'beta',statement:'Beta сохраняет прерванные потоки.',quote:'Beta preserves interrupted streams.',sourceUrl:'https://primary.example/beta',dateProvenance:{eventDate:'2026-10-23',basis:'source'}}]};};
  const {MockLanguageModelV3}=require('ai/test');
  const {convertArrayToReadableStream}=require('@ai-sdk/provider-utils/test');
  const usage={inputTokens:{total:5,noCache:5},outputTokens:{total:5,text:5}};
  const unwrap=value=>value?.summary?.untrustedData?.value??value?.summary??value;
  const native=new MockLanguageModelV3({modelId:'fixture',doStream:async args=>{
    // Keep the scalar audit, not MockLanguageModel's test-only prompt archive.
    native.doStreamCalls.length=0;
    const outputs=collectNativeToolResults(args.prompt);
    const result=id=>outputs.filter(row=>row.capability===id&&row.ok===true).map(unwrap).at(-1);
    const searched=result('research.search'),created=result('piece.create')??result('piece.create.from-research'),adapted=result('piece.adapt');
    const author=(args.prompt??[]).find(message=>message.role==='user');
    const original=typeof author?.content==='string'?author.content:(author?.content??[]).filter(part=>part.type==='text').map(part=>part.text).join('\n')||REQUEST;
    const readCore=outputs.some(row=>row.capability==='piece.read'&&unwrap(row)?.part==='core');
    const readAdaptation=outputs.some(row=>row.capability==='piece.read'&&unwrap(row)?.part==='adaptation');
    let name,input;
    if(original.includes('canonical-question-case')){
      const answered=result('piece.answer');
      if(!answered){name='piece_answer';input={pieceId:stand.canonicalPieceId};}
      else if(!readCore){name='piece_read';input={pieceId:stand.canonicalPieceId,part:'core'};}
    }
    else if(!searched){name='research_search';input={query:original,level:'standard'};}
    else if(!created){name='piece_create';input={text:original,inputKind:'instruction',researchId:searched.snapshotKey,factId:['alpha','beta']};}
    else if(!readCore){name='piece_read';input={pieceId:created.pieceId,part:'core'};}
    else if(!adapted){name='piece_adapt';input={pieceId:created.pieceId,channelId:stand.actor.channelId,kind:'post'};}
    else if(!readAdaptation){name='piece_read';input={pieceId:created.pieceId,part:'adaptation',adaptationId:adapted.adaptationId};}
    const toolNames=(args.tools??[]).map(row=>row.name);
    if(name&&!toolNames.includes(name)){name='skill';input={name:'content'};}
    audit({type:'native-model',tool:name??null,toolNames,seenCapabilities:outputs.map(row=>row.capability)});
    const rows=[{type:'stream-start',warnings:[]}];
    if(name)rows.push({type:'tool-call',toolCallId:`fixture-${name}-${randomUUID().slice(0,8)}`,toolName:name,input:JSON.stringify(input)});
    else rows.push({type:'text-start',id:'done'},{type:'text-delta',id:'done',delta:original.includes('canonical-question-case')?'Ответы сохранены, заготовка обновлена.':'Сохранены заготовка и черновик для Telegram за 9–23 октября 2026. Подтверждены два изменения; ежедневные выпуски остаются неподтверждёнными.'},{type:'text-end',id:'done'});
    rows.push({type:'finish',finishReason:{unified:name?'tool-calls':'stop',raw:name?'tool_calls':'stop'},usage});
    return{stream:convertArrayToReadableStream(rows)};
  }});
  clients.getRoutedMastraModelEntries=async()=>({entries:[{model:native,maxRetries:0}],policy:{maxRetries:0}});
  clients.getMastraAiSdkProvider=async()=>({chat:()=>native});
  clients.getModelForRole=async()=> 'mock-provider/fixture';
  clients.getClassifyDecisionModel=async()=>{throw new Error('Unexpected external model classification');};
  clients.getMastraVoice=async()=>{throw new Error('Fixture voice disabled');};
  return{native,audit};
}
async function start(file) {
  const stand=loadStand(file);installEnv(stand);
  const {PostgresStore}=require('@mastra/pg');const bootstrap=new PostgresStore({id:'cf-chat-5961-bootstrap',connectionString:stand.env.MASTRA_DATABASE_URL});await bootstrap.init();await bootstrap.close();
  loadTs();denyExternalNetwork();const frozen=installFrozenProviders(stand);
  const {Test}=require('@nestjs/testing');const {Global,Module,ValidationPipe}=require('@nestjs/common');const {APP_GUARD}=require('@nestjs/core');
  const {NewsletterDeliveryRetryServiceV1}=backend('services/newsletter/newsletter-delivery-retry.service.v1.ts');
  class Support{}Global()(Support);Module({providers:[NewsletterDeliveryRetryServiceV1],exports:[NewsletterDeliveryRetryServiceV1]})(Support);
  const {ThrottlerModule}=require('@nestjs/throttler');const {ThrottlerStorageRedisService}=require('@nest-lab/throttler-storage-redis');const {ioRedis}=lib('redis/redis.service.ts');
  const module=await Test.createTestingModule({imports:[lib('database/prisma/database.module.ts').DatabaseModule,backend('api/api.module.ts').ApiModule,lib('agent/agent.module.ts').AgentModule,lib('3rdparties/thirdparty.module.ts').ThirdPartyModule,lib('videos/video.module.ts').VideoModule,lib('chat/chat.module.ts').ChatModule,Support,lib('temporal/temporal.module.ts').getTemporalCommandModule(),ThrottlerModule.forRoot({throttlers:[{ttl:3600000,limit:10000}],storage:new ThrottlerStorageRedisService(ioRedis)})],providers:[{provide:APP_GUARD,useClass:lib('throttler/throttler.provider.ts').ThrottlerBehindProxyGuard},{provide:APP_GUARD,useClass:backend('services/auth/permissions/permissions.guard.ts').PoliciesGuard}]}).compile();
  const app=module.createNestApplication({cors:backend('cors.options.ts').buildBackendCorsOptions(process.env)});
  app.useGlobalPipes(new ValidationPipe({transform:true,whitelist:true}));app.use(require('cookie-parser')());
  app.useGlobalFilters(new(backend('services/auth/permissions/subscription.exception.ts').SubscriptionExceptionFilter)(),new(backend('api/routes/posts.validation.exception.ts').PostValidationExceptionFilter)(),new(lib('services/exception.filter.ts').HttpExceptionFilter)(),new(lib('services/stripe.error.filter.ts').StripeErrorFilter)());
  app.use((req,res,next)=>/^\/(?:integrations\/.*connect|posts\/(?:publish|send)|admin|enterprise|auth\/(?:register|forgot))/i.test(req.path)?res.status(403).json({code:'LOCAL_FIXTURE_OUTBOUND_DISABLED'}):next());
  const {MastraService}=lib('chat/mastra.service.ts');const service=app.get(MastraService);const mastra=await service.mastra();
  mastra.addGateway({id:'fixture',name:'Local frozen provider',handlesModel:id=>id.startsWith('mock-provider/'),fetchProviders:async()=>({'mock-provider':{name:'fixture',gateway:'fixture',apiKeyEnvVar:[],models:['fixture']}}),buildUrl:()=>undefined,getApiKey:async()=> 'synthetic',resolveLanguageModel:()=>frozen.native});
  app.getHttpAdapter().getInstance().get('/__fixture/seed-question-case',async(req,res)=>{
    if(req.headers.auth!==stand.actor.auth||req.headers.showorg!==stand.actor.organizationId)return res.status(403).json({code:'FIXTURE_SCOPE_REFUSED'});
    try{
      const {PieceRepository}=lib('content-intelligence/pieces/piece.repository.ts');const repo=app.get(PieceRepository);
      const source=await repo.getPiece(stand.actor.organizationId,String(req.query.pieceId??''));
      if(!source||source.kind!=='CORE')return res.status(404).json({code:'FIXTURE_CORE_REQUIRED'});
      const brief=JSON.parse(JSON.stringify(source.brief));
      const options=Array.from({length:7},(_,index)=>`Сохранённый вариант ${index+1}: `+'Полная формулировка исходного варианта должна сохраняться дословно при ответе в разговоре. '.repeat(5));
      brief.questions={round:0,answered:[],items:[
        {field:'thesis',question:'Выберите основной акцент из семи сохранённых вариантов. '+'Это полный исходный текст вопроса из синтетической сохранённой заготовки. '.repeat(8),options,suggested:options[0],selectionMode:'single'},
        {field:'position',question:'Какую позицию сформулировать своими словами?',options:['Нейтрально перечислить','Обозначить границы доказательств'],selectionMode:'single'},
        {field:'facts',key:'ask-1',question:'Какие два редакционных правила сохранить вместе? Выберите несколько вариантов.',options,selectionMode:'multiple'},
        {field:'disagreement',question:'Как нейтрально обозначить неподтверждённый пункт?',options:['Оставить пробел явным','Не утверждать наличие ежедневных релизов'],selectionMode:'single'},
      ]};
      const created=await repo.createCore(stand.actor.organizationId,{title:'Синтетический сохранённый вопрос: 7 полных вариантов',body:source.body,brief,language:'ru',createdByUserId:stand.actor.userId});
      stand.canonicalPieceId=created.id;writePrivate(file,stand);
      return res.json({pieceId:created.id,questionCount:4,optionCount:7,request:`Ответьте на сохранённые вопросы заготовки ${created.id}. canonical-question-case`,seedKind:'synthetic saved canonical question source; actual producer limits unchanged'});
    }catch(error){return res.status(500).json({error:error.message});}
  });
  await app.listen(3496,'127.0.0.1');
  writePrivate(path.join(stand.directory,'backend-pid.json'),{owner:OWNER,pid:process.pid,file});
  return{stand,app,service,async close(){await lib('temporal/temporal.module.ts').closeTemporalCommandClient(app).catch(()=>{});await app.close();ioRedis.disconnect();await lib('chat/mastra.store.ts').closeMastraStore();}};
}
module.exports={prepare,start,loadStand,collectNativeToolResults,REQUEST,CORE,OWNER};
