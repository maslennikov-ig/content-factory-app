'use client';

import Link from 'next/link';
import { clsx } from 'clsx';
import { FC, ReactNode } from 'react';
import { PLATFORM_SYMBOLS } from '@contentfactory/react/platform/platform.families';

/**
 * The parts the public landing page repeats.
 *
 * Everything here exists because the alternative was the same decision retyped
 * per scene: the CTA geometry six times, the "Soon" marker four times, the
 * frame around a product shot five times. The page is one long file otherwise,
 * and a landing page that drifts a pixel per section is how a design system
 * stops describing the product's front door.
 */

/**
 * The landing action height.
 *
 * `cf-control-h` is the product's own 44/40 pair and it is right for the header,
 * where the action sits in a toolbar. The two page CTAs are the page's subject
 * rather than a control on it, so they take one deliberate step up — 48px in
 * both directions, which is also above the 44px touch floor without a
 * breakpoint. Written once, here, for the same reason `cf-control-h` exists.
 */
const LANDING_ACTION =
  'inline-flex min-h-[48px] items-center justify-center rounded-[8px] px-[24px] cf-label-md ' +
  'transition-colors duration-state motion-reduce:transition-none ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cf-focus';

/** The header's actions, which do belong to the product's control scale. */
export const HEADER_ACTION =
  'inline-flex cf-control-h items-center justify-center rounded-[8px] px-[16px] cf-label-md ' +
  'transition-colors duration-state motion-reduce:transition-none ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cf-focus';

export const PRIMARY_FILL =
  'bg-cf-accent text-cf-accent-ink hover:bg-cf-accent-hover cf-pressed-fill';

export const SECONDARY_FILL =
  'border border-cf-border-control bg-cf-surface text-cf-ink hover:bg-cf-surface-subtle cf-pressed';

/**
 * The page has exactly one primary action, and it is the same action every
 * time it appears. Registration is a decision a visitor makes once, so a second
 * green button competing for it would only make the page louder.
 */
export const PrimaryCta: FC<{ href: string; children: ReactNode }> = ({
  href,
  children,
}) => (
  <Link href={href} className={clsx(LANDING_ACTION, PRIMARY_FILL)}>
    {children}
  </Link>
);

export const SecondaryCta: FC<{ href: string; children: ReactNode }> = ({
  href,
  children,
}) => (
  <Link href={href} className={clsx(LANDING_ACTION, SECONDARY_FILL)}>
    {children}
  </Link>
);

const ClockIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
    className="shrink-0"
  >
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 8v4l2.5 2" />
  </svg>
);

const CheckIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
    className="shrink-0"
  >
    <path d="m4 12.5 5 5L20 6.5" />
  </svg>
);

/**
 * "Soon", said in a word and drawn with a mark.
 *
 * Three things on this page do not exist yet. Colour alone would not tell a
 * visitor which — so the marker carries the word, the clock and the warning
 * border together, and it is the only place `warning` is spent on the page.
 */
export const SoonBadge: FC<{ label: string }> = ({ label }) => (
  <span className="inline-flex items-center gap-[4px] rounded-full border border-cf-warning bg-cf-warning-soft px-[8px] py-[4px] cf-label-md text-cf-warning">
    <ClockIcon />
    {label}
  </span>
);

export type StatusTone = 'accent' | 'info' | 'neutral' | 'danger';

const STATUS_TONE: Record<StatusTone, string> = {
  accent: 'border-cf-accent bg-cf-accent-soft text-cf-accent',
  info: 'border-cf-info bg-cf-info-soft text-cf-info',
  neutral: 'border-cf-border-control text-cf-ink-muted',
  danger: 'border-cf-danger bg-cf-danger-soft text-cf-danger',
};

/** A status is a colour, a word and a glyph at once, never a colour alone. */
const AlertIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
    className="shrink-0"
  >
    <path d="M12 4.5 2.5 20h19z" />
    <path d="M12 10v4M12 17.5v.01" />
  </svg>
);

export const StatusPill: FC<{
  tone?: StatusTone;
  icon?: 'check' | 'clock' | 'alert' | 'none';
  children: ReactNode;
}> = ({ tone = 'neutral', icon = 'none', children }) => (
  <span
    className={clsx(
      'inline-flex items-center gap-[4px] rounded-full border px-[8px] py-[4px] cf-label-md',
      STATUS_TONE[tone]
    )}
  >
    {icon === 'check' && <CheckIcon />}
    {icon === 'clock' && <ClockIcon />}
    {icon === 'alert' && <AlertIcon />}
    {children}
  </span>
);

/**
 * A channel inside a product shot: the platform's assigned two-letter symbol in
 * a neutral frame, not its logo.
 *
 * The roster in the platforms scene shows the real marks, because there the
 * question a visitor is asking is "do you connect to the thing I use" and only
 * the logo answers it. Inside a product shot the question is different — it is
 * "what does this screen do" — and five brand colours in one panel answer it
 * worse than five quiet cells: they pull the eye away from the content and they
 * put four more colours next to the one colour this page reserves for action.
 *
 * The symbols come from `PLATFORM_SYMBOLS`, which the registry already assigns
 * and a test already holds unique. Nothing is redrawn or recoloured here; the
 * logo is simply not the right object at this size and in this role.
 */
