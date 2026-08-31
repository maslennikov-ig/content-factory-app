#!/usr/bin/env node

const fs = require('node:fs');

const fail = (message) => {
  process.stderr.write(`ERROR: ${message}\n`);
  process.exit(1);
};

const resultPath = process.argv[2];
if (!resultPath) {
  fail('Docker-backed Jest result path was not provided.');
}

let result;
try {
  result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
} catch (error) {
  fail(`Docker-backed Jest result is unreadable: ${error.message}`);
}

for (const field of [
  'numFailedTests',
  'numPassedTests',
  'numPendingTests',
  'numTotalTests',
]) {
  if (!Number.isInteger(result[field]) || result[field] < 0) {
    fail(`Docker-backed Jest result has invalid ${field}.`);
  }
}

if (result.numPendingTests > 0) {
  fail(
    `Docker-backed Jest execution skipped ${result.numPendingTests} test(s); required proof cannot pass.`
  );
}

if (
  result.success !== true ||
  result.numFailedTests !== 0 ||
  result.numTotalTests === 0 ||
  result.numPassedTests !== result.numTotalTests
) {
  fail('Docker-backed Jest execution did not pass every discovered test.');
}

process.stdout.write(
  `Docker-backed Jest proof passed: ${result.numPassedTests} test(s), 0 skipped.\n`
);
