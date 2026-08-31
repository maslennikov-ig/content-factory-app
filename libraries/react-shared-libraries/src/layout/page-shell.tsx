import { FC, ReactNode } from 'react';
import { clsx } from 'clsx';

export type PageShellProps = {
  children: ReactNode;
  className?: string;
};

/**
 * Non-landmark page wrapper for routes already rendered inside the app shell's
 * main landmark. It owns the shared canvas, gutter, and vertical rhythm.
 */
export const PageShell: FC<PageShellProps> = ({ children, className }) => (
  <div
    className={clsx(
      'flex flex-1 flex-col gap-[16px] bg-cf-surface p-[20px]',
      className
    )}
  >
    {children}
  </div>
);
