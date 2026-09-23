'use strict';

/**
 * «Как пишем в «X»» — the channel scope of the one settings panel (`97dq.70`):
 * the same fields, order and hints as the post, the plan saved at once with the
 * inline «Только к новым / Ко всем N» question.
 */

const React = require('react');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/channels/channel-1',
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
  waitFor,
} = require('@testing-library/react');
const { SWRConfig } = require('swr');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const { ChannelWritingProfile } = loadTypeScriptModule(
  'apps/frontend/src/components/channels/channel-writing-profile.tsx'
);

const URL = '/integrations/channel-1/writing-profile';
const DEFAULT_PROFILE = {
  version: 'channel-writing-profile/v1',
  lengthPolicy: { idealMin: 500, idealMax: 1000, hardMax: 1500 },
  emojiLevel: 'few',
  linkPolicy: 'end',
  hashtagPolicy: 'none',
  ctaKind: 'question',
  formatPreference: 'auto',
  notes: null,
};

const answer = (profile = DEFAULT_PROFILE, stored = true) => ({
  integrationId: 'channel-1',
  providerIdentifier: 'telegram',
  provider: {
    name: 'Telegram',
    maxLength: 4096,
    maxCaptionLength: 1024,
    editor: 'html',
  },
  profile,
  stored,
});

const response = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

let calls = [];

const AVATARS_URL = '/content-intelligence/voice/avatars';

const PLAN_URL = '/integrations/channel-1/plan-mode';
const IMPACT_URL = '/content-intelligence/pieces/channels/channel-1/plan-impact?language=ru';
const APPLY_URL = '/content-intelligence/pieces/channels/channel-1/plan-apply?language=ru';

const serve = ({
  stored = true,
  failFirstGet = false,
  avatars = [],
  planMode = 'reserve',
  written = 0,
} = {}) => {
  calls = [];
  let profile = DEFAULT_PROFILE;
  let isStored = stored;
  let getCount = 0;
  global.fetch = async (url, init = {}) => {
    const method = String(init.method || 'GET').toUpperCase();
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, method, body });

    if (url === PLAN_URL) {
      if (method === 'PUT') planMode = body.planMode;
      return response({ integrationId: 'channel-1', planMode });
    }
    if (method === 'GET' && url === IMPACT_URL)
      return response({ integrationId: 'channel-1', planMode, count: written });
    if (method === 'POST' && url === APPLY_URL)
      return body?.planMode === planMode
        ? response({ integrationId: 'channel-1', planMode, count: written, applied: written })
        : response({ code: 'CHANNEL_PLAN_MODE_CHANGED', message: 'changed' }, 409);
    if (method === 'GET' && url === AVATARS_URL) {
      return response({ state: 'default', avatars, canManage: true, limit: 8 });
    }
    if (method === 'GET' && url === URL) {
      getCount += 1;
      if (failFirstGet && getCount === 1) return response({}, 500);
      return response(answer(profile, isStored));
    }
    if (method === 'PUT' && url === URL) {
      profile = {
        ...profile,
        lengthPolicy:
          body.lengthPolicy === 'provider_max' ? 'provider_max' : body.length,
        emojiLevel: body.emojiLevel,
        linkPolicy: body.linkPolicy,
        hashtagPolicy: body.hashtagPolicy,
        ctaKind: body.ctaKind,
        formatPreference: body.formatPreference,
        notes: body.notes ?? null,
        ...(body.brandProfileId !== undefined
          ? { brandProfileId: body.brandProfileId }
          : {}),
        ...(body.addressForm ? { addressForm: body.addressForm } : {}),
      };
      isStored = true;
      return response(answer(profile, true));
    }
    if (method === 'DELETE' && url === URL) {
      profile = DEFAULT_PROFILE;
      isStored = false;
      return response(answer(profile, false));
    }
    throw new Error(`no stub for ${method} ${url}`);
  };
};

const draw = (props = {}) =>
  render(
    React.createElement(
      SWRConfig,
      { value: { provider: () => new Map(), dedupingInterval: 0 } },
      React.createElement(ChannelWritingProfile, {
        integrationId: 'channel-1',
        integrationName: 'Мастерская',
        locale: 'ru',
        canWrite: true,
        ...props,
      })
    )
  );

const panel = () =>
  document.querySelector('[data-channel-writing-profile="channel-1"]');

afterEach(() => {
  cleanup();
  delete global.fetch;
});

const ready = () =>
  waitFor(() =>
    expect(panel().dataset.channelWritingProfileState).toBe('editing')
  );
