const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), cp = require('node:child_process'), crypto = require('node:crypto');
const runner = require('../scripts/operations/hgg-qualification-reads.cjs');
const {loadTypeScriptModule} = require('./helpers/load-ts-module.cjs');
const contract = loadTypeScriptModule('libraries/nestjs-libraries/src/videos/subscriptions/video-hgg-qualification-read.v1.ts');
const {AuthService} = loadTypeScriptModule('libraries/helpers/src/auth/auth.service.ts');
const {withAuthenticatedSession} = loadTypeScriptModule('libraries/nestjs-libraries/src/user/authenticated.session.ts');
const repo = path.resolve(__dirname, '..'), source = 'a'.repeat(40);
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const model = type => ({id: `synthetic-${type}`, name: 'Invented model', provider_name: 'Synthetic', description: 'Not provider proof', output_type: type, parameters: [], medias: [], aspect_ratios: ['9:16']});
let tmp, stand, args, ports, inspect, fetchLocal, disconnect, oldEnv;
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value), {mode: 0o600});
beforeEach(() => {
  oldEnv = Object.fromEntries(['DATABASE_URL', 'JWT_SECRET'].map(k => [k, process.env[k]]));
  process.env.JWT_SECRET = 'operator-runner-test-only';
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-qualification-runner-'));
  stand = {repo, actor: {userId: 'actor', organizationId: 'org'}, env: {FRONTEND_URL: 'http://127.0.0.1:4477', DATABASE_URL: 'postgresql://test:test@127.0.0.1:39004/fixture', JWT_SECRET: process.env.JWT_SECRET,
    CF_LOCAL_AUTH_TOKEN: AuthService.signSessionJWT({id: 'actor', activated: true})}};
  write(path.join(tmp, 'stand.json'), stand);
  const capture = {connectionId: 'owned-connection', provider: 'higgsfield', accountGeneration: 1, schema: {digest: contract.HGG_READ_SCHEMA_V1, complete: true, truncated: false}};
  write(path.join(tmp, 'capture.json'), capture);
  args = runner.parseArgs(['--mode', 'base', '--stand', path.join(tmp, 'stand.json'), '--qualification', path.join(tmp, 'capture.json'), '--output', path.join(tmp, 'output'), '--expected-source', source]);
  jest.spyOn(cp, 'execFileSync').mockImplementation((_cmd, values) => values[0] === 'rev-parse' ? source + '\n' : '');
  inspect = jest.fn(async (_org, _actor, _connection, _generation, plan, hooks) => {
    await hooks.beforeSession();
    for (const command of plan) {
      const request = contract.hggReadRequestV1(command);
      await hooks.beforeRead(request);
      await hooks.afterRead(request, command.kind === 'video_search' ? {items: [model('video')]} : command.kind === 'image_search' ? {items: [model('image')]} : {});
    }
  });
  disconnect = jest.fn(async () => {});
  fetchLocal = jest.fn(async () => ({ok: true, json: async () => ({id: 'actor', orgId: 'org', activated: true})}));
  ports = {fetch: fetchLocal, loadServices: () => ({AuthService, withAuthenticatedSession,
    contract: {...contract, HGG_READ_CAPTURE_SHA_V1: sha(fs.readFileSync(args['--qualification']))},
    construct: () => ({db: {$disconnect: disconnect}, service: {inspect}}),
  })};
});
afterEach(() => {
  jest.restoreAllMocks(); fs.rmSync(tmp, {recursive: true, force: true});
  for (const [key, value] of Object.entries(oldEnv)) {if (value === undefined) delete process.env[key]; else process.env[key] = value;}
});

