'use strict';
const React = require('react');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/',
});
for (const key of ['window', 'document', 'navigator'])
  Object.defineProperty(global, key, {
    configurable: true,
    value: key === 'window' ? dom.window : dom.window[key],
  });
global.IS_REACT_ACT_ENVIRONMENT = true;
const {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} = require('@testing-library/react');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');
const fetchModule = loadTypeScriptModule(
  'libraries/helpers/src/utils/custom.fetch.tsx'
);
let calls = [],
  handler;
fetchModule.useFetch =
  () =>
  async (url, options = {}) => {
    const call = {
      url,
      ...options,
      payload: options.body ? JSON.parse(options.body) : null,
    };
    calls.push(call);
    return handler(call);
  };
const { AdaptationReview, ReviewText, reviewModeKey } = loadTypeScriptModule(
  'apps/frontend/src/components/content-intelligence/pieces/adaptation-review.tsx'
);
const base = {
  pieceId: 'piece',
  adaptationId: 'a',
  workspaceId: 'org',
  locale: 'ru',
  onAccepted: jest.fn(),
};
const result = (mode) => ({
  version: 'adaptation-review/v2',
  mode,
  originalText: 'В современном мире автор пишет.',
  text: 'Автор пишет.',
  title: 'Заголовок', token: 'server-signed', slopBefore: 1, slopAfter: 0, summary: '', verdict: 'review',
  changes: [{ id: 'one', excerpt: 'В современном мире автор пишет.', replacement: 'Автор пишет.', why: 'проверенная пометка', basket: 'show' }],
  snapshot: {
    postId: 'post',
    postContent: 'old',
    postUpdatedAt: '2026-09-08T10:00:00Z',
    adaptationUpdatedAt: '2026-09-08T10:00:00Z',
    adaptationBody: 'old',
  },
});
const researchPreview = () => ({
  version: 'piece-research/v1',
  snapshotKey: 'research-snapshot',
  level: 'standard',
  input: 'Автор указал 10% комиссии и пишет о новом рынке.',
  facts: [
    {
      statement: 'Комиссия составляет 12%.',
      sourceUrl: 'https://example.com/fees',
      origin: 'input',
      kind: 'own',
      status: 'conflicting',
      selected: false,
      factKey: 'original-fee',
      quote: 'Комиссия — 12%.',
      note: 'Источник указывает другое значение.',
      correction: { original: '10%', replacement: '12%' },
    },
    {
      statement: 'Комиссия составляет 12%.',
      sourceUrl: 'https://example.com/fees',
      origin: 'search',
      kind: 'external',
      status: 'conflicting',
      selected: true,
      factKey: 'corrected-fee',
      quote: 'Комиссия — 12%.',
      note: 'Источник указывает другое значение.',
      correction: { original: '10%', replacement: '12%' },
    },
    {
      statement: 'Рынок вырос на 8%.',
      sourceUrl: 'https://example.com/market',
      origin: 'search',
      kind: 'found',
      status: 'confirmed',
      selected: true,
      factKey: 'found-growth',
      quote: 'Рынок вырос на 8%.',
    },
  ],
  corrections: [
    {
      factKey: 'corrected-fee',
      original: '10%',
      replacement: '12%',
      sourceUrl: 'https://example.com/fees',
      quote: 'Комиссия — 12%.',
      note: 'Источник указывает другое значение.',
      accepted: true,
    },
  ],
  summary: {
    confirmed: 1,
    conflicting: 1,
    unverified: 0,
    found: 1,
    sources: 2,
    encyclopedic: 0,
  },
});
const ok = (body) => ({ ok: true, status: 200, json: async () => body });
const draw = (props) =>
  render(React.createElement(AdaptationReview, { ...base, ...props }));
