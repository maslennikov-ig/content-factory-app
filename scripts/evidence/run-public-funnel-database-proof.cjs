#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHmac, randomUUID } = require('node:crypto');

process.env.TS_NODE_PROJECT ||= path.resolve('tsconfig.json');
process.env.TS_NODE_COMPILER_OPTIONS ||= JSON.stringify({ module: 'commonjs' });
require('ts-node/register/transpile-only');
require('tsconfig-paths/register');
require('reflect-metadata');

const { Client } = require('pg');
const { PrismaClient, Provider } = require('@prisma/client');
const { Test } = require('@nestjs/testing');
const { Module, ValidationPipe } = require('@nestjs/common');
const { ThrottlerModule } = require('@nestjs/throttler');

const root = path.resolve(__dirname, '../..');
const args = process.argv.slice(2);
const evidenceFlag = args.indexOf('--evidence-dir');
if (evidenceFlag < 0 || !args[evidenceFlag + 1]) {
  throw new Error('Usage: run-public-funnel-database-proof.cjs --evidence-dir DIR');
}
const evidenceDir = path.resolve(args[evidenceFlag + 1]);
const allowedEvidenceRoot = path.join(
  root,
  '.codex/stages/content-factory-next-or3/evidence/public-funnel-runtime'
);
if (
  evidenceDir !== allowedEvidenceRoot &&
  !evidenceDir.startsWith(`${allowedEvidenceRoot}${path.sep}`)
) {
  throw new Error(`Evidence directory is outside the assigned write zone: ${evidenceDir}`);
}

const runId = `cf-public-funnel-${process.pid}-${randomUUID().slice(0, 8)}`;
const resources = {
  container: `${runId}-postgres`,
  volume: `${runId}-data`,
  network: `${runId}-network`,
};
const resourceLabel = `content-factory.public-funnel-proof=${runId}`;
const postgresPassword = `proof-${randomUUID()}`;
const databaseName = 'content_factory_proof';
const checks = [];
const created = { container: false, volume: false, network: false };
let app;
let prisma;
let pg;
let phase = 'initialization';
let cleanupEvidence = {
  status: 'FAIL',
  containers: [resources.container],
  volumes: [resources.volume],
  networks: [resources.network],
};

function command(command, commandArgs, options = {}) {
  return execFileSync(command, commandArgs, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  }).trim();
}

function writeJson(name, value) {
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(
    path.join(evidenceDir, name),
    `${JSON.stringify(value, null, 2)}\n`,
    'utf8'
  );
}

async function check(name, proof) {
  const details = await proof();
  checks.push({ name, status: 'PASS', details });
  return details;
}

function dockerList(kind) {
  const specs = {
    container: ['ps', '-a', '--filter', `label=${resourceLabel}`, '--format', '{{.Names}}'],
    volume: ['volume', 'ls', '--filter', `label=${resourceLabel}`, '--format', '{{.Name}}'],
    network: ['network', 'ls', '--filter', `label=${resourceLabel}`, '--format', '{{.Name}}'],
  };
  const output = command('docker', specs[kind]);
  return output ? output.split('\n').filter(Boolean) : [];
}

/**
 * The proof never asks for Redis, but the backend services it loads through
 * ts-node reach `libraries/nestjs-libraries/src/redis/redis.service.ts`, which
 * opens one shared ioredis connection at module load whenever REDIS_URL is set.
 * That socket outlives every check: the run passes, writes its summary, and
 * then sits on an event loop that never empties, so the caller kills it on a
 * timeout and a healthy funnel reads as a broken one. Close what the load
 * opened. `disconnect()` rather than `quit()` because quit waits for a server
 * that may not be there, which is the same hang under a politer name.
 */
function closeSharedRedis() {
  let modulePath;
  try {
    modulePath = require.resolve(
      '../../libraries/nestjs-libraries/src/redis/redis.service.ts'
    );
  } catch {
    return 'not resolvable';
  }
  const loaded = require.cache[modulePath];
  if (!loaded) return 'not loaded';
  const client = loaded.exports && loaded.exports.ioRedis;
  if (!client || typeof client.disconnect !== 'function') return 'in-memory stub';
  client.disconnect();
  return 'disconnected';
}

async function cleanup() {
  if (app) {
    await app.close().catch(() => undefined);
    app = undefined;
  }
  if (prisma) {
    await prisma.$disconnect().catch(() => undefined);
    prisma = undefined;
  }
  if (pg) {
    await pg.end().catch(() => undefined);
    pg = undefined;
  }
  const sharedRedis = closeSharedRedis();
  if (created.container) {
    try {
      command('docker', ['rm', '-f', resources.container]);
    } catch {}
    created.container = false;
  }
  if (created.volume) {
    try {
      command('docker', ['volume', 'rm', resources.volume]);
    } catch {}
    created.volume = false;
  }
  if (created.network) {
    try {
      command('docker', ['network', 'rm', resources.network]);
    } catch {}
    created.network = false;
  }

  cleanupEvidence = {
    status: 'PASS',
    containers: dockerList('container'),
    volumes: dockerList('volume'),
    networks: dockerList('network'),
    sharedRedis,
  };
  if (
    cleanupEvidence.containers.length ||
    cleanupEvidence.volumes.length ||
    cleanupEvidence.networks.length
  ) {
    cleanupEvidence.status = 'FAIL';
  }
  writeJson('cleanup.json', cleanupEvidence);
}

const fixtureSql = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TYPE "Provider" AS ENUM ('LOCAL', 'GITHUB', 'GOOGLE', 'FARCASTER', 'WALLET', 'GENERIC', 'TELEGRAM');
CREATE TYPE "Role" AS ENUM ('SUPERADMIN', 'ADMIN', 'USER');
CREATE TYPE "ShortLinkPreference" AS ENUM ('ASK', 'YES', 'NO');
CREATE TYPE "AiUsageMode" AS ENUM ('included', 'workspace_key');

