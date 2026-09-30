import { Injectable, Logger, type Type } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { MCPServer } from '@mastra/mcp';
import { json } from 'express';
import { PermissionsService } from '@contentfactory/backend/services/auth/permissions/permissions.service';
import { resolveBackendLocale } from '@contentfactory/nestjs-libraries/locale/backend-strings';
import { CAPABILITY_CATALOGUE } from '@contentfactory/nestjs-libraries/chat/capabilities/capability.registry';
import { DoorPolicyGate } from '@contentfactory/nestjs-libraries/chat/capabilities/door-policy';
import type { CapabilityGate } from '@contentfactory/nestjs-libraries/chat/capabilities/capability.admission';
import {
  readCapabilityIdentity,
  seedCapabilityContext,
} from '@contentfactory/nestjs-libraries/chat/capabilities/capability.context';
import type { CapabilityIdentity } from '@contentfactory/nestjs-libraries/chat/capabilities/capability.types';
import {
  buildMcpCapabilityTools,
  hardenMcpServerTools,
  mcpToolNamesFor,
} from '@contentfactory/nestjs-libraries/chat/capabilities/mcp.adapter';
import { agentTimeZone } from '@contentfactory/nestjs-libraries/chat/capabilities/person-time';
import {
  mcpUrls,
  type McpUrls,
} from '@contentfactory/nestjs-libraries/database/prisma/oauth/mcp-oauth.rules';
import { redactSecretShapes } from '@contentfactory/nestjs-libraries/chat/conductor/secret-shapes';
import { VOICE_SAMPLE_PASTE_LIMITS } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';

/**
 * MCP for external assistants (`content-factory-next-kcxz.26`, spec §1.7,
 * §4.10, §5.1; ADR-0012).
 *
 * One door, `/mcp`, Streamable HTTP in stateless mode (`serverless: true`):
 * every request builds its own transport, so no session lives in the process
 * and none can be taken over. No SSE, no `/mcp-oauth`, no key in the address or
 * a header: the person signs in with OAuth and the token speaks for them in
 * one workspace (`McpBearerMiddleware`, premortem X3).
 *
 * The tools are the web chat's for that role minus `confirm`, `input` and
 * `secret` (`buildMcpCapabilityTools`) — except the `confirm` ones marked
 * `mcpConfirm`, which ask in the conversation (`kcxz.49`). One `MCPServer` per distinct role tool
 * list and language, built on first use and kept; the role behind a request is
 * re-read from the membership on every request, and every call re-runs its
 * door's policies inside `execute` (`admitCapabilityCall`).
 *
 * Still dark unless the operator lights it (`kcxz.1`).
 */
export const isMcpEnabled = (env: NodeJS.ProcessEnv = process.env) =>
  env.MCP_ENABLED === 'true';

/** What MCP clients show for this server. */
export const MCP_SERVER_INFO = {
  name: 'Content Factory MCP',
  version: '1.0.0',
} as const;

/** The one path; `MCPServer.startHTTP` answers 404 for any other. */
export const MCP_HTTP_PATH = '/mcp';

/**
 * The JSON ceiling of `/mcp`. A tool call may carry a pasted text as long as
 * a screen takes (the avatar samples' 200,000 characters per sample), so it is
 * that door's own ceiling, not express's 100 KB default.
 */
export const MCP_BODY_LIMIT_BYTES = VOICE_SAMPLE_PASTE_LIMITS.maxBodyBytes;

const BEARER = /^Bearer\s+(mcpa_[^\s]+)\s*$/i;

/** The bearer check `/mcp` runs; its answer is kept on the request for the middleware. */
export type McpBearerCheck = {
  authenticate(
    token: string | undefined,
    urls: McpUrls
  ): Promise<{ identity: unknown } | { refused: string }>;
};

/**
 * `/mcp`'s body parser (review W5-26 F4, R2). The token is checked before a
 * byte of the body is read: only a live MCP access token gets the large
 * ceiling. Anything else — no token, another credential, an unknown or dead
 * `mcpa_` — is parsed with express's own 100 KB ceiling (the one Nest's
 * parser would apply) and refused by the bearer middleware, which reuses this
 * answer instead of asking again. An oversized body is a 413 logged as a
 * warning, never an error (`tooLargeAsWarning`).
 */
/**
 * A body over the ceiling is a caller's mistake, not ours (walk recheck
 * observation): answered 413 in the shape Nest's parser gave and logged as a
 * warning — anyone without a token can send one, so an error log would be
 * noise a stranger writes. Any other parse failure goes on as before.
 */
const tooLargeAsWarning =
  (res: ServerResponse, next: (error?: unknown) => void, token: boolean) =>
  (error?: unknown) => {
    if ((error as { type?: unknown } | undefined)?.type !== 'entity.too.large') {
      return next(error);
    }
    Logger.warn(
      `${MCP_HTTP_PATH} body over the limit (${token ? 'live token' : 'no live token'}); refused 413`,
      'McpBody'
    );
    res.statusCode = 413;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ statusCode: 413, message: 'request entity too large' }));
  };

