'use strict';
const path = require('node:path');
const { execFileSync } = require('node:child_process');

test('installed native history counts typed tool errors through a model-only copy while concurrent UI/raw reads remain unchanged', () => {
  const output = execFileSync(process.execPath, [path.join(__dirname, 'helpers/agent-history-error-compat.probe.cjs')], { encoding: 'utf8', timeout: 30000 });
  expect(JSON.parse(output)).toEqual({ passed: true, installedCounterRedReproduced: true, actualUiConversion: true, installedMessageHistory: true,
    concurrentRawReadPreserved: true, sourceMetadataPreserved: true, nativeSavePreserved: true, modelErrorPlain: true, scalarCases: 13, externalCalls: 0 });
});
