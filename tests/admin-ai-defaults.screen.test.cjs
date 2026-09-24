'use strict';

/**
 * Экран суперадмина «Ключи системы» — `content-factory-next-75xn.16`.
 *
 * Решение владельца 13.09.2026: «настройка ключей по умолчанию доступна только
 * суперадминам, а для других можно выбрать использовать ключ по умолчанию или
 * использовать свой ключ». Здесь держатся четыре обещания этого экрана.
 *
 *  1. Не суперадмин видит отказ и не делает запроса. Запрос всё равно вернул
 *     бы 403, но экран, который его отправляет, — это экран, считающий попытку
 *     нормальной, и в логе он неотличим от настоящей.
 *  2. У поля ключа три состояния, а не два, и они нарисованы по-разному.
 *     Пустое поле на работающем инстансе — это ловушка: суперадмин решит, что
 *     ключа нет, и вставит второй.
 *  3. Значение ключа не попадает на экран никогда. Проверяется тем, что даже
 *     ответ, в котором ключ по ошибке приехал, ничего не печатает.
 *  4. Удаление стучится в свою дверь со своим движком: ключ адресуется
 *     движком, и «убрать ключ» без названия — это чужой удалённый ключ.
 */

const React = require('react');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/',
});
for (const key of ['window', 'document', 'navigator']) {
  Object.defineProperty(global, key, {
    configurable: true,
    value: key === 'window' ? dom.window : dom.window[key],
  });
}
global.IS_REACT_ACT_ENVIRONMENT = true;

const {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} = require('@testing-library/react');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');

const FILE =
  'apps/frontend/src/components/admin/admin-ai-defaults.component.tsx';

let superAdmin = true;
let response;
let swrKey;
let fetchCalls;
let confirmed = true;

const mocks = () => ({
  swr: {
    __esModule: true,
    default: (key) => {
      swrKey = key;
      return {
        data: response,
        isLoading: false,
        error: null,
        mutate: async () => {},
      };
    },
  },
  '@contentfactory/helpers/utils/custom.fetch': {
    useFetch: () => async (url, init) => {
      fetchCalls.push({ url, method: init?.method || 'GET', body: init?.body });
      return { ok: true, json: async () => response };
    },
  },
  '@contentfactory/frontend/components/layout/user.context': {
    useUser: () => (superAdmin ? { id: 'u', isSuperAdmin: true } : { id: 'u' }),
  },
  '@contentfactory/react/helpers/variable.context': {
    useVariables: () => ({ language: 'ru', isSecured: true }),
  },
  '@contentfactory/react/translation/get.transation.service.client': {
    useT: () => (key, fallback) => fallback ?? key,
  },
  '@contentfactory/react/toaster/toaster': {
    useToaster: () => ({ show: () => {} }),
  },
  '@contentfactory/react/helpers/delete.dialog': {
    deleteDialog: async () => confirmed,
  },
  '../translation/translated-label': {
    TranslatedLabel: ({ label, children }) =>
      React.createElement(React.Fragment, null, label, children),
  },
  'react-hook-form': {
    useFormContext: () => null,
    useForm: () => ({ handleSubmit: () => () => {} }),
    FormProvider: ({ children }) => children,
  },
});

const {
  AdminAiDefaultsComponent,
  buildAiDefaultsPayload,
  keyOrigin,
} = loadWithMocks(FILE, mocks());

const defaults = (overrides = {}) => ({
  provider: 'openai',
  textModel: null,
  imageModel: null,
  roleModels: {},
  searchTaskProviders: {},
  monthlyOperations: null,
  hasKey: false,
  searchKeys: { tavily: false, openrouter: false, exa: false },
  fromEnvironment: {
    apiKey: false,
    provider: false,
    textModel: false,
    imageModel: false,
    monthlyOperations: false,
    searchKeys: { tavily: false, openrouter: false, exa: false },
  },
  updatedAt: null,
  updatedByUserId: null,
  ...overrides,
});

const draw = () => render(React.createElement(AdminAiDefaultsComponent));
const field = (name) => document.querySelector(`[data-key-field="${name}"]`);
const origin = (name) => field(name)?.getAttribute('data-key-origin');

