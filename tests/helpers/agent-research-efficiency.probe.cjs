'use strict';

// Offline native contract: real Session/DurableAgent/Memory and owned PostgreSQL/Redis.
// The search corpus and model transport are deterministic test fixtures, not external providers.
const assert = require('node:assert/strict');
const {execFileSync, fork} = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {MockLanguageModelV3} = require('ai/test');
const {convertArrayToReadableStream} = require('@ai-sdk/provider-utils/test');
const {createRuntime, IDENTITY} = require('./mastra-service-native-integration.probe.cjs');
const {Response, HttpController, AgentThreadsService, until} = require('./agent-native-session-http.probe.cjs');
const {loadCapabilityModule} = require('./agent-capabilities.cjs');
const {researchSearch} = loadCapabilityModule('catalogue/research.capabilities.ts');
const {pieceRead} = loadCapabilityModule('catalogue/material-read.capabilities.ts');
const {pieceCreate} = loadCapabilityModule('catalogue/piece.capabilities.ts');
const {pieceAdapt} = loadCapabilityModule('catalogue/adaptation.capabilities.ts');
const ORG = {id: IDENTITY.organizationId, createdAt: IDENTITY.organizationCreatedAt, users: [{role: 'EDITOR'}]};
const USER = {id: IDENTITY.userId, language: 'ru'};
const ORIGINAL = 'Подготовь материал по источникам. Сохрани ограничения и задай вопрос о позиции.';
const PASSAGE = 'Точный фрагмент позднего источника: результат зависит от контекста.';
const SNAPSHOT = 'res_fixture_6013';
const CORE = 'Осторожный вывод: данные позднего источника требуют проверки контекста.';
const DRAFT = 'Черновик Telegram: данные требуют проверки контекста.';
const lengthOptions = [
  {id:'brief',label:'Осторожный краткий вывод',description:'Точный вывод с оговоркой о проверке контекста.',lengthRange:{idealMin:50,idealMax:300,hardMax:500},recommended:true},
  {id:'context',label:'Вывод с пояснением',description:'Добавить контекст и ограничение позднего источника.',lengthRange:{idealMin:300,idealMax:600,hardMax:800},recommended:false},
];
const sources = Array.from({length: 50}, (_, i) => ({url: `https://source.example.test/${i}`, title: `Источник ${i} ${'описание '.repeat(90)}`, text: `${'Текст источника. '.repeat(180)}${i === 43 ? PASSAGE : ''}`, excerpt: 'Фрагмент '.repeat(100)}));
const facts = sources.map((source, i) => ({factKey: `fact-${i}`, statement: `Наблюдение ${i} ${'описание '.repeat(60)}`, sourceUrl: source.url, evidenceId: `evidence-${i}`, quote: i === 43 ? PASSAGE : 'Текст источника.', status: 'confirmed', verified: true}));
const evidence = sources.map((source, i) => ({evidenceId: `evidence-${i}`, url: source.url, excerpt: source.text}));
const assessment = {status: 'partial', reason: 'Проверка ограничена фикстурой', coverage: Array.from({length: 50}, (_, i) => ({question: `Вопрос ${i} ${'контекст '.repeat(20)}`, status: 'partial'}))};
const usage = {inputTokens: {total: 5, noCache: 5}, outputTokens: {total: 5, text: 5}};
const output = parts => ({stream: convertArrayToReadableStream([{type: 'stream-start', warnings: []}, ...parts])});
const call = (id, name, input) => output([{type: 'tool-call', toolCallId: id, toolName: name, input: JSON.stringify(input)}, {type: 'finish', finishReason: {unified: 'tool-calls', raw: 'tool_calls'}, usage}]);
const answer = text => output([{type: 'text-start', id: 'answer'}, {type: 'text-delta', id: 'answer', delta: text}, {type: 'text-end', id: 'answer'}, {type: 'finish', finishReason: {unified: 'stop', raw: 'stop'}, usage}]);

