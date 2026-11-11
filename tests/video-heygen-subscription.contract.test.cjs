const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createProviderFixture, codeOf } = require('./helpers/video-subscription-provider-fixture.cjs');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const settings = () => ({provider: 'heygen', model: 'heygen-avatar', mode: 'presenter', locale: 'ru', duration: 15, aspectRatio: '9:16', resolution: '720p', audio: true, captions: true, engine: 'avatar_iii', avatarId: 'fixture_avatar', voiceId: 'fixture_voice_ru'});
const brief = {prompt: '', script: 'Запуск 22.10.2026. Масса 12,5 кг. Продукт не содержит сахар.\nНе обещайте лечение.', scriptPolicy: 'exact'};
const withFixture = async run => {
  const f = await createProviderFixture();
  try { return await run(f, f.runtime.definition('heygen'), f.issueTokens('heygen').access_token); }
  finally { await f.close(); }
};

test('HeyGen polling refuses another job even when its result and charge agree with each other', async () => {
  await withFixture(async (f, def, token) => {
    for (const status of ['queued', 'running', 'completed', 'failed', 'canceled']) {
      for (const job_id of ['foreign_job', undefined]) {
        f.script('heygen', 'get_video', {data: {job_id, status, video_url: 'https://93.184.216.34/foreign.mp4',
          charge: {job_id, unit: 'heygen_credit', amount: '0.5'}}});
        await assert.rejects(f.heygen.poll(def, token, {id: 'expected_job'}),
          e => codeOf(e) === 'VIDEO_PROVIDER_RECEIPT_MISMATCH');
      }
    }
    assert.equal(f.state.submits.length, 0);
    assert.equal(f.state.quotes.length, 0);
  });
});

test('synthetic HeyGen exact-script MCP keeps dates/numbers/negations, explicit renderer, voice/locale and captions', async () => {
  await withFixture(async (f, def, token) => {
    const request = await f.heygen.prepare(def, token, settings(), brief, []);
    assert.equal(f.state.submits.length, 0); assert.equal(f.state.quotes.length, 1);
    assert.deepEqual(request.args, {script: brief.script, engine: 'avatar_iii', avatar_id: 'fixture_avatar', voice_id: 'fixture_voice_ru', locale: 'ru', aspect_ratio: '9:16', resolution: '720p', captions: true});
    assert.deepEqual(f.state.quotes[0].args, request.args); assert.equal(request.args.duration, undefined);
    assert.equal(request.quote.unit, 'heygen_credit'); assert.equal(request.quote.amount, '0.125'); assert.equal(request.quote.upperBound, null);
    const receipt = await f.heygen.submit(def, token, request);
    assert.match(receipt.id, /^fixture_heygen_/); assert.deepEqual(f.state.submits[0].args, request.args);
    const status = await f.heygen.poll(def, token, receipt);
    assert.equal(status.jobId, receipt.id); assert.equal(status.state, 'completed'); assert.equal(status.actualCost, null);
    assert.deepEqual(f.state.polls[0].args, {video_id: receipt.id});
    assert.ok(f.state.rpc.every(call => call.method !== 'create_video_agent'));
  });
});

test('HeyGen unknown trial eligibility, API key requirement and unavailable asset fail without video generation', async () => {
  for (const eligibility of ['unknown', 'unlimited', null]) await withFixture(async (f, def, token) => {
    f.state.eligibility = eligibility;
    await assert.rejects(f.heygen.prepare(def, token, settings(), brief, []), e => codeOf(e) === 'VIDEO_SUBSCRIPTION_TRIAL_UNVERIFIED');
    assert.equal(f.state.quotes.length, 0); assert.equal(f.state.submits.length, 0);
  });
  await withFixture(async (f, def, token) => {
    f.script('heygen', 'list_avatars', {error: 'api_key_required'});
    await assert.rejects(f.heygen.prepare(def, token, settings(), brief, []), e => codeOf(e) === 'VIDEO_SUBSCRIPTION_API_KEY_REQUIRED');
    assert.equal(f.state.submits.length, 0);
  });
  for (const override of [{voiceId: 'foreign_voice'}, {avatarId: 'foreign_avatar'}, {locale: 'ja-JP'}]) await withFixture(async (f, def, token) => {
    await assert.rejects(f.heygen.prepare(def, token, {...settings(), ...override}, brief, []), e => codeOf(e) === 'VIDEO_SUBSCRIPTION_OPTION_UNAVAILABLE');
    assert.equal(f.state.quotes.length, 0); assert.equal(f.state.submits.length, 0);
  });
});

