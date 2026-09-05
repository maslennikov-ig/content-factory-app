import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { GetOrgFromRequest } from '@contentfactory/nestjs-libraries/user/org.from.request';
import { Organization } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { CheckPolicies } from '@contentfactory/backend/services/auth/permissions/permissions.ability';
import {
  AuthorizationActions,
  Sections,
} from '@contentfactory/backend/services/auth/permissions/permission.exception.class';
import { SetsService } from '@contentfactory/nestjs-libraries/database/prisma/sets/sets.service';
import {
  UpdateSetsDto,
  SetsDto,
} from '@contentfactory/nestjs-libraries/dtos/sets/sets.dto';

@ApiTags('Sets')
@Controller('/sets')
export class SetsController {
  constructor(private _setsService: SetsService) {}

  @Get('/')
  async getSets(@GetOrgFromRequest() org: Organization) {
    return this._setsService.getSets(org.id);
  }

  @Post('/')
  @CheckPolicies([AuthorizationActions.Create, Sections.EDITOR])
  async createASet(
    @GetOrgFromRequest() org: Organization,
    @Body() body: SetsDto
  ) {
    return this._setsService.createSet(org.id, body);
  }

  @Put('/')
  @CheckPolicies([AuthorizationActions.Update, Sections.EDITOR])
  async updateSet(
    @GetOrgFromRequest() org: Organization,
    @Body() body: UpdateSetsDto
  ) {
    return this._setsService.createSet(org.id, body);
  }

  @Delete('/:id')
  @CheckPolicies([AuthorizationActions.Delete, Sections.EDITOR])
  async deleteSet(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    return this._setsService.deleteSet(org.id, id);
  }
} 