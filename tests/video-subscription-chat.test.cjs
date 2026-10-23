const {create}=require('./helpers/video-subscription-domain.fixture.cjs');
const {loadTypeScriptModule}=require('./helpers/load-ts-module.cjs');
const enabled=process.env.CF_VIDEO_DATABASE_DISPOSABLE==='1';
const suite=enabled?describe:describe.skip;
suite('video access chat uses saved facade approval and persisted jobs',()=>{
  // Real PostgreSQL and local OAuth/MCP transports, matching the other video
  // integration suites under the full release run's coverage instrumentation.
  jest.setTimeout(30000);
  let f,caps,ctx;
  beforeAll(async()=>{f=await create(process.env.CF_VIDEO_DATABASE_URL);caps=loadTypeScriptModule('libraries/nestjs-libraries/src/chat/capabilities/catalogue/video-access.capabilities.v2.ts',{
    '@contentfactory/backend/api/routes/video-access.controller':{VideoAccessController:class{}},
    '../../../videos/video-access.service':{VideoAccessService:f.access.constructor},
  });ctx={organizationId:f.org.id,userId:f.user.id,language:'ru',service:()=>f.access,resolveAuthorRequest:async()=>({messageId:'authored',text:'Создай видео'})};},30000);
  afterAll(async()=>{await f?.close();});
  test('stored script/settings/credit approval is the one used by chat; replay shares the UI job',async()=>{
    const ready=await f.readySubscription({provider:'heygen'});const input={draftId:ready.draft.id,version:ready.draft.version,preflightId:ready.preflight.id,requestMessageId:'authored'};
    const snapshot=await caps.videoLaunchV2.approvalContent(ctx,input);expect(snapshot.brief.script).toBe(ready.draft.brief.script);expect(snapshot.quote.unit).toBe('heygen_credit');
    expect(await caps.videoLaunchV2.describeApproval(ctx,input)).toContain('heygen_credit');
    const a=await caps.videoLaunchV2.run(ctx,input),b=await caps.videoLaunchV2.run(ctx,input);expect(a.id).toBe(b.id);
    const completed=await f.runSubscriptionToTerminal(a.id);expect(completed.state).toBe('completed');expect(f.provider.state.submits).toHaveLength(1);
    expect(await caps.videoStatusV2.run(ctx,{jobId:a.id})).toMatchObject({id:a.id,access:{kind:'subscription'}});
  });
  test('native Mastra tool uses real authored ingress, requires approval and emits the persisted facade result',async()=>{
    const helper=require('./helpers/agent-capabilities.cjs');
    const registry=helper.loadCapabilityModule('mastra.adapter.ts');
    const contextModule=helper.loadCapabilityModule('capability.context.ts');
    const {RequestContext,MASTRA_RESOURCE_ID_KEY,MASTRA_THREAD_ID_KEY}=require('@mastra/core/request-context');
    const {randomUUID}=require('node:crypto');
    const ready=await f.readySubscription();const messageId=randomUUID();
    const input={draftId:ready.draft.id,version:ready.draft.version,preflightId:ready.preflight.id,requestMessageId:messageId};
    const requestContext=new RequestContext();
    contextModule.seedCapabilityContext(requestContext,{organizationId:f.org.id,userId:f.user.id,organizationCreatedAt:f.org.createdAt.toISOString(),role:'ADMIN',language:'ru',timeZone:'Europe/Moscow'});
    requestContext.set(MASTRA_THREAD_ID_KEY,randomUUID());requestContext.set(MASTRA_RESOURCE_ID_KEY,`${f.org.id}:${f.user.id}`);
    requestContext.set('cf.originalAuthorRequest',JSON.stringify({messageId,text:'Создай видео по этому согласованному сценарию.'}));
    const tool=registry.buildCapabilityTool(caps.videoLaunchV2,{services:helper.servicesFrom({VideoAccessService:f.access}),language:'ru',entrance:'chat'});
    expect(tool.requireApproval(input)).toBe(true);
    const executed=await helper.executeTool(tool,input,{requestContext});expect(executed.output.ok).toBe(true);
    expect(executed.output.capability).toBe('video.launch_v2');
    const rows=await f.db.videoSubscriptionJob.findMany({where:{preflightId:ready.preflight.id}});expect(rows).toHaveLength(1);
    expect(executed.parts.some(p=>p.data?.videoJobId===rows[0].id)).toBe(true);
    const replay=await helper.executeTool(tool,input,{requestContext});expect(replay.output.ok).toBe(true);
    expect(await f.db.videoSubscriptionJob.count({where:{preflightId:ready.preflight.id}})).toBe(1);
  });
  test('forged authored request and another actor cannot reuse approval',async()=>{
    const ready=await f.readySubscription();const input={draftId:ready.draft.id,version:ready.draft.version,preflightId:ready.preflight.id,requestMessageId:'authored'};
    await expect(caps.videoLaunchV2.run({...ctx,resolveAuthorRequest:async()=>null},input)).rejects.toMatchObject({code:'VIDEO_REQUEST_NOT_AUTHORED'});
    await f.db.userOrganization.update({where:{userId_organizationId:{userId:f.otherUser.id,organizationId:f.org.id}},data:{role:'EDITOR'}});
    await expect(caps.videoLaunchV2.run({...ctx,userId:f.otherUser.id},input)).rejects.toMatchObject({code:'VIDEO_PREFLIGHT_STALE'});
  });
  test('manual capability attaches one owned result and never calls MCP',async()=>{
    const draft=await f.prepare();const media=await f.addOwnedVideo();const before=f.provider.state.submits.length;
    const a=await caps.videoManualV2.run(ctx,{draftId:draft.id,version:draft.version,mediaId:media.id});
    expect(a.access.kind).toBe('manual');expect(a.cost.certainty).toBe('external_unknown');expect(f.provider.state.submits).toHaveLength(before);
  });
});
