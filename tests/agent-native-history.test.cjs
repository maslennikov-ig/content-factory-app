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

test('A26: read-conversation-history supports includeActive, retained image/PDF viewAttachment with multimodal toModelOutput, and UnsupportedFileHandler fallback', () => {
  const output = execFileSync(
    process.execPath,
    [path.join(__dirname, 'helpers/agent-native-history-a25-a26.probe.cjs'), 'a26'],
    { encoding: 'utf8', timeout: 30000 }
  );
  expect(JSON.parse(output)).toEqual({
    a26: {
      attachmentsListed: 2,
      multimodalImage: 'image/png',
      multimodalPdf: 'application/pdf',
      activeIncluded: true,
      unsupportedFileFallback: true,
    },
  });
});

test('A25: ConductorMemory with real PostgreSQL (@mastra/pg) executes atomic concurrent working-memory merges and preserves memory on empty extraction', () => {
  const output = execFileSync(
    process.execPath,
    [path.join(__dirname, 'helpers/agent-native-history-a25-a26.probe.cjs'), 'a25'],
    { encoding: 'utf8', timeout: 30000 }
  );
  expect(JSON.parse(output)).toEqual({
    a25: {
      supportsAtomic: true,
      mergedKeys: ['answerLength', 'usualAvatarId', 'usualChannelId'],
      preservedOnEmptyMerge: true,
    },
  });
});
