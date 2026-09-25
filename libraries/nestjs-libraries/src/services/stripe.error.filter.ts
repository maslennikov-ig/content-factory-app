import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import Stripe from 'stripe';

/**
 * A Stripe failure is the billing provider's answer, never ours about the
 * session. Stripe errors carry their own `statusCode` and `message`, and
 * Nest's base filter replays any error shaped like that verbatim — so an
 * instance without a Stripe key (`sk_nothing`) answered `GET
 * /user/subscription/tiers` with Stripe's 401, and the frontend, which reads
 * 401 as "signed out", dropped the auth cookie (`content-factory-next-2q28.18`).
 * Every Stripe failure now leaves as 502: the request failed upstream, the
 * person stays signed in.
 */
@Catch(Stripe.errors.StripeError)
export class StripeErrorFilter implements ExceptionFilter {
  private readonly _logger = new Logger(StripeErrorFilter.name);

  catch(exception: Stripe.errors.StripeError, host: ArgumentsHost) {
    this._logger.warn(
      `Billing provider refused: ${exception.type} ${exception.statusCode ?? ''}`
    );
    const response = host.switchToHttp().getResponse<Response>();
    return response.status(HttpStatus.BAD_GATEWAY).json({
      statusCode: HttpStatus.BAD_GATEWAY,
      message: 'The billing provider is unavailable.',
    });
  }
}
