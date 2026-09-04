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
  /** The address the invitation was sent to; absent for a copied link. */
  boundEmail?: string;
  /** The signed-in account is not the one this invitation names. */
  emailMismatch: boolean;
  /** The signed-in account is already in this workspace. */
  alreadyMember: boolean;
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
  const query = useSearchParams();
  const token = query.get('org') || '';
  /**
   * `content-factory-next-fn33.37`: the invitation was accepted by the
   * registration itself, a moment ago.
   *
   * An anonymous invitation link sends the visitor to the registration form
   * with this page as the address to come back to, and the account that form
   * creates is already inside the workspace — the token is spent by the time
   * the browser gets here. Asking about it would answer 410 and put a red
   * «Invitation unavailable» in front of somebody's first minute in the
   * product, about their own link.
   *
   * The visit still has a job: the proxy's pending-invitation cookie is
   * `httpOnly` and only it can clear it, which it does on any `/join-org`
   * request carrying the same token. Left behind, that cookie sends the next
   * visit to `/` right back to this page. So this asks nothing, lets the proxy
   * do its part, and hands the person on to their workspace.
   */
  const alreadyJoined = query.get('joined') === '1';
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [success, setSuccess] = useState<InvitationSuccess | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [declining, setDeclining] = useState(false);
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
    if (alreadyJoined) {
      // A full load, not a router transition: the workspace cookie set during
      // registration only counts once the browser asks for the page again —
      // the same reason `enterWorkspace` below leaves this way.
      window.location.assign('/');
      return;
    }
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
  }, [fetch, token, alreadyJoined]);

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

  /**
   * `content-factory-next-fn33.5`: refusing used to change nothing but this
   * component's state, and the link stayed live for the rest of its two days.
   */
  const decline = useCallback(async () => {
    setDeclining(true);
    setError('');
    try {
      const response = await fetch('/user/join-org/decline', {
        method: 'POST',
        body: JSON.stringify({ org: token }),
      });
      if (!response.ok) {
        const code = await invitationErrorCode(response);
        // A spent or expired invitation cannot be joined either, so what the
        // person asked for already holds. Saying «unavailable» here would
        // report a problem where there is none.
        if (code === 'invite_used' || code === 'invite_invalid') {
          setDeclined(true);
          return;
        }
        setError(code);
        return;
      }
      setDeclined(true);
    } catch {
      setError('invite_unknown');
    } finally {
      setDeclining(false);
    }
  }, [fetch, token]);

  /**
   * `content-factory-next-fn33.26`: «Continue» leaves through the browser,
   * not through the router.
   *
   * Accepting sets the `showorg` cookie server-side, and that cookie is what
   * makes the invited workspace the current one. A `router.push('/')` is a
   * client transition: the layout keeps the user context it already has, and
   * the workspace list behind `useSWR('organizations')` is configured never
   * to revalidate on its own (`organization.selector.tsx`). So the person
   * landed back in their old workspace with the new one missing from the
   * switcher until they reloaded by hand — which is exactly what the owner
   * hit. A full load is the only thing that makes a fresh cookie count, and
   * it is the same move `changeOrg` already makes after switching.
   */
  const enterWorkspace = useCallback(() => {
    window.location.assign('/');
  }, []);

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
    if (error === 'invite_already_member') {
      return t(
        'team_invitation_error_already_member',
        'You are already in this workspace. No invitation is needed.'
      );
    }
    if (error === 'invite_membership_failed') {
      return t(
        'team_invitation_error_membership',
        'This account could not be added to the workspace, and the invitation is spent. Ask the workspace administrator for a new one.'
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
            <div
              role="status"
              aria-live="polite"
              className="flex flex-col gap-[16px]"
            >
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
              <Button onClick={enterWorkspace}>
                {t('continue', 'Continue')}
              </Button>
            </div>
          )}

          {!loading && declined && !success && (
            <div
              role="status"
              aria-live="polite"
              className="flex flex-col gap-[16px]"
            >
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
              {error === 'invite_unknown' ? (
                <Button variant="secondary" onClick={() => void loadPreview()}>
                  {t('try_again', 'Try Again')}
                </Button>
              ) : (
                // Every other error is final: nothing on this page can change
                // it, so the one thing left to offer is the way out.
                <Button variant="secondary" onClick={() => router.push('/')}>
                  {t('continue', 'Continue')}
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
                  {/* An inviter with no profile name is issued under their
                      address, so name and address would print twice. */}
                  {preview.inviterName.trim().toLowerCase() ===
                  preview.inviterEmail.trim().toLowerCase()
                    ? preview.inviterEmail
                    : `${preview.inviterName} · ${preview.inviterEmail}`}
                </dd>
                <dt className="cf-label-sm text-cf-ink-muted">
                  {t('team_invitation_recipient', 'For')}
                </dt>
                <dd className="cf-body-md text-cf-ink [overflow-wrap:anywhere]">
                  {preview.boundEmail ||
                    t(
                      'team_invitation_recipient_any',
                      'A copied link: any signed-in account can accept it.'
                    )}
                </dd>
              </dl>
              {preview.emailMismatch || preview.alreadyMember ? (
                // Neither state has anything to accept or decline, so the same
                // way onward the accepted and declined states already offer.
                <div role="status" className="flex flex-col gap-[16px]">
                  <div className="rounded-[8px] border border-cf-border bg-cf-surface-subtle p-[16px]">
                    <p className="cf-body-md text-cf-ink [text-wrap:pretty]">
                      {preview.emailMismatch
                        ? t(
                            'team_invitation_mismatch_notice',
                            'This invitation is for {{email}}. Sign in with that address to accept it.',
                            { email: preview.boundEmail }
                          )
                        : t(
                            'team_invitation_already_member',
                            'You are already in this workspace.'
                          )}
                    </p>
                  </div>
                  <Button variant="secondary" onClick={() => router.push('/')}>
                    {t('continue', 'Continue')}
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col-reverse gap-[8px] sm:flex-row sm:justify-end">
                  <Button
                    variant="secondary"
                    disabled={accepting}
                    loading={declining}
                    loadingLabel={t('team_invitation_decline', 'Decline')}
                    onClick={() => void decline()}
                  >
                    {t('team_invitation_decline', 'Decline')}
                  </Button>
                  <Button
                    loading={accepting}
                    disabled={declining}
                    loadingLabel={t(
                      'team_invitation_accept',
                      'Accept invitation'
                    )}
                    onClick={() => void accept()}
                  >
                    {t('team_invitation_accept', 'Accept invitation')}
                  </Button>
                </div>
              )}
            </div>
          )}
        </Panel>
      </div>
    </PageShell>
  );
}
