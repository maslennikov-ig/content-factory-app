const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const root = 'libraries/nestjs-libraries/src/content-intelligence/social-factory/';
class DomainError extends Error { constructor(code, message = code) { super(message); this.code = code; } }
let configured = true, advancedConfigured = true, actualConfigRead, activeConfig;
const repositoryMock = { SocialFactoryRepository: class {}, SocialFactoryError: DomainError, sourceRef: id => `source:${id}`, resourceRef: (kind, id) => `resource:${kind}:${id}` };
const mocks = {
 './source-artifact.service':{SourceArtifactServiceV1:class{}},
 './editorial/local-reel.service':{CampaignLocalReelServiceV1:class{}},
 './social-factory.repository': repositoryMock, '../social-factory.repository': repositoryMock,
 './autonomy/editorial-decision.service': { EditorialDecisionService: class {} },
 './profiles/channel-profile.v1': { ChannelProfileServiceV1: class {} },
 './editorial/social-editorial-production.v1': { SocialEditorialProductionV1: class {} },
 './editorial/native-material.service': { NativeEditorialMaterialService: class {} },
 './learning/learning.service': { SocialFactoryLearningService: class {} },
 './publishing/publishing.service': { SocialFactoryPublishingService: class {} },
 './planning.service': { SocialFactoryPlanningService: class {} },
 '../../videos/production/video-production.service': { VideoProductionService: class {} },
 '../../database/prisma/video-generation/video-generation.repository': { VideoGenerationRepository: class {} },
 '../../openai/ai.provider.config': { getActiveAiConfig: () => activeConfig, loadAiConfig: async (...args) => { if (actualConfigRead) return actualConfigRead(...args); if (!configured) throw new DomainError('AI_PROVIDER_NOT_CONFIGURED'); return { provider: 'fixture', apiKey: 'synthetic-configured-key', modelRouting: advancedConfigured ? { advancedModel: 'fixture-advanced' } : {} }; } },
};
const { SocialFactoryProductionService } = loadTypeScriptModule(root + 'production.service.ts', mocks);
const { CampaignService } = loadTypeScriptModule(root + 'campaign/campaign.service.ts', mocks);
const { AutonomyService } = loadTypeScriptModule(root + 'autonomy/autonomy.service.ts', mocks);
const { SocialFactoryMaterialEditService } = loadTypeScriptModule(root + 'material-edit.service.ts', {
 ...mocks, './production.service': { SocialFactoryProductionService }, '../pieces/piece.service': { PieceService: class {} },
});
class Store {
 constructor(parent) { this.parent = parent; this.rows = parent ? parent.rows : new Map(); this.tail = Promise.resolve(); }
 key(org, kind, id) { return `${org}:${kind}:${id}`; }
 async transact(work) {
  if (this.parent) return work(this);
  const previous = this.tail; let release; this.tail = new Promise(resolve => { release = resolve; }); await previous;
  const scoped = new Store(this); scoped.rows = structuredClone(this.rows);
  try { const result = await work(scoped); this.rows = scoped.rows; return result; } finally { release(); }
 }
 async read(org, kind, id) { return structuredClone(this.rows.get(this.key(org, kind, id)) || null); }
 async list(org, kind, limit, parentId) { return structuredClone([...this.rows.values()].filter(row => row.organizationId === org && row.kind === kind && (parentId === undefined || row.parentId === parentId))); }
 async put(input) {
  const key = this.key(input.organizationId, input.kind, input.id), before = this.rows.get(key);
  if ((before?.revision || 0) !== input.expectedRevision) throw new DomainError('SOCIAL_FACTORY_CONFLICT');
  if (before && ['action', 'decision'].includes(input.kind)) throw new DomainError('SOCIAL_FACTORY_IMMUTABLE');
  const row = { ...structuredClone(input), parentId: input.parentId ?? before?.parentId ?? null, sourceIds: input.sourceIds ?? before?.sourceIds ?? [], revision: input.expectedRevision + 1 };
  this.rows.set(key, row); return structuredClone(row);
 }
 async assertArtifactSource(org,actor,ref){return (this.parent??this).sourceCheck(org,actor,ref);}
 async assertSourceAdmissions(_org, admissions) { if (admissions.some(stamp => stamp.revoked)) throw new DomainError('SOCIAL_FACTORY_SOURCE_CHANGED'); }
}
const wait = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
async function fixture({ draft = false, sourceBound = false, count = 1, platform = 'threads', format, autopilot = false, grantFields = {} } = {}) {
 format??=platform==='telegram'?'post':'thread';
 configured = true; advancedConfigured = true; actualConfigRead = undefined; activeConfig = undefined;
 const store = new Store(), campaigns = new CampaignService(store), autonomy = new AutonomyService(store);
 if(draft)await store.put({organizationId:'org',kind:'draft_destination',id:'channel',expectedRevision:0,payload:{version:1,id:'channel',kind:'draft',publishable:false,actorId:'owner',platform,name:'Local draft',locale:'en',requestDigest:'fixture'}});
 let grant;
 if (autopilot) grant = await autonomy.grant('org', { authority: 'user', actorId: 'owner', requestId: 'grant', channelIds: ['channel'], actions: ['prepare', 'editorial_decide', 'publish', 'schedule'], mode: 'autopilot', expiresAt: '2099-01-01T00:00:00Z', platformConsentIds: [], ...grantFields });
 const campaign = await campaigns.create('org', { actorId: 'owner', requestId: 'campaign', name: 'Campaign', timeZone: 'Europe/Moscow', startsAt: '2030-01-01', endsAt: '2030-01-14',
  allocations: [{ channelId: 'channel', platform, format, count,...(draft?{destination:{kind:'draft',id:'channel',publishable:false}}:{}) }], ...(autopilot ? { mode: 'autopilot', grantId: grant.id } : {}) });
 const currentSource={value:{ref:{version:1,kind:'adaptation',pieceId:'source-piece',adaptationId:'source-adaptation',revision:'a'.repeat(64)},organizationId:'org',actorId:'owner',title:'Exact selected post',text:'Edited post says NINE minutes; core still says SEVEN.',locale:'ru',contentDigest:'b'.repeat(64)}};
 const sourceCheck=async(org,actor,ref)=>{if(org!=='org'||actor!=='owner')throw new DomainError('SOURCE_ARTIFACT_ACCESS_DENIED');if(ref.revision!==currentSource.value.ref.revision)throw new DomainError('SOURCE_ARTIFACT_STALE');return structuredClone(currentSource.value);};
 store.sourceCheck=sourceCheck;
 const sourceArtifacts={resolve:sourceCheck,assertCurrent:(org,actor,source)=>sourceCheck(org,actor,source.ref)};
 const calls = { model: 0, producer: 0, artwork: 0, discover: 0, native: [], publish: [], decisions: 0, requests: [] };
 const context = { profile: { version: 1, channelId: 'channel', platform, audience: 'Workshop owners', promise: 'Explain practical decisions', goals: ['help choose'], expertise: ['tools'], pillars: ['planning', 'maintenance'], languages: ['en'], geography: [], exclusions: [], evidence: [], openQuestions: [] }, revision: 1, brandVersionDigest: 'brand-v1', findings: [] };
 const profiles = { resolve: async () => structuredClone(context) }, learning = { forPlanning: async () => ({ findings: structuredClone(context.findings), findingIds: context.findings.map(f => f.id) }) };
 const planning = { unpricedPreparationProviders: async (_org, _channel, options) => options.allowWebSearch ? ['fixture', 'tavily'] : [], discover: async (_org, _channel, options, beforePaid) => { await beforePaid?.(()=>planning.unpricedPreparationProviders(_org,_channel,options)); calls.discover++; calls.discoveryOptions = options; return { id: 'research', profile: structuredClone(context.profile), profileRevision: context.revision, findings: structuredClone(context.findings), candidates: [], planningPrompts: [{ pillar: 'Planning', angle: 'Use one practical decision' }, { pillar: 'Maintenance', angle: 'Explain one common mistake' }] }; } };
 const editorial = {
  produce: async (request, checkpoint) => {
   calls.producer++; calls.requests.push(structuredClone(request));
   if (editorial.beforeModel) await editorial.beforeModel(request, checkpoint);
   let output = checkpoint.output;
   if (output === undefined) { await checkpoint.onBeforePrimary?.(); calls.model++; if (editorial.model) await editorial.model(request); output = editorial.output ?? { title: request.candidate.title, body: 'An exact useful explanation', hook: 'One step' }; await checkpoint.onGenerated(output, { sourceAdmissions: [], sourceDigest: require('node:crypto').createHash('sha256').update(JSON.stringify([[], []])).digest('hex') }); }
   if (!checkpoint.retainedMaterial?.assets.length) { calls.artwork++; if (editorial.artwork) await editorial.artwork(request, output); }
   const material = { version: 1, ...(request.sourceArtifact?{sourceArtifact:request.sourceArtifact.ref}:{}), ...(request.destination?{destination:request.destination}:{}), channelId: 'channel', platform, format, title: output.title, hook: output.hook, body: output.body,
    caption: 'Caption', script: 'First spoken line.\n\nSecond spoken line.', scenes: [{ index: 1, startSeconds: 0, endSeconds: 30, spokenText: 'First spoken line.', visualIntent: 'First' }, { index: 2, startSeconds: 30, endSeconds: 60, spokenText: 'Second spoken line.', visualIntent: 'Second' }],
    assets: structuredClone(checkpoint.retainedMaterial?.assets ?? editorial.assets ?? []), ...(checkpoint.retainedMaterial?.slides || editorial.slides ? { slides: structuredClone(checkpoint.retainedMaterial?.slides ?? editorial.slides) } : {}), evidence: [], settings: {}, playbook: { version: '1', sourceDate: '2026-11-03' } };
   return { status: ['reel', 'short', 'long_video'].includes(format) ? 'needs_video' : 'ready', material, inspection: { complete: true, issues: [] } };
  },
  finalizeVideo: async (_org, material, assets) => ({ status: editorial.finalStatus || 'ready', material: { ...material, assets: [...material.assets, ...assets] }, inspection: { complete: editorial.finalStatus !== 'needs_revision', issues: editorial.finalStatus === 'needs_revision' ? [{ code: 'captions_missing' }] : [] } }),
 };
 const native = { save: async (org, _actor, input) => { calls.native.push(structuredClone(input));
  const current = (await campaigns.get(org, campaign.id)).items.find(item => item.id === input.itemId);
  expect(current.state).not.toBe('submitting');
  return { ...input.material, pieceId: `piece-${calls.native.length}`, derivationId: `draft-${calls.native.length}` }; } };
 const decisions = { answer: async (_org, _actor, input) => { calls.decisions++; if (decisions.run) await decisions.run();
  return autonomy.decide('org', { ...input, actorId: 'owner', authority: 'agent', kind: 'editorial', answer: 'Use a maintenance decision checklist, with about 900 characters and a practical closing question.', factStatus: 'inferred', evidence: [], missingFacts: [] }); } };
 decisions.answerQuestions=async(org,actor,input)=>{const decision=await decisions.answer(org,actor,{...input,question:input.questions.map(q=>q.question).join(' ')});return {decisions:input.questions.map(q=>({questionId:q.id,type:q.type,decision})),missingFacts:[],complete:true};};
 const publishing = { deliver: async (_org, input) => { calls.publish.push(input); return { state: 'scheduled' }; } };
 const video = { current: null, createRevision: async (_org, _actor, input) => { video.manifest = input.manifest; return video.current; }, get: async () => video.current };
 const videoRecords = { piece: async (_org, id) => ({ id, title: 'Title', body: 'Body', brief: {}, language: 'en', updatedAt: new Date('2026-11-03T00:00:00Z') }), job: async () => video.job };
 const localReels={produce:async(org,source,material,images,checkpoint,onCheckpoint,assertCurrent)=>{await assertCurrent();const next={...checkpoint,rendered:{renderKey:'render-1'},asset:{id:'movie',mediaId:'movie',kind:'video',role:'final',mimeType:'video/mp4',width:1080,height:1920,durationSeconds:60,provenance:{revision:source.ref.revision,sourceIds:[]}}};await onCheckpoint(next);calls.localRender=(calls.localRender??0)+1;await assertCurrent();return {...material,assets:[...material.assets,next.asset]};}};
 const make = (localCompositions,localExecution) => new SocialFactoryProductionService(store, campaigns, autonomy, decisions, profiles, editorial, native, learning, publishing, video, videoRecords, planning, sourceBound?sourceArtifacts:undefined, localReels,localCompositions,localExecution);
 const service = make(), input = { campaignId: campaign.id, requestId: 'prepare', ...(autopilot?{editorialReview:'complex'}:{}), ...(sourceBound?{sourceArtifact:currentSource.value.ref}:{}), instruction: 'Explain safe workshop maintenance choices to a new owner.', ...(format === 'reel' ? { targetSeconds: 60 } : {}) };
 return { store, campaigns, autonomy, campaign, grant, calls, context, planning, editorial, native, video, videoRecords, decisions, input, service, make, currentSource, sourceArtifacts, localReels };
}
const operations = f => [...f.store.rows.values()].filter(row => row.kind === 'editorial' && row.payload.version === 2);
const captionEditor = f => new SocialFactoryMaterialEditService(f.campaigns, f.native, {}, f.service);
const coverAsset = () => ({ id: 'owned-cover-asset', mediaId: 'owned-cover', kind: 'image', role: 'cover', mimeType: 'image/png', width: 1080, height: 1920, url: '/owned-cover.png', provenance: { revision: 'cover-revision', sourceIds: [] } });