beforeEach(() => {
  superAdmin = true;
  confirmed = true;
  swrKey = undefined;
  fetchCalls = [];
  response = defaults();
});

afterEach(cleanup);

describe('экран ключей инстанса пускает только суперадмина', () => {
  it('обычному администратору показывает отказ и не открывает дверь', () => {
    superAdmin = false;
    response = undefined;
    draw();

    expect(screen.getByText('You do not have access to this page.')).toBeTruthy();
    // Ключ SWR — это и есть решение «ходить или нет»: `null` означает, что
    // запроса не будет вовсе, а не что он будет и вернёт 403.
    expect(swrKey).toBeNull();
    expect(fetchCalls).toEqual([]);
    // И ни одного поля, в которое можно было бы что-то вставить.
    expect(document.querySelectorAll('input').length).toBe(0);
  });

  it('суперадмину читает состояние инстанса', () => {
    draw();
    expect(swrKey).toBe('/admin/ai-defaults');
  });
});

describe('у поля ключа три состояния, и они видны по-разному', () => {
  it('различает «задан здесь», «задан на сервере» и «не задан»', () => {
    response = defaults({
      hasKey: true,
      searchKeys: { tavily: false, openrouter: false, exa: false },
      fromEnvironment: {
        apiKey: false,
        provider: false,
        textModel: false,
        imageModel: false,
        monthlyOperations: false,
        searchKeys: { tavily: true, openrouter: false, exa: false },
      },
    });
    draw();

    expect(origin('admin-ai-api-key')).toBe('screen');
    expect(origin('admin-ai-search-key-tavily')).toBe('environment');
    expect(origin('admin-ai-search-key-exa')).toBe('absent');

    // Разные не только атрибутом: маркер и объяснение под полем — разные
    // слова, и все три читаются со скринридером, потому что живут в `helper`,
    // а он связан с полем через `aria-describedby`.
    const words = (name) => field(name).textContent;
    expect(words('admin-ai-api-key')).toContain('Задан здесь');
    expect(words('admin-ai-search-key-tavily')).toContain('Задан на сервере');
    expect(words('admin-ai-search-key-exa')).toContain('Не задан');
    expect(words('admin-ai-search-key-tavily')).toContain(
      'переменной окружения'
    );

    // Убрать можно только то, что сохранено здесь: ключ сервера этой дверью не
    // убирается, и кнопки, которая обещала бы обратное, нет.
    expect(
      field('admin-ai-api-key').querySelector('button[aria-label]:not([data-hint-trigger])')
    ).toBeTruthy();
    expect(
      field('admin-ai-search-key-tavily').querySelector('button[aria-label]:not([data-hint-trigger])')
    ).toBeNull();
    expect(
      field('admin-ai-search-key-exa').querySelector('button[aria-label]:not([data-hint-trigger])')
    ).toBeNull();
  });

  it('считает источник ключа в одном месте, и сохранённое сильнее окружения', () => {
    expect(keyOrigin(true, true)).toBe('screen');
    expect(keyOrigin(true, false)).toBe('screen');
    expect(keyOrigin(false, true)).toBe('environment');
    expect(keyOrigin(false, false)).toBe('absent');
  });

  it('пустое поле на работающем инстансе не выглядит как отсутствие ключа', () => {
    response = defaults({
      fromEnvironment: {
        apiKey: true,
        provider: false,
        textModel: false,
        imageModel: false,
        monthlyOperations: false,
        searchKeys: { tavily: false, openrouter: false, exa: false },
      },
    });
    draw();

    expect(origin('admin-ai-api-key')).toBe('environment');
    expect(field('admin-ai-api-key').querySelector('input').value).toBe('');
    expect(field('admin-ai-api-key').textContent).not.toContain('Не задан');
  });
});

