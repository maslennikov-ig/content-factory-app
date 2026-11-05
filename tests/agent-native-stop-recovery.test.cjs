'use strict';

const { execFileSync } = require('node:child_process');
const path = require('node:path');

test.each(['http-owner-expiry','http-owner-timeout','http-owner-changed'])('actual HTTP Stop preserves the %s ownership boundary',mode=>{
  const output=execFileSync(process.execPath,[path.join(__dirname,'helpers/agent-native-stop-recovery.probe.cjs'),mode],{cwd:path.resolve(__dirname,'..'),encoding:'utf8',timeout:35000});
  expect(JSON.parse(output.trim().split('\n').at(-1))).toMatchObject({mode,settled:mode==='http-owner-expiry',protected:mode!=='http-owner-expiry',modelCalls:0,externalRequests:0});
},40000);

test.each(['running', 'suspended', 'storage-failure'])(
  'cold Stop cancels the actual %s root and nested native checkpoints',
  (mode) => {
    const output = execFileSync(
      process.execPath,
      [
        path.join(__dirname, 'helpers/agent-native-stop-recovery.probe.cjs'),
        mode,
      ],
      {
        cwd: path.resolve(__dirname, '..'),
        encoding: 'utf8',
        timeout: 35_000,
      }
    );
    expect(JSON.parse(output.trim().split('\n').at(-1))).toMatchObject({
      mode,
      root: 'canceled',
      nested: 'canceled',
      modelCalls: 0,
      externalRequests: 0,
    });
  },
  40_000
);

test.each([
  'recovery-stopped',
  'recovery-successor',
  'recovery-allowed',
  'live-owner',
  'live-suspended-owner',
  'live-terminal-owner',
])(
  'native recovery preserves the %s boundary',
  (mode) => {
    const output = execFileSync(
      process.execPath,
      [
        path.join(__dirname, 'helpers/agent-native-stop-recovery.probe.cjs'),
        mode,
      ],
      {
        cwd: path.resolve(__dirname, '..'),
        encoding: 'utf8',
        timeout: 35_000,
      }
    );
    const report = JSON.parse(output.trim().split('\n').at(-1));
    expect(report).toMatchObject({
      mode,
      externalRequests: 0,
      modelCalls: mode === 'recovery-allowed' ? 1 : 0,
    });

    expect(
      report[
        mode === 'recovery-allowed'
          ? 'recovered'
          : mode.startsWith('live-')
          ? 'protected'
          : 'blocked'
      ]
    ).toBe(true);
  },
  40_000
);

test.each(['warm-stop', 'warm-store-error'])(
  'actual HTTP Stop preserves %s abort and owner drain',
  (mode) => {
    const output = execFileSync(
      process.execPath,
      [
        path.join(__dirname, 'helpers/agent-native-stop-recovery.probe.cjs'),
        mode,
      ],
      {
        cwd: path.resolve(__dirname, '..'),
        encoding: 'utf8',
        timeout: 25_000,
      }
    );
    expect(JSON.parse(output.trim().split('\n').at(-1))).toMatchObject({
      mode,
      abortObserved: true,
      ownerDrained: true,
      stopRejected: mode === 'warm-store-error',
      modelCalls: 1,
      externalRequests: 0,
    });
  },
  30_000
);
