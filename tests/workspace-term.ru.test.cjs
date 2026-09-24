'use strict';

/**
 * `content-factory-next-fn33.156` — one place was called both «рабочее
 * пространство» and «рабочая область», 32 strings each, so two refusals shown
 * one after the other read like two different places. The product says
 * «пространство»: it is the word of `PRODUCT.md`, of the help and of most of
 * the screens' own copy. This holds the Russian copy to it.
 */

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

/** «рабочая/рабочей/рабочую/… область/области/…» in any case. */
const WORKSPACE_AS_AREA = /рабоч[а-яё]*\s+област[а-яё]*/iu;

const COPY_FILES = [
  'apps/frontend/src/components/help/help.copy.ts',
  'apps/frontend/src/components/settings/ai-provider.copy.ts',
  'apps/frontend/src/components/onboarding/onboarding.copy.ts',
  'apps/frontend/src/components/channels/channels.copy.ts',
  'apps/frontend/src/components/brand-voice/voice-brief.adapter.ts',
  'apps/frontend/src/components/admin/admin-ai-defaults.copy.ts',
  'libraries/nestjs-libraries/src/locale/backend-strings.ts',
];

const withoutComments = (source) =>
  source
    .replace(/\/\*[\s\S]*?\*\//gu, ' ')
    .replace(/(^|[^:])\/\/.*$/gmu, '$1 ');

describe('the Russian interface names the workspace one way', () => {
  test('no Russian locale string calls it «рабочая область» or «область»', () => {
    const ru = JSON.parse(
      read('libraries/react-shared-libraries/src/translation/locales/ru/translation.json')
    );
    const offenders = Object.entries(ru)
      .filter(([, value]) => typeof value === 'string')
      .filter(([, value]) => WORKSPACE_AS_AREA.test(value))
      .map(([key]) => key);
    expect(offenders).toEqual([]);
    expect(ru.organization).toBe('Пространство');
    expect(ru.select_organization).toBe('Выберите пространство');
    expect(ru.workspace_default_name).toBe('Рабочее пространство');
  });

  test.each(COPY_FILES)('%s says «пространство»', (file) => {
    const code = withoutComments(read(file));
    expect(code).not.toMatch(WORKSPACE_AS_AREA);
    expect(code).not.toMatch(/['`«\s](?:этой|новой|такой)\s+области\b/u);
  });
});
