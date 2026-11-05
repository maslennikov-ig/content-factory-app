const {nativeFixture,codeOf}=require('./helpers/hgg-native-pilot-fixture.cjs');
const uuid=n=>`${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`;
const receipt=(id,kind,prompt=kind==='video'?'English cinematic camera move':'English first frame direction')=>({results:[{id,type:kind,model:kind==='image'?'synthetic-image':'synthetic-video',status:'queued',params:{prompt}}]});
const done=(id,kind)=>({jobs:[{index:0,job_id:id,status:'completed',type:kind,model:kind==='image'?'synthetic-image':'synthetic-video',result_url:`https://result.invalid/${id}`}],summary:{total:1,completed:1,failed:0,active:0,errors:0},all_terminal:true,timed_out:false});
const rejects=async(promise,code)=>{let error;try{await promise;}catch(e){error=e;}expect(codeOf(error)).toBe(code);};
const asset=(r,slot)=>({slot,ownedMediaId:r.ownedMediaId,byteSha256:r.byteSha256,providerMediaId:r.providerMediaId,connectionId:r.connectionId,accountGeneration:r.accountGeneration});
const submits=f=>f.state.toolCalls.filter(c=>c.args.params?.get_cost===false);

test('automatic first -> last -> independent pair review -> clip survives progress revisions with three single durable submits and owned Media',()=>nativeFixture(async f=>{
 f.script('higgsfield','generate_image',{cost:{credits:2,credits_exact:2}},receipt(uuid(1),'image'),{cost:{credits:3,credits_exact:3}},receipt(uuid(2),'image','English last frame direction'));
 f.script('higgsfield','generate_video',{cost:{credits:5,credits_exact:5}},receipt(uuid(3),'video'));
 f.script('higgsfield','jobs_wait',done(uuid(1),'image'),done(uuid(2),'image'),done(uuid(3),'video'));
 const ids={},seen=new Set();let visionCalls=0;
 f.setContinuation(async event=>{
  if(seen.has(event.eventId))return;
  f.parent.revision++;
  if(event.stage==='first_frame'){
   const first=await f.service.frameReceipt('org','actor',ids.first);const p=f.prepare('last',{...f.source,parentRevision:f.parent.revision});p.input.references=[asset(first,'first')];p.references=[first];
   const quote=await f.service.quote('org','actor',p);expect(quote.canSubmit).toBe(true);ids.last=quote.preflightId;await f.service.admit('org','actor',ids.last,quote.approvalHash);
  }else if(event.stage==='last_frame'){
   const first=await f.service.frameReceipt('org','actor',ids.first),last=await f.service.frameReceipt('org','actor',ids.last);
   visionCalls++;f.parent.vision=true;
   const p={...f.prepare('first'),intentId:'clip-intent',input:{version:1,kind:'video',resolution:'720p',source:{...f.source,parentRevision:f.parent.revision},prompt:'English cinematic camera move',frames:[asset(first,'first'),asset(last,'last')]},references:[first,last]};
   const quote=await f.service.quote('org','actor',p);expect(quote.canSubmit).toBe(true);ids.clip=quote.preflightId;await f.service.admit('org','actor',ids.clip,quote.approvalHash);
  }
  seen.add(event.eventId);
 });
 const first=await f.service.quote('org','actor',f.prepare());ids.first=first.preflightId;expect(first.canSubmit).toBe(true);await f.service.admit('org','actor',ids.first,first.approvalHash);
 for(let i=0;i<20;i++)for(const job of [...f.rows.videoSubscriptionJob])if(['accepted','queued','running','saving'].includes(job.state)||job.state==='completed'&&!job.providerResult.continuationDelivered)await f.jobs.runStep('org',job.id);
 expect(f.rows.videoSubscriptionJob.map(j=>j.state)).toEqual(['completed','completed','completed']);expect(f.rows.media.map(m=>m.type)).toEqual(['image','image','video']);
 expect(submits(f)).toHaveLength(3);expect(submits(f).every(c=>c.args.params.use_unlim===false)).toBe(true);expect(visionCalls).toBe(1);
 expect(submits(f)[1].args.params.medias).toEqual([{role:'image_references',value:uuid(1)}]);expect(submits(f)[2].args.params.medias).toEqual([{role:'start_image',value:uuid(1)},{role:'end_image',value:uuid(2)}]);
 const final=await f.service.read('org','actor',ids.clip);expect(final).toMatchObject({state:'saved',cost:{amount:null,certainty:'unknown'},result:{mime:'video/mp4',width:720,height:1280,durationSeconds:5}});
 expect(f.rows.videoSubscriptionJob.every(j=>j.submitAttempts===1&&j.actualCost===null)).toBe(true);expect(f.rows.videoSubscriptionJob.reduce((n,j)=>n+Number(j.reserved),0)).toBe(10);
 expect(JSON.stringify(final)).not.toMatch(/synthetic-private-workspace|synthetic-video|providerJobId|rawQuote/);
 expect(f.assertions.filter(a=>a.action==='submit')).toHaveLength(3);
}));

