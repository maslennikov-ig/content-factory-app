const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const { gzipSync } = require('node:zlib');
const { execFileSync } = require('node:child_process');
const https = require('node:https');
const os = require('node:os');

function loadTypeScriptModule(relativePath, mocks = {}) {
  const filename = path.resolve(__dirname, '..', relativePath);
  if (!fs.existsSync(filename)) {
    throw new Error(`Module under test is missing: ${relativePath}`);
  }
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
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

const errors = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/source-registry/errors.ts'
);
const networkPolicy = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/source-registry/network-policy.ts',
  { './errors': errors }
);
const parser = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/source-registry/source-parser.ts',
  { './errors': errors }
);
const gatewayModule = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/source-registry/source-fetch.gateway.ts',
  {
    './errors': errors,
    './network-policy': networkPolicy,
  }
);

const {
  ACCEPTED_IANA_SPECIAL_REGISTRY,
  canonicalizeSourceUrl,
  isPublicGlobalAddress,
  redactSourceUrl,
} = networkPolicy;
const { parseSourcePayload } = parser;
const { SourceFetchGateway, UndiciSourceTransport } = gatewayModule;

const freshness = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/source-registry/source-freshness.ts'
);
const accessPolicy = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/source-registry/source-access-policy.ts',
  { './errors': errors }
);

function response({
  status = 200,
  headers = {},
  chunks = [Buffer.from('<html><body>ok</body></html>')],
} = {}) {
  return {
    status,
    headers: new Map(
      Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
    ),
    body: (async function* () {
      for (const chunk of chunks) yield chunk;
    })(),
  };
}

test('canonical URL policy rejects credentials, custom ports and non-HTTPS schemes', () => {
  assert.equal(
    canonicalizeSourceUrl(' HTTPS://Example.COM:443/a/../feed?q=2#fragment '),
    'https://example.com/feed?q=2'
  );
  assert.equal(
    redactSourceUrl('https://example.com/feed?token=secret'),
    'https://example.com/feed'
  );

  for (const [input, code] of [
    ['http://example.com/', 'UNSUPPORTED_PROTOCOL'],
    ['https://example.com:444/', 'UNSUPPORTED_PORT'],
    ['https://user:secret@example.com/', 'URL_CREDENTIALS'],
    ['not a URL', 'INVALID_URL'],
  ]) {
    assert.throws(
      () => canonicalizeSourceUrl(input),
      (error) => error.code === code
    );
  }
});

test('address policy rejects special IPv4, IPv6, transitions and embedded private IPv4', () => {
  const blocked = [
    '0.0.0.0',
    '10.0.0.1',
    '100.64.0.1',
    '127.0.0.1',
    '169.254.1.1',
    '172.16.0.1',
    '192.0.0.1',
    '192.0.2.1',
    '192.168.1.1',
    '198.18.0.1',
    '198.51.100.1',
    '203.0.113.1',
    '224.0.0.1',
    '240.0.0.1',
    '::',
    '::1',
    'fe80::1',
    'fc00::1',
    '64:ff9b::a00:1',
    '100::1',
    '100:0:0:1::1',
    '2001:db8::1',
    '2001::1',
    '2002:0808:0808::1',
    '3fff::1',
    '5f00::1',
    '::ffff:10.0.0.1',
    '::192.168.1.1',
    '::10.0.0.1',
    '::ffff:0:10.0.0.1',
    'ff02::1',
  ];
  for (const address of blocked) {
    assert.equal(isPublicGlobalAddress(address), false, address);
  }
  for (const address of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111']) {
    assert.equal(isPublicGlobalAddress(address), true, address);
  }
});

