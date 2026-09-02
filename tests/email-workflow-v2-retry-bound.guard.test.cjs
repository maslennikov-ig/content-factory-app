const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const repositoryRoot = path.resolve(__dirname, '..');
const FILE = 'apps/orchestrator/src/workflows/send.email.workflow.v2.ts';

/**
 * `proxyActivities<EmailActivityV2>` in `send.email.workflow.v2.ts` used to
 * declare only `startToCloseTimeout`. Temporal's default retry policy is
 * unlimited attempts with no `scheduleToCloseTimeout`, and
 * `email.activity.v2.ts` rethrows anything `EmailSendError.retryable !==
 * false` as-is (see `email-activity-v2-nonretryable.guard.test.cjs`) — so a
 * provider outage on the very first queued email retried it forever and the
 * whole `send_email_v2` singleton queue never moved on to the next email.
 *
 * This guard parses the real `proxyActivities` call out of the source file
 * and checks it declares a bounded `retry.maximumAttempts` and a
 * `scheduleToCloseTimeout`, so an email that keeps failing eventually falls
 * through to the existing `log.error` drop path
 * (`email-workflow-v2-dropped-email-visible.guard.test.cjs`) instead of
 * blocking the queue.
 */

function findProxyActivitiesOptions() {
  const filename = path.join(repositoryRoot, FILE);
  const sourceText = fs.readFileSync(filename, 'utf8');
  const sourceFile = ts.createSourceFile(
    filename,
    sourceText,
    ts.ScriptTarget.ES2021,
    true,
    ts.ScriptKind.TS
  );

  let optionsNode;
  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'proxyActivities'
    ) {
      optionsNode = node.arguments[0];
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);

  if (!optionsNode || !ts.isObjectLiteralExpression(optionsNode)) {
    throw new Error(`Could not find a proxyActivities(...) call in ${FILE}`);
  }

  const props = {};
  for (const prop of optionsNode.properties) {
    if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
      props[prop.name.text] = prop.initializer;
    }
  }
  return props;
}

function objectLiteralProps(node) {
  if (!node || !ts.isObjectLiteralExpression(node)) return {};
  const out = {};
  for (const prop of node.properties) {
    if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
      out[prop.name.text] = prop.initializer.getText();
    }
  }
  return out;
}

test('sendEmailV2 proxyActivities declares scheduleToCloseTimeout, so a doomed retry loop cannot run past it', () => {
  const options = findProxyActivitiesOptions();
  expect(options.scheduleToCloseTimeout).toBeDefined();
  expect(ts.isStringLiteral(options.scheduleToCloseTimeout)).toBe(true);
});

test('sendEmailV2 proxyActivities declares a bounded retry.maximumAttempts, not Temporal\'s unlimited default', () => {
  const options = findProxyActivitiesOptions();
  expect(options.retry).toBeDefined();

  const retry = objectLiteralProps(options.retry);
  expect(retry.maximumAttempts).toBeDefined();

  const maximumAttempts = Number(retry.maximumAttempts);
  expect(Number.isFinite(maximumAttempts)).toBe(true);
  // 0 is Temporal's own spelling of "unlimited attempts" — the exact failure
  // mode this guard exists to prevent.
  expect(maximumAttempts).toBeGreaterThan(0);
  expect(maximumAttempts).toBeLessThanOrEqual(20);
});
