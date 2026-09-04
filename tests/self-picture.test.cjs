'use strict';

/**
 * Загруженная фотография доходит до рельса.
 *
 * Аватар в левом нижнем углу спрашивал `user.picture.path`, а `/user/self`
 * собирался из `getUserById`, который читал строку пользователя без связанной
 * картинки. Поле всегда было `undefined`, и человек с загруженной фотографией
 * вечно видел букву. Ошибку нашла рецензия 04.09.2026, сразу после того как
 * аватар появился.
 *
 * Здесь держится связка целиком: запрос просит картинку, а сборка ответа
 * `/user/self` её не срезает.
 */

const fs = require('node:fs');
const path = require('node:path');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const REPO = path.resolve(__dirname, '..');

const { UsersRepository } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/database/prisma/users/users.repository.ts'
);

describe('getUserById просит картинку профиля', () => {
  it('передаёт Prisma выборку картинки вместе со строкой пользователя', async () => {
    const calls = [];
    const repository = new UsersRepository(
      {
        model: {
          user: {
            findFirst: async (args) => {
              calls.push(args);
              return null;
            },
          },
        },
      },
      { model: {} }
    );

    await repository.getUserById('user-1');

    expect(calls).toHaveLength(1);
    expect(calls[0].where).toEqual({ id: 'user-1' });
    expect(calls[0].include).toEqual({
      picture: { select: { id: true, path: true } },
    });
  });
});

describe('/user/self не срезает картинку', () => {
  it('ответ раскрывает пользователя целиком, а не перечисляет поля', () => {
    const source = fs.readFileSync(
      path.join(REPO, 'apps/backend/src/api/routes/users.controller.ts'),
      'utf8'
    );
    const self = source.slice(source.indexOf("@Get('/self')"));
    const body = self.slice(0, self.indexOf("@Get('/personal')"));

    expect(body).toContain('...user');
    // Ни одной сборки, которая перечисляла бы поля пользователя поимённо:
    // такая сборка молча теряет всё новое, и картинку она потеряла бы первой.
    expect(body).not.toMatch(/email:\s*user\.email/);
  });
});

describe('тип пользователя во фронтенде знает про картинку', () => {
  it('контекст объявляет picture, и рельс не приводит его к any', () => {
    const context = fs.readFileSync(
      path.join(REPO, 'apps/frontend/src/components/layout/user.context.tsx'),
      'utf8'
    );
    expect(context).toContain('picture');

    const sidebar = fs.readFileSync(
      path.join(REPO, 'apps/frontend/src/components/new-layout/sidebar.tsx'),
      'utf8'
    );
    expect(sidebar).not.toContain('(user as any)?.picture');
  });
});
