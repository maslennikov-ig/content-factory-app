'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn, spawnSync } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');
const { collect } = require('../scripts/ci/jest-shards.cjs');
const SHA = 'a'.repeat(40);
const roots = [];
const temporary = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-ci-shards-'));
  roots.push(root);
  return root;
};
const write = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value));
};
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true }); });

function fixture() {
  const root = temporary();
  const input = path.join(root, 'artifacts');
  const expected = [path.join(root, 'a.test.cjs'), path.join(root, 'b.test.cjs')];
  for (const mode of ['full', 'calendar']) for (let index = 1; index <= 2; index++) {
    const dir = path.join(input, `${mode}-${index}`);
    write(path.join(dir, 'metadata.json'), { mode, index, total: 2, commit: SHA, root });
    write(path.join(dir, 'results.json'), {
      success: true, wasInterrupted: false, numFailedTests: 0, numFailedTestSuites: 0,
      numTotalTestSuites: 1, numPassedTestSuites: 1, numPendingTestSuites: 0,
      numTotalTests: 1, numPassedTests: 1, numPendingTests: 0, numTodoTests: 0,
      testResults: [{ name: expected[index - 1], status: 'passed' }],
    });
    const file = path.join(root, 'sum.cjs');
    write(path.join(dir, 'coverage-final.json'), { [file]: {
      path: file, statementMap: { 0: { start: { line: 1, column: 0 }, end: { line: 1, column: 6 } } },
      fnMap: {}, branchMap: {}, s: { 0: 1 }, f: {}, b: {},
    } });
  }
  return { root, input, expected };
}

test('combines disjoint complete native results and adds overlapping coverage counts', () => {
  const f = fixture();
  const result = collect(f.input, f.expected, SHA, f.root);
  expect(result.files).toBe(2);
  expect(result.totals.full.passed).toBe(2);
  expect(result.totals.calendar.passed).toBe(2);
  expect(result.coverage.fileCoverageFor(path.join(f.root, 'sum.cjs')).s[0]).toBe(2);
});

test('explicit local full-only collection never changes the default calendar requirement', () => {
  const f = fixture();
  for (const index of [1, 2]) fs.rmSync(path.join(f.input, `calendar-${index}`), {recursive:true});
  expect(() => collect(f.input, f.expected, SHA, f.root)).toThrow(/Missing calendar/);
  const result = collect(f.input, f.expected, SHA, f.root, {fullOnly:true});
  expect(result.totals.full.passed).toBe(2);
  expect(result.totals.calendar).toBeUndefined();
});

test.each([
  ['missing shard', f => fs.rmSync(path.join(f.input, 'full-2'), { recursive: true })],
  ['missing calendar', f => { for (const i of [1, 2]) fs.rmSync(path.join(f.input, `calendar-${i}`), { recursive: true }); }],
  ['missing coverage', f => fs.unlinkSync(path.join(f.input, 'full-1/coverage-final.json'))],
  ['wrong commit', f => edit(f, 'metadata.json', x => { x.commit = 'b'.repeat(40); })],
  ['duplicate shard', f => edit(f, 'metadata.json', x => { x.index = 2; })],
  ['failed native result', f => edit(f, 'results.json', x => { x.success = false; })],
  ['interrupted native result', f => edit(f, 'results.json', x => { x.wasInterrupted = true; })],
  ['missing test', f => edit(f, 'results.json', x => { x.testResults = []; })],
  ['duplicate test', f => edit(f, 'results.json', x => { x.testResults[0].name = f.expected[1]; })],
  ['unexpected test', f => edit(f, 'results.json', x => { x.testResults[0].name = path.join(f.root, 'other.test.cjs'); })],
  ['false totals', f => edit(f, 'results.json', x => { x.numTotalTests = 20; })],
])('refuses %s instead of making the required check green', (_, damage) => {
  const f = fixture(); damage(f);
  expect(() => collect(f.input, f.expected, SHA, f.root)).toThrow();
});
function edit(f, file, change) {
  const target = path.join(f.input, 'full-1', file);
  const value = JSON.parse(fs.readFileSync(target)); change(value); write(target, value);
}

