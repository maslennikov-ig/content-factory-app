import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { GetOrgFromRequest } from '@contentfactory/nestjs-libraries/user/org.from.request';
import { GetUserFromRequest } from '@contentfactory/nestjs-libraries/user/user.from.request';
import { Organization, User } from '@prisma/client';
import { CheckPolicies } from '@contentfactory/backend/services/auth/permissions/permissions.ability';
import { OrganizationService } from '@contentfactory/nestjs-libraries/database/prisma/organizations/organization.service';
import { AddTeamMemberDto } from '@contentfactory/nestjs-libraries/dtos/settings/add.team.member.dto';
import { AdminAddTeamMemberDto } from '@contentfactory/nestjs-libraries/dtos/settings/admin.add.team.member.dto';
import { UpdateTeamMemberRoleDto } from '@contentfactory/nestjs-libraries/dtos/settings/update.team.member.role.dto';
import { ShortlinkPreferenceDto } from '@contentfactory/nestjs-libraries/dtos/settings/shortlink-preference.dto';
import { ApiTags } from '@nestjs/swagger';
import {
  AuthorizationActions,
  Sections,
} from '@contentfactory/backend/services/auth/permissions/permission.exception.class';
import { AiProviderService } from '@contentfactory/nestjs-libraries/openai/ai.provider.service';
import { AiUsageService } from '@contentfactory/nestjs-libraries/openai/ai.usage.service';
import { AiProviderDto } from '@contentfactory/nestjs-libraries/dtos/settings/ai.provider.dto';
import type { AssignableOrganizationRole } from '@contentfactory/nestjs-libraries/user/organization.roles';

@ApiTags('Settings')
@Controller('/settings')
export class SettingsController {
  constructor(
    private _organizationService: OrganizationService,
    private _aiProviderService: AiProviderService,
    private _aiUsageService: AiUsageService
  ) {}

  @Get('/team')
  @CheckPolicies(
    [AuthorizationActions.Create, Sections.TEAM_MEMBERS],
    [AuthorizationActions.Create, Sections.ADMIN]
  )
  async getTeam(@GetOrgFromRequest() org: Organization) {
    return this._organizationService.getTeam(org.id);
  }

  @Post('/team')
  @CheckPolicies(
    [AuthorizationActions.Create, Sections.TEAM_MEMBERS],
    [AuthorizationActions.Create, Sections.ADMIN]
  )
  async inviteTeamMember(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Body() body: AddTeamMemberDto
  ) {
    return this._organizationService.inviteTeamMember(org, user, body);
  }

  @Post('/team/add')
  async addTeamMember(
    @GetUserFromRequest() user: User,
    @GetOrgFromRequest() org: Organization,
    @Body() body: AdminAddTeamMemberDto
  ) {
    if (!user.isSuperAdmin) {
      throw new HttpException('Unauthorized', 400);
    }

    return this._organizationService.addTeamMemberByEmail(org, body);
  }

  /**
   * `content-factory-next-fn33.17`. The same two policies removal carries, for
   * the same reason: changing what somebody may do inside the workspace is the
   * lighter half of the same authority. Which roles the caller may hand out,
   * and to whom, is weighed in the service against their own.
   */
  @Put('/team/:id')
  @CheckPolicies(
    [AuthorizationActions.Create, Sections.TEAM_MEMBERS],
    [AuthorizationActions.Create, Sections.ADMIN]
  )
  updateTeamMemberRole(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('id') id: string,
    @Body() body: UpdateTeamMemberRoleDto
  ) {
    return this._organizationService.updateTeamMemberRole(
      org,
      user,
      id,
      body.role as AssignableOrganizationRole
    );
  }

  @Delete('/team/:id')
  @CheckPolicies(
    [AuthorizationActions.Create, Sections.TEAM_MEMBERS],
    [AuthorizationActions.Create, Sections.ADMIN]
  )
  deleteTeamMember(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    return this._organizationService.deleteTeamMember(org, id);
  }

  @Get('/shortlink')
  async getShortlinkPreference(@GetOrgFromRequest() org: Organization) {
    return this._organizationService.getShortlinkPreference(org.id);
  }

  @Post('/shortlink')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async updateShortlinkPreference(
    @GetOrgFromRequest() org: Organization,
    @Body() body: ShortlinkPreferenceDto
  ) {
    return this._organizationService.updateShortlinkPreference(
      org.id,
      body.shortlink
    );
  }

  // The organization comes from the request, never from the body, so an admin
  // of one organization cannot name another and read or clear its key.
  @Get('/ai')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async getAiProvider(@GetOrgFromRequest() organization: Organization) {
    return this._aiProviderService.getSettings(organization.id);
  }

  @Post('/ai')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async updateAiProvider(
    @GetOrgFromRequest() organization: Organization,
    @Body() body: AiProviderDto
  ) {
    return this._aiProviderService.updateSettings(organization.id, body);
  }

  @Delete('/ai/key')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async clearAiProviderKey(@GetOrgFromRequest() organization: Organization) {
    return this._aiProviderService.clearKey(organization.id);
  }

  @Delete('/ai/search-key')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async clearSearchKey(@GetOrgFromRequest() organization: Organization) {
    return this._aiProviderService.clearSearchKey(organization.id);
  }

  /**
   * `content-factory-next-fn33.28.3`: what is left, for the person about to
   * spend it.
   *
   * The neighbouring `/settings/ai` doors are administrator-only because they
   * read and write the workspace's key and show who spent what. This one is
   * neither: it answers with counts and a date, and every paid button in the
   * product is open to any member, so the number in front of that button has
   * to be too. Nothing here identifies a person, and the organisation comes
   * from the request like everywhere else.
   */
  @Get('/ai/allowance')
  async getAiAllowance(@GetOrgFromRequest() organization: Organization) {
    return this._aiUsageService.readAllowance(organization.id);
  }

  @Get('/ai/models')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async listAiModels() {
    return this._aiProviderService.listModels();
  }
}
