const fs = require('node:fs');
const path = require('node:path');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const repositoryRoot = path.resolve(__dirname, '..');
const FILE = 'apps/orchestrator/src/workflows/content-lead-check.workflow.ts';

/**
 * `contentLeadCheckWorkflow` used to be `while (true) { activity; sleep }`
 * with no exit at all. Every other eternal workflow in this repository
 * (`autoPostDraftV2Workflow`'s shape, per this file's own header comment)
 * resets its Temporal history with `continueAsNew` — left out here, a
 * subscription checked on a 60-minute interval accumulates workflow history
 * forever and eventually hits Temporal's per-execution history size/length
 * limit, months into a subscription's life.
 *
 * Two checks: a source-tree check that the fix actually uses
 * `continueAsNew` (not, say, an unbounded loop that merely looks safer), and
 * a behavioural one that runs the real function against a fake
 * `@temporalio/workflow` runtime and confirms it calls `continueAsNew` with
 * the *same* input shape after a bounded number of iterations — not on
 * every tick, and not never.
 */

test('the workflow source references continueAsNew', () => {
  const sourceText = fs.readFileSync(path.join(repositoryRoot, FILE), 'utf8');
  expect(sourceText).toEqual(expect.stringContaining('continueAsNew'));
});

function loadWorkflow(runtimeModule) {
  return loadTypeScriptModule(FILE, {
    '@temporalio/workflow': runtimeModule,
  }).contentLeadCheckWorkflow;
}

test('after a bounded number of iterations, the workflow calls continueAsNew with the same input shape, instead of looping forever', async () => {
  // The un-fixed workflow is a literal `while (true)` with no exit at all —
  // run for real against a fake runtime whose `sleep` resolves instantly, it
  // spins until the process runs out of memory. This safety valve turns
  // "never continues as new" into an ordinary failed assertion instead of an
  // OOM crash, without weakening what a fixed workflow has to prove: 500
  // iterations is far above the ~100-iteration bound this fix is expected to
  // pick, so it never trips once the fix is in place.
  const SAFETY_CAP = 500;
  let calls = 0;
  const callArgs = [];
  const checkContentLeadSubscription = jest.fn(async (arg) => {
    calls += 1;
    callArgs.push(arg);
    if (calls > SAFETY_CAP) {
      throw new Error(
        `safety net: contentLeadCheckWorkflow did not continueAsNew within ${SAFETY_CAP} iterations`
      );
    }
  });
  const continueAsNew = jest.fn(async (input) => ({ continuedWith: input }));
  const runtimeModule = {
    proxyActivities: () => ({ checkContentLeadSubscription }),
    sleep: jest.fn(() => Promise.resolve()),
    continueAsNew,
  };
  const contentLeadCheckWorkflow = loadWorkflow(runtimeModule);

  const input = {
    organizationId: 'org-a',
    subscriptionId: 'sub-a',
    checkIntervalMinutes: 60,
  };

  const result = await contentLeadCheckWorkflow(input);

  expect(continueAsNew).toHaveBeenCalledTimes(1);
  // Same object, not a re-shaped copy — the workflow's own start-argument
  // contract (`tests/temporal-contract-signature.baseline.json`) must not
  // change shape across a continueAsNew.
  expect(continueAsNew).toHaveBeenCalledWith(input);
  expect(result).toEqual({ continuedWith: input });

  // Bounded: it ran more than a couple of times before continuing as new
  // (proving this isn't a trivial one-shot loop), but nowhere near
  // "forever" — a real per-execution history limit is in the thousands,
  // this just proves a cap exists at all.
  expect(calls).toBeGreaterThan(1);
  expect(calls).toBeLessThanOrEqual(SAFETY_CAP);
  for (const call of callArgs) {
    expect(call).toEqual({
      organizationId: 'org-a',
      subscriptionId: 'sub-a',
    });
  }
});