test('local final uses the real native apply transaction, is free under a zero preparation cap and never autopublishes',async()=>{
 const f=await fixture({sourceBound:true,autopilot:true,platform:'instagram',format:'reel'});f.editorial.assets=[coverAsset()];
 const prepared=await f.service.prepare('org','owner',f.input),operationId=prepared.items[0].operationId,op=(await f.store.read('org','editorial',operationId)).payload;
 const bound=await f.store.read('org','editorial',operationId);op.productionId='immutable-provider-revision';await f.store.put({...bound,expectedRevision:bound.revision,payload:op});
 f.video.current={id:op.productionId,funding:{kind:'personal_subscription',connections:{higgsfield:'saved-wallet'}},jobs:[{id:'existing-source-job',state:'completed'}]};const providerHistory=structuredClone(f.video.current);
 f.video.localSourceEvidenceV2=async(_org,actor,id,pieceId)=>{expect(actor).toBe('owner');expect(id).toBe(op.productionId);expect(pieceId).toBe(op.material.pieceId);return {captions:{}};};
 const grant=await f.store.read('org','grant',f.grant.id);await f.store.put({...grant,expectedRevision:grant.revision,payload:{...grant.payload,budget:{currency:'USD',maximum:0}}});
 let renders=0,dispatches=0;const beforeModel=f.calls.model,beforeNative=f.calls.native.length,history=structuredClone(op.productionId);
 const producer={produce:async(_org,_source,material,_manifest,checkpoint,onCheckpoint,options)=>{renders++;await options.assertCurrent();const asset={id:'owned-final',mediaId:'owned-final',kind:'video',mimeType:'video/mp4',role:'final',url:'/uploads/owned-final.mp4',width:1080,height:1920,durationSeconds:60,provenance:{provider:'local-composition.v2',revision:'saved',sourceIds:[]}};await onCheckpoint({...checkpoint,asset,rendered:{renderKey:'c'.repeat(64)}});return {...material,assets:[...material.assets,asset]};}};
 const service=f.make(producer,{start:async()=>{dispatches++;}}),source=op.baseInput.sourceArtifact;
 const input={operationId,requestId:'local-final',expectedContentRevision:op.appliedContentRevision,manifest:{version:3,kind:'local_owned_composition',sourceProductionRevisionId:op.productionId,source:{pieceId:source.ref.pieceId,adaptationId:source.ref.adaptationId,revision:source.ref.revision,textSha256:source.contentDigest},title:'Saved final',locale:'ru',funding:{kind:'local_compute',scope:'final_only'},settings:{width:1080,height:1920,fps:30,fit:'contain_pad',transition:'hard_cut',captions:'none'},scenes:[{id:'owned-scene',mediaId:'owned-clip',durationSeconds:60,sourceAudio:'silent'}]}};
 const queued=await service.composeLocalVideoV2('org','owner',input);expect(queued.state).toBe('queued');expect(dispatches).toBe(1);
 expect((await service.runLocalVideoCompositionV2('org',operationId,queued.id)).state).toBe('completed');
 const replay=await service.composeLocalVideoV2('org','owner',input);expect(replay.state).toBe('completed');expect(replay.resultMediaId).toBe('owned-final');
 expect(renders).toBe(1);expect(f.calls.model).toBe(beforeModel);expect(f.calls.native).toHaveLength(beforeNative+1);expect(f.calls.publish).toHaveLength(0);
 const final=(await f.store.read('org','editorial',operationId)).payload;expect(final.productionId).toBe(history);expect(final.state).toBe('ready');expect(final.material.assets.map(a=>a.mediaId)).toEqual(['owned-cover','owned-final']);
 expect((await f.store.read('org','editorial',queued.id)).payload.state).toBe('completed');expect(final.owner).toBeUndefined();
 expect(f.video.current).toEqual(providerHistory);
});

test('known needs_video reinspection retains its cover and continuation without a new model or artwork', async () => {
 const f=await fixture({count:2,platform:'instagram',format:'reel'});f.editorial.assets=[coverAsset()];
 const prepared=await f.service.prepare('org','owner',f.input),opId=prepared.items[0].operationId;
 const before=await f.campaigns.get('org',f.campaign.id),item=before.items.find(row=>row.id===prepared.items[0].itemId),sibling=before.items.find(row=>row.id!==item.id);
 const original=operations(f).find(row=>row.id===opId).payload,models=f.calls.model,artwork=f.calls.artwork;
 const result=await f.service.reinspect('org','owner',opId,{expectedContentRevision:item.contentRevision});
 expect(result.state).toBe('needs_video');expect(f.calls.model).toBe(models);expect(f.calls.artwork).toBe(artwork);
 const current=await f.campaigns.get('org',f.campaign.id),changed=current.items.find(row=>row.id===item.id),op=operations(f).find(row=>row.id===opId).payload;
 expect(changed).toMatchObject({state:'needs_input',blocker:{code:'FINISHED_VIDEO_REQUIRED'},contentRevision:item.contentRevision+1});expect(changed.approval).toBeUndefined();
 expect(current.items.find(row=>row.id===sibling.id)).toEqual(sibling);expect(op.output).toEqual(original.output);
 expect(op.material.assets).toEqual([coverAsset()]);expect(op.material.script).toBe(original.material.script);expect(op.material.scenes).toEqual(original.material.scenes);
 expect(op.videoBaseMaterial).toEqual(op.material);expect(op.appliedContentRevision).toBe(changed.contentRevision);
 expect((await f.service.reinspect('org','owner',opId,{expectedContentRevision:item.contentRevision})).state).toBe('needs_video');
});

test('video caption edit keeps needs_video blocker and finalizes the new caption without changing submitted scenes',async()=>{
 const f=await videoFixture(),before=operations(f)[0].payload,item=(await f.campaigns.get('org',f.campaign.id)).items[0];
 const manifest=structuredClone(f.video.manifest),modelCalls=f.calls.model;
 const input={campaignId:f.campaign.id,itemId:item.id,expectedContentRevision:item.contentRevision,body:'A clear public caption.'};
 const edited=await captionEditor(f).edit('org','owner',input,'en');
 expect(edited).toMatchObject({state:'needs_input',blocker:{code:'FINISHED_VIDEO_REQUIRED'}});expect(edited.approval).toBeUndefined();
 const op=operations(f)[0].payload;expect(op.appliedContentRevision).toBe(edited.contentRevision);expect(op.videoBaseMaterial.caption).toBe(input.body);
 expect(op.output).toEqual(before.output);expect(op.material.script).toBe(before.material.script);expect(op.material.scenes).toEqual(before.material.scenes);expect(f.video.manifest).toEqual(manifest);
 const repeated=await captionEditor(f).edit('org','owner',input,'en');expect(repeated).toEqual(edited);
 const result=await f.service.finalizeVideo('org','owner',f.operationId);expect(result.state).toBe('ready');expect(result.material.caption).toBe(input.body);
 expect(f.calls.model).toBe(modelCalls);expect(f.video.manifest).toEqual(manifest);expect(f.calls.publish).toEqual([]);
});

test('video caption edit rejects unknown or active work before item or native mutation',async()=>{
 for(const blocked of ['uncertain','lease','video','finalizing','stopped-uncertain','stopped-save-failed']){
  const f=await videoFixture(),record=operations(f)[0],item=(await f.campaigns.get('org',f.campaign.id)).items[0];
  if(blocked==='uncertain')record.payload.state='uncertain';
  if(blocked==='lease')Object.assign(record.payload,{owner:'other-owner',leaseUntil:'2099-01-01T00:00:00Z'});
  if(blocked==='video')Object.assign(f.video.current,{state:'approved',jobs:[{id:'accepted-scene',state:'queued'}]});
  if(blocked==='finalizing')record.payload.finalizing={owner:'other-owner',until:'2099-01-01T00:00:00Z'};
  if(blocked.startsWith('stopped-'))Object.assign(f.video.current,{state:'stopped',jobs:[{id:'accepted-scene',state:blocked==='stopped-uncertain'?'uncertain':'save_failed',receipt:{requestId:'accepted-provider-receipt'}}]});
  await f.store.put({...record,expectedRevision:record.revision});const snapshots=structuredClone([...f.store.rows.values()]),native=f.calls.native.length;
  await expect(captionEditor(f).edit('org','owner',{campaignId:f.campaign.id,itemId:item.id,expectedContentRevision:item.contentRevision,body:'Must not be saved.'})).rejects.toHaveProperty('code','CAMPAIGN_VIDEO_CAPTION_EDIT_BLOCKED');
  expect([...f.store.rows.values()]).toEqual(snapshots);expect(f.calls.native).toHaveLength(native);
 }
});

test('empty prior video caption edits caption only and preserves unresolved inspection',async()=>{
 const f=await fixture({platform:'instagram',format:'reel'});await f.service.prepare('org','owner',f.input);
 const op=operations(f)[0];op.payload.state='needs_revision';op.payload.producerStatus='needs_revision';
 for(const key of ['material','nativeMaterial','videoBaseMaterial'])if(op.payload[key])op.payload[key].caption='';
 await f.store.put({...op,expectedRevision:op.revision});
 const detail=await f.campaigns.get('org',f.campaign.id),item=detail.items[0],record=await f.store.read('org','campaign_item',item.id);
 record.payload.material.caption='';record.payload.blocker={code:'EDITORIAL_REVISION_REQUIRED',detail:'invalid_video_caption'};await f.store.put({...record,expectedRevision:record.revision});
 const before=structuredClone(record.payload.material),native=f.calls.native.length;
 const edited=await captionEditor(f).edit('org','owner',{campaignId:f.campaign.id,itemId:item.id,expectedContentRevision:item.contentRevision,body:'Explicit public caption.'});
 expect(edited.material.caption).toBe('Explicit public caption.');expect(edited.material.body).toBe(before.body);expect(edited.material.script).toBe(before.script);expect(edited.material.scenes).toEqual(before.scenes);
 expect(operations(f)[0].payload.captionOverride).toEqual({field:'caption',value:'Explicit public caption.'});
 expect(operations(f)[0].payload.state).toBe('needs_revision');expect(edited.state).toBe('needs_input');expect(edited.blocker.code).toBe('EDITORIAL_REVISION_REQUIRED');expect(edited.approval).toBeUndefined();expect(f.calls.native).toHaveLength(native);
});

