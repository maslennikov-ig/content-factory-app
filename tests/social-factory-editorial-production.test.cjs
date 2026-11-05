const { test } = require('node:test');
const assert = require('node:assert/strict');
const {loadTypeScriptModule} = require('./helpers/load-ts-module.cjs');
let modelCalls=0, admission=[], lastPrompt='';
const out=()=>({title:'Хорошая тема',hook:'Начнём с вопроса.',body:'Практический совет по работе.',caption:'Практический совет.',cta:'Что вы думаете?',ctaSurface:'reply',script:'',posts:[],frames:[],scenes:[],chapterStarts:[]});
let answer=out();
const {SocialEditorialProductionV1}=loadTypeScriptModule('libraries/nestjs-libraries/src/content-intelligence/social-factory/editorial/social-editorial-production.v1.ts',{
 '../../../openai/ai.clients':{getChatModel:async(org,temp,max,role)=>{assert.equal(org,'org-a');assert.equal(role,'draft');return {withStructuredOutput:()=>({invoke:async prompt=>{modelCalls++;lastPrompt=prompt;return answer;}})};}},
 './assets/editorial-assets.v1':{EditorialAssetsV1:class{}},
});
const stamp = (id, revision='r') => ({sourceId:id,sourceConfigVersion:1,snapshotId:revision,rightsConfirmedAt:'2026-01-01',permissionRevision:1});
const profile={version:1,channelId:'chan',platform:'telegram',audience:'founders',promise:'practical advice',goals:[],expertise:[],pillars:[],languages:['ru'],geography:[],exclusions:[],evidence:[],openQuestions:[]};
const base=()=>({organizationId:'org-a',actorId:'author',profile,format:'post',sourceIds:[],findings:[],brief:{instruction:'Объясни план',language:'ru',lengthChoiceId:'medium'}});
function service(){return new SocialEditorialProductionV1({executeAiOperation:async(org,op,run,role)=>{admission.push([org,op,role]);return run();}},{create:async(org,input)=>input.frames.map((_,i)=>({id:`media-${i}`,path:`https://example.test/${i}.png`}))},{mediaInWorkspace:async(org,ids)=>org==='org-a'?ids.map(id=>({id,path:`https://example.test/${id}`})):[]},{read:async()=>({documents:[],admissions:[],gaps:[]})},()=>new Date('2026-11-03T12:00:00Z'));}
test('telegram actual production uses metered draft role and keeps explicit length and title',async()=>{answer=out();modelCalls=0;admission=[];const result=await service().produce(base());assert.equal(result.status,'ready');assert.equal(result.material.title,'Хорошая тема');assert.match(result.material.settings.renderedText,/Хорошая тема/);assert.equal(result.material.settings.lengthChoiceId,'medium');assert.deepEqual(admission,[['org-a','intake','draft']]);assert.equal(modelCalls,1);});
test('Telegram restores the saved model shape as one native Markdown publication without a length preamble or duplicates',async()=>{
 const title='Как выбрать следующий шаг в учебной задаче',hook='Начните с одного конкретного действия.',cta='Выберите следующий шаг.';
 answer={...out(),title:`**${title}**`,hook,cta,body:`Выбранная длина: коротко, 1150–1650 знаков с заголовком и завершением.\n\n<b>${title}</b>\n\n${hook}\n\n<b>Как это сделать</b>\n\nВыберите одну задачу.\n\nВыбранная длина: 500 знаков — пример внутри статьи.\n\n${cta}`};
 let raw,digest;const svc=service();const first=await svc.produce(base(),{onGenerated:async(output,context)=>{raw=structuredClone(output);digest=context.sourceDigest;}});const before=structuredClone(raw);
 assert.match(lastPrompt,/Markdown/);assert.equal(first.status,'ready');assert.equal(first.material.title,title);assert.equal(first.material.settings.lengthChoiceId,'medium');assert.doesNotMatch(first.material.body,/^Выбранная длина/);
 modelCalls=0;const restored=await svc.produce(base(),{output:raw,sourceDigest:digest});assert.equal(modelCalls,0);assert.deepEqual(raw,before);assert.equal(restored.material.body,first.material.body);
 const {editorHtml}=loadTypeScriptModule('libraries/nestjs-libraries/src/content-intelligence/brief/editor-html.ts');const native=editorHtml(restored.material.settings.renderedText,'html');
 assert.equal(native.split(title).length-1,1);assert.match(native,new RegExp(`<strong>${title}</strong>`));assert.equal(native.split(hook).length-1,1);assert.equal(native.split(cta).length-1,1);assert.match(native,/<strong>Как это сделать<\/strong>/);assert.doesNotMatch(native,/&lt;\/?b&gt;|1150–1650/);assert.match(native,/Выбранная длина: 500 знаков — пример внутри статьи/);
});
test('Telegram keeps a formatted standalone title in public text and plain in metadata',async()=>{
 for(const title of ['**Большая учебная задача: с чего начать?**','<b>Большая учебная задача: с чего начать?</b>']){
  answer={...out(),title};const result=await service().produce(base());assert.equal(result.material.title,'Большая учебная задача: с чего начать?');assert.ok(result.material.settings.renderedText.startsWith('**Большая учебная задача: с чего начать?**'));
 }
});
test('carousel production creates actual media per slide and inspection checks them',async()=>{answer={...out(),frames:[{title:'Первый',body:'Деталь',footer:''},{title:'Второй',body:'Совет',footer:''}]};const input=base();input.profile={...profile,platform:'instagram'};input.format='carousel';input.brief.slideCount=2;const result=await service().produce(input);assert.equal(result.status,'ready');assert.equal(result.material.assets.length,2);assert.deepEqual(result.material.slides.map(x=>x.assetId),result.material.assets.map(x=>x.id));assert.ok(result.material.assets.every(x=>x.mediaId));});
test('source permission and negotiated length are checked before a paid model call',async()=>{modelCalls=0;const input=base();delete input.brief.lengthChoiceId;await assert.rejects(service().produce(input),/LENGTH_CHOICE/);input.brief.lengthChoiceId='medium';input.sourceIds=['unavailable'];await assert.rejects(service().produce(input),/PERMISSION/);assert.equal(modelCalls,0);});
test('video retains script and a real cover without pretending that a video exists',async()=>{answer={...out(),script:'Полный текст.',scenes:[{index:1,startSeconds:0,endSeconds:30,spokenText:'Полный текст.',visualIntent:'Мастерская'}]};const input=base();input.profile={...profile,platform:'instagram'};input.format='reel';input.brief.targetSeconds=30;const result=await service().produce(input);assert.equal(result.status,'needs_video');assert.equal(result.material.assets[0].role,'cover');assert.equal(result.material.assets[0].mediaId,'media-0');assert.equal(result.material.script,'Полный текст.');assert.equal(result.material.assets.some(x=>x.kind==='video'),false);});
test('video finalization refuses foreign assets and does not call model again',async()=>{const svc=service(), mat={version:1,channelId:'chan',platform:'instagram',format:'reel',title:'T',hook:'H',body:'B',caption:'C',cta:'',ctaSurface:'none',script:'text',scenes:[{index:1,startSeconds:0,endSeconds:30,spokenText:'text',visualIntent:'scene'}],assets:[],settings:{},evidence:[],playbook:{version:'social-editorial/v1',sourceDate:'2026-11-03'}};const asset={id:'a',kind:'video',role:'final',mediaId:'foreign',mimeType:'video/mp4',width:1080,height:1920,durationSeconds:30,provenance:{revision:'r',sourceIds:[]}};modelCalls=0;await assert.rejects(svc.finalizeVideo('org-b',mat,[asset]),/UNAVAILABLE/);assert.equal(modelCalls,0);});
test('profile evidence cannot be sent for editorial generation without matching permission',async()=>{const input=base(); input.profile={...profile,evidence:[{id:'foreign',sourceId:'source-x'}]};modelCalls=0;await assert.rejects(service().produce(input),/PROFILE_PERMISSION/);assert.equal(modelCalls,0);});
test('artwork failure retains paid generation so the caller can reconcile it',async()=>{answer={...out(),frames:[{title:'Один',body:'',footer:''}]};const input=base();input.profile={...profile,platform:'instagram'};input.format='story';const svc=new SocialEditorialProductionV1({executeAiOperation:async(org,op,run)=>run()},{create:async()=>{throw Object.assign(new Error('partial'),{saved:[{id:'already-saved'}]});}},{mediaInWorkspace:async()=>[]},{read:async()=>({documents:[],admissions:[],gaps:[]})});await assert.rejects(svc.produce(input),e=>e.message==='EDITORIAL_ARTWORK_FAILED'&&e.output.title==='Хорошая тема'&&e.cause.saved[0].id==='already-saved');});
test('production through real artwork service returns decodable PNGs and scoped media IDs',async()=>{
 const sharp=require('sharp'); const written=[];
 const {EditorialAssetsV1:RealAssets}=loadTypeScriptModule('libraries/nestjs-libraries/src/content-intelligence/social-factory/editorial/assets/editorial-assets.v1.ts',{'@nestjs/common':{Injectable:()=>()=>{}},'../../../../database/prisma/media/media.service':{MediaService:class{}},'../../../../upload/upload.factory':{UploadFactory:{createStorage:()=>({uploadFile:async file=>{written.push(file.buffer);return {originalname:'asset.png',path:'https://example.test/asset.png'};}})}},'../../../../videos/video-media.v1':{downloadVideoAssetV1:async()=>{throw Error('unexpected');}}});
 const media={saveFile:async(org,name,path)=>({id:`saved-${written.length}`,path}),mediaInWorkspace:async()=>[]};
 const production=new SocialEditorialProductionV1({executeAiOperation:async(org,operation,run)=>run()},new RealAssets(media),media,{read:async()=>({documents:[],admissions:[],gaps:[]})},()=>new Date('2026-11-03T12:00:00Z'));
 answer={...out(),frames:[{title:'Сначала проверьте данные',body:'Одна конкретная мысль.',footer:'Пример'}]};const input=base();input.profile={...profile,platform:'instagram'};input.format='story';const result=await production.produce(input);
 assert.equal(result.status,'ready');assert.equal(result.material.assets[0].mediaId,'saved-1');assert.equal((await sharp(written[0]).metadata()).height,1920);
});
test('source authority is consulted and copied third-party passages are held for revision',async()=>{
 const excerpt='одно два три четыре пять шесть семь восемь девять десять';
 answer={...out(),body:excerpt};let saves=0;
 const media={mediaInWorkspace:async()=>[]};const evidence={id:'ev',sourceId:'source',source:'Example',capturedAt:'2026-11-01',access:'licensed',rights:'permitted',factStatus:'unknown',originPlatform:'web',grantId:'g',purpose:'editorial',consentExpiresAt:'2027-01-01',ownerScope:'org-a'};
 const sources={read:async(org,channel,ids)=>{assert.deepEqual([org,channel,ids],['org-a','chan',['source']]);return {documents:[{sourceId:'source',sourceRevision:'sr1',permissionRevision:'pr1',text:excerpt,evidence:[evidence]}],admissions:[stamp('source','sr1')],gaps:[]};}};
 const prod=new SocialEditorialProductionV1({executeAiOperation:async(o,p,run)=>run()},{create:async()=>{saves++;return [];}},media,sources,()=>new Date('2026-11-03T12:00:00Z'));
 const input=base();input.sourceIds=['source'];const result=await prod.produce(input);assert.equal(result.status,'needs_revision');assert.equal(result.inspection.issues[0].code,'source_copy');assert.equal(saves,0);
});
test('video completion uses already generated material and actual media references without a model call',async()=>{
 const svc=service();answer={...out(),script:'Полный текст.',scenes:[{index:1,startSeconds:0,endSeconds:30,spokenText:'Полный текст.',visualIntent:'Работа'}]};const input=base();input.profile={...profile,platform:'instagram'};input.format='reel';input.brief.targetSeconds=30;const generated=await svc.produce(input);modelCalls=0;
 const video={id:'v',kind:'video',role:'final',mediaId:'movie',mimeType:'video/mp4',width:1080,height:1920,durationSeconds:30,provenance:{revision:'r',sourceIds:[]}};const captions={id:'s',kind:'subtitle',role:'captions',mediaId:'subs',mimeType:'text/vtt',provenance:{revision:'r',sourceIds:[]}};
 const final=await svc.finalizeVideo('org-a',generated.material,[video,captions]);assert.equal(final.status,'ready');assert.equal(modelCalls,0);assert.equal(final.material.assets.length,3);
});

