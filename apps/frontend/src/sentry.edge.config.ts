import * as Sentry from '@sentry/nextjs';
import { createErrorCollectionOptions } from '@contentfactory/helpers/errors/create.error.collection.options';

const options = createErrorCollectionOptions({
  dsn: process.env.CONTENT_FACTORY_ERROR_DSN,
  allowedOrigin: process.env.CONTENT_FACTORY_ERROR_ORIGIN,
  service: 'frontend',
  environment: process.env.NODE_ENV,
  release: process.env.CONTENT_FACTORY_RELEASE,
});

if (options) {
  try {
    Sentry.init({
      ...options,
      skipOpenTelemetrySetup: true,
    });
  } catch {
    // Error collection must never prevent the product from starting.
  }
}
