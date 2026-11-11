import { Body, Controller, Get, Header, Param, Post, Query, Res } from '@nestjs/common';
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
  @CheckPolicies([AuthorizationActions.Create, Sections.EDITOR])
  assets(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Param('id') id: string) { return this.access.assets(org.id, user.id, id); }
  @Get('/video-v2/connections/:id/avatars/:avatarId/consent-status')
  @Header('Cache-Control', 'private, no-store')
  @CheckPolicies([AuthorizationActions.Create, Sections.EDITOR])
  avatarConsentStatus(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Param('id') id: string,
    @Param('avatarId') avatarId: string, @Query('groupId') groupId?: string) {
    return this.access.avatarConsentStatus(org.id, user.id, {connectionId: id, avatarId, ...(groupId !== undefined ? {groupId} : {})});
  }
  @Get('/video-v2/connections/:id/readiness')
  @CheckPolicies([AuthorizationActions.Create, Sections.EDITOR])
  readiness(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Param('id') id: string) { return this.access.personalReadiness(org.id, user.id, id); }
  @Post('/video-v2/connections/:id/discover')
  @CheckPolicies([AuthorizationActions.Create, Sections.EDITOR])
  discover(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Param('id') id: string) { return this.access.discoverPersonal(org.id, user.id, id); }
  @Post('/video-v2/connections/:id/qualification')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async qualification(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Param('id') id: string, @Res() res: Response) {
    res.setHeader('Cache-Control', 'private, no-store'); res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', 'attachment; filename="video-provider-schema.json"');
    return res.status(200).json(await this.access.personalQualification(org.id, user.id, id));
  }
  @Post('/video-v2/preflight')
  @CheckPolicies([AuthorizationActions.Create, Sections.EDITOR])
  preflight(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Body() body: unknown) { return this.access.preflight(org.id, user.id, body); }
  @Post('/video-v2/presenter-preview')
  @CheckPolicies([AuthorizationActions.Create, Sections.EDITOR])
  presenterPreview(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Body() body: unknown) { return this.access.presenterPreview(org.id, user.id, body); }
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
    const fallback = `video-${id.replace(/[^A-Za-z0-9_-]/g, '_')}.mp4`;
    const encoded = encodeURIComponent(Buffer.from(file.name, 'utf8').toString('utf8')).replace(/['()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="${fallback}"${file.name === fallback ? '' : `; filename*=UTF-8''${encoded}`}`);
    res.setHeader('Cache-Control', 'private, no-store'); return res.send(file.bytes);
  }
  @Post('/video-v2/manual-attachments')
  @CheckPolicies([AuthorizationActions.Create, Sections.EDITOR])
  attach(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Body() body: unknown) { return this.access.attach(org.id, user.id, body); }
  @Get('/video-v2/jobs/:id/subtitles/:subtitleId/download')
  async downloadSubtitle(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Param('id') id: string,
    @Param('subtitleId') subtitleId: string, @Res() res: Response): Promise<Response> {
    const file = await this.access.downloadSubtitle(org.id, user.id, id, subtitleId);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.name}"`);
    res.setHeader('Cache-Control', 'private, no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer'); return res.send(file.bytes);
  }
}
