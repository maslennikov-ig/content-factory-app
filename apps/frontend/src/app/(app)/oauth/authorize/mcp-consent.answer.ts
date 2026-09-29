/**
 * What the consent page does with the server's answer to the MCP request it
 * forwarded (`content-factory-next-kcxz.26`). Pure, so the rule is tested
 * without a browser.
 *
 * A refusal is shown, never followed (review W5-26 F2): anyone may register a
 * redirect, so a page that navigated on its own would be an open redirector
 * on the product's domain. The person sees the error and the host, and a link
 * back that they may click. Navigation happens only after Allow or Deny.
 */

export type McpConsent = {
  client: { name: string };
  redirectHost: string;
  workspace: { id: string; name: string };
};

export type McpConsentAnswer =
  | { kind: 'consent'; consent: McpConsent }
  | { kind: 'refused'; redirect: string; redirectHost: string }
  | { kind: 'failed' };

export const readConsentAnswer = (ok: boolean, body: any): McpConsentAnswer => {
  if (
    ok &&
    body?.refused === true &&
    typeof body.redirect === 'string' &&
    typeof body.redirectHost === 'string'
  ) {
    return { kind: 'refused', redirect: body.redirect, redirectHost: body.redirectHost };
  }
  if (
    ok &&
    typeof body?.client?.name === 'string' &&
    typeof body?.workspace?.id === 'string' &&
    typeof body?.redirectHost === 'string'
  ) {
    return {
      kind: 'consent',
      consent: {
        client: { name: body.client.name },
        redirectHost: body.redirectHost,
        workspace: { id: body.workspace.id, name: String(body.workspace.name ?? '') },
      },
    };
  }
  return { kind: 'failed' };
};
