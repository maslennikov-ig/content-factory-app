import { Body, Controller, HttpException, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Organization, User } from '@prisma/client';
import { GetOrgFromRequest } from '@contentfactory/nestjs-libraries/user/org.from.request';
import { GetUserFromRequest } from '@contentfactory/nestjs-libraries/user/user.from.request';
import { CheckPolicies } from '@contentfactory/backend/services/auth/permissions/permissions.ability';
import {
  AuthorizationActions,
  Sections,
} from '@contentfactory/backend/services/auth/permissions/permission.exception.class';
import { ImportArchiveMaterialDto } from '@contentfactory/nestjs-libraries/dtos/content-intelligence/content-material.dto';
import { ContentMaterialService } from '@contentfactory/nestjs-libraries/content-intelligence/materials/content-material.service';

/**
 * «Занесение своего прежнего» (`content-factory-next-odb8.4`), on its own
 * controller rather than added to `ContentMaterialController`.
 *
 * `tests/content-material.routes.test.cjs` asserts that controller mounts
 * *exactly* the four routes `VOICE_SURFACES.materials.routes` names in
 * `voice-wiring.contract.ts` — "nothing beyond the contract is mounted" is
 * the test's own words. That contract is screen 11's, and this stream's write
 * zone is `materials/**`, not `brand-voice/**`: widening the contract to add
 * a fifth route was not this stream's to do, and weakening the guard to let
 * an unlisted route through would be worse than a second, small controller.
 * `GET /content-intelligence/materials` itself stays on the original
 * controller and the original route — only new, optional query parameters
 * were added there, which the route-identity guard cannot see.
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
    throw new HttpException(
      {
        code: error.code,
        message:
          error instanceof Error ? error.message : 'Archive request failed',
      },
      error.status
    );
  }
  throw error;
}

@ApiTags('Content intelligence · archive')
@Controller('/content-intelligence/materials/archive')
export class ContentArchiveController {
  constructor(private readonly materials: ContentMaterialService) {}

  @Post('/import')
  @CheckPolicies([AuthorizationActions.Create, Sections.POSTS_PER_MONTH])
  async import(
    @GetOrgFromRequest() organization: Organization,
    @GetUserFromRequest() user: User,
    @Body() body: ImportArchiveMaterialDto
  ) {
    try {
      return await this.materials.importArchiveMaterial(
        organization.id,
        user.id,
        body
      );
    } catch (error) {
      safeHttpError(error);
    }
  }
}
