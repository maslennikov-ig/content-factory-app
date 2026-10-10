'use strict';

const { sign } = require('jsonwebtoken');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const { AuthService: Tokens } = loadWithMocks('libraries/helpers/src/auth/auth.service.ts');
const stubs = {
  '@contentfactory/nestjs-libraries/database/prisma/users/users.service': { UsersService: class {} },
  '@contentfactory/nestjs-libraries/database/prisma/organizations/organization.service': { OrganizationService: class {} },
  '@contentfactory/nestjs-libraries/database/prisma/notifications/notification.service': { NotificationService: class {} },
  '@contentfactory/nestjs-libraries/services/email.service': { EmailService: class {} },
  '@contentfactory/backend/services/auth/providers/providers.manager': { AuthProviderManager: class {} },
  '@contentfactory/backend/services/auth/identity-confirmation': {},
  '@contentfactory/backend/services/newsletter/newsletter-delivery-retry.service.v1': { NewsletterDeliveryRetryServiceV1: class {} },
  '@contentfactory/nestjs-libraries/database/prisma/public-growth/public-growth.service': { PublicGrowthService: class {} },
  '@contentfactory/nestjs-libraries/integrations/telegram.updates.service': { TelegramUpdatesService: class {} },
  '@contentfactory/nestjs-libraries/throttler/registration-limiter': { RegistrationFormRefusal: class extends Error {} },
  '@contentfactory/nestjs-libraries/redis/redis.service': { ioRedis: {} },
};
const { AuthService } = loadWithMocks('apps/backend/src/services/auth/auth.service.ts', stubs);
const { AuthMiddleware } = loadWithMocks('apps/backend/src/services/auth/auth.middleware.ts', stubs);
const { UsersRepository } = loadWithMocks('libraries/nestjs-libraries/src/database/prisma/users/users.repository.ts', {
  '@contentfactory/nestjs-libraries/database/prisma/prisma.service': { PrismaRepository: class {}, PrismaTransaction: class {} },
});
const secretBefore = process.env.JWT_SECRET;
beforeAll(() => { process.env.JWT_SECRET = 'synthetic-access-test-secret-never-live'; });
afterAll(() => { if (secretBefore === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = secretBefore; });

const user = () => ({ id: 'synthetic-user', email: 'synthetic@example.invalid', activated: true, providerName: 'LOCAL', password: 'synthetic-old-hash' });
function fixture() {
  const current = user();
  const updates = [];
  const tx = {
    userIdentity: { findFirst: async () => ({ provider: 'LOCAL' }) },
    user: {
      update: async ({ data }) => { Object.assign(current, data); return { ...current }; },
      updateMany: async ({ where, data }) => {
        updates.push(where);
        if (current.id !== where.id || current.password !== where.password) return { count: 0 };
        Object.assign(current, data);
        return { count: 1 };
      },
    },
  };
  const repository = new UsersRepository({}, { model: { $transaction: fn => fn(tx) } });
  // Use the real repository's password CAS, with an in-memory adapter only.
  const users = {
    getUserByEmail: async () => ({ ...current }), getUserById: async () => ({ ...current }),
    hasLocalSignIn: async () => true,
    updatePassword: (...args) => repository.updatePassword(...args),
    activateUser: async () => { current.activated = true; },
  };
  const messages = [];
  const auth = new AuthService(users, {}, { sendEmail: async (...args) => messages.push(args) }, {}, {}, {}, {}, {});
  const session = new AuthMiddleware({ getOrgsByUserId: async () => [{ id: 'a', apiKey: 'inert', users: [{ disabled: false }] }] }, users);
  const runSession = async token => {
    const next = jest.fn();
    await session.use({ method: 'GET', headers: { auth: token }, cookies: {} }, {}, next);
    expect(next).toHaveBeenCalledTimes(1);
  };
  const resetLink = async () => {
    await auth.forgot(current.email);
    return messages.at(-1)[2].match(/\/auth\/forgot\/([^"<\s]+)/)[1];
  };
  return { auth, current, updates, runSession, resetLink };
}

test('new sessions and old full-user sessions work, including after password changes', async () => {
  const f = fixture();
  const legacy = Tokens.signJWT({ ...user(), password: undefined });
  await f.runSession(legacy);
  const issued = await f.auth.jwt({ ...user() });
  expect(Tokens.verifyJWT(issued).purpose).toBe('session');
  await f.runSession(issued);
  f.current.password = 'changed-by-own-account';
  await f.runSession(legacy);
  await f.runSession(issued);
});

test('reset, expired old reset, activation and unrelated signed tokens never authenticate sessions', async () => {
  const f = fixture();
  for (const token of [
    await f.resetLink(),
    Tokens.signJWT({ id: user().id, expires: '2000-01-01 00:00:00' }),
    Tokens.signJWT({ ...user(), password: undefined, activated: false }),
    Tokens.signJWT({ id: user().id }),
    sign({ ...user(), purpose: 'activation' }, process.env.JWT_SECRET),
    sign({ ...user(), purpose: 'session', exp: 1 }, process.env.JWT_SECRET),
  ]) await expect(f.runSession(token)).rejects.toThrow();
});

test('reset has standard expiry and purpose; successful reset fences reuse and concurrent use', async () => {
  const f = fixture();
  const token = await f.resetLink();
  const payload = Tokens.verifyJWT(token);
  expect(payload.purpose).toBe('password_reset');
  expect(payload.exp - payload.iat).toBe(20 * 60);
  const result = await Promise.all([1, 2].map(() => f.auth.forgotReturn({ token, password: 'New-safe-password-1!' })));
  expect(result.filter(Boolean)).toHaveLength(1);
  expect(f.updates.every(where => where.password === 'synthetic-old-hash')).toBe(true);
  expect(await f.auth.forgotReturn({ token, password: 'Other-password-2!' })).toBe(false);
  await expect(f.runSession(token)).rejects.toThrow();
});

test('expired, wrong-purpose, malformed, legacy resets and password-change stale links cannot change a password', async () => {
  const f = fixture();
  const token = await f.resetLink();
  const payload = Tokens.verifyJWT(token);
  const cases = [
    sign({ ...payload, exp: 1 }, process.env.JWT_SECRET),
    Tokens.signJWT({ ...user(), password: undefined }),
    Tokens.signJWT({ id: user().id, expires: '2999-01-01 00:00:00' }),
    'invalid',
  ];
  for (const invalid of cases) expect(await f.auth.forgotReturn({ token: invalid, password: 'New-safe-password-1!' })).toBe(false);
  expect(f.current.password).toBe('synthetic-old-hash');
  f.current.password = 'changed-by-own-account';
  expect(await f.auth.forgotReturn({ token, password: 'New-safe-password-1!' })).toBe(false);
  expect(f.updates).toEqual([]);
});

test('activation grants a fresh session only once and a session cannot activate an account', async () => {
  const f = fixture();
  f.current.activated = false;
  const activation = await f.auth.jwt({ ...f.current });
  expect(Tokens.verifyJWT(activation).purpose).toBe('activation');
  await expect(f.runSession(activation)).rejects.toThrow();
  const session = await f.auth.activate(activation);
  expect(Tokens.verifyJWT(session).purpose).toBe('session');
  await f.runSession(session);
  expect(await f.auth.activate(activation)).toBe(false);
  expect(await f.auth.activate(session)).toBe(false);
});
