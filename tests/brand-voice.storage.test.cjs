'use strict';

require('reflect-metadata');

/**
 * The corpus, the measurements and the version history, in storage.
 *
 * What is worth proving here is not that rows can be written. It is the four
 * promises the section makes about them: the same text never counts twice, a
 * measurement can still be explained a year later, going back to an old
 * version leaves the history intact, and a deleted sample takes its words with
 * it without silently moving the numbers that were computed from it.
 *
 * The database is in memory. A real one would prove the same things more
 * slowly and would make this suite depend on a container being up.
 */

const fs = require('node:fs');
const path = require('node:path');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const repositoryRoot = path.resolve(__dirname, '..');
const voiceBase =
  'libraries/nestjs-libraries/src/content-intelligence/brand-voice';
const profileBase =
  'libraries/nestjs-libraries/src/content-intelligence/brand-profile';

/**
 * Every sibling of the module under test, so a relative import resolves the
 * way it does at runtime instead of falling through to `require`.
 */
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

const { VoiceSampleRepository, voiceSampleCode } = loadTypeScriptModule(
  `${voiceBase}/voice-sample.repository.ts`,
  prismaMocks,
  { sources }
);
const { VoiceProfileRepository } = loadTypeScriptModule(
  `${voiceBase}/voice-profile.repository.ts`,
  prismaMocks,
  { sources }
);
const { BrandProfileRepository } = loadTypeScriptModule(
  `${profileBase}/brand-profile.repository.ts`,
  prismaMocks,
  { sources }
);
const intake = loadTypeScriptModule(`${voiceBase}/sample-intake.ts`, {}, {
  sources,
});
const analyzer = loadTypeScriptModule(`${voiceBase}/analyzer.ts`, {}, {
  sources,
});
const contract = loadTypeScriptModule(`${voiceBase}/voice-wiring.contract.ts`, {}, {
  sources,
});

/* ---------------------------------------------------------------------- *
 * A database small enough to read
 * ---------------------------------------------------------------------- */

/**
 * The shared fake, not a copy of it.
 *
 * This file carried its own `InMemoryVoicePrisma` — the same class as
 * `tests/helpers/voice-memory-prisma.cjs`, minus the tables it did not need.
 * Two copies means a fix reaches one of them: when `ProjectBrandProfile` stopped
 * being unique per space on 2026-08-25 and profile updates moved to the
 * compound key `organizationId_id`, teaching the helper about compound keys
 * left this file still matching them as a plain field, and every profile update
 * here silently updated nothing.
 */
const {
  InMemoryVoicePrisma,
  clone,
  matches,
  sortRows,
} = require('./helpers/voice-memory-prisma.cjs');


function harness() {
  const prisma = new InMemoryVoicePrisma();
  const samples = new VoiceSampleRepository(
    { model: prisma.model },
    prisma.transaction
  );
  const profiles = new VoiceProfileRepository(
    new BrandProfileRepository({ model: prisma.model }, prisma.transaction),
    { model: prisma.model }
  );
  return { prisma, samples, profiles };
}

/* ---------------------------------------------------------------------- *
 * Corpus fixtures
 * ---------------------------------------------------------------------- */

const PARAGRAPH =
  'Поставщика поменяли — старый срывал сроки. Новый возит по графику, и это видно по журналу смены. ' +
  'На складе стало спокойнее: остатки сходятся, отгрузки не переносим. Разница в том, что теперь ' +
  'мы считаем не на глаз, а по накладным. Никто не обещал чуда, но за месяц накопилось меньше ' +
  'просрочек, чем за прошлый квартал. Что мы поменяли: сначала график, потом приёмку, потом отчёт. ';

const textOf = (seed) => `${seed}. ${PARAGRAPH.repeat(4)}`;

const prepared = (count, options = {}) =>
  intake.prepareSamples(
    Array.from({ length: count }, (unused, index) => ({
      origin: 'PASTE',
      title: `Текст ${index + 1}`,
      text: textOf(`Запись номер ${index + 1}`),
    })),
    {
      usagePurpose: 'OWN_VOICE',
      rightsState: 'OWN_CONTENT',
      language: 'ru',
      ...options,
    }
  ).accepted;

const CONTENT = {
  project: {
    name: 'Контент Фабрика',
    oneLineDescription: 'Публикуем то, что можно проверить.',
    offerings: [],
    audiences: [{ name: 'Мастера участка' }],
    contentGoals: ['Объяснять работу'],
  },
  voice: {
    defaultLanguage: 'ru',
    allowedLanguages: ['ru', 'en'],
    traits: [{ name: 'Кто говорит', guidance: 'Бригадир, от первого лица.' }],
    pointOfView: 'first_person',
    formality: 'conversational',
    emojiPolicy: 'none',
    hashtagPolicy: 'none',
  },
  lexicon: { preferred: [], avoid: [] },
  guardrails: {
    prohibitedTopics: [],
    prohibitedClaims: ['гарантированный результат'],
    requiredPhrases: [],
  },
  examples: [],
  platformOverrides: [],
};