const slider = () =>
  screen.getByRole('slider', { name: 'Сколько эмодзи можно в посте' });

test('the channel card is the post panel in the channel scope: plan first, same fields, a «?» each', async () => {
  serve();
  draw();
  await ready();
  const fieldset = panel().querySelector('fieldset');
  const order = [...fieldset.querySelectorAll('[data-post-option]')].map((node) =>
    node.getAttribute('data-post-option')
  );
  // Те же поля и тот же порядок, что у поста; своё у канала — формат.
  expect(order).toEqual(['plan', 'length', 'emoji', 'hashtags', 'links', 'cta', 'format']);
  for (const name of ['План', 'Длина', 'Хэштеги', 'Ссылки', 'Призыв', 'Формат по умолчанию'])
    expect(screen.getByLabelText(name).tagName).toBe('SELECT');
  expect(slider()).not.toBeNull();
  expect(
    screen.getByRole('textbox', { name: 'Что ещё важно про этот канал' }).maxLength
  ).toBe(500);
  for (const name of [
    'План',
    'Длина',
    'Эмодзи',
    'Ссылки',
    'Хэштеги',
    'Призыв',
    'Формат по умолчанию',
    'Что ещё важно про этот канал',
  ]) {
    const hint = screen.getByRole('button', { name: `Подсказка: ${name}` });
    expect(hint.getAttribute('data-hint-trigger')).toBe('true');
    expect(hint.closest('label')).toBeNull();
  }
  // У канала нечего перекрывать: ни «как в канале», ни рамок «изменено».
  expect(fieldset.querySelector('[data-post-option-hint]')).toBeNull();
  expect(fieldset.innerHTML).not.toContain('border-cf-signature');
  // Подписи полей — не заглавными (тринадцатый заход).
  expect(fieldset.innerHTML).not.toContain('uppercase');
  expect(screen.getByLabelText('План').value).toBe('reserve');
  // «Ссылки» — потолок, адресов не придумываем (97dq.58).
  expect(
    Array.from(screen.getByLabelText('Ссылки').options).map((node) => node.textContent)
  ).toEqual(['без ссылок', 'не больше одной, в конце', 'можно внутри текста', 'выберем сами']);
  expect(
    document.querySelector('[data-post-option-note="links"]').textContent
  ).toBe(
    'Ссылку берём из вашего текста или найденных источников — новых адресов не придумываем.'
  );
  // Эмодзи: деления и точное «до N» у старого «мало»; сравнивать не с чем.
  expect(slider().value).toBe('2');
  expect(slider().getAttribute('aria-valuetext')).toBe('до 3');
  expect(document.querySelector('[data-emoji-channel-mark]')).toBeNull();
});

test('the slider stores an exact stop', async () => {
  serve({ stored: false });
  draw();
  await ready();
  fireEvent.change(slider(), { target: { value: '3' } });
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
  await waitFor(() =>
    expect(calls.some((call) => call.method === 'PUT' && call.url === URL)).toBe(true)
  );
  expect(calls.find((call) => call.method === 'PUT').body.emojiLevel).toBe('max6');
  await waitFor(() => expect(slider().getAttribute('aria-valuetext')).toBe('до 6'));
});

test('«Сохранить» sends one PUT with the fields and the note, and notifies the parent', async () => {
  serve({ stored: false });
  const onSaved = jest.fn();
  draw({ onSaved });
  await ready();
  fireEvent.change(slider(), { target: { value: '0' } });
  fireEvent.change(screen.getByLabelText('Длина'), { target: { value: 'short' } });
  const notes = screen.getByRole('textbox', { name: 'Что ещё важно про этот канал' });
  fireEvent.change(notes, { target: { value: 'Без воды.' } });
  expect(screen.getByText(/9 из 500/)).not.toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
  await screen.findByText('Карточка сохранена.');
  const puts = calls.filter((call) => call.method === 'PUT' && call.url === URL);
  expect(puts).toHaveLength(1);
  expect(puts[0].body).toMatchObject({ emojiLevel: 'none', notes: 'Без воды.' });
  expect(onSaved).toHaveBeenCalledTimes(1);
});

test('a stored card saves only when something changed', async () => {
  serve();
  draw();
  await ready();
  const save = screen.getByRole('button', { name: 'Сохранить' });
  expect(save.disabled).toBe(true);
  fireEvent.change(screen.getByLabelText('Призыв'), { target: { value: 'none' } });
  expect(save.disabled).toBe(false);
});

