const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const base = 'libraries/nestjs-libraries/src/videos/subscriptions/';
const fail = code => {const error = new Error(code); error.getResponse = () => ({code}); throw error;};
const safeUrl = jest.fn(async () => true);
const realRegistry = loadTypeScriptModule(base + 'video-provider-registry.ts', {
  '../../dtos/webhooks/webhook.url.validator': {isSafePublicHttpsUrl: safeUrl},
  '../../dtos/webhooks/ssrf.safe.dispatcher': {ssrfSafeDispatcher: {}},
  '../video-brief.v1': {videoErrorV1: fail},
});
const {VideoSubscriptionRuntime} = realRegistry;
let transports, closes, tools;
class FakeTransport {constructor(url, options) {this.url = url; this.options = options; transports.push(this);}}
class FakeClient {
  async connect(transport) {this.transport = transport; await this.send('initialize');}
  async send(method) {return this.transport.options.fetch(this.transport.url.href, {method: 'POST', headers: this.transport.options.requestInit.headers, body: JSON.stringify({method})});}
  async listTools() {await this.send('tools/list'); return {tools};}
  async close() {closes++;}
  async callTool() {throw new Error('Generation/tool execution forbidden in this test');}
}
const { VideoMcpClient } = loadTypeScriptModule(base + 'video-mcp-client.ts', {
  '@modelcontextprotocol/sdk/client/index.js': {Client: FakeClient},
  '@modelcontextprotocol/sdk/client/streamableHttp.js': {StreamableHTTPClientTransport: FakeTransport},
  './video-provider-registry': realRegistry,
  '../video-brief.v1': {videoErrorV1: fail},
});
let fetchMock;
beforeEach(() => {transports = []; closes = 0; tools = []; safeUrl.mockReset().mockResolvedValue(true); fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async () => new Response('{}', {status: 200}));});
afterEach(() => jest.restoreAllMocks());
const fixture = () => {const runtime = new VideoSubscriptionRuntime(); return {runtime, client: new VideoMcpClient(runtime), def: runtime.definition('heygen')};};

test('HeyGen transport uses the explicit slash endpoint while canonical OAuth resource and disabled qualification stay unchanged', async () => {
  const {runtime, client, def} = fixture(); const guard = jest.fn(async () => {});
  expect(def.resource).toBe('https://mcp.heygen.com/mcp/v1');
  expect(def.transportEndpoint).toBe('https://mcp.heygen.com/mcp/v1/');
  expect(def.resourceMetadata).toBe('https://mcp.heygen.com/.well-known/oauth-protected-resource/mcp/v1');
  const inventory = await client.discover(def, 'synthetic-token', guard);
  expect(inventory.reviewed).toBe(false); expect(fetchMock).toHaveBeenCalledTimes(2); expect(guard).toHaveBeenCalledTimes(2);
  for (const [url, init] of fetchMock.mock.calls) {
    expect(url).toBe(def.transportEndpoint); expect(init.headers.Authorization).toBe('Bearer synthetic-token'); expect(init.redirect).toBe('manual');
  }
  expect(transports[0].options.authProvider).toBeUndefined(); expect(transports[0].options.reconnectionOptions.maxRetries).toBe(0);
  expect(closes).toBe(1);
  for (const provider of ['higgsfield', 'heygen']) {
    const profile = runtime.definition(provider); expect(profile.enabled).toBe(false); expect(profile.schemaDigests).toEqual([]); expect(profile.identityEndpoint).toBeUndefined();
  }
});

test('Higgsfield and existing fixture profiles retain resource-based transport when no endpoint is configured', async () => {
  const {runtime, client} = fixture();
  const def = runtime.definition('higgsfield'); expect(def.transportEndpoint).toBeUndefined();
  await client.discover(def, 'synthetic-token'); expect(transports[0].url.href).toBe(def.resource);
  const legacy = {...def, resource: 'https://fixture.example/mcp', origins: ['https://fixture.example']};
  await client.discover(legacy, 'synthetic-token'); expect(transports[1].url.href).toBe(legacy.resource);
});

test.each([
  'https://other.example/mcp', 'https://api2.heygen.com/mcp/v1/', 'http://mcp.heygen.com/mcp/v1/',
  'https://user:password@mcp.heygen.com/mcp/v1/', 'https://mcp.heygen.com/mcp/v1/?access_token=secret',
  'https://mcp.heygen.com/mcp/v1/#fragment', '/mcp/v1/', '',
])('unsafe explicit endpoint is refused before constructing a transport or sending a bearer: %s', async transportEndpoint => {
  const {client, def} = fixture();
  await expect(client.discover({...def, transportEndpoint}, 'synthetic-token')).rejects.toMatchObject({message: 'VIDEO_ENDPOINT_UNSAFE'});
  expect(transports).toHaveLength(0); expect(fetchMock).not.toHaveBeenCalled();
});

