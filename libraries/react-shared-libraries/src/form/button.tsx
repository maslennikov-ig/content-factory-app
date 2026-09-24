'use client';

import {
  ButtonHTMLAttributes,
  DetailedHTMLProps,
  forwardRef,
  useEffect,
  useRef,
  useState,
} from 'react';
import { clsx } from 'clsx';
import { withoutConsumerHeight, withoutConsumerHeightStyle } from './control-height';

const ReactLoading = ({
  color = 'currentColor',
  width = 20,
  height = 20,
}: {
  type?: string;
  color?: string;
  width?: number;
  height?: number;
}) => {
  const size = Math.min(width, height);
  const borderWidth = Math.max(2, Math.round(size / 8));
  return (
    <div
      style={{
        width: size,
        height: size,
        border: `${borderWidth}px solid transparent`,
        borderTopColor: color,
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }}
    />
  );
};

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'quiet'
  | 'destructive'
  | 'navigation'
  | 'navigation-current';
/**
 * Compatibility input for upstream icon-only callers. It is deliberately
 * ignored: `density` owns the 32/40px hit target and the child SVG owns glyph
 * dimensions. New callers must omit it.
 */
export type DeprecatedButtonIconSize = 20 | 28 | 32;
export type ButtonDensity = 'standard' | 'dense';

/**
 * The action scale's own type, stated once. Two literals would be two places to
 * change and one place to forget, and the button branch and the link branch
 * have to read the same.
 */
const ACTION_TYPE = 'text-[14px]';
const ACTION_WEIGHT = 'font-[600]';

/**
 * The pressed state, and the only colour value in the system outside the token
 * palette — `DESIGN.md` names it: an inset shadow describing light falling into
 * a dent, `.14` over a surface and `.22` over a fill. It belongs to the variant
 * rather than to the geometry because which of the two applies depends on what
 * the variant paints, and the utilities themselves live in
 * `tailwind.config.cjs` beside the typography tokens.
 */
const PRESSED_ON_FILL = 'cf-pressed-fill';
const PRESSED_ON_SURFACE = 'cf-pressed';

const VARIANTS: Record<ButtonVariant, string> = {
  // Disabled on the dark ground: half the opacity of a green fill is still a
  // green fill, and «Переписать с этим» read as the live main action while it
  // was off (twelfth stand walk, 01-channel-top-d). There the plate goes
  // neutral; on the light ground the faded green already reads as off.
  primary:
    'bg-cf-accent text-cf-accent-ink border border-transparent hover:bg-cf-accent-hover ' +
    'dark:disabled:bg-cf-surface-subtle dark:disabled:text-cf-ink-muted dark:disabled:border-cf-border-control dark:disabled:hover:bg-cf-surface-subtle ' +
    'dark:aria-disabled:bg-cf-surface-subtle dark:aria-disabled:text-cf-ink-muted dark:aria-disabled:border-cf-border-control ' +
    PRESSED_ON_FILL,
  secondary:
    'bg-cf-surface text-cf-ink border border-cf-border-control hover:bg-cf-surface-subtle ' +
    PRESSED_ON_SURFACE,
  quiet:
    'bg-transparent text-cf-ink border border-transparent hover:bg-cf-surface-subtle ' +
    PRESSED_ON_SURFACE,
  destructive:
    'bg-cf-danger text-white border border-transparent hover:opacity-90 ' +
    PRESSED_ON_FILL,
  // A rail row is painted by the navigation surface, not by the action scale.
  // The two navigation entries are one variant with two states rather than a
  // colour the rail hands in through `className`: the moment the call site owns
  // the paint, the variant audit has nothing left to compare against, which is
  // exactly how the rail stayed invisible to it.
  navigation:
    'bg-transparent text-cf-navigation-muted border border-transparent hover:bg-cf-navigation-active hover:text-cf-navigation-text',
  'navigation-current':
    'bg-cf-navigation-active text-cf-navigation-text border border-transparent',
};

