'use client';

import { Button } from '@contentfactory/react/form/button';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import useSWR from 'swr';
import React, { useCallback, useMemo, useState } from 'react';
import { useUser } from '@contentfactory/frontend/components/layout/user.context';
import { Avatar } from '@contentfactory/frontend/components/ui/avatar';
import { displayName } from '@contentfactory/react/helpers/display-name';
import { useModals } from '@contentfactory/frontend/components/layout/new-modal';
import { Input } from '@contentfactory/react/form/input';
import { useForm, FormProvider, useWatch } from 'react-hook-form';
import { Select } from '@contentfactory/react/form/select';
import { CheckboxField } from '@contentfactory/react/form/checkbox.field';
import { classValidatorResolver } from '@hookform/resolvers/class-validator';
import { AddTeamMemberDto } from '@contentfactory/nestjs-libraries/dtos/settings/add.team.member.dto';
import { useToaster } from '@contentfactory/react/toaster/toaster';
import { deleteDialog } from '@contentfactory/react/helpers/delete.dialog';
import copy from 'copy-to-clipboard';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import type { OrganizationRole } from '@contentfactory/nestjs-libraries/user/organization.roles';
import {
  isOrganizationAdmin,
  organizationRoleLevel,
} from '@contentfactory/nestjs-libraries/user/organization.roles';
import { formatLocalizedDateTime } from '@contentfactory/react/helpers/localized.date';
import { useFieldErrorMessage } from '@contentfactory/frontend/components/auth/form.errors';

/**
 * The roles an administrator can hand out, each with the one line that says
 * what it is for. The list is `ASSIGNABLE_ORGANIZATION_ROLES` in the same
 * order, so a role added to the product cannot quietly fail to appear here —
 * `tests/roles-matrix.guard.test.cjs` holds the two together.
 */
const useRoles = () => {
  const t = useT();
  return useMemo(
    () => [
      {
        value: 'USER',
        name: t('user', 'User'),
        meaning: t(
          'role_user_meaning',
          'Writes and schedules, and uses the AI assistant.'
        ),
      },
      {
        value: 'EDITOR',
        name: t('role_editor', 'Editor'),
        meaning: t(
          'role_editor_meaning',
          'Writes, gathers briefs and schedules — does not connect channels and does not invite people.'
        ),
      },
      {
        value: 'ADMIN',
        name: t('admin', 'Admin'),
        meaning: t(
          'role_admin_meaning',
          'Everything an editor can do, plus channels, the brand voice, settings and the team.'
        ),
      },
    ],
    [t]
  );
};

/**
 * What the invitation door hands back once the link is signed.
 */
type IssuedInvitation = {
  url: string;
  expiresAt: string;
  sentByEmail: boolean;
  boundEmail?: string;
};

// Срок приглашения пишется так, как язык читателя пишет дату — одним решением
// на продукт: `formatLocalizedDateTime` (fn33.35, fn33.115).
const formatExpiry = formatLocalizedDateTime;

