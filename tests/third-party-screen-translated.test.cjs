'use strict';

/**
 * `content-factory-next-fn33.74`: заголовок «Интеграции» был по-русски, а весь
 * экран под ним — по-английски.
 *
 * Часть строк была вписана прямо в разметку, а описания провайдеров приходят с
 * сервера и печатались как есть. Описание переводится по ключу из
 * идентификатора провайдера, серверный текст остаётся запасным вариантом.
 */

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const screen = read(
  'apps/frontend/src/components/third-parties/third-party.component.tsx'
);
const list = read(
  'apps/frontend/src/components/third-parties/third-party.list.component.tsx'
);

const localesDir =
  'libraries/react-shared-libraries/src/translation/locales';
const localeNames = fs.readdirSync(path.join(root, localesDir));
const locale = (name) => JSON.parse(read(`${localesDir}/${name}/translation.json`));

describe('the integrations screen speaks the language of the menu that leads to it', () => {
  test('no English sentence is left hard-coded in the markup', () => {
    for (const literal of [
      '>No Integrations Yet<',
      ">Add</Button>",
      "deleteDialog('Are you sure",
      'label="API Key"',
    ]) {
      expect(screen + list).not.toContain(literal);
    }
  });

  test('every visible string goes through a translation key', () => {
    expect(screen).toMatch(/t\('no_integrations_yet', 'No Integrations Yet'\)/);
    expect(screen).toMatch(/t\(\s*'delete_integration_confirm',/);
    expect(list).toMatch(/t\('label_api_key', 'API Key'\)/);
    expect(list).toMatch(/t\('add', 'Add'\)/);
  });

  test('the provider description is translated by identifier, server text as fallback', () => {
    expect(list).toMatch(
      /String\(\s*t\(`third_party_description_\$\{p\.identifier\}`,\s*p\.description\)\s*\)/
    );
  });

  test('both shipped providers have a description key in every locale', () => {
    const providers = fs
      .readdirSync(path.join(root, 'libraries/nestjs-libraries/src/3rdparties'), {
        withFileTypes: true,
      })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    expect(providers.sort()).toEqual(['heygen', 'reelfarm']);

    for (const name of localeNames) {
      const values = locale(name);
      for (const provider of providers) {
        expect(typeof values[`third_party_description_${provider}`]).toBe(
          'string'
        );
      }
      expect(typeof values.no_integrations_yet).toBe('string');
      expect(typeof values.delete_integration_confirm).toBe('string');
    }
  });

  test('Russian actually reads as Russian, not as the English fallback', () => {
    const ru = locale('ru');
    expect(ru.no_integrations_yet).not.toBe('No Integrations Yet');
    expect(ru.delete_integration_confirm).not.toBe(
      'Are you sure you want to delete this integration?'
    );
    expect(ru.third_party_description_heygen).toMatch(/[А-Яа-я]/);
    expect(ru.third_party_description_reelfarm).toMatch(/[А-Яа-я]/);
  });
});
