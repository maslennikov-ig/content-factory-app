'use client';

import { RefObject, useEffect, useRef } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keep Tab inside a modal layer while it is the top one, and hand focus back
 * to whatever had it when the layer closes.
 *
 * Written once for both modal shells (`content-factory-next-97dq.76`, audit
 * §0.4): `Dialog` had it and the legacy `openModal` did not, so sixty-one
 * windows let the keyboard walk out onto the page underneath. Escape stays
 * with each shell, which already owns its own closing rules.
 *
 * **Pausing is not closing** (fourteenth walk review, P3-3). A window that
 * opens a second one on top — every `useDecisionModal` confirmation does —
 * stops trapping, but it has not closed: it keeps the element it will hand
 * focus back to and remembers which of its own controls had focus. Focus
 * moves back to the opener only when the layer closes (`open` turns false or
 * the shell unmounts); when the layer on top goes away, the paused one takes
 * its trap back and focus returns to the control inside it that opened the
 * upper window. Before, pausing ran the close path: focus jumped to the page
 * under both windows, and the upper window then saved that page element as
 * its own way back.
 */
export function useFocusTrap(
  panel: RefObject<HTMLElement | null>,
  open: boolean,
  onTop = true
) {
  const restoreTo = useRef<HTMLElement | null>(null);
  const lastInside = useRef<HTMLElement | null>(null);

  // Open → closed: the way back is taken once, on close only.
  useEffect(() => {
    if (!open) return;
    restoreTo.current = document.activeElement as HTMLElement | null;
    return () => {
      const target = restoreTo.current;
      restoreTo.current = null;
      lastInside.current = null;
      if (target?.isConnected) target.focus?.();
    };
  }, [open]);

  // On top → trapping; below another layer → paused, nothing moves.
  useEffect(() => {
    if (!open || !onTop) return;

    const node = panel.current;
    if (!node?.contains(document.activeElement)) {
      const resume = lastInside.current;
      if (resume?.isConnected && node?.contains(resume)) resume.focus();
      else node?.focus();
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !panel.current) return;
      const focusable = panel.current.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      // Paused under another layer: remember where we were, move nothing.
      const active = document.activeElement as HTMLElement | null;
      if (active && panel.current?.contains(active)) lastInside.current = active;
    };
  }, [open, onTop, panel]);
}
