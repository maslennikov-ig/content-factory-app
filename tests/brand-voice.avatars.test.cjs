'use strict';

/**
 * Several avatars in one space, and which one is meant when nobody says.
 *
 * `ProjectBrandProfile.organizationId` was `@unique` until 2026-08-25, so the
 * question could not arise: a query for "this space's profile" had at most one
 * row to find and `findFirst` with no order was correct by construction. The
 * owner asked to keep more than one — himself, a colleague, the brand — and
 * each needs its own corpus, print and portrait, because a print averaged over
 * two people describes neither.
 *
 * What breaks quietly when that constraint goes:
 *
 *   * an unordered `findFirst` returns whatever the planner reaches first,
 *     which is stable in a fresh test database and not stable in a real one;
 *   * `update({ where: { organizationId } })` stops being a unique key — and
 *     the repository's Prisma client is typed `Record<string, any>`, so the
 *     compiler says nothing and the failure waits for runtime;
 *   * `upsert` on that key cannot exist at all.
 *
 * The suite holds the rule, not the plumbing: default first, then oldest, and
 * the same avatar for every reader on every request.
 */

require('reflect-metadata');

const path = require('node:path');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const { InMemoryVoicePrisma, matches, sortRows } = require('./helpers/voice-memory-prisma.cjs');

const profileBase =
  'libraries/nestjs-libraries/src/content-intelligence/brand-profile';
const voiceBase =
  'libraries/nestjs-libraries/src/content-intelligence/brand-voice';

const { DEFAULT_AVATAR_FIRST, MAX_AVATARS_PER_SPACE } = loadTypeScriptModule(
  `${profileBase}/brand-profile.types.ts`
);

const prismaMocks = {
  '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
    PrismaRepository: class PrismaRepository {},
    PrismaTransaction: class PrismaTransaction {},
  },
};

const sources = {
  '@contentfactory/nestjs-libraries/content-intelligence/brand-profile/brand-profile.types': `${profileBase}/brand-profile.types.ts`,
  '@contentfactory/nestjs-libraries/content-intelligence/brand-profile/brand-profile.validation': `${profileBase}/brand-profile.validation.ts`,
  '@contentfactory/nestjs-libraries/content-intelligence/contracts':
    'libraries/nestjs-libraries/src/content-intelligence/contracts.ts',
};

const { BrandProfileRepository } = loadTypeScriptModule(
  `${profileBase}/brand-profile.repository.ts`,
  prismaMocks,
  { sources }
);

const { digestBrandProfileContent } = loadTypeScriptModule(
  `${profileBase}/brand-profile.validation.ts`,
  {},
  { sources }
);

const contract = loadTypeScriptModule(
  `${voiceBase}/voice-wiring.contract.ts`,
  {},
  {
    sources: {
      './brand-voice.types': `${voiceBase}/brand-voice.types.ts`,
      './locale-pack': `${voiceBase}/locale-pack.ts`,
    },
  }
);

const ORG = 'org-a';
const USER = 'user-1';

/** A repository over the shared in-memory fake. */
const harness = () => {
  const prisma = new InMemoryVoicePrisma();
  return {
    prisma,
    profiles: new BrandProfileRepository(
      { model: prisma.model },
      prisma.transaction
    ),
  };
};

/**
 * An avatar that can write: a published version, and the pointer at it.
 *
 * Written straight into the fake rather than through `createDraft` and
 * `activateVersion`, because what these cases are about is the default flag
 * and not the version machinery those two already have their own suite for.
 */
const analyse = (prisma, avatarId, versionNumber = 1) => {
  const version = prisma.model.projectBrandProfileVersion.create({
    data: {
      organizationId: ORG,
      profileId: avatarId,
      versionNumber,
      lifecycle: 'PUBLISHED',
      label: `v${versionNumber}`,
      content: {},
      contentDigest: `digest-${avatarId}`,
      revision: 1,
      createdByUserId: USER,
      updatedByUserId: USER,
    },
  });
  prisma.model.projectBrandProfile.update({
    where: { organizationId_id: { organizationId: ORG, id: avatarId } },
    data: { activeVersionId: version.id },
  });
  return version;
};

const idsOf = (rows) => rows.map((one) => one.id);
const defaultsOf = (rows) =>
  rows.filter((one) => one.isDefault).map((one) => one.id);