export const createMcpBodyParser = (
  bearer: () => McpBearerCheck,
  parse = json({ limit: MCP_BODY_LIMIT_BYTES }),
  // Express's own 100 KB ceiling, the one Nest's parser applies after this.
  parseDefault = json()
) =>
  async function mcpBodyParser(
    req: IncomingMessage & { headers: IncomingMessage['headers']; mcpBearerCheck?: unknown },
    res: ServerResponse,
    next: (error?: unknown) => void
  ) {
    const header = req.headers?.authorization;
    const token = typeof header === 'string' ? BEARER.exec(header)?.[1] : undefined;
    const urls = isMcpEnabled() ? mcpUrls() : null;
    const small = () => parseDefault(req as never, res as never, tooLargeAsWarning(res, next, false));
    if (!token || !urls) return small();
    let result: Awaited<ReturnType<McpBearerCheck['authenticate']>>;
    try {
      result = await bearer().authenticate(token, urls);
    } catch {
      return small();
    }
    req.mcpBearerCheck = { token, result };
    return 'identity' in result
      ? parse(req as never, res as never, tooLargeAsWarning(res, next, true))
      : small();
  };

/** What the bearer check hands the MCP server (`req.auth.extra`). */
export type McpAuthExtra = { identity: CapabilityIdentity };

/**
 * The capability identity of an MCP request, by the chat's own rules
 * (`agentIdentity`): the language of the person's interface, and — with no
 * browser to name a zone — their saved standard offset or UTC (spec §5.4).
 */
export const mcpCapabilityIdentity = (person: {
  organizationId: string;
  organizationCreatedAt: string;
  userId: string;
  role: CapabilityIdentity['role'];
  userLanguage: unknown;
  userTimezone: unknown;
}): CapabilityIdentity => ({
  organizationId: person.organizationId,
  organizationCreatedAt: person.organizationCreatedAt,
  userId: person.userId,
  role: person.role,
  language: resolveBackendLocale(person.userLanguage) === 'ru' ? 'ru' : 'en',
  timeZone: agentTimeZone(undefined, person.userTimezone),
});

/**
 * `mapAuthInfoToUser`: the only hook of `@mastra/mcp` 1.18 that receives the
 * request's `RequestContext` before a tool runs. It writes the server-built
 * identity the tools' `requestContextSchema` requires.
 */
export const seedMcpRequestContext = async ({
  authInfo,
  requestContext,
}: {
  authInfo: unknown;
  requestContext?: { get(key: string): unknown; set(key: string, value: unknown): void };
}) => {
  const identity = (authInfo as { extra?: Partial<McpAuthExtra> } | undefined)?.extra?.identity;
  if (!identity || !requestContext) return undefined;
  seedCapabilityContext(requestContext as never, identity);
  return { id: identity.userId };
};

@Injectable()
export class McpServers {
  private readonly servers = new Map<string, MCPServer>();
  private gate?: CapabilityGate;

  constructor(private readonly moduleRef: ModuleRef) {}

  private service = <T>(token: Type<T>): T => this.moduleRef.get(token, { strict: false });

  private policyGate(): CapabilityGate {
    return (this.gate ??= new DoorPolicyGate(this.service(PermissionsService)));
  }

  /** The server for a role's tool list in one language. */
  serverFor(role: CapabilityIdentity['role'], language: CapabilityIdentity['language']) {
    const key = `${language}|${mcpToolNamesFor(CAPABILITY_CATALOGUE, role).join(',')}`;
    let server = this.servers.get(key);
    if (!server) {
      server = new MCPServer({
        ...MCP_SERVER_INFO,
        description:
          'Content Factory: pieces, adaptations, the plan, avatars, channels, ideas, facts and media of one workspace, as the signed-in person.',
        tools: buildMcpCapabilityTools(CAPABILITY_CATALOGUE, {
          services: this.service,
          gate: this.policyGate(),
          language,
          role,
        }),
        mapAuthInfoToUser: seedMcpRequestContext as never,
      });
      hardenMcpServerTools(server, logMcpCall, logMcpFailure);
      this.servers.set(key, server);
    }
    return server;
  }

  /** Serves one `/mcp` request for an identity the bearer check built. */
  async handle(
    req: IncomingMessage & { url?: string },
    res: ServerResponse,
    identity: CapabilityIdentity
  ) {
    await this.serverFor(identity.role, identity.language).startHTTP({
      url: new URL(req.url || MCP_HTTP_PATH, 'http://mcp.internal'),
      httpPath: MCP_HTTP_PATH,
      req,
      res,
      options: { serverless: true },
    });
  }
}

/** One line per `tools/call`: the tool, the workspace and the person; no arguments. */
export const logMcpCall = (toolName: string, requestContext: unknown) => {
  const identity = readCapabilityIdentity(requestContext as never);
  Logger.log(
    `tools/call ${toolName} organization=${identity?.organizationId ?? 'unknown'} user=${identity?.userId ?? 'unknown'} role=${identity?.role ?? 'unknown'}`,
    'MCP'
  );
};

/** A failed call, on our side only: the tool and the error's own message. */
export const logMcpFailure = (toolName: string, error: unknown) => {
  const message =
    (error as { message?: unknown })?.message ??
    (error as { code?: unknown })?.code ??
    'unknown';
  // Through the chat's key redaction: a provider error may repeat a key (R6).
  Logger.warn(
    `tools/call ${toolName} failed: ${redactSecretShapes(String(message)).slice(0, 300)}`,
    'MCP'
  );
};
