'use strict';

/**
 * `content-factory-next-11qv` — `Button` and `buttonClassName` drew 40/32px
 * controls with no mobile hit area, while `DESIGN.md` asks for 44px around
 * the same visual control below the breakpoint. The primitive owns it now: a
 * transparent `::before` reaching past each edge, collapsed at `md`.
 */

const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const { Button, buttonClassName } = loadTypeScriptModule(
  'libraries/react-shared-libraries/src/form/button.tsx'
);

const classOf = (props) => {
  const markup = renderToStaticMarkup(
    React.createElement(Button, props, 'Сохранить')
  );
  return markup
    .match(/<button[^>]*class="([^"]*)"/u)[1]
    .replace(/&#x27;/gu, "'")
    .replace(/&gt;/gu, '>')
    .replace(/&amp;/gu, '&')
    .split(/\s+/u);
};

/** px beyond one edge for Tailwind's spacing step (0.5 → 2px, 1.5 → 6px). */
const reach = { '0.5': 2, '1.5': 6 };

describe('the shared button carries a 44px mobile hit area', () => {
  test.each([
    ['standard', {}, 40],
    ['dense', { density: 'dense' }, 32],
    ['content', { layout: 'content' }, 40],
  ])('%s: the hit area is 44px tall below md, and collapses at md', (_name, props, body) => {
    const classes = classOf(props);
    expect(classes).toContain("before:content-['']");
    expect(classes).toContain('before:absolute');
    expect(classes).toContain('md:before:inset-0');
    const step = classes
      .map((token) => token.match(/^before:-inset-y-(\d(?:\.\d)?)$/u)?.[1])
      .find(Boolean);
    expect(body + 2 * reach[step]).toBe(44);
    // The visual body is unchanged: no third height.
    expect(classes).not.toContain('min-h-[44px]');
  });

  test('an icon-only button gets the width as well', () => {
    const dense = classOf({ iconOnly: true, 'aria-label': 'Закрыть' });
    expect(dense).toContain('before:-inset-x-1.5');
    const standard = classOf({
      iconOnly: true,
      density: 'standard',
      'aria-label': 'Закрыть',
    });
    expect(standard).toContain('before:-inset-x-0.5');
    // One horizontal inset only: with `before:inset-x-0` beside it, Tailwind
    // prints the zero after the extension and the zero wins (P2-1).
    expect(dense).not.toContain('before:inset-x-0');
    expect(standard).not.toContain('before:inset-x-0');
  });

  test('a call site that positions the button keeps a containing block', () => {
    const classes = classOf({ className: 'absolute end-[8px]' });
    expect(classes).toContain('absolute');
    expect(classes).not.toContain('relative');
  });

  test('the anchor branch draws the same hit area', () => {
    const standard = buttonClassName().split(/\s+/u);
    expect(standard).toEqual(
      expect.arrayContaining([
        'relative',
        "before:content-['']",
        'before:-inset-y-0.5',
        'md:before:inset-0',
      ])
    );
    expect(buttonClassName({ density: 'dense' }).split(/\s+/u)).toContain(
      'before:-inset-y-1.5'
    );
  });
});

/**
 * The class strings above were right while the box was wrong: `inset-x-0` and
 * `-inset-x-1.5` both sat on the icon-only button and the stylesheet decided
 * for the zero (fourteenth walk review, P2-1). So the box is read from the
 * stylesheet the repo's own Tailwind prints for these classes, with the
 * cascade applied — specificity, then order — to a DOM that holds them.
 */