test('HeyGen raw duplicate avatar/voice IDs are ambiguous before ownership and availability filtering', async () => {
  for (const collection of ['avatars', 'voices']) {
    for (const conflict of [{state: 'revoked'}, {owner_subject: 'foreign-wallet'}, {ownership: 'public'}, {ownership: undefined}, {}, {name: 'Another valid variant'}]) {
      await withFixture(async (f, def, token) => {
        const owned = {id: collection === 'avatars' ? settings().avatarId : settings().voiceId,
          ownership: 'owned', state: 'available', owner_subject: f.state.subject,
          engines: ['avatar_iii'], locales: ['ru']};
        f.script('heygen', collection === 'avatars' ? 'list_avatars' : 'list_voices', {
          eligibility: 'small_trial', account_subject: f.state.subject, [collection]: [owned, {...owned, ...conflict}],
        });
        await assert.rejects(f.heygen.prepare(def, token, settings(), brief, []), e => codeOf(e) === 'VIDEO_SUBSCRIPTION_OPTION_UNAVAILABLE');
        assert.equal(f.state.quotes.length, 0); assert.equal(f.state.submits.length, 0);
      });
    }
  }
});

test('HeyGen implicit/unknown renderer, non-exact script or unsupported settings cannot be submitted', async () => {
  for (const override of [{engine: undefined}, {engine: 'avatar_v'}, {audio: false}, {resolution: '4k'}, {mode: 'clip'}]) await withFixture(async (f, def, token) => {
    await assert.rejects(f.heygen.prepare(def, token, {...settings(), ...override}, brief, []));
    assert.equal(f.state.quotes.length, 0); assert.equal(f.state.submits.length, 0);
  });
  await withFixture(async (f, def, token) => {
    await assert.rejects(f.heygen.prepare(def, token, settings(), {...brief, scriptPolicy: 'creative'}, []));
    await assert.rejects(f.heygen.prepare(def, token, settings(), brief, [{id: 'image'}]));
    assert.equal(f.state.submits.length, 0);
  });
});

test('HeyGen unreviewed/missing quote schema and unknown/expired price never borrow API USD prices', async () => {
  await withFixture(async (f, def, token) => {
    f.state.tools.heygen = f.state.tools.heygen.filter(t => t.name !== 'quote_video');
    await assert.rejects(f.heygen.prepare(def, token, settings(), brief, []), e => codeOf(e) === 'VIDEO_SCHEMA_UNSUPPORTED');
    assert.equal(f.state.submits.length, 0);
  });
  for (const response of [{}, {kind: 'quote', unit: 'USD', credits: '1'}, {kind: 'quote', unit: 'heygen_credit', credits: null}, {kind: 'quote', unit: 'heygen_credit', credits: '0.1', expires_at: '2000-01-01T00:00:00Z'}, 'malformed', 'isError']) await withFixture(async (f, def, token) => {
    f.script('heygen', 'quote_video', response);
    await assert.rejects(f.heygen.prepare(def, token, settings(), brief, []));
    assert.equal(f.state.submits.length, 0);
  });
});

test('HeyGen lost/malformed/failed create response is one mutation; data receipt envelope is checked', async () => {
  for (const response of ['lost', 'malformed', 'isError', {}, {data: {video_id: '../unsafe'}}]) await withFixture(async (f, def, token) => {
    const request = await f.heygen.prepare(def, token, settings(), brief, []);
    f.script('heygen', 'create_video', response);
    await assert.rejects(f.heygen.submit(def, token, request));
    assert.equal(f.state.submits.length, 1); assert.equal(f.state.polls.length, 0);
  });
});

