import { cookies } from 'next/headers';

export const THEME_COOKIE = 'mode';

export type ThemeMode = 'light' | 'dark';

/**
 * Content Factory is dark-first (ADR-0008, `DESIGN.md`): the dark theme is
 * the primary composition, and the light one is a full daytime equivalent a
 * person chooses. Only an explicit `light` cookie gives light; no cookie is
 * dark (`content-factory-next-97dq.43`, item 1 — the default was still the
 * light-first one of ADR-0006). Resolving the cookie on the server keeps the
 * first paint on the right theme.
 */
export const DEFAULT_THEME_MODE: ThemeMode = 'dark';

export const themeModeOf = (cookie: string | undefined): ThemeMode =>
  cookie === 'light' ? 'light' : cookie === 'dark' ? 'dark' : DEFAULT_THEME_MODE;

export async function resolveThemeMode(): Promise<ThemeMode> {
  const store = await cookies();
  return themeModeOf(store.get(THEME_COOKIE)?.value);
}
