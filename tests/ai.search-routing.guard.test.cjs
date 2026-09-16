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

/**
 * Экран целиком, скомпилированный: `searchEngineForTask` — это копия
 * серверной маршрутизации, и проверять её чтением исходника значит проверять
 * буквы, а не ответ. Всё, что компонент импортирует ради разметки, здесь
 * заглушено — от этого модуля нужна одна экспортированная функция.
 */
const stub = () => null;
const screenModule = loadTypeScriptModule(
  'apps/frontend/src/components/settings/ai-provider.component.tsx',
  {
    react: require('react'),
    swr: {
      __esModule: true,
      default: () => ({ data: undefined, mutate: stub }),
    },
    '@contentfactory/helpers/utils/custom.fetch': { useFetch: () => stub },
    '@contentfactory/react/toaster/toaster': {
      useToaster: () => ({ show: stub }),
    },
    '@contentfactory/react/form/select': { Select: stub },
    '@contentfactory/react/form/input': { Input: stub },
    '@contentfactory/react/form/button': { Button: stub },
    '@contentfactory/react/choice/control.button': { ControlButton: stub },
    '@contentfactory/react/layout/hint': { Hint: stub },
    '@contentfactory/react/translation/get.transation.service.client': {
      useT: () => (key, fallback) => fallback ?? key,
    },
    '@contentfactory/react/helpers/variable.context': {
      useVariables: () => ({ language: 'ru' }),
    },
    '@contentfactory/react/helpers/delete.dialog': { deleteDialog: stub },
    '@contentfactory/frontend/components/ui/icons': { CloseIconSmall: stub },
    '@contentfactory/frontend/components/settings/settings-section': {
      SettingsSection: stub,
    },
    '@contentfactory/frontend/components/settings/ai-provider.copy': copy,
  }
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
        // Подпись поля, обе строки состояния и предупреждение
        // перед удалением — без любой из них поле молчит о том, что делает.
        for (const key of [
          'keyLabel',
          'keyStored',
          'keyMissing',
          'removeKeyConfirm',
        ]) {
          expect(engineWords[key]).toBeTruthy();
        }
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
      const allWords = copy.aiProviderCopy[locale];
      const words = allWords.search;
      for (const key of [
        'what',
        'routingNone',
        'keyOwn',
        'keySystem',
        'returnToSystem',
      ]) {
        expect(words[key]).toBeTruthy();
      }
      expect(allWords.usageModeHint).toBeTruthy();
    });

    /**
     * `content-factory-next-75xn.10`: строка вместо трёх селекторов.
     *
     * Владелец 13.09.2026: «зачем мы даём эти настройки, если мы с тобой уже
     * знаем, как лучше сделать?». Раз выбора нет, строка обязана называть тот
     * движок, к которому уйдёт следующий поиск, — и назвать его поимённо,
     * иначе она сообщает не больше, чем молчание.
     */
    test(`${locale}: строка маршрутизации называет задачу и движок поимённо`, () => {
      const words = copy.aiProviderCopy[locale].search;
      const line = words.routing(
        backend.SEARCH_TASKS.map((task) => ({
          task: words.tasks[task].label,
          engine:
            words.engines[backend.DEFAULT_SEARCH_TASK_PROVIDERS[task]].name,
        }))
      );
      expect(line).toBeTruthy();
      for (const task of backend.SEARCH_TASKS) {
        expect(line).toContain(words.tasks[task].label);
        expect(line).toContain(
          words.engines[backend.DEFAULT_SEARCH_TASK_PROVIDERS[task]].name
        );
      }
      expect(line).toContain('Exa');
      expect(line).toContain('Tavily');
    });
  }
});

/**
 * Экран больше не спрашивает, какой движок какой задаче — значит, он обязан
 * говорить правду о том, какой движок её получит. Правда тут одна и живёт на
 * сервере (`providerForSearchTask`); копия на клиенте существует только
 * потому, что бандл фронтенда не может импортировать бэкендовый модуль.
 *
 * Поэтому обе считаются на одних и тех же входах: три задачи на всех восьми
 * сочетаниях сохранённых ключей, с оператороским переопределением и без. Одно
 * расхождение — и экран называет движок, к которому поиск не пойдёт.
 */
