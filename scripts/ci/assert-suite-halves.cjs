#!/usr/bin/env node

// `pnpm test` is three runs joined by `&&`: jest, then `node --test`, then
// `python -m unittest`. Its exit status is honest, but its log is not obviously
// so — a green jest summary scrolls past and reads like the answer. On
// 30.08.2026 jest reported 221 green suites while the `node --test` half was
// failing fourteen tests, and those fourteen lived through five releases.
//
// A CI job that only checks the exit status inherits a subtler version of the
// same blindness: change the `test` script so a half stops running, and the job
// stays green while covering less. This guard reads the log the run produced and
// refuses unless all three halves reported.
//
// It judges reporting, not results — the exit status already judges results.
// Usage: node scripts/ci/assert-suite-halves.cjs <path to full pnpm test log>

const fs = require('node:fs');

const fail = (message) => {
  process.stderr.write(`ERROR: ${message}\n`);
  process.exit(1);
};

const logPath = process.argv[2];
if (!logPath) {
  fail('Suite log path was not provided.');
}

let log;
try {
  log = fs.readFileSync(logPath, 'utf8');
} catch (error) {
  fail(`Suite log is unreadable: ${error.message}`);
}

const lines = log.split('\n');
const firstMatch = (pattern) => lines.find((line) => pattern.test(line));

// The same summary lines `scripts/release/record-suite-receipt.sh` copies into
// the release receipt. Kept in step with it on purpose: two different readings
// of "did the suite report" would drift until one of them vouched for a half it
// had not seen.
const halves = [
  {
    name: 'jest',
    command: 'jest --coverage ...',
    required: [
      { label: 'suite totals', pattern: /^Test Suites:\s+\S/ },
      { label: 'test totals', pattern: /^Tests:\s+\S/ },
    ],
  },
  {
    name: 'node --test',
    command: 'node --test --test-concurrency=1 tests/*.cjs',
    required: [
      { label: 'pass count', pattern: /^(?:#|ℹ) pass \d+$/ },
      { label: 'fail count', pattern: /^(?:#|ℹ) fail \d+$/ },
    ],
  },
  {
    name: 'python unittest',
    command: 'python3 -m unittest ...',
    required: [
      { label: 'run count', pattern: /^Ran \d+ tests? in / },
      { label: 'verdict', pattern: /^(?:OK(?: \(.*\))?|FAILED \(.*\))$/ },
    ],
  },
];

const reported = [];
const missing = [];

for (const half of halves) {
  const found = half.required.map((requirement) => ({
    ...requirement,
    line: firstMatch(requirement.pattern),
  }));
  const absent = found.filter((requirement) => requirement.line === undefined);
  if (absent.length > 0) {
    missing.push({
      half,
      absent: absent.map((requirement) => requirement.label),
    });
    continue;
  }
  reported.push({
    half,
    lines: found.map((requirement) => requirement.line.trim()),
  });
}

for (const entry of reported) {
  process.stdout.write(`${entry.half.name}: ${entry.lines.join(' / ')}\n`);
}

if (missing.length > 0) {
  for (const entry of missing) {
    process.stderr.write(
      `Missing from the log: ${entry.half.name} (${entry.half.command}) ` +
        `never printed its ${entry.absent.join(' or ')}.\n`
    );
  }
  fail(
    `${missing.length} of ${halves.length} suite halves did not report. ` +
      'Either an earlier half failed and stopped the chain, or the `test` ' +
      'script no longer runs that half at all — a green summary from the ' +
      'halves that did run says nothing about the ones that did not.'
  );
}

process.stdout.write(`All ${halves.length} suite halves reported.\n`);
