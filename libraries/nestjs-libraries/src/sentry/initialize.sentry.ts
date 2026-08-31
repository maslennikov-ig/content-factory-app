import type { INestApplication } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { SentryGlobalFilter } from '@sentry/nestjs/setup';
import {
  createErrorCollectionOptions,
  normalizeErrorCollectionDsn,
} from '@contentfactory/helpers/errors/create.error.collection.options';

type ServerService = 'backend' | 'orchestrator';
type Environment = Record<string, string | undefined>;
type FilterHost = Pick<INestApplication, 'getHttpAdapter' | 'useGlobalFilters'>;

/**
 * The default integration set is off, so anything we want has to be named. These
 * two are the difference between collecting and not collecting: without them the
 * SDK only ever sees what reaches the Nest filter chain. The orchestrator is a
 * Temporal worker whose one HTTP route is the health check — activity and
 * workflow failures are handled by Temporal and never reach a filter — so it
 * would report almost nothing, and a process that dies of an uncaught exception
 * would report nothing at all.
 *
 * Neither integration reads a request payload, and whatever they capture still
 * goes through `beforeSend`, which rebuilds the event from the allowlist.
 *
 * Both keep their defaults on purpose: `exitEvenIfOtherHandlersAreRegistered`
 * is false, so an existing `uncaughtException` handler stays in charge, and
 * `mode: 'warn'` leaves an unhandled rejection non-fatal. Turning capture on
 * does not change how or whether the process dies.
 */
const processLevelIntegrations = () => [
  Sentry.onUncaughtExceptionIntegration(),
  Sentry.onUnhandledRejectionIntegration(),
];

export const initializeSentry = (
  service: ServerService,
  environment: Environment = process.env
) => {
  const options = createErrorCollectionOptions({
    dsn: environment.CONTENT_FACTORY_ERROR_DSN,
    allowedOrigin: environment.CONTENT_FACTORY_ERROR_ORIGIN,
    service,
    environment: environment.NODE_ENV,
    release: environment.CONTENT_FACTORY_RELEASE,
    integrations: processLevelIntegrations(),
  });
  if (!options) return false;

  try {
    Sentry.init({
      ...options,
      skipOpenTelemetrySetup: true,
      registerEsmLoaderHooks: false,
      streamGenAiSpans: false,
      includeLocalVariables: false,
    });
    return true;
  } catch {
    return false;
  }
};

export const setupSentryErrorHandler = (
  app: FilterHost,
  environment: Environment = process.env
) => {
  if (
    !normalizeErrorCollectionDsn(
      environment.CONTENT_FACTORY_ERROR_DSN,
      environment.CONTENT_FACTORY_ERROR_ORIGIN
    )
  ) {
    return false;
  }

  try {
    app.useGlobalFilters(new SentryGlobalFilter(app.getHttpAdapter()));
    return true;
  } catch {
    return false;
  }
};
