'use strict';
const { loadRegistry, servicesFrom, executeTool, requestContextFor, IDENTITY, permissionsService } = require('./helpers/agent-capabilities.cjs');
const registry = loadRegistry(), catalogue = registry.CAPABILITY_CATALOGUE;
const find = id => catalogue.find(row => row.id === id);
const DRAFT = '11111111-1111-4111-8111-111111111111', PIECE = '22222222-2222-4222-8222-222222222222', CONNECTION = '33333333-3333-4333-8333-333333333333';
const build = (id, service) => registry.buildCapabilityTool(find(id), { entrance: 'chat', language: 'ru', services: servicesFrom({ VideoAccessService: service }) });
const invoke = (id, service, input) => executeTool(build(id, service), find(id).input.parse(input), { requestContext: requestContextFor(registry) });
const summary = result => result.output.summary.untrustedData.value;

test('access choices without a draft retain their exact output and do not create a draft/card or read the draft repository', async () => {
  const choices = { workspaceEnabled: true, providers: [{ provider: 'heygen', connectReady: true, generationReady: false }], connections: [] };
  const service = { choices: jest.fn(async () => choices), apiRepository: { draft: jest.fn() } };
  const result = await invoke('video.access_v2', service, {});
  expect(summary(result)).toEqual(choices); expect(result.output.card).toBeUndefined(); expect(result.parts).toEqual([]);
  expect(service.choices).toHaveBeenCalledWith('org-1', 'user-1'); expect(service.apiRepository.draft).not.toHaveBeenCalled();
  expect(choices).not.toHaveProperty('videoDraftId');
});

test('access card uses only the actor-owned VideoPromptDraft loaded by the real tenant repository method', async () => {
  const row = { id: DRAFT, pieceId: PIECE, organizationId: 'org-1', userId: 'user-1', version: 2 };
  const service = { choices: jest.fn(async () => ({ providers: [], connections: [] })), apiRepository: { draft: jest.fn(async () => row) } };
  const identity = structuredClone(IDENTITY), result = await invoke('video.access_v2', service, { draftId: DRAFT });
  expect(service.apiRepository.draft).toHaveBeenCalledWith('org-1', DRAFT);
  expect(summary(result)).toEqual({ providers: [], connections: [], videoDraftId: DRAFT, pieceId: PIECE });
  expect(result.parts).toEqual([{ type: 'data-media', data: { kind: 'media', id: 'library', videoDraftId: DRAFT, pieceId: PIECE } }]);
  expect(IDENTITY).toEqual(identity); expect(row).toMatchObject({ organizationId: 'org-1', userId: 'user-1', version: 2 });
});

test.each([
  [null, 'VIDEO_DRAFT_NOT_FOUND'],
  [{ id: DRAFT, organizationId: 'foreign', userId: 'user-1', pieceId: PIECE }, 'VIDEO_DRAFT_NOT_FOUND'],
  [{ id: DRAFT, organizationId: 'org-1', userId: 'other-user', pieceId: PIECE }, 'VIDEO_ACCESS_DENIED'],
  [{ id: DRAFT, organizationId: 'org-1', actorId: 'user-1', pieceId: PIECE }, 'VIDEO_ACCESS_DENIED'],
  [{ id: CONNECTION, organizationId: 'org-1', userId: 'user-1', pieceId: PIECE }, 'VIDEO_DRAFT_NOT_FOUND'],
])('missing, foreign, actorless and production-like rows cannot become an access card (%s)', async (row, code) => {
  const service = { choices: jest.fn(), apiRepository: { draft: jest.fn(async () => row) } };
  const result = await invoke('video.access_v2', service, { draftId: DRAFT });
  expect(result.output).toMatchObject({ ok: false, code }); expect(result.parts).toEqual([]);
  expect(service.choices).not.toHaveBeenCalled(); expect(result.output.card).toBeUndefined();
});

