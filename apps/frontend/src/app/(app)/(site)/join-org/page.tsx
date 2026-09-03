'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { Button } from '@contentfactory/react/form/button';
import { PageHeader, PageShell, Panel } from '@contentfactory/react/layout';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';

type InvitationRole = 'USER' | 'EDITOR' | 'ADMIN';

type InvitationPreview = {
  workspaceName: string;
  inviterName: string;
  inviterEmail: string;
  role: InvitationRole;
};

type InvitationSuccess = Pick<InvitationPreview, 'workspaceName' | 'role'>;

const invitationErrorCode = async (response: Response) => {
  const body = await response
    .json()
    .catch(() => null as { code?: string } | null);
  return body?.code || 'invite_unknown';
};

export default function JoinOrganizationPage() {
  const t = useT();
  const fetch = useFetch();
  const router = useRouter();
  const token = useSearchParams().get('org') || '';
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [success, setSuccess] = useState<InvitationSuccess | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [declined, setDeclined] = useState(false);

  const roleLabel = useCallback(
    (role: InvitationRole) => {
      if (role === 'ADMIN') return t('admin', 'Admin');
      if (role === 'EDITOR') return t('role_editor', 'Editor');
      return t('user', 'User');
    },
    [t]
  );

  const loadPreview = useCallback(async () => {
    setLoading(true);
    setError('');
    if (!token) {
      setError('invite_invalid');
      setLoading(false);
      return;
    }

    try {
      const query = new URLSearchParams({ org: token });
      const response = await fetch(`/user/join-org?${query}`);
      if (!response.ok) {
        setError(await invitationErrorCode(response));
        return;
      }
      setPreview((await response.json()) as InvitationPreview);
    } catch {
      setError('invite_unknown');
    } finally {
      setLoading(false);
    }
  }, [fetch, token]);

  useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

  const accept = useCallback(async () => {
    setAccepting(true);
    setError('');
    try {
      const response = await fetch('/user/join-org', {
        method: 'POST',
        body: JSON.stringify({ org: token }),
      });
      if (!response.ok) {
        setError(await invitationErrorCode(response));
        return;
      }
      const result = (await response.json()) as InvitationSuccess;
      setSuccess({
        workspaceName: result.workspaceName,
        role: result.role,
      });
    } catch {
      setError('invite_unknown');
    } finally {
      setAccepting(false);
    }
  }, [fetch, token]);

  const errorMessage = useMemo(() => {
    if (error === 'invite_email_mismatch') {
      return t(
        'team_invitation_error_email',
        'This invitation belongs to another email address. Sign in with the invited address.'
      );
    }
    if (error === 'invite_used') {
      return t(
        'team_invitation_error_used',
        'This invitation has already been used. Ask the workspace administrator for a new one.'
      );
    }
    if (error === 'invite_invalid') {
      return t(
        'team_invitation_error_invalid',
        'This invitation is invalid or has expired. Ask the workspace administrator for a new one.'
      );
    }
    return t(
      'team_invitation_error_generic',
      'The invitation could not be checked. Try again.'
    );
  }, [error, t]);

  return (
    <PageShell className="items-center justify-center bg-cf-canvas px-[16px] py-[32px] sm:px-[24px]">
      <div className="flex w-full max-w-[560px] flex-col gap-[16px]">
        <PageHeader
          headingLevel={1}
          title={t('team_invitation_title', 'Workspace invitation')}
          description={t(
            'team_invitation_description',
            'Review who invited you and the access you will receive before joining.'
          )}
        />

        <Panel contentClassName="flex flex-col gap-[20px]">
          {loading && (
            <p role="status" className="cf-body-md text-cf-ink-muted">
              {t('loading', 'Loading')}
            </p>
          )}

          {!loading && success && (
            <div role="status" aria-live="polite" className="flex flex-col gap-[16px]">
              <div className="rounded-[8px] border border-cf-accent bg-cf-accent-soft p-[16px]">
                <h2 className="cf-heading-md text-cf-accent [text-wrap:balance]">
                  {t('team_invitation_success_title', 'Invitation accepted')}
                </h2>
                <p className="mt-[4px] cf-body-md text-cf-ink [text-wrap:pretty]">
                  {t(
                    'team_invitation_success_body',
                    'You are now in “{{workspace}}” as {{role}}.',
                    {
                      workspace: success.workspaceName,
                      role: roleLabel(success.role),
                    }
                  )}
                </p>
              </div>
              <Button onClick={() => router.push('/')}>
                {t('continue', 'Continue')}
              </Button>
            </div>
          )}

          {!loading && declined && !success && (
            <div role="status" aria-live="polite" className="flex flex-col gap-[16px]">
              <div className="rounded-[8px] border border-cf-border bg-cf-surface-subtle p-[16px]">
                <h2 className="cf-heading-md text-cf-ink [text-wrap:balance]">
                  {t('team_invitation_declined_title', 'Invitation declined')}
                </h2>
                <p className="mt-[4px] cf-body-md text-cf-ink-muted [text-wrap:pretty]">
                  {t(
                    'team_invitation_declined_body',
                    'You were not added to the workspace.'
                  )}
                </p>
              </div>
              <Button variant="secondary" onClick={() => router.push('/')}>
                {t('continue', 'Continue')}
              </Button>
            </div>
          )}

          {!loading && error && !success && !declined && (
            <div role="alert" className="flex flex-col gap-[16px]">
              <div className="rounded-[8px] border border-cf-danger bg-cf-danger-soft p-[16px]">
                <h2 className="cf-label-md text-cf-danger">
                  {t('team_invitation_error_title', 'Invitation unavailable')}
                </h2>
                <p className="mt-[4px] cf-body-sm text-cf-ink [text-wrap:pretty]">
                  {errorMessage}
                </p>
              </div>
              {error === 'invite_unknown' && (
                <Button variant="secondary" onClick={() => void loadPreview()}>
                  {t('try_again', 'Try Again')}
                </Button>
              )}
            </div>
          )}

          {!loading && preview && !success && !declined && !error && (
            <div className="flex flex-col gap-[20px]">
              <dl className="grid grid-cols-[minmax(0,1fr)] gap-[12px] sm:grid-cols-[160px_minmax(0,1fr)]">
                <dt className="cf-label-sm text-cf-ink-muted">
                  {t('team_invitation_workspace', 'Workspace')}
                </dt>
                <dd className="cf-body-md text-cf-ink [overflow-wrap:anywhere]">
                  {preview.workspaceName}
                </dd>
                <dt className="cf-label-sm text-cf-ink-muted">
                  {t('team_invitation_role', 'Role')}
                </dt>
                <dd className="cf-body-md text-cf-ink">
                  {roleLabel(preview.role)}
                </dd>
                <dt className="cf-label-sm text-cf-ink-muted">
                  {t('team_invitation_inviter', 'Invited by')}
                </dt>
                <dd className="cf-body-md text-cf-ink [overflow-wrap:anywhere]">
                  {preview.inviterName} · {preview.inviterEmail}
                </dd>
              </dl>
              <div className="flex flex-col-reverse gap-[8px] sm:flex-row sm:justify-end">
                <Button
                  variant="secondary"
                  disabled={accepting}
                  onClick={() => setDeclined(true)}
                >
                  {t('team_invitation_decline', 'Decline')}
                </Button>
                <Button
                  loading={accepting}
                  loadingLabel={t(
                    'team_invitation_accept',
                    'Accept invitation'
                  )}
                  onClick={() => void accept()}
                >
                  {t('team_invitation_accept', 'Accept invitation')}
                </Button>
              </div>
            </div>
          )}
        </Panel>
      </div>
    </PageShell>
  );
}
