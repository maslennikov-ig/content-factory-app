'use strict';
require('reflect-metadata');
const assert = require('node:assert/strict');
const { Test } = require('@nestjs/testing');
const { CommandModule, CommandService } = require('nestjs-command');
const { loadTypeScriptModule } = require('./load-ts-module.cjs');
const { fixture } = require('./token-refresh.module.cjs');

// Actual Nest command discovery, decorator and yargs dispatch. Only the DB,
// providers and notification adapter use inert memory fixtures; no live calls.
const modes = {
  success: {},
  empty: { count: 0 },
  partial: { throwAt: 0 },
  notification: { throwAt: 0, notificationFailureOrg: 'tenant-a' },
  persistence: { saveFailure: 1 },
  fatal: { queryError: true },
};
const mode = process.argv[2];
assert.ok(Object.hasOwn(modes, mode));
const f = fixture(modes[mode]);
class ServiceToken {}
const { RefreshTokens } = loadTypeScriptModule('apps/commands/src/tasks/refresh.tokens.ts', {
  '@contentfactory/nestjs-libraries/database/prisma/integrations/integration.service': {
    IntegrationService: ServiceToken,
  },
});

(async () => {
  const app = await Test.createTestingModule({
    imports: [CommandModule],
    providers: [RefreshTokens, { provide: ServiceToken, useValue: f.service }],
  }).compile();
  try {
    await app.init();
    await app.get(CommandService).exec(['refresh']);
    if (mode === 'partial' || mode === 'notification') {
      assert.equal(f.rows[0].token, f.before[0].token);
      assert.equal(f.rows[0].refreshNeeded, true);
      assert.equal(f.rows[1].token, 'new-access-1');
      assert.equal(f.rows[2].token, 'new-access-2');
    }
  } finally {
    await app.close();
  }
})().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
