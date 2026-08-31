const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const cors = require('cors');
const ts = require('typescript');

function loadTypeScriptModule(relativePath) {
  const filename = path.resolve(__dirname, '..', relativePath);
  const source = fs.readFileSync(filename, 'utf8');
  const compiled = ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
      esModuleInterop: true,
    },
  }).outputText;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  loaded._compile(compiled, filename);
  return loaded.exports;
}

const { buildBackendCorsOptions } = loadTypeScriptModule(
  'apps/backend/src/cors.options.ts'
);

function preflight(options, origin) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      cors(options)(req, res, () => {
        res.statusCode = 204;
        res.end();
      });
    });

    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const request = http.request(
        {
          host: '127.0.0.1',
          port: address.port,
          method: 'OPTIONS',
          path: '/copilot/chat',
          headers: {
            Origin: origin,
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers':
              'content-type,x-copilotkit-runtime-client-gql-version',
          },
        },
        (response) => {
          response.resume();
          response.once('end', () => {
            server.close(() =>
              resolve({
                status: response.statusCode,
                headers: response.headers,
              })
            );
          });
        }
      );
      request.once('error', (error) => {
        server.close(() => reject(error));
      });
      request.end();
    });
  });
}

describe('backend CORS', () => {
  test('accepts a credentialed CopilotKit preflight for the cookie session', async () => {
    const origin = 'http://localhost:4200';
    const response = await preflight(
      buildBackendCorsOptions({
        FRONTEND_URL: origin,
        MAIN_URL: 'http://localhost:4200',
      }),
      origin
    );

    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe(origin);
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  test('still grants credentials in header-authenticated local mode', async () => {
    // The CopilotKit provider hardcodes credentials="include" and never asks
    // whether the deployment is secured, so dropping the credentialed mode
    // here takes the AI chat and the agents down on every NOT_SECURED stack:
    // a browser discards a credentialed response that arrives without
    // Access-Control-Allow-Credentials.
    const origin = 'http://localhost:4200';
    const options = buildBackendCorsOptions({
      FRONTEND_URL: origin,
      NOT_SECURED: 'true',
    });
    const response = await preflight(options, origin);

    expect(response.headers['access-control-allow-origin']).toBe(origin);
    expect(response.headers['access-control-allow-credentials']).toBe('true');
    // Local mode also carries the session in headers, so they have to be
    // readable by the browser.
    expect(options.exposedHeaders).toContain('auth');
  });

  test('offers the MCP Inspector origin only outside production', async () => {
    const inspector = 'http://localhost:6274';
    const development = await preflight(
      buildBackendCorsOptions({ FRONTEND_URL: 'http://localhost:4200' }),
      inspector
    );
    const production = await preflight(
      buildBackendCorsOptions({
        FRONTEND_URL: 'https://app.example',
        NODE_ENV: 'production',
      }),
      inspector
    );

    expect(development.headers['access-control-allow-origin']).toBe(inspector);
    expect(
      production.headers['access-control-allow-origin']
    ).toBeUndefined();
  });

  test('an empty environment allows nothing and never lists undefined', async () => {
    const options = buildBackendCorsOptions({});

    expect(options.origin).not.toContain(undefined);
    const response = await preflight(options, 'http://localhost:4200');
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  test('does not reflect an origin outside the explicit allowlist', async () => {
    const response = await preflight(
      buildBackendCorsOptions({
        FRONTEND_URL: 'http://localhost:4200',
        MAIN_URL: 'http://localhost:4200',
        NOT_SECURED: 'true',
      }),
      'https://untrusted.example'
    );

    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
