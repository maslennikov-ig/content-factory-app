'use strict';
const { execFileSync } = require('node:child_process');
const path = require('node:path');
test('real native Session approval/question HTTP rendezvous retains one admission, domain consent, human history and fresh observer replay', () => {
  const output = execFileSync(process.execPath, [path.join(__dirname, 'helpers', 'agent-native-session-http.probe.cjs')], { cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 45_000 });
  const report = JSON.parse(output.trim().split('\n').at(-1));
  expect(report).toEqual([
    { kind: 'approval', admissions: 1, writes: 1, humanHistory: true, replay: true, answer: 'Нативная задача завершена.' },
    { kind: 'question', admissions: 1, writes: 0, humanHistory: true, replay: true, answer: 'Нативная задача завершена.' },
    { kind: 'provider-skill', admissions: 1, writes: 0, humanHistory: true, replay: true, answer: 'Нативная задача завершена.' },
    { kind: 'provider-approval', admissions: 1, writes: 1, humanHistory: true, replay: true, answer: 'Нативная задача завершена.' },
    { kind: 'provider-payment', admissions: 1, writes: 0, errorCode: 'AI_PROVIDER_PAYMENT_REQUIRED', providerCalls: 1, outcome: 'failed', safeWire: true },
  ]);
}, 50_000);
