import { Injectable } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import { VideoJobService } from '@contentfactory/nestjs-libraries/videos/video-job.service';

export type VideoGenerationInputV1 = { organizationId: string; jobId: string };

@Injectable()
@Activity()
export class VideoGenerationActivityV1 {
  constructor(private readonly jobs: VideoJobService) {}

  @ActivityMethod()
  async stepVideoGenerationV1(input: VideoGenerationInputV1) {
    try {
      return await this.jobs.runStep(input.organizationId, input.jobId);
    } catch {
      throw new Error('VIDEO_STEP_UNAVAILABLE');
    }
  }

  @ActivityMethod()
  async expireVideoGenerationV1(input: VideoGenerationInputV1) {
    try {
      return await this.jobs.expire(input.organizationId, input.jobId);
    } catch {
      throw new Error('VIDEO_EXPIRY_UNAVAILABLE');
    }
  }
}
