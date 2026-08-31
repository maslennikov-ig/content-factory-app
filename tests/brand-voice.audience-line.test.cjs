'use strict';

require('reflect-metadata');

/**
 * The audience line, whole, in both places that print it.
 *
 * One written line becomes two fields when a voice is parsed: `name` is a
 * 120-character label and `need` keeps the sentence. Reading the label back
 * cuts a person's own text mid-word — «…но не в маркетин» — and that was
 * found and fixed once, in `audienceLine`, for the passport. The version
 * comparison went on reading `audiences[0].name` directly, so the five fields
 * a person compares showed the stump.
 *
 * A label that is a prefix of the sentence is the cut half of one line. A
 * label the model wrote alongside a different sentence is not, and stays — the
 * rule lives in `audienceLine` and this file only checks that both callers ask
 * it rather than reimplementing it.
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
  '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract': `${voiceBase}/voice-wiring.contract.ts`,
};

const { VoiceService } = loadTypeScriptModule(
  `${voiceBase}/voice.service.ts`,
  {
    '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
      PrismaRepository: class PrismaRepository {},
      PrismaTransaction: class PrismaTransaction {},
    },
  },
  { sources }
);

const WHOLE_LINE =
  'Предприниматели, которые сами пишут в свой канал и хотят звучать как раньше, но не в маркетинговом тоне, а по-человечески';

const contentWith = (audiences) => ({
  version: 'v1',
  project: { name: 'Мастерская', audiences },
  voice: {
    traits: [
      { name: 'Кто говорит', guidance: 'Автор от первого лица' },
      { name: 'Тон', guidance: 'Разговорный и прямой' },
    ],
    sentenceStyle: 'Короткие фразы вперемешку с длинными',
  },
  guardrails: { prohibitedClaims: ['гарантированный доход'] },
});

/** The service without a single dependency: nothing below touches one. */
const service = new VoiceService({}, {}, {}, {}, () => new Date());
// Одна карта полей на два пути вместо двух: `voiceFieldsOf` была вторым
// экземпляром той же таблицы, отличавшимся ключами и — как выяснилось —
// обрезкой строки аудитории. Осталась та, через которую пишет ручной путь.
const fieldsOf = (content) => service['fieldsFromContent'](content);

describe('сравнение версий показывает строку целиком', () => {
  it('обрезанная метка заменяется полной строкой', () => {
    const fields = fieldsOf(
      contentWith([{ name: WHOLE_LINE.slice(0, 120), need: WHOLE_LINE }])
    );

    expect(fields.AUDIENCE).toBe(WHOLE_LINE);
    expect(fields.AUDIENCE).not.toMatch(/маркетин$/u);
  });

  it('метка, написанная отдельно от предложения, остаётся своей', () => {
    const fields = fieldsOf(
      contentWith([
        { name: 'Малый бизнес', need: 'Хотят писать сами и не выгорать' },
      ])
    );

    expect(fields.AUDIENCE).toBe('Малый бизнес');
  });

  it('пустая аудитория остаётся пустой строкой, а не «undefined»', () => {
    expect(fieldsOf(contentWith([])).AUDIENCE).toBe('');
  });

  it('остальные четыре поля не тронуты', () => {
    const fields = fieldsOf(
      contentWith([{ name: WHOLE_LINE.slice(0, 120), need: WHOLE_LINE }])
    );

    expect(fields.WHO_SPEAKS).toBe('Автор от первого лица');
    expect(fields.TONE).toBe('Разговорный и прямой');
    expect(fields.SENTENCE_LENGTH).toBe(
      'Короткие фразы вперемешку с длинными'
    );
    expect(fields.NEVER_SAY).toBe('гарантированный доход');
  });
});