test('Reset uses DELETE, returns to defaults, and notifies the parent', async () => {
  serve();
  const onSaved = jest.fn();
  draw({ onSaved });
  const reset = await screen.findByRole('button', { name: 'Вернуть умолчания' });
  fireEvent.click(reset);
  await waitFor(() =>
    expect(panel().dataset.channelWritingProfileStored).toBe('false')
  );
  expect(calls.filter((call) => call.method === 'DELETE')).toHaveLength(1);
  expect(screen.getByText(/Карточка не заполнена/)).not.toBeNull();
  expect(onSaved).toHaveBeenCalledTimes(1);
});

test('loading stays inside the panel', () => {
  calls = [];
  global.fetch = () => new Promise(() => undefined);
  draw();
  expect(panel().dataset.channelWritingProfileState).toBe('loading');
  expect(screen.getByText(/Загружаем карточку/)).not.toBeNull();
});

test('an error is recoverable in place', async () => {
  serve({ failFirstGet: true });
  draw();
  const retry = await screen.findByRole('button', { name: 'Попробовать снова' });
  expect(panel().dataset.channelWritingProfileState).toBe('error');
  fireEvent.click(retry);
  await ready();
  expect(
    calls.filter((call) => call.method === 'GET' && call.url === URL)
  ).toHaveLength(2);
});

test('read-only users see the values and cannot change them', async () => {
  serve();
  draw({ canWrite: false });
  await waitFor(() =>
    expect(panel().dataset.channelWritingProfileState).toBe('view')
  );
  expect(screen.getByLabelText('Длина').disabled).toBe(true);
  expect(screen.getByLabelText('План').disabled).toBe(true);
  expect(screen.queryByRole('button', { name: 'Сохранить' })).toBeNull();
});

test('the panel is named «Как пишем в «<канал>»», the one name of this object', async () => {
  serve();
  draw();
  await ready();
  expect(
    screen.getByRole('heading', { name: 'Как пишем в «Мастерская»' })
  ).not.toBeNull();
  expect(screen.queryByText('Как пишем сюда')).toBeNull();
});

test('who speaks is saved with the channel card, and no address form goes with it', async () => {
  serve({
    avatars: [
      { id: 'av-1', name: 'Игорь', isDefault: true, analysed: true },
      { id: 'av-2', name: 'Студия', kind: 'BRAND', analysed: true },
    ],
  });
  draw();
  const speaker = await screen.findByRole('combobox', { name: 'Кто говорит' });
  expect(
    [...speaker.querySelectorAll('option')].map((option) => option.textContent)
  ).toEqual(['По умолчанию', 'Игорь', 'Студия']);
  expect(speaker.value).toBe('');
  fireEvent.change(speaker, { target: { value: 'av-2' } });
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
  await screen.findByText('Карточка сохранена.');
  const put = calls.find((call) => call.method === 'PUT' && call.url === URL).body;
  expect(put).toMatchObject({ brandProfileId: 'av-2' });
  expect(put).not.toHaveProperty('addressForm');
});

test('«По умолчанию» is an explicit null, not a missing field', async () => {
  serve({
    avatars: [
      { id: 'av-1', name: 'Игорь', isDefault: true },
      { id: 'av-2', name: 'Студия' },
    ],
  });
  draw();
  const speaker = await screen.findByRole('combobox', { name: 'Кто говорит' });
  fireEvent.change(speaker, { target: { value: 'av-1' } });
  fireEvent.change(speaker, { target: { value: '' } });
  fireEvent.change(screen.getByLabelText('Призыв'), { target: { value: 'none' } });
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
  await waitFor(() =>
    expect(calls.some((call) => call.method === 'PUT' && call.url === URL)).toBe(true)
  );
  expect(
    calls.find((call) => call.method === 'PUT' && call.url === URL).body.brandProfileId
  ).toBe(null);
});

test('the busy save keeps its label and width through Button loading', async () => {
  serve({ stored: false });
  let release;
  const base = global.fetch;
  global.fetch = (url, init = {}) =>
    String(init.method || 'GET').toUpperCase() === 'PUT' && url === URL
      ? new Promise((resolve) => {
          release = () => resolve(base(url, init));
        })
      : base(url, init);
  draw();
  await ready();
  const save = screen.getByRole('button', { name: /Сохранить/ });
  fireEvent.click(save);
  await waitFor(() => expect(save.getAttribute('aria-busy')).toBe('true'));
  expect(save.textContent).toContain('Сохранить');
  expect(save.textContent).toContain('Сохраняем…');
  await act(async () => release());
});

