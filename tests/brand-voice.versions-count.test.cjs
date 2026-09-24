'use strict';

/**
 * `content-factory-next-fn33.151` — «Версии аватара» glued the number to one
 * fixed word: «1 версии», «5 версии», «1 versions». The count is declined now.
 */

const fs = require('node:fs');
const path = require('node:path');
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
const { voiceCopy } = loadTypeScriptModule(
  'apps/frontend/src/components/brand-voice/voice-copy.ts',
  {},
  { sources }
);

describe('the avatar version count is declined', () => {
  test.each([
    [1, '1 версия'],
    [2, '2 версии'],
    [4, '4 версии'],
    [5, '5 версий'],
    [11, '11 версий'],
    [21, '21 версия'],
  ])('ru %i', (count, expected) => {
    expect(voiceCopy.ru.versionsCount(count)).toBe(expected);
  });

  test.each([
    [1, '1 version'],
    [2, '2 versions'],
  ])('en %i', (count, expected) => {
    expect(voiceCopy.en.versionsCount(count)).toBe(expected);
  });

  test('the screen reads the counted phrase', () => {
    const source = fs.readFileSync(
      path.join(
        __dirname,
        '..',
        'apps/frontend/src/components/brand-voice/voice-versions.screen.tsx'
      ),
      'utf8'
    );
    expect(source).toContain('t.versionsCount(versions.length)');
    expect(source).not.toMatch(/'версии' : 'versions'/u);
  });
});
