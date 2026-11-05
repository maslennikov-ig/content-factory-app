'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
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

test('recorder-only local mode executes four native shards sequentially and reports the verified whole population once', () => {
  const root = temporary(), artifact = path.join(root, 'artifact');
  fs.symlinkSync(path.resolve(__dirname, '../node_modules'), path.join(root, 'node_modules'), 'dir');
  fs.writeFileSync(path.join(root, '.gitignore'), '/node_modules\n/artifact\n');
  fs.writeFileSync(path.join(root, 'sum.cjs'), 'module.exports = (a,b) => a+b;\n');
  for (let i=1;i<=4;i++) fs.writeFileSync(path.join(root, `${i}.test.cjs`), `const sum=require('./sum.cjs');test('sum',()=>expect(sum(${i},1)).toBe(${i+1}));test.skip('skip',()=>{});test.todo('todo');\n`);
  fs.writeFileSync(path.join(root, '5.test.cjs'), "test.skip('whole skipped suite',()=>{});\n");
  fs.writeFileSync(path.join(root, 'jest.config.cjs'), "module.exports={testMatch:['**/*.test.cjs'],testEnvironment:'node',collectCoverageFrom:['sum.cjs']};\n");
  const env = {...process.env, GIT_AUTHOR_NAME:'test',GIT_COMMITTER_NAME:'test',GIT_AUTHOR_EMAIL:'test@example.invalid',GIT_COMMITTER_EMAIL:'test@example.invalid'};
  for (const args of [['init','-q'],['add','-A'],['commit','-qm','fixture']]) expect(spawnSync('git',args,{cwd:root,env}).status).toBe(0);
  const head=spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).stdout.trim();
  const args=['--coverage','--detectOpenHandles','--reporters=default','--reporters=jest-junit'];
  const run=spawnSync(process.execPath,[path.join(__dirname,'../scripts/ci/jest-shards.cjs'),'run',...args],{cwd:root,encoding:'utf8',env:{...env,CF_RELEASE_JEST_MODE:'full',CF_RELEASE_SUITE_HEAD:head,CF_RELEASE_JEST_ARTIFACT_DIR:artifact},timeout:90000,maxBuffer:8*1024*1024});
  expect({status:run.status,error:run.stderr}).toEqual({status:0,error:''});
  const verified=JSON.parse(fs.readFileSync(path.join(artifact,'merged/verification.json')));
  expect(verified).toMatchObject({commit:head,files:5,totals:{full:{shards:4,passed:4,pending:5,todo:4,tests:13}}});
  expect(verified.totals.calendar).toBeUndefined();
  expect(run.stdout.match(/^Test Suites:/gm)).toHaveLength(1);
  expect(run.stdout.match(/^Tests:/gm)).toHaveLength(1);
  const runs=JSON.parse(fs.readFileSync(path.join(artifact,'execution.json'))).shards;
  expect(runs).toHaveLength(4);
  for(let index=0;index<4;index++){
    expect(runs[index].index).toBe(index+1);expect(runs[index].exitCode).toBe(0);
    if(index)expect(runs[index].startedAt).toBeGreaterThanOrEqual(runs[index-1].finishedAt);
    for(const file of ['suite.log','results.json','junit.xml','coverage-final.json'])expect(fs.statSync(path.join(artifact,`shards/full-${index+1}`,file)).size).toBeGreaterThan(0);
  }
},100000);

test('a real failed native shard keeps all four raw results and emits no successful canonical summary',()=>{
  const root=temporary(),artifact=path.join(root,'artifact');
  fs.symlinkSync(path.resolve(__dirname,'../node_modules'),path.join(root,'node_modules'),'dir');
  fs.writeFileSync(path.join(root,'sum.cjs'),'module.exports=(a,b)=>a+b;\n');
  for(let i=1;i<=4;i++)fs.writeFileSync(path.join(root,`${i}.test.cjs`),`const sum=require('./sum.cjs');test('sum',()=>expect(sum(1,1)).toBe(${i===1?3:2}));\n`);
  fs.writeFileSync(path.join(root,'jest.config.cjs'),"module.exports={testMatch:['**/*.test.cjs'],testEnvironment:'node',collectCoverageFrom:['sum.cjs']};\n");
  const result=spawnSync(process.execPath,[path.join(__dirname,'../scripts/ci/jest-shards.cjs'),'run','--coverage','--detectOpenHandles','--reporters=default','--reporters=jest-junit'],{
    cwd:root,encoding:'utf8',env:{...process.env,CF_RELEASE_JEST_MODE:'full',CF_RELEASE_SUITE_HEAD:SHA,CF_RELEASE_JEST_ARTIFACT_DIR:artifact},timeout:90000,
  });
  expect(result.status).toBe(1);expect(result.stdout).not.toMatch(/^Test Suites:|^Tests:/m);
  expect(fs.existsSync(path.join(artifact,'merged/verification.json'))).toBe(false);
  const shards=JSON.parse(fs.readFileSync(path.join(artifact,'execution.json'))).shards;
  expect(shards).toHaveLength(4);expect(shards.filter(s=>s.exitCode===1)).toHaveLength(1);
  for(let index=1;index<=4;index++)for(const file of ['suite.log','results.json','junit.xml','coverage-final.json'])expect(fs.statSync(path.join(artifact,`shards/full-${index}`,file)).size).toBeGreaterThan(0);
},100000);

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
