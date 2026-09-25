'use client';

import Link from 'next/link';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import {
  MIN_CORPUS_CHARS,
  MIN_CORPUS_SAMPLES,
} from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';

/**
 * What someone sees after registering on an instance that approves accounts by
 * hand. There is deliberately nothing to click that would speed it up: the
 * whole point of the mode is that the next step belongs to a person.
 *
 * Every sentence here is a fact the code keeps (2q28.9):
 * - approval sends `email_account_approved_*` (`UsersService.approveAccount`),
 *   so the page may say a letter follows; the mail path can be switched off on
 *   an instance without mail, which is why signing in stays one click away;
 * - the waiting time is a habit of the owner, not a guarantee, so no SLA;
 * - the avatar floor is read off the brand-voice contract, not retyped — the
 *   «2–3 texts» a person might expect is below what the own-texts path accepts.
 */
export function PendingApproval() {
  const t = useT();

  return (
    <div className="flex flex-col gap-[24px]">
      <div>
        <h1 className="cf-heading-lg text-cf-ink [text-wrap:balance]">
          {t('registration_received', 'Registration received')}
        </h1>
        <p className="mt-[8px] cf-body-md text-cf-ink-muted text-pretty">
          {t(
            'pending_next_step',
            'The service owner will review your account, usually within a few hours. Once it is approved, we will email you.'
          )}
        </p>
      </div>

      <section
        aria-labelledby="pending-meanwhile-title"
        className="rounded-[8px] border border-cf-border bg-cf-surface-subtle p-[16px]"
      >
        <h2
          id="pending-meanwhile-title"
          className="cf-label-md text-cf-ink"
        >
          {t('pending_meanwhile_title', 'While you wait')}
        </h2>
        <ul className="mt-[8px] flex list-disc flex-col gap-[8px] ps-[20px] cf-body-sm text-cf-ink text-pretty">
          <li>
            {t(
              'pending_meanwhile_channel',
              'Set up the Telegram channel your posts will go to.'
            )}
          </li>
          <li>
            {t(
              'pending_meanwhile_texts',
              'Gather your past posts or articles: the avatar, your voice in posts, is built from them. It needs at least {{chars, number}} characters across at least {{samples}} texts.',
              { chars: MIN_CORPUS_CHARS, samples: MIN_CORPUS_SAMPLES }
            )}
          </li>
        </ul>
      </section>

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
