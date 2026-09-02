'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { canOfferNewsletterConsent } from '@contentfactory/helpers/auth/newsletter.consent';
import { Input } from '@contentfactory/react/form/input';
import { Button } from '@contentfactory/react/form/button';
import { CheckboxField } from '@contentfactory/react/form/checkbox.field';
import { LegalNotice } from '@contentfactory/frontend/components/auth/legal.notice';
import { usePublicCopy } from './public-copy';
import { usePublicTelemetry } from './public-telemetry';
import { useVariables } from '@contentfactory/react/helpers/variable.context';

export function EmailFirstSignup() {
  const copy = usePublicCopy();
  const { language } = useVariables();
  const fetchData = useFetch();
  const router = useRouter();
  const track = usePublicTelemetry();
  const [email, setEmail] = useState('');
  const [continued, setContinued] = useState(false);
  const [password, setPassword] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [subscribeToNewsletter, setSubscribeToNewsletter] = useState(false);
  const canSubscribe = canOfferNewsletterConsent({
    provider: 'LOCAL',
    email,
  });

  const continueWithEmail = (event: FormEvent) => {
    event.preventDefault();
    if (email.trim()) {
      void track('signup_started');
      setContinued(true);
    }
  };

  const register = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(false);
    const normalizedWorkspace = workspaceName.trim();
    try {
      const response = await fetchData('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim(),
          password,
          provider: 'LOCAL',
          providerToken: '',
          ...(normalizedWorkspace
            ? {
                workspaceName: normalizedWorkspace,
                company: normalizedWorkspace,
              }
            : {}),
          ...(canSubscribe
            ? { subscribeToNewsletter }
            : { subscribeToNewsletter: false }),
          ...(language ? { language } : {}),
        }),
      });
      if (response.status !== 200) {
        setError(true);
        return;
      }
      const approvalFromHeader = response.headers.get('approval') === 'true';
      let approvalFromBody = false;
      if (
        !approvalFromHeader &&
        response.headers.get('content-type')?.includes('application/json')
      ) {
        try {
          const payload = (await response.clone().json()) as {
            approval?: unknown;
          };
          approvalFromBody = payload.approval === true;
        } catch {
          approvalFromBody = false;
        }
      }
      router.push(
        approvalFromHeader || approvalFromBody
          ? '/auth/pending'
          : response.headers.get('activate') === 'true'
          ? '/auth/activate'
          : '/launches'
      );
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section
      className="rounded-[12px] border border-cf-border bg-cf-surface p-[20px]"
      aria-labelledby="email-first-title"
    >
      <h2 id="email-first-title" className="cf-heading-md">
        {copy('emailTitle')}
      </h2>
      <p className="mt-[8px] cf-body-sm text-cf-ink-muted text-pretty">
        {copy('emailBody')}
      </p>
      {!continued ? (
        <form
          onSubmit={continueWithEmail}
          className="mt-[16px] flex flex-col gap-[12px] sm:flex-row sm:items-start"
        >
          <Input
            standalone
            fieldClassName="flex-1"
            label={copy('emailLabel')}
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <Button type="submit" className="sm:mt-[24px]">
            {copy('emailContinue')}
          </Button>
        </form>
      ) : (
        <form onSubmit={register} className="mt-[16px] grid gap-[12px]">
          <Input
            standalone
            label={copy('emailLabel')}
            type="email"
            autoComplete="email"
            required
            readOnly
            value={email}
          />
          <Input
            standalone
            label={copy('passwordLabel')}
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <Input
            standalone
            label={copy('workspaceOptional')}
            type="text"
            autoComplete="organization"
            value={workspaceName}
            onChange={(event) => setWorkspaceName(event.target.value)}
          />
          {canSubscribe && (
            <CheckboxField
              checked={subscribeToNewsletter}
              onChange={(event) =>
                setSubscribeToNewsletter(event.currentTarget.checked)
              }
              label={copy('newsletterConsent')}
            />
          )}
          {/* The notice no longer depends on a deployment variable: the
              product publishes its own /terms and /privacy, so there is
              always something to link to. */}
          <LegalNotice />
          <Link
            href="/auth"
            className="cf-body-sm text-cf-accent underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cf-focus"
          >
            {copy('authOptions')}
          </Link>
          {error && (
            <p role="alert" className="cf-body-sm text-cf-danger">
              {copy('registrationError')}
            </p>
          )}
          <Button type="submit" loading={loading}>
            {copy('createAccount')}
          </Button>
        </form>
      )}
    </section>
  );
}