test('source revoked during generation is rechecked before assets or result',async()=>{
 let reads=0,assets=0,checkpoints=0;const evidence={id:'ev',sourceId:'s',source:'S',capturedAt:'2026-01-01',access:'licensed',rights:'permitted',factStatus:'unknown',originPlatform:'web',grantId:'g',purpose:'editorial',consentExpiresAt:'2027-01-01',ownerScope:'org-a'};
 const src={read:async()=>++reads===1?{documents:[{sourceId:'s',sourceRevision:'r',permissionRevision:'p',text:'A source',evidence:[evidence]}],admissions:[stamp('s','r')],gaps:[]}:{documents:[],admissions:[],gaps:[{sourceId:'s',code:'revoked'}]}};
 const prod=new SocialEditorialProductionV1({executeAiOperation:async(o,p,run)=>run()},{create:async()=>{assets++;return [];}},{mediaInWorkspace:async()=>[]},src,()=>new Date('2026-11-03'));answer=out();const input=base();input.sourceIds=['s'];await assert.rejects(prod.produce(input,{onGenerated:async()=>{checkpoints++;}}),/SOURCE_CHANGED/);assert.equal(assets,0);assert.equal(checkpoints,0);
});
test('registered permitted web can use registry authority but cannot relabel Telegram',async()=>{
 const ev={id:'ev',sourceId:'s',source:'Web',sourceRevision:'snap',capturedAt:'2026-01-01',expiresAt:'2027-01-01',access:'public',rights:'permitted',factStatus:'unknown',originPlatform:'web',purpose:'editorial',permissionBasis:'registry_confirmed',rightsConfirmedAt:'2026-01-01',ownerScope:'org-a'};
 const doc=()=>({sourceId:'s',sourceRevision:'snap',permissionRevision:'r',text:'допустимый контекст',evidence:[ev]});
 const prod=new SocialEditorialProductionV1({executeAiOperation:async(o,p,run)=>run()},{create:async()=>[]},{mediaInWorkspace:async()=>[]},{read:async()=>({documents:[doc()],admissions:[stamp('s','snap')],gaps:[]})},()=>new Date('2026-11-03'));answer=out();const input=base();input.sourceIds=['s'];const ok=await prod.produce(input);assert.equal(ok.status,'ready');
 ev.originPlatform='telegram';await assert.rejects(prod.produce(input),/SOURCE_PERMISSION_REQUIRED/);
});
test('video finalization refuses source revoked while video was being produced',async()=>{
 let revoked=false;const ev={id:'ev',sourceId:'s',source:'S',capturedAt:'2026-01-01',access:'licensed',rights:'permitted',factStatus:'unknown',originPlatform:'web',grantId:'g',purpose:'editorial',consentExpiresAt:'2027-01-01',ownerScope:'org-a'};
 const src={read:async()=>revoked?{documents:[],admissions:[],gaps:[{sourceId:'s',code:'revoked'}]}:{documents:[{sourceId:'s',sourceRevision:'r',permissionRevision:'p',text:'Контекст',evidence:[ev]}],admissions:[stamp('s','r')],gaps:[]}};
 const prod=new SocialEditorialProductionV1({executeAiOperation:async(o,p,run)=>run()},{create:async()=>[{id:'cover',path:'https://example.test/cover.png'}]},{mediaInWorkspace:async(org,ids)=>ids.map(id=>({id}))},src,()=>new Date('2026-11-03'));
 answer={...out(),script:'Текст.',scenes:[{index:1,startSeconds:0,endSeconds:30,spokenText:'Текст.',visualIntent:'Сцена'}]};const input=base();input.profile={...profile,platform:'instagram'};input.format='reel';input.brief.targetSeconds=30;input.sourceIds=['s'];const generated=await prod.produce(input);assert.equal(generated.status,'needs_video');revoked=true;await assert.rejects(prod.finalizeVideo('org-a',generated.material,[{mediaId:'video'}]),/SOURCE_CHANGED/);
});
test('model output is checkpointed before rendering and restored without a paid retry',async()=>{
 answer={...out(),frames:[{title:'Первый',body:'Деталь',footer:''}]};const input=base();input.profile={...profile,platform:'instagram'};input.format='story';let checkpoint, checkpointSourceDigest, rendered=false;const media={mediaInWorkspace:async()=>[]};const svc=new SocialEditorialProductionV1({executeAiOperation:async(org,op,run)=>run()},{create:async()=>{assert.ok(checkpoint);rendered=true;return[{id:'saved',path:'https://example.test/a.png'}];}},media,{read:async()=>({documents:[],admissions:[],gaps:[]})},()=>new Date('2026-11-03'));
 modelCalls=0;const first=await svc.produce(input,{onGenerated:async (value,context)=>{checkpoint=value;assert.deepEqual(context.sourceAdmissions,[]);assert.equal(context.sourceDigest.length,64);checkpointSourceDigest=context.sourceDigest;}});assert.equal(first.status,'ready');assert.equal(modelCalls,1);assert.equal(rendered,true);
 modelCalls=0;const resumed=await svc.produce(input,{output:checkpoint,sourceDigest:checkpointSourceDigest,onGenerated:async()=>{throw Error('must not checkpoint twice');}});assert.equal(resumed.status,'ready');assert.equal(modelCalls,0);
});
test('registered manual source flows through authoritative reader and actual producer',async()=>{
 const {EditorialSourceAuthorityV1}=loadTypeScriptModule('libraries/nestjs-libraries/src/content-intelligence/social-factory/editorial/source-authority.v1.ts');
 const now=new Date('2026-11-03T12:00:00Z'), snapshot={id:'snap',organizationId:'org-a',sourceId:'source',normalizedTitle:'Owner note',retrievalProvider:'manual-v1',retentionUntil:null,purgedAt:null,supersededAt:null,providerMetadata:null,requestedCanonicalUrl:null,finalCanonicalUrl:null};
 const src={id:'source',organizationId:'org-a',kind:'MANUAL',canonicalUrl:null,displayName:'Owner note',currentSnapshotId:'snap',desiredState:'ACTIVE',rightsState:'CONFIRMED',usagePurpose:'EVIDENCE',rightsConfirmedByUserId:'owner',rightsConfirmedAt:now,freshUntil:null,configVersion:1,archivedAt:null,purgedAt:null};
 const ev={id:'e',organizationId:'org-a',sourceSnapshotId:'snap',excerpt:'Материал автора для нового поста.',observedAt:now,freshUntil:null,freshnessStatus:'NOT_MONITORED',tombstone:null,locator:null,structuredData:null};
 const authority=new EditorialSourceAuthorityV1({readSourcePermissionState:async()=>({state:'absent'})},{getDraftMaterial:async(org,id)=>{assert.equal(org,'org-a');assert.equal(id,'source');return {source:src,snapshot,evidence:[ev]};}},()=>now);
 const producer=new SocialEditorialProductionV1({executeAiOperation:async(o,p,run)=>run()},{create:async()=>[]},{mediaInWorkspace:async()=>[]},authority,()=>now);const input=base();input.sourceIds=['source'];answer=out();const result=await producer.produce(input);assert.equal(result.status,'ready');assert.equal(result.material.evidence[0].factStatus,'unknown');assert.equal(result.material.settings.sourceAdmissions[0].snapshotId,'snap');
});
test('rendered assets retain source and approved media lineage',async()=>{
 const ev={id:'e',sourceId:'s',source:'Owner note',capturedAt:'2026-01-01',access:'first_party',rights:'permitted',factStatus:'owner_asserted',originPlatform:'first_party',ownerScope:'org-a'};const src={read:async()=>({documents:[{sourceId:'s',sourceRevision:'r',permissionRevision:'p',text:'Owner background',evidence:[ev]}],admissions:[stamp('s','r')],gaps:[]})};
 const producer=new SocialEditorialProductionV1({executeAiOperation:async(o,p,run)=>run()},{create:async()=>[{id:'rendered',path:'https://example.test/a.png'}]},{mediaInWorkspace:async()=>[]},src,()=>new Date('2026-11-03'));answer={...out(),frames:[{title:'Деталь',body:'Текст',footer:''}]};const input=base();input.profile={...profile,platform:'instagram'};input.format='story';input.sourceIds=['s'];input.visuals={background:'#ffffff',foreground:'#000000',imageMediaIds:['owned-photo']};const result=await producer.produce(input);assert.deepEqual(result.material.assets[0].provenance.sourceIds,['s']);assert.deepEqual(result.material.settings.visualSourceMediaIds,['owned-photo']);
});

