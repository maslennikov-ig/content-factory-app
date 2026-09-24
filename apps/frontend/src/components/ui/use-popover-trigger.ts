'use client';

import { useEffect, useRef, useState } from 'react';
import { containsIncludingHints } from '@contentfactory/react/layout/hint-portal';

/**
 * Open state for a popover hung on its trigger: Escape or a press outside the
 * holder closes it.
 *
 * Written twice by hand — the calendar's grouped slot and the «План впереди»
 * chip (`content-factory-next-97dq.76`, audit §5.5) — with the same two
 * listeners in the same order. The holder is the element that contains both
 * the trigger and the popover, so a press on either keeps it open. A press on
 * the portalled bubble of a `Hint` inside the holder counts as inside too
 * (`hint-portal.ts`): the «План впереди» popover used to shut when its own
 * legend bubble was tapped (fourteenth walk review, P3-4).
 */
export function usePopoverTrigger<T extends HTMLElement>() {
  const [open, setOpen] = useState(false);
  const holder = useRef<T | null>(null);

  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const outside = (event: MouseEvent) => {
      if (!containsIncludingHints(holder.current, event.target)) setOpen(false);
    };
    document.addEventListener('keydown', escape);
    document.addEventListener('mousedown', outside);
    return () => {
      document.removeEventListener('keydown', escape);
      document.removeEventListener('mousedown', outside);
    };
  }, [open]);

  return { open, setOpen, holder };
}

export default usePopoverTrigger;
