'use strict';

const { PrismaClient } = require('@prisma/client');
const { loadRepositories } = require('./helpers/media-ownership.module.cjs');

const databaseUrl = process.env.CF_MEDIA_DATABASE_URL;
(databaseUrl ? describe : describe.skip)('media ownership with owned disposable PostgreSQL', () => {
  let db, users, media;
  beforeAll(async () => {
    const url = new URL(databaseUrl);
    if (process.env.CF_MEDIA_DATABASE_DISPOSABLE !== '1' || url.hostname !== '127.0.0.1' ||
        url.pathname !== '/cf_media_dbxe_test') throw new Error('Only an owned disposable database is allowed');
    db = new PrismaClient({ datasourceUrl: databaseUrl });
    const repositories = loadRepositories();
    users = new repositories.UsersRepository({ model: db }, { model: db });
    media = new repositories.MediaRepository({ model: db });
    await db.organization.createMany({ data: ['a', 'alternate', 'foreign', 'disabled'].map(id => ({ id, name: 'Synthetic ' + id })) });
    await db.user.createMany({ data: ['owner', 'other'].map(id => ({ id, email: id + '@example.invalid', providerName: 'LOCAL', timezone: 0 })) });
    await db.userOrganization.createMany({ data: [
      { userId: 'owner', organizationId: 'a' }, { userId: 'owner', organizationId: 'alternate' },
      { userId: 'owner', organizationId: 'disabled', disabled: true }, { userId: 'other', organizationId: 'foreign' },
    ] });
    await db.media.createMany({ data: [
      { id: 'current', organizationId: 'a' }, { id: 'alternate', organizationId: 'alternate' },
      { id: 'foreign', organizationId: 'foreign' }, { id: 'disabled', organizationId: 'disabled' },
      { id: 'deleted', organizationId: 'a', deletedAt: new Date('2026-01-01Z') },
    ].map(row => ({ ...row, name: row.id + '.png', path: 'https://synthetic.invalid/' + row.id + '.png' })) });
  });
  afterAll(async () => { await db?.$disconnect(); });

  const profile = () => db.user.findUnique({ where: { id: 'owner' }, select: {
    name: true, lastName: true, bio: true, timezone: true, pictureId: true, updatedAt: true,
  } });
  beforeEach(async () => {
    await db.user.update({ where: { id: 'owner' }, data: {
      name: 'Before', lastName: 'Original', bio: 'Original bio', timezone: 3, pictureId: 'current',
    } });
  });

  test.each(['foreign', 'deleted', 'disabled', 'missing'])('%s media rejects atomically without any profile change', async id => {
    const before = await profile();
    await expect(users.changePersonal('owner', {
      picture: { id }, fullname: 'Changed', lastName: 'Changed', bio: 'Changed', timezone: 9,
    })).rejects.toMatchObject({ status: 404, response: { code: 'PROFILE_MEDIA_UNAVAILABLE' } });
    expect(await profile()).toEqual(before);
  });
  test.each(['current', 'alternate'])('active owned workspace %s can supply the avatar', async id => {
    await users.changePersonal('owner', { picture: { id }, fullname: 'Updated' });
    expect(await profile()).toMatchObject({ pictureId: id, name: 'Updated', lastName: 'Original', timezone: 3 });
  });
  test('ordinary picture removal and empty name still work', async () => {
    await users.changePersonal('owner', { fullname: '   ' });
    expect(await profile()).toMatchObject({ pictureId: null, name: null });
  });
  test('concurrent and repeated completed upload registration retains one active row', async () => {
    const [first, concurrent] = await Promise.all([
      media.saveMultipartFile('a', 'uploaded.png', 'https://synthetic.invalid/uploaded.png', 'photo.png'),
      media.saveMultipartFile('a', 'uploaded.png', 'https://synthetic.invalid/uploaded.png', 'photo.png'),
    ]);
    expect(concurrent.id).toBe(first.id);
    expect((await media.saveMultipartFile('a', 'uploaded.png', 'https://synthetic.invalid/uploaded.png')).id).toBe(first.id);
    expect(await db.media.count({ where: { name: 'uploaded.png', organizationId: 'a', deletedAt: null } })).toBe(1);
    const other = await media.saveMultipartFile('foreign', 'uploaded.png', 'https://synthetic.invalid/uploaded.png');
    expect(other.id).not.toBe(first.id);
  });
  test('deleted registration is not revived and unrelated media retention is unchanged', async () => {
    const existing = await media.saveMultipartFile('a', 'retained.png', 'https://synthetic.invalid/retained.png');
    await db.media.update({ where: { id: existing.id }, data: { deletedAt: new Date('2026-01-01Z') } });
    const next = await media.saveMultipartFile('a', 'retained.png', 'https://synthetic.invalid/retained.png');
    expect(next.id).not.toBe(existing.id);
    expect((await db.media.findUnique({ where: { id: existing.id } })).deletedAt).not.toBeNull();
    expect(await db.media.count({ where: { id: { in: ['current', 'alternate', 'foreign', 'disabled', 'deleted'] } } })).toBe(5);
  });
});
