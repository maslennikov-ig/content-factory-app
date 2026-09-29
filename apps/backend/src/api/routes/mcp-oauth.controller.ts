import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpException,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { Organization, User } from '@prisma/client';
import { GetOrgFromRequest } from '@contentfactory/nestjs-libraries/user/org.from.request';
import { GetUserFromRequest } from '@contentfactory/nestjs-libraries/user/user.from.request';
import { McpOAuthService } from '@contentfactory/nestjs-libraries/database/prisma/oauth/mcp-oauth.service';
import {
  authorizationServerMetadata,
  McpOAuthError,
  mcpUrls,
  protectedResourceMetadata,
  redirectHost,
  type McpUrls,
} from '@contentfactory/nestjs-libraries/database/prisma/oauth/mcp-oauth.rules';
import {
  McpAuthorizeDecisionDto,
  McpAuthorizeQueryDto,
  McpClientRegistrationDto,
  McpTokenRequestDto,
} from '@contentfactory/nestjs-libraries/dtos/oauth/mcp-oauth.dto';
import { isMcpEnabled } from '@contentfactory/nestjs-libraries/chat/start.mcp';
import {
  McpConsentThrottleGuard,
  McpRegistrationThrottleGuard,
  McpTokenThrottleGuard,
} from './mcp.throttle';

/**
 * The OAuth doors of MCP (`content-factory-next-kcxz.26`, spec §4.10). The
 * product's own OAuth for third-party apps (`oauth.controller.ts`) is not
 * touched; these serve the external assistants: discovery (RFC 9728, RFC
 * 8414), registration (RFC 7591), consent and the token grants.
 *
 * All of them answer 404 while MCP is dark (`MCP_ENABLED`) or the public URLs
 * are not configured.
 */

const urlsOrNotFound = (): McpUrls => {
  const urls = isMcpEnabled() ? mcpUrls() : null;
  if (!urls) throw new NotFoundException();
  return urls;
};

const asHttp = (error: unknown): never => {
  if (error instanceof McpOAuthError) throw new HttpException(error.body(), error.status);
  throw error;
};

const pathOf = (url: string) => new URL(url).pathname.replace(/^\/+|\/+$/g, '');

/**
 * Discovery. Served under the backend's own base and, for a base with a path
 * (`https://host/api`), also at the suffixed RFC locations
 * (`/.well-known/oauth-authorization-server/api`,
 * `/.well-known/oauth-protected-resource/api/mcp`) — which an edge proxy must
 * route here from the host root.
 */
@ApiTags('MCP')
@Controller('/.well-known')
export class McpOAuthMetadataController {
  @Get('/oauth-protected-resource')
  protectedResource() {
    return protectedResourceMetadata(urlsOrNotFound());
  }

  @Get('/oauth-protected-resource/{*rest}')
  protectedResourceAt(@Param('rest') rest: string | string[]) {
    const urls = urlsOrNotFound();
    const suffix = [rest].flat().join('/').replace(/^\/+|\/+$/g, '');
    if (suffix !== 'mcp' && suffix !== pathOf(urls.resource)) throw new NotFoundException();
    return protectedResourceMetadata(urls);
  }

  @Get('/oauth-authorization-server')
  authorizationServer() {
    return authorizationServerMetadata(urlsOrNotFound());
  }

  @Get('/oauth-authorization-server/{*rest}')
  authorizationServerAt(@Param('rest') rest: string | string[]) {
    const urls = urlsOrNotFound();
    const suffix = [rest].flat().join('/').replace(/^\/+|\/+$/g, '');
    if (!suffix || suffix !== pathOf(urls.issuer)) throw new NotFoundException();
    return authorizationServerMetadata(urls);
  }
}

/** Registration and tokens: no session, throttled per client address. */
@ApiTags('MCP')
@Controller('/oauth/mcp')
export class McpOAuthController {
  constructor(private readonly _mcpOAuth: McpOAuthService) {}

  @Post('/register')
  @UseGuards(McpRegistrationThrottleGuard)
  @HttpCode(201)
  @Header('Cache-Control', 'no-store')
  async register(@Body() body: McpClientRegistrationDto) {
    urlsOrNotFound();
    return this._mcpOAuth.register(body as Record<string, unknown>).catch(asHttp);
  }

