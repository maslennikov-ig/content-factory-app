import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Organization, User } from '@prisma/client';
import type { BrandProfileSelectionV1 } from '@contentfactory/nestjs-libraries/content-intelligence/contracts';
import { BrandProfileService } from '@contentfactory/nestjs-libraries/content-intelligence/brand-profile/brand-profile.service';
import {
  CreateBrandProfileDraftDto,
  ResolveBrandProfileContextDto,
  UpdateBrandProfileDraftDto,
} from '@contentfactory/nestjs-libraries/dtos/content-intelligence/brand-profile.dto';
import { GetOrgFromRequest } from '@contentfactory/nestjs-libraries/user/org.from.request';
import { GetUserFromRequest } from '@contentfactory/nestjs-libraries/user/user.from.request';
import {
  type AbilityPolicy,
  CheckPolicies,
} from '@contentfactory/backend/services/auth/permissions/permissions.ability';
import {
  AuthorizationActions,
  Sections,
} from '@contentfactory/backend/services/auth/permissions/permission.exception.class';

type RequestOrganization = Organization & {
  users?: Array<{ role: 'USER' | 'ADMIN' | 'SUPERADMIN' }>;
};

function canManageProfile(organization: RequestOrganization) {
  const role = organization.users?.[0]?.role;
  return role === 'ADMIN' || role === 'SUPERADMIN';
}

const adminPolicy: AbilityPolicy = [
  AuthorizationActions.Create,
  Sections.ADMIN,
];

@ApiTags('Content intelligence · brand profile')
@Controller('/content-intelligence/brand-profile')
export class BrandProfileController {
  constructor(private readonly _service: BrandProfileService) {}

  @Get('/')
  getOverview(@GetOrgFromRequest() organization: RequestOrganization) {
    return this._service.getOverview(
      organization.id,
      canManageProfile(organization)
    );
  }

  @Post('/resolve')
  resolveContext(
    @GetOrgFromRequest() organization: Organization,
    @Body() body: ResolveBrandProfileContextDto
  ) {
    return this._service.resolveContext(
      organization.id,
      body.selection as BrandProfileSelectionV1 | undefined,
      body.provider
    );
  }

  @Post('/drafts')
  @CheckPolicies(adminPolicy)
  createDraft(
    @GetOrgFromRequest() organization: Organization,
    @GetUserFromRequest() user: User,
    @Body() body: CreateBrandProfileDraftDto
  ) {
    return this._service.createDraft(organization.id, user.id, body);
  }

  @Put('/drafts/:versionId')
  @CheckPolicies(adminPolicy)
  updateDraft(
    @GetOrgFromRequest() organization: Organization,
    @GetUserFromRequest() user: User,
    @Param('versionId') versionId: string,
    @Body() body: UpdateBrandProfileDraftDto
  ) {
    return this._service.updateDraft(organization.id, user.id, versionId, body);
  }

  @Post('/versions/:versionId/activate')
  @CheckPolicies(adminPolicy)
  activateVersion(
    @GetOrgFromRequest() organization: Organization,
    @GetUserFromRequest() user: User,
    @Param('versionId') versionId: string
  ) {
    return this._service.activateVersion(organization.id, user.id, versionId);
  }

  @Post('/versions/:versionId/clone')
  @CheckPolicies(adminPolicy)
  cloneVersion(
    @GetOrgFromRequest() organization: Organization,
    @GetUserFromRequest() user: User,
    @Param('versionId') versionId: string
  ) {
    return this._service.cloneVersion(organization.id, user.id, versionId);
  }

  @Post('/versions/:versionId/restore')
  @CheckPolicies(adminPolicy)
  restoreVersion(
    @GetOrgFromRequest() organization: Organization,
    @GetUserFromRequest() user: User,
    @Param('versionId') versionId: string
  ) {
    return this._service.restoreVersion(organization.id, user.id, versionId);
  }

  @Delete('/')
  @CheckPolicies(adminPolicy)
  deactivate(
    @GetOrgFromRequest() organization: Organization,
    @GetUserFromRequest() user: User
  ) {
    return this._service.deactivate(organization.id, user.id);
  }
}
