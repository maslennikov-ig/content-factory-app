import type { OrganizationRole } from '@contentfactory/nestjs-libraries/user/organization.roles';
import type { CapabilityGate } from './capability.admission';
import {
  toolNameOf,
  WEB_ONLY_RISKS,
  type CapabilityDeclaration,
} from './capability.types';
import { roleMayUse } from './door-policy';
import { refusal } from './capability.types';
import {
  buildCapabilityTool,
  codedRefusal,
  withoutEchoedInput,
  type CapabilityServices,
  type CapabilityTools,
} from './mastra.adapter';

/**
 * MCP tools from the same registry (`content-factory-next-kcxz.6`, spec §1.7,
 * §5.1). Mounted by `start.mcp.ts` behind `/mcp` (`kcxz.26`): OAuth per
 * person, the role re-read on every request, a throttler per token.
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

/**
 * The tool names one role is offered over MCP, in catalogue order. Roles with
 * the same list share one MCP server (`start.mcp.ts`, `kcxz.26`).
 */
export const mcpToolNamesFor = (
  capabilities: readonly CapabilityDeclaration[],
  role: OrganizationRole
): string[] =>
  capabilities
    .filter(isMcpCapability)
    .filter((capability) => roleMayUse(capability, role))
    .map((capability) => toolNameOf(capability.id));

type McpServerTool = {
  parameters?: { validate?: (value: unknown) => unknown } & Record<string, unknown>;
  execute?: (args: unknown, options: any) => Promise<unknown>;
};

/**
 * What `@mastra/mcp` 1.18 does around a tool call, made safe
 * (`content-factory-next-kcxz.26`; evidence `mcp-w5-docs-2026-09-28.md` §1):
 *
 * - Its own argument check answers «Provided arguments: {…}» with every value
 *   the client sent, and core's check repeats «received '…'» — a key pasted in
 *   the wrong field would come back verbatim (review W3-20 F12). The server's
 *   pre-check is made to pass, so core's check runs, and its refusal becomes
 *   the registry's `CAPABILITY_INPUT_INVALID` with the failing paths only.
 * - Every `tools/call` is reported to `onCall` with the tool and the request
 *   context — before anything runs, never with the arguments.
 * - A thrown error or an error-shaped result reaches the client as the web
 *   chat's refusal: a product code with its sentence, else `CAPABILITY_FAILED`
 *   — never a message, stack or path; `onFailure` logs it on our side.
 *
 * The server's `convertedTools` is where 1.18 keeps the built tools; if an
 * upgrade moves it this throws at the first build, not silently.
 */
const MCP_TOOL_FAILED =
  'The action failed for a reason the product did not name; nothing more is known. Tell the person it did not work; do not retry by yourself.';

/** Any other error-shaped result core may hand back instead of throwing. */
const isErrorResult = (output: unknown) =>
  !!output && typeof output === 'object' && (output as { error?: unknown }).error === true;

export const hardenMcpServerTools = (
  server: object,
  onCall: (toolName: string, requestContext: unknown) => void,
  /** Server-side only: what failed, never shown to the client. */
  onFailure: (toolName: string, error: unknown) => void = () => undefined
) => {
  const tools = (server as { convertedTools?: Record<string, McpServerTool> }).convertedTools;
  if (!tools || typeof tools !== 'object') {
    throw new Error(
      'MCPServer no longer exposes convertedTools: re-check the argument echo guard (kcxz.26).'
    );
  }
  for (const [name, tool] of Object.entries(tools)) {
    if (tool.parameters?.validate) {
      tool.parameters = {
        ...tool.parameters,
        validate: async (value: unknown) => ({ success: true, value }),
      };
    }
    const execute = tool.execute;
    if (!execute) continue;
    tool.execute = async (args, options) => {
      onCall(name, options?.requestContext);
      let output: unknown;
      try {
        output = withoutEchoedInput(await execute(args, options));
      } catch (error) {
        // `@mastra/mcp` would answer a thrown error with its message (and a
        // MastraError with `toJSON()`); the web chat shows only a code
        // (review W5-26 (c)). A product code keeps its sentence, as there.
        onFailure(name, error);
        return codedRefusal(error) ?? refusal('CAPABILITY_FAILED', MCP_TOOL_FAILED);
      }
      if (isErrorResult(output)) {
        onFailure(name, output);
        return refusal('CAPABILITY_FAILED', MCP_TOOL_FAILED);
      }
      return output;
    };
  }
};