/* ---------------------------------------------------------------------- */

describe('the corpus is stored once per text and once per tenant', () => {
  test('a sample written twice is stored once, and the second is named a duplicate', async () => {
    const { samples } = harness();
    const [one] = prepared(1);

    const first = await samples.addSamples('org-a', [one]);
    expect(first.created).toHaveLength(1);
    expect(first.duplicates).toHaveLength(0);

    // The unique index is the dedup. A duplicate does not merely inflate a
    // total: it pulls every corridor towards whatever arrived twice.
    const second = await samples.addSamples('org-a', [one]);
    expect(second.created).toHaveLength(0);
    expect(second.duplicates).toHaveLength(1);

    const stored = await samples.listActive('org-a');
    expect(stored).toHaveLength(1);
  });

  test('the same text in another workspace is a different corpus', async () => {
    const { samples } = harness();
    const [one] = prepared(1);

    await samples.addSamples('org-a', [one]);
    const other = await samples.addSamples('org-b', [one]);

    expect(other.created).toHaveLength(1);
    expect(await samples.listActive('org-a')).toHaveLength(1);
    expect(await samples.listActive('org-b')).toHaveLength(1);
  });

  test('one workspace never reads another workspace rows', async () => {
    const { samples } = harness();
    await samples.addSamples('org-a', prepared(3));

    expect(await samples.listAll('org-b')).toEqual([]);
    expect(await samples.knownHashes('org-b')).toEqual([]);
    expect(await samples.latestMeasurement('org-b')).toBeNull();
  });

  test('codes are assigned in arrival order and do not renumber after a deletion', async () => {
    const { samples } = harness();
    await samples.addSamples('org-a', prepared(3));

    const all = await samples.listAll('org-a');
    expect(all.map((sample) => sample.code)).toEqual([
      voiceSampleCode(0),
      voiceSampleCode(1),
      voiceSampleCode(2),
    ]);

    await samples.softDelete('org-a', [all[0].id]);
    const left = await samples.listActive('org-a');

    // `smp-02` in yesterday's analysis has to still mean the same text today.
    expect(left.map((sample) => sample.code)).toEqual(['smp-02', 'smp-03']);
  });
});

describe('a measurement can still be explained a year later', () => {
  test('it is stored with the analyser and the dictionary it was produced by', async () => {
    const { samples } = harness();
    const accepted = prepared(9);
    await samples.addSamples('org-a', accepted);
    const corpus = await samples.listActive('org-a');

    const result = analyzer.analyzeBrandVoice(
      corpus.map((sample) => ({
        code: sample.code,
        text: sample.text,
        language: sample.language,
        contentHash: sample.contentHash,
      }))
    );
    const saved = await samples.saveMeasurement('org-a', { result });

    expect(saved.analyzerVersion).toBe(contract.ANALYZER_VERSION);
    expect(saved.localePackVersion).toBe(contract.LOCALE_PACK_VERSION);
    expect(saved.corpusSplit).toBeTruthy();
    expect(saved.stale).toBe(false);

    const read = await samples.latestMeasurement('org-a');
    expect(read.id).toBe(saved.id);
    expect(Object.keys(read.metrics.scales).length).toBeGreaterThan(0);
  });

  test('the measurement is not recomputed when a sample it used is deleted', async () => {
    const { samples } = harness();
    await samples.addSamples('org-a', prepared(9));
    const corpus = await samples.listActive('org-a');
    const result = analyzer.analyzeBrandVoice(
      corpus.map((sample) => ({
        code: sample.code,
        text: sample.text,
        language: sample.language,
        contentHash: sample.contentHash,
      }))
    );
    const saved = await samples.saveMeasurement('org-a', { result });
    const before = saved.metrics.scales;

    const victim = corpus[0];
    await samples.softDelete('org-a', [victim.id]);
    const marked = await samples.markMeasurementsStale('org-a', [victim.code]);

    const after = await samples.getMeasurement('org-a', saved.id);
    expect(marked).toBe(1);
    expect(after.stale).toBe(true);
    // Marked, not recomputed: recomputing moves corridors, and with them what
    // the generator may write.
    expect(after.metrics.scales).toEqual(before);
  });

  test('a measurement that never saw the deleted sample is left alone', async () => {
    const { samples } = harness();
    await samples.addSamples('org-a', prepared(9));
    const corpus = await samples.listActive('org-a');
    const result = analyzer.analyzeBrandVoice(
      corpus.map((sample) => ({
        code: sample.code,
        text: sample.text,
        language: sample.language,
        contentHash: sample.contentHash,
      }))
    );
    const saved = await samples.saveMeasurement('org-a', { result });

    const marked = await samples.markMeasurementsStale('org-a', ['smp-99']);
    const after = await samples.getMeasurement('org-a', saved.id);

    expect(marked).toBe(0);
    expect(after.stale).toBe(false);
  });
});

