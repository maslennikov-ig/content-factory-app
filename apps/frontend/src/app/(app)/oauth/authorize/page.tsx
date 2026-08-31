'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { Logo } from '@contentfactory/frontend/components/new-layout/logo';
import { Button } from '@contentfactory/react/form/button';
import { OAuthAuthorizeSurface } from './oauth-authorize.surface';

export default function OAuthAuthorizePage() {
  const searchParams = useSearchParams();
  const fetch = useFetch();
  const [appInfo, setAppInfo] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const clientId = searchParams.get('client_id');
  const responseType = searchParams.get('response_type');
  const state = searchParams.get('state');

  useEffect(() => {
    if (!clientId || !responseType) {
      setError('Missing required parameters (client_id, response_type)');
      setLoading(false);
      return;
    }
    if (responseType !== 'code') {
      setError('Only response_type=code is supported');
      setLoading(false);
      return;
    }

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: responseType,
      ...(state ? { state } : {}),
    });

    fetch(`/oauth/authorize?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.statusCode && data.statusCode >= 400) {
          setError(data.message || 'Invalid OAuth request');
        } else {
          setAppInfo(data);
        }
        setLoading(false);
      })
      .catch(() => {
        setError('Failed to validate OAuth request');
        setLoading(false);
      });
  }, [clientId, responseType, state]);

  const handleAction = useCallback(
    async (action: 'approve' | 'deny') => {
      setSubmitting(true);
      try {
        const result = await (
          await fetch('/oauth/authorize', {
            method: 'POST',
            body: JSON.stringify({
              client_id: clientId,
              state,
              action,
            }),
          })
        ).json();

        if (result.redirect) {
          window.location.href = result.redirect;
        }
      } catch {
        setError('Failed to process authorization');
        setSubmitting(false);
      }
    },
    [clientId, state]
  );

  if (loading) {
    return (
      <OAuthAuthorizeSurface state="loading" description="Please wait...">
        <div className="text-center">
          <div className="flex justify-center mb-[24px]">
            <Logo />
          </div>
          <div className="text-[16px] text-cf-ink-muted">
            Please wait...
          </div>
          <div className="mt-[32px] flex justify-center">
            <div className="w-[48px] h-[48px] border-[3px] border-cf-accent border-t-transparent rounded-full animate-spin" />
          </div>
        </div>
      </OAuthAuthorizeSurface>
    );
  }

  if (error) {
    return (
      <OAuthAuthorizeSurface state="error" description={error}>
        <div className="text-center">
          <div className="flex justify-center mb-[24px]">
            <Logo />
          </div>
          <div className="w-[80px] h-[80px] mx-auto mb-[24px] rounded-full bg-cf-danger-soft flex items-center justify-center">
            <svg
              className="w-[40px] h-[40px] text-cf-danger"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div className="text-[28px] font-semibold mb-[12px]">
            Authorization Error
          </div>
          <div className="text-[16px] text-cf-ink-muted max-w-[400px]">
            {error}
          </div>
        </div>
      </OAuthAuthorizeSurface>
    );
  }

  if (!appInfo) {
    return null;
  }

  return (
    <OAuthAuthorizeSurface
      state={submitting ? 'disabled' : 'default'}
      appName={appInfo.app.name}
      description={appInfo.app.description}
    >
      <div className="w-full max-w-[500px] mx-auto px-[20px]">
        <div className="flex justify-center mb-[32px]">
          <Logo />
        </div>

        <div className="bg-cf-surface rounded-cf-lg p-[32px] flex flex-col gap-[24px]">
          <div className="flex flex-col items-center gap-[16px]">
            {appInfo.app.picture?.path ? (
              <img
                src={appInfo.app.picture.path}
                alt={appInfo.app.name}
                className="w-[64px] h-[64px] rounded-full object-cover"
              />
            ) : (
              <div className="w-[64px] h-[64px] rounded-full bg-cf-surface-subtle flex items-center justify-center text-[24px] text-cf-ink-muted">
                {appInfo.app.name?.[0]?.toUpperCase() || '?'}
              </div>
            )}
            <h2 className="text-[24px] font-semibold text-center">
              {appInfo.app.name}
            </h2>
            {appInfo.app.description && (
              <div className="text-cf-ink-muted text-center text-[14px]">
                {appInfo.app.description}
              </div>
            )}
          </div>

          <div className="border-t border-cf-border pt-[16px]">
            <div className="text-[14px] text-cf-ink-muted mb-[12px]">
              This application is requesting access to your Content Factory account. It
              will be able to:
            </div>
            <ul className="text-[14px] list-disc list-inside space-y-[4px]">
              <li>Access your integrations and channels</li>
              <li>Create and schedule posts on your behalf</li>
              <li>Read your post analytics</li>
            </ul>
          </div>

          <div className="flex gap-[12px]">
            <Button
              onClick={() => handleAction('approve')}
              disabled={submitting}
              className="flex-1 disabled:opacity-50 rounded-cf py-[10px] px-[16px] text-[14px] font-semibold transition-colors"
            >
              Authorize
            </Button>
            <Button variant="secondary"
              onClick={() => handleAction('deny')}
              disabled={submitting}
              className="flex-1 disabled:opacity-50 rounded-cf py-[10px] px-[16px] text-[14px] font-semibold transition-colors"
            >
              Deny
            </Button>
          </div>
        </div>
      </div>
    </OAuthAuthorizeSurface>
  );
}
