'use client';
import { Hint } from '@contentfactory/react/layout/hint';
import { useState, type ReactNode } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useMediaQuery } from '@mantine/hooks';
import useSWR from 'swr';
import clsx from 'clsx';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import { Button } from '@contentfactory/react/form/button';
import { ButtonLink } from '@contentfactory/react/form/button-link';
import {
  Tabs,
  Tab,
  TabList,
  TabPanel,
} from '@contentfactory/react/choice/tabs';
import {
  isOrganizationAdmin,
  isOrganizationEditor,
} from '@contentfactory/nestjs-libraries/user/organization.roles';
import { useUser } from '../layout/user.context';
import { useIntegrationList } from '../launches/helpers/use.integration.list';
import { CalendarContext, calendarDefaults } from '../launches/calendar.context';
import {
  Panel,
  Status,
  EmptyState,
  ErrorState,
  SkeletonRows,
} from '../ui/surface';
import { ChannelWritingProfile } from './channel-writing-profile';
import { channelsCopy, type ChannelsLocale } from './channels.copy';
import { publicChannelUrl, type ChannelRow } from './channel-model';
import {
  ChannelAvatar,
  ChannelStatus,
  ChannelSlots,
  channelDate,
} from './channel-parts';
import { ChannelMenu } from './channel-menu';

