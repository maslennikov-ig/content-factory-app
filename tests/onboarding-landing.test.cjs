'use strict';

/**
 * `content-factory-next-2q28.12`. After an administrator approved her
 * account, a first-time blogger signed in and landed on an empty calendar —
 * while the auto-approved registration already landed on «С чего начать».
 * The root landing now sends the founder of a workspace whose path is still
 * open to `/onboarding`. Invited members and finished workspaces land where
 * they always did, and only the root asks.
 */

const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const ADAPTER = 'apps/frontend/src/components/onboarding/onboarding.adapter.ts';
const adapter = loadTypeScriptModule(ADAPTER);

const open = { ...adapter.EMPTY_PROGRESS, channels: 1 };
const finished = {
  ...adapter.EMPTY_PROGRESS,
  avatars: 1,
  channels: 1,
  pieces: 1,
  adaptations: 1,
  scheduled: 1,
};

describe('the landing rule', () => {
  test('a founder with an open path starts on «С чего начать»', () => {
    expect(adapter.signedInLanding({ ...open, founder: true })).toBe(
      '/onboarding'
    );
  });

  test('a finished workspace and an invited member keep the usual landing', () => {
    expect(adapter.signedInLanding({ ...finished, founder: true })).toBeNull();
    expect(adapter.signedInLanding({ ...open, founder: false })).toBeNull();
  });

  test('an answer without the field is not a founder', () => {
    expect(adapter.readProgress({ channels: 1 }).founder).toBe(false);
    expect(adapter.readProgress({ founder: 'yes' }).founder).toBe(false);
    expect(adapter.readProgress({ founder: true }).founder).toBe(true);
  });
});

function loadProxy() {
  return loadTypeScriptModule(
    'apps/frontend/src/proxy.ts',
    {
      'next/server': {
        NextResponse: {
          next: () => ({ type: 'next', cookies: { set: () => undefined } }),
          redirect: (url) => ({
            type: 'redirect',
            url: String(url),
            cookies: { set: () => undefined },
          }),
        },
      },
      '@contentfactory/helpers/subdomain/subdomain.management': {
        getCookieUrlFromDomain: () => 'localhost',
      },
      '@contentfactory/react/translation/i18n.config': {
        cookieName: 'i18next',
        headerName: 'x-i18next-current-language',
        languageFromBcp47: () => 'en',
        languageTags: ['en'],
        languages: ['en'],
      },
    },
    {
      sources: {
        '@contentfactory/frontend/components/onboarding/onboarding.adapter':
          ADAPTER,
      },
    }
  );
}

const signedIn = (pathname, extra = {}) => ({
  nextUrl: new URL(`http://localhost:4200${pathname}`),
  cookies: {
    get: (name) =>
      name === 'auth'
        ? { value: 'signed-token' }
        : extra[name] !== undefined
        ? { value: extra[name] }
        : undefined,
  },
  headers: new Headers(),
});

describe('the root landing after sign-in', () => {
  const saved = {
    fetch: global.fetch,
    backend: process.env.BACKEND_INTERNAL_URL,
    general: process.env.IS_GENERAL,
  };
  let calls;
  let answer;

  beforeEach(() => {
    calls = [];
    answer = () => ({ ok: true, json: async () => ({ ...open, founder: true }) });
    process.env.BACKEND_INTERNAL_URL = 'http://backend.invalid';
    process.env.IS_GENERAL = 'true';
    global.fetch = async (url, options) => {
      calls.push({ url, options });
      return answer();
    };
  });

  afterEach(() => {
    global.fetch = saved.fetch;
    for (const [key, value] of [
      ['BACKEND_INTERNAL_URL', saved.backend],
      ['IS_GENERAL', saved.general],
    ]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  test('a founder with an open path lands on /onboarding', async () => {
    const result = await loadProxy().proxy(signedIn('/', { showorg: 'org-1' }));
    expect(result).toMatchObject({
      type: 'redirect',
      url: 'http://localhost:4200/onboarding',
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('http://backend.invalid/onboarding/progress');
    expect(calls[0].options.headers).toMatchObject({
      auth: 'signed-token',
      showorg: 'org-1',
    });
  });

  test.each([
    ['an invited member', () => ({ ok: true, json: async () => ({ ...open, founder: false }) })],
    ['a finished workspace', () => ({ ok: true, json: async () => ({ ...finished, founder: true }) })],
    ['a refused request', () => ({ ok: false, json: async () => ({}) })],
    ['an unreachable backend', () => { throw new Error('down'); }],
  ])('%s lands on the calendar', async (_name, reply) => {
    answer = reply;
    await expect(loadProxy().proxy(signedIn('/'))).resolves.toMatchObject({
      type: 'redirect',
      url: 'http://localhost:4200/launches',
    });
  });

  test('an ordinary navigation never asks', async () => {
    await expect(
      loadProxy().proxy(signedIn('/launches'))
    ).resolves.toMatchObject({ type: 'next' });
    expect(calls).toEqual([]);
  });

  test('an impersonating operator is left alone', async () => {
    await expect(
      loadProxy().proxy(signedIn('/', { impersonate: 'user-2' }))
    ).resolves.toMatchObject({ url: 'http://localhost:4200/launches' });
    expect(calls).toEqual([]);
  });
});

describe('who founded the workspace', () => {
  const repositoryModule = loadTypeScriptModule(
    'libraries/nestjs-libraries/src/database/prisma/onboarding/onboarding.repository.ts',
    {
      '@nestjs/common': { Injectable: () => (target) => target },
      '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
        PrismaRepository: class PrismaRepository {},
      },
    }
  );

  test('is the oldest membership, since the founder and an invited admin share ADMIN', async () => {
    const findFirst = jest.fn().mockResolvedValue({ userId: 'user-1' });
    const repository = new repositoryModule.OnboardingRepository({
      model: { userOrganization: { findFirst } },
    });
    await expect(repository.founderId('org-1')).resolves.toBe('user-1');
    expect(findFirst).toHaveBeenCalledWith({
      where: { organizationId: 'org-1' },
      orderBy: { createdAt: 'asc' },
      select: { userId: true },
    });
  });
});
