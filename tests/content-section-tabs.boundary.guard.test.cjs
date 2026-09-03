const fs = require('node:fs');
const path = require('node:path');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const TABS = 'apps/frontend/src/components/content-intelligence/content-section.tabs.ts';
const SCREEN = 'apps/frontend/src/components/content-intelligence/content-section.screen.tsx';
const PAGE = 'apps/frontend/src/app/(app)/(site)/content/page.tsx';

/**
 * The crash `8a8837f6` fixed: `CONTENT_TABS` lived in a `'use client'`
 * module, the route is a server component, and a value imported across that
 * boundary is a client reference, not the array — `.includes` «is not a
 * function» and `/content?tab=brief` fell over with `tsc` and Jest green.
 *
 * Neither `tsc` nor a unit test can see the proxy, so this guard holds the
 * two facts that keep it from coming back: the tab module is plain, and the
 * page reads the tabs from it, not from the screen.
 */
describe('the tab list is readable on both sides of the client boundary', () => {
  test('the tab module carries no client directive', () => {
    expect(read(TABS)).not.toMatch(/^\s*['"]use client['"]/m);
  });

  test('the screen is a client module', () => {
    expect(read(SCREEN)).toMatch(/^\s*['"]use client['"]/m);
  });

  test('the section page resolves the tab from the tab module', () => {
    const page = read(PAGE);
    expect(page).toMatch(/resolveContentTab[\s\S]*from ['"][^'"]*content-section\.tabs['"]/);
    expect(page).not.toMatch(/\{[^}]*(CONTENT_TABS|resolveContentTab)[^}]*\}\s*from ['"][^'"]*content-section\.screen['"]/);
  });
});

describe('resolveContentTab', () => {
  const { resolveContentTab, CONTENT_TABS } = loadTypeScriptModule(TABS);

  test.each(CONTENT_TABS.map((tab) => [tab]))('%s opens itself', (tab) => {
    expect(resolveContentTab(tab)).toBe(tab);
  });

  test('archive is still an address, not a tab', () => {
    expect(resolveContentTab('archive')).toBe('archive');
    expect(CONTENT_TABS).not.toContain('archive');
  });

  test('an unknown, missing or repeated value opens the section by default', () => {
    expect(resolveContentTab('voice')).toBeUndefined();
    expect(resolveContentTab(undefined)).toBeUndefined();
    expect(resolveContentTab(42)).toBeUndefined();
    expect(resolveContentTab(['brief', 'leads'])).toBe('brief');
  });
});