test('restoring a checkpoint with different source digest never calls the model',async()=>{const input=base();modelCalls=0;await assert.rejects(service().produce(input,{output:out(),sourceDigest:'wrong'}),/CHECKPOINT_SOURCE_CHANGED/);assert.equal(modelCalls,0);});
test('cold-start company context produces relevant plan and registered owner material reaches draft',async()=>{
 const {ChannelProfileServiceV1}=loadTypeScriptModule('libraries/nestjs-libraries/src/content-intelligence/social-factory/profiles/channel-profile.v1.ts',{'../social-factory.repository':{sourceRef:id=>`source:${id}`,resourceRef:(kind,id)=>`resource:${kind}:${id}`}});
 const {SocialDiscoveryService}=loadTypeScriptModule('libraries/nestjs-libraries/src/content-intelligence/social-factory/discovery/social-discovery.service.ts');
 const {EditorialSourceAuthorityV1}=loadTypeScriptModule('libraries/nestjs-libraries/src/content-intelligence/social-factory/editorial/source-authority.v1.ts');
 const company={project:{audiences:[{name:'владельцы мастерских'}],oneLineDescription:'Помогаем выбирать оборудование',contentGoals:['Обучать']},voice:{defaultLanguage:'ru'},guardrails:{prohibitedTopics:[],prohibitedClaims:[]}};
 const channels={getIntegrationById:async()=>({id:'chan',providerIdentifier:'telegram',contentLanguage:'ru',deletedAt:null,writingProfile:null})};const brands={getActiveRuntimeVersion:async()=>({profile:{id:'brand'},version:{id:'v1',content:company,contentDigest:'digest'}})};
 const channelService=new ChannelProfileServiceV1({store:{read:async()=>null},integrations:channels,brands});const resolved=await channelService.resolve('org-a','chan');assert.equal(resolved.revision,0);
 const cache={generation:async()=>'0',read:async()=>({generation:'0',result:null}),write:async()=>true};const discovery=new SocialDiscoveryService({read:async()=>[]},{search:async()=>({disabled:true,documents:[]})},cache,{claim:async()=>true},()=>new Date('2026-11-03T12:00:00Z'));
 const plan=await discovery.discover({organizationId:'org-a',profileRevision:resolved.revision,profile:resolved.profile,sources:[]});assert.ok(plan.planningPrompts.some(p=>p.angle.includes('владельцы мастерских')));
 const now=new Date('2026-11-03T12:00:00Z'),snapshot={id:'snap',organizationId:'org-a',sourceId:'s',normalizedTitle:'Заметка',retrievalProvider:'manual-v1',retentionUntil:null,purgedAt:null,supersededAt:null,providerMetadata:null,requestedCanonicalUrl:null,finalCanonicalUrl:null};
 const source={id:'s',organizationId:'org-a',kind:'MANUAL',canonicalUrl:null,displayName:'Заметка',currentSnapshotId:'snap',desiredState:'ACTIVE',rightsState:'CONFIRMED',usagePurpose:'EVIDENCE',rightsConfirmedByUserId:'owner',rightsConfirmedAt:now,freshUntil:null,configVersion:1,archivedAt:null,purgedAt:null};
 const evidence={id:'e',organizationId:'org-a',sourceSnapshotId:'snap',excerpt:'Авторский факт: мастерская ремонтирует насосы.',observedAt:now,freshUntil:null,freshnessStatus:'NOT_MONITORED',tombstone:null,locator:null,structuredData:null};
 const authority=new EditorialSourceAuthorityV1({readSourcePermissionState:async()=>({state:'absent'})},{getDraftMaterial:async()=>({source,snapshot,evidence:[evidence]})},()=>now);
 const producer=new SocialEditorialProductionV1({executeAiOperation:async(o,p,run)=>run()},{create:async()=>[]},{mediaInWorkspace:async()=>[]},authority,()=>now);answer=out();const result=await producer.produce({...base(),profile:resolved.profile,sourceIds:['s']});assert.equal(result.status,'ready');assert.match(lastPrompt,/мастерская ремонтирует насосы/);assert.equal(result.material.settings.sourceAdmissions[0].sourceId,'s');assert.equal(result.material.evidence[0].factStatus,'unknown');
});
test('incomplete structured answer is checkpointed once and restored without another model call',async()=>{
 answer={...out(),body:''};modelCalls=0;let checkpoint,sourceDigest,checkpoints=0,assets=0;
 const svc=new SocialEditorialProductionV1({executeAiOperation:async(org,operation,run)=>run()},{create:async()=>{assets++;return [];}},{mediaInWorkspace:async()=>[]},{read:async()=>({documents:[],admissions:[],gaps:[]})},()=>new Date('2026-11-03'));
 await assert.rejects(svc.produce(base(),{onGenerated:async(output,context)=>{checkpoints++;checkpoint=output;sourceDigest=context.sourceDigest;}}),/EDITORIAL_MODEL_INCOMPLETE/);
 assert.equal(modelCalls,1);assert.equal(checkpoints,1);assert.equal(checkpoint.body,'');assert.equal(assets,0);
 modelCalls=0;await assert.rejects(svc.produce(base(),{output:checkpoint,sourceDigest,onGenerated:async()=>{checkpoints++;}}),/EDITORIAL_MODEL_INCOMPLETE/);
 assert.equal(modelCalls,0);assert.equal(checkpoints,1);assert.equal(assets,0);
});
test('Story empty hook uses valid frame copy without a second model call or a changed raw checkpoint',async()=>{
 const input=base();input.profile={...profile,platform:'instagram'};input.format='story';
 answer={...out(),hook:'',frames:[{title:'Как начать?',body:'Выберите одну небольшую задачу.',footer:'Какой шаг вы выберете?'}]};let raw,digest;modelCalls=0;
 const first=await service().produce(input,{onGenerated:async(output,context)=>{raw=structuredClone(output);digest=context.sourceDigest;}});
 assert.equal(first.status,'ready');assert.deepEqual(first.material.settings.visualCopyRepair.replacedFields,['hook']);assert.equal(first.material.hook,answer.frames[0].title);assert.equal(raw.hook,'');assert.equal(modelCalls,1);assert.match(lastPrompt,/application creates and stores the actual images/i);assert.doesNotMatch(lastPrompt,/Deliver actual rendered assets for visual formats/);
 modelCalls=0;const restored=await service().produce(input,{output:raw,sourceDigest:digest});assert.equal(modelCalls,0);assert.equal(restored.material.hook,answer.frames[0].title);assert.equal(raw.hook,'');
});

