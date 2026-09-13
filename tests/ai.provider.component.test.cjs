const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const ts = require('typescript');

function loadTypeScriptModule(relativePath, mocks = {}) {
  const filename = path.resolve(__dirname, '..', relativePath);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const loaded = { exports: {} };
  const localRequire = (request) =>
    Object.prototype.hasOwnProperty.call(mocks, request)
      ? mocks[request]
      : require(request);
  new Function(
    'exports',
    'require',
    'module',
    '__filename',
    '__dirname',
    compiled
  )(loaded.exports, localRequire, loaded, filename, path.dirname(filename));
  return loaded.exports;
}

let settings;
const fetchMock = jest.fn();
const deleteDialogMock = jest.fn();
const translationCalls = [];
const translations = {
  ai_provider_description_org: 'Translated usage description',
  ai_usage_mode: 'Translated AI usage mode',
  ai_usage_included: 'Translated included mode',
  ai_usage_workspace_key: 'Translated workspace key mode',
  ai_usage_managed_unavailable: 'Translated managed unavailable',
  ai_usage_exhausted: 'Translated exhausted allowance',
  ai_usage_zero_quota: 'Translated zero quota',
  ai_usage_workspace_mode: 'Translated workspace mode',
};

const Field = ({ label, children, disableForm: _disableForm, ...props }) =>
  React.createElement(
    'label',
    null,
    label,
    React.createElement('select', props, children)
  );

const component = loadTypeScriptModule(
  'apps/frontend/src/components/settings/ai-provider.component.tsx',
  {
    swr: {
      __esModule: true,
      default: () => ({ data: settings, mutate: jest.fn() }),
    },
    '@contentfactory/helpers/utils/custom.fetch': { useFetch: () => fetchMock },
    '@contentfactory/react/toaster/toaster': {
      useToaster: () => ({ show: jest.fn() }),
    },
    '@contentfactory/react/form/select': { Select: Field },
    '@contentfactory/react/form/input': {
      Input: ({
        label,
        disableForm: _disableForm,
        // Рисуется, а не выбрасывается: с 07.09.2026 под каждым полем роли
        // стоит строка о том, что эта роль делает, и проглоченная подсказка
        // сделала бы набор слепым ровно к тому, что он проверяет.
        helper,
        action,
        // Mirrors the real Input: `secret` is a pasted credential, not a
        // password, so it becomes a plain text field the browser's password
        // manager has no reason to claim.
        secret,
        ...props
      }) =>
        React.createElement(
          'label',
          null,
          label,
          React.createElement('input', {
            ...props,
            ...(secret ? { type: 'text', autoComplete: 'off' } : {}),
          }),
          action,
          helper ? React.createElement('span', null, helper) : null
        ),
    },
    '@contentfactory/react/helpers/delete.dialog': {
      deleteDialog: deleteDialogMock,
    },
    '@contentfactory/frontend/components/ui/icons': {
      CloseIconSmall: () => React.createElement('svg'),
    },
    '@contentfactory/react/form/button': {
      Button: ({ children, secondary: _secondary, ...props }) =>
        React.createElement('button', props, children),
    },
    '@contentfactory/react/translation/get.transation.service.client': {
      useT: () => (key, fallback) => {
        translationCalls.push(key);
        return translations[key] ?? fallback;
      },
    },
    '@contentfactory/react/helpers/variable.context': {
      useVariables: () => ({ language: 'en' }),
    },
    // Слова, которых нет в шестнадцати файлах локалей: объяснение ролей вызова
    // и строка «пока 0» живут рядом с экраном на двух языках, как у «Контента»
    // и обхода (`content-factory-next-m2eg.24`). Загружается настоящий файл —
    // проверяется в том числе то, что там написано.
    '@contentfactory/frontend/components/settings/ai-provider.copy':
      require('./helpers/load-tsx.cjs').loadTypeScriptModule(
        'apps/frontend/src/components/settings/ai-provider.copy.ts'
      ),
  }
);

