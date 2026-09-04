'use strict';

/**
 * Screen 12 on live data: the avatars list and its two confirmations.
 *
 * What is under test is not that cards render. It is the four promises the
 * screen makes and the ways each of them erodes quietly:
 *
 *   * who writes by default is readable without opening a card, and stays one
 *     avatar — moving the flag touches two rows and a per-row cache update
 *     would leave both marked;
 *   * an unanalysed avatar is a working state and not an error, and the reason
 *     it cannot become the default stands where the button would have been;
 *   * deleting the default asks who takes over rather than choosing, and an
 *     avatar that cannot write is not on that list at all;
 *   * deleting the last one names the consequence — a space writing in a
 *     neutral style — instead of refusing.
 *
 * The delete carries its successor in the same request. That is the assertion
 * worth keeping: two requests can fail apart, and a space with a deleted
 * default and nobody promoted writes neutrally under four names.
 */

const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const ts = require('typescript');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
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
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} = require('@testing-library/react');
const { SWRConfig } = require('swr');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const base = 'apps/frontend/src/components/brand-voice';
const files = {
  screen: `${base}/voice-avatars.screen.tsx`,
  adapter: `${base}/voice-avatars.adapter.ts`,
  container: `${base}/voice-avatars.container.tsx`,
};

test('starts RED until the screen, its adapter and its container transpile', () => {
  for (const file of Object.values(files)) {
    expect(fs.existsSync(path.join(root, file))).toBe(true);
    const result = ts.transpileModule(
      fs.readFileSync(path.join(root, file), 'utf8'),
      {
        fileName: file,
        compilerOptions: {
          jsx: ts.JsxEmit.ReactJSX,
          target: ts.ScriptTarget.ES2021,
        },
        reportDiagnostics: true,
      }
    );
    expect(result.diagnostics || []).toHaveLength(0);
  }
});

const contract = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/brand-voice/voice-wiring.contract.ts'
);
const copy = loadTypeScriptModule(`${base}/voice-copy.ts`);
const adapter = loadTypeScriptModule(files.adapter);
const container = loadTypeScriptModule(files.container);
const variables = loadTypeScriptModule(
  'libraries/react-shared-libraries/src/helpers/variable.context.tsx'
);

const t = copy.voiceCopy.ru;

const AVATARS = {
  state: 'default',
  avatars: [
    {
      id: 'avt-01',
      name: 'Алексей Ким',
      kind: 'PERSON',
      isDefault: true,
      analysed: true,
      versionLabel: 'v3',
      sampleCount: 48,
      createdAt: '12.06.2026',
      activeSince: '14.08.2026',
      hasPortrait: true,
    },
    {
      id: 'avt-02',
      name: 'Служба новостей завода',
      kind: 'BRAND',
      isDefault: false,
      analysed: true,
      versionLabel: 'v1',
      sampleCount: 22,
      createdAt: '03.07.2026',
    },
    {
      id: 'avt-03',
      name: null,
      kind: 'PERSON',
      isDefault: false,
      analysed: false,
      createdAt: '25.08.2026',
    },
  ],
  defaultAvatarId: 'avt-01',
  limit: contract.MAX_AVATARS_PER_SPACE,
  canManage: true,
};

let calls = [];
let routes = {};

const answer = (body, status = 200) => ({ body, status });

/**
 * Keyed by method *and* path, because three of the five routes share one.
 *
 * `GET`, `POST` and `DELETE` on `/avatars` are list, create and delete: a fake
 * keyed on the path alone answers all three with whichever was registered
 * last, which looks exactly like the list failing to load.
 */
const at = (route, method = 'GET') => `${method} ${route}`;

const resetBackend = () => {
  calls = [];
  routes = { [at(adapter.AVATAR_ROUTES.list)]: answer(AVATARS) };
};

