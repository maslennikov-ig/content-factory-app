'use strict';

/**
 * Одно имя человека на весь продукт.
 *
 * Владелец ввёл имя в профиле и не увидел его нигде: 04.09.2026 список команды
 * подписывал строки «Maslennikov» и «Maslennikovig», левый нижний угол рельса
 * показывал адрес, а комментарии резали адрес по-своему, третьим способом.
 * Имя лежало в базе — его просто никто не спрашивал, и три экрана независимо
 * друг от друга выводили подпись из электронной почты.
 *
 * Здесь держится сама функция: имя из профиля выигрывает всегда, подстановка
 * из адреса остаётся ровно той, что была в списке команды, и ни один экран
 * больше не пишет свою.
 */

const fs = require('node:fs');
const path = require('node:path');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const REPO = path.resolve(__dirname, '..');
const MODULE = 'libraries/react-shared-libraries/src/helpers/display-name.ts';

const { displayName } = loadTypeScriptModule(MODULE);

describe('displayName: имя из профиля выигрывает', () => {
  it('берёт имя, когда оно введено', () => {
    expect(
      displayName({
        name: 'Игорь Масленников',
        email: 'maslennikov.ig@example.com',
      })
    ).toBe('Игорь Масленников');
  });

  it('пробелы по краям — не имя', () => {
    expect(
      displayName({ name: '   ', email: 'maslennikov.ig@example.com' })
    ).toBe('Maslennikov');
    expect(displayName({ name: '  Игорь  ', email: 'a@b.c' })).toBe('Игорь');
  });

  it('пустое и отсутствующее имя падают на подстановку из адреса', () => {
    expect(
      displayName({ name: null, email: 'maslennikov.ig@example.com' })
    ).toBe('Maslennikov');
    expect(displayName({ email: 'maslennikovig@example.com' })).toBe(
      'Maslennikovig'
    );
  });

  it('без адреса и без имени возвращает пустую строку, а не «undefined»', () => {
    expect(displayName({})).toBe('');
    expect(displayName({ name: '', email: '' })).toBe('');
    expect(displayName(undefined)).toBe('');
  });

  it('адрес без собаки остаётся собой', () => {
    expect(displayName({ email: 'root' })).toBe('Root');
  });
});

describe('initialOf: одна буква для заглушки аватара', () => {
  const { initialOf } = loadTypeScriptModule(MODULE);

  it('берёт первую букву отображаемого имени', () => {
    expect(initialOf({ name: 'Игорь', email: 'x@y.z' })).toBe('И');
    expect(initialOf({ email: 'maslennikov.ig@example.com' })).toBe('M');
  });

  it('пусто — значит пусто, а не «U»', () => {
    expect(initialOf({})).toBe('');
  });
});

describe('копий этой функции больше нет', () => {
  const FILES = [
    'apps/frontend/src/components/settings/teams.component.tsx',
    'apps/frontend/src/components/launches/comments/comment.component.tsx',
    'apps/frontend/src/components/new-layout/sidebar.tsx',
    'apps/frontend/src/components/admin/admin-users.component.tsx',
  ];

  it.each(FILES)('%s не выводит подпись из адреса сам', (file) => {
    const source = fs.readFileSync(path.join(REPO, file), 'utf8');
    expect(source).not.toMatch(/split\(['"]@['"]\)/);
  });

  it.each(FILES)('%s спрашивает общую функцию', (file) => {
    const source = fs.readFileSync(path.join(REPO, file), 'utf8');
    expect(source).toContain('@contentfactory/react/helpers/display-name');
  });
});

describe('бэкенд отдаёт имя вместе с адресом', () => {
  it('getTeam выбирает name', () => {
    const source = fs.readFileSync(
      path.join(
        REPO,
        'libraries/nestjs-libraries/src/database/prisma/organizations/organization.repository.ts'
      ),
      'utf8'
    );
    const fromGetTeam = source.slice(source.indexOf('async getTeam('));
    const body = fromGetTeam.slice(0, fromGetTeam.indexOf('getAllUsersOrgs('));
    expect(body).toContain('name: true');
    expect(body).toContain('email: true');
  });
});