test('HeyGen completed data envelope preserves only same-job/same-unit charge and result URL', async () => {
  await withFixture(async (f, def, token) => {
    const request = await f.heygen.prepare(def, token, settings(), brief, []);
    const receipt = await f.heygen.submit(def, token, request); f.state.confirmedCharge = '0.100001';
    assert.equal((await f.heygen.poll(def, token, receipt)).actualCost, '0.100001');
    f.script('heygen', 'get_video', {data: {job_id: receipt.id, status: 'completed', video_url: 'https://93.184.216.34/a.mp4', charge: {job_id: receipt.id, unit: 'USD', amount: '1'}}});
    assert.equal((await f.heygen.poll(def, token, receipt)).actualCost, null);
    f.script('heygen', 'get_video', {data: {job_id: receipt.id, status: 'completed'}});
    await assert.rejects(f.heygen.poll(def, token, receipt));
  });
});

test('private HeyGen catalog uses pinned read schemas, observed items pages and explicit private filters, without wallet or priced schema', async () => {
  const helper = loadTypeScriptModule('libraries/nestjs-libraries/src/videos/subscriptions/video-heygen-owned-catalog.v1.ts');
  const {subscriptionHash} = loadTypeScriptModule('libraries/nestjs-libraries/src/videos/subscriptions/video-provider-registry.ts');
  // Synthetic protocol inventory only; it never approves a live schema.
  const reads = helper.HEYGEN_OWNED_CATALOG_READS_V1.map(read => ({name:read.tool,inputSchema:{type:'object',properties:{}}})).sort((a,b)=>a.name.localeCompare(b.name));
  const f = await createProviderFixture({moduleMocks:{'./video-heygen-owned-catalog.v1':{...helper,HEYGEN_OWNED_CATALOG_SCHEMA_V1:subscriptionHash(reads)}}});
  try {
    const def = {...f.runtime.definition('heygen'),enabled:false,identityEndpoint:undefined,schemaDigests:[],ownedAssetReadProfile:'heygen_private_catalog_v1'};
    f.state.tools.heygen = [...reads,{name:'unrelated_new_mutation',inputSchema:{type:'object',properties:{}}}];
    const token = f.issueTokens('heygen').access_token;
    f.script('heygen','list_avatar_groups',{items:[{id:'private_group',name:'Own avatar',consent_status:null,status:'completed'}],has_more:false});
    f.script('heygen','list_avatar_looks',{items:[{id:'private_look',group_id:'private_group',name:'Own look',status:'completed',supported_api_engines:['avatar_iv']}],has_more:false});
    f.script('heygen','list_voices',{items:[{voice_id:'private_voice',name:'Own voice',language:'Russian',type:'private'}],has_more:false});
    const result = await f.mcp.readHeygenOwnedCatalog(def,token,async()=>{});
    assert.equal(result.catalog.renderQualified,false);assert.equal(result.catalog.avatars[0].state,'unverified');
    assert.deepEqual(result.catalog.voices[0].locales,['ru']);
    assert.deepEqual(f.state.toolCalls.map(({name,args})=>({name,args})),[
      {name:'list_avatar_groups',args:{ownership:'private',limit:50}},
      {name:'list_avatar_looks',args:{ownership:'private',limit:50}},
      {name:'list_voices',args:{type:'private',limit:100}},
    ]);
    assert.equal(f.state.submits.length,0);assert.equal(f.state.quotes.length,0);assert.equal(f.state.identities.length,0);
    f.state.tools.heygen.find(tool=>tool.name==='list_voices').inputSchema.properties.type={const:'public'};
    await assert.rejects(f.mcp.readHeygenOwnedCatalog(def,token,async()=>{}),error=>codeOf(error)==='VIDEO_SCHEMA_CHANGED');
    assert.equal(f.state.toolCalls.length,3);
  } finally {await f.close();}
});

