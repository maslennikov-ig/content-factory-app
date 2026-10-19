'use strict';

/** Authorized paid evaluation. Existing runtime AiConfig enters only through a private file/stdin. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { format, isDeepStrictEqual } = require('node:util');
const REPO = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: __dirname, encoding: 'utf8' }).trim();
const { loadWithMocks } = require(path.join(REPO, 'tests/helpers/load-ts-with-mocks.cjs'));
const { loadTypeScriptModule } = require(path.join(REPO, 'tests/helpers/load-ts-module.cjs'));
const helpers = require(path.join(REPO, 'tests/helpers/agent-capabilities.cjs'));
const MODEL = 'openai/gpt-6-luna';
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const privateDir = path.join(process.env.HOME, '.local/share/content-factory-evidence', `j9p5-model-qa-${stamp}`);
fs.mkdirSync(privateDir, { recursive: true, mode: 0o700 });
const secrets = [];
let organizationId;
const mask = value => {
  let text = String(value);
  for (const secret of secrets) if (secret) text = text.split(secret).join('[REDACTED]');
  if (organizationId) text = text.split(organizationId).join('qa-organization');
  return text;
};
const safeJson = value => JSON.stringify(value, (key, item) => {
  if (/^(apiKey|apiKeys|authorization|password|headers|JWT_SECRET|DATABASE_URL)$/i.test(key)) return '[REDACTED]';
  if (typeof item === 'string') return mask(item);
  if (typeof item === 'bigint') return item.toString();
  if (item instanceof Error) return { name: item.name, message: mask(item.message), code: item.code };
  if (item instanceof Map) return [...item];
  return item;
}, 2);
const privateWrite = (name, value) => fs.writeFileSync(path.join(privateDir, name), safeJson(value) + '\n', { mode: 0o600 });
const runtimeLogs = [];
for (const key of ['log', 'info', 'debug', 'warn', 'error']) console[key] = (...args) => runtimeLogs.push(mask(format(...args)));
const stdout = value => process.stdout.write(JSON.stringify(value) + '\n');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const fileHash = file => hash(fs.readFileSync(path.join(REPO, file)));
const PREFIX = 'libraries/nestjs-libraries/src/';
const sourceFiles = [
  'chat/conductor/conductor.agent.ts', 'chat/conductor/conductor.context.ts',
  'chat/conductor/conductor.execution.ts', 'chat/conductor/conductor.instructions.ts',
  'chat/conductor/conductor.skills.ts', 'chat/capabilities/catalogue/piece.capabilities.ts',
  'chat/conductor/conductor.memory.ts', 'chat/conductor/conversation-history.ts',
  'chat/capabilities/capability.admission.ts',
  'chat/capabilities/mastra.adapter.ts', 'chat/capabilities/capability.types.ts',
  'content-intelligence/brand-voice/intake-v2.contract.ts',
  'chat/capabilities/catalogue/research.capabilities.ts', 'chat/capabilities/catalogue/material-read.capabilities.ts',
  'content-intelligence/intake/intake.service.ts', 'content-intelligence/intake/intake.prompts.v12.ts', 'content-intelligence/intake/intake.prompts.v13.ts',
  'content-intelligence/intake/request-understanding.ts', 'content-intelligence/pieces/piece.service.ts',
  'content-intelligence/intake/research-intent.ts', 'content-intelligence/intake/research-digest.v4.ts', 'content-intelligence/intake/research-digest.v5.ts',
  'content-intelligence/source-registry/source-fetch.gateway.ts', 'content-intelligence/source-registry/network-policy.ts',
  'content-intelligence/pieces/core-write.ts', 'content-intelligence/pieces/core-write-prompt.v19.ts', 'content-intelligence/pieces/core-write-prompt.v20.ts',
  'openai/web.research.service.ts', 'openai/ai.clients.ts', 'openai/ai.text-chain.ts', 'openai/ai.usage.service.ts',
].map(file => PREFIX + file);
const sourceHashes = () => Object.fromEntries(sourceFiles.map(file => [file, fileHash(file)]));

async function main() {
  const scopeFile = process.env.CF_QA_SCOPE_FILE;
  if (!scopeFile) throw new Error('CF_QA_SCOPE_FILE must name the authorized private scope helper.');
  const scopeSource = fs.readFileSync(scopeFile, 'utf8');
  const match = scopeSource.match(/(?:const|let)\s+(?:org(?:anization)?(?:Id)?|ORG_ID)\s*=\s*['"]([^'"]+)['"]/i);
  if (!match) throw new Error('The authorized private scope constant was not found.');
  organizationId = match[1];
  const runtimeFile = process.env.CF_QA_RUNTIME_CONFIG_FILE;
  const fromStdin = process.argv.includes('--runtime-config-stdin');
  if (!!runtimeFile === fromStdin) throw new Error('Provide exactly one private runtime config file or --runtime-config-stdin.');
  if (runtimeFile) {
    const stat = fs.statSync(runtimeFile);
    if (!stat.isFile() || (stat.mode & 0o077) !== 0) throw new Error('Runtime config must be a private file with mode 0600 or stricter.');
  }
  const input = JSON.parse(fs.readFileSync(fromStdin ? 0 : runtimeFile, 'utf8'));
  const resolved = input.config ?? input;
  secrets.push(resolved.apiKey, resolved.search?.apiKey, ...Object.values(resolved.search?.apiKeys || {}));
  if (resolved.usageMode !== 'included' || resolved.provider !== 'openrouter' || resolved.textModel !== MODEL || !resolved.apiKey
      || (resolved.roleModels?.agent && resolved.roleModels.agent !== MODEL) || !resolved.search) {
    throw new Error('Runtime config is not the confirmed included/OpenRouter/GPT-6 Luna route. No model call was made.');
  }
  const auth = loadWithMocks('libraries/helpers/src/auth/auth.service.ts');
  const chain = loadWithMocks(PREFIX + 'openai/ai.text-chain.ts');
  const nativeConfig = loadWithMocks(PREFIX + 'openai/ai.provider.config.ts', {
    '@contentfactory/helpers/auth/auth.service': auth,
    '@contentfactory/nestjs-libraries/openai/ai.text-chain': chain,
  });
  const config = { ...nativeConfig, loadAiConfig: async org => {
    if (org !== organizationId) throw new Error('Cross-scope runtime configuration refused.');
    return resolved;
  } };
  const usageRows = [];
  const usageDb = {
    aiProviderSetting: { findUnique: async () => null },
    instanceAiDefaults: { findUnique: async () => null },
    subscription: { findUnique: async () => ({ includedAiMonthlyOperations: 1_000, createdAt: new Date('2026-01-01T00:00:00Z') }) },
    organization: { findUnique: async () => ({ createdAt: new Date('2026-01-01T00:00:00Z') }) },
    aiUsageRecord: {
      create: async ({ data }) => { const row = { ...data, id: crypto.randomUUID(), createdAt: new Date() }; usageRows.push(row); return row; },
      update: async ({ where, data }) => { const row = usageRows.find(row => row.id === where.id); Object.assign(row, data, { updatedAt: new Date() }); return row; },
      deleteMany: async ({ where }) => { const index = usageRows.findIndex(row => row.id === where.id); if (index >= 0) usageRows.splice(index, 1); return { count: index >= 0 ? 1 : 0 }; },
      count: async () => usageRows.length,
    },
    $transaction: async work => work(usageDb),
  };
  const shared = {
    '@contentfactory/helpers/auth/auth.service': auth,
    '@contentfactory/nestjs-libraries/openai/ai.provider.config': config,
    '@contentfactory/nestjs-libraries/openai/ai.text-chain': chain,
    '../../openai/ai.text-chain': chain,
    '@contentfactory/nestjs-libraries/database/prisma/prisma.service': { PrismaService: class {}, PrismaRepository: class {} },
    '@contentfactory/nestjs-libraries/agent/agent.graph.service': { AgentGraphService: class {} },
    '@contentfactory/nestjs-libraries/integrations/integration.manager': { IntegrationManager: class {} },
    '@contentfactory/nestjs-libraries/user/acting.user': { getActingUserId: () => 'qa-user' },
    '../brief/content-brief.repository': { ContentBriefRepository: class {} },
    '@contentfactory/nestjs-libraries/content-intelligence/pieces/piece.repository': { PieceRepository: class {} },
  };
  const usageModule = loadWithMocks(PREFIX + 'openai/ai.usage.service.ts', shared);
  const aiUsage = new usageModule.AiUsageService(usageDb);
  const clients = loadWithMocks(PREFIX + 'openai/ai.clients.ts', shared);
  shared['@contentfactory/nestjs-libraries/openai/ai.clients'] = clients;
  shared['@contentfactory/nestjs-libraries/openai/ai.usage.service'] = usageModule;
  const researchModule = loadWithMocks(PREFIX + 'openai/web.research.service.ts', shared);
  const research = new researchModule.WebResearchService(aiUsage);
  shared['@contentfactory/nestjs-libraries/openai/web.research.service'] = researchModule;
  const artifacts = [];
  const sourceRegistry = { acceptSearchResult: async (_org, value) => ({ ...value, evidenceId: 'qa-source-' + hash(value.url || JSON.stringify(value)).slice(0, 16) }) };
  const ownedRow = (org, id) => org === organizationId ? artifacts.find(row => row.id === id) : undefined;
  const matches = (row, expected) => row && row.body === expected.body && isDeepStrictEqual(row.brief, expected.brief);
  const briefs = { recordCore: async (org, value) => {
    if (org !== organizationId) throw new Error('Cross-scope ephemeral write refused.');
    const row = { ...structuredClone(value), id: 'qa-piece-' + (artifacts.length + 1), code: 'cnt-' + String(artifacts.length + 1).padStart(2, '0'),
      kind: 'CORE', tags: {}, archivedAt: null, deletedAt: null, createdAt: new Date(), updatedAt: new Date() };
    artifacts.push(row); return { id: row.id, code: row.code };
  }, updateCoreMetadata: async (org, id, input) => {
    const row = ownedRow(org, id);
    if (!matches(row, { body: input.expectedBody, brief: input.expectedBrief })) throw new Error('The piece changed; reload before editing its metadata');
    Object.assign(row, { brief: structuredClone(input.brief), ...(input.title ? { title: input.title } : {}), updatedAt: new Date() });
  }, updateCore: async (org, id, input) => {
    const row = ownedRow(org, id);
    if (!row || (input.expected && !matches(row, input.expected))) throw new Error('The rewritten core matched no piece of this workspace');
    Object.assign(row, { body: input.body, brief: structuredClone(input.brief), ...(input.title ? { title: input.title } : {}), updatedAt: new Date() });
  } };
  const snapshots = new Map();
  const snapshotStore = { get: async key => snapshots.get(key) ?? null, set: async (key, value) => { snapshots.set(key, value); },
    del: async key => snapshots.delete(key), claim: async (key, value) => { if (snapshots.has(key)) return false; snapshots.set(key, value); return true; } };
  const intakeModule = loadWithMocks(PREFIX + 'content-intelligence/intake/intake.service.ts', shared);
  const { SourceFetchGateway } = loadWithMocks(PREFIX + 'content-intelligence/source-registry/source-fetch.gateway.ts', shared);
  const intake = new intakeModule.IntakeService({}, research, sourceRegistry,
    new SourceFetchGateway(),
    { listFacts: async () => [] }, { resolve: async () => ({ effectiveVoice: null }) }, briefs, {}, {}, aiUsage,
    () => new Date(), undefined, undefined, null, undefined, snapshotStore);
  const intakeEvents = [];
  const actualRun = intake.run.bind(intake);
  intake.run = async function* (...args) { for await (const event of actualRun(...args)) { intakeEvents.push(event); yield event; } };
  const repo = {
    getPiece: async (org, id) => structuredClone(ownedRow(org, id) ?? null),
    listPieceIds: async org => org === organizationId ? artifacts.map(({ id }) => ({ id })) : [],
    listPieces: async org => org === organizationId ? structuredClone(artifacts) : [],
    listIntegrations: async () => [], adaptationsByPiece: async () => [], searchPieceIds: async () => null,
    coreDelegatedPolicy: async () => ({ version: 'delegated-policy/v1', facts: 'knowledge', examples: 'never' }),
    acceptCoreReview: async (org, id, snapshot, body, title, brief) => {
      const row = ownedRow(org, id);
      if (!matches(row, snapshot) || row.title !== snapshot.title) throw Object.assign(new Error('The piece changed; reload before applying the review'), { code: 'PIECE_REVIEW_STALE' });
      Object.assign(row, { body, title, brief: structuredClone(brief), updatedAt: new Date() });
      return { body, title };
    },
  };
  const pieceModule = loadWithMocks(PREFIX + 'content-intelligence/pieces/piece.service.ts', shared);
  const pieces = new pieceModule.PieceService(repo, {}, {}, () => new Date(), undefined, aiUsage, briefs, null, null, research, intake, snapshotStore, null);
  const execution = loadTypeScriptModule(PREFIX + 'chat/conductor/conductor.execution.ts', { '../../openai/ai.text-chain': chain });
  const mocks = { ...shared, '../conductor/conductor.execution': execution, './conductor.execution': execution };
  const conductor = helpers.loadCapabilityModule('../conductor/index.ts', { aiConfig: config, mocks });
  const { createConductorMemory } = helpers.loadCapabilityModule('../conductor/conductor.memory.ts', { aiConfig: config, mocks });
  const { InMemoryStore } = require('@mastra/core/storage');
  const registry = helpers.loadRegistry({ aiConfig: config, mocks });
  const identity = { ...helpers.IDENTITY, organizationId, userId: 'qa-user', role: 'EDITOR', language: 'ru', timeZone: 'Europe/Moscow' };
  const onboarding = loadWithMocks(PREFIX + 'database/prisma/onboarding/onboarding.repository.ts', shared);
  const ports = { IntakeService: intake, PieceService: pieces, WebResearchService: research, AiUsageService: aiUsage,
    OnboardingRepository: { progress: async org => {
      const rows = org === organizationId ? artifacts.filter(row => !row.archivedAt) : [];
      return { channels: 0, voiceSamples: 0, avatars: 0, facts: 0,
        pieceFacts: rows.reduce((sum, row) => sum + onboarding.selectedPieceFactCount(row.brief), 0), pieces: rows.length,
        drafts: 0, scheduled: 0, adaptations: 0, planModes: 0, latestPieceId: rows.at(-1)?.id ?? null };
    } },
    IntegrationService: { getIntegrationsForChannelList: async () => [] },
    VoiceService: { avatars: async () => ({ avatars: [], defaultAvatarId: null }) },
  };
  const services = token => {
    if (ports[token.name]) return ports[token.name];
    throw Object.assign(new Error(`Service ${token.name} is unavailable in this isolated evaluation; no production side effect occurred.`), { code: 'QA_SERVICE_UNAVAILABLE' });
  };
  const route = { provider: resolved.provider, credentialMode: resolved.usageMode,
    evaluationModel: MODEL, liveRouteVerifiedByRoot: 'included/openrouter/openai/gpt-6-luna',
    runtimeConfigSource: 'native production loadAiConfig read-only export',
    evaluationOnlyOverride: false, configurationWrites: 0, searchEnabled: resolved.search.enabled,
    configuredSearchProvider: resolved.search.provider, availableSearchEngineNames: Object.keys(resolved.search.apiKeys || {}),
    includedQuotaSubstitutedInMemory: true };
  privateWrite('route.json', route);
  if (process.argv.includes('--inspect')) { stdout({ route, paidCalls: 0 }); return; }
  const cases = [
    { id: 'self-contained-rewrite', goal: 'Rewrite supplied material without search, no piece creation.',
      prompt: 'Перепиши понятно и короче, без канцелярита: «В целях повышения уровня прозрачности операционной деятельности принято решение осуществлять информирование команды о ходе работ каждую пятницу». Ничего не ищи и не создавай заготовку: верни только одну естественную фразу.' },
    { id: 'factual-investigation', goal: 'Investigate a factual comparison with sources, without creating a piece.',
      prompt: 'Проверь по официальной документации SQLite: чем WAL отличается от обычного rollback journal для небольшой программы, у которой несколько одновременных читателей и один писатель? Объясни ограничения коротко и дай ссылки на первоисточники. Не создавай заготовку.' },
    { id: 'multi-step-reference', goal: 'Research needed evidence, prepare a new core and verify saved state; old-reference dates are not event constraints.',
      prompt: 'Сначала проверь по официальной документации SQLite, могут ли читатели работать одновременно с писателем при WAL и сколько писателей допустимо. Затем сохрани новую короткую заготовку для разработчиков с точным названием «SQLite: что меняет WAL». После сохранения проверь, что заголовок и ключевые ограничения на месте. Это объяснение режима, не новости. Для ориентира мой старый пример: «Заметка за 6–8 октября: переход на другой режим сам по себе не ускоряет каждый запрос». Его даты относятся только к примеру. Не публикуй ничего и не подключай аккаунты.' },
    { id: 'historical-without-reference', goal: 'Research a historical interval on an unseen subject, save and verify one source-backed core without a previous post.',
      prompt: 'Подготовь и сохрани одну короткую заготовку на русском с точным названием «Python: релизы 7–18 октября 2025». Найди по официальным материалам Python.org, какие стабильные релизы CPython действительно вышли с 7 по 18 октября 2025 включительно. Не перечисляй старые релизы или будущие планы как события этого периода. Коротко объясни подтверждённые изменения со ссылками, затем прочитай сохранённый результат и проверь заголовок и даты. Предыдущего поста нет. Если источников не хватает, честно обозначь пробел. Ничего не публикуй.' },
    { id: 'native-earlier-long-material', goal: 'Retrieve omitted earlier material from actual native Memory, including continuation of its long message; no search or artifact.',
      seedHistory: true,
      prompt: 'В самом начале этого чата я присылал внутреннюю памятку проекта «Альтаир». По ней скажи, кто и в каком порядке проводит откат и когда нужно обновить журнал. Нужны точные имена и срок из памятки. Не ищи в интернете и не создавай заготовку.' },
    { id: 'private-ambiguity', goal: 'Recognize missing private experience, ask a useful clarification without invented autobiography or public research.',
      prompt: 'Помоги написать короткую историю от моего имени о том, как я отказался от выгодного заказа из-за разногласий с заказчиком. В чате я ещё не рассказывал, что именно произошло. Нужны реальная причина и конкретный эпизод, которые сделали бы историю моей. Текст нужен для коллег.' },
    { id: 'official-factual-comparison', goal: 'Compare supported technical alternatives with primary evidence and no unwanted saved artifact.',
      prompt: 'Сравни push-уведомления Google Calendar и периодический опрос Calendar API для отслеживания изменений. Кратко объясни доставку, срок жизни подписки и что всё равно нужно получать отдельным запросом. Опирайся на официальную документацию, например https://developers.google.com/workspace/calendar/api/guides/push. Нужен ответ здесь со ссылками, заготовку создавать не нужно.' },
  ];
  if (process.argv.includes('--diagnose-failed-input')) {
    const previous = JSON.parse(fs.readFileSync(path.join(__dirname, 'receipt-2026-10-18T18-17-17-103Z.json'), 'utf8'));
    const last = previous.cases.find(row => row.id === 'multi-step-reference');
    const args = last.steps.flatMap(step => step.toolCalls || []).map(row => row.payload || row).find(row => row.toolName === 'piece_create').args;
    global.fetch = async () => { throw Object.assign(new Error('Offline diagnostic blocked external request.'), { code: 'QA_OFFLINE_GUARD' }); };
    const tool = registry.buildCapabilityTool(registry.pieceCreate, { services, language: 'ru', entrance: 'chat' });
    let outcome; try { outcome = await helpers.executeTool(tool, args, { requestContext: conductor.buildConductorContext({ identity, threadId: 'qa-offline' }) }); }
    catch (error) { outcome = { error: { name: error.name, message: mask(error.message), code: error.code, stack: mask(error.stack) } }; }
    privateWrite('offline-diagnostic.json', { outcome, intakeEvents, runtimeLogs });
    stdout(JSON.parse(safeJson({ diagnostic: true, outcome, intakeEvents, runtimeLogs, privateTraceDirectory: privateDir })));
    return;
  }
  if (process.env.CF_QA_PROMPT_FILE) {
    const stat = fs.statSync(process.env.CF_QA_PROMPT_FILE);
    if (!stat.isFile() || (stat.mode & 0o077) !== 0) throw new Error('External QA prompt must be a private file.');
    const supplied = JSON.parse(fs.readFileSync(process.env.CF_QA_PROMPT_FILE, 'utf8'));
    if (typeof supplied.text !== 'string' || !supplied.text.trim()) throw new Error('External QA prompt is missing text.');
    cases.push({ id: 'production-acceptance-recheck', goal: 'Complete the exact independently selected production acceptance request.', prompt: supplied.text });
  }
  const selected = process.argv.find(arg => arg.startsWith('--case='))?.slice(7);
  const selectedCases = selected ? new Set(selected.split(',')) : null;
  const receipt = { schema: 'cf-natural-model-qa/v1', createdAt: new Date().toISOString(), route,
    boundaries: { actual: ['buildConductorAgent', 'native Mastra Agent.generate', 'unchanged product instructions/skills/tools', 'real model-selected tool arguments', 'real IntakeService and core writer', 'real WebResearchService/provider retrieval', 'real PieceService detail readers', 'real guarded SourceFetchGateway with DNS/robots/redirect/size policy', 'real AiUsageService accounting in ephemeral tables'],
      directSourceFetching: process.env.SOURCE_DIRECT_FETCH === 'true',
      substituted: ['isolated empty workspace snapshot', 'in-memory piece/source/snapshot repositories', 'in-memory AI ledger/quota instead of persistent billing', 'current editor permission policy without real membership rows', 'no selected avatar/channel integrations', 'HTTP/controller/browser path not exercised'] },
    privateTraceDirectory: privateDir, cases: [] };
  for (const test of cases.filter(test => !selectedCases || selectedCases.has(test.id))) {
    const trace = { id: test.id, prompt: test.prompt, modelRequests: [], steps: [], artifactStart: artifacts.length, sourceHashes: sourceHashes(), startedAt: new Date().toISOString() };
    privateWrite(test.id + '.started.json', trace);
    const rowsBefore = usageRows.length;
    const request = execution.createConductorExecution({ requestId: 'qa-' + test.id });
    const threadId = 'qa-' + test.id;
    const resourceId = organizationId + ':qa-user';
    let memory;
    if (test.seedHistory) {
      memory = createConductorMemory(new InMemoryStore());
      await memory.createThread({ threadId, resourceId, title: 'Изолированная проверка контекста' });
      const longMaterial = 'Внутренняя памятка проекта «Альтаир».\n' + Array.from({ length: 130 }, (_, index) =>
        `Раздел ${index + 1}. При плановой проверке сверяют версию конфигурации, запись в журнале и состояние очереди. Результаты обсуждаются письменно; технический исполнитель сохраняет подтверждение проверки и передаёт его координатору. Изменение действует после записи в журнале; старую запись сохраняют для сверки.\n`).join('') +
        '\nПорядок отката: сначала Лидия Соколова подтверждает сохранность очереди, затем Марк Ильин возвращает предыдущую конфигурацию. Журнал необходимо обновить в течение 17 минут после отката.';
      const filler = 'Промежуточное обсуждение оформления отчёта. Сохраняем читаемые подписи, единый порядок разделов и понятный язык. Конкретный порядок отката остаётся в исходной памятке. '.repeat(40);
      const messages = Array.from({ length: 51 }, (_, index) => ({ id: 'qa-history-' + index, threadId, resourceId,
        role: index % 2 ? 'assistant' : 'user', createdAt: new Date(Date.UTC(2026, 0, 1, 0, index)),
        content: { format: 2, parts: [{ type: 'text', text: index === 0 ? longMaterial : `Обсуждение ${index}. ${filler}` }] } }));
      await memory.saveMessages({ messages });
      trace.seededHistory = { messages: messages.length, longMaterialCharacters: longMaterial.length, longMaterialSha256: hash(longMaterial) };
      trace.historyReads = [];
      const recall = memory.recall.bind(memory);
      memory.recall = async options => { trace.historyReads.push({ page: options.page, perPage: options.perPage, orderBy: options.orderBy }); return recall(options); };
    }
    const agent = conductor.buildConductorAgent({ services,
      ...(memory ? { memory } : {}),
      gate: new registry.DoorPolicyGate(helpers.permissionsService()),
      snapshot: async () => ({ counts: { pieces: artifacts.length, avatars: 0, channels: 0 }, pieces: artifacts.map(row => ({ id: row.id, code: row.code, title: row.title })), avatars: [], channels: [], allowance: { mode: resolved.usageMode } }),
      model: async () => aiUsage.prepareModelExecution(organizationId, 'agent', async () => {
        const model = (await clients.getAiSdkProvider(organizationId)).chat(MODEL);
        return new Proxy(model, { get(target, property) {
          if (property === 'doGenerate' || property === 'doStream') return async (...args) => {
            trace.modelRequests.push({ method: property, options: args[0] });
            privateWrite(test.id + '.progress.json', trace);
            return target[property](...args);
          };
          const value = Reflect.get(target, property, target); return typeof value === 'function' ? value.bind(target) : value;
        } });
      }),
    });
    const admission = await aiUsage.beginAiOperation(organizationId, 'agent', 'agent');
    const options = request.streamOptions();
    let failure;
    let result;
    try {
      result = await request.run(() => admission.run(() => agent.generate(test.prompt, {
        ...options, requestContext: conductor.buildConductorContext({ identity, threadId, executionPolicy: request.policy }),
        ...(memory ? { memory: { thread: threadId, resource: resourceId } } : {}),
        abortSignal: request.signal,
        onStepFinish: step => { options.onStepFinish(step); trace.steps.push(step); privateWrite(test.id + '.progress.json', trace); },
      })));
    } catch (error) { failure = { name: error.name, message: mask(error.message), code: error.code }; }
    await admission.finish(!failure && !request.snapshot().stopCode, failure);
    trace.finishedAt = new Date().toISOString();
    trace.error = failure ?? null;
    trace.finalText = result?.text ?? '';
    trace.budget = request.snapshot();
    trace.artifacts = artifacts.slice(trace.artifactStart);
    trace.usageRows = usageRows.slice(rowsBefore);
    trace.intakeEvents = [...intakeEvents];
    trace.sourceHashesAtFinish = sourceHashes();
    privateWrite(test.id + '.complete.json', trace);
    const steps = trace.steps.map(step => ({ text: step.text, finishReason: step.finishReason,
      toolCalls: step.toolCalls, toolResults: step.toolResults }));
    const publicCase = JSON.parse(safeJson({ id: test.id, goal: test.goal, prompt: test.prompt,
      status: failure ? 'failed' : request.snapshot().stopCode ? 'incomplete' : 'returned',
      startedAt: trace.startedAt, finishedAt: trace.finishedAt, error: failure ?? null,
      model: MODEL, provider: resolved.provider, sourceHashes: trace.sourceHashes, sourceHashesAtFinish: trace.sourceHashesAtFinish,
      steps, finalText: trace.finalText, artifacts: trace.artifacts,
      ...(trace.seededHistory ? { seededHistory: trace.seededHistory, historyReads: trace.historyReads } : {}),
      usage: trace.usageRows.map(({ organizationId, userId, id, ...row }) => row), budget: trace.budget,
      rawTraceSha256: fileHashSafe(path.join(privateDir, test.id + '.complete.json')) }));
    receipt.cases.push(publicCase);
    const receiptDir = path.join(__dirname, '..', 'evidence', 'model-qa');
    fs.mkdirSync(receiptDir, { recursive: true });
    fs.writeFileSync(path.join(receiptDir, 'receipt-' + stamp + '.json'), safeJson(receipt) + '\n');
    stdout({ case: test.id, status: publicCase.status, steps: steps.length, toolNames: steps.flatMap(step => (step.toolCalls || []).map(call => call.toolName || call.payload?.toolName)),
      artifacts: trace.artifacts.length, knownCostUsd: trace.budget.knownCostUsd, unknownCostCalls: trace.budget.unknownCostCalls, possiblyBilled: trace.budget.possiblyBilled, error: failure ?? null });
  }
  privateWrite('runtime-logs.json', runtimeLogs);
  stdout({ receipt: path.join(__dirname, '..', 'evidence', 'model-qa', 'receipt-' + stamp + '.json'), privateTraceDirectory: privateDir });
}

function fileHashSafe(file) { return hash(fs.readFileSync(file)); }
main().catch(error => { privateWrite('failure.json', { error, runtimeLogs }); stdout({ status: 'harness-failed', error: { name: error.name, message: mask(error.message) }, privateTraceDirectory: privateDir }); process.exitCode = 1; });
