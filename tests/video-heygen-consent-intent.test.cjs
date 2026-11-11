'use strict';
const {loadTypeScriptModule: load} = require('./helpers/load-ts-module.cjs');
const {AuthService} = load('libraries/helpers/src/auth/auth.service.ts');
const root = 'libraries/nestjs-libraries/src/';
const {SocialFactoryRepository} = load(root + 'content-intelligence/social-factory/social-factory.repository.ts');
const {HeygenConsentIntentServiceV1, isHeygenConsentIntentV1} = load(root + 'videos/subscriptions/video-heygen-consent-intent.v1.ts');
const {videoErrorV1} = load(root + 'videos/video-brief.v1.ts');
const {heygenOwnedAvatarGroupInputV1} = load(root + 'videos/subscriptions/video-heygen-owned-catalog.v1.ts');
const input = {connectionId: '33333333-3333-4333-8333-333333333333', avatarId: 'owned-look', groupId: 'owned-group'};
const author = {messageId: 'actual-author', text: 'Если нужно, покажи ссылку на согласие для моего аватара HeyGen.'};
const url = 'https://app.heygen.com/consent/PRIVATE_SYNTHETIC_BEARER';
const previousSecret = process.env.JWT_SECRET;
beforeAll(() => {process.env.JWT_SECRET = 'consent-intent-test-only';});
afterAll(() => {if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret;});

function fixture() {
  let now = new Date('2030-01-01T00:00:00Z');
  const rows = new Map(), writes = [];
  const key = value => `${value.organizationId}:${value.kind}:${value.id}`;
  const conflict = () => Object.assign(new Error('conflict'), {code: 'P2002'});
  const db = {socialFactoryRecord: {
    findFirst: async ({where}) => structuredClone(rows.get(key(where)) ?? null),
    create: async ({data}) => {
      if (rows.has(key(data))) throw conflict();
      const row = {...data, revision: 1, sourceIds: [], parentId: null, expiresAt: null, deletedAt: null, invalidatedAt: null, createdAt: now, updatedAt: now};
      rows.set(key(row), structuredClone(row)); writes.push(structuredClone(row)); return structuredClone(row);
    },
    updateMany: async ({where, data}) => {
      const old = rows.get(key(where)); if (!old || old.revision !== where.revision) return {count: 0};
      const row = {...old, ...data, revision: old.revision + data.revision.increment};
      rows.set(key(row), structuredClone(row)); writes.push(structuredClone(row)); return {count: 1};
    },
  }};
  const store = new SocialFactoryRepository({model: db}, {});
  const connection = {provider: 'heygen', generation: 3};
  let granted = true, effects = 0;
  const connections = {token: jest.fn(async (org, actor, id, generation, purpose, options) => {
    if (org !== 'org' || actor !== 'actor' || id !== input.connectionId || !granted) return videoErrorV1('VIDEO_ACCESS_DENIED', 403);
    if (generation !== undefined && generation !== connection.generation) return videoErrorV1('VIDEO_CONNECTION_CHANGED', 409);
    expect(purpose).toBe('discovery'); expect(options).toEqual({allowRefresh: false});
    const selectedGeneration = connection.generation;
    return {token: 'SYNTHETIC_TOKEN', connection: {...connection}, assertUsable: async () => {
      if (!granted) return videoErrorV1('VIDEO_ACCESS_DENIED', 403);
      if (selectedGeneration !== connection.generation) return videoErrorV1('VIDEO_CONNECTION_CHANGED', 409);
    }};
  }), connectable: jest.fn(async () => ({provider: 'heygen'}))};
  const owned = {avatarId: input.avatarId, groupId: input.groupId, name: 'Мой образ', groupName: 'Моя группа', groupType: null,
    avatarType: 'photo_avatar', consentStatus: 'pending', consentState: 'pending', consentRequirement: 'unknown', readOnly: true, renderQualified: false};
  const provider = {readOwnedAvatarGroup: jest.fn(async (_def, _token, selected, guard) => {
    const parsed = heygenOwnedAvatarGroupInputV1(selected);
    await guard(); if (parsed.avatarId !== owned.avatarId || parsed.groupId !== owned.groupId) return videoErrorV1('VIDEO_SUBSCRIPTION_OPTION_UNAVAILABLE', 409); return {...owned};
  }), requestOwnedAvatarConsent: jest.fn(async (_def, _token, _selected, guard, before) => {
    await guard(); await before(); await guard(); effects++; return {kind: 'issued', avatarId: owned.avatarId, groupId: owned.groupId, consentUrl: url};
  })};
  const service = new HeygenConsentIntentServiceV1(store, connections, provider, {now: () => new Date(now)});
  const request = (thread = 'thread-one', original = author, options) => service.request('org', 'actor', thread, original, input, options);
  return {service, request, rows, writes, provider, connections, connection, owned, get effects() {return effects;},
    revoke: () => {granted = false;}, advance: milliseconds => {now = new Date(now.getTime() + milliseconds);}};
}