const withOwnedGroupFixture = async run => {
  const helper=loadTypeScriptModule('libraries/nestjs-libraries/src/videos/subscriptions/video-heygen-owned-catalog.v1.ts');
  const {subscriptionHash}=loadTypeScriptModule('libraries/nestjs-libraries/src/videos/subscriptions/video-provider-registry.ts');
  const reads=Object.keys(helper.HEYGEN_OWNED_AVATAR_GROUP_READ_SCHEMAS_V1).map(name=>({name,inputSchema:{type:'object',properties:{}}}));
  const pins=Object.fromEntries(reads.map(tool=>[tool.name,subscriptionHash(tool)]));
  const f=await createProviderFixture({moduleMocks:{'./video-heygen-owned-catalog.v1':{...helper,HEYGEN_OWNED_AVATAR_GROUP_READ_SCHEMAS_V1:pins}}});
  try {
    f.state.tools.heygen=[...reads,{name:'create_avatar_consent',inputSchema:{type:'object',properties:{groupId:{title:'Groupid',type:'string'},rerouteUrl:{anyOf:[{type:'string'},{type:'null'}],default:null,description:"Callback URL where the user is redirected after completing consent. Defaults to HeyGen's consent completion page.",title:'Rerouteurl'}},required:['groupId'],title:'CreateAvatarConsentInput'}}];
    const def={...f.runtime.definition('heygen'),enabled:false,identityEndpoint:undefined,schemaDigests:[],ownedAssetReadProfile:'heygen_private_catalog_v1'};
    const token=f.issueTokens('heygen').access_token;
    const script=(detail,groups=[{id:'owned_group',name:'Owned group',consent_status:null}],looks=[{id:'owned_look',group_id:'owned_group',name:'My look',avatar_type:'digital_twin'}])=>{
      f.script('heygen','list_avatar_groups',{items:groups,has_more:false});
      f.script('heygen','list_avatar_looks',{items:looks,has_more:false});
      if(detail)f.script('heygen','get_avatar_group',detail);
    };
    return await run({f,def,token,script});
  } finally {await f.close();}
};
test('owned avatar group status uses only fresh private membership reads and exact group lookup, never consent creation or paid readiness',async()=>{
  await withOwnedGroupFixture(async({f,def,token,script})=>{
    script({data:{id:'owned_group',name:'Owned identity',consent_status:'accepted',history:['PRIVATE_HISTORY'],url:'https://secret.example/consent'}});
    const guardCalls=[];
    const result=await f.heygen.readOwnedAvatarGroup(def,token,{avatarId:'owned_look'},async()=>{guardCalls.push(true);});
    assert.equal(result.consentStatus,'accepted');assert.equal(result.avatarType,'digital_twin');assert.equal(result.groupType,null);
    assert.equal(result.groupId,'owned_group');assert.equal(result.readOnly,true);assert.equal(result.renderQualified,false);
    assert.equal(JSON.stringify(result).includes('PRIVATE_HISTORY'),false);assert.equal(JSON.stringify(result).includes('secret.example'),false);
    assert.ok(guardCalls.length>=6);
    assert.deepEqual(f.state.toolCalls.map(({name,args})=>({name,args})),[
      {name:'list_avatar_groups',args:{ownership:'private',limit:50}},
      {name:'list_avatar_looks',args:{ownership:'private',limit:50}},
      {name:'get_avatar_group',args:{groupId:'owned_group'}},
    ]);
    assert.equal(f.state.submits.length,0);assert.equal(f.state.quotes.length,0);assert.equal(f.state.identities.length,0);
  });
});
test('owned avatar group read stops before tool calls on any pinned schema drift and before group lookup on foreign selection or revoked guard',async()=>{
  for(const name of ['list_avatar_groups','list_avatar_looks','get_avatar_group'])await withOwnedGroupFixture(async({f,def,token})=>{
    f.state.tools.heygen.find(tool=>tool.name===name).inputSchema.properties.changed={type:'string'};
    await assert.rejects(f.heygen.readOwnedAvatarGroup(def,token,{avatarId:'owned_look'},async()=>{}),error=>codeOf(error)==='VIDEO_SCHEMA_CHANGED');
    assert.equal(f.state.toolCalls.length,0);
  });
  for(const selection of [{avatarId:'foreign_look'},{avatarId:'owned_look',groupId:'foreign_group'}])await withOwnedGroupFixture(async({f,def,token,script})=>{
    script(null);
    await assert.rejects(f.heygen.readOwnedAvatarGroup(def,token,selection,async()=>{}),error=>codeOf(error)==='VIDEO_SUBSCRIPTION_OPTION_UNAVAILABLE');
    assert.deepEqual(f.state.toolCalls.map(tool=>tool.name),['list_avatar_groups','list_avatar_looks']);
  });
  await withOwnedGroupFixture(async({f,def,token})=>{
    const {videoErrorV1}=loadTypeScriptModule('libraries/nestjs-libraries/src/videos/video-brief.v1.ts');
    await assert.rejects(f.heygen.readOwnedAvatarGroup(def,token,{avatarId:'owned_look'},async()=>videoErrorV1('VIDEO_REAUTH_REQUIRED',409)),error=>codeOf(error)==='VIDEO_REAUTH_REQUIRED');
    assert.equal(f.state.toolCalls.length,0);assert.equal(f.state.submits.length,0);
  });
  await withOwnedGroupFixture(async({f,def,token,script})=>{
    script(null);
    const {videoErrorV1}=loadTypeScriptModule('libraries/nestjs-libraries/src/videos/video-brief.v1.ts');
    await assert.rejects(f.heygen.readOwnedAvatarGroup(def,token,{avatarId:'owned_look'},async()=>{
      if(f.state.toolCalls.some(tool=>tool.name==='list_avatar_looks'))videoErrorV1('VIDEO_ACCESS_DENIED',403);
    }),error=>codeOf(error)==='VIDEO_ACCESS_DENIED');
    assert.deepEqual(f.state.toolCalls.map(tool=>tool.name),['list_avatar_groups','list_avatar_looks']);
    assert.equal(f.state.submits.length,0);
  });
});

