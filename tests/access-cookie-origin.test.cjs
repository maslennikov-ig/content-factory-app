'use strict';

const http = require('node:http');
const cors = require('cors');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const { AuthService } = loadWithMocks('libraries/helpers/src/auth/auth.service.ts');
const { buildBackendCorsOptions } = loadWithMocks('apps/backend/src/cors.options.ts');
const { AuthMiddleware } = loadWithMocks('apps/backend/src/services/auth/auth.middleware.ts', {
  '@contentfactory/nestjs-libraries/database/prisma/organizations/organization.service': { OrganizationService: class {} },
  '@contentfactory/nestjs-libraries/database/prisma/users/users.service': { UsersService: class {} },
});

const saved = Object.fromEntries(['JWT_SECRET', 'FRONTEND_URL', 'MAIN_URL'].map(k => [k, process.env[k]]));
let server, base, token, effects, orgReads;
beforeAll(async () => {
  process.env.JWT_SECRET = 'synthetic-cookie-test-secret';
  process.env.FRONTEND_URL = 'https://frontend.example.invalid/app';
  process.env.MAIN_URL = 'https://main.example.invalid';
  token = AuthService.signJWT({ id: 'user', activated: true, email: 'synthetic@example.invalid', providerName: 'LOCAL' });
  const middleware = new AuthMiddleware({ getOrgsByUserId: async () => {
    orgReads += 1;
    return [{ id: 'a', apiKey: 'inert', users: [{ disabled: false, role: 'ADMIN' }] }];
  } }, { getUserById: async () => ({ id: 'user', activated: true }) });
  const corsHandler = cors(buildBackendCorsOptions({ NODE_ENV: 'production', FRONTEND_URL: 'https://frontend.example.invalid', MAIN_URL: process.env.MAIN_URL }));
  server = http.createServer((req, res) => {
    req.cookies = Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map(pair => pair.trim().split('=')));
    corsHandler(req, res, () => {
      middleware.use(req, res, () => { effects += 1; res.end('accepted'); })
        .catch(error => { res.statusCode = error.getStatus?.() || 403; res.end('refused'); });
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(() => { effects = 0; orgReads = 0; });
afterAll(async () => {
  await new Promise(resolve => server.close(resolve));
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});
async function send(path, headers = {}, method = 'POST') {
  const response = await fetch(base + path, { method, headers: { cookie: `auth=${token}`, ...headers }, body: method === 'POST' ? 'prompt=synthetic' : undefined });
  await response.text();
  return response;
}

test.each(['/user/api-key/rotate', '/media/generate-image-with-prompt'])('foreign form POST to %s refuses before any authenticated effect', async path => {
  const result = await send(path, { origin: 'https://untrusted.example.invalid', 'content-type': 'application/x-www-form-urlencoded' });
  expect(result.status).toBe(403);
  expect(effects).toBe(0);
  expect(orgReads).toBe(0);
});

test.each(['https://untrusted.example.invalid', 'null', 'https://frontend.example.invalid.attacker.invalid'])('foreign JSON Origin %s refuses even if sent without preflight', async origin => {
  expect((await send('/media/generate-image-with-prompt', { origin, 'content-type': 'application/json' })).status).toBe(403);
  expect(effects).toBe(0);
});

test('cookie mutation with missing Origin refuses, while safe reads still work', async () => {
  expect((await send('/user/api-key/rotate')).status).toBe(403);
  expect(effects).toBe(0);
  expect((await send('/user/self', {}, 'GET')).status).toBe(200);
  expect(effects).toBe(1);
});

test.each(['https://frontend.example.invalid', 'https://main.example.invalid'])('intended frontend %s keeps JSON and multipart cookie mutations', async origin => {
  for (const type of ['application/json', 'multipart/form-data; boundary=synthetic']) {
    expect((await send('/media/upload', { origin, 'content-type': type })).status).toBe(200);
  }
  expect(effects).toBe(2);
});

test('explicit session-header client with no Origin keeps its own authentication contract', async () => {
  expect((await send('/media/upload', { auth: token })).status).toBe(200);
  expect(effects).toBe(1);
});

test('installed CORS preflight gives no foreign permission and never invokes an effect', async () => {
  const result = await send('/user/api-key/rotate', { origin: 'https://untrusted.example.invalid', 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' }, 'OPTIONS');
  expect(result.headers.get('access-control-allow-origin')).toBe(null);
  expect(effects).toBe(0);
  expect((await send('/user/api-key/rotate', { origin: 'https://untrusted.example.invalid', 'content-type': 'application/json' })).status).toBe(403);
  expect(effects).toBe(0);
});
