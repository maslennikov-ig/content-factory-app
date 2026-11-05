'use strict';
const {nativeFixture}=require('./helpers/hgg-native-pilot-fixture.cjs');
const {setup,THREAD}=require('./helpers/native-clip-production.fixture.cjs');
const {fixture}=require('./helpers/source-artifact.fixture.cjs');
const copy=value=>Object.prototype.toString.call(value)==='[object Date]'?new Date(value.getTime()):Array.isArray(value)?value.map(copy):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,copy(v)])):value;

test('actual native and HGG services share rollback, adopt a lost completed renewal once, and quote the retained repair under the current epoch',()=>nativeFixture(async c=>{
 const clock=jest.spyOn(Date,'now').mockImplementation(()=>c.runtime.now().getTime()),oldBackend=process.env.NEXT_PUBLIC_BACKEND_URL;process.env.NEXT_PUBLIC_BACKEND_URL=c.origin;
 try{
  const source=fixture(),oldOrg=source.ids.org,oldActor=source.ids.actor;
  const remap=value=>value===oldOrg?'org':value===oldActor?'actor':value instanceof Date?value:Array.isArray(value)?value.map(remap):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,remap(v)])):value;
  for(const table of Object.values(source.tables)){const rows=[...table.values()].map(remap);table.clear();for(const row of rows)table.set(row.id,row);}
  source.ids.org='org';source.ids.actor='actor';
  const n=await setup({sourceFixture:source,workspaceBinding:c.qualification}),review=n.vision.review;
  n.vision.review=async()=>{const v=await review();v.state='needs_input';v.result.verdict='blocked';v.result.findings=[{category:'continuity',detail:'Last frame weight differs.'}];v.raw=JSON.stringify(v.result);return v;};
  await n.prepare();const q=await n.service.budgetQuestion('org','actor',THREAD,n.pilotId,'budget','en');
  await n.service.answerBudget('org','actor',THREAD,n.pilotId,'budget',q,{answer:'18'});
  const a=(await n.service.open('org','actor',THREAD,n.pilotId)).production.executionApproval;
  await n.service.launch('org','actor',THREAD,{pilotId:n.pilotId,preflightId:a.preflightId,approvalHash:a.approvalHash});
  await n.settle('first_frame');await n.settle('last_frame');
  await n.service.prepareLastFrameRepair('org','actor',THREAD,{messageId:'retained-last-repair',text:'Correct only last typography.'},{pilotId:n.pilotId});
  let prod=n.parent().payload.production,r=prod.lastFrameRepair;
  for(const [index,receipt] of prod.framePair.receipts.entries()){
   c.rows.videoSubscriptionJob.push({id:receipt.jobId,organizationId:'org',actorId:'actor',connectionId:c.connection.id,generation:1,preflightId:prod.stageSnapshots[index?'last_frame':'first_frame'].preflightId,
    resultMediaId:receipt.ownedMediaId,state:'completed',snapshot:{authorization:copy(prod.authorization.value)},intentId:prod.stagePlans[index?'last_frame':'first_frame'].intentId,reserved:'1',actualCost:null,period:'2026-02',
    request:{kind:'hgg-pilot-stage/v1',stage:index?'last_frame':'first_frame',requestHash:prod.stageSnapshots[index?'last_frame':'first_frame'].bindingHash,workspace:c.qualification,compiled:{input:{source:r.plan.input.source}}},
    storedFile:{path:prod.framePair.paths[index],byteSha256:receipt.byteSha256,mime:'image/png'},receipt:{kind:'image',profile:'hgg_pilot_job_v1',jobId:receipt.providerJobId}});
  }
  c.rows.media.push(...[...n.tables.media.values()].map(copy));
  const {loadTypeScriptModule}=require('./helpers/load-ts-module.cjs'),{AuthService}=loadTypeScriptModule('libraries/helpers/src/auth/auth.service.ts');
  const def=c.runtime.definition('higgsfield'),redirect=c.origin+'/media/video-connections/higgsfield/callback';
  const client=await c.oauth.registration(def,await c.oauth.metadata(def),redirect);
  c.rows.videoSubscriptionRegistration=[{id:c.modules.registry.subscriptionHash([def.issuer,redirect]),issuer:def.issuer,redirectUri:redirect,encryptedClient:AuthService.fixedEncryption(JSON.stringify(client))}];
  c.db.videoSubscriptionRegistration={findUnique:async({where})=>copy(c.rows.videoSubscriptionRegistration.find(row=>row.id===where.id)??null)};
  c.connection.refreshOwner=null;c.connection.refreshUntil=null;
  c.db.videoSubscriptionConnection.updateMany=async({where,data})=>{
   for(const key of ['id','state','generation','tokenVersion','refreshOwner'])if(key in where&&where[key]!==c.connection[key])return{count:0};
   if(where.OR&&!where.OR.some(part=>part.refreshUntil===null?c.connection.refreshUntil===null:c.connection.refreshUntil<part.refreshUntil.lt))return{count:0};
   for(const [key,value]of Object.entries(data))c.connection[key]=value&&typeof value==='object'&&'increment'in value?(c.connection[key]??0)+value.increment:copy(value);
   return{count:1};
  };
  c.db.videoAccessPreflight.update=async({where,data})=>{await c.db.videoAccessPreflight.updateMany({where,data});return c.db.videoAccessPreflight.findUnique({where});};

  // One controlled transaction snapshots BOTH services' persistent collections.
  const nativeTransaction=n.db.$transaction,cTransaction=c.db.transaction;
  for(const name of ['user','userOrganization','contentPiece','contentDerivation','post','integration','socialFactoryRecord'])c.db[name]=n.db[name];
  c.db.transaction=work=>cTransaction(async()=>{const beforeConnection=copy(c.connection);try{return await nativeTransaction(()=>work(c.db));}catch(error){for(const key of Object.keys(c.connection))delete c.connection[key];Object.assign(c.connection,beforeConnection);throw error;}});
  c.db.$transaction=(work)=>c.db.transaction(work);n.db.$transaction=c.db.$transaction;
  const mediaDelegate=n.db.media;n.db.media=c.db.media;
  c.parents.adapter=n.service;n.service.hgg=c.service;
  const nativeCount=n.tables.socialFactoryRecord.size,cCount=c.rows.videoAccessPreflight.length;
  await expect(c.db.transaction(async tx=>{await tx.socialFactoryRecord.create({data:{id:'rollback-native',organizationId:'org',kind:'action',payload:{}}});await tx.videoAccessPreflight.create({data:{id:'rollback-hgg',organizationId:'org'}});throw Error('rollback-both');})).rejects.toThrow('rollback-both');
  expect(n.tables.socialFactoryRecord.size).toBe(nativeCount);expect(c.rows.videoAccessPreflight).toHaveLength(cCount);
  prod=n.parent().payload.production;r=prod.lastFrameRepair;
  c.script('higgsfield','generate_image',{cost:{credits:2,credits_exact:2}},{cost:{credits:3,credits_exact:3}});
  r.snapshot=undefined;
  const session=work=>c.modules.authenticatedSession.withAuthenticatedSession('actor','joint-synthetic-session',work);
  const initialQuote=await session(()=>c.service.quote('org','actor',r.plan));r=n.parent().payload.production.lastFrameRepair;r.snapshot=initialQuote;r.state='awaiting_approval';
  expect(r.snapshot.errorCode).toBeNull();c.advance(11*60*1000);
  const original=copy(n.parent().payload),renewalRequest={messageId:'explicit-joint-renewal',text:'Renew only this existing OAuth grant, no price or generation.'};
  const realRenew=c.service.renewCredentialBindingV2.bind(c.service);
  const reply=jest.spyOn(c.service,'renewCredentialBindingV2').mockImplementation(async(...args)=>{await realRenew(...args);throw Error('lost-parent-renewal-reply');});
  await expect(session(()=>n.service.renewCredentialsV2('org','actor',THREAD,renewalRequest,{pilotId:n.pilotId}))).rejects.toThrow('lost-parent-renewal-reply');
  expect(c.state.refreshes).toHaveLength(1);expect(c.connection.tokenVersion).toBe(2);
  expect(n.parent().payload.production.credentialRenewalsV2[0].state).toBe('pending');
  await session(()=>n.service.renewCredentialsV2('org','actor',THREAD,{messageId:'observe-completed-renewal',text:'Read the saved renewal only.'},{pilotId:n.pilotId}));
  expect(reply).toHaveBeenCalledTimes(1);expect(c.state.refreshes).toHaveLength(1);
  const current=n.parent().payload.production,credentials=current.executionCredentialsV2;
  expect(credentials.currentWorkspace.tokenVersion).toBe(2);expect(current.workspace).toEqual(original.production.workspace);
  const fresh=await session(()=>n.service.refreshLastFrameRepairQuote('org','actor',THREAD,{messageId:'separate-current-epoch-price',text:'Request a new price for this same retained repair, without generation.'},{pilotId:n.pilotId,repairId:r.id}));
  expect(fresh.production.lastFrameRepair.preflightId).toBe(original.production.lastFrameRepair.snapshot.preflightId);
  expect(fresh.production.lastFrameRepair.approvalHash).not.toBe(original.production.lastFrameRepair.snapshot.approvalHash);
  const saved=c.rows.videoAccessPreflight.find(x=>x.id===fresh.production.lastFrameRepair.preflightId);
  expect(saved.request.executionCredentials).toEqual(credentials);expect(saved.snapshot.priorQuotes).toHaveLength(1);
  expect(c.rows.videoSubscriptionJob).toHaveLength(2);expect(c.state.toolCalls.filter(x=>x.args.params?.get_cost===false)).toHaveLength(0);
  expect(c.state.toolCalls.filter(x=>x.name==='select_workspace')).toHaveLength(0);expect(c.state.authorizations).toHaveLength(0);
  expect(c.rows.media).toHaveLength(2);expect(c.connection).toMatchObject({id:'connection',ownerId:'actor',generation:1,tokenVersion:2});
  const after=n.parent().payload;
  expect(after.stages).toEqual(original.stages);expect(after.source).toEqual(original.source);expect(after.production.firstFrame).toEqual(original.production.firstFrame);
  expect(after.production.contextDigest).toBe(original.production.contextDigest);expect(after.production.authorization).toEqual(original.production.authorization);
  expect(after.production.lastFrameRepair.previous).toEqual(original.production.lastFrameRepair.previous);expect(c.state.refreshes).toHaveLength(1);
  n.db.media=mediaDelegate;
 }finally{clock.mockRestore();if(oldBackend===undefined)delete process.env.NEXT_PUBLIC_BACKEND_URL;else process.env.NEXT_PUBLIC_BACKEND_URL=oldBackend;}
}),30000);