describe('AI provider search settings component', () => {
  beforeEach(() => {
    fetchMock.mockClear();
    translationCalls.length = 0;
    settings = {
      usageMode: 'workspace_key',
      provider: 'openrouter',
      textModel: 'openai/gpt-5.6-luna',
      imageModel: 'openai/gpt-5-image',
      hasKey: false,
      searchEnabled: true,
      searchProvider: 'tavily',
      searchTopic: 'general',
      searchDepth: 'basic',
      hasSearchKey: true,
      // `content-factory-next-75xn`: ключи адресуются движком, а сервер на
      // задачу выбирается отдельно от сервера области.
      searchKeys: { tavily: true, openrouter: false, exa: false },
      searchTaskProviders: { research: 'exa' },
      searchFallbackAvailable: true,
      workspaceKeyConfigured: false,
      includedAvailable: true,
      includedMonthlyOperations: 0,
      includedUsedOperations: 0,
      includedRemainingOperations: 0,
      includedRestrictionReason: 'quota_unavailable',
      // `content-factory-next-x63z`: the routing map and its breakdown are part
      // of the settings response now, and the screen reads both.
      roleModels: {},
      usageByRole: [],
      usageByMember: [],
    };
  });

  /**
   * `content-factory-next-m2eg.24`. Владелец 07.09.2026: «расходы по
   * участнику… не понимаю, где смотреть, потому что там же их нет». Обе
   * таблицы рисовались только при непустом списке, а список пуст до первого
   * вызова модели — вместе со строками исчезал и заголовок.
   */
  describe('расход виден и когда его нет', () => {
    test('обе таблицы на месте при нулевом расходе', () => {
      const markup = renderToStaticMarkup(
        React.createElement(component.default)
      );

      expect(markup).toContain('data-ai-usage="member"');
      expect(markup).toContain('data-ai-usage="role"');
      expect(markup).toContain('AI usage by member, this period');
      expect(markup).toContain('AI usage by role, this period');
      expect(markup).toContain('Usage and call roles');
      // Ноль — это ответ. Он напечатан, а не выражен отсутствием раздела.
      expect(markup).toContain('Nothing yet');
      expect(markup).toContain('after the first model call');
      // Шесть ролей с нулями: список ролей виден раньше полей ниже.
      const roleRows = markup.slice(
        markup.indexOf('data-ai-usage="role"'),
        markup.indexOf('after the first model call', markup.indexOf('data-ai-usage="role"'))
      );
      for (const role of ['classify', 'extract', 'research', 'draft', 'judge', 'review', 'image']) {
        expect(roleRows).toContain(`>${role}</span>`);
      }
      expect(translationCalls).toEqual(
        expect.arrayContaining(['ai_role_classify', 'ai_role_image'])
      );
    });

    test('непустой расход печатает строки, а не заглушку', () => {
      settings = {
        ...settings,
        usageByMember: [
          { userId: 'u-1', email: 'writer@example.com', operations: 12 },
          { userId: null, email: null, operations: 3 },
        ],
        usageByRole: [{ role: 'draft', operations: 15 }],
      };
      const markup = renderToStaticMarkup(
        React.createElement(component.default)
      );

      expect(markup).toContain('writer@example.com');
      expect(markup).toContain('Scheduled and API work');
      expect(markup).not.toContain('Nothing yet');
    });

    test('роли вызова объяснены словами, а не одним заголовком', () => {
      const markup = renderToStaticMarkup(
        React.createElement(component.default)
      );

      // Что это такое, что значит пусто, зачем менять — три разных вопроса.
      expect(markup).toContain('data-ai-roles-hint="true"');
      expect(markup).toContain('A call role is the job');
      expect(markup).toContain('the provider default');
      expect(markup).toContain('money');
      // И одна строка про каждую роль рядом с её полем.
      expect(markup).toContain('one sentence in');
      expect(markup).toContain('the one role that needs a model which can draw');
    });
  });

  test('renders saved basic depth and preserves it in the save payload', () => {
    const markup = renderToStaticMarkup(React.createElement(component.default));

    expect(markup).toContain('Search depth');
    expect(markup).toContain('name="searchDepth"');
    expect(markup).toContain(
      '<option value="basic" selected="">Basic</option>'
    );
    expect(
      component.buildAiSettingsPayload({
        provider: settings.provider,
        usageMode: settings.usageMode,
        apiKey: '',
        textModel: settings.textModel,
        imageModel: settings.imageModel,
        roleModels: settings.roleModels,
        searchEnabled: settings.searchEnabled,
        searchTopic: settings.searchTopic,
        searchDepth: settings.searchDepth,
      })
    ).toMatchObject({
      searchProvider: 'tavily',
      searchDepth: 'basic',
      usageMode: 'workspace_key',
    });
  });

  /**
   * Ключи уходят только те, что человек набрал: сохранение, сделанное из
   * селектора глубины, не должно доставать до ключей движков, которых этот
   * заход не касался.
   */
  test('payload carries only the keys typed in this visit, trimmed', () => {
    const payload = component.buildAiSettingsPayload({
      usageMode: 'workspace_key',
      provider: 'openrouter',
      apiKey: '',
      textModel: '',
      imageModel: '',
      roleModels: {},
      searchEnabled: true,
      searchProvider: 'tavily',
      searchApiKeys: { tavily: '', exa: '  exa-key  ' },
      searchTaskProviders: { research: 'exa', facts: undefined },
      searchTopic: 'general',
      searchDepth: 'advanced',
    });

    expect(payload.searchApiKeys).toEqual({ exa: 'exa-key' });
    expect(payload.searchTaskProviders).toEqual({ research: 'exa' });
    expect(payload).not.toHaveProperty('searchApiKey');
  });

  test('a save that typed no key sends no key map at all', () => {
    const payload = component.buildAiSettingsPayload({
      usageMode: 'workspace_key',
      provider: 'openrouter',
      apiKey: '',
      textModel: '',
      imageModel: '',
      roleModels: {},
      searchEnabled: true,
      searchProvider: 'exa',
      searchApiKeys: {},
      searchTaskProviders: {},
      searchTopic: 'general',
      searchDepth: 'advanced',
    });

    expect(payload).not.toHaveProperty('searchApiKeys');
    expect(payload.searchTaskProviders).toEqual({});
  });

  test('offers explicit included and workspace-key modes and explains zero quota', () => {
    settings = { ...settings, usageMode: 'included' };
    const markup = renderToStaticMarkup(React.createElement(component.default));

    expect(markup).toContain('Translated AI usage mode');
    expect(markup).toContain('value="included" selected=""');
    expect(markup).toContain('value="workspace_key"');
    expect(markup).toContain('Translated zero quota');
    expect(translationCalls).toEqual(
      expect.arrayContaining([
        'ai_provider_description_org',
        'ai_usage_mode',
        'ai_usage_included',
        'ai_usage_workspace_key',
        'ai_usage_zero_quota',
      ])
    );
  });

  test('included payload omits workspace secrets and model ids entirely', () => {
    const payload = component.buildAiSettingsPayload({
      usageMode: 'included',
      provider: 'openrouter',
      apiKey: 'workspace-secret',
      textModel: 'workspace-text',
      imageModel: 'workspace-image',
      searchEnabled: true,
      searchApiKeys: { tavily: 'workspace-search-secret' },
      searchTopic: 'news',
      searchDepth: 'advanced',
    });

    expect(payload).not.toHaveProperty('apiKey');
    expect(payload).not.toHaveProperty('searchApiKey');
    expect(payload).not.toHaveProperty('searchApiKeys');
    expect(payload).not.toHaveProperty('textModel');
    expect(payload).not.toHaveProperty('imageModel');
    expect(JSON.stringify(payload)).not.toContain('workspace-secret');
  });

  /**
   * `content-factory-next-75xn.4`: в режиме включённых ключей экран показывает
   * значения оператора, и вернуть их серверу — значит записать чужой движок
   * как свой. Сервер их в этом режиме игнорирует; экран их и не отправляет.
   * Исключение одно — включён ли поиск вообще: это настройка обоих режимов, и
   * сервер пишет её в обоих.
   */
  test('included payload sends no search routing at all, only the switch', () => {
    const payload = component.buildAiSettingsPayload({
      usageMode: 'included',
      provider: 'openrouter',
      apiKey: '',
      textModel: '',
      imageModel: '',
      roleModels: {},
      searchEnabled: false,
      searchProvider: 'exa',
      searchApiKeys: {},
      searchTaskProviders: { research: 'exa' },
      searchTopic: 'news',
      searchDepth: 'basic',
    });

    expect(payload).toMatchObject({ usageMode: 'included', searchEnabled: false });
    for (const field of [
      'searchProvider',
      'searchTopic',
      'searchDepth',
      'searchTaskProviders',
      'searchApiKeys',
    ]) {
      expect(payload).not.toHaveProperty(field);
    }
  });

  test('shows exhausted allowance separately from zero/unavailable allowance', () => {
    settings = {
      ...settings,
      usageMode: 'included',
      includedMonthlyOperations: 3,
      includedUsedOperations: 3,
      includedRemainingOperations: 0,
      includedRestrictionReason: 'quota_exhausted',
    };

    const markup = renderToStaticMarkup(React.createElement(component.default));
    expect(markup).toContain('Translated exhausted allowance');
    expect(markup).not.toContain('3 included AI operations are available');
  });

  test('renders fallback availability from the backend response', () => {
    const markup = renderToStaticMarkup(React.createElement(component.default));

    expect(markup).toContain(
      'Automatic fallback is available through the OpenRouter AI key'
    );
  });

  test('disables saving until persisted settings have loaded', () => {
    settings = undefined;

    const markup = renderToStaticMarkup(React.createElement(component.default));

    expect(markup).toContain('<button disabled="">Save</button>');
  });

  test('offers the clear control only for a key that is actually stored', () => {
    const markup = renderToStaticMarkup(React.createElement(component.default));

    // Ключ сохранён только у Tavily — и кнопка есть только у него. Имя кнопки
    // называет движок: двух кнопок «убрать сохранённый ключ» на экране быть не
    // может, их нечем различить ни глазом, ни скринридером.
    expect(markup).toContain('aria-label="Remove the stored Tavily key"');
    expect(markup).not.toContain('aria-label="Remove the stored Exa key"');
    expect(markup).not.toContain('aria-label="Remove stored key"');
  });

  /**
   * `content-factory-next-75xn.6`. Ключ адресуется движком, значит и поле у
   * каждого движка своё: одно поле на область не могло сказать, чей ключ в нём
   * лежит, а подпись из локалей до сих пор называет Tavily.
   */
  describe('ключ на каждый движок', () => {
    test('поле, состояние и плейсхолдер у каждого движка свои', () => {
      const markup = renderToStaticMarkup(
        React.createElement(component.default)
      );

      expect(markup).toContain('Tavily key');
      expect(markup).toContain('Exa key');
      expect(markup).toContain('name="searchApiKey-tavily"');
      expect(markup).toContain('name="searchApiKey-exa"');
      // Сохранённый — «введите новый, чтобы заменить»; пустой — «вставьте ключ».
      expect(markup).toContain('A key is saved — type a new one to replace it');
      expect(markup).toContain('Paste a key');
      expect(markup).toContain('A Tavily key is stored for this workspace');
      expect(markup).toContain('No Exa key of your own');
      // У OpenRouter поля ключа нет, и сказано почему.
      expect(markup).not.toContain('name="searchApiKey-openrouter"');
      expect(markup).toContain('OpenRouter has no search key of its own');
    });

    test('кнопка зовёт дверь с названием движка', async () => {
      deleteDialogMock.mockResolvedValue(true);
      fetchMock.mockResolvedValue({ ok: true });

      await component.removeStoredKey({
        endpoint: '/settings/ai/search-key?provider=exa',
        confirm: async () => true,
        request: fetchMock,
        onRemoved: async () => undefined,
      });

      expect(fetchMock).toHaveBeenCalledWith(
        '/settings/ai/search-key?provider=exa',
        { method: 'DELETE' }
      );
    });

    test('экран зовёт дверь с провайдером, а не общую', () => {
      const source = fs.readFileSync(
        path.resolve(
          __dirname,
          '..',
          'apps/frontend/src/components/settings/ai-provider.component.tsx'
        ),
        'utf8'
      );

      expect(source).toContain(
        '`/settings/ai/search-key?provider=${engine}`'
      );
    });
  });

  /**
   * Три задачи той же вёрсткой, что и модель на роль вызова: подпись, значение
   * или «как в области», одна строка объяснения рядом.
   */
  describe('сервер на задачу', () => {
    test('три селектора, значение по умолчанию и подсказка у каждого', () => {
      const markup = renderToStaticMarkup(
        React.createElement(component.default)
      );

      for (const task of ['research', 'facts', 'discovery']) {
        expect(markup).toContain(`name="search-task-${task}"`);
        expect(markup).toContain(`id="search-task-${task}-hint"`);
        expect(markup).toContain(`aria-describedby="search-task-${task}-hint"`);
      }
      expect(markup).toContain('Collect supports');
      expect(markup).toContain('Check facts');
      expect(markup).toContain('Fresh subjects');
      // «Как в области» — это значение, а не пустая строка без объяснения.
      expect(markup).toContain('>As for the workspace</option>');
      // Сохранённая маршрутизация выбрана, а не потеряна при загрузке.
      const researchRow = markup.slice(
        markup.indexOf('name="search-task-research"'),
        markup.indexOf('name="search-task-facts"')
      );
      expect(researchRow).toContain('<option value="exa" selected="">Exa</option>');
      // Незаданная задача остаётся на сервере области.
      const factsRow = markup.slice(
        markup.indexOf('name="search-task-facts"'),
        markup.indexOf('name="search-task-discovery"')
      );
      expect(factsRow).toContain('<option value="" selected="">');
      expect(markup).toContain('a backend is chosen per task');
      expect(markup).toContain('Exa is recommended for research');
    });
  });

  /**
   * Режим включённых ключей молчал про свой ключ области: поля выключены,
   * кнопки «убрать» нет, и сохранённый ключ не виден ниоткуда.
   */
  describe('включённые ключи', () => {
    test('называет движок спящего ключа и даёт убрать именно его', () => {
      settings = {
        ...settings,
        usageMode: 'included',
        // В этом режиме `searchKeys` описывает ключи оператора, а свои ключи
        // области приходят отдельным полем — иначе их нельзя ни назвать, ни
        // убрать поимённо (`content-factory-next-75xn.6`).
        searchKeys: { tavily: true, exa: true, openrouter: false },
        workspaceSearchKeys: { tavily: true, exa: false, openrouter: false },
      };
      const markup = renderToStaticMarkup(
        React.createElement(component.default)
      );

      expect(markup).toContain('data-search-included-key="true"');
      expect(markup).toContain('This workspace has a search key of its own');
      expect(markup).toContain('data-search-included-engine="tavily"');
      expect(markup).toContain(
        'A Tavily key is stored for this workspace and is not being spent'
      );
      expect(markup).toContain('aria-label="Remove the stored Tavily key"');
      // Ключ системы движком Exa своим не считается и убрать его не предлагают.
      expect(markup).not.toContain('data-search-included-engine="exa"');
      expect(markup).not.toContain('aria-label="Remove the stored Exa key"');
    });

    test('ответ без имён движков оставляет одну кнопку «убрать все»', () => {
      // Старый ответ в кэше браузера: `hasSearchKey` есть, поимённого списка
      // нет. Экран не должен ни молчать, ни выдумывать движок.
      settings = {
        ...settings,
        usageMode: 'included',
        searchProvider: 'openrouter',
        hasSearchKey: true,
        searchKeys: undefined,
        workspaceSearchKeys: undefined,
      };
      const markup = renderToStaticMarkup(
        React.createElement(component.default)
      );

      expect(markup).toContain('data-search-included-key="true"');
      expect(markup).not.toContain('data-search-included-engine=');
      expect(markup).toContain(
        'aria-label="Remove the stored search keys of this workspace"'
      );
    });

    test('без своего ключа строки нет', () => {
      settings = { ...settings, usageMode: 'included', hasSearchKey: false };
      const markup = renderToStaticMarkup(
        React.createElement(component.default)
      );

      expect(markup).not.toContain('data-search-included-key="true"');
    });
  });

  test('раздел объяснён словами: системные ключи, свой ключ, его судьба', () => {
    const markup = renderToStaticMarkup(React.createElement(component.default));

    expect(markup).toContain('data-search-intro="true"');
    expect(markup).toContain('The system keys work by default');
    expect(markup).toContain('nothing has to be typed here');
    expect(markup).toContain('A key of your own is optional');
    expect(markup).toContain('keeps your key stored');
  });

  test('the page action row carries saving alone', () => {
    const markup = renderToStaticMarkup(React.createElement(component.default));

    expect(markup).toContain('>Save</button>');
    expect(markup).not.toContain('>Remove stored key</button>');
    expect(markup).not.toContain('>Remove stored search key</button>');
  });
});

