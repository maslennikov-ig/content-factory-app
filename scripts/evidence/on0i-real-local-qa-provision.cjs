#!/usr/bin/env node
'use strict';

// Explicit user authority is required for the from-server read. No server write.
const qa = require('./on0i-real-local-qa.cjs');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

async function persistOriginal(stand) {
  const file = qa.arg('--credentials-file', path.join(stand.privateDir, 'server-effective-ai.json'));
  if (fs.statSync(file).mode & 0o077) throw new Error('The authorized credentials file must be private.');
  const input = JSON.parse(fs.readFileSync(file, 'utf8'));
  const config = input.config || input;
  const localEnv = require('dotenv').parse(fs.readFileSync(qa.arg('--local-env')));
  const org = qa.arg('--target-org');
  const url = new URL(localEnv.DATABASE_URL);
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.port !== '5433' || url.pathname !== '/cf-dev-db'
      || !org || !/^[a-f0-9-]{36}$/i.test(org) || org !== stand.authorizedOriginalLocalOrganizationId) {
    throw new Error('Original local provisioning requires the private authorized organization marker and localhost:5433/cf-dev-db.');
  }
  const directory = path.join(process.env.HOME, '.config/content-factory');
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 }); fs.chmodSync(directory, 0o700);
  const durable = path.join(directory, 'local-ai.json');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  if (fs.existsSync(durable)) {
    fs.copyFileSync(durable, path.join(directory, `local-ai.before-${stamp}.json`));
    fs.chmodSync(path.join(directory, `local-ai.before-${stamp}.json`), 0o600);
  }
  qa.writePrivate(durable, input);
  qa.secrets.add(config.apiKey); Object.values(config.search?.apiKeys || {}).forEach(value => qa.secrets.add(value));
  qa.installEnv({ env: { DATABASE_URL: localEnv.DATABASE_URL, JWT_SECRET: localEnv.JWT_SECRET,
    AI_INCLUDED_SEARCH_PROVIDER: localEnv.AI_INCLUDED_SEARCH_PROVIDER || '',
    AI_INCLUDED_SEARCH_TASK_PROVIDERS: localEnv.AI_INCLUDED_SEARCH_TASK_PROVIDERS || '' } });
  qa.loadTs();
  const { AuthService } = require(path.join(qa.root, 'libraries/helpers/src/auth/auth.service.ts'));
  const { PrismaClient } = require('@prisma/client');
  const { loadAiConfig } = require(path.join(qa.root, 'libraries/nestjs-libraries/src/openai/ai.provider.config.ts'));
  const { providerForSearchTask } = require(path.join(qa.root, 'libraries/nestjs-libraries/src/openai/ai.search-tasks.ts'));
  const prisma = new PrismaClient();
  try {
    const old = await prisma.aiProviderSetting.findUnique({ where: { organizationId: org } });
    if (!old) throw new Error('The authorized original local organization has no existing AI row.');
    const othersBefore = await prisma.aiProviderSetting.findMany({ where: { organizationId: { not: org } }, select: { organizationId: true, updatedAt: true }, orderBy: { organizationId: 'asc' } });
    const backup = path.join(directory, `local-ai-settings.before-${stamp}.json`);
    qa.writePrivate(backup, { source: 'original-local-ai-row', organizationId: org, row: old });
    await prisma.aiProviderSetting.update({ where: { organizationId: org }, data: {
      usageMode: 'workspace_key', provider: config.provider, apiKey: AuthService.fixedEncryption(config.apiKey),
      textModel: config.textModel, imageModel: config.imageModel, roleModels: config.roleModels || {},
      searchEnabled: Boolean(config.search?.enabled), searchProvider: config.search?.provider || 'tavily',
      searchApiKey: null, searchApiKeys: Object.fromEntries(Object.entries(config.search?.apiKeys || {}).map(([engine, key]) => [engine, AuthService.fixedEncryption(key)])),
      searchTaskProviders: config.search?.taskProviders || {}, searchTopic: config.search?.topic || 'general', searchDepth: config.search?.depth || 'advanced',
    } });
    const readback = await loadAiConfig(org, requested => prisma.aiProviderSetting.findUnique({ where: { organizationId: requested } }),
      () => prisma.instanceAiDefaults.findUnique({ where: { id: 'instance' } }));
    if (readback.apiKey !== config.apiKey || !Object.entries(config.search?.apiKeys || {}).every(([engine, key]) => readback.search.apiKeys[engine] === key)) throw new Error('Original local key roundtrip failed.');
    const othersAfter = await prisma.aiProviderSetting.findMany({ where: { organizationId: { not: org } }, select: { organizationId: true, updatedAt: true }, orderBy: { organizationId: 'asc' } });
    if (JSON.stringify(othersBefore) !== JSON.stringify(othersAfter)) throw new Error('Unrelated local AI settings changed concurrently; inspect before acceptance.');
    const route = { provider: readback.provider, usageMode: readback.usageMode, textModel: readback.textModel,
      roleModels: readback.roleModels, searchEnabled: readback.search.enabled, availableSearchEngines: Object.keys(readback.search.apiKeys),
      effectiveTaskRouting: Object.fromEntries(['research', 'facts', 'discovery'].map(task => [task, providerForSearchTask(task, readback.search)])),
      keyDecryptRoundtrip: true, unrelatedAiSettingsUnchanged: true };
    qa.writeEvidence('original-local-provision', { at: new Date().toISOString(), result: 'LOCAL_ROUNDTRIP_PASS', durableCredentialsFile: durable,
      encryptedOldRowBackup: backup, route, changed: 'one existing original LOCAL AiProviderSetting row',
      originalEnvChanged: false, productionMutations: 0, providerRequests: 0 });
    process.stdout.write(`${JSON.stringify({ result: 'LOCAL_ROUNDTRIP_PASS', durableCredentialsFile: durable, encryptedOldRowBackup: backup, route, providerRequests: 0 })}\n`);
  } finally { await prisma.$disconnect(); }
}

