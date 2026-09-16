import { FC, ReactNode } from 'react';
import { clsx } from 'clsx';

export type PageHeaderProps = {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  headingLevel?: 1 | 2;
};

/**
 * The page-level title band keeps title, context, and actions aligned while
 * allowing actions to wrap below the title on constrained widths.
 */
export const PageHeader: FC<PageHeaderProps> = ({
  title,
  description,
  actions,
  className,
  headingLevel = 2,
}) => {
  const Heading = headingLevel === 1 ? 'h1' : 'h2';

  return (
    <div
      className={clsx(
        'flex flex-wrap items-start justify-between gap-[12px]',
        className
      )}
    >
      {(title || description) && (
        <div className="min-w-0">
          {title && (
            <Heading className="cf-heading-lg text-cf-ink text-balance">
              {title}
            </Heading>
          )}
          {description && (
            <p
              className={clsx(
                'cf-body-sm text-cf-ink-muted max-w-[70ch] [text-wrap:pretty]',
                title && 'mt-[4px]'
              )}
            >
              {description}
            </p>
          )}
        </div>
      )}
      {actions && (
        <div className="flex items-center gap-[8px] shrink-0">{actions}</div>
      )}
    </div>
  );
};