test.each(['Если нужно, покажи ссылку на согласие для моего аватара HeyGen.', 'Дай ссылку на согласие.',
  'При необходимости получи ссылку для подтверждения аватара.', 'Please get the consent link for my avatar.',
  'HeyGen: if required, show the consent URL.',
  'Агент проверяет статус моего аватара HeyGen и, если нужно подтверждение, показывает мне ссылку.',
  'Если согласие не подтверждено, создай и покажи ссылку для подтверждения.',
  'Проверь мой аватар HeyGen. Если нужно согласие, покажи мне ссылку.'])('direct authored intent permits %s', text => {
  expect(isHeygenConsentIntentV1(text)).toBe(true);
});
test.each(['Подготовь английский сценарий для HeyGen.', 'Да, отлично.', 'Не создавай ссылку на согласие.',
  'Объясни статус: «Покажи ссылку на согласие».', '> Get a consent link for my avatar.',
  'Материал:\nПокажи ссылку на согласие.', '```text\nGet the consent link\n```',
  'Согласие нужно проверить. Не создавай ссылку.', 'В статье написано: создай ссылку на согласие.'])('unrelated/quoted request cannot authorize issuance: %s', async text => {
  const f = fixture(); await expect(f.request('thread-one', {...author, text})).rejects.toMatchObject({response: {code: 'VIDEO_REQUEST_NOT_AUTHORED'}});
  expect(f.connections.token).not.toHaveBeenCalled(); expect(f.rows.size).toBe(0); expect(f.effects).toBe(0);
});

test('ready link is encrypted durably, never exposed in receipt, and reopened only in its owned chat', async () => {
  const f = fixture(), receipt = await f.request();
  expect(receipt).toMatchObject({state: 'ready', ownerThreadId: 'thread-one', name: 'Мой образ', issuedAt: '2030-01-01T00:00:00.000Z', expiresAt: '2030-01-02T00:00:00.000Z', renderQualified: false});
  expect(receipt.handle).toMatch(/^[a-f0-9]{64}$/); expect(f.effects).toBe(1);
  expect(JSON.stringify([receipt, f.writes])).not.toContain('PRIVATE_SYNTHETIC_BEARER');
  expect([...f.rows.values()][0].expiresAt).toBeNull();
  expect(await f.service.readLink('org', 'actor', 'thread-one', receipt.handle)).toEqual({url, expiresAt: receipt.expiresAt});
  for (const args of [['foreign', 'actor', 'thread-one'], ['org', 'foreign', 'thread-one'], ['org', 'actor', 'other-thread']])
    await expect(f.service.readLink(...args, receipt.handle)).rejects.toMatchObject({response: {code: 'VIDEO_AVATAR_CONSENT_UNAVAILABLE'}});
  const replay = await f.request('second-chat'); expect(replay).toEqual(receipt); expect(f.effects).toBe(1);
});

test('domain projects only avatar/group into the actual strict provider decoder before reservation', async () => {
  const f = fixture();
  const read = f.provider.readOwnedAvatarGroup.getMockImplementation();
  f.provider.readOwnedAvatarGroup.mockImplementation(async (...args) => {
    expect(f.rows.size).toBe(0); expect(f.effects).toBe(0);
    return read(...args);
  });
  const receipt = await f.request();
  expect(receipt.state).toBe('ready');
  expect(f.provider.readOwnedAvatarGroup.mock.calls[0][2]).toEqual({avatarId: input.avatarId, groupId: input.groupId});
  const g = fixture();
  await expect(g.provider.readOwnedAvatarGroup({}, 'synthetic-token', input, async () => {}))
    .rejects.toMatchObject({response: {code: 'VIDEO_SUBSCRIPTION_OPTION_UNAVAILABLE'}});
  expect(g.rows.size).toBe(0); expect(g.effects).toBe(0); expect(g.provider.requestOwnedAvatarConsent).not.toHaveBeenCalled();
});

