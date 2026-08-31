'use client';

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { clsx } from 'clsx';
import { ControlButton } from '../choice/control.button';

/**
 * The sentence a control could not fit into its own label.
 *
 * An interface built out of measured, unusual objects — a corridor, a voice
 * version, a scale — keeps producing controls whose name is honest and still
 * not enough: «Собрать голос заново» says what will run and not what it costs,
 * «Сравнить» says what will happen and not to what. Writing the missing
 * sentence beside every one of them turns a working screen into a manual; the
 * hint keeps it one keystroke or one hover away instead.
 *
 * It is a control and not a decoration, which fixes three things a `title`
 * attribute gets wrong. It is reachable from the keyboard, so the explanation
 * is not reserved for people using a mouse. It is announced, because the
 * bubble is a `tooltip` and the trigger points at it through
 * `aria-describedby`. And it is dismissible with Escape, which is the one
 * thing WCAG 1.4.13 asks of content that appears on hover.
 *
 * What it must never carry is the only copy of something a person needs.
 * A hint explains; it does not hold the instruction, the error or the state.
 * Everything load-bearing stays on the surface where it can be read without
 * asking for it.
 */

export type HintProps = {
  /** The sentence itself. Short: one or two lines, no paragraphs. */
  children: ReactNode;
  /**
   * What the hint is about, read by a screen reader in place of the glyph.
   *
   * «Подсказка» alone would announce eleven identical controls on one screen.
   * The subject is what makes the button findable: «Подсказка: коридор шкалы».
   */
  label: string;
  /**
   * Which side the bubble prefers, not which side it is stuck with.
   *
   * `end` is the default because a hint follows the label it explains, and the
   * space after it is usually the space that exists. Where it does not — a
   * hint near the right edge, or a 320px viewport where a 260px bubble barely
   * fits at all — the component measures and flips rather than pushing the
   * page sideways. Getting that wrong is not a cosmetic miss: a bubble hanging
   * past the edge makes the whole document scroll horizontally, which is the
   * reflow failure WCAG 1.4.10 is about, and it was doing exactly that.
   */
  side?: 'start' | 'end';
  className?: string;
};

const QuestionGlyph = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    aria-hidden="true"
    focusable="false"
  >
    <circle cx="8" cy="8" r="6.4" stroke="currentColor" strokeWidth="1.3" />
    <path
      d="M6.3 6.1c0-.9.76-1.6 1.7-1.6s1.7.7 1.7 1.6c0 .86-.53 1.2-1.1 1.55-.42.26-.6.5-.6.95v.25"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
    />
    <circle cx="8" cy="11.3" r=".8" fill="currentColor" />
  </svg>
);