  /** `application/x-www-form-urlencoded` (RFC 6749) or JSON: Nest parses both. */
  @Post('/token')
  @UseGuards(McpTokenThrottleGuard)
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  async token(@Body() body: McpTokenRequestDto) {
    const urls = urlsOrNotFound();
    return this._mcpOAuth.token(body, urls).catch(asHttp);
  }
}

/**
 * The consent step, behind the session (`AuthMiddleware`): the consent page
 * `/oauth/authorize` forwards the client's request here, shows who asks, where
 * the answer goes and which workspace, and posts the person's decision.
 */
@ApiTags('MCP')
@Controller('/oauth/mcp')
export class McpOAuthConsentController {
  constructor(private readonly _mcpOAuth: McpOAuthService) {}

  /** A superadmin looking through a member's eyes does not connect as them. */
  private refuseImpersonation(req: Request) {
    if (req.cookies?.impersonate || req.headers?.impersonate) {
      throw new HttpException(
        {
          error: 'access_denied',
          error_description: 'Stop impersonating to connect an assistant.',
        },
        403
      );
    }
  }

  @Get('/authorize')
  async check(
    @Query() query: McpAuthorizeQueryDto,
    @GetOrgFromRequest() org: Organization,
    @Req() req: Request
  ) {
    const urls = urlsOrNotFound();
    this.refuseImpersonation(req);
    const checked = await this._mcpOAuth.checkAuthorization(query, urls).catch(asHttp);
    if ('refused' in checked && checked.refused) {
      const { redirectUri, error, state } = checked.refused;
      const description = 'description' in checked.refused ? checked.refused.description : undefined;
      // Never followed by the page on its own (review W5-26 F2): anyone may
      // register a redirect, so the person sees the error and the host and
      // decides whether to go back there.
      return {
        refused: true,
        error,
        redirectHost: redirectHost(redirectUri),
        redirect: this._mcpOAuth.redirectWith(
          redirectUri,
          { error, error_description: description, state },
          urls
        ),
      };
    }
    return {
      client: { name: checked.client.name },
      redirectHost: checked.redirectHost,
      // The consent is for this workspace; the decision must name it back (F5).
      workspace: { id: org.id, name: org.name },
      scope: checked.scope,
    };
  }

  @Post('/authorize')
  @UseGuards(McpConsentThrottleGuard)
  async decide(
    @Body() body: McpAuthorizeDecisionDto,
    @GetUserFromRequest() user: User,
    @GetOrgFromRequest() org: Organization,
    @Req() req: Request
  ) {
    const urls = urlsOrNotFound();
    this.refuseImpersonation(req);
    // Checked again: the page's first answer is never trusted.
    const checked = await this._mcpOAuth.checkAuthorization(body, urls).catch(asHttp);
    if ('refused' in checked && checked.refused) {
      const { redirectUri, error, state } = checked.refused;
      return { redirect: this._mcpOAuth.redirectWith(redirectUri, { error, state }, urls) };
    }
    if (body.action !== 'approve') {
      return {
        redirect: this._mcpOAuth.redirectWith(
          checked.redirectUri!,
          { error: 'access_denied', state: checked.state },
          urls
        ),
      };
    }
    // The workspace the person saw: another tab may have switched the session
    // since (F5). Checked for Allow only — Deny is never blocked (R4).
    if (body.workspace_id !== org.id) {
      throw new HttpException(
        {
          error: 'workspace_changed',
          error_description: 'The workspace changed since this page was opened; open it again.',
        },
        409
      );
    }
    const code = await this._mcpOAuth.approve(
      {
        client: checked.client!,
        redirectUri: checked.redirectUri!,
        codeChallenge: checked.codeChallenge!,
        scope: checked.scope!,
      },
      { userId: user.id, organizationId: org.id },
      urls
    ).catch(asHttp);
    return {
      redirect: this._mcpOAuth.redirectWith(checked.redirectUri!, { code, state: checked.state }, urls),
    };
  }
}
