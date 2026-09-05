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
import type { Organization, User } from '@prisma/client';
import { GetOrgFromRequest } from '@contentfactory/nestjs-libraries/user/org.from.request';
import { GetUserFromRequest } from '@contentfactory/nestjs-libraries/user/user.from.request';
import { CheckPolicies } from '@contentfactory/backend/services/auth/permissions/permissions.ability';
import {
  AuthorizationActions,
  Sections,
} from '@contentfactory/backend/services/auth/permissions/permission.exception.class';
import {
  AssessContentEvidenceDto,
  BuildContentContextDto,
  CopyContentFactDto,
  CreateContentFactDto,
  LinkContentFactEvidenceDto,
  ListContentFactsQueryDto,
  ReviewContentFactEvidenceDto,
} from '@contentfactory/nestjs-libraries/dtos/content-intelligence/content-context.dto';
import { ContentContextService } from '@contentfactory/nestjs-libraries/content-intelligence/context/content-context.service';
import { ContentFactService } from '@contentfactory/nestjs-libraries/content-intelligence/context/content-fact.service';

function safeContextError(error: unknown): never {
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
          error instanceof Error ? error.message : 'Content context failed',
      },
      error.status
    );
  }
  throw error;
}

/**
 * Who may look, and who may write.
 *
 * `Sections.AI` is a plan allowance and knows nothing about roles; the role
 * lives in `Sections.EDITOR` beside it, and the guard reads two policies with
 * AND. The allowance is named first on purpose — a workspace that has spent
 * its month should hear about the month, not about a role nobody sells
 * (`docs/product/roles-matrix.md`, «Двери»).
 *
 * Owner decision of 05.09.2026 (`content-factory-next-fn33.90`): facts and the
 * evidence under them are the editor's работа. Reading them is any member's:
 * `aiRead` stays alone.
 */
const aiRead = [AuthorizationActions.Read, Sections.AI] as const;
const aiCreate = [AuthorizationActions.Create, Sections.AI] as const;
const editorCreate = [AuthorizationActions.Create, Sections.EDITOR] as const;
const editorUpdate = [AuthorizationActions.Update, Sections.EDITOR] as const;

@ApiTags('Content intelligence · facts and context')
@Controller('/content-intelligence')
export class ContentContextController {
  constructor(
    private readonly contexts: ContentContextService,
    private readonly facts: ContentFactService
  ) {}

  @Get('/contexts/:id')
  @CheckPolicies(aiRead as any)
  async getContext(
    @GetOrgFromRequest() organization: Organization,
    @Param('id') id: string
  ) {
    try {
      return await this.contexts.get(organization.id, id);
    } catch (error) {
      safeContextError(error);
    }
  }

  @Post('/contexts')
  @CheckPolicies(aiCreate as any, editorCreate as any)
  async buildContext(
    @GetOrgFromRequest() organization: Organization,
    @Body() body: BuildContentContextDto
  ) {
    try {
      return await this.contexts.build(organization.id, body as any);
    } catch (error) {
      safeContextError(error);
    }
  }

  /**
   * Витрина фактов, при желании суженная поиском по словам
   * (`content-factory-next-odb8.4`).
   *
   * До этого поиск на витрине был клиентским: экран забирал каталог целиком и
   * прятал лишние строки у себя. Каталог отдаётся с `take: 100`, поэтому
   * такой поиск честно искал только по первой сотне фактов и молча не видел
   * остальные. Слово, доехавшее до `where`, снимает именно это.
   */
  @Get('/facts')
  @CheckPolicies(aiRead as any)
  async listFacts(
    @GetOrgFromRequest() organization: Organization,
    @Query() query: ListContentFactsQueryDto = {}
  ) {
    try {
      return { facts: await this.facts.listFacts(organization.id, query?.q) };
    } catch (error) {
      safeContextError(error);
    }
  }

  @Post('/facts')
  @CheckPolicies(aiCreate as any, editorCreate as any)
  async createFact(
    @GetOrgFromRequest() organization: Organization,
    @GetUserFromRequest() user: User,
    @Body() body: CreateContentFactDto
  ) {
    try {
      return await this.facts.createFact(organization.id, user.id, body);
    } catch (error) {
      safeContextError(error);
    }
  }