describe('порядок выбора аватара', () => {
  const rows = [
    { id: 'p-old', isDefault: false, createdAt: new Date(1) },
    { id: 'p-default', isDefault: true, createdAt: new Date(3) },
    { id: 'p-new', isDefault: false, createdAt: new Date(2) },
  ];

  it('по умолчанию побеждает возраст', () => {
    const sorted = sortRows([...rows], DEFAULT_AVATAR_FIRST);

    expect(sorted[0].id).toBe('p-default');
  });

  it('без пометки по умолчанию берётся самый старый', () => {
    const plain = rows.map((row) => ({ ...row, isDefault: false }));

    expect(sortRows(plain, DEFAULT_AVATAR_FIRST)[0].id).toBe('p-old');
  });

  it('порядок детерминирован: одна и та же тройка каждый раз', () => {
    const first = sortRows([...rows], DEFAULT_AVATAR_FIRST).map((one) => one.id);
    const shuffled = sortRows([rows[2], rows[0], rows[1]], DEFAULT_AVATAR_FIRST);

    expect(shuffled.map((one) => one.id)).toEqual(first);
  });

  it('правило объявлено один раз и читается обоими репозиториями', () => {
    const fs = require('node:fs');
    const root = path.resolve(__dirname, '..');
    const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

    const profiles = read(`${profileBase}/brand-profile.repository.ts`);
    const brief = read(
      'libraries/nestjs-libraries/src/content-intelligence/brief/content-brief.repository.ts'
    );

    expect(profiles).toContain('DEFAULT_AVATAR_FIRST');
    expect(brief).toContain('DEFAULT_AVATAR_FIRST');
    // Ни одного собственного порядка: две копии разъедутся, и бриф начнёт
    // приписывать черновик не тому аватару, чем и объясняется одна константа.
    expect(profiles).not.toContain("isDefault: 'desc'");
    expect(brief).not.toContain("isDefault: 'desc'");
  });
});

describe('составной ключ, без которого правка молча ничего не правит', () => {
  it('`organizationId_id` — это два условия, а не поле', () => {
    const row = { organizationId: 'org-a', id: 'p-1' };

    expect(
      matches(row, { organizationId_id: { organizationId: 'org-a', id: 'p-1' } })
    ).toBe(true);
    expect(
      matches(row, { organizationId_id: { organizationId: 'org-a', id: 'p-2' } })
    ).toBe(false);
    expect(
      matches(row, { organizationId_id: { organizationId: 'org-b', id: 'p-1' } })
    ).toBe(false);
  });

  it('обычное поле с подчёркиванием не разворачивается', () => {
    expect(matches({ some_field: 'x' }, { some_field: 'x' })).toBe(true);
  });

  it('профиль обновляется по составному ключу, а не по пространству', () => {
    const prisma = new InMemoryVoicePrisma();
    const client = prisma.model;
    const one = client.projectBrandProfile.create({
      data: { organizationId: 'org-a', isDefault: true, activeVersionId: null },
    });
    const two = client.projectBrandProfile.create({
      data: { organizationId: 'org-a', isDefault: false, activeVersionId: null },
    });

    client.projectBrandProfile.update({
      where: { organizationId_id: { organizationId: 'org-a', id: two.id } },
      data: { activeVersionId: 'v-9' },
    });

    const rows = client.projectBrandProfile.findMany
      ? client.projectBrandProfile.findMany({ where: { organizationId: 'org-a' } })
      : [
          client.projectBrandProfile.findFirst({
            where: { organizationId_id: { organizationId: 'org-a', id: one.id } },
          }),
          client.projectBrandProfile.findFirst({
            where: { organizationId_id: { organizationId: 'org-a', id: two.id } },
          }),
        ];

    const byId = new Map(rows.map((row) => [row.id, row]));
    // Ровно один: правка по пространству задела бы оба, и это тот случай,
    // когда типы молчат — клиент репозитория объявлен как Record<string, any>.
    expect(byId.get(one.id).activeVersionId).toBeNull();
    expect(byId.get(two.id).activeVersionId).toBe('v-9');
  });

  it('первый аватар пространства — тот, что по умолчанию', () => {
    const prisma = new InMemoryVoicePrisma();
    const created = prisma.model.projectBrandProfile.create({
      data: { organizationId: 'org-a', isDefault: true, activeVersionId: null },
    });

    expect(created.isDefault).toBe(true);
  });
});

