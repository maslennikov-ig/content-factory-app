import { Catch, type ArgumentsHost, type INestApplication } from '@nestjs/common';
import type * as SentryLight from '@sentry/node-core/light' with {
  'resolution-mode': 'require',
};
import { SentryGlobalFilter } from '@sentry/nestjs/setup';
import {
  createErrorCollectionOptions,
  normalizeErrorCollectionDsn,
} from '@contentfactory/helpers/errors/create.error.collection.options';

// The public Light entry's export types need explicit resolution in this
// CommonJS project. The type-only import is erased; initialization stays early.
const Sentry: typeof SentryLight = require('@sentry/node-core/light');

type ServerService = 'backend' | 'orchestrator';
type Environment = Record<string, string | undefined>;
type FilterHost = Pick<INestApplication, 'getHttpAdapter' | 'useGlobalFilters'>;

@Catch()
class CorrelatedSentryGlobalFilter extends SentryGlobalFilter {
  constructor(private readonly adapter: ReturnType<FilterHost['getHttpAdapter']>) {
    super(adapter);
  }

  catch(exception: unknown, host: ArgumentsHost) {
    let unsubscribe: (() => void) | undefined;
    let inCatch = true;
    let correlated = false;

    // beforeSend strips event mechanisms. The unchanged capture hint identifies
    // this exception; a shared lastEventId could belong to another request.
    try {
      if (
        host.getType() === 'http' && typeof exception === 'object' && exception !== null &&
        Sentry.isEnabled()
      ) {
        const response = host.getArgByIndex(1);
        unsubscribe = Sentry.getClient()?.on('beforeSendEvent', (event, hint) => {
          try {
            if (
              !inCatch || correlated || hint?.originalException !== exception ||
              hint?.mechanism?.type !== 'auto.http.nestjs.global_filter'
            ) return;

            if (
              typeof event.event_id === 'string' && /^[a-f0-9]{32}$/.test(event.event_id) &&
              !this.adapter.isHeadersSent(response)
            ) {
              correlated = true;
              this.adapter.setHeader(response, 'X-Error-ID', event.event_id);
            }
          } catch {
            // Correlation is optional and cannot block the original response.
          }
        });
      }
    } catch {
      // No client or a failed observer leaves capture/response to the base filter.
    }

    try {
      return super.catch(exception, host);
    } finally {
      // Late/async events omit the header; neither waiting nor recapture is safe.
      inCatch = false;
      try {
        unsubscribe?.();
      } catch {
        // Cleanup faults cannot replace the base filter's result or exception.
      }
    }
  }
}

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
    app.useGlobalFilters(new CorrelatedSentryGlobalFilter(app.getHttpAdapter()));
    return true;
  } catch {
    return false;
  }
};
