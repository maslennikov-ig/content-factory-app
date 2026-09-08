'use strict';
const React = require('react');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/channels' });
for (const key of ['window', 'document', 'navigator']) Object.defineProperty(global, key, { configurable: true, value: key === 'window' ? dom.window : dom.window[key] });
global.IS_REACT_ACT_ENVIRONMENT = true;
const { render, cleanup, fireEvent, screen } = require('@testing-library/react');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const h = React.createElement;
const path = 'apps/frontend/src/components/channels/';
let rows;
let listError = null;
let listLoading = false;
let mobile = false;
let role = 'ADMIN';
let routeId = 'one';
const push = jest.fn();
const reload = jest.fn();
const action = jest.fn();
const base = { identifier: 'telegram', contentLanguage: 'ru', time: [], inBetweenSteps: false, disabled: false, writingProfileStored: false };
const fixtures = () => [{ ...base, id: 'one', name: 'Первый' }, { ...base, id: 'two', name: 'Второй', refreshNeeded: true }, { ...base, id: 'three', name: 'Третий' }];
const mocks = {
  'next/link': { __esModule: true, default: ({ children, ...props }) => h('a', props, children) },
  'next/navigation': { useRouter: () => ({ push }), useParams: () => ({ id: routeId }), useSearchParams: () => new URLSearchParams() },
  '@mantine/hooks': { useMediaQuery: () => mobile },
  '@contentfactory/react/helpers/variable.context': { useVariables: () => ({ language: 'ru' }) },
  '@contentfactory/helpers/utils/custom.fetch': { useFetch: () => jest.fn() },
  '@contentfactory/react/form/input': { Input: ({ standalone, fieldClassName, ...props }) => h('input', props) },
  '../layout/user.context': { useUser: () => ({ role, totalChannels: 10 }) },
  '../launches/helpers/use.integration.list': { useIntegrationList: () => ({ data: rows, mutate: reload, isLoading: listLoading, error: listError }) },
  '../launches/calendar.context': { CalendarContext: React.createContext({}), calendarDefaults: {} },
  '../launches/add.provider.component': {
    AddProviderButton: ({ label = 'Подключить канал', renderTrigger }) => role === 'ADMIN' ? renderTrigger ? renderTrigger(action) : h('button', { onClick: action }, label) : null,
    AddProviderComponent: ({ social }) => h('div', null, social.map(provider => h('button', { key: provider.identifier, onClick: action }, provider.name))),
  },
  './channel-parts': {
    ChannelAvatar: () => null,
    ChannelStatus: ({ row }) => h('span', null, row.refreshNeeded ? 'нужно переподключить' : 'работает'),
    ChannelSlots: () => h('span', null, 'без расписания'),
    channelDate: value => value || '—',
  },
  './channel-menu': { ChannelMenu: ({ renderActions }) => renderActions ? renderActions(h('button', null, 'Меню канала'), role === 'ADMIN' ? { reconnect: action, schedule: action, group: action, changeBot: action, disable: action, remove: action } : {}) : h('button', null, 'Меню канала') },
  './channel-writing-profile': { ChannelWritingProfile: ({ canWrite }) => h('section', null, h('h3', null, 'Как пишем сюда'), canWrite && h('button', null, 'Изменить карточку')) },
  swr: { __esModule: true, default: key => key === '/integrations' ? ({ data: { social: [{ name: 'Telegram', identifier: 'telegram' }], article: [] } }) : ({ data: { total: 0, posts: [] } }) },
};
const { ChannelsScreen } = loadWithMocks(path + 'channels-screen.tsx', mocks);
const { ChannelScreen } = loadWithMocks(path + 'channel-screen.tsx', mocks);
const model = loadWithMocks(path + 'channel-model.ts');
beforeEach(() => { rows = fixtures(); listError = null; listLoading = false; mobile = false; role = 'ADMIN'; routeId = 'one'; document.cookie = 'channels-view=; Max-Age=0; path=/'; push.mockClear(); action.mockClear(); });
afterEach(cleanup);

