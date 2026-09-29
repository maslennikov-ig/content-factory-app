'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { Button } from '@contentfactory/react/form/button';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { useInterfaceLanguage } from '@contentfactory/react/translation/use-interface-language';
import { Progress } from '@contentfactory/frontend/components/ui/progress';
import { OAuthAuthorizeSurface } from './oauth-authorize.surface';
import { readConsentAnswer, type McpConsent } from './mcp-consent.answer';

/** The request an assistant sends (`content-factory-next-kcxz.26`), forwarded as it came. */
const MCP_PARAMS = [
  'client_id',
  'redirect_uri',
  'response_type',
  'code_challenge',
  'code_challenge_method',
  'resource',
  'scope',
  'state',
] as const;

/**
 * Consent for an external assistant over MCP: who asks, where the answer
 * goes, and in which workspace it will act as the person. The server checks
 * the request on both steps; this page only shows and forwards it.
 */
export function McpConsent({ searchParams }: { searchParams: URLSearchParams }) {
  const fetch = useFetch();
  const t = useT();
  const locale = useInterfaceLanguage().startsWith('ru') ? 'ru' : 'en';
  const [consent, setConsent] = useState<McpConsent | null>(null);
  const [refused, setRefused] = useState<{ redirect: string; redirectHost: string } | null>(null);
  const [failed, setFailed] = useState(false);
  // Allow after the session moved to another workspace (review W5-26 R4).
  const [workspaceChanged, setWorkspaceChanged] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const request = useMemo(() => {
    const picked: Record<string, string> = {};
    for (const key of MCP_PARAMS) {
      const value = searchParams.get(key);
      if (value !== null) picked[key] = value;
    }
    return picked;
  }, [searchParams]);

  useEffect(() => {
    let live = true;
    fetch(`/oauth/mcp/authorize?${new URLSearchParams(request)}`)
      .then(async (response) => ({ ok: response.ok, body: await response.json() }))
      .then(({ ok, body }) => {
        if (!live) return;
        // Shown, never followed on its own (review W5-26 F2).
        const answer = readConsentAnswer(ok, body);
        if (answer.kind === 'consent') setConsent(answer.consent);
        else if (answer.kind === 'refused') setRefused(answer);
        else setFailed(true);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [request]);

  const decide = useCallback(
    async (action: 'approve' | 'deny') => {
      setSubmitting(true);
      try {
        const response = await fetch('/oauth/mcp/authorize', {
          method: 'POST',
          // The workspace the person saw; the server refuses another (F5).
          body: JSON.stringify({ ...request, action, workspace_id: consent?.workspace.id }),
        });
        const body = await response.json();
        if (response.ok && body?.redirect) {
          window.location.href = body.redirect;
          return;
        }
        if (body?.error === 'workspace_changed') setWorkspaceChanged(true);
        else setFailed(true);
      } catch {
        setFailed(true);
      }
      setSubmitting(false);
    },
    [request, consent]
  );

  if (refused) {
    const text = t(
      'mcp_consent_refused',
      'This connection request cannot be accepted. You can return to {{host}} and try connecting again.',
      { host: refused.redirectHost, interpolation: { escapeValue: false } }
    );
    return (
      <OAuthAuthorizeSurface state="error" locale={locale} description={text}>
        <a className="cf-body-sm text-cf-accent underline" href={refused.redirect} rel="noreferrer">
          {t('mcp_consent_return_to', 'Return to {{host}}', {
            host: refused.redirectHost,
            interpolation: { escapeValue: false },
          })}
        </a>
      </OAuthAuthorizeSurface>
    );
  }

  if (workspaceChanged) {
    const text = t(
      'mcp_consent_workspace_changed',
      'The workspace was switched in another tab while this page was open. Start connecting again from your assistant to connect it to the workspace you want.'
    );
    return (
      <OAuthAuthorizeSurface state="error" locale={locale} description={text}>
        <p className="cf-body-sm text-cf-ink-muted" role="alert">
          {text}
        </p>
      </OAuthAuthorizeSurface>
    );
  }

  if (failed) {
    const text = t(
      'mcp_consent_invalid',
      'This connection request is not valid. Start connecting again from your assistant.'
    );
    return (
      <OAuthAuthorizeSurface state="error" locale={locale} description={text}>
        <p className="cf-body-sm text-cf-danger" role="alert">
          {t('oauth_authorize_error_title', 'Authorization Error')}
        </p>
      </OAuthAuthorizeSurface>
    );
  }

  if (!consent) {
    return (
      <OAuthAuthorizeSurface
        state="loading"
        locale={locale}
        description={t('oauth_authorize_please_wait', 'Please wait...')}
      >
        <Progress mode="indeterminate" label={t('oauth_authorize_please_wait', 'Please wait...')} />
      </OAuthAuthorizeSurface>
    );
  }

  return (
    <OAuthAuthorizeSurface
      state={submitting ? 'disabled' : 'default'}
      locale={locale}
      appName={consent.client.name}
      description={t(
        'mcp_consent_returns_to',
        'After your answer you return to {{host}}.',
        { host: consent.redirectHost, interpolation: { escapeValue: false } }
      )}
    >
      <p className="cf-body-md">
        {t('mcp_consent_workspace', 'Workspace: {{name}}', {
          name: consent.workspace.name,
          interpolation: { escapeValue: false },
        })}
      </p>
      <ul className="cf-body-sm flex list-disc flex-col gap-[4px] ps-[20px] text-cf-ink-muted">
        <li>
          {t(
            'mcp_consent_acts_as_you',
            'The assistant will act as you in this workspace, within your role.'
          )}
        </li>
        <li>
          {t(
            'mcp_consent_allowance',
            'Paid AI steps it runs count against the workspace allowance.'
          )}
        </li>
        <li>
          {t(
            'mcp_consent_stays_here',
            'Deleting, connecting channels, publishing right away and AI keys stay in Content Factory.'
          )}
        </li>
      </ul>
      <div className="flex gap-[12px]">
        <Button className="flex-1" disabled={submitting} onClick={() => decide('approve')}>
          {t('mcp_consent_allow', 'Allow')}
        </Button>
        <Button
          className="flex-1"
          variant="secondary"
          disabled={submitting}
          onClick={() => decide('deny')}
        >
          {t('oauth_authorize_deny', 'Deny')}
        </Button>
      </div>
    </OAuthAuthorizeSurface>
  );
}
