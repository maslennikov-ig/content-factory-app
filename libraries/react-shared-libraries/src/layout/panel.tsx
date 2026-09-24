import { FC, HTMLAttributes, ReactNode } from 'react';
import { clsx } from 'clsx';

export type PanelContentPadding = 'default' | 'compact' | 'snug' | 'roomy' | 'none';

const CONTENT_PADDING: Record<PanelContentPadding, string> = {
  default: 'p-[20px]',
  compact: 'p-[12px]',
  /**
   * The lower end of the panel range in `DESIGN.md` (16–24px): a card in a
   * working column — a question, a note, a list row. The hand-written cards
   * the consistency audit counted (`97dq.76`, §7.1) were mostly this one, and
   * without it they could not move here without changing size.
   */
  snug: 'p-[16px]',
  /**
   * The upper end of the panel range in `DESIGN.md` (16–24px), for a surface
   * that is a page of settings rather than a card in a list. It exists so the
   * settings tab can stop hand-typing `p-[24px]` once per component: four of
   * them carried the same border, radius, surface and padding written out in
   * full, and the fifth — the AI section — carried none of it at all.
   */
  roomy: 'p-[24px]',
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
  /**
   * The element the panel is. A card that is a list item, a form or an
   * article keeps that meaning (`97dq.76`): the shape is shared, the role
   * is the call site's.
   */
  as?: 'div' | 'section' | 'article' | 'li' | 'form' | 'aside';
} & Omit<HTMLAttributes<HTMLElement>, 'title' | 'children' | 'className'> & {
    /** For `as="form"`. */
    noValidate?: boolean;
  };

/**
 * Flat content surface. Its border and spacing establish a section without
 * creating the nested-card hierarchy that obscures dense work screens.
 *
 * Attributes other than the panel's own (`data-*`, `role`, `aria-*`, `id`,
 * handlers such as `onSubmit`) land on the outer element, the same one that
 * carries the border — so a card keeps its test hooks and its landmark when
 * it moves onto the panel.
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
  ...rest
}) => {
  const Tag = as;

  return (
    <Tag
      {...rest}
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
