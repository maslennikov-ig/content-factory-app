'use strict';

/**
 * `IntegrationService` loaded without Nest, a database, Redis or Temporal:
 * its providers are stubs, everything else it imports is the real module. The
 * suite gives the instance its repository, provider manager and the rest
 * (`new IntegrationService(...)`). Extracted when the scenario world needed
 * it too (review W4-24 F11): the channel writing profile and channel posts
 * suites each carried a copy of this list.
 *
 * `mocks` replaces or adds substitutes: a Redis the suite reads back, the
 * platform's `RefreshToken` class it throws.
 */

const { loadWithMocks } = require('./load-ts-with-mocks.cjs');

class HttpException extends Error {
  constructor(response, status) {
    super(JSON.stringify(response));
    this.response = response;
    this.status = status;
  }

  getStatus() {
    return this.status;
  }
}

const loadIntegrationService = (mocks = {}) =>
  loadWithMocks(
    'libraries/nestjs-libraries/src/database/prisma/integrations/integration.service.ts',
    {
      '@nestjs/common': {
        Injectable: () => (target) => target,
        Inject: () => () => {},
        forwardRef: (fn) => fn,
        HttpException,
        HttpStatus: { NOT_FOUND: 404, BAD_REQUEST: 400, UNPROCESSABLE_ENTITY: 422 },
      },
      '@contentfactory/nestjs-libraries/upload/upload.factory': {
        UploadFactory: { createStorage: () => ({}) },
      },
      '@contentfactory/nestjs-libraries/redis/redis.service': { ioRedis: {} },
      'nestjs-temporal-core': { TemporalService: class {} },
      '@contentfactory/nestjs-libraries/database/prisma/notifications/notification.service':
        { NotificationService: class {} },
      '@contentfactory/nestjs-libraries/database/prisma/autopost/autopost.repository':
        { AutopostRepository: class {} },
      '@contentfactory/nestjs-libraries/integrations/refresh.integration.service':
        { RefreshIntegrationService: class {} },
      '@contentfactory/nestjs-libraries/integrations/analytics.snapshot.service':
        { AnalyticsSnapshotService: class {} },
      '@contentfactory/nestjs-libraries/integrations/integration.manager': {
        IntegrationManager: class {},
      },
      ...mocks,
    }
  );

module.exports = { loadIntegrationService, HttpException };