/**
 * The rail row's paint for the branch that cannot be a button.
 *
 * A navigation row that really navigates has to stay an anchor — middle click,
 * open in a new tab, the address on the status bar. That branch still must not
 * retype the colours, so it draws the same variant string the button branch
 * gets. `current` follows `aria-current="page"`; the caller sets both or
 * neither.
 */
export const navigationRowVariant = (current: boolean) =>
  VARIANTS[current ? 'navigation-current' : 'navigation'];

type NativeButtonProps = DetailedHTMLProps<
  ButtonHTMLAttributes<HTMLButtonElement>,
  HTMLButtonElement
> & {
  /** Existing call sites keep working; equivalent to variant="secondary". */
  secondary?: boolean;
  variant?: ButtonVariant;
  loading?: boolean;
  /**
   * What is happening, announced while `loading`. The label itself stays in the
   * accessibility tree — it only fades — so this is not a replacement for it but
   * the sentence a screen reader would otherwise have to guess from
   * `aria-busy` alone: "Remove" plus busy is not "Removing sign-in method".
   */
  loadingLabel?: string;
  innerClassName?: string;
  density?: ButtonDensity;
  layout?: 'control' | 'content';
};

type ButtonProps =
  | (NativeButtonProps & { iconOnly?: false; size?: never })
  | (NativeButtonProps & {
      iconOnly: true;
      /** @deprecated Ignored compatibility input; use `density`. */
      size?: DeprecatedButtonIconSize;
      /** Icon-only controls must expose a programmatic name. */
      'aria-label': string;
    });

const ownClassTokens = (className: string) =>
  className
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token.replace(/^!/, ''));

const ownsUnprefixedAxis = (tokens: string[], axes: string[]) =>
  tokens.some((token) => axes.some((axis) => token.startsWith(`${axis}-`)));

const POSITION_UTILITIES = [
  'static',
  'fixed',
  'absolute',
  'relative',
  'sticky',
];

const ownsUnprefixedPosition = (tokens: string[]) =>
  tokens.some((token) => POSITION_UTILITIES.includes(token));

const getIconPaddingDefaults = (tokens: string[]) => {
  const top = ownsUnprefixedAxis(tokens, ['p', 'py', 'pt']);
  const bottom = ownsUnprefixedAxis(tokens, ['p', 'py', 'pb']);
  const horizontal = ownsUnprefixedAxis(tokens, [
    'p',
    'px',
    'pl',
    'pr',
    'ps',
    'pe',
  ]);

  if (!top && !horizontal && !bottom) return 'p-0';

  return clsx(!top && 'pt-0', !horizontal && 'px-0', !bottom && 'pb-0');
};

const getHorizontalPaddingDefaults = (tokens: string[]) => {
  const horizontal = ownsUnprefixedAxis(tokens, [
    'p',
    'px',
    'pl',
    'pr',
    'ps',
    'pe',
  ]);

  return horizontal ? '' : 'px-[16px]';
};

/**
 * The layout of a button's content: the gap between icon and label, and where
 * the pair sits on the line.
 *
 * The `<button>` has one in-flow child — the wrapper further down, since the
 * loading overlay is absolutely positioned — so a `gap-*` written at the call
 * site lands on an element with nothing to space and is invisible. The wrapper
 * is the flex container the content actually sits in, so the call site's own
 * gap has to travel one element inwards to mean anything. This is the same
 * courtesy the padding and position defaults pay, applied on the element where
 * the value shows. `justify-*` travels for the same reason: the wrapper is
 * `flex-1` and fills the button, so the button's own justification never shows
 * either — that is why a navigation row could not read from the left edge.
 *
 * `innerClassName` addresses the wrapper directly, so a value written there
 * needs no carrying; it only has to stop the default being printed on top of
 * it.
 *
 * Prefixed variants (`md:gap-*`, `hover:justify-*`) are left alone, exactly as
 * `ownsUnprefixedAxis` leaves them: they do not describe the resting layout,
 * and moving them would change which breakpoints they answer to.
 */
const CONTENT_LAYOUT_UTILITY = /^!?(?:gap(?:-[xy])?|justify)-/;

