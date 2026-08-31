import { cookies } from 'next/headers';

export const THEME_COOKIE = 'mode';

export type ThemeMode = 'light' | 'dark';

/**
 * Content Factory is light-first: a long editorial working day on an ordinary
 * monitor. Dark stays a fully supported equivalent, chosen per person.
 * Resolving the cookie on the server keeps the first paint on the right theme.
 */
export async function resolveThemeMode(): Promise<ThemeMode> {
  const store = await cookies();
  return store.get(THEME_COOKIE)?.value === 'dark' ? 'dark' : 'light';
}
