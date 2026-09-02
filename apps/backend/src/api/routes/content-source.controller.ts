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
  SearchForEvidenceDto,
  SyncContentSourceDto,
} from '@contentfactory/nestjs-libraries/dtos/content-intelligence/content-source.dto';
import { ContentSourceRegistryService } from '@contentfactory/nestjs-libraries/content-intelligence/source-registry/source-registry.service';
import { WebResearchService } from '@contentfactory/nestjs-libraries/openai/web.research.service';

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
  constructor(
    private readonly sources: ContentSourceRegistryService,
    private readonly research: WebResearchService
  ) {}

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
   * `content-factory-next-lh5s`: the search a person runs before they accept
   * anything, and the half of the path that was missing.
   *
   * The accepting door below has existed since 01.09.2026 and no screen could
   * open it, because nothing showed a person what there was to accept: web
   * research was reachable only from the copilot's own tool list and from
   * autopost, both of which drop the result into a draft rather than offer it
   * for a decision. So «найдено поиском» was a shape the reading side knew and
   * the product could not produce.
   *
   * What comes back is already the shape the accepting door takes, joined
   * here rather than in the browser: `WebResearchService` answers with claims
   * and sources in two lists keyed by URL, and a screen that has to join them
   * itself is a screen that will one day join them differently.
   *
   * This spends the organization's AI budget — a model call to classify the
   * subject plus a search call — so it is a `Post` behind the same `aiCreate`
   * gate as the rest, never a `Get` something could prefetch.
   */
  @Post('/search')
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  async searchForEvidence(
    @GetOrgFromRequest() organization: Organization,
    @Body() body: SearchForEvidenceDto
  ) {
    try {
      const research = await this.research.research(
        organization.id,
        body.subject
      );
      const sourceByUrl = new Map(
        research.sources.map((source) => [source.url, source])
      );
      return {
        summary: research.summary,
        provider: research.provider,
        results: research.facts.map((fact) => {
          const source = sourceByUrl.get(fact.sourceUrl);
          return {
            url: fact.sourceUrl,
            title: source?.title ?? null,
            excerpt: fact.text,
            publishedAt: source?.publishedAt ?? null,
            // A claim whose URL is in no source row keeps the run's own
            // provider rather than guessing at one. `mixed` is a value the
            // accepting door already accepts, and it is the honest answer
            // when two providers answered the same run.
            provider: source?.provider ?? research.provider,
          };
        }),
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'WebSearchNotConfigured') {
        throw new HttpException(
          {
            code: 'CONTENT_SEARCH_NOT_CONFIGURED',
            message: error.message,
          },
          409
        );
      }
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