test('accepted IANA policy is versioned and blocks the current dummy IPv6 prefix on every hop', async () => {
  assert.equal(ACCEPTED_IANA_SPECIAL_REGISTRY.version, '2026-08-20');
  assert.equal(
    ACCEPTED_IANA_SPECIAL_REGISTRY.ipv6Deny.some(
      ({ prefix, length }) => prefix === '100:0:0:1::' && length === 64
    ),
    true
  );

  const mixedGateway = new SourceFetchGateway({
    resolver: async () => [
      { address: '2606:4700:4700::1111', family: 6 },
      { address: '100:0:0:1::2', family: 6 },
    ],
    transport: { request: async () => response() },
  });
  await assert.rejects(
    mixedGateway.fetch('https://mixed.example/', 'URL'),
    (error) => error.code === 'DNS_UNSAFE'
  );

  let requests = 0;
  const redirectGateway = new SourceFetchGateway({
    resolver: async () => [{ address: '8.8.8.8', family: 4 }],
    transport: {
      request: async () => {
        requests += 1;
        return response({
          status: 302,
          headers: { location: 'https://[100:0:0:1::3]/private' },
        });
      },
    },
  });
  await assert.rejects(
    redirectGateway.fetch('https://public.example/', 'URL'),
    (error) => error.code === 'DNS_UNSAFE'
  );
  assert.equal(requests, 1);
});