test('Story recovers public copy from frame instead of SVG and technical status and requests review',async()=>{
 const input=base();input.profile={...profile,platform:'instagram'};input.format='story';
 answer={...out(),body:'<svg xmlns="http://www.w3.org/2000/svg"><text>Служебный код</text></svg>',caption:'Метаданные группы не предоставлены. В поле body — самостоятельный SVG-файл; его предпросмотр не проверен.',frames:[{title:'Небольшой шаг',body:'Выделите время для одного действия.',footer:'С чего начнёте?'}]};let raw,digest;
 const initial=await service().produce(input,{onGenerated:async(output,context)=>{raw=structuredClone(output);digest=context.sourceDigest;}});
 assert.equal(initial.status,'ready');assert.deepEqual(initial.material.settings.visualCopyRepair.replacedFields,['body','caption']);assert.match(initial.inspection.reviewRequired.join(' '),/Review public copy/);assert.equal(initial.material.body,'Небольшой шаг\nВыделите время для одного действия.\nС чего начнёте?');assert.equal(initial.material.caption,initial.material.body);assert.equal(initial.material.assets.length,1);assert.match(raw.body,/^<svg/);assert.match(raw.caption,/предпросмотр/);
 modelCalls=0;const restored=await service().produce(input,{output:raw,sourceDigest:digest});assert.equal(modelCalls,0);assert.equal(restored.status,'ready');assert.deepEqual(restored.material.settings.visualCopyRepair.replacedFields,['body','caption']);assert.equal(restored.material.body,initial.material.body);assert.equal(restored.material.caption,initial.material.caption);
});

