'use strict';
require('reflect-metadata');
const { plainToInstance } = require('class-transformer');
const { validateSync } = require('class-validator');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const { loadIntegrationService } = require('./helpers/integration-service.module.cjs');
const { IntegrationRepository } = loadWithMocks('libraries/nestjs-libraries/src/database/prisma/integrations/integration.repository.ts', {
  '@contentfactory/nestjs-libraries/database/prisma/prisma.service': { PrismaRepository: class {} },
  '@contentfactory/nestjs-libraries/upload/upload.factory': { UploadFactory: { createStorage: () => ({}) } },
});
const { IntegrationDisplayNameDto, CustomerNameDto } = loadWithMocks('libraries/nestjs-libraries/src/dtos/integrations/integration.display.name.dto.ts');
const { withIntegrationDisplayName } = loadWithMocks('libraries/helpers/src/utils/integration-name.ts');
const { minifyPosts, expandPosts } = loadWithMocks('libraries/helpers/src/utils/posts.list.minify.ts');

test('one label helper handles alias, blank fallback and repeated serialization', () => {
  const original = { name: 'Provider', displayName: '  Team  ' };
  const labeled = withIntegrationDisplayName(original);
  expect(labeled).toEqual({ name: 'Team', originalName: 'Provider', displayName: '  Team  ' });
  expect(withIntegrationDisplayName(labeled)).toEqual(labeled);
  expect(withIntegrationDisplayName({ name: 'Provider', displayName: ' ' }).name).toBe('Provider');
  expect(original.name).toBe('Provider');
  const data = expandPosts(minifyPosts({ posts: [{ integration: original }] }));
  expect(data.posts[0].integration.name).toBe('Team');
  expect(data.posts[0].integration.originalName).toBe('Provider');
});

test('alias updates are organization-scoped, reset stores null, provider name is untouched', async () => {
  const update = jest.fn(async (args) => args);
  const repository = new IntegrationRepository({ model: { integration: { update } } }, {}, {}, {}, {}, {});
  await repository.updateDisplayName('org-a', 'channel-a', '  Team  ');
  expect(update.mock.calls[0][0]).toEqual({ where: { id: 'channel-a', organizationId: 'org-a', deletedAt: null }, data: { displayName: 'Team' }, select: { id: true, name: true, displayName: true } });
  await repository.updateDisplayName('org-a', 'channel-a', ' ');
  expect(update.mock.calls[1][0].data).toEqual({ displayName: null });
});

test('reconnect keeps the alias while refreshing provider identity and credentials', async () => {
  const stored = { id: 'a', name: 'Provider', displayName: 'Team' };
  const upsert = jest.fn(async ({ update }) => Object.assign(stored, update));
  const repository = new IntegrationRepository({ model: { integration: { upsert } } }, {}, {}, {}, {}, {});
  await repository.createOrUpdateIntegration(undefined, false, 'org-a', 'Fresh provider', undefined, 'social', 'external', 'telegram', 'token');
  expect(stored.displayName).toBe('Team');
  expect(upsert.mock.calls[0][0].update).not.toHaveProperty('displayName');
});

test('name DTO allows empty alias reset, rejects empty groups, wrong type and overlong names', () => {
  expect(validateSync(plainToInstance(IntegrationDisplayNameDto, { name: ' ' }))).toEqual([]);
  expect(validateSync(plainToInstance(CustomerNameDto, { name: ' ' })).length).toBeGreaterThan(0);
  for (const Dto of [IntegrationDisplayNameDto, CustomerNameDto]) {
    for (const name of [undefined, null, 3, 'a'.repeat(101)]) expect(validateSync(plainToInstance(Dto, { name })).length).toBeGreaterThan(0);
  }
});

test('group rename refuses foreign/deleted group and duplicate name; only current workspace is written', async () => {
  const { IntegrationService } = loadIntegrationService();
  const repository = { getCustomerById: jest.fn(async () => ({ id: 'group-a' })), getCustomerByName: jest.fn(async () => null), updateCustomerName: jest.fn(async () => ({})) };
  const service = new IntegrationService(repository);
  await service.updateCustomerName('org-a', 'group-a', '  Fresh  ');
  expect(repository.updateCustomerName).toHaveBeenCalledWith('org-a', 'group-a', 'Fresh');
  repository.getCustomerById.mockResolvedValue(null);
  await expect(service.updateCustomerName('org-a', 'foreign', 'Fresh')).rejects.toMatchObject({ status: 404 });
  repository.getCustomerById.mockResolvedValue({ id: 'group-a' });
  repository.getCustomerByName.mockResolvedValue({ id: 'group-b' });
  await expect(service.updateCustomerName('org-a', 'group-a', 'Fresh')).rejects.toMatchObject({ status: 400 });
  expect(repository.updateCustomerName).toHaveBeenCalledTimes(1);
});
