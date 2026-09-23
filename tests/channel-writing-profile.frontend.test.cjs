'use strict';

/** Shared writing-profile fields and the inline channel panel. */

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
const { WritingProfileCard } = loadTypeScriptModule(
  'apps/frontend/src/components/content-intelligence/intake/writing-profile.card.tsx'
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

const serve = ({ stored = true, failFirstGet = false, avatars = [] } = {}) => {
  calls = [];
  let profile = DEFAULT_PROFILE;
  let isStored = stored;
  let getCount = 0;
  global.fetch = async (url, init = {}) => {
    const method = String(init.method || 'GET').toUpperCase();
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, method, body });

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

test('the existing piece dialog uses the shared segmented fields', async () => {
  serve();
  render(
    React.createElement(
      SWRConfig,
      { value: { provider: () => new Map(), dedupingInterval: 0 } },
      React.createElement(WritingProfileCard, {
        locale: 'ru',
        integrationId: 'channel-1',
        integrationName: 'Мастерская',
        canWrite: true,
        open: true,
        onClose: () => undefined,
      })
    )
  );

  // Five policy rows and the channel plan (97dq.57); emoji is a slider «до N»
  // since 97dq.61. «Обращение» left on 23.09.2026 (97dq.45). «Кто говорит
  // здесь» is not drawn: this workspace has no second avatar to choose.
  await waitFor(() =>
    expect(screen.getAllByRole('radiogroup')).toHaveLength(6)
  );
  expect(
    screen.getByRole('slider', { name: 'Сколько эмодзи можно в посте' })
  ).not.toBeNull();
  // The plan defaults to «Бронь» even when the server has nothing to say.
  const planGroup = screen.getByRole('radiogroup', { name: 'План' });
  expect(
    planGroup.querySelector('[aria-checked="true"]').getAttribute('data-channel-plan-option')
  ).toBe('reserve');
  expect(screen.queryByRole('radiogroup', { name: 'Обращение' })).toBeNull();
  expect(screen.queryByRole('combobox', { name: 'Кто говорит здесь' })).toBeNull();
  expect(
    screen.getByRole('dialog', { name: 'Как пишем в «Мастерская»' })
  ).not.toBeNull();
  expect(
    screen.getByRole('textbox', { name: 'Что ещё важно про этот канал' })
  ).not.toBeNull();
  expect(screen.getByRole('button', { name: 'Сохранить' })).not.toBeNull();
  expect(
    calls.filter((call) => call.method === 'GET' && call.url === URL)
  ).toHaveLength(1);
  // «Ссылки» is a ceiling, and URLs are never invented (97dq.58).
  const links = screen.getByRole('radiogroup', { name: 'Ссылки' });
  expect(
    Array.from(links.querySelectorAll('[role="radio"]')).map((node) => node.textContent)
  ).toEqual(['без ссылок', 'не больше одной, в конце', 'можно внутри текста', 'выберем сами']);
  expect(
    document.querySelector('[data-writing-profile-note="links"]').textContent
  ).toBe(
    'Ссылку берём из вашего текста или найденных источников — новых адресов не придумываем.'
  );
});

test('«Как пишем в …»: every parameter and the plan carry a «?» (twelfth-wave canvas)', async () => {
  serve();
  render(
    React.createElement(
      SWRConfig,
      { value: { provider: () => new Map(), dedupingInterval: 0 } },
      React.createElement(WritingProfileCard, {
        locale: 'ru',
        integrationId: 'channel-1',
        integrationName: 'Мастерская',
        canWrite: true,
        open: true,
        onClose: () => undefined,
      })
    )
  );
  await waitFor(() =>
    expect(screen.getAllByRole('radiogroup')).toHaveLength(6)
  );
  for (const name of [
    'Длина',
    'Эмодзи',
    'Ссылки',
    'Хэштеги',
    'Призыв',
    'Формат по умолчанию',
    'Что ещё важно про этот канал',
    'План',
  ]) {
    const hint = screen.getByRole('button', { name: `Подсказка: ${name}` });
    expect(hint.getAttribute('data-hint-trigger')).toBe('true');
  }
  // Подсказка плана стоит рядом с подписью набора заглавными, а не внутри.
  const planHint = screen.getByRole('button', { name: 'Подсказка: План' });
  expect(planHint.closest('[id^="channel-plan-mode-"]')).toBeNull();
  // Эмодзи на карточке — бегунок: деления и точное «до N» у старого «мало».
  const slider = screen.getByRole('slider', { name: 'Сколько эмодзи можно в посте' });
  expect(slider.value).toBe('2');
  expect(slider.getAttribute('aria-valuetext')).toBe('до 3');
  expect(
    Array.from(document.querySelectorAll('[data-emoji-divisions] > span')).map(
      (node) => node.textContent
    )
  ).toEqual(['нет', '1', '3', '6', '10', 'без предела']);
  // На карточке канала сравнивать не с чем — серой отметки нет.
  expect(document.querySelector('[data-emoji-channel-mark]')).toBeNull();
});

test('the slider stores an exact stop and the card reads it back as «до N»', async () => {
  serve({ stored: false });
  draw();
  await waitFor(() =>
    expect(panel().dataset.channelWritingProfileState).toBe('view')
  );
  fireEvent.click(screen.getAllByRole('button', { name: 'Заполнить' })[0]);
  fireEvent.change(
    screen.getByRole('slider', { name: 'Сколько эмодзи можно в посте' }),
    { target: { value: '3' } }
  );
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
  await waitFor(() =>
    expect(panel().dataset.channelWritingProfileState).toBe('view')
  );
  expect(calls.find((call) => call.method === 'PUT').body.emojiLevel).toBe('max6');
  expect(screen.getByText('до 6')).not.toBeNull();
});

test('inline editing sends one PUT and shows the normalized saved value', async () => {
  serve({ stored: false });
  const onSaved = jest.fn();
  draw({ onSaved });

  await waitFor(() =>
    expect(panel().dataset.channelWritingProfileState).toBe('view')
  );
  fireEvent.click(screen.getAllByRole('button', { name: 'Заполнить' })[0]);
  fireEvent.change(
    screen.getByRole('slider', { name: 'Сколько эмодзи можно в посте' }),
    { target: { value: '0' } }
  );
  const notes = screen.getByRole('textbox', {
    name: 'Что ещё важно про этот канал',
  });
  expect(notes.maxLength).toBe(500);
  fireEvent.change(notes, { target: { value: 'Без воды.' } });
  expect(screen.getByText(/9 из 500/)).not.toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

  await waitFor(() =>
    expect(panel().dataset.channelWritingProfileState).toBe('view')
  );
  expect(calls.filter((call) => call.method === 'PUT')).toHaveLength(1);
  expect(calls.find((call) => call.method === 'PUT').body).toMatchObject({
    emojiLevel: 'none',
    notes: 'Без воды.',
  });
  expect(screen.getByText('без эмодзи')).not.toBeNull();
  expect(onSaved).toHaveBeenCalledTimes(1);
});

test('Cancel restores the view without PUT or DELETE', async () => {
  serve();
  draw();

  await screen.findByRole('button', { name: 'Изменить' });
  fireEvent.click(screen.getByRole('button', { name: 'Изменить' }));
  fireEvent.change(
    screen.getByRole('slider', { name: 'Сколько эмодзи можно в посте' }),
    { target: { value: '0' } }
  );
  fireEvent.click(screen.getByRole('button', { name: 'Отменить' }));

  expect(panel().dataset.channelWritingProfileState).toBe('view');
  expect(calls.filter((call) => call.method !== 'GET')).toHaveLength(0);
  expect(screen.getByText('мало · 1–3')).not.toBeNull();
});

test('Reset uses DELETE, returns to defaults, and notifies the parent', async () => {
  serve();
  const onSaved = jest.fn();
  draw({ initiallyEditing: true, onSaved });

  const reset = await screen.findByRole('button', {
    name: 'Вернуть умолчания',
  });
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
  const retry = await screen.findByRole('button', {
    name: 'Попробовать снова',
  });
  expect(panel().dataset.channelWritingProfileState).toBe('error');
  fireEvent.click(retry);
  await waitFor(() =>
    expect(panel().dataset.channelWritingProfileState).toBe('view')
  );
  expect(
    calls.filter((call) => call.method === 'GET' && call.url === URL)
  ).toHaveLength(2);
});

test('read-only users see values and no editing action', async () => {
  serve();
  draw({ canWrite: false, initiallyEditing: true });

  await waitFor(() =>
    expect(panel().dataset.channelWritingProfileState).toBe('view')
  );
  expect(screen.getByText('500–1000')).not.toBeNull();
  expect(screen.queryByRole('button', { name: 'Изменить' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Сохранить' })).toBeNull();
});

test('the panel is named «Как пишем в «<канал>»», the one name of this object', async () => {
  serve();
  draw();
  await waitFor(() =>
    expect(panel().dataset.channelWritingProfileState).toBe('view')
  );
  expect(
    screen.getByRole('heading', { name: 'Как пишем в «Мастерская»' })
  ).not.toBeNull();
  expect(screen.queryByText('Как пишем сюда')).toBeNull();
  expect(screen.queryByText('Настройки канала')).toBeNull();
});

test('who speaks is saved with the channel card, and no address form goes with it', async () => {
  serve({
    avatars: [
      { id: 'av-1', name: 'Игорь', isDefault: true, analysed: true },
      { id: 'av-2', name: 'Студия', kind: 'BRAND', analysed: true },
    ],
  });
  draw({ initiallyEditing: true });

  const speaker = await screen.findByRole('combobox', {
    name: 'Кто говорит здесь',
  });
  expect(
    [...speaker.querySelectorAll('option')].map((option) => option.textContent)
  ).toEqual(['По умолчанию', 'Игорь', 'Студия']);
  expect(speaker.value).toBe('');
  fireEvent.change(speaker, { target: { value: 'av-2' } });
  expect(screen.queryByRole('radio', { name: 'на «вы»' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

  await waitFor(() =>
    expect(panel().dataset.channelWritingProfileState).toBe('view')
  );
  const put = calls.find((call) => call.method === 'PUT').body;
  expect(put).toMatchObject({ brandProfileId: 'av-2' });
  expect(put).not.toHaveProperty('addressForm');
  expect(screen.getByText('Студия')).not.toBeNull();
  expect(screen.queryByText('Обращение')).toBeNull();
});

test('«По умолчанию» is an explicit null, not a missing field', async () => {
  serve({
    avatars: [
      { id: 'av-1', name: 'Игорь', isDefault: true },
      { id: 'av-2', name: 'Студия' },
    ],
  });
  draw({ initiallyEditing: true });
  const speaker = await screen.findByRole('combobox', {
    name: 'Кто говорит здесь',
  });
  fireEvent.change(speaker, { target: { value: 'av-1' } });
  fireEvent.change(speaker, { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
  await waitFor(() =>
    expect(calls.some((call) => call.method === 'PUT')).toBe(true)
  );
  expect(calls.find((call) => call.method === 'PUT').body.brandProfileId).toBe(
    null
  );
});

test('the busy save keeps its label and width through Button loading', async () => {
  serve();
  let release;
  const base = global.fetch;
  global.fetch = (url, init = {}) =>
    String(init.method || 'GET').toUpperCase() === 'PUT'
      ? new Promise((resolve) => {
          release = () => resolve(base(url, init));
        })
      : base(url, init);
  draw({ initiallyEditing: true });
  const save = await screen.findByRole('button', { name: /Сохранить/ });
  fireEvent.click(save);
  await waitFor(() => expect(save.getAttribute('aria-busy')).toBe('true'));
  expect(save.textContent).toContain('Сохранить');
  expect(save.textContent).toContain('Сохраняем…');
  await act(async () => release());
});

test('the channel plan saves on choice, apart from the card (97dq.57)', async () => {
  serve();
  const saved = [];
  const base = global.fetch;
  global.fetch = async (url, init = {}) => {
    if (String(url).endsWith('/integrations/channel-1/plan-mode')) {
      const method = String(init.method || 'GET').toUpperCase();
      if (method === 'PUT') saved.push(JSON.parse(String(init.body)));
      return response({ integrationId: 'channel-1', planMode: method === 'PUT' ? 'autopilot' : 'draft' });
    }
    return base(url, init);
  };
  render(
    React.createElement(
      SWRConfig,
      { value: { provider: () => new Map(), dedupingInterval: 0 } },
      React.createElement(WritingProfileCard, {
        locale: 'ru',
        integrationId: 'channel-1',
        integrationName: 'Мастерская',
        canWrite: true,
        open: true,
        onClose: () => undefined,
      })
    )
  );
  const group = await screen.findByRole('radiogroup', { name: 'План' });
  await waitFor(() =>
    expect(group.querySelector('[aria-checked="true"]').getAttribute('data-channel-plan-option')).toBe('draft')
  );
  expect(screen.getByText('Адаптация лежит черновиком. Время выбираете сами.')).toBeTruthy();
  fireEvent.click(group.querySelector('[data-channel-plan-option="autopilot"]'));
  await screen.findByText('Сохранено');
  expect(saved).toEqual([{ planMode: 'autopilot' }]);
  expect(group.querySelector('[aria-checked="true"]').getAttribute('data-channel-plan-option')).toBe('autopilot');
});
