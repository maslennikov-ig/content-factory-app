'use strict';
const path = require('node:path');
const { execFileSync } = require('node:child_process');

// The installed signer imports ESM noble packages. Run it in native Node,
// including real loopback WebSockets, instead of stubbing crypto for Jest.
test('Nostr signed-event acknowledgement, cleanup and publication claims (native protocol cases)', () => {
  const output = execFileSync(process.execPath, [
    '--test', '--test-concurrency=1',
    path.join(__dirname, 'helpers', 'nostr-publication.runner.cjs'),
  ], { encoding: 'utf8', timeout: 30_000 });
  expect(output).toMatch(/# fail 0\b/);
  expect(output).toMatch(/# skipped 0\b/);
}, 35_000);
