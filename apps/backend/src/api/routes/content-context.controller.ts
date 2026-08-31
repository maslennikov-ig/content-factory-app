import {
  Body,
  Controller,
  Get,
  HttpException,
  Param,
  Post,
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
  CreateContentFactDto,
  LinkContentFactEvidenceDto,
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

const aiRead = [AuthorizationActions.Read, Sections.AI] as const;
const aiCreate = [AuthorizationActions.Create, Sections.AI] as const;
const adminUpdate = [AuthorizationActions.Update, Sections.ADMIN] as const;

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
  @CheckPolicies(aiCreate as any)
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

  @Get('/facts')
  @CheckPolicies(aiRead as any)
  async listFacts(@GetOrgFromRequest() organization: Organization) {
    try {
      return { facts: await this.facts.listFacts(organization.id) };
    } catch (error) {
      safeContextError(error);
    }
  }

  @Post('/facts')
  @CheckPolicies(aiCreate as any)
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

  @Post('/facts/:factId/evidence')
  @CheckPolicies(aiCreate as any)
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

  @Post('/facts/:factId/evidence/:evidenceId/review')
  @CheckPolicies(adminUpdate as any)
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
  @CheckPolicies(adminUpdate as any)
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
