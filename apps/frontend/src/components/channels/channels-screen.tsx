'use client';
import { type ComponentProps, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useCookie from 'react-use-cookie';
import useSWR from 'swr';
import clsx from 'clsx';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { Button } from '@contentfactory/react/form/button';
import { ControlButton } from '@contentfactory/react/choice/control.button';
import { Input } from '@contentfactory/react/form/input';
import { ButtonLink } from '@contentfactory/react/form/button-link';
import { useIntegrationList } from '../launches/helpers/use.integration.list';
import { CalendarContext, calendarDefaults } from '../launches/calendar.context';
import {
  AddProviderButton,
  AddProviderComponent,
} from '../launches/add.provider.component';
import { useUser } from '../layout/user.context';
import {
  isOrganizationAdmin,
  isOrganizationEditor,
} from '@contentfactory/nestjs-libraries/user/organization.roles';
import {
  Panel,
  EmptyState,
  ErrorState,
  SkeletonRows,
  Status,
} from '../ui/surface';
import { Segmented } from '../ui/segmented';
import { Table, Th, Td, Tr } from '../ui/table';
import { channelsCopy, type ChannelsLocale } from './channels.copy';
import {
  CHANNELS_VIEW_COOKIE,
  channelView,
  channelHref,
  filterChannels,
  groupChannels,
  matchesChannelFilter,
  channelProfileSummary,
  type ChannelFilter,
  type ChannelRow,
} from './channel-model';
import {
  ChannelAvatar,
  ChannelStatus,
  ChannelSlots,
  channelDate,
} from './channel-parts';
import { ChannelMenu } from './channel-menu';

function EmptyChannels({
  locale,
  reload,
}: {
  locale: ChannelsLocale;
  reload: () => void;
}) {
  const t = channelsCopy[locale];
  const user = useUser();
  const request = useFetch();
  const canManage = isOrganizationAdmin(user?.role);
  const { data, error, isLoading, mutate } = useSWR<
    ComponentProps<typeof AddProviderComponent>
  >(
    canManage ? '/integrations' : null,
    async (url: string) => {
      const response = await request(url);
      if (!response.ok) throw new Error('providers');
      return response.json();
    },
    { revalidateOnFocus: false }
  );
  return (
    <Panel contentClassName="flex flex-col gap-6">
      <EmptyState title={t.empty} description={t.emptyDescription} />
      {canManage ? (
        error ? (
          <ErrorState
            title={t.error}
            action={
              <Button variant="secondary" onClick={() => mutate()}>
                {t.retry}
              </Button>
            }
          />
        ) : isLoading ? (
          <SkeletonRows rows={3} label={t.loading} />
        ) : (
          data && (
            <AddProviderComponent {...data} invite={false} update={reload} />
          )
        )
      ) : (
        <p className="cf-body-sm text-cf-ink-muted">{t.readOnly}</p>
      )}
      <p className="rounded-[8px] bg-cf-info-soft p-4 cf-body-sm text-cf-info">
        {t.profileHint}
      </p>
    </Panel>
  );
}

function ChannelCard({
  row,
  locale,
  reload,
}: {
  row: ChannelRow;
  locale: ChannelsLocale;
  reload: () => void;
}) {
  const t = channelsCopy[locale];
  const href = channelHref(row.id);
  const router = useRouter();
  const summary = channelProfileSummary(row, locale);
  const user = useUser();
  const canWrite = isOrganizationEditor(user?.role);
  return (
    <article
      className="flex min-w-0 cursor-pointer flex-col gap-4 rounded-[8px] border border-cf-border bg-cf-surface p-5 transition-colors duration-state hover:border-cf-border-strong motion-reduce:transition-none"
      data-channel-id={row.id}
      onClick={(event) => {
        if (!(event.target as Element).closest('a, button, [data-row-action]'))
          router.push(href);
      }}
    >
      <div className="flex items-start gap-3">
        <ChannelAvatar row={row} />
        <div className="min-w-0 flex-1">
          <Link
            href={href}
            className="cf-heading-md text-cf-ink break-words hover:underline"
          >
            {row.name}
          </Link>
          <div>
            <ChannelStatus row={row} locale={locale} />
          </div>
        </div>
        <div data-row-action>
          <ChannelMenu row={row} reload={reload} />
        </div>
      </div>
      <p className="cf-caption text-cf-ink-muted">
        {row.identifier} · {row.contentLanguage ?? '—'}
      </p>
      {row.writingProfileStored ? (
        <p className="cf-body-sm text-cf-ink">{summary ?? t.stored}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Status tone="warning">{t.notStored}</Status>
          <span className="cf-caption text-cf-ink-muted">
            {t.defaults} {row.identifier}
          </span>
        </div>
      )}
      <p className="cf-caption text-cf-ink-muted">
        {t.lastPost} {channelDate(row.postsSummary?.lastPostAt)} ·{' '}
        {row.postsSummary?.total ?? '—'} {t.posts} ·{' '}
        {row.time?.length ? `${row.time.length} ${t.slots}` : t.noSlots}
      </p>
      <div className="mt-auto flex flex-wrap gap-2">
        <ButtonLink
          href={`${href}${
            row.writingProfileStored || !canWrite ? '' : '?edit=1'
          }#writing-profile`}
          variant="secondary"
          density="dense"
        >
          {row.writingProfileStored || !canWrite ? t.writing : t.fill}
        </ButtonLink>
        <ButtonLink href={href} variant="quiet" density="dense">
          {t.open}
        </ButtonLink>
      </div>
    </article>
  );
}

export function ChannelsScreen() {
  const { language } = useVariables();
  const locale: ChannelsLocale = language.startsWith('ru') ? 'ru' : 'en';
  const t = channelsCopy[locale];
  const router = useRouter();
  const user = useUser();
  const [cookie, setCookie] = useCookie(CHANNELS_VIEW_COOKIE, 'cards');
  const view = channelView(cookie);
  const [filter, setFilter] = useState<ChannelFilter>('all');
  const [search, setSearch] = useState('');
  const { data, error, isLoading, mutate } = useIntegrationList();
  const rows: ChannelRow[] = data ?? [];
  const filtered = useMemo(
    () => filterChannels(rows, filter, search),
    [rows, filter, search]
  );
  const groups = useMemo(() => groupChannels(filtered), [filtered]);
  const filters = (['all', 'working', 'attention', 'disabled'] as const).map(
    (value) => ({
      value,
      label: `${t[value]} · ${
        rows.filter((row) => matchesChannelFilter(row, value)).length
      }`,
    })
  );
  const reload = () => {
    void mutate();
  };
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-5 overflow-auto bg-cf-canvas p-5">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="cf-heading-lg text-cf-ink">{t.title}</h1>
          <p className="mt-1 cf-caption text-cf-ink-muted">{t.subtitle}</p>
        </div>
        <AddProviderButton primary label={t.connect} update={reload} />
      </header>
      {error ? (
        <ErrorState
          title={t.error}
          action={
            <Button variant="secondary" onClick={reload}>
              {t.retry}
            </Button>
          }
        />
      ) : isLoading ? (
        <SkeletonRows rows={6} label={t.loading} />
      ) : (
        <CalendarContext.Provider value={{ ...calendarDefaults, integrations: rows, loading: false }}>
          {!rows.length ? (
            <EmptyChannels locale={locale} reload={reload} />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <div className="hidden table:block">
                  <Segmented
                    label={t.view}
                    value={view}
                    onChange={setCookie}
                    options={[
                      { value: 'cards', label: t.cards },
                      { value: 'table', label: t.table },
                    ]}
                  />
                </div>
                <div className="max-w-full overflow-x-auto">
                  <Segmented
                    label={t.filter}
                    value={filter}
                    onChange={setFilter}
                    options={filters}
                  />
                </div>
                <Input
                  standalone
                  type="search"
                  aria-label={t.search}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t.search}
                  fieldClassName="min-w-0 flex-1"
                />
              </div>
              {!filtered.length ? (
                <EmptyState
                  title={t.noMatches}
                  description={t.noMatchesDescription}
                  action={
                    <Button
                      variant="quiet"
                      onClick={() => {
                        setFilter('all');
                        setSearch('');
                      }}
                    >
                      {t.clear}
                    </Button>
                  }
                />
              ) : (
                <>
                  <div
                    data-channel-view="cards"
                    className={clsx(
                      'flex flex-col gap-6',
                      view === 'table' && 'table:hidden'
                    )}
                  >
                    {groups.map((group) => (
                      <section
                        key={group.id}
                        className="flex flex-col gap-3"
                        aria-label={group.name || t.own}
                      >
                        <h2 className="cf-label-sm text-cf-ink-muted">
                          {group.name || t.own}
                        </h2>
                        <div className="grid grid-cols-1 gap-4 table:grid-cols-2 xl:grid-cols-3">
                          {group.rows.map((row) => (
                            <ChannelCard
                              key={row.id}
                              row={row}
                              locale={locale}
                              reload={reload}
                            />
                          ))}
                          {isOrganizationAdmin(user?.role) && (
                            <AddProviderButton
                              update={reload}
                              renderTrigger={(add) => (
                                <ControlButton
                                  layout="content"
                                  onClick={add}
                                  aria-label={t.connectNew}
                                  className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-[8px] border border-dashed border-cf-border-strong bg-transparent p-5 text-center text-cf-ink transition-colors duration-state hover:border-cf-accent hover:bg-cf-surface-subtle cf-pressed motion-reduce:transition-none"
                                >
                                  <svg
                                    aria-hidden="true"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.5"
                                    className="h-6 w-6"
                                  >
                                    <path d="M12 5v14M5 12h14" />
                                  </svg>
                                  <span className="cf-label-md">
                                    {t.connectNew}
                                  </span>
                                  <span className="cf-caption text-cf-ink-muted">
                                    {t.connectHint}
                                  </span>
                                </ControlButton>
                              )}
                            />
                          )}
                        </div>
                      </section>
                    ))}
                  </div>
                  {view === 'table' && (
                    <div
                      data-channel-view="table"
                      className="hidden table:block"
                    >
                      <Panel contentPadding="none">
                        <Table caption={t.title}>
                          <thead>
                            <tr>
                              {[
                                t.channel,
                                t.state,
                                t.writing,
                                t.schedule,
                                t.latest,
                                '',
                              ].map((label, index) => (
                                <Th key={index} banded>
                                  {label}
                                </Th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {filtered.map((row) => (
                              <Tr
                                key={row.id}
                                data-channel-id={row.id}
                                onClick={() => router.push(channelHref(row.id))}
                              >
                                <Td>
                                  <div className="flex items-center gap-3 py-3">
                                    <ChannelAvatar row={row} />
                                    <div className="min-w-0">
                                      <Link
                                        href={channelHref(row.id)}
                                        className="cf-label-md hover:underline"
                                      >
                                        {row.name}
                                      </Link>
                                      <p className="cf-caption text-cf-ink-muted">
                                        {row.identifier} ·{' '}
                                        {row.contentLanguage ?? '—'} ·{' '}
                                        {row.customer?.name || t.own}
                                      </p>
                                    </div>
                                  </div>
                                </Td>
                                <Td>
                                  <ChannelStatus row={row} locale={locale} />
                                </Td>
                                <Td>
                                  <Status
                                    tone={
                                      row.writingProfileStored
                                        ? 'accent'
                                        : 'warning'
                                    }
                                  >
                                    {row.writingProfileStored
                                      ? t.stored
                                      : t.defaults}
                                  </Status>
                                </Td>
                                <Td>
                                  <ChannelSlots row={row} locale={locale} />
                                </Td>
                                <Td>
                                  <p className="cf-caption text-cf-ink-muted">
                                    {channelDate(row.postsSummary?.lastPostAt)}{' '}
                                    · {row.postsSummary?.total ?? '—'} {t.posts}
                                  </p>
                                </Td>
                                <Td data-row-action>
                                  <ChannelMenu row={row} reload={reload} />
                                </Td>
                              </Tr>
                            ))}
                          </tbody>
                        </Table>
                      </Panel>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </CalendarContext.Provider>
      )}
    </div>
  );
}
