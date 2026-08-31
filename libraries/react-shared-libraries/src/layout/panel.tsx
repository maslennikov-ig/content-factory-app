import { FC, ReactNode } from 'react';
import { clsx } from 'clsx';

export type PanelContentPadding = 'default' | 'compact' | 'none';

const CONTENT_PADDING: Record<PanelContentPadding, string> = {
  default: 'p-[20px]',
  compact: 'p-[12px]',
  none: '',
};

export type PanelProps = {
  children: ReactNode;
  className?: string;
  /** Additional non-padding classes for the panel body. */
  contentClassName?: string;
  contentPadding?: PanelContentPadding;
  /** Section heading rendered inside the panel's own header row. */
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  as?: 'div' | 'section';
};

/**
 * Flat content surface. Its border and spacing establish a section without
 * creating the nested-card hierarchy that obscures dense work screens.
 */
export const Panel: FC<PanelProps> = ({
  children,
  className,
  contentClassName,
  contentPadding = 'default',
  title,
  description,
  actions,
  as = 'section',
}) => {
  const Tag = as;

  return (
    <Tag
      className={clsx(
        'bg-cf-surface border border-cf-border rounded-[8px]',
        className
      )}
    >
      {(title || actions || description) && (
        <header className="flex flex-wrap items-start gap-[12px] px-[20px] pt-[16px] pb-[12px] border-b border-cf-border">
          <div className="flex-1 min-w-0">
            {title && <h3 className="cf-heading-md text-cf-ink">{title}</h3>}
            {description && (
              <p className="mt-[4px] cf-body-sm text-cf-ink-muted max-w-[70ch] [text-wrap:pretty]">
                {description}
              </p>
            )}
          </div>
          {actions && (
            <div className="flex items-center gap-[8px]">{actions}</div>
          )}
        </header>
      )}
      <div className={clsx(CONTENT_PADDING[contentPadding], contentClassName)}>
        {children}
      </div>
    </Tag>
  );
};
