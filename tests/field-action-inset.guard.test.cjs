'use strict';

/**
 * `content-factory-next-75xn.14`: один отступ для всего, что стоит в поле
 * справа.
 *
 * Владелец 13.09.2026, глядя на снимок экрана настроек: «у всех галочек справа
 * как будто не хватает отступа, это во всём нашем проекте, нужно не
 * хардкодить, а единый стиль». Он смотрел на две разные величины в одном
 * столбце: крестик очистки жил в слоте с `pe-[6px]` внутри кнопки с
 * `px-[16px]` — около 22 пикселей, — а шеврон списка рисовал браузер, и в коде
 * про него не было сказано ничего вообще.
 *
 * Поэтому проверяется не «красиво ли», а арифметика: оба знака стоят на одном
 * числе, и это число объявлено ровно один раз. Плагин вызывается по-настоящему
 * и отдаёт те же правила, что уедут в сборку, — читать исходник глазами значит
 * проверять буквы, а не расстояние.
 */

const fs = require('node:fs');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '..');
const config = require('../apps/frontend/tailwind.config.cjs');

/** Всё, что плагины конфигурации объявляют компонентами. */
const declaredComponents = () => {
  const components = {};
  const api = {
    addComponents: (rules) => Object.assign(components, rules),
    addUtilities: () => {},
    addBase: () => {},
    addVariant: () => {},
    matchUtilities: () => {},
    theme: (key) => {
      const parts = String(key).split('.');
      let value = config.theme;
      for (const part of parts) value = value?.[part] ?? value?.extend?.[part];
      return value ?? '768px';
    },
    e: (value) => value,
    config: () => undefined,
  };
  for (const plugin of config.plugins ?? []) {
    if (typeof plugin !== 'function') continue;
    try {
      plugin(api);
    } catch {
      // Плагин, которому нужно больше, чем эта заглушка, к отступу знака
      // отношения не имеет: важно, что до нашего дело дошло.
    }
  }
  return components;
};

const pixels = (value) => {
  const match = /(-?\d+(?:\.\d+)?)px/.exec(String(value));
  expect(match).not.toBeNull();
  return Number(match[1]);
};

describe('знак внутри поля стоит на одном объявленном отступе', () => {
  const components = declaredComponents();

  test('оба токена существуют и оба говорят про конец поля', () => {
    expect(components['.cf-field-action-inset']).toBeDefined();
    expect(components['.cf-field-chevron']).toBeDefined();
    expect(components['.cf-field-action-inset'].paddingInlineEnd).toBeTruthy();
  });

  test('крестик и шеврон отстоят от края поля на одно и то же число', () => {
    const inset = pixels(
      components['.cf-field-action-inset'].paddingInlineEnd
    );
    // Позиция второй — ближней к краю — половины шеврона и есть его отступ.
    const position = String(components['.cf-field-chevron'].backgroundPosition);
    const layers = position.split(',').map((layer) => layer.trim());
    expect(layers).toHaveLength(2);
    expect(pixels(layers[1])).toBe(inset);
    // Дальняя половина стоит ровно на ширину половины знака левее.
    const wedge = pixels(components['.cf-field-chevron'].backgroundSize);
    expect(pixels(layers[0])).toBe(inset + wedge);
  });

  test('место под знак — это отступ плюс сам знак плюс воздух, а не новое число', () => {
    const inset = pixels(
      components['.cf-field-action-inset'].paddingInlineEnd
    );
    const wedge = pixels(components['.cf-field-chevron'].backgroundSize);
    const room = pixels(components['.cf-field-chevron'].paddingInlineEnd);
    // Знак — две половины; воздух между текстом и знаком — рабочий шаг 8px.
    expect(room).toBe(inset + wedge * 2 + 8);
  });

  test('нативная стрелка убрана во всех трёх написаниях и в ms-варианте', () => {
    const chevron = components['.cf-field-chevron'];
    expect(chevron.appearance).toBe('none');
    expect(chevron['-webkit-appearance']).toBe('none');
    expect(chevron['-moz-appearance']).toBe('none');
    expect(chevron['&::-ms-expand']).toEqual({ display: 'none' });
  });

  test('знак красится текстом поля, а не собственным цветом', () => {
    // Градиент берёт `currentColor`, поэтому шеврон следует за темой. Картинка
    // в data-URI несла бы свой hex — ровно то, что `design.guard` запрещает
    // везде остальное.
    expect(components['.cf-field-chevron'].backgroundImage).toContain(
      'currentColor'
    );
    expect(components['.cf-field-chevron'].backgroundImage).not.toMatch(/#[0-9a-f]{3}/i);
  });

  test('зеркальная раскладка ставит знак у того же края', () => {
    expect(components['[dir="rtl"] .cf-field-chevron']).toBeDefined();
    expect(
      String(components['[dir="rtl"] .cf-field-chevron'].backgroundPosition)
    ).toContain('left');
  });
});

describe('оба примитива берут отступ из токена, а не пишут своё число', () => {
  const read = (relative) =>
    fs.readFileSync(path.join(repositoryRoot, relative), 'utf8');

  const select = read('libraries/react-shared-libraries/src/form/select.tsx');
  const input = read('libraries/react-shared-libraries/src/form/input.tsx');
  const screen = read(
    'apps/frontend/src/components/settings/ai-provider.component.tsx'
  );

  test('Select рисует свой шеврон и не задаёт конечного отступа сам', () => {
    expect(select).toContain('cf-field-chevron');
    // `px-*` покрыло бы и конец поля, и как утилита выиграло бы у слоя
    // компонентов — текст уехал бы под шеврон.
    expect(select).not.toMatch(/'[^']*\bpx-\[\d+px\]/);
    expect(select).not.toMatch(/'[^']*\bpe-\[\d+px\]/);
  });

  test('слот действия у Input держит токен и ни одного своего пикселя', () => {
    const slot = input.slice(
      input.indexOf('{action && ('),
      input.indexOf('{helper && (')
    );
    expect(slot).toContain('cf-field-action-inset');
    expect(slot).not.toMatch(/pe-\[\d+px\]/);
  });

  test('кнопка очистки не приносит собственной горизонтальной геометрии', () => {
    const button = screen.slice(
      screen.indexOf('const ClearStoredKeyButton'),
      screen.indexOf('const BlockHeading')
    );
    // `Button` принесла бы свой `px-[16px]`: из-за него крестик и стоял на
    // десять пикселей дальше от края, чем шеврон соседнего списка.
    expect(button).toContain('ControlButton');
    expect(button).not.toContain('<Button');
    expect(button).not.toMatch(/\bpx-\[/);
  });
});