async function child(phase, statePath) {
  const read = () => JSON.parse(fs.readFileSync(statePath, 'utf8'));
  const write = state => fs.writeFileSync(statePath, JSON.stringify(state));
  const {PrismaClient} = require('@prisma/client');
  const prisma = new PrismaClient({datasources: {db: {url: process.env.CF_TEST_PG_URL}}});
  const intake = {
    prepare: async (_org, body) => { assert.equal(body.input, ORIGINAL); return body; },
    run: async function* (org, plan, userId) {
      const row = await prisma.contentPiece.create({data: {id: 'fixture-piece', organizationId: org, createdByUserId: userId, kind: 'CORE', title: 'Тестовая заготовка', body: CORE}});
      yield {name: 'piece', pieceId: row.id, code: 'fixture-piece'}; yield {name: 'questions', questions: []};
    },
    storeResearchEvidence: async (_org, _user, input) => ({...input, snapshotKey: SNAPSHOT}),
    readStoredResearchEvidence: async (_org, _user, key) => key === SNAPSHOT && !read().expired
      ? {snapshotKey: SNAPSHOT, sources, facts, evidence, summary: assessment} : null,
  };
  const pieces = {
    adaptPlanMode: async () => 'draft',
    prepareAdapt: async (_org, id, body) => ({id, body}),
    adapt: async function* (org, plan) {
      const post = await prisma.post.create({data: {id: 'fixture-post', state: 'DRAFT', publishDate: new Date('2026-01-01T00:00:00Z'), organizationId: org, integrationId: 'fixture-channel', content: DRAFT, group: 'fixture-group'}});
      const row = await prisma.contentDerivation.create({data: {id: 'fixture-adaptation', organizationId: org, contentPieceId: plan.id, postId: post.id, integrationId: 'fixture-channel', platform: 'telegram', format: 'post', kind: 'post', body: DRAFT}});
      yield {name: 'adapt-started', channel: {id: 'fixture-channel', name: 'Telegram fixture', providerIdentifier: 'telegram'}};
      yield {name: 'adaptation', adaptation: {id: row.id, state: 'draft', plan: {status: 'draft'}}};
    },
    detail: async (_org, id) => ({piece: {id, code: id}, core: {text: CORE}, adaptations: (await prisma.contentDerivation.findMany({where: {organizationId: IDENTITY.organizationId, contentPieceId: id}})), channels: []}),
  };
  const profile = {version:'channel-writing-profile/v2',lengthPolicy:{idealMin:500,idealMax:1000,hardMax:1500},
    emojiLevel:'few',hashtagPolicy:'none',linkPolicy:'end',ctaKind:'auto',formatPreference:'auto',notes:null};
  const integrations = {
    getWritingProfile: async () => ({profile,providerIdentifier:'telegram',provider:{maxLength:4096}}),
    getIntegrationsForChannelList: async () => [{id:'fixture-channel',name:'Telegram fixture',providerIdentifier:'telegram'}],
  };
  const web = {research: async () => {const state = read(); state.searches++; write(state); return {summary: 'Исследование неполное; изучите источники.', readerAssessment: assessment, sources, facts, fromCache: false};}};
  const modelFactory = modelId => new MockLanguageModelV3({modelId, doStream: async args => {
    const state = read(); const step = state.modelCalls++;
    const serialized = JSON.stringify(args.prompt);
    const system = JSON.stringify(args.prompt.filter(m => m.role === 'system'));
    const history = JSON.stringify(args.prompt.filter(m => m.role !== 'system'));
    const schemas = JSON.stringify(args.tools ?? []);
    const resultBytes = name => Buffer.byteLength(JSON.stringify(args.prompt.flatMap(m => Array.isArray(m.content) ? m.content : [])
      .filter(part => part.type === 'tool-result' && part.toolName === name)));
    state.prompts.push({step, bytes: Buffer.byteLength(serialized), systemChars: system.length, systemBytes: Buffer.byteLength(system),
      toolsChars: schemas.length, toolsBytes: Buffer.byteLength(schemas), nonSystemMessageChars: history.length, nonSystemMessageBytes: Buffer.byteLength(history),
      researchResultBytes: resultBytes('research_search'), sourceReadResultBytes: resultBytes('piece_read'),
      hasOriginal: serialized.includes(ORIGINAL), hasPassage: serialized.includes(PASSAGE)});
    write(state);
    if (phase === 'start') {
      if (step === 0) return call('research', 'research_search', {query: 'Исследование', level: 'quick'});
      if (step === 1) {
        const part = args.prompt.flatMap(m => Array.isArray(m.content) ? m.content : []).find(p => p.type === 'tool-result' && p.toolName === 'research_search');
        const view = part?.output?.value; const summary = view?.summary?.untrustedData?.value ?? view?.summary;
        assert(view?.ok && summary?.snapshotKey === SNAPSHOT && summary?.sourceCount === 50, JSON.stringify(view));
        assert(summary.summary && summary.assessment && summary.readWith === 'piece.read');
        assert(Buffer.byteLength(JSON.stringify(view)) <= 32768);
        assert(serialized.includes(SNAPSHOT)); return call('read-later', 'piece_read', {researchId: SNAPSHOT, part: 'research_source', sourceIndex: 43, find: PASSAGE});}
      if (step === 2) {assert(serialized.includes(PASSAGE)); return call('question', 'ask_user', {question: 'Какую позицию отразить?', options: [{label: 'Осторожный вывод'}, {label: 'Практический вывод'}]});}
      throw Object.assign(new Error('Provider balance exhausted. private-fixture-secret'), {name: 'AI_APICallError', statusCode: 402, isRetryable: false, url: 'https://fixture.invalid/v1/chat'});
    }
    if (step === 4) return call('create', 'piece_create', {requestMessageId: 'original', inputKind: 'instruction', researchId: SNAPSHOT, factId: ['fact-43']});
    if (step === 5) {assert(serialized.includes('fixture-piece'), 'Created piece must appear in the native result'); return call('adapt-post', 'piece_adapt', {pieceId: 'fixture-piece', channelId: 'fixture-channel', kind: 'post', lengthOptions});}
    if (step === 6) {assert(serialized.includes('fixture-adaptation'), 'Saved adaptation must appear in the native result'); return answer('Заготовка и черновик сохранены.');}
    if (step === 7) return call('expired-read', 'piece_read', {researchId: SNAPSHOT, part: 'research_source', sourceIndex: 43});
    if (step === 8) {assert(serialized.includes('MATERIAL_NOT_AVAILABLE'), 'Expired evidence must be reported as unavailable'); return answer('Срок хранения источника истёк.');}
    return call('stop-question', 'ask_user', {question: 'Продолжать работу?', options: [{label: 'Продолжить'}, {label: 'Остановить'}]});
  }});
  let threads;
  const runtime = await createRuntime({schemaName: 'cf_honey6013_acceptance', capabilities: [researchSearch, pieceRead, pieceCreate, pieceAdapt], serviceFor: token => token.name === 'IntakeService' ? intake : token.name === 'WebResearchService' ? web : token.name === 'PieceService' ? pieces : token.name === 'IntegrationService' ? integrations : token.name === 'AgentThreadsService' ? threads : {}, modelFactory});
  const threadId = 'cf-honey6013-thread';
  threads = new AgentThreadsService(runtime.service, runtime.redis);
  const handler = new HttpController(runtime.service, threads, runtime.aiUsage);
  const send = async body => {const response = new Response(); let failure; const pending = handler.chat(ORG, USER, body, response).catch(error => {failure = error;}); await until(() => failure || response.writableEnded, 'native HTTP response'); if (failure) throw failure; return {response, pending};};
  try {
    if (phase === 'start') {
      const first = await send({threadId, messages: [{id: 'original', role: 'user', parts: [{type: 'text', text: ORIGINAL}]}]});
      const before = await handler.getThread(ORG, USER, threadId);
      const question = before.pending[0]; assert(question); assert.equal(question.suspendPayload.question, 'Какую позицию отразить?');
      const resumed = await send({threadId, runId: question.runId, toolCallId: question.toolCallId, cardId: question.suspendPayload.cardId, resumeData: {answer: 'Осторожный вывод'}});
      await first.pending; await resumed.pending;
      const after = await handler.getThread(ORG, USER, threadId);
      assert.equal(after.execution.state, 'settled'); assert.equal(after.execution.outcome, 'failed'); assert.equal(after.execution.errorCode, 'AI_PROVIDER_PAYMENT_REQUIRED');
      assert(after.messages.some(m => m.id === 'original' && JSON.stringify(m).includes(ORIGINAL)));
      const wire = JSON.stringify(resumed.response.parts()); assert(wire.includes('Осторожный вывод')); assert(!wire.includes('private-fixture-secret')); assert(resumed.response.parts().some(part => part.type === 'error' && part.errorText === 'AI_PROVIDER_PAYMENT_REQUIRED'), wire);
      const state = read(); assert.equal(state.searches, 1); assert.equal(state.modelCalls, 4);
      const failedPointer = await threads.readNativeRun(IDENTITY, threadId); assert.equal(failedPointer.state, 'settled'); assert.equal(failedPointer.outcome, 'failed');
      process.send({phase: 'ready', result: {wire: resumed.response.parts(), failedPointer: {state: failedPointer.state, outcome: failedPointer.outcome}, prompts: state.prompts}});
      return;
    }
    const count = read().modelCalls;
    const before = await handler.getThread(ORG, USER, threadId);
    assert.equal(before.execution.state, 'settled'); assert.equal(before.execution.outcome, 'failed'); assert.equal(before.execution.errorCode, 'AI_PROVIDER_PAYMENT_REQUIRED');
    assert(before.messages.some(m => m.id === 'original' && JSON.stringify(m).includes(ORIGINAL)));
    const savedHumans = async () => (await threads.readMessages(IDENTITY, threadId, {page: 0, perPage: 200})).messages
      .filter(m => m.role === 'user' || m.role === 'signal').map(m => ({id: m.id, role: m.role, content: m.content, threadId: m.threadId, resourceId: m.resourceId}));
    const humansBefore = await savedHumans();
    const writesBefore = [await prisma.contentPiece.count({where: {organizationId: IDENTITY.organizationId}}), await prisma.post.count({where: {organizationId: IDENTITY.organizationId}})];
    const reread = await handler.getThread(ORG, USER, threadId);
    assert.deepEqual(await savedHumans(), humansBefore);
    assert.deepEqual([await prisma.contentPiece.count({where: {organizationId: IDENTITY.organizationId}}), await prisma.post.count({where: {organizationId: IDENTITY.organizationId}})], writesBefore);
    assert.equal(reread.execution.outcome, 'failed');
    const coldPointer = await threads.readNativeRun(IDENTITY, threadId); assert.equal(coldPointer.state, 'settled'); assert.equal(coldPointer.outcome, 'failed');
    assert.equal(read().modelCalls, count, 'GET must not run inference');
    const continued = await send({threadId, messages: [{id: 'continue', role: 'user', parts: [{type: 'text', text: 'Продолжи явно.'}]}]});
    const choosingLength = await handler.getThread(ORG, USER, threadId);
    const lengthChoice = choosingLength.pending.find(item => item.suspendPayload?.kind === 'writing-settings');
    assert(lengthChoice, JSON.stringify(continued.response.parts()));
    assert.deepEqual(lengthChoice.suspendPayload.lengthOptions, lengthOptions);
    assert.equal(read().modelCalls, count + 2, 'Size choice must suspend before another model call');
    assert.equal(await prisma.post.count({where: {organizationId: IDENTITY.organizationId}}), 0, 'No draft before explicit size approval');
    const sizeApproved = await send({threadId, runId:lengthChoice.runId, toolCallId:lengthChoice.toolCallId,
      cardId:lengthChoice.suspendPayload.cardId, resumeData:{action:'apply',settings:lengthChoice.suspendPayload.proposed}});
    await continued.pending;
    await sizeApproved.pending;
    assert(sizeApproved.response.parts().some(part => part.type === 'data-progress' && part.data?.stage === 'writing-settings-confirmed'));
    const final = await handler.getThread(ORG, USER, threadId);
    assert.equal(final.execution.outcome, 'completed', JSON.stringify({parts: continued.response.parts(), calls: read().modelCalls})); assert.equal(read().modelCalls, count + 3); assert.equal(read().searches, 1);
    const cores = await prisma.contentPiece.findMany({where: {organizationId: IDENTITY.organizationId}});
    const posts = await prisma.post.findMany({where: {organizationId: IDENTITY.organizationId}});
    assert.equal(cores.length, 1, JSON.stringify(continued.response.parts())); assert.equal(cores[0].body, CORE); assert.equal(posts.length, 1); assert.equal(posts[0].state, 'DRAFT'); assert.equal(posts[0].content, DRAFT);
    const expiredState = read(); expiredState.expired = true; write(expiredState);
    const expired = await send({threadId, messages: [{id: 'expired', role: 'user', parts: [{type: 'text', text: 'Проверь сохранённый источник.'}]}]});
    await expired.pending; assert(expired.response.parts().some(part => part.type === 'tool-output-available' && part.output?.code === 'MATERIAL_NOT_AVAILABLE'));
    const stopping = await send({threadId, messages: [{id: 'stop-message', role: 'user', parts: [{type: 'text', text: 'Начни, затем останови.'}]}]});
    const waiting = await handler.getThread(ORG, USER, threadId); assert(waiting.pending.length > 0);
    const receipt = await handler.stopThread(ORG, USER, threadId); await stopping.pending;
    assert.equal(receipt.stopped, true); const stopped = await handler.getThread(ORG, USER, threadId);
    assert.equal(stopped.execution.state, 'settled'); assert.equal(stopped.execution.outcome, 'interrupted');
    assert(stopped.messages.some(m => m.id === 'original' && JSON.stringify(m).includes(ORIGINAL)));
    const stoppedPointer = await threads.readNativeRun(IDENTITY, threadId);
    assert.equal(stoppedPointer.logicalRequestId, receipt.requestId);
    assert.equal(stoppedPointer.logicalRequestId, stopped.execution.requestId);
    assert.equal(stoppedPointer.continuationPending, false);
    // The native observer can commit interruption before or after the HTTP
    // Stop writes its stopped pointer. Both must identify the same terminal task.
    assert(stoppedPointer.state === 'stopped' ||
      stoppedPointer.state === 'settled' && stoppedPointer.outcome === 'interrupted');
    const stoppedHumans = await savedHumans(); await handler.getThread(ORG, USER, threadId); assert.deepEqual(await savedHumans(), stoppedHumans);
    assert.equal(read().modelCalls, count + 6, 'Stop and subsequent GET cannot infer');
    assert.equal(await prisma.contentPiece.count({where: {organizationId: IDENTITY.organizationId}}), 1);
    assert.equal(await prisma.post.count({where: {organizationId: IDENTITY.organizationId}}), 1);
    process.send({phase: 'complete', result: {coldPointer: {state: coldPointer.state, outcome: coldPointer.outcome}, stoppedPointer: {matchedRequest: true, outcome: stopped.execution.outcome}, humanRowsStableOnGet: true, writesStableOnGet: true, inputTokens: null, cachedInputTokens: null, usageNote: 'Fixture usage is synthetic; actual provider tokens are unavailable.', expiredEvidence: true, stopped: true, native: true, sources: sources.length, laterSource: 43, questionAnswered: true, lengthChoiceAnswered:true, restart: true, getNoInference: true, originalPreserved: true, searches: read().searches, modelCalls: read().modelCalls, cores: cores.length, telegramDrafts: posts.length, prompts: read().prompts}});
  } finally {await runtime.close({drop: phase !== 'start'}); await prisma.$disconnect();}
  process.exit(0);
}

