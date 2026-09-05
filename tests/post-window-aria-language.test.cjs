'use strict';

/**
 * Окно поста, услышанное программой чтения с экрана.
 *
 * `content-factory-next-fn33.127`. Видимый текст окна давно по-русски, а имя
 * раздела выбора каналов оставалось английским: `aria-label="Channels"`,
 * вшитый строкой. Глазами его не видно — вслух он читается «Channels» посреди
 * русского окна, между «Выбранные каналы» и «Меню канала».
 *
 * Картинка выбора каналов принимает подписи пропами (`restrictionMessage` уже
 * так и приходит), и имя раздела идёт тем же путём: перевод берёт связанная
 * часть, у которой есть контекст, а картинка остаётся тем, чем была, — её
 * рендерит и стенд обзора интерфейса, где переводчика нет вовсе.
 */

const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const repositoryRoot = path.resolve(__dirname, '..');
const read = (relative) =>
  fs.readFileSync(path.join(repositoryRoot, relative), 'utf8');

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/launches',
});
for (const key of ['window', 'document', 'navigator']) {
  Object.defineProperty(global, key, {
    configurable: true,
    value: key === 'window' ? dom.window : dom.window[key],
  });
}
global.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const { cleanup, render, screen } = require('@testing-library/react');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const h = React.createElement;
const PICKER = 'apps/frontend/src/components/new-launch/picks.socials.component.tsx';

const russian = JSON.parse(
  read('libraries/react-shared-libraries/src/translation/locales/ru/translation.json')
);

const channel = {
  id: 'itg-telegram-1',
  name: 'Тестовая группа',
  identifier: 'telegram',
  picture: '',
  disabled: false,
  inBetweenSteps: false,
};

afterEach(cleanup);

describe('the channel picker names itself in the reader’s language', () => {
  test('the section takes its name from the caller', () => {
    const { PicksSocialsView } = loadTypeScriptModule(PICKER);

    render(
      h(PicksSocialsView, {
        integrations: [channel],
        selectedIds: [],
        label: 'Каналы',
        onToggle: () => undefined,
      })
    );

    expect(screen.getByRole('region', { name: 'Каналы' })).toBeTruthy();
  });

  test('a caller with no translator still gets an English name', () => {
    // The interface-review stand renders this view directly and has no
    // translation context at all, so the default has to stay a real word.
    const { PicksSocialsView } = loadTypeScriptModule(PICKER);

    render(
      h(PicksSocialsView, {
        integrations: [channel],
        selectedIds: [],
        onToggle: () => undefined,
      })
    );

    expect(screen.getByRole('region', { name: 'Channels' })).toBeTruthy();
  });

  test('the part that has the context is the part that translates', () => {
    const source = read(PICKER);
    expect(source).toMatch(/label=\{t\('channels', 'Channels'\)\}/);
    expect(source).toContain(
      "import { useT } from '@contentfactory/react/translation/get.transation.service.client';"
    );
    // No English name left hard-coded on the element itself.
    expect(source).not.toMatch(/aria-label="Channels"/);
  });

  test('Russian has the word', () => {
    expect(russian.channels).toBe('Каналы');
  });

  test('the reorder arrows are named through the dictionary too', () => {
    // `content-factory-next-fn33.127`, second half: «Move up» / «Move down»
    // were the last English accessible names in the post window.
    const arrows = read('apps/frontend/src/components/launches/up.down.arrow.tsx');
    expect(arrows).toMatch(/aria-label=\{t\('move_up', 'Move up'\)\}/);
    expect(arrows).toMatch(/aria-label=\{t\('move_down', 'Move down'\)\}/);
    expect(arrows).not.toMatch(/aria-label="Move (up|down)"/);
    expect(russian.move_up).toBe('Выше');
    expect(russian.move_down).toBe('Ниже');
  });
});
