#!/usr/bin/env node
'use strict';

// The real API/auth/domain/chat modules, with no Temporal registration or cron.
const qa = require('./on0i-real-local-qa.cjs');
const path = require('node:path');
const fs = require('node:fs');
const { format } = require('node:util');
const sourceFiles = [
  'libraries/nestjs-libraries/src/chat/capabilities/capability.types.ts',
  'libraries/nestjs-libraries/src/chat/capabilities/agent-parts.contract.ts',
  'libraries/nestjs-libraries/src/chat/conductor/conductor.errors.ts',
  'libraries/nestjs-libraries/src/chat/conductor/conductor.instructions.ts',
  'libraries/nestjs-libraries/src/content-intelligence/intake/intake.prompts.v12.ts',
  'libraries/nestjs-libraries/src/content-intelligence/intake/request-understanding.ts',
  'libraries/nestjs-libraries/src/chat/mastra.store.ts',
  'libraries/nestjs-libraries/src/chat/conductor/native-observability.ts',
  'libraries/nestjs-libraries/src/chat/conductor/native-run-observer.ts',
  'libraries/nestjs-libraries/src/chat/conductor/conversation-history.ts',
  'libraries/nestjs-libraries/src/chat/conductor/conductor.autonomy.ts',
  'libraries/nestjs-libraries/src/content-intelligence/pieces/piece.service.ts',
  'libraries/nestjs-libraries/src/openai/web.research.service.ts',
  'libraries/nestjs-libraries/src/chat/capabilities/catalogue/research-evidence.ts',
  'libraries/nestjs-libraries/src/chat/capabilities/catalogue/material-read.capabilities.ts',
  'libraries/nestjs-libraries/src/chat/capabilities/catalogue/piece.capabilities.ts',
  'libraries/nestjs-libraries/src/content-intelligence/intake/intake.service.ts',
  'libraries/nestjs-libraries/src/content-intelligence/intake/research-reuse.ts',
  'libraries/nestjs-libraries/src/content-intelligence/research/retained-source.ts',
  'libraries/nestjs-libraries/src/chat/conductor/conductor.skills.ts',
  'apps/backend/src/api/routes/agent.controller.ts',
  'libraries/nestjs-libraries/src/chat/mastra.service.ts',
  'libraries/nestjs-libraries/src/chat/conductor/conductor.agent.ts',
  'libraries/nestjs-libraries/src/chat/conductor/native-session-stream.ts',
  'libraries/nestjs-libraries/src/chat/conductor/native-queued-input.ts',
  'libraries/nestjs-libraries/src/chat/conductor/agent-turn-lifecycle.ts',
  'libraries/nestjs-libraries/src/chat/conductor/agent-threads.service.ts',
  'libraries/nestjs-libraries/src/chat/conductor/agent-operation-receipts.ts',
  'libraries/nestjs-libraries/src/chat/conductor/native-model-availability.ts',
  'libraries/nestjs-libraries/src/chat/capabilities/mastra.adapter.ts',
  'libraries/nestjs-libraries/src/openai/ai.clients.ts',
  'libraries/nestjs-libraries/src/openai/ai.text-chain.ts',
  'libraries/nestjs-libraries/src/openai/ai.native-retries.ts',
];
const sourceHashes = () => Object.fromEntries(sourceFiles.filter(file => fs.existsSync(path.join(qa.root, file))).map(file => [file, qa.sha(path.join(qa.root, file))]));
const sourcesAtImport = sourceHashes();
const stand = qa.loadStand();
qa.installEnv(stand);
qa.loadTs();
const providerReceiptFile = require('./on0i-real-local-qa-network.cjs').installProviderReceipts(stand);
const providerReceiptOffset = fs.readFileSync(providerReceiptFile, 'utf8').split('\n').filter(Boolean).length;
for (const actor of stand.actors) qa.secrets.add(actor.auth);
const privateAiFile = path.join(stand.privateDir, 'server-effective-ai.json');
if (fs.existsSync(privateAiFile)) {
  const config = JSON.parse(fs.readFileSync(privateAiFile, 'utf8')).config;
  qa.secrets.add(config?.apiKey);
  Object.values(config?.search?.apiKeys || {}).forEach(value => qa.secrets.add(value));
}
const runtimeLog = path.join(stand.privateDir, 'backend.log');
fs.closeSync(fs.openSync(runtimeLog, 'a', 0o600));
for (const method of ['log', 'info', 'warn', 'error', 'debug']) {
  console[method] = (...args) => fs.appendFileSync(runtimeLog, `${new Date().toISOString()} [${method}] ${qa.safe(format(...args))}\n`);
}
const lib = file => require(path.join(qa.root, 'libraries/nestjs-libraries/src', file));
const backend = file => require(path.join(qa.root, 'apps/backend/src', file));
let app;
let closing = false;

