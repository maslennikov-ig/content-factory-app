const {randomUUID} = require('node:crypto');
const {loadTypeScriptModule} = require('./helpers/load-ts-module.cjs');
const fixture = require('./helpers/video-subscription-domain.fixture.cjs');
const {codeOf} = require('./helpers/video-subscription-provider-fixture.cjs');
const url=process.env.CF_VIDEO_DATABASE_URL;
if(url) fixture.assertDisposableDatabaseV1(url);
const domain=url ? describe : describe.skip;
const rejects=async(promise,code)=>{let error;try{await promise;}catch(e){error=e;}expect(codeOf(error)).toBe(code);};
const withFixture=async run=>{
  // Chat persistence is the external port; actual OAuth/Prisma/provider SDK are used.
  const threads=new Map(),calls=[];
  const returnContext={ownThread:async(identity,id)=>{calls.push({identity,id});const row=threads.get(id);return row?.org===identity.organizationId && row?.actor===identity.userId && !row.hidden ? row : null;}};
  const f=await fixture.create(url,{returnContext});
  const oldFrontend=process.env.FRONTEND_URL;process.env.FRONTEND_URL='https://content.example.invalid/app/';
  const {VideoConnectionsController}=loadTypeScriptModule('apps/backend/src/api/routes/video-connections.controller.ts',{
    '@contentfactory/nestjs-libraries/videos/subscriptions/video-connection.service':{VideoConnectionService:f.connections.constructor},
    '@contentfactory/backend/services/auth/permissions/permissions.ability':loadTypeScriptModule('apps/backend/src/services/auth/permissions/permissions.ability.ts'),
    '@contentfactory/backend/services/auth/permissions/permission.exception.class':loadTypeScriptModule('apps/backend/src/services/auth/permissions/permission.exception.class.ts'),
  });
  f.threadId=randomUUID();threads.set(f.threadId,{org:f.org.id,actor:f.user.id});
  f.chatReturn=async()=>{const draft=await f.prepare();return {draft,path:`/agents/${f.threadId}?videoDraftId=${draft.id}`};};
  f.callback=async(query,provider='heygen')=>{
    const res={headers:{},setHeader(k,v){this.headers[k]=v;},redirect(status,path){this.status=status;this.location=path;return this;}};
    await new VideoConnectionsController(f.connections).callback(f.org,f.user,provider,query,res);return res;
  };
  f.authorize=async path=>{const start=await f.connections.start(f.org.id,f.user.id,'heygen',path);return Object.fromEntries((await f.provider.authorize(start.authorizationUrl)).searchParams);};
  try{return await run(f,threads,calls);}finally{if(oldFrontend===undefined)delete process.env.FRONTEND_URL;else process.env.FRONTEND_URL=oldFrontend;await f.close();}
};

