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
  within,
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
const { AdaptationReview, ReviewText } = loadTypeScriptModule(
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
  version: 'piece-research/v2',
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
/*
  Десятый заход (`97dq.37`, `97dq.39` C5): у адаптации нет «Ещё ▾». Три
  действия видны кнопками — «Убрать следы ИИ», «Проверить факты»,
  «Переписать…» — и ряд тот же, что у сути, с другим списком возможностей.
*/
const choose = async (text) => {
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: text }))
  );
};
const actionButtons = () =>
  Array.from(document.querySelectorAll('[data-review-action]')).map((node) =>
    node.getAttribute('data-review-action')
  );
test('the adaptation row shows its three actions as buttons and spends nothing until one is pressed', () => {
  draw();
  expect(screen.queryByRole('menu')).toBeNull();
  expect(screen.queryByRole('button', { name: /Ещё/ })).toBeNull();
  expect(actionButtons()).toEqual(['slop', 'checkFacts', 'rewrite']);
  expect(screen.getByRole('group', { name: 'Действия с текстом' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Убрать следы ИИ' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Проверить факты' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Переписать…' })).toBeTruthy();
  expect(calls).toHaveLength(0);
});
test('the core row carries research instead of AI tells — one row, two capability lists', () => {
  draw({ adaptationId: undefined });
  expect(actionButtons()).toEqual(['research', 'checkFacts', 'rewrite']);
  cleanup();
  draw({ adaptationId: undefined, actions: ['slop', 'rewrite'] });
  expect(actionButtons()).toEqual(['slop', 'rewrite']);
  expect(calls).toHaveLength(0);
});

/*
  Владелец, 18.09.2026: продукт говорит «ИИ» или «мы», а «модель» остаётся
  настройкам. Компонент проверки говорил её на каждом пункте меню.
*/
test('nothing this component shows the person names a model', async () => {
  handler = (call) => ok(result(call.payload.mode));
  draw();
  expect(document.body.textContent).not.toMatch(/модел/i);
  await choose('Убрать следы ИИ');
  expect(document.body.textContent).not.toMatch(/модел/i);
});
test.each([
  ['Убрать следы ИИ', 'slop'],
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
  await choose('Убрать следы ИИ');
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
  // The page keeps «было N → стало M»; only the review result knows both.
  expect(base.onAccepted).toHaveBeenCalledWith({ slopBefore: 1, slopAfter: 0 });
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
  await choose('Убрать следы ИИ');
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'Принять выбранные' }))
  );
  expect(screen.getByRole('alert').textContent).toBe('Черновик изменён');
  expect(screen.getByRole('button', { name: 'Принять выбранные' }).disabled).toBe(true);
  expect(base.onAccepted).not.toHaveBeenCalled();
});
test('duplicate click spends one call and unmount aborts the in-flight review', async () => {
  let finish;
  handler = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const view = draw();
  const choice = screen.getByRole('button', { name: 'Убрать следы ИИ' });
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
  for (const node of document.querySelectorAll('[data-review-action]'))
    expect(node.disabled).toBe(true);
  const view = render(React.createElement(ReviewText,{text:'один\nдва',changes:[],locale:'ru'}));
  expect(view.container.textContent).toBe('один\nдва');
});

test('core exposes regeneration and research enrichment at the same secondary weight', () => {
  draw({ adaptationId: undefined });
  const regenerate = screen.getByRole('button', { name: 'Переписать…' });
  const research = screen.getByRole('button', { name: 'Дополнить из интернета' });
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
  fireEvent.click(screen.getByRole('button', { name: 'Дополнить из интернета' }));
  expect(calls).toHaveLength(0);
  // Ресерч раскрывается на месте, а не окном: одна поверхность на весь ряд.
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByRole('region', { name: 'Дополнить из интернета' })).toBeTruthy();
  expect(screen.getByText('Куда копать')).toBeTruthy();
  expect(screen.getByText('Например: свежие цифры за 2026 год. Можно оставить пустым')).toBeTruthy();
  expect(screen.getByRole('combobox', { name: 'Глубина поиска' }).value).toBe('standard');
  fireEvent.change(screen.getByRole('textbox', { name: 'Куда копать' }), {
    target: { value: 'Свежие цифры за 2026 год' },
  });
  fireEvent.change(screen.getByRole('combobox', { name: 'Глубина поиска' }), {
    target: { value: 'deep' },
  });
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'Начать поиск' }))
  );
  await act(async () => undefined);

  expect(calls).toHaveLength(1);
  expect(calls[0].url).toBe(
    '/content-intelligence/pieces/piece/research?language=ru'
  );
  expect(calls[0].payload).toEqual({
    confirmWebSpend: true,
    level: 'deep',
    direction: 'Свежие цифры за 2026 год',
  });
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
  fireEvent.click(screen.getByRole('button', { name: 'Дополнить из интернета' }));
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'Начать поиск' }))
  );
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

