import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { GetOrgFromRequest } from '@contentfactory/nestjs-libraries/user/org.from.request';
import { Organization } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { CheckPolicies } from '@contentfactory/backend/services/auth/permissions/permissions.ability';
import {
  AuthorizationActions,
  Sections,
} from '@contentfactory/backend/services/auth/permissions/permission.exception.class';
import { SignatureService } from '@contentfactory/nestjs-libraries/database/prisma/signatures/signature.service';
import { SignatureDto } from '@contentfactory/nestjs-libraries/dtos/signature/signature.dto';

@ApiTags('Signatures')
@Controller('/signatures')
export class SignatureController {
  constructor(private _signatureService: SignatureService) {}

  @Get('/')
  async getSignatures(@GetOrgFromRequest() org: Organization) {
    return this._signatureService.getSignaturesByOrgId(org.id);
  }

  @Get('/default')
  async getDefaultSignature(@GetOrgFromRequest() org: Organization) {
    return (await this._signatureService.getDefaultSignature(org.id)) || {};
  }

  @Post('/')
  @CheckPolicies([AuthorizationActions.Create, Sections.EDITOR])
  async createSignature(
    @GetOrgFromRequest() org: Organization,
    @Body() body: SignatureDto
  ) {
    return this._signatureService.createOrUpdateSignature(org.id, body);
  }

  @Delete('/:id')
  @CheckPolicies([AuthorizationActions.Delete, Sections.EDITOR])
  async deleteSignature(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    return this._signatureService.deleteSignature(org.id, id);
  }

  @Put('/:id')
  @CheckPolicies([AuthorizationActions.Update, Sections.EDITOR])
  async updateSignature(
    @Param('id') id: string,
    @GetOrgFromRequest() org: Organization,
    @Body() body: SignatureDto
  ) {
    return this._signatureService.createOrUpdateSignature(org.id, body, id);
  }
}
