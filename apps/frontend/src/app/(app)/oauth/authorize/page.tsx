'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { Logo } from '@contentfactory/frontend/components/new-layout/logo';
import { Button } from '@contentfactory/react/form/button';
import { OAuthAuthorizeSurface } from './oauth-authorize.surface';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { useInterfaceLanguage } from '@contentfactory/react/translation/use-interface-language';

type OAuthErrorCode = 'missing_params' | 'unsupported_type' | 'invalid' | 'validate_failed' | 'process_failed';

export default function OAuthAuthorizePage() {
  const searchParams = useSearchParams();
  const fetch = useFetch();
  const t = useT();
  const surfaceLocale = useInterfaceLanguage().startsWith('ru') ? 'ru' : 'en';
  const [appInfo, setAppInfo] = useState<any>(null);
  const [error, setError] = useState<OAuthErrorCode | ''>('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const clientId = searchParams.get('client_id');
  const responseType = searchParams.get('response_type');
  const state = searchParams.get('state');

  useEffect(() => {
    if (!clientId || !responseType) {
      setError('missing_params');
      setLoading(false);
      return;
    }
    if (responseType !== 'code') {
      setError('unsupported_type');
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
          // The server message is English; the person sees our own words.
          setError('invalid');
        } else {
          setAppInfo(data);
        }
        setLoading(false);
      })
      .catch(() => {
        setError('validate_failed');
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
        setError('process_failed');
        setSubmitting(false);
      }
    },
    [clientId, state]
  );

  const errorText = (code: OAuthErrorCode) => {
    switch (code) {
      case 'missing_params':
        return t(
          'oauth_authorize_missing_params',
          'Missing required parameters (client_id, response_type)'
        );
      case 'unsupported_type':
        return t(
          'oauth_authorize_unsupported_type',
          'Only response_type=code is supported'
        );
      case 'invalid':
        return t('oauth_authorize_invalid_request', 'Invalid OAuth request');
      case 'validate_failed':
        return t(
          'oauth_authorize_validate_failed',
          'Failed to validate OAuth request'
        );
      case 'process_failed':
        return t(
          'oauth_authorize_process_failed',
          'Failed to process authorization'
        );
    }
  };

  if (loading) {
    return (
      <OAuthAuthorizeSurface
        state="loading"
        locale={surfaceLocale}
        description={t('oauth_authorize_please_wait', 'Please wait...')}
      >
        <div className="text-center">
          <div className="flex justify-center mb-[24px]">
            <Logo />
          </div>
          <div className="text-[16px] text-cf-ink-muted">
            {t('oauth_authorize_please_wait', 'Please wait...')}
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
      <OAuthAuthorizeSurface
        state="error"
        locale={surfaceLocale}
        description={errorText(error)}
      >
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
            {t('oauth_authorize_error_title', 'Authorization Error')}
          </div>
          <div className="text-[16px] text-cf-ink-muted max-w-[400px]">
            {errorText(error)}
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
      locale={surfaceLocale}
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
              {t(
                'oauth_authorize_requesting_access',
                'This application is requesting access to your Content Factory account. It will be able to:'
              )}
            </div>
            <ul className="text-[14px] list-disc list-inside space-y-[4px]">
              <li>
                {t(
                  'oauth_authorize_scope_channels',
                  'Access your integrations and channels'
                )}
              </li>
              <li>
                {t(
                  'oauth_authorize_scope_posts',
                  'Create and schedule posts on your behalf'
                )}
              </li>
              <li>
                {t('oauth_authorize_scope_analytics', 'Read your post analytics')}
              </li>
            </ul>
          </div>

          <div className="flex gap-[12px]">
            <Button
              onClick={() => handleAction('approve')}
              disabled={submitting}
              className="flex-1 disabled:opacity-50 rounded-cf py-[10px] px-[16px] text-[14px] font-semibold transition-colors"
            >
              {t('oauth_authorize_approve', 'Authorize')}
            </Button>
            <Button variant="secondary"
              onClick={() => handleAction('deny')}
              disabled={submitting}
              className="flex-1 disabled:opacity-50 rounded-cf py-[10px] px-[16px] text-[14px] font-semibold transition-colors"
            >
              {t('oauth_authorize_deny', 'Deny')}
            </Button>
          </div>
        </div>
      </div>
    </OAuthAuthorizeSurface>
  );
}
