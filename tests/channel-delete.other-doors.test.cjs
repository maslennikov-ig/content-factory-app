'use strict';

/**
 * The public API (`DELETE /public/v1/integrations/:id`) and the enterprise
 * door (`POST /enterprise/delete-channel`) delete a channel through the step
 * the screen and the chat share (`content-factory-next-kcxz.41`,
 * `delete-channel.ts`): the channel is looked up first, and only its own posts
 * go. They used to delete every post of each post group the channel had a
 * post in, and a group spans every channel the composer wrote it for, so the
 * copies on the other channels went too while their workflows kept running.
 *
 * Each door keeps its own contract: the public API answers the deleted
 * channel (404 for one that is not there), the enterprise door answers
 * `{ success }` behind its signed parameters.
 */
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

/**
 * Everything a controller imports except Nest's decorators and the shared
 * step: a stand-in that is at once a class, a decorator factory and a
 * decorator, so the module loads without the application around it.
 */
const stub = () => {
  const target = function () {
    return new Proxy(function () {}, handler);
  };
  const handler = {
    get: (_target, key) => (key === '__esModule' ? false : new Proxy(target, handler)),
    apply: () => new Proxy(target, handler),
    // A pipe handed to `@UsePipes(new …)` is checked for `transform`.
    construct: () => ({ transform: (value) => value }),
  };
  return new Proxy(target, handler);
};

const STEP = 'libraries/nestjs-libraries/src/database/prisma/integrations/delete-channel.ts';
const load = (file, mocks = {}) =>
  loadTypeScriptModule(file, mocks, {
    sources: { '@contentfactory/nestjs-libraries/database/prisma/integrations/delete-channel': STEP },
    resolve: (request) =>
      request === '@nestjs/common' ||
      request === '@nestjs/swagger' ||
      request.endsWith('/delete-channel') ||
      Object.prototype.hasOwnProperty.call(mocks, request)
        ? undefined
        : stub(),
  });

/** A workspace with channel A; a post group `g` has copies on A and B. */
const services = () => {
  const calls = [];
  return {
    calls,
    integrations: {
      getIntegrationById: async (org, id) => (calls.push(['lookup', org, id]), id === 'A' ? { id: 'A' } : null),
      deleteChannel: async (org, id) => (calls.push(['channel', org, id]), { id, deletedAt: 'now' }),
      getPostsForChannel: async () => [{ group: 'g' }],
    },
    posts: {
      deleteChannelPosts: async (org, id) => (calls.push(['posts', org, id]), ['a-root']),
      deletePost: async (org, group) => (calls.push(['group', org, group]), undefined),
    },
  };
};

describe('kcxz.41: the public API and the enterprise door delete only the channel’s posts', () => {
  test('public API: the channel’s posts by channel id, never by group; the channel answers', async () => {
    const { PublicIntegrationsController } = load(
      'apps/backend/src/public-api/routes/v1/public.integrations.controller.ts'
    );
    const world = services();
    const controller = Object.create(PublicIntegrationsController.prototype);
    controller._integrationService = world.integrations;
    controller._postsService = world.posts;

    await expect(controller.deleteChannel({ id: 'org-1' }, 'A')).resolves.toEqual({ id: 'A', deletedAt: 'now' });
    expect(world.calls).toEqual([
      ['lookup', 'org-1', 'A'],
      ['posts', 'org-1', 'A'],
      ['channel', 'org-1', 'A'],
    ]);

    world.calls.length = 0;
    await expect(controller.deleteChannel({ id: 'org-1' }, 'missing')).rejects.toMatchObject({ status: 404 });
    expect(world.calls).toEqual([['lookup', 'org-1', 'missing']]);
  });

  test('enterprise: signed parameters, the shared step, `{ success }`', async () => {
    const verified = { apiKey: 'api-key', id: 'A' };
    const { EnterpriseController } = load('apps/backend/src/api/routes/enterprise.controller.ts', {
      '@contentfactory/helpers/auth/auth.service': { AuthService: { verifyJWT: () => verified } },
    });
    const world = services();
    const controller = Object.create(EnterpriseController.prototype);
    controller._integrationService = world.integrations;
    controller._postsService = world.posts;
    controller._organizationService = { getOrgByApiKey: async (key) => (key === 'api-key' ? { id: 'org-1' } : null) };

    await expect(controller.deleteChannel({ params: 'signed' })).resolves.toEqual({ success: true });
    expect(world.calls).toEqual([
      ['lookup', 'org-1', 'A'],
      ['posts', 'org-1', 'A'],
      ['channel', 'org-1', 'A'],
    ]);

    world.calls.length = 0;
    verified.id = 'missing';
    await expect(controller.deleteChannel({ params: 'signed' })).resolves.toEqual({ success: false });
    expect(world.calls).toEqual([['lookup', 'org-1', 'missing']]);

    world.calls.length = 0;
    verified.apiKey = 'unknown';
    await expect(controller.deleteChannel({ params: 'signed' })).resolves.toEqual({ success: false });
    expect(world.calls).toEqual([]);
  });
});
