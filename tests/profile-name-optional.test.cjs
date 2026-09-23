'use strict';
/**
 * `content-factory-next-fn33.96`. Регистрация имени не спрашивает, а профиль
 * требовал три символа: аккаунт без имени не мог сохранить даже картинку, пока
 * не выдумывал имя. Имя необязательно; пустое — очищает колонку, и подпись
 * берётся из адреса, как уже делает `displayName`.
 */
const fs = require('node:fs');
const path = require('node:path');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const load = () =>
  loadTypeScriptModule('libraries/nestjs-libraries/src/dtos/users/user.details.dto.ts', {
    '@contentfactory/nestjs-libraries/dtos/media/media.dto': { MediaDto: class MediaDto {} },
  });

test('a profile without a name is valid', async () => {
  const { UserDetailDto } = load();
  const { validate } = require('class-validator');
  expect(await validate(Object.assign(new UserDetailDto(), { bio: '' }))).toEqual([]);
  expect(await validate(Object.assign(new UserDetailDto(), { fullname: '' }))).toEqual([]);
  expect(await validate(Object.assign(new UserDetailDto(), { fullname: 'Ян' }))).toEqual([]);
});

test('a name is still a bounded string', async () => {
  const { UserDetailDto } = load();
  const { validate } = require('class-validator');
  const tooLong = await validate(
    Object.assign(new UserDetailDto(), { fullname: 'x'.repeat(101) })
  );
  expect(tooLong).toEqual(
    expect.arrayContaining([expect.objectContaining({ property: 'fullname' })])
  );
  const notAString = await validate(Object.assign(new UserDetailDto(), { fullname: 42 }));
  expect(notAString).toEqual(
    expect.arrayContaining([expect.objectContaining({ property: 'fullname' })])
  );
});

test('the repository clears the column on an empty name instead of writing spaces', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'libraries/nestjs-libraries/src/database/prisma/users/users.repository.ts'),
    'utf8'
  );
  expect(source).toContain("name: body.fullname?.trim() || null,");
  expect(source).not.toContain('name: body.fullname,');
});

/**
 * `content-factory-next-97dq.51`. Фамилия, «коротко о себе» и часовой пояс
 * жили у `User` с самого форка и нигде не редактировались. Дверь та же —
 * `POST /user/personal`, схема не меняется.
 */
describe('the rest of the profile travels through the same door', () => {
  test('last name, bio and time zone are validated, and all three are optional', async () => {
    const { UserDetailDto } = load();
    const { validate } = require('class-validator');
    const make = (values) => Object.assign(new UserDetailDto(), values);

    expect(await validate(make({}))).toEqual([]);
    expect(
      await validate(make({ lastName: 'Иванов', bio: 'Пишу о кофе.', timezone: 180 }))
    ).toEqual([]);
    expect(await validate(make({ timezone: -720 }))).toEqual([]);
    expect(await validate(make({ timezone: 840 }))).toEqual([]);

    const properties = async (values) =>
      (await validate(make(values))).map((error) => error.property);
    expect(await properties({ lastName: 'x'.repeat(101) })).toContain('lastName');
    expect(await properties({ bio: 'x'.repeat(501) })).toContain('bio');
    expect(await properties({ timezone: 841 })).toContain('timezone');
    expect(await properties({ timezone: -721 })).toContain('timezone');
    expect(await properties({ timezone: 3.5 })).toContain('timezone');
    expect(await properties({ timezone: 'Europe/Moscow' })).toContain('timezone');
  });

  test('the repository reads and writes them, and leaves what an old client did not send', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'libraries/nestjs-libraries/src/database/prisma/users/users.repository.ts'),
      'utf8'
    );
    const read = source.slice(
      source.indexOf('async getPersonal('),
      source.indexOf('async changePersonal(')
    );
    expect(read).toContain('lastName: true,');
    expect(read).toContain('timezone: true,');

    const write = source.slice(source.indexOf('async changePersonal('));
    expect(write).toContain('? { lastName: body.lastName.trim() || null }');
    expect(write).toContain(
      '...(body.timezone !== undefined ? { timezone: body.timezone } : {}),'
    );
  });
});
