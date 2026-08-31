import {
  Controller,
  ExecutionContext,
  HttpCode,
  Injectable,
  Logger,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  Throttle,
  ThrottlerGuard,
  ThrottlerLimitDetail,
} from '@nestjs/throttler';
import { Request } from 'express';
import { PublicGrowthService } from '@contentfactory/nestjs-libraries/database/prisma/public-growth/public-growth.service';
import { createTransientClientTracker } from '@contentfactory/nestjs-libraries/throttler/throttler.provider';

@Injectable()
export class PublicGrowthEventsGuard extends ThrottlerGuard {
  private readonly logger = new Logger(PublicGrowthEventsGuard.name);

  protected override async getTracker(req: Request): Promise<string> {
    return createTransientClientTracker(req);
  }

  protected override async throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail
  ): Promise<void> {
    this.logger.warn(
      'Public growth throttle exhausted for POST /public-growth-events/'
    );
    return super.throwThrottlingException(context, throttlerLimitDetail);
  }
}

@Controller('/public-growth-events')
export class PublicGrowthEventsController {
  constructor(private readonly _growth: PublicGrowthService) {}

  @Post('/')
  @HttpCode(202)
  @UseGuards(PublicGrowthEventsGuard)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  async record(@Req() request: { body: unknown }) {
    await this._growth.recordPublic(request.body);
    return { accepted: true };
  }
}
