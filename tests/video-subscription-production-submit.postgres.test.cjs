const {randomUUID}=require('node:crypto');
const fixture=require('./helpers/video-subscription-domain.fixture.cjs');
const {loadTypeScriptModule}=require('./helpers/load-ts-module.cjs');
const {videoSourceRevisionV1}=loadTypeScriptModule('libraries/nestjs-libraries/src/videos/video-brief.v1.ts');
const {videoProductionDigestV1:digest}=loadTypeScriptModule('libraries/nestjs-libraries/src/videos/production/video-production.v1.ts');
const url=process.env.CF_VIDEO_DATABASE_URL;
if(url)fixture.assertDisposableDatabaseV1(url);
const domain=url?describe:describe.skip;
const withProduction=async (run,options={})=>{
  const f=await fixture.create(url);
  try{
    if(options.shortQuote)f.provider.script('heygen','quote_video',{kind:'quote',unit:'heygen_credit',credits:'0.125',upper_bound:null,expires_at:new Date(f.provider.runtime.now().getTime()+5000).toISOString()});
    const ready=await f.readySubscription({presenter:options.presenter});const job=await f.access.launch(ready.org,ready.actor,ready.launch);
    const stored=await f.db.videoSubscriptionJob.findUniqueOrThrow({where:{id:job.id}});
    const connection=await f.db.videoSubscriptionConnection.findUniqueOrThrow({where:{id:ready.connectionId}});
    const scene=options.presenter ? {id:'one',generationAttempt:0,kind:'presenter',durationSeconds:15,script:ready.draft.brief.script,avatarId:f.presenterSettings.avatarId,voiceId:f.presenterSettings.voiceId,engine:'avatar_iii',referenceMediaIds:[],sourceCaptions:'none'} : {id:'one',generationAttempt:0,kind:'generated_clip',durationSeconds:5,script:'',prompt:ready.draft.brief.prompt,clipSettings:f.clipSettings,referenceMediaIds:[],sourceCaptions:'none'};
    const manifest={version:2,pieceId:f.pieceId,pieceRevision:ready.draft.pieceRevision,title:'Frozen production',locale:'ru',aspectRatio:'9:16',resolution:'1080p',durationSeconds:scene.durationSeconds,audio:!!options.presenter,captions:!!options.presenter,scenes:[scene],funding:{kind:'personal_subscription',connections:{[connection.provider]:connection.id},finalProvider:connection.provider}};
    const preparation={connectionId:connection.id,provider:connection.provider,accountGeneration:connection.generation,operation:'generated_clip',walletDigest:connection.walletDigest,unit:connection.unit,perJob:connection.perJob.toFixed(),perMonth:connection.perMonth.toFixed(),request:stored.request};
    const approval={version:2,kind:'personal_subscription',id:randomUUID(),actorId:f.user.id,manifestDigest:digest(manifest),acceptedAt:f.provider.runtime.now().toISOString(),expiresAt:new Date(f.provider.runtime.now().getTime()+300000).toISOString(),creditLimits:[{connectionId:connection.id,unit:connection.unit,maxCredits:'1'}],blockers:[],scenes:[{sceneId:scene.id,key:'frozen-scene-key',kind:'generation',reused:false,jobId:job.id,preparation}],final:{provider:connection.provider,connectionId:connection.id,jobId:randomUUID(),preparation:{...preparation,operation:'final_composition'}}};
    const revision=await f.db.videoProductionRevision.create({data:{organizationId:f.org.id,userId:f.user.id,productionId:randomUUID(),revision:1,intentId:randomUUID(),manifest,digest:digest(manifest),approval,state:'approved'}});
    const snapshot={kind:'production/personal-v2',productionRevisionId:revision.id,manifestDigest:revision.digest,approvalId:approval.id,fundingDigest:digest(manifest.funding),details:{sceneId:scene.id,sceneKey:'frozen-scene-key',scene}};
    await f.db.videoSubscriptionJob.update({where:{id:job.id},data:{draftId:revision.id,draftVersion:revision.revision,snapshot}});
    Object.assign(f,{ready,job,revision,manifest,approval,snapshot});
    await run(f);
  }finally{await f.db.videoProductionRevision.deleteMany({where:{organizationId:{in:f.organizations}}});await f.close();}
};
domain('personal production frozen approval is checked in the subscription submission transaction',()=>{
  jest.setTimeout(30000);
  test('valid same actor/funding/source/approval submits once without changing source revision',()=>withProduction(async f=>{
    const before=await f.db.contentPiece.findUniqueOrThrow({where:{id:f.pieceId}});
    await f.subscriptions.runStep(f.org.id,f.job.id);await f.subscriptions.runStep(f.org.id,f.job.id);
    const after=await f.db.contentPiece.findUniqueOrThrow({where:{id:f.pieceId}});
    expect(videoSourceRevisionV1(after)).toBe(videoSourceRevisionV1(before));expect(f.provider.state.submits).toHaveLength(1);
  }));
  test.each(['stop','pause','source','actor','approval','unaccepted','membership','funding','manifest','request','scene'])('%s change before submit performs no paid mutation',reason=>withProduction(async f=>{
    if(reason==='stop'||reason==='pause')await f.db.videoProductionRevision.update({where:{id:f.revision.id},data:{state:reason==='stop'?'stopped':'needs_attention',...(reason==='stop'?{stoppedAt:new Date()}: {})}});
    if(reason==='source')await f.db.contentPiece.update({where:{id:f.pieceId},data:{body:'Changed after approval'}});
    if(reason==='actor')await f.db.videoProductionRevision.update({where:{id:f.revision.id},data:{userId:f.otherUser.id}});
    if(['approval','unaccepted','membership'].includes(reason)){
      const approval=structuredClone(f.approval);
      if(reason==='approval')approval.id=randomUUID();
      if(reason==='unaccepted')delete approval.acceptedAt;
      if(reason==='membership')approval.scenes=[];
      await f.db.videoProductionRevision.update({where:{id:f.revision.id},data:{approval}});
    }
    if(reason==='funding'||reason==='manifest')await f.db.videoSubscriptionJob.update({where:{id:f.job.id},data:{snapshot:{...f.snapshot,[reason==='funding'?'fundingDigest':'manifestDigest']:'changed'}}});
    if(reason==='request')await f.db.videoSubscriptionJob.update({where:{id:f.job.id},data:{request:{...f.approval.scenes[0].preparation.request,args:{unapproved:'changed'}}}});
    if(reason==='scene')await f.db.videoSubscriptionJob.update({where:{id:f.job.id},data:{snapshot:{...f.snapshot,details:{...f.snapshot.details,scene:{...f.manifest.scenes[0],prompt:'Changed scene'}}}}});
    const quotes=f.provider.state.quotes.length;
    await f.subscriptions.runStep(f.org.id,f.job.id);
    const row=await f.db.videoSubscriptionJob.findUniqueOrThrow({where:{id:f.job.id}});
    expect(row.state).toBe('access_unavailable');expect(row.submitAttempts).toBe(0);expect(row.receipt).toBeNull();
    expect(row.errorCode).toBe(reason==='source'?'VIDEO_SOURCE_CHANGED':reason==='stop'?'VIDEO_PRODUCTION_STOPPED':reason==='pause'?'VIDEO_PRODUCTION_PAUSED':'VIDEO_PRODUCTION_APPROVAL_STALE');
    expect(f.provider.state.quotes).toHaveLength(quotes);expect(f.provider.state.submits).toHaveLength(0);
  }));
  test.each(['stop','source'])('%s winning the transaction read/claim race blocks stale submit',reason=>withProduction(async f=>{
    const transaction=f.subscriptionRepository.transaction.bind(f.subscriptionRepository);let flipped=false;
    f.subscriptionRepository.transaction=run=>transaction(tx=>{
      const model=reason==='stop'?'videoProductionRevision':'contentPiece';
      const proxy=new Proxy(tx,{get(target,key){if(key!==model)return target[key];return new Proxy(target[key],{get(repository,method){if(method!=='findFirst')return repository[method];return async args=>{const result=await repository.findFirst(args);if(!flipped&&result){flipped=true;if(reason==='stop')await f.db.videoProductionRevision.update({where:{id:f.revision.id},data:{state:'stopped',stoppedAt:new Date()}});else await f.db.contentPiece.update({where:{id:f.pieceId},data:{body:'Concurrent source update'}});}return result;};}});}});
      return run(proxy);
    });
    await f.subscriptions.runStep(f.org.id,f.job.id);
    const row=await f.db.videoSubscriptionJob.findUniqueOrThrow({where:{id:f.job.id}});
    expect(flipped).toBe(true);expect(row.submitAttempts).toBe(0);expect(row.state).toBe('access_unavailable');expect(f.provider.state.submits).toHaveLength(0);
    expect(row.errorCode).toBe(reason==='stop'?'VIDEO_PRODUCTION_STOPPED':'VIDEO_SOURCE_CHANGED');
  }));
  test.each(['valid','replaced-image','wrong-unit','over-reservation','unapproved-args','unapproved-tool','missing-pin','invalid-pin'])('deferred final ready_assets %s uses its existing native-credit reservation and owned source image',reason=>withProduction(async f=>{
    // The final provider profile is still unavailable. Exercise the actual
    // transaction guard without executing a fictional composition operation.
    const image=await f.db.media.create({data:{organizationId:f.org.id,name:'source.png',path:'https://93.184.216.34/owned-reference.png',type:'image'}});
    const scene={...f.manifest.scenes[0],kind:'image',mediaId:image.id};delete scene.clipSettings;delete scene.prompt;
    const manifest={...f.manifest,scenes:[scene]},manifestDigest=digest(manifest);
    const original={...f.approval.final.preparation,request:{...f.approval.final.preparation.request,args:{stage:'quote',manifestDigest}}};
    const approval={...f.approval,manifestDigest,scenes:[{sceneId:scene.id,key:'owned-image-key',kind:'asset',reused:false,mediaId:image.id}],final:{...f.approval.final,jobId:f.job.id,preparation:original}};
    const resolved=[{sceneId:scene.id,mediaId:reason==='replaced-image'?randomUUID():image.id,durationSeconds:5,sourceCaptions:'none'}];
    const quote={...original.request.quote,...(reason==='wrong-unit'?{unit:'USD'}:{}),...(reason==='over-reservation'?{amount:'100'}:{})};
    const request={...original.request,args:{stage:'ready_assets',manifestDigest,resolvedScenes:resolved},quote};
    if(reason!=='missing-pin')approval.final.readyRequestDigest=reason==='invalid-pin'?'invalid':digest(request);
    const submitted=reason==='unapproved-args'?{...request,args:{prompt:'unapproved'}}:reason==='unapproved-tool'?{...request,tool:'unapproved_tool'}:request;
    await f.db.videoProductionRevision.update({where:{id:f.revision.id},data:{manifest,digest:manifestDigest,approval}});
    const snapshot={...f.snapshot,manifestDigest,details:{resolvedScenes:resolved}};
    const row=await f.db.videoSubscriptionJob.update({where:{id:f.job.id},data:{request:submitted,quote,snapshot}});
    expect(digest(request)).not.toBe(digest(original.request));
    const validate=()=>f.subscriptionRepository.transaction(tx=>f.subscriptions.assertPersonalProductionSubmit(tx,f.org.id,row));
    if(reason==='valid')await expect(validate()).resolves.toBeUndefined();
    else if(reason==='unapproved-args'||reason==='unapproved-tool'){
      await f.subscriptions.runStep(f.org.id,f.job.id);
      const blocked=await f.db.videoSubscriptionJob.findUniqueOrThrow({where:{id:f.job.id}});
      expect(blocked.state).toBe('access_unavailable');expect(blocked.errorCode).toBe('VIDEO_PRODUCTION_APPROVAL_STALE');
    }else await expect(validate()).rejects.toMatchObject({});
    expect((await f.db.videoSubscriptionJob.findUniqueOrThrow({where:{id:f.job.id}})).submitAttempts).toBe(0);
    expect(f.provider.state.submits).toHaveLength(0);
  }));
  test.each(['direct','personal'])('native quote remains fresh at claim for %s presenter after catalog reads',async mode=>{
    const run=async f=>{
      if(!f.job){
        f.provider.script('heygen','quote_video',{kind:'quote',unit:'heygen_credit',credits:'0.125',upper_bound:null,expires_at:new Date(f.provider.runtime.now().getTime()+5000).toISOString()});
        const ready=await f.readySubscription({presenter:true});f.job=await f.access.launch(ready.org,ready.actor,ready.launch);
      }
      const quotes=f.provider.state.quotes.length,fetch=f.provider.runtime.fetch.bind(f.provider.runtime);let advanced=false;
      f.provider.runtime.fetch=async(def,url,init)=>{const response=await fetch(def,url,init);const rpc=typeof init?.body==='string'&&String(url).endsWith('/mcp')?JSON.parse(init.body):null;
        if(!advanced&&rpc?.method==='tools/call'&&rpc.params.name==='list_voices'){advanced=true;f.provider.advance(6000);}return response;};
      await f.subscriptions.runStep(f.org.id,f.job.id);
      const row=await f.db.videoSubscriptionJob.findUniqueOrThrow({where:{id:f.job.id}});
      expect(advanced).toBe(true);expect(row.state).toBe('access_unavailable');expect(row.errorCode).toBe('VIDEO_PREFLIGHT_STALE');expect(row.submitAttempts).toBe(0);
      expect(f.provider.state.submits).toHaveLength(0);expect(f.provider.state.quotes).toHaveLength(quotes);
    };
    if(mode==='personal')return withProduction(run,{presenter:true,shortQuote:true});
    const f=await fixture.create(url);try{await run(f);}finally{await f.close();}
  });
  test.each(['expired-at-claim','invalid'])('native quote %s cannot enter submitting even after earlier identity checks',async reason=>{
    const f=await fixture.create(url);
    try{
      f.provider.script('heygen','quote_video',{kind:'quote',unit:'heygen_credit',credits:'0.125',upper_bound:null,expires_at:new Date(f.provider.runtime.now().getTime()+5000).toISOString()});
      const ready=await f.readySubscription({presenter:true}),job=await f.access.launch(ready.org,ready.actor,ready.launch);
      if(reason==='invalid'){
        const row=await f.db.videoSubscriptionJob.findUniqueOrThrow({where:{id:job.id}});
        await f.db.videoSubscriptionJob.update({where:{id:job.id},data:{request:{...row.request,quote:{...row.request.quote,expiresAt:'not-a-date'}}}});
      }else{
        const connection=f.subscriptionRepository.connection.bind(f.subscriptionRepository);let advanced=false;
        f.subscriptionRepository.connection=async(...args)=>{const result=await connection(...args);if(!advanced&&args[3]&&args[3]!==f.db){advanced=true;f.provider.advance(6000);}return result;};
      }
      const quotes=f.provider.state.quotes.length;await f.subscriptions.runStep(f.org.id,job.id);
      const row=await f.db.videoSubscriptionJob.findUniqueOrThrow({where:{id:job.id}});
      expect(row.state).toBe('access_unavailable');expect(row.errorCode).toBe('VIDEO_PREFLIGHT_STALE');expect(row.submitAttempts).toBe(0);expect(f.provider.state.submits).toHaveLength(0);expect(f.provider.state.quotes).toHaveLength(quotes);
    }finally{await f.close();}
  });
  test('native quote expiry does not stop the already-paid receipt polling and import',async()=>{
    const f=await fixture.create(url);
    try{
      f.provider.script('heygen','quote_video',{kind:'quote',unit:'heygen_credit',credits:'0.125',upper_bound:null,expires_at:new Date(f.provider.runtime.now().getTime()+5000).toISOString()});
      const ready=await f.readySubscription({presenter:true}),job=await f.access.launch(ready.org,ready.actor,ready.launch);
      await f.subscriptions.runStep(f.org.id,job.id);f.provider.advance(6000);
      expect((await f.runSubscriptionToTerminal(job.id)).state).toBe('completed');expect(f.provider.state.submits).toHaveLength(1);
    }finally{await f.close();}
  });
  test('legacy direct subscription remains independent of production lookup',async()=>{
    const f=await fixture.create(url);let lookup;
    try{
      const ready=await f.readySubscription();const job=await f.access.launch(ready.org,ready.actor,ready.launch);
      lookup=jest.spyOn(f.db.videoProductionRevision,'findFirst').mockImplementation(()=>{throw new Error('Legacy job must not load a production draft');});
      await f.subscriptions.runStep(f.org.id,job.id);
      expect(f.provider.state.submits).toHaveLength(1);expect(lookup).not.toHaveBeenCalled();
    }finally{lookup?.mockRestore();await f.close();}
  });
  test('already submitted receipt still polls and imports after stop/source edit',()=>withProduction(async f=>{
    await f.subscriptions.runStep(f.org.id,f.job.id);
    await f.db.videoProductionRevision.update({where:{id:f.revision.id},data:{state:'stopped',stoppedAt:new Date()}});
    await f.db.contentPiece.update({where:{id:f.pieceId},data:{body:'Changed after accepted send'}});
    expect((await f.runSubscriptionToTerminal(f.job.id)).state).toBe('completed');expect(f.provider.state.submits).toHaveLength(1);
  }));
});