test('base execution is four frozen reads with private wx artifacts; replay stops before even local session fetch', async () => {
  const receipt = await runner.runOperator(args, ports);
  expect(receipt).toMatchObject({outcome: 'captured', readCount: 4, generation: false, walletVerified: false});
  expect(inspect).toHaveBeenCalledTimes(1); expect(inspect.mock.calls[0].slice(0, 5)).toEqual(['org', 'actor', 'owned-connection', 1, contract.HGG_BASE_READS_V1]);
  expect(disconnect).toHaveBeenCalledTimes(1);
  const out = args['--output'];
  for (const file of fs.readdirSync(out)) expect(fs.statSync(path.join(out, file)).mode & 0o777).toBe(0o600);
  const saved = fs.readFileSync(path.join(out, 'base.receipt.private.json'));
  expect(saved.toString()).not.toContain(stand.env.CF_LOCAL_AUTH_TOKEN);
  await expect(runner.runOperator(args, ports)).rejects.toMatchObject({code: 'EEXIST'});
  expect(fetchLocal).toHaveBeenCalledTimes(1); expect(inspect).toHaveBeenCalledTimes(1);
});

test('catalogue CLI mode is a single frozen list request and preserves the existing wx replay fence', async () => {
  args = runner.parseArgs(['--mode', 'catalogue', '--stand', args['--stand'], '--qualification', args['--qualification'], '--output', args['--output'], '--expected-source', source]);
  const receipt = await runner.runOperator(args, ports);
  expect(receipt.readCount).toBe(1); expect(inspect.mock.calls[0][4]).toEqual([{kind: 'video_catalogue'}]);
  const marker = JSON.parse(fs.readFileSync(path.join(args['--output'], 'catalogue.attempt.private.json')));
  expect(marker.maximumToolCalls).toBe(1);
  expect(marker.requests).toEqual([{id: 'video_catalogue', tool: 'models_explore', arguments: {action: 'list', type: 'video', input: 'image', limit: 100}}]);
  await expect(runner.runOperator(args, ports)).rejects.toMatchObject({code: 'EEXIST'});
  expect(fetchLocal).toHaveBeenCalledTimes(1);
});

test('details only accept explicit root selections tied to retained base hashes and matching type', async () => {
  await runner.runOperator(args, ports); inspect.mockClear();
  args['--mode'] = 'details'; args['--selection'] = path.join(tmp, 'selection.json');
  write(args['--selection'], {baseReceiptSha256: sha(fs.readFileSync(path.join(args['--output'], 'base.receipt.private.json'))), videoId: 'synthetic-video'});
  await runner.runOperator(args, ports);
  expect(inspect.mock.calls[0][4]).toEqual([{kind: 'video_model', modelId: 'synthetic-video'}]);
  expect(fs.existsSync(path.join(args['--output'], 'image_model.attempt.private.json'))).toBe(false);
});

test('tampered catalogue or forged selected model is refused before additional session/provider calls', async () => {
  await runner.runOperator(args, ports); inspect.mockClear(); fetchLocal.mockClear();
  args['--mode'] = 'details'; args['--selection'] = path.join(tmp, 'selection.json');
  write(args['--selection'], {baseReceiptSha256: sha(fs.readFileSync(path.join(args['--output'], 'base.receipt.private.json'))), videoId: 'not-returned'});
  await expect(runner.runOperator(args, ports)).rejects.toThrow();
  write(path.join(args['--output'], 'video_search.result.private.json'), {raw: {items: [model('video')]}});
  write(args['--selection'], {baseReceiptSha256: sha(fs.readFileSync(path.join(args['--output'], 'base.receipt.private.json'))), videoId: 'synthetic-video'});
  await expect(runner.runOperator(args, ports)).rejects.toThrow('VIDEO_QUALIFICATION_RUN_INVALID');
  expect(fetchLocal).not.toHaveBeenCalled(); expect(inspect).not.toHaveBeenCalled();
});

test.each(['actor', 'org', 'inactive', 'purpose'])('forged or invalid %s context cannot reach services', async boundary => {
  if (boundary === 'purpose') {stand.env.CF_LOCAL_AUTH_TOKEN = AuthService.signJWT({id: 'actor', purpose: 'password_reset'}); write(args['--stand'], stand);}
  else fetchLocal.mockResolvedValue({ok: true, json: async () => ({id: boundary === 'actor' ? 'foreign' : 'actor', orgId: boundary === 'org' ? 'foreign' : 'org', activated: boundary !== 'inactive'})});
  await expect(runner.runOperator(args, ports)).rejects.toThrow();
  expect(inspect).not.toHaveBeenCalled();
  expect(fs.existsSync(path.join(args['--output'], 'base.attempt.private.json'))).toBe(false);
});