describe('значение ключа не показывается никогда', () => {
  it('не печатает ключ даже из ответа, в котором он по ошибке приехал', () => {
    response = {
      ...defaults({ hasKey: true, searchKeys: { tavily: true, exa: true } }),
      apiKey: 'sk-should-never-be-drawn',
      searchApiKeys: { tavily: 'tvly-secret', exa: 'exa-secret' },
    };
    draw();

    const markup = document.body.innerHTML;
    expect(markup).not.toContain('sk-should-never-be-drawn');
    expect(markup).not.toContain('tvly-secret');
    expect(markup).not.toContain('exa-secret');
    // Поля ключей пусты: экран знает про наличие, а не про значение.
    for (const name of [
      'admin-ai-api-key',
      'admin-ai-search-key-tavily',
      'admin-ai-search-key-exa',
    ]) {
      expect(field(name).querySelector('input').value).toBe('');
    }
  });
});

describe('удаление стучится в свою дверь', () => {
  const clickRemove = async (label) => {
    await act(async () => {
      fireEvent.click(screen.getByLabelText(label));
    });
  };

  beforeEach(() => {
    response = defaults({
      hasKey: true,
      searchKeys: { tavily: true, openrouter: false, exa: true },
    });
  });

  it('ключ генерации убирается своей дверью без движка', async () => {
    draw();
    await clickRemove('Убрать сохранённый ключ генерации');

    expect(fetchCalls).toEqual([
      { url: '/admin/ai-defaults/key', method: 'DELETE', body: undefined },
    ]);
  });

  it('каждый поисковый движок называет себя в строке запроса', async () => {
    draw();
    await clickRemove('Убрать сохранённый ключ Tavily');
    await clickRemove('Убрать сохранённый ключ Exa');

    expect(fetchCalls.map((call) => call.url)).toEqual([
      '/admin/ai-defaults/search-key?provider=tavily',
      '/admin/ai-defaults/search-key?provider=exa',
    ]);
    expect(fetchCalls.every((call) => call.method === 'DELETE')).toBe(true);
  });

  it('отклонённое подтверждение не доходит до сети', async () => {
    confirmed = false;
    draw();
    await clickRemove('Убрать сохранённый ключ Tavily');

    expect(fetchCalls).toEqual([]);
  });
});

describe('что уходит в дверь сохранения', () => {
  const form = (overrides = {}) => ({
    provider: 'openai',
    apiKey: '',
    textModel: '',
    imageModel: '',
    monthlyOperations: '',
    searchApiKeys: {},
    ...overrides,
  });

  it('пустой ключ не отправляется вовсе — это «оставить сохранённый»', () => {
    const payload = buildAiDefaultsPayload(form({ apiKey: '   ' }));
    expect(payload).not.toHaveProperty('apiKey');
    expect(payload).not.toHaveProperty('searchApiKeys');
  });

  it('отправляет только те поисковые ключи, которые набраны в этот заход', () => {
    const payload = buildAiDefaultsPayload(
      form({ searchApiKeys: { tavily: ' tvly-typed ', exa: '' } })
    );
    expect(payload.searchApiKeys).toEqual({ tavily: 'tvly-typed' });
  });

  it('ноль операций — это ответ, а пустое поле — его отсутствие', () => {
    expect(
      buildAiDefaultsPayload(form({ monthlyOperations: '0' })).monthlyOperations
    ).toBe(0);
    expect(
      buildAiDefaultsPayload(form({ monthlyOperations: '' }))
    ).not.toHaveProperty('monthlyOperations');
    expect(
      buildAiDefaultsPayload(form({ monthlyOperations: '12.7' }))
        .monthlyOperations
    ).toBe(12);
  });

  it('«без предела» уходит состоянием, без числа (97dq.27)', () => {
    const on = buildAiDefaultsPayload(
      form({ monthlyOperationsUnlimited: true, monthlyOperations: '45' })
    );
    expect(on.monthlyOperationsUnlimited).toBe(true);
    expect(on).not.toHaveProperty('monthlyOperations');

    const off = buildAiDefaultsPayload(
      form({ monthlyOperationsUnlimited: false, monthlyOperations: '45' })
    );
    expect(off).toMatchObject({
      monthlyOperationsUnlimited: false,
      monthlyOperations: 45,
    });
    // Выключенный без числа не уходит вовсе (P3-7).
    expect(
      buildAiDefaultsPayload(
        form({ monthlyOperationsUnlimited: false, monthlyOperations: '' })
      )
    ).not.toHaveProperty('monthlyOperationsUnlimited');
    // Форма, собранная до переключателя, о нём не говорит.
    expect(buildAiDefaultsPayload(form())).not.toHaveProperty(
      'monthlyOperationsUnlimited'
    );
  });

  it('экран показывает переключатель, а при «без предела» — слова вместо поля', () => {
    response = defaults({ monthlyOperationsUnlimited: true });
    draw();
    const box = document.querySelector('input[name="admin-ai-monthly-unlimited"]');
    expect(box).not.toBeNull();
    expect(box.checked).toBe(true);
    expect(document.querySelector('#admin-ai-monthly-operations')).toBeNull();
    expect(
      document.querySelector('[data-admin-ai-unlimited="true"]').textContent
    ).toContain('без счёта операций');
  });

  it('сохраняет по кнопке и стирает набранные ключи из формы', async () => {
    draw();
    const input = field('admin-ai-api-key').querySelector('input');
    await act(async () => {
      fireEvent.change(input, { target: { value: 'sk-typed-now' } });
    });
    expect(input.value).toBe('sk-typed-now');

    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]).toMatchObject({
      url: '/admin/ai-defaults',
      method: 'POST',
    });
    expect(JSON.parse(fetchCalls[0].body).apiKey).toBe('sk-typed-now');
    // Секрет не живёт в состоянии экрана дольше, чем длится сохранение.
    expect(field('admin-ai-api-key').querySelector('input').value).toBe('');
  });
});

