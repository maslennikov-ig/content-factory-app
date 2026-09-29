import { Controller, Delete, Get, Param } from '@nestjs/common';
import { GetUserFromRequest } from '@contentfactory/nestjs-libraries/user/user.from.request';
import { User } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { OAuthService } from '@contentfactory/nestjs-libraries/database/prisma/oauth/oauth.service';
import { McpOAuthService } from '@contentfactory/nestjs-libraries/database/prisma/oauth/mcp-oauth.service';

/** An MCP connection's row id here (`kcxz.26`): the grant id, marked. */
const MCP_ROW = 'mcp:';

@ApiTags('Approved Apps')
@Controller('/user/approved-apps')
export class ApprovedAppsController {
  constructor(
    private _oauthService: OAuthService,
    private _mcpOAuthService: McpOAuthService
  ) {}

  /**
   * Third-party apps and, in the same list and shape, the person's MCP
   * connections (Claude, ChatGPT…), so both are revoked in one place.
   */
  @Get('/')
  async list(@GetUserFromRequest() user: User) {
    const [mcp, apps] = await Promise.all([
      this._mcpOAuthService.approvedConnections(user.id),
      this._oauthService.getApprovedApps(user.id),
    ]);
    return [...mcp, ...apps];
  }

  @Delete('/:id')
  async revoke(
    @GetUserFromRequest() user: User,
    @Param('id') id: string
  ) {
    if (id.startsWith(MCP_ROW)) {
      await this._mcpOAuthService.revokeConnection(user.id, id.slice(MCP_ROW.length));
      return { success: true };
    }
    return this._oauthService.revokeApp(user.id, id);
  }
}