test.each(['accepted', 'not_applicable', 'unknown'])('%s never reserves or issues a link', async state => {
  const f = fixture(); Object.assign(f.owned, {consentState: state, consentStatus: state === 'accepted' ? 'accepted' : null});
  expect((await f.request()).state).toBe(state === 'unknown' ? 'unknown' : 'not_needed');
  expect(f.rows.size).toBe(0); expect(f.effects).toBe(0); expect(f.provider.requestOwnedAvatarConsent).not.toHaveBeenCalled();
});

test('two chats racing for one group can dispatch only once', async () => {
  const f = fixture();
  const results = await Promise.all([f.request('first-chat'), f.request('second-chat')]);
  expect(f.effects).toBe(1); expect(f.provider.requestOwnedAvatarConsent).toHaveBeenCalledTimes(1);
  expect(new Set(results.map(result => result.handle)).size).toBe(1);
  const later = await f.request('third-chat'); expect(later.state).toBe('ready'); expect(f.effects).toBe(1);
});

test('failure after durable dispatch is uncertain and never replayed, including another chat or account generation', async () => {
  const f = fixture();
  f.provider.requestOwnedAvatarConsent.mockImplementationOnce(async (_def, _token, _selected, guard, before) => {await guard(); await before(); throw new Error(`lost response ${url}`);});
  const first = await f.request(); expect(first.state).toBe('uncertain');
  expect([...f.rows.values()][0].payload.state).toBe('uncertain');
  f.connection.generation++;
  const second = await f.request('another-chat'); expect(second.handle).toBe(first.handle); expect(second.state).toBe('uncertain');
  expect(f.provider.requestOwnedAvatarConsent).toHaveBeenCalledTimes(1); expect(JSON.stringify([first, second, f.writes])).not.toContain('PRIVATE_SYNTHETIC_BEARER');
});

test('uncertain provider outcomes retain only a safe failure category, never provider text', async () => {
  const {HttpException}=require('@nestjs/common');
  const f=fixture();
  f.provider.requestOwnedAvatarConsent.mockImplementationOnce(async (_def,_token,_selected,guard,before)=>{
    await guard(); await before();
    throw new HttpException({code:'VIDEO_AVATAR_CONSENT_OUTCOME_UNCERTAIN',reason:'provider_response_invalid',detail:url},409);
  });
  const receipt=await f.request();
  expect(receipt.state).toBe('uncertain');
  expect(receipt.failureReason).toBe('provider_response_invalid');
  expect([...f.rows.values()][0].payload.failureReason).toBe('provider_response_invalid');
  expect(JSON.stringify([receipt,f.writes])).not.toContain('PRIVATE_SYNTHETIC_BEARER');
});

test('a received but unparseable provider response is retained encrypted, outside the chat receipt', async () => {
  const {HttpException}=require('@nestjs/common');
  const f=fixture(), encrypted=AuthService.fixedEncryption(JSON.stringify({data:{url}}));
  f.provider.requestOwnedAvatarConsent.mockImplementationOnce(async (_def,_token,_selected,guard,before)=>{
    await guard(); await before();
    const err=new HttpException({code:'VIDEO_AVATAR_CONSENT_OUTCOME_UNCERTAIN',reason:'provider_response_invalid'},409);
    Object.defineProperty(err,'encryptedProviderResponse',{value:encrypted});
    throw err;
  });
  const receipt=await f.request();
  expect(receipt.state).toBe('uncertain');
  expect([...f.rows.values()][0].payload.encryptedProviderResponse).toBe(encrypted);
  expect(JSON.stringify([receipt,f.writes])).not.toContain('PRIVATE_SYNTHETIC_BEARER');
  expect(JSON.stringify(receipt)).not.toContain(encrypted);
});