CREATE TABLE "Organization" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "apiKey" TEXT,
  "paymentId" TEXT,
  "streakSince" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "allowTrial" BOOLEAN NOT NULL DEFAULT false,
  "isTrailing" BOOLEAN NOT NULL DEFAULT false,
  "shortlink" "ShortLinkPreference" NOT NULL DEFAULT 'ASK'
);

CREATE TABLE "Media" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "name" TEXT NOT NULL,
  "originalName" TEXT,
  "path" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL REFERENCES "Organization"("id"),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  "fileSize" INTEGER NOT NULL DEFAULT 0,
  "type" TEXT NOT NULL DEFAULT 'image',
  "thumbnail" TEXT,
  "alt" TEXT,
  "thumbnailTimestamp" INTEGER
);

CREATE TABLE "User" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "email" TEXT NOT NULL,
  "password" TEXT,
  "providerName" "Provider" NOT NULL,
  "name" TEXT,
  "lastName" TEXT,
  "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false,
  "bio" TEXT,
  "audience" INTEGER NOT NULL DEFAULT 0,
  "pictureId" TEXT,
  "providerId" TEXT,
  "timezone" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "lastReadNotifications" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "inviteId" TEXT,
  "activated" BOOLEAN NOT NULL DEFAULT true,
  "account" TEXT,
  "connectedAccount" BOOLEAN NOT NULL DEFAULT false,
  "lastOnline" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ip" TEXT,
  "agent" TEXT,
  "sendSuccessEmails" BOOLEAN NOT NULL DEFAULT true,
  "sendFailureEmails" BOOLEAN NOT NULL DEFAULT true,
  "sendStreakEmails" BOOLEAN NOT NULL DEFAULT true,
  "newsletterConsentAt" TIMESTAMP(3),
  "newsletterConsentSource" TEXT,
  "newsletterDeliveryPendingAt" TIMESTAMP(3),
  "newsletterDeliveredAt" TIMESTAMP(3),
  "newsletterDeliveryLeaseId" TEXT,
  "newsletterDeliveryLeaseExpiresAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "User_email_providerName_key" ON "User"("email", "providerName");

CREATE TABLE "UserIdentity" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "provider" "Provider" NOT NULL,
  "providerIdentifier" TEXT NOT NULL,
  "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "UserIdentity_provider_providerIdentifier_key" ON "UserIdentity"("provider", "providerIdentifier");

CREATE TABLE "UserOrganization" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL REFERENCES "User"("id"),
  "organizationId" TEXT NOT NULL REFERENCES "Organization"("id"),
  "disabled" BOOLEAN NOT NULL DEFAULT false,
  "role" "Role" NOT NULL DEFAULT 'USER',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "UserOrganization_userId_organizationId_key" ON "UserOrganization"("userId", "organizationId");

CREATE TABLE "Tags" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "name" TEXT NOT NULL,
  "color" TEXT NOT NULL,
  "orgId" TEXT NOT NULL REFERENCES "Organization"("id"),
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "AiProviderSetting" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" TEXT NOT NULL UNIQUE REFERENCES "Organization"("id") ON DELETE CASCADE,
  "provider" TEXT NOT NULL DEFAULT 'openai',
  "usageMode" "AiUsageMode" NOT NULL DEFAULT 'workspace_key',
  "apiKey" TEXT,
  "textModel" TEXT,
  "imageModel" TEXT,
  "searchEnabled" BOOLEAN NOT NULL DEFAULT false,
  "searchProvider" TEXT NOT NULL DEFAULT 'tavily',
  "searchApiKey" TEXT,
  "searchTopic" TEXT NOT NULL DEFAULT 'general',
  "searchDepth" TEXT NOT NULL DEFAULT 'advanced',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "ProductEvent" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "properties" JSONB NOT NULL,
  "deduplicationKey" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ProductEvent_organizationId_deduplicationKey_key" ON "ProductEvent"("organizationId", "deduplicationKey");

