import { INestApplication, Logger } from '@nestjs/common';
import { isOrganizationEditor } from '@contentfactory/nestjs-libraries/user/organization.roles';

/**
 * MCP is off unless the operator turns it on (`content-factory-next-kcxz.1`).
 * Until 26.09.2026 it was mounted on every start, with raw `app.use` past
 * `PoliciesGuard` and the throttler, and it could publish at once and spend
 * money on media. The agent harness rebuilds it on the capability registry
 * (`kcxz.26`, `docs/product/agent-harness-spec.md` §4.10); until then it stays
 * dark by default and narrow when lit.
 */
export const isMcpEnabled = (env: NodeJS.ProcessEnv = process.env) =>
  env.MCP_ENABLED === 'true';

/** What MCP clients show for this server; the rebuild mounts it under this name. */
export const MCP_SERVER_INFO = {
  name: 'Content Factory MCP',
  version: '1.0.0',
} as const;

/** An OAuth token speaks for one member; only a writer may use MCP. */
export const mayUseMcp = (authorization: {
  organizationId?: string;
  user?: {
    activated?: boolean;
    organizations?: {
      organizationId: string;
      role: string;
      disabled: boolean;
    }[];
  } | null;
}) => {
  if (!authorization.user?.activated) return false;
  const membership = authorization.user.organizations?.find(
    (item) => item.organizationId === authorization.organizationId
  );
  return !!membership && !membership.disabled && isOrganizationEditor(membership.role);
};

/**
 * Fails closed until the MCP rebuild (`content-factory-next-kcxz.26`,
 * premortem X1).
 *
 * The MCP server listed six of the eleven inherited upstream tools of the old
 * agent. The conductor replaced that agent and those tools on 27.09.2026
 * (`kcxz.7`); the MCP tools now come from the capability registry
 * (`capabilities/mcp.adapter.ts`), mounted with per-person OAuth and a
 * throttler by `kcxz.26`. Until then a lit `MCP_ENABLED` boots the backend,
 * says so in the log and mounts nothing — never a server with tools that no
 * longer exist, never a crash at boot.
 */
export const startMcp = async (_app: INestApplication) => {
  if (!isMcpEnabled()) {
    return;
  }
  Logger.warn(
    'MCP_ENABLED is set, but MCP is being rebuilt on the capability registry (content-factory-next-kcxz.26): nothing is mounted.',
    'MCP'
  );
};
