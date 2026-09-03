'use strict';

const { hashSync } = require('bcrypt');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const { AuthService } = loadTypeScriptModule(
  'libraries/helpers/src/auth/auth.service.ts'
);

test('long passwords that differ after bcrypt byte 72 do not collide', () => {
  const sharedFirst72Bytes = `${'Ж'.repeat(35)}1!`;
  expect(Buffer.byteLength(sharedFirst72Bytes, 'utf8')).toBe(72);
  const first = `${sharedFirst72Bytes}A`;
  const second = `${sharedFirst72Bytes}B`;

  const hash = AuthService.hashPassword(first);

  expect(AuthService.comparePassword(first, hash)).toBe(true);
  expect(AuthService.comparePassword(second, hash)).toBe(false);
  expect(hash).toMatch(/^cf\$bcrypt-sha256\$v1\$/);
});

test('a password at byte 72 cannot authenticate with an added suffix', () => {
  const exactly72Bytes = `${'Ж'.repeat(35)}1!`;
  expect(Buffer.byteLength(exactly72Bytes, 'utf8')).toBe(72);

  const hash = AuthService.hashPassword(exactly72Bytes);

  expect(hash).toMatch(/^cf\$bcrypt-sha256\$v1\$/);
  expect(AuthService.comparePassword(exactly72Bytes, hash)).toBe(true);
  expect(AuthService.comparePassword(`${exactly72Bytes}A`, hash)).toBe(false);
});

test('short passwords keep the existing bcrypt storage format', () => {
  const password = 'Пароль1!';
  expect(Buffer.byteLength(password, 'utf8')).toBeLessThanOrEqual(72);

  const hash = AuthService.hashPassword(password);

  expect(hash).toMatch(/^\$2[aby]\$/);
  expect(AuthService.comparePassword(password, hash)).toBe(true);
  expect(AuthService.comparePassword('Wrong1!', hash)).toBe(false);
});

test('an existing unprefixed bcrypt hash still verifies without migration', () => {
  const password = 'Legacy1!';
  const legacyHash = hashSync(password, 10);

  expect(AuthService.comparePassword(password, legacyHash)).toBe(true);
  expect(AuthService.comparePassword('Wrong1!', legacyHash)).toBe(false);
});