async function start() {
  await qa.portFree(Number(stand.env.PORT));
  const { Test } = require('@nestjs/testing');
  const { APP_GUARD } = require('@nestjs/core');
  const { ValidationPipe, Global, Module } = require('@nestjs/common');
  const { ThrottlerModule } = require('@nestjs/throttler');
  const { ThrottlerStorageRedisService } = require('@nest-lab/throttler-storage-redis');
  const { ioRedis } = lib('redis/redis.service.ts');
  if (await ioRedis.get(stand.redisOwnerKey) !== stand.redisOwner) throw new Error('QA Redis ownership changed.');
  // AuthService requires the real reconciliation provider. Register it without
  // ScheduleModule: its one startup scan sees only the synthetic local users.
  const { NewsletterDeliveryRetryServiceV1 } = backend('services/newsletter/newsletter-delivery-retry.service.v1.ts');
  class QaLocalSupportModule {}
  Global()(QaLocalSupportModule);
  Module({ providers: [NewsletterDeliveryRetryServiceV1], exports: [NewsletterDeliveryRetryServiceV1] })(QaLocalSupportModule);
  const moduleRef = await Test.createTestingModule({
    imports: [
      lib('database/prisma/database.module.ts').DatabaseModule,
      backend('api/api.module.ts').ApiModule,
      lib('agent/agent.module.ts').AgentModule,
      lib('3rdparties/thirdparty.module.ts').ThirdPartyModule,
      lib('videos/video.module.ts').VideoModule,
      lib('chat/chat.module.ts').ChatModule,
      QaLocalSupportModule,
      lib('temporal/temporal.module.ts').getTemporalCommandModule(),
      ThrottlerModule.forRoot({ throttlers: [{ ttl: 3600000, limit: 10000 }], storage: new ThrottlerStorageRedisService(ioRedis) }),
    ],
    providers: [
      { provide: APP_GUARD, useClass: lib('throttler/throttler.provider.ts').ThrottlerBehindProxyGuard },
      { provide: APP_GUARD, useClass: backend('services/auth/permissions/permissions.guard.ts').PoliciesGuard },
    ],
  }).compile();
  app = moduleRef.createNestApplication({ cors: backend('cors.options.ts').buildBackendCorsOptions(process.env) });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.use(['/agent/chat'], backend('api/routes/agent-chat.body.ts').createAgentChatBodyLimiter());
  app.use(require('cookie-parser')());
  const { SubscriptionExceptionFilter } = backend('services/auth/permissions/subscription.exception.ts');
  const { PostValidationExceptionFilter } = backend('api/routes/posts.validation.exception.ts');
  const { HttpExceptionFilter } = lib('services/exception.filter.ts');
  const { StripeErrorFilter } = lib('services/stripe.error.filter.ts');
  app.useGlobalFilters(new SubscriptionExceptionFilter());
  app.useGlobalFilters(new PostValidationExceptionFilter());
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalFilters(new StripeErrorFilter());
  // Separate stand never connects mail/social providers or a Temporal worker.
  app.use((req, res, next) => {
    if (/^\/(?:integrations\/.*connect|posts\/(?:publish|send)|admin|enterprise|auth\/(?:register|forgot))/i.test(req.path)) {
      return res.status(403).json({ code: 'QA_LOCAL_OUTBOUND_DISABLED' });
    }
    next();
  });
  app.getHttpAdapter().getInstance().get('/__qa/native-permissions', async (req, res) => {
    try {
      const actor = stand.actors.find(value => value.label === 'http-runner');
      const threadId = req.query.threadId;
      if (!actor || req.headers.auth !== actor.auth || req.headers.showorg !== actor.organizationId
          || typeof threadId !== 'string' || !/^[a-f0-9-]{36}$/i.test(threadId)) return res.status(403).json({ code: 'QA_SCOPE_REFUSED' });
      const { MastraService } = lib('chat/mastra.service.ts');
      const { AgentThreadsService } = lib('chat/conductor/agent-threads.service.ts');
      const { PrismaService } = lib('database/prisma/prisma.service.ts');
      const { buildConductorContext, conductorResourceId } = lib('chat/conductor/conductor.context.ts');
      const { isDurableAgent } = require('@mastra/core/agent/durable');
      const service = app.get(MastraService);
      const threads = app.get(AgentThreadsService);
      const prisma = app.get(PrismaService);
      const conductor = await service.conductor();
      const memory = await conductor.getMemory();
      const stored = await memory.getThreadById({ threadId });
      if (stored?.resourceId !== conductorResourceId(actor.organizationId, actor.userId)) return res.status(403).json({ code: 'QA_THREAD_REFUSED' });
      const organization = await prisma.organization.findUnique({ where: { id: actor.organizationId } });
      const user = await prisma.user.findUnique({ where: { id: actor.userId } });
      const member = await prisma.userOrganization.findUnique({ where: { userId_organizationId: { userId: actor.userId, organizationId: actor.organizationId } } });
      if (!organization || !user?.activated || member?.disabled || !member) return res.status(403).json({ code: 'QA_MEMBER_REFUSED' });
      const identity = backend('api/routes/agent.controller.ts').agentIdentity({ ...organization, users: [{ role: member.role }] }, user);
      const context = buildConductorContext({ identity, threadId });
      const session = await service.sessionFor(identity, threadId, { bindThread: true, requestContext: context });
      const controller = await service.controller();
      const currentAgent = controller.getCurrentAgent(session);
      const history = await threads.history(identity, threadId, { page: 0, perPage: 20 });
      let toolNames;
      try { toolNames = Object.keys(await currentAgent.listTools({ requestContext: context, resolveWebSearch: false })); }
      catch (error) { toolNames = { errorName: error.name }; }
      const pending = (history.pending || []).map(call => ({ ...call,
        policy: call.toolName ? session.resolveToolApproval(call.toolName, threadId) : null,
        gateArmed: session.approval.isArmed({ runId: call.runId, toolCallId: call.toolCallId, threadId }),
      }));
      const loaded = Object.keys(require.cache).filter(file => sourceFiles.some(source => file === path.join(qa.root, source)))
        .map(file => ({ file, currentFileSha256: qa.sha(file) }));
      const diagnostics = { at: new Date().toISOString(), pid: process.pid, threadId,
        session: { id: session.identity.getId(), ownerId: session.identity.getOwnerId(), resourceId: session.identity.getResourceId(), scope: threadId, threadId: session.thread.getId(), runIsRunning: session.run.isRunning(), streamIsActive: session.stream.isActive(), sendSignal: typeof session.sendSignal },
        permissions: session.permissions.getRules(), skillPolicy: session.resolveToolApproval('skill', threadId), pending,
        sessionDisplayError: session.displayState.get().error ?? null,
        agentThreadsIsDurable: await threads.isDurableConductor(), conductor: { id: conductor.id, isDurableAgent: isDurableAgent(conductor), observe: typeof conductor.observe, hasRunRegistry: 'runRegistry' in conductor },
        controllerAgent: { id: currentAgent.id, isDurableAgent: isDurableAgent(currentAgent), sameInstanceAsConductor: currentAgent === conductor },
        publicAgentToolNames: toolNames, sourceModules: loaded, sourceHashesAtBoot: sourcesAtImport,
        moduleResolution: Object.fromEntries(['@contentfactory/nestjs-libraries/chat/conductor/conductor.agent', '@contentfactory/nestjs-libraries/chat/mastra.service', '@contentfactory/backend/api/routes/agent.controller'].map(name => [name, require.resolve(name)])),
        execution: history.execution, providerRequestsInitiatedByDiagnostic: 0 };
      qa.writeEvidence('native-permission-diagnostic', diagnostics);
      return res.json(diagnostics);
    } catch (error) { return res.status(500).json({ errorName: error.name, message: qa.safe(error.message) }); }
  });
  await app.listen(Number(stand.env.PORT), '127.0.0.1');
  const providerRequestsDuringBootstrap = fs.readFileSync(providerReceiptFile, 'utf8').split('\n').filter(Boolean)
    .slice(providerReceiptOffset).map(line => JSON.parse(line)).filter(row => row.phase === 'started');
  qa.writePrivate(path.join(stand.privateDir, 'backend-pid.json'), { owner: qa.OWNER, pid: process.pid, script: __filename });
  qa.writeEvidence('backend-start', { at: new Date().toISOString(), result: 'STARTED', pid: process.pid,
    head: qa.command('git', ['rev-parse', 'HEAD']), scriptSha256: qa.sha(__filename),
    sourceSha256: sourceHashes(), sourceChangedDuringBootstrap: JSON.stringify(sourcesAtImport) !== JSON.stringify(sourceHashes()),
    networkObserverSha256: qa.sha(path.join(__dirname, 'on0i-real-local-qa-network.cjs')),
    backendUrl: stand.env.NEXT_PUBLIC_BACKEND_URL, actualApiModule: true, realAuthMiddleware: true,
    realPoliciesGuard: true, realPrisma: true, realMastraStore: true,
    omittedApplicationModules: ['TemporalRegisterMissingSearchAttributesModule', 'InfiniteWorkflowRegisterModule', 'AnalyticsScheduleRegisterModuleV1', 'NewsletterDeliveryRetryModuleV1', 'VoiceRetentionModule'],
    temporalAddressUnreachable: true, productionAccess: false,
    providerRequestsDuringBootstrap,
    paidCallsByBootstrap: providerRequestsDuringBootstrap.filter(row => row.scripted === false).length });
  process.stdout.write(`${JSON.stringify({ result: 'STARTED', backendUrl: stand.env.NEXT_PUBLIC_BACKEND_URL, pid: process.pid })}\n`);
}
async function close() {
  if (closing) return;
  closing = true;
  if (app) {
    await lib('temporal/temporal.module.ts').closeTemporalCommandClient(app).catch(() => undefined);
    await app.close().catch(() => undefined);
  }
  lib('redis/redis.service.ts').ioRedis.disconnect();
  await lib('chat/mastra.store.ts').closeMastraStore().catch(() => undefined);
}
for (const event of ['SIGTERM', 'SIGINT']) process.once(event, () => close().then(() => process.exit(0)));
start().catch(async error => {
  fs.appendFileSync(runtimeLog, `${new Date().toISOString()} [startup-error] ${qa.safe(error.stack || error.message)}\n`);
  process.stderr.write(`${JSON.stringify({ result: 'FAILED', message: qa.safe(error.message), privateLog: runtimeLog })}\n`);
  await close(); process.exit(1);
});
