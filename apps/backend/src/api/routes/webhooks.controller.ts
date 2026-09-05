import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { GetOrgFromRequest } from '@contentfactory/nestjs-libraries/user/org.from.request';
import { Organization } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { WebhooksService } from '@contentfactory/nestjs-libraries/database/prisma/webhooks/webhooks.service';
import { CheckPolicies } from '@contentfactory/backend/services/auth/permissions/permissions.ability';
import {
  OnlyURL, UpdateDto, WebhooksDto
} from '@contentfactory/nestjs-libraries/dtos/webhooks/webhooks.dto';
import { AuthorizationActions, Sections } from '@contentfactory/backend/services/auth/permissions/permission.exception.class';
import { getSsrfSafeDispatcher } from '@contentfactory/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';

@ApiTags('Webhooks')
@Controller('/webhooks')
export class WebhookController {
  constructor(private _webhooksService: WebhooksService) {}

  @Get('/')
  async getStatistics(@GetOrgFromRequest() org: Organization) {
    return this._webhooksService.getWebhooks(org.id);
  }

  @Post('/')
  // A webhook is an outbound address: everything this workspace publishes
  // starts arriving at somebody else's server. Owner assumption of 05.09.2026
  // (`content-factory-next-fn33.90`) — that is an administrator's decision,
  // not an editor's. Plan limit first, role second.
  @CheckPolicies(
    [AuthorizationActions.Create, Sections.WEBHOOKS],
    [AuthorizationActions.Create, Sections.ADMIN]
  )
  async createAWebhook(
    @GetOrgFromRequest() org: Organization,
    @Body() body: WebhooksDto
  ) {
    return this._webhooksService.createWebhook(org.id, body);
  }

  @Put('/')
  @CheckPolicies([AuthorizationActions.Update, Sections.ADMIN])
  async updateWebhook(
    @GetOrgFromRequest() org: Organization,
    @Body() body: UpdateDto
  ) {
    return this._webhooksService.createWebhook(org.id, body);
  }

  @Delete('/:id')
  @CheckPolicies([AuthorizationActions.Delete, Sections.ADMIN])
  async deleteWebhook(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    return this._webhooksService.deleteWebhook(org.id, id);
  }

  @Post('/send')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async sendWebhook(@Body() body: any, @Query() query: OnlyURL) {
    try {
      await fetch(query.url, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
        // `OnlyURL` validated the first hop at request time; the dispatcher
        // re-checks every resolved IP at connect time, and `manual` stops a
        // 302 from carrying the payload to an address nothing validated.
        redirect: 'manual',
        // @ts-ignore - undici-only option; blocks SSRF to internal IPs
        dispatcher: getSsrfSafeDispatcher(),
      });
    } catch (err) {
      /** sent **/
    }

    return { send: true };
  }
}
