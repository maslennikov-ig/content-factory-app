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

const serve = ({ stored = true, failFirstGet = false } = {}) => {
  calls = [];
  let profile = DEFAULT_PROFILE;
  let isStored = stored;
  let getCount = 0;
  global.fetch = async (url, init = {}) => {
    const method = String(init.method || 'GET').toUpperCase();
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, method, body });

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

  await waitFor(() =>
    expect(screen.getAllByRole('radiogroup')).toHaveLength(6)
  );
  expect(
    screen.getByRole('textbox', { name: 'Что ещё важно про этот канал' })
  ).not.toBeNull();
  expect(screen.getByRole('button', { name: 'Сохранить' })).not.toBeNull();
  expect(calls.filter((call) => call.method === 'GET')).toHaveLength(1);
});

test('inline editing sends one PUT and shows the normalized saved value', async () => {
  serve({ stored: false });
  const onSaved = jest.fn();
  draw({ onSaved });

  await waitFor(() =>
    expect(panel().dataset.channelWritingProfileState).toBe('view')
  );
  fireEvent.click(screen.getAllByRole('button', { name: 'Заполнить' })[0]);
  fireEvent.click(screen.getByRole('radio', { name: 'без эмодзи' }));
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
  fireEvent.click(screen.getByRole('radio', { name: 'без эмодзи' }));
  fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));

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
  const retry = await screen.findByRole('button', { name: 'Повторить' });
  expect(panel().dataset.channelWritingProfileState).toBe('error');
  fireEvent.click(retry);
  await waitFor(() =>
    expect(panel().dataset.channelWritingProfileState).toBe('view')
  );
  expect(calls.filter((call) => call.method === 'GET')).toHaveLength(2);
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
