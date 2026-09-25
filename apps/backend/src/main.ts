import { streamCompressionFilter } from './api/routes/ndjson-stream';
import {
  initializeSentry,
  setupSentryErrorHandler,
} from '@contentfactory/nestjs-libraries/sentry/initialize.sentry';
const errorCollectionEnabled = initializeSentry('backend');
import compression from 'compression';

import { loadSwagger } from '@contentfactory/helpers/swagger/load.swagger';
import { json } from 'express';
import { Runtime } from '@temporalio/worker';
Runtime.install({ shutdownSignals: [] });

process.env.TZ = 'UTC';

import cookieParser from 'cookie-parser';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

import { SubscriptionExceptionFilter } from '@contentfactory/backend/services/auth/permissions/subscription.exception';
import { PostValidationExceptionFilter } from '@contentfactory/backend/api/routes/posts.validation.exception';
import { HttpExceptionFilter } from '@contentfactory/nestjs-libraries/services/exception.filter';
import { StripeErrorFilter } from '@contentfactory/nestjs-libraries/services/stripe.error.filter';
import { ConfigurationChecker } from '@contentfactory/helpers/configuration/configuration.checker';
import { startMcp } from '@contentfactory/nestjs-libraries/chat/start.mcp';
import { buildBackendCorsOptions } from '@contentfactory/backend/cors.options';
import { createVoicePasteBodyLimiter } from '@contentfactory/backend/api/routes/brand-voice.paste';

async function start() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
    cors: buildBackendCorsOptions(process.env),
  });

  await startMcp(app);

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
    })
  );

  app.use(['/copilot/{*splat}', '/posts'], (req: any, res: any, next: any) => {
    json({ limit: '50mb' })(req, res, next);
  });

  // Every JSON route but the ones above gets express's own 100 KB default,
  // and the pasted-text intake needs more than that: `VoiceSampleItemDto`
  // allows 200,000 characters, and cyrillic past roughly 45,000 of them is
  // already over 100 KB in UTF-8. The ceiling itself, why it is enforced
  // inside the parser rather than downstream of it, and why `/samples/files`
  // beside it is untouched, all live in `brand-voice.paste.ts` — restated
  // here it would be a second place for the same number to drift from.
  app.use(
    ['/content-intelligence/voice/samples'],
    createVoicePasteBodyLimiter()
  );

  app.use(cookieParser());
  app.use(compression({ filter: streamCompressionFilter }));
  // Registration order is the reverse of the dispatch order. Nest builds each
  // route's handler from `[...global, ...class, ...method]` and then calls
  // `filters.reverse()` (`RouterExceptionFilters.create`), so the filter
  // registered last is tried first and the first whose `@Catch()` list
  // matches answers, without walking the rest. The collector's filter is
  // `@Catch()` with no types and matches everything, so it is registered
  // first — tried last — and catches only what nothing else claimed.
  //
  // It used to be registered last, on the belief that this list dispatches
  // in order. In production, where the collector is on, it then answered for
  // all three product filters: a role refusal went out as the bare
  // `{"section":"editor","action":"create"}` with no text for the dialog
  // (`content-factory-next-fn33.149`), and the 401 that clears the auth
  // cookie and the post validation message were lost the same way.
  if (errorCollectionEnabled) setupSentryErrorHandler(app);
  app.useGlobalFilters(new SubscriptionExceptionFilter());
  app.useGlobalFilters(new PostValidationExceptionFilter());
  app.useGlobalFilters(new HttpExceptionFilter());
  // A billing-provider failure is never a sign-out (`2q28.18`).
  app.useGlobalFilters(new StripeErrorFilter());

  // Does nothing unless CONTENT_FACTORY_SWAGGER_ENABLED is exactly "true".
  loadSwagger(app);

  const port = process.env.PORT || 3000;

  try {
    await app.listen(port);
    console.log('Backend started successfully on port ' + port);

    checkConfiguration(); // Do this last, so that users will see obvious issues at the end of the startup log without having to scroll up.

    Logger.log(`🚀 Backend is running on: http://localhost:${port}`);
  } catch (e) {
    Logger.error(`Backend failed to start on port ${port}`, e);
  }
}

function checkConfiguration() {
  const checker = new ConfigurationChecker();
  checker.readEnvFromProcess();
  checker.check();

  // `ResendProvider` (libraries/nestjs-libraries/src/emails/
  // resend.provider.ts) used to fall back to a fake key ("re_132") when
  // RESEND_API_KEY was unset, so a missing key produced no signal anywhere
  // — it no longer does, it now throws on first use, which shifts the
  // failure from "invisible" to "only visible once the first email tries to
  // send". Catching it here means it shows up in the same startup log an
  // operator already reads, before that first send ever happens.
  if (process.env.EMAIL_PROVIDER === 'resend') {
    checker.checkNonEmpty(
      'RESEND_API_KEY',
      'Needed because EMAIL_PROVIDER=resend.'
    );
  }

  if (checker.hasIssues()) {
    for (const issue of checker.getIssues()) {
      Logger.warn(issue, 'Configuration issue');
    }

    Logger.warn('Configuration issues found: ' + checker.getIssuesCount());
  } else {
    Logger.log('Configuration check completed without any issues');
  }
}

start();
