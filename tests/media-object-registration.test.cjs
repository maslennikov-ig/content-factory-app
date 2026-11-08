require('reflect-metadata');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const { MediaRepository } = loadTypeScriptModule('libraries/nestjs-libraries/src/database/prisma/media/media.repository.ts', {
  '@contentfactory/nestjs-libraries/database/prisma/prisma.service': { PrismaRepository: class {} },
});
const placeholders = new Proxy({}, { get: () => class Placeholder {} });
const { MediaController } = loadTypeScriptModule('apps/backend/src/api/routes/media.controller.ts', {}, {
  resolve: request => request === '@contentfactory/helpers/utils/media.source' ? loadTypeScriptModule('libraries/helpers/src/utils/media.source.ts')
    : request === '@contentfactory/backend/services/auth/permissions/permissions.ability' ? { CheckPolicies: () => () => {} }
    : request === '@contentfactory/backend/services/auth/permissions/permission.exception.class' ? { AuthorizationActions: { Create: 'Create' }, Sections: { EDITOR: 'EDITOR' } }
    : request === '@contentfactory/nestjs-libraries/upload/custom.upload.validation' ? { CustomFileValidationPipe: class { transform(value) { return value; } } }
    : request === '@contentfactory/nestjs-libraries/user/org.from.request' ? { GetOrgFromRequest: () => () => {} }
    : request === '@contentfactory/nestjs-libraries/user/user.from.request' ? { GetUserFromRequest: () => () => {} }
    : request.startsWith('@contentfactory/') ? placeholders : undefined,
});
function fixture(initial = []) {
  const rows = [...initial];
  const tx = { media: {
    findMany: jest.fn(async ({ where }) => rows.filter(row => row.path === where.path)),
    create: jest.fn(async ({ data }) => { const row = { id: `row-${rows.length}`, ...data }; rows.push(row); return row; }),
  } };
  const model = { $transaction: jest.fn(async (run, options) => { expect(options.isolationLevel).toBe('Serializable'); return run(tx); }) };
  return { repository: new MediaRepository({ model }), tx, rows };
}
test.each([null, new Date('2035-01-01')])('raw object registration refuses an existing foreign object, deletedAt=%s', async deletedAt => {
  const { repository, tx } = fixture([{ id: 'foreign', organizationId: 'org-a', path: 'https://bucket.test/shared.mp4', deletedAt }]);
  await expect(repository.saveRegisteredObjectV1('org-b', 'shared.mp4', 'https://bucket.test/shared.mp4')).rejects.toMatchObject({ status: 403 });
  expect(tx.media.create).not.toHaveBeenCalled();
});
test('an owned live registration is reused while a deleted object cannot be resurrected', async () => {
  const owned = { id: 'owned', organizationId: 'org-a', path: 'https://bucket.test/shared.mp4', deletedAt: null };
  const { repository, tx } = fixture([owned]);
  expect(await repository.saveRegisteredObjectV1('org-a', 'shared.mp4', owned.path)).toMatchObject({ id: 'owned' });
  expect(tx.media.create).not.toHaveBeenCalled();
  owned.deletedAt = new Date('2035-01-01');
  await expect(repository.saveRegisteredObjectV1('org-a', 'shared.mp4', owned.path)).rejects.toMatchObject({ status: 403 });
});
test('new legacy object registration remains available and does not bypass a preexisting foreign duplicate', async () => {
  const { repository, rows } = fixture();
  const saved = await repository.saveRegisteredObjectV1('org-a', 'new.png', 'https://bucket.test/new.png', 'Original.png');
  expect(saved).toMatchObject({ organizationId: 'org-a', originalName: 'Original.png' });
  rows.push({ ...saved, id: 'foreign-duplicate', organizationId: 'org-b' });
  await expect(repository.saveRegisteredObjectV1('org-a', 'new.png', saved.path)).rejects.toMatchObject({ status: 403 });
});

test('the real save-media controller checks canonical object ownership before registration', async () => {
  const previous = process.env.CLOUDFLARE_BUCKET_URL;
  process.env.CLOUDFLARE_BUCKET_URL = 'https://bucket.test';
  try {
    const { repository, tx } = fixture([{ id: 'foreign', organizationId: 'org-a', name: 'foreign.mp4', path: 'https://bucket.test/foreign.mp4' }]);
    const context = { _mediaService: { saveRegisteredObjectV1: repository.saveRegisteredObjectV1.bind(repository), saveFile: jest.fn() } };
    await expect(MediaController.prototype.saveMedia.call(context, { id: 'org-b' }, {}, { name: '%66oreign.mp4' })).rejects.toMatchObject({ status: 403 });
    await expect(MediaController.prototype.saveMedia.call(context, { id: 'org-b' }, {}, { name: '../escape' })).rejects.toMatchObject({ status: 400 });
    expect(tx.media.create).not.toHaveBeenCalled();
    expect(context._mediaService.saveFile).not.toHaveBeenCalled();
  } finally { if (previous === undefined) delete process.env.CLOUDFLARE_BUCKET_URL; else process.env.CLOUDFLARE_BUCKET_URL = previous; }
});

test('a serializable conflict retries the ownership read instead of blindly creating an alias', async () => {
  const tx = { media: { findMany: async () => [{ organizationId: 'org-a', path: 'https://bucket.test/shared.mp4' }], create: jest.fn() } };
  let attempts = 0;
  const model = { $transaction: async run => { if (++attempts === 1) throw { code: 'P2034' }; return run(tx); } };
  const repository = new MediaRepository({ model });
  await expect(repository.saveRegisteredObjectV1('org-b', 'shared.mp4', 'https://bucket.test/shared.mp4')).rejects.toMatchObject({ status: 403 });
  expect(attempts).toBe(2);
  expect(tx.media.create).not.toHaveBeenCalled();
});