const getContentClasses = (className: string, innerClassName?: string) => {
  const carried = className
    .split(/\s+/)
    .filter((token) => CONTENT_LAYOUT_UTILITY.test(token));
  const owned = [
    ...ownClassTokens(carried.join(' ')),
    ...ownClassTokens(innerClassName || ''),
  ];

  return clsx(
    'flex-1 items-center flex',
    !ownsUnprefixedAxis(owned, ['justify']) && 'justify-center',
    !ownsUnprefixedAxis(owned, ['gap']) && 'gap-[8px]',
    carried
  );
};

/**
 * The mobile hit area (`content-factory-next-11qv`).
 *
 * `DESIGN.md`: below the breakpoint the wrapper of an interactive element gets
 * at least 44px — not a third visual height, a hit area around the same
 * 40/32px control. It is a transparent `::before` that reaches 2px (40px
 * body) or 6px (32px body) past each edge and collapses back onto the button
 * at `md`, the same device `ControlButton` uses for dense choices and
 * `cf-control-h` for its 44/40 pair. Owned here, so no screen has to wrap its
 * buttons in `[&_button]:min-h-[44px]` to be usable with a finger.
 *
 * The pseudo-element needs a containing block; the button is `relative`
 * unless the call site chose another non-static position, and every one of
 * those serves.
 *
 * **One inset per axis** (fourteenth walk review, P2-1). `before:inset-x-0`
 * and `before:-inset-x-*` have the same specificity, and Tailwind 3.4 prints
 * the negative one first, so writing both let `inset-x-0` win and an
 * icon-only button never grew sideways. The horizontal value is now either
 * the extension or zero, never both.
 *
 * **A neighbour yields** (same review, P3-1). Buttons are positioned and a
 * later one paints over an earlier one, so in a tight stack its `::before`
 * lay over the bottom edge of the button above and took its taps. A hit area
 * that directly follows another one (`cf-hit-area`) therefore does not reach
 * back towards it: upwards in a column, towards the inline start in a row
 * (icon-only only; a text button never reaches sideways). The earlier
 * button's forward reach covers the shared gap, and where it overlaps the
 * later button the later body paints on top, so every tap lands on the
 * button it is nearest to and no body is ever covered by a neighbour.
 *
 * Scrolling containers: a reach towards the top or the start cannot scroll;
 * one past the bottom or end edge can, so the shared `Table` wrapper clips
 * the vertical axis it never scrolls, and the dialog shells keep 20px of
 * padding around their content, more than any reach.
 */
export const HIT_AREA_MARKER = 'cf-hit-area';

const mobileHitArea = (
  iconOnly: boolean,
  density: ButtonDensity,
  layout: 'control' | 'content'
) => {
  const sideways = iconOnly && layout === 'control';
  return clsx(
    HIT_AREA_MARKER,
    "before:absolute before:content-[''] md:before:inset-0",
    layout === 'content' || density === 'standard'
      ? 'before:-inset-y-0.5'
      : 'before:-inset-y-1.5',
    sideways
      ? density === 'standard'
        ? 'before:-inset-x-0.5'
        : 'before:-inset-x-1.5'
      : 'before:inset-x-0',
    '[.flex-col>.cf-hit-area+&]:before:top-0',
    sideways && '[:not(.flex-col)>.cf-hit-area+&]:before:start-0'
  );
};