test('an owned captured HeyGen consent response can be recovered without issuing another link', async () => {
  const {HttpException}=require('@nestjs/common'); const f=fixture();
  const link='https://app.heygen.com/avatars/api-video/record?token=synthetic-token_123';
  const result={content:[{type:'text',text:JSON.stringify({avatar_group:{id:input.groupId,consent_status:'pending'},url:link})}],isError:false};
  const encrypted=AuthService.fixedEncryption(JSON.stringify({kind:'mcp',result}));
  f.provider.requestOwnedAvatarConsent.mockImplementationOnce(async (_def,_token,_selected,guard,before)=>{
    await guard();await before();const err=new HttpException({code:'VIDEO_AVATAR_CONSENT_OUTCOME_UNCERTAIN',reason:'provider_response_invalid'},409);
    Object.defineProperty(err,'encryptedProviderResponse',{value:encrypted});throw err;
  });
  expect((await f.request()).state).toBe('uncertain');
  const recovered=await f.request('thread-one',{messageId:'recover',text:'Покажи ссылку согласия для моего аватара.'});
  expect(recovered.state).toBe('ready');expect(f.provider.requestOwnedAvatarConsent).toHaveBeenCalledTimes(1);
  expect(await f.service.readLink('org','actor','thread-one',recovered.handle)).toEqual({url:link,expiresAt:recovered.expiresAt});
  expect(JSON.stringify([recovered,f.writes])).not.toContain('synthetic-token_123');
});

test('captured foreign, failed or expired consent responses cannot be recovered or cause a new issue', async () => {
  const {HttpException}=require('@nestjs/common');
  for (const variant of ['foreign','error','expired']) {
    const f=fixture(), result={content:[{type:'text',text:JSON.stringify({avatar_group:{id:variant==='foreign'?'foreign_group':input.groupId,consent_status:'pending'},url:'https://app.heygen.com/avatars/api-video/record?token=synthetic'})}],isError:variant==='error'};
    const encrypted=AuthService.fixedEncryption(JSON.stringify({kind:'mcp',result}));
    f.provider.requestOwnedAvatarConsent.mockImplementationOnce(async (_def,_token,_selected,guard,before)=>{await guard();await before();const err=new HttpException({code:'VIDEO_AVATAR_CONSENT_OUTCOME_UNCERTAIN'},409);Object.defineProperty(err,'encryptedProviderResponse',{value:encrypted});throw err;});
    await f.request();if(variant==='expired')f.advance(24*3600_000);
    expect((await f.request('thread-one',{messageId:'recover',text:'Покажи ссылку согласия для аватара.'})).state).toBe('uncertain');
    expect(f.provider.requestOwnedAvatarConsent).toHaveBeenCalledTimes(1);
  }
});

test('one explicitly requested replacement preserves the unknown attempt and cannot replay the same message', async () => {
  const f = fixture();
  f.provider.requestOwnedAvatarConsent.mockImplementationOnce(async (_def, _token, _selected, guard, before) => {await guard(); await before(); throw new Error('unknown result');});
  const first = await f.request(); expect(first.state).toBe('uncertain');
  const replacement = {messageId:'replacement-message', text:'Создай новую ссылку согласия для этого аватара HeyGen.'};
  const run = original => f.service.request('org','actor','thread-one',original,{...input,reissue:true});
  const result = await run(replacement);
  expect(result.state).toBe('ready'); expect(f.effects).toBe(1);
  expect([...f.rows.values()][0].payload.attemptHistory).toEqual([expect.objectContaining({state:'uncertain',requestMessageId:author.messageId})]);
  expect((await run(replacement)).state).toBe('ready'); expect(f.effects).toBe(1);
});

test('replacement requires explicit new-link wording, a new message and a settled uncertain attempt', async () => {
  const f=fixture();
  f.provider.requestOwnedAvatarConsent.mockImplementationOnce(async (_def,_token,_selected,guard,before)=>{await guard();await before();throw Error('unknown');});
  await f.request();
  const run = original => f.service.request('org','actor','thread-one',original,{...input,reissue:true});
  await expect(run({...author,text:'Покажи ссылку согласия для аватара.'})).rejects.toThrow();
  expect((await run({...author,text:'Создай новую ссылку согласия для аватара.'})).state).toBe('uncertain');
  expect(f.provider.requestOwnedAvatarConsent).toHaveBeenCalledTimes(1);
});

