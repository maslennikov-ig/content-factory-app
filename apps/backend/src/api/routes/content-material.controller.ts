import {
  Body,
  Controller,
  Get,
  HttpException,
  Param,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Organization } from '@prisma/client';
import { GetOrgFromRequest } from '@contentfactory/nestjs-libraries/user/org.from.request';
import { CheckPolicies } from '@contentfactory/backend/services/auth/permissions/permissions.ability';
import {
  AuthorizationActions,
  Sections,
} from '@contentfactory/backend/services/auth/permissions/permission.exception.class';
import {
  MaterialDraftDto,
  MaterialRecutDto,
} from '@contentfactory/nestjs-libraries/dtos/content-intelligence/content-material.dto';
import { ContentMaterialService } from '@contentfactory/nestjs-libraries/content-intelligence/materials/content-material.service';

/**
 * The four routes screen 11 was drawn against.
 *
 * Every one of them takes the organisation from the request rather than from
 * the body: a material identifier is not a permission, and a workspace that
 * guesses another's identifier still gets `MATERIAL_NOT_FOUND`.
 *
 * None of them reaches a platform. The recut prepares text and the draft is a
 * post in `DRAFT`; publishing is the ordinary path through `PostsService` and
 * the providers, which `docs/product/migration-map.md` states as a rule.
 */

function safeHttpError(error: unknown): never {
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    'status' in error &&
    typeof error.code === 'string' &&
    typeof error.status === 'number'
  ) {
    // The code is what a screen branches on and the subject is what it names.
    // Collapsing both into "что-то пошло не так" loses the only useful part.
    throw new HttpException(
      {
        code: error.code,
        message:
          error instanceof Error ? error.message : 'Material request failed',
        ...('subject' in error && typeof error.subject === 'string'
          ? { subject: error.subject }
          : {}),
      },
      error.status
    );
  }
  throw error;
}

@ApiTags('Content intelligence materials')
@Controller('/content-intelligence/materials')
export class ContentMaterialController {
  constructor(private readonly materials: ContentMaterialService) {}

  @Get('/')
  async list(@GetOrgFromRequest() organization: Organization) {
    try {
      return await this.materials.listMaterials(organization.id);
    } catch (error) {
      safeHttpError(error);
    }
  }

  @Get('/:id/derivations')
  async derivations(
    @GetOrgFromRequest() organization: Organization,
    @Param('id') id: string
  ) {
    try {
      return await this.materials.getDerivations(organization.id, id);
    } catch (error) {
      safeHttpError(error);
    }
  }

  @Post('/:id/recut-preview')
  async recutPreview(
    @GetOrgFromRequest() organization: Organization,
    @Param('id') id: string,
    @Body() body: MaterialRecutDto
  ) {
    try {
      return await this.materials.previewRecut(organization.id, id, body);
    } catch (error) {
      safeHttpError(error);
    }
  }

  @Post('/:id/draft')
  @CheckPolicies([AuthorizationActions.Create, Sections.POSTS_PER_MONTH])
  async draft(
    @GetOrgFromRequest() organization: Organization,
    @Param('id') id: string,
    @Body() body: MaterialDraftDto
  ) {
    try {
      return await this.materials.createDraft(organization.id, id, body);
    } catch (error) {
      safeHttpError(error);
    }
  }
}
