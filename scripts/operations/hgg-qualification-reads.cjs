'use strict';
/** Local operator only: fixed reads or one explicit cost-only quote; no application or paid submit. */
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), cp = require('node:child_process');
const repo = path.resolve(__dirname, '../..');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const refuse = () => {throw new Error('VIDEO_QUALIFICATION_RUN_INVALID');};
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', {flag: 'wx', mode: 0o600});
function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!['--mode', '--stand', '--qualification', '--output', '--expected-source', '--selection', '--request', '--request-sha256', '--image-detail', '--video-catalogue'].includes(argv[i]) || !argv[i + 1] || args[argv[i]]) refuse();
    args[argv[i]] = argv[i + 1];
  }
  if (!['base', 'details', 'catalogue', 'quote'].includes(args['--mode']) || !/^[a-f0-9]{40}$/.test(args['--expected-source'] || '') ||
    ['--stand', '--qualification', '--output'].some(k => !path.isAbsolute(args[k] || '')) ||
    (args['--mode'] === 'details') !== !!args['--selection'] || args['--selection'] && !path.isAbsolute(args['--selection'])) refuse();
  const quote = args['--mode'] === 'quote', keys = ['--request', '--request-sha256', '--image-detail', '--video-catalogue'];
  if (keys.some(k => quote !== !!args[k]) || quote && (!/^[a-f0-9]{64}$/.test(args['--request-sha256']) ||
    ['--request', '--image-detail', '--video-catalogue'].some(k => !path.isAbsolute(args[k])))) refuse();
  return args;
}
function verifyIdentity(stand, session, self) {
  if (typeof session?.id !== 'string' || self?.id !== session.id || self?.id !== stand.actor?.userId ||
    typeof self?.orgId !== 'string' || self.orgId !== stand.actor?.organizationId || self.activated !== true) refuse();
  return {actor: self.id, org: self.orgId};
}
function loadServices() {
  require('ts-node').register({transpileOnly: true, project: path.join(repo, 'tsconfig.json'), compilerOptions: {module: 'CommonJS', target: 'ES2021'}});
  require('tsconfig-paths').register({baseUrl: repo, paths: readJson(path.join(repo, 'tsconfig.base.json')).compilerOptions.paths});
  const source = file => require(path.join(repo, 'libraries/nestjs-libraries/src', file));
  const {AuthService} = require(path.join(repo, 'libraries/helpers/src/auth/auth.service.ts'));
  const {withAuthenticatedSession} = source('user/authenticated.session.ts');
  const contract = source('videos/subscriptions/video-hgg-qualification-read.v1.ts');
  const quoteContract = source('videos/subscriptions/video-hgg-pilot-quote.v1.ts');
  return {AuthService, withAuthenticatedSession, contract, quoteContract, construct(mode) {
    const db = new (source('database/prisma/prisma.service.ts').PrismaService)();
    const repository = new (source('database/prisma/video-subscription/video-subscription.repository.ts').VideoSubscriptionRepository)(db);
    const runtime = new (source('videos/subscriptions/video-provider-registry.ts').VideoSubscriptionRuntime)();
    const oauth = new (source('videos/subscriptions/video-oauth-client.ts').VideoOAuthClient)(runtime);
    const connections = new (source('videos/subscriptions/video-connection.service.ts').VideoConnectionService)(repository, runtime, oauth);
    const mcp = new (source('videos/subscriptions/video-mcp-client.ts').VideoMcpClient)(runtime);
    const Service = mode === 'quote' ? source('videos/subscriptions/video-qualification-quote.service.ts').VideoQualificationQuoteService
      : source('videos/subscriptions/video-qualification-read.service.ts').VideoQualificationReadService;
    const service = new Service(repository, connections, mcp);
    return {db, service};
  }};
}
function retainedResult(out, receipt, id) {
  const expected = receipt.results?.find(row => row.id === id);
  if (!expected) refuse();
  const file = path.join(out, `${id}.result.private.json`), bytes = fs.readFileSync(file);
  if (sha(bytes) !== expected.sha256) refuse();
  const result = JSON.parse(bytes);
  if (result.source !== receipt.source || result.accountGeneration !== receipt.accountGeneration || result.schemaDigest !== receipt.schemaDigest || result.request.id !== id) refuse();
  return result.raw;
}
function failureReceipt(error) {
  const body = error?.getResponse?.(), rawCode = body?.code || error?.message;
  const receipt = {outcome: 'stopped', code: /^VIDEO_[A-Z0-9_]{1,70}$/.test(rawCode || '') ? rawCode : 'VIDEO_QUALIFICATION_RUN_FAILED', automaticRetry: false, generation: false};
  const q = body?.qualification;
  if (['VIDEO_RESPONSE_TOO_LARGE', 'VIDEO_RESPONSE_TIMEOUT'].includes(receipt.code) &&
    ['initialize', 'notifications/initialized', 'tools/list', 'close', 'qualification/read', 'qualification/quote'].includes(q?.phase) &&
    [1048576, 8388608].includes(q.maximumBytes) && Number.isSafeInteger(q.observedBytes) && q.observedBytes >= 0) {
    receipt.qualification = {phase: q.phase, maximumBytes: q.maximumBytes, observedBytes: q.observedBytes};
  }
  return receipt;
}
async function runOperator(args, ports = {}) {
  const standBytes = fs.readFileSync(args['--stand']), stand = JSON.parse(standBytes), out = args['--output'], mode = args['--mode'];
  const source = cp.execFileSync('git', ['rev-parse', 'HEAD'], {cwd: repo, encoding: 'utf8'}).trim();
  if (source !== args['--expected-source'] || cp.execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], {cwd: repo, encoding: 'utf8'}).trim() ||
    fs.realpathSync(stand.repo) !== fs.realpathSync(repo) || path.resolve(out).startsWith(repo + path.sep) || path.resolve(out) === repo ||
    stand.env?.FRONTEND_URL !== 'http://127.0.0.1:4477') refuse();
  const dbUrl = new URL(stand.env.DATABASE_URL);
  if (!['postgresql:', 'postgres:'].includes(dbUrl.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(dbUrl.hostname)) refuse();
  for (const key of ['DATABASE_URL', 'JWT_SECRET']) {
    if (typeof stand.env[key] !== 'string' || !stand.env[key]) refuse();
    process.env[key] = stand.env[key];
  }
  fs.mkdirSync(out, {recursive: true, mode: 0o700});
  if (fs.statSync(out).mode & 0o077) refuse();
  const actualOutput = fs.realpathSync(out), actualRepo = fs.realpathSync(repo);
  if (actualOutput === actualRepo || actualOutput.startsWith(actualRepo + path.sep)) refuse();
  const dependencies = (ports.loadServices || loadServices)(), contract = dependencies.contract;
  const bytes = fs.readFileSync(args['--qualification']), captured = JSON.parse(bytes);
  if (sha(bytes) !== contract.HGG_READ_CAPTURE_SHA_V1 || captured.provider !== 'higgsfield' || captured.schema?.digest !== contract.HGG_READ_SCHEMA_V1 ||
    captured.schema.complete !== true || captured.schema.truncated !== false || !Number.isSafeInteger(captured.accountGeneration) || captured.accountGeneration < 1) refuse();
  let plan = mode === 'catalogue' ? [{kind: 'video_catalogue'}] : contract.HGG_BASE_READS_V1;
  if (mode === 'details') {
    const base = readJson(path.join(out, 'base.receipt.private.json'));
    if (base.source !== source || base.schemaDigest !== captured.schema.digest || base.accountGeneration !== captured.accountGeneration || base.standSha256 !== sha(standBytes)) refuse();
    const selection = readJson(args['--selection']);
    if (selection.baseReceiptSha256 !== sha(fs.readFileSync(path.join(out, 'base.receipt.private.json'))) ||
      Object.keys(selection).some(k => !['baseReceiptSha256', 'videoId', 'imageId'].includes(k))) refuse();
    plan = contract.hggDetailReadsV1({...(selection.videoId ? {videoId: selection.videoId} : {}), ...(selection.imageId ? {imageId: selection.imageId} : {})}, {
      video: retainedResult(out, base, 'video_search'), image: retainedResult(out, base, 'image_search'),
    });
  }
  let quoteInput, quoteEvidence, quoteRequest;
  if (mode === 'quote') {
    const requestBytes = fs.readFileSync(args['--request']);
    if (requestBytes.length > 1024 * 1024 || sha(requestBytes) !== args['--request-sha256']) refuse();
    quoteInput = JSON.parse(requestBytes);
    quoteEvidence = {imageDetail: fs.readFileSync(args['--image-detail']), videoCatalogue: fs.readFileSync(args['--video-catalogue'])};
    quoteRequest = dependencies.quoteContract.hggPilotQuoteRequestV1(quoteInput, quoteEvidence, {
      actorId: stand.actor.userId, organizationId: stand.actor.organizationId, connectionId: captured.connectionId, accountGeneration: captured.accountGeneration,
    });
  }
  const requests = quoteRequest ? [{...quoteRequest, id: 'pilot_quote'}] : plan.map(contract.hggReadRequestV1);
  const marker = path.join(out, `${mode}.attempt.private.json`);
  if ([marker, ...requests.flatMap(r => ['attempt', 'result'].map(kind => path.join(out, `${r.id}.${kind}.private.json`)))].some(file => fs.existsSync(file))) {
    const error = new Error('VIDEO_QUALIFICATION_ALREADY_ATTEMPTED'); error.code = 'EEXIST'; throw error;
  }
  const session = dependencies.AuthService.verifySessionJWT(stand.env.CF_LOCAL_AUTH_TOKEN);
  const fetchLocal = ports.fetch || fetch;
  const response = await fetchLocal(stand.env.FRONTEND_URL + '/api/user/self', {headers: {auth: stand.env.CF_LOCAL_AUTH_TOKEN, showorg: stand.actor.organizationId}, redirect: 'error', signal: AbortSignal.timeout(20_000)});
  if (!response.ok) refuse();
  const identity = verifyIdentity(stand, session, await response.json());
  const {db, service} = dependencies.construct(mode);
  const results = [];
  try {
    const hooks = {
      beforeSession: async () => {write(marker, {source, mode, schemaDigest: captured.schema.digest, accountGeneration: captured.accountGeneration,
        standSha256: sha(standBytes), requests, ...(quoteRequest ? {requestFileSha256: args['--request-sha256']} : {}), maximumToolCalls: mode === 'base' ? 4 : mode === 'details' ? 2 : 1, automaticRetry: false});},
      beforeRead: async request => {write(path.join(out, `${request.id}.attempt.private.json`), {source, schemaDigest: captured.schema.digest, accountGeneration: captured.accountGeneration, request, automaticRetry: false});},
      afterRead: async (request, raw) => {
        const file = path.join(out, `${request.id}.result.private.json`);
        write(file, {source, schemaDigest: captured.schema.digest, accountGeneration: captured.accountGeneration, request, raw});
        results.push({id: request.id, sha256: sha(fs.readFileSync(file))});
      },
    };
    const inspected = await dependencies.withAuthenticatedSession(identity.actor, stand.env.CF_LOCAL_AUTH_TOKEN, () => mode === 'quote'
      ? service.inspect(identity.org, identity.actor, captured.connectionId, captured.accountGeneration, quoteInput, quoteEvidence, {
          beforeSession: hooks.beforeSession,
          beforeQuote: async request => {if (request.requestHash !== quoteRequest.requestHash) refuse(); await hooks.beforeRead({...request, id: 'pilot_quote'});},
          afterQuote: async (request, raw) => {await hooks.afterRead({...request, id: 'pilot_quote'}, raw);},
        })
      : service.inspect(identity.org, identity.actor, captured.connectionId, captured.accountGeneration, plan, hooks));
    write(path.join(out, `${mode}.receipt.private.json`), {source, schemaDigest: captured.schema.digest, accountGeneration: captured.accountGeneration, standSha256: sha(standBytes), results,
      ...(quoteRequest ? {requestFileSha256: args['--request-sha256'], quote: inspected.quote} : {})});
    const receipt = {source, outcome: 'captured', mode, schemaDigest: captured.schema.digest, ...(quoteRequest ? {quoteCount: results.length, inputValidated: false, paidSubmitEnabled: false} : {readCount: results.length}), walletVerified: false, generation: false, automaticRetry: false};
    write(path.join(out, `${mode}.public.json`), receipt);
    return receipt;
  } finally {await db.$disconnect();}
}
if (require.main === module) {
  let args;
  Promise.resolve().then(() => {args = parseArgs(process.argv.slice(2)); return runOperator(args);})
    .then(value => process.stdout.write(JSON.stringify(value) + '\n'))
    .catch(error => {
      const receipt = failureReceipt(error);
      if (args) {try {write(path.join(args['--output'], `${args['--mode']}.failure.public.json`), receipt);} catch { /* Never overwrite a previous attempt. */ }}
      process.stderr.write(JSON.stringify(receipt) + '\n'); process.exitCode = 1;
    });
}
module.exports = {parseArgs, verifyIdentity, retainedResult, failureReceipt, runOperator};
