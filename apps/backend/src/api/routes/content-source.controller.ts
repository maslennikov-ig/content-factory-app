import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  Param,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Organization, User } from '@prisma/client';
import { GetOrgFromRequest } from '@contentfactory/nestjs-libraries/user/org.from.request';
import { GetUserFromRequest } from '@contentfactory/nestjs-libraries/user/user.from.request';
import { CheckPolicies } from '@contentfactory/backend/services/auth/permissions/permissions.ability';
import {
  AuthorizationActions,
  Sections,
} from '@contentfactory/backend/services/auth/permissions/permission.exception.class';
import {
  AcceptSearchResultEvidenceDto,
  ConfirmContentSourceRightsDto,
  CreateContentSourceDto,
  SyncContentSourceDto,
} from '@contentfactory/nestjs-libraries/dtos/content-intelligence/content-source.dto';
import { ContentSourceRegistryService } from '@contentfactory/nestjs-libraries/content-intelligence/source-registry/source-registry.service';

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
          error instanceof Error ? error.message : 'Source request failed',
      },
      error.status
    );
  }
  throw error;
}

@ApiTags('Content intelligence sources')
@Controller('/content-intelligence/sources')
export class ContentSourceController {
  constructor(private readonly sources: ContentSourceRegistryService) {}

  @Get('/')
  async list(@GetOrgFromRequest() organization: Organization) {
    try {
      return await this.sources.listSources(organization.id);
    } catch (error) {
      safeHttpError(error);
    }
  }

  @Get('/:id')
  async get(
    @GetOrgFromRequest() organization: Organization,
    @Param('id') id: string
  ) {
    try {
      return await this.sources.getSource(organization.id, id);
    } catch (error) {
      safeHttpError(error);
    }
  }

  @Post('/')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async create(
    @GetOrgFromRequest() organization: Organization,
    @GetUserFromRequest() user: User,
    @Body() body: CreateContentSourceDto
  ) {
    try {
      return await this.sources.createSource(organization.id, user.id, body);
    } catch (error) {
      safeHttpError(error);
    }
  }

  /**
   * `content-factory-next-lh5s`: the moment a person accepts one web-research
   * result as evidence. Gated like creating a fact — an everyday write on
   * the workspace's own memory, not the admin-only source-registry actions
   * below it (`content-source-registry-spec.md`'s matrix never mentions this
   * capability, because it never creates a `ContentSource`).
   */
  @Post('/search-evidence')
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  async acceptSearchResult(
    @GetOrgFromRequest() organization: Organization,
    @Body() body: AcceptSearchResultEvidenceDto
  ) {
    try {
      return await this.sources.acceptSearchResult(organization.id, body);
    } catch (error) {
      safeHttpError(error);
    }
  }

  @Post('/:id/rights')
  @CheckPolicies([AuthorizationActions.Update, Sections.ADMIN])
  async confirmRights(
    @GetOrgFromRequest() organization: Organization,
    @GetUserFromRequest() user: User,
    @Param('id') id: string,
    @Body() body: ConfirmContentSourceRightsDto
  ) {
    try {
      return await this.sources.confirmRights(
        organization.id,
        id,
        user.id,
        body
      );
    } catch (error) {
      safeHttpError(error);
    }
  }

  @Post('/:id/activate')
  @CheckPolicies([AuthorizationActions.Update, Sections.ADMIN])
  async activate(
    @GetOrgFromRequest() organization: Organization,
    @GetUserFromRequest() user: User,
    @Param('id') id: string
  ) {
    try {
      return await this.sources.activateSource(organization.id, id, user.id);
    } catch (error) {
      safeHttpError(error);
    }
  }

  @Post('/:id/validate')
  @CheckPolicies([AuthorizationActions.Update, Sections.ADMIN])
  async validate(
    @GetOrgFromRequest() organization: Organization,
    @GetUserFromRequest() user: User,
    @Param('id') id: string,
    @Body() body: SyncContentSourceDto
  ) {
    try {
      return await this.sources.validateSource(
        organization.id,
        id,
        user.id,
        body?.runKey
      );
    } catch (error) {
      safeHttpError(error);
    }
  }

  @Post('/:id/sync')
  @CheckPolicies([AuthorizationActions.Update, Sections.ADMIN])
  async sync(
    @GetOrgFromRequest() organization: Organization,
    @GetUserFromRequest() user: User,
    @Param('id') id: string,
    @Body() body: SyncContentSourceDto
  ) {
    try {
      return await this.sources.syncNow(
        organization.id,
        id,
        user.id,
        body?.runKey
      );
    } catch (error) {
      safeHttpError(error);
    }
  }

  @Post('/:id/draft-material')
  async draftMaterial(
    @GetOrgFromRequest() organization: Organization,
    @Param('id') id: string
  ) {
    try {
      return await this.sources.getDraftMaterial(organization.id, id);
    } catch (error) {
      safeHttpError(error);
    }
  }

  @Delete('/:id')
  @CheckPolicies([AuthorizationActions.Delete, Sections.ADMIN])
  async archive(
    @GetOrgFromRequest() organization: Organization,
    @GetUserFromRequest() user: User,
    @Param('id') id: string
  ) {
    try {
      return await this.sources.archiveSource(organization.id, id, user.id);
    } catch (error) {
      safeHttpError(error);
    }
  }
}