test('technical status body and empty hook recover from valid Story frame without claiming quality acceptance',async()=>{
 const input=base();input.profile={...profile,platform:'instagram'};input.format='story';answer={...out(),hook:'',body:'Визуальный файл не создан: в этом формате недоступен рендеринг.',frames:[{title:'План на неделю',body:'Выберите один посильный шаг.',footer:''}]};
 const result=await service().produce(input);assert.equal(result.status,'ready');assert.deepEqual(result.material.settings.visualCopyRepair.replacedFields,['hook','body']);assert.equal(result.material.hook,'План на неделю');assert.equal(result.material.body,'План на неделю\nВыберите один посильный шаг.');assert.equal(result.material.assets.length,1);
});

test('technical markup inside a visual frame never becomes public copy or an asset',async()=>{
 const input=base();input.profile={...profile,platform:'instagram'};input.format='story';answer={...out(),body:'<svg><text>unsafe</text></svg>',caption:'Предпросмотр не проверен.',frames:[{title:'<svg>code</svg>',body:'',footer:''}]};
 const result=await service().produce(input);assert.equal(result.status,'needs_revision');assert.equal(result.material.assets.length,0);assert.doesNotMatch(result.material.body,/<svg|предпросмотр/i);assert.doesNotMatch(result.material.caption,/<svg|предпросмотр/i);
});
test('restoring a corrected Story reuses matching owned PNG without model or renderer calls',async()=>{
 const input=base();input.profile={...profile,platform:'instagram'};input.format='story';answer={...out(),body:'<svg><text>служебный код</text></svg>',caption:'Метаданные не предоставлены; предпросмотр не проверен.',frames:[{title:'Один шаг',body:'Выберите удобное действие.',footer:''}]};
 let saved,digest,renderCalls=0,mediaCalls=0;const svc=new SocialEditorialProductionV1({executeAiOperation:async(o,p,run)=>run()},{create:async()=>{renderCalls++;return [{id:'owned-image',path:'https://example.test/owned.png'}];}},{mediaInWorkspace:async(org,ids)=>{mediaCalls++;assert.equal(org,'org-a');return ids.map(id=>({id,path:'https://example.test/owned.png'}));}},{read:async()=>({documents:[],admissions:[],gaps:[]})},()=>new Date('2026-11-03'));
 const first=await svc.produce(input,{onGenerated:async(output,context)=>{saved=structuredClone(output);digest=context.sourceDigest;}});assert.equal(first.status,'ready');assert.equal(renderCalls,1);
 const oldMaterial=structuredClone(first.material);oldMaterial.body=saved.body;oldMaterial.caption=saved.caption;
 modelCalls=0;const repaired=await svc.produce(input,{output:saved,sourceDigest:digest,retainedMaterial:oldMaterial});assert.equal(modelCalls,0);assert.equal(renderCalls,1);assert.equal(mediaCalls,1);assert.equal(repaired.status,'ready');assert.deepEqual(repaired.material.settings.visualCopyRepair.replacedFields,['body','caption']);assert.equal(repaired.material.assets[0].mediaId,'owned-image');assert.equal(repaired.material.body,'Один шаг\nВыберите удобное действие.');assert.doesNotMatch(repaired.material.caption,/<svg|метадан|предпросмотр/i);
 const altered=structuredClone(saved);altered.frames[0].body='Новая фраза';await assert.rejects(svc.produce(input,{output:altered,sourceDigest:digest,retainedMaterial:first.material}),/EDITORIAL_RETAINED_FRAME_MISMATCH/);assert.equal(modelCalls,0);assert.equal(renderCalls,1);
});