describe('«План» of the channel (97dq.57, 97dq.70)', () => {
  const choose = async (mode) => {
    const plan = screen.getByLabelText('План');
    await act(async () => {
      fireEvent.change(plan, { target: { value: mode } });
    });
  };

  test('saves on choice, apart from the card; nothing written — no question', async () => {
    serve({ planMode: 'draft' });
    draw();
    await ready();
    await waitFor(() => expect(screen.getByLabelText('План').value).toBe('draft'));
    expect(screen.getByText('Адаптация лежит черновиком. Время выбираете сами.')).toBeTruthy();
    await choose('autopilot');
    await screen.findByText('Сохранено');
    expect(
      calls.filter((call) => call.url === PLAN_URL && call.method === 'PUT').map((call) => call.body)
    ).toEqual([{ planMode: 'autopilot' }]);
    expect(calls.filter((call) => call.url === URL && call.method !== 'GET')).toEqual([]);
    expect(document.querySelector('[data-channel-plan-apply]')).toBeNull();
    expect(calls.some((call) => call.url === APPLY_URL)).toBe(false);
  });

  test('with written posts it asks inline; «Только к новым» is the default and applies nothing', async () => {
    serve({ written: 3 });
    draw();
    await ready();
    await choose('autopilot');
    const question = await screen.findByRole('group', {
      name: 'Применить к 3 уже написанным постам или только к новым?',
    });
    expect(question.textContent).toContain('Посты, у которых свой режим, не меняются.');
    const onlyNew = screen.getByRole('button', { name: 'Только к новым' });
    // Главная — «Только к новым»; «Ко всем N» — второй вес.
    expect(onlyNew.className).toContain('bg-cf-accent');
    fireEvent.click(onlyNew);
    expect(
      screen.getByText('Режим канала — для новых постов. Написанные остались как были.')
    ).toBeTruthy();
    expect(calls.some((call) => call.url === APPLY_URL)).toBe(false);
  });

  test('«Ко всем N» applies the channel mode to the written posts', async () => {
    serve({ written: 1 });
    draw();
    await ready();
    await choose('draft');
    await screen.findByRole('group', {
      name: 'Применить к 1 уже написанному посту или только к новым?',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ко всем 1' }));
    await screen.findByText('Режим применён к 1 посту.');
    const applies = calls.filter((call) => call.url === APPLY_URL && call.method === 'POST');
    expect(applies).toHaveLength(1);
    // Ответ несёт режим, на который человек отвечал (ревью 97dq.70).
    expect(applies[0].body).toEqual({ planMode: 'draft' });
    // Системных окон нет: вопрос и ответ — в самой карточке.
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  test('the channel mode changed since the question: 409 says so and nothing is applied', async () => {
    serve({ written: 2 });
    draw();
    await ready();
    await choose('autopilot');
    await screen.findByRole('group', {
      name: 'Применить к 2 уже написанным постам или только к новым?',
    });
    // Кто-то другой сменил режим канала, пока вопрос висел.
    const base = global.fetch;
    global.fetch = (url, init = {}) =>
      url === APPLY_URL
        ? base(url, { ...init, body: JSON.stringify({ planMode: 'draft' }) })
        : base(url, init);
    fireEvent.click(screen.getByRole('button', { name: 'Ко всем 2' }));
    await screen.findByText(
      'Режим канала уже сменился. Написанные посты не тронуты — выберите режим ещё раз.'
    );
  });

  test('a late impact answer for an earlier choice does not ask about it', async () => {
    serve({ written: 4 });
    const base = global.fetch;
    let releaseFirst;
    let impacts = 0;
    global.fetch = (url, init = {}) => {
      if (url === IMPACT_URL && (impacts += 1) === 1)
        return new Promise((resolve) => {
          releaseFirst = () => resolve(base(url, init));
        });
      return base(url, init);
    };
    draw();
    await ready();
    await choose('autopilot');
    await waitFor(() => expect(typeof releaseFirst).toBe('function'));
    await choose('draft');
    await screen.findByRole('group', {
      name: 'Применить к 4 уже написанным постам или только к новым?',
    });
    // Ответ «Только к новым» на второй выбор, потом приходит счёт первого.
    fireEvent.click(screen.getByRole('button', { name: 'Только к новым' }));
    await act(async () => releaseFirst());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(document.querySelector('[data-channel-plan-apply]')).toBeNull();
    expect(screen.getByLabelText('План').value).toBe('draft');
  });
});
