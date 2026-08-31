import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { AuthorizationActions, Sections, SubscriptionException } from '@contentfactory/backend/services/auth/permissions/permission.exception.class';

@Catch(SubscriptionException)
export class SubscriptionExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const status = exception.getStatus();
    const error: { section: Sections; action: AuthorizationActions } =
      exception.getResponse() as any;

    const message = getErrorMessage(error);

    response.status(status).json({
      statusCode: status,
      message,
      // Only a plan limit has somewhere to upgrade to. A role refusal that
      // carried this link would put a billing button on a screen where money
      // changes nothing — and on an instance without billing, nowhere at all.
      ...(status === HttpStatus.PAYMENT_REQUIRED
        ? { url: process.env.FRONTEND_URL + '/billing' }
        : {}),
    });
  }
}

const getErrorMessage = (error: {
  section: Sections;
  action: AuthorizationActions;
}) => {
  switch (error.section) {
    case Sections.POSTS_PER_MONTH:
      switch (error.action) {
        default:
          return 'You have reached the maximum number of posts for your subscription. Please upgrade your subscription to add more posts.';
      }
    case Sections.CHANNEL:
      switch (error.action) {
        default:
          return 'You have reached the maximum number of channels for your subscription. Please upgrade your subscription to add more channels.';
      }
    case Sections.WEBHOOKS:
      switch (error.action) {
        default:
          return 'You have reached the maximum number of webhooks for your subscription. Please upgrade your subscription to add more webhooks.';
      }
    case Sections.VIDEOS_PER_MONTH:
      switch (error.action) {
        default:
          return 'You have reached the maximum number of generated videos for your subscription. Please upgrade your subscription to generate more videos.';
      }
    // A role refusal is not a plan limit: no upgrade unlocks it, and on an
    // instance without billing there is nothing to upgrade to. Saying so is
    // the whole point — without this case the dialog opened empty.
    case Sections.ADMIN:
      switch (error.action) {
        default:
          return 'This action is available to organization administrators only. Ask an administrator of your organization to do it for you.';
      }
    // Every section that reaches this filter must produce text. A refusal
    // whose message is `undefined` renders as an empty dialog.
    default:
      return 'You are not allowed to perform this action.';
  }
};