const docker = args => execFileSync('docker', args, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
async function runChild(phase, statePath, env) {
  const p = fork(__filename, ['child', phase, statePath], {env, stdio: ['ignore', 'pipe', 'pipe', 'ipc']});
  let logs = ''; p.stdout.on('data', c => {logs += c;}); p.stderr.on('data', c => {logs += c;});
  return await new Promise((resolve, reject) => {
    let message; const timer = setTimeout(() => {p.kill('SIGKILL'); reject(new Error(`Timeout ${phase}: ${logs}`));}, 60000);
    p.on('message', m => {message = m;});
    p.once('exit', code => {clearTimeout(timer); if (code || !message) reject(new Error(`Child ${phase} (${code}): ${logs}`)); else resolve(message);});
  });
}
async function main() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-honey6013-'));
  const statePath = path.join(directory, 'state.json'); fs.writeFileSync(statePath, JSON.stringify({searches: 0, modelCalls: 0, prompts: [], expired: false}));
  const base = `cf-honey6013-${process.pid}-${Date.now()}`; const pg = `${base}-pg`, redis = `${base}-redis`; const created = [];
  try {
    docker(['run', '-d', '--name', pg, '-e', 'POSTGRES_USER=fixture', '-e', 'POSTGRES_PASSWORD=fixture', '-e', 'POSTGRES_DB=fixture_test', '-p', '127.0.0.1::5432', '--pull=never', 'postgres:16-alpine']); created.push(pg);
    docker(['run', '-d', '--name', redis, '-p', '127.0.0.1::6379', '--pull=never', 'redis:7-alpine']); created.push(redis);
    const port = (name, containerPort) => {const address = docker(['port', name, `${containerPort}/tcp`]); return Number(address.split(':').at(-1));};
    const pgPort = port(pg, 5432), redisPort = port(redis, 6379);
    for (let i = 0; ; i++) {try {docker(['exec', pg, 'pg_isready', '-U', 'fixture', '-d', 'fixture_test']); break;} catch (e) {if (i >= 100) throw e; await new Promise(resolve => setTimeout(resolve, 100));}}
    const env = {PATH: process.env.PATH, HOME: process.env.HOME, LANG: process.env.LANG || 'C.UTF-8', NODE_ENV: 'test', CF_TEST_PG_URL: `postgresql://fixture:fixture@127.0.0.1:${pgPort}/fixture_test`, CF_TEST_REDIS_URL: `redis://127.0.0.1:${redisPort}`};
    execFileSync('pnpm', ['exec', 'prisma', 'db', 'push', '--schema', 'libraries/nestjs-libraries/src/database/prisma/schema.prisma', '--skip-generate'], {cwd: path.resolve(__dirname, '../..'), env: {...env, DATABASE_URL: env.CF_TEST_PG_URL}, stdio: 'pipe'});
    const {PrismaClient} = require('@prisma/client');
    const db = new PrismaClient({datasources: {db: {url: env.CF_TEST_PG_URL}}});
    try {
      await db.organization.create({data: {id: IDENTITY.organizationId, name: 'Fixture'}});
      await db.integration.create({data: {id: 'fixture-channel', organizationId: IDENTITY.organizationId, internalId: 'fixture', name: 'Fixture Telegram', providerIdentifier: 'telegram', type: 'social', token: 'unused-fixture', planMode: 'draft'}});
    } finally {await db.$disconnect();}
    const start = await runChild('start', statePath, env);
    const finish = await runChild('resume', statePath, env);
    console.log(JSON.stringify({...finish.result, firstWire: start.result.wire, failedPointer: start.result.failedPointer, ownedResources: [pg, redis]}));
  } finally {
    for (const name of created.reverse()) docker(['rm', '-f', name]);
    fs.rmSync(directory, {recursive: true, force: true});
  }
}
module.exports = { ORIGINAL, PASSAGE, sources, facts, assessment };
if (require.main === module) {
  if (process.argv[2] === 'child') child(...process.argv.slice(3)).catch(error => {console.error(error); process.exit(1);});
  else main().catch(error => {console.error(error); process.exitCode = 1;});
}
