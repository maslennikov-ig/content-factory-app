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
import type { OrganizationRole } from '@contentfactory/nestjs-libraries/user/organization.roles';
import { isOrganizationEditor } from '@contentfactory/nestjs-libraries/user/organization.roles';

type RequestOrganization = Organization & {
  users?: Array<{ role: OrganizationRole }>;
};

/**
 * A brand profile is the voice's written half, and since 05.09.2026 it is
 * editorial work like the rest of it (`content-factory-next-fn33.90`). This
 * flag decides whether the overview offers the form at all, so it moves with
 * the policy below rather than a release after it.
 */
function canManageProfile(organization: RequestOrganization) {
  return isOrganizationEditor(organization.users?.[0]?.role);
}

/**
 * Named once and shared by the six changing routes, so the section they check
 * and the flag above cannot drift apart. `roles-matrix.guard.test.cjs` follows
 * the alias to its declaration rather than reading only the decorator text.
 */
const editorPolicy: AbilityPolicy = [
  AuthorizationActions.Create,
  Sections.EDITOR,
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
  @CheckPolicies(editorPolicy)
  createDraft(
    @GetOrgFromRequest() organization: Organization,
    @GetUserFromRequest() user: User,
    @Body() body: CreateBrandProfileDraftDto
  ) {
    return this._service.createDraft(organization.id, user.id, body);
  }

  @Put('/drafts/:versionId')
  @CheckPolicies(editorPolicy)
  updateDraft(
    @GetOrgFromRequest() organization: Organization,
    @GetUserFromRequest() user: User,
    @Param('versionId') versionId: string,
    @Body() body: UpdateBrandProfileDraftDto
  ) {
    return this._service.updateDraft(organization.id, user.id, versionId, body);
  }

  @Post('/versions/:versionId/activate')
  @CheckPolicies(editorPolicy)
  activateVersion(
    @GetOrgFromRequest() organization: Organization,
    @GetUserFromRequest() user: User,
    @Param('versionId') versionId: string
  ) {
    return this._service.activateVersion(organization.id, user.id, versionId);
  }

  @Post('/versions/:versionId/clone')
  @CheckPolicies(editorPolicy)
  cloneVersion(
    @GetOrgFromRequest() organization: Organization,
    @GetUserFromRequest() user: User,
    @Param('versionId') versionId: string
  ) {
    return this._service.cloneVersion(organization.id, user.id, versionId);
  }

  @Post('/versions/:versionId/restore')
  @CheckPolicies(editorPolicy)
  restoreVersion(
    @GetOrgFromRequest() organization: Organization,
    @GetUserFromRequest() user: User,
    @Param('versionId') versionId: string
  ) {
    return this._service.restoreVersion(organization.id, user.id, versionId);
  }

  @Delete('/')
  @CheckPolicies(editorPolicy)
  deactivate(
    @GetOrgFromRequest() organization: Organization,
    @GetUserFromRequest() user: User
  ) {
    return this._service.deactivate(organization.id, user.id);
  }
}
