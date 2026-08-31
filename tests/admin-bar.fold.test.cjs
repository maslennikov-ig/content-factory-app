'use strict';

/**
 * Putting the superadmin bar down, and the one case where it may not be.
 *
 * The bar is a permanent strip of administrative errands — impersonate, import
 * a debug post, announcements, four links to admin pages — sitting above
 * whatever the person actually came to do, on every screen, with no way to put
 * it down. Reported by the owner on 2026-08-25: «нужно сделать возможность её
 * скрывать. И как-то маленьким ярлычком, чтобы можно было показать обратно».
 *
 * Two rules are held here.
 *
 * It leaves a tab behind rather than vanishing. A control that disappears
 * completely is a control nobody finds again, and the fold is remembered in a
 * cookie, so «nobody finds it again» would last across reloads.
 *
 * **While impersonating it stays.** That row is not an errand: it is the only
 * thing on the screen saying you are acting as somebody else, and «Stop» is the
 * only way back. A superadmin who folded it away and forgot would go on making
 * changes under a name they cannot see. This is the assertion worth keeping —
 * the rest is layout.
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

const { cleanup, fireEvent, render, screen } = require('@testing-library/react');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');

const FILE = 'apps/frontend/src/components/layout/impersonate.tsx';

let folded = 'open';
let impersonating = false;

const stub = (name) => () => React.createElement('div', { 'data-stub': name });

const mocks = () => ({
  'react-use-cookie': {
    __esModule: true,
    default: () => [folded, (next) => { folded = next; }],
  },
  swr: {
    __esModule: true,
    default: () => ({ data: [], error: null }),
    useSWRConfig: () => ({ mutate: async () => {} }),
  },
  'react-hook-form': {
    useForm: () => ({ handleSubmit: () => () => {}, values: {} }),
    FormProvider: ({ children }) => children,
    useFormContext: () => null,
  },
  '@hookform/resolvers/class-validator': { classValidatorResolver: () => null },
  '@contentfactory/helpers/utils/custom.fetch': {
    useFetch: () => async () => ({ ok: true, json: async () => [] }),
  },
  '@contentfactory/frontend/components/layout/user.context': {
    useUser: () => (impersonating ? { id: 'u', impersonate: true } : { id: 'u' }),
  },
  '@contentfactory/react/helpers/variable.context': {
    useVariables: () => ({ isSecured: true, billingEnabled: false }),
  },
  '@contentfactory/react/translation/get.transation.service.client': {
    useT: () => (key, fallback) => fallback ?? key,
  },
  '@contentfactory/react/toaster/toaster': {
    useToaster: () => ({ show: () => {} }),
  },
  '@contentfactory/frontend/components/layout/new-modal': {
    useModals: () => ({ openModal: () => {} }),
  },
  '@contentfactory/react/helpers/delete.dialog': { deleteDialog: async () => false },
  '@contentfactory/frontend/components/layout/layout.context': { setCookie: () => {} },
  '@contentfactory/nestjs-libraries/database/prisma/subscriptions/pricing': {
    pricing: {},
  },
  '@contentfactory/nestjs-libraries/dtos/settings/admin.add.team.member.dto': {
    AdminAddTeamMemberDto: class {},
  },
  '@contentfactory/frontend/components/launches/import-debug-post.modal': {
    ImportDebugPostModal: stub('import'),
  },
});

const { AdminBarToggle, Impersonate } = loadWithMocks(FILE, mocks());

afterEach(cleanup);

const draw = () => render(React.createElement(Impersonate));
const bar = () => document.querySelector('section[aria-label="Super Admin"]');

describe('панель супер-администратора убирается и находится обратно', () => {
  beforeEach(() => {
    folded = 'open';
    impersonating = false;
  });

  it('развёрнутая панель предлагает себя убрать', () => {
    draw();

    expect(bar()).toBeTruthy();
    expect(screen.getByLabelText('Hide the admin bar')).toBeTruthy();
  });

  it('убранная панель не занимает строки вовсе', () => {
    folded = 'folded';
    draw();

    // Прежде здесь оставался ярлык шириной с экран — ровно на том месте, ради
    // освобождения которого панель и складывают. Вернуть её теперь есть чем:
    // значок в шапке, рядом с темой и языком.
    expect(bar()).toBeNull();
    expect(document.body.textContent.trim()).toBe('');
  });

  it('значок в шапке возвращает панель без перезагрузки', () => {
    folded = 'folded';
    const view = render(
      React.createElement(
        React.Fragment,
        null,
        React.createElement(AdminBarToggle),
        React.createElement(Impersonate)
      )
    );

    expect(bar()).toBeNull();
    const badge = screen.getByLabelText('Admin bar');
    expect(badge.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(badge);

    // Выбор записан — и, что важнее, второй компонент о нём узнал. `useCookie`
    // держит своё состояние в каждом вызове отдельно, так что без общего
    // события значок показывал бы «свёрнута» над раскрытой панелью до
    // перезагрузки страницы.
    expect(folded).toBe('open');
    expect(bar()).toBeTruthy();

    view.unmount();
  });

  it('значок складывает панель и переключает обратно', () => {
    folded = 'open';
    render(
      React.createElement(
        React.Fragment,
        null,
        React.createElement(AdminBarToggle),
        React.createElement(Impersonate)
      )
    );

    expect(bar()).toBeTruthy();
    // Имя у значка своё: у полосы есть собственная стрелка «Hide the admin
    // bar», и два одинаковых имени на экране путали бы того, кто читает его
    // вслух. Состояние сообщает `aria-pressed`.
    const badge = screen.getByLabelText('Admin bar');
    expect(badge.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(badge);

    expect(folded).toBe('folded');
    expect(bar()).toBeNull();
    // Один значок на оба направления: человек, свернувший панель, ищет то же
    // место, чтобы её вернуть.
    expect(badge.getAttribute('aria-pressed')).toBe('false');
  });

  it('свернуть — значит записать выбор, а не спрятать до перезагрузки', () => {
    draw();

    fireEvent.click(screen.getByLabelText('Hide the admin bar'));

    expect(folded).toBe('folded');
  });
});

describe('под чужим аккаунтом панель не убирается', () => {
  beforeEach(() => {
    impersonating = true;
  });

  it('свернуть нечем: это единственная строка, говорящая, под кем вы работаете', () => {
    folded = 'open';
    draw();

    expect(bar()).toBeTruthy();
    expect(screen.queryByLabelText('Hide the admin bar')).toBeNull();
    expect(screen.getByText('Currently Impersonating')).toBeTruthy();
  });

  it('значка тоже нет: сложить панель нечем ни отсюда, ни оттуда', () => {
    folded = 'open';
    render(React.createElement(AdminBarToggle));

    expect(screen.queryByLabelText('Admin bar')).toBeNull();
  });

  it('прежде сохранённое «убрано» не прячет её и здесь', () => {
    // Иначе супер-администратор, свернувший панель вчера, сегодня вошёл бы под
    // чужим именем и не увидел ни одной строки об этом.
    folded = 'folded';
    draw();

    expect(bar()).toBeTruthy();
    expect(screen.getByText('Currently Impersonating')).toBeTruthy();
  });
});