test('failed video caption native save resumes the same caption without model work and reinspect preserves the override',async()=>{
 const f=await fixture({platform:'instagram',format:'reel'});f.editorial.assets=[coverAsset()];await f.service.prepare('org','owner',f.input);
 const item=(await f.campaigns.get('org',f.campaign.id)).items[0],opId=operations(f)[0].id;
 const input={campaignId:f.campaign.id,itemId:item.id,expectedContentRevision:item.contentRevision,body:'Human caption must survive restore.'};
 const save=f.native.save;let failed=true;f.native.save=async(...args)=>{if(failed){failed=false;throw new DomainError('LOCAL_SAVE_UNAVAILABLE');}return save(...args);};
 await expect(captionEditor(f).edit('org','owner',input)).rejects.toHaveProperty('code','LOCAL_SAVE_UNAVAILABLE');
 const pending=(await f.campaigns.get('org',f.campaign.id)).items[0];expect(pending.state).toBe('needs_input');expect(pending.blocker.code).toBe('FINISHED_VIDEO_REQUIRED');expect(pending.material.pieceId).toBeUndefined();
 const op=operations(f)[0].payload,requestId=op.nativeRequestId,modelCalls=f.calls.model,artwork=f.calls.artwork;
 const edited=await captionEditor(f.make?{...f,service:f.make()}:f).edit('org','owner',input);expect(operations(f)[0].payload.nativeRequestId).toBe(requestId);
 const restored=await f.service.reinspect('org','owner',opId,{expectedContentRevision:edited.contentRevision});expect(restored.state).toBe('needs_video');expect(restored.material.caption).toBe(input.body);
 expect(f.calls.model).toBe(modelCalls);expect(f.calls.artwork).toBe(artwork);expect(f.calls.publish).toEqual([]);
});

test('video cover reinspection uses the actual B restore contract for reel, short and long_video',async()=>{
 for(const format of ['reel','short','long_video']){
  const f=await fixture({platform:format==='reel'?'instagram':'youtube',format});f.input.targetSeconds=60;f.editorial.assets=[{...coverAsset(),...(format==='long_video'?{width:1280,height:720}: {})}];
  f.editorial.output={title:'One useful video',hook:'Follow a fictional practical example.',body:'An exact useful explanation',caption:'Caption transcript: use the complete narration in script. Scene-level timing still needs to be checked against the final recording.',cta:'Try one practical step.',ctaSurface:'reply',script:'First spoken line.\n\nSecond spoken line.',posts:[],frames:[],chapterStarts:[],scenes:[{index:1,startSeconds:0,endSeconds:30,spokenText:'First spoken line.',visualIntent:'First'},{index:2,startSeconds:30,endSeconds:60,spokenText:'Second spoken line.',visualIntent:'Second'}]};
  const prepared=await f.service.prepare('org','owner',f.input),item=(await f.campaigns.get('org',f.campaign.id)).items[0],raw=structuredClone(operations(f)[0].payload.output);
  const {SocialEditorialProductionV1}=loadTypeScriptModule(root+'editorial/social-editorial-production.v1.ts',{'../../../openai/ai.clients':{getChatModel:async()=>{throw Error('No model permitted');}},'./assets/editorial-assets.v1':{EditorialAssetsV1:class{}}});
  let artwork=0,admissions=0;
  f.service.editorial=new SocialEditorialProductionV1({executeAiOperation:async()=>{admissions++;throw Error('No model permitted');}},{create:async()=>{artwork++;throw Error('No renderer permitted');}},{mediaInWorkspace:async(org,ids)=>{expect(org).toBe('org');return ids.map(id=>({id,path:'/owned-cover.png'}));}},{read:async()=>({documents:[],admissions:[],gaps:[]})});
  const result=await f.service.reinspect('org','owner',prepared.items[0].operationId,{expectedContentRevision:item.contentRevision});
  expect(result.state).toBe('needs_video');expect(result.material.assets).toEqual(f.editorial.assets);expect(result.material.script).toBe(raw.script);expect(result.material.scenes).toEqual(raw.scenes);
  expect(result.material.caption).toBe(`${raw.hook}\n\n${raw.body}\n\n${raw.cta}`);expect(result.material.settings.videoCaptionRepair.reviewRequired).toBe(true);
  expect(operations(f)[0].payload.output).toEqual(raw);expect(operations(f)[0].payload.videoBaseMaterial.caption).toBe(result.material.caption);expect(admissions).toBe(0);expect(artwork).toBe(0);
  if(format==='reel'){
   const current=(await f.campaigns.get('org',f.campaign.id)).items[0];
   const edited=await captionEditor(f).edit('org','owner',{campaignId:f.campaign.id,itemId:current.id,expectedContentRevision:current.contentRevision,body:'Author-approved caption, distinct from the model output.'});
   const restored=await f.service.reinspect('org','owner',prepared.items[0].operationId,{expectedContentRevision:edited.contentRevision});
   expect(restored.material.caption).toBe('Author-approved caption, distinct from the model output.');expect(restored.state).toBe('needs_video');
   expect(operations(f)[0].payload.output).toEqual(raw);expect(admissions).toBe(0);expect(artwork).toBe(0);
  }
 }
});

test('pending caption save excludes video continuation and new paid revisions before another side effect',async()=>{
 const f=await videoFixture(),item=(await f.campaigns.get('org',f.campaign.id)).items[0],entered=wait(),release=wait(),save=f.native.save;
 f.native.save=async(...args)=>{entered.resolve();await release.promise;return save(...args);};
 const editing=captionEditor(f).edit('org','owner',{campaignId:f.campaign.id,itemId:item.id,expectedContentRevision:item.contentRevision,body:'Pending caption.'});await entered.promise;
 const native=f.calls.native.length,model=f.calls.model,manifest=structuredClone(f.video.manifest);
 const leaseOwner=operations(f)[0].payload.owner;
 for(const requestId of [f.input.requestId,'must-not-start-new-paid-operation']){
  const paused=await f.service.prepare('org','owner',{...f.input,requestId});expect(paused.items[0]).toMatchObject({state:'in_progress',code:'CAMPAIGN_CAPTION_SAVE_REQUIRED',regenerated:false});
  expect(operations(f)[0].payload.owner).toBe(leaseOwner);expect(f.calls.model).toBe(model);expect(f.calls.native).toHaveLength(native);
 }
 await expect(f.service.finalizeVideo('org','owner',f.operationId)).rejects.toHaveProperty('code','CAMPAIGN_VIDEO_CAPTION_EDIT_BLOCKED');
 await expect(f.service.bindVideo('org','owner',f.campaign.id,item.id,{operationId:f.operationId,manifest,intentId:'must-not-bind'})).rejects.toHaveProperty('code','CAMPAIGN_VIDEO_SCOPE');
 await expect(f.service.revise('org','owner',f.campaign.id,item.id,{requestId:'must-not-generate',expectedContentRevision:item.contentRevision+1,instruction:'Another version.'})).rejects.toHaveProperty('code','CAMPAIGN_REVISION_PREVIOUS_WORK_PENDING');
 expect(f.calls.native).toHaveLength(native);expect(f.calls.model).toBe(model);expect(f.video.manifest).toEqual(manifest);
 release.resolve();expect((await editing).material.caption).toBe('Pending caption.');
 const cached=await f.service.prepare('org','owner',{...f.input,requestId:'read-current-needs-video-without-new-model'});expect(cached.items[0].state).toBe('needs_video');expect(f.calls.model).toBe(model);
});

test('durable owner-brief planning assigns distinct topics once per destination, before model work', async () => {
 const f = await fixture({ count: 15 }); const plan = await f.service.plan('org', 'owner', f.input);
 expect(plan.items).toHaveLength(15); expect(new Set(plan.items.map(item => item.candidate.id)).size).toBe(15);
 expect(new Set(plan.items.map(item => item.candidate.angle)).size).toBe(15);
 expect(new Set(plan.items.map(item => item.candidate.title)).size).toBe(15);
 expect(f.calls.discover).toBe(1); expect(f.calls.model).toBe(0);
 await f.make().plan('org', 'owner', f.input); expect(f.calls.discover).toBe(1);
 expect((await f.campaigns.get('org', f.campaign.id)).campaign.researchIds).toEqual(['research']);
});

test('Telegram asks material-specific length questions per item and spends no model claim until selections arrive', async () => {
 const f = await fixture({ count: 2, platform: 'telegram' });
 const result = await f.service.prepare('org', 'owner', { ...f.input, lengthChoiceId: 'global-short', lengthGuidance: 'about900' });
 expect(result.questions).toHaveLength(2); expect(result.items.every(item => item.state === 'needs_length')).toBe(true);
 expect(new Set(result.questions.map(q => q.lengthOptions[0].id)).size).toBe(2);
 expect(operations(f)).toHaveLength(0); expect(f.calls.model).toBe(0);
 const itemOverrides = Object.fromEntries(result.questions.map(q => [q.itemId, { lengthChoiceId: q.lengthOptions[0].id }]));
 const prepared = await f.service.prepare('org', 'owner', { ...f.input, itemOverrides });
 expect(prepared.items.every(item => item.state === 'ready')).toBe(true); expect(f.calls.model).toBe(2);
 expect(f.calls.requests.every(request => request.brief.lengthGuidance.includes('characters including headline'))).toBe(true);
});

test('concurrent prepare calls admit one real model execution; restart returns completed native material', async () => {
 const f = await fixture(); const block = wait(), entered = wait();
 f.editorial.model = async () => { entered.resolve(); await block.promise; };
 const first = f.service.prepare('org', 'owner', f.input); await entered.promise;
 const second = await f.make().prepare('org', 'owner', f.input);
 expect(second.items[0].state).toBe('in_progress'); expect(f.calls.model).toBe(1);
 block.resolve(); const result = await first;
 expect(result.items[0].state).toBe('ready'); expect(f.calls.native).toHaveLength(1);
 await f.make().prepare('org', 'owner', f.input); expect(f.calls.model).toBe(1); expect(f.calls.native).toHaveLength(1);
});

test('lost model response remains uncertain after restart and is never automatically regenerated', async () => {
 const f = await fixture(); f.editorial.model = async () => { throw new Error('model response lost'); };
 await f.service.prepare('org', 'owner', f.input);
 expect(operations(f)[0].payload.state).toBe('uncertain');
 await f.make().prepare('org', 'owner', f.input); expect(f.calls.model).toBe(1); expect(f.calls.native).toHaveLength(0);
});

test('advanced autopilot decision is persisted, consumed by production instructions and schedules with agent authority', async () => {
 const f = await fixture({ autopilot: true, platform: 'telegram' });
 const result = await f.service.prepare('org', 'owner', f.input);
 expect(result.items[0].state).toBe('ready'); expect(f.calls.decisions).toBe(1);
 expect(f.calls.requests[0].brief.instruction).toContain('maintenance decision checklist');
 expect(f.calls.requests[0].brief.lengthGuidance).toContain('about 900 characters');
 expect(f.calls.requests[0].brief.lengthChoiceId).toContain('delegated_length');
 expect(operations(f)[0].payload.decision.answer).toContain('maintenance'); expect(f.calls.publish[0].authority).toBe('agent');
});

test('grant revoked after decision but before editorial model blocks that dependent call', async () => {
 const f = await fixture({ autopilot: true });
 f.decisions.run = async () => f.autonomy.revoke('org', f.grant.id, 'owner');
 const result = await f.service.prepare('org', 'owner', f.input);
 expect(result.items[0].state).toBe('needs_input'); expect(f.calls.model).toBe(0); expect(f.calls.native).toHaveLength(0);
});

test('known artwork failure resumes from the structured checkpoint without paid regeneration', async () => {
 const f = await fixture(); let fail = true;
 f.editorial.artwork = async () => { if (fail) { fail = false; throw new Error('editorial_artwork_text_does_not_fit'); } };
 await f.service.prepare('org', 'owner', f.input);
 expect(operations(f)[0].payload.state).toBe('generated');
 const result = await f.make().prepare('org', 'owner', f.input);
 expect(result.items[0].state).toBe('ready'); expect(f.calls.model).toBe(1); expect(f.calls.native).toHaveLength(1);
});

test('partial artwork and unregistered stored bytes stay accounted and block blind repetition', async () => {
 const f = await fixture(); f.editorial.artwork = async () => { throw Object.assign(new Error('EDITORIAL_ARTWORK_FAILED'), { cause: { saved: [{ id: 'partial', path: '/partial.png' }], unregistered: { path: '/unregistered.png' } } }); };
 await f.service.prepare('org', 'owner', f.input); const row = operations(f)[0];
 expect(row.payload).toMatchObject({ state: 'artwork_partial', partialAssets: [{ id: 'partial' }], unregisteredAsset: { path: '/unregistered.png' } });
 const result = await f.make().prepare('org', 'owner', f.input);
 expect(result.items[0].partialAssets[0].id).toBe('partial'); expect(f.calls.model).toBe(1); expect(f.calls.artwork).toBe(1);
});