beforeEach(() => {
  calls = [];
  window.localStorage.clear();
  base.onAccepted.mockClear();
  handler = (call) => ok(result(call.payload.mode));
});
afterEach(cleanup);
const open = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Ещё ▾' }));
const choose = async (text) => {
  open();
  await act(async () =>
    fireEvent.click(screen.getByRole('menuitem', { name: new RegExp(text) }))
  );
};
test('menu is explicit, keyboard accessible, shows cost on every option and opens without spending', () => {
  draw();
  fireEvent.keyDown(screen.getByRole('button'), { key: 'ArrowDown' });
  expect(screen.getAllByRole('menuitem')).toHaveLength(5);
  expect(screen.getAllByText(/Один вызов модели/)).toHaveLength(4);
  expect(calls).toHaveLength(0);
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
  expect(screen.queryByRole('menu')).toBeNull();
});
test.each([
  ['Убрать штампы', 'slop'],
  ['Сверить с сутью', 'facts'],
  ['И то и другое', 'both'],
])(
  '%s sends exact mode, displays diff; leave never writes',
  async (label, mode) => {
    draw();
    await choose(label);
    expect(calls).toHaveLength(1);
    expect(calls[0].payload).toEqual({ mode });
    expect(calls[0].url).toBe(
      '/content-intelligence/pieces/piece/adaptations/a/review?language=ru'
    );
    expect(document.querySelector('del').textContent).toContain(
      'В современном мире'
    );
    expect(document.querySelector('ins').textContent).toContain('Автор');
    expect(screen.getAllByText(/проверенная пометка/)[0]).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Оставить как было' }));
    expect(calls).toHaveLength(1);
    expect(document.querySelector('del')).toBeNull();
    expect(window.localStorage.getItem(reviewModeKey('org'))).toBe(mode);
  }
);
test('accept passes the returned snapshot to the draft door and refreshes owner only after success', async () => {
  handler = (call) =>
    ok(
      call.url.endsWith('/accept')
        ? { accepted: true }
        : result(call.payload.mode)
    );
  draw();
  await choose('Убрать штампы');
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'Принять выбранные' }))
  );
  expect(calls).toHaveLength(2);
  expect(calls[1].url).toMatch(/\/review\/accept$/);
  expect(calls[1].payload).toEqual({
    token: result('slop').token,
    selectedIds: ['one'],
  });
  expect(base.onAccepted).toHaveBeenCalledTimes(1);
});
test('stale draft refuses acceptance visibly and cannot be overwritten by a second accept', async () => {
  handler = (call) =>
    call.url.endsWith('/accept')
      ? {
          ok: false,
          status: 409,
          json: async () => ({ message: 'Черновик изменён' }),
        }
      : ok(result(call.payload.mode));
  draw();
  await choose('Убрать штампы');
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'Принять выбранные' }))
  );
  expect(screen.getByRole('alert').textContent).toBe('Черновик изменён');
  expect(screen.getByRole('button', { name: 'Принять выбранные' }).disabled).toBe(true);
  expect(base.onAccepted).not.toHaveBeenCalled();
});
test('last choice is isolated by workspace and never automatically invokes a model', async () => {
  window.localStorage.setItem(reviewModeKey('one'), 'facts');
  const view = draw({ workspaceId: 'one' });
  open();
  expect(
    screen.getByRole('menuitem', { name: /Сверить с сутью/ })
      .textContent
  ).toContain('Последний выбор');
  view.rerender(
    React.createElement(AdaptationReview, { ...base, workspaceId: 'two' })
  );
  open();
  expect(screen.queryByText(/Последний выбор/)).toBeNull();
  expect(calls).toHaveLength(0);
});
test('duplicate click spends one call and unmount aborts the in-flight review', async () => {
  let finish;
  handler = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const view = draw();
  open();
  const choice = screen.getByRole('menuitem', { name: /Убрать штампы/ });
  fireEvent.click(choice);
  fireEvent.click(choice);
  expect(calls).toHaveLength(1);
  expect(screen.getByRole('progressbar').getAttribute('aria-label')).toContain('Проверяем');
  view.unmount();
  expect(calls[0].signal.aborted).toBe(true);
  await act(async () => finish(ok(result('slop'))));
});
test('read-only role cannot start review; identical texts retain the exact string', () => {
  draw({ disabled: true });
  expect(screen.getByRole('button').disabled).toBe(true);
  const view = render(React.createElement(ReviewText,{text:'один\nдва',changes:[],locale:'ru'}));
  expect(view.container.textContent).toBe('один\nдва');
});

test('core exposes regeneration and research enrichment at the same secondary weight', () => {
  draw({ adaptationId: undefined });
  const regenerate = screen.getByRole('button', { name: 'Перегенерировать' });
  const research = screen.getByRole('button', { name: 'Дополнить ресерчем' });
  expect(regenerate.className).toContain('bg-cf-surface');
  expect(research.className).toContain('bg-cf-surface');
  expect(calls).toHaveLength(0);
});