test('new tools call only the existing non-generating operations with server org/actor and preserve honest blockers', async () => {
  const blocked = { connectionId: CONNECTION, walletVerified: false, schema: { reviewed: false, digest: null }, operations: [{ kind: 'final_composition', ready: false,
    blockers: ['VIDEO_WALLET_IDENTITY_UNVERIFIED', 'VIDEO_SCHEMA_UNSUPPORTED', 'VIDEO_PRICE_UNAVAILABLE', 'VIDEO_SUBSCRIPTION_OPERATION_UNAVAILABLE'] }] };
  const service = { assets: jest.fn(async () => ({ status: 'discovery_required', avatars: [], voices: [], ownedOnly: true, blockers: ['VIDEO_WALLET_IDENTITY_UNVERIFIED'] })),
    personalReadiness: jest.fn(async () => blocked), discoverPersonal: jest.fn(async () => blocked), launch: jest.fn(), preflight: jest.fn() };
  for (const [id, method] of [['video.personal_assets', 'assets'], ['video.personal_readiness', 'personalReadiness'], ['video.personal_discover', 'discoverPersonal']]) {
    const result = await invoke(id, service, { connectionId: CONNECTION });
    expect(result.output.ok).toBe(true); expect(service[method]).toHaveBeenCalledWith('org-1', 'user-1', CONNECTION);
    if (method !== 'assets') expect(summary(result)).toEqual(blocked);
    expect(result.parts).toEqual([]);
    expect(find(id).input.safeParse({ connectionId: CONNECTION, actorId: 'other', token: 'not-accepted' }).success).toBe(false);
  }
  expect(service.launch).not.toHaveBeenCalled(); expect(service.preflight).not.toHaveBeenCalled();
});

test.each(['USER', 'EDITOR', 'ADMIN'])('provider-backed personal tools retain editor door policies in chat and MCP (%s)', role => {
  const tools = registry.buildMcpCapabilityTools(catalogue, { services: servicesFrom({}), gate: new registry.DoorPolicyGate(permissionsService()), role, language: 'en' });
  const chatNames = registry.activeCapabilityToolNames(catalogue, role);
  // Reading provider-backed assets/readiness still borrows the editor-only HTTP door.
  // Risk classification does not widen that door to a USER token.
  for (const name of ['video_personal_assets', 'video_personal_readiness', 'video_personal_discover']) {
    expect(Object.keys(tools).includes(name)).toBe(role !== 'USER');
    expect(chatNames.includes(name)).toBe(role !== 'USER');
  }
  expect(tools.video_access_v2).toBeDefined(); // Safe stored access choices remain available to readers.
  expect(find('video.personal_assets').risk).toBe('read'); expect(find('video.personal_readiness').risk).toBe('read'); expect(find('video.personal_discover').risk).toBe('write');
});

test('personal MCP calls recheck a role downgrade before any connection or provider service read', async () => {
  const service = { assets: jest.fn(), personalReadiness: jest.fn(), discoverPersonal: jest.fn() };
  const tools = registry.buildMcpCapabilityTools(catalogue, { services: servicesFrom({ VideoAccessService: service }), gate: new registry.DoorPolicyGate(permissionsService()), role: 'EDITOR', language: 'en' });
  for (const name of ['video_personal_assets', 'video_personal_readiness', 'video_personal_discover']) {
    const result = await executeTool(tools[name], { connectionId: CONNECTION }, { requestContext: requestContextFor(registry, { ...IDENTITY, role: 'USER' }) });
    expect(result.output).toMatchObject({ ok: false, code: 'PERMISSION_DENIED' });
    expect(result.parts).toEqual([]);
  }
  for (const method of Object.values(service)) expect(method).not.toHaveBeenCalled();
});

test.each(['video.presenter_preview','video.preflight_v2'])('known pre-write refusal is correctable instead of an uncertain write: %s',async name=>{
  const failure=Object.assign(new Error('synthetic pre-write refusal'),{getResponse:()=>({code:'VIDEO_SUBSCRIPTION_OPTION_UNAVAILABLE'})});
  const service={presenterPreview:jest.fn(async()=>{throw failure;}),preflight:jest.fn(async()=>{throw failure;})};
  const input=name==='video.presenter_preview'?{draftId:DRAFT,version:2,connectionId:CONNECTION,avatarId:'owned',voiceId:'owned_voice',engine:'avatar_iv',durationSeconds:20}
    :{draftId:DRAFT,version:2,access:{kind:'subscription',connectionId:CONNECTION}};
  const result=await invoke(name,service,input);
  expect(result.output).toMatchObject({ok:false,code:'VIDEO_SUBSCRIPTION_OPTION_UNAVAILABLE',canReviseInput:true});
  expect(result.parts).toEqual([]);
});

test('invalid access kind repair retains subscription and manual choices without echoing rejected values',async()=>{
  const gate={check:jest.fn()};
  const result=await registry.admitCapabilityCall(find('video.preflight_v2'),{draftId:DRAFT,version:3,access:{kind:'personal_subscription',connectionId:CONNECTION}},
    requestContextFor(registry),gate,{countPaid:false,webChat:true});
  expect(result).toMatchObject({ok:false,code:'CAPABILITY_INPUT_INVALID'});
  expect(result.reason).toContain('"kind":"subscription"');
  expect(result.reason).toContain('"kind":"manual"');
  expect(result.reason).not.toContain(CONNECTION);
  expect(gate.check).not.toHaveBeenCalled();
});
