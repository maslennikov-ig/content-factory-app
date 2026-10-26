'use strict';
// Local storage and session identity; ordinary production API/model/search routing.
// This launcher does not call a model itself. User turns and durable recovery may.
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
const OWNER = 'cf-local-real-model/v1';
function loopback(value) {
  return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(value).hostname);
}
function installEnv(env) {
  for (const key of Object.keys(process.env)) {
    if (!['HOME', 'USER', 'LOGNAME', 'PATH', 'SHELL', 'LANG', 'LC_ALL', 'TMPDIR', 'TERM'].includes(key)) delete process.env[key];
  }
  Object.assign(process.env, env);
  process.env.TS_NODE_PROJECT = path.join(ROOT, 'tsconfig.json');
  process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: 'commonjs' });
}
function loadTs() {
  require('ts-node/register/transpile-only');
  require('tsconfig-paths/register');
  require('reflect-metadata');
}
const lib = file => require(path.join(ROOT, 'libraries/nestjs-libraries/src', file));
const backend = file => require(path.join(ROOT, 'apps/backend/src', file));
function load(file) {
  const stand = JSON.parse(fs.readFileSync(file));
  if (stand.owner !== OWNER || stand.repo !== ROOT || !/^cf_real_model_20261025_[a-f0-9]{8}$/.test(stand.database)) throw Error('Stand ownership mismatch');
  for (const key of ['DATABASE_URL', 'MASTRA_DATABASE_URL', 'REDIS_URL']) {
    if (!loopback(stand.env[key])) throw Error('Non-loopback service refused');
  }
  if (new URL(stand.env.DATABASE_URL).pathname !== '/' + stand.database ||
      new URL(stand.env.MASTRA_DATABASE_URL).pathname !== '/' + stand.database + '_mastra' ||
      new URL(stand.env.REDIS_URL).pathname !== '/14' || stand.env.PORT !== '3516') throw Error('Storage/port ownership mismatch');
  return stand;
}
async function start(file) {
  const stand = load(file); installEnv(stand.env);
  const { Client } = require('pg'); const admin = new Client({ connectionString: stand.env.DATABASE_URL });
  await admin.connect();
  try {
    const rows = await admin.query("SELECT datname, shobj_description(oid, 'pg_database') AS owner FROM pg_database WHERE datname = ANY($1)", [[stand.database, stand.database + '_mastra']]);
    if (rows.rows.length !== 2 || rows.rows.some(row => row.owner !== OWNER)) throw Error('Database ownership receipt missing');
  } finally { await admin.end(); }
  const { PostgresStore } = require('@mastra/pg');
  const store = new PostgresStore({ id: 'cf-api-preview-bootstrap', connectionString: stand.env.MASTRA_DATABASE_URL });
  await store.init(); await store.close();
  loadTs();
  const { Global, Module, ValidationPipe } = require('@nestjs/common'); const { APP_GUARD, NestFactory } = require('@nestjs/core');
  const { NewsletterDeliveryRetryServiceV1 } = backend('services/newsletter/newsletter-delivery-retry.service.v1.ts');
  class Support {} Global()(Support); Module({ providers: [NewsletterDeliveryRetryServiceV1], exports: [NewsletterDeliveryRetryServiceV1] })(Support);
  const { ThrottlerModule } = require('@nestjs/throttler'); const { ThrottlerStorageRedisService } = require('@nest-lab/throttler-storage-redis'); const { ioRedis } = lib('redis/redis.service.ts');
  class ApiPreviewModule {}
  Module({ imports: [lib('database/prisma/database.module.ts').DatabaseModule, backend('api/api.module.ts').ApiModule, lib('agent/agent.module.ts').AgentModule, lib('3rdparties/thirdparty.module.ts').ThirdPartyModule, lib('videos/video.module.ts').VideoModule, lib('chat/chat.module.ts').ChatModule, Support, lib('temporal/temporal.module.ts').getTemporalCommandModule(), ThrottlerModule.forRoot({ throttlers: [{ ttl: 3600000, limit: 10000 }], storage: new ThrottlerStorageRedisService(ioRedis) })], providers: [{ provide: APP_GUARD, useClass: lib('throttler/throttler.provider.ts').ThrottlerBehindProxyGuard }, { provide: APP_GUARD, useClass: backend('services/auth/permissions/permissions.guard.ts').PoliciesGuard }] })(ApiPreviewModule);
  const app = await NestFactory.create(ApiPreviewModule, { cors: backend('cors.options.ts').buildBackendCorsOptions(process.env) });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true })); app.use(require('cookie-parser')());
  app.useGlobalFilters(new (backend('services/auth/permissions/subscription.exception.ts').SubscriptionExceptionFilter)(), new (backend('api/routes/posts.validation.exception.ts').PostValidationExceptionFilter)(), new (lib('services/exception.filter.ts').HttpExceptionFilter)(), new (lib('services/stripe.error.filter.ts').StripeErrorFilter)());
  app.use((req, res, next) => /^\/(?:integrations\/.*connect|posts\/(?:publish|send)|admin|enterprise|auth\/(?:register|forgot))/i.test(req.path) ? res.status(403).json({ code: 'LOCAL_PREVIEW_PUBLICATION_DISABLED' }) : next());
  await app.listen(3516, '127.0.0.1');
  return { app, async close() { await lib('temporal/temporal.module.ts').closeTemporalCommandClient(app).catch(() => {}); await app.close(); ioRedis.disconnect(); await lib('chat/mastra.store.ts').closeMastraStore(); } };
}
module.exports = { OWNER, load, start };
if (require.main === module) (async () => {
  if (process.argv[2] !== 'serve') throw Error('Use serve STAND');
  const runtime = await start(process.argv[3]); console.log(JSON.stringify({ ready: true, port: 3516, models: 'configured-api' }));
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => runtime.close().then(() => process.exit(0)));
})().catch(error => { console.error(error.stack); process.exit(1); });