test('restored Story rejects a retained image outside the organization',async()=>{
 const input=base();input.profile={...profile,platform:'instagram'};input.format='story';answer={...out(),frames:[{title:'Шаг',body:'Текст',footer:''}]};let raw,digest;const original=await service().produce(input,{onGenerated:async(output,context)=>{raw=output;digest=context.sourceDigest;}});
 let created=0;const svc=new SocialEditorialProductionV1({executeAiOperation:async()=>{throw Error('unexpected model');}},{create:async()=>{created++;return [];}},{mediaInWorkspace:async()=>[]},{read:async()=>({documents:[],admissions:[],gaps:[]})},()=>new Date('2026-11-03'));
 await assert.rejects(svc.produce(input,{output:raw,sourceDigest:digest,retainedMaterial:original.material}),/EDITORIAL_RETAINED_ASSET_UNAVAILABLE/);assert.equal(created,0);
});
test('carousel reinspection rejects changed order or image source instead of reusing the wrong PNG',async()=>{
 const input=base();input.profile={...profile,platform:'instagram'};input.format='carousel';input.brief.slideCount=2;
 answer={...out(),frames:[{title:'Первый',body:'Один',footer:''},{title:'Второй',body:'Два',footer:''}]};let raw,digest;const svc=service();const original=await svc.produce(input,{onGenerated:async(output,context)=>{raw=structuredClone(output);digest=context.sourceDigest;}});
 const reordered=structuredClone(original.material);reordered.slides.reverse();await assert.rejects(svc.produce(input,{output:raw,sourceDigest:digest,retainedMaterial:reordered}),/EDITORIAL_RETAINED_FRAME_MISMATCH/);
 const alteredInput=structuredClone(input);alteredInput.visuals={background:'#ffffff',foreground:'#111111',imageMediaIds:['a','b']};await assert.rejects(svc.produce(alteredInput,{output:raw,sourceDigest:digest,retainedMaterial:original.material}),/EDITORIAL_RETAINED_FRAME_MISMATCH/);
});

