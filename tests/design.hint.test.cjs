'use strict';

/**
 * The hint, proven by driving it.
 *
 * A tooltip is the control people reach for when a label cannot carry the whole
 * meaning, and it is also the control that is most often built wrong: a `title`
 * attribute, or a `div` that appears on `:hover` and is invisible to everything
 * except a mouse. Both leave the explanation to people using a pointer and
 * announce nothing.
 *
 * So the three things WCAG 1.4.13 and the ARIA pattern actually require are
 * checked here by pressing real keys against a real document: it opens on
 * focus, it is announced through `aria-describedby` pointing at a `tooltip`,
 * and Escape dismisses it without moving the focus.
 *
 * The document comes from `jsdom` directly rather than from the jsdom Jest
 * environment, for the reason `tests/choice-control.contract.test.cjs` gives:
 * that one pulls in the optional native `canvas` binding, which is not built in
 * this workspace and has nothing to do with a keyboard contract.
 */

const React = require('react');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/',
});
for (const key of Object.getOwnPropertyNames(dom.window)) {
  if (key in global) continue;
  Object.defineProperty(global, key, {
    configurable: true,
    get: () => dom.window[key],
  });
}
for (const key of ['window', 'document', 'navigator']) {
  Object.defineProperty(global, key, {
    configurable: true,
    value: key === 'window' ? dom.window : dom.window[key],
  });
}
global.IS_REACT_ACT_ENVIRONMENT = true;

const {
  cleanup,
  fireEvent,
  render,
  screen,
} = require('@testing-library/react');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const { Hint } = loadTypeScriptModule(
  'libraries/react-shared-libraries/src/layout/hint.tsx'
);
const layout = loadTypeScriptModule(
  'libraries/react-shared-libraries/src/layout/index.ts'
);

afterEach(cleanup);

const renderHint = (props = {}) =>
  render(
    React.createElement(
      Hint,
      { label: 'Подсказка: коридор шкалы', ...props },
      'В него попадают восемь из десяти ваших фраз.'
    )
  );

test('the design system exports it, so nobody hand-rolls a second one', () => {
  expect(layout.Hint).toBe(Hint);
});

describe('the hint is a control, not a decoration', () => {
  test('it is a button with a name of its own', () => {
    renderHint();

    const trigger = screen.getByRole('button', {
      name: 'Подсказка: коридор шкалы',
    });
    expect(trigger.getAttribute('type')).toBe('button');
    // The glyph carries no meaning of its own; the name does.
    expect(trigger.querySelector('svg').getAttribute('aria-hidden')).toBe(
      'true'
    );
  });

  test('closed, there is nothing to announce', () => {
    renderHint();

    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(
      screen.getByRole('button').getAttribute('aria-describedby')
    ).toBeNull();
  });
});

