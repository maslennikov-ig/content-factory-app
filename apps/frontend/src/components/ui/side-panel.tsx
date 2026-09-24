'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import clsx from 'clsx';
import { Button } from '@contentfactory/react/form/button';

/**
 * A side panel a person can resize and put away (`content-factory-next-97dq.71`).
 *
 * The thirteenth walk (overall note) asked for the usual side-panel habits:
 * grab the inner border and drag it, press a button to hide the panel, and
 * find it again on its own edge. One primitive owns all of it, so the piece's
 * settings panel and the main navigation behave the same way:
 *
 * - the inner border is a focusable `separator` with `aria-valuenow`; drag it,
 *   or use the arrow keys (Shift for a bigger step, Home/End for the ends);
 * - a button hides the panel into a thin rail on its own edge, and the rail
 *   holds the button that brings it back (or a custom `rail`, such as the
 *   navigation's icon rail);
 * - dragging past the minimum hides it at once, while the pointer is still
 *   down (`97dq.93`), and dragging back out in the same move opens it again;
 *   the hidden rail keeps the handle (`97dq.84`), so dragging it out — or an
 *   arrow key towards the middle, or End — brings the panel back;
 * - width and hidden state persist per `id` in `localStorage`, guarded: a
 *   private window or a full quota only loses the memory, never the panel;
 * - width changes animate for 150ms and not at all under reduced motion or
 *   while dragging.
 *
 * `breakpoint="lg"` keeps all of it for wide screens; below it the panel is an
 * ordinary block in the page flow — there is no side to hide it to.
 */

export type SidePanelCopy = {
  /** Accessible name of the drag handle: «Ширина панели». */
  resize: string;
  /** The hide button: «Скрыть панель». */
  hide: string;
  /** The rail's button: «Показать панель». */
  show: string;
};

type Stored = { width?: number; hidden?: boolean };

const STORAGE_PREFIX = 'cf.side-panel.v1.';
/** How far past the minimum a drag must go before it means «hide». */
const HIDE_SLACK = 40;
/**
 * A drag that hid the panel opens it again this much closer to the minimum
 * than where it hid (`97dq.93`): a hand resting on the line does not make
 * the panel flicker between the two.
 */
const REOPEN_SLACK = HIDE_SLACK / 2;
const STEP = 16;
const BIG_STEP = 64;

const readStored = (id: string): Stored => {
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + id);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Stored) : {};
  } catch {
    return {};
  }
};

const writeStored = (id: string, value: Stored) => {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + id, JSON.stringify(value));
  } catch {
    // Private mode or a full quota: the panel still works, it just forgets.
  }
};

export const clampWidth = (value: number, min: number, max: number) =>
  Math.round(Math.min(max, Math.max(min, value)));

/**
 * Tailwind needs whole class names, so the two layouts are spelled out: with
 * `lg` the side behaviour switches on at 1024px, with `none` it is always on.
 */
const LAYOUT = {
  lg: {
    root: 'w-full lg:w-[var(--cf-side-panel-width)] lg:shrink-0',
    side: 'hidden lg:flex',
    hiddenBody: 'lg:hidden',
    rail: 'hidden lg:flex',
  },
  none: {
    root: 'w-[var(--cf-side-panel-width)] shrink-0',
    side: 'flex',
    hiddenBody: 'hidden',
    rail: 'flex',
  },
} as const;