describe('одно пространство, восемь аватаров, ровно один по умолчанию', () => {
  it('первый созданный аватар становится тем, кто пишет', async () => {
    const { profiles } = harness();

    const first = await profiles.createAvatar(ORG, USER, { name: 'Алексей' });

    expect(first.isDefault).toBe(true);
    expect(first.kind).toBe('PERSON');
    expect(defaultsOf(await profiles.listAvatars(ORG))).toEqual([first.id]);
  });

  it('второй аватар не отбирает умолчание у того, кто уже пишет', async () => {
    const { prisma, profiles } = harness();
    const first = await profiles.createAvatar(ORG, USER, {});
    analyse(prisma, first.id);

    const second = await profiles.createAvatar(ORG, USER, { kind: 'BRAND' });

    expect(second.isDefault).toBe(false);
    expect(defaultsOf(await profiles.listAvatars(ORG))).toEqual([first.id]);
  });

  it('девятый отказан числом, а не молча выключенной кнопкой', async () => {
    const { profiles } = harness();
    for (let index = 0; index < MAX_AVATARS_PER_SPACE; index += 1) {
      await profiles.createAvatar(ORG, USER, {});
    }

    await expect(profiles.createAvatar(ORG, USER, {})).rejects.toMatchObject({
      code: 'AVATAR_LIMIT',
    });
    expect((await profiles.listAvatars(ORG)).length).toBe(MAX_AVATARS_PER_SPACE);
  });

  it('потолок объявлен один раз и совпадает у контракта и репозитория', () => {
    // Две копии числа — это экран, говорящий «восемь из восьми» над сервером,
    // который взял бы девятого, или наоборот.
    expect(contract.MAX_AVATARS_PER_SPACE).toBe(MAX_AVATARS_PER_SPACE);
  });

  it('аватар без разбора не может стать основным', async () => {
    const { prisma, profiles } = harness();
    const first = await profiles.createAvatar(ORG, USER, {});
    analyse(prisma, first.id);
    const second = await profiles.createAvatar(ORG, USER, {});

    await expect(
      profiles.setDefaultAvatar(ORG, USER, second.id)
    ).rejects.toMatchObject({ code: 'AVATAR_NOT_ANALYSED' });
    expect(defaultsOf(await profiles.listAvatars(ORG))).toEqual([first.id]);
  });

  it('смена основного оставляет ровно один флаг', async () => {
    const { prisma, profiles } = harness();
    const first = await profiles.createAvatar(ORG, USER, {});
    analyse(prisma, first.id);
    const second = await profiles.createAvatar(ORG, USER, {});
    analyse(prisma, second.id);

    await profiles.setDefaultAvatar(ORG, USER, second.id);

    expect(defaultsOf(await profiles.listAvatars(ORG))).toEqual([second.id]);
  });

  it('первая активация подбирает умолчание, потерявшееся на аватаре без разбора', async () => {
    const { prisma, profiles } = harness();
    // Пространство, где флаг стоит на том, кто писать не может: так бывает,
    // если аватар завели раньше, чем разобрали хоть один.
    const empty = await profiles.createAvatar(ORG, USER, {});
    const second = await profiles.createAvatar(ORG, USER, {});
    expect(empty.isDefault).toBe(true);

    const version = prisma.model.projectBrandProfileVersion.create({
      data: {
        organizationId: ORG,
        profileId: second.id,
        versionNumber: 1,
        lifecycle: 'PUBLISHED',
        label: 'v1',
        content: {},
        // Настоящий отпечаток: репозиторий отказывается включать версию, чьё
        // содержимое с ним не сходится, и подделка здесь проверяла бы отказ.
        contentDigest: digestBrandProfileContent({}),
        revision: 1,
        createdByUserId: USER,
        updatedByUserId: USER,
      },
    });
    await profiles.activateVersion(ORG, USER, version.id, {
      revision: 1,
      contentDigest: digestBrandProfileContent({}),
    });

    expect(defaultsOf(await profiles.listAvatars(ORG))).toEqual([second.id]);
  });

  it('имя и вид правятся одной записью, пустое имя — это «без имени»', async () => {
    const { profiles } = harness();
    const avatar = await profiles.createAvatar(ORG, USER, { name: 'Алексей' });

    await profiles.updateAvatar(ORG, USER, avatar.id, { name: '   ' });
    expect((await profiles.listAvatars(ORG))[0].name).toBeNull();

    await profiles.updateAvatar(ORG, USER, avatar.id, { kind: 'BRAND' });
    expect((await profiles.listAvatars(ORG))[0].kind).toBe('BRAND');
  });
});

