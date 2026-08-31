import { Controller, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Organization, User } from '@prisma/client';
import { Request } from 'express';
import { ThrottlerByOrganizationGuard } from '@contentfactory/nestjs-libraries/throttler/throttler.provider';
import { ProductEventsService } from '@contentfactory/nestjs-libraries/database/prisma/product-events/product-events.service';
import { GetUserFromRequest } from '@contentfactory/nestjs-libraries/user/user.from.request';
import { GetOrgFromRequest } from '@contentfactory/nestjs-libraries/user/org.from.request';

@Controller('/product-events')
export class ProductEventsController {
  constructor(private _productEventsService: ProductEventsService) {}

  // Four events exist and a session fires at most a handful of them, so an
  // hourly ceiling per organization is generous and still below the default
  // 90 per hour that a per-minute window would have loosened to 1800.
  @Post('/')
  @UseGuards(ThrottlerByOrganizationGuard)
  @Throttle({ default: { limit: 60, ttl: 3600000 } })
  async record(
    @Req() request: Request & { body: unknown },
    @GetUserFromRequest() user: User,
    @GetOrgFromRequest() organization: Organization
  ) {
    return this._productEventsService.recordAuthenticated(request.body, {
      userId: user.id,
      organizationId: organization.id,
    });
  }
}
