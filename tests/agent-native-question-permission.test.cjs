'use strict';
const { execFileSync } = require('node:child_process');
const path = require('node:path');

test('native questions avoid redundant approval gates and retain explicit permission policies', () => {
  const text = execFileSync(process.execPath, [path.join(__dirname, 'helpers/agent-native-question-permission.probe.cjs')], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8', timeout: 45000 });
  expect(JSON.parse(text.trim().split('\n').at(-1))).toEqual({
    questions: { questions: 2, permissionHops: 0, admissions: 1, modelCalls: 3, outcome: 'completed', answersPreserved: true },
    permissions: { defaultAllow: true, categoryAsk: true, toolOverride: true, toolAsk: true, toolDeny: true, unknownClosed: true },
    externalRequests: 0,
  });
}, 50000);
