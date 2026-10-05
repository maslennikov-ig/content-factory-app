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
  let beforeSendMode = 'normal';
  let releaseDelayed;
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
                  eventId: event.event_id,
                  value: event.exception?.values?.[0]?.value,
                  mechanism: event.exception?.values?.[0]?.mechanism?.type,
                  user: event.user?.id,
                  isolation: event.extra?.isolation,
                  local: event.extra?.local,
                });
                const sanitized = options.beforeSend(
                  beforeSendMode === 'invalid' ? { ...event, event_id: 'INVALID_ID' } : event,
                  hint
                );
                if (beforeSendMode === 'drop') return null;
                if (beforeSendMode === 'async') {
                  return new Promise((resolve) => {
                    releaseDelayed = () => resolve(sanitized);
                  });
                }
                return sanitized;
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
  let capturedClient;
  let originalCaptureException;
  let captureCalls = 0;
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
    capturedClient = Sentry.getClient();
    originalCaptureException = capturedClient.captureException;
    capturedClient.captureException = function (...args) {
      captureCalls++;
      return originalCaptureException.apply(this, args);
    };
    assert.deepEqual(Sentry.getClient().getOptions().integrations.map(({ name }) => name),
      ['OnUncaughtException', 'OnUnhandledRejection']);
    assert.equal(Sentry.getClient().getOptions().defaultIntegrations, false);

    const replies = [];
    const replyHeaders = [];
    const filters = [];
    const adapter = {
      reply: (response, _body, status) => {
        if (response.replyError) throw response.replyError;
        replies.push(status);
        replyHeaders.push({ ...response.headers });
        response.status = status;
        response.body = _body;
      },
      setHeader: (response, name, value) => {
        if (response.headerError) throw response.headerError;
        response.headers ??= {};
        response.headers[name] = value;
        response.headerWrites = (response.headerWrites ?? 0) + 1;
      },
      isHeadersSent: (response) => Boolean(response.headersSent),
      end(response) { response.ended = true; },
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
    const httpEvent = envelopes[0][1][0][1];
    assert.match(response.headers?.['X-Error-ID'] ?? '', /^[a-f0-9]{32}$/);
    assert.equal(response.headers['X-Error-ID'], httpEvent.event_id);
    assert.equal(replyHeaders[0]['X-Error-ID'], httpEvent.event_id,
      'the same sanitized event ID must be set before the original 500 reply');
    assert(!Object.hasOwn(httpEvent.exception.values[0], 'mechanism'),
      'correlation must work with a stripped event mechanism');
    assert.equal(response.headerWrites, 1);
    assert.equal(captureCalls, 1, 'one HTTP error must invoke the real client capture exactly once');
    assert.deepEqual(response.body, { statusCode: 500, message: 'Internal server error' });
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

    const client = Sentry.getClient();
    const originalOn = client.on;
    let activeListeners = 0;
    let registrationFailure = false;
    let removalFailure = false;
    let correlationCases = 1; // The normal same-event-before-reply proof above.
    client.on = function (hook, callback) {
      if (hook !== 'beforeSendEvent') return originalOn.call(this, hook, callback);
      if (registrationFailure) throw new Error('SYNTHETIC_OBSERVER_FAILURE');
      const remove = originalOn.call(this, hook, callback);
      activeListeners++;
      return () => {
        remove();
        activeListeners--;
        if (removalFailure) throw new Error('SYNTHETIC_CLEANUP_FAILURE');
      };
    };
    const ownHost = (ownResponse = {}, type = 'http') => ({
      response: ownResponse,
      getType: () => type,
      getArgByIndex: (index) => index === 1 ? ownResponse : request,
      switchToHttp: () => ({ getRequest: () => request, getResponse: () => ownResponse }),
    });
    const noHeader = (ownResponse) => assert.equal(ownResponse.headers?.['X-Error-ID'], undefined);
    const checked = () => {
      assert.equal(activeListeners, 0, 'each catch must release its public SDK listener');
      correlationCases++;
    };
    let injectedException;
    let nestedHost;
    let injected = false;
    client.addEventProcessor((event, hint) => {
      if (hint?.originalException === injectedException && !injected) {
        injected = true;
        const noise = { event_id: 'a'.repeat(32) };
        client.emit('beforeSendEvent', noise, {
          originalException: new Error('SYNTHETIC_FOREIGN_EVENT'),
          mechanism: { type: 'auto.http.nestjs.global_filter' },
        });
        client.emit('beforeSendEvent', noise, {
          originalException: injectedException,
          mechanism: { type: 'auto.node.onuncaughtexception' },
        });
        client.emit('beforeSendEvent', noise);
        client.emit('beforeSendEvent', noise, {
          get originalException() { throw new Error('SYNTHETIC_HINT_FAILURE'); },
        });
        client.emit('beforeSendEvent', noise, {
          originalException: injectedException,
          get mechanism() { throw new Error('SYNTHETIC_MECHANISM_FAILURE'); },
        });
        client.emit('beforeSendEvent', {
          get event_id() { throw new Error('SYNTHETIC_EVENT_ID_FAILURE'); },
        }, {
          originalException: injectedException,
          mechanism: { type: 'auto.http.nestjs.global_filter' },
        });
        client.emit('beforeSendEvent', { event_id: 'INVALID_ID' }, {
          originalException: injectedException,
          mechanism: { type: 'auto.http.nestjs.global_filter' },
        });
        assert.equal(activeListeners, 1);
        filters[0].catch(new TypeError('SYNTHETIC_NESTED_HTTP'), nestedHost);
        assert.equal(activeListeners, 1, 'the nested catch must release only its own listener');
      }
      return event;
    });
    const correlationStart = envelopes.length;
    const correlationStartCalls = captureCalls;
    try {
      assert.equal(initializer.setupSentryErrorHandler({
        getHttpAdapter() { assert.fail('invalid DSN must not access the adapter'); },
        useGlobalFilters() { assert.fail('invalid DSN must not install a filter'); },
      }, {}), false);
      assert.equal(initializer.setupSentryErrorHandler({
        getHttpAdapter() { assert.fail('invalid DSN must not access the adapter'); },
        useGlobalFilters() { assert.fail('invalid DSN must not install a filter'); },
      }, { ...environment, CONTENT_FACTORY_ERROR_DSN: 'not-a-dsn' }), false);
      checked();

      for (const status of [401, 500]) {
        const expected = ownHost();
        const before = envelopes.length;
        filters[0].catch(new HttpException('Expected synthetic refusal', status), expected);
        await Sentry.flush(1_000);
        assert.equal(expected.response.status, status);
        assert.equal(envelopes.length, before);
        noHeader(expected.response);
        checked();
      }

      injectedException = new TypeError('SYNTHETIC_OUTER_HTTP');
      const outerHost = ownHost();
      nestedHost = ownHost();
      filters[0].catch(injectedException, outerHost);
      await Sentry.flush(1_000);
      for (const [value, ownResponse] of [
        ['SYNTHETIC_OUTER_HTTP', outerHost.response],
        ['SYNTHETIC_NESTED_HTTP', nestedHost.response],
      ]) {
        assert.equal(ownResponse.headers['X-Error-ID'], prepared.find((item) => item.value === value).eventId);
        assert.equal(ownResponse.headerWrites, 1);
        assert.equal(ownResponse.status, 500);
        assert.notEqual(ownResponse.headers['X-Error-ID'], 'a'.repeat(32));
      }
      assert.notEqual(outerHost.response.headers['X-Error-ID'], nestedHost.response.headers['X-Error-ID']);
      injectedException = undefined;
      checked();

      const concurrent = await Promise.all(['A', 'B'].map((label) => Sentry.withIsolationScope(async () => {
        await turn();
        const currentHost = ownHost();
        filters[0].catch(new TypeError(`SYNTHETIC_CONCURRENT_HTTP_${label}`), currentHost);
        assert.equal(currentHost.response.headers['X-Error-ID'], prepared.find((item) =>
          item.value === `SYNTHETIC_CONCURRENT_HTTP_${label}`
        ).eventId);
        return currentHost.response;
      })));
      await Sentry.flush(1_000);
      assert.notEqual(concurrent[0].headers['X-Error-ID'], concurrent[1].headers['X-Error-ID']);
      checked();

      for (const mode of ['drop', 'invalid']) {
        beforeSendMode = mode;
        const dropped = ownHost();
        const before = envelopes.length;
        filters[0].catch(new TypeError('SYNTHETIC_DROPPED_HTTP'), dropped);
        beforeSendMode = 'normal';
        await Sentry.flush(1_000);
        assert.equal(envelopes.length, before);
        assert.equal(dropped.response.status, 500);
        noHeader(dropped.response);
        checked();
      }

      beforeSendMode = 'async';
      const delayed = ownHost();
      const beforeDelayed = envelopes.length;
      filters[0].catch(new TypeError('SYNTHETIC_DELAYED_HTTP'), delayed);
      beforeSendMode = 'normal';
      assert.equal(delayed.response.status, 500, 'the response must not wait for async telemetry');
      noHeader(delayed.response);
      assert.equal(activeListeners, 0);
      releaseDelayed();
      await Sentry.flush(1_000);
      assert.equal(envelopes.length, beforeDelayed + 1);
      noHeader(delayed.response);
      checked();

      const scope = Sentry.getCurrentScope();
      scope.setClient(undefined);
      try {
        const absent = ownHost();
        const before = envelopes.length;
        filters[0].catch(new TypeError('SYNTHETIC_NO_CLIENT'), absent);
        assert.equal(absent.response.status, 500);
        assert.equal(envelopes.length, before);
        noHeader(absent.response);
        checked();
      } finally {
        scope.setClient(client);
      }

      client.getOptions().enabled = false;
      try {
        const disabled = ownHost();
        const before = envelopes.length;
        filters[0].catch(new TypeError('SYNTHETIC_DISABLED_CLIENT'), disabled);
        await Sentry.flush(1_000);
        assert.equal(disabled.response.status, 500);
        assert.equal(envelopes.length, before);
        noHeader(disabled.response);
        checked();
      } finally {
        client.getOptions().enabled = true;
      }

      const sent = ownHost({ headersSent: true });
      filters[0].catch(new TypeError('SYNTHETIC_HEADERS_SENT'), sent);
      assert.equal(sent.response.ended, true);
      assert.equal(sent.response.status, undefined);
      noHeader(sent.response);
      checked();

      registrationFailure = true;
      const observerFailure = ownHost();
      filters[0].catch(new TypeError('SYNTHETIC_OBSERVER_HTTP'), observerFailure);
      registrationFailure = false;
      assert.equal(observerFailure.response.status, 500);
      noHeader(observerFailure.response);
      checked();

      const headerFailure = ownHost({ headerError: new Error('SYNTHETIC_HEADER_FAILURE') });
      filters[0].catch(new TypeError('SYNTHETIC_HEADER_HTTP'), headerFailure);
      assert.equal(headerFailure.response.status, 500);
      noHeader(headerFailure.response);
      checked();

      const replyError = new Error('SYNTHETIC_REPLY_FAILURE');
      assert.throws(() => filters[0].catch(new TypeError('SYNTHETIC_THROWING_REPLY'),
        ownHost({ replyError })), (error) => error === replyError);
      checked();

      removalFailure = true;
      const cleanupFailure = ownHost();
      filters[0].catch(new TypeError('SYNTHETIC_CLEANUP_HTTP'), cleanupFailure);
      removalFailure = false;
      assert.equal(cleanupFailure.response.status, 500);
      assert.match(cleanupFailure.response.headers['X-Error-ID'], /^[a-f0-9]{32}$/);
      checked();

      const graphqlError = new HttpException('Expected synthetic refusal', 401);
      const nonHttp = ownHost({}, 'graphql');
      assert.throws(() => filters[0].catch(graphqlError, nonHttp), (error) => error === graphqlError);
      noHeader(nonHttp.response);
      checked();
      await Sentry.flush(1_000);
      assert.equal(envelopes.length - correlationStart, 10,
        'only the ten native filter captures admitted by these scenarios may be sent');
      assert.equal(captureCalls - correlationStartCalls, 13,
        'ten sent plus exactly three dropped/invalid/disabled captures, with no extra capture');
      for (const envelope of envelopes) {
        assert(!JSON.stringify(envelope).includes('SYNTHETIC_'));
      }
    } finally {
      beforeSendMode = 'normal';
      releaseDelayed?.();
      client.on = originalOn;
    }
    assert.equal(correlationCases, 17);
    await Sentry.close(1_000);
    transportFailure = true;
    assert.equal(initializer.initializeSentry(service, environment), false);
    assert.equal(networkAttempts, 0);
  } finally {
    if (capturedClient) capturedClient.captureException = originalCaptureException;
    await Sentry?.close(1_000);
    for (const [name, original] of listeners) {
      for (const listener of process.listeners(name)) {
        if (!original.has(listener)) process.off(name, listener);
      }
      assert.equal(process.listeners(name).length, original.size);
    }
  }
  return { status: 'PASS', service, events: 7, correlationCases: 17, networkAttempts, listenersRestored: true };
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
          status: 'PASS', service, events: 7, correlationCases: 17, networkAttempts: 0, listenersRestored: true,
        });
      }
    );
  });
}