test('concurrent replacement requests cannot dispatch more than once', async () => {
  const f=fixture();
  f.provider.requestOwnedAvatarConsent.mockImplementationOnce(async (_def,_token,_selected,guard,before)=>{await guard();await before();throw Error('unknown');});
  await f.request();
  const replacement={messageId:'new-message',text:'Создай новую ссылку согласия для аватара.'};
  const run=()=>f.service.request('org','actor','thread-one',replacement,{...input,reissue:true});
  await Promise.all([run(),run()]);
  expect(f.provider.requestOwnedAvatarConsent).toHaveBeenCalledTimes(2);
  expect(f.effects).toBe(1);
});

test('a possibly in-flight dispatch or already accepted consent is never replaced', async () => {
  const f=fixture();
  f.provider.requestOwnedAvatarConsent.mockImplementationOnce(async (_def,_token,_selected,guard,before)=>{await guard();await before();throw Error('unknown');});
  await f.request();
  const row=[...f.rows.values()][0]; row.payload.state='dispatching';
  const replacement={messageId:'new-message',text:'Создай новую ссылку согласия для аватара.'};
  const run=()=>f.service.request('org','actor','thread-one',replacement,{...input,reissue:true});
  expect((await run()).state).toBe('uncertain');
  f.owned.consentStatus='accepted'; f.owned.consentState='accepted';
  expect((await run()).state).toBe('not_needed');
  expect(f.provider.requestOwnedAvatarConsent).toHaveBeenCalledTimes(1);
});

test('quoted and unrelated new-link text do not authorize replacement', async () => {
  const f=fixture();
  f.provider.requestOwnedAvatarConsent.mockImplementationOnce(async (_def,_token,_selected,guard,before)=>{await guard();await before();throw Error('unknown');});
  await f.request();
  for(const text of ['Покажи ссылку согласия для аватара. Создай новую ссылку на статью.', 'Покажи ссылку согласия. «Создай новую ссылку согласия для аватара».', 'Не создавай новую ссылку согласия для аватара.']) {
    await expect(f.service.request('org','actor','thread-one',{messageId:'new',text},{...input,reissue:true})).rejects.toThrow();
  }
  expect(f.provider.requestOwnedAvatarConsent).toHaveBeenCalledTimes(1);
});

test('pre-dispatch failure is safe to retry; persisted dispatch marker survives failed uncertainty save', async () => {
  const f = fixture();
  f.provider.requestOwnedAvatarConsent.mockRejectedValueOnce(new Error('preflight unavailable'));
  await expect(f.request()).rejects.toMatchObject({response: {code: 'VIDEO_AVATAR_CONSENT_UNAVAILABLE'}});
  expect([...f.rows.values()][0].payload.state).toBe('reserved');
  expect((await f.request()).state).toBe('ready'); expect(f.effects).toBe(1);
  const g = fixture(); const put = g.service.store.put.bind(g.service.store);
  g.service.store.put = async value => {if (value.payload.state === 'uncertain') throw new Error('storage unavailable'); return put(value);};
  g.provider.requestOwnedAvatarConsent.mockImplementationOnce(async (_def, _token, _selected, guard, before) => {await guard(); await before(); throw Error('lost');});
  expect((await g.request()).state).toBe('uncertain'); expect([...g.rows.values()][0].payload.state).toBe('dispatching');
  expect((await g.request('new-chat')).state).toBe('uncertain'); expect(g.provider.requestOwnedAvatarConsent).toHaveBeenCalledTimes(1);
});

test('24 hours starts before network, expiration and reconnection never issue a replacement', async () => {
  const f = fixture(), original = f.provider.requestOwnedAvatarConsent.getMockImplementation();
  f.provider.requestOwnedAvatarConsent.mockImplementationOnce(async (...args) => {const result = await original(...args); f.advance(60_000); return result;});
  const ready = await f.request(); expect(ready.expiresAt).toBe('2030-01-02T00:00:00.000Z');
  f.connection.generation++;
  await expect(f.service.readLink('org', 'actor', 'thread-one', ready.handle)).rejects.toMatchObject({response: {code: 'VIDEO_CONNECTION_CHANGED'}});
  expect((await f.request()).handle).toBe(ready.handle); expect(f.effects).toBe(1);
  f.advance(24 * 3600_000);
  expect((await f.request()).state).toBe('expired');
  await expect(f.service.readLink('org', 'actor', 'thread-one', ready.handle)).rejects.toMatchObject({response: {code: 'VIDEO_AVATAR_CONSENT_UNAVAILABLE'}});
  expect(f.effects).toBe(1);
});

