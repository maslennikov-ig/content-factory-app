#!/usr/bin/env node

const fs = require('node:fs');

const fail = (message) => {
  process.stderr.write(`ERROR: ${message}\n`);
  process.exit(1);
};

const resultPath = process.argv[2];
if (!resultPath) {
  fail('Native Node test result path was not provided.');
}

let tap;
try {
  tap = fs.readFileSync(resultPath, 'utf8');
} catch (error) {
  fail(`Native Node test result is unreadable: ${error.message}`);
}

const summary = {};
for (const field of [
  'tests',
  'pass',
  'fail',
  'cancelled',
  'skipped',
  'todo',
]) {
  const matches = [
    ...tap.matchAll(new RegExp(`^# ${field} (\\d+)$`, 'gm')),
  ];
  if (matches.length !== 1) {
    fail(`Native Node test produced malformed TAP result: missing exact ${field} total.`);
  }
  summary[field] = Number(matches[0][1]);
}

const plans = [...tap.matchAll(/^1\.\.(\d+)$/gm)];
const points = [...tap.matchAll(/^(ok|not ok) (\d+)(?: - .*)?$/gm)].map(
  (match) => ({ status: match[1], number: Number(match[2]), line: match[0] })
);
const pointTotals = {
  pass: 0,
  fail: 0,
  skipped: 0,
  todo: 0,
};
for (const point of points) {
  if (/#\s*SKIP\b/i.test(point.line)) {
    pointTotals.skipped += 1;
  } else if (/#\s*TODO\b/i.test(point.line)) {
    pointTotals.todo += 1;
  } else if (point.status === 'ok') {
    pointTotals.pass += 1;
  } else {
    pointTotals.fail += 1;
  }
}
if (
  !tap.startsWith('TAP version 13\n') ||
  plans.length !== 1 ||
  Number(plans[0][1]) !== summary.tests ||
  points.length !== summary.tests ||
  points.some((point, index) => point.number !== index + 1) ||
  summary.pass +
    summary.fail +
    summary.cancelled +
    summary.skipped +
    summary.todo !==
    summary.tests ||
  pointTotals.pass !== summary.pass ||
  pointTotals.fail !== summary.fail ||
  pointTotals.skipped !== summary.skipped ||
  pointTotals.todo !== summary.todo
) {
  fail('Native Node test produced malformed TAP result.');
}
if (summary.skipped > 0) {
  fail(`Native Node test skipped ${summary.skipped} test(s); required proof cannot pass.`);
}
if (summary.fail > 0) {
  fail(`Native Node test failed ${summary.fail} test(s); required proof cannot pass.`);
}
if (
  summary.tests === 0 ||
  summary.cancelled > 0 ||
  summary.todo > 0 ||
  summary.pass !== summary.tests
) {
  fail('Native Node test did not pass every discovered test.');
}

process.stdout.write(
  `Native Node test proof passed: ${summary.tests} test(s), 0 failed, 0 skipped.\n`
);