test.each(['profile', 'brand', 'findings'])('restart rejects changed effective %s context before any further work', async changed => {
 const f = await fixture(); f.editorial.artwork = async () => { throw new Error('known artwork failure'); };
 await f.service.prepare('org', 'owner', f.input);
 if (changed === 'profile') f.context.profile.promise = 'Different promise';
 if (changed === 'brand') f.context.brandVersionDigest = 'brand-v2';
 if (changed === 'findings') f.context.findings = [{ id: 'finding-v2', statement: 'New finding' }];
 const result = await f.make().prepare('org', 'owner', f.input);
 expect(result.items[0].code).toBe('CAMPAIGN_PRODUCTION_CONTEXT_CHANGED'); expect(f.calls.model).toBe(1); expect(f.calls.artwork).toBe(1);
});

test('blank AI account config fails before any paid operation claim and can be retried after configuration', async () => {
 const f = await fixture(); configured = false;
 let result = await f.service.prepare('org', 'owner', f.input);
 expect(result.items[0].code).toBe('AI_PROVIDER_NOT_CONFIGURED'); expect(operations(f)).toHaveLength(0); expect(f.calls.model).toBe(0);
 configured = true; result = await f.service.prepare('org', 'owner', f.input);
 expect(result.items[0].state).toBe('ready'); expect(f.calls.model).toBe(1);
});

test('known producer source admission refusal is retryable and never becomes unknown model submission', async () => {
 const f = await fixture(); let fail = true;
 f.editorial.beforeModel = async () => { if (fail) { fail = false; throw new DomainError('EDITORIAL_SOURCE_PERMISSION_REQUIRED'); } };
 await f.service.prepare('org', 'owner', f.input);
 expect(operations(f)[0].payload.state).toBe('preflight_failed'); expect(f.calls.model).toBe(0);
 const result = await f.service.prepare('org', 'owner', f.input);
 expect(result.items[0].state).toBe('ready'); expect(f.calls.model).toBe(1);
});

async function videoFixture() {
 const f = await fixture({ platform: 'instagram', format: 'reel' });
 const result = await f.service.prepare('org', 'owner', f.input), op = result.items[0].operationId;
 f.video.current = { id: 'production-1', revision: 1, digest: 'production-digest-1', state: 'completed', result: { id: 'movie-1', name: 'Movie', path: '/movie-1.mp4', type: 'video', durationSeconds: 57, width: 1080, height: 1920, metadata: { source: 'mp4_bytes', sha256: 'a'.repeat(64), videoTrackId: 1 }, captions: { burned: 'provider_confirmed', sourceJobIds: ['final-job-1'] }, subtitles: [] },
  approval: { finalJobId: 'final-job-1', scenes: [] }, jobs: [], manifest: { durationSeconds: 60, scenes: [{ id: 's1', durationSeconds: 30, script: 'First spoken line.', title: 'First' }, { id: 's2', durationSeconds: 30, script: 'Second spoken line.', title: 'Second' }] } };
 f.video.job = { id: 'final-job-1', state: 'completed', resultMediaId: 'movie-1', provider: 'heygen', providerResult: { duration: 57 } };
 await f.service.bindVideo('org', 'owner', f.campaign.id, result.items[0].itemId, { operationId: op, manifest: f.video.current.manifest, intentId: 'fixture-intent-1' });
 return { ...f, operationId: op };
}

test('video finalization respects incomplete editorial inspection and never creates a publishable native snapshot', async () => {
 const f = await videoFixture(); f.editorial.finalStatus = 'needs_revision';
 const result = await f.service.finalizeVideo('org', 'owner', f.operationId);
 expect(result.state).toBe('needs_revision'); expect(result.inspection.issues[0].code).toBe('captions_missing');
 expect(f.calls.native).toHaveLength(1); expect((await f.campaigns.get('org', f.campaign.id)).items[0].state).toBe('needs_input');
});

test('video assets carry measured result duration rather than the manifest estimate', async () => {
 const f = await videoFixture(); const result = await f.service.finalizeVideo('org', 'owner', f.operationId);
 expect(result.state).toBe('ready'); expect(result.material.assets.find(asset => asset.kind === 'video').durationSeconds).toBe(57);
 expect(f.calls.native[1].requestId).toContain('production-1-1-');
 await f.make().finalizeVideo('org', 'owner', f.operationId); expect(f.calls.native).toHaveLength(2);
});

test('selective video revision creates a new immutable native identity and preserves complete scene script', async () => {
 const f = await videoFixture(); await f.service.finalizeVideo('org', 'owner', f.operationId);
 f.video.current = { ...f.video.current, id: 'production-2', revision: 2, digest: 'production-digest-2', result: { ...f.video.current.result, id: 'movie-2', path: '/movie-2.mp4', durationSeconds: 58, metadata: { source: 'mp4_bytes', sha256: 'b'.repeat(64) }, captions: { burned: 'provider_confirmed', sourceJobIds: ['final-job-2'] } }, approval: { finalJobId: 'final-job-2', scenes: [] },
  manifest: { ...f.video.current.manifest, scenes: [{ ...f.video.current.manifest.scenes[0], script: 'Revised first spoken line.' }, f.video.current.manifest.scenes[1]] } };
 f.video.job = { ...f.video.job, id: 'final-job-2', resultMediaId: 'movie-2', providerResult: { duration: 58 } };
 await f.service.bindVideo('org', 'owner', f.campaign.id, operations(f)[0].payload.itemId, { operationId: f.operationId, manifest: f.video.current.manifest, intentId: 'fixture-intent-2', parentId: 'production-1' });
 const result = await f.service.finalizeVideo('org', 'owner', f.operationId);
 expect(f.calls.native[2].requestId).not.toBe(f.calls.native[1].requestId);
 expect(result.material.scenes).toHaveLength(2); expect(result.material.scenes[0].spokenText).toBe('Revised first spoken line.');
 expect(result.material.scenes[1].spokenText).toBe('Second spoken line.'); expect(result.material.assets.filter(asset => asset.kind === 'video')).toHaveLength(1);
});

test('unknown video duration does not substitute the requested manifest duration', async () => {
 const f = await videoFixture(); delete f.video.current.result.durationSeconds; f.video.job.providerResult = { duration: 60 };
 await expect(f.service.finalizeVideo('org', 'owner', f.operationId)).rejects.toHaveProperty('code', 'VIDEO_ACTUAL_DURATION_REQUIRED');
 expect(f.calls.native).toHaveLength(1);
});

test('expired unknown model lease is never taken over as a fresh paid invocation', async () => {
 const f = await fixture(); const entered = wait(), blocked = wait();
 f.editorial.model = async () => { entered.resolve(); await blocked.promise; throw new Error('worker lost'); };
 const first = f.service.prepare('org', 'owner', f.input); await entered.promise;
 const row = operations(f)[0]; row.payload.leaseUntil = '2000-01-01T00:00:00Z';
 await f.store.put({ ...row, expectedRevision: row.revision });
 const result = await f.make().prepare('org', 'owner', f.input);
 expect(result.items[0].state).toBe('uncertain'); expect(f.calls.model).toBe(1);
 blocked.resolve(); await first;
});

test('expired artwork owner exposes unknown partial work instead of silently rerendering saved media', async () => {
 const f = await fixture(); const entered = wait(), blocked = wait();
 f.editorial.artwork = async () => { entered.resolve(); await blocked.promise; throw new Error('worker lost'); };
 const first = f.service.prepare('org', 'owner', f.input); await entered.promise;
 const row = operations(f)[0]; row.payload.leaseUntil = '2000-01-01T00:00:00Z';
 await f.store.put({ ...row, expectedRevision: row.revision });
 const result = await f.make().prepare('org', 'owner', f.input);
 expect(result.items[0].state).toBe('needs_input'); expect(result.items[0].code).toBe('ARTWORK_RESULT_REQUIRES_RECONCILIATION');
 expect(f.calls.artwork).toBe(1); blocked.resolve(); await first;
});

test('resuming a known checkpoint rejects a concurrently changed campaign content revision', async () => {
 const f = await fixture(); f.editorial.artwork = async () => { throw new Error('known artwork failure'); };
 await f.service.prepare('org', 'owner', f.input);
 const item = (await f.campaigns.get('org', f.campaign.id)).items[0];
 await f.campaigns.reschedule('org', f.campaign.id, item.id, { scheduledAt: item.scheduledAt, expectedContentRevision: item.contentRevision });
 const result = await f.service.prepare('org', 'owner', f.input);
 expect(result.items[0].code).toBe('CAMPAIGN_PRODUCTION_CONTENT_CHANGED'); expect(f.calls.model).toBe(1); expect(f.calls.artwork).toBe(1);
});

test('completed material is reused even when the caller supplies another batch request id', async () => {
 const f = await fixture(); await f.service.prepare('org', 'owner', f.input);
 const result = await f.service.prepare('org', 'owner', { ...f.input, requestId: 'another-batch' });
 expect(result.items[0].state).toBe('ready'); expect(f.calls.model).toBe(1); expect(f.calls.native).toHaveLength(1);
});

test('video finalization lease admits one native snapshot under concurrent finalize requests', async () => {
 const f = await videoFixture(); const entered = wait(), blocked = wait();
 const original = f.editorial.finalizeVideo;
 f.editorial.finalizeVideo = async (...args) => { entered.resolve(); await blocked.promise; return original(...args); };
 const first = f.service.finalizeVideo('org', 'owner', f.operationId); await entered.promise;
 const second = await f.make().finalizeVideo('org', 'owner', f.operationId);
 expect(second.state).toBe('in_progress'); blocked.resolve(); await first;
 expect(f.calls.native).toHaveLength(2);
});

test('missing target duration blocks only that video item before a model claim', async () => {
 const f = await fixture({ format: 'reel', platform: 'instagram' }); delete f.input.targetSeconds;
 const result = await f.service.prepare('org', 'owner', f.input);
 expect(result.items[0].code).toBe('EDITORIAL_VIDEO_DURATION_REQUIRED'); expect(f.calls.model).toBe(0); expect(operations(f)).toHaveLength(0);
});

test('a bare provider file stays blocked before native persistence until actual dimensions and caption evidence exist', async () => {
 const f = await videoFixture();
 delete f.video.current.result.metadata; delete f.video.current.result.width; delete f.video.current.result.height;
 const inspected = jest.fn(f.editorial.finalizeVideo); f.editorial.finalizeVideo = inspected;
 const result = await f.service.finalizeVideo('org', 'owner', f.operationId).catch(error => error);
 expect(result).toHaveProperty('code', 'VIDEO_ACTUAL_METADATA_REQUIRED');
 expect(inspected).not.toHaveBeenCalled();
 expect(f.calls.native).toHaveLength(1);
});

test('web discovery is disabled by default, explicit opt-in is forwarded to the gated gateway and binds the plan context', async () => {
 const f = await fixture(); await f.service.plan('org', 'owner', f.input);
 expect(f.calls.discoveryOptions.allowWebSearch).toBe(false);
 await expect(f.service.plan('org', 'owner', { ...f.input, allowWebSearch: true })).rejects.toHaveProperty('code', 'CAMPAIGN_PRODUCTION_CONTEXT_CHANGED');
 await f.service.plan('org', 'owner', { ...f.input, requestId: 'explicit-web-plan', allowWebSearch: true });
 expect(f.calls.discoveryOptions.allowWebSearch).toBe(true); expect(f.calls.model).toBe(0);
});

test('a new transport request during artwork reuses the item revision owner and cannot spend another model call', async () => {
 const f = await fixture(), entered = wait(), blocked = wait();
 f.editorial.artwork = async () => { entered.resolve(); await blocked.promise; };
 const first = f.service.prepare('org', 'owner', f.input); await entered.promise;
 const middle = (await f.campaigns.get('org', f.campaign.id)).items[0];
 expect(middle.state).toBe('submitting'); expect(middle.material).toBeUndefined();
 const second = await f.make().prepare('org', 'owner', { ...f.input, requestId: 'new-transport-during-artwork' });
 expect(second.items[0].state).toBe('in_progress'); expect(f.calls.model).toBe(1); expect(operations(f)).toHaveLength(1);
 blocked.resolve(); await first;
 expect(f.calls.native).toHaveLength(1);
});

