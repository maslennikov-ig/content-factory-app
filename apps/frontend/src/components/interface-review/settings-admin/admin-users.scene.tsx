'use client';

import {
  InterfaceReviewFrame,
  defineInterfaceReviewScene,
  type InterfaceReviewContext,
  type InterfaceReviewState,
} from '../fixture-contract';
import {
  AdminUsersView,
  type AdminAccountRow,
  type AdminAccountsResponse,
} from '../../admin/admin-users.component';

export const adminUsersScene = defineInterfaceReviewScene({
  id: 'settings-admin/users',
  fixture: {
    account: {
      id: 'synthetic-account-1',
      email: 'reviewer@synthetic.invalid',
      name: 'Synthetic reviewer',
      activated: false,
      isSuperAdmin: false,
      providerName: 'Password',
      createdAt: '2026-08-01T09:30:00.000Z',
      lastOnline: '2026-08-20T08:00:00.000Z',
      organizations: [
        {
          role: 'USER',
          organization: {
            id: 'synthetic-workspace',
            name: 'Synthetic workspace',
          },
        },
      ],
    },
    longEmail:
      'a.very.long.localized.account.name.that.must.wrap@synthetic.invalid',
    longRussianName:
      'Редактор международной распределённой команды синтетического рабочего пространства',
  },
  states: [
    'loading',
    'empty',
    'default',
    'selected',
    'success',
    'error',
    'restricted',
    'disabled',
    'long-content',
  ] as const satisfies readonly InterfaceReviewState[],
});

export const adminUsersExclusions = Object.freeze({});

export function AdminUsersReviewScene({
  context,
}: {
  context: InterfaceReviewContext;
}) {
  const account = {
    ...adminUsersScene.fixture.account,
    email:
      context.state === 'long-content'
        ? adminUsersScene.fixture.longEmail
        : adminUsersScene.fixture.account.email,
    name:
      context.state === 'long-content' && context.locale === 'ru'
        ? adminUsersScene.fixture.longRussianName
        : adminUsersScene.fixture.account.name,
    organizations: adminUsersScene.fixture.account.organizations.map(
      (membership) => ({
        ...membership,
        organization: { ...membership.organization },
      })
    ),
  } as AdminAccountRow;
  const data: AdminAccountsResponse = {
    users: context.state === 'empty' ? [] : [account],
    pending: context.state === 'empty' ? 0 : 1,
    total: context.state === 'empty' ? 0 : 1,
    matching: context.state === 'empty' ? 0 : 1,
    approvalRequired: true,
  };

  return (
    <InterfaceReviewFrame scene={adminUsersScene} context={context}>
      <AdminUsersView
        allowed={context.state !== 'restricted'}
        status={context.state === 'selected' ? 'active' : 'pending'}
        searchInput=""
        page={0}
        data={
          context.state === 'loading' || context.state === 'error'
            ? undefined
            : data
        }
        loading={context.state === 'loading'}
        error={
          context.state === 'error' ? 'Could not load accounts.' : undefined
        }
        busyId={context.state === 'disabled' ? account.id : ''}
        successMessage={
          context.state === 'success' ? 'Account approved.' : undefined
        }
        onStatusChange={() => undefined}
        onSearchInputChange={() => undefined}
        onApplySearch={() => undefined}
        onRetry={() => undefined}
        onAction={() => undefined}
        onPageChange={() => undefined}
      />
    </InterfaceReviewFrame>
  );
}