describe('removeStoredKey', () => {
  const request = jest.fn();
  const onRemoved = jest.fn();

  beforeEach(() => {
    request.mockReset().mockResolvedValue({ ok: true });
    onRemoved.mockReset().mockResolvedValue(undefined);
  });

  test('a declined confirmation reaches neither the network nor the cache', async () => {
    const outcome = await component.removeStoredKey({
      endpoint: '/settings/ai/search-key',
      confirm: async () => false,
      request,
      onRemoved,
    });

    expect(outcome).toBe('declined');
    expect(request).not.toHaveBeenCalled();
    expect(onRemoved).not.toHaveBeenCalled();
  });

  test('an approved confirmation deletes exactly the named key', async () => {
    const outcome = await component.removeStoredKey({
      endpoint: '/settings/ai/search-key',
      confirm: async () => true,
      request,
      onRemoved,
    });

    expect(outcome).toBe('removed');
    expect(request).toHaveBeenCalledWith('/settings/ai/search-key', {
      method: 'DELETE',
    });
    expect(onRemoved).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['a rejected request', async () => ({ ok: false })],
    [
      'a request that throws',
      async () => {
        throw new Error('network down');
      },
    ],
  ])('%s never reports the key as removed', async (_name, behaviour) => {
    request.mockImplementation(behaviour);

    const outcome = await component.removeStoredKey({
      endpoint: '/settings/ai/key',
      confirm: async () => true,
      request,
      onRemoved,
    });

    expect(outcome).toBe('failed');
    expect(onRemoved).not.toHaveBeenCalled();
  });
});