test('known advanced-model refusal remains retryable after configuration is fixed', async () => {
 const f = await fixture({ autopilot: true }), original = f.decisions.answer;
 f.decisions.answer = async () => { throw new DomainError('AUTONOMY_ADVANCED_MODEL_REQUIRED'); };
 const first = await f.service.prepare('org', 'owner', f.input);
 expect(first.items[0].code).toBe('AUTONOMY_ADVANCED_MODEL_REQUIRED');
 expect(operations(f)[0].payload.state).toBe('preflight_failed'); expect(f.calls.model).toBe(0);
 f.decisions.answer = original;
 const retry = await f.make().prepare('org', 'owner', f.input);
 expect(retry.items[0].state).toBe('ready');
 await f.make().prepare('org', 'owner', { ...f.input, requestId: 'retry-new-after-config' });
 expect(f.calls.model).toBe(1); expect(operations(f)).toHaveLength(1);
});

test('missing configured advanced model is caught before any operation or decision claim', async () => {
 const f = await fixture({ autopilot: true }); advancedConfigured = false;
 const first = await f.service.prepare('org', 'owner', f.input);
 expect(first.items[0].code).toBe('AUTONOMY_ADVANCED_MODEL_REQUIRED'); expect(operations(f)).toHaveLength(0);
 expect(f.calls.decisions).toBe(0); expect(f.calls.model).toBe(0);
 advancedConfigured = true;
 expect((await f.make().prepare('org', 'owner', f.input)).items[0].state).toBe('ready');
});

test('a new request resumes known structured output after artwork failure without generating a second model answer', async () => {
 const f = await fixture(); let failed = false;
 f.editorial.artwork = async () => { if (!failed) { failed = true; throw new Error('known artwork failure'); } };
 const first = await f.service.prepare('org', 'owner', f.input);
 const retry = await f.make().prepare('org', 'owner', { ...f.input, requestId: 'new-transport-resume' });
 expect(retry.items[0].operationId).toBe(first.items[0].operationId); expect(retry.items[0].state).toBe('ready');
 expect(f.calls.model).toBe(1); expect(operations(f)).toHaveLength(1);
});

test('revision ownership survives a lost model response and different subsequent request identifiers', async () => {
 const f = await fixture(); f.editorial.model = async () => { throw new Error('response lost'); };
 await f.service.prepare('org', 'owner', f.input);
 const retry = await f.make().prepare('org', 'owner', { ...f.input, requestId: 'unknown-attempt-new-id' });
 expect(retry.items[0].state).toBe('uncertain'); expect(f.calls.model).toBe(1); expect(operations(f)).toHaveLength(1);
});

test('legacy checkpoints with an empty ready item are adopted before admitting any new request', async () => {
 const f = await fixture(), entered = wait(), blocked = wait();
 f.editorial.artwork = async () => { entered.resolve(); await blocked.promise; };
 const first = f.service.prepare('org', 'owner', f.input); await entered.promise;
 const op = operations(f)[0].payload;
 // Reproduce persisted89c shape: checkpoint exists, no revision fence, prepare already settled.
 for (const [key, row] of f.store.rows) if (row.payload.type === 'production_revision_owner') f.store.rows.delete(key);
 await f.autonomy.settle('org', op.actionId, { state: 'prepared' });
 const second = await f.make().prepare('org', 'owner', { ...f.input, requestId: 'new-id-after-upgrade' });
 expect(f.calls.model).toBe(1); expect(operations(f)).toHaveLength(1); expect(second.items[0].operationId).toBe(op.id);
 expect([...f.store.rows.values()].some(row => row.payload.type === 'production_revision_owner' && row.payload.operationId === op.id)).toBe(true);
 blocked.resolve(); await first;
});

test('C measured bytes override provider duration and propagate video evidence without fabricated dimensions', async () => {
 const f = await videoFixture(); f.video.job.providerResult.duration = 999;
 const result = await f.service.finalizeVideo('org', 'owner', f.operationId);
 const video = result.material.assets.find(asset => asset.kind === 'video');
 expect(video).toMatchObject({ durationSeconds: 57, width: 1080, height: 1920, provenance: { jobId: 'final-job-1' },
  videoEvidence: { metadata: { source: 'mp4_bytes', sha256: 'a'.repeat(64) }, captions: { burned: 'provider_confirmed', sourceJobIds: ['final-job-1'] } } });
 expect(result.material.assets.filter(asset => asset.kind === 'subtitle')).toHaveLength(0);
});

test('actual C subtitle media and byte identity are handed to editorial finalization and native persistence', async () => {
 const f = await videoFixture();
 f.video.current.result.captions = { burned: 'authored_timed_cues', sourceJobIds: ['final-job-1'] };
 f.video.current.result.subtitles = [{ id: 'caption-id', mediaId: 'caption-media', name: 'captions.vtt', path: '/captions.vtt', type: 'subtitle', mimeType: 'text/vtt',
  role: 'captions', sha256: 'c'.repeat(64), cueCount: 2, source: 'authored_timed_cues' }];
 const result = await f.service.finalizeVideo('org', 'owner', f.operationId);
 const captions = result.material.assets.find(asset => asset.kind === 'subtitle');
 expect(captions).toMatchObject({ id: 'caption-id', mediaId: 'caption-media', mimeType: 'text/vtt', role: 'captions', url: '/captions.vtt', provenance: { jobId: 'final-job-1' } });
 expect(captions.provenance.revision).toContain('c'.repeat(64));
 expect(f.calls.native[1].material.assets).toEqual(result.material.assets);
});

test.each(['unverified', 'authored_timed_cues'])('C captions state %s without required real evidence cannot create a ready native draft', async burned => {
 const f = await videoFixture(); f.video.current.result.captions.burned = burned;
 await expect(f.service.finalizeVideo('org', 'owner', f.operationId)).rejects.toHaveProperty('code', burned === 'unverified' ? 'VIDEO_CAPTIONS_UNVERIFIED' : 'VIDEO_AUTHORED_CAPTIONS_FILE_REQUIRED');
 expect(f.calls.native).toHaveLength(1);
});

test('retained scene caption lineage is preserved from the measured C result', async () => {
 const f = await videoFixture(); f.video.current.result.captions = { burned: 'retained_scene_lineage', sourceJobIds: ['owned-scene-source-job'] };
 const result = await f.service.finalizeVideo('org', 'owner', f.operationId);
 expect(result.material.assets.find(asset => asset.kind === 'video').videoEvidence.captions).toEqual(f.video.current.result.captions);
});

test('measured metadata must belong to the same completed final job and result media', async () => {
 const f = await videoFixture(); f.video.job.resultMediaId = 'another-result';
 await expect(f.service.finalizeVideo('org', 'owner', f.operationId)).rejects.toHaveProperty('code', 'VIDEO_FINAL_RESULT_MISMATCH');
 expect(f.calls.native).toHaveLength(1);
});

test('caption evidence enrichment changes the immutable native identity even for the same video media id', async () => {
 const f = await videoFixture(); await f.service.finalizeVideo('org', 'owner', f.operationId);
 f.video.current.result.subtitles = [{ id: 'sidecar', mediaId: 'sidecar', name: 'captions.srt', path: '/captions.srt', type: 'subtitle', mimeType: 'application/x-subrip',
  role: 'captions', sha256: 'd'.repeat(64), cueCount: 2, source: 'provider_subtitle_file' }];
 await f.service.finalizeVideo('org', 'owner', f.operationId);
 expect(f.calls.native[2].requestId).not.toBe(f.calls.native[1].requestId);
 expect(f.calls.native[2].material.assets.find(asset => asset.mediaId === 'sidecar')).toMatchObject({ kind: 'subtitle', mimeType: 'application/x-subrip' });
});

test('measured source-scene byte durations replace raw provider estimates while preserving complete script', async () => {
 const f = await videoFixture();
 f.video.current.approval.scenes = [{ sceneId: 's1', jobId: 'scene-one' }, { sceneId: 's2', jobId: 'scene-two' }];
 f.video.current.jobs = [
  { id: 'scene-one', state: 'completed', providerResult: { duration: 999 }, result: { durationSeconds: 28, metadata: { source: 'mp4_bytes', sha256: 'e'.repeat(64) } } },
  { id: 'scene-two', state: 'completed', providerResult: { duration: 999 }, result: { durationSeconds: 29, metadata: { source: 'mp4_bytes', sha256: 'f'.repeat(64) } } },
 ];
 const result = await f.service.finalizeVideo('org', 'owner', f.operationId);
 expect(result.material.scenes.map(scene => [scene.startSeconds, scene.endSeconds])).toEqual([[0, 28], [28, 57]]);
 expect(result.material.script).toBe('First spoken line.\n\nSecond spoken line.');
});

test('production preflight uses the real read-only config loader outside any admitted AI operation', async () => {
 const f = await fixture();
 const real = loadTypeScriptModule('libraries/nestjs-libraries/src/openai/ai.provider.config.ts', {
  '@contentfactory/helpers/auth/auth.service': { AuthService: { fixedDecryption: value => value } },
 });
 await expect(real.requireActiveAiConfig('org')).rejects.toMatchObject({ name: 'AiUsageContextRequired' });
 let key = '';
 actualConfigRead = org => real.loadAiConfig(org, async () => ({ provider: 'openai', usageMode: 'workspace_key', apiKey: key }), async () => null);
 const blocked = await f.service.prepare('org', 'owner', f.input);
 expect(blocked.items[0].code).toBe('AI_PROVIDER_NOT_CONFIGURED'); expect(operations(f)).toHaveLength(0); expect(f.calls.model).toBe(0);
 key = 'synthetic-readonly-fixture-key';
 const ready = await f.make().prepare('org', 'owner', f.input);
 expect(ready.items[0].state).toBe('ready'); expect(f.calls.model).toBe(1);
 await expect(real.requireActiveAiConfig('org')).rejects.toMatchObject({ name: 'AiUsageContextRequired' });
});

test('Russian baseline planning presents distinct editorial topics without internal prompt instructions', async () => {
 const f = await fixture({ count: 31 });
 f.context.profile.languages = ['ru']; f.context.profile.pillars = ['Планирование', 'Обслуживание']; f.context.profile.audience = 'Владельцы мастерских';
 f.planning.discover = async () => ({ id: 'research-ru', profile: structuredClone(f.context.profile), profileRevision: f.context.revision, findings: [], candidates: [],
  planningPrompts: f.context.profile.pillars.map(pillar => ({ pillar, angle: `${pillar} для владельцев мастерских`, status: 'proposal' })) });
 const plan = await f.service.plan('org', 'owner', { ...f.input, instruction: 'Подготовить полезные советы для владельца мастерской.' });
 expect(new Set(plan.items.map(item => item.candidate.title)).size).toBe(31);
 expect(plan.items[0].candidate.title).toBe('Планирование — первый практический шаг');
 expect(plan.items.every(item => !/campaign item|Treat this as|practical first step|verified company claim/.test(item.candidate.angle + item.candidate.title))).toBe(true);
 expect(plan.items.every(item => item.candidate.performance.availability === 'unknown' && item.candidate.evidence.length === 0)).toBe(true);
});

const retainedStory = () => ({
 assets: [{ id: 'artwork-asset', mediaId: 'owned-png', kind: 'image', mimeType: 'image/png', role: 'slide', url: '/owned.png', width: 1080, height: 1920, provenance: { revision: 'saved-frame', sourceIds: [] } }],
 slides: [{ index: 1, text: 'One useful step\nCheck the tool\nKeep the checklist', assetId: 'artwork-asset' }],
});