test('Stop before dispatch prevents effect; Stop after dispatch preserves uncertainty', async () => {
  const f = fixture(), stop = new AbortController(); stop.abort();
  await expect(f.request('thread-one', author, {signal: stop.signal})).rejects.toMatchObject({name: 'AbortError'});
  expect(f.connections.token).not.toHaveBeenCalled(); expect(f.effects).toBe(0);
  const g = fixture(), laterStop = new AbortController();
  g.provider.requestOwnedAvatarConsent.mockImplementationOnce(async (_def, _token, _selected, guard, before) => {await guard(); await before(); laterStop.abort(); await guard(); throw Error('unreachable');});
  expect((await g.request('thread-one', author, {signal: laterStop.signal})).state).toBe('uncertain');
  await g.request('different-chat'); expect(g.provider.requestOwnedAvatarConsent).toHaveBeenCalledTimes(1);
});

test('browser read refuses revoked grants, changed status and corrupted/non-official encrypted URL', async () => {
  for (const change of ['grant', 'accepted', 'unknown', 'url']) {
    const f = fixture(), receipt = await f.request();
    if (change === 'grant') f.revoke();
    if (change === 'accepted' || change === 'unknown') Object.assign(f.owned, {consentStatus: change, consentState: change});
    if (change === 'url') [...f.rows.values()][0].payload.encryptedUrl = AuthService.fixedEncryption('https://evil.example/consent/private');
    await expect(f.service.readLink('org', 'actor', 'thread-one', receipt.handle)).rejects.toThrow();
    expect(f.effects).toBe(1);
  }
});

test('native write emits only a safe handle receipt/card, never the issued bearer URL', async () => {
  const h = require('./helpers/agent-capabilities.cjs'), registry = h.loadRegistry(), f = fixture();
  const capability = registry.CAPABILITY_CATALOGUE.find(row => row.id === 'video.avatar_consent_request');
  expect(capability.risk).toBe('write'); expect(capability.card).toBe('heygen-consent');
  const service = {requestAvatarConsent: jest.fn(async (org, actor, thread, original, selected, options) => {
    expect(org).toBe(h.IDENTITY.organizationId); expect(actor).toBe(h.IDENTITY.userId); expect(selected).toEqual(input);
    return f.request(thread, original, options);
  })};
  const history = {readMessages: jest.fn(async () => {throw new Error('Current consent intent must never read old history');})};
  const tool = registry.buildCapabilityTool(capability, {entrance: 'chat', language: 'ru', services: h.servicesFrom({VideoAccessService: service, AgentThreadsService: history})});
  const context = h.requestContextFor(registry);
  const {MASTRA_RESOURCE_ID_KEY, MASTRA_THREAD_ID_KEY} = require('@mastra/core/request-context');
  context.set(MASTRA_RESOURCE_ID_KEY, `${h.IDENTITY.organizationId}:${h.IDENTITY.userId}`); context.set(MASTRA_THREAD_ID_KEY, 'thread-one');
  context.set('cf.originalAuthorRequest', JSON.stringify(author));
  const result = await h.executeTool(tool, input, {requestContext: context});
  expect(result.output.ok).toBe(true); expect(f.effects).toBe(1);
  const summary = result.output.summary.untrustedData.value;
  expect(summary).toMatchObject({state: 'ready', handle: expect.stringMatching(/^[a-f0-9]{64}$/), ownerThreadId: 'thread-one', name: 'Мой образ', expiresAt: '2030-01-02T00:00:00.000Z'});
  expect(result.parts).toEqual([{type: 'data-heygen-consent', data: {kind: 'heygen-consent', id: summary.handle, threadId: 'thread-one', name: summary.name, expiresAt: summary.expiresAt}}]);
  expect(JSON.stringify([result.output, result.model, result.parts])).not.toMatch(/PRIVATE_SYNTHETIC_BEARER|https:\/\/app\.heygen\.com|encryptedUrl|SYNTHETIC_TOKEN/);
  for (const requestMessageId of ['msg_current_user_request', 'old-authorized-message']) {
    const replay = await h.executeTool(tool, {...input, requestMessageId}, {requestContext: context});
    expect(replay.output.ok).toBe(true); expect(replay.output.summary.untrustedData.value.handle).toBe(summary.handle);
    expect(service.requestAvatarConsent.mock.calls.at(-1)[3]).toEqual(author);
    expect([...f.rows.values()][0].payload.requestMessageId).toBe(author.messageId);
    expect(f.effects).toBe(1);
  }
  for (const kind of ['unrelated-author', 'missing-current-author', 'foreign-resource']) {
    service.requestAvatarConsent.mockClear();
    if (kind === 'missing-current-author') context.delete('cf.originalAuthorRequest');
    else context.set('cf.originalAuthorRequest', JSON.stringify(kind === 'unrelated-author' ? {...author, text: 'Напиши сценарий для аватара.'} : author));
    context.set(MASTRA_RESOURCE_ID_KEY, kind === 'foreign-resource' ? 'foreign:actor' : `${h.IDENTITY.organizationId}:${h.IDENTITY.userId}`);
    const refused = await h.executeTool(tool, {...input, requestMessageId: 'old-authorized-message'}, {requestContext: context});
    expect(refused.output.ok).toBe(false); expect(f.effects).toBe(1);
    expect(service.requestAvatarConsent).not.toHaveBeenCalled();
  }
  expect(history.readMessages).not.toHaveBeenCalled();
});

