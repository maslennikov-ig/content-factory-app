'use client';

import {
  useId,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import clsx from 'clsx';
import { Button } from '@contentfactory/react/form/button';

export type DisclosureProps = {
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  triggerClassName?: string;
  contentClassName?: string;
  triggerProps?: Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    'children' | 'onClick' | 'aria-expanded' | 'aria-controls'
  >;
  regionProps?: Omit<
    HTMLAttributes<HTMLDivElement>,
    'children' | 'hidden' | 'role' | 'aria-labelledby'
  >;
};

const ChevronIcon = ({ open }: { open: boolean }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
    className={clsx(
      'shrink-0 text-cf-ink-muted transition-transform duration-state motion-reduce:transition-none',
      open && 'rotate-180'
    )}
  >
    <path d="M6 9l6 6 6-6" />
  </svg>
);

/** One accessible show/hide row. It does not coordinate neighbouring rows. */
export function Disclosure({
  summary,
  children,
  defaultOpen = false,
  className,
  triggerClassName,
  contentClassName,
  triggerProps,
  regionProps,
}: DisclosureProps) {
  const [open, setOpen] = useState(defaultOpen);
  const generated = useId();
  const triggerId = `${generated}-trigger`;
  const contentId = `${generated}-content`;

  return (
    <div className={className}>
      <Button
        {...triggerProps}
        type="button"
        variant="quiet"
        layout="content"
        id={triggerId}
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((current) => !current)}
        className={clsx(
          'w-full justify-start gap-[12px] text-start',
          triggerClassName
        )}
      >
        <span className="min-w-0 flex-1 [text-wrap:pretty]">{summary}</span>
        <ChevronIcon open={open} />
      </Button>
      <div
        {...regionProps}
        id={contentId}
        role="region"
        aria-labelledby={triggerId}
        hidden={!open}
        className={contentClassName}
      >
        {children}
      </div>
    </div>
  );
}

export default Disclosure;
