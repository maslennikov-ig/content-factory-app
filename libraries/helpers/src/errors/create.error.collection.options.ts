import {
  ErrorSanitizationContext,
  sanitizeErrorEvent,
} from '@contentfactory/helpers/errors/sanitize.error.event';

/**
 * The SDK's `Integration`, described structurally rather than imported: this
 * library is shared by runtimes that install different SDK packages, and the
 * guard in tests/external-services.purge.test.cjs keeps those imports to the
 * six files that are allowed to make them. Every other member of `Integration`
 * is optional, so a real one satisfies this and this satisfies a real one.
 */
export interface ErrorCollectionIntegration {
  name: string;
}

export interface ErrorCollectionOptionsInput extends ErrorSanitizationContext {
  dsn?: string;
  allowedOrigin?: string;
  /**
   * The only integrations the SDK is allowed to run. The default set stays off,
   * so a caller that needs process-level capture passes it here explicitly; a
   * caller on a runtime without process handlers (Next edge) passes nothing.
   * Whatever an integration produces still goes through `beforeSend`, which
   * rebuilds the event from the allowlist below.
   */
  integrations?: ErrorCollectionIntegration[];
}

export const normalizeErrorCollectionDsn = (
  dsnValue?: string,
  allowedOriginValue?: string
) => {
  const dsn = typeof dsnValue === 'string' ? dsnValue.trim() : '';
  const allowedOrigin =
    typeof allowedOriginValue === 'string' ? allowedOriginValue.trim() : '';
  if (!dsn || !allowedOrigin) return undefined;

  try {
    const dsnUrl = new URL(dsn);
    const allowedUrl = new URL(allowedOrigin);
    if (
      !['http:', 'https:'].includes(allowedUrl.protocol) ||
      allowedUrl.username ||
      allowedUrl.password ||
      allowedUrl.pathname !== '/' ||
      allowedUrl.search ||
      allowedUrl.hash ||
      dsnUrl.origin !== allowedUrl.origin ||
      !dsnUrl.username ||
      dsnUrl.password ||
      dsnUrl.pathname === '/' ||
      dsnUrl.search ||
      dsnUrl.hash
    ) {
      return undefined;
    }

    return dsn;
  } catch {
    return undefined;
  }
};

export const createErrorCollectionOptions = (
  input: ErrorCollectionOptionsInput
) => {
  const dsn = normalizeErrorCollectionDsn(input.dsn, input.allowedOrigin);
  if (!dsn) return null;

  const sanitizationContext: ErrorSanitizationContext = {
    service: input.service,
    environment: input.environment,
    release: input.release,
  };

  return {
    dsn,
    environment: input.environment || 'unknown',
    ...(input.release ? { release: input.release } : {}),
    defaultIntegrations: false as const,
    integrations: input.integrations ? [...input.integrations] : [],
    sendDefaultPii: false,
    enableLogs: false,
    enableMetrics: false,
    debug: false,
    spotlight: false,
    tracesSampleRate: 0,
    profilesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    autoSessionTracking: false,
    sendClientReports: false,
    maxBreadcrumbs: 0,
    beforeBreadcrumb: (): null => null,
    beforeSend: (event: unknown, hint?: unknown) => {
      try {
        if (typeof hint === 'object' && hint !== null) {
          (hint as { attachments?: unknown[] }).attachments = [];
        }
        return sanitizeErrorEvent(event, sanitizationContext);
      } catch {
        return null;
      }
    },
  };
};
