/**
 * Where a fixed menu panel lands next to its button
 * (`content-factory-next-97dq.81`, fourteenth walk, A4).
 *
 * The channel «⋮» menu opened from the button's left edge and only corrected
 * a bottom overflow, so in the last column of a table it ran off the right
 * edge of the screen. Now the panel opens under the button from its left
 * edge when there is room; when there is not, it opens leftwards — its right
 * edge on the button's right edge — and in any case it stays at least
 * `MENU_VIEWPORT_MARGIN` inside the viewport on every side.
 */

/** The smallest gap between the panel and the viewport edge. */
export const MENU_VIEWPORT_MARGIN = 8;

export type MenuAnchorRect = { left: number; right: number; bottom: number };

/**
 * The tallest the panel may be: the viewport less the margin on both sides.
 * Review of 97dq.81-85, P3-9: a panel taller than the screen was pinned to
 * the top margin and still ran off the bottom; now it is capped here and
 * scrolls inside (`maxHeight` goes to the panel's style).
 */
export const menuMaxHeight = (
  viewportHeight: number,
  margin: number = MENU_VIEWPORT_MARGIN
): number => Math.max(0, viewportHeight - 2 * margin);

export function clampMenuPosition(
  anchor: MenuAnchorRect,
  menu: { width: number; height: number },
  viewport: { width: number; height: number },
  margin: number = MENU_VIEWPORT_MARGIN
): { x: number; y: number; maxHeight: number } {
  let x = anchor.left;
  if (x + menu.width > viewport.width - margin) x = anchor.right - menu.width;
  x = Math.max(margin, Math.min(x, viewport.width - margin - menu.width));

  const maxHeight = menuMaxHeight(viewport.height, margin);
  const height = Math.min(menu.height, maxHeight);
  let y = anchor.bottom;
  if (y + height > viewport.height - margin)
    y = Math.max(margin, viewport.height - margin - height);
  return { x, y, maxHeight };
}
