import { Body, Controller, Delete, Get, Param, Post, Put, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { Organization, User } from '@prisma/client';
import { GetOrgFromRequest } from '@contentfactory/nestjs-libraries/user/org.from.request';
import { GetUserFromRequest } from '@contentfactory/nestjs-libraries/user/user.from.request';
import { CheckPolicies } from '@contentfactory/backend/services/auth/permissions/permissions.ability';
import { AuthorizationActions, Sections } from '@contentfactory/backend/services/auth/permissions/permission.exception.class';
import { VideoConnectionService } from '@contentfactory/nestjs-libraries/videos/subscriptions/video-connection.service';
import type { SubscriptionProvider } from '@contentfactory/nestjs-libraries/videos/subscriptions/video-provider-registry';

@Controller('/media/video-connections')
export class VideoConnectionsController {
  constructor(readonly connections: VideoConnectionService) {}
  @Post('/:provider/start')
  @CheckPolicies([AuthorizationActions.Create, Sections.EDITOR])
  start(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Param('provider') provider: SubscriptionProvider, @Body() body: any) {
    return this.connections.start(org.id, user.id, provider, body?.returnPath);
  }
  @Get('/:provider/callback')
  async callback(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Param('provider') provider: SubscriptionProvider, @Query() query: any, @Res() res: Response) {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'no-referrer');
    let path = '/media?video=1';
    try { path = (await this.connections.callback(org.id, user.id, provider, query)).returnPath; }
    catch (error: any) {
      const code = error?.getResponse?.()?.code;
      path += `&connectionError=${typeof code === 'string' && /^VIDEO_[A-Z0-9_]+$/.test(code) ? code : 'VIDEO_CONNECTION_UNAVAILABLE'}`;
    }
    return res.redirect(303, `${process.env.FRONTEND_URL}${path}`);
  }
  @Delete('/:id')
  @CheckPolicies([AuthorizationActions.Update, Sections.EDITOR])
  disconnect(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Param('id') id: string) { return this.connections.disconnect(org.id, user.id, id); }
  @Put('/:id/limits')
  @CheckPolicies([AuthorizationActions.Update, Sections.EDITOR])
  limits(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Param('id') id: string, @Body() body: any) { return this.connections.limits(org.id, user.id, id, body?.perJob, body?.perMonth); }
  @Post('/:id/grant')
  @CheckPolicies([AuthorizationActions.Create, Sections.EDITOR])
  grant(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Param('id') id: string) { return this.connections.grant(org.id, user.id, id); }
  @Put('/workspace/policy')
  @CheckPolicies([AuthorizationActions.Update, Sections.ADMIN])
  policy(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Body() body: any) { return this.connections.workspacePolicy(org.id, user.id, body?.enabled); }
}