test('partial failure retains attempts and results, disconnects and cannot silently replay', async () => {
  inspect.mockImplementation(async (_o, _a, _c, _g, plan, hooks) => {await hooks.beforeSession(); await hooks.beforeRead(contract.hggReadRequestV1(plan[0])); throw new Error('private failure text');});
  await expect(runner.runOperator(args, ports)).rejects.toThrow();
  expect(disconnect).toHaveBeenCalledTimes(1);
  expect(fs.existsSync(path.join(args['--output'], 'workspaces.attempt.private.json'))).toBe(true);
  expect(fs.existsSync(path.join(args['--output'], 'base.receipt.private.json'))).toBe(false);
  await expect(runner.runOperator(args, ports)).rejects.toMatchObject({code: 'EEXIST'});
  expect(inspect).toHaveBeenCalledTimes(1);
});

test('CLI accepts no actor, org, arbitrary tool, query or response-budget arguments', () => {
  for (const flag of ['--actor', '--org', '--tool', '--query', '--maximum-bytes']) expect(() => runner.parseArgs([flag, 'forged'])).toThrow();
});

test.each(['VIDEO_RESPONSE_TOO_LARGE', 'VIDEO_RESPONSE_TIMEOUT'])('failure receipt retains only safe local %s phase and counters', code => {
  const receipt = runner.failureReceipt({getResponse: () => ({code, qualification: {phase: 'tools/list', maximumBytes: 8388608, observedBytes: 8388609,
    providerText: 'PRIVATE REMOTE TEXT', token: 'PRIVATE TOKEN'}})});
  expect(receipt.qualification).toEqual({phase: 'tools/list', maximumBytes: 8388608, observedBytes: 8388609});
  expect(JSON.stringify(receipt)).not.toContain('PRIVATE');
});

test('unrecognized code, phase, cap or byte counter never becomes a diagnostic payload', () => {
  const safe = {phase: 'qualification/read', maximumBytes: 1048576, observedBytes: 0};
  for (const q of [{...safe, phase: 'PRIVATE REMOTE TEXT'}, {...safe, maximumBytes: 1e12}, {...safe, observedBytes: NaN}, {...safe, observedBytes: -1}]) {
    expect(runner.failureReceipt({getResponse: () => ({code: 'VIDEO_RESPONSE_TIMEOUT', qualification: q})})).not.toHaveProperty('qualification');
  }
  expect(runner.failureReceipt({getResponse: () => ({code: 'VIDEO_UNRELATED_ERROR', qualification: safe})})).not.toHaveProperty('qualification');
  expect(runner.failureReceipt(new Error('PRIVATE REMOTE TEXT'))).toMatchObject({code: 'VIDEO_QUALIFICATION_RUN_FAILED'});
});

function configureQuote(raw = {cost: {credits: 4, credits_exact: 4.5}}) {
  const f = require('./helpers/hgg-pilot-quote-fixture.cjs');
  const input = {...f.imageInput, settings: {variant: 'flare', quality: 'high', resolution: '2k'}};
  args = runner.parseArgs(['--mode', 'quote', '--stand', args['--stand'], '--qualification', args['--qualification'], '--output', args['--output'], '--expected-source', source,
    '--request', path.join(tmp, 'quote-input.json'), '--request-sha256', sha(Buffer.from(JSON.stringify(input))), '--image-detail', path.join(tmp, 'image.json'), '--video-catalogue', path.join(tmp, 'video.json')]);
  write(args['--request'], input); fs.writeFileSync(args['--image-detail'], f.evidence.imageDetail); fs.writeFileSync(args['--video-catalogue'], f.evidence.videoCatalogue);
  const capture = JSON.parse(fs.readFileSync(args['--qualification'])); capture.schema.digest = f.pins.schemaDigest; write(args['--qualification'], capture);
  const original = ports.loadServices;
  ports.loadServices = () => {const dependencies = original(); return {...dependencies, contract: {...dependencies.contract, HGG_READ_SCHEMA_V1: f.pins.schemaDigest}, quoteContract: f.contract};};
  inspect.mockImplementation(async (org, actor, connectionId, accountGeneration, input, evidence, hooks) => {
    const request = f.contract.hggPilotQuoteRequestV1(input, evidence, {organizationId: org, actorId: actor, connectionId, accountGeneration});
    await hooks.beforeSession(); await hooks.beforeQuote(request); await hooks.afterQuote(request, raw);
    return {quote: f.contract.decodeHggPilotQuoteV1(request, raw)};
  });
  return {input, f};
}

