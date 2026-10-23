const http = require('node:http');
const { createHash, randomUUID } = require('node:crypto');
const { loadTypeScriptModule } = require('./load-ts-module.cjs');
const { FIXTURE_CDN } = require('./video-domain-v1.fixture.cjs');

const ROOT = 'libraries/nestjs-libraries/src/videos/';
const schemas = {
  higgsfield: require('../fixtures/video-subscription/higgsfield/tools.synthetic.json'),
  heygen: require('../fixtures/video-subscription/heygen/tools.synthetic.json'),
};
const codeOf = error => error?.getResponse?.()?.code;

function loadSubscriptionModules(extra = {}) {
  const mocks = { ...extra };
  const authenticatedSession = loadTypeScriptModule('libraries/nestjs-libraries/src/user/authenticated.session.ts');
  for (const alias of ['../../user/authenticated.session', '../../../user/authenticated.session', '@contentfactory/nestjs-libraries/user/authenticated.session']) mocks[alias] = authenticatedSession;
  const register = (file, requests) => {
    const value = loadTypeScriptModule(`${ROOT}${file}.ts`, mocks);
    for (const name of requests) mocks[name] = value;
    return value;
  };
  const registry = register('subscriptions/video-provider-registry', ['./video-provider-registry', '../subscriptions/video-provider-registry', './subscriptions/video-provider-registry']);
  const oauth = register('subscriptions/video-oauth-client', ['./video-oauth-client']);
  const mcp = register('subscriptions/video-mcp-client', ['./video-mcp-client', '../subscriptions/video-mcp-client']);
  const connection = register('subscriptions/video-connection.service', ['./video-connection.service', '../subscriptions/video-connection.service', './subscriptions/video-connection.service']);
  const higgsfield = register('providers/higgsfield-subscription.provider', ['./higgsfield-subscription.provider', '../providers/higgsfield-subscription.provider']);
  const heygen = register('providers/heygen-subscription.provider', ['../providers/heygen-subscription.provider']);
  return {registry, oauth, mcp, connection, higgsfield, heygen, authenticatedSession, mocks, register};
}

