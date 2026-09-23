'use strict';

/**
 * What TipTap needs from jsdom that jsdom does not draw (`97dq.46`).
 *
 * The adaptation editor is a TipTap field, and three suites open it. TipTap
 * places the caret one frame later (`autofocus` → `requestAnimationFrame`),
 * and ProseMirror scrolls the selection into view by asking a `Range` for its
 * rectangles — layout that jsdom does not have. Without these the suites still
 * pass, but every run prints an uncaught error from a timer, which is how a
 * real error stops being read.
 *
 * One helper so the three suites do not each carry their own copy.
 */
function prepareTipTap(dom) {
  const { window } = dom;
  global.requestAnimationFrame = window.requestAnimationFrame.bind(window);
  global.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
  // ProseMirror reads the scroll parents' style bare, not through `window`.
  if (typeof global.getComputedStyle !== 'function')
    global.getComputedStyle = window.getComputedStyle.bind(window);
  const emptyRect = () => ({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: 0,
    height: 0,
  });
  const emptyRects = () => {
    const list = [];
    list.item = () => null;
    return list;
  };
  if (!window.Range.prototype.getClientRects)
    window.Range.prototype.getClientRects = emptyRects;
  if (!window.Range.prototype.getBoundingClientRect)
    window.Range.prototype.getBoundingClientRect = emptyRect;
  if (!window.Text.prototype.getClientRects)
    window.Text.prototype.getClientRects = emptyRects;
}

module.exports = { prepareTipTap };
