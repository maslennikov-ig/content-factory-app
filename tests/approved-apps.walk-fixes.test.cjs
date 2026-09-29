'use strict';

/**
 * «Одобренные приложения» after the W4 walk (29.09.2026): the list re-reads
 * when the tab or window comes back (review F4) — a connection finished in
 * the consent tab shows without a reload — and revoking is one word,
 * «Отключить» / «Disconnect», on the button and in its dialog (recheck P3-a),
 * in every locale.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const component = fs.readFileSync(
  path.join(root, 'apps/frontend/src/components/approved-apps/approved-apps.component.tsx'),
  'utf8'
);
const localesDir = path.join(root, 'libraries/react-shared-libraries/src/translation/locales');
const locale = (name) => JSON.parse(fs.readFileSync(path.join(localesDir, name, 'translation.json'), 'utf8'));

test('the list re-reads on focus and when stale', () => {
  const options = /useSWR\('approved-apps', load, \{([\s\S]*?)\}\)/.exec(component)[1];
  expect(options).toContain('revalidateOnFocus: true');
  expect(options).toContain('revalidateIfStale: true');
});

test('the button, the dialog and its confirm say the same word', () => {
  expect(component).not.toContain("t('revoke', 'Revoke')");
  expect(component).not.toContain('are_you_sure_revoke_access');
  expect(component).toContain("'approved_app_disconnect_confirm'");
  expect(component.match(/t\('mcp_disconnect', 'Disconnect'\)/g)).toHaveLength(2);
  const ru = locale('ru');
  expect(ru.mcp_disconnect).toBe('Отключить');
  expect(ru.approved_app_disconnect_confirm).toMatch(/^Отключить «\{\{name\}\}»\?/);
  expect(locale('en').approved_app_disconnect_confirm).toMatch(/^Disconnect \{\{name\}\}\?/);
});

test('every locale has the new words, with the name placeholder', () => {
  for (const name of fs.readdirSync(localesDir)) {
    const words = locale(name);
    for (const key of ['approved_app_disconnect_confirm', 'approved_app_disconnected', 'approved_app_disconnect_failed']) {
      expect(typeof words[key]).toBe('string');
    }
    expect(words.approved_app_disconnect_confirm).toContain('{{name}}');
  }
});
