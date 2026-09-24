'use strict';

/**
 * Only a reader fills the brief's audience from the avatar
 * (`content-factory-next-97dq.54`).
 */

const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const { avatarReader, avatarAudienceLine } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/intake/avatar-audience.ts'
);

const STAND =
  'Автор обращается к подписчикам напрямую, преимущественно на «вы»: «Друзья, привет!», «Только для вас, моих дорогих искателей бизнес-сокровищ». В отдельных призывах использует «ты»: «Читай статью прямо сейчас → [ссылка]».';

test('the stand’s voice line — cut label plus sentence — is read once and is not a reader', () => {
  const item = { name: STAND.slice(0, 120), need: STAND };
  expect(avatarAudienceLine(item)).toBe(STAND);
  expect(avatarReader(item)).toBeNull();
});

test('a real reader stays: a label, a label with its need, or one short line', () => {
  expect(avatarReader({ name: 'Руководители небольших продуктовых команд' })).toBe(
    'Руководители небольших продуктовых команд'
  );
  expect(
    avatarReader({ name: 'владельцы небольших студий', need: 'которые ведут канал сами' })
  ).toBe('владельцы небольших студий — которые ведут канал сами');
  expect(
    avatarReader({ name: 'Founders of small studios', need: 'Founders of small studios' })
  ).toBe('Founders of small studios');
});

test('placeholders, descriptions of address and long texts leave the field open', () => {
  expect(avatarReader({ name: 'Аудитория организации' })).toBeNull();
  expect(avatarReader({ name: 'Подписчики, к которым автор обращается на «ты»' })).toBeNull();
  expect(avatarReader({ name: 'The author addresses readers by first name' })).toBeNull();
  expect(avatarReader({ name: 'Руководители. Они читают по утрам.' })).toBeNull();
  expect(avatarReader({ name: 'x'.repeat(161) })).toBeNull();
  expect(avatarReader(null)).toBeNull();
  expect(avatarReader({})).toBeNull();
});
