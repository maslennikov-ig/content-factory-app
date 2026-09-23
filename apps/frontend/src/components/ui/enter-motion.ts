'use client';

import { useEffect, useRef } from 'react';

/**
 * The content's entrance on a route change or a tab switch (`97dq.59`).
 *
 * CSS only: `.cf-page-enter` (180ms) and `.cf-tab-enter` (150ms) in
 * `global.scss`, both off under `prefers-reduced-motion`. The class is put
 * back on the node when `key` changes rather than the node being remounted —
 * a remount would throw away the page's own state for the sake of a fade.
 * It is removed when the animation ends, so the transform never becomes a
 * containing block for anything fixed inside the content. The first render
 * does not animate: arriving at a page is not a transition.
 */
export function useEnterMotion<T extends HTMLElement>(
  key: unknown,
  className: 'cf-page-enter' | 'cf-tab-enter' = 'cf-page-enter'
) {
  const ref = useRef<T | null>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return undefined;
    }
    const node = ref.current;
    if (!node) return undefined;
    node.classList.remove(className);
    // Reading layout restarts the animation on the same node.
    void node.offsetWidth;
    node.classList.add(className);
    const done = () => node.classList.remove(className);
    node.addEventListener('animationend', done, { once: true });
    return () => node.removeEventListener('animationend', done);
  }, [key, className]);
  return ref;
}

export default useEnterMotion;
