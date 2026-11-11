import { Body, Controller, Get, Header, Param, Post, Query, Res } from '@nestjs/common';
import { Organization, User } from '@prisma/client';
import { Response } from 'express';
import { GetOrgFromRequest } from '@contentfactory/nestjs-libraries/user/org.from.request';
import { GetUserFromRequest } from '@contentfactory/nestjs-libraries/user/user.from.request';
import { CheckPolicies } from '@contentfactory/backend/services/auth/permissions/permissions.ability';
import { AuthorizationActions, Sections } from '@contentfactory/backend/services/auth/permissions/permission.exception.class';
import { HeygenChatControlsServiceV1 } from '@contentfactory/nestjs-libraries/videos/subscriptions/video-heygen-chat-controls.service.v1';
import { HeygenPerformanceServiceV1 } from '@contentfactory/nestjs-libraries/videos/subscriptions/video-heygen-performance.service.v1';
import { HeygenPerformanceSceneServiceV1 } from '@contentfactory/nestjs-libraries/videos/subscriptions/video-heygen-performance-scene.service.v1';

@Controller('/media')
export class VideoHeygenControlsControllerV2 {
  constructor(readonly controls: HeygenChatControlsServiceV1, readonly performance: HeygenPerformanceServiceV1,
    readonly scenes: HeygenPerformanceSceneServiceV1) {}
  @Post('/video-v2/performance-scenes')
  @CheckPolicies([AuthorizationActions.Create, Sections.EDITOR])
  performanceScenes(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Body() body: unknown) {
    return this.scenes.prepare(org.id, user.id, body);
  }
  @Get('/video-v2/drafts/:draftId/looks/:lookId/preview')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @CheckPolicies([AuthorizationActions.Create, Sections.EDITOR])
  async ownedLookPreview(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User,
    @Param('draftId') draftId: string, @Param('lookId') lookId: string, @Query('version') version: string, @Res() response: Response) {
    const preview = await this.scenes.readOwnedLookPreview(org.id, user.id, {draftId, lookId, version: Number(version)});
    return response.type(preview.contentType).send(preview.bytes);
  }
  @Get('/video-v2/drafts/:draftId/performance')
  @Header('Cache-Control', 'private, no-store')
  @CheckPolicies([AuthorizationActions.Create, Sections.EDITOR])
  performanceRead(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Param('draftId') draftId: string) {
    return this.performance.read(org.id, user.id, draftId);
  }
  @Post('/video-v2/performance')
  @CheckPolicies([AuthorizationActions.Create, Sections.EDITOR])
  performanceApply(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Body() body: unknown) {
    return this.performance.apply(org.id, user.id, body, 'manual');
  }
  @Post('/video-v2/performance-preference')
  @CheckPolicies([AuthorizationActions.Create, Sections.EDITOR])
  performancePreference(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Body() body: unknown) {
    return this.performance.savePreference(org.id, user.id, body);
  }
  @Post('/video-v2/performance-feedback')
  @CheckPolicies([AuthorizationActions.Create, Sections.EDITOR])
  performanceFeedback(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Body() body: unknown) {
    return this.performance.feedback(org.id, user.id, body);
  }
  @Get('/video-v2/drafts/:draftId/performance-feedback')
  @Header('Cache-Control', 'private, no-store')
  @CheckPolicies([AuthorizationActions.Create, Sections.EDITOR])
  performanceFeedbackRead(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User,
    @Param('draftId') draftId: string, @Query('jobId') jobId?: string) {
    return this.performance.feedbackRead(org.id, user.id, draftId, jobId);
  }
  @Post('/video-v2/performance-feedback/correction')
  @CheckPolicies([AuthorizationActions.Create, Sections.EDITOR])
  performanceFeedbackCorrection(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Body() body: unknown) {
    return this.performance.proposeFeedbackCorrection(org.id, user.id, body);
  }
  @Get('/video-v2/drafts/:draftId/heygen-options')
  @Header('Cache-Control', 'private, no-store')
  @CheckPolicies([AuthorizationActions.Create, Sections.EDITOR])
  heygenOptions(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User,
    @Param('draftId') draftId: string, @Query('version') version: string) {
    return this.controls.advancedOptions(org.id, user.id, draftId, Number(version));
  }
  @Post('/video-v2/heygen-glossary')
  @CheckPolicies([AuthorizationActions.Create, Sections.EDITOR])
  heygenGlossary(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Body() body: unknown) {
    return this.controls.saveGlossary(org.id, user.id, body);
  }
  @Post('/video-v2/heygen-background')
  @CheckPolicies([AuthorizationActions.Create, Sections.EDITOR])
  heygenBackground(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Body() body: unknown) {
    return this.controls.saveBackground(org.id, user.id, body);
  }
  @Get('/video-v2/person-profiles/:profileId/looks/:lookId/preview')
  @Header('Cache-Control', 'private, no-store')
  @CheckPolicies([AuthorizationActions.Create, Sections.EDITOR])
  preview(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User,
    @Param('profileId') profileId: string, @Param('lookId') lookId: string) {
    return this.controls.profilePreview(org.id, user.id, profileId, lookId);
  }
  @Get('/video-v2/connections/:id/person-profiles')
  @Header('Cache-Control', 'private, no-store')
  @CheckPolicies([AuthorizationActions.Create, Sections.EDITOR])
  profiles(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Param('id') id: string, @Query('cursor') cursor?: string) {
    return this.controls.listProfiles(org.id, user.id, id, cursor);
  }
  @Post('/video-v2/person-profile-proposals')
  @CheckPolicies([AuthorizationActions.Create, Sections.EDITOR])
  proposeProfile(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Body() body: unknown) {
    return this.controls.proposeProfile(org.id, user.id, body);
  }
  @Post('/video-v2/person-profiles')
  @CheckPolicies([AuthorizationActions.Create, Sections.EDITOR])
  saveProfile(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Body() body: unknown) {
    return this.controls.saveProfile(org.id, user.id, body, 'authenticated_screen_action');
  }
  @Post('/video-v2/person-profile-resolve')
  @CheckPolicies([AuthorizationActions.Create, Sections.EDITOR])
  resolveProfile(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Body() body: unknown) {
    return this.controls.resolveProfile(org.id, user.id, body);
  }
  @Post('/video-v2/heygen-settings')
  @CheckPolicies([AuthorizationActions.Create, Sections.EDITOR])
  heygenSettings(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Body() body: unknown) {
    return this.controls.prepareSettings(org.id, user.id, body);
  }
}
