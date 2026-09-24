'use client';

import { forwardRef, type ComponentProps } from 'react';
import clsx from 'clsx';
import { TabPanel } from '@contentfactory/react/choice/tabs';
import { useEnterMotion } from './enter-motion';

/**
 * The underline tab strip of a section (`content-factory-next-97dq.76`, audit
 * §2.4 and §2.5).
 *
 * Content, analytics, the piece page and the mobile channel page each drew
 * their own: accent or ink for the chosen tab, 8 or 12px under the label,
 * with or without `duration-state`, and one with no underline at all. This is
 * the content section's strip, which the audit named the reference, stated
 * once. `compact` is the piece page's variant — a scrolling row of up to a
 * dozen channels — with the same colours and motion and tighter padding.
 *
 * The hit area follows `Button`: a transparent `::before` reaching 2px past
 * the 40px body below `md`, so a tab is 44px under a thumb without a wrapper.
 */
export const sectionTabClass = (
  selected: boolean,
  { compact = false }: { compact?: boolean } = {}
) =>
  clsx(
    'relative inline-flex items-center border-b-2 cf-label-md transition-colors duration-state motion-reduce:transition-none',
    "before:absolute before:inset-x-0 before:-inset-y-0.5 before:content-[''] md:before:inset-0",
    compact
      ? 'gap-[8px] whitespace-nowrap px-[12px] pb-[8px] pt-[4px]'
      : 'pb-[12px]',
    selected
      ? 'border-cf-accent text-cf-accent'
      : 'border-transparent text-cf-ink-muted hover:text-cf-ink'
  );

/** The list the tabs sit in: 24px apart, wrapping on a narrow screen. */
export const SECTION_TAB_LIST_CLASS = 'flex flex-wrap gap-x-[24px] gap-y-[4px]';

/**
 * A tab panel that enters with `cf-tab-enter` (150ms, off under reduced
 * motion) when the chosen tab changes. The first render does not animate.
 */
export const SectionTabPanel = forwardRef<
  HTMLDivElement,
  ComponentProps<typeof TabPanel>
>(({ value, ...props }, forwarded) => {
  const motion = useEnterMotion<HTMLDivElement>(value, 'cf-tab-enter');
  return (
    <TabPanel
      {...props}
      value={value}
      ref={(node) => {
        motion.current = node;
        if (typeof forwarded === 'function') forwarded(node);
        else if (forwarded) forwarded.current = node;
      }}
    />
  );
});
SectionTabPanel.displayName = 'SectionTabPanel';