test('research cancellation spends nothing and keeps the standard default', () => {
  draw({ adaptationId: undefined });
  fireEvent.click(screen.getByRole('button', { name: 'Дополнить из интернета' }));
  expect(screen.getByRole('combobox', { name: 'Глубина поиска' }).value).toBe('standard');
  fireEvent.click(screen.getByRole('button', { name: 'Отменить' }));
  expect(calls).toHaveLength(0);
  expect(screen.queryByRole('region', { name: 'Дополнить из интернета' })).toBeNull();
});

test('research request error stays in the research section and preserves retry choices', async () => {
  handler = () => ({
    ok: false,
    status: 503,
    json: async () => ({ message: 'Ресерч временно недоступен' }),
  });
  draw({ adaptationId: undefined });
  fireEvent.click(screen.getByRole('button', { name: 'Дополнить из интернета' }));
  const direction = screen.getByRole('textbox', { name: 'Куда копать' });
  const level = screen.getByRole('combobox', { name: 'Глубина поиска' });
  fireEvent.change(direction, { target: { value: 'Только данные регулятора' } });
  fireEvent.change(level, { target: { value: 'deep' } });

  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'Начать поиск' }))
  );

  const section = screen.getByRole('region', { name: 'Дополнить из интернета' });
  expect(within(section).getByRole('alert').textContent).toBe('Ресерч временно недоступен');
  expect(screen.getAllByRole('alert')).toHaveLength(1);
  expect(direction.value).toBe('Только данные регулятора');
  expect(level.value).toBe('deep');
});

