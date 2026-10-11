const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const ts = require('typescript');
const root = process.cwd(), stage = __dirname;
const digest = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const sdkFile = path.join(root, 'apps/sdk/src/index.ts');
const config = ts.readConfigFile(path.join(root, 'apps/sdk/tsconfig.json'), ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.join(root, 'apps/sdk'));
function contract(revision) {
  const source = execFileSync('git', ['show', `${revision}:apps/sdk/src/index.ts`], { encoding: 'utf8' });
  const host = ts.createCompilerHost({ ...parsed.options, noEmit: true });
  const read = host.readFile; host.readFile = name => path.resolve(name) === sdkFile ? source : read(name);
  const program = ts.createProgram(parsed.fileNames, { ...parsed.options, noEmit: true }, host);
  const checker = program.getTypeChecker();
  const klass = program.getSourceFile(sdkFile).statements.find(s => ts.isClassDeclaration(s) && s.name?.text === 'ContentFactory');
  const methods = klass.members.filter(s => ts.isMethodDeclaration(s) && ['post', 'postList', 'upload', 'integrations', 'deletePost'].includes(s.name?.text));
  return Object.fromEntries(methods.map(m => [m.name.text, checker.signatureToString(checker.getSignatureFromDeclaration(m))]));
}
(async () => {
  const baseline = '5cc169032a452b245f6e0423ceaf38cea719f169';
  const candidate = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const baselineContract = contract(baseline), candidateContract = contract(candidate);
  assert.deepEqual(candidateContract, baselineContract);
  const receipt = JSON.parse(fs.readFileSync(path.join(stage, 'delivery-receipt.json'), 'utf8'));
  for (const file of ['apps/sdk/dist/index.js', 'apps/sdk/dist/index.d.ts']) assert.equal(digest(path.join(root, file)), receipt.artifact_sha256[file]);
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-sdk-consumer-'));
  const requests = [];
  const server = http.createServer((request, response) => {
    requests.push({ method: request.method, path: request.url });
    assert.equal(request.headers.authorization, 'offline-sdk-consumer-fixture');
    request.resume();
    response.writeHead(409, { 'content-type': 'application/json', connection: 'close' });
    response.end(JSON.stringify({ code: 'CF_QUEUE_BUSY', message: 'offline fixture conflict' }));
  });
  try {
    const source = path.join(stage, 'sdk-consumer.ts');
    const options = { module: ts.ModuleKind.CommonJS, moduleResolution: ts.ModuleResolutionKind.NodeJs,
      target: ts.ScriptTarget.ES2022, strict: true, skipLibCheck: true, esModuleInterop: true,
      rootDir: root, outDir: temporary, noEmitOnError: true };
    const program = ts.createProgram([source], options);
    const diagnostics = ts.getPreEmitDiagnostics(program);
    assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCurrentDirectory: () => root, getCanonicalFileName: file => file, getNewLine: () => '\n',
    }));
    assert.equal(program.emit().emitSkipped, false);
    const sdkOutput = path.join(temporary, 'apps/sdk/dist'); fs.mkdirSync(sdkOutput, { recursive: true });
    fs.copyFileSync(path.join(root, 'apps/sdk/dist/index.js'), path.join(sdkOutput, 'index.js'));
    fs.symlinkSync(path.join(root, 'node_modules'), path.join(temporary, 'node_modules'), 'dir');
    const consumer = require(path.join(temporary, path.relative(root, source).replace(/\.ts$/, '.js')));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const legacyCode = await consumer.legacy409(baseUrl), strictStatus = await consumer.strict409(baseUrl);
    assert.equal(legacyCode, 'CF_QUEUE_BUSY'); assert.equal(strictStatus, 409);
    assert.deepEqual(requests, [{ method: 'POST', path: '/public/v1/posts' }, { method: 'POST', path: '/public/v1/posts' }]);
    const result = { baseline, candidateSourceCommit: candidate, node: process.version,
      compiler: ts.version, sourceSha256: digest(sdkFile), declarationSha256: digest(path.join(root, 'apps/sdk/dist/index.d.ts')),
      baselinePublicMethods: baselineContract, candidatePublicMethods: candidateContract,
      declarationsCompatible: true, twoArgumentConstructorConsumerCompiled: true,
      jsonAndErrorBodyRemainUnknown: true, optInErrorTyped: true,
      runtime: { transport: 'isolated loopback HTTP fixture only', sdk: 'genuine built CommonJS artifact, byte-identical copy', consumer: 'actual strict TypeScript compiler output', requests: requests.length, legacy409Code: legacyCode, optInStatus: strictStatus },
      externalProviderCalls: 0 };
    fs.writeFileSync(path.join(stage, 'sdk-compatibility.actual.json'), JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify({ ok: true, declarationsCompatible: true, typedConsumerCompiled: true, compiledRuntime409: true }));
  } finally {
    if (server.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    fs.rmSync(temporary, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
