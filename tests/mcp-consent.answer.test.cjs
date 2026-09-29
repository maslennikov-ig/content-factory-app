'use strict';

/**
 * The MCP consent page never navigates on the server's first answer (review
 * W5-26 F2): a refusal is shown with the host it would go back to, and only
 * Allow or Deny sends the browser anywhere.
 */

const fs = require('node:fs');
const path = require('node:path');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const DIR = 'apps/frontend/src/app/(app)/oauth/authorize';
const { readConsentAnswer } = loadTypeScriptModule(`${DIR}/mcp-consent.answer.ts`);

describe('the MCP consent page', () => {
  test('a refusal is shown with its host, not followed', () => {
    expect(
      readConsentAnswer(true, {
        refused: true,
        error: 'invalid_request',
        redirectHost: 'evil.example',
        redirect: 'https://evil.example/login?error=invalid_request',
      })
    ).toEqual({
      kind: 'refused',
      redirect: 'https://evil.example/login?error=invalid_request',
      redirectHost: 'evil.example',
    });
  });

  test('a consent carries the workspace it is for', () => {
    expect(
      readConsentAnswer(true, {
        client: { name: 'Claude' },
        redirectHost: 'claude.ai',
        workspace: { id: 'org-1', name: 'Stand' },
      })
    ).toEqual({
      kind: 'consent',
      consent: { client: { name: 'Claude' }, redirectHost: 'claude.ai', workspace: { id: 'org-1', name: 'Stand' } },
    });
  });

  test('anything else is a failure', () => {
    expect(readConsentAnswer(false, { error: 'invalid_client' })).toEqual({ kind: 'failed' });
    expect(readConsentAnswer(true, { redirect: 'https://evil.example' })).toEqual({ kind: 'failed' });
    expect(readConsentAnswer(true, { client: { name: 'x' }, redirectHost: 'h' })).toEqual({ kind: 'failed' });
  });

  test('the page navigates only from the decision, and sends the workspace back', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '..', DIR, 'mcp-consent.tsx'), 'utf8');
    const navigations = [...source.matchAll(/window\.location/g)];
    expect(navigations).toHaveLength(1);
    const decide = source.slice(source.indexOf('const decide = useCallback'));
    expect(decide.indexOf('window.location')).toBeGreaterThan(0);
    expect(decide.indexOf('window.location')).toBeLessThan(decide.indexOf('if (refused)'));
    expect(decide).toContain('workspace_id: consent?.workspace.id');
    // The refusal is a link the person clicks.
    expect(source).toMatch(/<a [^>]*href=\{refused\.redirect\}/);
  });
});