test.each([
  ['uncertain', '2030-01-02T00:00:00.000Z', false], ['reserved', null, false],
  ['expired', '2030-01-02T00:00:00.000Z', false], ['unknown', null, false],
  ['ready', null, false], ['ready', '2030-01-02T00:00:00.000Z', true],
])('native consent result %s with expiry %s permits a link claim only with its real card', async (state, expiresAt, hasCard) => {
  const h = require('./helpers/agent-capabilities.cjs'), registry = h.loadRegistry();
  const capability = registry.CAPABILITY_CATALOGUE.find(row => row.id === 'video.avatar_consent_request');
  const receipt = {handle: 'a'.repeat(64), ownerThreadId: 'thread-one', name: 'Мой образ', state,
    issuedAt: '2030-01-01T00:00:00.000Z', expiresAt, readOnly: false, renderQualified: false};
  const service = {requestAvatarConsent: jest.fn(async () => receipt)};
  const tool = registry.buildCapabilityTool(capability, {entrance: 'chat', language: 'ru', services: h.servicesFrom({VideoAccessService: service})});
  const context = h.requestContextFor(registry);
  const {MASTRA_RESOURCE_ID_KEY, MASTRA_THREAD_ID_KEY} = require('@mastra/core/request-context');
  context.set(MASTRA_RESOURCE_ID_KEY, `${h.IDENTITY.organizationId}:${h.IDENTITY.userId}`); context.set(MASTRA_THREAD_ID_KEY, 'thread-one');
  context.set('cf.originalAuthorRequest', JSON.stringify(author));
  const result = await h.executeTool(tool, input, {requestContext: context});
  expect(result.output.ok).toBe(true);
  expect(result.output.summary.untrustedData.value.state).toBe(state);
  if (hasCard) expect(result.parts).toEqual([{type: 'data-heygen-consent', data: {kind: 'heygen-consent', id: receipt.handle, threadId: receipt.ownerThreadId, name: receipt.name, expiresAt}}]);
  else {expect(result.output.card).toBeUndefined(); expect(result.parts).toEqual([]);}
  expect(service.requestAvatarConsent).toHaveBeenCalledTimes(1);
  expect(capability.description).toContain('state=ready AND an actual heygen-consent card was returned');
  expect(capability.description).toContain('uncertain/reserved/expired/unknown, or a missing card');
  expect(capability.description).toContain('Не удалось подтвердить, что ссылка создана');
  expect(capability.description).toContain('never claim a link/card exists, display the opaque handle, or automatically repeat the provider request');
});
