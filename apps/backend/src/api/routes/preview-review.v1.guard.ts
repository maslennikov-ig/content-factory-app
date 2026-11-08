import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { createTransientClientTracker } from '@contentfactory/nestjs-libraries/throttler/transient-client-tracker';

@Injectable()
export class PreviewReviewRateGuardV1 extends ThrottlerGuard {
  protected override async getTracker(request: Request): Promise<string> {
    // No bearer, cookie, person name, or IP is persisted in the rate key.
    return createTransientClientTracker(request);
  }
}
