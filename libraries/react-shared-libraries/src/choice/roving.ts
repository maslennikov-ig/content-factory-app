import { RefObject, useEffect } from 'react';

/**
 * The shared mechanics behind every choice control: one tab stop per group and
 * arrow keys that move between the options.
 *
 * Options are found in the DOM rather than through a registration callback, so
 * the order the user walks is the order the browser paints — a group can wrap
 * its options in layout elements, render them from a map, or hide one of them
 * without the group losing track of where it is.
 */

export const OPTION_ATTRIBUTE = 'data-cf-choice-option';
export const VALUE_ATTRIBUTE = 'data-cf-choice-value';

export type ChoiceOrientation = 'horizontal' | 'vertical' | 'both';
export type ChoiceDirection = 'next' | 'previous' | 'first' | 'last';

export const optionNodes = (
  container: HTMLElement | null | undefined
): HTMLButtonElement[] =>
  container
    ? Array.from(
        container.querySelectorAll<HTMLButtonElement>(`[${OPTION_ATTRIBUTE}]`)
      )
    : [];

const isEnabled = (node: HTMLButtonElement) =>
  !node.disabled && node.getAttribute('aria-disabled') !== 'true';

export const enabledOptionNodes = (
  container: HTMLElement | null | undefined
): HTMLButtonElement[] => optionNodes(container).filter(isEnabled);

export const optionValue = (node: HTMLButtonElement | null | undefined) =>
  node?.getAttribute(VALUE_ATTRIBUTE) ?? null;

export const directionForKey = (
  key: string,
  orientation: ChoiceOrientation
): ChoiceDirection | null => {
  if (key === 'Home') return 'first';
  if (key === 'End') return 'last';
  const forward = orientation === 'vertical' ? 'ArrowDown' : 'ArrowRight';
  const backward = orientation === 'vertical' ? 'ArrowUp' : 'ArrowLeft';
  if (key === forward) return 'next';
  if (key === backward) return 'previous';
  if (orientation !== 'both') return null;
  if (key === 'ArrowDown') return 'next';
  if (key === 'ArrowUp') return 'previous';
  return null;
};

export const resolveTarget = (
  nodes: HTMLButtonElement[],
  current: Element | null,
  direction: ChoiceDirection
): HTMLButtonElement | null => {
  if (!nodes.length) return null;
  if (direction === 'first') return nodes[0];
  if (direction === 'last') return nodes[nodes.length - 1];
  const index = nodes.indexOf(current as HTMLButtonElement);
  if (index < 0) return direction === 'next' ? nodes[0] : nodes[nodes.length - 1];
  const step = direction === 'next' ? 1 : -1;
  return nodes[(index + step + nodes.length) % nodes.length];
};

/**
 * Keeps exactly one option in the page tab sequence.
 *
 * The selected option is the tab stop; when nothing is selected yet the first
 * enabled option takes it, so a group is never unreachable and never costs the
 * user one Tab press per option. React writes the same value on the options it
 * re-renders, and this runs after every render to settle the difference.
 */
export const useRovingTabStop = (
  containerRef: RefObject<HTMLElement | null>,
  isSelected: (node: HTMLButtonElement) => boolean
) => {
  useEffect(() => {
    const nodes = optionNodes(containerRef.current);
    if (!nodes.length) return;
    const enabled = nodes.filter(isEnabled);
    const stop = enabled.find(isSelected) ?? enabled[0];
    for (const node of nodes) {
      node.tabIndex = node === stop ? 0 : -1;
    }
  });
};
