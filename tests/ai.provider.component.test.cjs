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
    // Кнопка внутри поля больше не `Button`: та приносит свой `px-[16px]`, из-за
    // которого крестик стоял дальше от края, чем шеврон соседнего списка.
    '@contentfactory/react/choice/control.button': {
      ControlButton: ({
        children,
        density: _density,
        layout: _layout,
        mobileTouchTarget: _touch,
        ...props
      }) => React.createElement('button', props, children),
    },
    // Подсказка рисуется, а не проглатывается: набор проверяет в том числе то,
    // что длинные объяснения уехали именно в неё, а не исчезли.
    '@contentfactory/react/layout/hint': {
      Hint: ({ children, label }) =>
        React.createElement(
          'button',
          { type: 'button', 'data-hint': label },
          children
        ),
    },
    '@contentfactory/frontend/components/settings/settings-section': {
      SettingsSection: ({ title, children }) =>
        React.createElement(
          'section',
          { 'data-settings-section': 'true' },
          title,
          children
        ),
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
      // Почему таблица пуста — теперь в подсказке рядом с её заголовком, а не
      // абзацем под ней (`content-factory-next-75xn.13`).
      expect(markup).toContain('after the first model call');
      expect(markup).toContain(
        'data-hint="Hint: AI usage by role, this period"'
      );
      // Шесть ролей с нулями: список ролей виден раньше полей ниже.
      const roleRows = markup.slice(
        markup.indexOf('data-ai-usage="role"'),
        markup.indexOf('name="provider"')
      );
      for (const role of [
        'classify',
        'extract',
        'research',
        'draft',
        'judge',
        'review',
        'image',
      ]) {
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
      expect(markup).toContain(
        'the one role that needs a model which can draw'
      );
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
      searchApiKeys: { tavily: '', exa: '  exa-key  ' },
      searchTopic: 'general',
      searchDepth: 'advanced',
    });

    expect(payload.searchApiKeys).toEqual({ exa: 'exa-key' });
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
      searchApiKeys: {},
      searchTopic: 'general',
      searchDepth: 'advanced',
    });

    expect(payload).not.toHaveProperty('searchApiKeys');
  });

  /**
   * `content-factory-next-75xn.10`. Экран больше не спрашивает ни про сервер
   * области, ни про сервер на задачу — значит, и отправлять их ему нечем.
   * Дверь их по-прежнему принимает: строки, записанные до этой правки, держат
   * переопределения оператора, и перезаписать их контролом, которого человек
   * не видел, было бы хуже, чем не трогать.
   */
  test('no payload carries the routing the screen no longer asks about', () => {
    for (const usageMode of ['workspace_key', 'included']) {
      const payload = component.buildAiSettingsPayload({
        usageMode,
        provider: 'openrouter',
        apiKey: 'k',
        textModel: '',
        imageModel: '',
        roleModels: {},
        searchEnabled: true,
        searchApiKeys: { exa: 'exa-key' },
        searchTopic: 'general',
        searchDepth: 'advanced',
      });

      expect(payload).not.toHaveProperty('searchProvider');
      expect(payload).not.toHaveProperty('searchTaskProviders');
    }
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
        'ai_usage_mode',
        'ai_usage_included',
        'ai_usage_workspace_key',
        'ai_usage_zero_quota',
      ])
    );
  });

  /**
   * `content-factory-next-75xn.12`. Владелец 13.09.2026: «мы смешали два
   * сценария». На ключах системы заполнять нечего, а экран рисовал девять
   * выключенных полей с чужими значениями — форму, которая выглядит формой и
   * отказывается ею быть. Поля теперь отсутствуют, а не выключены, и одна
   * строка говорит, почему.
   */
  /**
   * `content-factory-next-97dq.6`. Владелец 18.09.2026: «если выбрана
   * глобальная настройка, что ключи системы, то зачем это все показывать… всё
   * это нужно прятать». На ключах системы ни одно из этих полей ни на что не
   * влияет: поиск идёт на ключах системы, а свой ключ области спит.
   */
  test('the system-keys mode hides the whole key block and says one sentence', () => {
    settings = {
      ...settings,
      usageMode: 'included',
      // У области есть свой ключ, и он всё равно не показывается: он спит.
      workspaceSearchKeys: { tavily: true, exa: false, openrouter: false },
      searchKeys: { tavily: true, exa: false, openrouter: false },
    };
    const markup = renderToStaticMarkup(React.createElement(component.default));

    expect(markup).toContain(
      'Search runs on the system keys and spends the included allowance.'
    );
    expect(markup).toContain('data-search-system-keys="true"');
    for (const field of [
      'name="searchApiKey-tavily"',
      'name="searchApiKey-exa"',
      'data-search-routing="true"',
      'Return Tavily to the system key',
      'Tavily key',
      'Exa key',
      'name="apiKey"',
      'name="provider"',
      // Выключателя поиска здесь тоже нет: на ключах системы поиск включён
      // ровно тогда, когда у оператора есть ключ, и флаг области сервер в этом
      // режиме не читает (`content-factory-next-75xn.26`, после `.20`).
      'name="searchEnabled"',
    ]) {
      expect(markup).not.toContain(field);
    }
  });

  test('без единого ключа на своём ключе строка зовёт того, кто может их задать', () => {
    settings = {
      ...settings,
      usageMode: 'workspace_key',
      searchEnabled: false,
      hasSearchKey: false,
      searchKeys: { tavily: false, exa: false, openrouter: false },
      workspaceSearchKeys: { tavily: false, exa: false, openrouter: false },
      searchTaskProviders: {},
    };
    const markup = renderToStaticMarkup(React.createElement(component.default));

    expect(markup).toContain('No search engine has a key');
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
    expect(payload.searchApiKeys).toEqual({
      tavily: 'workspace-search-secret',
    });
    expect(payload).not.toHaveProperty('textModel');
    expect(payload).not.toHaveProperty('imageModel');
    expect(JSON.stringify(payload)).not.toContain('workspace-secret');
  });

  /**
   * `content-factory-next-75xn.4`: в режиме включённых ключей экран показывает
   * значения оператора, и вернуть их серверу — значит записать чужой движок
   * как свой. Сервер их в этом режиме игнорирует; экран их и не отправляет.
   * Включён ли поиск вообще — тоже не отправляется: на ключах системы это
   * решает наличие ключа у оператора, а в поле формы лежит именно его
   * состояние, а не выбор области. Записать его обратно значило бы стереть
   * «поиск выключен», выбранное областью на своём ключе.
   */
  test('included payload sends search settings independently of generation', () => {
    const payload = component.buildAiSettingsPayload({
      usageMode: 'included',
      provider: 'openrouter',
      apiKey: '',
      textModel: '',
      imageModel: '',
      roleModels: {},
      searchEnabled: false,
      searchApiKeys: {},
      searchTopic: 'news',
      searchDepth: 'basic',
    });

    expect(payload).toMatchObject({
      usageMode: 'included',
      searchEnabled: false,
      searchTopic: 'news',
      searchDepth: 'basic',
    });
    for (const field of [
      'searchProvider',
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

  test('does not promise OpenRouter as an automatic search fallback', () => {
    const markup = renderToStaticMarkup(React.createElement(component.default));

    expect(markup).not.toContain('Automatic fallback is available through');
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
    expect(markup).toContain('aria-label="Return Tavily to the system key"');
    expect(markup).not.toContain('aria-label="Return Exa to the system key"');
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
      // У OpenRouter поля поискового ключа нет; в automatic fallback он не входит.
      expect(markup).not.toContain('name="searchApiKey-openrouter"');
      expect(markup).not.toContain('OpenRouter has no search key of its own');
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

      expect(source).toContain('`/settings/ai/search-key?provider=${engine}`');
    });
  });

  /**
   * `content-factory-next-75xn.10`: три селектора «задача → сервер» и селектор
   * «Поисковый сервер» заменены одной строкой.
   *
   * Владелец 13.09.2026: «зачем мы даём эти настройки, если мы с тобой уже
   * знаем, как лучше сделать?» и «а зачем нам выбирать поисковой сервер?».
   * Рекомендация была напечатана прямо над контролами, которые её спрашивали.
   */
  describe('движок выбирается сам, а экран говорит какой', () => {
    test('вместо селекторов — одна строка с задачей и её движком', () => {
      const markup = renderToStaticMarkup(
        React.createElement(component.default)
      );

      for (const task of ['research', 'facts', 'discovery']) {
        expect(markup).not.toContain(`name="search-task-${task}"`);
      }
      expect(markup).not.toContain('name="searchProvider"');

      expect(markup).toContain('data-search-routing="true"');
      // Ключ есть только у Tavily, поэтому и ресерч уходит к нему: строка
      // считается по сохранённым ключам, а не по табличке умолчаний.
      expect(markup).toContain('Collect supports — Tavily');
      expect(markup).toContain('Check facts — Tavily');
      expect(markup).toContain('the keys that are stored');
    });

    test('с ключом Exa ресерч называет Exa, а проверка фактов — Tavily', () => {
      settings = {
        ...settings,
        searchKeys: { tavily: true, exa: true, openrouter: false },
        searchTaskProviders: {},
      };
      const markup = renderToStaticMarkup(
        React.createElement(component.default)
      );

      expect(markup).toContain('Collect supports — Exa');
      expect(markup).toContain('Check facts — Tavily');
    });

    test('без единого ключа строка говорит, что искать нечем', () => {
      settings = {
        ...settings,
        hasSearchKey: false,
        searchKeys: { tavily: false, exa: false, openrouter: false },
        searchTaskProviders: {},
      };
      const markup = renderToStaticMarkup(
        React.createElement(component.default)
      );

      expect(markup).toContain('No search engine has a key');
      expect(markup).not.toContain('Collect supports — ');
    });
  });

  /**
   * `content-factory-next-75xn.26`. Владелец 13.09.2026: «если я выбираю ключи
   * системы — зачем кнопки „Убрать ключ Tavily“, „Убрать ключ Exa“? Для
   * суперадмина они есть в его админке, обычному человеку зачем?» И второе:
   * тематика с глубиной в этом режиме не настраиваются нигде — тему выбирает
   * задача, глубина `advanced` (решение владельца 10 в плане волны).
   */
  describe('включённые ключи', () => {
    /**
     * `content-factory-next-97dq.6`, решение владельца 18.09.2026. Прежнее
     * правило (`xmfb.8`) оставляло свой ключ работать в обоих режимах; теперь
     * он спит и возвращается вместе с «Своим ключом». Экран обязан показать
     * именно возвращение, а не «ключ пропал»: сервер присылает присутствие
     * ключа (`workspaceSearchKeys`) в обоих режимах ровно ради этой минуты.
     */
    test('a dormant key is hidden on the system keys and comes back with «Свой ключ»', () => {
      const withDormantKey = {
        ...settings,
        // На ключах системы область платит включённым лимитом, поэтому карта
        // доступных ключей — операторская.
        searchKeys: { tavily: true, exa: false, openrouter: false },
        workspaceSearchKeys: { tavily: true, exa: false, openrouter: false },
      };
      settings = { ...withDormantKey, usageMode: 'included' };
      const included = renderToStaticMarkup(
        React.createElement(component.default)
      );

      expect(included).not.toContain('Tavily key');
      expect(included).not.toContain('Own key');

      settings = { ...withDormantKey, usageMode: 'workspace_key' };
      const ownKeys = renderToStaticMarkup(
        React.createElement(component.default)
      );

      expect(ownKeys).toContain('Tavily key — Own key');
      expect(ownKeys).toContain('aria-label="Return Tavily to the system key"');
      expect(ownKeys).toContain('Exa key — On the system key');
    });

    test('без своего ключа поле прямо называет ключ системы', () => {
      settings = {
        ...settings,
        usageMode: 'workspace_key',
        hasSearchKey: false,
        workspaceSearchKeys: { tavily: false, exa: false, openrouter: false },
      };
      const markup = renderToStaticMarkup(
        React.createElement(component.default)
      );

      expect(markup).toContain('Tavily key — On the system key');
    });

    /**
     * Владелец 18.09.2026 о крестике: «должно быть пояснение при наведении на
     * крестик… для обычного пользователя не должно быть возможности работать
     * без ключа». Имя кнопки называет движок, подсказка — что будет после
     * нажатия; ни то, ни другое не заменяет другого.
     */
    test('у крестика есть и имя, и объяснение, что поле вернётся на ключ системы', () => {
      const markup = renderToStaticMarkup(
        React.createElement(component.default)
      );
      const sentence =
        'Press × and the field returns to the system key. Search is never left without a key.';
      const explain =
        'The × at the right of the field removes your own Tavily key: the engine goes back to the system key, so there is always something to search with.';

      // Имя — короткое и называет движок: два одинаковых крестика на экране
      // различить было бы нечем.
      expect(markup).toContain('aria-label="Return Tavily to the system key"');
      // При наведении — что останется после нажатия, а не второе имя.
      expect(markup).toContain(`title="${sentence}"`);
      // И то же самое с клавиатуры, подсказкой со своим именем.
      expect(markup).toContain(
        'data-hint="Hint: Return Tavily to the system key"'
      );
      // Подсказка «?» называет сам крестик и не повторяет строку с него
      // дословно: владелец 22.09.2026 прочёл «Нажмёте» как «нажмите
      // вопросик» (`97dq.34`).
      expect(markup).toContain(explain);
      expect(markup.split(sentence).length - 1).toBe(1);
      // Крестика и подсказки нет там, где своего ключа нет.
      expect(markup).not.toContain('aria-label="Return Exa to the system key"');
      expect(markup).not.toContain(
        'data-hint="Hint: Return Exa to the system key"'
      );
    });

    test('тематика и глубина поиска не зависят от режима генерации', () => {
      settings = { ...settings, usageMode: 'included' };
      const markup = renderToStaticMarkup(
        React.createElement(component.default)
      );

      expect(markup).toContain('name="searchTopic"');
      expect(markup).toContain('name="searchDepth"');
      settings = { ...settings, usageMode: 'workspace_key' };
      const ownKeys = renderToStaticMarkup(
        React.createElement(component.default)
      );
      expect(ownKeys).toContain('name="searchTopic"');
      expect(ownKeys).toContain('name="searchDepth"');
    });
  });

  /**
   * `content-factory-next-75xn.13`. Владелец 13.09.2026: «у нас же есть
   * подсказки, знаки вопросика… а почему мы не используем их здесь?» и «этот
   * текст не на всю ширину настроек, из-за этого занимает много места».
   * Четыре абзаца объяснения стояли постоянно и в узкой колонке настроек
   * ломались на десяток строк; решающее осталось строкой, справочное уехало
   * в подсказку.
   */
  test('объяснения живут в подсказках, а решающее — строкой', () => {
    const markup = renderToStaticMarkup(React.createElement(component.default));

    // То, что нужно в момент чтения: source рядом с каждым полем.
    expect(markup).toContain('Tavily key — Own key');
    expect(markup).toContain('Exa key — On the system key');
    // Справочное — в подсказке, с собственным именем для скринридера.
    expect(markup).toContain('data-hint="Hint: Web research"');
    expect(markup).toContain(
      'a saved key overrides the system key for that engine alone'
    );
    // Абзац во всю колонку с собственной мерой строки ушёл вместе с ними.
    expect(markup).not.toContain('data-search-intro');
    expect(markup).not.toContain('max-w-[62ch]');
  });

  /**
   * `content-factory-next-97dq.6`. Владелец 18.09.2026: «зачем подсказка вся
   * заглавными буквами?» Подсказка стояла ребёнком `<h5>` с `uppercase`, а он
   * наследуется — пузырь кричал на всех трёх заголовках блоков. Заголовок
   * остаётся заглавным, объяснение — нет, и проверяется это разметкой, а не
   * снимком: подсказки внутри `<h5>` быть не должно.
   */
  test('подсказка заголовка блока стоит рядом с ним, а не внутри верхнего регистра', () => {
    const markup = renderToStaticMarkup(React.createElement(component.default));

    const headings = markup.match(/<h5[^>]*>[\s\S]*?<\/h5>/g) ?? [];
    expect(headings.length).toBeGreaterThan(0);
    for (const heading of headings) {
      expect(heading).toContain('uppercase');
      expect(heading).not.toContain('data-hint');
    }
    // И при этом подсказки заголовков на экране есть — обе.
    expect(markup).toContain('data-hint="Hint: Web research"');
    expect(markup).toContain('data-hint="Hint: Usage and call roles"');
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
