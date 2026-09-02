import { Injectable } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import { ContentLeadService } from '@contentfactory/nestjs-libraries/content-intelligence/leads/content-lead.service';

export type ContentLeadCheckActivityInput = {
  organizationId: string;
  subscriptionId: string;
};

@Injectable()
@Activity()
export class ContentLeadCheckActivity {
  constructor(private readonly leads: ContentLeadService) {}

  @ActivityMethod()
  checkContentLeadSubscription(input: ContentLeadCheckActivityInput) {
    return this.leads.checkSubscription(
      input.organizationId,
      input.subscriptionId
    );
  }
}
