import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import { Organization, User } from '@prisma/client';
import { Response } from 'express';
import { GetOrgFromRequest } from '@contentfactory/nestjs-libraries/user/org.from.request';
import { GetUserFromRequest } from '@contentfactory/nestjs-libraries/user/user.from.request';
import { CheckPolicies } from '@contentfactory/backend/services/auth/permissions/permissions.ability';
import { AuthorizationActions, Sections } from '@contentfactory/backend/services/auth/permissions/permission.exception.class';
import { VideoAccessService } from '@contentfactory/nestjs-libraries/videos/video-access.service';

@Controller('/media')
export class VideoAccessController {
  constructor(readonly access: VideoAccessService) {}
  @Get('/video-access')
  choices(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User) { return this.access.choices(org.id, user.id); }
  @Get('/video-v2/connections/:id/assets')
  assets(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Param('id') id: string) { return this.access.assets(org.id, user.id, id); }
  @Post('/video-v2/preflight')
  @CheckPolicies([AuthorizationActions.Create, Sections.EDITOR])
  preflight(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Body() body: unknown) { return this.access.preflight(org.id, user.id, body); }
  @Get('/video-v2/preflights/:id')
  savedApproval(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Param('id') id: string) { return this.access.approval(org.id, user.id, id); }
  @Post('/video-v2/jobs')
  @CheckPolicies([AuthorizationActions.Create, Sections.EDITOR])
  launch(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Body() body: unknown) { return this.access.launch(org.id, user.id, body); }
  @Get('/video-v2/jobs')
  list(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Query('pieceId') pieceId?: string) { return this.access.list(org.id, user.id, pieceId); }
  @Get('/video-v2/jobs/:id')
  get(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Param('id') id: string) { return this.access.get(org.id, user.id, id); }
  @Post('/video-v2/jobs/:id/:action')
  @CheckPolicies([AuthorizationActions.Update, Sections.EDITOR])
  action(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Param('id') id: string, @Param('action') action: string, @Body() body: any) {
    if (action === 'reconcile') return this.access.subscriptions.reconcile(org.id, user.id, id, body?.amount, body?.evidence);
    return this.access.action(org.id, user.id, id, action);
  }
  @Get('/video-v2/jobs/:id/download')
  async download(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Param('id') id: string, @Res() res: Response) {
    const file = await this.access.download(org.id, user.id, id);
    res.setHeader('Content-Type', 'video/mp4'); res.setHeader('Content-Disposition', `attachment; filename="${file.name}"`);
    res.setHeader('Cache-Control', 'private, no-store'); return res.send(file.bytes);
  }
  @Post('/video-v2/manual-attachments')
  @CheckPolicies([AuthorizationActions.Create, Sections.EDITOR])
  attach(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Body() body: unknown) { return this.access.attach(org.id, user.id, body); }
}
