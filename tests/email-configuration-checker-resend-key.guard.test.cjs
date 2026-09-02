const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const repositoryRoot = path.resolve(__dirname, '..');

/**
 * `ResendProvider` (libraries/nestjs-libraries/src/emails/resend.provider.ts)
 * used to substitute a fake key (`re_132`) when `RESEND_API_KEY` was unset,
 * so a missing key produced no signal anywhere. content-factory-next-7jxo's
 * fix removes that substitution — the provider now throws on first use
 * instead — but that shifts the failure from "invisible" to "only visible
 * once the first email tries to send". `checkConfiguration()` in
 * `apps/backend/src/main.ts` runs once at process startup and its result is
 * always logged (see the `hasIssues()` branch below — "Configuration check
 * completed without any issues" or a list of issues), so that is where a
 * missing key belongs: caught before the first email ever tries to send,
 * not discovered by one failing.
 *
 * This test extracts the real `checkConfiguration` function out of
 * `main.ts` (the whole file cannot just be `require`d — its last line is
 * `start()`, which boots an actual Nest application) and runs it against a
 * stand-in `ConfigurationChecker`/`Logger`, so this exercises the exact
 * source `main.ts` ships, not a re-description of it.
 */

function extractCheckConfiguration() {
  const filename = path.join(repositoryRoot, 'apps/backend/src/main.ts');
  const sourceText = fs.readFileSync(filename, 'utf8');
  const sourceFile = ts.createSourceFile(
    filename,
    sourceText,
    ts.ScriptTarget.ES2021,
    true,
    ts.ScriptKind.TS
  );

  let fnNode;
  ts.forEachChild(sourceFile, (node) => {
    if (
      ts.isFunctionDeclaration(node) &&
      node.name?.text === 'checkConfiguration'
    ) {
      fnNode = node;
    }
  });
  if (!fnNode) {
    throw new Error('apps/backend/src/main.ts no longer declares checkConfiguration()');
  }

  const fnText = sourceText.slice(fnNode.getStart(sourceFile), fnNode.getEnd());
  const transpiled = ts.transpileModule(fnText, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
    },
  }).outputText;

  // `checkConfiguration` closes over `ConfigurationChecker` and `Logger`,
  // both ordinarily module-level imports in main.ts. Supplying them as
  // factory parameters here reproduces that closure without executing the
  // rest of the file (which would try to start the server).
  const factory = new Function(
    'ConfigurationChecker',
    'Logger',
    `${transpiled}\nreturn checkConfiguration;`
  );
  return factory;
}

class FakeConfigurationChecker {
  constructor() {
    this.issues = [];
  }
  readEnvFromProcess() {}
  check() {}
  checkNonEmpty(key, description) {
    if (!process.env[key]) {
      this.issues.push(`${key} not set. ${description || ''}`);
      return false;
    }
    return true;
  }
  hasIssues() {
    return this.issues.length > 0;
  }
  getIssues() {
    return this.issues;
  }
  getIssuesCount() {
    return this.issues.length;
  }
}

function withEnv(vars, run) {
  const previous = {};
  for (const key of Object.keys(vars)) {
    previous[key] = process.env[key];
    if (vars[key] === undefined) delete process.env[key];
    else process.env[key] = vars[key];
  }
  try {
    return run();
  } finally {
    for (const key of Object.keys(vars)) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

const FakeLogger = { warn: () => undefined, log: () => undefined };

test('EMAIL_PROVIDER=resend with no RESEND_API_KEY is a reported configuration issue at startup', () => {
  const checkConfiguration = extractCheckConfiguration()(
    FakeConfigurationChecker,
    FakeLogger
  );

  withEnv(
    { EMAIL_PROVIDER: 'resend', RESEND_API_KEY: undefined },
    () => {
      let reportedIssues;
      const warn = jest.spyOn(FakeLogger, 'warn').mockImplementation(() => {});
      checkConfiguration();
      reportedIssues = warn.mock.calls.map((call) => call[0]).join('\n');
      warn.mockRestore();
      expect(reportedIssues).toEqual(expect.stringContaining('RESEND_API_KEY'));
    }
  );
});

test('EMAIL_PROVIDER=resend with RESEND_API_KEY set reports no such issue', () => {
  const checkConfiguration = extractCheckConfiguration()(
    FakeConfigurationChecker,
    FakeLogger
  );

  withEnv(
    { EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 're_a_real_key' },
    () => {
      const warn = jest.spyOn(FakeLogger, 'warn').mockImplementation(() => {});
      checkConfiguration();
      const reportedIssues = warn.mock.calls.map((call) => call[0]).join('\n');
      warn.mockRestore();
      expect(reportedIssues).not.toEqual(expect.stringContaining('RESEND_API_KEY'));
    }
  );
});

test('a non-resend EMAIL_PROVIDER never asks for RESEND_API_KEY', () => {
  const checkConfiguration = extractCheckConfiguration()(
    FakeConfigurationChecker,
    FakeLogger
  );

  withEnv(
    { EMAIL_PROVIDER: 'nodemailer', RESEND_API_KEY: undefined },
    () => {
      const warn = jest.spyOn(FakeLogger, 'warn').mockImplementation(() => {});
      checkConfiguration();
      const reportedIssues = warn.mock.calls.map((call) => call[0]).join('\n');
      warn.mockRestore();
      expect(reportedIssues).not.toEqual(expect.stringContaining('RESEND_API_KEY'));
    }
  );
});