  /**
   * СНЯТЬ (`content-factory-next-odb8.1`): the witness screen's first action.
   * Gated the same way creating a fact already is — this is an everyday
   * write on the workspace's own memory, not an administrative review.
   */
  @Post('/facts/:factId/retract')
  @CheckPolicies(aiCreate as any, editorCreate as any)
  async retractFact(
    @GetOrgFromRequest() organization: Organization,
    @GetUserFromRequest() user: User,
    @Param('factId') factId: string
  ) {
    try {
      return await this.facts.retractFact(organization.id, user.id, factId);
    } catch (error) {
      safeContextError(error);
    }
  }

  /** «Вернуть»: the retracted row's only action. */
  @Post('/facts/:factId/restore')
  @CheckPolicies(aiCreate as any, editorCreate as any)
  async restoreFact(
    @GetOrgFromRequest() organization: Organization,
    @GetUserFromRequest() user: User,
    @Param('factId') factId: string
  ) {
    try {
      return await this.facts.restoreFact(organization.id, user.id, factId);
    } catch (error) {
      safeContextError(error);
    }
  }

  /**
   * КОПИРОВАТЬ И ПОПРАВИТЬ (`content-factory-next-odb8.1`): a new fact, its
   * own row, the old one left exactly as it was.
   */
  @Post('/facts/:factId/copy')
  @CheckPolicies(aiCreate as any, editorCreate as any)
  async copyFact(
    @GetOrgFromRequest() organization: Organization,
    @GetUserFromRequest() user: User,
    @Param('factId') factId: string,
    @Body() body: CopyContentFactDto
  ) {
    try {
      return await this.facts.copyFact(organization.id, user.id, factId, body);
    } catch (error) {
      safeContextError(error);
    }
  }

  @Post('/facts/:factId/evidence')
  @CheckPolicies(aiCreate as any, editorCreate as any)
  async linkEvidence(
    @GetOrgFromRequest() organization: Organization,
    @GetUserFromRequest() user: User,
    @Param('factId') factId: string,
    @Body() body: LinkContentFactEvidenceDto
  ) {
    try {
      return await this.facts.linkEvidence(
        organization.id,
        user.id,
        factId,
        body
      );
    } catch (error) {
      safeContextError(error);
    }
  }

  /**
   * «Подтвердить» (`content-factory-next-tyrk`): the everyday door for
   * accepting a «найдено поиском» result, gated the same way creating or
   * linking a fact already is — this is the person's own confirmation of
   * their own workspace's material, not an administrative review. It sits
   * beside `/review` and `/evidence/:evidenceId/assessment`, both ADMIN-only
   * and unreachable from the interface, without replacing either.
   */
  @Post('/facts/:factId/evidence/:evidenceId/confirm')
  @CheckPolicies(aiCreate as any, editorCreate as any)
  async confirmEvidence(
    @GetOrgFromRequest() organization: Organization,
    @GetUserFromRequest() user: User,
    @Param('factId') factId: string,
    @Param('evidenceId') evidenceId: string
  ) {
    try {
      return await this.facts.confirmEvidence(
        organization.id,
        user.id,
        factId,
        evidenceId
      );
    } catch (error) {
      safeContextError(error);
    }
  }

  @Post('/facts/:factId/evidence/:evidenceId/review')
  @CheckPolicies(editorUpdate as any)
  async reviewEvidenceLink(
    @GetOrgFromRequest() organization: Organization,
    @GetUserFromRequest() user: User,
    @Param('factId') factId: string,
    @Param('evidenceId') evidenceId: string,
    @Body() body: ReviewContentFactEvidenceDto
  ) {
    try {
      return await this.facts.reviewEvidenceLink(
        organization.id,
        user.id,
        factId,
        evidenceId,
        body.reviewStatus
      );
    } catch (error) {
      safeContextError(error);
    }
  }

  @Post('/evidence/:evidenceId/assessment')
  @CheckPolicies(editorUpdate as any)
  async assessEvidence(
    @GetOrgFromRequest() organization: Organization,
    @GetUserFromRequest() user: User,
    @Param('evidenceId') evidenceId: string,
    @Body() body: AssessContentEvidenceDto
  ) {
    try {
      return await this.facts.assessEvidence(
        organization.id,
        user.id,
        evidenceId,
        body
      );
    } catch (error) {
      safeContextError(error);
    }
  }
}