test('one cost-only quote is pinned to request bytes, source and private evidence; public receipt carries no price or model ID', async () => {
  configureQuote();
  const result = await runner.runOperator(args, ports);
  expect(result).toMatchObject({outcome: 'captured', quoteCount: 1, inputValidated: false, paidSubmitEnabled: false, generation: false});
  expect(JSON.stringify(result)).not.toContain('synthetic-image'); expect(result).not.toHaveProperty('cost');
  const out = args['--output'], receipt = JSON.parse(fs.readFileSync(path.join(out, 'quote.receipt.private.json')));
  expect(receipt.quote.cost).toEqual({credits: 4, creditsExact: 4.5}); expect(receipt.requestFileSha256).toBe(args['--request-sha256']);
  const marker = JSON.parse(fs.readFileSync(path.join(out, 'quote.attempt.private.json')));
  expect(marker.maximumToolCalls).toBe(1); expect(marker.requests[0].arguments.params).toMatchObject({get_cost: true, quality: 'high', resolution: '2k'});
  expect(receipt.results[0].sha256).toBe(sha(fs.readFileSync(path.join(out, 'pilot_quote.result.private.json'))));
  for (const file of fs.readdirSync(out)) expect(fs.statSync(path.join(out, file)).mode & 0o777).toBe(0o600);
  await expect(runner.runOperator(args, ports)).rejects.toMatchObject({code: 'EEXIST'});
  expect(fetchLocal).toHaveBeenCalledTimes(1); expect(inspect).toHaveBeenCalledTimes(1);
});
test.each(['request', 'evidence'])('changed quote %s stops before local identity fetch or services', async kind => {
  configureQuote(); fs.appendFileSync(args[kind === 'request' ? '--request' : '--image-detail'], ' ');
  await expect(runner.runOperator(args, ports)).rejects.toThrow();
  expect(fetchLocal).not.toHaveBeenCalled(); expect(inspect).not.toHaveBeenCalled();
});
test('rejected quote retains exact raw response and attempt, never emits a success receipt or permits replay', async () => {
  configureQuote({cost: {credits: 1, credits_exact: 1}, adjustments: {quality: {requested: 'high', used: 'max', reason: 'provider changed'}}});
  await expect(runner.runOperator(args, ports)).rejects.toThrow();
  expect(fs.existsSync(path.join(args['--output'], 'pilot_quote.result.private.json'))).toBe(true);
  expect(fs.existsSync(path.join(args['--output'], 'quote.receipt.private.json'))).toBe(false);
  await expect(runner.runOperator(args, ports)).rejects.toMatchObject({code: 'EEXIST'}); expect(inspect).toHaveBeenCalledTimes(1);
});
test('quote-only flags cannot expand read modes or omit a frozen request hash', () => {
  expect(() => runner.parseArgs([...Object.entries(args).flat(), '--request', '/tmp/request.json'])).toThrow();
  configureQuote(); const argv = Object.entries(args).filter(([k]) => k !== '--request-sha256').flat();
  expect(() => runner.parseArgs(argv)).toThrow();
});
test('canonical output path cannot resolve through a symlink back into Git', async () => {
  configureQuote();
  const original = fs.realpathSync;
  jest.spyOn(fs, 'realpathSync').mockImplementation(file => String(file) === args['--output'] ? path.join(repo, 'private-output') : original(file));
  await expect(runner.runOperator(args, ports)).rejects.toThrow('VIDEO_QUALIFICATION_RUN_INVALID');
  expect(fetchLocal).not.toHaveBeenCalled(); expect(inspect).not.toHaveBeenCalled();
});
