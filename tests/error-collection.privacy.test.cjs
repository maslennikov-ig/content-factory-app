const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), 'utf8');
const exists = (relativePath) => fs.existsSync(path.join(root, relativePath));

function loadTypeScriptModule(relativePath, mocks = {}) {
  if (!exists(relativePath)) return {};
  const filename = path.join(root, relativePath);
  const compiled = ts.transpileModule(read(relativePath), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const loaded = { exports: {} };
  const localRequire = (request) =>
    Object.prototype.hasOwnProperty.call(mocks, request)
      ? mocks[request]
      : require(request);

  new Function(
    'exports',
    'require',
    'module',
    '__filename',
    '__dirname',
    compiled
  )(loaded.exports, localRequire, loaded, filename, path.dirname(filename));
  return loaded.exports;
}

// Run the browser transport and rebuild the request the browser would send, so
// the relay's transport privacy can be asserted as a value rather than as the
// presence or absence of a substring in the source.
async function browserRelayRequest(origin) {
  let sentryOptions;
  let fetchCall;
  const previousWindow = global.window;
  const previousFetch = global.fetch;
  global.window = { location: { origin } };
  global.fetch = async (...args) => {
    fetchCall = args;
    return new Response(null, { status: 202 });
  };

  try {
    loadTypeScriptModule('apps/frontend/src/instrumentation-client.ts', {
      '@sentry/nextjs': {
        globalHandlersIntegration: () => ({}),
        init: (options) => {
          sentryOptions = options;
        },
      },
      '@contentfactory/helpers/errors/create.error.collection.options': {
        createErrorCollectionOptions: () => ({}),
      },
      '@contentfactory/helpers/errors/browser.error.relay': {
        BROWSER_ERROR_RELAY_PATH: '/api/browser-errors',
        browserErrorPayloadFromEnvelope: () => ({ recorded: true }),
      },
    });
    await sentryOptions.transport().send({});
    const [input, init] = fetchCall;
    return new Request(new URL(input, origin), init);
  } finally {
    global.window = previousWindow;
    global.fetch = previousFetch;
  }
}

const sanitizerPath = 'libraries/helpers/src/errors/sanitize.error.event.ts';
const sentryInitializerPath =
  'libraries/nestjs-libraries/src/sentry/initialize.sentry.ts';

function sanitizerModule() {
  return loadTypeScriptModule(sanitizerPath);
}

function errorCollectionOptionsModule() {
  return loadTypeScriptModule(
    'libraries/helpers/src/errors/create.error.collection.options.ts',
    {
      '@contentfactory/helpers/errors/sanitize.error.event': sanitizerModule(),
    }
  );
}

describe('first-party error collection privacy boundary', () => {
  test('rebuilds an event from the positive allowlist and drops user content', () => {
    const { sanitizeErrorEvent } = sanitizerModule();
    expect(typeof sanitizeErrorEvent).toBe('function');
    if (typeof sanitizeErrorEvent !== 'function') return;

    const secret = 'owner@example.com prompt: publish the confidential launch';
    const identifierLikeSecret = 'OwnerEmailCom';
    const moduleLikeSecret = 'Customer_123';
    const event = {
      event_id: '0123456789abcdef0123456789abcdef',
      timestamp: 1_755_000_000.25,
      level: 'error',
      message: secret,
      logger: secret,
      transaction: '/copilot?prompt=' + secret,
      request: {
        url: 'https://app.invalid/copilot?prompt=' + secret,
        headers: { authorization: 'Bearer live-secret', cookie: secret },
        data: { prompt: secret },
      },
      user: {
        id: 'user-1',
        email: 'owner@example.com',
        ip_address: '127.0.0.1',
      },
      breadcrumbs: [{ message: secret, data: { modelOutput: secret } }],
      extra: { prompt: secret },
      contexts: {
        trace: { data: secret },
        ai: { input: secret, output: secret },
      },
      tags: { arbitrary: secret, service: 'attacker-controlled' },
      exception: {
        values: [
          {
            type: identifierLikeSecret,
            value: secret,
            mechanism: { data: { message: secret } },
            stacktrace: {
              frames: [
                {
                  filename: '/home/owner/private/repository.ts',
                  abs_path: '/home/owner/private/repository.ts',
                  function: secret,
                  module: moduleLikeSecret,
                  lineno: 42,
                  colno: 7,
                  in_app: true,
                  context_line: secret,
                  pre_context: [secret],
                  post_context: [secret],
                  vars: { email: secret },
                },
                {
                  filename: '/app/dist/apps/backend/main.js',
                  abs_path: '/app/dist/apps/backend/main.js',
                  function: 'PostsService.createPost',
                  module: moduleLikeSecret,
                  lineno: 118,
                  colno: 23,
                  in_app: true,
                  context_line: secret,
                  vars: { email: secret },
                },
              ],
            },
          },
        ],
      },
      sdkProcessingMetadata: { request: secret },
      attachments: [{ filename: 'prompt.txt', data: secret }],
    };

    const sanitized = sanitizeErrorEvent(event, {
      service: 'backend',
      environment: 'production',
      release: '2026.08.18',
    });

    expect(sanitized).toEqual({
      type: undefined,
      event_id: '0123456789abcdef0123456789abcdef',
      timestamp: 1_755_000_000.25,
      level: 'error',
      environment: 'production',
      release: '2026.08.18',
      tags: { service: 'backend' },
      exception: {
        values: [
          {
            type: 'Error',
            stacktrace: {
              frames: [
                {
                  lineno: 42,
                  colno: 7,
                  in_app: true,
                },
                {
                  filename: 'dist/apps/backend/main.js',
                  function: 'PostsService.createPost',
                  lineno: 118,
                  colno: 23,
                  in_app: true,
                },
              ],
            },
          },
        ],
      },
    });
    expect(JSON.stringify(sanitized)).not.toContain(secret);
    expect(JSON.stringify(sanitized)).not.toContain('live-secret');
    expect(JSON.stringify(sanitized)).not.toContain(identifierLikeSecret);
    expect(JSON.stringify(sanitized)).not.toContain(moduleLikeSecret);
    expect(JSON.stringify(sanitized)).not.toContain('/home/owner');
  });

  /**
   * Frames used to carry only line and column numbers. That is unusable: the
   * collector groups by exception type and stack, every application class
   * already collapses to `Error`, and "line 42 column 7" in an unnamed file
   * groups the whole product into one problem. The deal struck here is that a
   * frame may name code — a path inside our own tree and a function identifier
   * — and nothing else. What is kept is written by whoever wrote the file; what
   * is refused is anything shaped like a person, a place on the host, or text a
   * user typed.
   */
  test('keeps repository-relative paths and function identifiers, refuses the rest', () => {
    const { sanitizeErrorEvent } = sanitizerModule();
    const frameOf = (frame) =>
      sanitizeErrorEvent(
        {
          event_id: '0123456789abcdef0123456789abcdef',
          timestamp: 1_755_000_000.25,
          exception: {
            values: [{ type: 'Error', stacktrace: { frames: [frame] } }],
          },
        },
        { service: 'backend', environment: 'production' }
      )?.exception.values[0].stacktrace?.frames[0];

    const kept = [
      ['/app/dist/apps/backend/main.js', 'dist/apps/backend/main.js'],
      [
        '/app/libraries/helpers/src/errors/x.ts',
        'libraries/helpers/src/errors/x.ts',
      ],
      [
        'file:///app/apps/orchestrator/src/main.ts',
        'apps/orchestrator/src/main.ts',
      ],
      [
        '/app/apps/frontend/.next/server/chunks/12.js',
        'apps/frontend/.next/server/chunks/12.js',
      ],
      [
        '/app/node_modules/.pnpm/@sentry+core@10.70.0/node_modules/@sentry/core/index.js',
        'node_modules/.pnpm/@sentry+core@10.70.0/node_modules/@sentry/core/index.js',
      ],
    ];
    for (const [raw, expected] of kept) {
      expect(frameOf({ filename: raw, lineno: 1 })).toEqual({
        filename: expected,
        lineno: 1,
      });
    }

    const refusedFilenames = [
      '/home/owner/private/repository.ts',
      '/Users/owner/Desktop/notes.ts',
      '/srv/uploads/2026/owner@example.com/invoice.pdf',
      'https://app.invalid/copilot?prompt=publish the launch',
      '/app/dist/apps/backend/../../../etc/passwd',
      '/app/apps/' + 'a/'.repeat(40) + 'deep.ts',
      '/app/apps/backend/' + 'x'.repeat(300) + '.ts',
    ];
    for (const filename of refusedFilenames) {
      expect(frameOf({ filename, lineno: 1 })).toEqual({ lineno: 1 });
    }

    const keptFunctions = [
      'createPost',
      'PostsService.createPost',
      'new PostsService',
      'async PostsService.createPost',
      'Object.<anonymous>',
      '<anonymous>',
      '_0x$weird',
    ];
    for (const name of keptFunctions) {
      expect(frameOf({ function: name, lineno: 1 })).toEqual({
        function: name,
        lineno: 1,
      });
    }

    const refusedFunctions = [
      'owner@example.com',
      'publish the confidential launch',
      'prompt: publish',
      'https://app.invalid/x',
      '9lives',
      'a.b.c.d.e.f.g',
      'x'.repeat(101),
    ];
    for (const name of refusedFunctions) {
      expect(frameOf({ function: name, lineno: 1 })).toEqual({ lineno: 1 });
    }
  });

  test('fails closed for malformed, content-like, or accessor-backed input', () => {
    const { sanitizeErrorEvent } = sanitizerModule();
    expect(typeof sanitizeErrorEvent).toBe('function');
    if (typeof sanitizeErrorEvent !== 'function') return;

    expect(
      sanitizeErrorEvent(
        {
          event_id: 'not-opaque',
          exception: { values: [{ type: 'owner@example.com' }] },
        },
        { service: 'backend', environment: 'production' }
      )
    ).toBeNull();

    const hostile = {};
    Object.defineProperty(hostile, 'event_id', {
      get() {
        throw new Error('getter must not escape the privacy boundary');
      },
    });
    expect(
      sanitizeErrorEvent(hostile, {
        service: 'backend',
        environment: 'production',
      })
    ).toBeNull();
  });

  test('does nothing without a DSN and installs minimized options with one', () => {
    const initCalls = [];
    const installedFilters = [];
    const adapters = [];
    // The integration factories are the real ones, so the names asserted below
    // are the installed SDK's and not this file's idea of them. A factory only
    // attaches its process listener from `setup(client)`, which stubbed `init`
    // never reaches.
    const realSentry = require('@sentry/nestjs');
    const initializer = loadTypeScriptModule(sentryInitializerPath, {
      '@sentry/nestjs': {
        init: (options) => initCalls.push(options),
        onUncaughtExceptionIntegration:
          realSentry.onUncaughtExceptionIntegration,
        onUnhandledRejectionIntegration:
          realSentry.onUnhandledRejectionIntegration,
      },
      '@sentry/nestjs/setup': {
        SentryGlobalFilter: class {
          constructor(adapter) {
            adapters.push(adapter);
          }
        },
      },
      '@contentfactory/helpers/errors/create.error.collection.options':
        errorCollectionOptionsModule(),
    });

    expect(typeof initializer.initializeSentry).toBe('function');
    expect(typeof initializer.setupSentryErrorHandler).toBe('function');
    if (typeof initializer.initializeSentry !== 'function') return;

    expect(initializer.initializeSentry('backend', {})).toBe(false);
    expect(initCalls).toEqual([]);
    expect(
      initializer.setupSentryErrorHandler(
        {
          getHttpAdapter: () => 'adapter',
          useGlobalFilters: (...filters) => installedFilters.push(...filters),
        },
        {}
      )
    ).toBe(false);
    expect(installedFilters).toEqual([]);

    expect(
      initializer.initializeSentry('orchestrator', {
        CONTENT_FACTORY_ERROR_DSN:
          'https://0123456789abcdef0123456789abcdef@errors.internal/1',
        CONTENT_FACTORY_ERROR_ORIGIN: 'https://errors.internal',
        NODE_ENV: 'production',
        CONTENT_FACTORY_RELEASE: '2026.08.18',
      })
    ).toBe(true);
    expect(initCalls).toHaveLength(1);
    expect(initCalls[0]).toMatchObject({
      dsn: 'https://0123456789abcdef0123456789abcdef@errors.internal/1',
      sendDefaultPii: false,
      enableLogs: false,
      enableMetrics: false,
      defaultIntegrations: false,
      spotlight: false,
      tracesSampleRate: 0,
      profilesSampleRate: 0,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
      autoSessionTracking: false,
      environment: 'production',
      release: '2026.08.18',
    });
    // The default set stays off, so these two are the entire integration list —
    // and they have to be there, or a Temporal worker and a dying process
    // report nothing. See the comment in initialize.sentry.ts.
    expect(initCalls[0].integrations.map(({ name }) => name)).toEqual([
      'OnUncaughtException',
      'OnUnhandledRejection',
    ]);
    expect(initCalls[0].beforeSend).toEqual(expect.any(Function));
    expect(initCalls[0].beforeBreadcrumb()).toBeNull();
    expect(initCalls[0].tracesSampleRate).toBe(0);
    expect(initCalls[0]).not.toHaveProperty('tracesSampler');
    expect(initCalls[0].profilesSampleRate).toBe(0);
    expect(initCalls[0]).not.toHaveProperty('profileSessionSampleRate');
    expect(initCalls[0].replaysSessionSampleRate).toBe(0);
    expect(initCalls[0].replaysOnErrorSampleRate).toBe(0);

    expect(
      initializer.setupSentryErrorHandler(
        {
          getHttpAdapter: () => 'adapter',
          useGlobalFilters: (...filters) => installedFilters.push(...filters),
        },
        {
          CONTENT_FACTORY_ERROR_DSN:
            'https://0123456789abcdef0123456789abcdef@errors.internal/1',
          CONTENT_FACTORY_ERROR_ORIGIN: 'https://errors.internal',
        }
      )
    ).toBe(true);
    expect(adapters).toEqual(['adapter']);
    expect(installedFilters).toHaveLength(1);
  });

  test('requires the DSN to match a separately configured exact origin', () => {
    const { createErrorCollectionOptions } = errorCollectionOptionsModule();
    expect(typeof createErrorCollectionOptions).toBe('function');

    const base = {
      service: 'backend',
      environment: 'production',
    };
    expect(
      createErrorCollectionOptions({
        ...base,
        dsn: 'https://0123456789abcdef0123456789abcdef@errors.internal/1',
      })
    ).toBeNull();
    expect(
      createErrorCollectionOptions({
        ...base,
        dsn: 'https://0123456789abcdef0123456789abcdef@o1.ingest.sentry.io/1',
        allowedOrigin: 'https://errors.internal',
      })
    ).toBeNull();
    expect(
      createErrorCollectionOptions({
        ...base,
        dsn: 'http://0123456789abcdef0123456789abcdef@errors.internal/1',
        allowedOrigin: 'https://errors.internal',
      })
    ).toBeNull();
    expect(
      createErrorCollectionOptions({
        ...base,
        dsn: 'https://0123456789abcdef0123456789abcdef@errors.internal/1',
        allowedOrigin: 'https://errors.internal/path-is-not-an-origin',
      })
    ).toBeNull();
    expect(
      createErrorCollectionOptions({
        ...base,
        dsn: 'https://0123456789abcdef0123456789abcdef@errors.internal/1',
        allowedOrigin: 'https://errors.internal',
      })
    ).toMatchObject({
      dsn: 'https://0123456789abcdef0123456789abcdef@errors.internal/1',
    });
  });

  test('10.70 prepares a real exception before sanitizing and sends no attachment', async () => {
    const Sentry = require('@sentry/nestjs');
    const { createErrorCollectionOptions } = errorCollectionOptionsModule();
    const envelopes = [];
    const secret = 'owner@example.com prompt: private launch';
    const options = createErrorCollectionOptions({
      dsn: 'https://0123456789abcdef0123456789abcdef@errors.internal/1',
      allowedOrigin: 'https://errors.internal',
      service: 'backend',
      environment: 'test',
      release: '2026.08.18',
    });
    expect(options).not.toBeNull();

    const client = Sentry.init({
      ...options,
      skipOpenTelemetrySetup: true,
      registerEsmLoaderHooks: false,
      transport: () => ({
        send: (envelope) => {
          envelopes.push(envelope);
          return Promise.resolve({ statusCode: 200 });
        },
        flush: () => Promise.resolve(true),
      }),
    });

    try {
      Sentry.captureException(new TypeError(secret), {
        attachments: [{ filename: 'prompt.txt', data: secret }],
      });
      expect(await Sentry.flush(1_000)).toBe(true);

      const items = envelopes.flatMap((envelope) => envelope[1]);
      expect(items.map(([header]) => header.type)).toEqual(['event']);
      const payload = items[0][1];
      expect(payload).toMatchObject({
        event_id: expect.stringMatching(/^[a-f0-9]{32}$/),
        timestamp: expect.any(Number),
        level: 'error',
        environment: 'test',
        release: '2026.08.18',
        tags: { service: 'backend' },
        exception: { values: [{ type: 'TypeError' }] },
      });
      expect(
        Object.keys(payload)
          .filter((key) => key !== 'sdk')
          .sort()
      ).toEqual(
        [
          'environment',
          'event_id',
          'exception',
          'level',
          'release',
          'tags',
          'timestamp',
          'type',
        ].sort()
      );
      expect(payload.sdk).toMatchObject({
        name: 'sentry.javascript.nestjs',
        version: '10.70.0',
      });
      expect(JSON.stringify(envelopes)).not.toContain(secret);
    } finally {
      await client?.close(1_000);
    }
  });

  test('ambient Sentry variables cannot add Spotlight or tracing', async () => {
    const Sentry = require('@sentry/nestjs');
    const { createErrorCollectionOptions } = errorCollectionOptionsModule();
    const previousSpotlight = process.env.SENTRY_SPOTLIGHT;
    const previousTraceRate = process.env.SENTRY_TRACES_SAMPLE_RATE;
    const previousDebug = process.env.SENTRY_DEBUG;
    process.env.SENTRY_SPOTLIGHT = 'https://external.example.invalid';
    process.env.SENTRY_TRACES_SAMPLE_RATE = '1';
    process.env.SENTRY_DEBUG = 'true';

    const consoleOutput = [];
    const originalConsole = {
      debug: console.debug,
      error: console.error,
      log: console.log,
      warn: console.warn,
    };
    for (const method of Object.keys(originalConsole)) {
      console[method] = (...args) => consoleOutput.push(args.join(' '));
    }

    const options = createErrorCollectionOptions({
      dsn: 'https://0123456789abcdef0123456789abcdef@errors.internal/1',
      allowedOrigin: 'https://errors.internal',
      service: 'backend',
      environment: 'test',
    });
    expect(options).not.toBeNull();

    let client;

    try {
      client = Sentry.init({
        ...options,
        skipOpenTelemetrySetup: true,
        registerEsmLoaderHooks: false,
        transport: () => ({
          send: () => Promise.resolve({ statusCode: 200 }),
          flush: () => Promise.resolve(true),
        }),
      });
      const installed = client?.getOptions();
      expect(installed?.spotlight).toBe(false);
      expect(installed?.tracesSampleRate).toBe(0);
      expect(installed?.debug).toBe(false);
      expect(installed?.integrations.map(({ name }) => name)).not.toContain(
        'Spotlight'
      );
      const logSecret = 'OWNER_EMAIL_COM_PRIVATE_PROMPT';
      Sentry.captureException(new Error(logSecret));
      expect(await Sentry.flush(1_000)).toBe(true);
      expect(consoleOutput.join('\n')).not.toContain(logSecret);
    } finally {
      await client?.close(1_000);
      Object.assign(console, originalConsole);
      if (previousSpotlight === undefined) delete process.env.SENTRY_SPOTLIGHT;
      else process.env.SENTRY_SPOTLIGHT = previousSpotlight;
      if (previousTraceRate === undefined)
        delete process.env.SENTRY_TRACES_SAMPLE_RATE;
      else process.env.SENTRY_TRACES_SAMPLE_RATE = previousTraceRate;
      if (previousDebug === undefined) delete process.env.SENTRY_DEBUG;
      else process.env.SENTRY_DEBUG = previousDebug;
    }
  });

  test('wires server runtimes and keeps browser capture on the bounded first-party relay', async () => {
    const expectedFiles = [
      'apps/frontend/src/instrumentation.ts',
      'apps/frontend/src/sentry.server.config.ts',
      'apps/frontend/src/sentry.edge.config.ts',
      sentryInitializerPath,
    ];
    expect(expectedFiles.filter((file) => !exists(file))).toEqual([]);
    if (expectedFiles.some((file) => !exists(file))) return;

    expect(read('apps/backend/src/main.ts')).toContain(
      "initializeSentry('backend')"
    );
    expect(read('apps/backend/src/main.ts')).toContain(
      'setupSentryErrorHandler(app)'
    );
    expect(read('apps/orchestrator/src/main.ts')).toContain(
      "initializeSentry('orchestrator')"
    );
    expect(read('apps/orchestrator/src/main.ts')).toContain(
      'setupSentryErrorHandler(app)'
    );

    const nextInstrumentation = read('apps/frontend/src/instrumentation.ts');
    expect(nextInstrumentation).toContain("NEXT_RUNTIME === 'nodejs'");
    expect(nextInstrumentation).toContain("NEXT_RUNTIME === 'edge'");
    expect(nextInstrumentation).toContain('captureRequestError');
    expect(exists('apps/frontend/src/instrumentation-client.ts')).toBe(true);
    const browserInstrumentation = read(
      'apps/frontend/src/instrumentation-client.ts'
    );
    expect(browserInstrumentation).toContain('BROWSER_ERROR_RELAY_PATH');
    expect(browserInstrumentation).toContain("credentials: 'omit'");

    // Assert the mechanism the transport actually builds, not the absence of a
    // string in the source. `origin` keeps `Referer` down to the bare origin
    // instead of the full page URL the default policy sends on a same-origin
    // request, and unlike `no-referrer` it does not make this non-GET,
    // non-cors request send `Origin: null`, which the relay would reject.
    const relayRequest = await browserRelayRequest('https://factory.invalid');
    expect(relayRequest.referrerPolicy).toBe('origin');
    expect(relayRequest.credentials).toBe('omit');
    expect(relayRequest.mode).toBe('same-origin');

    expect(browserInstrumentation).not.toMatch(
      /CONTENT_FACTORY_ERROR_DSN|CONTENT_FACTORY_ERROR_ORIGIN|NEXT_PUBLIC_/
    );
    expect(read('apps/frontend/src/app/global-error.tsx')).not.toMatch(
      /@sentry|captureException/
    );

    // Order is asserted by tests/error-collection.filter-order.test.cjs, which
    // runs Nest's own selection over the real filters.
  });

  test('documents only runtime server configuration and no public browser DSN', () => {
    const localTemplate = read('.env.example');
    const productionTemplate = read('deploy/production/env.example');
    const deployRunbook = read('docs/operations/production-deploy.md');
    const sourceArchiveScript = read('scripts/release/make-source-archive.sh');

    for (const name of [
      'NEXT_PUBLIC_CONTENT_FACTORY_ERROR_DSN',
      'NEXT_PUBLIC_CONTENT_FACTORY_ERROR_ORIGIN',
      'NEXT_PUBLIC_CONTENT_FACTORY_RELEASE',
    ]) {
      expect(localTemplate).not.toContain(name);
      expect(productionTemplate).not.toContain(name);
      expect(deployRunbook).not.toContain(name);
      expect(sourceArchiveScript).not.toContain(name);
    }

    for (const name of [
      'CONTENT_FACTORY_ERROR_DSN',
      'CONTENT_FACTORY_ERROR_ORIGIN',
      'CONTENT_FACTORY_RELEASE',
    ]) {
      expect(localTemplate).toContain(`#${name}=`);
      expect(productionTemplate).toContain(`#${name}=`);
    }
  });

  test('does not let an SDK initialization failure escape a Next entrypoint', () => {
    const mocks = {
      '@sentry/nextjs': {
        init: () => {
          throw new Error('collector unavailable');
        },
        onUncaughtExceptionIntegration: () => ({
          name: 'OnUncaughtException',
        }),
        onUnhandledRejectionIntegration: () => ({
          name: 'OnUnhandledRejection',
        }),
      },
      '@contentfactory/helpers/errors/create.error.collection.options': {
        createErrorCollectionOptions: () => ({ dsn: 'configured' }),
      },
    };

    for (const file of [
      'apps/frontend/src/sentry.server.config.ts',
      'apps/frontend/src/sentry.edge.config.ts',
    ]) {
      expect(() => loadTypeScriptModule(file, mocks)).not.toThrow();
    }
  });

  test('keeps logs, tracing, replay, profiling, AI capture, and uploads absent', () => {
    const relevant = [
      sentryInitializerPath,
      'apps/frontend/src/instrumentation.ts',
      'apps/frontend/src/sentry.server.config.ts',
      'apps/frontend/src/sentry.edge.config.ts',
    ]
      .filter(exists)
      .map(read)
      .join('\n');

    expect(relevant).not.toMatch(
      /consoleLoggingIntegration|openAIIntegration|langChainIntegration|vercelAIIntegration|replayIntegration|browserTracingIntegration|nodeProfilingIntegration|withSentryConfig|authToken|sourceMaps|recordInputs|recordOutputs/
    );
  });
});