domain('subscription OAuth returns to the authorized saved native chat',()=>{
  jest.setTimeout(30000);
  test('success retains exact ordered chat/draft/piece/job and adds no status flag',()=>withFixture(async(f,threads,calls)=>{
    const ready=await f.readySubscription({presenter:true});const job=await f.access.launch(ready.org,ready.actor,ready.launch);
    const path=`/agents/${f.threadId}?videoDraftId=${ready.draft.id}&pieceId=${f.pieceId}&videoJobId=${job.id}`;
    const response=await f.callback(await f.authorize(path));
    expect(response.status).toBe(303);expect(response.location).toBe(`https://content.example.invalid/app${path}`);
    expect(response.headers['Cache-Control']).toBe('no-store');expect(response.headers['Referrer-Policy']).toBe('no-referrer');
    expect(calls.every(c=>JSON.stringify(c.identity)===JSON.stringify({organizationId:f.org.id,userId:f.user.id}))).toBe(true);
    expect(f.provider.state.submits).toHaveLength(0);
  }));
  test.each(['refusal','exchange','issuer'])('%s error restores validated consumed context with one bounded final flag',kind=>withFixture(async f=>{
    const {path}=await f.chatReturn();const query=await f.authorize(path);
    if(kind==='refusal'){query.error='access_denied';delete query.code;}
    if(kind==='exchange')query.code='not-a-real-code';
    if(kind==='issuer')query.iss='https://foreign.invalid';
    const response=await f.callback(query);
    expect(response.location).toBe(`https://content.example.invalid/app${path}&connectionError=${kind==='refusal'?'VIDEO_OAUTH_REFUSED':'VIDEO_CONNECTION_UNAVAILABLE'}`);
    const replay=await f.callback(query);expect(replay.location).toBe('https://content.example.invalid/app/media?video=1&connectionError=VIDEO_CONNECTION_UNAVAILABLE');
    expect(f.provider.state.submits).toHaveLength(0);
  }));
  test('wrong session cannot restore or consume the chat context',()=>withFixture(async f=>{
    const {path}=await f.chatReturn();const ambient=f.authenticatedSession.withAuthenticatedSession;
    const query=await ambient(f.user.id,'session-A',()=>f.authorize(path));
    const wrong=await ambient(f.user.id,'session-B',()=>f.callback(query));
    expect(wrong.location).not.toContain(f.threadId);
    const valid=await ambient(f.user.id,'session-A',()=>f.callback(query));expect(valid.location).toBe(`https://content.example.invalid/app${path}`);
  }));
  test('revoked/hidden chat or lost draft ownership cannot redirect back or exchange a token',()=>withFixture(async(f,threads)=>{
    for(const loss of ['thread','draft']){
      const {draft,path}=await f.chatReturn();const query=await f.authorize(path);
      if(loss==='thread')threads.get(f.threadId).hidden=true;else await f.db.videoPromptDraft.update({where:{id:draft.id},data:{userId:f.otherUser.id}});
      const response=await f.callback(query);expect(response.location).not.toContain(f.threadId);
      threads.get(f.threadId).hidden=false;
    }
    expect(f.provider.state.exchanges).toHaveLength(0);
  }));
  test('start rejects foreign/missing thread, draft, mismatched piece/job and absent DI before registration',()=>withFixture(async(f,threads)=>{
    const {draft,path}=await f.chatReturn();
    const other=await f.service.prepare(f.org.id,f.otherUser.id,{pieceId:f.pieceId,settings:f.presenterSettings,intent:'Other owner draft'});
    const invalid=[path.replace(f.threadId,randomUUID()),path.replace(draft.id,other.id),`${path}&pieceId=${f.otherPieceId}`,`${path}&videoJobId=${randomUUID()}`];
    threads.set('foreign',{org:f.otherOrg.id,actor:f.user.id});invalid.push(path.replace(f.threadId,'foreign'));
    for(const value of invalid)await rejects(f.connections.start(f.org.id,f.user.id,'heygen',value),'VIDEO_RETURN_CONTEXT_UNAVAILABLE');
    const noContext=new f.connections.constructor(f.subscriptionRepository,f.provider.runtime,f.provider.oauth);
    await rejects(noContext.start(f.org.id,f.user.id,'heygen',path),'VIDEO_RETURN_CONTEXT_UNAVAILABLE');
    expect(f.provider.state.registrations).toHaveLength(0);
  }));
  test('optional saved job must match both the actor and exact draft',()=>withFixture(async f=>{
    const ready=await f.readySubscription({presenter:true});const job=await f.access.launch(ready.org,ready.actor,ready.launch);
    const {path}=await f.chatReturn();
    await rejects(f.connections.start(f.org.id,f.user.id,'heygen',`${path}&videoJobId=${job.id}`),'VIDEO_RETURN_CONTEXT_UNAVAILABLE');
    await f.db.videoSubscriptionJob.update({where:{id:job.id},data:{actorId:f.otherUser.id}});
    const ownDraftPath=`/agents/${f.threadId}?videoDraftId=${ready.draft.id}&videoJobId=${job.id}`;
    await rejects(f.connections.start(f.org.id,f.user.id,'heygen',ownDraftPath),'VIDEO_RETURN_CONTEXT_UNAVAILABLE');
  }));
  test('strict allowlist rejects redirects, encodings, repeated/reordered and unknown parameters before egress',()=>withFixture(async f=>{
    const {draft,path}=await f.chatReturn();
    const invalid=[`//evil.invalid${path}`,`https://evil.invalid${path}`,path.replace('/agents/','/agents/%2f'),`${path}&videoDraftId=${draft.id}`,`${path}&connectionError=VIDEO_OAUTH_REFUSED`,`${path}&extra=1`,path.replace('?videoDraftId=',`?pieceId=${f.pieceId}&videoDraftId=`),`${path}#x`,path.replace(draft.id,'%61'),'/agents/test','/media?video=1&draftId=x&draftId=y'];
    for(const value of invalid)await rejects(f.connections.start(f.org.id,f.user.id,'heygen',value),'VIDEO_RETURN_URL_INVALID');
    expect(f.provider.state.registrations).toHaveLength(0);
    expect(await f.connections.callbackFailurePath(f.org.id,f.user.id,{returnPath:'//evil.invalid',getResponse:()=>({code:'REMOTE_PROVIDER_TEXT'})})).toBe('/media?video=1&connectionError=VIDEO_CONNECTION_UNAVAILABLE');
    for(const value of ['javascript:alert(1)','https://user:pass@example.invalid','https://example.invalid/?next=bad','https://example.invalid/#bad']){
      process.env.FRONTEND_URL=value;expect(()=>f.connections.frontendDestination(path)).toThrow();
    }
  }));
});
