'use strict';

/**
 * The channel «⋮» menu stays inside the screen (`content-factory-next-97dq.81`,
 * fourteenth walk, A4): in the last table column it opened from the button's
 * left edge and ran off the right edge; only a bottom overflow was corrected.
 */

const fs = require('node:fs');
const path = require('node:path');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const { clampMenuPosition, MENU_VIEWPORT_MARGIN } = loadTypeScriptModule(
  'apps/frontend/src/components/launches/menu/menu-position.ts'
);

const VIEWPORT = { width: 1280, height: 800 };
const MENU = { width: 240, height: 300 };

describe('clampMenuPosition', () => {
  test('with room on the right it opens under the button from its left edge', () => {
    expect(
      clampMenuPosition({ left: 100, right: 132, bottom: 140 }, MENU, VIEWPORT)
    ).toMatchObject({ x: 100, y: 140 });
  });

  test('in the last column it opens leftwards: right edge on the button’s right edge', () => {
    const anchor = { left: 1200, right: 1232, bottom: 140 };
    const { x } = clampMenuPosition(anchor, MENU, VIEWPORT);
    expect(x + MENU.width).toBe(anchor.right);
    expect(x + MENU.width).toBeLessThanOrEqual(VIEWPORT.width - MENU_VIEWPORT_MARGIN);
  });

  test('a button hugging the right edge still leaves the 8px margin', () => {
    const { x } = clampMenuPosition({ left: 1260, right: 1278, bottom: 40 }, MENU, VIEWPORT);
    expect(x).toBe(VIEWPORT.width - MENU_VIEWPORT_MARGIN - MENU.width);
  });

  test('a panel wider than the room is pinned to the left margin', () => {
    const { x } = clampMenuPosition(
      { left: 10, right: 42, bottom: 40 },
      { width: 400, height: 100 },
      { width: 320, height: 600 }
    );
    expect(x).toBe(MENU_VIEWPORT_MARGIN);
  });

  test('no room below: it moves up and keeps the margin', () => {
    const { y } = clampMenuPosition({ left: 100, right: 132, bottom: 700 }, MENU, VIEWPORT);
    expect(y).toBe(VIEWPORT.height - MENU_VIEWPORT_MARGIN - MENU.height);
    expect(MENU_VIEWPORT_MARGIN).toBe(8);
  });
});

describe('a panel taller than the screen (review of 97dq.81-85, P3-9)', () => {
  test('is capped at the viewport less both margins and pinned to the top margin', () => {
    const tall = { width: 240, height: 1200 };
    const placed = clampMenuPosition({ left: 100, right: 132, bottom: 300 }, tall, VIEWPORT);
    expect(placed.maxHeight).toBe(VIEWPORT.height - 2 * MENU_VIEWPORT_MARGIN);
    expect(placed.y).toBe(MENU_VIEWPORT_MARGIN);
    expect(placed.y + placed.maxHeight).toBe(VIEWPORT.height - MENU_VIEWPORT_MARGIN);
  });

  test('a panel that fits keeps its place under the button and the same cap', () => {
    const placed = clampMenuPosition({ left: 100, right: 132, bottom: 140 }, MENU, VIEWPORT);
    expect(placed).toEqual({ x: 100, y: 140, maxHeight: 784 });
  });

  test('the menu applies the cap, scrolls inside, and follows its button on resize and scroll', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../apps/frontend/src/components/launches/menu/menu.tsx'),
      'utf8'
    );
    expect(source).toContain('maxHeight: show.maxHeight');
    expect(source).toMatch(/className=\{`fixed [^`]*overflow-y-auto/);
    expect(source).toContain("window.addEventListener('resize', follow)");
    expect(source).toContain("window.addEventListener('scroll', follow, true)");
  });
});

test('the channel menu positions its panel through clampMenuPosition, anchored on the button', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../apps/frontend/src/components/launches/menu/menu.tsx'),
    'utf8'
  );
  expect(source).toContain('clampMenuPosition(');
  expect(source).toContain('ref={buttonRef}');
  expect(source).toContain('width: window.innerWidth');
});
