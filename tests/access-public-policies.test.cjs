'use strict';

require('reflect-metadata');
const { Reflector } = require('@nestjs/core');
const { METHOD_METADATA } = require('@nestjs/common/constants');
const { RequestMethod } = require('@nestjs/common');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const stubs = {
  '@contentfactory/nestjs-libraries/database/prisma/integrations/integration.service': { IntegrationService: class {} },
  '@contentfactory/nestjs-libraries/database/prisma/posts/posts.service': { PostsService: class {} },
  '@contentfactory/nestjs-libraries/database/prisma/media/media.service': { MediaService: class {} },
  '@contentfactory/nestjs-libraries/database/prisma/notifications/notification.service': { NotificationService: class {} },
  '@contentfactory/nestjs-libraries/database/prisma/subscriptions/subscription.service': { SubscriptionService: class {} },
  '@contentfactory/nestjs-libraries/database/prisma/webhooks/webhooks.service': { WebhooksService: class {} },
  '@contentfactory/nestjs-libraries/integrations/integration.manager': { IntegrationManager: class {}, socialIntegrationList: [] },
  '@contentfactory/nestjs-libraries/integrations/refresh.integration.service': { RefreshIntegrationService: class {} },
  '@contentfactory/nestjs-libraries/upload/upload.factory': { UploadFactory: { createStorage: () => ({}) } },
  '@contentfactory/nestjs-libraries/upload/custom.upload.validation': { CustomFileValidationPipe: class { transform(value) { return value; } } },
  '@contentfactory/nestjs-libraries/chat/validation.schemas.helper': {},
  '@contentfactory/nestjs-libraries/redis/redis.service': { ioRedis: {} },
};
const { PublicIntegrationsController } = loadWithMocks('apps/backend/src/public-api/routes/v1/public.integrations.controller.ts', stubs);
const { PoliciesGuard } = loadWithMocks('apps/backend/src/services/auth/permissions/permissions.guard.ts', stubs);
const { PermissionsService } = loadWithMocks('apps/backend/src/services/auth/permissions/permissions.service.ts', stubs);
const guard = new PoliciesGuard(new Reflector(), new PermissionsService({}, {}, {}, {}));
const previous = process.env.STRIPE_PUBLISHABLE_KEY;
beforeAll(() => { delete process.env.STRIPE_PUBLISHABLE_KEY; });
afterAll(() => { if (previous !== undefined) process.env.STRIPE_PUBLISHABLE_KEY = previous; });
const prototype = PublicIntegrationsController.prototype;
const mutations = Object.getOwnPropertyNames(prototype).filter(name => {
  const method = Reflect.getMetadata(METHOD_METADATA, prototype[name]);
  return [RequestMethod.POST, RequestMethod.PUT, RequestMethod.DELETE, RequestMethod.PATCH].includes(method);
});
async function permitted(name, role) {
  return guard.canActivate({
    getHandler: () => prototype[name],
    switchToHttp: () => ({ getRequest: () => ({ path: '/public/v1/test', query: {}, org: { id: 'a', createdAt: new Date('2026-01-01Z'), users: [{ role }] } }) }),
  });
}

test.each(mutations)('USER is refused by the real route policies before %s effects', async name => {
  await expect(permitted(name, 'USER')).rejects.toThrow();
});

test.each(['uploadSimple', 'uploadsFromUrl', 'createPost', 'deletePost', 'deletePostByGroup', 'generateVideo', 'videoFunction', 'changePostStatus', 'updateReleaseId'])('EDITOR retains content operation %s', async name => {
  await expect(permitted(name, 'EDITOR')).resolves.toBe(true);
});

test.each(['getIntegrationUrl', 'deleteChannel', 'triggerIntegrationTool'])('EDITOR cannot administer channels through %s, ADMIN can', async name => {
  await expect(permitted(name, 'EDITOR')).rejects.toThrow();
  await expect(permitted(name, 'ADMIN')).resolves.toBe(true);
});
