'use strict';

/**
 * `content-factory-next-97dq.43` — tails of the 22.09 stand walk of the
 * adaptation screen. Items 3 and 6 are held by their own suites
 * (`brand-voice.version-pair`, `post-preview.ru-reader`); the rest are here.
 */

const fs = require('node:fs');
const path = require('node:path');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

describe('97dq.43 — stand walk tails', () => {
  test('1: the theme is dark-first unless a person chose light', async () => {
    let cookie;
    const theme = loadTypeScriptModule('apps/frontend/src/app/theme.ts', {
      'next/headers': {
        cookies: async () => ({
          get: () => (cookie === undefined ? undefined : { value: cookie }),
        }),
      },
    });
    expect(theme.DEFAULT_THEME_MODE).toBe('dark');
    cookie = undefined;
    await expect(theme.resolveThemeMode()).resolves.toBe('dark');
    cookie = 'light';
    await expect(theme.resolveThemeMode()).resolves.toBe('light');
    cookie = 'garbage';
    await expect(theme.resolveThemeMode()).resolves.toBe('dark');
    // The client toggle starts from the same default.
    expect(read('apps/frontend/src/components/layout/mode.component.tsx')).toContain(
      "useCookie('mode', 'dark')"
    );
  });

  test('2: after «Снять с расписания» «Когда» keeps the time the draft kept', () => {
    const source = read(
      'apps/frontend/src/components/content-intelligence/pieces/piece.container.tsx'
    );
    const unschedule = source.slice(
      source.indexOf('const unschedule = useCallback('),
      source.indexOf('const removeAdaptation = useCallback(')
    );
    expect(unschedule).toMatch(/const held = plannedDateOf\(adaptation\);/u);
    expect(unschedule).toMatch(/setWhen\(\(current\) => \(\{ \.\.\.current, \[adaptation\.id\]: held \}\)\)/u);
    // `when` wins over the free slot in the field's own order.
    expect(source).toMatch(/\(adaptation && when\[adaptation\.id\]\) \?\?/u);
  });

  test('4: the week card’s hover panel sits above the card, not over it', () => {
    const source = read('apps/frontend/src/components/launches/calendar.tsx');
    expect(source).toContain(
      "!wide && !channelRow && 'absolute bottom-full end-0 z-30 shadow-menu'"
    );
    expect(source).not.toMatch(/\(!wide \|\| channelRow\) &&/u);
  });

  test('7: the date picker opens from a real button', () => {
    const source = read('apps/frontend/src/components/launches/helpers/date.picker.tsx');
    expect(source).toMatch(/<Button[\s\S]*?aria-haspopup="dialog"[\s\S]*?aria-expanded=/u);
    expect(source).toContain('role="dialog"');
    expect(source).toContain("event.key === 'Escape'");
    // No clickable div left as the trigger.
    expect(source).not.toMatch(/<div[^>]*onClick=\{changeShow\}/u);
  });
});