beforeEach(() => {
  resetBackend();
  global.fetch = async (url, options = {}) => {
    const requested = String(url);
    calls.push({
      path: requested,
      method: options.method || 'GET',
      body: options.body ? JSON.parse(options.body) : undefined,
    });
    const handler = routes[`${options.method || 'GET'} ${requested}`];
    const result =
      typeof handler === 'function'
        ? handler(options)
        : handler ?? answer({}, 404);
    return {
      ok: result.status < 400,
      status: result.status,
      json: async () => result.body,
      // `content-factory-next-fn33.65`: the shared request helper hands the
      // common refusal handler a copy, so a fake answer must clone like a
      // real `Response`.
      clone() {
        return this;
      },
    };
  };
});

afterEach(cleanup);

const renderList = (props = {}) =>
  render(
    React.createElement(
      SWRConfig,
      {
        value: {
          provider: () => new Map(),
          dedupingInterval: 0,
          revalidateOnFocus: false,
        },
      },
      React.createElement(
        variables.VariableContextComponent,
        { language: 'ru' },
        React.createElement(container.VoiceAvatarsContainer, props)
      )
    )
  );

const writeCalls = () => calls.filter((call) => call.method !== 'GET');

describe('what feeds what', () => {
  test('the five paths are the ones the contract named for screen 12', () => {
    const routeOf = (method, suffix) =>
      contract.VOICE_SURFACES.avatars.routes.find(
        (route) =>
          route.method === method && (!suffix || route.path.endsWith(suffix))
      ).path;

    expect(adapter.AVATAR_ROUTES).toEqual({
      list: routeOf('GET'),
      create: routeOf('POST', '/avatars'),
      update: routeOf('POST', '/avatars/update'),
      makeDefault: routeOf('POST', '/avatars/default'),
      remove: routeOf('DELETE'),
    });
  });

  test('an empty name arrives as «Без имени» and not as an empty card', () => {
    const row = adapter.mapAvatarRow({ id: 'a', name: '   ', kind: 'BRAND' });

    expect(row.name).toBeNull();
    expect(row.kind).toBe('BRAND');
    // Никогда не выводится из наличия версии: решает сервер, а экран, решающий
    // сам, расходится с маршрутом, который откажет.
    expect(row.analysed).toBe(false);
  });

  test('the ceiling travels with the answer instead of being retyped', () => {
    expect(adapter.mapAvatars(AVATARS).limit).toBe(
      contract.MAX_AVATARS_PER_SPACE
    );
  });
});

describe('кто пишет — читается до того, как открыта карточка', () => {
  test('полоса называет аватар по умолчанию именем', async () => {
    renderList();

    await waitFor(() =>
      expect(
        screen.getByText(t.avatarsDefaultLine('Алексей Ким'))
      ).toBeTruthy()
    );
  });

  test('аватар без разбора говорит, что это рабочее состояние, а не ошибка', async () => {
    renderList();

    await waitFor(() => expect(screen.getByText(t.avatarsNoName)).toBeTruthy());
    expect(screen.getByText(t.avatarsNotWriting)).toBeTruthy();
    // Причина стоит там, где была бы кнопка: выключенная кнопка «Сделать
    // основным» ничего не объясняет и зовёт нажать ещё раз.
    expect(screen.getByText(t.avatarsCannotDefault)).toBeTruthy();
    expect(
      screen.queryAllByRole('button', { name: t.avatarsMakeDefault })
    ).toHaveLength(1);
  });

  test('«Собрать образцы» стоит там, где «Открыть» было бы обманом', async () => {
    const collected = [];
    renderList({ onCollectFor: (id) => collected.push(id) });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: t.avatarsCollect })).toBeTruthy()
    );
    fireEvent.click(screen.getByRole('button', { name: t.avatarsCollect }));

    expect(collected).toEqual(['avt-03']);
  });
});

