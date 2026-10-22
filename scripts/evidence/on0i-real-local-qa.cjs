#!/usr/bin/env node
'use strict';

// Local-only stand ownership and preparation. Credentials never enter Git.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { randomUUID, createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const stage = path.join(root, '.codex/stages/content-factory-next-on0i-repair-20261021');
const OWNER = 'content-factory-next-on0i-real-local-qa/1';
const secrets = new Set();
const safe = (value) => {
  let result = String(value);
  for (const secret of secrets) if (secret) result = result.split(secret).join('[REDACTED]');
  return result.replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, '[LOCAL_DATABASE_URL]')
    .replace(/\b(?:sk-or-v1-|tvly-|sk-proj-)[A-Za-z0-9_-]+/g, '[REDACTED]');
};
function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
}
function writePrivate(file, data) {
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(file, 0o600);
}
function writeEvidence(name, data) {
  fs.mkdirSync(stage, { recursive: true });
  const target = path.join(stage, `real-local-qa-${name}.json`);
  const next = `${JSON.stringify(data, null, 2)}\n`;
  if (fs.existsSync(target)) {
    const previous = fs.readFileSync(target, 'utf8');
    if (previous !== next) {
      const history = path.join(stage, 'real-local-qa-history');
      fs.mkdirSync(history, { recursive: true });
      fs.writeFileSync(path.join(history, `${name}-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}.json`), previous);
    }
  }
  fs.writeFileSync(target, next);
}
function sha(file) { return createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function command(binary, args, options = {}) {
  return execFileSync(binary, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options }).trim();
}
function loadTs() {
  process.env.TS_NODE_PROJECT = path.join(root, 'tsconfig.json');
  process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: 'commonjs' });
  require('ts-node/register/transpile-only');
  require('tsconfig-paths/register');
  require('reflect-metadata');
}
function localUrl(value, protocols, port, database) {
  const url = new URL(value);
  if (!protocols.includes(url.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      || Number(url.port) !== port || (database && url.pathname.slice(1) !== database)) {
    throw new Error('Refusing a non-owned or non-local service endpoint.');
  }
  return url;
}
function loadStand() {
  const file = arg('--stand', process.env.CF_ON0I_QA_STAND);
  if (!file || !path.resolve(file).startsWith(`${os.tmpdir()}/on0i-real-local-qa-`)) throw new Error('Pass --stand /tmp/on0i-real-local-qa-*/stand.json.');
  const stat = fs.statSync(file);
  if (!stat.isFile() || (stat.mode & 0o077)) throw new Error('The stand file must have private mode 0600.');
  const stand = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (stand.owner !== OWNER || stand.repo !== root) throw new Error('Stand owner/repository mismatch.');
  for (const key of ['DATABASE_URL', 'MASTRA_DATABASE_URL', 'JWT_SECRET']) secrets.add(stand.env[key]);
  localUrl(stand.env.DATABASE_URL, ['postgresql:', 'postgres:'], 5433, stand.databases.product);
  localUrl(stand.env.MASTRA_DATABASE_URL, ['postgresql:', 'postgres:'], 5433, stand.databases.mastra);
  localUrl(stand.env.REDIS_URL, ['redis:'], 6380, '');
  if (new URL(stand.env.REDIS_URL).pathname !== '/13') throw new Error('QA Redis must use its reserved database 13.');
  return { ...stand, file: path.resolve(file), privateDir: path.dirname(path.resolve(file)) };
}
function installEnv(stand) {
  const keep = new Set(['HOME', 'USER', 'LOGNAME', 'PATH', 'SHELL', 'LANG', 'LC_ALL', 'TMPDIR', 'TERM']);
  for (const key of Object.keys(process.env)) if (!keep.has(key)) delete process.env[key];
  Object.assign(process.env, stand.env);
}
async function portFree(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', () => reject(new Error(`Local QA port ${port} is already owned by another listener.`)));
    server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
  });
}
const dockerInventory = () => command('docker', ['ps', '-a', '--format', '{{.ID}} {{.Names}}']).split('\n').filter(Boolean).sort();

