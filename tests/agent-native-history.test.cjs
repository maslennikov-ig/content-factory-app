'use strict';
const path = require('node:path');
const { execFileSync } = require('node:child_process');

test('installed native ConductorMemory exposes private bounded history, complete offset continuation and redaction', () => {
  const output = execFileSync(process.execPath, [path.join(__dirname, 'helpers/agent-native-history.probe.cjs')], { encoding: 'utf8', timeout: 30000 });
  expect(JSON.parse(output)).toEqual({
    passed: true,
    toolRegistered: true,
    messagesReached: 32,
    longMessageChunks: expect.any(Number),
    ownerRefusals: 7,
    inputCannotSelectThread: true,
    redacted: true,
    externalCalls: 0,
  });
  expect(JSON.parse(output).longMessageChunks).toBeGreaterThan(1);
});
