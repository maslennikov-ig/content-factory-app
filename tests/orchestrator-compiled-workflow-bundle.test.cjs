const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('the actual orchestrator build resolves and initializes its compiled workflow interceptors offline', () => {
  const proof = spawnSync(process.execPath, [path.join(__dirname, 'helpers/orchestrator-compiled-workflow-proof.cjs')], {
    cwd: path.resolve(__dirname, '..'),
    // No inherited service credentials or dotenv loading; real dependencies
    // are loaded and socket/DNS calls are observed, never replaced with stubs.
    env: { PATH: process.env.PATH, HOME: process.env.HOME, NODE_OPTIONS: '--max-old-space-size=8192' },
    encoding: 'utf8', timeout: 240000, maxBuffer: 16 * 1024 * 1024,
  });
  expect({ status: proof.status, error: proof.error && proof.error.message, stderr: proof.stderr }).toEqual({ status: 0, error: undefined, stderr: '' });
  const result = JSON.parse(proof.stdout.trim().split('\n').at(-1));
  expect(result.initialized).toEqual(['sendEmailWorkflow', 'sendEmailWorkflowV2', 'sendEmailWorkflowV3', 'digestEmailWorkflow']);
  expect(result.network).toEqual({ socketConnect: 0, dnsLookup: 0 });
  expect(result.temporaryOutputRemoved).toBe(true);
});
