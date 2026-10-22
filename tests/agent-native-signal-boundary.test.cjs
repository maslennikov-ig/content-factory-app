'use strict';
const { execFileSync } = require('node:child_process');
const path = require('node:path');

test('actual native final-text delivery is consumed, while idle discard permits a same-id fresh HTTP turn', () => {
  const output = execFileSync(process.execPath, [path.join(__dirname, 'helpers', 'agent-native-signal-boundary.probe.cjs')], {
    cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 30_000,
  });
  expect(JSON.parse(output.trim().split('\n').find(line => line.startsWith('{"activeAction"')))).toEqual({
    activeAction: 'deliver', boundaryProviderCalls: 2, idleVerdict: 'AGENT_SIGNAL_IDLE', totalAdmissions: 2, totalProviderCalls: 3,
  });
}, 35_000);
