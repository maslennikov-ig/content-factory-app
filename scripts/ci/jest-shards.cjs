#!/usr/bin/env node
'use strict';

// Jest owns discovery, partitioning and execution. This joins native results
// and refuses incomplete input before the required check can become green.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { constants } = require('node:os');
const { createCoverageMap } = require('istanbul-lib-coverage');
const { createContext } = require('istanbul-lib-report');
const reports = require('istanbul-reports');
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const shaOf = () => {
  assert.match(process.env.GITHUB_SHA || '', /^[a-f0-9]{40}$/);
  return process.env.GITHUB_SHA;
};

function record(mode, shard, directory, commit = shaOf()) {
  assert.match(commit, /^[a-f0-9]{40}$/);
  assert(['full', 'calendar'].includes(mode));
  assert.match(shard, /^[1-9]\d*\/[1-9]\d*$/);
  const [index, total] = shard.split('/').map(Number);
  assert(index <= total);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'metadata.json'), JSON.stringify({
    mode, index, total, commit, root: process.cwd(),
  }));
}

function collect(input, expected, commit, root, { fullOnly = false } = {}) {
  const normalize = (file, base) => {
    const relative = path.relative(base, file).split(path.sep).join('/');
    assert(relative && !relative.startsWith('../') && !path.isAbsolute(relative), 'Test outside checkout');
    return relative;
  };
  const wanted = new Set(expected.map((file) => normalize(file, root)));
  assert(wanted.size > 0 && wanted.size === expected.length, 'Invalid discovery manifest');
  const groups = fullOnly ? { full: [] } : { full: [], calendar: [] };
  for (const entry of fs.readdirSync(input, { withFileTypes: true })) {
    assert(entry.isDirectory(), 'Unexpected artifact entry');
    const directory = path.join(input, entry.name);
    const meta = read(path.join(directory, 'metadata.json'));
    assert(groups[meta.mode] && meta.commit === commit, 'Wrong mode or commit');
    assert(Number.isInteger(meta.total) && meta.total > 0);
    assert(Number.isInteger(meta.index) && meta.index > 0 && meta.index <= meta.total);
    const result = read(path.join(directory, 'results.json'));
    assert(result.success === true && !result.wasInterrupted, 'Jest did not pass');
    assert(result.numFailedTests === 0 && result.numFailedTestSuites === 0, 'Failed tests');
    assert(result.testResults.length === result.numTotalTestSuites, 'Incomplete Jest result');
    groups[meta.mode].push({ meta, result, directory });
  }
  const coverage = createCoverageMap({});
  const totals = {};
  for (const [mode, shards] of Object.entries(groups)) {
    assert(shards.length > 0, `Missing ${mode} artifacts`);
    const total = shards[0].meta.total;
    assert(shards.length === total, `Missing ${mode} shard`);
    const indexes = new Set();
    const seen = new Set();
    const sums = { suites: 0, passedSuites: 0, pendingSuites: 0, tests: 0, passed: 0, pending: 0, todo: 0 };
    for (const { meta, result, directory } of shards) {
      assert(meta.total === total && !indexes.has(meta.index), 'Duplicate/inconsistent shard');
      indexes.add(meta.index);
      for (const test of result.testResults) {
        const file = normalize(test.name, meta.root);
        assert(wanted.has(file) && !seen.has(file), `Unexpected/duplicate test: ${file}`);
        // Jest's formatted JSON calls a successful suite containing skipped
        // cases "focused", and a wholly skipped suite "skipped".
        assert(['passed', 'focused', 'skipped'].includes(test.status), `Invalid test status: ${file}`);
        seen.add(file);
      }
      for (const [to, from] of Object.entries({ suites: 'numTotalTestSuites', passedSuites: 'numPassedTestSuites', pendingSuites: 'numPendingTestSuites', tests: 'numTotalTests', passed: 'numPassedTests', pending: 'numPendingTests', todo: 'numTodoTests' })) {
        assert(Number.isInteger(result[from]) && result[from] >= 0, `Missing ${from}`);
        sums[to] += result[from];
      }
      if (mode === 'full') {
        const current = createCoverageMap(read(path.join(directory, 'coverage-final.json')));
        assert(current.files().length > 0, 'Missing coverage');
        // Every artifact comes from this exact source; relocate native absolute
        // coverage paths if a runner checked it out in a different directory.
        for (const file of current.files()) {
          const data = current.fileCoverageFor(file).toJSON();
          data.path = path.resolve(root, normalize(file, meta.root));
          coverage.addFileCoverage(data);
        }
      }
    }
    assert(seen.size === wanted.size && [...wanted].every((file) => seen.has(file)), `Missing ${mode} test files`);
    assert(sums.tests === sums.passed + sums.pending + sums.todo, 'Inconsistent test totals');
    assert(sums.suites === sums.passedSuites + sums.pendingSuites, 'Inconsistent suite totals');
    totals[mode] = { ...sums, shards: total };
  }
  return { coverage, totals, files: wanted.size };
}

