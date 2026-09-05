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