describe('экран объясняет сам себя', () => {
  it('называет, кого он касается, и что ключи не показываются', () => {
    draw();
    const text = document.body.textContent;

    expect(text).toContain('Ключи системы');
    expect(text).toContain('«Свой ключ»');
    expect(text).toContain('не показывается больше никогда');
  });

  it('говорит, что сохраняется само, а что — по кнопке', () => {
    draw();
    expect(
      document.querySelector('[data-autosave-note="true"]').textContent
    ).toContain('сохраняются сами');
  });

  it('говорит, почему у OpenRouter нет поля ключа', () => {
    draw();
    expect(
      document.querySelector('[data-openrouter-no-search-key="true"]')
        .textContent
    ).toContain('ключом генерации');
  });

  it('про включённые операции говорит и про ноль, и про подписку', () => {
    draw();
    const text = document.body.textContent;
    expect(text).toContain('пространства без подписки');
    expect(text).toContain('Ноль');
  });
});

/**
 * `content-factory-next-75xn.25`, `.27`. Записи владельца 13.09.2026: «у нас
 * вроде должен быть OpenRouter, но почему-то по умолчанию выбран OpenAI»,
 * «почему бы там не показывать текущее по умолчанию установленное число?» и
 * «непонятный блок» про ключ генерации, оторванный от провайдера.
 */
describe('поля показывают то, чем инстанс работает прямо сейчас', () => {
  const withEffective = (overrides = {}) =>
    defaults({
      // Строка этого экрана пуста: всё действующее пришло с сервера.
      provider: null,
      effective: {
        provider: 'openrouter',
        textModel: 'openai/gpt-5.6-luna',
        imageModel: null,
        monthlyOperations: 50,
        ...overrides,
      },
      fromEnvironment: {
        apiKey: false,
        provider: true,
        textModel: true,
        imageModel: false,
        monthlyOperations: true,
        searchKeys: { tavily: false, openrouter: false, exa: false },
      },
    });

  const control = (selector) => document.querySelector(selector);

  it('ставит в поле провайдера значение сервера, а не собственное «openai»', () => {
    response = withEffective();
    draw();

    expect(control('#admin-ai-provider').value).toBe('openrouter');
    expect(control('[name="admin-ai-text-model"]').value).toBe(
      'openai/gpt-5.6-luna'
    );
    expect(control('[name="admin-ai-monthly-operations"]').value).toBe('50');
  });

  it('называет источник значения, а не выдаёт его за набранное здесь', () => {
    response = withEffective();
    draw();

    const state = (name) =>
      document.querySelector(`[data-value-field="${name}"]`);
    expect(state('admin-ai-provider').getAttribute('data-value-origin')).toBe(
      'environment'
    );
    expect(state('admin-ai-provider').textContent).toContain('Задан на сервере');
    expect(
      state('admin-ai-monthly-operations').getAttribute('data-value-origin')
    ).toBe('environment');
  });

  it('без действующих значений не выдумывает число', () => {
    response = defaults();
    draw();

    expect(control('[name="admin-ai-monthly-operations"]').value).toBe('');
    expect(
      document
        .querySelector('[data-value-field="admin-ai-monthly-operations"]')
        .getAttribute('data-value-origin')
    ).toBe('absent');
  });

  it('понимает ответ сервера, который ещё не умеет говорить действующее', () => {
    response = defaults({ provider: 'openrouter', monthlyOperations: 7 });
    draw();

    expect(control('#admin-ai-provider').value).toBe('openrouter');
    expect(control('[name="admin-ai-monthly-operations"]').value).toBe('7');
  });

  it('держит ключ генерации в карточке провайдера, а не отдельным блоком', () => {
    response = defaults();
    draw();

    const providerCard = control('#admin-ai-provider').closest('section');
    expect(
      providerCard.querySelector('[data-key-field="admin-ai-api-key"]')
    ).toBeTruthy();
    // Поисковые ключи остались своей карточкой: у них своя жизнь и свой счёт.
    const searchCard = document
      .querySelector('[data-key-field="admin-ai-search-key-tavily"]')
      .closest('section');
    expect(searchCard).not.toBe(providerCard);
    expect(
      searchCard.querySelector('[data-key-field="admin-ai-api-key"]')
    ).toBeNull();
  });
});

