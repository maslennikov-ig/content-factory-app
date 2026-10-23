const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { loadTypeScriptModule } = require('./load-ts-module.cjs');

const ROOT = path.resolve(__dirname, '../..');
const LIB = 'libraries/nestjs-libraries/src/';
const SOURCE_TEXT = 'Запуск 22.10.2026. Масса 12,5 кг. Продукт не содержит сахар.';
const FIXTURE_CDN = 'https://93.184.216.34/video-fixture.mp4';
const FIXTURE_REFERENCE = 'https://93.184.216.34/owned-reference.png';
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);

function assertDisposableDatabaseV1(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Invalid CF_VIDEO_DATABASE_URL'); }
  // No libpq/Prisma parameters that could redirect a safe-looking URL elsewhere.
  const overrides = [...url.searchParams.keys()].some((key) =>
    !['schema', 'connection_limit', 'pool_timeout', 'connect_timeout', 'sslmode'].includes(key));
  if (process.env.CF_VIDEO_DATABASE_DISPOSABLE !== '1' ||
      !['postgres:', 'postgresql:'].includes(url.protocol) || !LOOPBACK.has(url.hostname) ||
      url.pathname !== '/cf_video_v1_test' || url.hash || overrides ||
      (url.searchParams.has('schema') && url.searchParams.get('schema') !== 'public')) {
    throw new Error('Video integration requires CF_VIDEO_DATABASE_DISPOSABLE=1 and a loopback PostgreSQL /cf_video_v1_test database');
  }
  return url.href;
}

// Structural ingestion fixture only; browser playback requires an existing MP4.
function structuralMp4V1() {
  const box = (type, bytes) => {
    const data = Buffer.alloc(8 + bytes.length);
    data.writeUInt32BE(data.length); data.write(type, 4, 4, 'ascii'); bytes.copy(data, 8);
    return data;
  };
  return Buffer.concat([
    box('ftyp', Buffer.from('isom\0\0\0\0isomiso2mp41', 'binary')),
    box('moov', Buffer.from('vide', 'ascii')),
    box('mdat', Buffer.from([1, 2, 3, 4])),
  ]);
}
const responseJson = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json' },
});

