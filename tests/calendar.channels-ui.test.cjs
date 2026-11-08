'use strict';
const React = require('react');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/launches' });
for (const key of ['window', 'document', 'navigator']) Object.defineProperty(global, key, { configurable: true, value: key === 'window' ? dom.window : dom.window[key] });
global.IS_REACT_ACT_ENVIRONMENT = true;
const { render, cleanup, fireEvent, screen, waitFor } = require('@testing-library/react');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const h = React.createElement;
const request = jest.fn();
const saved = jest.fn();
const mocks = {
  '@contentfactory/react/translation/use-interface-language': { useInterfaceLanguage: () => 'ru' },
  '@contentfactory/react/translation/get.transation.service.client': { useT: () => (_key, fallback) => fallback },
  './get.transation.service.client': { useT: () => (_key, fallback) => fallback },
  '@contentfactory/helpers/utils/custom.fetch': { useFetch: () => request },
  '../ui/layers': { Popover: ({ children, ariaLabel }) => h('div', { role: 'dialog', 'aria-label': ariaLabel }, children) },
};
const { SelectChannels } = loadWithMocks('apps/frontend/src/components/launches/select.channels.tsx', mocks);
const { ChannelNameForm } = loadWithMocks('apps/frontend/src/components/channels/channel-name.form.tsx', mocks);
afterEach(cleanup);
beforeEach(() => { request.mockReset(); saved.mockReset(); });

test('multiselect announces selection, searches alias/original, keeps multiple choices and resets all', () => {
  const rows = [{ id: 'a', name: 'Первый' }, { id: 'b', name: 'Команда', originalName: 'Provider', displayName: 'Команда' }];
  function Wrapper() {
    const [value, onChange] = React.useState([]);
    return h(SelectChannels, { integrations: rows, value, onChange });
  }
  render(h(Wrapper));
  fireEvent.click(screen.getByRole('button', { name: 'Все каналы' }));
  expect(screen.getByRole('dialog', { name: 'Выбор каналов' })).toBeTruthy();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Первый' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Команда' }));
  expect(screen.getByRole('button', { name: 'Каналы: 2' }).getAttribute('aria-expanded')).toBe('true');
  expect(screen.getByRole('checkbox', { name: 'Первый' }).checked).toBe(true);
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'provider' } });
  expect(screen.queryByRole('checkbox', { name: 'Первый' })).toBeNull();
  expect(screen.getByRole('checkbox', { name: 'Команда' }).checked).toBe(true);
  fireEvent.click(screen.getByRole('checkbox', { name: 'Все каналы' }));
  expect(screen.getByRole('button', { name: 'Все каналы' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Готово' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Все каналы' }));
});

test('failed alias save preserves input and reset uses only local display-name endpoint', async () => {
  request.mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: true });
  render(h(ChannelNameForm, { id: 'a', name: 'Команда', originalName: 'Provider', onSaved: saved }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Название' }), { target: { value: 'Новое' } });
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
  await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
  expect(screen.getByRole('textbox', { name: 'Название' }).value).toBe('Новое');
  expect(saved).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Вернуть имя площадки' }));
  await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
  expect(request.mock.calls.map(([url]) => url)).toEqual(['/integrations/a/display-name', '/integrations/a/display-name']);
  expect(JSON.parse(request.mock.calls[1][1].body)).toEqual({ name: '' });
});

test('group rename requires a nonblank name and uses the workspace group endpoint', async () => {
  request.mockResolvedValue({ ok: true });
  render(h(ChannelNameForm, { id: 'group-a', name: 'Группа', group: true, onSaved: saved }));
  const input = screen.getByRole('textbox', { name: 'Название' });
  fireEvent.change(input, { target: { value: ' ' } });
  expect(screen.getByRole('button', { name: 'Сохранить' }).disabled).toBe(true);
  fireEvent.change(input, { target: { value: '  Другая  ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
  await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
  expect(request.mock.calls[0][0]).toBe('/integrations/customers/group-a');
  expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({ name: 'Другая' });
});
