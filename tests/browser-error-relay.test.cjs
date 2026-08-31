const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), 'utf8');
const docker = (...args) =>
  spawnSync('docker', args, { encoding: 'utf8', timeout: 30_000 });
const nginxDockerAvailable =
  docker('info', '--format', '{{.ServerVersion}}').status === 0 &&
  docker('image', 'inspect', 'nginx:alpine').status === 0;
const testWithNginx = nginxDockerAvailable ? test : test.skip;

function loadTypeScriptModule(relativePath, mocks = {}) {
  const filename = path.join(root, relativePath);
  if (!fs.existsSync(filename)) return {};
  const compiled = ts.transpileModule(read(relativePath), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
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

const sanitizer = loadTypeScriptModule(
  'libraries/helpers/src/errors/sanitize.error.event.ts'
);
const relay = () =>
  loadTypeScriptModule('libraries/helpers/src/errors/browser.error.relay.ts', {
    '@contentfactory/helpers/errors/sanitize.error.event': sanitizer,
  });
const serverRelay = () =>
  loadTypeScriptModule(
    'libraries/helpers/src/errors/browser.error.relay.server.ts'
  );
const errorCollectionOptions = loadTypeScriptModule(
  'libraries/helpers/src/errors/create.error.collection.options.ts',
  {
    '@contentfactory/helpers/errors/sanitize.error.event': sanitizer,
  }
);
const routeRelay = (sentryModule, optionsModule) => {
  const forwarded = [];
  const sentry = sentryModule ?? {
    captureEvent: (event) => forwarded.push(event),
    flush: async () => true,
  };
  const route = loadTypeScriptModule(
    'apps/frontend/src/app/api/browser-errors/route.ts',
    {
      '@sentry/nextjs': sentry,
      '@contentfactory/helpers/errors/create.error.collection.options': {
        normalizeErrorCollectionDsn:
          optionsModule?.normalizeErrorCollectionDsn ??
          (() => ({ enabled: true })),
      },
      '@contentfactory/helpers/errors/browser.error.relay': relay(),
      '@contentfactory/helpers/errors/browser.error.relay.server':
        serverRelay(),
    }
  );
  return { route, forwarded };
};

const CLIENT_SEED_A = 'AAAAAAAAAAAAAAAAAAAAAA';
const CLIENT_SEED_B = 'BBBBBBBBBBBBBBBBBBBBBB';
const relayContentType = (seed = CLIENT_SEED_A) =>
  `application/json; cf-client=${seed}`;

const safeBody = (overrides = {}) => ({
  event_id: '0123456789abcdef0123456789abcdef',
  timestamp: 1_755_000_000.25,
  level: 'error',
  exception: {
    type: 'TypeError',
    frames: [
      {
        filename: '_next/static/chunks/app.js',
        function: 'Editor.save',
        lineno: 42,
        colno: 7,
        in_app: true,
      },
    ],
  },
  ...overrides,
});

const request = (body, overrides = {}) =>
  new Request('https://factory.invalid/api/browser-errors', {
    method: 'POST',
    headers: {
      origin: 'https://factory.invalid',
      'content-type': relayContentType(),
      ...overrides.headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

async function clientRelayFetchOptions(origin) {
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
        browserErrorPayloadFromEnvelope: () => safeBody(),
      },
    });
    await sentryOptions.transport().send({});
    return fetchCall;
  } finally {
    global.window = previousWindow;
    global.fetch = previousFetch;
  }
}

describe('browser errors cross only the bounded first-party relay', () => {
  test('an exhausted client budget does not block a distinct client key', () => {
    // Break caught: replacing keyed counters with one process-wide count makes
    // the final first event from B fail after A spends its own budget.
    const { BrowserErrorRelayLimiter } = relay();
    const limiter = new BrowserErrorRelayLimiter({
      limit: 1,
      windowMs: 60_000,
      maxClients: 32,
    });

    expect(limiter.allow('server-derived-client-a', 1_000)).toBe(true);
    expect(limiter.allow('server-derived-client-a', 1_001)).toBe(false);
    expect(limiter.allow('server-derived-client-b', 1_002)).toBe(true);
  });

  test('derives short-lived opaque keys from only the strict media-type parameter', () => {
    // Break caught: accepting a raw/spoofed metadata field or retaining one
    // salt across windows creates an unbounded or cross-session identifier.
    const { BrowserErrorRelayClientKeyring } = serverRelay();
    expect(typeof BrowserErrorRelayClientKeyring).toBe('function');
    if (typeof BrowserErrorRelayClientKeyring !== 'function') return;

    const keys = new BrowserErrorRelayClientKeyring({ windowMs: 1_000 });
    const firstA = keys.derive(relayContentType(CLIENT_SEED_A), 1_000);
    const sameWindowA = keys.derive(relayContentType(CLIENT_SEED_A), 1_999);
    const firstB = keys.derive(relayContentType(CLIENT_SEED_B), 1_999);
    const nextWindowA = keys.derive(relayContentType(CLIENT_SEED_A), 2_000);

    expect(firstA).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(sameWindowA).toBe(firstA);
    expect(firstB).not.toBe(firstA);
    expect(nextWindowA).not.toBe(firstA);
    for (const malformed of [
      null,
      'application/json',
      'application/json; cf-client=short',
      relayContentType(CLIENT_SEED_A) + '; charset=utf-8',
      `application/json; cf-client=${CLIENT_SEED_A},${CLIENT_SEED_B}`,
      `application/json; cf-client=${'A'.repeat(21)}!`,
    ]) {
      expect(keys.derive(malformed, 2_001)).toBeNull();
    }
  });

  test('rejects missing and malformed keys without spending a valid client budget', async () => {
    // Break caught: a legacy shared fallback lets malformed traffic consume
    // capacity needed by a valid privacy-safe client.
    const { BrowserErrorRelayClientKeyring } = serverRelay();
    const { BrowserErrorRelayLimiter, handleBrowserErrorRelayRequest } =
      relay();
    expect(typeof BrowserErrorRelayClientKeyring).toBe('function');
    if (typeof BrowserErrorRelayClientKeyring !== 'function') return;

    const keyring = new BrowserErrorRelayClientKeyring({ windowMs: 60_000 });
    const dependencies = {
      expectedOrigin: 'https://factory.invalid',
      context: { service: 'frontend', environment: 'test' },
      limiter: new BrowserErrorRelayLimiter({
        limit: 1,
        windowMs: 60_000,
        maxClients: 32,
      }),
      clientKey: (incoming, now) =>
        keyring.derive(incoming.headers.get('content-type'), now),
      forward: async () => true,
    };

    expect(
      (
        await handleBrowserErrorRelayRequest(
          request(safeBody(), {
            headers: { 'content-type': 'application/json' },
          }),
          dependencies
        )
      ).status
    ).toBe(400);
    expect(
      (
        await handleBrowserErrorRelayRequest(
          request(safeBody(), {
            headers: {
              'content-type': 'application/json; cf-client=spoofed',
            },
          }),
          dependencies
        )
      ).status
    ).toBe(400);
    expect(
      (await handleBrowserErrorRelayRequest(request(safeBody()), dependencies))
        .status
    ).toBe(202);
  });

  test('keeps client seeds and derived keys out of responses, logs and forwarded events', async () => {
    // Break caught: passing the key through the closed JSON or rebuilt event
    // leaks a document identifier to the external collector.
    const { BrowserErrorRelayClientKeyring } = serverRelay();
    const { BrowserErrorRelayLimiter, handleBrowserErrorRelayRequest } =
      relay();
    expect(typeof BrowserErrorRelayClientKeyring).toBe('function');
    if (typeof BrowserErrorRelayClientKeyring !== 'function') return;

    const keyring = new BrowserErrorRelayClientKeyring({ windowMs: 60_000 });
    const now = Date.now();
    const derivedA = keyring.derive(relayContentType(CLIENT_SEED_A), now);
    const derivedB = keyring.derive(relayContentType(CLIENT_SEED_B), now);
    const forwarded = [];
    const logged = [];
    const spies = ['log', 'warn', 'error'].map((method) =>
      jest.spyOn(console, method).mockImplementation((...values) => {
        logged.push(values);
      })
    );
    const dependencies = {
      expectedOrigin: 'https://factory.invalid',
      context: { service: 'frontend', environment: 'test' },
      limiter: new BrowserErrorRelayLimiter({
        limit: 1,
        windowMs: 60_000,
        maxClients: 32,
      }),
      clientKey: (incoming, requestedAt) =>
        keyring.derive(incoming.headers.get('content-type'), requestedAt),
      forward: async (event) => {
        forwarded.push(event);
      },
    };

    try {
      const firstA = await handleBrowserErrorRelayRequest(
        request(safeBody(), {
          headers: { 'content-type': relayContentType(CLIENT_SEED_A) },
        }),
        dependencies
      );
      const exhaustedA = await handleBrowserErrorRelayRequest(
        request(safeBody(), {
          headers: { 'content-type': relayContentType(CLIENT_SEED_A) },
        }),
        dependencies
      );
      const firstB = await handleBrowserErrorRelayRequest(
        request(safeBody(), {
          headers: { 'content-type': relayContentType(CLIENT_SEED_B) },
        }),
        dependencies
      );

      expect(firstA.status).toBe(202);
      expect(exhaustedA.status).toBe(429);
      expect(firstB.status).toBe(202);
      expect(await firstA.text()).toBe('');
      expect(await exhaustedA.text()).toBe('');
      expect(await firstB.text()).toBe('');
      expect(forwarded).toHaveLength(2);

      const crossedBoundaries = JSON.stringify({ forwarded, logged });
      for (const forbidden of [
        CLIENT_SEED_A,
        CLIENT_SEED_B,
        derivedA,
        derivedB,
      ]) {
        expect(crossedBoundaries).not.toContain(forbidden);
      }
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });

  test('the Next route wires distinct document keys into the real limiter', async () => {
    // Break caught: omitting the keyring at the route boundary makes every
    // request share one key even though the lower-level limiter is keyed.
    const previousFrontendUrl = process.env.FRONTEND_URL;
    process.env.FRONTEND_URL = 'https://factory.invalid';
    jest.useFakeTimers();
    jest.setSystemTime(1_755_000_001_000);

    try {
      const { route, forwarded } = routeRelay();
      expect(typeof route.POST).toBe('function');

      for (let attempt = 0; attempt < 300; attempt += 1) {
        const accepted = await route.POST(
          request(safeBody(), {
            headers: { 'content-type': relayContentType(CLIENT_SEED_A) },
          })
        );
        expect(accepted.status).toBe(202);
      }
      const exhaustedA = await route.POST(
        request(safeBody(), {
          headers: { 'content-type': relayContentType(CLIENT_SEED_A) },
        })
      );
      const firstB = await route.POST(
        request(safeBody(), {
          headers: { 'content-type': relayContentType(CLIENT_SEED_B) },
        })
      );

      expect(exhaustedA.status).toBe(429);
      expect(firstB.status).toBe(202);
      expect(forwarded).toHaveLength(301);
      expect(JSON.stringify(forwarded)).not.toContain(CLIENT_SEED_A);
      expect(JSON.stringify(forwarded)).not.toContain(CLIENT_SEED_B);
    } finally {
      jest.useRealTimers();
      if (previousFrontendUrl === undefined) {
        delete process.env.FRONTEND_URL;
      } else {
        process.env.FRONTEND_URL = previousFrontendUrl;
      }
    }
  });

  test('bounds client state and clears exhausted keys at the window boundary', () => {
    // Break caught: removing eviction or window cleanup lets rotating client
    // keys grow process memory without bound.
    const { BrowserErrorRelayLimiter } = relay();
    const limiter = new BrowserErrorRelayLimiter({
      limit: 1,
      windowMs: 1_000,
      maxClients: 2,
    });

    expect(limiter.allow('derived-a', 1_000)).toBe(true);
    expect(limiter.allow('derived-a', 1_001)).toBe(false);
    expect(limiter.allow('derived-b', 1_002)).toBe(true);
    expect(limiter.allow('derived-c', 1_003)).toBe(true);
    expect(limiter.allow('derived-a', 1_004)).toBe(true);
    expect(limiter.allow('derived-a', 2_004)).toBe(true);
  });

  testWithNginx(
    'the actual nginx relay keeps valid client budgets independent and forwards the strict media type',
    async () => {
      // Break caught: a `$server_name` zone rejects B after A exhausts the
      // shared burst; forwarding the wrong variable drops cf-client before
      // the request reaches the Next upstream.
      const temporaryDirectory = fs.mkdtempSync(
        path.join(os.tmpdir(), 'cf-browser-relay-nginx-')
      );
      const configPath = path.join(temporaryDirectory, 'nginx.conf');
      const container = `cf-browser-relay-proof-${process.pid}-${Date.now()}`;
      let config = read('var/docker/nginx.conf')
        .replace(/^user\s+www;/m, 'user nginx;')
        .replace(
          'proxy_pass http://localhost:4200/api/browser-errors;',
          'proxy_pass http://127.0.0.1:5100/echo;'
        );
      const finalBrace = config.lastIndexOf('\n}');
      config = `${config.slice(0, finalBrace)}
    server {
        listen 5100;
        server_name relay-proof-upstream;
        location = /echo {
            default_type text/plain;
            return 200 "$http_content_type";
        }
    }
${config.slice(finalBrace)}`;
      fs.writeFileSync(configPath, config);

      try {
        const started = docker(
          'run',
          '--detach',
          '--name',
          container,
          '--publish',
          '127.0.0.1::5000',
          '--volume',
          `${configPath}:/etc/nginx/nginx.conf:ro`,
          'nginx:alpine'
        );
        expect({ status: started.status, stderr: started.stderr }).toEqual({
          status: 0,
          stderr: '',
        });

        const published = docker('port', container, '5000/tcp');
        expect(published.status).toBe(0);
        const port = Number(published.stdout.trim().match(/:(\d+)$/)?.[1]);
        expect(Number.isInteger(port)).toBe(true);
        const origin = `http://127.0.0.1:${port}`;

        let ready = false;
        for (let attempt = 0; attempt < 50; attempt += 1) {
          try {
            await fetch(origin);
            ready = true;
            break;
          } catch {
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
        }
        expect(ready).toBe(true);

        const send = async (contentType) => {
          const headers = { origin: 'https://factory.invalid' };
          if (contentType !== null) headers['content-type'] = contentType;
          const response = await fetch(`${origin}/api/browser-errors`, {
            method: 'POST',
            headers,
            body: new Uint8Array([123, 125]),
          });
          return { status: response.status, body: await response.text() };
        };

        const fromA = await Promise.all(
          Array.from({ length: 24 }, () =>
            send(relayContentType(CLIENT_SEED_A))
          )
        );
        const fromB = await send(relayContentType(CLIENT_SEED_B));
        const malformed = await Promise.all(
          Array.from({ length: 24 }, () =>
            send('application/json; cf-client=spoofed')
          )
        );
        const missing = await send(null);

        expect({
          aExhausted: fromA.some(({ status }) => status === 429),
          aForwardedContentTypes: [
            ...new Set(
              fromA
                .filter(({ status }) => status === 200)
                .map(({ body }) => body)
            ),
          ],
          b: fromB,
          malformedExhausted: malformed.some(({ status }) => status === 429),
          missingStatus: missing.status,
        }).toEqual({
          aExhausted: true,
          aForwardedContentTypes: [relayContentType(CLIENT_SEED_A)],
          b: { status: 200, body: relayContentType(CLIENT_SEED_B) },
          malformedExhausted: true,
          missingStatus: 429,
        });
      } finally {
        docker('rm', '--force', container);
        fs.rmSync(temporaryDirectory, { recursive: true, force: true });
      }
    },
    60_000
  );

  test('accepts exactly the allowlisted shape and rebuilds the collector event', () => {
    const { parseBrowserErrorRelayPayload } = relay();
    expect(typeof parseBrowserErrorRelayPayload).toBe('function');
    if (typeof parseBrowserErrorRelayPayload !== 'function') return;

    const secret = 'owner@example.com prompt: publish confidential draft';
    const parsed = parseBrowserErrorRelayPayload({
      ...safeBody(),
      message: secret,
    });
    expect(parsed).toBeNull();

    expect(
      parseBrowserErrorRelayPayload(
        safeBody({
          exception: {
            type: 'TypeError',
            value: secret,
            frames: safeBody().exception.frames,
          },
        })
      )
    ).toBeNull();

    expect(
      parseBrowserErrorRelayPayload(
        safeBody({
          exception: {
            type: 'TypeError',
            frames: [
              {
                filename: 'https://factory.invalid/?prompt=' + secret,
                function: secret,
              },
            ],
          },
        })
      )
    ).toBeNull();

    expect(parseBrowserErrorRelayPayload(safeBody())).toEqual({
      event_id: '0123456789abcdef0123456789abcdef',
      timestamp: 1_755_000_000.25,
      level: 'error',
      exception: {
        type: 'TypeError',
        frames: [
          {
            filename: '_next/static/chunks/app.js',
            function: 'Editor.save',
            lineno: 42,
            colno: 7,
            in_app: true,
          },
        ],
      },
    });
  });

  test('extracts a bounded body from an SDK envelope without carrying metadata', () => {
    const { browserErrorPayloadFromEnvelope } = relay();
    expect(typeof browserErrorPayloadFromEnvelope).toBe('function');
    if (typeof browserErrorPayloadFromEnvelope !== 'function') return;

    const secret = 'owner@example.com model output: confidential';
    const payload = browserErrorPayloadFromEnvelope([
      { event_id: '0123456789abcdef0123456789abcdef', dsn: secret },
      [
        [
          { type: 'event', content_type: 'application/json' },
          {
            event_id: safeBody().event_id,
            timestamp: safeBody().timestamp,
            level: safeBody().level,
            exception: {
              values: [
                {
                  type: 'TypeError',
                  value: secret,
                  stacktrace: {
                    frames: [
                      {
                        ...safeBody().exception.frames[0],
                        filename:
                          'https://factory.invalid/_next/static/chunks/app.js',
                      },
                    ],
                  },
                },
              ],
            },
            message: secret,
            request: { url: `https://factory.invalid/?q=${secret}` },
            user: { ip_address: '127.0.0.1' },
            extra: { prompt: secret },
            sdk: { integrations: [secret] },
          },
        ],
      ],
    ]);

    expect(payload).toEqual(safeBody());
    expect(JSON.stringify(payload)).not.toContain(secret);
  });

  test('the client transport builds an origin-compatible same-origin POST', async () => {
    const { handleBrowserErrorRelayRequest, BrowserErrorRelayLimiter } =
      relay();
    const browserOrigin = 'https://factory.invalid';
    const [input, init] = await clientRelayFetchOptions(browserOrigin);
    const clientRequest = new Request(new URL(input, browserOrigin), init);

    expect(clientRequest.method).toBe('POST');
    // `origin` is not one of the policies that make a non-GET, non-cors request
    // send `Origin: null` (which the guard below rejects), and it still keeps
    // the full page URL out of `Referer`.
    expect(clientRequest.referrerPolicy).toBe('origin');
    expect(clientRequest.mode).toBe('same-origin');
    expect(clientRequest.credentials).toBe('omit');
    expect(new URL(clientRequest.url).origin).toBe(browserOrigin);
    expect(clientRequest.headers.get('content-type')).toMatch(
      /^application\/json; cf-client=[A-Za-z0-9_-]{22}$/
    );

    // The browser supplies this forbidden-to-script header on the wire. Derive
    // it from the same-origin Request instead of using the old hand-written
    // fixture, then exercise the production relay guard and payload parser.
    const headers = new Headers(clientRequest.headers);
    headers.set('origin', new URL(clientRequest.url).origin);
    const relayResponse = await handleBrowserErrorRelayRequest(
      new Request(clientRequest, { headers }),
      {
        expectedOrigin: browserOrigin,
        context: { service: 'frontend', environment: 'test' },
        limiter: new BrowserErrorRelayLimiter({
          limit: 10,
          windowMs: 60_000,
        }),
        clientKey: () => 'server-derived-test-key',
        forward: async () => true,
      }
    );

    expect(relayResponse.status).toBe(202);
  });

  test('enforces origin, content type, body size and a per-client limit', async () => {
    const {
      BrowserErrorRelayLimiter,
      handleBrowserErrorRelayRequest,
      BROWSER_ERROR_RELAY_BODY_LIMIT,
    } = relay();
    expect(typeof handleBrowserErrorRelayRequest).toBe('function');
    expect(typeof BrowserErrorRelayLimiter).toBe('function');
    if (
      typeof handleBrowserErrorRelayRequest !== 'function' ||
      typeof BrowserErrorRelayLimiter !== 'function'
    ) {
      return;
    }

    const dependencies = {
      expectedOrigin: 'https://factory.invalid',
      context: { service: 'frontend', environment: 'production' },
      limiter: new BrowserErrorRelayLimiter({ limit: 2, windowMs: 60_000 }),
      clientKey: () => 'server-derived-test-key',
      forward: async () => true,
    };

    expect(
      (
        await handleBrowserErrorRelayRequest(
          request(safeBody(), {
            headers: { origin: 'https://foreign.invalid' },
          }),
          dependencies
        )
      ).status
    ).toBe(403);
    expect(
      (
        await handleBrowserErrorRelayRequest(
          request(safeBody(), { headers: { 'content-type': 'text/plain' } }),
          dependencies
        )
      ).status
    ).toBe(415);
    expect(
      (
        await handleBrowserErrorRelayRequest(
          request('x'.repeat(BROWSER_ERROR_RELAY_BODY_LIMIT + 1)),
          dependencies
        )
      ).status
    ).toBe(413);

    expect(
      (await handleBrowserErrorRelayRequest(request(safeBody()), dependencies))
        .status
    ).toBe(202);
    expect(
      (await handleBrowserErrorRelayRequest(request(safeBody()), dependencies))
        .status
    ).toBe(429);
    expect(dependencies.limiter).not.toHaveProperty('keys');
  });

  test('collector outage is bounded and never changes the accepted response', async () => {
    jest.useFakeTimers();
    const { handleBrowserErrorRelayRequest, BrowserErrorRelayLimiter } =
      relay();
    expect(typeof handleBrowserErrorRelayRequest).toBe('function');
    if (typeof handleBrowserErrorRelayRequest !== 'function') return;

    const responsePromise = handleBrowserErrorRelayRequest(
      request(safeBody()),
      {
        expectedOrigin: 'https://factory.invalid',
        context: { service: 'frontend', environment: 'production' },
        limiter: new BrowserErrorRelayLimiter({ limit: 10, windowMs: 60_000 }),
        clientKey: () => 'server-derived-test-key',
        forwardTimeoutMs: 250,
        forward: () => new Promise(() => undefined),
      }
    );
    await jest.advanceTimersByTimeAsync(250);
    const response = await responsePromise;
    expect(response.status).toBe(202);
    jest.useRealTimers();
  });

  test('the real Next SDK cannot enrich a route event from a contaminated isolation scope', async () => {
    const NextSdk = require('@sentry/nextjs');
    const envelopes = [];
    const options = errorCollectionOptions.createErrorCollectionOptions({
      dsn: 'https://localkey@example.invalid/1',
      allowedOrigin: 'https://example.invalid',
      service: 'frontend',
      environment: 'production',
      release: '2026.08.18',
    });
    expect(options).not.toBeNull();
    NextSdk.init({
      ...options,
      transport: () => ({
        send: async (envelope) => {
          envelopes.push(envelope);
          return { statusCode: 200 };
        },
        flush: async () => true,
      }),
    });

    const secret = 'owner@example.com prompt and model output';
    const previousEnvironment = {
      CONTENT_FACTORY_ERROR_DSN: process.env.CONTENT_FACTORY_ERROR_DSN,
      CONTENT_FACTORY_ERROR_ORIGIN: process.env.CONTENT_FACTORY_ERROR_ORIGIN,
      FRONTEND_URL: process.env.FRONTEND_URL,
    };
    process.env.CONTENT_FACTORY_ERROR_DSN =
      'https://localkey@example.invalid/1';
    process.env.CONTENT_FACTORY_ERROR_ORIGIN = 'https://example.invalid';
    process.env.FRONTEND_URL = 'https://factory.invalid';
    const client = NextSdk.getClient();
    try {
      const { route } = routeRelay(NextSdk, errorCollectionOptions);
      const response = await route.POST(
        request({ ...safeBody(), ignored: secret })
      );

      // An extra field is refused before it can reach the SDK.
      expect(response.status).toBe(400);
      expect(envelopes).toHaveLength(0);

      const accepted = await NextSdk.withIsolationScope(
        async (isolationScope) => {
          isolationScope.setUser({
            id: secret,
            email: secret,
            ip_address: '192.0.2.44',
          });
          isolationScope.setExtra('content', secret);
          isolationScope.setTag('cf-client', CLIENT_SEED_A);
          isolationScope.setContext('request', {
            url: `https://factory.invalid/?draft=${encodeURIComponent(secret)}`,
            headers: { cookie: secret, 'user-agent': secret },
          });
          isolationScope.setSDKProcessingMetadata({
            normalizedRequest: {
              url: `https://factory.invalid/api/browser-errors?draft=${encodeURIComponent(
                secret
              )}`,
              headers: { cookie: secret, 'user-agent': secret },
              data: secret,
            },
          });

          return route.POST(
            new Request(
              `https://factory.invalid/api/browser-errors?draft=${encodeURIComponent(
                secret
              )}`,
              {
                method: 'POST',
                headers: {
                  origin: 'https://factory.invalid',
                  'content-type': relayContentType(CLIENT_SEED_A),
                  'user-agent': secret,
                  cookie: secret,
                  'x-arbitrary-request-metadata': secret,
                },
                body: JSON.stringify(safeBody()),
              }
            )
          );
        }
      );

      expect(accepted.status).toBe(202);
      expect(envelopes).toHaveLength(1);

      const stored = envelopes[0][1][0][1];
      const serialized = JSON.stringify(stored);
      expect(stored.exception.values[0].value).toBeUndefined();
      expect(stored.exception.values[0].stacktrace.frames[0].filename).toBe(
        '_next/static/chunks/app.js'
      );
      expect(stored.request).toBeUndefined();
      expect(stored.user).toBeUndefined();
      expect(stored.extra).toBeUndefined();
      expect(stored.contexts).toBeUndefined();
      expect(serialized).not.toContain(secret);
      expect(serialized).not.toContain(CLIENT_SEED_A);
      expect(serialized).not.toContain('factory.invalid');
      expect(serialized).not.toContain('browser-errors');
      expect(serialized).not.toMatch(/user-agent|cookie|authorization|prompt/i);
    } finally {
      await client?.close(1_000);
      for (const [name, value] of Object.entries(previousEnvironment)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });

  test('the exact ingress path suppresses access logs, identifiers and arbitrary headers', () => {
    const nginx = read('var/docker/nginx.conf');
    const exactLocation = nginx.match(
      /location\s*=\s*\/api\/browser-errors\s*\{([\s\S]*?)\n\s*\}/
    )?.[1];
    expect(exactLocation).toBeDefined();
    expect(exactLocation).toMatch(/access_log\s+off/);
    expect(exactLocation).toMatch(/error_log\s+\/dev\/null\s+crit/);
    expect(exactLocation).toMatch(/client_max_body_size\s+16k/);
    expect(exactLocation).toMatch(/proxy_pass_request_headers\s+off/);
    expect(exactLocation).toMatch(/proxy_connect_timeout\s+250ms/);
    expect(exactLocation).not.toMatch(
      /X-Forwarded-For|X-Real-IP|User-Agent|Cookie|Authorization|\$request_uri/
    );
    expect(nginx).toMatch(
      /map\s+\$http_content_type\s+\$cf_browser_error_client/
    );
    expect(nginx).toMatch(
      /limit_req_zone\s+\$cf_browser_error_client\s+zone=browser_error_relay:[^;]+rate=5r\/s/
    );
    expect(nginx).not.toMatch(
      /limit_req_zone\s+\$server_name\s+zone=browser_error_relay/
    );
  });
});