test('gateway rejects a hop when any DNS answer is unsafe and never opens transport', async () => {
  let transportCalls = 0;
  const gateway = new SourceFetchGateway({
    resolver: async () => [
      { address: '8.8.8.8', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ],
    transport: {
      request: async () => {
        transportCalls += 1;
        return response();
      },
    },
  });

  await assert.rejects(
    gateway.fetch('https://example.com/', 'URL'),
    (error) => error.code === 'DNS_UNSAFE'
  );
  assert.equal(transportCalls, 0);
});

test('gateway pins each resolved hop and revalidates redirects before the next request', async () => {
  const requests = [];
  const resolutions = [];
  const answers = {
    'start.example': [{ address: '8.8.8.8', family: 4 }],
    'next.example': [{ address: '1.1.1.1', family: 4 }],
  };
  const gateway = new SourceFetchGateway({
    resolver: async (hostname) => {
      resolutions.push(hostname);
      return answers[hostname];
    },
    transport: {
      request: async (request) => {
        requests.push(request);
        if (requests.length === 1) {
          return response({
            status: 302,
            headers: { location: 'https://next.example/final?private=x' },
          });
        }
        return response({
          headers: { 'content-type': 'text/html; charset=utf-8' },
          chunks: [
            Buffer.from('<html><title>Final</title><body>Hello</body></html>'),
          ],
        });
      },
    },
  });

  const result = await gateway.fetch('https://start.example/a', 'URL');
  assert.deepEqual(
    requests.map(({ hostname, pinnedAddresses, redirect }) => ({
      hostname,
      pinnedAddresses,
      redirect,
    })),
    [
      {
        hostname: 'start.example',
        pinnedAddresses: answers['start.example'],
        redirect: 'manual',
      },
      {
        hostname: 'next.example',
        pinnedAddresses: answers['next.example'],
        redirect: 'manual',
      },
    ]
  );
  assert.deepEqual(resolutions, ['start.example', 'next.example']);
  assert.equal(result.finalUrl, 'https://next.example/final?private=x');
  assert.deepEqual(result.redirectChain, [
    'https://start.example/a',
    'https://next.example/final',
  ]);
});

test('literal IPv6 is checked directly and an unsafe redirect never opens another connection', async () => {
  let calls = 0;
  const gateway = new SourceFetchGateway({
    resolver: async (hostname) => {
      if (hostname === 'start.example')
        return [{ address: '8.8.8.8', family: 4 }];
      throw new Error(`unexpected resolver call for ${hostname}`);
    },
    transport: {
      request: async () => {
        calls += 1;
        return response({
          status: 302,
          headers: { location: 'https://[::1]/private' },
        });
      },
    },
  });
  await assert.rejects(
    gateway.fetch('https://start.example/', 'URL'),
    (error) => error.code === 'DNS_UNSAFE'
  );
  assert.equal(calls, 1);
});

test('embedded-private IPv6 is blocked for literals, DNS answers and redirects before connect', async () => {
  let calls = 0;
  const transport = {
    request: async () => {
      calls += 1;
      return response();
    },
  };
  const literal = new SourceFetchGateway({ transport });
  await assert.rejects(
    literal.fetch('https://[::ffff:0:a00:1]/', 'URL'),
    (error) => error.code === 'DNS_UNSAFE'
  );
  const dnsGateway = new SourceFetchGateway({
    resolver: async () => [{ address: '::192.168.1.1', family: 6 }],
    transport,
  });
  await assert.rejects(
    dnsGateway.fetch('https://dns.example/', 'URL'),
    (error) => error.code === 'DNS_UNSAFE'
  );
  const redirect = new SourceFetchGateway({
    resolver: async () => [{ address: '8.8.8.8', family: 4 }],
    transport: {
      request: async () => {
        calls += 1;
        return response({
          status: 302,
          headers: { location: 'https://[::a00:1]/' },
        });
      },
    },
  });
  await assert.rejects(
    redirect.fetch('https://public.example/', 'URL'),
    (error) => error.code === 'DNS_UNSAFE'
  );
  assert.equal(calls, 1);
});

test('gateway aborts a transport that exceeds the total deadline', async () => {
  const gateway = new SourceFetchGateway({
    resolver: async () => [{ address: '8.8.8.8', family: 4 }],
    transport: { request: async () => new Promise(() => undefined) },
    budgets: { totalTimeoutMs: 20 },
  });
  await assert.rejects(
    gateway.fetch('https://example.com/', 'URL'),
    (error) => error.code === 'TIMEOUT'
  );
});

test('gateway enforces MIME, on-wire and decoded decompression budgets before parsing', async () => {
  const publicResolver = async () => [{ address: '8.8.8.8', family: 4 }];
  const makeGateway = (reply, budgets = {}) =>
    new SourceFetchGateway({
      resolver: publicResolver,
      transport: { request: async () => reply },
      budgets: {
        compressedBytes: 64,
        decompressedBytes: 128,
        decompressionRatio: 4,
        totalTimeoutMs: 500,
        ...budgets,
      },
    });

  await assert.rejects(
    makeGateway(
      response({ headers: { 'content-type': 'application/octet-stream' } })
    ).fetch('https://example.com/', 'URL'),
    (error) => error.code === 'UNSUPPORTED_CONTENT_TYPE'
  );
  await assert.rejects(
    makeGateway(
      response({
        headers: { 'content-type': 'text/html' },
        chunks: [Buffer.alloc(65, 1)],
      })
    ).fetch('https://example.com/', 'URL'),
    (error) => error.code === 'RESPONSE_TOO_LARGE'
  );

  const compressed = gzipSync(Buffer.from('x'.repeat(256)));
  await assert.rejects(
    makeGateway(
      response({
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'content-encoding': 'gzip',
        },
        chunks: [compressed],
      }),
      { compressedBytes: 1024 }
    ).fetch('https://example.com/', 'URL'),
    (error) => error.code === 'DECOMPRESSION_LIMIT'
  );
});

test('bounded parsers reject XML declarations and structural amplification and strip active HTML', () => {
  assert.throws(
    () =>
      parseSourcePayload('RSS', Buffer.from('<!DOCTYPE rss><rss></rss>'), {
        contentType: 'application/rss+xml',
      }),
    (error) => error.code === 'XML_POLICY'
  );
  assert.throws(
    () =>
      parseSourcePayload(
        'RSS',
        Buffer.from(
          `<rss><channel>${'<item><title>x</title></item>'.repeat(
            501
          )}</channel></rss>`
        ),
        { contentType: 'application/rss+xml' }
      ),
    (error) => error.code === 'XML_POLICY'
  );

  const parsed = parseSourcePayload(
    'URL',
    Buffer.from(
      '<html><head><title>Readable</title><style>secret</style></head><body>Hello<script>publish()</script><p>world</p></body></html>'
    ),
    { contentType: 'text/html' }
  );
  assert.equal(parsed.title, 'Readable');
  assert.equal(parsed.text, 'Hello world');
  assert.equal(parsed.text.includes('publish'), false);
  assert.equal(parsed.text.includes('secret'), false);
});

