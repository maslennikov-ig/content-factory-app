'use strict';
const { execFileSync } = require('node:child_process');
const path = require('node:path');
test('empty native streams use a finite configured chain and settle through real PG/Redis HTTP flow', () => {
  const raw = execFileSync(process.execPath, [path.join(__dirname, 'helpers/agent-chat-empty-stream.probe.cjs')], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8', timeout: 65000, stdio: ['ignore', 'pipe', 'pipe'] });
  expect(JSON.parse(raw.trim().split('\n').at(-1))).toEqual([
    { attempts: ['primary', 'fallback-1', 'fallback-2'], state: 'settled', outcome: 'failed', admissions: 1, externalCalls: 0 },
    { attempts: ['primary', 'fallback-1'], state: 'settled', outcome: 'completed', admissions: 1, externalCalls: 0 },
  ]);
}, 70000);
