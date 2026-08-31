'use client';

import { useVariables } from '@contentfactory/react/helpers/variable.context';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { resolveLegalLinks } from './legal-links';

/**
 * The notice at the point of collection.
 *
 * Registration writes an email, a bcrypt hash of the password and the caller's
 * IP address to the database before an administrator approves anything —
 * approval closes access, not collection. So the person filling the form has to
 * be told what is being stored and where to read the rest, on the form itself
 * and not only in a document they may never open.
 *
 * Links come from `NEXT_PUBLIC_TERMS_URL` and `NEXT_PUBLIC_PRIVACY_URL` when an
 * operator publishes their own; otherwise from the product's own pages. See
 * [legal-links](./legal-links.ts) for why the empty variable no longer hides
 * the notice.
 */
export const LegalNotice = () => {
  const t = useT();
  const { termsUrl, privacyUrl } = resolveLegalLinks(useVariables());

  const link = 'text-cf-accent underline font-[600]';

  return (
    <p className="text-[12px] leading-[1.5] text-cf-ink-muted">
      {t('by_registering_you_agree_to_our', 'By registering you agree to our')}{' '}
      <a href={termsUrl} rel="nofollow" className={link}>
        {t('terms_of_service', 'Terms of Service')}
      </a>{' '}
      {t('and', 'and')}{' '}
      <a href={privacyUrl} rel="nofollow" className={link}>
        {t('privacy_policy', 'Privacy Policy')}
      </a>
      {'. '}
      {t(
        'registration_stores_email_hash_ip',
        'Registration stores your email address, a hash of your password and the IP address you register from. The account is created immediately but does nothing until an administrator approves it.'
      )}
    </p>
  );
};