test('missing owner budget leaves a real quote blocked; balance does not create permission',()=>nativeFixture(async f=>{
 f.parent.authorization=null;f.script('higgsfield','generate_image',{cost:{credits:2,credits_exact:2}});
 const quote=await f.service.quote('org','actor',f.prepare());expect(quote).toMatchObject({state:'awaiting_budget',canSubmit:false,ownerLimit:null});expect(quote.blockers).toContain('VIDEO_PILOT_BUDGET_REQUIRED');
 await rejects(f.service.admit('org','actor',quote.preflightId,'forged'),'VIDEO_PILOT_BUDGET_REQUIRED');expect(submits(f)).toHaveLength(0);expect(f.rows.videoSubscriptionJob).toHaveLength(0);
}));
test('duplicate quote and admission intents create one quote, one reservation and one provider submission',()=>nativeFixture(async f=>{
 f.script('higgsfield','generate_image',{cost:{credits:2,credits_exact:2}},receipt(uuid(4),'image'));
 const q=await f.service.quote('org','actor',f.prepare());await f.service.quote('org','actor',f.prepare());
 await Promise.all([f.service.admit('org','actor',q.preflightId,q.approvalHash),f.service.admit('org','actor',q.preflightId,q.approvalHash)]);
 const job=f.rows.videoSubscriptionJob[0];await Promise.all([f.jobs.runStep('org',job.id),f.jobs.runStep('org',job.id)]);
 expect(f.rows.videoSubscriptionJob).toHaveLength(1);expect(submits(f)).toHaveLength(1);expect(f.state.toolCalls.filter(c=>c.args.params?.get_cost===true)).toHaveLength(1);
}));
test('stop immediately before the same-transaction send claim prevents the paid tool',()=>nativeFixture(async f=>{
 f.script('higgsfield','generate_image',{cost:{credits:2,credits_exact:2}});const q=await f.service.quote('org','actor',f.prepare());await f.service.admit('org','actor',q.preflightId,q.approvalHash);f.parent.stopped=true;
 await f.jobs.runStep('org',f.rows.videoSubscriptionJob[0].id);expect(submits(f)).toHaveLength(0);expect(f.rows.videoSubscriptionJob[0]).toMatchObject({state:'access_unavailable',submitAttempts:0});
}));
test('lost generation response remains submission_unknown and never submits again on recovery',()=>nativeFixture(async f=>{
 f.script('higgsfield','generate_image',{cost:{credits:2,credits_exact:2}},'lost');const q=await f.service.quote('org','actor',f.prepare());await f.service.admit('org','actor',q.preflightId,q.approvalHash);
 const job=f.rows.videoSubscriptionJob[0];await f.jobs.runStep('org',job.id);await f.jobs.runStep('org',job.id);await f.service.recover('org','actor',q.preflightId,'status_read');
 expect(submits(f)).toHaveLength(1);expect(f.rows.videoSubscriptionJob[0]).toMatchObject({state:'submission_unknown',submitAttempts:1,actualCost:null});
}));
test('save-only recovery reuses captured result without a second generation',()=>nativeFixture(async f=>{
 f.script('higgsfield','generate_image',{cost:{credits:2,credits_exact:2}},receipt(uuid(5),'image'));f.script('higgsfield','jobs_wait',done(uuid(5),'image'));
 const q=await f.service.quote('org','actor',f.prepare());await f.service.admit('org','actor',q.preflightId,q.approvalHash);const job=f.rows.videoSubscriptionJob[0];
 await f.jobs.runStep('org',job.id);await f.jobs.runStep('org',job.id);f.media.importResult.mockRejectedValueOnce(Error('Synthetic storage outage'));await f.jobs.runStep('org',job.id);expect(job.state).toBe('save_failed');
 await f.service.recover('org','actor',q.preflightId,'retry_save');await f.jobs.runStep('org',job.id);expect(job.state).toBe('completed');expect(submits(f)).toHaveLength(1);expect(f.rows.media).toHaveLength(1);
}));
test('changed selected workspace blocks before send without selecting another context',()=>nativeFixture(async f=>{
 f.script('higgsfield','generate_image',{cost:{credits:2,credits_exact:2}});const q=await f.service.quote('org','actor',f.prepare());await f.service.admit('org','actor',q.preflightId,q.approvalHash);
 f.state.scripts.higgsfield.list_workspaces=[{workspaces:[{...require('./helpers/hgg-native-pilot-fixture.cjs').workspace,is_selected:false}]}];
 await f.jobs.runStep('org',f.rows.videoSubscriptionJob[0].id);expect(submits(f)).toHaveLength(0);expect(f.state.toolCalls.some(c=>c.name==='select_workspace')).toBe(false);expect(f.rows.videoSubscriptionJob[0].submitAttempts).toBe(0);
}));
test('unknown workspace selection recovers through observation, never a second select',()=>nativeFixture(async f=>{
 const {workspace}=require('./helpers/hgg-native-pilot-fixture.cjs');f.state.scripts.higgsfield.list_workspaces=[{workspaces:[{...workspace,is_selected:false}]},{workspaces:[{...workspace,is_selected:false}]},{workspaces:[workspace]}];f.script('higgsfield','models_explore',...f.modelResults());f.script('higgsfield','select_workspace','lost');
 const input={intentId:'selection-intent',pilotId:'parent',parentRevision:1,connectionId:'connection',accountGeneration:1,workspaceId:workspace.id,selectionAuthorizationId:'actual-owner-approval'};
 const run=()=>f.modules.authenticatedSession.withAuthenticatedSession('actor','synthetic-session',()=>f.service.qualifyWorkspace('org','actor',input));
 await expect(run()).rejects.toThrow();const proof=await run();expect(proof.context).toBe('observed_private_owner');expect(f.state.toolCalls.filter(c=>c.name==='select_workspace')).toHaveLength(1);
 expect(f.connection.state).toBe('discovery_required');expect(f.connection.walletDigest).toBe('unverified:synthetic');
}));
test('a typed pilot credential cannot spend with only provisional discovery or a forged proof',()=>nativeFixture(async f=>{
 await rejects(f.connections.token('org','actor','connection',1,'pilot_generation_v1',{pilotQualificationId:'forged',allowRefresh:false}),'VIDEO_PILOT_WORKSPACE_QUALIFICATION_REQUIRED');
 expect(f.state.refreshes).toHaveLength(0);expect(submits(f)).toHaveLength(0);
}));
test('retained unknown costs exhaust the one pilot cap instead of resetting by stage',()=>nativeFixture(async f=>{
 f.parent.authorization={...f.parent.authorization,pilotLimit:'2',stageLimit:'2'};f.script('higgsfield','generate_image',{cost:{credits:2,credits_exact:2}});
 const q=await f.service.quote('org','actor',f.prepare());await f.service.admit('org','actor',q.preflightId,q.approvalHash);
 const policy=require('./helpers/load-ts-module.cjs').loadTypeScriptModule('libraries/nestjs-libraries/src/videos/subscriptions/video-hgg-pilot-policy.v1.ts');
 const stage={...f.rows.videoSubscriptionJob[0].request,stage:'last_frame'};
 await rejects(f.db.transaction(tx=>policy.hggPilotFinancialV1(tx,'org','actor',f.connection,stage,f.parent.authorization,new (require('@prisma/client').Prisma.Decimal)(1),f.runtime.now())),'VIDEO_PILOT_BUDGET_EXCEEDED');
 expect(f.rows.videoSubscriptionJob[0].actualCost).toBeNull();
}));
test('stored file save retry creates one owned Media and never reimports or regenerates',()=>nativeFixture(async f=>{
 f.script('higgsfield','generate_image',{cost:{credits:2,credits_exact:2}},receipt(uuid(6),'image'));f.script('higgsfield','jobs_wait',done(uuid(6),'image'));
 const q=await f.service.quote('org','actor',f.prepare());await f.service.admit('org','actor',q.preflightId,q.approvalHash);const id=f.rows.videoSubscriptionJob[0].id;
 await f.jobs.runStep('org',id);await f.jobs.runStep('org',id);const original=f.db.media.create;f.db.media.create=jest.fn().mockRejectedValueOnce(Error('Synthetic DB outage')).mockImplementation(original);
 await f.jobs.runStep('org',id);expect(f.rows.videoSubscriptionJob[0].state).toBe('save_failed');expect(f.rows.videoSubscriptionJob[0].storedFile).toBeTruthy();
 await f.service.recover('org','actor',q.preflightId,'retry_save');await f.jobs.runStep('org',id);expect(f.media.importResult).toHaveBeenCalledTimes(1);expect(f.rows.media).toHaveLength(1);expect(submits(f)).toHaveLength(1);
}));
test('continuation interruption reuses the stable event and saved outputs without another submit',()=>nativeFixture(async f=>{
 f.script('higgsfield','generate_image',{cost:{credits:2,credits_exact:2}},receipt(uuid(7),'image'));f.script('higgsfield','jobs_wait',done(uuid(7),'image'));
 const q=await f.service.quote('org','actor',f.prepare());await f.service.admit('org','actor',q.preflightId,q.approvalHash);const id=f.rows.videoSubscriptionJob[0].id;
 const events=[];let first=true;f.setContinuation(async e=>{events.push(e.eventId);if(first){first=false;throw Error('Synthetic continuation lost');}});
 for(let i=0;i<5;i++)await f.jobs.runStep('org',id);
 expect(events).toEqual([id,id]);expect(f.rows.videoSubscriptionJob[0].providerResult.continuationDelivered).toBe(true);expect(f.rows.media).toHaveLength(1);expect(submits(f)).toHaveLength(1);
}));
test('legacy views, workers and actions refuse pilot image rows before exposing raw snapshots or dispatching V1',()=>nativeFixture(async f=>{
 f.script('higgsfield','generate_image',{cost:{credits:2,credits_exact:2}});const q=await f.service.quote('org','actor',f.prepare());await f.service.admit('org','actor',q.preflightId,q.approvalHash);
 const {VideoSubscriptionJobService}=f.modules.register('subscriptions/video-subscription-job.service',[]);const execution={start:jest.fn()};const legacy=new VideoSubscriptionJobService(f.repository,f.connections,f.runtime,f.mcp,{},{},{},{},execution);const job=f.rows.videoSubscriptionJob[0];
 for(const action of [()=>legacy.view(job,'actor'),()=>legacy.runStep('org',job.id),()=>legacy.action('org','actor',job.id,'retry-save'),()=>legacy.reconcile('org','actor',job.id,'1','Synthetic evidence'),()=>legacy.dispatch(job)])await rejects(action(),'VIDEO_PILOT_ROUTE_REQUIRED');
 expect(execution.start).not.toHaveBeenCalled();expect(submits(f)).toHaveLength(0);expect(job.state).toBe('accepted');
}));
test('negative provider media-presence flags block paid admission while preserving the honest cost quote',()=>nativeFixture(async f=>{
 f.script('higgsfield','generate_image',{cost:{credits:2,credits_exact:2},input_check:{required_media_present:false,image_count:0,video_count:0,missing_roles:['image'],generation_validated:false}});
 const q=await f.service.quote('org','actor',f.prepare());expect(q.canSubmit).toBe(false);expect(q.blockers).toContain('VIDEO_PILOT_PROVIDER_INPUTS_MISSING');expect(q.quote.amount).toBe('2');
 expect(f.rows.videoAccessPreflight.find(r=>r.id===q.preflightId).quote.providerInputCheck.required_media_present).toBe(false);
 await rejects(f.service.admit('org','actor',q.preflightId,'forged'),'VIDEO_PILOT_PROVIDER_INPUTS_MISSING');expect(submits(f)).toHaveLength(0);
}));
test('whole-pilot approval preview hash exists before execution consent and becomes usable after one retained approval',()=>nativeFixture(async f=>{
 f.parent.executionApproved=false;f.script('higgsfield','generate_image',{cost:{credits:2,credits_exact:2}});
 const q=await f.service.quote('org','actor',f.prepare());expect(q).toMatchObject({state:'awaiting_approval',canSubmit:false,localInputValidated:true,ownerLimit:{pilotLimit:'50'}});expect(q.approvalHash).toMatch(/^[a-f0-9]{64}$/);
 await rejects(f.service.admit('org','actor',q.preflightId,q.approvalHash),'VIDEO_PILOT_EXECUTION_APPROVAL_REQUIRED');
 f.parent.executionApproved=true;f.parent.revision++;const ready=await f.service.read('org','actor',q.preflightId);expect(ready.approvalHash).toBe(q.approvalHash);expect(ready.canSubmit).toBe(true);await f.service.admit('org','actor',q.preflightId,ready.approvalHash);
 expect(f.rows.videoSubscriptionJob).toHaveLength(1);expect(f.state.toolCalls.filter(c=>c.args.params?.get_cost===true)).toHaveLength(1);
}));
test('schema-valid completed jobs_wait without optional timed_out is saved without invented timeout facts',()=>nativeFixture(async f=>{
 f.script('higgsfield','generate_image',{cost:{credits:2,credits_exact:2}},receipt(uuid(8),'image'));const status=done(uuid(8),'image');delete status.timed_out;f.script('higgsfield','jobs_wait',status);
 const q=await f.service.quote('org','actor',f.prepare());await f.service.admit('org','actor',q.preflightId,q.approvalHash);const id=f.rows.videoSubscriptionJob[0].id;await f.jobs.runStep('org',id);await f.jobs.runStep('org',id);
 expect(f.rows.videoSubscriptionJob[0].state).toBe('saving');expect(f.rows.videoSubscriptionJob[0].providerResult.raw).not.toHaveProperty('timed_out');
}));
test('received paid receipt is durable before an in-flight token change fails the post-response guard',()=>nativeFixture(async f=>{
 f.script('higgsfield','generate_image',{cost:{credits:2,credits_exact:2}},receipt(uuid(9),'image'));const q=await f.service.quote('org','actor',f.prepare());await f.service.admit('org','actor',q.preflightId,q.approvalHash);
 f.state.respondMcp=({rpc})=>{if(rpc.method==='tools/call'&&rpc.params.arguments?.params?.get_cost===false)f.connection.tokenVersion++;return false;};
 const id=f.rows.videoSubscriptionJob[0].id;await f.jobs.runStep('org',id);const job=f.rows.videoSubscriptionJob[0];expect(job.receipt).toMatchObject({jobId:uuid(9),raw:{results:[{id:uuid(9)}]}});expect(job.state).toBe('reauth_required');
 await f.jobs.runStep('org',id);expect(submits(f)).toHaveLength(1);expect(job.actualCost).toBeNull();
}));
test('received workspace-selection raw survives an in-flight token change without a second select',()=>nativeFixture(async f=>{
 const {workspace}=require('./helpers/hgg-native-pilot-fixture.cjs');f.state.scripts.higgsfield.list_workspaces=[{workspaces:[{...workspace,is_selected:false}]},{workspaces:[{...workspace,is_selected:false}]}];f.script('higgsfield','models_explore',...f.modelResults());f.script('higgsfield','select_workspace',{success:true,workspace});
 f.state.respondMcp=({rpc})=>{if(rpc.method==='tools/call'&&rpc.params.name==='select_workspace')f.connection.tokenVersion++;return false;};
 await expect(f.modules.authenticatedSession.withAuthenticatedSession('actor','synthetic-session',()=>f.service.qualifyWorkspace('org','actor',{intentId:'selection-inflight',pilotId:'parent',parentRevision:1,connectionId:'connection',accountGeneration:1,workspaceId:workspace.id,selectionAuthorizationId:'owner-approval'}))).rejects.toThrow();
 const row=f.rows.videoAccessPreflight.find(r=>r.snapshot.input?.intentId==='selection-inflight');expect(row.request.rawSelection.success).toBe(true);expect(row.snapshot.state).toBe('selecting');expect(f.state.toolCalls.filter(c=>c.name==='select_workspace')).toHaveLength(1);
}));
test.each(['adjustment','echo'])('received %s preserves known job ID but blocks automatic acceptance and continuation',change=>nativeFixture(async f=>{
 const actual=receipt(uuid(10),'image');if(change==='adjustment')actual.adjustments={quality:{requested:'high',used:'max',reason:'Provider changed'}};else actual.results[0].params.prompt='Different unapproved prompt';
 f.script('higgsfield','generate_image',{cost:{credits:2,credits_exact:2}},actual);const q=await f.service.quote('org','actor',f.prepare());await f.service.admit('org','actor',q.preflightId,q.approvalHash);const continuation=jest.fn(async()=>{});f.setContinuation(continuation);
 const id=f.rows.videoSubscriptionJob[0].id;await f.jobs.runStep('org',id);await f.jobs.runStep('org',id);const job=f.rows.videoSubscriptionJob[0];expect(job.state).toBe('input_changed');expect(job.receipt).toMatchObject({jobId:uuid(10),inputChanged:true});expect(job.receipt.raw).toEqual(actual);expect(continuation).not.toHaveBeenCalled();expect(submits(f)).toHaveLength(1);
 const view=await f.service.read('org','actor',q.preflightId);expect(view).toMatchObject({state:'input_changed',result:null,recoveryActions:['status_read'],cost:{amount:null}});
}));
test('explicit successful expired quote refresh preserves intent/history and never creates or replays generation',()=>nativeFixture(async f=>{
 f.script('higgsfield','generate_image',{cost:{credits:2,credits_exact:2}},{cost:{credits:3,credits_exact:3}});const input=f.prepare();const first=await f.service.quote('org','actor',input);
 const row=f.rows.videoAccessPreflight.find(r=>r.id===first.preflightId);row.expiresAt=new Date('2026-01-01T00:00:00Z');
 const refreshed=await f.service.quote('org','actor',input);expect(refreshed.preflightId).toBe(first.preflightId);expect(refreshed.quote.amount).toBe('3');expect(refreshed.bindingHash).toBe(first.bindingHash);expect(refreshed.approvalHash).not.toBe(first.approvalHash);
 expect(row.snapshot.priorQuotes[0].quote.cost.creditsExact).toBe(2);expect(f.rows.videoRouteIntent.filter(i=>i.intentId===input.intentId)).toHaveLength(1);expect(submits(f)).toHaveLength(0);
 await f.service.admit('org','actor',refreshed.preflightId,refreshed.approvalHash);row.expiresAt=new Date('2026-01-01T00:00:00Z');await f.service.quote('org','actor',input);
 expect(f.state.toolCalls.filter(c=>c.args.params?.get_cost===true)).toHaveLength(2);expect(f.rows.videoSubscriptionJob).toHaveLength(1);
}));
test('selection success flag is optional in actual schema; a fresh selected private-owner read is authoritative',()=>nativeFixture(async f=>{
 const {workspace}=require('./helpers/hgg-native-pilot-fixture.cjs');f.state.scripts.higgsfield.list_workspaces=[{workspaces:[{...workspace,is_selected:false}]},{workspaces:[{...workspace,is_selected:false}]},{workspaces:[workspace]}];f.script('higgsfield','models_explore',...f.modelResults());f.script('higgsfield','select_workspace',{workspace});
 const proof=await f.modules.authenticatedSession.withAuthenticatedSession('actor','synthetic-session',()=>f.service.qualifyWorkspace('org','actor',{intentId:'selection-optional-success',pilotId:'parent',parentRevision:1,connectionId:'connection',accountGeneration:1,workspaceId:workspace.id,selectionAuthorizationId:'owner-approval'}));expect(proof).toMatchObject({context:'observed_private_owner',atomicBillingProof:false});
 expect(f.state.toolCalls.filter(c=>c.name==='select_workspace')).toHaveLength(1);
}));
test('native discovery takes only pilot preparation authority and finds actual current IDs without environment or caller model IDs',()=>nativeFixture(async f=>{
 f.script('higgsfield','models_explore',...f.modelResults());
 const proof=await f.modules.authenticatedSession.withAuthenticatedSession('actor','synthetic-session',()=>f.service.discoverWorkspace('org','actor',{intentId:'native-discovery',pilotId:'parent',parentRevision:1,selectionAuthorizationId:'native-preparation-request'}));
 expect(proof).toMatchObject({connectionId:'connection',accountGeneration:1,workspaceId:'synthetic-private-workspace',atomicBillingProof:false});
 const saved=f.rows.videoAccessPreflight.find(r=>r.id===proof.qualificationId);expect(saved.snapshot.models.image.id).toBe('synthetic-image');expect(saved.snapshot.models.video.id).toBe('synthetic-video');
 expect(f.state.toolCalls.filter(c=>c.name==='models_explore').map(c=>c.args)).toContainEqual({action:'list',type:'image',input:'image',limit:100});expect(submits(f)).toHaveLength(0);
}));
test('native discovery accepts the reviewed historical inventory with the same fixed reads',()=>nativeFixture(async f=>{
 const before=f.state.toolCalls.length;
 f.state.tools.higgsfield=f.state.tools.higgsfield.filter(t=>t.name!=='ads_studio_synthetic');
 f.script('higgsfield','models_explore',...f.modelResults());
 await f.modules.authenticatedSession.withAuthenticatedSession('actor','synthetic-session',()=>f.service.discoverWorkspace('org','actor',{intentId:'reviewed-schema',pilotId:'parent',parentRevision:1,selectionAuthorizationId:'native-preparation-request'}));
 expect(f.state.toolCalls.slice(before).map(c=>c.name)).toEqual(['list_workspaces','models_explore','models_explore','list_workspaces']);
}));
test.each(['required schema','third inventory'])('native discovery rejects an unreviewed %s before any tool call',change=>nativeFixture(async f=>{
 const before=f.state.toolCalls.length;
 if(change==='required schema') f.state.tools.higgsfield.find(t=>t.name==='generate_video').inputSchema.properties.changed={type:'string'};
 else f.state.tools.higgsfield.push({name:'unknown_tool',inputSchema:{type:'object'}});
 await rejects(f.modules.authenticatedSession.withAuthenticatedSession('actor','synthetic-session',()=>f.service.discoverWorkspace('org','actor',{intentId:'unknown-schema',pilotId:'parent',parentRevision:1,selectionAuthorizationId:'native-preparation-request'})),'VIDEO_SCHEMA_CHANGED');
 expect(f.state.toolCalls).toHaveLength(before);
}));
test('ambiguous native connection is a real choice, never first-user or first-account fallback',()=>nativeFixture(async f=>{
 f.db.videoSubscriptionConnection.findMany=async()=>[{...f.connection},{...f.connection,id:'other-connection'}];const before=f.state.toolCalls.length;
 await rejects(f.modules.authenticatedSession.withAuthenticatedSession('actor','synthetic-session',()=>f.service.discoverWorkspace('org','actor',{intentId:'ambiguous',pilotId:'parent',parentRevision:1})),'VIDEO_PILOT_CONNECTION_CHOICE_REQUIRED');expect(f.state.toolCalls).toHaveLength(before);
}));
test('an exact zero-credit quote reserves zero but still needs finite owner budget and explicit credits funding',()=>nativeFixture(async f=>{
 f.script('higgsfield','generate_image',{cost:{credits:0,credits_exact:0}},receipt(uuid(11),'image'));
 const q=await f.service.quote('org','actor',f.prepare());expect(q.canSubmit).toBe(true);await f.service.admit('org','actor',q.preflightId,q.approvalHash);const job=f.rows.videoSubscriptionJob[0];expect(Number(job.reserved)).toBe(0);expect(job.actualCost).toBeNull();
 await f.jobs.runStep('org',job.id);expect(submits(f)[0].args.params).toMatchObject({get_cost:false,use_unlim:false});expect(submits(f)[0].args.params).not.toHaveProperty('use_free_gens');
 expect((await f.service.read('org','actor',q.preflightId)).cost).toEqual({amount:null,unit:'higgsfield_credit',certainty:'unknown'});
}));