describe('the compiled stylesheet draws the hit area it promises', () => {
  const path = require('node:path');
  const postcss = require('postcss');
  const tailwind = require('tailwindcss');
  const selectorParser = require('postcss-selector-parser');
  const { JSDOM } = require('jsdom');

  const config = require(path.resolve(
    __dirname,
    '..',
    'apps/frontend/tailwind.config.cjs'
  ));

  const buttonClasses = (props) => classOf(props).join(' ');
  const CASES = {
    denseIcon: buttonClasses({ iconOnly: true, 'aria-label': 'x' }),
    standardIcon: buttonClasses({
      iconOnly: true,
      density: 'standard',
      'aria-label': 'x',
    }),
    denseText: buttonClasses({ density: 'dense' }),
    standardText: buttonClasses({}),
  };

  let rules;
  beforeAll(async () => {
    const raw = Object.values(CASES)
      .map((value) => `<button class="${value}"></button>`)
      .concat('<div class="flex flex-col"></div>')
      .join('\n');
    const result = await postcss([
      tailwind({ ...config, content: [{ raw }] }),
    ]).process('@tailwind utilities;', { from: undefined });
    rules = [];
    result.root.walkRules((rule) => {
      const media =
        rule.parent.type === 'atrule' ? rule.parent.params : null;
      rules.push({ rule, media });
    });
  });

  const specificity = (selector) => {
    let a = 0;
    let b = 0;
    let c = 0;
    selectorParser((root) => {
      root.walk((node) => {
        if (node.type === 'id') a += 1;
        else if (node.type === 'class' || node.type === 'attribute') b += 1;
        else if (node.type === 'tag') c += 1;
        else if (node.type === 'pseudo') {
          if (node.value.startsWith('::')) c += 1;
          else if (![':not', ':is'].includes(node.value)) b += 1;
        }
      });
    }).processSync(selector);
    return a * 1e6 + b * 1e3 + c;
  };

  const PX = (value) => {
    const number = parseFloat(value);
    return value.endsWith('rem') ? number * 16 : number;
  };

  /** `left/right/top/bottom` of `element::before`, cascaded. */
  const beforeInsets = (element, { desktop }) => {
    const rtl = element.closest('[dir]')?.getAttribute('dir') === 'rtl';
    const won = {};
    rules.forEach(({ rule, media }, order) => {
      if (media && !(desktop && media === '(min-width: 768px)')) return;
      for (const selector of rule.selectors) {
        if (!selector.endsWith('::before')) continue;
        if (!element.matches(selector.slice(0, -'::before'.length))) continue;
        const weight = specificity(selector);
        rule.walkDecls((decl) => {
          const sides = {
            inset: ['top', 'right', 'bottom', 'left'],
            left: ['left'],
            right: ['right'],
            top: ['top'],
            bottom: ['bottom'],
            'inset-inline-start': [rtl ? 'right' : 'left'],
            'inset-inline-end': [rtl ? 'left' : 'right'],
          }[decl.prop];
          if (!sides) return;
          for (const side of sides) {
            const current = won[side];
            if (
              !current ||
              weight > current.weight ||
              (weight === current.weight && order >= current.order)
            ) {
              won[side] = { weight, order, value: PX(decl.value) };
            }
          }
        });
      }
    });
    return Object.fromEntries(
      ['top', 'right', 'bottom', 'left'].map((side) => [side, won[side]?.value])
    );
  };

  const box = (insets, width, height) => ({
    width: width - insets.left - insets.right,
    height: height - insets.top - insets.bottom,
  });

  const mount = (markup) =>
    new JSDOM(`<!doctype html><body>${markup}</body>`).window.document;

  test.each([
    ['dense icon-only', 'denseIcon', 32, 32, { width: 44, height: 44 }],
    ['standard icon-only', 'standardIcon', 40, 40, { width: 44, height: 44 }],
    ['dense text', 'denseText', 120, 32, { width: 120, height: 44 }],
    ['standard text', 'standardText', 120, 40, { width: 120, height: 44 }],
  ])('%s: 44px below md, the body itself at md', (_n, key, w, h, mobile) => {
    const document = mount(`<div><button class="${CASES[key]}"></button></div>`);
    const button = document.querySelector('button');
    expect(box(beforeInsets(button, { desktop: false }), w, h)).toEqual(mobile);
    expect(box(beforeInsets(button, { desktop: true }), w, h)).toEqual({
      width: w,
      height: h,
    });
  });

  test('in a column the later button does not reach back over the earlier one', () => {
    const document = mount(
      `<div class="flex flex-col"><button class="${CASES.denseText}"></button><button class="${CASES.denseText}"></button></div>`
    );
    const [first, second] = document.querySelectorAll('button');
    expect(beforeInsets(first, { desktop: false })).toMatchObject({
      top: -6,
      bottom: -6,
    });
    // The second still reaches down; upwards the first one's reach covers
    // the gap, and its own body stays uncovered.
    expect(beforeInsets(second, { desktop: false })).toMatchObject({
      top: 0,
      bottom: -6,
    });
  });

  test.each([
    ['ltr', 'left', 'right'],
    ['rtl', 'right', 'left'],
  ])('in a %s row the later icon button yields its start edge', (dir, start, end) => {
    const document = mount(
      `<div dir="${dir}" class="flex"><button class="${CASES.denseIcon}"></button><button class="${CASES.denseIcon}"></button></div>`
    );
    const [first, second] = document.querySelectorAll('button');
    expect(beforeInsets(first, { desktop: false })[start]).toBe(-6);
    const later = beforeInsets(second, { desktop: false });
    expect(later[start]).toBe(0);
    expect(later[end]).toBe(-6);
    // A row does not cost the later button its height.
    expect(later.top).toBe(-6);
  });
});
