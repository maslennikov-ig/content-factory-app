import { proxyActivities } from '@temporalio/workflow';
import {
  NewsletterActivityV1,
  NewsletterSubscriptionRetryInputV1,
} from '@contentfactory/orchestrator/activities/newsletter.activity.v1';

const { deliverNewsletterSubscriptionV1 } =
  proxyActivities<NewsletterActivityV1>({
    startToCloseTimeout: '30 seconds',
    retry: {
      maximumAttempts: 8,
      initialInterval: '1 minute',
      backoffCoefficient: 2,
      maximumInterval: '1 hour',
    },
  });

export function newsletterSubscriptionRetryWorkflowV1(
  input: NewsletterSubscriptionRetryInputV1
) {
  return deliverNewsletterSubscriptionV1(input);
}
