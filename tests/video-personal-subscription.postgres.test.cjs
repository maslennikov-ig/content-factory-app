const fixture = require('./helpers/video-subscription-domain.fixture.cjs');
const {codeOf} = require('./helpers/video-subscription-provider-fixture.cjs');
const url = process.env.CF_VIDEO_DATABASE_URL;
if (url) fixture.assertDisposableDatabaseV1(url);
const domain = url ? describe : describe.skip;
const withFixture = async run => {const f = await fixture.create(url); try {return await run(f);} finally {await f.close();}};
const rejects = async (promise, code) => {let error; try {await promise;} catch(e) {error=e;} expect(codeOf(error)).toBe(code);};

domain('personal subscription preparation over actual SDK/HTTP and disposable PostgreSQL', () => {
  jest.setTimeout(30000);
  test('actual Nest HTTP facade routes inspection/discovery with request owner and workspace', () => withFixture(async f => {
    require('reflect-metadata');
    const {Test}=require('@nestjs/testing');
    const {loadTypeScriptModule}=require('./helpers/load-ts-module.cjs');
    class AccessPort {}
    const {VideoAccessController}=loadTypeScriptModule('apps/backend/src/api/routes/video-access.controller.ts',{
      '@contentfactory/nestjs-libraries/videos/video-access.service':{VideoAccessService:AccessPort},
      '@contentfactory/backend/services/auth/permissions/permissions.ability':loadTypeScriptModule('apps/backend/src/services/auth/permissions/permissions.ability.ts'),
      '@contentfactory/backend/services/auth/permissions/permission.exception.class':loadTypeScriptModule('apps/backend/src/services/auth/permissions/permission.exception.class.ts'),
    });
    const context=await Test.createTestingModule({controllers:[VideoAccessController],providers:[{provide:AccessPort,useValue:f.access}]}).compile();
    const app=context.createNestApplication({logger:false});
    app.use((req,res,next)=>{req.org={id:req.headers['x-fixture-org']||f.org.id};req.user={id:req.headers['x-fixture-actor']||f.user.id};next();});
    await app.listen(0,'127.0.0.1');
    const request=(path,method='GET',headers={})=>new Promise((resolve,reject)=>{
      const req=require('node:http').request({host:'127.0.0.1',port:app.getHttpServer().address().port,path,method,headers},res=>{let body='';res.on('data',chunk=>body+=chunk);res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(body)}));});req.on('error',reject);req.end();
    });
    try {
      const c=await f.connect('heygen');
      const path=`/media/video-v2/connections/${c.id}`;
      expect((await request(`${path}/assets`)).body.ownedOnly).toBe(true);
      const r=await request(`${path}/readiness`);expect(r.status).toBe(200);expect(r.body.walletVerified).toBe(true);
      expect((await request(`${path}/discover`,'POST')).body.connectionId).toBe(c.id);
      expect((await request(`${path}/readiness`,'GET',{'x-fixture-actor':f.otherUser.id})).status).toBe(409);
      expect((await request(`${path}/readiness`,'GET',{'x-fixture-org':f.otherOrg.id})).status).toBe(409);
      expect(f.provider.state.submits).toHaveLength(0);expect(f.provider.state.quotes).toHaveLength(0);
    } finally {await app.close();}
  }));
  test('connect readiness is independent of reviewed generation and limits', () => withFixture(async f => {
    const original = f.provider.runtime.definition.bind(f.provider.runtime);
    f.provider.runtime.definition = p => ({...original(p), connectEnabled:true, enabled:false, schemaDigests:[], identityEndpoint:undefined});
    const choices = await f.access.choices(f.org.id, f.user.id);
    expect(choices.providers.every(p => p.connectReady && !p.generationReady && !p.enabled)).toBe(true);
    const draft = await f.prepare(); const returnPath = `/media?video=1&draftId=${draft.id}`;
    const c = await f.connect('heygen', {limits:false, returnPath});
    const row = await f.db.videoSubscriptionConnection.findUniqueOrThrow({where:{id:c.id}});
    expect(row.state).toBe('discovery_required'); expect(row.walletDigest).toMatch(/^unverified:/);
    expect(c.returnPath).toBe(returnPath);
    expect(row.encryptedTokens).not.toContain('fixture_access_');
    const ready = await f.access.personalReadiness(f.org.id, f.user.id, c.id);
    expect(ready.walletVerified).toBe(false); expect(ready.schema.reviewed).toBe(false);
    expect(ready.operations.every(o => !o.ready)).toBe(true);
    expect(ready.operations.find(o => o.kind==='presenter').blockers).toContain('VIDEO_WALLET_IDENTITY_UNVERIFIED');
    await rejects(f.connections.token(f.org.id,f.user.id,c.id), 'VIDEO_REAUTH_REQUIRED');
    expect(f.provider.state.quotes).toHaveLength(0); expect(f.provider.state.submits).toHaveLength(0);
    await f.connections.disconnect(f.org.id,f.user.id,c.id);
    await rejects(f.access.personalReadiness(f.org.id,f.user.id,c.id),'VIDEO_REAUTH_REQUIRED');
  }));
  test('authenticated discovery never promotes an unreviewed tool schema or calls a tool', () => withFixture(async f => {
    const c = await f.connect('heygen');
    f.provider.state.tools.heygen.push({name:'unreviewed_account_tool',inputSchema:{type:'object',properties:{}}});
    const r = await f.access.personalReadiness(f.org.id,f.user.id,c.id);
    expect(r.schema.reviewed).toBe(false); expect(r.schema.observedToolNames).toContain('unreviewed_account_tool');
    expect(r.operations.every(o=>!o.ready)).toBe(true);
    expect(f.provider.state.rpc.filter(r=>r.method==='tools/call')).toHaveLength(0);
  }));
  test('personal catalog excludes public, unknown, revoked and foreign-owner identities', () => withFixture(async f => {
    const c = await f.connect('heygen');
    const own={id:'exact-own',name:'Owner',ownership:'owned',state:'available',owner_subject:f.provider.state.subject,engines:['avatar_iii'],locales:['ru']};
    const rows=[own,{...own,id:'public',ownership:'public'},{...own,id:'unknown',ownership:undefined},{...own,id:'revoked',state:'revoked'},{...own,id:'foreign',owner_subject:'foreign-wallet'}];
    f.provider.script('heygen','list_avatars',{eligibility:'small_trial',account_subject:f.provider.state.subject,avatars:rows});
    f.provider.script('heygen','list_voices',{eligibility:'small_trial',account_subject:f.provider.state.subject,voices:rows});
    const a = await f.access.assets(f.org.id,f.user.id,c.id);
    expect(a.ownedOnly).toBe(true); expect(a.avatars.map(a=>a.id)).toEqual(['exact-own']); expect(a.voices.map(a=>a.id)).toEqual(['exact-own']);
    expect(a.avatars[0]).toMatchObject({ownership:'owned',state:'available'});
    await rejects(f.access.assets(f.org.id,f.otherUser.id,c.id),'VIDEO_REAUTH_REQUIRED');
    expect(f.provider.state.quotes).toHaveLength(0); expect(f.provider.state.submits).toHaveLength(0);
  }));
  test('missing own identity gives native creation/consent guidance without stock substitution', () => withFixture(async f => {
    const c = await f.connect('heygen');
    f.provider.script('heygen','list_avatars',{eligibility:'small_trial',account_subject:f.provider.state.subject,avatars:[]});
    const a = await f.access.assets(f.org.id,f.user.id,c.id);
    expect(a.status).toBe('needs_owned_assets'); expect(a.blockers).toContain('VIDEO_OWNED_AVATAR_UNAVAILABLE');
    expect(a.guidance.avatar.url).toBe('https://app.heygen.com/'); expect(a.guidance.avatar.requiresConsent).toBe(true);
    expect(f.provider.state.submits).toHaveLength(0);
  }));
  test('operation preparation keeps native exact units and explicitly rejects composition, narration and captions', () => withFixture(async f => {
    const apiResolve=jest.spyOn(f.credentials,'resolve'); const c=await f.connect('heygen'); const draft=await f.service.prepare(f.org.id,f.user.id,{pieceId:f.pieceId,settings:f.presenterSettings,intent:'Exact own identity'});
    const input={connectionId:c.id,operation:'presenter',settings:draft.settings,brief:draft.brief,references:[]};
    const prepared=await f.access.preparePersonalOperation(f.org.id,f.user.id,input);
    expect(prepared.request.quote).toMatchObject({amount:'0.125',unit:'heygen_credit'}); expect(prepared.accountGeneration).toBe(1);
    for(const operation of ['narration','captions','final_composition']) await rejects(f.access.preparePersonalOperation(f.org.id,f.user.id,{...input,operation}),'VIDEO_SUBSCRIPTION_OPERATION_UNAVAILABLE');
    expect(f.provider.state.submits).toHaveLength(0); expect(f.provider.state.quotes).toHaveLength(1);
    expect(apiResolve).not.toHaveBeenCalled();
  }));
  test('selected owned identity is rechecked immediately before paid submit', () => withFixture(async f => {
    const apiResolve=jest.spyOn(f.credentials,'resolve'); const r=await f.readySubscription({presenter:true}); const job=await f.access.launch(r.org,r.actor,r.launch);
    f.provider.script('heygen','list_voices',{eligibility:'small_trial',account_subject:f.provider.state.subject,voices:[]});
    await f.subscriptions.runStep(r.org,job.id);
    const current=await f.access.get(r.org,r.actor,job.id);
    expect(current.state).toBe('access_unavailable'); expect(current.errorCode).toBe('VIDEO_SUBSCRIPTION_OPTION_UNAVAILABLE');
    expect(f.provider.state.submits).toHaveLength(0); expect(apiResolve).not.toHaveBeenCalled();
  }));
  test.each(['avatars', 'voices'])('raw conflicting %s ID blocks an already-approved job before submit', collection => withFixture(async f => {
    const r=await f.readySubscription({presenter:true}); const job=await f.access.launch(r.org,r.actor,r.launch);
    const owned={id:collection==='avatars' ? f.presenterSettings.avatarId : f.presenterSettings.voiceId,
      ownership:'owned',state:'available',owner_subject:f.provider.state.subject,engines:['avatar_iii'],locales:['ru']};
    f.provider.script('heygen',collection==='avatars' ? 'list_avatars' : 'list_voices',{
      eligibility:'small_trial',account_subject:f.provider.state.subject,[collection]:[owned,{...owned,state:'revoked'}],
    });
    const quoteCount=f.provider.state.quotes.length;
    await f.subscriptions.runStep(r.org,job.id);
    const row=await f.db.videoSubscriptionJob.findUniqueOrThrow({where:{id:job.id}});
    expect(row.state).toBe('access_unavailable');expect(row.errorCode).toBe('VIDEO_SUBSCRIPTION_OPTION_UNAVAILABLE');
    expect(row.submitAttempts).toBe(0);expect(f.provider.state.quotes).toHaveLength(quoteCount);expect(f.provider.state.submits).toHaveLength(0);
  }));
  test.each(['preflight','submit','discovery'])('workspace disable fences every new RPC during %s', operation => withFixture(async f => {
    const c=await f.connect('heygen');
    const draft=await f.service.prepare(f.org.id,f.user.id,{pieceId:f.pieceId,settings:f.presenterSettings,intent:'Owned identity'});
    const input={draftId:draft.id,version:draft.version,access:{kind:'subscription',connectionId:c.id}};
    const job=operation==='submit' ? await f.access.launch(f.org.id,f.user.id,{preflightId:(await f.access.preflight(f.org.id,f.user.id,input)).id,intentId:require('node:crypto').randomUUID()}) : null;
    const fetch=f.provider.runtime.fetch.bind(f.provider.runtime); let fenced=false,count;
    f.provider.runtime.fetch=async(def,url,init)=>{
      const result=await fetch(def,url,init);
      const rpc=typeof init?.body==='string' && String(url).endsWith('/mcp') ? JSON.parse(init.body) : null;
      if(!fenced && rpc?.method==='initialize') {
        fenced=true; await f.connections.workspacePolicy(f.org.id,f.user.id,false); count=f.provider.state.rpc.length;
      }
      return result;
    };
    if(operation==='submit') await f.subscriptions.runStep(f.org.id,job.id);
    else await rejects(operation==='discovery' ? f.access.personalReadiness(f.org.id,f.user.id,c.id) : f.access.preflight(f.org.id,f.user.id,input),'VIDEO_CONNECTION_UNAVAILABLE');
    expect(fenced).toBe(true); expect(f.provider.state.rpc).toHaveLength(count); expect(f.provider.state.submits).toHaveLength(0);
  }));
  test('launch disable preserves receipt-bound read and save recovery', () => withFixture(async f => {
    const r=await f.readySubscription(); const job=await f.access.launch(r.org,r.actor,r.launch);
    await f.subscriptions.runStep(r.org,job.id); expect(f.provider.state.submits).toHaveLength(1);
    await f.connections.workspacePolicy(r.org,r.actor,false);
    const done=await f.runSubscriptionToTerminal(job.id);
    expect(done.state).toBe('completed'); expect(done.result.path).toBeTruthy(); expect(f.provider.state.submits).toHaveLength(1);
  }));
  test('provisional reconnect in one workspace preserves another workspace authorization', () => withFixture(async f => {
    const original=f.provider.runtime.definition.bind(f.provider.runtime);
    f.provider.runtime.definition=p=>({...original(p),identityEndpoint:undefined,enabled:false});
    const a=await f.connect('heygen',{limits:false}); const b=await f.connect('heygen',{org:f.otherOrg.id,limits:false});
    await f.connect('heygen',{limits:false});
    const row=await f.db.videoSubscriptionConnection.findUniqueOrThrow({where:{id:b.id}});
    expect(row.state).toBe('discovery_required'); expect(row.encryptedTokens).toBeTruthy();
    expect((await f.access.personalReadiness(f.otherOrg.id,f.user.id,b.id)).connectionId).toBe(b.id);
    expect((await f.db.videoSubscriptionConnection.findUniqueOrThrow({where:{id:a.id}})).state).toBe('disconnected');
  }));
  test('discover action binds a newly reviewed real wallet profile without another OAuth login', () => withFixture(async f => {
    const original=f.provider.runtime.definition.bind(f.provider.runtime);
    f.provider.runtime.definition=p=>({...original(p),identityEndpoint:undefined,enabled:false});
    const c=await f.connect('heygen',{limits:false});
    f.provider.runtime.definition=original;
    const ready=await f.access.discoverPersonal(f.org.id,f.user.id,c.id);
    expect(ready.walletVerified).toBe(true); expect(ready.accountGeneration).toBe(2); expect(f.provider.state.exchanges).toHaveLength(1);
    expect(f.provider.state.submits).toHaveLength(0);
  }));
  test('discovery credentials never cross actor/workspace or become spendable on reconnect', () => withFixture(async f => {
    const original=f.provider.runtime.definition.bind(f.provider.runtime);
    f.provider.runtime.definition=p=>({...original(p),connectEnabled:true,enabled:false,identityEndpoint:undefined});
    const c=await f.connect('heygen',{limits:false});
    await rejects(f.access.personalReadiness(f.org.id,f.otherUser.id,c.id),'VIDEO_REAUTH_REQUIRED');
    await rejects(f.access.personalReadiness(f.otherOrg.id,f.user.id,c.id),'VIDEO_REAUTH_REQUIRED');
    f.provider.runtime.definition=original;
    const verified=await f.connect('heygen');
    expect(verified.id).not.toBe(c.id);
    const old=await f.db.videoSubscriptionConnection.findUniqueOrThrow({where:{id:c.id}});
    expect(old.state).toBe('disconnected'); expect(old.encryptedTokens).toBeNull();
    await rejects(f.access.personalReadiness(f.org.id,f.user.id,c.id),'VIDEO_REAUTH_REQUIRED');
  }));
});