export const AddMember = () => {
  const modals = useModals();
  const fetch = useFetch();
  const toast = useToaster();
  const t = useT();
  const resolver = useMemo(() => {
    return classValidatorResolver(AddTeamMemberDto);
  }, []);
  const form = useForm({
    values: {
      email: '',
      role: '',
      sendEmail: false,
    },
    resolver,
    mode: 'onChange',
  });
  const email = useWatch({
    control: form.control,
    name: 'email',
  });
  const roles = useRoles();
  const fieldErrorMessage = useFieldErrorMessage();
  const selectedRole = useWatch({
    control: form.control,
    name: 'role',
  });
  const roleMeaning = roles.find((role) => role.value === selectedRole)?.meaning;
  /**
   * The link, once it exists. Until 04.09.2026 this screen had nowhere to put
   * it: with the checkbox on, the link was only mailed; with it off, the link
   * went to the clipboard and the modal closed, so an administrator who missed
   * the toast — or whose paste went somewhere else — had no way back to it
   * short of issuing another invitation.
   */
  const [invitation, setInvitation] = useState<IssuedInvitation | null>(null);
  // A letter needs somewhere to go. The checkbox is a second delivery, not a
  // second kind of invitation, so it simply cannot be ticked without an
  // address rather than changing which fields the form has.
  const canSendEmail = !!email?.trim();

  const copyLink = useCallback(
    (url: string) => {
      copy(url);
      toast.show(t('link_copied_to_clipboard', 'Link copied to clipboard'));
    },
    [t, toast]
  );

  const submit = useCallback(
    async (values: { email: string; role: string; sendEmail: boolean }) => {
      const address = values.email?.trim() || '';
      const issued = (await (
        await fetch('/settings/team', {
          method: 'POST',
          body: JSON.stringify({
            ...values,
            email: address,
            sendEmail: !!address && values.sendEmail,
          }),
        })
      ).json()) as IssuedInvitation;
      setInvitation(issued);
      // The clipboard still gets it — that was the one convenience of the old
      // flow — but the link stays on screen as well.
      copyLink(issued.url);
    },
    [copyLink]
  );

  if (invitation) {
    return (
      <div className="relative flex flex-1 flex-col gap-[12px] p-[16px] pt-0">
        <div className="cf-body-md text-cf-ink">
          {t(
            'team_invitation_ready',
            'The invitation is ready. Copy the link and send it however you like.'
          )}
        </div>
        <div className="cf-caption break-all rounded-[8px] border border-cf-border-control bg-cf-surface-subtle p-[12px] text-cf-ink">
          {invitation.url}
        </div>
        <div className="cf-body-sm text-cf-ink-muted">
          {invitation.boundEmail
            ? t(
                'team_invitation_link_bound',
                'The link works only for {{email}}.',
                { email: invitation.boundEmail }
              )
            : t(
                'team_invitation_link_open',
                'The link is open: anyone you send it to can join.'
              )}
        </div>
        <div className="cf-body-sm text-cf-ink-muted">
          {t('team_invitation_expires_at', 'It stops working on {{when}}.', {
            when: formatExpiry(invitation.expiresAt),
            // A date is our own text, and i18next's HTML escaping turned its
            // separators into `&#x2F;` on screen. Nothing here comes from the
            // person being invited.
            interpolation: { escapeValue: false },
          })}
        </div>
        {invitation.sentByEmail && !!invitation.boundEmail && (
          <div className="cf-body-sm text-cf-ink-muted">
            {t(
              'team_invitation_sent_to',
              'A letter has gone to {{email}} as well.',
              { email: invitation.boundEmail }
            )}
          </div>
        )}
        <div className="mt-[8px] flex gap-[8px]">
          <Button onClick={() => copyLink(invitation.url)}>
            {t('copy_link', 'Copy Link')}
          </Button>
          <Button secondary={true} onClick={() => modals.closeAll()}>
            {t('team_invitation_close', 'Done')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(submit)}>
        <div className="relative flex gap-[10px] flex-col flex-1 p-[16px] pt-0">
          <Input
            label="Email"
            placeholder={t('enter_email', 'Enter email')}
            name="email"
            error={fieldErrorMessage(
              'email',
              form.formState.errors.email?.message
            )}
            helper={t(
              'team_invitation_email_optional',
              'Optional. With an address the link works only for that person; without one, for anyone you send it to.'
            )}
          />
          {/* `content-factory-next-fn33.72`: leaving the role unchosen used to
              answer «role must be one of the following values: USER, EDITOR,
              ADMIN» — the enum out of the code, in English, next to a list
              that names the same roles in the reader's language. */}
          <Select
            label="Role"
            name="role"
            error={fieldErrorMessage(
              'role',
              form.formState.errors.role?.message
            )}
          >
            <option value="">{t('select_role', 'Select Role')}</option>
            {roles.map((role) => (
              <option key={role.value} value={role.value}>
                {role.name}
              </option>
            ))}
          </Select>
          {/*
            A native select has nowhere to put a second line, and a role name
            on its own tells an administrator nothing about what they are
            granting. The meaning of the chosen role goes under the control.
          */}
          {!!roleMeaning && (
            <div className="cf-body-sm text-cf-ink-muted">{roleMeaning}</div>
          )}
          <CheckboxField
            label={t('team_invitation_also_send_email', 'Also send it by email')}
            disabled={!canSendEmail}
            {...form.register('sendEmail')}
          />
          {!canSendEmail && (
            <div className="cf-body-sm text-cf-ink-muted">
              {t(
                'team_invitation_email_needed_to_send',
                'Fill in the address to send a letter as well.'
              )}
            </div>
          )}
          <Button type="submit" className="mt-[18px]">
            {t('team_invitation_create', 'Create invitation')}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
};
export const TeamsComponent = () => {
  const fetch = useFetch();
  const user = useUser();
  const modals = useModals();
  const toast = useToaster();
  const t = useT();
  const myLevel = organizationRoleLevel(user?.role);
  const iAdminister = isOrganizationAdmin(user?.role);
  const roles = useRoles();
  /**
   * Whose row carries controls.
   *
   * `content-factory-next-fn33.50`: an administrator may act on an equal —
   * another administrator — and not only on somebody below them. Before this
   * the two controls vanished the moment a member was promoted, and the person
   * who promoted them could not undo it from any screen. Equality alone does
   * not grant it: `USER` and `EDITOR` share a level and administer nobody.
   * Your own row never carries controls; the server refuses it, and a lone
   * administrator must not be able to lock themselves out.
   */
  const canManage = useCallback(
    (member: { role: OrganizationRole; user: { id: string } }) => {
      if (member.user.id === user?.id) {
        return false;
      }
      const theirLevel = organizationRoleLevel(member.role);
      return (
        myLevel > theirLevel || (myLevel === theirLevel && iAdminister)
      );
    },
    [iAdminister, myLevel, user?.id]
  );
  /**
   * A lookup, not a ternary chain. The chain this replaced ended in «Super
   * Admin», so any role it did not name — `EDITOR`, the day it was added —
   * rendered as the highest authority in the product.
   */
  const roleName = useCallback(
    (role: OrganizationRole) =>
      role === 'SUPERADMIN'
        ? t('super_admin', 'Super Admin')
        : roles.find((known) => known.value === role)?.name ?? role,
    [roles, t]
  );
  const loadTeam = useCallback(async () => {
    return (await (await fetch('/settings/team')).json()).users as Array<{
      id: string;
      role: OrganizationRole;
      user: {
        email: string;
        name: string | null;
        id: string;
      };
    }>;
  }, []);
  const addMember = useCallback(() => {
    modals.openModal({
      classNames: {
        modal: 'bg-transparent text-textColor',
      },
      title: t('top_title_add_member', 'Add Member'),
      withCloseButton: true,
      children: <AddMember />,
    });
  }, [t]);
  const { data, mutate } = useSWR('/api/teams', loadTeam, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
  });
  const remove = useCallback(
    (toRemove: {
        user: {
          id: string;
        };
      }) =>
      async () => {
        if (
          !(await deleteDialog(
            t(
              'are_you_sure_remove_team_member',
              'Are you sure you want to remove this team member?'
            )
          ))
        ) {
          return;
        }
        await fetch(`/settings/team/${toRemove.user.id}`, {
          method: 'DELETE',
        });
        await mutate();
      },
    [t]
  );
  /**
   * `content-factory-next-fn33.17`. Before this the only way to correct a role
   * was to remove the person and invite them again — a destructive move for a
   * typo, and one that reads to the person removed as being thrown out.
   *
   * The dropdown is only rendered where the change is allowed, and the server
   * weighs the same two levels again: the screen decides what to offer, never
   * what is permitted.
   */
  const changeRole = useCallback(
    (member: { role: OrganizationRole; user: { id: string } }) =>
      async (event: React.ChangeEvent<HTMLSelectElement>) => {
        const role = event.target.value;
        if (role === member.role) {
          return;
        }
        const response = await fetch(`/settings/team/${member.user.id}`, {
          method: 'PUT',
          body: JSON.stringify({ role }),
        });
        // The list is re-read either way: on refusal the dropdown is showing a
        // role the server did not accept, and leaving it there would be a lie.
        await mutate();
        if (!response.ok) {
          toast.show(
            t('team_member_role_change_failed', 'The role could not be changed.'),
            'warning'
          );
          return;
        }
        toast.show(t('team_member_role_updated', 'Role updated'));
      },
    [t, toast]
  );

  return (
    <div className="flex flex-col">
      <h3 className="cf-heading-md text-cf-ink">
        {t('team_members', 'Team Members')}
      </h3>
      <div className="mt-[4px] cf-body-md text-cf-ink-muted">
        {t(
          'invite_your_assistant_or_team_member_to_manage_your_account',
          'Invite your assistant or team member to manage your account'
        )}
      </div>
      <div className="my-[16px] flex flex-col gap-[24px] rounded-[8px] border border-cf-border bg-cf-surface p-[24px]">
        <div className="flex flex-col gap-[16px]">
          {(data || []).map((p) => (
            <div key={p.user.id} className="flex items-center">
              {/* The person, by the name they entered. Until 04.09.2026 this
                  cell cut a name out of the mailbox for everybody and the
                  owner's own rows read «Maslennikov» and «Maslennikovig». The
                  address stays visible under the name: two colleagues can
                  share a first name, and a derived name is a guess. */}
              <div className="flex flex-1 min-w-0 items-center gap-[8px]">
                <Avatar
                  name={p.user.name}
                  email={p.user.email}
                  size={32}
                />
                <div className="flex min-w-0 flex-col">
                  <div className="cf-body-md text-cf-ink truncate">
                    {displayName(p.user)}
                  </div>
                  <div className="cf-caption text-cf-ink-muted truncate">
                    {p.user.email}
                  </div>
                </div>
              </div>
              <div className="flex-1">
                {canManage(p) ? (
                  <Select
                    standalone={true}
                    density="dense"
                    aria-label={t('label_role', 'Role')}
                    value={p.role}
                    onChange={changeRole(p)}
                  >
                    {roles
                      // Never a role above the caller's own: an administrator
                      // cannot hand out authority they do not hold.
                      .filter(
                        (role) =>
                          organizationRoleLevel(role.value) <= myLevel
                      )
                      .map((role) => (
                        <option key={role.value} value={role.value}>
                          {role.name}
                        </option>
                      ))}
                  </Select>
                ) : (
                  // Yourself, and anyone above you — the instance
                  // administrator among them. A dropdown here would offer a
                  // change the server refuses.
                  roleName(p.role)
                )}
              </div>
              {canManage(p) ? (
                <div className="flex-1 flex justify-end">
                  <Button
                    density="dense"
                    className="rounded-[4px] border border-cf-border-control !bg-cf-surface-subtle cf-caption text-cf-ink"
                    onClick={remove(p)}
                    secondary={true}
                  >
                    <div className="flex justify-center items-center gap-[4px]">
                      <div>
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="14"
                          height="15"
                          viewBox="0 0 14 15"
                          fill="none"
                        >
                          <path
                            d="M11.8125 3.125H9.625V2.6875C9.625 2.3394 9.48672 2.00556 9.24058 1.75942C8.99444 1.51328 8.6606 1.375 8.3125 1.375H5.6875C5.3394 1.375 5.00556 1.51328 4.75942 1.75942C4.51328 2.00556 4.375 2.3394 4.375 2.6875V3.125H2.1875C2.07147 3.125 1.96019 3.17109 1.87814 3.25314C1.79609 3.33519 1.75 3.44647 1.75 3.5625C1.75 3.67853 1.79609 3.78981 1.87814 3.87186C1.96019 3.95391 2.07147 4 2.1875 4H2.625V11.875C2.625 12.1071 2.71719 12.3296 2.88128 12.4937C3.04538 12.6578 3.26794 12.75 3.5 12.75H10.5C10.7321 12.75 10.9546 12.6578 11.1187 12.4937C11.2828 12.3296 11.375 12.1071 11.375 11.875V4H11.8125C11.9285 4 12.0398 3.95391 12.1219 3.87186C12.2039 3.78981 12.25 3.67853 12.25 3.5625C12.25 3.44647 12.2039 3.33519 12.1219 3.25314C12.0398 3.17109 11.9285 3.125 11.8125 3.125ZM5.25 2.6875C5.25 2.57147 5.29609 2.46019 5.37814 2.37814C5.46019 2.29609 5.57147 2.25 5.6875 2.25H8.3125C8.42853 2.25 8.53981 2.29609 8.62186 2.37814C8.70391 2.46019 8.75 2.57147 8.75 2.6875V3.125H5.25V2.6875ZM10.5 11.875H3.5V4H10.5V11.875ZM6.125 6.1875V9.6875C6.125 9.80353 6.07891 9.91481 5.99686 9.99686C5.91481 10.0789 5.80353 10.125 5.6875 10.125C5.57147 10.125 5.46019 10.0789 5.37814 9.99686C5.29609 9.91481 5.25 9.80353 5.25 9.6875V6.1875C5.25 6.07147 5.29609 5.96019 5.37814 5.87814C5.46019 5.79609 5.57147 5.75 5.6875 5.75C5.80353 5.75 5.91481 5.79609 5.99686 5.87814C6.07891 5.96019 6.125 6.07147 6.125 6.1875ZM8.75 6.1875V9.6875C8.75 9.80353 8.70391 9.91481 8.62186 9.99686C8.53981 10.0789 8.42853 10.125 8.3125 10.125C8.19647 10.125 8.08519 10.0789 8.00314 9.99686C7.92109 9.91481 7.875 9.80353 7.875 9.6875V6.1875C7.875 6.07147 7.92109 5.96019 8.00314 5.87814C8.08519 5.79609 8.19647 5.75 8.3125 5.75C8.42853 5.75 8.53981 5.79609 8.62186 5.87814C8.70391 5.96019 8.75 6.07147 8.75 6.1875Z"
                            fill="currentColor"
                          />
                        </svg>
                      </div>
                      <div>{t('remove', 'Remove')}</div>
                    </div>
                  </Button>
                </div>
              ) : (
                <div className="flex-1" />
              )}
            </div>
          ))}
        </div>
        <div>
          <Button onClick={addMember}>
            {t('add_another_member', 'Add another member')}
          </Button>
        </div>
      </div>
    </div>
  );
};
