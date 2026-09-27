import type { OrganizationRole } from '@contentfactory/nestjs-libraries/user/organization.roles';
import type { CapabilityGate } from './capability.admission';
import {
  toolNameOf,
  WEB_ONLY_RISKS,
  type CapabilityDeclaration,
} from './capability.types';
import { roleMayUse } from './door-policy';
import {
  buildCapabilityTool,
  type CapabilityServices,
  type CapabilityTools,
} from './mastra.adapter';

/**
 * MCP tools from the same registry (`content-factory-next-kcxz.6`, spec §1.7,
 * §5.1). Built and tested here; mounted by the MCP rebuild (`kcxz.26`), which
 * owns `start.mcp.ts`, OAuth per person and the throttler.
 *
 * Excluded: `confirm` (no approval card over MCP), `input` (no question card)
 * and `secret` (a key never passes through a model). Each call re-runs the
 * door's policies inside `execute`, because an MCP server has no agent hooks.
 */
export const isMcpCapability = (capability: CapabilityDeclaration) =>
  !WEB_ONLY_RISKS.includes(capability.risk);

export const buildMcpCapabilityTools = (
  capabilities: readonly CapabilityDeclaration[],
  options: {
    services: CapabilityServices;
    gate: CapabilityGate;
    language: 'ru' | 'en';
    /** The OAuth member's role: tools the role cannot use are not listed. */
    role: OrganizationRole;
  }
): CapabilityTools =>
  Object.fromEntries(
    capabilities
      .filter(isMcpCapability)
      .filter((capability) => roleMayUse(capability, options.role))
      .map((capability) => [
        toolNameOf(capability.id),
        buildCapabilityTool(capability, {
          services: options.services,
          gate: options.gate,
          language: options.language,
          entrance: 'mcp',
        }),
      ])
  );