function summary(full) {
  return [
    `Test Suites: ${full.pendingSuites} skipped, ${full.passedSuites} passed, ${full.suites} total`,
    `Tests:       ${full.pending} skipped, ${full.todo} todo, ${full.passed} passed, ${full.tests} total`,
  ];
}

function aggregate(input, manifest, output, { fullOnly = false, commit = shaOf() } = {}) {
  const { coverage, totals, files } = collect(input, read(manifest), commit, process.cwd(), { fullOnly });
  fs.mkdirSync(output, { recursive: true });
  const context = createContext({ dir: output, coverageMap: coverage });
  // Same report formats as Jest's defaults, now for the complete combined run.
  for (const name of ['json', 'lcov', 'text', 'clover']) reports.create(name).execute(context);
  fs.writeFileSync(path.join(output, 'verification.json'), JSON.stringify({
    commit, files, totals, coverageFiles: coverage.files().length,
  }, null, 2));
  console.log(summary(totals.full).join('\n'));
  if (!fullOnly) console.log(`Calendar: ${totals.calendar.passed} passed; exact ${files}-file membership verified in both modes.`);
}

const releaseFlags = ['--coverage', '--detectOpenHandles', '--reporters=default', '--reporters=jest-junit'];
const exitCodeOf = (result) => result.status ?? (result.signal ? 128 + constants.signals[result.signal] : 1);
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2));
const nonempty = (file) => assert(fs.statSync(file).isFile() && fs.statSync(file).size > 0, `Missing artifact: ${file}`);

// Ordinary invocations, including CI --shard and discovery, remain native Jest.
// Only the release recorder opts into a bounded complete local run.
function run(args) {
  const jest = require.resolve('jest/bin/jest');
  if (!process.env.CF_RELEASE_JEST_MODE) {
    return exitCodeOf(spawnSync(process.execPath, [jest, ...args], { stdio: 'inherit' }));
  }
  assert(process.env.CF_RELEASE_JEST_MODE === 'full', 'Unknown release Jest mode');
  assert.deepEqual(args, releaseFlags, 'Complete release mode requires the canonical flags; filtering/overrides are forbidden');
  const commit = process.env.CF_RELEASE_SUITE_HEAD;
  assert.match(commit || '', /^[a-f0-9]{40}$/);
  const directory = process.env.CF_RELEASE_JEST_ARTIFACT_DIR;
  assert(directory && path.isAbsolute(directory), 'Absolute fresh artifact directory required');
  fs.mkdirSync(directory); // Refuse reuse: even a failed prior run is evidence.
  const execution = { commit, root: process.cwd(), shards: [] };
  const executionFile = path.join(directory, 'execution.json');
  write(executionFile, execution);
  const discoveryOut = fs.openSync(path.join(directory, 'discovery.json'), 'wx');
  const discoveryErr = fs.openSync(path.join(directory, 'discovery.log'), 'wx');
  let discovery;
  try {
    discovery = spawnSync(process.execPath, [jest, '--listTests', '--json'], { stdio: ['ignore', discoveryOut, discoveryErr] });
  } finally { fs.closeSync(discoveryOut); fs.closeSync(discoveryErr); }
  execution.discoveryExitCode = exitCodeOf(discovery);
  write(executionFile, execution);
  if (execution.discoveryExitCode) return execution.discoveryExitCode;
  const expected = read(path.join(directory, 'discovery.json'));
  assert(Array.isArray(expected) && expected.length > 0, 'Empty discovery population');
  write(path.join(directory, 'expected.json'), expected);
  const input = path.join(directory, 'shards');
  fs.mkdirSync(input);
  let failed = 0;
  for (let index = 1; index <= 4; index++) {
    const shardDir = path.join(input, `full-${index}`);
    record('full', `${index}/4`, shardDir, commit);
    const shard = { index, startedAt: Date.now() };
    execution.shards.push(shard); write(executionFile, execution);
    console.log(`Running complete release Jest shard ${index}/4; raw output: ${path.join(shardDir, 'suite.log')}`);
    const fd = fs.openSync(path.join(shardDir, 'suite.log'), 'wx');
    let result;
    try {
      result = spawnSync(process.execPath, [jest, ...args, `--shard=${index}/4`, '--json',
        `--outputFile=${path.join(shardDir, 'results.json')}`, `--coverageDirectory=${shardDir}`], {
        stdio: ['ignore', fd, fd],
        env: { ...process.env, JEST_JUNIT_OUTPUT_DIR: shardDir, JEST_JUNIT_OUTPUT_NAME: 'junit.xml', JEST_JUNIT_OUTPUT_FILE: path.join(shardDir, 'junit.xml') },
      });
    } finally { fs.closeSync(fd); }
    Object.assign(shard, { finishedAt: Date.now(), exitCode: exitCodeOf(result), signal: result.signal, error: result.error?.message });
    write(executionFile, execution);
    failed ||= shard.exitCode;
  }
  if (failed) return failed;
  // Raw shard summaries never enter the canonical log. Only the exact complete
  // discovered population, validated with native results and coverage, does.
  aggregate(input, path.join(directory, 'expected.json'), path.join(directory, 'merged'), { fullOnly: true, commit });
  verifyLocal(directory, commit);
  return 0;
}

