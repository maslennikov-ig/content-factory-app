/**
 * The product rhythm uses 4px as its base unit. These values are the only
 * layout intervals shared components may promote into their public contract.
 */
export const layoutSpacing = {
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  8: '32px',
  10: '40px',
  12: '48px',
  /**
   * The gutter `PageShell` and a default `Panel` actually ship. It read 24px
   * while both primitives used 20px, which is the wrong way round for a
   * constant that claims to be the scale; `tests/layout-primitives.test.cjs`
   * now reads this value and holds the primitives to it, so the two can no
   * longer drift apart in silence.
   */
  pageGutter: '20px',
} as const;

export type LayoutSpacing = keyof typeof layoutSpacing;