test('explicit reinspection reuses PNGs, invalidates only the selected item approval and is idempotent', async () => {
 const f = await fixture({ count: 2, format: 'story', platform: 'instagram' }); Object.assign(f.editorial, retainedStory());
 const prepared = await f.service.prepare('org', 'owner', f.input);
 const items = (await f.campaigns.get('org', f.campaign.id)).items;
 for (const item of items) {
  const { approvalDigest } = loadTypeScriptModule(root + 'campaign/campaign.service.ts', mocks);
  await f.campaigns.approve('org', f.campaign.id, item.id, { actorId: 'owner', expectedContentRevision: item.contentRevision, digest: approvalDigest(item) });
 }
 const before = (await f.campaigns.get('org', f.campaign.id)).items, selected = before[0];
 const originalModels = f.calls.model, originalArtwork = f.calls.artwork, originalNative = f.calls.native.length;
 const repaired = await f.service.reinspect('org', 'owner', prepared.items[0].operationId, { expectedContentRevision: selected.contentRevision });
 expect(repaired.regenerated).toBe(false); expect(repaired.material.assets[0].mediaId).toBe('owned-png');
 expect(f.calls.model).toBe(originalModels); expect(f.calls.artwork).toBe(originalArtwork); expect(f.calls.native).toHaveLength(originalNative + 1);
 const after = (await f.campaigns.get('org', f.campaign.id)).items;
 expect(after[0].contentRevision).toBe(selected.contentRevision + 1); expect(after[0].approval).toBeUndefined(); expect(after[1]).toEqual(before[1]);
 const repeat = await f.make().reinspect('org', 'owner', prepared.items[0].operationId, { expectedContentRevision: selected.contentRevision });
 expect(repeat.material).toEqual(repaired.material); expect(f.calls.native).toHaveLength(originalNative + 1);
});

test('reinspection of a known zero-asset skeleton creates the first artwork from the same saved output', async () => {
 const f = await fixture({ format: 'story', platform: 'instagram' }); let fail = true;
 f.editorial.artwork = async () => { if (fail) { fail = false; throw Object.assign(new Error('known frame validation'), { material: { version: 1, channelId: 'channel', platform: 'instagram', format: 'story', title: 'Title', hook: 'Hook', body: 'Body', assets: [], evidence: [], settings: {}, playbook: { version: '1', sourceDate: '2026-11-03' } } }); } };
 const prepared = await f.service.prepare('org', 'owner', f.input), op = operations(f)[0].payload;
 expect(op.material.assets).toEqual([]); Object.assign(f.editorial, retainedStory());
 const original = f.editorial.produce;
 f.editorial.produce = async (request, checkpoint) => { expect(checkpoint.output).toEqual(op.output); expect(checkpoint.retainedMaterial).toBeUndefined(); return original(request, checkpoint); };
 const item = (await f.campaigns.get('org', f.campaign.id)).items[0];
 const repaired = await f.service.reinspect('org', 'owner', prepared.items[0].operationId, { expectedContentRevision: item.contentRevision });
 expect(repaired.state).toBe('ready'); expect(f.calls.model).toBe(1); expect(f.calls.artwork).toBe(2); expect(f.calls.native).toHaveLength(1);
});

test('concurrent reinspection owns one restore and rejects foreign, stale and uncertain checkpoints', async () => {
 const f = await fixture({ format: 'story', platform: 'instagram' }); Object.assign(f.editorial, retainedStory());
 const prepared = await f.service.prepare('org', 'owner', f.input), item = (await f.campaigns.get('org', f.campaign.id)).items[0], opId = prepared.items[0].operationId;
 const entered = wait(), blocked = wait(); f.editorial.beforeModel = async (_request, checkpoint) => { expect(checkpoint.output).toBeDefined(); entered.resolve(); await blocked.promise; };
 const first = f.service.reinspect('org', 'owner', opId, { expectedContentRevision: item.contentRevision }); await entered.promise;
 const second = await f.make().reinspect('org', 'owner', opId, { expectedContentRevision: item.contentRevision });
 expect(second.state).toBe('in_progress'); blocked.resolve(); await first;
 await expect(f.service.reinspect('foreign-org', 'owner', opId, { expectedContentRevision: item.contentRevision })).rejects.toHaveProperty('code', 'CAMPAIGN_PRODUCTION_MISSING');
 await expect(f.service.reinspect('org', 'owner', opId, { expectedContentRevision: item.contentRevision + 10 })).rejects.toHaveProperty('code', 'CAMPAIGN_REVISION_CONFLICT');
 const unknown = await fixture(); unknown.editorial.model = async () => { throw new Error('response lost'); }; const lost = await unknown.service.prepare('org', 'owner', unknown.input);
 await expect(unknown.service.reinspect('org', 'owner', lost.items[0].operationId, { expectedContentRevision: 1 })).rejects.toHaveProperty('code', 'CAMPAIGN_REINSPECTION_OUTPUT_REQUIRED');
 expect(f.calls.model).toBe(1); expect(f.calls.artwork).toBe(1);
});

test('reinspection and future prepare replay never publish repaired material even on an autopilot campaign', async () => {
 const f = await fixture({ format: 'story', platform: 'instagram', autopilot: true }); Object.assign(f.editorial, retainedStory());
 const prepared = await f.service.prepare('org', 'owner', f.input); expect(f.calls.publish).toHaveLength(1);
 const current = (await f.campaigns.get('org', f.campaign.id)).items[0];
 const original = f.editorial.produce;
 f.editorial.produce = async (...args) => { const output = await original(...args); output.inspection.reviewRequired = ['technical_copy_removed']; return output; };
 const repaired = await f.service.reinspect('org', 'owner', prepared.items[0].operationId, { expectedContentRevision: current.contentRevision });
 expect(repaired.state).toBe('ready'); expect(f.calls.publish).toHaveLength(1);
 await f.make().prepare('org', 'owner', f.input); expect(f.calls.publish).toHaveLength(1);
 expect((await f.campaigns.get('org', f.campaign.id)).items[0].approval).toBeUndefined();
});

test('retained-frame mismatch is exposed without a hidden rerender or new model call', async () => {
 const f = await fixture({ format: 'story', platform: 'instagram' }); Object.assign(f.editorial, retainedStory());
 const prepared = await f.service.prepare('org', 'owner', f.input), item = (await f.campaigns.get('org', f.campaign.id)).items[0];
 f.editorial.produce = async (_request, checkpoint) => { expect(checkpoint.retainedMaterial.assets[0].mediaId).toBe('owned-png'); throw new DomainError('EDITORIAL_RETAINED_FRAME_MISMATCH'); };
 await expect(f.service.reinspect('org', 'owner', prepared.items[0].operationId, { expectedContentRevision: item.contentRevision })).rejects.toHaveProperty('code', 'EDITORIAL_RETAINED_FRAME_MISMATCH');
 expect(f.calls.model).toBe(1); expect(f.calls.artwork).toBe(1); expect(f.calls.native).toHaveLength(1);
});

test('actual B restores and normalizes technical saved copy using the same owned PNG with zero usage admission', async () => {
 const f = await fixture({ format: 'story', platform: 'instagram' }); Object.assign(f.editorial, retainedStory());
 f.editorial.output = { title: 'One useful step', hook: 'Check one thing', body: 'SVG file not created; renderer unavailable.', caption: '', cta: '', ctaSurface: 'none', script: '', posts: [], frames: [{ title: 'One useful step', body: 'Check the tool', footer: 'Keep the checklist' }], scenes: [], chapterStarts: [] };
 const prepared = await f.service.prepare('org', 'owner', f.input), item = (await f.campaigns.get('org', f.campaign.id)).items[0];
 const { SocialEditorialProductionV1: RealEditorial } = loadTypeScriptModule(root + 'editorial/social-editorial-production.v1.ts', {
  '../../../openai/ai.clients': { getChatModel: async () => { throw new Error('No model construction permitted'); } },
  './assets/editorial-assets.v1': { EditorialAssetsV1: class {} },
 });
 let admissions = 0, artwork = 0;
 const real = new RealEditorial({ executeAiOperation: async () => { admissions++; throw new Error('No paid calls permitted'); } },
  { create: async () => { artwork++; throw new Error('Existing artwork must be retained'); } },
  { mediaInWorkspace: async (_org, ids) => ids.map(id => ({ id, path: '/owned.png' })) },
  { read: async () => ({ documents: [], admissions: [], gaps: [] }) });
 f.service.editorial = real;
 const result = await f.service.reinspect('org', 'owner', prepared.items[0].operationId, { expectedContentRevision: item.contentRevision });
 expect(admissions).toBe(0); expect(artwork).toBe(0); expect(f.calls.model).toBe(1);
 expect(result.material.assets[0].mediaId).toBe('owned-png'); expect(result.material.body).toBe('One useful step\nCheck the tool\nKeep the checklist');
 expect(result.state).toBe('ready');
});

test('explicit revision generates one new selected material and preserves old outputs, assets and siblings', async () => {
 const f = await fixture({ count: 2, format: 'story', platform: 'instagram' }); Object.assign(f.editorial, retainedStory());
 await f.service.prepare('org', 'owner', f.input);
 const before = (await f.campaigns.get('org', f.campaign.id)).items, history = structuredClone(operations(f).map(row => row.payload));
 const request = { requestId: 'visual-change', expectedContentRevision: before[0].contentRevision, instruction: 'Make the first frame clearer and use a blue background.', visuals: { background: '#0066cc', foreground: '#ffffff' } };
 const revised = await f.service.revise('org', 'owner', f.campaign.id, before[0].id, request);
 expect(revised.production.items).toHaveLength(1); expect(revised.production.items[0].state).toBe('ready'); expect(f.calls.model).toBe(3);
 const after = (await f.campaigns.get('org', f.campaign.id)).items;
 expect(after[0].contentRevision).toBe(before[0].contentRevision + 2); expect(after[1]).toEqual(before[1]);
 expect(f.calls.requests[2].brief.instruction).toContain(before[0].material.body); expect(f.calls.requests[2].visuals.background).toBe('#0066cc');
 for (const old of history) expect(operations(f).find(row => row.id === old.id).payload).toEqual(old);
 await f.make().revise('org', 'owner', f.campaign.id, before[0].id, request);
 expect(f.calls.model).toBe(3); expect((await f.campaigns.get('org', f.campaign.id)).items[0].contentRevision).toBe(after[0].contentRevision);
 await expect(f.service.revise('org', 'owner', f.campaign.id, before[0].id, { ...request, instruction: 'Another intent with the same id' })).rejects.toHaveProperty('code', 'CAMPAIGN_REVISION_IDEMPOTENCY_CONFLICT');
});

test('concurrent revision retries bump the content revision once and do not duplicate the new model call', async () => {
 const f = await fixture(); await f.service.prepare('org', 'owner', f.input);
 const original = (await f.campaigns.get('org', f.campaign.id)).items[0], entered = wait(), blocked = wait();
 f.editorial.model = async () => { entered.resolve(); await blocked.promise; };
 const input = { requestId: 'concurrent-revision', expectedContentRevision: original.contentRevision, instruction: 'Explain the same topic to a novice.' };
 const first = f.service.revise('org', 'owner', f.campaign.id, original.id, input); await entered.promise;
 const second = await f.make().revise('org', 'owner', f.campaign.id, original.id, input);
 expect(second.production.items[0].state).toBe('in_progress'); expect(f.calls.model).toBe(2);
 expect((await f.campaigns.get('org', f.campaign.id)).items[0].contentRevision).toBe(original.contentRevision + 1);
 blocked.resolve(); await first; expect(f.calls.model).toBe(2);
});

test('Telegram revision returns exact continuation input so a length choice resumes the same revision once', async () => {
 const f = await fixture({ platform: 'telegram' }), item = (await f.campaigns.get('org', f.campaign.id)).items[0];
 const request = { requestId: 'telegram-revision', expectedContentRevision: item.contentRevision, instruction: 'Explain a maintenance checklist for a novice.' };
 const revised = await f.service.revise('org', 'owner', f.campaign.id, item.id, request);
 expect(revised.production.items[0].state).toBe('needs_length'); expect(f.calls.model).toBe(0);
 const question = revised.production.questions[0], resumed = { ...revised.resumeInput,
  itemOverrides: { ...revised.resumeInput.itemOverrides, [item.id]: { ...revised.resumeInput.itemOverrides[item.id], lengthChoiceId: question.lengthOptions[0].id } } };
 const complete = await f.make().prepare('org', 'owner', resumed);
 expect(complete.items[0].state).toBe('ready'); expect(f.calls.model).toBe(1);
 expect((await f.campaigns.get('org', f.campaign.id)).items[0].contentRevision).toBe(revised.contentRevision + 1);
 await f.make().prepare('org', 'owner', resumed); await f.make().revise('org', 'owner', f.campaign.id, item.id, request);
 expect(f.calls.model).toBe(1);
 expect(operations(f)[0].sourceIds).toContain('resource:editorial:' + revised.resumeInput.requestId);
});