async function prepare() {
  if (process.version !== 'v22.23.2' || command('pnpm', ['--version']) !== '10.6.1') throw new Error('Use repository Node 22.23.2 and pnpm 10.6.1.');
  if (command('git', ['branch', '--show-current']) !== 'codex/on0i-native-repair-20261021') throw new Error('Repair branch mismatch.');
  await portFree(3478);
  await portFree(4278);
  const envFile = arg('--local-env');
  const sourceOrg = arg('--source-org');
  if (!envFile || !sourceOrg) throw new Error('prepare requires --local-env LOCAL_IGNORED_ENV --source-org LOCAL_CONFIGURED_ORG.');
  const sourceEnv = require('dotenv').parse(fs.readFileSync(envFile));
  const source = localUrl(sourceEnv.DATABASE_URL, ['postgresql:', 'postgres:'], 5433);
  localUrl(sourceEnv.REDIS_URL, ['redis:'], 6380);
  if (!sourceEnv.JWT_SECRET) throw new Error('The local decryption secret is absent.');
  secrets.add(sourceEnv.DATABASE_URL); secrets.add(sourceEnv.JWT_SECRET);
  const previous = arg('--stand') ? loadStand() : undefined;
  const privateDir = previous?.privateDir || fs.mkdtempSync(path.join(os.tmpdir(), 'on0i-real-local-qa-'));
  fs.chmodSync(privateDir, 0o700);
  const suffix = previous ? previous.databases.product.split('_').at(-1) : randomUUID().slice(0, 8);
  const prefix = `cf_on0i_qa_20261021_${suffix}`;
  const databases = { product: prefix, mastra: `${prefix}_mastra` };
  const urls = Object.fromEntries(Object.entries(databases).map(([key, name]) => {
    const url = new URL(source); url.pathname = `/${name}`; url.search = '?connection_limit=8';
    secrets.add(url.toString()); return [key, url.toString()];
  }));
  const redisUrl = new URL(sourceEnv.REDIS_URL); redisUrl.pathname = '/13';
  const { Redis } = require('ioredis');
  const redis = new Redis(redisUrl.toString(), { lazyConnect: true, maxRetriesPerRequest: 1 });
  const redisOwnerKey = 'cf:on0i:real-local-qa:owner';
  const redisOwner = `${OWNER}:${suffix}`;
  try {
    await redis.connect();
    if (previous) {
      if (await redis.get(redisOwnerKey) !== redisOwner) throw new Error('Existing stand lost its Redis ownership claim.');
    } else {
      if (await redis.dbsize()) throw new Error('Redis database 13 is nonempty; refusing to assume ownership.');
      if (await redis.set(redisOwnerKey, redisOwner, 'NX') !== 'OK') throw new Error('Redis database ownership claim failed.');
    }
  } finally { redis.disconnect(); }
  const env = {
    NODE_ENV: 'development', PORT: '3478', FRONTEND_URL: 'http://localhost:4278',
    NEXT_PUBLIC_BACKEND_URL: 'http://localhost:3478', BACKEND_INTERNAL_URL: 'http://localhost:3478',
    MAIN_URL: 'http://localhost:4278', NEXT_PUBLIC_URL: 'http://localhost:4278',
    DATABASE_URL: urls.product, MASTRA_DATABASE_URL: urls.mastra, REDIS_URL: redisUrl.toString(),
    JWT_SECRET: sourceEnv.JWT_SECRET, NOT_SECURED: 'true', API_LIMIT: '10000',
    STORAGE_PROVIDER: 'local', UPLOAD_DIRECTORY: path.join(privateDir, 'uploads'),
    NEXT_PUBLIC_UPLOAD_DIRECTORY: '/uploads', EMAIL_PROVIDER: '', RUN_CRON: '',
    DISABLE_REGISTRATION: 'true', MCP_ENABLED: '', NEXT_TELEMETRY_DISABLED: '1',
    TEMPORAL_ADDRESS: '127.0.0.1:1', TEMPORAL_NAMESPACE: `on0i-qa-disabled-${suffix}`,
  };
  fs.mkdirSync(env.UPLOAD_DIRECTORY, { recursive: true, mode: 0o700 });
  const stand = previous || { owner: OWNER, createdAt: new Date().toISOString(), repo: root, databases, env, redisOwnerKey, redisOwner, actors: [], createdDatabases: [], dockerBefore: dockerInventory() };
  stand.env = env;
  const file = path.join(privateDir, 'stand.json');
  writePrivate(file, stand);
  const { Client } = require('pg');
  const adminUrl = new URL(source); adminUrl.pathname = '/postgres';
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    for (const name of Object.values(databases)) {
      const existing = await admin.query('SELECT shobj_description(oid, $2) AS owner FROM pg_database WHERE datname=$1', [name, 'pg_database']);
      if (existing.rowCount) {
        if (previous && stand.createdDatabases.includes(name) && existing.rows[0].owner === OWNER) continue;
        throw new Error('Disposable database already exists; ownership cannot be assumed.');
      }
      await admin.query(`CREATE DATABASE "${name}"`);
      await admin.query(`COMMENT ON DATABASE "${name}" IS '${OWNER}'`);
      stand.createdDatabases.push(name); writePrivate(file, stand);
    }
  } finally { await admin.end(); }
  const pushEnv = { ...process.env, DATABASE_URL: urls.product, MASTRA_DATABASE_URL: urls.mastra };
  let pushOutput;
  try {
    pushOutput = command('pnpm', ['exec', 'prisma', 'db', 'push', '--schema', 'libraries/nestjs-libraries/src/database/prisma/schema.prisma', '--skip-generate'], { env: pushEnv });
  } catch (error) { throw new Error(`Owned QA schema bootstrap failed: ${safe(error.stderr || error.message)}`); }
  const { PrismaClient } = require('@prisma/client');
  const original = new PrismaClient({ datasources: { db: { url: source.toString() } } });
  const prisma = new PrismaClient({ datasources: { db: { url: urls.product } } });
  try {
    const setting = await original.aiProviderSetting.findUnique({ where: { organizationId: sourceOrg }, select: {
      provider: true, usageMode: true, apiKey: true, textModel: true, roleModels: true,
      searchEnabled: true, searchProvider: true, searchApiKey: true, searchApiKeys: true,
      searchTaskProviders: true, searchTopic: true, searchDepth: true,
    } });
    if (!setting?.apiKey || setting.provider !== 'openrouter' || setting.usageMode !== 'workspace_key') throw new Error('Local organization does not have the authorized workspace OpenRouter configuration.');
    secrets.add(setting.apiKey); secrets.add(setting.searchApiKey);
    Object.values(setting.searchApiKeys || {}).forEach(value => secrets.add(value));
    installEnv({ env }); loadTs();
    const { AuthService } = require(path.join(root, 'libraries/helpers/src/auth/auth.service.ts'));
    const decrypts = value => {
      if (!value) return false;
      try { const plain = AuthService.fixedDecryption(value); secrets.add(plain); return Boolean(plain); }
      catch { return false; }
    };
    const credentialsDecrypt = { model: decrypts(setting.apiKey), search: decrypts(setting.searchApiKeys?.[setting.searchProvider] || setting.searchApiKey) };
    if (stand.actors.length && stand.actors.length !== 2) throw new Error('A partial actor seed needs inspection before resume.');
    if (!stand.actors.length && (await prisma.user.count() || await prisma.organization.count())) throw new Error('Unrecorded product objects exist; refusing to overwrite.');
    if (!stand.actors.length) {
    for (const label of ['primary', 'other-tenant']) {
      const org = await prisma.organization.create({ data: { name: `ON0I QA ${label} ${suffix}`, apiKey: randomUUID() } });
      const user = await prisma.user.create({ data: {
        email: `on0i-qa-${label}-${suffix}@example.invalid`, name: `ON0I QA ${label}`, providerName: 'LOCAL',
        password: AuthService.hashPassword(randomUUID()), timezone: 180, language: 'ru', activated: true,
        sendSuccessEmails: false, sendFailureEmails: false, sendStreakEmails: false,
      } });
      await prisma.userOrganization.create({ data: { organizationId: org.id, userId: user.id, role: 'ADMIN' } });
      const avatar = await prisma.projectBrandProfile.create({ data: { organizationId: org.id, name: `ON0I QA ${label}`, kind: 'BRAND', isDefault: true } });
      stand.actors.push({ label, organizationId: org.id, userId: user.id, avatarId: avatar.id, auth: AuthService.signSessionJWT(user) });
      if (label === 'primary') {
        await prisma.aiProviderSetting.create({ data: { ...setting, organizationId: org.id,
          searchApiKeys: setting.searchApiKeys && typeof setting.searchApiKeys === 'object'
            ? Object.fromEntries(Object.entries(setting.searchApiKeys).filter(([engine, key]) =>
              ['tavily', 'exa'].includes(engine) && typeof key === 'string' && key.length > 0)) : undefined,
          roleModels: setting.roleModels || undefined, searchTaskProviders: setting.searchTaskProviders || undefined,
        } });
      }
    }
    }
    stand.route = { provider: setting.provider, usageMode: setting.usageMode, textModel: setting.textModel,
      roleModels: setting.roleModels, searchEnabled: setting.searchEnabled, searchProvider: setting.searchProvider,
      savedTavilyKey: Boolean(setting.searchApiKeys?.tavily || (setting.searchProvider === 'tavily' && setting.searchApiKey)), credentialsDecrypt };
    stand.seedReadback = { users: await prisma.user.count(), organizations: await prisma.organization.count(), avatars: await prisma.projectBrandProfile.count(), integrations: await prisma.integration.count(), pieces: await prisma.contentPiece.count(), usage: await prisma.aiUsageRecord.count() };
  } finally { await original.$disconnect(); await prisma.$disconnect(); }
  writePrivate(file, stand);
  const { PostgresStore } = require('@mastra/pg');
  const store = new PostgresStore({ id: `on0i-qa-bootstrap-${suffix}`, connectionString: urls.mastra });
  try { await store.init(); } finally { await store.close(); }
  const actor = stand.actors[0];
  writePrivate(path.join(privateDir, 'storage-state.json'), { cookies: [
    { name: 'auth', value: actor.auth, domain: 'localhost', path: '/', expires: -1, httpOnly: false, secure: false, sameSite: 'Lax' },
    { name: 'showorg', value: actor.organizationId, domain: 'localhost', path: '/', expires: -1, httpOnly: false, secure: false, sameSite: 'Lax' },
    { name: 'NEXT_LOCALE', value: 'ru', domain: 'localhost', path: '/', expires: -1, httpOnly: false, secure: false, sameSite: 'Lax' },
  ], origins: [] });
  const after = dockerInventory();
  if (JSON.stringify(stand.dockerBefore) !== JSON.stringify(after)) throw new Error('Docker inventory changed during preparation; inspect ownership before proceeding.');
  const receipt = { schema: OWNER, result: 'PREPARED', at: new Date().toISOString(), head: command('git', ['rev-parse', 'HEAD']),
    scriptSha256: sha(__filename), privateStandFile: file, databases, backendUrl: env.NEXT_PUBLIC_BACKEND_URL,
    frontendUrl: env.FRONTEND_URL, route: stand.route, seedReadback: stand.seedReadback,
    productSchemaBootstrap: { command: 'pnpm exec prisma db push --schema libraries/nestjs-libraries/src/database/prisma/schema.prisma --skip-generate', exit: 0, synchronized: /in sync|now in sync/i.test(pushOutput) },
    mastraBootstrap: { api: '@mastra/pg PostgresStore.init()', separateDatabase: true, exit: 0 },
    dockerInventoryUnchanged: true, paidCalls: 0, productionAccess: false, browserScenarios: 'NOT_RUN', realProviderQuality: 'NOT_RUN' };
  writeEvidence('preparation', receipt);
  process.stdout.write(`${JSON.stringify({ result: receipt.result, stand: file, seedReadback: receipt.seedReadback, route: receipt.route, paidCalls: 0 })}\n`);
}
async function inspect() {
  const stand = loadStand();
  process.stdout.write(`${JSON.stringify({ owner: stand.owner, databases: stand.databases, actors: stand.actors.map(({ label, organizationId, userId, avatarId }) => ({ label, organizationId, userId, avatarId })), route: stand.route, urls: { backend: stand.env.NEXT_PUBLIC_BACKEND_URL, frontend: stand.env.FRONTEND_URL } })}\n`);
}
module.exports = { root, stage, OWNER, loadStand, installEnv, loadTs, writePrivate, writeEvidence, sha, safe, secrets, arg, command, portFree };
if (require.main === module) {
  const action = process.argv[2];
  (action === 'prepare' ? prepare() : action === 'inspect' ? inspect() : Promise.reject(new Error('Use prepare or inspect.')))
    .catch(error => { process.stderr.write(`${safe(error.message)}\n`); process.exitCode = 1; });
}