test('real Jest native shards retain skipped/todo cases and produce mergeable coverage reports', () => {
  const root = temporary();
  fs.writeFileSync(path.join(root, 'sum.cjs'), 'module.exports = (a, b) => a + b;\n');
  for (let i = 1; i <= 4; i++) fs.writeFileSync(path.join(root, `${i}.test.cjs`),
    `const sum = require('./sum.cjs'); test('sum ${i}', () => expect(sum(${i}, 1)).toBe(${i + 1})); test.skip('skip ${i}', () => {}); test.todo('todo ${i}');\n`);
  fs.writeFileSync(path.join(root, '5.test.cjs'), "test.skip('whole skipped suite', () => {});\n");
  const config = { rootDir: root, testMatch: ['**/*.test.cjs'], testEnvironment: 'node', collectCoverageFrom: ['sum.cjs'] };
  const expected = [1, 2, 3, 4, 5].map(i => path.join(root, `${i}.test.cjs`));
  const input = path.join(root, 'artifacts');
  for (const mode of ['full', 'calendar']) for (let index = 1; index <= 2; index++) {
    const dir = path.join(input, `${mode}-${index}`); fs.mkdirSync(dir, { recursive: true });
    const result = spawnSync(process.execPath, [require.resolve('jest/bin/jest'), '--config', JSON.stringify(config), '--runInBand', '--shard', `${index}/2`, '--json', '--outputFile', path.join(dir, 'results.json'),
      ...(mode === 'full' ? ['--coverage', '--detectOpenHandles', '--coverageDirectory', dir, '--coverageReporters=json'] : ['--setupFiles', path.join(__dirname, 'helpers/time-travel.setup.cjs')])],
    { cwd: root, encoding: 'utf8', env: { ...process.env, CF_TIME_TRAVEL_DAYS: '400' }, timeout: 30000 });
    expect({ code: result.status, error: result.error?.message, tail: result.status ? result.stderr.slice(-1000) : '' }).toEqual({ code: 0, error: undefined, tail: '' });
    write(path.join(dir, 'metadata.json'), { mode, index, total: 2, commit: SHA, root });
  }
  const result = collect(input, expected, SHA, root);
  expect(result.totals.full).toMatchObject({ passed: 4, pending: 5, todo: 4, tests: 13 });
  const manifest = path.join(root, 'expected.json'); write(manifest, expected);
  const output = path.join(root, 'merged');
  const merged = spawnSync(process.execPath, [path.join(__dirname, '../scripts/ci/jest-shards.cjs'), 'aggregate', input, manifest, output],
    { cwd: root, encoding: 'utf8', env: { ...process.env, GITHUB_SHA: SHA }, timeout: 10000 });
  expect({ code: merged.status, error: merged.stderr }).toEqual({ code: 0, error: '' });
  for (const file of ['coverage-final.json', 'lcov.info', 'clover.xml', 'verification.json']) expect(fs.existsSync(path.join(output, file))).toBe(true);
}, 120000);

const runner = path.join(__dirname, '../scripts/ci/jest-shards.cjs');
const releaseFlags = ['--coverage', '--detectOpenHandles', '--reporters=default', '--reporters=jest-junit'];

function dockerStub() {
  const fs = require('node:fs'), path = require('node:path');
  const args = process.argv.slice(2);
  const [command, action] = args;
  const state = process.env.DOCKER_STUB_STATE;
  const read = id => JSON.parse(fs.readFileSync(path.join(state, id)));
  if (command === 'context' && action === 'inspect') console.log('unix:///test.sock');
  else if (command === 'image' && action === 'inspect') {
    if (!args.includes('postgres:17-alpine') || !args.includes('redis:7.2-alpine')) process.exitCode = 2;
  } else if (command === 'run') {
    const name = args[args.indexOf('--name') + 1];
    const owner = args[args.indexOf('--label') + 1];
    const [index, type] = name.split('-').slice(-2);
    const postgres = type === 'postgres';
    const expected = postgres ? '127.0.0.1::5432' : '127.0.0.1::6379';
    if (args[args.indexOf('--publish') + 1] !== expected || !args.includes('--pull=never') ||
        (postgres && !args.includes('POSTGRES_DB=cf-dev-db'))) process.exit(2);
    const id = String(Number(index) + (postgres ? 0 : 4)).repeat(64);
    const port = process.env.DOCKER_STUB_FAILURE === 'shared-port' ? 20000 : 20000 + Number(id[0]);
    fs.writeFileSync(path.join(state, id), JSON.stringify({ owner, port, type }));
    // The daemon can create a container before reporting a start failure.
    if (process.env.DOCKER_STUB_FAILURE === 'start' && id[0] === '6') process.exit(1);
    console.log(id);
  } else if (command === 'port') console.log('127.0.0.1:' + read(action).port);
  else if (command === 'exec') {
    const id = args.find(arg => /^[a-f0-9]{64}$/.test(arg));
    console.log(read(id).type === 'postgres' ? '1' : 'PONG');
  } else if (command === 'container' && action === 'ls') {
    const filter = args[args.indexOf('--filter') + 1].slice('label='.length);
    for (const id of fs.readdirSync(state)) if (read(id).owner === filter) console.log(id);
  } else if (command === 'container' && action === 'rm') {
    if (!args.includes('--force') || !args.includes('--volumes')) process.exit(2);
    for (const id of args.slice(4)) fs.unlinkSync(path.join(state, id));
  } else process.exitCode = 2;
}

