'use client';

import { useCallback, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { useUser } from '@contentfactory/frontend/components/layout/user.context';
import { Button } from '@contentfactory/react/form/button';
import { Input } from '@contentfactory/react/form/input';
import { PageHeader, Panel } from '@contentfactory/react/layout';
import {
  Tab,
  TabList,
  TabPanel,
  Tabs,
} from '@contentfactory/react/choice/tabs';
import { useToaster } from '@contentfactory/react/toaster/toaster';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { deleteDialog } from '@contentfactory/react/helpers/delete.dialog';
import { displayName } from '@contentfactory/react/helpers/display-name';
import { formatLocalizedDateTime } from '@contentfactory/react/helpers/localized.date';
import { Avatar } from '@contentfactory/frontend/components/ui/avatar';
import { AdminTelegramConnectComponent } from './admin-telegram-connect.component';

export type AdminUserStatus = 'pending' | 'active' | 'all';

/**
 * `delete` is the one that outlives a decision: rejection only reaches an
 * account that has never signed in, and blocking leaves the row in place for
 * good (`content-factory-next-fn33.23`).
 */
export type AdminAccountAction =
  | 'approve'
  | 'block'
  | 'unblock'
  | 'reject'
  | 'delete';

export interface AdminAccountRow {
  id: string;
  email: string;
  name: string | null;
  activated: boolean;
  /**
   * When an administrator switched this account off, and null for everyone
   * else. `activated: false` on its own meant «waiting for approval» and
   * «blocked» at once (`content-factory-next-fn33.66`).
   */
  blockedAt: string | null;
  isSuperAdmin: boolean;
  providerName: string;
  createdAt: string;
  lastOnline: string;
  organizations: { role: string; organization: { id: string; name: string } }[];
}

/**
 * What the server says would go with the workspace, when it answers
 * `account_delete_workspace_confirm` (`content-factory-next-fn33.32`). Four
 * counts rather than a total: «12 things» tells an administrator nothing, and
 * a workspace is recognised by the shape of what is in it.
 */
export interface DeletionWorkspace {
  name: string;
  posts: number;
  channels: number;
  materials: number;
  members: number;
}

/**
 * Nest wraps an `HttpException` body once more when it is an object, so the
 * same fields arrive either at the top level or one level down under
 * `message`. Both shapes are the same shape, so it is one type.
 */
export interface DeletionBody {
  code?: string;
  workspace?: string;
  workspaces?: DeletionWorkspace[];
  message?: string | DeletionBody;
}

/** A refused action, read once out of the response body. */
export interface DeletionFailure {
  raw: string;
  parsed?: DeletionBody;
  code: string;
}

const nestedBody = (body?: DeletionBody) =>
  body && typeof body.message === 'object' ? body.message : undefined;

export interface AdminAccountsResponse {
  users: AdminAccountRow[];
  pending: number;
  total: number;
  approvalRequired: boolean;
}

const PAGE_SIZE = 25;

/**
 * Three states, not two. A blocked account is off because somebody decided so,
 * a pending one is off because nobody has decided yet, and reading them as one
 * yellow «Awaiting approval» is what let a block be lifted by mistake
 * (`content-factory-next-fn33.66`). The block wears the danger colour: it is
 * the only one of the three that is a sanction.
 */
function StateBadge({
  state,
  label,
}: {
  state: 'active' | 'pending' | 'blocked';
  label: string;
}) {
  const tone =
    state === 'active'
      ? 'border-cf-accent bg-cf-accent-soft text-cf-accent'
      : state === 'blocked'
        ? 'border-cf-danger bg-cf-danger-soft text-cf-danger'
        : 'border-cf-warning bg-cf-warning-soft text-cf-warning';
  return (
    <span
      className={`inline-flex items-center gap-[6px] rounded-full border px-[8px] py-[2px] cf-label-sm ${tone}`}
    >
      <span aria-hidden="true">
        {state === 'active' ? '●' : state === 'blocked' ? '✕' : '○'}
      </span>
      {label}
    </span>
  );
}

/** The one place that reads the two columns as a single state. */
export const accountState = (row: {
  activated: boolean;
  blockedAt: string | null;
}): 'active' | 'pending' | 'blocked' =>
  row.blockedAt ? 'blocked' : row.activated ? 'active' : 'pending';

export function AdminUsersView({
  allowed,
  status,
  searchInput,
  page,
  data,
  loading = false,
  error,
  busyId = '',
  successMessage,
  onStatusChange,
  onSearchInputChange,
  onApplySearch,
  onRetry,
  onAction,
  onPageChange,
}: {
  allowed: boolean;
  status: AdminUserStatus;
  searchInput: string;
  page: number;
  data?: AdminAccountsResponse;
  loading?: boolean;
  error?: string;
  busyId?: string;
  successMessage?: string;
  onStatusChange: (status: AdminUserStatus) => void;
  onSearchInputChange: (value: string) => void;
  onApplySearch: () => void;
  onRetry: () => void;
  onAction: (row: AdminAccountRow, action: AdminAccountAction) => void;
  onPageChange: (page: number) => void;
}) {
  const t = useT();
  if (!allowed) {
    return (
      <section
        data-production-surface="settings-admin/users"
        className="rounded-[8px] border border-cf-warning bg-cf-warning-soft p-[16px] cf-body-md text-cf-warning"
      >
        {t('no_access_to_page', 'You do not have access to this page.')}
      </section>
    );
  }

  const tabs = [
    {
      key: 'pending' as const,
      label: t('awaiting_approval', 'Awaiting approval'),
    },
    { key: 'active' as const, label: t('active', 'Active') },
    { key: 'all' as const, label: t('all', 'All') },
  ];
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <section data-production-surface="settings-admin/users">
      <Tabs
        value={status}
        onChange={(value) => onStatusChange(value as AdminUserStatus)}
      >
        <div className="flex flex-col gap-[16px] text-cf-ink">
          <PageHeader
            headingLevel={1}
            title={t('accounts', 'Accounts')}
            actions={
              data ? (
                <div className="cf-label-sm text-cf-ink-muted">
                  {t('pending_count', 'Awaiting')}: {data.pending} /{' '}
                  {data.total}
                </div>
              ) : undefined
            }
          />

          <AdminTelegramConnectComponent />

          {successMessage && (
            <p
              role="status"
              className="rounded-[8px] border border-cf-accent bg-cf-accent-soft p-[12px] cf-body-sm text-cf-accent"
            >
              {successMessage}
            </p>
          )}
          {data && !data.approvalRequired && (
            <p
              role="status"
              className="rounded-[8px] border border-cf-border bg-cf-surface-subtle p-[12px] cf-body-sm [text-wrap:pretty]"
            >
              {t(
                'approval_mode_off',
                'Approval mode is off. New accounts become usable without manual approval.'
              )}
            </p>
          )}

          <Panel as="div" contentPadding="compact">
            <div className="flex flex-col gap-[12px] lg:flex-row lg:items-end">
              <TabList
                activation="manual"
                className="flex flex-wrap gap-[8px]"
                aria-label={t('account_state_filter', 'Account state')}
              >
                {tabs.map((tab) => (
                  <Tab
                    key={tab.key}
                    value={tab.key}
                    density="dense"
                    className={`rounded-full border px-[12px] cf-label-md transition-colors duration-state ${
                      status === tab.key
                        ? 'border-cf-accent bg-cf-accent-soft text-cf-accent'
                        : 'border-cf-border-control text-cf-ink-muted hover:text-cf-ink'
                    }`}
                  >
                    {tab.label}
                  </Tab>
                ))}
              </TabList>
              <div className="flex min-w-0 flex-1 flex-col gap-[6px]">
                <label
                  htmlFor="admin-users-search"
                  className="cf-label-sm text-cf-ink-muted"
                >
                  {t('search_by_email_or_name', 'Email or name')}
                </label>
                <div className="flex min-w-0 flex-col gap-[8px] sm:flex-row">
                  <Input
                    standalone
                    name="admin-users-search"
                    id="admin-users-search"
                    value={searchInput}
                    onChange={(event) =>
                      onSearchInputChange(event.target.value)
                    }
                    onKeyDown={(event) =>
                      event.key === 'Enter' && onApplySearch()
                    }
                    className="min-w-0 flex-1"
                    inputClassName="cf-body-md"
                  />
                  <Button onClick={onApplySearch}>{t('apply', 'Apply')}</Button>
                </div>
              </div>
            </div>
          </Panel>

          <TabPanel value={status} className="flex flex-col gap-[16px]">
            {loading && (
              <div
                aria-busy="true"
                aria-label={t('loading', 'Loading')}
                className="flex flex-col gap-[8px]"
              >
                {[0, 1, 2].map((row) => (
                  <div
                    key={row}
                    className="h-[56px] rounded-[8px] border border-cf-border bg-cf-surface-subtle motion-safe:animate-pulse"
                  />
                ))}
              </div>
            )}
            {error && (
              <div
                role="alert"
                className="rounded-[8px] border border-cf-danger bg-cf-danger-soft p-[12px] cf-body-sm text-cf-danger"
              >
                <p>{error}</p>
                <Button
                  variant="quiet"
                  type="button"
                  onClick={onRetry}
                  className="mt-[8px] underline"
                >
                  {t('try_again', 'Try again')}
                </Button>
              </div>
            )}
            {data && !loading && data.users.length === 0 && (
              <div className="rounded-[8px] border border-cf-border bg-cf-surface p-[20px] cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
                {status === 'pending'
                  ? t('no_pending_accounts', 'Nobody is waiting for approval.')
                  : t(
                      'no_accounts_found',
                      'No account matches this filter. Try another filter or clear the search.'
                    )}
              </div>
            )}
            {data && data.users.length > 0 && (
              <div className="overflow-hidden rounded-[8px] border border-cf-border bg-cf-surface">
                <div className="hidden grid-cols-[minmax(0,1fr)_100px_120px_140px_150px] gap-[12px] border-b border-cf-border bg-cf-surface-subtle px-[12px] py-[10px] cf-label-sm text-cf-ink-muted lg:grid">
                  <div>{t('user', 'User')}</div>
                  <div>{t('sign_in_method', 'Method')}</div>
                  <div>{t('registered', 'Registered')}</div>
                  <div>{t('state', 'State')}</div>
                  <div className="text-right">{t('actions', 'Actions')}</div>
                </div>
                {data.users.map((row) => (
                  <article
                    key={row.id}
                    className="flex flex-col gap-[12px] border-b border-cf-border p-[12px] last:border-b-0 lg:grid lg:grid-cols-[minmax(0,1fr)_100px_120px_140px_150px] lg:items-center"
                  >
                    {/* The person first, the address under them. The list
                        used to lead with the mailbox and drop to the workspace
                        name when a profile had none — so an administrator read
                        a workspace where a person should have been
                        (`content-factory-next-fn33.16`). */}
                    <div className="flex min-w-0 items-center gap-[8px]">
                      <Avatar name={row.name} email={row.email} size={32} />
                      <div className="min-w-0">
                        <div className="break-words cf-body-sm text-cf-ink">
                          {displayName(row)}
                        </div>
                        {/* Адрес — идентификатор, ему моноширинный `caption`
                            и идёт. Название рабочего пространства — обычный
                            текст, и в одной строке с адресом оно получало
                            чужую гарнитуру. */}
                        <div className="break-words cf-caption text-cf-ink-muted">
                          {row.email}
                        </div>
                        {row.organizations[0]?.organization.name && (
                          <div className="break-words cf-body-sm text-cf-ink-muted">
                            {row.organizations[0].organization.name}
                          </div>
                        )}
                      </div>
                    </div>
                    <div>
                      <span className="me-[8px] cf-caption text-cf-ink-muted lg:hidden">
                        {t('sign_in_method', 'Method')}
                      </span>
                      <span className="cf-label-sm text-cf-ink-muted">
                        {row.providerName}
                      </span>
                    </div>
                    <div>
                      <span className="me-[8px] cf-caption text-cf-ink-muted lg:hidden">
                        {t('registered', 'Registered')}
                      </span>
                      <span className="cf-label-sm text-cf-ink-muted">
                        {formatLocalizedDateTime(row.createdAt)}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-[8px]">
                      <StateBadge
                        state={accountState(row)}
                        label={
                          accountState(row) === 'active'
                            ? t('active', 'Active')
                            : accountState(row) === 'blocked'
                              ? t('blocked', 'Blocked')
                              : t('awaiting_approval', 'Awaiting approval')
                        }
                      />
                      {row.isSuperAdmin && (
                        <span className="cf-caption text-cf-signature">
                          {t('admin', 'Admin')}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-[8px] lg:justify-end">
                      {accountState(row) === 'pending' && (
                        <>
                          <Button
                            loading={busyId === row.id}
                            onClick={() => onAction(row, 'approve')}
                          >
                            {t('approve', 'Approve')}
                          </Button>
                          <Button
                            secondary
                            loading={busyId === row.id}
                            onClick={() => onAction(row, 'reject')}
                          >
                            {t('reject_pending_account', 'Reject')}
                          </Button>
                        </>
                      )}
                      {/* A block is lifted by its own action. «Approve» here
                          read as letting a newcomer in and handed the access
                          back all the same. */}
                      {accountState(row) === 'blocked' && (
                        <Button
                          loading={busyId === row.id}
                          onClick={() => onAction(row, 'unblock')}
                        >
                          {t('unblock', 'Unblock')}
                        </Button>
                      )}
                      {accountState(row) === 'active' && !row.isSuperAdmin && (
                        <Button
                          secondary
                          loading={busyId === row.id}
                          onClick={() => onAction(row, 'block')}
                        >
                          {t('block', 'Block')}
                        </Button>
                      )}
                      {/* Ни одна из двух прежних кнопок аккаунт не убирает:
                          отказ доступен только ожидающему, блокировка
                          оставляет запись навсегда. Удаление — единственное,
                          что доводит решение до конца, поэтому оно
                          разрушающего вида и стоит последним. */}
                      {!row.isSuperAdmin && (
                        <Button
                          variant="destructive"
                          loading={busyId === row.id}
                          onClick={() => onAction(row, 'delete')}
                        >
                          {t('delete_account', 'Delete')}
                        </Button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
            {data && totalPages > 1 && (
              <div className="flex flex-wrap items-center gap-[12px]">
                <Button
                  disabled={page === 0}
                  secondary
                  onClick={() => onPageChange(Math.max(0, page - 1))}
                >
                  {t('previous', 'Previous')}
                </Button>
                <div className="cf-label-sm text-cf-ink-muted">
                  {page + 1} / {totalPages}
                </div>
                <Button
                  disabled={page + 1 >= totalPages}
                  secondary
                  onClick={() => onPageChange(page + 1)}
                >
                  {t('next', 'Next')}
                </Button>
              </div>
            )}
          </TabPanel>
        </div>
      </Tabs>
    </section>
  );
}

export const AdminUsersComponent = () => {
  const t = useT();
  const user = useUser();
  const fetch = useFetch();
  const toaster = useToaster();
  const [status, setStatus] = useState<AdminUserStatus>('pending');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [busyId, setBusyId] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const query = new URLSearchParams({
    status,
    page: String(page),
    limit: String(PAGE_SIZE),
    ...(search ? { search } : {}),
  });
  const { data, error, isLoading, mutate } = useSWR<AdminAccountsResponse>(
    `/admin/users?${query.toString()}`,
    async (url: string) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to load accounts');
      return response.json();
    },
    { revalidateOnFocus: false, revalidateOnReconnect: false }
  );

  /**
   * The server refuses a deletion it cannot carry out, and it says which of the
   * two reasons it was. A raw body would show the person a JSON envelope, so the
   * code is read and answered in their language; anything unrecognised falls
   * back to the text the server sent.
   *
   * The body is read once and handed on: `account_delete_workspace_confirm`
   * carries the workspaces and their counts, and a second `response.text()`
   * would find the stream already spent.
   */
  const readFailure = useCallback(async (response: Response) => {
    const raw = await response.text();
    try {
      const parsed = JSON.parse(raw) as DeletionBody;
      return {
        raw,
        parsed,
        code: parsed?.code || nestedBody(parsed)?.code || '',
      };
    } catch {
      // A plain-text body, which is what most failures send.
      return { raw, parsed: undefined, code: '' };
    }
  }, []);

  const failureMessage = useCallback(
    ({ raw, parsed, code }: DeletionFailure) => {
      if (parsed) {
        if (code === 'account_delete_workspace_has_content') {
          return t(
            'account_delete_workspace_has_content',
            'This account is the only member of a workspace that still holds content. Remove that content, or hand the workspace to someone else, first.'
          );
        }
        /**
         * The workspace has to be named. «Это единственный администратор
         * области» sends a person to look through several workspaces for the
         * one the server meant; the server knows which, and says so.
         */
        if (code === 'account_delete_last_admin') {
          const workspace =
            parsed?.workspace || nestedBody(parsed)?.workspace || '';
          return t(
            'account_delete_last_admin',
            'This account is the only administrator of «{{workspace}}» — give somebody else that role there first.',
            { workspace }
          );
        }
        if (code === 'account_delete_user_has_content') {
          return t(
            'account_delete_user_has_content',
            'This account still owns records inside the product. They have to be removed before the account can go.'
          );
        }
        const nested = nestedBody(parsed)?.message;
        const message =
          (typeof nested === 'string' ? nested : undefined) ||
          (typeof parsed?.message === 'string' ? parsed.message : undefined);
        if (message) return message;
      }
      return raw || t('action_failed', 'Action failed');
    },
    [t]
  );

  /**
   * The second press. The server has already said what would go; this only
   * reads it back in words — one line per workspace, with the four counts an
   * administrator can recognise the workspace by — and asks once more.
   */
  const confirmWorkspaceDeletion = useCallback(
    async (failure: DeletionFailure) => {
      const body =
        failure.parsed?.workspaces || nestedBody(failure.parsed)?.workspaces;
      const workspaces: DeletionWorkspace[] = Array.isArray(body) ? body : [];
      if (!workspaces.length) return false;

      const summary = workspaces
        .map((workspace) =>
          t(
            'delete_account_workspace_summary',
            '«{{name}}» — posts: {{posts}}, channels: {{channels}}, materials: {{materials}}, members: {{members}}',
            {
              name: workspace.name,
              posts: workspace.posts,
              channels: workspace.channels,
              materials: workspace.materials,
              members: workspace.members,
            }
          )
        )
        .join('; ');

      return deleteDialog(
        t(
          'delete_account_with_workspace_confirmation',
          'This account is the only member of workspaces that still hold content: {{summary}}. Deleting the account deletes them and everything inside them. This cannot be undone.',
          { summary }
        ),
        t('delete_account_with_workspace_confirm', 'Delete with the workspace')
      );
    },
    [t]
  );

  const act = useCallback(
    async (row: AdminAccountRow, action: AdminAccountAction) => {
      if (
        action === 'reject' &&
        !(await deleteDialog(
          t(
            'reject_pending_account_confirmation',
            'Reject this pending account? Its unused workspace will be permanently deleted.'
          ),
          t('reject_pending_account_confirm', 'Yes, reject account')
        ))
      ) {
        return;
      }
      if (
        action === 'delete' &&
        !(await deleteDialog(
          t(
            'delete_account_confirmation',
            'Delete this account for good? It leaves every workspace, and a workspace where it is the only member is deleted with it. This cannot be undone.'
          ),
          t('delete_account_confirm', 'Yes, delete account')
        ))
      ) {
        return;
      }
      setBusyId(row.id);
      setSuccessMessage('');
      try {
        const send = (deleteWorkspaces: boolean) =>
          fetch(`/admin/users/${row.id}/${action}`, {
            method: 'POST',
            // The flag rides in the body, never in the URL: a link that
            // deletes a workspace with its content has no business in browser
            // history or a proxy log.
            body: JSON.stringify(deleteWorkspaces ? { deleteWorkspaces } : {}),
          });

        let response = await send(false);
        let withWorkspaces = false;
        if (!response.ok) {
          let failure = await readFailure(response);
          if (
            action === 'delete' &&
            failure.code === 'account_delete_workspace_confirm'
          ) {
            if (!(await confirmWorkspaceDeletion(failure))) return;
            withWorkspaces = true;
            response = await send(true);
            if (!response.ok) failure = await readFailure(response);
          }
          if (!response.ok) {
            toaster.show(failureMessage(failure), 'warning');
            return;
          }
        }
        const message =
          action === 'approve'
            ? t('account_approved', 'Account approved')
            : action === 'unblock'
              ? t('account_unblocked', 'Account unblocked')
              : action === 'reject'
                ? t('account_rejected', 'Pending account rejected')
                : action === 'delete'
                  ? withWorkspaces
                    ? t(
                        'account_deleted_with_workspace',
                        'Account and its workspaces deleted'
                      )
                    : t('account_deleted', 'Account deleted')
                  : t('account_blocked', 'Account blocked');
        setSuccessMessage(message);
        toaster.show(message, 'success');
        await mutate();
      } finally {
        setBusyId('');
      }
    },
    [
      confirmWorkspaceDeletion,
      failureMessage,
      fetch,
      mutate,
      readFailure,
      t,
      toaster,
    ]
  );

  return (
    <AdminUsersView
      allowed={Boolean(user?.isSuperAdmin)}
      status={status}
      searchInput={searchInput}
      page={page}
      data={data}
      loading={isLoading}
      error={
        error
          ? t('accounts_load_failed', 'Could not load accounts.')
          : undefined
      }
      busyId={busyId}
      successMessage={successMessage}
      onStatusChange={(next) => {
        setPage(0);
        setStatus(next);
      }}
      onSearchInputChange={setSearchInput}
      onApplySearch={() => {
        setPage(0);
        setSearch(searchInput.trim());
      }}
      onRetry={() => void mutate()}
      onAction={(row, action) => void act(row, action)}
      onPageChange={setPage}
    />
  );
};