test('research opens the shared outcome, toggles correction twins, and accepts fact keys without review', async () => {
  handler = (call) =>
    call.url.endsWith('/research/accept')
      ? ok({ body: 'Автор указал 12% комиссии.', title: 'Обновлённая суть' })
      : ok(researchPreview());
  draw({ adaptationId: undefined });
  fireEvent.click(screen.getByRole('button', { name: 'Дополнить ресерчем' }));
  await act(async () => undefined);

  expect(calls).toHaveLength(1);
  expect(calls[0].url).toBe(
    '/content-intelligence/pieces/piece/research?language=ru'
  );
  expect(calls[0].payload).toEqual({ confirmWebSpend: true });
  expect(screen.getByRole('region', { name: 'Проверили по источникам' })).toBeTruthy();
  expect(screen.getByText('Ваша мысль с правками')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Вернуть моё' })).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: 'Вернуть моё' }));
  expect(screen.getByRole('button', { name: 'Принять поправку' })).toBeTruthy();
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'Продолжить' }))
  );

  expect(calls).toHaveLength(2);
  expect(calls[1].url).toBe(
    '/content-intelligence/pieces/piece/research/accept'
  );
  expect(calls[1].payload).toEqual({
    snapshotKey: 'research-snapshot',
    selectedKeys: ['original-fee', 'found-growth'],
  });
  expect(calls.some((call) => call.url.includes('/review'))).toBe(false);
  expect(base.onAccepted).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('region', { name: 'Проверили по источникам' })).toBeNull();
});

test('expired research snapshot keeps the preview visible, reports the error, and cannot accept again', async () => {
  handler = (call) =>
    call.url.endsWith('/research/accept')
      ? {
          ok: false,
          status: 410,
          json: async () => ({ message: 'Снимок ресерча истёк' }),
        }
      : ok(researchPreview());
  draw({ adaptationId: undefined });
  fireEvent.click(screen.getByRole('button', { name: 'Дополнить ресерчем' }));
  await act(async () => undefined);
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'Продолжить с правками' }))
  );

  expect(screen.getByRole('alert').textContent).toBe('Снимок ресерча истёк');
  expect(screen.getByRole('region', { name: 'Проверили по источникам' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Продолжить с правками' })).toBeNull();
  expect(base.onAccepted).not.toHaveBeenCalled();
  expect(calls.some((call) => call.url.includes('/review'))).toBe(false);
});

test('adaptation menu has no research action and a remembered legacy research mode is inert', () => {
  window.localStorage.setItem(reviewModeKey('org'), 'research');
  draw();
  open();
  expect(screen.queryByRole('menuitem', { name: /ресерч/i })).toBeNull();
  expect(calls).toHaveLength(0);
});

const withSources = () => ({
  ...result('web'),
  notes: [
    {
      kind: 'facts',
      text: 'Число исправлено по источнику',
      sourceUrls: ['https://example.com/evidence'],
    },
  ],
  sources: [
    {
      url: 'https://example.com/evidence',
      title: 'Источник числа',
      excerpt: 'Текст источника',
    },
  ],
  searchedChars: 40,
});
test('web choice requires visible spending confirmation and cancel does not spend', async () => {
  draw();
  await choose('Проверить факты поиском');
  expect(calls).toHaveLength(0);
  expect(
    screen.getByText(/Поиск и модели расходуют/)
  ).toBeTruthy();
  expect(screen.getByText(/первые 5000 знаков/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
  expect(calls).toHaveLength(0);
  expect(
    screen.queryByRole('button', { name: 'Запустить поиск и проверку' })
  ).toBeNull();
});
test('confirmed web action sends spending flag, shows only returned sources and uses existing CAS accept', async () => {
  handler = (call) =>
    ok(call.url.endsWith('/accept') ? { accepted: true } : withSources());
  draw();
  await choose('Проверить факты поиском');
  await act(async () =>
    fireEvent.click(
      screen.getByRole('button', { name: 'Запустить поиск и проверку' })
    )
  );
  expect(calls).toHaveLength(1);
  expect(calls[0].payload).toEqual({ mode: 'web', confirmWebSpend: true });
  fireEvent.click(screen.getByRole('button', { name: 'Источники поиска' }));
  const links = screen.getAllByRole('link', { name: 'Источник числа' });
  expect(
    links.every(
      (link) => link.getAttribute('href') === 'https://example.com/evidence'
    )
  ).toBe(true);
  expect(screen.getByText('Текст источника')).toBeTruthy();
  expect(screen.queryByText(/Сверка только с сутью/)).toBeNull();
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'Принять выбранные' }))
  );
  expect(calls[1].url).toMatch(/\/review\/accept$/);
  expect(calls[1].payload).toEqual({
    token: withSources().token,
    selectedIds: ['one'],
  });
});
test('remembered web action still requires a fresh confirmation and makes no automatic request', async () => {
  window.localStorage.setItem(reviewModeKey('org'), 'web');
  draw();
  expect(calls).toHaveLength(0);
  open();
  expect(
    screen.getByRole('menuitem', { name: /Проверить факты поиском/ }).textContent
  ).toContain('Последний выбор');
  await act(async () =>
    fireEvent.click(screen.getByRole('menuitem', { name: /Проверить факты поиском/ }))
  );
  expect(calls).toHaveLength(0);
});
test('failed or empty web result exposes no acceptance or claim of verification', async () => {
  handler = () => ({
    ok: false,
    status: 422,
    json: async () => ({ message: 'Подтверждений нет, черновик не изменён.' }),
  });
  draw();
  await choose('Проверить факты поиском');
  await act(async () =>
    fireEvent.click(
      screen.getByRole('button', { name: 'Запустить поиск и проверку' })
    )
  );
  expect(screen.getByRole('alert').textContent).toContain('Подтверждений нет');
  expect(screen.queryByRole('button', { name: 'Принять выбранные' })).toBeNull();
  expect(base.onAccepted).not.toHaveBeenCalled();
});