function releaseFixture({ failTest = false, hold = false, wholeSkipped = false, dockerFailure = '' } = {}) {
  const root = temporary(), artifact = path.join(root, 'artifact');
  const bin = path.join(root, 'bin'), state = path.join(root, 'docker-state'), barrier = path.join(root, 'barrier');
  for (const dir of [bin, state, barrier]) fs.mkdirSync(dir);
  fs.writeFileSync(path.join(bin, 'docker'), '#!' + process.execPath + '\n(' + dockerStub.toString() + ')();\n', { mode: 0o755 });
  const foreign = 'f'.repeat(64);
  write(path.join(state, foreign), { owner: 'other-run', port: 29000 });
  fs.symlinkSync(path.resolve(__dirname, '../node_modules'), path.join(root, 'node_modules'), 'dir');
  fs.writeFileSync(path.join(root, 'sum.cjs'), 'module.exports = (a,b) => a+b;\n');
  for (let i = 1; i <= 4; i++) fs.writeFileSync(path.join(root, `${i}.test.cjs`),
    `const sum=require('./sum.cjs');test('sum',()=>expect(sum(${i},1)).toBe(${i + (failTest && i === 1 ? 2 : 1)}));test.skip('skip',()=>{});test.todo('todo');\n`);
  if (wholeSkipped) fs.writeFileSync(path.join(root, '5.test.cjs'), "test.skip('whole skipped suite',()=>{});\n");
  fs.writeFileSync(path.join(root, 'barrier.cjs'), `
    const fs = require('node:fs'), path = require('node:path');
    const { setTimeout: delay } = require('node:timers/promises');
    module.exports = async () => {
      const env = process.env;
      const dir = ${JSON.stringify(barrier)};
      const marker = path.join(dir, path.basename(env.JEST_JUNIT_OUTPUT_DIR));
      fs.writeFileSync(marker, JSON.stringify({
        pg: env.CF_TEST_PG_URL, redis: env.CF_TEST_REDIS_URL,
        heapLimit: require('node:v8').getHeapStatistics().heap_size_limit,
        ambient: [env.DATABASE_URL, env.MASTRA_DATABASE_URL, env.REDIS_URL],
        series: env.CF_SERIES_TEST_DATABASE_URL, discovery: env.CF_DISCOVERY_TEST_REDIS_URL,
      }));
      const deadline = Date.now() + 10_000;
      while (fs.readdirSync(dir).length < 4 && Date.now() < deadline) await delay(25);
      if (fs.readdirSync(dir).length !== 4) throw Error('The four native Jest processes did not reach their barrier');
      if (${hold}) await delay(60_000);
    };
  `);
  fs.writeFileSync(path.join(root, 'jest.config.cjs'), "module.exports={testMatch:['**/*.test.cjs'],testEnvironment:'node',collectCoverageFrom:['sum.cjs'],setupFiles:['<rootDir>/barrier.cjs']};\n");
  const env = {
    ...process.env, PATH: bin + path.delimiter + process.env.PATH, DOCKER_HOST: '', DOCKER_CONTEXT: '',
    NODE_OPTIONS: '--max-old-space-size=6144',
    DOCKER_STUB_STATE: state, DOCKER_STUB_FAILURE: dockerFailure,
    DATABASE_URL: 'postgresql://foreign.invalid/db', MASTRA_DATABASE_URL: 'postgresql://foreign.invalid/mastra',
    REDIS_URL: 'redis://foreign.invalid', CF_TEST_PG_URL: 'postgresql://foreign.invalid/test',
    CF_TEST_REDIS_URL: 'redis://foreign.invalid', CF_SERIES_TEST_DATABASE_URL: 'postgresql://foreign.invalid/series',
    CF_DISCOVERY_TEST_REDIS_URL: 'redis://foreign.invalid',
    CF_RELEASE_JEST_MODE: 'full', CF_RELEASE_SUITE_HEAD: SHA, CF_RELEASE_JEST_ARTIFACT_DIR: artifact,
  };
  return { root, artifact, state, foreign, barrier, env };
}

