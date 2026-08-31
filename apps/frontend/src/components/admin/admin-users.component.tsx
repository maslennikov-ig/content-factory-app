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

export type AdminUserStatus = 'pending' | 'active' | 'all';

export interface AdminAccountRow {
  id: string;
  email: string;
  name: string | null;
  activated: boolean;
  isSuperAdmin: boolean;
  providerName: string;
  createdAt: string;
  lastOnline: string;
  organizations: { role: string; organization: { id: string; name: string } }[];
}

export interface AdminAccountsResponse {
  users: AdminAccountRow[];
  pending: number;
  total: number;
  approvalRequired: boolean;
}

const PAGE_SIZE = 25;
const formatDate = (value: string) =>
  new Date(value).toISOString().slice(0, 16).replace('T', ' ');

function StateBadge({
  activated,
  label,
}: {
  activated: boolean;
  label: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-[6px] rounded-full border px-[8px] py-[2px] cf-label-sm ${
        activated
          ? 'border-cf-accent bg-cf-accent-soft text-cf-accent'
          : 'border-cf-warning bg-cf-warning-soft text-cf-warning'
      }`}
    >
      <span aria-hidden="true">{activated ? '●' : '○'}</span>
      {label}
    </span>
  );
}

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
  onAction: (row: AdminAccountRow, action: 'approve' | 'block') => void;
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
                  <div>{t('label_email', 'Email')}</div>
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
                    <div className="min-w-0">
                      <div className="break-words cf-body-sm text-cf-ink">
                        {row.email}
                      </div>
                      <div className="break-words cf-caption text-cf-ink-muted">
                        {row.name ||
                          row.organizations[0]?.organization.name ||
                          '—'}
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
                        {formatDate(row.createdAt)}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-[8px]">
                      <StateBadge
                        activated={row.activated}
                        label={
                          row.activated
                            ? t('active', 'Active')
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
                      {!row.activated && (
                        <Button
                          loading={busyId === row.id}
                          onClick={() => onAction(row, 'approve')}
                        >
                          {t('approve', 'Approve')}
                        </Button>
                      )}
                      {row.activated && !row.isSuperAdmin && (
                        <Button
                          secondary
                          loading={busyId === row.id}
                          onClick={() => onAction(row, 'block')}
                        >
                          {t('block', 'Block')}
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

  const act = useCallback(
    async (row: AdminAccountRow, action: 'approve' | 'block') => {
      setBusyId(row.id);
      setSuccessMessage('');
      try {
        const response = await fetch(`/admin/users/${row.id}/${action}`, {
          method: 'POST',
        });
        if (!response.ok) {
          toaster.show(
            (await response.text()) || t('action_failed', 'Action failed'),
            'warning'
          );
          return;
        }
        const message =
          action === 'approve'
            ? t('account_approved', 'Account approved')
            : t('account_blocked', 'Account blocked');
        setSuccessMessage(message);
        toaster.show(message, 'success');
        await mutate();
      } finally {
        setBusyId('');
      }
    },
    [fetch, mutate, toaster, t]
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
