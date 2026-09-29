import { All, Controller, Logger, Req, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { isMcpEnabled, McpServers } from '@contentfactory/nestjs-libraries/chat/start.mcp';
import { mcpUrls } from '@contentfactory/nestjs-libraries/database/prisma/oauth/mcp-oauth.rules';
import type { McpRequest } from '@contentfactory/backend/services/auth/mcp.bearer.middleware';
import { McpThrottleGuard } from './mcp.throttle';

/**
 * `/mcp` (`content-factory-next-kcxz.26`): Streamable HTTP, stateless, POST
 * only (no SSE stream), for the person `McpBearerMiddleware` admitted,
 * throttled per token. The MCP server writes the response itself, so the
 * handler takes the raw `res`.
 */
@ApiTags('MCP')
@Controller()
export class McpController {
  private readonly logger = new Logger('MCP');

  constructor(private readonly _servers: McpServers) {}

  @All('/mcp')
  @UseGuards(McpThrottleGuard)
  async mcp(@Req() req: McpRequest, @Res() res: Response) {
    if (!isMcpEnabled() || !mcpUrls()) {
      res.status(404).json({ statusCode: 404, message: 'Not Found' });
      return;
    }
    if (req.mcpRefusal) {
      res.setHeader('WWW-Authenticate', req.mcpRefusal.challenge);
      res.status(401).json(req.mcpRefusal.body);
      return;
    }
    // Stateless and without SSE: there is no server-to-client stream to open
    // with GET and no session to end with DELETE. 405 is how Streamable HTTP
    // says so (spec 2025-06-18, «Listening for Messages from the Server»).
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      res.status(405).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Method not allowed: this server takes POST only.' },
        id: null,
      });
      return;
    }
    const identity = req.mcpIdentity;
    if (!identity) {
      // The middleware answers every request it does not admit; reaching here
      // without an identity means it did not run.
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    try {
      await this._servers.handle(req, res, identity);
    } catch (error) {
      this.logger.error(`MCP request failed: ${(error as Error)?.message ?? 'unknown'}`);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal error' },
          id: null,
        });
      }
    }
  }
}
