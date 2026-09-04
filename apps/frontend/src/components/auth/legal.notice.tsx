'use client';

import { useVariables } from '@contentfactory/react/helpers/variable.context';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { resolveLegalLinks } from './legal-links';

/**
 * The notice at the point of collection.
 *
 * Registration writes an email, a bcrypt hash of the password and the caller's
 * IP address to the database before anyone approves anything — approval, where
 * an operator switched it on, closes access rather than collection. So the
 * person filling the form has to be told what is being stored and where to read
 * the rest, on the form itself and not only in a document they may never open.
 *
 * What the notice does not say any more is that the account waits for an
 * administrator. This form cannot know whether approval is switched on at all,
 * and for an invited registration it certainly is not
 * (`content-factory-next-fn33.40`).
 *
 * Links come from `NEXT_PUBLIC_TERMS_URL` and `NEXT_PUBLIC_PRIVACY_URL` when an
 * operator publishes their own; otherwise from the product's own pages. See
 * [legal-links](./legal-links.ts) for why the empty variable no longer hides
 * the notice.
 */
export const LegalNotice = ({ invited = false }: { invited?: boolean }) => {
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
        'Registration stores your email address, a hash of your password and the IP address you register from.'
      )}{' '}
      {/* `content-factory-next-fn33.40`: an invitation is already the
          administrator's decision, so the invited branch used to promise a wait
          for approval that never comes — the account is switched on and inside
          the workspace the moment the password is set. */}
      {invited &&
        t(
          'registration_invited_no_approval',
          'You join the workspace as soon as the password is set: there is nothing to wait for.'
        )}
    </p>
  );
};