export function Hint({ children, label, side = 'end', className }: HintProps) {
  const bubbleId = useId();
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLSpanElement>(null);
  const bubble = useRef<HTMLSpanElement>(null);
  /** Whether the focus about to arrive was caused by a press, and by what. */
  const fromPointer = useRef(false);
  const pointerKind = useRef('');
  /** Set when the preferred side would put the bubble outside the viewport. */
  const [flipped, setFlipped] = useState(false);

  const close = useCallback(() => setOpen(false), []);

  /**
   * Where the bubble would land, measured from the anchor rather than from
   * itself.
   *
   * Reading the bubble's own box is the obvious version and it oscillates:
   * flipping moves the box, the next measurement sees it fits, it flips back.
   * The anchor does not move and the bubble's width does not depend on which
   * side it is on, so `left + width` answers the question once and stays
   * answered. The margin is the system's 8px step, so a rescued bubble never
   * sits flush against the edge it was rescued from.
   */
  const place = useCallback(() => {
    const anchor = wrapper.current;
    const node = bubble.current;
    if (!anchor || !node) return;
    const room = document.documentElement.clientWidth;
    const width = node.getBoundingClientRect().width;
    const box = anchor.getBoundingClientRect();
    setFlipped(
      side === 'end' ? box.left + width > room - 8 : box.right - width < 8
    );
  }, [side]);

  /**
   * Measured before the browser paints, and again when the window changes.
   *
   * `useLayoutEffect` rather than `useEffect`: a bubble that appears on the
   * wrong side and jumps a frame later is worse than one that never moved.
   * The resize listener is not theoretical — a phone rotating, or a window
   * dragged narrower, leaves an open hint hanging past the edge and the whole
   * document scrolling sideways with it.
   */
  useLayoutEffect(() => {
    if (!open) {
      setFlipped(false);
      return undefined;
    }
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open, place]);

  /**
   * Escape closes it wherever the focus happens to be.
   *
   * Bound on the document rather than on the trigger: a hint opened by hover
   * has no focus inside it, and a key handler on the button would then be
   * listening on an element nobody is on. This is the dismissible half of
   * WCAG 1.4.13, and the hoverable half is the wrapper's `onMouseLeave` — the
   * bubble sits inside it, so moving the pointer onto the text keeps it up.
   */
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    const onPointerDown = (event: MouseEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) close();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [close, open]);

  return (
    <span
      ref={wrapper}
      className={clsx('relative inline-flex align-middle', className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={close}
    >
      {/*
        The box and the mark are two different sizes on purpose.

        `ControlButton` owns the height and gives the standard control 40px,
        which is the system's rhythm and what the button beside a hint is. The
        visible circle is 20px, because a hint sits inline next to a 12px
        caption and a 40px ring beside it would read as a second control rather
        than as a mark on the label. The rest of the box is hit area.

        Width is the half a height cannot cover, and it is the half that breaks
        on a phone: 24px is the pointer floor WCAG 2.5.8 states, and below the
        `sm` breakpoint a fingertip needs 44. Height gets there through the
        surrounding surface, which already sets 44px for touch — consumer
        heights are stripped by the primitive, which is also why the circle is
        a span rather than the button itself.
      */}
      <ControlButton
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? bubbleId : undefined}
        /**
         * A pointer press focuses before it clicks, and the two must not fight.
         *
         * Focus opened the bubble and the click that caused it then toggled it
         * shut, so the hint flickered and stayed closed for anybody using a
         * mouse. The flag says which of the two is happening. `:focus-visible`
         * would answer the same question and is not implemented everywhere the
         * component is exercised, so the fact is recorded rather than queried.
         */
        onPointerDown={(event) => {
          fromPointer.current = true;
          pointerKind.current = event.pointerType;
        }}
        onFocus={() => {
          if (!fromPointer.current) setOpen(true);
        }}
        onBlur={() => {
          fromPointer.current = false;
          close();
        }}
        onClick={() => {
          fromPointer.current = false;
          /**
           * A tap is the only way in on a touch screen; a mouse already has
           * two.
           *
           * With a mouse, the press is preceded by a hover that opened the
           * bubble, so toggling here shut it in the same gesture — the hint
           * flickered and stayed closed, and it did so for the most ordinary
           * way anybody would try to use it. Touch has no hover and no focus
           * before the press, which is the case this branch exists for.
           */
          if (pointerKind.current === 'mouse') return;
          setOpen((current) => !current);
        }}
        className="inline-flex w-[44px] items-center justify-center sm:w-[24px]"
      >
        <span
          aria-hidden="true"
          className={clsx(
            'flex h-[20px] w-[20px] items-center justify-center rounded-full border',
            'transition-colors duration-state motion-reduce:transition-none',
            open
              ? 'border-cf-border-strong text-cf-ink'
              : 'border-cf-border-control text-cf-ink-muted'
          )}
        >
          <QuestionGlyph />
        </span>
      </ControlButton>

      {open ? (
        <span
          ref={bubble}
          id={bubbleId}
          role="tooltip"
          className={clsx(
            // A layer above the content: shadow, no border. `DESIGN.md` keeps
            // the two apart so a floating thing never reads as a panel.
            'absolute top-[calc(100%+8px)] z-[300] w-max',
            // Two ceilings, and the narrow one wins. 260px is the reading
            // measure; on a 320px screen it is the viewport that decides, and
            // a bubble wider than the screen cannot be rescued by flipping.
            'max-w-[min(260px,calc(100vw-32px))]',
            'rounded-[8px] bg-cf-surface-raised p-[12px] shadow-menu',
            'cf-body-sm text-cf-ink [text-wrap:pretty]',
            (side === 'end') !== flipped ? 'start-0' : 'end-0'
          )}
        >
          {children}
        </span>
      ) : null}
    </span>
  );
}

export default Hint;
