import {
  Body,
  Controller,
  Get,
  HttpException,
  Param,
  Post,
  Query,
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
  ArchiveListQueryDto,
  MaterialDraftDto,
  MaterialRecutDto,
} from '@contentfactory/nestjs-libraries/dtos/content-intelligence/content-material.dto';
import { ContentMaterialService } from '@contentfactory/nestjs-libraries/content-intelligence/materials/content-material.service';
import {
  ARCHIVE_LAYERS,
  type ArchiveLayer,
} from '@contentfactory/nestjs-libraries/content-intelligence/materials/archive-presentation';

const isArchiveLayer = (value: unknown): value is ArchiveLayer =>
  typeof value === 'string' && (ARCHIVE_LAYERS as readonly string[]).includes(value);

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

  /**
   * The library, with the archive's selection layered on top of it
   * (`content-factory-next-odb8.4`).
   *
   * A call with none of the seven params below is answered exactly as before —
   * `listMaterials`, unchanged, the same shape `VoiceMaterialsContainer`
   * already reads. Only a call that names at least one of them asks for the
   * archive's own answer: filtered, paginated, three layers named per row.
   * Two different response shapes on one route is a real seam, named here
   * rather than hidden, and it exists because widening `MaterialsResponseV1`
   * itself would mean editing `voice-wiring.contract.ts`, outside this
   * stream's write zone.
   */
  @Get('/')
  async list(
    @GetOrgFromRequest() organization: Organization,
    @Query() query: ArchiveListQueryDto = {}
  ) {
    try {
      const { layer, platform, from, to, q, page, limit } = query ?? {};
      if (!layer && !platform && !from && !to && !q && !page && !limit) {
        return await this.materials.listMaterials(organization.id);
      }
      return await this.materials.listArchive(organization.id, {
        // An unrecognised layer or platform is read as "no filter" rather
        // than refused: a stale bookmark or a typed URL should show the
        // whole archive, not a 400 for a value nobody can see was wrong.
        layer: isArchiveLayer(layer) ? layer : undefined,
        platform: platform || undefined,
        from: from || undefined,
        to: to || undefined,
        // Слова человека доходят до поиска как есть; всё, что о них надо
        // знать маршруту, уже проверено в `ArchiveListQueryDto`.
        q: q || undefined,
        page: page ? parseInt(page, 10) || 0 : 0,
        limit: limit ? parseInt(limit, 10) || 20 : 20,
      });
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
  @CheckPolicies([AuthorizationActions.Create, Sections.EDITOR])
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
  // Two policies, read with AND: the plan limit answers first so a workspace
  // out of posts hears about the plan, and the role second
  // (`docs/product/roles-matrix.md`, `content-factory-next-fn33.90`).
  @CheckPolicies(
    [AuthorizationActions.Create, Sections.POSTS_PER_MONTH],
    [AuthorizationActions.Create, Sections.EDITOR]
  )
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
