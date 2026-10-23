import { Injectable } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import { VideoSubscriptionJobService } from '@contentfactory/nestjs-libraries/videos/subscriptions/video-subscription-job.service';

export type VideoSubscriptionInputV1 = { organizationId: string; jobId: string };

@Injectable()
@Activity()
export class VideoSubscriptionActivityV1 {
  constructor(private readonly jobs: VideoSubscriptionJobService) {}

  @ActivityMethod()
  async stepVideoSubscriptionV1(input: VideoSubscriptionInputV1) {
    try {
      return await this.jobs.runStep(input.organizationId, input.jobId);
    } catch {
      throw new Error('VIDEO_STEP_UNAVAILABLE');
    }
  }

  @ActivityMethod()
  async expireVideoSubscriptionV1(input: VideoSubscriptionInputV1) {
    try {
      return await this.jobs.expire(input.organizationId, input.jobId);
    } catch {
      throw new Error('VIDEO_EXPIRY_UNAVAILABLE');
    }
  }
}