function runRelease(fixture) {
  return spawnSync(process.execPath, [runner, 'run', ...releaseFlags],
    { cwd: fixture.root, encoding: 'utf8', env: fixture.env, timeout: 90_000, maxBuffer: 8 * 1024 * 1024 });
}

function execution({ artifact }) {
  return JSON.parse(fs.readFileSync(path.join(artifact, 'execution.json')));
}

function expectRawReports({ artifact }) {
  for (let index = 1; index <= 4; index++) {
    for (const file of ['suite.log', 'results.json', 'junit.xml', 'coverage-final.json']) {
      expect(fs.statSync(path.join(artifact, `shards/full-${index}`, file)).size).toBeGreaterThan(0);
    }
  }
}

test('recorder mode overlaps four native Jest processes using distinct fixtures and reports only the merged population', () => {
  const f = releaseFixture({ wholeSkipped: true });
  const run = runRelease(f);
  expect({ status: run.status, error: run.stderr }).toEqual({ status: 0, error: '' });
  const verified = JSON.parse(fs.readFileSync(path.join(f.artifact, 'merged/verification.json')));
  expect(verified).toMatchObject({ commit: SHA, files: 5, totals: { full: { shards: 4, passed: 4, pending: 5, todo: 4, tests: 13 } } });
  expect(verified.totals.calendar).toBeUndefined();
  expect(run.stdout.match(/^Test Suites:/gm)).toHaveLength(1);
  expect(run.stdout.match(/^Tests:/gm)).toHaveLength(1);
  const { shards, fixturesCleaned } = execution(f);
  expect(fixturesCleaned).toBe(true);
  expect(shards).toHaveLength(4);
  const seen = new Set();
  for (const { index, exitCode, fixtures } of shards) {
    const marker = JSON.parse(fs.readFileSync(path.join(f.barrier, `full-${index}`)));
    expect(exitCode).toBe(0);
    expect(marker.pg).toBe(`postgresql://cf-dev:cf-dev-pwd@127.0.0.1:${fixtures.postgres.port}/cf-dev-db`);
    expect(marker.redis).toBe(`redis://127.0.0.1:${fixtures.redis.port}`);
    expect(marker.heapLimit).toBeGreaterThanOrEqual(6 * 1024 ** 3);
    expect(marker.ambient).toEqual(['', '', '']);
    expect(marker.series).toBe(marker.pg);
    expect(marker.discovery).toBe(marker.redis);
    seen.add(new URL(marker.pg).port);
    seen.add(new URL(marker.redis).port);
  }
  expect(seen.size).toBe(8);
  expect(Math.max(...shards.map(shard => shard.startedAt))).toBeLessThan(Math.min(...shards.map(shard => shard.finishedAt)));
  expect(fs.readdirSync(f.state)).toEqual([f.foreign]);
  expectRawReports(f);
}, 100_000);

test('a real failed native shard keeps all four raw results, removes its fixtures and refuses a merged summary', () => {
  const f = releaseFixture({ failTest: true });
  const run = runRelease(f);
  expect(run.status).toBe(1);
  expect(run.stdout).not.toMatch(/^Test Suites:|^Tests:/m);
  expect(fs.existsSync(path.join(f.artifact, 'merged/verification.json'))).toBe(false);
  const { shards, fixturesCleaned } = execution(f);
  expect(fixturesCleaned).toBe(true);
  expect(shards).toHaveLength(4);
  expect(shards.filter(shard => shard.exitCode === 1)).toHaveLength(1);
  expect(fs.readdirSync(f.state)).toEqual([f.foreign]);
  expectRawReports(f);
}, 100_000);