// The recorder reads this independently after the entire Jest→Node→Python chain.
// It cannot accept a stray first-shard summary in place of complete verification.
function verifyLocal(directory, commit) {
  assert.match(commit, /^[a-f0-9]{40}$/);
  const execution = read(path.join(directory, 'execution.json'));
  assert(execution.commit === commit && execution.root === process.cwd() && execution.discoveryExitCode === 0, 'Wrong local execution');
  assert(execution.shards.length === 4, 'Missing local execution shard');
  for (const [offset, shard] of execution.shards.entries()) {
    assert(shard.index === offset + 1 && shard.exitCode === 0 && !shard.signal && !shard.error, 'Failed local execution shard');
    assert(Number.isFinite(shard.startedAt) && shard.finishedAt >= shard.startedAt, 'Invalid shard timing');
    if (offset) assert(shard.startedAt >= execution.shards[offset - 1].finishedAt, 'Concurrent local shards');
    for (const file of ['suite.log', 'results.json', 'junit.xml', 'coverage-final.json']) nonempty(path.join(directory, `shards/full-${shard.index}`, file));
  }
  const expected = read(path.join(directory, 'expected.json'));
  assert.deepEqual(expected, read(path.join(directory, 'discovery.json')), 'Discovery manifest changed');
  const { coverage, totals, files } = collect(path.join(directory, 'shards'), expected, commit, process.cwd(), { fullOnly: true });
  assert(totals.full.shards === 4, 'Local run must contain four shards');
  assert.deepEqual(read(path.join(directory, 'merged/verification.json')), { commit, files, totals, coverageFiles: coverage.files().length }, 'Merged verification changed');
  assert.deepEqual(createCoverageMap(read(path.join(directory, 'merged/coverage-final.json'))).toJSON(), coverage.toJSON(), 'Merged coverage changed');
  return summary(totals.full);
}

module.exports = { record, collect, aggregate, run, verifyLocal };
if (require.main === module) {
  try {
    const [action, ...args] = process.argv.slice(2);
    assert(['record', 'aggregate', 'run', 'verify-local'].includes(action));
    if (action === 'record') record(...args);
    else if (action === 'aggregate') aggregate(...args);
    else if (action === 'verify-local') console.log(verifyLocal(...args).join('\n'));
    else process.exitCode = run(args);
  } catch (error) {
    console.error(`Incomplete sharded suite: ${error.message}`);
    process.exitCode = 1;
  }
}