test('an endpoint outside the explicit origin allowlist remains unavailable even on the canonical resource origin', async () => {
  const {client, def} = fixture();
  await expect(client.discover({...def, origins: ['https://api2.heygen.com']}, 'synthetic-token')).rejects.toMatchObject({message: 'VIDEO_ENDPOINT_UNSAFE'});
  expect(fetchMock).not.toHaveBeenCalled();
});

test('existing per-send SSRF validation still blocks the otherwise syntactically valid endpoint', async () => {
  const {client, def} = fixture(); safeUrl.mockResolvedValue(false);
  await expect(client.discover(def, 'synthetic-token')).rejects.toMatchObject({message: 'VIDEO_ENDPOINT_UNSAFE'});
  expect(fetchMock).not.toHaveBeenCalled(); expect(closes).toBe(1);
});

test('a redirect remains refused rather than followed or retried with a bearer', async () => {
  const {client, def} = fixture(); fetchMock.mockImplementation(async () => new Response('', {status: 307, headers: {Location: 'https://other.example/mcp'}}));
  await expect(client.discover(def, 'synthetic-token')).rejects.toMatchObject({message: 'VIDEO_ENDPOINT_REDIRECT_REFUSED'});
  expect(fetchMock).toHaveBeenCalledTimes(1); expect(closes).toBe(1);
});

test('revocation between initialization and tools/list prevents the next send without replay', async () => {
  const {client, def} = fixture(); const guard = jest.fn().mockResolvedValueOnce(undefined).mockImplementation(() => fail('VIDEO_ACCESS_DENIED'));
  await expect(client.discover(def, 'synthetic-token', guard)).rejects.toMatchObject({message: 'VIDEO_ACCESS_DENIED'});
  expect(fetchMock).toHaveBeenCalledTimes(1); expect(closes).toBe(1);
});