CREATE TABLE "PublicGrowthDaily" (
  "id" TEXT PRIMARY KEY,
  "day" DATE NOT NULL,
  "name" TEXT NOT NULL,
  "locale" TEXT NOT NULL DEFAULT '',
  "widthRange" TEXT NOT NULL DEFAULT '',
  "uiVersion" TEXT NOT NULL DEFAULT '',
  "demoStep" TEXT NOT NULL DEFAULT '',
  "count" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "PublicGrowthDaily_day_name_locale_widthRange_uiVersion_demoStep_key"
  ON "PublicGrowthDaily"("day", "name", "locale", "widthRange", "uiVersion", "demoStep");
CREATE INDEX "PublicGrowthDaily_name_day_idx" ON "PublicGrowthDaily"("name", "day");

CREATE TABLE "PublicGrowthTrustedEvent" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "deduplicationKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "PublicGrowthTrustedEvent_name_deduplicationKey_key"
  ON "PublicGrowthTrustedEvent"("name", "deduplicationKey");
CREATE INDEX "PublicGrowthTrustedEvent_createdAt_idx" ON "PublicGrowthTrustedEvent"("createdAt");
`;

async function waitForPostgres(databaseUrl) {
  let lastError;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const probe = new Client({ connectionString: databaseUrl });
    try {
      await probe.connect();
      await probe.query('SELECT 1');
      await probe.end();
      return;
    } catch (error) {
      lastError = error;
      await probe.end().catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw lastError || new Error('PostgreSQL did not become ready');
}

async function queryCounts() {
  const result = await pg.query(`
    SELECT
      (SELECT count(*)::int FROM "User") AS users,
      (SELECT count(*)::int FROM "Organization") AS organizations,
      (SELECT count(*)::int FROM "Tags") AS tags
  `);
  return result.rows[0];
}

async function exerciseEmailFirstStepOne() {
  const ts = require('typescript');
  const React = require('react');
  const { JSDOM } = require('jsdom');
  const componentPath = path.join(
    root,
    'apps/frontend/src/components/public-saas/email-first-signup.tsx'
  );
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost:4200/product',
    pretendToBeVisual: true,
  });
  const previous = {};
  for (const key of ['window', 'document', 'navigator']) {
    previous[key] = global[key];
    Object.defineProperty(global, key, {
      configurable: true,
      value: key === 'window' ? dom.window : dom.window[key],
    });
  }
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const testing = require('@testing-library/react');
  let registerCalls = 0;
  let telemetryCalls = 0;
  const compiled = ts.transpileModule(fs.readFileSync(componentPath, 'utf8'), {
    fileName: componentPath,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const loaded = { exports: {} };
  const mocks = {
    '@contentfactory/helpers/utils/custom.fetch': {
      useFetch: () => async () => {
        registerCalls += 1;
        return { status: 500, headers: new Headers() };
      },
    },
    '@contentfactory/react/form/input': {
      Input: ({ label, standalone: _standalone, fieldClassName: _field, ...props }) =>
        React.createElement('label', {}, label, React.createElement('input', { 'aria-label': label, ...props })),
    },
    '@contentfactory/react/form/button': {
      Button: ({ loading, children, ...props }) =>
        React.createElement('button', { ...props, disabled: loading }, children),
    },
    './public-copy': {
      usePublicCopy: () => (key) => ({
        emailTitle: 'Keep this workflow',
        emailBody: 'Continue with email',
        emailContinue: 'Continue',
        emailLabel: 'Email',
        passwordLabel: 'Password',
        workspaceOptional: 'Workspace name (optional)',
        createAccount: 'Create account',
        newsletterConsent: 'Newsletter',
        legalUnavailable: 'Legal unavailable',
        authOptions: 'Other auth',
        templateLegend: 'Starting point',
        templateBlank: 'Blank',
        templateBlankDescription: 'No labels',
        templateWorkflow: 'Workflow',
        templateWorkflowDescription: 'Four labels',
      }[key]),
    },
    './public-telemetry': {
      usePublicTelemetry: () => async (name) => {
        assert.equal(name, 'signup_started');
        telemetryCalls += 1;
      },
    },
    './starter-template-chooser': {
      StarterTemplateChooser: () => React.createElement('div'),
    },
    './registration-intent': { issueRegistrationIntent: () => undefined },
    '@contentfactory/nestjs-libraries/dtos/auth/starter-template': {
      isStarterTemplate: (value) => value === 'blank' || value === 'content-workflow',
    },
    '@contentfactory/react/helpers/variable.context': {
      useVariables: () => ({ termsUrl: '', privacyUrl: '' }),
    },
    '@contentfactory/helpers/auth/newsletter.consent': {
      canOfferNewsletterConsent: () => true,
    },
    '@contentfactory/frontend/components/auth/legal.notice': {
      LegalNotice: () => React.createElement('p'),
    },
    '@contentfactory/react/form/checkbox.field': {
      CheckboxField: () => React.createElement('input', { type: 'checkbox' }),
    },
    'next/navigation': { useRouter: () => ({ push: () => undefined }) },
    'next/link': ({ children, ...props }) => React.createElement('a', props, children),
  };

  try {
    new Function('require', 'module', 'exports', compiled)(
      (request) => mocks[request] ?? require(request),
      loaded,
      loaded.exports
    );
    testing.render(React.createElement(loaded.exports.EmailFirstSignup));
    testing.fireEvent.change(
      testing.screen.getByRole('textbox', { name: 'Email' }),
      { target: { value: 'step-one@example.test' } }
    );
    testing.fireEvent.click(
      testing.screen.getByRole('button', { name: 'Continue' })
    );
    assert.equal(registerCalls, 0);
    assert.equal(telemetryCalls, 1);
    assert.ok(testing.screen.getByLabelText('Password'));
    return { registerCalls, telemetryCalls, emailLocation: 'React component state' };
  } finally {
    testing.cleanup();
    dom.window.close();
    for (const key of ['window', 'document', 'navigator']) {
      if (previous[key] === undefined) delete global[key];
      else Object.defineProperty(global, key, { configurable: true, value: previous[key] });
    }
    delete global.IS_REACT_ACT_ENVIRONMENT;
  }
}

async function jsonRequest(baseUrl, route, init = {}) {
  const response = await fetch(`${baseUrl}${route}`, init);
  const text = await response.text();
  let body = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {}
  return { status: response.status, body };
}

async function main() {
  phase = 'runtime-version-check';
  fs.mkdirSync(evidenceDir, { recursive: true });
  const nodeVersion = process.version;
  const pnpmVersion = command('pnpm', ['--version']);
  assert.equal(nodeVersion, 'v22.23.2');
  assert.equal(pnpmVersion, '10.6.1');

  command('docker', ['network', 'create', '--label', resourceLabel, resources.network]);
  created.network = true;
  command('docker', ['volume', 'create', '--label', resourceLabel, resources.volume]);
  created.volume = true;
  command('docker', [
    'run',
    '--detach',
    '--name', resources.container,
    '--label', resourceLabel,
    '--network', resources.network,
    '--publish', '127.0.0.1::5432',
    '--env', `POSTGRES_PASSWORD=${postgresPassword}`,
    '--env', `POSTGRES_DB=${databaseName}`,
    '--volume', `${resources.volume}:/var/lib/postgresql/data`,
    'postgres:17',
  ]);
  created.container = true;
  const portSpec = command('docker', ['port', resources.container, '5432/tcp']);
  const port = Number(portSpec.slice(portSpec.lastIndexOf(':') + 1));
  assert.ok(Number.isInteger(port) && port > 0);
  const databaseUrl = `postgresql://postgres:${encodeURIComponent(postgresPassword)}@127.0.0.1:${port}/${databaseName}?schema=public`;
  phase = 'postgres-tcp-readiness';
  await waitForPostgres(databaseUrl);
  pg = new Client({ connectionString: databaseUrl });
  phase = 'postgres-client-connect';
  await pg.connect();
  phase = 'postgres-fixture-ddl';
  await pg.query(fixtureSql);

  const serverVersion = (await pg.query('SHOW server_version')).rows[0].server_version;
  assert.match(serverVersion, /^17\./);
  process.env.DATABASE_URL = databaseUrl;
  process.env.NODE_ENV = 'test';
  process.env.PUBLIC_GROWTH_DEDUPE_KEY =
    'local-public-funnel-proof-hmac-key-32-bytes-minimum';
  process.env.JWT_SECRET = 'local-runtime-proof-jwt-secret-not-a-credential';
  process.env.FRONTEND_URL = 'http://127.0.0.1:4200';
  process.env.NOT_SECURED = 'true';
  delete process.env.CONTENT_FACTORY_REQUIRE_APPROVAL;
  delete process.env.DISABLE_REGISTRATION;
  delete process.env.DISALLOW_PLUS;

  prisma = new PrismaClient({
    log: [{ emit: 'event', level: 'query' }],
  });
  phase = 'prisma-connect';
  await prisma.$connect();

  const {
    PublicGrowthRepository,
  } = require('../../libraries/nestjs-libraries/src/database/prisma/public-growth/public-growth.repository.ts');
  const {
    PublicGrowthService,
  } = require('../../libraries/nestjs-libraries/src/database/prisma/public-growth/public-growth.service.ts');
  const {
    PublicGrowthEventsController,
    PublicGrowthEventsGuard,
  } = require('../../apps/backend/src/api/routes/public-growth-events.controller.ts');
  const {
    OrganizationRepository,
  } = require('../../libraries/nestjs-libraries/src/database/prisma/organizations/organization.repository.ts');
  const {
    OrganizationService,
  } = require('../../libraries/nestjs-libraries/src/database/prisma/organizations/organization.service.ts');
  const {
    UsersRepository,
  } = require('../../libraries/nestjs-libraries/src/database/prisma/users/users.repository.ts');
  const {
    UsersService,
  } = require('../../libraries/nestjs-libraries/src/database/prisma/users/users.service.ts');
  const {
    AuthService: BackendAuthService,
  } = require('../../apps/backend/src/services/auth/auth.service.ts');
  const {
    AuthProviderManager,
  } = require('../../apps/backend/src/services/auth/providers/providers.manager.ts');
  const {
    AuthProvider,
    AuthProviderAbstract,
  } = require('../../apps/backend/src/services/auth/providers.interface.ts');
  const {
    EmailService,
  } = require('../../libraries/nestjs-libraries/src/services/email.service.ts');
  const { AuthController } = require('../../apps/backend/src/api/routes/auth.controller.ts');
  const { AdminController } = require('../../apps/backend/src/api/routes/admin.controller.ts');
  const { ErrorsService } = require('../../libraries/nestjs-libraries/src/database/prisma/errors/errors.service.ts');
  const { AdminStatsService } = require('../../libraries/nestjs-libraries/src/database/prisma/admin-stats/admin-stats.service.ts');
  const { ProductEventsService } = require('../../libraries/nestjs-libraries/src/database/prisma/product-events/product-events.service.ts');

  const model = { model: prisma };
  const growthRepository = new PublicGrowthRepository(model, model);
  const growthService = new PublicGrowthService(growthRepository);
  const organizationRepository = new OrganizationRepository(model, model, model);
  const repositoryIntents = [];
  const createOrgAndUser = organizationRepository.createOrgAndUser.bind(
    organizationRepository
  );
  organizationRepository.createOrgAndUser = async (body, ...createArgs) => {
    repositoryIntents.push({
      email: body.email,
      provider: body.provider,
      starterTemplate: body.starterTemplate ?? 'blank',
      workspaceName: body.workspaceName,
    });
    return createOrgAndUser(body, ...createArgs);
  };

  const notificationBoundary = { hasEmailProvider: () => false };
  const emailBoundary = {
    hasProvider: () => false,
    sendEmail: async () => undefined,
  };
  const newsletterBoundary = {
    schedule: async () => {
      throw new Error('newsletter scheduling must not run without consent');
    },
  };
  const usersRepository = new UsersRepository(model, model);
  const usersService = new UsersService(
    usersRepository,
    organizationRepository,
    notificationBoundary
  );
  const organizationService = new OrganizationService(
    organizationRepository,
    notificationBoundary
  );
  const providerCalls = [];
  class LocalProofOAuthProvider extends AuthProviderAbstract {
    generateLink() {
      throw new Error('external OAuth link generation is outside this proof');
    }
    async getToken(code, redirectUri, callback) {
      providerCalls.push({ operation: 'getToken', code, redirectUri, callback });
      assert.equal(code, 'local-oauth-code');
      assert.equal(redirectUri, 'http://127.0.0.1:4200/oauth-proof');
      assert.deepEqual(callback, {
        state: 'local-oauth-state',
        browserState: undefined,
      });
      return 'local-oauth-provider-token';
    }
    async getUser(token) {
      providerCalls.push({ operation: 'getUser', token });
      assert.equal(token, 'local-oauth-provider-token');
      return { email: 'oauth-workflow@example.test', id: 'local-oauth-subject' };
    }
    async postRegistration(token, organizationId) {
      providerCalls.push({ operation: 'postRegistration', token, organizationId });
      assert.equal(token, 'local-oauth-provider-token');
    }
  }
  AuthProvider({ provider: Provider.GOOGLE })(LocalProofOAuthProvider);
  const localOAuthProvider = new LocalProofOAuthProvider();
  const providerManager = new AuthProviderManager({
    get(target) {
      assert.equal(target, LocalProofOAuthProvider);
      return localOAuthProvider;
    },
  });
  const authService = new BackendAuthService(
    usersService,
    organizationService,
    notificationBoundary,
    emailBoundary,
    providerManager,
    newsletterBoundary,
    growthService
  );

  class ProofModule {}
  Module({
    imports: [ThrottlerModule.forRoot({ throttlers: [{ name: 'default', ttl: 60_000, limit: 120 }] })],
    controllers: [PublicGrowthEventsController, AuthController, AdminController],
    providers: [
      PublicGrowthEventsGuard,
      { provide: PublicGrowthService, useValue: growthService },
      { provide: BackendAuthService, useValue: authService },
      { provide: EmailService, useValue: emailBoundary },
      { provide: 'PUBLIC_GROWTH_SERVICE', useValue: growthService },
      { provide: ErrorsService, useValue: {} },
      { provide: AdminStatsService, useValue: {} },
      { provide: UsersService, useValue: {} },
      { provide: ProductEventsService, useValue: {} },
    ],
  })(ProofModule);

  const moduleRef = await Test.createTestingModule({ imports: [ProofModule] }).compile();
  phase = 'nest-listen';
  app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
    })
  );
  app.use((request, _response, next) => {
    request.user = request.headers['x-proof-super-admin'] === 'true'
      ? { id: 'proof-super-admin', isSuperAdmin: true }
      : { id: 'proof-user', isSuperAdmin: false };
    next();
  });
  await app.listen(0, '127.0.0.1');
  const address = app.getHttpServer().address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const initialCounts = await queryCounts();
  phase = 'behavior-checks';
  assert.deepEqual(initialCounts, { users: 0, organizations: 0, tags: 0 });
  const stepOne = await check('email-first step one does not create account rows', async () => {
    const browserState = await exerciseEmailFirstStepOne();
    const counts = await queryCounts();
    assert.deepEqual(counts, initialCounts);
    return { browserState, counts };
  });

  await check('nested content-workflow write rolls back on tag failure', async () => {
    await pg.query(`ALTER TABLE "Tags" ADD CONSTRAINT "proof_reject_review" CHECK ("name" <> 'Review')`);
    const before = await queryCounts();
    await assert.rejects(
      organizationRepository.createOrgAndUser(
        {
          email: 'rollback@example.test',
          password: 'local-secret-rollback',
          provider: Provider.LOCAL,
          starterTemplate: 'content-workflow',
        },
        { activated: true, isSuperAdmin: false },
        '127.0.0.1',
        'runtime-proof'
      )
    );
    const after = await queryCounts();
    assert.deepEqual(after, before);
    await pg.query(`ALTER TABLE "Tags" DROP CONSTRAINT "proof_reject_review"`);
    return { before, after, injectedFailure: 'Tags CHECK rejected Review' };
  });

  let workflowOrganizationId;
  await check('step two atomically creates one workspace and four workflow tags', async () => {
    const createdOrganization = await organizationRepository.createOrgAndUser(
      {
        email: 'workflow@example.test',
        password: 'local-secret-workflow',
        provider: Provider.LOCAL,
        starterTemplate: 'content-workflow',
      },
      { activated: true, isSuperAdmin: false },
      '127.0.0.1',
      'runtime-proof'
    );
    const tags = await pg.query(
      `SELECT "name", "color" FROM "Tags" WHERE "orgId" = $1 ORDER BY array_position(ARRAY['Plan','Draft','Review','Schedule'], "name")`,
      [createdOrganization.id]
    );
    assert.deepEqual(tags.rows, [
      { name: 'Plan', color: '#7FB03A' },
      { name: 'Draft', color: '#4D7CFE' },
      { name: 'Review', color: '#F59E0B' },
      { name: 'Schedule', color: '#8B5CF6' },
    ]);
    const counts = await queryCounts();
    assert.deepEqual(counts, { users: 1, organizations: 1, tags: 4 });
    workflowOrganizationId = createdOrganization.id;
    return { organizationCreated: true, tags: tags.rows, counts };
  });

  await check('blank registration creates no template tags', async () => {
    const createdOrganization = await organizationRepository.createOrgAndUser(
      {
        email: 'blank@example.test',
        password: 'local-secret-blank',
        provider: Provider.LOCAL,
        starterTemplate: 'blank',
      },
      { activated: true, isSuperAdmin: false },
      '127.0.0.1',
      'runtime-proof'
    );
    const tagCount = Number((await pg.query(`SELECT count(*) FROM "Tags" WHERE "orgId" = $1`, [createdOrganization.id])).rows[0].count);
    assert.equal(tagCount, 0);
    return { organizationCreated: true, tagCount };
  });

  await check('duplicate registration leaves no second workspace or tag quartet', async () => {
    const before = await queryCounts();
    await assert.rejects(
      organizationRepository.createOrgAndUser(
        {
          email: 'workflow@example.test',
          password: 'local-secret-workflow',
          provider: Provider.LOCAL,
          starterTemplate: 'content-workflow',
        },
        { activated: true, isSuperAdmin: false },
        '127.0.0.1',
        'runtime-proof'
      ),
      (error) => error && error.code === 'P2002'
    );
    const after = await queryCounts();
    assert.deepEqual(after, before);
    const workflowTagCount = Number((await pg.query(`SELECT count(*) FROM "Tags" WHERE "orgId" = $1`, [workflowOrganizationId])).rows[0].count);
    assert.equal(workflowTagCount, 4);
    return { before, after, workflowTagCount };
  });

  const authEvidence = {
    boundary: {
      controller: 'AuthController',
      authService: 'AuthService',
      organizationService: 'OrganizationService',
      organizationRepository: 'OrganizationRepository',
      persistence: 'PrismaClient/PostgreSQL',
      oauthProvider: 'strict local in-process stub',
      externalCalls: 0,
    },
  };
  const authPost = (route, body) =>
    jsonRequest(baseUrl, route, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'public-funnel-runtime-proof',
      },
      body: JSON.stringify(body),
    });
  const registrationRows = async (email) => {
    const result = await pg.query(
      `SELECT o."id", o."name", u."providerName"::text AS "provider"
       FROM "User" u
       JOIN "UserOrganization" uo ON uo."userId" = u."id"
       JOIN "Organization" o ON o."id" = uo."organizationId"
       WHERE u."email" = $1`,
      [email]
    );
    assert.equal(result.rowCount, 1);
    const tags = await pg.query(
      `SELECT "name", "color" FROM "Tags" WHERE "orgId" = $1
       ORDER BY array_position(ARRAY['Plan','Draft','Review','Schedule'], "name")`,
      [result.rows[0].id]
    );
    return { ...result.rows[0], tags: tags.rows };
  };
  const workflowTags = [
    { name: 'Plan', color: '#7FB03A' },
    { name: 'Draft', color: '#4D7CFE' },
    { name: 'Review', color: '#F59E0B' },
    { name: 'Schedule', color: '#8B5CF6' },
  ];

  await check(
    'LOCAL registration applies the selected workflow through POST /auth/register',
    async () => {
      const intentIndex = repositoryIntents.length;
      const response = await authPost('/auth/register', {
        email: 'local-http-workflow@example.test',
        password: 'local-http-password-12',
        provider: 'LOCAL',
        providerToken: '',
        workspaceName: 'LOCAL HTTP Workflow',
        starterTemplate: 'content-workflow',
        subscribeToNewsletter: false,
      });
      assert.deepEqual(response, { status: 200, body: { register: true } });
      const persisted = await registrationRows(
        'local-http-workflow@example.test'
      );
      assert.deepEqual(persisted.tags, workflowTags);
      assert.deepEqual(repositoryIntents[intentIndex], {
        email: 'local-http-workflow@example.test',
        provider: 'LOCAL',
        starterTemplate: 'content-workflow',
        workspaceName: 'LOCAL HTTP Workflow',
      });
      authEvidence.local = {
        status: response.status,
        organizationCreated: true,
        tagCount: persisted.tags.length,
        repositoryIntent: repositoryIntents[intentIndex],
      };
      return authEvidence.local;
    }
  );

  await check(
    'OAuth callback token applies the selected workflow through POST /auth/register',
    async () => {
      const callback = await authPost('/auth/oauth/GOOGLE/exists', {
        code: 'local-oauth-code',
        redirect_uri: 'http://127.0.0.1:4200/oauth-proof',
        state: 'local-oauth-state',
      });
      assert.deepEqual(callback, {
        status: 201,
        body: { token: 'local-oauth-provider-token' },
      });
      const intentIndex = repositoryIntents.length;
      const registration = await authPost('/auth/register', {
        provider: 'GOOGLE',
        providerToken: callback.body.token,
        workspaceName: 'OAuth HTTP Workflow',
        starterTemplate: 'content-workflow',
        subscribeToNewsletter: false,
      });
      assert.deepEqual(registration, {
        status: 200,
        body: { register: true },
      });
      const persisted = await registrationRows(
        'oauth-workflow@example.test'
      );
      assert.deepEqual(persisted.tags, workflowTags);
      assert.deepEqual(repositoryIntents[intentIndex], {
        email: 'oauth-workflow@example.test',
        provider: 'GOOGLE',
        starterTemplate: 'content-workflow',
        workspaceName: 'OAuth HTTP Workflow',
      });
      assert.deepEqual(
        providerCalls.map(({ operation }) => operation),
        ['getToken', 'getUser', 'getUser', 'postRegistration']
      );
      authEvidence.oauth = {
        callbackStatus: callback.status,
        registrationStatus: registration.status,
        organizationCreated: true,
        tagCount: persisted.tags.length,
        repositoryIntent: repositoryIntents[intentIndex],
        providerOperations: providerCalls.map(({ operation }) => operation),
      };
      return authEvidence.oauth;
    }
  );

  await check(
    'blank and omitted starter intent accept an omitted workspace',
    async () => {
      const blank = await authPost('/auth/register', {
        email: 'local-http-blank@example.test',
        password: 'local-http-password-12',
        provider: 'LOCAL',
        providerToken: '',
        starterTemplate: 'blank',
        subscribeToNewsletter: false,
      });
      const omitted = await authPost('/auth/register', {
        email: 'local-http-omitted@example.test',
        password: 'local-http-password-12',
        provider: 'LOCAL',
        providerToken: '',
        subscribeToNewsletter: false,
      });
      assert.equal(blank.status, 200);
      assert.equal(omitted.status, 200);
      const blankPersisted = await registrationRows(
        'local-http-blank@example.test'
      );
      const omittedPersisted = await registrationRows(
        'local-http-omitted@example.test'
      );
      assert.equal(blankPersisted.name, 'Workspace');
      assert.equal(omittedPersisted.name, 'Workspace');
      assert.deepEqual(blankPersisted.tags, []);
      assert.deepEqual(omittedPersisted.tags, []);
      authEvidence.blankOmitted = {
        blankStatus: blank.status,
        omittedStatus: omitted.status,
        blankTagCount: 0,
        omittedTagCount: 0,
        workspaceNames: [blankPersisted.name, omittedPersisted.name],
      };
      return authEvidence.blankOmitted;
    }
  );

  await check(
    'global DTO validation rejects unsupported and multi-valued starter intent',
    async () => {
      const before = await queryCounts();
      const intentCount = repositoryIntents.length;
      const unsupported = await authPost('/auth/register', {
        email: 'invalid-http-template@example.test',
        password: 'local-http-password-12',
        provider: 'LOCAL',
        providerToken: '',
        starterTemplate: 'content-calendar',
      });
      const multiValue = await authPost('/auth/register', {
        email: 'multi-http-template@example.test',
        password: 'local-http-password-12',
        provider: 'LOCAL',
        providerToken: '',
        starterTemplate: ['blank', 'content-workflow'],
      });
      assert.equal(unsupported.status, 400);
      assert.equal(multiValue.status, 400);
      assert.deepEqual(await queryCounts(), before);
      assert.equal(repositoryIntents.length, intentCount);
      authEvidence.validation = {
        unsupportedStatus: unsupported.status,
        multiValueStatus: multiValue.status,
        repositoryCalls: 0,
        countsUnchanged: true,
      };
      return authEvidence.validation;
    }
  );

  await check(
    'LOCAL duplicate and OAuth replay leave workspace and tag counts unchanged',
    async () => {
      const before = await queryCounts();
      const intentCount = repositoryIntents.length;
      const localDuplicate = await authPost('/auth/register', {
        email: 'local-http-workflow@example.test',
        password: 'local-http-password-12',
        provider: 'LOCAL',
        providerToken: '',
        starterTemplate: 'content-workflow',
      });
      const oauthCallbackReplay = await authPost(
        '/auth/oauth/GOOGLE/exists',
        {
          code: 'local-oauth-code',
          redirect_uri: 'http://127.0.0.1:4200/oauth-proof',
          state: 'local-oauth-state',
        }
      );
      const oauthRegisterReplay = await authPost('/auth/register', {
        provider: 'GOOGLE',
        providerToken: 'local-oauth-provider-token',
        starterTemplate: 'content-workflow',
      });
      assert.equal(localDuplicate.status, 400);
      assert.deepEqual(oauthCallbackReplay, {
        status: 200,
        body: { login: true },
      });
      assert.deepEqual(oauthRegisterReplay, {
        status: 200,
        body: { register: true },
      });
      assert.deepEqual(await queryCounts(), before);
      assert.equal(repositoryIntents.length, intentCount);
      authEvidence.replay = {
        localStatus: localDuplicate.status,
        oauthCallbackStatus: oauthCallbackReplay.status,
        oauthRegisterStatus: oauthRegisterReplay.status,
        countsUnchanged: true,
        repositoryCalls: 0,
      };
      return authEvidence.replay;
    }
  );

  const httpEvidence = {};
  await check('real Nest public event route enforces validation allowlist and rate limit', async () => {
    const post = (body) => jsonRequest(baseUrl, '/public-growth-events/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const accepted = await post({
      name: 'demo_started',
      locale: 'en',
      widthRange: 'wide',
      uiVersion: 'public-demo-v1',
      demoStep: 'review',
    });
    assert.deepEqual(accepted, { status: 202, body: { accepted: true } });
    const extraField = await post({ name: 'landing_view', email: 'blocked@example.test' });
    const forbiddenName = await post({ name: 'registration_completed' });
    assert.equal(extraField.status, 400);
    assert.equal(forbiddenName.status, 400);

    const statuses = [accepted.status, extraField.status, forbiddenName.status];
    while (!statuses.includes(429) && statuses.length < 125) {
      statuses.push((await post({ name: 'landing_view' })).status);
    }
    assert.equal(statuses[119], 202);
    assert.equal(statuses[120], 429);
    httpEvidence.publicEvent = {
      accepted,
      extraField,
      forbiddenName,
      requestsBeforeThrottle: 120,
      throttledStatus: statuses[120],
    };
    return httpEvidence.publicEvent;
  });

  const rawTrustedKey = 'registration_completed:private-workspace-id';
  let expectedRegistrationAggregate = 0;
  // The daily aggregate is bucketed by UTC day, and the public event route
  // buckets by the day the run actually happens. Pinning the trusted receipts
  // and the report window to a written-out date made the proof agree with
  // itself for exactly one day: on 2026-08-22 the route wrote to the new day
  // while the report still asked for the old one, and a working funnel
  // reported demo_started = 0. The day the run happens is the only day all
  // three can agree on.
  const proofDay = new Date().toISOString().slice(0, 10);
  const proofInstant = new Date(`${proofDay}T12:00:00.000Z`);
  const reportWindow = `/admin/public-growth-report?from=${proofDay}&to=${proofDay}`;
  await check('trusted growth receipt is HMAC-only and deduplicated in PostgreSQL', async () => {
    const now = proofInstant;
    const beforeAggregate = Number(
      (
        await pg.query(
          `SELECT coalesce(sum("count"), 0)::int AS "count" FROM "PublicGrowthDaily" WHERE "name" = 'registration_completed'`
        )
      ).rows[0].count
    );
    const first = await growthService.recordTrusted('registration_completed', rawTrustedKey, now);
    const duplicate = await growthService.recordTrusted('registration_completed', rawTrustedKey, now);
    assert.deepEqual(first, { recorded: true });
    assert.deepEqual(duplicate, { recorded: false });
    const expectedHmac = createHmac(
      'sha256',
      process.env.PUBLIC_GROWTH_DEDUPE_KEY
    )
      .update('content-factory/public-growth/trusted-dedupe/v1\0')
      .update(rawTrustedKey)
      .digest('hex');
    const receipts = await pg.query(
      `SELECT "name", "deduplicationKey" FROM "PublicGrowthTrustedEvent" WHERE "deduplicationKey" = $1`,
      [expectedHmac]
    );
    assert.equal(receipts.rowCount, 1);
    assert.equal(receipts.rows[0].deduplicationKey, expectedHmac);
    assert.ok(!JSON.stringify(receipts.rows).includes('private-workspace-id'));
    expectedRegistrationAggregate = Number(
      (
        await pg.query(
          `SELECT coalesce(sum("count"), 0)::int AS "count" FROM "PublicGrowthDaily" WHERE "name" = 'registration_completed'`
        )
      ).rows[0].count
    );
    assert.equal(expectedRegistrationAggregate, beforeAggregate + 1);
    return {
      first,
      duplicate,
      receiptCount: receipts.rowCount,
      receiptFormat: 'sha256-hmac-hex',
      rawKeyStored: false,
      aggregateBefore: beforeAggregate,
      aggregateCount: expectedRegistrationAggregate,
    };
  });

  await check('trusted receipt and aggregate roll back together', async () => {
    await pg.query(`ALTER TABLE "PublicGrowthDaily" ADD CONSTRAINT "proof_reject_workspace_activated" CHECK ("name" <> 'workspace_activated')`);
    await assert.rejects(
      growthService.recordTrusted(
        'workspace_activated',
        'workspace_activated:rollback-private-id',
        proofInstant
      )
    );
    const receiptCount = Number((await pg.query(`SELECT count(*) FROM "PublicGrowthTrustedEvent" WHERE "name" = 'workspace_activated'`)).rows[0].count);
    const aggregateCount = Number((await pg.query(`SELECT count(*) FROM "PublicGrowthDaily" WHERE "name" = 'workspace_activated'`)).rows[0].count);
    assert.equal(receiptCount, 0);
    assert.equal(aggregateCount, 0);
    await pg.query(`ALTER TABLE "PublicGrowthDaily" DROP CONSTRAINT "proof_reject_workspace_activated"`);
    return { receiptCount, aggregateCount };
  });

  const aggregateQueries = [];
  prisma.$on('query', (event) => {
    if (event.query.includes('PublicGrowthDaily')) aggregateQueries.push(event.query);
  });
  await check('admin HTTP report rejects non-super-admin before data access', async () => {
    const beforeQueries = aggregateQueries.length;
    const response = await jsonRequest(
      baseUrl,
      reportWindow
    );
    assert.equal(response.status, 400);
    assert.equal(aggregateQueries.length, beforeQueries);
    httpEvidence.nonSuperAdminReport = response;
    return { status: response.status, aggregateQueries: 0 };
  });

  await check('super-admin HTTP report reads real aggregates and exposes only fixed totals and ratios', async () => {
    const response = await jsonRequest(
      baseUrl,
      reportWindow,
      { headers: { 'x-proof-super-admin': 'true' } }
    );
    assert.equal(response.status, 200);
    assert.deepEqual(Object.keys(response.body).sort(), ['ratios', 'totals']);
    assert.deepEqual(Object.keys(response.body.totals).sort(), [
      'demo_completed',
      'demo_started',
      'landing_view',
      'registration_completed',
      'signup_started',
      'workspace_activated',
    ]);
    assert.deepEqual(Object.keys(response.body.ratios).sort(), [
      'demo_completed_per_demo_started',
      'demo_started_per_landing_view',
      'registration_completed_per_signup_started',
      'signup_started_per_landing_view',
      'workspace_activated_per_registration_completed',
    ]);
    assert.equal(response.body.totals.demo_started, 1);
    assert.equal(
      response.body.totals.registration_completed,
      expectedRegistrationAggregate
    );
    assert.ok(response.body.totals.landing_view > 0);
    assert.doesNotMatch(
      JSON.stringify(response.body),
      /receipt|dedup|organization|user.?id|visitor|ip|referrer|user.?agent|locale|widthRange|uiVersion|demoStep/i
    );
    httpEvidence.superAdminReport = response;
    return response;
  });

  const storedRows = await pg.query(`
    SELECT "day"::text, "name", "locale", "widthRange", "uiVersion", "demoStep", "count"
    FROM "PublicGrowthDaily"
    ORDER BY "name", "locale", "widthRange", "uiVersion", "demoStep"
  `);
  const databaseEvidence = {
    postgres: serverVersion,
    stepOne,
    finalAccountCounts: await queryCounts(),
    publicGrowthDaily: storedRows.rows,
    trustedReceiptColumns: ['name', 'deduplicationKey'],
    trustedRawKeyStored: false,
  };
  assert.ok(
    databaseEvidence.publicGrowthDaily.every((row) =>
      ['landing_view', 'demo_started', 'registration_completed'].includes(row.name)
    )
  );
  writeJson('http.json', httpEvidence);
  writeJson('auth.json', authEvidence);
  writeJson('database.json', databaseEvidence);
  writeJson('environment.json', {
    node: nodeVersion,
    pnpm: pnpmVersion,
    postgres: serverVersion,
    postgresImage: 'postgres:17',
    dockerServer: command('docker', ['version', '--format', '{{.Server.Version}}']),
    prohibitedCommands: [],
  });
}