test('video captions reject production instructions and timed transcripts while keeping the original narration',async()=>{
 const cases=[
  {platform:'youtube',format:'long_video',caption:'Caption transcript: use the complete narration in script. Scene-level timing is supplied in scenes; readable, audio-synchronized caption cues still need to be created and checked against the final recording.',body:'The exercise is based on source 11111111-2222-4333-8444-555555555555; its evidence status is unknown.',hook:'Follow a fictional handoff and practice writing your own.',cta:'Try the exercise and share what you learned.'},
  {platform:'instagram',format:'reel',caption:'0:00–0:08 Начнём с одного шага.\n0:08–0:17 Запишем учебную задачу.',body:'Видео пока не создано; источник 11111111-2222-4333-8444-555555555555.',hook:'Покажем вымышленный учебный пример.',cta:'Попробуйте записать свой следующий шаг.'},
 ];
 for(const item of cases){
  const input=base();input.profile={...profile,platform:item.platform};input.format=item.format;input.brief.targetSeconds=30;
  answer={...out(),...item,ctaSurface:'description',script:'Original narration.',scenes:[{index:1,startSeconds:0,endSeconds:30,spokenText:'Original narration.',visualIntent:'Illustration'}]};let raw;
  const result=await service().produce(input,{onGenerated:async value=>{raw=structuredClone(value);}});
  assert.equal(result.status,'needs_video');assert.equal(result.material.caption,`${item.hook}\n\n${item.cta}`);assert.deepEqual(result.material.settings.videoCaptionRepair.sourceFields,['hook','cta']);assert.equal(result.material.settings.videoCaptionRepair.reviewRequired,true);assert.equal(result.material.script,'Original narration.');assert.equal(result.material.scenes[0].spokenText,'Original narration.');assert.equal(raw.caption,item.caption);assert.equal(result.material.assets.length,1);assert.match(lastPrompt,/audience-facing post caption/);
 }
});
test('video caption recovery preserves genuine quoted text and requests revision without a safe fallback',async()=>{
 const input=base();input.profile={...profile,platform:'youtube'};input.format='short';input.brief.targetSeconds=30;
 const quote='“Caption transcript: this is a quote from the story.”';answer={...out(),caption:quote,script:'Speech.',scenes:[{index:1,startSeconds:0,endSeconds:30,spokenText:'Speech.',visualIntent:'Scene'}]};
 const quoted=await service().produce(input);assert.equal(quoted.material.caption,quote);assert.equal(quoted.material.settings.videoCaptionRepair,undefined);
 answer={...answer,caption:'Caption transcript: use the complete narration in script.',hook:'Scene-level timing is not verified.',body:'No composed video is available.',cta:'',ctaSurface:'none'};
 const blocked=await service().produce(input);assert.equal(blocked.status,'needs_revision');assert.equal(blocked.material.caption,'');assert.equal(blocked.material.assets.length,0);assert.equal(blocked.inspection.issues[0].code,'invalid_video_caption');
});
test('video checkpoint recovery reuses the owned matching cover without rerendering or a model call',async()=>{
 for(const [platform,format] of [['instagram','reel'],['youtube','short'],['youtube','long_video']]){
  const input=base();input.profile={...profile,platform};input.format=format;input.brief.targetSeconds=30;
  answer={...out(),caption:'Caption transcript: use the complete narration in script.',script:'Original narration.',scenes:[{index:1,startSeconds:0,endSeconds:30,spokenText:'Original narration.',visualIntent:'Illustration'}]};
  let raw,digest,renderCalls=0;const svc=new SocialEditorialProductionV1({executeAiOperation:async(o,p,run)=>run()},{create:async()=>{renderCalls++;return[{id:'cover-id',path:'https://example.test/cover.png'}];}},{mediaInWorkspace:async(org,ids)=>org==='org-a'?ids.map(id=>({id,path:'https://example.test/cover.png'})):[]},{read:async()=>({documents:[],admissions:[],gaps:[]})},()=>new Date('2026-11-03'));
  const first=await svc.produce(input,{onGenerated:async(output,ctx)=>{raw=structuredClone(output);digest=ctx.sourceDigest;}});const before=structuredClone(raw);modelCalls=0;
  const restored=await svc.produce(input,{output:raw,sourceDigest:digest,retainedMaterial:first.material});assert.equal(restored.status,'needs_video');assert.equal(renderCalls,1);assert.equal(modelCalls,0);assert.deepEqual(raw,before);assert.deepEqual(restored.material.assets,first.material.assets);assert.equal(restored.material.script,first.material.script);assert.deepEqual(restored.material.scenes,first.material.scenes);
  const altered=structuredClone(raw);altered.scenes[0].spokenText='Changed speech';await assert.rejects(svc.produce(input,{output:altered,sourceDigest:digest,retainedMaterial:first.material}),/EDITORIAL_RETAINED_FRAME_MISMATCH/);
  for(const mutate of [m=>{m.format='carousel';},m=>{m.assets[0].role='slide';},m=>{m.assets[0].provenance.sourceIds=['foreign-source'];},m=>{m.script='Changed script';}]){
   const bad=structuredClone(first.material);mutate(bad);await assert.rejects(svc.produce(input,{output:raw,sourceDigest:digest,retainedMaterial:bad}),/EDITORIAL_RETAINED_FRAME_MISMATCH/);
  }assert.equal(renderCalls,1);
  const foreign=new SocialEditorialProductionV1({executeAiOperation:async()=>{throw Error('model called');}},{create:async()=>{throw Error('render called');}},{mediaInWorkspace:async()=>[]},{read:async()=>({documents:[],admissions:[],gaps:[]})},()=>new Date('2026-11-03'));
  await assert.rejects(foreign.produce(input,{output:raw,sourceDigest:digest,retainedMaterial:first.material}),/EDITORIAL_RETAINED_ASSET_UNAVAILABLE/);
 }
});

