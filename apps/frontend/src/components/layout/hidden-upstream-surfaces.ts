/**
 * Upstream surfaces the product does not show (`content-factory-next-2q28.26`).
 *
 * The walk of 25.09.2026 (item 24) found Settings and the menu full of
 * upstream sections a solo blogger has no use for: «Вебхуки», «Автопостинг»,
 * «Наборы», «Подписи», «Разработчики», «Одобренные приложения», the short-link
 * preference and the «Агент» and «Плагины» menu entries. For her this is noise, and the product rule is to decide for the
 * person and keep less on screen.
 *
 * This is the one list. The menu and the settings screen read it; nothing is
 * deleted. The code, the routes and the `?tab=` names stay, so a direct
 * address still opens its screen, and bringing a surface back is removing
 * its name here.
 *
 * «Аналитика» stays in the menu on purpose: it is step 5 of the conveyor the
 * owner chose on 08.09.2026 (NavConveyor A) and carries our own
 * «Производство» report (`97dq.73`).
 */

/** Menu paths that are not drawn in the sidebar. */
export const HIDDEN_MENU_PATHS: readonly string[] = [
  '/agents',
  '/plugs',
  // HeyGen and Reelfarm keys: the same kind of leftover (97dq.100).
  '/third-party',
];

// The instance superadmin still sees everything listed here, marked
// «Видно только суперадмину» (owner decision of 26.09.2026, 97dq.100).

/** Settings tabs that are not drawn in the tab rail. */
export const HIDDEN_SETTINGS_TABS: readonly string[] = [
  'webhooks',
  'autopost',
  'sets',
  'signatures',
  'api',
  'approved_apps',
];

/** Rows inside «Глобальные настройки» that are not drawn. */
export const HIDDEN_SETTINGS_ROWS: readonly string[] = [
  // Short links need a Dub/Short.io/Kutt/LinkDrip key; with none configured
  // the editor never asks, so the preference changes nothing.
  'shortlink_preference',
  // The streak reminder toggle stays visible: the upstream streak workflow
  // still mails anyone with it on (the default), and hiding the switch would
  // leave the person no way to stop that mail.
];

export const isHiddenMenuPath = (path: string) =>
  HIDDEN_MENU_PATHS.includes(path);
export const isHiddenSettingsTab = (tab: string) =>
  HIDDEN_SETTINGS_TABS.includes(tab);
export const isHiddenSettingsRow = (row: string) =>
  HIDDEN_SETTINGS_ROWS.includes(row);