(async () => {
  let failure;
  try {
    await main();
  } catch (error) {
    failure = error;
  }

  try {
    await cleanup();
  } catch (error) {
    failure ||= error;
  }

  const summary = {
    schemaVersion: 'public-funnel-runtime-proof/v1',
    status: failure || cleanupEvidence.status !== 'PASS' ? 'FAIL' : 'PASS',
    skipped: 0,
    runtime: {
      node: process.version,
      pnpm: (() => {
        try { return command('pnpm', ['--version']); } catch { return 'unavailable'; }
      })(),
      postgres: '17',
    },
    checks,
    cleanup: cleanupEvidence,
    failure: failure
      ? {
          name: failure.name,
          message: failure.message,
          code: failure.code,
          phase,
        }
      : null,
  };
  writeJson('summary.json', summary);
  process.stdout.write(`${JSON.stringify(summary)}\n`);
  if (summary.status !== 'PASS') process.exitCode = 1;

  // The work is over; anything still holding the event loop open is a leak the
  // next reader deserves to see by name. Without this, a leak reappears as the
  // caller's timeout — a red run with nothing to read in it. The timer is
  // unref'd, so a clean run exits before it ever fires.
  const drain = setTimeout(() => {
    const leaked = process
      ._getActiveHandles()
      .filter((handle) => handle !== drain);
    if (!leaked.length) return;
    const described = leaked.map((handle) => ({
      type: handle.constructor ? handle.constructor.name : typeof handle,
      remoteAddress: handle.remoteAddress,
      remotePort: handle.remotePort,
      readyState: handle.readyState,
    }));
    fs.writeSync(
      2,
      `Proof finished, but ${leaked.length} handle(s) still hold the event loop open: ${JSON.stringify(described)}\n`
    );
    process.exit(1);
  }, 5_000);
  drain.unref();
})();
