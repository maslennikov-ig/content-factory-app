/**
 * The theme the page is drawn in right now, read where it is applied.
 *
 * The server puts the theme resolved from the `mode` cookie on `<body>`
 * (`app/theme.ts`, dark-first per ADR-0008) and `ModeComponent` swaps the
 * class when a person toggles it. Two emoji pickers read `localStorage 'mode'`
 * instead, which nothing writes, so they stayed dark on a light page
 * (fourteenth walk review, P3-5). They read this now.
 */
export const documentThemeMode = (): 'light' | 'dark' =>
  typeof document !== 'undefined' && document.body?.classList.contains('light')
    ? 'light'
    : 'dark';