describe('a deleted sample leaves the corpus and takes its words with it', () => {
  test('it disappears from the listing and the column is emptied', async () => {
    const { samples, prisma } = harness();
    await samples.addSamples('org-a', prepared(2));
    const [first] = await samples.listAll('org-a');

    await samples.softDelete('org-a', [first.id]);

    const visible = await samples.listActive('org-a');
    expect(visible.map((sample) => sample.id)).not.toContain(first.id);

    const row = prisma.state.brandVoiceSample.find(
      (sample) => sample.id === first.id
    );
    // `deletedAt` alone would leave somebody's writing in the database after
    // they asked for it to go.
    expect(row.deletedAt).toBeTruthy();
    expect(row.text).toBe('');
  });

  test('deleting nothing changes nothing', async () => {
    const { samples } = harness();
    await samples.addSamples('org-a', prepared(2));

    expect(await samples.softDelete('org-a', [])).toBe(0);
    expect(await samples.listActive('org-a')).toHaveLength(2);
  });
});

describe('going back to an old version writes a new one', () => {
  test('the history keeps both, and the newest says what it came from', async () => {
    const { profiles } = harness();
    const first = await profiles.createDraft(
      'org-a',
      'user-admin',
      CONTENT,
      'Голос 1'
    );
    await profiles.activate('org-a', 'user-admin', first.id);

    const second = await profiles.createDraft(
      'org-a',
      'user-admin',
      {
        ...CONTENT,
        voice: {
          ...CONTENT.voice,
          traits: [{ name: 'Кто говорит', guidance: 'Отдел, от лица компании.' }],
        },
      },
      'Голос 2'
    );
    await profiles.activate('org-a', 'user-admin', second.id);

    const restored = await profiles.restoreAsNewVersion(
      'org-a',
      'user-admin',
      first.id
    );

    const { versions, activeVersion } = await profiles.overview('org-a');
    expect(versions).toHaveLength(3);
    expect(restored.from.id).toBe(first.id);
    expect(restored.created.id).not.toBe(first.id);
    // A return is an event that happened after version 2, not an erasure of it.
    expect(versions.map((version) => version.id)).toContain(second.id);
    expect(activeVersion.id).toBe(restored.created.id);
    expect(activeVersion.parentVersionId).toBe(first.id);
    expect(activeVersion.content.voice.traits[0].guidance).toBe(
      CONTENT.voice.traits[0].guidance
    );
  });

  test('restoring a version that is not there is refused by name', async () => {
    const { profiles } = harness();

    await expect(
      profiles.restoreAsNewVersion('org-a', 'user-admin', 'version-missing')
    ).rejects.toMatchObject({
      code: 'VOICE_VERSION_NOT_FOUND',
      status: 404,
    });
  });

  test('another workspace cannot restore a version it does not own', async () => {
    const { profiles } = harness();
    const version = await profiles.createDraft(
      'org-a',
      'user-admin',
      CONTENT,
      'Голос 1'
    );
    await profiles.activate('org-a', 'user-admin', version.id);

    await expect(
      profiles.restoreAsNewVersion('org-b', 'user-admin', version.id)
    ).rejects.toMatchObject({ code: 'VOICE_VERSION_NOT_FOUND' });
  });
});

describe('the storage layer reaches no model and no network', () => {
  const blanked = (relativePath) =>
    fs
      .readFileSync(path.join(repositoryRoot, relativePath), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//gu, ' ')
      .replace(/(^|[^:])\/\/.*$/gmu, '$1 ');

  test('no client, no fetch, no raw SQL', () => {
    for (const file of [
      `${voiceBase}/voice-sample.repository.ts`,
      `${voiceBase}/voice-profile.repository.ts`,
    ]) {
      const code = blanked(file);
      // Checked on imports and calls rather than on words: these files
      // document the rules they keep, and a scan for the words would fail
      // them for saying so.
      expect(code).not.toMatch(/^import .*(?:openai|OpenaiService|axios)/mu);
      expect(code).not.toMatch(/\bfetch\s*\(|\baxios\b/u);
      expect(code).not.toMatch(/\$queryRaw|\$executeRaw/u);
    }
  });
});