describe('строка на экране и маршрутизация сервера считают одно и то же', () => {
  const KEYED = backend.SEARCH_PROVIDERS.filter(backend.searchProviderNeedsKey);

  const keyCombinations = () => {
    const combinations = [];
    for (let mask = 0; mask < 1 << KEYED.length; mask += 1) {
      const present = {};
      KEYED.forEach((engine, index) => {
        if (mask & (1 << index)) present[engine] = `${engine}-key`;
      });
      combinations.push(present);
    }
    return combinations;
  };

  test('одинаковый ответ на каждой задаче, каждом наборе ключей и каждом переопределении', () => {
    const overrides = [
      {},
      ...backend.SEARCH_PROVIDERS.map((engine) => ({ research: engine })),
    ];

    for (const apiKeys of keyCombinations()) {
      for (const provider of backend.SEARCH_PROVIDERS) {
        for (const taskProviders of overrides) {
          for (const task of backend.SEARCH_TASKS) {
            const server = backend.providerForSearchTask(task, {
              provider,
              apiKeys,
              taskProviders,
            });
            const client = screenModule.searchEngineForTask(task, {
              provider,
              taskProviders,
              hasKey: (engine) => !!apiKeys[engine],
            });
            expect({ task, provider, taskProviders, apiKeys, client }).toEqual({
              task,
              provider,
              taskProviders,
              apiKeys,
              client: server,
            });
          }
        }
      }
    }
  });

  test('умолчания на клиенте — это умолчания сервера, а не второе мнение', () => {
    const declaration =
      /const DEFAULT_SEARCH_TASK_PROVIDERS: Record<\s*SearchTask,\s*SearchProvider\s*> = \{([\s\S]*?)\};/.exec(
        screen
      );
    expect(declaration).not.toBeNull();
    const declared = Object.fromEntries(
      declaration[1]
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) =>
          entry.split(':').map((part) => part.trim().replace(/'/g, ''))
        )
    );
    expect(declared).toEqual({ ...backend.DEFAULT_SEARCH_TASK_PROVIDERS });
  });
});

/**
 * `content-factory-next-75xn.10` и `.11`: чего на экране больше нет.
 *
 * Селекторы «задача → сервер» и «Поисковый сервер» убраны, и вместе с ними
 * ушло единственное действие, которое само выключало веб-исследование.
 * Владелец 13.09.2026: «статус веб-исследования автоматически выключается» —
 * он его не трогал, это делал обработчик смены движка.
 */
describe('экран не выбирает движок и не трогает выключатель сам', () => {
  test('ни селектора сервера, ни селекторов задач', () => {
    expect(screen).not.toContain('name="searchProvider"');
    expect(screen).not.toContain('search-task-');
    expect(screen).not.toContain('changeSearchProvider');
  });

  test('режим генерации не показывает и не переключает статус поиска', () => {
    const writes = screen.match(/setSearchEnabled\(/g) ?? [];
    // Состояние читается только для совместимого payload; движок включается
    // наличием own-over-system credential и не следует за generation mode.
    expect(writes).toHaveLength(1);
    expect(screen).toContain('setSearchEnabled(data.searchEnabled);');
    expect(screen).not.toContain('name="searchEnabled"');
    expect(screen).not.toContain('setSearchEnabled(false)');
  });

  test('поля движков видны в обоих режимах и OpenRouter не обещан как fallback', () => {
    expect(screen).toContain('{KEYED_SEARCH_PROVIDERS.map((engine) => (');
    expect(screen).toContain('words.search.returnToSystem(');
    expect(screen).not.toContain('systemKeysOnly');
    expect(screen).not.toContain('includedOwnKey');
    expect(screen).not.toContain('openrouter_fallback_available');
  });

  test('ни маршрутизация, ни движок области не уходят на сервер', () => {
    const payload = screen.slice(
      screen.indexOf('export const buildAiSettingsPayload'),
      screen.indexOf('export const removeStoredKey')
    );
    expect(payload).not.toMatch(/^\s*searchProvider,$/m);
    expect(payload).not.toMatch(/searchTaskProviders:/);
  });
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
  const localesDir = 'libraries/react-shared-libraries/src/translation/locales';

  for (const key of dead) {
    // Слова раздела живут в `ai-provider.copy.ts`: название движка в подписи
    // поля — это содержание, а не обвязка. Оставленная строка локали никем не
    // рисуется, но семь из восьми ещё называли Tavily там, где движок теперь
    // выбирается, — и следующий, кто будет искать неверную подпись, найдёт
    // именно её (`content-factory-next-fl4k`).
    expect(source).not.toContain(`'${key}'`);
    for (const locale of fs.readdirSync(path.join(root, localesDir))) {
      const file = path.join(localesDir, locale, 'translation.json');
      if (!fs.existsSync(path.join(root, file))) continue;
      expect(Object.keys(JSON.parse(read(file)))).not.toContain(key);
    }
  }
});