const getGeometryClasses = (
  tokens: string[],
  iconOnly: boolean,
  density: ButtonDensity = 'standard',
  layout: 'control' | 'content' = 'control'
) => {
  if (layout === 'content') return clsx('min-h-[40px]', getHorizontalPaddingDefaults(tokens));
  if (iconOnly) {
    return clsx(
      density === 'dense' ? 'h-[32px] w-[32px]' : 'h-[40px] w-[40px]',
      getIconPaddingDefaults(tokens)
    );
  }

  return clsx(density === 'dense' ? 'h-[32px]' : 'h-[40px]', getHorizontalPaddingDefaults(tokens));
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      loading,
      loadingLabel,
      innerClassName,
      secondary,
      variant,
      iconOnly,
      size: _deprecatedSize,
      density = iconOnly ? 'dense' : 'standard',
      layout = 'control',
      style,
      ...props
    },
    forwardedRef
  ) => {
    const ref = useRef<HTMLButtonElement | null>(null);
    const [height, setHeight] = useState<number | null>(null);
    useEffect(() => {
      setHeight(ref.current?.offsetHeight || 40);
    }, []);

    const resolved: ButtonVariant =
      variant || (secondary ? 'secondary' : 'primary');
    const className = withoutConsumerHeight(props?.className);
    const tokens = ownClassTokens(className);

    return (
      <button
        {...props}
        type={props.type || 'button'}
        ref={(element) => {
          ref.current = element;
          if (typeof forwardedRef === 'function') forwardedRef(element);
          else if (forwardedRef) forwardedRef.current = element;
        }}
        style={withoutConsumerHeightStyle(style)}
        aria-busy={loading || undefined}
        disabled={props.disabled || loading}
        className={clsx(
          ACTION_TYPE,
          'cursor-pointer items-center justify-center flex transition-colors duration-state',
          iconOnly
            ? null
            : clsx(
                // The label weight defers like the geometry does. A rail row
                // marks the current item by weight as well as by plate and bar,
                // and two arbitrary font weights in one utility group have no
                // reliable order in the stylesheet — so the component states
                // its default only where the call site has not stated one.
                !ownsUnprefixedAxis(tokens, ['font']) && ACTION_WEIGHT
              ),
          // Respect a call site that already picked its own positioning: at equal
          // specificity Tailwind prints .relative after .absolute, so an
          // unconditional relative here would silently win over the call site.
          // The loading overlay only needs a containing block, and every position
          // except static provides one.
          !ownsUnprefixedPosition(tokens) && 'relative',
          getGeometryClasses(tokens, Boolean(iconOnly), density, layout),
          mobileHitArea(Boolean(iconOnly), density, layout),
          'disabled:cursor-not-allowed disabled:opacity-50',
          VARIANTS[resolved],
          // Respect a call site that already picked its own geometry.
          !/(^|\s)rounded/.test(className) && 'rounded-[8px]',
          className
        )}
      >
        {loading && (
          <div
            aria-hidden="true"
            className="absolute inset-0 flex items-center justify-center"
          >
            <ReactLoading
              type="spin"
              color="currentColor"
              width={height! / 2}
              height={height! / 2}
            />
          </div>
        )}
        {loading && loadingLabel && (
          <span className="sr-only">{loadingLabel}</span>
        )}
        <div
          className={clsx(
            getContentClasses(className, innerClassName),
            innerClassName,
            loading && 'opacity-0'
          )}
        >
          {children}
        </div>
      </button>
    );
  }
);

/**
 * The button's paint and control geometry for a branch that is not a button.
 *
 * A navigation action has to stay an anchor — middle click, open in a new tab,
 * the address on the status bar — and an anchor cannot be `disabled`, only
 * `aria-disabled`, so the refusal is spelled in `aria-disabled:*` utilities
 * rather than the `disabled:*` ones the button branch uses. Everything a call
 * site can see is otherwise the same value, read from the same `VARIANTS`.
 */
export const buttonClassName = ({
  variant = 'secondary',
  density = 'standard',
  className,
}: {
  variant?: ButtonVariant;
  density?: ButtonDensity;
  className?: string;
} = {}) =>
  clsx(
    'relative inline-flex items-center justify-center gap-[8px] rounded-[8px]',
    ACTION_TYPE,
    ACTION_WEIGHT,
    'whitespace-nowrap',
    'transition-colors duration-state',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cf-focus',
    'aria-disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:pointer-events-none',
    density === 'dense' ? 'h-[32px] px-[10px]' : 'h-[40px] px-[16px]',
    mobileHitArea(false, density, 'control'),
    VARIANTS[variant],
    className
  );