test('the adaptation row has no research action', () => {
  draw();
  expect(screen.queryByRole('button', { name: /ресерч|интернет|поиск/i })).toBeNull();
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
/*
  Подтверждения больше нет: человек выбрал действие словами, и окно
  переспрашивало то же самое. Предложение о расходе стоит подсказкой у кнопки
  и читается до нажатия.
*/
test('the fact check starts on the click itself, with the spend sentence beside the button', async () => {
  draw({ adaptationId: undefined });
  const hint = screen.getByRole('button', {
    name: 'Подсказка: расход на проверку фактов',
  });
  fireEvent.click(hint);
  expect(
    screen.getByRole('tooltip').textContent
  ).toBe(
    'Поиск и ИИ могут расходовать включённый лимит или средства подключённого провайдера. Источники могут охватить не все утверждения.'
  );
  expect(screen.queryByText(/первые 5000 знаков/)).toBeNull();
  expect(calls).toHaveLength(0);
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'Проверить факты' }))
  );
  expect(calls).toHaveLength(1);
  expect(calls[0].payload).toEqual({ mode: 'web', confirmWebSpend: true });
  expect(screen.queryByRole('dialog')).toBeNull();
});
test('confirmed web action sends spending flag, shows only returned sources and uses existing CAS accept', async () => {
  handler = (call) =>
    ok(call.url.endsWith('/accept') ? { accepted: true } : withSources());
  draw();
  await choose('Проверить факты');
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
test('failed or empty web result exposes no acceptance or claim of verification', async () => {
  handler = () => ({
    ok: false,
    status: 422,
    json: async () => ({ message: 'Подтверждений нет, черновик не изменён.' }),
  });
  draw();
  await choose('Проверить факты');
  expect(screen.getByRole('alert').textContent).toContain('Подтверждений нет');
  expect(screen.queryByRole('button', { name: 'Принять выбранные' })).toBeNull();
  expect(base.onAccepted).not.toHaveBeenCalled();
});

/*
  Сомнение владельца на прогоне 18.09.2026: «Я не уверен, что убрали именно
  штампы, которые были». Числа «было N → стало M» на это не отвечают —
  отвечают отрывки, и вот они.
*/
describe('the catalog delta says which findings went and which stayed', () => {
  const finding = (n) => ({ ruleId: `rule-${n}`, excerpt: `штамп ${n}` });
  const withCatalog = (catalog) => () =>
    ok({ ...result('slop'), catalog });

  test('both lists are shown, quoted, under the counters', async () => {
    handler = withCatalog({
      removed: [finding(1), finding(2)],
      remaining: [finding(3)],
    });
    draw();
    await choose('Убрать следы ИИ');
    const panel = document.querySelector('[data-review-catalog="true"]');
    const removed = panel.querySelector('[data-review-catalog-group="removed"]');
    const remaining = panel.querySelector(
      '[data-review-catalog-group="remaining"]'
    );
    expect(removed.textContent).toBe('Ушло: «штамп 1», «штамп 2»');
    expect(remaining.textContent).toBe('Осталось: «штамп 3»');
    expect(screen.getByText(/Штампов по каталогу: было 1 → стало 0/)).toBeTruthy();
  });

  test('a long list stops at five and counts the rest', async () => {
    handler = withCatalog({
      removed: [1, 2, 3, 4, 5, 6, 7].map(finding),
      remaining: [],
    });
    draw();
    await choose('Убрать следы ИИ');
    const removed = document.querySelector(
      '[data-review-catalog-group="removed"]'
    );
    expect(removed.textContent).toContain('«штамп 5»');
    expect(removed.textContent).not.toContain('«штамп 6»');
    expect(removed.textContent).toContain('и ещё 2');
    expect(document.querySelector('[data-review-catalog-group="remaining"]')).toBeNull();
  });

  /*
    Правка умеет внести новый штамп, и тогда `slopAfter` больше, чем осталось
    в каталоге. Экран печатает и то и другое как есть: подгонка одного под
    другое соврала бы ровно там, где строка оправдывается.
  */
  test('counters and lists are never reconciled with each other', async () => {
    handler = () =>
      ok({
        ...result('slop'),
        slopBefore: 3,
        slopAfter: 2,
        catalog: { removed: [finding(1)], remaining: [finding(2)] },
      });
    draw();
    await choose('Убрать следы ИИ');
    expect(screen.getByText(/было 3 → стало 2/)).toBeTruthy();
    expect(
      document.querySelector('[data-review-catalog-group="remaining"]').textContent
    ).toBe('Осталось: «штамп 2»');
  });

  test('a proposal from before this wave renders exactly as it did', async () => {
    draw();
    await choose('Убрать следы ИИ');
    expect(document.querySelector('[data-review-catalog="true"]')).toBeNull();
    expect(document.querySelector('[data-review-claims="true"]')).toBeNull();
    expect(screen.getByRole('button', { name: 'Принять выбранные' })).toBeTruthy();
    expect(screen.getByText(/Штампов по каталогу/)).toBeTruthy();
  });
});

describe('the fact check reports what it did, including doing nothing', () => {
  test('nothing to check is an answer, not an empty acceptance block', async () => {
    handler = () =>
      ok({
        ...result('web'),
        verdict: 'clean',
        changes: [],
        sources: [],
        summary:
          'Проверять нечего: в тексте нет утверждений, которые можно сверить с источниками.',
        factCheck: { claims: 0, queries: [], searched: false },
      });
    draw();
    await choose('Проверить факты');
    expect(
      document.querySelector('[data-review-nothing-to-check="true"]').textContent
    ).toBe(
      'Проверять нечего: в тексте нет утверждений, которые можно сверить с источниками.'
    );
    expect(screen.queryByText(/Правки не понадобились/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Принять выбранные' })).toBeNull();
    expect(document.querySelector('[data-review-claims="true"]')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Источники поиска' })).toBeNull();
  });

  test('a search that happened says how many claims it weighed, and what it asked', async () => {
    handler = () =>
      ok({
        ...withSources(),
        factCheck: {
          claims: 3,
          queries: ['рост рынка 2026', 'комиссия площадки'],
          searched: true,
        },
      });
    draw();
    await choose('Проверить факты');
    expect(
      document.querySelector('[data-review-claims="true"]').textContent
    ).toBe('Проверено утверждений: 3');
    fireEvent.click(screen.getByRole('button', { name: 'Источники поиска' }));
    expect(
      document.querySelector('[data-review-queries="true"]').textContent
    ).toBe('Что искали «рост рынка 2026», «комиссия площадки»');
    expect(screen.getAllByRole('link', { name: 'Источник числа' })[0]).toBeTruthy();
  });

  test('queries without sources still open, and nothing crashes on the missing list', async () => {
    handler = () =>
      ok({
        ...result('web'),
        factCheck: { claims: 1, queries: ['одно утверждение'], searched: true },
      });
    draw();
    await choose('Проверить факты');
    fireEvent.click(screen.getByRole('button', { name: 'Источники поиска' }));
    expect(
      document.querySelector('[data-review-queries="true"]').textContent
    ).toContain('«одно утверждение»');
  });
});

test('regeneration chips only fill instruction, one request, no-change hides all acceptance', async () => {
 handler = () => ok({...result('rewrite'), changes: [], summary: 'Всё хорошо'});
 draw(); await choose('Переписать…');
 expect(calls).toHaveLength(0);
 fireEvent.click(screen.getByRole('button',{name:'Только заголовок'}));
 expect(screen.getByRole('textbox').value).toBe('Только заголовок');
 expect(calls).toHaveLength(0);
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Переписать'})));
 expect(calls).toHaveLength(1);
 expect(calls[0].url).toContain('/rewrite?');
 expect(calls[0].payload).toEqual({instruction:'Только заголовок'});
 expect(screen.queryByRole('button',{name:'Принять выбранные'})).toBeNull();
 expect(screen.queryByRole('button',{name:'Оставить как было'})).toBeNull();
});
test('partial selection sends IDs only; legacy author questions have no answer field', async()=>{
 handler=()=>ok({...result('both'),changes:[...result('both').changes,{id:'question',excerpt:'автор',replacement:'автор',why:'Откуда число?',basket:'ask'}]});
 draw(); await choose('Убрать следы ИИ');
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
 draw();await choose('Проверить факты');
 expect(document.querySelector('[data-review-no-change="true"]').textContent).toContain('Источник не найден');
 expect(screen.queryByRole('textbox')).toBeNull();
 expect(screen.queryByRole('button',{name:'Сохранить ответы'})).toBeNull();
 expect(screen.queryByRole('checkbox')).toBeNull();
 expect(screen.queryByRole('button',{name:'Принять выбранные'})).toBeNull();
 expect(calls).toHaveLength(1);
 expect(base.onAccepted).not.toHaveBeenCalled();
});
