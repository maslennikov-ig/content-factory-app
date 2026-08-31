'use strict';

require('reflect-metadata');

/**
 * A refusal from the older repository has to arrive as a refusal, not as a 500.
 *
 * `VoiceProfileRepository` sits on top of `BrandProfileRepository`, and that
 * one throws `BrandProfileRepositoryError` — an error carrying `code` but no
 * `status`. `safeHttpError` in the controllers only maps errors carrying both,
 * so an unconverted one reaches the caller as a bare «Internal server error»
 * with nothing the screen can branch on. The section's own contract says the
 * opposite: every refusal names itself.
 *
 * The two that reach a person are `REVISION_CONFLICT` — two restores or two
 * activations racing each other, which is an ordinary thing for two open tabs
 * to do — and `VERSION_UNAVAILABLE`, which is the digest check refusing a row
 * that no longer matches its own content.
 *
 * Found by the live pass of `content-factory-next-vme.5`, first from a
 * data-preparation mistake and then reproduced on purpose.
 */

const fs = require('node:fs');
const path = require('node:path');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const repositoryRoot = path.resolve(__dirname, '..');
const voiceBase =
  'libraries/nestjs-libraries/src/content-intelligence/brand-voice';
const profileBase =
  'libraries/nestjs-libraries/src/content-intelligence/brand-profile';

const relativeSources = () => {
  const map = {};
  for (const file of fs.readdirSync(path.join(repositoryRoot, voiceBase))) {
    if (!file.endsWith('.ts')) continue;
    map[`./${file.replace(/\.ts$/u, '')}`] = `${voiceBase}/${file}`;
  }
  return map;
};

const sources = {
  ...relativeSources(),
  '@contentfactory/nestjs-libraries/content-intelligence/brand-profile/brand-profile.types': `${profileBase}/brand-profile.types.ts`,
  '@contentfactory/nestjs-libraries/content-intelligence/brand-profile/brand-profile.validation': `${profileBase}/brand-profile.validation.ts`,
  '@contentfactory/nestjs-libraries/content-intelligence/brand-profile/brand-profile.repository': `${profileBase}/brand-profile.repository.ts`,
  '@contentfactory/nestjs-libraries/content-intelligence/contracts':
    'libraries/nestjs-libraries/src/content-intelligence/contracts.ts',
};

const prismaMocks = {
  '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
    PrismaRepository: class PrismaRepository {},
    PrismaTransaction: class PrismaTransaction {},
  },
};

const { VoiceProfileRepository } = loadTypeScriptModule(
  `${voiceBase}/voice-profile.repository.ts`,
  prismaMocks,
  { sources }
);
const { isVoiceError } = loadTypeScriptModule(
  `${voiceBase}/voice-errors.ts`,
  {},
  { sources }
);
const { BrandProfileRepositoryError } = loadTypeScriptModule(
  `${profileBase}/brand-profile.types.ts`,
  {},
  { sources }
);
const contract = loadTypeScriptModule(
  `${voiceBase}/voice-wiring.contract.ts`,
  {},
  { sources }
);

const ORGANIZATION = 'org-1';
const ACTOR = 'user-1';
const VERSION = 'version-1';

// Content that passes `validateBrandProfileContent(..., { forActivation: true })`
// on its own: this suite is about conflicts and error passthrough underneath
// `cloneVersion`/`activateVersion`, not about content completeness (vme.12),
// and a mock missing `content` entirely would be refused by the new
// completeness check before either mocked call is ever reached.
const version = {
  id: VERSION,
  revision: 3,
  contentDigest: 'digest-1',
  status: 'PUBLISHED',
  content: {
    project: {
      name: 'Голос бренда',
      oneLineDescription: 'Тестовое содержимое версии.',
      offerings: [],
      audiences: [{ name: 'Аудитория' }],
      contentGoals: ['Публикации'],
    },
    voice: {
      defaultLanguage: 'ru',
      allowedLanguages: ['ru', 'en'],
      traits: [{ name: 'Кто говорит', guidance: 'Тестовая черта.' }],
      pointOfView: 'company_we',
      formality: 'neutral',
      emojiPolicy: 'restrained',
      hashtagPolicy: 'none',
    },
    lexicon: { preferred: [], avoid: [] },
    guardrails: { prohibitedTopics: [], prohibitedClaims: [], requiredPhrases: [] },
    examples: [],
    platformOverrides: [],
  },
};

/**
 * The old repository, reduced to the two calls this suite is about: it finds
 * the version, and then it refuses.
 */
function profilesRefusing(code, on) {
  const refuse = (name) => async () => {
    if (name === on) throw new BrandProfileRepositoryError(code, { versionId: VERSION });
    return { ...version, id: `${VERSION}-clone` };
  };
  return {
    getVersion: async () => ({ ...version }),
    cloneVersion: refuse('clone'),
    activateVersion: async (...args) => {
      if (on === 'activate') {
        throw new BrandProfileRepositoryError(code, { versionId: VERSION });
      }
      return { version: { ...version } , ...args };
    },
  };
}

const build = (profiles) =>
  new VoiceProfileRepository(profiles, { model: {} });

async function refusalFrom(call) {
  try {
    await call();
  } catch (error) {
    return error;
  }
  throw new Error('the call was expected to refuse and did not');
}

describe('a conflict underneath arrives as a refusal the screen can read', () => {
  test('the contract carries a code for it, on a status that is not 500', () => {
    const entry = contract.VOICE_ERROR_CODES.VOICE_VERSION_CONFLICT;
    expect(entry).toBeDefined();
    expect(entry.status).toBe(409);
    expect(entry.screenState).toBe('error');
  });

  test('restoring against a moved version says which version moved', async () => {
    const error = await refusalFrom(() =>
      build(profilesRefusing('REVISION_CONFLICT', 'clone')).restoreAsNewVersion(
        ORGANIZATION,
        ACTOR,
        VERSION
      )
    );

    expect(isVoiceError(error)).toBe(true);
    expect(error.code).toBe('VOICE_VERSION_CONFLICT');
    expect(error.status).toBe(409);
    expect(error.subject).toBe(VERSION);
    // The message is what the person reads, so it has to say something.
    expect(error.message.length).toBeGreaterThan(20);
  });

  test('activation against a moved version refuses the same way', async () => {
    const error = await refusalFrom(() =>
      build(profilesRefusing('REVISION_CONFLICT', 'activate')).activate(
        ORGANIZATION,
        ACTOR,
        VERSION
      )
    );

    expect(isVoiceError(error)).toBe(true);
    expect(error.code).toBe('VOICE_VERSION_CONFLICT');
    expect(error.status).toBe(409);
  });

  test('a version whose content no longer matches its digest is not a 500 either', async () => {
    const error = await refusalFrom(() =>
      build(
        profilesRefusing('VERSION_UNAVAILABLE', 'activate')
      ).activate(ORGANIZATION, ACTOR, VERSION)
    );

    expect(isVoiceError(error)).toBe(true);
    expect(error.status).not.toBe(500);
    expect(contract.VOICE_ERROR_CODES[error.code]).toBeDefined();
  });

  test('an error that is not the old repository’s is left alone', async () => {
    const boom = new Error('the database went away');
    const error = await refusalFrom(() =>
      build({
        getVersion: async () => ({ ...version }),
        cloneVersion: async () => {
          throw boom;
        },
        activateVersion: async () => ({ version }),
      }).restoreAsNewVersion(ORGANIZATION, ACTOR, VERSION)
    );

    // Dressing up an unknown failure as a known refusal would be worse than
    // the 500: it would claim to know what happened.
    expect(error).toBe(boom);
  });
});