test('exact resolved adaptation text is structured source context and never relabeled verified source evidence',async()=>{
 const input=base(),text='Selected post: NINE minutes. Core still says SEVEN.';
 input.sourceArtifact={ref:{version:1,kind:'adaptation',pieceId:'piece',adaptationId:'variant',revision:'a'.repeat(64)},actorId:input.actorId,organizationId:input.organizationId,title:'Selected post',text,locale:'ru',contentDigest:require('node:crypto').createHash('sha256').update(text).digest('hex')};
 const svc=service();let reads=0;svc.sourceArtifacts={assertCurrent:async(org,actor,source)=>{assert.equal(org,input.organizationId);assert.equal(actor,input.actorId);assert.equal(source.text,text);reads++;return source;}};
 answer=out();const produced=await svc.produce(input);assert.equal(produced.status,'ready');assert.ok(lastPrompt.includes(text));assert.deepEqual(produced.material.sourceArtifact,input.sourceArtifact.ref);assert.deepEqual(produced.material.evidence,[]);assert.ok(reads>=2);
});

test('known paid raw output is checkpointed before changed selected source refuses artwork',async()=>{
 const input=base(),text='Exact saved selected post.';input.sourceArtifact={ref:{version:1,kind:'piece',pieceId:'piece',revision:'a'.repeat(64)},actorId:input.actorId,organizationId:input.organizationId,title:'Selected post',text,locale:'ru',contentDigest:require('node:crypto').createHash('sha256').update(text).digest('hex')};
 const svc=service();let current=true,raw;svc.sourceArtifacts={assertCurrent:async()=>{if(!current)throw Error('SOURCE_ARTIFACT_STALE');}};
 answer=out();modelCalls=0;await assert.rejects(svc.produce(input,{onGenerated:async output=>{raw=structuredClone(output);current=false;}}),/SOURCE_ARTIFACT_STALE/);assert.equal(modelCalls,1);assert.equal(raw.title,answer.title);
});


test('Instagram text post is an explicit nonpublishable native draft and never fabricated finished media',async()=>{
 const input=base();input.profile={...profile,platform:'instagram'};input.destination={kind:'draft',id:profile.channelId,publishable:false};answer=out();modelCalls=0;
 const result=await service().produce(input);assert.equal(result.status,'ready');assert.deepEqual(result.material.destination,input.destination);assert.equal(result.material.assets.length,0);assert.equal(modelCalls,1);
 const real=base();real.profile={...profile,platform:'instagram'};modelCalls=0;await assert.rejects(service().produce(real),/Unsupported editorial format/);assert.equal(modelCalls,0);
});


test('silent producer contract keeps authored screen text separate from optional speech',async()=>{
 const input=base();input.profile={...profile,platform:'instagram'};input.format='reel';input.brief.targetSeconds=4;input.brief.audioMode='silent';
 answer={...out(),script:'Покажите задачу. Контрольная отметка: ДЕВЯТЬ минут',scenes:[{index:1,startSeconds:0,endSeconds:2,screenText:'Покажите задачу',visualIntent:'Однотонный фон'},{index:2,startSeconds:2,endSeconds:4,spokenText:'',screenText:'Контрольная отметка: ДЕВЯТЬ минут',visualIntent:'Крупный читаемый текст'}]};
 const result=await service().produce(input);assert.equal(result.status,'needs_video');assert.equal(result.material.settings.audioMode,'silent');assert.deepEqual(result.material.scenes.map(scene=>scene.screenText),answer.scenes.map(scene=>scene.screenText));assert.ok(result.material.scenes.every(scene=>scene.spokenText===''));assert.match(lastPrompt,/screenText/);assert.match(lastPrompt,/no voice/);
});

test('primary pre-dispatch hook runs inside the bound admission and refusal constructs no model',async()=>{
 modelCalls=0;let admitted=false,hookCalls=0;
 const svc=new SocialEditorialProductionV1({executeAiOperation:async(_org,_op,run)=>{admitted=true;try{return await run()}finally{admitted=false;}}},{create:async()=>[]},{mediaInWorkspace:async()=>[]},{read:async()=>({documents:[],admissions:[],gaps:[]})},()=>new Date('2026-11-03'));
 await assert.rejects(svc.produce(base(),{onBeforePrimary:async()=>{hookCalls++;assert.equal(admitted,true);throw Object.assign(new Error('unpriced capped route'),{code:'AUTONOMY_COST_ESTIMATE_UNAVAILABLE'});}}),error=>error.code==='AUTONOMY_COST_ESTIMATE_UNAVAILABLE');
 assert.equal(hookCalls,1);assert.equal(modelCalls,0);
});
