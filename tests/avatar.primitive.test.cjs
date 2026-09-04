'use strict';

/**
 * Заглушка человека была текстовым символом.
 *
 * «●» стоял в двух местах — в свёрнутой рейке вместо значка «Профиля» и в
 * форме профиля вместо ненастроенной картинки. Один и тот же символ, набранный
 * дважды, — это компонент, которого нет. Он появился 04.09.2026 вместе с
 * задачей показывать имя человека: буква имени говорит больше, чем точка.
 *
 * Правила автора компонента требуют полного набора состояний. У аватара их
 * три: картинка есть, картинки нет (буква), не известно вообще ничего.
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

const { cleanup, render } = require('@testing-library/react');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const { Avatar } = loadTypeScriptModule(
  'apps/frontend/src/components/ui/avatar.tsx'
);

const draw = (props) => render(React.createElement(Avatar, props));
const root = () => document.querySelector('.cf-avatar');

afterEach(cleanup);

describe('Avatar', () => {
  it('без картинки показывает первую букву имени', () => {
    draw({ name: 'Игорь', email: 'maslennikov.ig@example.com' });

    expect(root().textContent).toBe('И');
  });

  it('без имени берёт букву из подстановки по адресу', () => {
    draw({ email: 'maslennikov.ig@example.com' });

    expect(root().textContent).toBe('M');
  });

  it('не знает ничего — рисует пустой кружок, а не «?»', () => {
    draw({});

    expect(root().textContent).toBe('');
  });

  it('картинка вытесняет букву и не несёт своей подписи', () => {
    draw({ name: 'Игорь', src: 'https://example.invalid/p.png' });

    const image = root().querySelector('img');
    expect(image).not.toBeNull();
    expect(image.getAttribute('alt')).toBe('');
    expect(root().textContent).toBe('');
  });

  it('скрыт от скринридера: имя человека всегда стоит рядом текстом', () => {
    draw({ name: 'Игорь' });

    expect(root().getAttribute('aria-hidden')).toBe('true');
  });

  it('круг набран токенами cf, без единого hex', () => {
    draw({ name: 'Игорь' });

    expect(root().className).toContain('rounded-full');
    expect(root().className).toContain('bg-cf-surface-subtle');
    expect(root().className).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });

  // Кегль буквы шёл `cf-label-sm` при любом размере, и в круге 48px она тонула.
  // Найдено рецензией 04.09.2026.
  it.each([
    [20, 'cf-label-sm'],
    [24, 'cf-label-sm'],
    [32, 'cf-body-md'],
    [48, 'cf-body-lg'],
  ])('в круге %ipx буква набрана %s', (size, token) => {
    draw({ name: 'Игорь', size });

    expect(root().className).toContain(token);
  });

  it('маленькие круги моноширинные, большие — нет', () => {
    draw({ name: 'Игорь', size: 48 });

    expect(root().className).not.toContain('cf-label-sm');
    expect(root().className).not.toContain('cf-caption');
  });

  it('размер берётся из шкалы, а не пишется вызывающим', () => {
    const { container } = draw({ name: 'Игорь', size: 48 });

    expect(container.querySelector('.cf-avatar').className).toContain(
      'size-[48px]'
    );
    cleanup();
    draw({ name: 'Игорь' });
    expect(root().className).toContain('size-[20px]');
  });
});
