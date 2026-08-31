'use client';

import { FC } from 'react';
import clsx from 'clsx';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';

/**
 * The AGPL-3.0 section 13 source offer, as a link a person can actually find.
 *
 * The licence owes the Corresponding Source to anyone who uses this deployment
 * over a network, which is why the link sits in the two places a person would
 * look for a licence — the public footer beside AGPL-3.0, reachable with no
 * account at all, and Settings → About once signed in, next to the version it
 * is the source of — rather than only in the billing FAQ.
 *
 * It is deliberately not in the navigation rail or on the sign-in screen. An
 * obligation that has to be *findable* is not the same as one that has to be
 * *loud*, and a permanent row beside the product's own destinations was the
 * second.
 *
 * It leaves the interface for `/public/source` on the API, which is served
 * without a session on purpose: a stranger who never signs in is exactly the
 * person the obligation is about.
 */
export const sourceHref = (backendUrl: string) =>
  `${(backendUrl || '').replace(/\/+$/, '')}/public/source`;

const SourceIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
    <path
      d="M6.5 5 2 9l4.5 4M11.5 5 16 9l-4.5 4"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const SourceLink: FC<{ isIcon?: boolean; className?: string }> = ({
  isIcon,
  className,
}) => {
  const { backendUrl } = useVariables();
  const t = useT();
  const label = t('source_code', 'Source');
  const hint = t(
    'source_code_hint',
    'Download the source of this exact version (AGPL-3.0)'
  );

  // Without a backend address there is nothing to point at, and a link that
  // resolves to the wrong host is worse than none.
  if (!backendUrl) return null;

  return (
    <a
      href={sourceHref(backendUrl)}
      target="_blank"
      rel="noreferrer"
      aria-label={isIcon ? label : undefined}
      title={hint}
      className={clsx('flex items-center gap-[8px]', className)}
    >
      <SourceIcon />
      {!isIcon && <span className="cf-nav-label truncate">{label}</span>}
    </a>
  );
};
