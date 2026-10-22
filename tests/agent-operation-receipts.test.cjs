'use strict';

const { execFileSync } = require('node:child_process');
const path = require('node:path');

test('R4: native operation persistence survives receipt faults, concurrent drivers, and process resets', () => {
  const output = execFileSync(process.execPath, ['--test', path.join(__dirname, 'helpers/agent-operation-receipts.probe.cjs')], {
    cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 30_000,
  });
  expect(output).toMatch(/# fail 0/);
  expect(output).toMatch(/# pass 25/);
}, 35_000);

test('R4: SIGKILL at five native PostgreSQL boundaries preserves results and prevents duplicate writes', () => {
  const output = execFileSync(process.execPath, [path.join(__dirname, 'helpers/agent-operation-postgres.probe.cjs')], {
    cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 90_000,
  });
  const report = JSON.parse(output.trim().split('\n').at(-1));
  expect(Object.keys(report)).toEqual(['after-claim', 'before-domain', 'after-domain', 'after-receipt', 'receipt-failure']);
  for (const item of Object.values(report)) {
    expect(item.signal).toBe('SIGKILL');
    expect(item.nativeStorage).toBe(true);
    expect(item.domainWrites).toBeLessThanOrEqual(1);
  }
  expect(report['after-domain'].result.code).toBe('CAPABILITY_OUTCOME_UNCERTAIN');
  expect(report['after-domain'].recovered).toBe(true);
  expect(report['after-receipt'].recovered).toBe(true);
  expect(report['receipt-failure'].alternateBlockedWithoutGuard).toBe(true);
  expect(report['after-receipt'].result).toMatchObject({ ok: true, summary: { pieceId: 'piece-after-receipt' } });
}, 95_000);
