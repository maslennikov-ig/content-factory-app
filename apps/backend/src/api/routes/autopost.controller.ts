import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  HttpException,
} from '@nestjs/common';
import { GetOrgFromRequest } from '@contentfactory/nestjs-libraries/user/org.from.request';
import { Organization } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { CheckPolicies } from '@contentfactory/backend/services/auth/permissions/permissions.ability';
import { AutopostService } from '@contentfactory/nestjs-libraries/database/prisma/autopost/autopost.service';
import {
  AutopostDraftV2Dto,
  AutopostDto,
} from '@contentfactory/nestjs-libraries/dtos/autopost/autopost.dto';
import {
  AuthorizationActions,
  Sections,
} from '@contentfactory/backend/services/auth/permissions/permission.exception.class';
import { OnlyURL } from '@contentfactory/nestjs-libraries/dtos/webhooks/webhooks.dto';

@ApiTags('Autopost')
@Controller('/autopost')
export class AutopostController {
  constructor(private _autopostsService: AutopostService) {}

  @Get('/')
  async getAutoposts(@GetOrgFromRequest() org: Organization) {
    return this._autopostsService.getAutoposts(org.id);
  }

  @Post('/v2')
  // `Sections.WEBHOOKS` counts how many the plan allows and says nothing
  // about who; the role stands beside it, plan limit first
  // (`content-factory-next-fn33.90`).
  @CheckPolicies(
    [AuthorizationActions.Create, Sections.WEBHOOKS],
    [AuthorizationActions.Create, Sections.EDITOR]
  )
  async createAutopostDraftV2(
    @GetOrgFromRequest() org: Organization,
    @Body() body: AutopostDraftV2Dto
  ) {
    try {
      return await this._autopostsService.createAutopostDraftV2(org.id, body);
    } catch (error: any) {
      if (error?.code === 'VERSION_UNAVAILABLE') {
        throw new HttpException(
          {
            code: 'BRAND_PROFILE_VERSION_UNAVAILABLE',
            message: 'The selected published brand profile is unavailable',
          },
          409
        );
      }
      if (typeof error?.status === 'number' && error?.code) {
        throw new HttpException(
          { code: error.code, message: error.message },
          error.status
        );
      }
      throw error;
    }
  }

  @Post('/')
  // `Sections.WEBHOOKS` counts how many the plan allows and says nothing
  // about who; the role stands beside it, plan limit first
  // (`content-factory-next-fn33.90`).
  @CheckPolicies(
    [AuthorizationActions.Create, Sections.WEBHOOKS],
    [AuthorizationActions.Create, Sections.EDITOR]
  )
  async createAutopost(
    @GetOrgFromRequest() org: Organization,
    @Body() body: AutopostDto
  ) {
    return this._autopostsService.createAutopost(org.id, body);
  }

  @Put('/:id')
  @CheckPolicies([AuthorizationActions.Update, Sections.EDITOR])
  async updateAutopost(
    @GetOrgFromRequest() org: Organization,
    @Body() body: AutopostDto,
    @Param('id') id: string
  ) {
    return this._autopostsService.createAutopost(org.id, body, id);
  }

  @Delete('/:id')
  @CheckPolicies([AuthorizationActions.Delete, Sections.EDITOR])
  async deleteAutopost(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    return this._autopostsService.deleteAutopost(org.id, id);
  }

  @Post('/:id/active')
  @CheckPolicies([AuthorizationActions.Update, Sections.EDITOR])
  async changeActive(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body('active') active: boolean
  ) {
    return this._autopostsService.changeActive(org.id, id, active);
  }

  @Post('/send')
  @CheckPolicies([AuthorizationActions.Create, Sections.EDITOR])
  async sendWebhook(@Query() query: OnlyURL) {
    return this._autopostsService.loadXML(query.url);
  }
}
