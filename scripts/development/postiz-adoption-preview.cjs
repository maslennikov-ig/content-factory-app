'use strict';
// Dedicated Postiz adoption preview. Reuses only the explicitly selected local session.
// Setup creates two new task-owned databases and an isolated Redis; no paid credentials.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const ROOT = path.resolve(__dirname, '../..');
const OWNER = 'cf-postiz-adoption-20261107';
const lib = file => require(path.join(ROOT, 'libraries/nestjs-libraries/src', file));
const backend = file => require(path.join(ROOT, 'apps/backend/src', file));

function load(file) {
  const stand = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (stand.owner !== OWNER || stand.repo !== ROOT || path.resolve(stand.directory, 'stand.private.json') !== path.resolve(file)) throw Error('Preview ownership mismatch');
  for (const [key, port, database] of [['DATABASE_URL', 39014, 'cf_postiz_20261107'], ['MASTRA_DATABASE_URL', 39014, 'cf_postiz_20261107_mastra'], ['REDIS_URL', 39025, '0']]) {
    const url = new URL(stand.env[key]);
    if (url.hostname !== '127.0.0.1' || Number(url.port) !== port || url.pathname !== '/' + database) throw Error('Preview storage mismatch');
  }
  if (stand.env.FRONTEND_URL !== 'http://127.0.0.1:4497' || stand.env.NEXT_PUBLIC_BACKEND_URL !== 'http://127.0.0.1:4497/api' ||
    stand.env.BACKEND_INTERNAL_URL !== 'http://127.0.0.1:3676' || stand.env.TEMPORAL_ADDRESS !== '127.0.0.1:39016' ||
    stand.env.NODE_ENV !== 'development' || !stand.env.CF_LOCAL_AUTH_TOKEN || !stand.env.JWT_SECRET ||
    stand.env.UPLOAD_DIRECTORY !== path.join(stand.directory, 'uploads')) throw Error('Preview origin/session mismatch');
  return stand;
}
function install(stand) {
  for (const key of Object.keys(process.env)) if (!['HOME', 'USER', 'LOGNAME', 'PATH', 'SHELL', 'LANG', 'LC_ALL', 'TMPDIR', 'TERM'].includes(key)) delete process.env[key];
  Object.assign(process.env, stand.env, {TS_NODE_PROJECT: path.join(ROOT, 'tsconfig.json'), TS_NODE_COMPILER_OPTIONS: JSON.stringify({module: 'commonjs'})});
}
function loadTs() {
  require('ts-node/register/transpile-only'); require('tsconfig-paths/register'); require('reflect-metadata');
}
function previewActionBlocked(method, pathname) {
  if (method !== 'GET' && method !== 'HEAD' && /^\/(?:agents|agent|copilot|social-factory|video|third-party|billing|stripe)(?:\/|$)/i.test(pathname)) return true;
  if (/^\/(?:integrations\/.*connect|posts\/(?:publish|send)|admin|enterprise|auth\/(?:register|forgot))/i.test(pathname)) return true;
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return false;
  return /^\/media\/(?:video-jobs(?:\/|$)|video\/|video-v2\/(?:preflight|jobs)(?:\/|$)|generate-(?:video|image)(?:-|\/|$))/.test(pathname) ||
    /^\/social-factory\/videos\/[^/]+\/(?:launch|preflight)(?:\/|$)/.test(pathname) ||
    /^\/social-factory\/.*\/(?:publish|send)(?:\/|$)/.test(pathname);
}
async function startBackend(stand) {
  install(stand);
  const {PrismaClient} = require('@prisma/client');
  const check = new PrismaClient();
  try {
    const user = await check.user.findUnique({where: {id: stand.actor.userId}});
    const member = await check.userOrganization.findFirst({where: {userId: stand.actor.userId, organizationId: stand.actor.organizationId, disabled: false}});
    if (!user?.activated || user.blockedAt || member?.role !== 'ADMIN') throw Error('Explicit owner profile unavailable');
    // A restart cannot silently dispatch a paid video accepted in another run.
    for (const model of ['videoGenerationJob', 'videoSubscriptionJob', 'videoProductionRevision']) {
      if (await check[model].count({where: {state: {in: ['accepted', 'submitting', 'queued', 'running', 'saving', 'approved']}}})) throw Error('Pending jobs require an explicit continuation decision');
    }
  } finally { await check.$disconnect(); }
  const {PostgresStore} = require('@mastra/pg');
  const store = new PostgresStore({id: OWNER, connectionString: stand.env.MASTRA_DATABASE_URL});
  await store.init(); await store.close();
  loadTs();
  const {Global, Module, ValidationPipe} = require('@nestjs/common');
  const {APP_GUARD, NestFactory} = require('@nestjs/core');
  const {NewsletterDeliveryRetryServiceV1} = backend('services/newsletter/newsletter-delivery-retry.service.v1.ts');
  class Support {} Global()(Support); Module({providers: [NewsletterDeliveryRetryServiceV1], exports: [NewsletterDeliveryRetryServiceV1]})(Support);
  const {ThrottlerModule} = require('@nestjs/throttler');
  const {ThrottlerStorageRedisService} = require('@nest-lab/throttler-storage-redis');
  const {ioRedis} = lib('redis/redis.service.ts');
  class OwnerPreviewModule {}
  Module({imports: [lib('database/prisma/database.module.ts').DatabaseModule,
    lib('content-intelligence/social-factory/social-factory.module.ts').SocialFactoryModule,
    backend('api/api.module.ts').ApiModule, lib('agent/agent.module.ts').AgentModule,
    lib('3rdparties/thirdparty.module.ts').ThirdPartyModule, lib('videos/video.module.ts').VideoModule,
    lib('chat/chat.module.ts').ChatModule, Support, lib('temporal/temporal.module.ts').getTemporalCommandModule(),
    ThrottlerModule.forRoot({throttlers: [{ttl: 3600000, limit: 10000}], storage: new ThrottlerStorageRedisService(ioRedis)})],
    providers: [{provide: APP_GUARD, useClass: lib('throttler/throttler.provider.ts').ThrottlerBehindProxyGuard},
      {provide: APP_GUARD, useClass: backend('services/auth/permissions/permissions.guard.ts').PoliciesGuard}]})(OwnerPreviewModule);
  const app = await NestFactory.create(OwnerPreviewModule, {cors: backend('cors.options.ts').buildBackendCorsOptions(process.env)});
  app.useGlobalPipes(new ValidationPipe({transform: true, whitelist: true})); app.use(require('cookie-parser')());
  app.useGlobalFilters(new (backend('services/auth/permissions/subscription.exception.ts').SubscriptionExceptionFilter)(),
    new (backend('api/routes/posts.validation.exception.ts').PostValidationExceptionFilter)(),
    new (lib('services/exception.filter.ts').HttpExceptionFilter)(), new (lib('services/stripe.error.filter.ts').StripeErrorFilter)());
  // Personal OAuth connect/callback remains available. Social publishing and
  // API-funded video mutation are outside this preview's authorized pilot.
  app.use((req, res, next) => {
    return previewActionBlocked(req.method, req.path) ? res.status(403).json({code: 'OWNER_PREVIEW_ACTION_DISABLED'}) : next();
  });
  await app.listen(3676, '127.0.0.1');
  return {app, async close() { await lib('temporal/temporal.module.ts').closeTemporalCommandClient(app).catch(() => {}); await app.close(); ioRedis.disconnect(); await lib('chat/mastra.store.ts').closeMastraStore(); }};
}
async function startFrontend(stand) {
  install(stand);
  process.env.CF_OWNER_PREVIEW = 'true';
  // Tailwind resolves its existing configuration from the application cwd.
  process.chdir(path.join(ROOT, 'apps/frontend'));
  const {pathToFileURL} = require('node:url');
  const {default: config} = await import(pathToFileURL(path.join(ROOT, 'apps/frontend/next.config.js')).href);
  // This checkout has its own previously absent .next, not either retained
  // frontend's output. Disable URL logging so OAuth code/state never enter logs.
  const next = require('next')({dev: true, webpack: true, dir: path.join(ROOT, 'apps/frontend'), hostname: '127.0.0.1', port: 4497, conf: {...config, logging: false}});
  await next.prepare();
  const handle = next.getRequestHandler();
  const server = http.createServer(async (req, res) => {
    // Host-only cookies are isolated only when the canonical host is enforced.
    if (req.headers.host !== '127.0.0.1:4497') {
      res.writeHead(421, {'Cache-Control': 'no-store'}); res.end('Use http://127.0.0.1:4497'); return;
    }
    if (/^\/(?:api\/)?uploads(?:\/|\?|$)/.test(req.url)) {
      const auth = typeof req.headers.auth === 'string' ? req.headers.auth :
        /(?:^|;\s*)auth=([^;]+)/.exec(req.headers.cookie || '')?.[1];
      try {
        if (!auth) throw Error();
        const self = await fetch('http://127.0.0.1:3676/user/self', {headers: {auth, showorg: stand.actor.organizationId}, signal: AbortSignal.timeout(2000)});
        const owner = self.ok ? await self.json() : null;
        if (owner?.id !== stand.actor.userId || owner.orgId !== stand.actor.organizationId) throw Error();
      } catch { res.writeHead(403, {'Cache-Control': 'no-store'}); res.end('Owner preview file access denied'); return; }
    }
    if (req.url.startsWith('/api/') && !/^\/api\/(?:uploads|browser-errors)(?:\/|\?|$)/.test(req.url)) {
      const upstream = http.request({hostname: '127.0.0.1', port: 3676, method: req.method, path: req.url.slice(4), headers: req.headers}, response => {
        res.writeHead(response.statusCode, response.headers); response.pipe(res);
      });
      upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end('Owner preview backend unavailable'); });
      req.on('aborted', () => upstream.destroy()); req.pipe(upstream); return;
    }
    handle(req, res).catch(() => { if (!res.headersSent) res.writeHead(500); res.end('Owner preview frontend unavailable'); });
  });
  server.on('upgrade', next.getUpgradeHandler());
  await new Promise(resolve => server.listen(4497, '127.0.0.1', resolve));
  return {async close() { await new Promise(resolve => server.close(resolve)); await next.close(); }};
}
module.exports = {load, startBackend, startFrontend, previewActionBlocked};
if (require.main === module) (async () => {
  const mode = process.argv[2], stand = load(process.argv[3]);
  if (!['backend', 'frontend'].includes(mode)) throw Error('Use backend|frontend PRIVATE_STAND');
  const runtime = await (mode === 'backend' ? startBackend(stand) : startFrontend(stand));
  console.log(JSON.stringify({ready: true, owner: OWNER, role: mode, port: mode === 'backend' ? 3676 : 4497}));
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => runtime.close().then(() => process.exit(0)));
})().catch(error => { console.error('Postiz preview startup failed:', String(error.stack || error.message || error.name).replace(/postgres(?:ql)?:\/\/[^\s]+/g, '[local database URL]').replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[session]').slice(0, 2400)); process.exit(1); });