async function main() {
  const stand = qa.loadStand();
  const action = process.argv[2];
  if (action === 'persist-original') return persistOriginal(stand);
  let config;
  let provenance;
  if (action === 'from-server') {
    if (!process.argv.includes('--authorized-server-read')) throw new Error('Current user authorization for the scoped server read must be recorded explicitly.');
    const host = qa.arg('--host');
    const org = qa.arg('--source-org');
    if (!host || !/^[A-Za-z0-9@._-]+$/.test(host) || !org || !/^[a-f0-9-]{36}$/i.test(org)) throw new Error('Supply the exact authorized SSH host and owner organization.');
    const remote = `
const output = process.stdout.write.bind(process.stdout);
for (const method of ['log','info','warn','error','debug']) console[method] = () => undefined;
process.env.TS_NODE_PROJECT = '/app/tsconfig.json';
process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module:'commonjs' });
require('ts-node/register/transpile-only'); require('tsconfig-paths/register');
const { PrismaClient } = require('@prisma/client');
const { loadAiConfig } = require('/app/libraries/nestjs-libraries/src/openai/ai.provider.config.ts');
const p = new PrismaClient();
const org = ${JSON.stringify(org)};
(async () => {
  const setting = await p.aiProviderSetting.findUnique({ where:{ organizationId:org } });
  if (!setting) throw new Error('OwnerOrganizationMissing');
  const config = await loadAiConfig(org, async requested => {
    if (requested !== org) throw new Error('ScopeMismatch'); return setting;
  }, async () => p.instanceAiDefaults.findUnique({ where:{ id:'instance' } }));
  if (!config.apiKey) throw new Error('EffectiveGenerationKeyUnavailable');
  output(JSON.stringify({ ok:true, config:{ usageMode:config.usageMode, provider:config.provider,
    apiKey:config.apiKey, baseUrl:config.baseUrl, textModel:config.textModel, imageModel:config.imageModel,
    roleModels:config.roleModels, textChain:config.textChain,
    search:{ enabled:config.search.enabled, provider:config.search.provider, apiKey:config.search.apiKey,
      apiKeys:config.search.apiKeys, taskProviders:config.search.taskProviders, topic:config.search.topic, depth:config.search.depth }
  } }));
})().catch(error => { output(JSON.stringify({ ok:false, reason:error.name==='Error'?error.message:error.name })); process.exitCode=1; }).finally(() => p.$disconnect());
`;
    const result = spawnSync('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', host, 'docker exec -i cf-next-app node'], {
      cwd: qa.root, input: remote, encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024,
    });
    if (result.status !== 0) {
      // Never include SSH/Prisma stdout or stderr: the successful payload has keys.
      throw new Error(`Scoped server read failed (exit ${result.status ?? 'timeout'}); no payload disclosed.`);
    }
    const reply = JSON.parse(result.stdout);
    if (!reply.ok || !reply.config?.apiKey) throw new Error('Scoped server read returned no usable generation configuration.');
    config = reply.config;
    stand.authorizedOriginalLocalOrganizationId = org;
    provenance = { source: 'authorized-scoped-server-read', originalUsageMode: config.usageMode, serverWrites: 0, serverJwtTransferred: false, fullEnvTransferred: false };
    qa.writePrivate(path.join(stand.privateDir, 'server-effective-ai.json'), { config, provenance });
  } else if (action === 'from-file') {
    const file = qa.arg('--credentials-file');
    const stat = file && fs.statSync(file);
    if (!stat?.isFile() || (stat.mode & 0o077)) throw new Error('Credentials must come from the authorized private file with mode 0600.');
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    config = value.config || value;
    provenance = { source: 'authorized-local-private-file', serverWrites: 0 };
  } else throw new Error('Use from-server or from-file.');
  qa.secrets.add(config.apiKey);
  Object.values(config.search?.apiKeys || {}).forEach(value => qa.secrets.add(value));
  if (!['openai', 'openrouter'].includes(config.provider) || !config.apiKey || !config.textModel) throw new Error('The effective local model configuration is incomplete.');
  qa.installEnv(stand); qa.loadTs();
  const { AuthService } = require(path.join(qa.root, 'libraries/helpers/src/auth/auth.service.ts'));
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  const searchKeys = Object.fromEntries(Object.entries(config.search?.apiKeys || {}).map(([engine, key]) => [engine, AuthService.fixedEncryption(key)]));
  try {
    await prisma.aiProviderSetting.update({ where: { organizationId: stand.actors[0].organizationId }, data: {
      usageMode: 'workspace_key', provider: config.provider, apiKey: AuthService.fixedEncryption(config.apiKey),
      textModel: config.textModel, imageModel: config.imageModel, roleModels: config.roleModels || {},
      searchEnabled: Boolean(config.search?.enabled), searchProvider: config.search?.provider || 'tavily',
      searchApiKey: null, searchApiKeys: searchKeys, searchTaskProviders: config.search?.taskProviders || {},
      searchTopic: config.search?.topic || 'general', searchDepth: config.search?.depth || 'advanced',
    } });
    // Search routing is operator-owned in the real resolver, even for own keys.
    // Only nonsecret routing enters the stand process environment.
    stand.env.AI_INCLUDED_SEARCH_PROVIDER = config.search?.provider || 'tavily';
    stand.env.AI_INCLUDED_SEARCH_TASK_PROVIDERS = JSON.stringify(config.search?.taskProviders || {});
    const { loadAiConfig } = require(path.join(qa.root, 'libraries/nestjs-libraries/src/openai/ai.provider.config.ts'));
    Object.assign(process.env, stand.env);
    const readback = await loadAiConfig(stand.actors[0].organizationId,
      org => prisma.aiProviderSetting.findUnique({ where: { organizationId: org } }));
    if (readback.apiKey !== config.apiKey || !Object.entries(config.search?.apiKeys || {}).every(([engine, key]) => readback.search.apiKeys[engine] === key)) {
      throw new Error('Reencrypted local provider configuration did not round-trip.');
    }
    stand.previousRoute = stand.route;
    stand.route = { provider: readback.provider, usageMode: readback.usageMode, textModel: readback.textModel,
      roleModels: readback.roleModels, searchEnabled: readback.search.enabled, searchProvider: readback.search.provider,
      searchTaskProviders: readback.search.taskProviders, searchEngines: Object.keys(readback.search.apiKeys),
      credentialsDecrypt: { model: true, search: Object.keys(readback.search.apiKeys).length > 0 }, provenance };
    qa.writePrivate(stand.file, stand);
    qa.writeEvidence('credentials', { at: new Date().toISOString(), result: 'LOCAL_ROUNDTRIP_PASS', route: stand.route,
      privateCredentialsFile: path.join(stand.privateDir, 'server-effective-ai.json'), productionMutations: 0,
      providerRequests: 0, originalLocalSettingsChanged: false, onlyOwnedQaSettingsChanged: true });
    process.stdout.write(`${JSON.stringify({ result: 'LOCAL_ROUNDTRIP_PASS', route: stand.route, privateCredentialsFile: path.join(stand.privateDir, 'server-effective-ai.json'), providerRequests: 0 })}\n`);
  } finally { await prisma.$disconnect(); }
}
main().catch(error => { process.stderr.write(`${qa.safe(error.message)}\n`); process.exitCode = 1; });