describe('смена основного', () => {
  test('одна запись, и список приходит целиком', async () => {
    routes[at(adapter.AVATAR_ROUTES.makeDefault, 'POST')] = answer({
      ...AVATARS,
      state: 'success',
      defaultAvatarId: 'avt-02',
      avatars: AVATARS.avatars.map((one) => ({
        ...one,
        isDefault: one.id === 'avt-02',
      })),
    });
    renderList();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: t.avatarsMakeDefault })).toBeTruthy()
    );
    fireEvent.click(screen.getByRole('button', { name: t.avatarsMakeDefault }));

    await waitFor(() =>
      expect(
        screen.getByText(t.avatarsDefaultLine('Служба новостей завода'))
      ).toBeTruthy()
    );
    expect(writeCalls()).toEqual([
      {
        path: adapter.AVATAR_ROUTES.makeDefault,
        method: 'POST',
        body: { avatarId: 'avt-02' },
      },
    ]);
    // Ровно один помечен: перерисовка по строке оставила бы прежнего.
    expect(
      screen.queryAllByText(t.avatarsWritesByDefault)
    ).toHaveLength(1);
  });
});

describe('два подтверждения удаления, потому что последствия разные', () => {
  const openMore = async (avatarId) => {
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: t.avatarsMore }).length).toBeGreaterThan(0)
    );
    const card = document.querySelector(`[data-voice-avatar="${avatarId}"]`);
    const more = [...card.querySelectorAll('button')].find(
      (button) => button.textContent.trim() === t.avatarsMore
    );
    fireEvent.click(more);
    const remove = [...card.querySelectorAll('button')].find(
      (button) => button.textContent.trim() === t.avatarsDelete
    );
    fireEvent.click(remove);
  };

  test('удаление основного спрашивает наследника и не берёт того, кто не пишет', async () => {
    renderList();
    await openMore('avt-01');

    expect(
      screen.getByText(t.avatarsDeleteDefaultTitle('Алексей Ким'))
    ).toBeTruthy();
    expect(screen.getByText(t.avatarsDeleteSuccessor)).toBeTruthy();
    // «Без имени» разбора не имеет, значит писать не может, значит его в
    // списке кандидатов нет вовсе — не выключенным пунктом, а никак.
    expect(screen.getAllByRole('radio')).toHaveLength(1);
    expect(
      screen.getByRole('button', { name: t.avatarsDeleteDefaultConfirm }).disabled
    ).toBe(true);
  });

  test('наследник назван — удаление и передача уходят одной записью', async () => {
    routes[at(adapter.AVATAR_ROUTES.remove, 'DELETE')] = answer({
      ...AVATARS,
      state: 'success',
      defaultAvatarId: 'avt-02',
      avatars: AVATARS.avatars
        .filter((one) => one.id !== 'avt-01')
        .map((one) => ({ ...one, isDefault: one.id === 'avt-02' })),
    });
    renderList();
    await openMore('avt-01');

    fireEvent.click(screen.getAllByRole('radio')[0]);
    fireEvent.click(
      screen.getByRole('button', { name: t.avatarsDeleteDefaultConfirm })
    );

    await waitFor(() => expect(writeCalls()).toHaveLength(1));
    expect(writeCalls()[0]).toEqual({
      path: adapter.AVATAR_ROUTES.remove,
      method: 'DELETE',
      body: { avatarId: 'avt-01', successorId: 'avt-02' },
    });
  });

  test('единственный аватар: сказано, что писать станет некому', async () => {
    routes[at(adapter.AVATAR_ROUTES.list)] = answer({
      ...AVATARS,
      avatars: [AVATARS.avatars[0]],
    });
    renderList();
    await openMore('avt-01');

    expect(screen.getByText(t.avatarsDeleteLastTitle)).toBeTruthy();
    expect(
      screen.getByText(t.avatarsDeleteLastBody('Алексей Ким'))
    ).toBeTruthy();
    expect(screen.getByText(t.avatarsDeleteWhatStays)).toBeTruthy();
  });

  test('не основной: сказано, что именно не изменится', async () => {
    renderList();
    await openMore('avt-02');

    expect(
      screen.getByText(t.avatarsDeletePlainTitle('Служба новостей завода'))
    ).toBeTruthy();
    expect(screen.getByText(t.avatarsDeletePlainBody)).toBeTruthy();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
  });
});