test.each([
  ['start', /Docker run failed/],
  ['shared-port', /shared local fixture port/],
])('refuses fixture %s failure before running Jest and removes only owned containers', (dockerFailure, error) => {
  const f = releaseFixture({ dockerFailure });
  const run = runRelease(f);
  expect(run.status).toBe(1);
  expect(run.stderr).toMatch(error);
  expect(run.stdout).not.toMatch(/Running complete release Jest shard|^Test Suites:/m);
  expect(execution(f).fixturesCleaned).toBe(true);
  expect(fs.readdirSync(f.state)).toEqual([f.foreign]);
}, 100_000);

test('refuses a configured opt-in database that needs a separately provisioned schema', () => {
  const f = releaseFixture();
  f.env.CF_VIDEO_DATABASE_URL = 'postgresql://private-sentinel@foreign.invalid/cf_video_v1_test';
  const run = runRelease(f);
  expect(run.status).toBe(1);
  expect(run.stderr).toMatch(/cannot isolate configured opt-in fixtures: CF_VIDEO_DATABASE_URL/);
  expect(run.stderr).not.toContain('private-sentinel');
  expect(fs.readdirSync(f.state)).toEqual([f.foreign]);
});

test.each([['SIGINT', 130], ['SIGTERM', 143]])('interrupts four native shards on %s and cleans only owned fixtures', async (signal, exitCode) => {
  const f = releaseFixture({ hold: true });
  const child = spawn(process.execPath, [runner, 'run', ...releaseFlags],
    { cwd: f.root, env: f.env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.setEncoding('utf8').on('data', data => { stdout += data; });
  child.stderr.setEncoding('utf8').on('data', data => { stderr += data; });
  const exit = new Promise(resolve => child.once('close', (code, signal) => resolve({ code, signal })));
  try {
    const deadline = Date.now() + 30_000;
    while (fs.readdirSync(f.barrier).length < 4 && child.exitCode === null && Date.now() < deadline) await delay(50);
    expect({ shards: fs.readdirSync(f.barrier).length, stderr }).toEqual({ shards: 4, stderr: '' });
    child.kill(signal);
    expect(await exit).toEqual({ code: exitCode, signal: null });
    expect(stdout).not.toMatch(/^Test Suites:|^Tests:/m);
    expect(execution(f).fixturesCleaned).toBe(true);
    expect(fs.readdirSync(f.state)).toEqual([f.foreign]);
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    await exit;
  }
}, 100_000);

test('ordinary explicit shard and discovery flags pass unchanged to native Jest; recorder mode rejects filtering',()=>{
  const root=temporary(),config=JSON.stringify({rootDir:root,testMatch:['**/*.test.cjs']});
  for(const name of ['a','b'])fs.writeFileSync(path.join(root,`${name}.test.cjs`),"test('one',()=>{});\n");
  const args=['--config',config,'--listTests','--json','--shard=1/2'];
  const env={...process.env,CF_RELEASE_JEST_MODE:''};
  const native=spawnSync(process.execPath,[require.resolve('jest/bin/jest'),...args],{cwd:root,env,encoding:'utf8',timeout:30000});
  const forwarded=spawnSync(process.execPath,[path.join(__dirname,'../scripts/ci/jest-shards.cjs'),'run',...args],{cwd:root,env,encoding:'utf8',timeout:30000});
  expect(forwarded.status).toBe(native.status);expect(JSON.parse(forwarded.stdout)).toEqual(JSON.parse(native.stdout));
  const filtered=spawnSync(process.execPath,[path.join(__dirname,'../scripts/ci/jest-shards.cjs'),'run','--testNamePattern=one'],{cwd:root,env:{...env,CF_RELEASE_JEST_MODE:'full'},encoding:'utf8'});
  expect(filtered.status).not.toBe(0);expect(filtered.stderr).toMatch(/complete|filter|flags/i);
});
