'use client';

import { FC } from 'react';
import { clsx } from 'clsx';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';

/**
 * Link into the product documentation.
 *
 * The base URL comes from `NEXT_PUBLIC_DOCS_URL`. Until an operator publishes
 * documentation the link renders nothing, rather than pointing somewhere that
 * does not describe this product.
 */
export const DocsLink: FC<{ path?: string; className?: string; label?: string }> = ({
  path = '',
  className,
  label,
}) => {
  const { docsUrl } = useVariables();
  const t = useT();
  if (!docsUrl) return null;

  const href = `${docsUrl.replace(/\/$/, '')}${path}`;

  return (
    <a
      className={clsx(
        'cursor-pointer px-[12px] h-[32px] border border-cf-border-control bg-cf-surface text-cf-ink hover:bg-cf-surface-subtle transition-colors duration-state rounded-[8px] text-[13px] font-[600] flex items-center gap-[6px]',
        className
      )}
      href={href}
      target="_blank"
      rel="noreferrer"
    >
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
        <polyline points="15 3 21 3 21 9" />
        <line x1="10" y1="14" x2="21" y2="3" />
      </svg>
      {label || t('read_the_docs', 'Docs')}
    </a>
  );
};