test('planning clip price is a separate empty-frame intent and cannot admit even with whole-pilot authorization',()=>nativeFixture(async f=>{
 f.script('higgsfield','generate_video',{cost:{credits:7.25,credits_exact:7.25}});
 const p={...f.prepare(),intentId:'planning-clip-only',input:{version:1,kind:'video',resolution:'720p',source:f.source,prompt:'English cinematic camera move',frames:[]},references:[]};
 const price=await f.service.quotePlanningClip('org','actor',p);expect(price.quote.amount).toBe('7.25');expect(price.canSubmit).toBe(false);expect(price.approvalHash).toBeNull();expect(price.blockers).toContain('VIDEO_PILOT_PLANNING_ONLY');
 await rejects(f.service.admit('org','actor',price.preflightId,'forged'),'VIDEO_PILOT_PLANNING_ONLY');expect(f.rows.videoSubscriptionJob).toHaveLength(0);expect(submits(f)).toHaveLength(0);
}));
test.each(['expired','reassigned'])('late received raw survives %s state lease with only attempt-bound receipt persistence',mode=>nativeFixture(async f=>{
 f.script('higgsfield','generate_image',{cost:{credits:2,credits_exact:2}},receipt(uuid(12),'image'));const q=await f.service.quote('org','actor',f.prepare());await f.service.admit('org','actor',q.preflightId,q.approvalHash);
 f.state.respondMcp=({rpc})=>{if(rpc.method==='tools/call'&&rpc.params.arguments?.params?.get_cost===false){const j=f.rows.videoSubscriptionJob[0];j.leaseUntil=new Date('2000-01-01T00:00:00Z');if(mode==='reassigned'){j.state='submission_unknown';j.leaseOwner='newer-worker';j.leaseUntil=new Date('2026-02-01T00:10:00Z');}}return false;};
 const id=f.rows.videoSubscriptionJob[0].id;await f.jobs.runStep('org',id);let job=f.rows.videoSubscriptionJob[0];expect(job.receipt.raw.results[0].id).toBe(uuid(12));expect(job.receipt.submitAttemptId).toBe(job.snapshot.submitAttempt.id);expect(job.receipt.requestHash).toBe(job.request.requestHash);
 if(mode==='reassigned'){expect(job.state).toBe('submission_unknown');expect(job.leaseOwner).toBe('newer-worker');expect(job.runCycle).toBe(0);}
 job.leaseUntil=new Date('2000-01-01T00:00:00Z');await f.jobs.runStep('org',id);job=f.rows.videoSubscriptionJob[0];expect(job.receipt.jobId).toBe(uuid(12));expect(job.state).toBe('queued');expect(submits(f)).toHaveLength(1);
}));
test('a foreign submit-attempt receipt cannot overwrite the immutable recorded response',()=>nativeFixture(async f=>{
 f.script('higgsfield','generate_image',{cost:{credits:2,credits_exact:2}},receipt(uuid(13),'image'));const q=await f.service.quote('org','actor',f.prepare());await f.service.admit('org','actor',q.preflightId,q.approvalHash);const id=f.rows.videoSubscriptionJob[0].id;await f.jobs.runStep('org',id);const job=f.rows.videoSubscriptionJob[0],saved=JSON.stringify(job.receipt);
 await rejects(f.jobs.persistReceived(job,job.request,'forged-attempt',receipt(uuid(99),'image')),'VIDEO_PILOT_RECEIPT_ATTEMPT_MISMATCH');expect(JSON.stringify(f.rows.videoSubscriptionJob[0].receipt)).toBe(saved);expect(submits(f)).toHaveLength(1);
}));
test('old cycle expiry cannot terminate a renewed recovery deadline',()=>nativeFixture(async f=>{
 f.script('higgsfield','generate_image',{cost:{credits:2,credits_exact:2}});const q=await f.service.quote('org','actor',f.prepare());await f.service.admit('org','actor',q.preflightId,q.approvalHash);const job=f.rows.videoSubscriptionJob[0];job.state='queued';job.runCycle=1;job.statusDeadlineAt=new Date('2026-02-02T00:00:00Z');
 const stale=await f.jobs.expire('org',job.id,0);expect(stale.done).toBe(true);expect(f.rows.videoSubscriptionJob[0].state).toBe('queued');
 const current=await f.jobs.expire('org',job.id,1);expect(current.done).toBe(false);expect(f.rows.videoSubscriptionJob[0].state).toBe('queued');
}));
test('expiry remains pending while the current cycle has a live step lease',()=>nativeFixture(async f=>{
 f.script('higgsfield','generate_image',{cost:{credits:2,credits_exact:2}});const q=await f.service.quote('org','actor',f.prepare());await f.service.admit('org','actor',q.preflightId,q.approvalHash);const job=f.rows.videoSubscriptionJob[0];job.state='queued';job.statusDeadlineAt=new Date('2026-01-31T00:00:00Z');job.leaseOwner='active-worker';job.leaseUntil=new Date('2026-02-01T00:10:00Z');
 expect(await f.jobs.expire('org',job.id,0)).toEqual({state:'queued',done:false});expect(f.rows.videoSubscriptionJob[0].state).toBe('queued');expect(f.rows.videoSubscriptionJob[0].leaseOwner).toBe('active-worker');
}));
test('a known local pre-send busy quote can resume explicitly on the same intent without duplicate provider calls',()=>nativeFixture(async f=>{
 f.script('higgsfield','generate_image',{cost:{credits:2,credits_exact:2}});
 let lease=f.rows.videoAccessPreflight.find(r=>r.snapshot.kind==='hgg-pilot-context-lease/v1');lease.expiresAt=new Date('2026-02-01T00:10:00Z');lease.snapshot.owner='other-active-operation';
 const before=f.state.toolCalls.length,input=f.prepare();const blocked=await f.service.quote('org','actor',input);expect(blocked).toMatchObject({state:'quote_failed',errorCode:'VIDEO_PILOT_CONNECTION_BUSY'});expect(f.state.toolCalls).toHaveLength(before);
 lease=f.rows.videoAccessPreflight.find(r=>r.snapshot.kind==='hgg-pilot-context-lease/v1');lease.expiresAt=new Date(0);
 const resumed=await f.service.quote('org','actor',input);expect(resumed.preflightId).toBe(blocked.preflightId);expect(resumed.quote.amount).toBe('2');expect(f.state.toolCalls.filter(c=>c.args.params?.get_cost===true)).toHaveLength(1);expect(submits(f)).toHaveLength(0);
}));
test('deleted owned Media is absent from current saved projection and cannot supply a paid frame reference',()=>nativeFixture(async f=>{
 f.script('higgsfield','generate_image',{cost:{credits:2,credits_exact:2}},receipt(uuid(14),'image'));f.script('higgsfield','jobs_wait',done(uuid(14),'image'));
 const q=await f.service.quote('org','actor',f.prepare());await f.service.admit('org','actor',q.preflightId,q.approvalHash);const id=f.rows.videoSubscriptionJob[0].id;for(let i=0;i<3;i++)await f.jobs.runStep('org',id);
 expect((await f.service.read('org','actor',q.preflightId)).result).toBeTruthy();f.rows.media[0].deletedAt=new Date('2026-02-01T00:00:00Z');
 const current=await f.service.read('org','actor',q.preflightId);expect(current.result).toBeNull();expect(current.cost.amount).toBeNull();await rejects(f.service.frameReceipt('org','actor',q.preflightId),'VIDEO_PILOT_REFERENCE_INVALID');expect(submits(f)).toHaveLength(1);
}));
test('expired captured result URL is refreshed only by the same known receipt, without a new generation',()=>nativeFixture(async f=>{
 f.script('higgsfield','generate_image',{cost:{credits:2,credits_exact:2}},receipt(uuid(15),'image'));f.script('higgsfield','jobs_wait',done(uuid(15),'image'),done(uuid(15),'image'));
 const q=await f.service.quote('org','actor',f.prepare());await f.service.admit('org','actor',q.preflightId,q.approvalHash);const id=f.rows.videoSubscriptionJob[0].id;await f.jobs.runStep('org',id);await f.jobs.runStep('org',id);
 f.media.importResult.mockRejectedValueOnce(new(require('@nestjs/common').HttpException)({code:'VIDEO_RESULT_DOWNLOAD_FAILED'},409));await f.jobs.runStep('org',id);
 expect(f.rows.videoSubscriptionJob[0].state).toBe('completed');expect(f.rows.media).toHaveLength(1);expect(f.media.importResult).toHaveBeenCalledTimes(2);expect(submits(f)).toHaveLength(1);expect(f.state.toolCalls.filter(c=>c.name==='jobs_wait')).toHaveLength(2);
}));