test('host-facade tool names never become admitted raw tools because the transport address changed', async () => {
  const {client, runtime} = fixture(); const def = runtime.definition('higgsfield');
  tools = [{name: 'generate_clip', inputSchema: {type: 'object'}}, {name: 'generate_video', inputSchema: {type: 'object'}}];
  const inventory = await client.discover(def, 'synthetic-token');
  expect(inventory.tools.map(t => t.name)).toEqual(['generate_clip']); expect(inventory.reviewed).toBe(false);
  await expect(client.call(def, 'synthetic-token', 'generate_video', {})).rejects.toMatchObject({message: 'VIDEO_TOOL_UNAVAILABLE'});
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test('OAuth authorization still uses the metadata resource, not the HTTP endpoint, and does not invent scopes', () => {
  const startAuthorization = jest.fn();
  const {VideoOAuthClient} = loadTypeScriptModule(base + 'video-oauth-client.ts', {
    '@modelcontextprotocol/sdk/client/auth.js': {startAuthorization},
    './video-provider-registry': realRegistry, '../video-brief.v1': {videoErrorV1: fail},
  });
  const {runtime, def} = fixture(); new VideoOAuthClient(runtime).authorize(def, {}, {}, 'https://cf.example/callback', 'synthetic-state');
  const options = startAuthorization.mock.calls[0][1]; expect(options.resource).toBe('https://mcp.heygen.com/mcp/v1'); expect(options.scope).toBeUndefined();
  expect(fetchMock).not.toHaveBeenCalled();
});

test('only explicit operator discovery gets the larger response budget; provider metadata cannot enable it', async () => {
  const {client, def} = fixture();
  fetchMock.mockImplementation(async () => new Response('x'.repeat(1024 * 1024 + 1)));
  await expect(client.discover({...def, qualificationMaxBytes: 8 * 1024 * 1024}, 'synthetic-token'))
    .rejects.toMatchObject({message: 'VIDEO_RESPONSE_TOO_LARGE'});
  await expect(client.discoverQualification(def, 'synthetic-token')).resolves.toMatchObject({reviewed: false});
  expect(fetchMock).toHaveBeenCalledTimes(3);
});

test('normal tools/call still rejects a response above 1 MiB', async () => {
  const {client, def} = fixture();
  jest.spyOn(FakeClient.prototype, 'callTool').mockImplementation(async function () {await this.send('tools/call'); return {structuredContent: {}};});
  fetchMock.mockImplementation(async (_url, init) => new Response(JSON.parse(init.body).method === 'tools/call' ? 'x'.repeat(1024 * 1024 + 1) : '{}'));
  await expect(client.call(def, 'synthetic-token', 'create_video', {})).rejects.toMatchObject({message: 'VIDEO_RESPONSE_TOO_LARGE'});
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test.each(['tools/call', 'resources/read', 'ping', 'notifications/arbitrary'])('operator transport refuses %s before another request or bearer leaves', async method => {
  const {client, def} = fixture();
  jest.spyOn(FakeClient.prototype, 'listTools').mockImplementation(async function () {await this.send(method); return {tools: []};});
  await expect(client.discoverQualification(def, 'synthetic-token')).rejects.toMatchObject({message: 'VIDEO_TOOL_UNAVAILABLE'});
  expect(fetchMock).toHaveBeenCalledTimes(1); expect(closes).toBe(1);
});

test('operator discovery retains redirect refusal and per-send revocation fences', async () => {
  const {client, def} = fixture();
  fetchMock.mockImplementation(async () => new Response('', {status: 307, headers: {Location: 'https://foreign.example/'}}));
  await expect(client.discoverQualification(def, 'synthetic-token')).rejects.toMatchObject({message: 'VIDEO_ENDPOINT_REDIRECT_REFUSED'});
  expect(fetchMock).toHaveBeenCalledTimes(1);
  fetchMock.mockClear().mockImplementation(async () => new Response('{}'));
  const guard = jest.fn().mockResolvedValueOnce(undefined).mockImplementation(() => fail('VIDEO_ACCESS_DENIED'));
  await expect(client.discoverQualification(def, 'synthetic-token', guard)).rejects.toMatchObject({message: 'VIDEO_ACCESS_DENIED'});
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('operator response deadline starts before headers and reveals no remote fetch error text', async () => {
  const {client, def} = fixture(); const timeout = AbortSignal.timeout.bind(AbortSignal);
  const clock = jest.spyOn(AbortSignal, 'timeout').mockImplementation(ms => timeout(ms === 20_000 ? 30 : ms));
  fetchMock.mockImplementation(async (_url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('private remote fetch text')), {once: true})));
  try {
    let error; try {await client.discoverQualification(def, 'synthetic-token');} catch (e) {error = e;}
    expect(error.getResponse()).toEqual({code: 'VIDEO_RESPONSE_TIMEOUT', qualification: {phase: 'initialize', maximumBytes: 8 * 1024 * 1024, observedBytes: 0}});
    expect(clock).toHaveBeenCalledWith(20_000); expect(fetchMock).toHaveBeenCalledTimes(1);
  } finally {clock.mockRestore();}
});

test('the fixed total qualification deadline also bounds a stalled transport close', async () => {
  const {client, def} = fixture(); const nativeTimeout = global.setTimeout;
  const clock = jest.spyOn(global, 'setTimeout').mockImplementation((fn, ms, ...args) => nativeTimeout(fn, ms === 45_000 ? 30 : ms, ...args));
  jest.spyOn(FakeClient.prototype, 'close').mockImplementation(async () => new Promise(() => {}));
  try {
    let error; try {await client.discoverQualification(def, 'synthetic-token');} catch (e) {error = e;}
    expect(error.getResponse()).toEqual({code: 'VIDEO_RESPONSE_TIMEOUT', qualification: {phase: 'close', maximumBytes: 8 * 1024 * 1024, observedBytes: 0}});
    expect(clock).toHaveBeenCalledWith(expect.any(Function), 45_000);
  } finally {clock.mockRestore();}
});

test.each([false, true])('timeout cannot return partial bytes when cancellation settles a read (already aborted: %s)', async alreadyAborted => {
  const controller = new AbortController(); const canceled = jest.fn();
  const response = new Response(new ReadableStream({
    start(stream) {stream.enqueue(new Uint8Array([123]));}, // A partial JSON body, then an indefinitely pending read.
    cancel: canceled,
  }));
  if (alreadyAborted) controller.abort();
  const pending = realRegistry.boundedSubscriptionResponse(response, {phase: 'tools/list', signal: controller.signal});
  if (!alreadyAborted) {await new Promise(setImmediate); controller.abort();}
  let error; try {await pending;} catch (e) {error = e;}
  expect(error?.getResponse()).toEqual({code: 'VIDEO_RESPONSE_TIMEOUT', qualification: {phase: 'tools/list', maximumBytes: 8 * 1024 * 1024, observedBytes: alreadyAborted ? 0 : 1}});
  expect(canceled).toHaveBeenCalledTimes(1);
});