test('freshness deterministically honors cache prohibitions, validators, Expires and bounded RSS TTL', () => {
  const now = new Date('2026-08-20T10:00:00.000Z');
  const calculate = freshness.calculateSourceFreshness;
  assert.deepEqual(calculate({ now, cacheControl: 'no-store, max-age=999' }), {
    storable: false,
    freshUntil: new Date('2026-08-20T10:16:39.000Z'),
    nextFetchNotBefore: new Date('2026-08-20T10:16:39.000Z'),
    mustRevalidate: false,
  });
  for (const cacheControl of ['no-cache', 'must-revalidate', 'max-age=0']) {
    assert.equal(
      calculate({ now, cacheControl }).freshUntil.getTime(),
      now.getTime()
    );
  }
  assert.equal(
    calculate({
      now,
      expires: 'bad date',
      rssTtlMinutes: 30,
    }).freshUntil.toISOString(),
    '2026-08-20T10:30:00.000Z'
  );
  assert.equal(
    calculate({
      now,
      expires: '2026-08-30T10:00:00.000Z',
    }).freshUntil.toISOString(),
    '2026-08-21T10:00:00.000Z'
  );
  assert.equal(
    calculate({ now, rssTtlMinutes: 99999 }).freshUntil.toISOString(),
    '2026-08-21T10:00:00.000Z'
  );
});

test('operator denylist and bounded robots policy fail closed before source retrieval', () => {
  const denied = accessPolicy.parseDeniedDomains(' Example.com,blocked.test ');
  assert.throws(
    () =>
      accessPolicy.assertDomainAllowed('https://news.example.com/feed', denied),
    (error) => error.code === 'TERMS_DENIED'
  );
  assert.doesNotThrow(() =>
    accessPolicy.assertDomainAllowed('https://notexample.com/', denied)
  );
  assert.throws(
    () =>
      accessPolicy.assertRobotsAllowed(
        Buffer.from(
          'User-agent: ContentFactorySourceRegistry\nDisallow: /private\n'
        ),
        'https://public.example/private/feed'
      ),
    (error) => error.code === 'ROBOTS_DISALLOWED'
  );
  assert.doesNotThrow(() =>
    accessPolicy.assertRobotsAllowed(
      Buffer.from('User-agent: *\nDisallow: /\nAllow: /feed\n'),
      'https://public.example/feed'
    )
  );
  for (const [rules, url, allowed] of [
    [
      'User-agent: *\nDisallow: /private/*\n',
      'https://public.example/private/a',
      false,
    ],
    [
      'User-agent: *\nDisallow: /exact$\n',
      'https://public.example/exact',
      false,
    ],
    [
      'User-agent: *\nDisallow: /exact$\n',
      'https://public.example/exact/more',
      true,
    ],
    [
      'User-agent: *\nDisallow: /secret\n',
      'https://public.example/%73ecret',
      false,
    ],
    [
      'User-agent: *\nDisallow: /a%2Fb\n',
      'https://public.example/a%2fb',
      false,
    ],
    [
      'User-agent: *\nDisallow: /file-%2A\n',
      'https://public.example/file-*',
      false,
    ],
    [
      'User-agent: *\nDisallow: /file-%24\n',
      'https://public.example/file-$',
      false,
    ],
    [
      'User-agent: *\nDisallow: /x*\nAllow: /x$\n',
      'https://public.example/x',
      true,
    ],
  ]) {
    const invoke = () =>
      accessPolicy.assertRobotsAllowed(Buffer.from(rules), url);
    if (allowed) assert.doesNotThrow(invoke, `${rules} ${url}`);
    else assert.throws(invoke, (error) => error.code === 'ROBOTS_DISALLOWED');
  }
});