test('default cards, table has the same rows, view survives remount; both share search and state filter', () => {
  let result = render(h(ChannelsScreen));
  expect(result.container.querySelectorAll('article[data-channel-id]')).toHaveLength(3);
  fireEvent.click(screen.getByRole('radio', { name: 'Таблица' }));
  expect(result.container.querySelectorAll('tbody tr')).toHaveLength(3);
  expect(document.cookie).toContain('channels-view=table');
  result.unmount(); result = render(h(ChannelsScreen));
  expect(screen.getByRole('radio', { name: 'Таблица' }).getAttribute('aria-checked')).toBe('true');
  expect(result.container.querySelectorAll('tbody tr')).toHaveLength(3);
  fireEvent.click(screen.getByRole('radio', { name: 'Требуют внимания · 1' }));
  expect(result.container.querySelectorAll('tbody tr')).toHaveLength(1);
  expect(result.container.querySelector('tbody tr').getAttribute('data-channel-id')).toBe('two');
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'ВТОРОЙ' } });
  expect(result.container.querySelectorAll('tbody tr')).toHaveLength(1);
  fireEvent.click(screen.getByRole('radio', { name: 'Карточки' }));
  expect(result.container.querySelectorAll('article[data-channel-id]')).toHaveLength(1);
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Первый' } });
  expect(screen.getByText('Каналы не найдены')).toBeTruthy();
});

test('cards and rows route to the same detail; action clicks do not navigate the parent', () => {
  const result = render(h(ChannelsScreen));
  fireEvent.click(result.container.querySelector('article[data-channel-id="two"]'));
  expect(push).toHaveBeenLastCalledWith('/channels/two');
  push.mockClear();
  fireEvent.click(screen.getAllByRole('button', { name: 'Меню канала' })[0]);
  expect(push).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('radio', { name: 'Таблица' }));
  fireEvent.click(result.container.querySelector('tr[data-channel-id="two"]'));
  expect(push).toHaveBeenLastCalledWith('/channels/two');
});

test('empty state renders real provider catalog flow; readers do not receive connection controls', () => {
  rows = []; const result = render(h(ChannelsScreen));
  expect(screen.getByText('Каналов пока нет')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Telegram' }));
  expect(action).toHaveBeenCalledTimes(1);
  result.unmount(); role = 'USER'; render(h(ChannelsScreen));
  expect(screen.queryByRole('button', { name: 'Telegram' })).toBeNull();
  expect(screen.getByText('Подключать каналы и менять их настройки может администратор.')).toBeTruthy();
});

test('detail has all four panels and expired access action; mobile tabs select the corresponding panel', () => {
  routeId = 'two'; let result = render(h(ChannelScreen));
  for (const name of ['Как пишем сюда', 'Расписание', 'Что здесь выходило', 'Подключение']) expect(screen.getByRole('heading', { name })).toBeTruthy();
  expect(screen.getByText('Доступ к площадке истёк. Переподключите канал, чтобы публикации продолжились.')).toBeTruthy();
  fireEvent.click(screen.getAllByRole('button', { name: 'Переподключить' })[0]);
  expect(action).toHaveBeenCalledTimes(1);
  result.unmount(); mobile = true; render(h(ChannelScreen));
  expect(screen.getByRole('tab', { name: 'Карточка' }).getAttribute('aria-selected')).toBe('true');
  fireEvent.click(screen.getByRole('tab', { name: 'Расписание' }));
  expect(screen.getByRole('tabpanel').textContent).toContain('Расписание');
  expect(screen.getByText('‹ Каналы')).toBeTruthy();
});

test('read-only detail offers no write actions, safe links are never invented', () => {
  role = 'USER'; render(h(ChannelScreen));
  expect(screen.queryByRole('button', { name: 'Удалить' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Изменить карточку' })).toBeNull();
  expect(screen.queryByRole('link', { name: 'Открыть на площадке ↗' })).toBeNull();
  expect(model.publicChannelUrl('javascript:alert(1)')).toBeNull();
  expect(model.publicChannelUrl('https://user:pass@example.test')).toBeNull();
  expect(model.publicChannelUrl('https://example.test/channel')).toBe('https://example.test/channel');
  expect(model.channelView('unknown')).toBe('cards');
});

test('mobile list CSS always keeps cards, hides desktop switch/table at the named table breakpoint', () => {
  const fs = require('node:fs');
  const source = fs.readFileSync(require('node:path').resolve(__dirname, '..', path, 'channels-screen.tsx'), 'utf8');
  expect(source).toContain('hidden table:block');
  expect(source).toContain("view === 'table' && 'table:hidden'");
  expect(source).not.toContain('min-[');
});

 test('loading and failed requests do not claim the workspace has no channels', () => {
  rows = []; listLoading = true;
  const result = render(h(ChannelsScreen));
  expect(screen.getByRole('status')).toBeTruthy();
  expect(screen.queryByText('Каналов пока нет')).toBeNull();
  result.unmount(); listLoading = false; listError = new Error('offline'); render(h(ChannelsScreen));
  expect(screen.getByRole('alert').textContent).toContain('Не удалось загрузить каналы');
  fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
  expect(reload).toHaveBeenCalled();
  expect(screen.queryByText('Каналов пока нет')).toBeNull();
});
