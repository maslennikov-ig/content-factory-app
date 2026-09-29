'use strict';

/**
 * Production OAuth discovery for MCP crosses the in-image nginx
 * (`var/docker/nginx.conf`) before it reaches the backend (review W5-26 F1).
 * The backend sits under `/api` (prefix stripped), so the issuer is
 * `https://host/api` and RFC 8414 puts its metadata at the host root. This
 * routes every address the installed MCP SDK client tries, and the
 * protected-resource addresses, through the nginx locations as nginx picks
 * them, and checks where each lands.
 */

const fs = require('node:fs');
const path = require('node:path');
const { buildDiscoveryUrls } = require('@modelcontextprotocol/sdk/client/auth.js');

const root = path.resolve(__dirname, '..');
const conf = fs.readFileSync(path.join(root, 'var/docker/nginx.conf'), 'utf8');
const controller = fs.readFileSync(
  path.join(root, 'apps/backend/src/api/routes/mcp-oauth.controller.ts'),
  'utf8'
);

/** `location [modifier] target { … proxy_pass X; … }`, top-level blocks of the server. */
const locations = [...conf.matchAll(/location\s+(=|\^~|~\*?)?\s*("[^"]+"|\S+)\s*\{([^}]*)\}/g)].map(
  ([, modifier = '', target, body]) => ({
    modifier,
    target: target.replace(/^"|"$/g, ''),
    proxyPass: /proxy_pass\s+([^;]+);/.exec(body)?.[1]?.trim() ?? null,
  })
);

/** nginx's choice: exact, else longest prefix; `^~` stops there, else a regex may win. */
const route = (pathname) => {
  const exact = locations.find((entry) => entry.modifier === '=' && entry.target === pathname);
  if (exact) return exact;
  const prefixes = locations
    .filter((entry) => (entry.modifier === '' || entry.modifier === '^~') && pathname.startsWith(entry.target))
    .sort((a, b) => b.target.length - a.target.length);
  if (prefixes[0]?.modifier === '^~') return prefixes[0];
  const regex = locations.find(
    (entry) => entry.modifier.startsWith('~') && new RegExp(entry.target).test(pathname)
  );
  return regex ?? prefixes[0];
};

/** Where a request lands: the service and the path it sees. */
const land = (pathname) => {
  const location = route(pathname);
  const target = location?.proxyPass ?? '';
  const url = /^https?:\/\/[^/]+(\/.*)?$/.exec(target);
  const service = target.includes(':3000') ? 'backend' : target.includes(':4200') ? 'frontend' : 'other';
  // A `proxy_pass` with a URI replaces the matched prefix; without one the path is kept.
  const seen = url?.[1] ? url[1] + pathname.slice(location.target.length) : pathname;
  return { service, path: seen, location: `${location.modifier} ${location.target}`.trim() };
};

const ISSUER = 'https://factory.example/api';

describe('MCP OAuth discovery through the in-image nginx (review W5-26 F1)', () => {
  test('the block exists, before `location /`, and keeps the path', () => {
    const block = locations.find((entry) => entry.target === '/.well-known/oauth-');
    expect(block).toEqual({ modifier: '^~', target: '/.well-known/oauth-', proxyPass: 'http://localhost:3000' });
    expect(conf.indexOf('location ^~ /.well-known/oauth-')).toBeLessThan(conf.indexOf('location / {'));
  });

  test('the SDK’s first discovery address for the issuer reaches the backend route that serves it', () => {
    const [first, ...rest] = buildDiscoveryUrls(ISSUER);
    expect(first).toMatchObject({ type: 'oauth' });
    const landed = land(new URL(first.url).pathname);
    expect(landed).toMatchObject({ service: 'backend', path: '/.well-known/oauth-authorization-server/api' });
    // The backend route with the suffix, which answers when the suffix is the issuer's path.
    expect(controller).toContain("@Get('/oauth-authorization-server/{*rest}')");
    // The SDK stops at the first document it can read. The OpenID Connect
    // addresses after it are not served on purpose: this server issues no ID
    // tokens and publishes no JWKS, which that document requires.
    expect(rest.map(({ type }) => type)).toEqual(['oidc', 'oidc']);
  });

  test('the protected-resource addresses reach the backend too', () => {
    // The one `/mcp`'s 401 names, under the backend's base.
    expect(land('/api/.well-known/oauth-protected-resource/mcp')).toMatchObject({
      service: 'backend',
      path: '/.well-known/oauth-protected-resource/mcp',
    });
    // The RFC 9728 location for `https://host/api/mcp`, at the host root.
    expect(land('/.well-known/oauth-protected-resource/api/mcp')).toMatchObject({
      service: 'backend',
      path: '/.well-known/oauth-protected-resource/api/mcp',
    });
    expect(controller).toContain("@Get('/oauth-protected-resource/{*rest}')");
  });

  test('the MCP doors themselves go through /api as every backend door', () => {
    for (const pathname of ['/api/mcp', '/api/oauth/mcp/token', '/api/oauth/mcp/register']) {
      expect(land(pathname)).toMatchObject({ service: 'backend', path: pathname.slice('/api'.length) });
    }
    // The consent page is the frontend's.
    expect(land('/oauth/authorize')).toMatchObject({ service: 'frontend' });
    // Other well-known paths stay the frontend's.
    expect(land('/.well-known/security.txt')).toMatchObject({ service: 'frontend' });
  });
});
