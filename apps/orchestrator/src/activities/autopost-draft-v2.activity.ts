import { Injectable } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import { AutopostService } from '@contentfactory/nestjs-libraries/database/prisma/autopost/autopost.service';

export type AutoPostDraftV2ActivityInput = {
  id: string;
  organizationId: string;
};

@Injectable()
@Activity()
export class AutopostDraftV2Activity {
  constructor(private readonly autoPosts: AutopostService) {}

  @ActivityMethod()
  autoPostDraftV2(input: AutoPostDraftV2ActivityInput) {
    return this.autoPosts.startAutopostDraftV2(input.organizationId, input.id);
  }
}