describe('экран сохраняет сам, а ключи — только по кнопке', () => {
  it('смена провайдера уходит на сервер без нажатия «Сохранить»', async () => {
    response = defaults({ provider: 'openai' });
    draw();

    await act(async () => {
      fireEvent.change(document.querySelector('#admin-ai-provider'), {
        target: { value: 'openrouter' },
      });
    });

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]).toMatchObject({
      url: '/admin/ai-defaults',
      method: 'POST',
    });
    expect(JSON.parse(fetchCalls[0].body).provider).toBe('openrouter');
  });

  it('набранное число сохраняется, когда поле отпущено', async () => {
    response = defaults();
    draw();
    const field = document.querySelector(
      '[name="admin-ai-monthly-operations"]'
    );

    await act(async () => {
      fireEvent.change(field, { target: { value: '120' } });
    });
    expect(fetchCalls).toEqual([]);

    await act(async () => {
      fireEvent.blur(field);
    });

    expect(JSON.parse(fetchCalls[0].body).monthlyOperations).toBe(120);
  });

  it('снятое «без предела» без числа ничего не сохраняет и просит число (P3-7)', async () => {
    response = defaults({ monthlyOperationsUnlimited: true });
    draw();
    const box = document.querySelector('input[name="admin-ai-monthly-unlimited"]');
    await act(async () => {
      fireEvent.click(box);
    });
    // Ни одного запроса: одно `false` сервер записал бы как «не задано».
    expect(fetchCalls).toEqual([]);
    expect(
      document.querySelector('[data-admin-ai-unlimited-pending="true"]').textContent
    ).toContain('Впишите число');
    const field = document.querySelector('[name="admin-ai-monthly-operations"]');
    await act(async () => {
      fireEvent.blur(field);
    });
    // Пустое поле отпущено: автосохранение уходит, но без переключателя и
    // без числа, и сервер остаётся на «без предела».
    for (const call of fetchCalls) {
      const body = JSON.parse(call.body);
      expect(body).not.toHaveProperty('monthlyOperationsUnlimited');
      expect(body).not.toHaveProperty('monthlyOperations');
    }
    const before = fetchCalls.length;
    await act(async () => {
      fireEvent.change(field, { target: { value: '30' } });
    });
    await act(async () => {
      fireEvent.blur(field);
    });
    expect(JSON.parse(fetchCalls[before].body)).toMatchObject({
      monthlyOperationsUnlimited: false,
      monthlyOperations: 30,
    });
  });

  it('снятое «без предела» с прежним числом сохраняется вместе с ним (P3-7)', async () => {
    response = defaults({ monthlyOperations: 45 });
    const view = draw();
    const box = () =>
      document.querySelector('input[name="admin-ai-monthly-unlimited"]');
    await act(async () => {
      fireEvent.click(box());
    });
    expect(JSON.parse(fetchCalls[0].body)).toMatchObject({
      monthlyOperationsUnlimited: true,
    });
    // The server answers «без предела» and no number; the field keeps 45.
    response = defaults({ monthlyOperationsUnlimited: true });
    view.rerender(React.createElement(AdminAiDefaultsComponent));
    await act(async () => {
      fireEvent.click(box());
    });
    expect(JSON.parse(fetchCalls[1].body)).toMatchObject({
      monthlyOperationsUnlimited: false,
      monthlyOperations: 45,
    });
  });

  it('автосохранение не несёт ключей ни при каком состоянии формы', async () => {
    response = defaults();
    draw();

    await act(async () => {
      fireEvent.change(
        document.querySelector('[data-key-field="admin-ai-api-key"] input'),
        { target: { value: 'sk-typed-now' } }
      );
    });
    await act(async () => {
      fireEvent.change(document.querySelector('#admin-ai-provider'), {
        target: { value: 'openrouter' },
      });
    });

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].body).not.toContain('sk-typed-now');
    expect(JSON.parse(fetchCalls[0].body)).not.toHaveProperty('apiKey');
    // И набранный ключ остался в поле: автосохранение его не трогает.
    expect(
      document.querySelector('[data-key-field="admin-ai-api-key"] input').value
    ).toBe('sk-typed-now');
  });

  it('смена провайдера не тащит чужие идентификаторы моделей', async () => {
    response = defaults({
      provider: 'openai',
      textModel: 'gpt-4.1',
      effective: {
        provider: 'openai',
        textModel: 'gpt-4.1',
        imageModel: null,
        monthlyOperations: null,
      },
    });
    draw();
    expect(document.querySelector('[name="admin-ai-text-model"]').value).toBe(
      'gpt-4.1'
    );

    await act(async () => {
      fireEvent.change(document.querySelector('#admin-ai-provider'), {
        target: { value: 'openrouter' },
      });
    });

    expect(document.querySelector('[name="admin-ai-text-model"]').value).toBe(
      ''
    );
    expect(JSON.parse(fetchCalls[0].body).textModel).toBe('');
  });
});

