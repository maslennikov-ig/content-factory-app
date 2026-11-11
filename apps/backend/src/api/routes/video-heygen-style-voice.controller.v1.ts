import { Body, Controller, Get, Header, Param, Post } from '@nestjs/common';
import type { Organization, User } from '@prisma/client';
import { GetOrgFromRequest } from '@contentfactory/nestjs-libraries/user/org.from.request';
import { GetUserFromRequest } from '@contentfactory/nestjs-libraries/user/user.from.request';
import { CheckPolicies } from '@contentfactory/backend/services/auth/permissions/permissions.ability';
import { AuthorizationActions, Sections } from '@contentfactory/backend/services/auth/permissions/permission.exception.class';
import {
  HeygenStyleVoiceServiceV1, HeygenStyleSubmitInputSchemaV1, HeygenVoiceExecuteInputSchemaV1,
  heygenStyleVoiceHumanActionV1,
} from '@contentfactory/nestjs-libraries/videos/subscriptions/video-heygen-style-voice.service.v1';
import { HeygenVoiceIntakeSchemaV1, HeygenVoiceSelectionInputSchemaV1 } from '@contentfactory/nestjs-libraries/videos/subscriptions/video-heygen-voice-setup.v1';
import { subscriptionHash } from '@contentfactory/nestjs-libraries/videos/subscriptions/video-provider-registry';
import { parseVideoV1 } from '@contentfactory/nestjs-libraries/videos/video-brief.v1';

@Controller('/media/video-v2')
export class VideoHeygenStyleVoiceControllerV1 {
  constructor(readonly controls: HeygenStyleVoiceServiceV1) {}
  private screen(org: Organization, user: User, toolId: string, input: unknown) {
    return heygenStyleVoiceHumanActionV1({organizationId: org.id, actorId: user.id, source: 'authenticated_screen_action', toolId, input,
      approvalFingerprint: subscriptionHash({source: 'authenticated_screen_action', organizationId: org.id, actorId: user.id, toolId, input})});
  }
  @Post('/heygen-styles')
  @CheckPolicies([AuthorizationActions.Create, Sections.EDITOR])
  stylePrepare(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Body() body: unknown) {
    return this.controls.stylePrepare(org.id, user.id, body);
  }
  @Get('/heygen-styles/:id')
  @Header('Cache-Control', 'private, no-store')
  @CheckPolicies([AuthorizationActions.Create, Sections.EDITOR])
  styleStatus(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Param('id') id: string) {
    return this.controls.styleStatus(org.id, user.id, id);
  }
  @Post('/heygen-styles/:id/recover')
  @Header('Cache-Control', 'private, no-store')
  @CheckPolicies([AuthorizationActions.Create, Sections.EDITOR])
  styleRecover(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Param('id') id: string) {
    return this.controls.styleRecover(org.id, user.id, id);
  }
  @Post('/heygen-style-selection')
  @CheckPolicies([AuthorizationActions.Create, Sections.EDITOR])
  styleSelect(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Body() body: unknown) {
    return this.controls.styleSelect(org.id, user.id, body);
  }
  @Post('/heygen-style-submit')
  @CheckPolicies([AuthorizationActions.Create, Sections.EDITOR])
  styleSubmit(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Body() body: unknown) {
    const input = parseVideoV1(HeygenStyleSubmitInputSchemaV1, body);
    return this.controls.styleSubmit(org.id, user.id, input, this.screen(org, user, 'video.heygen_style_submit', input));
  }
  @Post('/heygen-voice-intake')
  @CheckPolicies([AuthorizationActions.Create, Sections.EDITOR])
  voiceIntake(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Body() body: unknown) {
    const input = parseVideoV1(HeygenVoiceIntakeSchemaV1, body);
    return this.controls.voiceIntake(org.id, user.id, input, this.screen(org, user, 'video.heygen_voice_intake', input));
  }
  @Get('/heygen-voice-setups/:id')
  @Header('Cache-Control', 'private, no-store')
  @CheckPolicies([AuthorizationActions.Create, Sections.EDITOR])
  voiceStatus(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Param('id') id: string) {
    return this.controls.voiceStatus(org.id, user.id, id);
  }
  @Post('/heygen-voice-auditions')
  @CheckPolicies([AuthorizationActions.Create, Sections.EDITOR])
  voicePrepareAuditions(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Body() body: unknown) {
    return this.controls.voicePrepareAuditions(org.id, user.id, body);
  }
  @Post('/heygen-voice-clone')
  @CheckPolicies([AuthorizationActions.Create, Sections.EDITOR])
  voicePrepareClone(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Body() body: unknown) {
    return this.controls.voicePrepareClone(org.id, user.id, body);
  }
  @Post('/heygen-voice-execute')
  @CheckPolicies([AuthorizationActions.Create, Sections.EDITOR])
  voiceExecute(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Body() body: unknown) {
    const input = parseVideoV1(HeygenVoiceExecuteInputSchemaV1, body);
    return this.controls.voiceExecute(org.id, user.id, input, this.screen(org, user, 'video.heygen_voice_execute', input));
  }
  @Post('/heygen-voice-recovery')
  @Header('Cache-Control', 'private, no-store')
  @CheckPolicies([AuthorizationActions.Create, Sections.EDITOR])
  voiceRecover(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Body() body: unknown) {
    return this.controls.voiceRecover(org.id, user.id, body);
  }
  @Post('/heygen-voice-selection')
  @CheckPolicies([AuthorizationActions.Create, Sections.EDITOR])
  voiceSelect(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Body() body: unknown) {
    const input = parseVideoV1(HeygenVoiceSelectionInputSchemaV1, body);
    return this.controls.voiceSelect(org.id, user.id, input, this.screen(org, user, 'video.heygen_voice_select', input));
  }
  @Post('/heygen-voice-setups/:id/apply-selected')
  @CheckPolicies([AuthorizationActions.Create, Sections.EDITOR])
  voiceApplySelected(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Param('id') id: string) {
    return this.controls.applySelectedVoice(org.id, user.id, id);
  }
}
