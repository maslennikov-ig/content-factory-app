'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../../../..');
global.expect = require('expect').expect;
const { loadScenarios } = require(path.join(
  root,
  'tests/helpers/agent-scenarios.cjs'
));
const scenarios = loadScenarios().filter((scenario) =>
  scenario.id.startsWith('media-generate-')
);
if (process.version !== 'v22.23.2' || scenarios.length !== 8)
  throw new Error('Expected Node22.23.2 and8 exact inherited-media scenarios');
const actual = execFileSync(
  process.execPath,
  [
    path.join(root, 'tests/helpers/agent-scenarios.runner.cjs'),
    scenarios.map((scenario) => scenario.id).join(','),
  ],
  { cwd: root, encoding: 'utf8', timeout: 60_000, maxBuffer: 16 * 1024 * 1024 }
);
fs.writeFileSync(
  path.join(__dirname, 'fixed-media-scenarios.actual.json'),
  actual
);
const report = JSON.parse(actual);
for (const scenario of scenarios) {
  const played = report[scenario.id];
  expect(played).toBeDefined();
  expect(played.crashed).toBeUndefined();
  scenario.check(played);
}
const receipt = {
  provider: 'scripted/fake only',
  scenarios: scenarios.map((scenario) => scenario.id),
  passed: scenarios.length,
  reportSha256: createHash('sha256').update(actual).digest('hex'),
};
fs.writeFileSync(
  path.join(__dirname, 'fixed-media-scenarios.receipt.json'),
  `${JSON.stringify(receipt, null, 2)}\n`
);
console.log(JSON.stringify(receipt));