test('explicit revision cannot bypass original in-flight or unknown model results', async () => {
 const f = await fixture(), entered = wait(), blocked = wait();
 f.editorial.model = async () => { entered.resolve(); await blocked.promise; throw new Error('response lost'); };
 const first = f.service.prepare('org', 'owner', f.input); await entered.promise;
 const item = (await f.campaigns.get('org', f.campaign.id)).items[0];
 const request = { requestId: 'forbidden-revision', expectedContentRevision: item.contentRevision, instruction: 'Try a new version.' };
 await expect(f.service.revise('org', 'owner', f.campaign.id, item.id, request)).rejects.toHaveProperty('code', 'CAMPAIGN_REVISION_PREVIOUS_WORK_PENDING');
 blocked.resolve(); await first;
 await expect(f.service.revise('org', 'owner', f.campaign.id, item.id, request)).rejects.toHaveProperty('code', 'CAMPAIGN_REVISION_PREVIOUS_WORK_PENDING');
 expect(f.calls.model).toBe(1); expect((await f.campaigns.get('org', f.campaign.id)).items[0].contentRevision).toBe(item.contentRevision);
});

test('prepare-only autopilot permission finishes ready without approving or attempting delivery', async () => {
 const f = await fixture({ autopilot: true });
 const grant = await f.store.read('org', 'grant', f.grant.id); grant.payload.actions = ['prepare', 'editorial_decide', 'generate_paid'];
 await f.store.put({ ...grant, expectedRevision: grant.revision });
 const result = await f.service.prepare('org', 'owner', f.input);
 expect(result.items[0].state).toBe('ready'); expect(f.calls.publish).toHaveLength(0);
 const item = (await f.campaigns.get('org', f.campaign.id)).items[0]; expect(item.approval).toBeUndefined(); expect(item.state).toBe('ready');
 expect(operations(f)[0].payload.deliveryRequiresApproval).toBe(true);
});


test('selected saved adaptation source reaches production and native persistence instead of core text',async()=>{
 const f=await fixture({sourceBound:true});const result=await f.service.prepare('org','owner',f.input);
 expect(result.items[0].state).toBe('ready');expect(f.calls.requests[0].sourceArtifact.text).toContain('NINE');expect(f.calls.requests[0].candidate.title).toBe('Exact selected post');
 expect(f.calls.native[0].material.sourceArtifact).toEqual(f.currentSource.value.ref);expect(f.calls.model).toBe(1);
 f.currentSource.value.ref={...f.currentSource.value.ref,revision:'c'.repeat(64)};
 const stale=await f.service.prepare('org','owner',f.input);expect(stale.items[0].code).toBe('SOURCE_ARTIFACT_STALE');expect(f.calls.model).toBe(1);expect(f.calls.native).toHaveLength(1);
});
test('inflight post edit retains paid raw output and blocks stale artwork/native application',async()=>{
 const f=await fixture({sourceBound:true});f.editorial.model=async()=>{f.currentSource.value.ref={...f.currentSource.value.ref,revision:'c'.repeat(64)};};
 const result=await f.service.prepare('org','owner',f.input),op=operations(f)[0].payload;
 expect(result.items[0].code).toBe('SOURCE_ARTIFACT_STALE');expect(op.output).toBeDefined();expect(op.state).toBe('needs_revision');expect(op.baseInput.sourceArtifact.ref.revision).toBe('a'.repeat(64));
 expect(f.calls.artwork).toBe(0);expect(f.calls.native).toHaveLength(0);expect((await f.autonomy.getAction('org',op.actionId)).state).toBe('prepared');
 await f.service.prepare('org','owner',f.input);expect(f.calls.model).toBe(1);
});
test('explicit source-bound revision updates only the chosen sibling',async()=>{
 const f=await fixture({sourceBound:true,count:2});await f.service.prepare('org','owner',f.input);const before=await f.campaigns.get('org',f.campaign.id),chosen=before.items[0],sibling=before.items[1];
 f.currentSource.value.ref={...f.currentSource.value.ref,revision:'c'.repeat(64)};f.currentSource.value.text='TEN minutes after the author correction.';
 const revised=await f.service.revise('org','owner',f.campaign.id,chosen.id,{requestId:'explicit-source-edit',expectedContentRevision:chosen.contentRevision,instruction:'Use the corrected selected post',sourceArtifact:f.currentSource.value.ref});
 expect(revised.production.items[0].state).toBe('ready');expect(f.calls.requests.at(-1).sourceArtifact.text).toContain('TEN');expect((await f.campaigns.get('org',f.campaign.id)).items.find(x=>x.id===sibling.id)).toEqual(sibling);
});
test('local Reel continuation imports once and repeats without another model or sibling mutation',async()=>{
 const f=await fixture({sourceBound:true,count:2,platform:'instagram',format:'reel'});f.editorial.assets=[coverAsset()];const prepared=await f.service.prepare('org','owner',f.input),first=prepared.items[0];
 const before=await f.campaigns.get('org',f.campaign.id),item=before.items.find(x=>x.id===first.itemId),sibling=before.items.find(x=>x.id!==item.id),models=f.calls.model;
 const done=await f.service.renderLocal('org','owner',{operationId:first.operationId,expectedContentRevision:item.contentRevision});expect(done.state).toBe('ready');expect(done.material.assets.filter(a=>a.kind==='video')).toHaveLength(1);expect(f.calls.model).toBe(models);
 const after=await f.campaigns.get('org',f.campaign.id);expect(after.items.find(x=>x.id===sibling.id)).toEqual(sibling);
 await f.service.renderLocal('org','owner',{operationId:first.operationId,expectedContentRevision:after.items.find(x=>x.id===item.id).contentRevision});expect(f.calls.localRender).toBe(1);
});


test('unsupported connected format is refused before any expert or producer admission',async()=>{
 const f=await fixture({platform:'instagram',format:'post',autopilot:true});const result=await f.service.prepare('org','owner',f.input);
 expect(result.items[0]).toMatchObject({state:'needs_input',code:'EDITORIAL_FORMAT_UNSUPPORTED'});expect(f.calls.decisions).toBe(0);expect(f.calls.model).toBe(0);expect(f.calls.producer).toBe(0);expect(operations(f)).toHaveLength(0);
});

test.each([false,true])('known legacy unsupported draft post resumes its same operation and preserves actual decision state (autopilot=%s)',async(autopilot)=>{
 const f=await fixture({draft:true,platform:'instagram',format:'post',autopilot});
 f.editorial.beforeModel=async()=>{throw Error('Unsupported editorial format: instagram/post');};
 const blocked=await f.service.prepare('org','owner',f.input),old=operations(f)[0].payload;
 expect(blocked.items[0].state).toBe('needs_input');expect(old.state).toBe('uncertain');expect(f.calls.model).toBe(0);expect(f.calls.decisions).toBe(autopilot?1:0);
 delete f.editorial.beforeModel;
 const record=await f.store.read('org','editorial',old.id);delete record.payload.productionPreflightVersion;delete record.payload.primaryProducerAttempt;await f.store.put({...record,expectedRevision:record.revision});
 const envKeys=['NODE_ENV','CF_LOCAL_PREFLIGHT_RECOVERY_OPERATION','CF_LOCAL_PREFLIGHT_RECOVERY_DIGEST','FRONTEND_URL','BACKEND_INTERNAL_URL','DATABASE_URL'],previous=Object.fromEntries(envKeys.map(k=>[k,process.env[k]]));Object.assign(process.env,{NODE_ENV:'development',FRONTEND_URL:'http://127.0.0.1:9991',BACKEND_INTERNAL_URL:'http://127.0.0.1:9992',DATABASE_URL:'postgresql://fixture:fixture@127.0.0.1:9993/fixture',CF_LOCAL_PREFLIGHT_RECOVERY_OPERATION:old.id,CF_LOCAL_PREFLIGHT_RECOVERY_DIGEST:old.inputDigest});
 try{
 const resumed=await f.service.prepare('org','owner',{...f.input,requestId:'new-native-continuation',instruction:'Continue the same saved request.'}),current=operations(f)[0].payload;
 expect(resumed.items[0].state).toBe('ready');expect(current.id).toBe(old.id);expect(current.productionPreflightVersion).toBe(1);expect(current.primaryProducerAttempt).toMatchObject({version:1});expect(current.localPreflightRecovery).toMatchObject({version:1,reason:'EDITORIAL_FORMAT_UNSUPPORTED',producerAttempted:false});
 expect(f.calls.decisions).toBe(autopilot?1:0);expect(f.calls.model).toBe(1);expect(f.calls.publish).toHaveLength(0);
 expect((await f.autonomy.getAction('org',old.actionId))).toMatchObject({state:'failed',localPreflightFailure:{operationId:old.id,producerAttempted:false}});
 const priorEvents=[...f.store.rows.values()].filter(row=>row.payload.type==='autonomy_action_event'&&row.parentId===old.actionId);
 expect(priorEvents.some(row=>row.payload.state==='uncertain')).toBe(true);expect(priorEvents.some(row=>row.payload.state==='failed'&&row.payload.localPreflightFailure)).toBe(true);
 expect(current.decision).toEqual(old.decision);expect(current.effectiveInput).toEqual(old.effectiveInput);expect(current.inputDigest).toBe(old.inputDigest);expect(f.calls.requests.at(-1).brief.instruction).toBe((old.effectiveInput??old.baseInput).brief.instruction);
 }finally{for(const key of envKeys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}}
});


test.each(['current-version','producer-attempt','wrong-digest','saved-output','producer-status','source-digest','production-env','foreign-frontend','foreign-backend','foreign-database','missing-allowlist'])('local preflight recovery never resets %s uncertainty',async(boundary)=>{
 const f=await fixture({draft:true,platform:'instagram',format:'post'});f.editorial.beforeModel=async()=>{throw Error('Unsupported editorial format: instagram/post');};await f.service.prepare('org','owner',f.input);delete f.editorial.beforeModel;
 const record=operations(f)[0],old=structuredClone(record.payload);
 if(boundary!=='current-version')delete record.payload.productionPreflightVersion;
 if(boundary==='producer-attempt')record.payload.primaryProducerAttempt={version:1,at:'2026-11-04T12:00:00Z'};
 if(boundary==='saved-output')record.payload.output={title:'Already obtained model output'};
 if(boundary==='producer-status')record.payload.producerStatus='needs_revision';
 if(boundary==='source-digest')record.payload.sourceDigest='known-source-digest';
 await f.store.put({...record,expectedRevision:record.revision});
 const keys=['NODE_ENV','CF_LOCAL_PREFLIGHT_RECOVERY_OPERATION','CF_LOCAL_PREFLIGHT_RECOVERY_DIGEST','FRONTEND_URL','BACKEND_INTERNAL_URL','DATABASE_URL'],previous=Object.fromEntries(keys.map(k=>[k,process.env[k]]));Object.assign(process.env,{NODE_ENV:'development',FRONTEND_URL:'http://127.0.0.1:9991',BACKEND_INTERNAL_URL:'http://127.0.0.1:9992',DATABASE_URL:'postgresql://fixture:fixture@127.0.0.1:9993/fixture',CF_LOCAL_PREFLIGHT_RECOVERY_OPERATION:old.id,CF_LOCAL_PREFLIGHT_RECOVERY_DIGEST:boundary==='wrong-digest'?'other':old.inputDigest});
 if(boundary==='production-env')process.env.NODE_ENV='production';
 if(boundary==='foreign-frontend')process.env.FRONTEND_URL='https://foreign.example';
 if(boundary==='foreign-backend')process.env.BACKEND_INTERNAL_URL='https://foreign.example';
 if(boundary==='foreign-database')process.env.DATABASE_URL='postgresql://fixture:fixture@foreign.example/fixture';
 if(boundary==='missing-allowlist')delete process.env.CF_LOCAL_PREFLIGHT_RECOVERY_OPERATION;
 try{await f.service.prepare('org','owner',f.input);expect(operations(f)[0].payload.state).toBe('uncertain');expect(f.calls.model).toBe(0);expect((await f.autonomy.getAction('org',old.actionId)).state).toBe('uncertain');}
 finally{for(const k of keys){if(previous[k]===undefined)delete process.env[k];else process.env[k]=previous[k];}}
});


