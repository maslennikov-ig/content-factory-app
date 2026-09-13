'use strict';

/**
 * `content-factory-next-75xn.6`: одна таблица задач и движков, две копии.
 *
 * Списки объявлены один раз, в
 * `libraries/nestjs-libraries/src/openai/ai.search-tasks.ts`. Экран настроек
 * повторяет их литералами, потому что бандл фронтенда не может импортировать
 * бэкендовый модуль, — ровно так же, как повторён `AI_ROLES`. Повтор без
 * стража означает настройку, которой нет на экране: движок, добавленный на
 * сервере, просто не появится в поле выбора, и никто об этом не узнает.
 *
 * Поэтому здесь проверяется не поведение, а согласие трёх мест: список на
 * сервере, список на экране и человеческое название для каждого имени в обоих
 * языках, на которых написан продукт.
 */

const fs = require('node:fs');
const path = require('node:path');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const backend = require('./helpers/ai-search-tasks.cjs');

const copy = loadTypeScriptModule(
  'apps/frontend/src/components/settings/ai-provider.copy.ts',
  {
    // Единственный импорт файла слов — выбор одного из двух языков. Он живёт
    // в разделе «Контент» и к спискам движков отношения не имеет.
    '@contentfactory/frontend/components/content-intelligence/content-section.copy':
      { resolveContentLocale: (language) => (language === 'ru' ? 'ru' : 'en') },
  }
);

const screen = read(
  'apps/frontend/src/components/settings/ai-provider.component.tsx'
);

/** Литерал массива с экрана, прочитанный как список строк. */
const literalList = (name) => {
  const declaration = new RegExp(
    `const ${name} = \\[([\\s\\S]*?)\\] as const;`
  ).exec(screen);
  expect(declaration).not.toBeNull();
  return declaration[1]
    .split(',')
    .map((entry) => entry.trim().replace(/^'|'$/g, ''))
    .filter(Boolean);
};

describe('списки задач и движков совпадают с сервером', () => {
  test('экран повторяет ровно те же движки и в том же порядке', () => {
    expect(literalList('SEARCH_PROVIDERS')).toEqual([
      ...backend.SEARCH_PROVIDERS,
    ]);
  });

  test('экран повторяет ровно те же задачи', () => {
    expect(literalList('SEARCH_TASKS')).toEqual([...backend.SEARCH_TASKS]);
  });

  test('повтор объяснён причиной, а не оставлен без комментария', () => {
    expect(screen).toContain('ai.search-tasks.ts');
    expect(screen).toContain('cannot\n * import a backend module');
  });

  test('только OpenRouter обходится без своего ключа', () => {
    const keyless = backend.SEARCH_PROVIDERS.filter(
      (engine) => !backend.searchProviderNeedsKey(engine)
    );
    expect(keyless).toEqual(['openrouter']);
    // Экран берёт поля ключей из того же правила, а не из своего списка.
    expect(screen).toContain(
      'const KEYED_SEARCH_PROVIDERS = SEARCH_PROVIDERS.filter(searchProviderNeedsKey);'
    );
    expect(screen).toContain('{KEYED_SEARCH_PROVIDERS.map((engine) => (');
    // И у каждого такого движка есть подпись поля, а у беcключевого её нет.
    for (const engine of backend.SEARCH_PROVIDERS) {
      const engineWords = copy.aiProviderCopy.ru.search.engines[engine];
      expect('keyLabel' in engineWords).toBe(
        backend.searchProviderNeedsKey(engine)
      );
    }
  });
});

describe('у каждого имени есть слова на обоих языках', () => {
  for (const locale of ['ru', 'en']) {
    test(`${locale}: движок называется, объяснён и умеет про ключ`, () => {
      const words = copy.aiProviderCopy[locale].search;
      for (const engine of backend.SEARCH_PROVIDERS) {
        const engineWords = words.engines[engine];
        expect(engineWords).toBeDefined();
        expect(engineWords.name).toBeTruthy();
        expect(engineWords.what).toBeTruthy();
        if (!backend.searchProviderNeedsKey(engine)) continue;
        // Подпись поля, обе строки состояния, имя кнопки и предупреждение
        // перед удалением — без любой из них поле молчит о том, что делает.
        for (const key of [
          'keyLabel',
          'keyStored',
          'keyMissing',
          'removeKey',
          'removeKeyConfirm',
        ]) {
          expect(engineWords[key]).toBeTruthy();
        }
        // Имя кнопки называет движок: двух одинаковых «убрать сохранённый
        // ключ» на экране быть не может, их нечем различить.
        expect(engineWords.removeKey).toContain(engineWords.name);
        expect(engineWords.keyLabel).toContain(engineWords.name);
      }
    });

    test(`${locale}: у задачи есть подпись и строка о том, что в ней важно`, () => {
      const words = copy.aiProviderCopy[locale].search;
      for (const task of backend.SEARCH_TASKS) {
        expect(words.tasks[task]).toBeDefined();
        expect(words.tasks[task].label).toBeTruthy();
        expect(words.tasks[task].what).toBeTruthy();
      }
    });

    test(`${locale}: раздел объясняет ключи системы и свой ключ`, () => {
      const words = copy.aiProviderCopy[locale].search;
      for (const key of [
        'what',
        'systemKeys',
        'ownKey',
        'ownKeyKept',
        'openrouterNoKey',
        'tasksWhat',
        'tasksWhy',
        'taskDefaultOption',
        'includedOwnKey',
        'includedRemoveKeys',
        'includedRemoveKeysConfirm',
      ]) {
        expect(words[key]).toBeTruthy();
      }
      // Рекомендация названа поимённо, иначе выбор задачи не на чем сделать.
      expect(words.tasksWhy).toContain('Exa');
      expect(words.tasksWhy).toContain('Tavily');
    });
  }
});

/**
 * Русские строки локали писались, когда движок был один, и называют Tavily
 * там, где движок теперь выбирается. Английские строки в остальных пятнадцати
 * файлах остаются как есть — их правит не этот экран.
 */
test('локаль не хранит поисковых подписей, которых никто не читает', () => {
  const dead = [
    'search_api_key',
    'search_key_empty_placeholder',
    'search_key_set_placeholder',
    'search_key_from_settings',
    'search_key_missing_org',
    'search_key_remove_confirm',
    'remove_stored_search_key',
    'web_search_description_org',
  ];
  const source = read(
    'apps/frontend/src/components/settings/ai-provider.component.tsx'
  );
  const localesDir =
    'libraries/react-shared-libraries/src/translation/locales';

  for (const key of dead) {
    // Слова раздела живут в `ai-provider.copy.ts`: название движка в подписи
    // поля — это содержание, а не обвязка. Оставленная строка локали никем не
    // рисуется, но семь из восьми ещё называли Tavily там, где движок теперь
    // выбирается, — и следующий, кто будет искать неверную подпись, найдёт
    // именно её (`content-factory-next-fl4k`).
    expect(source).not.toContain(`'${key}'`);
    for (const locale of fs.readdirSync(
      path.join(root, localesDir)
    )) {
      const file = path.join(localesDir, locale, 'translation.json');
      if (!fs.existsSync(path.join(root, file))) continue;
      expect(Object.keys(JSON.parse(read(file)))).not.toContain(key);
    }
  }
});