function createTransportV1(mp4) {
  const state = {
    estimates: [], submits: [], polls: [], cancels: [], downloads: [], textCalls: [],
    submitScript: { higgsfield: [], heygen: [] },
    jobs: new Map(), idempotency: new Map(), estimateUsd: 0.75,
    downloadFailures: 0, defaultStatus: 'completed',
  };
  const ensureJob = (provider, key, body) => {
    const index = `${provider}:${key}`;
    const known = provider === 'higgsfield' ? state.idempotency.get(index) : null;
    if (known) {
      if (known.body !== body) throw new Error('Fixture detected changed body for the same Higgsfield idempotency key');
      return known.id;
    }
    const id = `fixture_${provider}_${randomUUID().replaceAll('-', '')}`;
    state.jobs.set(id, { provider, status: state.defaultStatus, url: FIXTURE_CDN });
    state.idempotency.set(index, { id, body });
    return id;
  };
  state.fetch = async (value, options = {}) => {
    const url = new URL(String(value));
    const method = options.method || 'GET';
    if (url.href === FIXTURE_REFERENCE) return new Response(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZGwAAAABJRU5ErkJggg==', 'base64'), {headers: {'content-type': 'image/png'}});
    if (url.href === FIXTURE_CDN) {
      state.downloads.push({ url: url.href });
      if (state.downloadFailures > 0) { state.downloadFailures--; return new Response(null, { status: 503 }); }
      return new Response(mp4, { status: 200, headers: { 'content-type': 'video/mp4', 'content-length': String(mp4.length) } });
    }
    if (url.origin === 'https://api.higgsfield.ai' && url.pathname.startsWith('/estimate/')) {
      state.estimates.push({ url: url.href, body: options.body });
      return responseJson({ usd: state.estimateUsd });
    }
    if (url.origin === 'https://api.heygen.com' && url.pathname === '/v3/voices') {
      return responseJson({ data: [{ type: 'public', voice_id: 'fixture_voice_ru', name: 'Fixture Russian', language: 'Russian', support_locale: true, available_engines: ['starfish'] }], has_more: false });
    }
    if (url.origin === 'https://api.heygen.com' && url.pathname === '/v3/avatars/looks') {
      return responseJson({ data: [{ id: 'fixture_avatar', name: 'Fixture presenter', avatar_type: 'studio_avatar', status: 'completed', supported_api_engines: ['avatar_iii', 'avatar_iv'] }], has_more: false });
    }
    const provider = url.origin === 'https://api.higgsfield.ai' ? 'higgsfield' : url.origin === 'https://api.heygen.com' ? 'heygen' : null;
    const submit = provider && method === 'POST' &&
      ((provider === 'higgsfield' && /\/(text|image)-to-video$/.test(url.pathname)) || (provider === 'heygen' && url.pathname === '/v3/videos'));
    if (submit) {
      const key = new Headers(options.headers).get('idempotency-key');
      if (!key || typeof options.body !== 'string') throw new Error('Fixture submit requires a durable key and serialized body');
      state.submits.push({ provider, endpoint: url.href, body: options.body, key });
      const id = ensureJob(provider, key, options.body);
      const action = state.submitScript[provider].shift();
      // Model an accepted request whose response was lost; no paid API is reached.
      if (action === 'transport') throw new Error('Synthetic interrupted provider response');
      if (typeof action === 'number') return responseJson({ message: 'fixture provider refusal' }, action);
      if (action === 'invalid_receipt') return responseJson({});
      return provider === 'higgsfield'
        ? responseJson({ request_id: id, status_url: `${url.origin}/requests/${id}/status`, cancel_url: `${url.origin}/requests/${id}/cancel` })
        : responseJson({ data: { video_id: id } });
    }
    const hf = /^\/requests\/([^/]+)\/(status|cancel)$/.exec(url.pathname);
    const hg = /^\/v3\/videos\/([^/]+)$/.exec(url.pathname);
    const id = hf?.[1] || hg?.[1];
    if (provider && id && state.jobs.has(id)) {
      const job = state.jobs.get(id);
      if (hf?.[2] === 'cancel') {
        state.cancels.push({ id }); job.status = 'canceled';
        return new Response(null, { status: 202 });
      }
      state.polls.push({ provider, id });
      return provider === 'higgsfield'
        ? responseJson({ request_id: id, status: job.status, ...(job.status === 'completed' ? { video: { url: job.url } } : {}) })
        : responseJson({ data: { id, status: job.status, ...(job.status === 'completed' ? { video_url: job.url, duration: 15.5 } : {}) } });
    }
    throw new Error(`Unexpected network operation in isolated video fixture: ${url.origin}${url.pathname}`);
  };
  return state;
}

async function create(db, opts = {}) {
  const inputUrl = typeof db === 'string' ? db :
    db?._engineConfig?.overrideDatasources?.db?.url || db?._engineConfig?.datasourceOverrides?.db?.url;
  const databaseUrl = assertDisposableDatabaseV1(inputUrl);
  const ownsClient = typeof db === 'string';
  const prisma = ownsClient ? new (require('@prisma/client').PrismaClient)({ datasources: { db: { url: databaseUrl } } }) : db;
  const id = randomUUID();
  const uploadDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-video-v1-fixture-'));
  const envNames = ['JWT_SECRET', 'STORAGE_PROVIDER', 'UPLOAD_DIRECTORY', 'FRONTEND_URL'];
  const previousEnvironment = Object.fromEntries(envNames.map((key) => [key, process.env[key]]));
  process.env.JWT_SECRET = 'synthetic-disposable-video-test-secret';
  process.env.STORAGE_PROVIDER = 'local';
  process.env.UPLOAD_DIRECTORY = uploadDirectory;
  process.env.FRONTEND_URL = opts.frontendUrl || 'http://127.0.0.1:43119';
  const previousFetch = globalThis.fetch;
  const checkedFixture = path.join(ROOT, 'tests/fixtures/video-v1/flower.mp4');
  const mp4Path = opts.mp4Path || process.env.CF_VIDEO_MP4_FIXTURE || (fs.existsSync(checkedFixture) ? checkedFixture : null);
  const mp4 = mp4Path ? fs.readFileSync(mp4Path) : structuralMp4V1();
  const transport = createTransportV1(mp4);
  globalThis.fetch = (value, options) => {
    const url = new URL(String(value));
    return url.protocol === 'http:' && LOOPBACK.has(url.hostname)
      ? previousFetch(value, options) : transport.fetch(value, options);
  };
  let failureCleanup = async () => {
    globalThis.fetch = previousFetch;
    for (const [key, value] of Object.entries(previousEnvironment)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    fs.rmSync(uploadDirectory, { recursive: true, force: true });
    if (ownsClient) await prisma.$disconnect();
  };
  try {
  const moduleMocks = {};
  const register = (filename, names) => {
    const loaded = loadTypeScriptModule(`${LIB}${filename}.ts`, moduleMocks);
    for (const name of names) moduleMocks[name] = loaded;
    return loaded;
  };
  const contract = register('videos/video-provider.v1', ['./video-provider.v1', '../video-provider.v1']);
  const config = register('openai/ai.provider.config', [
    '../openai/ai.provider.config', '@contentfactory/nestjs-libraries/openai/ai.provider.config',
  ]);
  register('user/acting.user', ['../user/acting.user', '@contentfactory/nestjs-libraries/user/acting.user']);
  const auth = loadTypeScriptModule('libraries/helpers/src/auth/auth.service.ts');
  moduleMocks['@contentfactory/helpers/auth/auth.service'] = auth;
  const repositoryModule = register('database/prisma/video-generation/video-generation.repository', [
    '../database/prisma/video-generation/video-generation.repository',
  ]);
  const usageModule = register('openai/ai.usage.service', ['../openai/ai.usage.service']);
  const credentialsModule = register('videos/video-credentials.service', ['./video-credentials.service']);
  const higgsfieldModule = register('videos/providers/higgsfield.provider', ['./providers/higgsfield.provider']);
  const heygenModule = register('videos/providers/heygen.provider', ['./providers/heygen.provider']);
  const mediaModule = register('videos/video-media.v1', ['./video-media.v1']);
  moduleMocks['../openai/ai.clients'] = {
    getModelForRole: async () => 'synthetic-text-boundary',
    getOpenAiClient: async () => ({ chat: { completions: { parse: async (request) => {
      transport.textCalls.push(request);
      const input = JSON.parse(request.messages[1].content);
      const output = typeof opts.textOutput === 'function' ? opts.textOutput(input) : opts.textOutput || { prompt: input.brief.prompt, script: input.brief.script };
      return { choices: [{ message: { parsed: output } }] };
    } } } }),
  };
  const { VideoJobService } = loadTypeScriptModule(`${LIB}videos/video-job.service.ts`, moduleMocks);
  const organizations = [randomUUID(), randomUUID()];
  const users = [randomUUID(), randomUUID()];
  const pieceIds = [randomUUID(), randomUUID()];
  let closed = false;
  const repository = new repositoryModule.VideoGenerationRepository(prisma);
  const credentials = new credentialsModule.VideoCredentialsService(prisma);
  const dispatches = [];
  const execution = { start: async (organizationId, jobId, cycle = 0) => { dispatches.push({ organizationId, jobId, cycle }); } };
  const media = new mediaModule.VideoMediaV1();
  const restart = () => {
    config.resetAiConfigCache();
    return new VideoJobService(repository, credentials, new usageModule.AiUsageService(prisma),
      new higgsfieldModule.HiggsfieldProviderV1(), new heygenModule.HeygenProviderV1(), media, execution);
  };
  let services;
  const close = async () => {
    if (closed) return;
    closed = true;
    try {
      await prisma.videoGenerationJob.deleteMany({ where: { organizationId: { in: organizations } } });
      await prisma.videoPromptDraft.deleteMany({ where: { organizationId: { in: organizations } } });
      await prisma.organization.deleteMany({ where: { id: { in: organizations } } });
      await prisma.user.deleteMany({ where: { id: { in: users } } });
    } finally {
      globalThis.fetch = previousFetch;
      for (const [key, value] of Object.entries(previousEnvironment)) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
      }
      fs.rmSync(uploadDirectory, { recursive: true, force: true });
      if (ownsClient) await prisma.$disconnect();
    }
  };
  failureCleanup = close;
  try {
    for (let index = 0; index < organizations.length; index++) {
      await prisma.organization.create({ data: { id: organizations[index], name: `Video isolated ${id} ${index}` } });
      await prisma.user.create({ data: { id: users[index], email: `video-${id}-${index}@example.invalid`, providerName: 'LOCAL', timezone: 0 } });
      await prisma.userOrganization.create({ data: { userId: users[index], organizationId: organizations[index], role: index === 0 ? 'ADMIN' : 'USER' } });
      await prisma.contentPiece.create({ data: {
        id: pieceIds[index], organizationId: organizations[index], title: 'Проверка исходных фактов',
        body: SOURCE_TEXT, language: 'ru', createdByUserId: users[index],
        brief: { brief: { inputKind: 'thought', facts: [{ statement: SOURCE_TEXT, evidenceId: `evidence-${pieceIds[index]}`, origin: 'person', verified: true }] } },
      } });
      await prisma.aiProviderSetting.create({ data: {
        organizationId: organizations[index], usageMode: 'workspace_key', provider: 'openai',
        ...(opts.textKey ? { apiKey: auth.AuthService.fixedEncryption('synthetic-text-key') } : {}),
        videoApiKeys: {
          higgsfield: auth.AuthService.fixedEncryption(`synthetic-key-${index}:synthetic-secret-${index}`),
          heygen: auth.AuthService.fixedEncryption(`synthetic-presenter-${index}`),
        },
        videoSpendPolicy: Object.fromEntries(['higgsfield', 'heygen'].map((provider) => [provider, {
          enabled: true, maxCostUsd: opts.maxCostUsd ?? 2, monthlyBudgetUsd: opts.monthlyBudgetUsd ?? 100,
        }])),
      } });
    }
    services = restart();
  } catch (error) { await close(); throw error; }
  const clipSettings = { provider: 'higgsfield', model: 'wan-3.0', mode: 'clip', locale: 'ru', duration: 5, aspectRatio: '9:16', resolution: '720p', audio: false, captions: false };
  const presenterSettings = { provider: 'heygen', model: 'heygen-avatar', mode: 'presenter', locale: 'ru', duration: 15, aspectRatio: '9:16', resolution: '720p', audio: true, captions: false, avatarId: 'fixture_avatar', voiceId: 'fixture_voice_ru', engine: 'avatar_iii' };
  const fixture = {
    db: prisma, services, service: services, repository, credentials, execution, dispatches, transport,
    org: await prisma.organization.findUnique({ where: { id: organizations[0] }, include: { users: true } }),
    otherOrg: await prisma.organization.findUnique({ where: { id: organizations[1] }, include: { users: true } }),
    user: await prisma.user.findUnique({ where: { id: users[0] } }),
    otherUser: await prisma.user.findUnique({ where: { id: users[1] } }),
    pieceId: pieceIds[0], otherPieceId: pieceIds[1], organizations, users, uploadDirectory,
    clipSettings, presenterSettings, mp4, playableFixtureSupplied: !!mp4Path, contract,
    async prepare(options = {}) {
      const { presenter, ...input } = options;
      return fixture.service.prepare(fixture.org.id, fixture.user.id, {
        pieceId: fixture.pieceId, settings: presenter ? presenterSettings : clipSettings,
        intent: 'Показать подтверждённые факты', ...input,
      });
    },
    async ready(options = {}) {
      const { presenter, ...input } = options;
      const draft = await fixture.service.prepare(fixture.org.id, fixture.user.id, {
        pieceId: fixture.pieceId, settings: presenter ? presenterSettings : clipSettings, intent: 'Показать подтверждённые факты', ...input,
      });
      const preflight = await fixture.service.preflight(fixture.org.id, fixture.user.id, draft.id);
      const launch = { draftId: draft.id, version: draft.version, preflightId: preflight.preflightId, intentId: randomUUID() };
      return { draft, preflight, launch };
    },
    restart() { fixture.service = fixture.services = restart(); if (fixture.Controller) fixture.controller = new fixture.Controller({}, fixture.service, credentials); return fixture.service; },
    async runToTerminal(jobId, limit = 8) {
      for (let step = 0; step < limit; step++) {
        const state = await fixture.service.runStep(fixture.org.id, jobId);
        if (state.done) return fixture.service.get(fixture.org.id, jobId);
      }
      throw new Error('Fixture runStep limit reached without a terminal result');
    },
    createController() {
      const policy = loadTypeScriptModule('apps/backend/src/services/auth/permissions/permissions.ability.ts');
      const permissions = loadTypeScriptModule('apps/backend/src/services/auth/permissions/permission.exception.class.ts');
      const { MediaController } = loadTypeScriptModule('apps/backend/src/api/routes/media.controller.ts', {
        ...moduleMocks,
        '@contentfactory/backend/services/auth/permissions/permissions.ability': policy,
        '@contentfactory/backend/services/auth/permissions/permission.exception.class': permissions,
        '@contentfactory/nestjs-libraries/videos/video-job.service': { VideoJobService },
        '@contentfactory/nestjs-libraries/videos/video-credentials.service': credentialsModule,
        // Legacy generation/upload routes are not exercised; all new video doors are real.
        '@contentfactory/nestjs-libraries/database/prisma/media/media.service': { MediaService: class {} },
        '@contentfactory/nestjs-libraries/upload/r2.uploader': { __esModule: true, default: () => { throw new Error('Legacy R2 is outside video fixture'); } },
      });
      return new MediaController({}, fixture.service, credentials);
    },
    close,
  };
  fixture.controller = fixture.createController();
  fixture.Controller = fixture.controller.constructor;
  const permissionDependencyMocks = Object.fromEntries([
    ['@contentfactory/nestjs-libraries/database/prisma/subscriptions/subscription.service', 'SubscriptionService'],
    ['@contentfactory/nestjs-libraries/database/prisma/posts/posts.service', 'PostsService'],
    ['@contentfactory/nestjs-libraries/database/prisma/integrations/integration.service', 'IntegrationService'],
    ['@contentfactory/nestjs-libraries/database/prisma/webhooks/webhooks.service', 'WebhooksService'],
  ].map(([name, exported]) => [name, { [exported]: class UnusedPlanDependency {} }]));
  const permissionService = loadTypeScriptModule('apps/backend/src/services/auth/permissions/permissions.service.ts', permissionDependencyMocks);
  const policy = loadTypeScriptModule('apps/backend/src/services/auth/permissions/permissions.ability.ts');
  const guard = loadTypeScriptModule('apps/backend/src/services/auth/permissions/permissions.guard.ts', {
    '@contentfactory/backend/services/auth/permissions/permissions.service': permissionService,
    '@contentfactory/backend/services/auth/permissions/permissions.ability': policy,
  });
  fixture.PoliciesGuard = guard.PoliciesGuard;
  fixture.PermissionsService = permissionService.PermissionsService;
  fixture.permissions = new permissionService.PermissionsService({}, {}, {}, {});
  return fixture;
  } catch (error) { await failureCleanup(); throw error; }
}

module.exports = { create, assertDisposableDatabaseV1, SOURCE_TEXT, FIXTURE_CDN, FIXTURE_REFERENCE, structuralMp4V1 };