test('known local scene validation is returned as a local blocker with the paid output retained',async()=>{
 const f=await fixture({sourceBound:true,count:2,platform:'instagram',format:'reel'});f.editorial.assets=[coverAsset()];const prepared=await f.service.prepare('org','owner',f.input),first=prepared.items[0],before=await f.campaigns.get('org',f.campaign.id),item=before.items.find(x=>x.id===first.itemId),sibling=before.items.find(x=>x.id!==item.id),raw=structuredClone(operations(f)[0].payload.output),models=f.calls.model;
 f.localReels.produce=async()=>{throw Error('LOCAL_REEL_SCREEN_TEXT_AMBIGUOUS');};
 const blocked=await f.service.renderLocal('org','owner',{operationId:first.operationId,expectedContentRevision:item.contentRevision});
 expect(blocked).toMatchObject({state:'needs_video',code:'LOCAL_REEL_SCREEN_TEXT_AMBIGUOUS',localRender:{state:'needs_input',primaryPreparation:'saved',primaryRetryAllowed:false}});expect(f.calls.model).toBe(models);expect(operations(f)[0].payload.output).toEqual(raw);expect(operations(f)[0].payload.localReel).toBeUndefined();expect((await f.campaigns.get('org',f.campaign.id)).items.find(x=>x.id===sibling.id)).toEqual(sibling);
});

const costUnavailable = 'AUTONOMY_COST_ESTIMATE_UNAVAILABLE';
test.each([0, 10])('finite total budget %s blocks fresh expert and primary with a recoverable preflight', async maximum => {
 const f = await fixture({ autopilot: true, grantFields: { budget: { currency: 'USD', maximum } } });
 for (let i=0; i<2; i++) {
  const result = await f.make().prepare('org', 'owner', f.input);
  expect(result.items[0]).toMatchObject({ state:'needs_input', code:costUnavailable, detail:expect.stringContaining('not dispatched') });
  const op=operations(f)[0].payload;
  expect(op.state).toBe('preflight_failed');expect(op.primaryProducerAttempt).toBeUndefined();expect(op.owner).toBeUndefined();expect(op.leaseUntil).toBeUndefined();
  expect((await f.autonomy.getAction('org',op.actionId)).state).toBe('failed');
 }
 expect(f.calls.decisions).toBe(0);expect(f.calls.producer).toBe(0);expect(f.calls.model).toBe(0);
});
test('an applicable provider budget blocks actual billing route without guessing its payer',async()=>{
 const f=await fixture({autopilot:true,grantFields:{providerBudget:{provider:'fixture',payer:'owner-defined-payer',currency:'USD',maximum:0}}});
 const result=await f.service.prepare('org','owner',f.input);
 expect(result.items[0].code).toBe(costUnavailable);expect(f.calls.decisions).toBe(0);expect(f.calls.model).toBe(0);
});
test('an unrelated Higgsfield credit budget permits the unbudgeted text route without conversion',async()=>{
 const f=await fixture({autopilot:true,grantFields:{providerBudget:{provider:'higgsfield',payer:'personal',currency:'CRD',maximum:0}}});
 const result=await f.service.prepare('org','owner',f.input);
 expect(result.items[0].state).toBe('ready');expect(f.calls.model).toBe(1);expect(f.calls.decisions).toBe(1);
});
test('paid planning is refused before taking a discovering lease and repeats stay actionable',async()=>{
 const f=await fixture({autopilot:true,grantFields:{providerBudget:{provider:'tavily',payer:'own',currency:'USD',maximum:1}}});
 for(let i=0;i<2;i++){
  const result=await f.make().prepare('org','owner',{...f.input,allowWebSearch:true});
  expect(result.items[0]).toMatchObject({state:'needs_input',code:costUnavailable,detail:expect.stringContaining('not dispatched')});
 }
 expect(f.calls.discover).toBe(0);expect(f.calls.model).toBe(0);expect(f.calls.decisions).toBe(0);
 expect([...f.store.rows.values()].some(row=>row.payload.type==='campaign_destination_plan')).toBe(false);
});
test('a saved destination plan remains readable under its finite budget without a new discovery',async()=>{
 const f=await fixture({autopilot:true,grantFields:{providerBudget:{provider:'capped-route',payer:'own',currency:'USD',maximum:0}}});
 const input={...f.input,allowWebSearch:true};
 await f.service.plan('org','owner',input);
 f.planning.unpricedPreparationProviders=async()=>{throw new Error('saved plan must not inspect changed paid routes');};
 const saved=await f.make().plan('org','owner',input);
 expect(saved.items[0].state).toBe('planned');expect(f.calls.discover).toBe(1);expect(f.calls.model).toBe(0);
});
test('the immediate primary gate catches a billing-route change before stamping a producer attempt',async()=>{
 const f=await fixture({autopilot:true,grantFields:{providerBudget:{provider:'capped-route',payer:'own',currency:'USD',maximum:1}}});
 f.editorial.beforeModel=async()=>{actualConfigRead=async()=>({provider:'capped-route',apiKey:'synthetic-configured-key',modelRouting:{advancedModel:'fixture-advanced'}});};
 const result=await f.service.prepare('org','owner',f.input);
 expect(result.items[0].code).toBe(costUnavailable);expect(f.calls.model).toBe(0);expect(operations(f)[0].payload.primaryProducerAttempt).toBeUndefined();
 expect(operations(f)[0].payload.decision).toBeDefined();
});
test('a captured primary result is restored without consulting cost or sending another model call',async()=>{
 const f=await fixture({autopilot:true,grantFields:{providerBudget:{provider:'capped-route',payer:'own',currency:'USD',maximum:0}}});
 f.editorial.artwork=async()=>{throw new Error('local artwork interrupted');};
 const failed=await f.service.prepare('org','owner',f.input),opId=failed.items[0].operationId;
 actualConfigRead=async()=>{throw new Error('saved-output recovery must not resolve a billing route');};
 delete f.editorial.artwork;
 const item=(await f.campaigns.get('org',f.campaign.id)).items[0];
 const result=await f.make().reinspect('org','owner',opId,{expectedContentRevision:item.contentRevision});
 expect(result.state).toBe('ready');expect(f.calls.model).toBe(1);expect(f.calls.decisions).toBe(1);
});

test.each(['collaborative','prepare_approve'])('finite caps also guard human-authorized %s preparation',async mode=>{
 const f=await fixture();
 const grant=await f.autonomy.grant('org',{authority:'user',actorId:'owner',requestId:mode,mode,channelIds:['channel'],actions:['prepare'],expiresAt:'2099-01-01T00:00:00Z',platformConsentIds:[],budget:{currency:'USD',maximum:0}});
 await f.campaigns.setMode('org',f.campaign.id,{actorId:'owner',mode,grantId:grant.id});
 const result=await f.service.prepare('org','owner',f.input);
 expect(result.items[0].code).toBe(costUnavailable);expect(f.calls.model).toBe(0);expect(f.calls.producer).toBe(0);
});
test('an unknown paid analytics provider blocks under a provider-only cap before discovery',async()=>{
 const f=await fixture({autopilot:true,grantFields:{providerBudget:{provider:'higgsfield',payer:'personal',currency:'CRD',maximum:0}}});
 f.planning.unpricedPreparationProviders=async()=>[undefined];
 const result=await f.service.prepare('org','owner',f.input);
 expect(result.items[0].code).toBe(costUnavailable);expect(f.calls.discover).toBe(0);expect(f.calls.decisions).toBe(0);expect(f.calls.model).toBe(0);
});

test('a nested active capped billing route cannot be exempted by a changed stored provider',async()=>{
 const f=await fixture({autopilot:true,grantFields:{providerBudget:{provider:'openrouter',payer:'own',currency:'USD',maximum:0}}});
 activeConfig={provider:'openrouter'}; // Native turn still owns this admitted config; stored fixture provider is different.
 const result=await f.service.prepare('org','owner',f.input);
 expect(result.items[0].code).toBe(costUnavailable);expect(f.calls.decisions).toBe(0);expect(f.calls.model).toBe(0);
});

test('actual primary dispatch rechecks the bound admission config before model construction or attempt stamp',async()=>{
 const f=await fixture({autopilot:true,grantFields:{providerBudget:{provider:'openrouter',payer:'own',currency:'USD',maximum:0}}});
 const construct=jest.fn(async()=>{throw new Error('a capped model must not be constructed');});
 const {SocialEditorialProductionV1:RealEditorial}=loadTypeScriptModule(root+'editorial/social-editorial-production.v1.ts',{
  '../../../openai/ai.clients':{getChatModel:construct},'./assets/editorial-assets.v1':{EditorialAssetsV1:class{}},
 });
 let admissions=0;
 f.service.editorial=new RealEditorial({executeAiOperation:async(_org,_op,run)=>{admissions++;activeConfig={provider:'openrouter'};return run();}},
  {create:async()=>[]},{mediaInWorkspace:async()=>[]},{read:async()=>({documents:[],admissions:[],gaps:[]})});
 const result=await f.service.prepare('org','owner',f.input);
 expect(result.items[0].code).toBe(costUnavailable);expect(admissions).toBe(1);expect(construct).not.toHaveBeenCalled();
 expect(operations(f)[0].payload).toMatchObject({state:'preflight_failed'});expect(operations(f)[0].payload.primaryProducerAttempt).toBeUndefined();
});
test('a planning route changing after lease acquisition is blocked and releases its lease for retry',async()=>{
 const f=await fixture({autopilot:true,grantFields:{providerBudget:{provider:'tavily',payer:'own',currency:'USD',maximum:0}}});
 let reads=0;f.planning.unpricedPreparationProviders=async()=>++reads===1?['fixture']:['fixture','tavily'];
 const result=await f.service.prepare('org','owner',{...f.input,allowWebSearch:true});
 expect(result.items[0].code).toBe(costUnavailable);
 const plan=[...f.store.rows.values()].find(row=>row.payload.type==='campaign_destination_plan').payload;
 expect(plan).toMatchObject({state:'preflight_failed',blocker:costUnavailable});expect(plan.owner).toBeUndefined();expect(plan.leaseUntil).toBeUndefined();expect(f.calls.discover).toBe(0);expect(f.calls.model).toBe(0);
 expect((await f.make().prepare('org','owner',{...f.input,allowWebSearch:true})).items[0].code).toBe(costUnavailable);
});


test('routine autopilot preparation uses no expert and needs no advanced model',async()=>{
 const f=await fixture({autopilot:true,platform:'telegram'});delete f.input.editorialReview;advancedConfigured=false;
 const result=await f.service.prepare('org','owner',f.input);
 expect(result.items[0].state).toBe('ready');expect(f.calls.decisions).toBe(0);expect(f.calls.model).toBe(1);
 expect(f.calls.requests[0].brief.lengthChoiceId).toBeTruthy();expect(f.calls.requests[0].brief.lengthGuidance).toContain('characters');
 expect(operations(f)[0].payload.decision).toBeUndefined();
});
test('routine autopilot retains grant and source guards before generation',async()=>{
 const f=await fixture({autopilot:true,sourceBound:true});delete f.input.editorialReview;
 await f.autonomy.revoke('org',f.grant.id,'owner');
 const result=await f.service.prepare('org','owner',f.input);
 expect(result.items[0].state).toBe('needs_input');expect(f.calls.decisions).toBe(0);expect(f.calls.model).toBe(0);
});
test('complex editor intent is frozen and a retry cannot silently drop it',async()=>{
 const f=await fixture({autopilot:true});f.editorial.artwork=async()=>{throw Error('local artwork interrupted');};
 await f.service.prepare('org','owner',f.input);expect(operations(f)[0].payload.editorialReview).toBe('complex');
 const retry={...f.input};delete retry.editorialReview;
 const result=await f.make().prepare('org','owner',retry);
 expect(result.items[0].code).toBe('CAMPAIGN_PRODUCTION_INTENT_CHANGED');expect(f.calls.decisions).toBe(1);expect(f.calls.model).toBe(1);
});