/** Invented protocol contract. It is never an account/provider/schema/billing proof. */
async function createProviderFixture(options = {}) {
  const nativeFetch = options.fetch || globalThis.fetch.bind(globalThis);
  const modules = loadSubscriptionModules();
  const { VideoSubscriptionRuntime, boundedSubscriptionResponse, subscriptionHash } = modules.registry;
  let clock = options.now ? new Date(options.now) : new Date();
  let origin;
  let refreshGate;
  const clients = new Map(), codes = new Map(), access = new Map(), refresh = new Map();
  const state = {
    requests: [], registrations: [], authorizations: [], exchanges: [], refreshes: [], revocations: [], identities: [],
    rpc: [], quotes: [], submits: [], polls: [], egress: [], jobs: new Map(),
    scripts: {higgsfield: {}, heygen: {}},
    tools: structuredClone(schemas), eligibility: 'small_trial', quoteAmount: '0.125',
    quoteUpperBound: null, defaultStatus: 'completed', confirmedCharge: null,
    tokenExpiresIn: 300, subject: 'synthetic-wallet-owner', resourceOverrides: {}, metadataOverrides: {}, identityOverride: null,
  };
  const issueTokens = (provider, subject = state.subject) => {
    const access_token = `fixture_access_${randomUUID().replaceAll('-', '')}`;
    const refresh_token = `fixture_refresh_${randomUUID().replaceAll('-', '')}`;
    access.set(access_token, {provider, subject}); refresh.set(refresh_token, {provider, subject});
    return {access_token, refresh_token, token_type: 'Bearer', expires_in: state.tokenExpiresIn};
  };
  const send = (res, status, value, headers = {}) => {
    res.writeHead(status, {'content-type': 'application/json', ...headers});
    res.end(value === undefined ? undefined : JSON.stringify(value));
  };
  const authenticate = (req, provider) => access.get(String(req.headers.authorization || '').replace(/^Bearer /, ''))?.provider === provider;
  const toolResult = (provider, name, args) => {
    const scripted = state.scripts[provider][name]?.shift();
    if (scripted !== undefined) {
      if (scripted === 'lost' && (name === 'create_video' || (name === 'generate_clip' && args.get_cost === false))) {
        const id = `fixture_${provider}_${randomUUID().replaceAll('-', '')}`;
        state.jobs.set(id, {provider, status: state.defaultStatus, url: FIXTURE_CDN});
      }
      return scripted;
    }
    if (name === 'list_avatars') return {eligibility: state.eligibility, avatars: [{id: 'fixture_avatar', engines: ['avatar_iii', 'avatar_iv']}]};
    if (name === 'list_voices') return {eligibility: state.eligibility, voices: [{id: 'fixture_voice_ru', engines: ['avatar_iii', 'avatar_iv'], locales: ['ru', 'ru-RU']}]};
    if (name === 'quote_video' || (name === 'generate_clip' && args.get_cost === true)) {
      return {kind: 'quote', unit: `${provider}_credit`, credits: state.quoteAmount, expires_at: new Date(clock.getTime() + 300_000).toISOString(), upper_bound: state.quoteUpperBound};
    }
    if (name === 'generate_clip' || name === 'create_video') {
      const id = `fixture_${provider}_${randomUUID().replaceAll('-', '')}`;
      state.jobs.set(id, {provider, status: state.defaultStatus, url: FIXTURE_CDN});
      return name === 'create_video' ? {data: {video_id: id}} : {job_id: id};
    }
    if (name === 'jobs_wait' || name === 'get_video') {
      const id = args.job_id || args.video_id; const job = state.jobs.get(id);
      if (!job || job.provider !== provider) return {status: 'failed', job_id: id};
      const result = {job_id: id, status: job.status, ...(job.status === 'completed' ? {video_url: job.url} : {}),
        ...(state.confirmedCharge === null ? {} : {charge: {job_id: id, unit: `${provider}_credit`, amount: state.confirmedCharge}})};
      return name === 'get_video' ? {data: result} : result;
    }
    throw new Error('Fixture refuses unknown MCP tool');
  };
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, origin); const parts = url.pathname.split('/').filter(Boolean);
      const provider = parts[0];
      if (!['higgsfield', 'heygen'].includes(provider)) return send(res, 404, {});
      const issuer = `${origin}/${provider}`; const resource = `${issuer}/mcp`;
      state.requests.push({method: req.method, path: url.pathname});
      let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 1024 * 1024) return send(res, 413, {}); }
      const json = () => JSON.parse(body || '{}');
      if (url.pathname === `/${provider}/.well-known/oauth-protected-resource`) return send(res, 200, {resource, authorization_servers: [issuer], bearer_methods_supported: ['header'], ...state.resourceOverrides});
      if (url.pathname === `/${provider}/.well-known/oauth-authorization-server`) return send(res, 200, {
        issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`, registration_endpoint: `${issuer}/register`,
        revocation_endpoint: `${issuer}/revoke`, response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'],
        token_endpoint_auth_methods_supported: ['none'], code_challenge_methods_supported: ['S256'], ...state.metadataOverrides,
      });
      if (parts[1] === 'register' && req.method === 'POST') {
        const value = json();
        if (value.client_name !== 'Content Factory' || value.token_endpoint_auth_method !== 'none' || value.redirect_uris?.length !== 1) return send(res, 400, {error: 'invalid_client_metadata'});
        const client_id = `fixture_client_${randomUUID()}`; clients.set(client_id, {...value, provider});
        state.registrations.push({provider, client_id, ...value}); return send(res, 201, {client_id, ...value});
      }
      if (parts[1] === 'authorize') {
        const p = url.searchParams; const client = clients.get(p.get('client_id'));
        if (!client || client.provider !== provider || !client.redirect_uris.includes(p.get('redirect_uri')) || p.get('resource') !== resource || p.get('code_challenge_method') !== 'S256' || !p.get('state')) return send(res, 400, {error: 'invalid_request'});
        const code = `fixture_code_${randomUUID()}`;
        codes.set(code, {provider, client: p.get('client_id'), redirect: p.get('redirect_uri'), challenge: p.get('code_challenge'), subject: state.subject});
        state.authorizations.push({provider, state: p.get('state'), resource, challengeMethod: p.get('code_challenge_method')});
        const callback = new URL(p.get('redirect_uri')); callback.searchParams.set('code', code); callback.searchParams.set('state', p.get('state')); callback.searchParams.set('iss', issuer);
        res.writeHead(303, {location: callback.href}); return res.end();
      }
      if (parts[1] === 'token' && req.method === 'POST') {
        const p = new URLSearchParams(body); const client = clients.get(p.get('client_id'));
        if (!client || client.provider !== provider || p.get('resource') !== resource) return send(res, 400, {error: 'invalid_client'});
        if (p.get('grant_type') === 'authorization_code') {
          const code = codes.get(p.get('code')); codes.delete(p.get('code'));
          const challenge = createHash('sha256').update(p.get('code_verifier') || '').digest('base64url');
          if (!code || code.provider !== provider || code.client !== p.get('client_id') || code.redirect !== p.get('redirect_uri') || challenge !== code.challenge) return send(res, 400, {error: 'invalid_grant'});
          state.exchanges.push({provider, resource, pkceVerified: true}); return send(res, 200, issueTokens(provider, code.subject));
        }
        const known = refresh.get(p.get('refresh_token'));
        if (p.get('grant_type') !== 'refresh_token' || known?.provider !== provider) return send(res, 400, {error: 'invalid_grant'});
        refresh.delete(p.get('refresh_token')); state.refreshes.push({provider, rotation: state.refreshes.length + 1});
        if (refreshGate) { refreshGate.enter(); await refreshGate.promise; }
        return send(res, 200, issueTokens(provider, known.subject));
      }
      if (parts[1] === 'identity') {
        const identity = access.get(String(req.headers.authorization || '').replace(/^Bearer /, ''));
        if (identity?.provider !== provider) return send(res, 401, {});
        state.identities.push({provider}); return send(res, 200, state.identityOverride || {iss: issuer, sub: identity.subject});
      }
      if (parts[1] === 'revoke') { state.revocations.push({provider}); return send(res, 200, {}); }
      if (parts[1] !== 'mcp') return send(res, 404, {});
      if (!authenticate(req, provider)) return send(res, 401, {error: 'invalid_token'});
      if (req.method === 'DELETE') return send(res, 200, {});
      if (req.method !== 'POST') return send(res, 405, {});
      const rpc = json(); state.rpc.push({provider, method: rpc.method});
      if (rpc.id === undefined) return send(res, 202);
      let result;
      if (rpc.method === 'initialize') result = {protocolVersion: rpc.params.protocolVersion, capabilities: {tools: {}}, serverInfo: {name: 'Synthetic Content Factory fixture', version: '1.0.0'}};
      else if (rpc.method === 'tools/list') result = {tools: state.tools[provider]};
      else if (rpc.method === 'tools/call') {
        const {name, arguments: args = {}} = rpc.params;
        if (!schemas[provider].some(tool => tool.name === name)) return send(res, 200, {jsonrpc: '2.0', id: rpc.id, error: {code: -32601, message: 'Fixture tool refused'}});
        const call = {provider, name, args: structuredClone(args)};
        if (name === 'quote_video' || (name === 'generate_clip' && args.get_cost === true)) state.quotes.push(call);
        else if (name === 'generate_clip' || name === 'create_video') state.submits.push(call);
        else if (name === 'jobs_wait' || name === 'get_video') state.polls.push(call);
        const value = toolResult(provider, name, args);
        if (value === 'lost') { req.socket.destroy(); return; }
        if (value === 'malformed') result = {content: [{type: 'text', text: '{bad-json'}]};
        else if (value === 'isError') result = {isError: true, content: [{type: 'text', text: 'Synthetic error'}]};
        else result = {content: [{type: 'text', text: JSON.stringify(value)}]};
      } else return send(res, 200, {jsonrpc: '2.0', id: rpc.id, error: {code: -32601, message: 'Fixture method refused'}});
      return send(res, 200, {jsonrpc: '2.0', id: rpc.id, result});
    } catch { if (!res.headersSent) send(res, 500, {error: 'fixture_request_invalid'}); else res.end(); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(options.port || 0, '127.0.0.1', resolve); });
  origin = `http://127.0.0.1:${server.address().port}`;
  class FixtureSubscriptionRuntime extends VideoSubscriptionRuntime {
    definition(provider) {
      if (!schemas[provider]) throw new Error('Fixture provider refused');
      const issuer = `${origin}/${provider}`;
      return {provider, issuer, resource: `${issuer}/mcp`, resourceMetadata: `${issuer}/.well-known/oauth-protected-resource`,
        identityEndpoint: `${issuer}/identity`, origins: [origin], enabled: true,
        schemaDigests: [subscriptionHash(schemas[provider].map(({name, inputSchema}) => ({name, inputSchema})).sort((a,b) => a.name.localeCompare(b.name)))]};
    }
    now() { return new Date(clock); }
    async validateUrl(def, value) {
      const url = new URL(value);
      if (url.origin !== origin || url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password || url.hash || !url.pathname.startsWith(`/${def.provider}/`)) throw new Error('Fixture refused endpoint egress');
    }
    async fetch(def, value, init = {}) {
      await this.validateUrl(def, String(value)); state.egress.push({method: init.method || 'GET', url: String(value)});
      return boundedSubscriptionResponse(await nativeFetch(value, {...init, redirect: 'manual', signal: AbortSignal.timeout(5000)}));
    }
  }
  const runtime = new FixtureSubscriptionRuntime();
  const oauth = new modules.oauth.VideoOAuthClient(runtime);
  const mcp = new modules.mcp.VideoMcpClient(runtime);
  const fixture = {origin, state, runtime, modules, oauth, mcp, issueTokens,
    higgsfield: new modules.higgsfield.HiggsfieldSubscriptionProvider(mcp, runtime),
    heygen: new modules.heygen.HeygenSubscriptionProvider(mcp, runtime),
    setNow(value) { clock = new Date(value); }, advance(ms) { clock = new Date(clock.getTime() + ms); },
    async authorize(url) {
      const parsed = new URL(url); if (parsed.origin !== origin) throw new Error('Fixture refused authorization origin');
      const response = await nativeFetch(parsed, {redirect: 'manual'});
      if (response.status !== 303) throw new Error(`Fixture authorization failed: ${response.status}`);
      return new URL(response.headers.get('location'));
    },
    script(provider, name, ...actions) { (state.scripts[provider][name] ||= []).push(...actions); },
    gateRefresh() {
      let release, enter;
      const entered = new Promise(resolve => { enter = resolve; });
      const promise = new Promise(resolve => { release = resolve; });
      refreshGate = {promise, enter, release};
      return {entered, release() { refreshGate = undefined; release(); }};
    },
    async close() { if (refreshGate) { refreshGate.release(); refreshGate = undefined; } server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); },
  };
  return fixture;
}

module.exports = { createProviderFixture, loadSubscriptionModules, schemas, codeOf };