test('regeneration chips only fill instruction, one request, no-change hides all acceptance', async () => {
 handler = () => ok({...result('rewrite'), changes: [], summary: 'Всё хорошо'});
 draw(); await choose('Перегенерировать');
 expect(calls).toHaveLength(0);
 fireEvent.click(screen.getByRole('button',{name:'Только заголовок'}));
 expect(screen.getByRole('textbox').value).toBe('Только заголовок');
 expect(calls).toHaveLength(0);
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Перегенерировать'})));
 expect(calls).toHaveLength(1);
 expect(calls[0].url).toContain('/rewrite?');
 expect(calls[0].payload).toEqual({instruction:'Только заголовок'});
 expect(screen.queryByRole('button',{name:'Принять выбранные'})).toBeNull();
 expect(screen.queryByRole('button',{name:'Оставить как было'})).toBeNull();
});
test('partial selection sends IDs only; legacy author questions have no answer field', async()=>{
 handler=()=>ok({...result('both'),changes:[...result('both').changes,{id:'question',excerpt:'автор',replacement:'автор',why:'Откуда число?',basket:'ask'}]});
 draw(); await choose('И то и другое');
 expect(screen.getAllByRole('checkbox')).toHaveLength(1);
 fireEvent.click(screen.getByRole('checkbox'));
 expect(screen.getByRole('button',{name:'Принять выбранные'}).disabled).toBe(true);
 expect(screen.queryByRole('textbox')).toBeNull();
});

test('two distant corrections keep the middle text once and expose explanations',()=>{
 const text='Первое. Середина без правки. Последнее.';
 const changes=[{id:'a',excerpt:'Первое.',replacement:'Начало.',why:'Уточнение начала',basket:'show'},{id:'b',excerpt:'Последнее.',replacement:'Конец.',why:'Уточнение конца',basket:'show'}];
 const view=render(React.createElement(ReviewText,{text,changes,locale:'ru'}));
 expect(view.container.textContent.split('Середина без правки.')).toHaveLength(2);
 expect(view.container.querySelectorAll('del')).toHaveLength(2);
 expect(view.container.querySelector('[title="Уточнение начала"]')).toBeTruthy();
});
test('source-not-found note stays visible without a bogus accept action',async()=>{
 handler=()=>ok({...result('facts'),changes:[{id:'q1',excerpt:'автор',replacement:'автор',why:'Источник не найден, оставлено как есть.',basket:'show'}]});
 draw();await choose('Сверить с сутью');
 expect(document.querySelector('[data-review-no-change="true"]').textContent).toContain('Источник не найден');
 expect(screen.queryByRole('textbox')).toBeNull();
 expect(screen.queryByRole('button',{name:'Сохранить ответы'})).toBeNull();
 expect(screen.queryByRole('checkbox')).toBeNull();
 expect(screen.queryByRole('button',{name:'Принять выбранные'})).toBeNull();
 expect(calls).toHaveLength(1);
 expect(base.onAccepted).not.toHaveBeenCalled();
});
