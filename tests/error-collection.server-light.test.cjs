const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');

// Process-error integrations and their global context strategy run in a fresh
// child. Only the transport is replaced; SDK, filter and privacy functions are
// the installed/public implementations and actual application source.
async function verifyServer(service) {
  const assert = require('node:assert/strict');
  const { createRequire } = require('node:module');
  const localRequire = createRequire(path.join(root, 'package.json'));
  let networkAttempts = 0;
  const blockNetwork = () => {
    networkAttempts++;
    throw new Error('NETWORK_BLOCKED');
  };
  for (const [name, methods] of [
    ['node:http', ['request', 'get']],
    ['node:https', ['request', 'get']],
    ['node:net', ['connect', 'createConnection']],
    ['node:tls', ['connect']],
    ['node:dgram', ['createSocket']],
  ]) {
    for (const method of methods) require(name)[method] = blockNetwork;
  }
  global.fetch = blockNetwork;
  console.warn = console.error = () => undefined;

  const ts = localRequire('typescript');
  const modules = new Map();
  const envelopes = [];
  const prepared = [];
  let transportFailure = false;
  function loadSource(relative) {
    if (modules.has(relative)) return modules.get(relative);
    const filename = path.join(root, relative);
    const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      fileName: filename,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2021,
        esModuleInterop: true,
      },
    }).outputText;
    const mod = { exports: {} };
    const requireSource = (request) => {
      if (request === '@contentfactory/helpers/errors/sanitize.error.event') {
        return loadSource('libraries/helpers/src/errors/sanitize.error.event.ts');
      }
      if (request === '@contentfactory/helpers/errors/create.error.collection.options') {
        const actual = loadSource('libraries/helpers/src/errors/create.error.collection.options.ts');
        return {
          ...actual,
          createErrorCollectionOptions(input) {
            const options = actual.createErrorCollectionOptions(input);
            if (!options) return options;
            return {
              ...options,
              beforeSend(event, hint) {
                prepared.push({
                  value: event.exception?.values?.[0]?.value,
                  mechanism: event.exception?.values?.[0]?.mechanism?.type,
                  user: event.user?.id,
                  isolation: event.extra?.isolation,
                  local: event.extra?.local,
                });
                return options.beforeSend(event, hint);
              },
              transport() {
                if (transportFailure) throw new Error('SYNTHETIC_TRANSPORT_FAILURE');
                return {
                  send(envelope) {
                    envelopes.push(envelope);
                    return Promise.resolve({ statusCode: 200 });
                  },
                  flush: () => Promise.resolve(true),
                };
              },
            };
          },
        };
      }
      return localRequire(request);
    };
    new Function('exports', 'require', 'module', '__filename', '__dirname', compiled)(
      mod.exports, requireSource, mod, filename, path.dirname(filename)
    );
    modules.set(relative, mod.exports);
    return mod.exports;
  }

  const listeners = new Map(
    ['uncaughtException', 'unhandledRejection', 'beforeExit', 'exit', 'SIGTERM']
      .map((name) => [name, new Set(process.listeners(name))])
  );
  let existingUncaughtCalls = 0;
  const existingUncaught = () => existingUncaughtCalls++;
  process.on('uncaughtException', existingUncaught);
  let Sentry;
  try {
    const initializer = loadSource('libraries/nestjs-libraries/src/sentry/initialize.sentry.ts');
    assert.equal(Object.keys(require.cache).some((file) =>
      /[\\/]@sentry[\\/]node[\\/]build[\\/]cjs[\\/]index\.js$/.test(file)
    ), false, 'error-only initialization must not load the full instrumentation SDK');
    Sentry = localRequire('@sentry/node-core/light');
    const { Logger, HttpException } = localRequire('@nestjs/common');
    const { SentryGlobalFilter } = localRequire('@sentry/nestjs/setup');
    Logger.overrideLogger(false);
    const environment = {
      NODE_ENV: 'test',
      CONTENT_FACTORY_ERROR_DSN: 'https://0123456789abcdef0123456789abcdef@errors.invalid/1',
      CONTENT_FACTORY_ERROR_ORIGIN: 'https://errors.invalid',
      CONTENT_FACTORY_RELEASE: 'sentry-light-regression',
    };
    assert.equal(initializer.initializeSentry(service, {}), false);
    assert.equal(initializer.initializeSentry(service, {
      ...environment, CONTENT_FACTORY_ERROR_ORIGIN: 'https://different.invalid',
    }), false);
    assert.equal(initializer.initializeSentry(service, environment), true);
    assert.deepEqual(Sentry.getClient().getOptions().integrations.map(({ name }) => name),
      ['OnUncaughtException', 'OnUnhandledRejection']);
    assert.equal(Sentry.getClient().getOptions().defaultIntegrations, false);

    const replies = [];
    const filters = [];
    const adapter = {
      reply: (_response, _body, status) => replies.push(status),
      isHeadersSent: () => false,
      end() {},
    };
    assert.equal(initializer.setupSentryErrorHandler({
      getHttpAdapter: () => adapter,
      useGlobalFilters: (filter) => filters.push(filter),
    }, environment), true);
    assert(filters[0] instanceof SentryGlobalFilter);
    assert.equal(initializer.setupSentryErrorHandler({
      getHttpAdapter() { throw new Error('SYNTHETIC_ADAPTER_FAILURE'); },
      useGlobalFilters() { assert.fail('failed adapter cannot register a filter'); },
    }, environment), false);
    const request = { url: '/synthetic?secret=SYNTHETIC_QUERY', headers: {
      cookie: 'SYNTHETIC_COOKIE', authorization: 'SYNTHETIC_AUTH',
    } };
    const response = {};
    const host = {
      getType: () => 'http',
      getArgByIndex: (index) => index === 1 ? response : request,
      switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
    };
    await Sentry.withIsolationScope(async (scope) => {
      scope.setUser({ id: 'SYNTHETIC_USER' });
      scope.setExtra('private', 'SYNTHETIC_EXTRA');
      scope.setContext('private', { body: 'SYNTHETIC_CONTEXT' });
      filters[0].catch(new TypeError('SYNTHETIC_HTTP_SECRET'), host);
      await Sentry.flush(1_000);
    });
    const beforeExpected = envelopes.length;
    filters[0].catch(new HttpException('Expected synthetic refusal', 401), host);
    await Sentry.flush(1_000);
    assert.deepEqual(replies, [500, 401]);
    assert.equal(envelopes.length, beforeExpected);

    const outerIsolation = Sentry.getIsolationScope();
    const outerCurrent = Sentry.getCurrentScope();
    const turn = () => new Promise((resolve) => setImmediate(resolve));
    let ready;
    const bothEntered = new Promise((resolve) => { ready = resolve; });
    let entered = 0;
    await Promise.all(['A', 'B'].map((label) => Sentry.withIsolationScope(async (scope) => {
      scope.setUser({ id: `SYNTHETIC_USER_${label}` });
      scope.setExtra('isolation', label);
      if (++entered === 2) ready();
      await bothEntered;
      await Sentry.withScope(async (nested) => {
        nested.setExtra('local', `nested-${label}`);
        await turn();
        assert.equal(Sentry.getIsolationScope(), scope);
        Sentry.captureException(new TypeError(`SYNTHETIC_SCOPE_${label}_NESTED`));
      });
      await turn();
      assert.equal(Sentry.getCurrentScope().getScopeData().extra.local, undefined);
      Sentry.captureException(new TypeError(`SYNTHETIC_SCOPE_${label}_OUTER`));
    })));
    await assert.rejects(Sentry.withIsolationScope(async (scope) => {
      scope.setUser({ id: 'SYNTHETIC_REJECTED_USER' });
      await turn();
      throw new Error('SYNTHETIC_SCOPE_REJECTION');
    }), /SYNTHETIC_SCOPE_REJECTION/);
    assert.equal(Sentry.getIsolationScope(), outerIsolation);
    assert.equal(Sentry.getCurrentScope(), outerCurrent);
    assert.equal(Sentry.getIsolationScope().getUser().id, undefined);
    await Sentry.flush(1_000);
    for (const label of ['A', 'B']) {
      for (const kind of ['NESTED', 'OUTER']) {
        const event = prepared.find(({ value }) => value === `SYNTHETIC_SCOPE_${label}_${kind}`);
        assert(event, 'each concurrent capture must arrive before sanitizing');
        assert.equal(event.user, `SYNTHETIC_USER_${label}`);
        assert.equal(event.isolation, label);
        assert.equal(event.local, kind === 'NESTED' ? `nested-${label}` : undefined);
      }
    }

    process.emit('unhandledRejection', new TypeError('SYNTHETIC_REJECTION_SECRET'), Promise.resolve());
    process.emit('uncaughtException', new TypeError('SYNTHETIC_UNCAUGHT_SECRET'));
    assert.equal(existingUncaughtCalls, 1);
    assert.equal(await Sentry.flush(1_000), true);
    assert(prepared.some(({ mechanism }) => mechanism === 'auto.http.nestjs.global_filter'));
    assert(prepared.some(({ mechanism }) => mechanism === 'auto.node.onuncaughtexception'));
    assert(prepared.some(({ mechanism }) => mechanism === 'auto.node.onunhandledrejection'));
    const items = envelopes.flatMap((envelope) => envelope[1]);
    assert.equal(items.length, 7);
    for (const [header, event] of items) {
      assert.equal(header.type, 'event');
      assert.deepEqual(event.tags, { service });
      assert.equal(event.release, 'sentry-light-regression');
      assert.equal(event.sdk.name, 'sentry.javascript.node-light');
      assert.equal(event.sdk.version, '10.70.0');
      assert(!Object.hasOwn(event.exception.values[0], 'value'));
      assert(Object.keys(event).every((key) => [
        'environment', 'event_id', 'exception', 'level', 'release', 'sdk', 'tags', 'timestamp', 'type',
      ].includes(key)));
    }
    assert(!JSON.stringify(envelopes).includes('SYNTHETIC_'));
    assert.equal(Object.keys(require.cache).filter((file) =>
      /[\\/]@opentelemetry[\\/]/.test(file)
    ).length, 0);
    await Sentry.close(1_000);
    transportFailure = true;
    assert.equal(initializer.initializeSentry(service, environment), false);
    assert.equal(networkAttempts, 0);
  } finally {
    await Sentry?.close(1_000);
    for (const [name, original] of listeners) {
      for (const listener of process.listeners(name)) {
        if (!original.has(listener)) process.off(name, listener);
      }
      assert.equal(process.listeners(name).length, original.size);
    }
  }
  return { status: 'PASS', service, events: 7, networkAttempts, listenersRestored: true };
}

if (process.argv[2] === '--sentry-light-child') {
  verifyServer(process.argv[3]).then(
    (result) => process.stdout.write(JSON.stringify(result) + '\n'),
    (error) => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; }
  );
} else {
  describe('server-only Sentry Light with the real Nest filter', () => {
    test.each(['backend', 'orchestrator'])(
      '%s preserves capture, process behavior, privacy and concurrent scopes',
      (service) => {
        const result = spawnSync(process.execPath, [
          '--max-old-space-size=512', __filename, '--sentry-light-child', service,
        ], {
          cwd: root, encoding: 'utf8', timeout: 20_000,
          env: { PATH: process.env.PATH, NODE_ENV: 'test' },
        });
        expect(result.error).toBeUndefined();
        expect(result.stderr).toBe('');
        expect(result.status).toBe(0);
        expect(JSON.parse(result.stdout)).toEqual({
          status: 'PASS', service, events: 7, networkAttempts: 0, listenersRestored: true,
        });
      }
    );
  });
}