describe('every way in, and the way out', () => {
  test('focus opens it — the explanation is not reserved for a mouse', () => {
    renderHint();
    const trigger = screen.getByRole('button');

    fireEvent.focus(trigger);

    const tip = screen.getByRole('tooltip');
    expect(tip.textContent).toMatch(/восемь из десяти/);
    // Announced, not merely visible: the trigger points at the bubble.
    expect(trigger.getAttribute('aria-describedby')).toBe(tip.id);
  });

  test('hovering the wrapper opens it and leaving closes it', () => {
    const { container } = renderHint();
    const wrapper = container.firstChild;

    fireEvent.mouseEnter(wrapper);
    expect(screen.getByRole('tooltip')).toBeTruthy();

    fireEvent.mouseLeave(wrapper);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  test('a tap opens it, because a touch screen has neither hover nor focus first', () => {
    renderHint();
    const trigger = screen.getByRole('button');

    fireEvent.click(trigger);
    expect(screen.getByRole('tooltip')).toBeTruthy();

    fireEvent.click(trigger);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  test('Escape dismisses it and leaves the focus where it was', () => {
    renderHint();
    const trigger = screen.getByRole('button');
    trigger.focus();
    fireEvent.focus(trigger);
    expect(screen.getByRole('tooltip')).toBeTruthy();

    // The dismissible half of WCAG 1.4.13. Bound on the document because a
    // hint opened by hover has no focus inside it.
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  test('a press elsewhere closes it', () => {
    renderHint();
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('tooltip')).toBeTruthy();

    fireEvent.mouseDown(document.body);

    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});

describe('the bubble obeys the design rules for a floating layer', () => {
  test('it carries a shadow and no border', () => {
    renderHint();
    fireEvent.focus(screen.getByRole('button'));
    const classes = screen.getByRole('tooltip').className;

    // `DESIGN.md`: a layer above the content gets a shadow; a panel gets a
    // border. Combining the two makes a floating thing read as a panel.
    expect(classes).toMatch(/shadow-menu/);
    expect(classes).not.toMatch(/(^|\s)border(\s|$)/);
  });

  /**
   * The flip, measured rather than asserted.
   *
   * jsdom has no layout, so every rect is zero and the component would always
   * think it is against the left edge. Stubbing the two numbers it reads — the
   * bubble's box and the viewport width — is what turns "does it flip" into a
   * question with a deterministic answer.
   */
  const withGeometry = ({ anchorLeft, bubbleWidth, viewport }, body) => {
    const rect = Element.prototype.getBoundingClientRect;
    const width = Object.getOwnPropertyDescriptor(
      dom.window.Element.prototype,
      'clientWidth'
    );
    Element.prototype.getBoundingClientRect = function stubbed() {
      // The component measures two things: how wide the bubble is, and where
      // its anchor sits. It deliberately does not read the bubble's own left
      // edge — that is the measurement that oscillates.
      return this.getAttribute('role') === 'tooltip'
        ? { left: 0, right: bubbleWidth, top: 0, bottom: 0, width: bubbleWidth, height: 0 }
        : {
            left: anchorLeft,
            right: anchorLeft + 24,
            top: 0,
            bottom: 0,
            width: 24,
            height: 0,
          };
    };
    Object.defineProperty(dom.window.Element.prototype, 'clientWidth', {
      configurable: true,
      get() {
        return viewport;
      },
    });
    try {
      body();
    } finally {
      Element.prototype.getBoundingClientRect = rect;
      if (width) {
        Object.defineProperty(dom.window.Element.prototype, 'clientWidth', width);
      } else {
        delete dom.window.Element.prototype.clientWidth;
      }
    }
  };

  test('keeps the side the caller asked for when it fits', () => {
    withGeometry({ anchorLeft: 40, bubbleWidth: 260, viewport: 1440 }, () => {
      renderHint();
      fireEvent.focus(screen.getByRole('button'));
      // `end` is the default: a hint follows the label it explains.
      expect(screen.getByRole('tooltip').className).toMatch(/start-0/);
    });
  });

  test('flips rather than pushing the page sideways', () => {
    withGeometry({ anchorLeft: 120, bubbleWidth: 260, viewport: 320 }, () => {
      renderHint();
      fireEvent.focus(screen.getByRole('button'));
      // A bubble hanging past the edge makes the whole document scroll
      // horizontally — the reflow failure WCAG 1.4.10 is about, and what this
      // component was doing at 320px before it measured anything.
      expect(screen.getByRole('tooltip').className).toMatch(/end-0/);
    });
  });

  test('re-measures when the window changes under an open bubble', () => {
    withGeometry({ anchorLeft: 40, bubbleWidth: 260, viewport: 1440 }, () => {
      renderHint();
      fireEvent.focus(screen.getByRole('button'));
      expect(screen.getByRole('tooltip').className).toMatch(/start-0/);
    });

    // A phone rotating, or a window dragged narrower, used to leave the bubble
    // hanging past the edge with the document scrolling sideways behind it.
    withGeometry({ anchorLeft: 120, bubbleWidth: 260, viewport: 320 }, () => {
      fireEvent(window, new dom.window.Event('resize'));
      expect(screen.getByRole('tooltip').className).toMatch(/end-0/);
    });
  });

  test('never grows wider than the screen it is on', () => {
    renderHint();
    fireEvent.focus(screen.getByRole('button'));

    // Flipping cannot rescue a bubble that is wider than the viewport, so the
    // reading measure is capped by the screen as well.
    expect(screen.getByRole('tooltip').className).toMatch(
      /max-w-\[min\(260px,calc\(100vw-32px\)\)\]/
    );
  });

});
