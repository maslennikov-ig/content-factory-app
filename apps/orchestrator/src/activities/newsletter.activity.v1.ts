import { Injectable } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import { UsersService } from '@contentfactory/nestjs-libraries/database/prisma/users/users.service';
import { NewsletterService } from '@contentfactory/nestjs-libraries/newsletter/newsletter.service';

export interface NewsletterSubscriptionRetryInputV1 {
  userId: string;
  pendingAt: string;
  leaseId: string;
}

@Injectable()
@Activity()
export class NewsletterActivityV1 {
  constructor(private readonly users: UsersService) {}

  @ActivityMethod()
  async deliverNewsletterSubscriptionV1(
    input: NewsletterSubscriptionRetryInputV1
  ) {
    const user = await this.users.getUserById(input.userId);
    if (!user) {
      return { delivered: false };
    }

    if (
      !user.newsletterDeliveryPendingAt ||
      user.newsletterDeliveryPendingAt.toISOString() !== input.pendingAt
    ) {
      return { delivered: false };
    }

    if (
      user.newsletterDeliveryLeaseId !== input.leaseId ||
      !user.newsletterDeliveryLeaseExpiresAt ||
      user.newsletterDeliveryLeaseExpiresAt <= new Date()
    ) {
      // The pending transition still exists, so completing this workflow would
      // strand it behind a completed workflow id. Fail the activity instead;
      // the reconciler can restore the same stable lease and workflow id.
      throw new Error('Newsletter delivery lease is unavailable');
    }

    if (
      !user.newsletterConsentAt ||
      !user.newsletterConsentSource ||
      !user.email?.includes('@')
    ) {
      await this.users.clearNewsletterDeliveryPending(
        user.id,
        user.newsletterDeliveryPendingAt,
        input.leaseId
      );
      return { delivered: false };
    }

    await NewsletterService.register(user.email, {
      source: user.newsletterConsentSource,
      consentedAt: user.newsletterConsentAt,
    });
    const marked = await this.users.markNewsletterDelivered(
      user.id,
      user.newsletterDeliveryPendingAt,
      input.leaseId
    );
    return { delivered: marked.count === 1 };
  }
}
