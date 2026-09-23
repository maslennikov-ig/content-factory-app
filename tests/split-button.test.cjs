'use strict';

/**
 * Кнопка с выбором — одна на продукт (`content-factory-next-97dq.60`, A).
 *
 * Владелец на холсте: «Было» — «Запланировать» со срезанными левыми углами и
 * треугольником в шестидесяти пикселях от подписи. Выбрано A: одна плашка,
 * черта перед стрелкой, одна стрелка 14px во всех меню. Здесь держится, что
 * это один общий компонент в обоих местах, что он одна плашка снаружи и две
 * настоящие кнопки внутри, и что подписи, обработчики и метки остались.
 */

const fs = require('node:fs');
const path = require('node:path');
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
  cleanup,
  fireEvent,
  render,
  screen,
} = require('@testing-library/react');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const code = (relative) =>
  read(relative)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1 ');

const SPLIT = 'apps/frontend/src/components/ui/split-button.tsx';
const BAR = 'apps/frontend/src/components/content-intelligence/pieces/schedule-bar.tsx';
const MANAGE = 'apps/frontend/src/components/new-launch/manage.modal.tsx';

const { SplitButton, MENU_CHEVRON_SIZE } = loadTypeScriptModule(SPLIT);
const { ScheduleBar } = loadTypeScriptModule(BAR);

afterEach(cleanup);

const drawBar = (props = {}) =>
  render(
    React.createElement(ScheduleBar, {
      locale: 'ru',
      state: 'draft',
      date: null,
      when: React.createElement('span', { 'data-when': 'true' }, 'завтра'),
      canWrite: true,
      busy: null,
      calendarHref: '/launches',
      onSchedule: () => undefined,
      onPublishNow: () => undefined,
      onUnschedule: () => undefined,
      onDelete: () => undefined,
      ...props,
    })
  );

describe('one component in both places', () => {
  test('the schedule bar and the post window both draw the shared SplitButton', () => {
    for (const file of [BAR, MANAGE]) {
      const source = code(file);
      expect(source).toMatch(/import \{ SplitButton \} from '\.\.\/(\.\.\/)?ui\/split-button'/);
      expect(source).toMatch(/<SplitButton\b/);
      // Старый треугольник 6×4 ушёл из обоих: стрелка одна, 14px.
      expect(source).not.toMatch(/DropdownArrowSmallIcon/);
      // И ни одной самодельной склейки половинок.
      expect(source).not.toMatch(/rounded-s-none/);
    }
    expect(MENU_CHEVRON_SIZE).toBe(14);
  });

  test('the post window keeps its label, its handlers and its refusal', () => {
    const manage = code(MANAGE);
    const plate = manage.slice(manage.indexOf('<SplitButton'));
    expect(plate).toMatch(/disabled=\{publishDisabled\}/);
    expect(plate).toMatch(/onClick=\{schedule\('schedule'\)\}/);
    expect(plate).toMatch(/onSelect: schedule\('now'\)/);
    expect(plate).toMatch(/\{mainActionLabel\}/);
    expect(plate).toMatch(/menuLabel=\{composeCopy\[voiceLocale\]\.morePublishingActions\}/);
  });
});

describe('one plate outside, two real buttons inside', () => {
  test('the schedule bar: main half, a divider, a 14px chevron, one radius outside', () => {
    drawBar();
    const plate = document.querySelector('[data-split-button="schedule"]');
    expect(plate).not.toBeNull();
    const [main, menu] = plate.querySelectorAll('button');
    // Метка для стенда и тестов осталась на главной половине.
    expect(main.getAttribute('data-schedule-action')).toBe('schedule');
    expect(main.textContent).toContain('Запланировать');
    expect(main.className).toContain('rounded-s-[8px]');
    expect(main.className).toContain('rounded-e-none');
    expect(menu.className).toContain('rounded-e-[8px]');
    expect(menu.className).toContain('rounded-s-none');
    expect(menu.getAttribute('aria-haspopup')).toBe('menu');
    expect(menu.getAttribute('aria-label')).toBe('Другие способы отправить');
    const divider = menu.querySelector('[data-split-button-divider]');
    expect(divider.className).toContain('opacity-[.35]');
    const chevron = menu.querySelector('[data-menu-chevron]');
    expect(chevron.getAttribute('width')).toBe('14');
    expect(chevron.getAttribute('height')).toBe('14');
  });

  test('the main half runs the action; the chevron opens the other one', () => {
    const onSchedule = jest.fn();
    const onPublishNow = jest.fn();
    drawBar({ onSchedule, onPublishNow });
    fireEvent.click(screen.getByRole('button', { name: 'Запланировать' }));
    expect(onSchedule).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Другие способы отправить' }));
    expect(screen.getByRole('menu')).not.toBeNull();
    fireEvent.click(screen.getByRole('menuitem', { name: /Опубликовать сейчас/ }));
    expect(onPublishNow).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  test('a press outside closes the menu', () => {
    drawBar();
    fireEvent.click(screen.getByRole('button', { name: 'Другие способы отправить' }));
    expect(screen.getByRole('menu')).not.toBeNull();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  test('busy or read-only turns both halves off', () => {
    drawBar({ canWrite: false });
    const [main, menu] = document
      .querySelector('[data-split-button="schedule"]')
      .querySelectorAll('button');
    expect(main.disabled).toBe(true);
    expect(menu.disabled).toBe(true);
  });

  test('the secondary plate draws its divider in the control border colour', () => {
    render(
      React.createElement(
        SplitButton,
        {
          variant: 'secondary',
          menuLabel: 'Ещё',
          onClick: () => undefined,
          items: [{ id: 'a', title: 'А', description: 'а', onSelect: () => undefined }],
        },
        'Переписать с этим'
      )
    );
    const divider = document.querySelector('[data-split-button-divider]');
    expect(divider.className).toContain('bg-cf-border-control');
  });
});