describe('удаление аватара и то, кто пишет после него', () => {
  it('единственный аватар удаляется, и пространство остаётся без аватара', async () => {
    const { prisma, profiles } = harness();
    const only = await profiles.createAvatar(ORG, USER, {});
    analyse(prisma, only.id);

    const result = await profiles.deleteAvatar(ORG, USER, only.id);

    expect(result.successorId).toBeNull();
    expect(await profiles.listAvatars(ORG)).toEqual([]);
  });

  it('удаление основного без названного наследника отказано', async () => {
    const { prisma, profiles } = harness();
    const first = await profiles.createAvatar(ORG, USER, {});
    analyse(prisma, first.id);
    const second = await profiles.createAvatar(ORG, USER, {});
    analyse(prisma, second.id);

    await expect(
      profiles.deleteAvatar(ORG, USER, first.id)
    ).rejects.toMatchObject({ code: 'SUCCESSOR_REQUIRED' });
    expect(idsOf(await profiles.listAvatars(ORG))).toContain(first.id);
  });

  it('наследник без разбора отказан по той же причине, что и назначение вручную', async () => {
    const { prisma, profiles } = harness();
    const first = await profiles.createAvatar(ORG, USER, {});
    analyse(prisma, first.id);
    const blank = await profiles.createAvatar(ORG, USER, {});
    const writer = await profiles.createAvatar(ORG, USER, {});
    analyse(prisma, writer.id);

    await expect(
      profiles.deleteAvatar(ORG, USER, first.id, blank.id)
    ).rejects.toMatchObject({ code: 'AVATAR_NOT_ANALYSED' });
  });

  it('удаление и передача умолчания — одна запись, а не две', async () => {
    const { prisma, profiles } = harness();
    const first = await profiles.createAvatar(ORG, USER, {});
    analyse(prisma, first.id);
    const second = await profiles.createAvatar(ORG, USER, {});
    analyse(prisma, second.id);

    const result = await profiles.deleteAvatar(ORG, USER, first.id, second.id);

    expect(result.successorId).toBe(second.id);
    const left = await profiles.listAvatars(ORG);
    expect(idsOf(left)).toEqual([second.id]);
    expect(defaultsOf(left)).toEqual([second.id]);
  });

  it('удаление не основного не трогает того, кто пишет', async () => {
    const { prisma, profiles } = harness();
    const first = await profiles.createAvatar(ORG, USER, {});
    analyse(prisma, first.id);
    const second = await profiles.createAvatar(ORG, USER, {});
    analyse(prisma, second.id);

    await profiles.deleteAvatar(ORG, USER, second.id);

    expect(defaultsOf(await profiles.listAvatars(ORG))).toEqual([first.id]);
  });

  it('версии переживают удаление: публикации ссылаются на них', async () => {
    const { prisma, profiles } = harness();
    const only = await profiles.createAvatar(ORG, USER, {});
    const version = analyse(prisma, only.id);

    await profiles.deleteAvatar(ORG, USER, only.id);

    expect(
      prisma.model.projectBrandProfileVersion.findMany({
        where: { organizationId: ORG, id: version.id },
      })
    ).toHaveLength(1);
  });

  it('работа, ещё ссылающаяся на версию аватара, останавливает удаление', async () => {
    const { prisma, profiles } = harness();
    const first = await profiles.createAvatar(ORG, USER, {});
    const version = analyse(prisma, first.id);
    prisma.model.autoPost.create({
      data: {
        organizationId: ORG,
        brandProfileVersionId: version.id,
        workflowVersion: 2,
        active: true,
        deletedAt: null,
      },
    });

    await expect(
      profiles.deleteAvatar(ORG, USER, first.id)
    ).rejects.toMatchObject({ code: 'DEPENDENCIES_ACTIVE' });
  });

  it('чужая работа не мешает: зависимость считается по версиям этого аватара', async () => {
    const { prisma, profiles } = harness();
    const first = await profiles.createAvatar(ORG, USER, {});
    analyse(prisma, first.id);
    const second = await profiles.createAvatar(ORG, USER, {});
    const busy = analyse(prisma, second.id, 2);
    prisma.model.autoPost.create({
      data: {
        organizationId: ORG,
        brandProfileVersionId: busy.id,
        workflowVersion: 2,
        active: true,
        deletedAt: null,
      },
    });

    // Занята версия второго аватара, а удаляется первый: его собственных
    // версий эта работа не касается, и отказ был бы отказом не по адресу.
    const result = await profiles.deleteAvatar(ORG, USER, first.id, second.id);

    expect(result).toMatchObject({ deleted: true, successorId: second.id });
  });
});
