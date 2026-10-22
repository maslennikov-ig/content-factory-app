'use strict';

const { execFileSync } = require('node:child_process');
const path = require('node:path');

test('native queued human input survives SIGKILL with FIFO, real approval, strict admission and honest uncertainty', () => {
  const output = execFileSync(
    process.execPath,
    [path.join(__dirname, 'helpers/native-queued-input.probe.cjs')],
    {
      cwd: path.join(__dirname, '..'),
      encoding: 'utf8',
      timeout: 90_000,
    }
  );
  const report = JSON.parse(output.trim().split('\n').at(-1));
  expect(report.raw).toMatchObject({
    signal: 'SIGKILL',
    savedHumanMessages: 0,
    domainWrites: 0,
  });
  expect(report.persist).toMatchObject({
    signal: 'SIGKILL',
    savedHumanMessages: 1,
    domainWrites: 0,
  });
  expect(report.fifo).toMatchObject({
    wordsPreserved: true,
    domainWrites: 2,
    status: 'success',
  });
  expect(report.gap).toMatchObject({
    wordsPreserved: true,
    domainWrites: 1,
    status: 'suspended',
  });
  for (const key of ['stop-before', 'stop-after'])
    expect(report[key]).toMatchObject({ domainWrites: 0, status: 'canceled' });
  expect(report.approval).toMatchObject({
    wordsPreserved: true,
    domainWrites: 1,
    status: 'success',
  });
  expect(Object.keys(report.faults)).toEqual([
    'read',
    'claim',
    'dispatch',
    'lost-tail-ack',
  ]);
  for (const result of Object.values(report.faults))
    expect(result).toMatchObject({ accepted: false, modelOrDomainCalls: 0 });
  expect(report.faults['lost-tail-ack']).toMatchObject({
    code: 'QUEUED_INPUT_ACCEPTANCE_UNCERTAIN',
    originalRequestPreserved: true,
  });
  expect(report.liveObserver).toEqual({
    admissions: 1,
    domainWrites: 1,
    observerOnly: true,
  });
  expect(report.approval.admissions).toBe(1);
  expect(report.gap.admissions).toBe(1);
}, 95_000);

test('a distinct native host cannot erase acknowledged Stop with a delayed start intent', () => {
  const output = execFileSync(
    process.execPath,
    [
      path.join(__dirname, 'helpers/native-queued-input.probe.cjs'),
      '--stop-race',
    ],
    { cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 30_000 }
  );
  expect(JSON.parse(output.trim().split('\n').at(-1)).stopRace).toEqual({
    distinctProcesses: true,
    stopBeforeStartIntentCommit: true,
    coldStopRetained: true,
    stopReadFailureRefused: true,
    stopWriteFailureRefused: true,
    admissions: 0,
    providerCalls: 0,
    domainWrites: 0,
  });
}, 35_000);