export type ChannelPosts = {
  total: number;
  posts: {
    id: string;
    content: string;
    publishDate: string;
    state: 'PUBLISHED' | 'QUEUE' | 'ERROR';
  }[];
};
function RecentPosts({
  row,
  locale,
}: {
  row: ChannelRow;
  locale: ChannelsLocale;
}) {
  const request = useFetch();
  const t = channelsCopy[locale];
  const { data, error, isLoading, mutate } = useSWR<ChannelPosts>(
    `/integrations/${encodeURIComponent(row.id)}/posts?limit=3`,
    async (url: string) => {
      const response = await request(url);
      if (!response.ok) throw new Error('channel posts');
      return response.json();
    },
    { revalidateOnFocus: false }
  );
  const calendarHref = row.customer?.id
    ? `/launches?customer=${encodeURIComponent(row.customer.id)}`
    : '/launches';
  return (
    <Panel
      title={t.recent}
      description={data ? `${data.total} ${t.posts}` : undefined}
      actions={
        <ButtonLink href={calendarHref} variant="quiet" density="dense">
          {t.calendar}
        </ButtonLink>
      }
    >
      {error ? (
        <ErrorState
          title={t.postsError}
          action={
            <Button variant="secondary" onClick={() => mutate()}>
              {t.retry}
            </Button>
          }
        />
      ) : isLoading ? (
        <SkeletonRows rows={3} label={t.loading} />
      ) : !data?.posts.length ? (
        <EmptyState title={t.noPosts} description={t.noPostsDescription} />
      ) : (
        <ul className="divide-y divide-cf-border">
          {data.posts.map((post) => (
            <li
              key={post.id}
              className="grid grid-cols-1 items-center gap-3 py-3 first:pt-0 last:pb-0 table:grid-cols-[140px_minmax(0,1fr)_auto]"
            >
              <time
                dateTime={post.publishDate}
                className="cf-caption text-cf-ink-muted"
              >
                {channelDate(post.publishDate, true)}
              </time>
              <p className="min-w-0 line-clamp-2 break-words cf-body-sm text-cf-ink">
                {post.content
                  .replace(/<br\s*\/?>(?:\s*)|<\/p>/gi, '\n')
                  .replace(/<[^>]*>/g, '')
                  .split('\n')
                  .find((line) => line.trim()) || t.untitled}
              </p>
              <Status
                tone={
                  post.state === 'PUBLISHED'
                    ? 'accent'
                    : post.state === 'ERROR'
                    ? 'warning'
                    : 'neutral'
                }
              >
                {post.state === 'PUBLISHED'
                  ? t.published
                  : post.state === 'ERROR'
                  ? t.failed
                  : t.queued}
              </Status>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function ChannelDetail({
  row,
  locale,
  reload,
}: {
  row: ChannelRow;
  locale: ChannelsLocale;
  reload: () => void;
}) {
  const t = channelsCopy[locale];
  const user = useUser();
  const params = useSearchParams();
  const canManage = isOrganizationAdmin(user?.role);
  const canWrite = isOrganizationEditor(user?.role);
  const [tab, setTab] = useState('profile');
  const mobile = useMediaQuery('(max-width: 719px)');
  const publicUrl = publicChannelUrl(row.publicUrl);
  const section = (value: string, children: ReactNode) =>
    mobile ? (
      <TabPanel value={value} hidden={tab !== value}>
        {children}
      </TabPanel>
    ) : (
      <div>{children}</div>
    );
  return (
    <ChannelMenu
      row={row}
      reload={reload}
      renderActions={(menu, actions) => (
        <>
          <div>
            <ButtonLink href="/channels" variant="quiet" density="dense">
              <span className="table:hidden">{t.backMobile}</span>
              <span className="hidden table:inline">{t.back}</span>
            </ButtonLink>
          </div>
          <header className="flex flex-wrap items-center gap-4">
            <ChannelAvatar row={row} />
            <div className="min-w-0 flex-1">
              <h1 className="break-words cf-heading-lg text-cf-ink">
                {row.name}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <Status>
                  {row.identifier} · {row.contentLanguage ?? '—'}
                </Status>
                <ChannelStatus row={row} locale={locale} />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ButtonLink href="/content?tab=materials" variant="secondary">
                {t.pieces}
              </ButtonLink>
              <Hint label={`${locale === 'ru' ? 'Подсказка' : 'Hint'}: ${t.pieces}`}>{locale === 'ru' ? 'Заготовки — общие мысли и материалы. Выберите одну, чтобы адаптировать её для этого канала.' : 'Pieces hold source ideas and material. Choose one to adapt for this channel.'}</Hint>
              {publicUrl && (
                <ButtonLink
                  href={publicUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="quiet"
                >
                  {t.publicLink}
                </ButtonLink>
              )}
              {menu}
            </div>
          </header>
          {(row.refreshNeeded || row.inBetweenSteps) && (
            <div
              className="flex flex-wrap items-center gap-3 rounded-[8px] border border-cf-warning bg-cf-warning-soft p-4"
              role="status"
            >
              <p className="min-w-0 flex-1 cf-body-sm text-cf-ink">
                {row.inBetweenSteps ? t.incompleteWarning : t.refreshWarning}
                {!canManage && ` ${t.adminHelp}`}
              </p>
              {canManage &&
                (row.inBetweenSteps ? (
                  <ButtonLink
                    href={`/launches?added=${encodeURIComponent(
                      row.identifier
                    )}&continue=${encodeURIComponent(row.id)}`}
                    variant="secondary"
                  >
                    {t.continue}
                  </ButtonLink>
                ) : (
                  actions.reconnect && (
                    <Button variant="secondary" onClick={actions.reconnect}>
                      {t.reconnect}
                    </Button>
                  )
                ))}
            </div>
          )}
          <Tabs value={tab} onChange={setTab}>
            {mobile && (
              <TabList
                aria-label={t.title}
                className="flex max-w-full gap-1 overflow-x-auto border-b border-cf-border"
              >
                {[
                  ['profile', t.cardTab],
                  ['schedule', t.schedule],
                  ['posts', t.postsTab],
                  ['connection', t.connection],
                ].map(([value, label]) => (
                  <Tab
                    key={value}
                    value={value}
                    className={clsx(
                      'px-3 cf-label-sm',
                      tab === value ? 'text-cf-accent' : 'text-cf-ink-muted'
                    )}
                  >
                    {label}
                  </Tab>
                ))}
              </TabList>
            )}
            <div className="flex flex-col gap-4">
              {section(
                'profile',
                <div id="writing-profile">
                  <ChannelWritingProfile
                    integrationId={row.id}
                    integrationName={row.name}
                    locale={locale}
                    canWrite={canWrite}
                    initiallyEditing={canWrite && params.get('edit') === '1'}
                    onSaved={reload}
                  />
                </div>
              )}
              {section(
                'schedule',
                <Panel
                  title={<span className="flex items-center gap-[4px]">{t.schedule}<Hint label={`${locale === 'ru' ? 'Подсказка' : 'Hint'}: ${t.schedule}`}>{locale === 'ru' ? 'Время, в которое канал обычно публикует посты. При планировании можно выбрать другую дату.' : 'Usual publication times. Scheduling can use a different date.'}</Hint></span>}
                  actions={
                    actions.schedule && (
                      <Button
                        variant="secondary"
                        density="dense"
                        onClick={actions.schedule}
                      >
                        {t.edit}
                      </Button>
                    )
                  }
                >
                  <ChannelSlots row={row} locale={locale} />
                  {!!row.time?.length && (
                    <p className="mt-3 cf-caption text-cf-ink-muted">
                      {t.timezone}
                    </p>
                  )}
                </Panel>
              )}
              {section('posts', <RecentPosts row={row} locale={locale} />)}
              {section(
                'connection',
                <Panel
                  title={t.connection}
                  contentClassName="flex flex-col gap-5"
                >
                  <dl className="grid grid-cols-1 gap-3 table:grid-cols-[160px_1fr]">
                    <dt className="cf-label-sm text-cf-ink-muted">
                      {t.platform}
                    </dt>
                    <dd className="cf-body-sm text-cf-ink">{row.identifier}</dd>
                    {row.contentLanguage && (
                      <>
                        <dt className="cf-label-sm text-cf-ink-muted">
                          {t.language}
                        </dt>
                        <dd className="cf-body-sm text-cf-ink">
                          {row.contentLanguage === 'ru'
                            ? locale === 'ru'
                              ? 'Русский'
                              : 'Russian'
                            : locale === 'ru'
                            ? 'Английский'
                            : 'English'}
                        </dd>
                      </>
                    )}
                    {row.createdAt && (
                      <>
                        <dt className="cf-label-sm text-cf-ink-muted">
                          {t.connected}
                        </dt>
                        <dd className="cf-caption text-cf-ink">
                          {channelDate(row.createdAt)}
                        </dd>
                      </>
                    )}
                    <dt className="cf-label-sm text-cf-ink-muted">{t.group}</dt>
                    <dd className="flex flex-wrap items-center gap-2 cf-body-sm text-cf-ink">
                      {row.customer?.name || t.own}
                      {actions.group && (
                        <Button
                          variant="quiet"
                          density="dense"
                          onClick={actions.group}
                        >
                          {t.move}
                        </Button>
                      )}
                    </dd>
                  </dl>
                  {canManage ? (
                    <div className="flex flex-wrap gap-2">
                      {actions.reconnect && (
                        <Button
                          variant="quiet"
                          density="dense"
                          onClick={actions.reconnect}
                        >
                          {t.reconnect}
                        </Button>
                      )}
                      {actions.changeBot && (
                        <Button
                          variant="quiet"
                          density="dense"
                          onClick={actions.changeBot}
                        >
                          {t.changeBot}
                        </Button>
                      )}
                      {actions.enable && (
                        <Button
                          variant="quiet"
                          density="dense"
                          onClick={actions.enable}
                        >
                          {t.enable}
                        </Button>
                      )}
                      {actions.disable && (
                        <Button
                          variant="quiet"
                          density="dense"
                          onClick={actions.disable}
                        >
                          {t.disable}
                        </Button>
                      )}
                      {actions.remove && (
                        <Button
                          variant="quiet"
                          density="dense"
                          className="text-cf-danger"
                          onClick={actions.remove}
                        >
                          {t.remove}
                        </Button>
                      )}
                    </div>
                  ) : (
                    <p className="cf-body-sm text-cf-ink-muted">{t.readOnly}</p>
                  )}
                </Panel>
              )}
            </div>
          </Tabs>
        </>
      )}
    />
  );
}

export function ChannelScreen() {
  const params = useParams<{ id: string }>();
  const { language } = useVariables();
  const locale: ChannelsLocale = language.startsWith('ru') ? 'ru' : 'en';
  const t = channelsCopy[locale];
  const { data, isLoading, error, mutate } = useIntegrationList();
  const rows: ChannelRow[] = data ?? [];
  const row = rows.find((item) => item.id === params.id);
  const reload = () => {
    void mutate();
  };
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-5 overflow-auto bg-cf-canvas p-5">
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
      ) : !row ? (
        <EmptyState
          title={t.missing}
          description={t.missingDescription}
          action={
            <ButtonLink href="/channels" variant="quiet">
              {t.back}
            </ButtonLink>
          }
        />
      ) : (
        <CalendarContext.Provider value={{ ...calendarDefaults, integrations: rows, loading: false }}>
          <ChannelDetail
            key={row.id}
            row={row}
            locale={locale}
            reload={reload}
          />
        </CalendarContext.Provider>
      )}
    </div>
  );
}
