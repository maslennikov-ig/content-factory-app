import {
  Controller,
  HttpException,
  Post,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { StripeService } from '@contentfactory/nestjs-libraries/services/stripe.service';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Stripe')
@Controller('/stripe')
export class StripeController {
  constructor(
    private readonly _stripeService: StripeService,
  ) {}

  @Post('/')
  async stripe(@Req() req: RawBodyRequest<Request>) {
    const event = this._stripeService.validateRequest(
      req.rawBody,
      // @ts-ignore
      req.headers['stripe-signature'],
      process.env.STRIPE_SIGNING_KEY
    );

    // Maybe it comes from another stripe webhook
    if (
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      event?.data?.object?.metadata?.service !== 'content-factory' &&
      event.type !== 'invoice.payment_succeeded'
    ) {
      return { ok: true };
    }

    try {
      switch (event.type) {
        case 'invoice.payment_succeeded':
          return await this._stripeService.paymentSucceeded(event);
        case 'customer.subscription.created':
          return await this._stripeService.createSubscription(event);
        case 'customer.subscription.updated': {
          const result = await this._stripeService.updateSubscription(event);
          await this._stripeService.recordCancellationFromWebhook(event);
          return result;
        }
        case 'customer.subscription.deleted': {
          const result = await this._stripeService.deleteSubscription(event);
          await this._stripeService.recordCancellationFromWebhook(event);
          return result;
        }
        default:
          return { ok: true };
      }
    } catch (e) {
      throw new HttpException(e, 500);
    }
  }
}
