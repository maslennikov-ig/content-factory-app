'use strict';

/**
 * `content-factory-next-fn33.138` — the «Собрать из моих текстов» path card
 * promised «Источников 5» while the collecting screen behind it asked for
 * eight. Both now read the one corpus floor in `voice-wiring.contract.ts`.
 */

const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const voiceBase =
  'libraries/nestjs-libraries/src/content-intelligence/brand-voice';
const sources = {
  '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract': `${voiceBase}/voice-wiring.contract.ts`,
  '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/plural': `${voiceBase}/plural.ts`,
  '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/brand-voice.types': `${voiceBase}/brand-voice.types.ts`,
  '@contentfactory/nestjs-libraries/content-intelligence/materials/material-presentation':
    'libraries/nestjs-libraries/src/content-intelligence/materials/material-presentation.ts',
  '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/recut': `${voiceBase}/recut.ts`,
};

const contract = loadTypeScriptModule(
  `${voiceBase}/voice-wiring.contract.ts`,
  {},
  { sources }
);
const { voiceCopy } = loadTypeScriptModule(
  'apps/frontend/src/components/brand-voice/voice-copy.ts',
  {},
  { sources }
);

const digits = (value) => Number(String(value).replace(/\D/gu, ''));

describe('path card and collecting screen name one corpus floor', () => {
  test.each(['ru', 'en'])('%s: the sample count is the floor the screen enforces', (locale) => {
    expect(digits(voiceCopy[locale].ownSources)).toBe(contract.MIN_CORPUS_SAMPLES);
    // An empty corpus asks for exactly the floor, which is what the card shows.
    expect(contract.requiredSamples(0, 0)).toBe(contract.MIN_CORPUS_SAMPLES);
  });

  test.each(['ru', 'en'])('%s: the character floor is the contract figure', (locale) => {
    expect(digits(voiceCopy[locale].ownNeeds)).toBe(contract.MIN_CORPUS_CHARS);
  });
});
