const {createHash} = require('node:crypto');
const {loadTypeScriptModule} = require('./helpers/load-ts-module.cjs');

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const error = code => { const e = new Error(code); e.getResponse = () => ({code}); throw e; };
const {VideoConnectionService} = loadTypeScriptModule('libraries/nestjs-libraries/src/videos/subscriptions/video-connection.service.ts', {
  '@nestjs/common': {Injectable: () => x => x, Optional: () => () => {}, Inject: () => () => {}},
  '@contentfactory/helpers/auth/auth.service': {AuthService: {fixedEncryption: x => x, fixedDecryption: x => x}},
  '../../database/prisma/video-subscription/video-subscription.repository': {VideoSubscriptionRepository: class {}},
  './video-provider-registry': {VideoSubscriptionRuntime: class {}, subscriptionHash: hash},
  './video-oauth-client': {VideoOAuthClient: class {}},
  '../video-brief.v1': {videoErrorV1: error},
  '@prisma/client': {Prisma: {}},
  '../../user/authenticated.session': {authenticatedSession: () => null},
  './video-return-context.v1': {VIDEO_SUBSCRIPTION_RETURN_CONTEXT: Symbol(), VIDEO_OAUTH_DEFAULT_RETURN: '/media?video=1'},
});

function fixture() {
  let row; let member = true; let ownThread = true; let ownDraft = true;
  const def = {issuer: 'issuer', resource: 'resource', connectEnabled: true};
  const repository = {member: async () => {if (!member) error('VIDEO_ACCESS_DENIED');}, db: {
    videoSubscriptionWorkspacePolicy: {findUnique: async () => ({enabled: true})},
    videoPromptDraft: {findFirst: async ({where}) => ownDraft && where.id === 'draft' && where.userId === 'actor' ? {id: 'draft'} : null},
    contentPiece: {findFirst: async () => null},
    videoSubscriptionJob: {findFirst: async () => null}, videoGenerationJob: {findFirst: async () => null}, videoManualAttachment: {findFirst: async () => null},
    videoSubscriptionOAuthAttempt: {
      create: async ({data}) => {row = {...data, id: 'attempt', consumedAt: null};},
      findFirst: async ({where}) => row && row.stateHash === where.stateHash && row.actorId === where.actorId && row.organizationId === where.organizationId ? row : null,
      updateMany: async () => {if (row.consumedAt) return {count: 0}; row.consumedAt = new Date(); return {count: 1};},
    },
  }};
  const runtime = {definition: () => def, now: () => new Date('2026-01-01')};
  let state;
  const oauth = {metadata: async () => ({}), authorize: async (_d, _m, _c, _r, s) => {state = s; return {authorizationUrl: new URL('https://provider.invalid/'), codeVerifier: 'verifier'};}};
  const service = new VideoConnectionService(repository, runtime, oauth, {ownThread: async (identity, id) => ownThread && identity.organizationId === 'org' && identity.userId === 'actor' && id === 'thread'});
  service.registration = async () => ({});
  return {service, get state() {return state;}, setMember: v => member = v, setThread: v => ownThread = v, setDraft: v => ownDraft = v};
}
const code = e => e?.getResponse?.()?.code;
const failure = async fn => {try {await fn(); throw new Error('expected failure');} catch (e) {return e;}};

const previousBackendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
beforeAll(() => {process.env.NEXT_PUBLIC_BACKEND_URL = 'https://backend.invalid';});
afterAll(() => {if (previousBackendUrl === undefined) delete process.env.NEXT_PUBLIC_BACKEND_URL; else process.env.NEXT_PUBLIC_BACKEND_URL = previousBackendUrl;});

test('hub start and consumed refusal restore exact hub path once', async () => {
  const f = fixture(); await f.service.start('org', 'actor', 'heygen', '/third-party');
  const e = await failure(() => f.service.callback('org', 'actor', 'heygen', {state: f.state, error: 'access_denied'}));
  expect(code(e)).toBe('VIDEO_OAUTH_REFUSED');
  expect(await f.service.callbackFailurePath('org', 'actor', e)).toBe('/third-party?connectionError=VIDEO_OAUTH_REFUSED');
  expect(await f.service.callbackFailurePath('org', 'actor', e)).toBe('/media?video=1&connectionError=VIDEO_OAUTH_REFUSED');
  const replay = await failure(() => f.service.callback('org', 'actor', 'heygen', {state: f.state, error: 'access_denied'}));
  expect(code(replay)).toBe('VIDEO_OAUTH_ATTEMPT_INVALID');
});

test('hub issuer failure uses the bounded generic error', async () => {
  const f = fixture(); await f.service.start('org', 'actor', 'heygen', '/third-party');
  const e = await failure(() => f.service.callback('org', 'actor', 'heygen', {state: f.state, code: 'code', iss: 'foreign'}));
  expect(code(e)).toBe('VIDEO_OAUTH_ISSUER_INVALID');
  expect(await f.service.callbackFailurePath('org', 'actor', e)).toBe('/third-party?connectionError=VIDEO_CONNECTION_UNAVAILABLE');
});

test.each(['/third-party?videoReturn=%2Fmedia%3Fvideo%3D1', '/third-party?', '/third-party?x=1', '/third-party/', '/third-party#x', '//third-party', 'https://evil.invalid/third-party', '/third-party%3Fx=1'])('rejects unsafe or non-exact hub path %s', async path => {
  const f = fixture(); expect(code(await failure(() => f.service.start('org', 'actor', 'heygen', path)))).toBe('VIDEO_RETURN_URL_INVALID');
});

test('chat refusal retains ampersand and rejects lost membership on recovery', async () => {
  const f = fixture(); const path = '/agents/thread?videoDraftId=draft';
  await f.service.start('org', 'actor', 'heygen', path);
  const e = await failure(() => f.service.callback('org', 'actor', 'heygen', {state: f.state, error: 'access_denied'}));
  expect(await f.service.callbackFailurePath('org', 'actor', e)).toBe(`${path}&connectionError=VIDEO_OAUTH_REFUSED`);
  await f.service.start('org', 'actor', 'heygen', '/third-party');
  const lost = await failure(() => f.service.callback('org', 'actor', 'heygen', {state: f.state, error: 'access_denied'}));
  f.setMember(false);
  expect(await f.service.callbackFailurePath('org', 'actor', lost)).toBe('/media?video=1&connectionError=VIDEO_OAUTH_REFUSED');
});

test('foreign or missing chat and draft contexts remain rejected', async () => {
  const f = fixture();
  for (const path of ['/agents/foreign?videoDraftId=draft', '/agents/thread?videoDraftId=foreign']) {
    expect(code(await failure(() => f.service.start('org', 'actor', 'heygen', path)))).toBe('VIDEO_RETURN_CONTEXT_UNAVAILABLE');
  }
  f.setThread(false);
  expect(code(await failure(() => f.service.start('org', 'actor', 'heygen', '/agents/thread?videoDraftId=draft')))).toBe('VIDEO_RETURN_CONTEXT_UNAVAILABLE');
  f.setThread(true); f.setDraft(false);
  expect(code(await failure(() => f.service.start('org', 'actor', 'heygen', '/agents/thread?videoDraftId=draft')))).toBe('VIDEO_RETURN_CONTEXT_UNAVAILABLE');
});