describe('отказ доходит словами', () => {
  test('девятый аватар: сервер называет причину, и она видна там, где решали', async () => {
    routes[at(adapter.AVATAR_ROUTES.create, 'POST')] = answer(
      {
        code: 'VOICE_AVATAR_LIMIT',
        message: 'В пространстве уже 8 аватаров из 8.',
      },
      contract.VOICE_ERROR_CODES.VOICE_AVATAR_LIMIT.status
    );
    renderList();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: t.avatarsCreate })).toBeTruthy()
    );
    fireEvent.click(screen.getByRole('button', { name: t.avatarsCreate }));

    // Кнопка открывает мастер, а не пишет строку: раньше она молча заводила
    // «Без имени» внизу списка, и человек оставался с делом вместо результата.
    const name = await screen.findByLabelText(/^Имя$/);
    fireEvent.change(name, { target: { value: 'Отдел заботы' } });
    fireEvent.click(screen.getByRole('button', { name: /Создать и собрать/ }));

    // Отказ печатается в диалоге, а не в баннере под ним: диалог закрывает
    // собой то место, где список показывает свои ошибки.
    await waitFor(() =>
      expect(
        screen.getByText('В пространстве уже 8 аватаров из 8.')
      ).toBeTruthy()
    );
    expect(
      document.querySelector('[data-voice-avatar-create="open"]')
    ).not.toBeNull();
    // Список на месте: отказ создать девятого не убирает восьмерых.
    expect(screen.getByText('Алексей Ким')).toBeTruthy();
  });

  test('мастер спрашивает имя и вид, и без имени ничего не пишет', async () => {
    renderList();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: t.avatarsCreate })).toBeTruthy()
    );
    fireEvent.click(screen.getByRole('button', { name: t.avatarsCreate }));
    await screen.findByLabelText(/^Имя$/);

    fireEvent.click(screen.getByRole('button', { name: /Создать и собрать/ }));

    expect(
      calls.filter(
        (call) =>
          call.path === adapter.AVATAR_ROUTES.create && call.method === 'POST'
      )
    ).toHaveLength(0);
    expect(screen.getByText(/Напишите имя/)).toBeTruthy();
  });

  test('созданный аватар открывается, а не остаётся строкой внизу списка', async () => {
    const created = {
      state: 'default',
      avatars: [
        ...AVATARS.avatars,
        {
          id: 'avt-09',
          name: 'Отдел заботы',
          kind: 'BRAND',
          isDefault: false,
          analysed: false,
          createdAt: '29.08.2026',
        },
      ],
      defaultAvatarId: AVATARS.defaultAvatarId,
      limit: AVATARS.limit,
      canManage: true,
    };
    routes[at(adapter.AVATAR_ROUTES.create, 'POST')] = answer(created);
    const opened = [];
    renderList({ onOpenAvatar: (id) => opened.push(id) });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: t.avatarsCreate })).toBeTruthy()
    );
    fireEvent.click(screen.getByRole('button', { name: t.avatarsCreate }));
    fireEvent.change(await screen.findByLabelText(/^Имя$/), {
      target: { value: 'Отдел заботы' },
    });
    fireEvent.click(screen.getByRole('radio', { name: /Бренд/ }));
    fireEvent.click(screen.getByRole('button', { name: /Создать и собрать/ }));

    await waitFor(() => expect(opened).toEqual(['avt-09']));
    expect(
      calls.find(
        (call) =>
          call.path === adapter.AVATAR_ROUTES.create && call.method === 'POST'
      )
    ).toMatchObject({ body: { name: 'Отдел заботы', kind: 'BRAND' } });
  });

  test('редактор видит список и не видит правок', async () => {
    routes[at(adapter.AVATAR_ROUTES.list)] = answer({
      ...AVATARS,
      canManage: false,
      notice: t.avatarsRestrictedBody,
    });
    renderList();

    await waitFor(() =>
      expect(screen.getByText(t.avatarsRestrictedTitle)).toBeTruthy()
    );
    expect(screen.getByText('Алексей Ким')).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: t.avatarsCreate })
    ).toBeNull();
    expect(screen.queryByRole('button', { name: t.avatarsMore })).toBeNull();
  });
});
