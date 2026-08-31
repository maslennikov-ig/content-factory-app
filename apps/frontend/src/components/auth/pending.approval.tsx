'use client';

import Link from 'next/link';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';

/**
 * What someone sees after registering on an instance that approves accounts by
 * hand. There is deliberately nothing to click that would speed it up: the
 * whole point of the mode is that the next step belongs to a person.
 */
export function PendingApproval() {
  const t = useT();

  return (
    <div className="flex flex-col gap-[24px]">
      <div>
        <h1 className="cf-heading-lg text-cf-ink">
          {t('registration_received', 'Registration received')}
        </h1>
        <p className="mt-[8px] cf-body-md text-cf-ink-muted text-pretty">
          {t(
            'registration_received_subtitle',
            'Your account has been created and is waiting for an administrator to approve it.'
          )}
        </p>
      </div>

      <div
        role="status"
        className="rounded-[8px] border border-cf-border bg-cf-surface-subtle p-[16px]"
      >
        <p className="cf-body-sm text-cf-ink text-pretty">
          {t(
            'registration_received_explanation',
            'This instance does not open accounts automatically. Once it is approved you will be able to sign in with the email and password you just chose — nothing else is needed from you.'
          )}
        </p>
      </div>

      <p className="cf-body-sm text-cf-ink-muted">
        {t('already_approved', 'Already approved?')}&nbsp;
        <Link
          href="/auth/login"
          className="cf-body-sm font-[600] text-cf-accent underline"
        >
          {t('sign_in_1', 'Sign in')}
        </Link>
      </p>
    </div>
  );
}