test('operator hop policy revalidates a redirect before opening the denied domain', async () => {
  let requests = 0;
  const gateway = new SourceFetchGateway({
    resolver: async () => [{ address: '8.8.8.8', family: 4 }],
    transport: {
      request: async () => {
        requests += 1;
        return response({
          status: 302,
          headers: { location: 'https://blocked.example/private' },
        });
      },
    },
  });
  await assert.rejects(
    gateway.fetch('https://allowed.example/', 'URL', {}, (url) =>
      accessPolicy.assertDomainAllowed(url, ['blocked.example'])
    ),
    (error) => error.code === 'TERMS_DENIED'
  );
  assert.equal(requests, 1);
});

test('gateway rejects an unsolicited 304 after a cross-origin redirect stripped validators', async () => {
  let calls = 0;
  const gateway = new SourceFetchGateway({
    resolver: async () => [{ address: '8.8.8.8', family: 4 }],
    transport: {
      request: async (request) => {
        calls += 1;
        if (calls === 1) {
          assert.equal(request.headers['if-none-match'], 'v1');
          return response({
            status: 302,
            headers: { location: 'https://other.example/feed' },
          });
        }
        assert.equal(request.headers['if-none-match'], undefined);
        return response({ status: 304 });
      },
    },
  });
  await assert.rejects(
    gateway.fetch('https://origin.example/feed', 'RSS', { etag: 'v1' }),
    (error) => error.code === 'REDIRECT_UNSAFE'
  );
  assert.equal(calls, 2);
});

test('preflight rejects a near-limit million-token document without allocating a DOM', () => {
  let parseCalls = 0;
  const guardedParser = loadTypeScriptModule(
    'libraries/nestjs-libraries/src/content-intelligence/source-registry/source-parser.ts',
    {
      './errors': errors,
      parse5: {
        parse: () => {
          parseCalls += 1;
          throw new Error('DOM allocated');
        },
      },
      'fast-xml-parser': { XMLParser: class XMLParser {} },
    }
  );
  const adversarial = Buffer.from('<b></b>'.repeat(900_000));
  assert.ok(adversarial.length > 6 * 1024 * 1024);
  assert.throws(
    () =>
      guardedParser.parseSourcePayload('URL', adversarial, {
        contentType: 'text/html',
      }),
    (error) => error.code === 'PARSE_FAILED'
  );
  assert.equal(parseCalls, 0);
});

test('Undici transport pins the address while TLS verifies the original hostname', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'source-tls-'));
  const keyPath = path.join(directory, 'key.pem');
  const certificatePath = path.join(directory, 'cert.pem');
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-days',
      '1',
      '-subj',
      '/CN=source.test',
      '-addext',
      'subjectAltName=DNS:source.test',
      '-keyout',
      keyPath,
      '-out',
      certificatePath,
    ],
    { stdio: 'ignore' }
  );
  const certificate = fs.readFileSync(certificatePath);
  let requests = 0;
  const server = https.createServer(
    { key: fs.readFileSync(keyPath), cert: certificate },
    (_request, reply) => {
      requests += 1;
      reply.writeHead(200, { 'content-type': 'text/plain' });
      reply.end('ok');
    }
  );
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const port = server.address().port;
  const transport = new UndiciSourceTransport({ ca: certificate });
  const request = (hostname) =>
    transport.request({
      url: `https://${hostname}:${port}/`,
      hostname,
      pinnedAddresses: [{ address: '127.0.0.1', family: 4 }],
      redirect: 'manual',
      headers: {},
      connectTimeoutMs: 1_000,
      headersTimeoutMs: 1_000,
      bodyTimeoutMs: 1_000,
      signal: new AbortController().signal,
    });
  const valid = await request('source.test');
  assert.equal(valid.status, 200);
  for await (const _chunk of valid.body) {
    /* drain */
  }
  await valid.dispose();
  await assert.rejects(
    request('other.test'),
    /not valid for 'other.test'|Hostname\/IP/iu
  );
  assert.equal(requests, 1);
});