export const PlatformMark: FC<{ identifier: string; className?: string }> = ({
  identifier,
  className,
}) => (
  <span
    aria-hidden
    className={clsx(
      'inline-flex h-[20px] w-[20px] shrink-0 items-center justify-center',
      'rounded-[4px] border border-cf-border-strong cf-caption text-cf-ink-muted',
      className
    )}
  >
    {PLATFORM_SYMBOLS[identifier] ?? '—'}
  </span>
);

/** A framed identifier: the one place ochre appears outside the mark. */
export const RecordId: FC<{ children: ReactNode }> = ({ children }) => (
  <span className="inline-flex shrink-0 rounded-[4px] border border-cf-signature px-[4px] py-[4px] cf-label-sm text-cf-signature">
    {children}
  </span>
);

/**
 * The frame around one product shot.
 *
 * A flat surface with a border and no shadow, exactly as a work panel is drawn:
 * the point of showing the product on a landing page is lost the moment the
 * screenshot is styled like an advertisement. Sections inside are separated by
 * hairlines and a change of surface tone rather than by nested cards.
 */
export const DemoPanel: FC<{
  label: string;
  className?: string;
  children: ReactNode;
}> = ({ label, className, children }) => (
  <div
    role="group"
    aria-label={label}
    className={clsx(
      'min-w-0 overflow-hidden rounded-[12px] border border-cf-border bg-cf-surface',
      className
    )}
  >
    {children}
  </div>
);

export const DemoRow: FC<{ className?: string; children: ReactNode }> = ({
  className,
  children,
}) => (
  <div
    className={clsx(
      'flex min-w-0 flex-wrap items-center gap-[8px] px-[16px] py-[12px] md:px-[20px]',
      className
    )}
  >
    {children}
  </div>
);

export type SceneTone = 'canvas' | 'surface' | 'subtle' | 'navigation';

const SCENE_TONE: Record<SceneTone, string> = {
  canvas: 'bg-cf-canvas border-t border-cf-border',
  surface: 'bg-cf-surface border-t border-cf-border',
  subtle: 'bg-cf-surface-subtle border-t border-cf-border',
  navigation: 'bg-cf-navigation border-t border-cf-border',
};

/**
 * One scrolling scene: one stage of the process, one product shot, one point.
 *
 * The tone changes between scenes and the change is flat — a hard edge and a
 * different surface, never a gradient — so a reader can tell where one scene
 * ends without a decorative divider being drawn for them.
 */
export const Scene: FC<{
  id: string;
  tone: SceneTone;
  labelledBy: string;
  className?: string;
  children: ReactNode;
}> = ({ id, tone, labelledBy, className, children }) => (
  <section
    id={id}
    aria-labelledby={labelledBy}
    className={clsx('scroll-mt-[64px]', SCENE_TONE[tone])}
  >
    <div
      className={clsx(
        'mx-auto w-full max-w-[1360px] px-[16px] py-[56px] md:px-[24px] md:py-[96px]',
        className
      )}
    >
      {children}
    </div>
  </section>
);

/**
 * The heading half of a scene.
 *
 * The step number is part of a real process rather than decoration, which is
 * why it is the same number the strip above uses and why it is spoken as text
 * next to the stage name instead of being a large ornamental figure.
 */
export const SceneHeading: FC<{
  id: string;
  step: string;
  stage: string;
  title: string;
  body: string;
  badge?: ReactNode;
  children?: ReactNode;
}> = ({ id, step, stage, title, body, badge, children }) => (
  <div className="min-w-0">
    <div className="flex items-center gap-[12px]">
      <span className="cf-label-sm text-cf-ink-muted">
        {step} · {stage}
      </span>
      <span aria-hidden className="h-px min-w-[16px] flex-1 bg-cf-border-strong" />
    </div>
    {badge && <div className="mt-[16px]">{badge}</div>}
    <h2
      id={id}
      className="mt-[16px] cf-heading-xl text-cf-ink [text-wrap:balance] [overflow-wrap:anywhere]"
    >
      {title}
    </h2>
    <p className="mt-[16px] max-w-[34em] cf-body-lg text-cf-ink-muted [text-wrap:pretty]">
      {body}
    </p>
    {children}
  </div>
);

/**
 * A short aside inside a scene, marked as not-yet-built.
 *
 * Dashed rather than solid, because everything else on this page is a thing the
 * product does today and the difference has to survive being skimmed.
 */
export const SoonNote: FC<{
  label: string;
  title: string;
  body: string;
}> = ({ label, title, body }) => (
  <div className="mt-[24px] rounded-[8px] border border-dashed border-cf-border-strong bg-cf-surface p-[16px] md:p-[20px]">
    <SoonBadge label={label} />
    <p className="mt-[12px] cf-label-md text-cf-ink">{title}</p>
    <p className="mt-[8px] max-w-[48em] cf-body-md text-cf-ink-muted [text-wrap:pretty]">
      {body}
    </p>
  </div>
);
