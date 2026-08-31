import * as Sentry from '@sentry/nextjs';
import { createErrorCollectionOptions } from '@contentfactory/helpers/errors/create.error.collection.options';

try {
  const options = createErrorCollectionOptions({
    dsn: process.env.CONTENT_FACTORY_ERROR_DSN,
    allowedOrigin: process.env.CONTENT_FACTORY_ERROR_ORIGIN,
    service: 'frontend',
    environment: process.env.NODE_ENV,
    release: process.env.CONTENT_FACTORY_RELEASE,
    // The default integration set is off, so the two process-level handlers
    // have to be named or a crash of the Next server reports nothing. They read
    // no payload, and what they capture still goes through the sanitizer. The
    // edge runtime has no process handlers, so its config passes none.
    integrations: [
      Sentry.onUncaughtExceptionIntegration(),
      Sentry.onUnhandledRejectionIntegration(),
    ],
  });

  if (options) {
    Sentry.init({
      ...options,
      skipOpenTelemetrySetup: true,
      registerEsmLoaderHooks: false,
      streamGenAiSpans: false,
      includeLocalVariables: false,
    });
  }
} catch {
  // Error collection must never prevent the product from starting.
}