test('provider and depth locale keys stay live', () => {
  const localeRoot = path.resolve(
    __dirname,
    '..',
    'libraries/react-shared-libraries/src/translation/locales'
  );
  const localeFiles = fs
    .readdirSync(localeRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(localeRoot, entry.name, 'translation.json'));

  expect(localeFiles).toHaveLength(16);
  for (const localeFile of localeFiles) {
    const locale = JSON.parse(fs.readFileSync(localeFile, 'utf8'));
    expect(locale).toHaveProperty('search_provider');
    expect(locale).toHaveProperty('search_depth');
    expect(locale).toHaveProperty('search_depth_basic');
    expect(locale).toHaveProperty('search_depth_advanced');
  }
});

/**
 * `content-factory-next-75xn.6`: смена сервера больше не трогает ключи.
 *
 * Поле очищалось, пока ключ был один и мог быть отдан движку, чьё имя оказалось
 * в настройке. С адресацией по движку ключ Tavily лежит под `tavily`, и `exa`
 * его не прочитает — очистка поля теперь теряет только набранное.
 */
test('changing the search backend no longer clears any key', () => {
  const source = fs.readFileSync(
    path.resolve(
      __dirname,
      '..',
      'apps/frontend/src/components/settings/ai-provider.component.tsx'
    ),
    'utf8'
  );

  const handler = source.slice(
    source.indexOf('const changeSearchProvider'),
    source.indexOf('// Only OpenRouter publishes a catalogue')
  );
  expect(handler).toContain('setSearchProvider(next);');
  expect(handler).not.toContain('setSearchApiKey');
  expect(handler).not.toMatch(/setSearchApiKeys\(\{\}\)/);
  // Одно, что осталось от прежней защиты, и оно про работу поиска, а не про
  // ключ: движку без ключа нечего тратить, поэтому полоса выключается.
  expect(handler).toContain('setSearchEnabled(false);');
  expect(handler).toContain('hasStoredSearchKey(next)');
  expect(source).toContain('changeSearchProvider(');
});
