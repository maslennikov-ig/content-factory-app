#!/usr/bin/env node
'use strict';

// Jest owns discovery, partitioning and execution. This joins native results
// and refuses incomplete input before the required check can become green.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createCoverageMap } = require('istanbul-lib-coverage');
const { createContext } = require('istanbul-lib-report');
const reports = require('istanbul-reports');
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const shaOf = () => {
  assert.match(process.env.GITHUB_SHA || '', /^[a-f0-9]{40}$/);
  return process.env.GITHUB_SHA;
};

function record(mode, shard, directory) {
  assert(['full', 'calendar'].includes(mode));
  assert.match(shard, /^[1-9]\d*\/[1-9]\d*$/);
  const [index, total] = shard.split('/').map(Number);
  assert(index <= total);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'metadata.json'), JSON.stringify({
    mode, index, total, commit: shaOf(), root: process.cwd(),
  }));
}

function collect(input, expected, commit, root) {
  const normalize = (file, base) => {
    const relative = path.relative(base, file).split(path.sep).join('/');
    assert(relative && !relative.startsWith('../') && !path.isAbsolute(relative), 'Test outside checkout');
    return relative;
  };
  const wanted = new Set(expected.map((file) => normalize(file, root)));
  assert(wanted.size > 0 && wanted.size === expected.length, 'Invalid discovery manifest');
  const groups = { full: [], calendar: [] };
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

function aggregate(input, manifest, output) {
  const { coverage, totals, files } = collect(input, read(manifest), shaOf(), process.cwd());
  fs.mkdirSync(output, { recursive: true });
  const context = createContext({ dir: output, coverageMap: coverage });
  // Same report formats as Jest's defaults, now for the complete combined run.
  for (const name of ['json', 'lcov', 'text', 'clover']) reports.create(name).execute(context);
  fs.writeFileSync(path.join(output, 'verification.json'), JSON.stringify({
    commit: shaOf(), files, totals, coverageFiles: coverage.files().length,
  }, null, 2));
  const full = totals.full;
  console.log(`Test Suites: ${full.pendingSuites} skipped, ${full.passedSuites} passed, ${full.suites} total`);
  console.log(`Tests:       ${full.pending} skipped, ${full.todo} todo, ${full.passed} passed, ${full.tests} total`);
  console.log(`Calendar: ${totals.calendar.passed} passed; exact ${files}-file membership verified in both modes.`);
}

module.exports = { record, collect, aggregate };
if (require.main === module) {
  try {
    const [action, ...args] = process.argv.slice(2);
    assert(['record', 'aggregate'].includes(action));
    if (action === 'record') record(...args);
    else aggregate(...args);
  } catch (error) {
    console.error(`Incomplete sharded suite: ${error.message}`);
    process.exitCode = 1;
  }
}
