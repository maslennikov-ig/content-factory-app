import * as Sentry from '@sentry/nextjs';
import { normalizeErrorCollectionDsn } from '@contentfactory/helpers/errors/create.error.collection.options';

export async function register() {
  // The same single condition the config modules apply, rather than a looser
  // one repeated: a DSN whose origin matches the separately configured origin.
  // Checking only that both variables are present would load a config module
  // that then silently does nothing.
  if (
    !normalizeErrorCollectionDsn(
      process.env.CONTENT_FACTORY_ERROR_DSN,
      process.env.CONTENT_FACTORY_ERROR_ORIGIN
    )
  ) {
    return;
  }

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