const Chevron = ({ pointsTo }: { pointsTo: 'start' | 'end' }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    aria-hidden="true"
    className={clsx(
      pointsTo === 'start' ? 'rtl:rotate-180' : 'rotate-180 rtl:rotate-0'
    )}
  >
    <path
      d="M10 3 5 8l5 5"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

type HideSlot = {
  hide: () => void;
  label: string;
  regionId: string;
  side: 'start' | 'end';
  className: string;
};

/**
 * The hide button a panel's own header draws (`97dq.78`, fourteenth walk,
 * A5): with `hideButton="header"` the panel does not add its floating row,
 * and whichever header the content renders holds `SidePanelHideButton` next
 * to its title. Outside such a panel the button renders nothing.
 */
const HideSlotContext = createContext<HideSlot | null>(null);

export function SidePanelHideButton() {
  const slot = useContext(HideSlotContext);
  if (!slot) return null;
  return (
    <span className={clsx('shrink-0', slot.className)}>
      <Button
        variant="quiet"
        iconOnly
        density="dense"
        aria-label={slot.label}
        title={slot.label}
        aria-expanded={true}
        aria-controls={slot.regionId}
        data-side-panel-hide="true"
        onClick={slot.hide}
      >
        <Chevron pointsTo={slot.side} />
      </Button>
    </span>
  );
}

export function SidePanel({
  id,
  side,
  label,
  copy,
  children,
  defaultWidth = 360,
  minWidth = 280,
  maxWidth = 560,
  reserveMain,
  collapsed,
  onCollapsedChange,
  rail,
  railWidth = 40,
  showHideButton = true,
  hideButton = 'row',
  breakpoint = 'lg',
  className,
  bodyClassName,
  unmountHidden = false,
}: {
  /** Persistence key; one per panel, not per page. */
  id: string;
  /** The screen edge the panel lives on; the handle is on the other side. */
  side: 'start' | 'end';
  /** Accessible name of the panel region. */
  label: string;
  copy: SidePanelCopy;
  children: ReactNode;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  /**
   * Keep the neighbouring column at least this wide (px, gap included): the
   * panel gives up width before the main column goes below it.
   */
  reserveMain?: number;
  /** Controlled hidden state; without it the panel keeps its own. */
  collapsed?: boolean;
  onCollapsedChange?: (hidden: boolean) => void;
  /** What stands on the edge while hidden; a reopen button by default. */
  rail?: ReactNode;
  railWidth?: number;
  /** The navigation carries its own collapse control. */
  showHideButton?: boolean;
  /**
   * Where the hide button stands: its own row above the content (`row`), or
   * in the content's header through `SidePanelHideButton` (`header`).
   */
  hideButton?: 'row' | 'header';
  breakpoint?: 'lg' | 'none';
  className?: string;
  bodyClassName?: string;
  /**
   * Drop the body while hidden instead of keeping it in the page. Right for
   * a rail that renders the same content compact (the navigation), where
   * two mounted copies would mean two of every link.
   */
  unmountHidden?: boolean;
}) {
  const layout = LAYOUT[breakpoint];
  const regionId = `${useId()}-side-panel`;
  const [width, setWidth] = useState(() =>
    clampWidth(defaultWidth, minWidth, maxWidth)
  );
  const [ownHidden, setOwnHidden] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [restored, setRestored] = useState(false);
  /**
   * The width on screen. It can be less than `width`: `reserveMain` gives
   * the neighbour its room first. The handle reports and steps from this one
   * (second review, item 7), or a keyboard user hears 560 while seeing 420.
   */
  const [rendered, setRendered] = useState<number | null>(null);
  const root = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{
    x: number;
    width: number;
    next: number;
    /** Started on the hidden rail (`97dq.84`). */
    fromRail: boolean;
    /** The drag out of the rail has opened the panel already. */
    opened?: boolean;
    /** Hidden right now, by this drag or before it (`97dq.93`). */
    collapsed: boolean;
  } | null>(null);
  const controlled = collapsed !== undefined;
  const hidden = controlled ? collapsed : ownHidden;

  // Read after mount: the server has no storage, and the first paint must
  // match it.
  useEffect(() => {
    const stored = readStored(id);
    if (typeof stored.width === 'number' && Number.isFinite(stored.width)) {
      setWidth(clampWidth(stored.width, minWidth, maxWidth));
    }
    if (!controlled && typeof stored.hidden === 'boolean') {
      setOwnHidden(stored.hidden);
    }
    setRestored(true);
    // The id is the identity of the memory; the bounds only clamp it.
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!restored) return;
    writeStored(id, controlled ? { width } : { width, hidden: ownHidden });
  }, [id, restored, width, ownHidden, controlled]);

  /** Hidden state without touching a drag: the drag itself hides (`97dq.93`). */
  const applyHidden = useCallback(
    (next: boolean) => {
      if (!controlled) setOwnHidden(next);
      onCollapsedChange?.(next);
    },
    [controlled, onCollapsedChange]
  );

  const setHidden = useCallback(
    (next: boolean) => {
      // A drag in progress ends with the panel it was resizing.
      drag.current = null;
      setDragging(false);
      if (!controlled) setOwnHidden(next);
      onCollapsedChange?.(next);
    },
    [controlled, onCollapsedChange]
  );

  useEffect(() => {
    const node = root.current;
    if (!node || hidden) return;
    const measure = () => {
      const value = Math.round(node.getBoundingClientRect().width);
      setRendered(value > 0 ? value : null);
    };
    measure();
    window.addEventListener('resize', measure);
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(measure);
    observer?.observe(node);
    return () => {
      window.removeEventListener('resize', measure);
      observer?.disconnect();
    };
  }, [hidden, width]);

  /** What the handle reports: the smaller of the chosen and the drawn width. */
  const current = clampWidth(
    rendered !== null ? Math.min(width, rendered) : width,
    minWidth,
    maxWidth
  );

  /** Pointer movement grows the panel towards the middle of the screen. */
  const grows = (delta: number) => {
    const rtl =
      typeof document !== 'undefined' && document.documentElement.dir === 'rtl';
    const towardsEnd = rtl ? -delta : delta;
    return side === 'end' ? -towardsEnd : towardsEnd;
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const start = hidden
      ? railWidth
      : root.current?.getBoundingClientRect().width || width;
    drag.current = {
      x: event.clientX,
      width: start,
      next: start,
      fromRail: hidden,
      collapsed: hidden,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragging(true);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state) return;
    const next = state.width + grows(event.clientX - state.x);
    state.next = next;
    /*
      Two lines and a gap between them (`97dq.93`): a drag that started on
      the rail opens past `railWidth + HIDE_SLACK` and folds back only nearer
      the rail than that; a drag that started on the open panel hides past
      `minWidth - HIDE_SLACK` and opens again a little before the minimum. The
      gap keeps a hand resting on a line from flickering the panel.
    */
    const opensAt = state.fromRail
      ? railWidth + HIDE_SLACK
      : minWidth - REOPEN_SLACK;
    const hidesBelow = state.fromRail
      ? railWidth + REOPEN_SLACK
      : minWidth - HIDE_SLACK;
    if (state.collapsed) {
      // Out of the rail (`97dq.84`), or back out after this drag hid the
      // panel: it opens and the same drag goes on sizing it.
      if (next < opensAt) return;
      // One change per crossing: a controlled parent re-renders a move later.
      state.collapsed = false;
      state.opened = true;
      applyHidden(false);
    } else if (next < hidesBelow) {
      /*
        Past the line the panel goes away now, under the pointer, not on
        release (`97dq.93`, fifteenth walk, D1): the person sees the result
        while still able to take it back. The width it had before the drag
        is what the reopen button restores.
      */
      state.collapsed = true;
      setWidth(clampWidth(state.fromRail ? minWidth : state.width, minWidth, maxWidth));
      applyHidden(true);
      return;
    }
    setWidth(clampWidth(next, minWidth, maxWidth));
  };

  /**
   * `commit` is false when the browser takes the pointer away (cancel, lost
   * capture): the drag stops where it was and never hides the panel — one
   * this drag hid comes back.
   */
  const endDrag = (event: PointerEvent<HTMLDivElement>, commit = true) => {
    const state = drag.current;
    if (!state) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId))
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    setDragging(false);
    if (!commit && state.collapsed && !state.fromRail) {
      // Where it was when the pointer crossed the line: at the minimum.
      setWidth(minWidth);
      applyHidden(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? BIG_STEP : STEP;
    if (hidden) {
      // The rail's handle opens the panel towards the middle, or with End,
      // Enter or Space; nothing else moves a hidden panel (`97dq.84`).
      const opens =
        (event.key === 'ArrowLeft' && grows(-step) > 0) ||
        (event.key === 'ArrowRight' && grows(step) > 0) ||
        event.key === 'End' ||
        event.key === 'Enter' ||
        event.key === ' ';
      if (!opens) return;
      event.preventDefault();
      setHidden(false);
      return;
    }
    let next: number | null = null;
    if (event.key === 'ArrowLeft') next = current + grows(-step);
    else if (event.key === 'ArrowRight') next = current + grows(step);
    else if (event.key === 'Home') next = minWidth;
    else if (event.key === 'End') next = maxWidth;
    if (next === null) return;
    event.preventDefault();
    setWidth(clampWidth(next, minWidth, maxWidth));
  };

  const cssWidth = hidden
    ? `${railWidth}px`
    : reserveMain
    ? `clamp(${minWidth}px, calc(100% - ${reserveMain}px), ${width}px)`
    : `${width}px`;

  return (
    <div
      ref={root}
      data-side-panel={id}
      data-side-panel-hidden={hidden ? 'true' : 'false'}
      style={{ '--cf-side-panel-width': cssWidth } as CSSProperties}
      className={clsx(
        'relative min-w-0',
        layout.root,
        // No motion before the stored width is read (the first paint would
        // slide from the default), none while dragging, none if reduced.
        restored &&
          !dragging &&
          'transition-[width] duration-state ease-out motion-reduce:transition-none',
        className
      )}
    >
      {hidden ? (
        <div
          data-side-panel-rail="true"
          className={clsx(
            'h-full flex-col items-center',
            layout.rail,
            rail
              ? ''
              : side === 'end'
              ? 'border-s border-cf-border ps-[4px]'
              : 'border-e border-cf-border pe-[4px]'
          )}
        >
          {rail ?? (
            <Button
              variant="secondary"
              iconOnly
              density="dense"
              aria-label={copy.show}
              title={copy.show}
              aria-expanded={false}
              aria-controls={regionId}
              onClick={() => setHidden(false)}
            >
              <Chevron pointsTo={side === 'end' ? 'start' : 'end'} />
            </Button>
          )}
        </div>
      ) : null}

      {hidden && unmountHidden ? null : (
        <div
          id={regionId}
          role="region"
          aria-label={label}
          className={clsx(
            'flex min-w-0 flex-col',
            hidden && layout.hiddenBody,
            bodyClassName
          )}
        >
          {showHideButton && hideButton === 'row' ? (
            <div className={clsx('justify-end pb-[8px]', layout.side)}>
              <Button
                variant="quiet"
                iconOnly
                density="dense"
                aria-label={copy.hide}
                title={copy.hide}
                aria-expanded={true}
                aria-controls={regionId}
                data-side-panel-hide="true"
                onClick={() => setHidden(true)}
              >
                <Chevron pointsTo={side} />
              </Button>
            </div>
          ) : null}
          {showHideButton && hideButton === 'header' ? (
            <HideSlotContext.Provider
              value={{
                hide: () => setHidden(true),
                label: copy.hide,
                regionId,
                side,
                className: layout.side,
              }}
            >
              {children}
            </HideSlotContext.Provider>
          ) : (
            children
          )}
        </div>
      )}

      {/*
        The handle stays on the hidden rail too (`97dq.84`, fourteenth walk,
        E1): a rail collapsed by dragging is opened the same way.
      */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={copy.resize}
        aria-controls={hidden && unmountHidden ? undefined : regionId}
        aria-valuenow={hidden ? railWidth : current}
        aria-valuemin={hidden ? railWidth : minWidth}
        aria-valuemax={maxWidth}
        data-side-panel-handle-hidden={hidden ? 'true' : undefined}
        tabIndex={0}
        data-side-panel-handle="true"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(event) => endDrag(event)}
        onPointerCancel={(event) => endDrag(event, false)}
        onLostPointerCapture={(event) => endDrag(event, false)}
        onKeyDown={onKeyDown}
        className={clsx(
          'group absolute inset-y-0 z-[5] w-[12px] cursor-col-resize touch-none justify-center outline-none',
          layout.side,
          /*
            Review of 97dq.81-85, P3-8: on the hidden rail the handle sits
            inside the rail, on its inner edge. Outside it, it covered 8–20px
            of the neighbouring column — a scrollbar or a control flush with
            the edge stopped taking clicks while the panel was collapsed.
          */
          hidden
            ? side === 'end'
              ? 'start-0'
              : 'end-0'
            : side === 'end'
            ? '-start-[20px]'
            : '-end-[8px]'
        )}
      >
        <span
          aria-hidden="true"
          className={clsx(
            // A 2px rule, drawn as a border so the width is a token.
            'h-full border-s-2 transition-colors duration-state motion-reduce:transition-none',
            dragging
              ? 'border-cf-accent'
              : 'border-transparent group-hover:border-cf-border-strong group-focus-visible:border-cf-focus'
          )}
        />
      </div>
    </div>
  );
}

export default SidePanel;