test('personal consent issuance dispatches one exact group RPC after fresh owned reads and the durable hook, without render or quote',async()=>{
  for(const status of ['pending','rejected'])await withOwnedGroupFixture(async({f,def,token,script})=>{
    script({data:{id:'owned_group',consent_status:status}});
    f.script('heygen','create_avatar_consent',{data:{avatar_group:{id:'owned_group',consent_status:'pending'},url:'https://app.heygen.com/consent/synthetic_one_use'}});
    let hooks=0;const phases=[];const fetch=f.runtime.fetch.bind(f.runtime);
    f.runtime.fetch=async(...args)=>{phases.push(args[3]?.phase);return fetch(...args);};
    const result=await f.heygen.requestOwnedAvatarConsent(def,token,{avatarId:'owned_look',groupId:'owned_group'},async()=>{},async()=>{
      hooks++;assert.deepEqual(f.state.toolCalls.map(tool=>tool.name),['list_avatar_groups','list_avatar_looks','get_avatar_group']);
    });
    assert.deepEqual(result,{kind:'issued',avatarId:'owned_look',groupId:'owned_group',consentUrl:'https://app.heygen.com/consent/synthetic_one_use'});
    assert.equal(hooks,1);assert.equal(phases.filter(phase=>phase==='consent/issue').length,1);
    assert.deepEqual(f.state.toolCalls.filter(tool=>tool.name==='create_avatar_consent').map(tool=>tool.args),[{groupId:'owned_group'}]);
    assert.equal(f.state.submits.length,0);assert.equal(f.state.quotes.length,0);assert.equal(f.state.refreshes.length,0);
  });
});
test('unparseable consent response is encrypted for recovery without exposing the provider URL',async()=>{
  const prior=process.env.JWT_SECRET;process.env.JWT_SECRET='consent-protocol-fixture-only';
  try {await withOwnedGroupFixture(async({f,def,token,script})=>{
    script({data:{id:'owned_group',consent_status:'pending'}});
    f.script('heygen','create_avatar_consent',{data:{avatar_group:{id:'owned_group',consent_status:'pending'},url:'https://unexpected.example/consent/PRIVATE_URL'}});
    await assert.rejects(f.heygen.requestOwnedAvatarConsent(def,token,{avatarId:'owned_look',groupId:'owned_group'},async()=>{},async()=>{}),error=>{
      assert.equal(codeOf(error),'VIDEO_AVATAR_CONSENT_OUTCOME_UNCERTAIN');
      assert.equal(JSON.stringify(error.getResponse()).includes('PRIVATE_URL'),false);
      assert.equal(typeof error.encryptedProviderResponse,'string');
      const {AuthService}=loadTypeScriptModule('libraries/helpers/src/auth/auth.service.ts');
      assert.ok(AuthService.fixedDecryption(error.encryptedProviderResponse).includes('PRIVATE_URL'));
      return true;
    });
    assert.equal(f.state.toolCalls.filter(tool=>tool.name==='create_avatar_consent').length,1);
  });} finally {if(prior===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=prior;}
});
test('an HTTP error is captured encrypted even when the MCP SDK rejects it before tool decoding',async()=>{
  const prior=process.env.JWT_SECRET;process.env.JWT_SECRET='consent-protocol-fixture-only';
  try {await withOwnedGroupFixture(async({f,def,token,script})=>{
    script({data:{id:'owned_group',consent_status:'pending'}});
    f.script('heygen','create_avatar_consent',{data:{avatar_group:{id:'owned_group',consent_status:'pending'},url:'https://heygen.com/consent/PRIVATE_URL'}});
    f.state.respondMcp=async({res,rpc})=>{
      if(rpc.method!=='tools/call'||rpc.params.name!=='create_avatar_consent')return false;
      res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{code:'synthetic_error',message:'PRIVATE_URL'}}));return true;
    };
    await assert.rejects(f.heygen.requestOwnedAvatarConsent(def,token,{avatarId:'owned_look',groupId:'owned_group'},async()=>{},async()=>{}),error=>{
      assert.equal(codeOf(error),'VIDEO_AVATAR_CONSENT_OUTCOME_UNCERTAIN');
      assert.equal(JSON.stringify(error.getResponse()).includes('PRIVATE_URL'),false);
      const {AuthService}=loadTypeScriptModule('libraries/helpers/src/auth/auth.service.ts');
      const saved=JSON.parse(AuthService.fixedDecryption(error.encryptedProviderResponse));
      assert.equal(saved.kind,'http');assert.equal(saved.status,400);assert.ok(saved.body.includes('synthetic_error'));
      return true;
    });
  });} finally {if(prior===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=prior;}
});
test('personal consent issuance leaves accepted/photo/unknown states unchanged and refuses wrong group or any schema drift before dispatch',async()=>{
  for(const [detail,kind] of [[{consent_status:'accepted'},'not_needed'],[{type:'photo',consent_status:null},'not_needed'],[{type:'prompt',consent_status:'pending'},'unknown'],[{consent_status:null},'unknown'],[{consent_status:'new_status'},'unknown']])await withOwnedGroupFixture(async({f,def,token,script})=>{
    script({data:{id:'owned_group',...detail}});let hooks=0;
    const result=await f.heygen.requestOwnedAvatarConsent(def,token,{avatarId:'owned_look',groupId:'owned_group'},async()=>{},async()=>{hooks++;});
    assert.equal(result.kind,kind);assert.equal(result.renderQualified,false);assert.equal(hooks,0);
    assert.equal(f.state.toolCalls.filter(tool=>tool.name==='create_avatar_consent').length,0);
  });
  for(const name of ['list_avatar_groups','list_avatar_looks','get_avatar_group','create_avatar_consent'])await withOwnedGroupFixture(async({f,def,token})=>{
    f.state.tools.heygen.find(tool=>tool.name===name).inputSchema.properties.changed={type:'string'};
    await assert.rejects(f.heygen.requestOwnedAvatarConsent(def,token,{avatarId:'owned_look',groupId:'owned_group'},async()=>{},async()=>{}),error=>codeOf(error)==='VIDEO_SCHEMA_CHANGED');
    assert.equal(f.state.toolCalls.length,0);
  });
  await withOwnedGroupFixture(async({f,def,token,script})=>{
    script(null);
    await assert.rejects(f.heygen.requestOwnedAvatarConsent(def,token,{avatarId:'owned_look',groupId:'foreign_group'},async()=>{},async()=>{}),error=>codeOf(error)==='VIDEO_SUBSCRIPTION_OPTION_UNAVAILABLE');
    assert.deepEqual(f.state.toolCalls.map(tool=>tool.name),['list_avatar_groups','list_avatar_looks']);
  });
});
test('personal consent issuance guard/hook rejection sends no issue; all lost or invalid post-dispatch responses stay uncertain without retry or secret errors',async()=>{
  for(const failHook of [true,false])await withOwnedGroupFixture(async({f,def,token,script})=>{
    script({data:{id:'owned_group',consent_status:'pending'}});
    const {videoErrorV1}=loadTypeScriptModule('libraries/nestjs-libraries/src/videos/video-brief.v1.ts');
    await assert.rejects(f.heygen.requestOwnedAvatarConsent(def,token,{avatarId:'owned_look',groupId:'owned_group'},async()=>{
      if(!failHook&&f.state.toolCalls.some(tool=>tool.name==='get_avatar_group'))videoErrorV1('VIDEO_ACCESS_DENIED',403);
    },async()=>{videoErrorV1('VIDEO_ACCESS_DENIED',403);}),error=>codeOf(error)==='VIDEO_ACCESS_DENIED');
    assert.equal(f.state.toolCalls.filter(tool=>tool.name==='create_avatar_consent').length,0);
  });
  await withOwnedGroupFixture(async({f,def,token,script})=>{
    script({data:{id:'owned_group',consent_status:'pending'}});let marked=false;
    const {videoErrorV1}=loadTypeScriptModule('libraries/nestjs-libraries/src/videos/video-brief.v1.ts');
    await assert.rejects(f.heygen.requestOwnedAvatarConsent(def,token,{avatarId:'owned_look',groupId:'owned_group'},async()=>{
      if(marked)videoErrorV1('VIDEO_ACCESS_DENIED',403);
    },async()=>{marked=true;}),error=>codeOf(error)==='VIDEO_ACCESS_DENIED');
    assert.equal(marked,true);assert.equal(f.state.toolCalls.filter(tool=>tool.name==='create_avatar_consent').length,0);
  });
  for(const response of ['lost','malformed','isError',{data:{avatar_group:{id:'foreign_group',consent_status:'pending'},url:'https://heygen.com/consent/PRIVATE_URL'}},{data:{avatar_group:{id:'owned_group',consent_status:'pending'},url:'https://foreign.example/consent/PRIVATE_URL'}}])await withOwnedGroupFixture(async({f,def,token,script})=>{
    script({data:{id:'owned_group',consent_status:'rejected'}});f.script('heygen','create_avatar_consent',response);
    let hooks=0;
    await assert.rejects(f.heygen.requestOwnedAvatarConsent(def,token,{avatarId:'owned_look',groupId:'owned_group'},async()=>{},async()=>{hooks++;}),error=>{
      assert.equal(JSON.stringify(error.getResponse()).includes('PRIVATE_URL'),false);
      const reason = error.getResponse().reason;
      assert.ok(['provider_tool_error','provider_response_invalid','timeout','transport_error','unknown'].includes(reason));
      if (response === 'isError') assert.equal(reason,'provider_tool_error');
      if (response === 'malformed' || typeof response === 'object') assert.equal(reason,'provider_response_invalid');
      return codeOf(error)==='VIDEO_AVATAR_CONSENT_OUTCOME_UNCERTAIN';
    });
    assert.equal(hooks,1);assert.equal(f.state.toolCalls.filter(tool=>tool.name==='create_avatar_consent').length,1);assert.equal(f.state.refreshes.length,0);
  });
});