/**
 * `content-factory-next-97dq.62`, вариант B холста: главное — парами на двух
 * колонках от 1024px (провайдер · ключ, текст · картинки, режим · запасная),
 * у каждого названия «?» с одной строкой, состояние значения — на поверхности.
 */
describe('ключи и ИИ по умолчанию: поля парами, у каждого «?»', () => {
  it('шесть главных полей в одной сетке, две колонки от lg, в порядке пар', () => {
    response = defaults();
    draw();
    const grid = document.querySelector('[data-admin-ai-main-fields="true"]');
    expect(grid.className).toContain('grid-cols-1');
    expect(grid.className).toContain('lg:grid-cols-2');
    const cells = Array.from(grid.children).map(
      (cell) =>
        cell.getAttribute('data-key-field') ??
        (cell.getAttribute('data-admin-ai-text-chain') ? 'flex' : null) ??
        cell.querySelector('input, select')?.id
    );
    expect(cells).toEqual([
      'admin-ai-provider',
      'admin-ai-api-key',
      'admin-ai-text-model',
      'admin-ai-image-model',
      'flex',
      'admin-ai-text-fallback-model',
    ]);
  });

  it('у каждого параметра экрана есть подсказка, а в имя поля она не входит', () => {
    response = defaults();
    draw();
    // Подписи из i18next набор читает запасным английским словом.
    for (const name of [
      'provider',
      'ключ генерации',
      'text model',
      'image model',
      'сначала дешёвый уровень flex',
      'запасная модель',
      'ключ tavily',
      'ключ exa',
      'включённых операций в месяц',
    ]) {
      const hint = screen.getByRole('button', { name: `Подсказка: ${name}` });
      expect(hint.getAttribute('data-hint-trigger')).toBe('true');
      expect(hint.closest('label')).toBeNull();
    }
    // Поля по-прежнему названы своей подписью.
    expect(screen.getByLabelText('Запасная модель').getAttribute('name')).toBe(
      'admin-ai-text-fallback-model'
    );
  });
});
