'use client';
import { useCallback, useMemo, useRef, useState } from 'react';
import type { Dayjs } from 'dayjs';
import useSWR from 'swr';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { useInterfaceLanguage } from '@contentfactory/react/translation/use-interface-language';
import { Button } from '@contentfactory/react/form/button';
import { ButtonLink } from '@contentfactory/react/form/button-link';
import { Input } from '@contentfactory/react/form/input';
import { PlatformBadge } from '@contentfactory/react/platform/platform.badge';
import {
  RadioGroup,
  RadioOption,
} from '@contentfactory/react/choice/radio.group';
import { useModals } from '../layout/new-modal';
import { useUser } from '../layout/user.context';
import { isOrganizationEditor } from '@contentfactory/nestjs-libraries/user/organization.roles';
import { EmptyState, ErrorState, SkeletonRows, Status } from '../ui/surface';
import { Segmented } from '../ui/segmented';
import { ChannelMark } from '../ui/brand/channel-mark';
import { useCalendar, type Integrations } from './calendar.context';
import { useOpenPost } from '../content-intelligence/shared/use-open-post';
import { useOpenPostEditor } from '../new-launch/compose.modal';
import { calendarPlanningCopy } from './calendar-planning.copy';

export type ReadyAdaptation = {
  adaptationId: string;
  pieceId: string;
  pieceCode: string;
  title: string;
  firstLine: string;
  integrationId: string;
  postId: string;
  readyAt: string;
};
export const READY_ADAPTATIONS_URL =
  '/content-intelligence/pieces/ready-adaptations?limit=50';

export function AdaptationPicker({
  integrations,
  date,
  initialChannel,
  onClose,
  onSaved,
}: {
  integrations: Integrations[];
  date?: Dayjs;
  initialChannel?: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const request = useFetch();
  const language = useInterfaceLanguage();
  const locale = language.startsWith('ru') ? 'ru' : 'en';
  const copy = calendarPlanningCopy[locale];
  const canWrite = isOrganizationEditor(useUser()?.role);
  const openPost = useOpenPost(integrations);
  const openBlank = useOpenPostEditor();
  const [query, setQuery] = useState('');
  const [channel, setChannel] = useState(initialChannel || '');
  const [selected, setSelected] = useState('');
  const [opening, setOpening] = useState(false);
  const busy = useRef(false);
  const [openError, setOpenError] = useState(false);
  const scopedUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set('integrationIds', integrations.map((item) => item.id).sort().join(','));
    return `${READY_ADAPTATIONS_URL}&${params.toString()}`;
  }, [integrations]);
  const load = useCallback(async () => {
    const response = await request(scopedUrl);
    if (!response.ok) throw new Error('adaptations unavailable');
    const body = await response.json();
    if (body.version !== 'ready-adaptations/v1' || !Array.isArray(body.items))
      throw new Error('unsupported adaptations');
    return body.items as ReadyAdaptation[];
  }, [request, scopedUrl]);
  const { data, error, isLoading, mutate } = useSWR(
    canWrite ? scopedUrl : null,
    load
  );
  const channels = useMemo(
    () => new Map(integrations.map((one) => [one.id, one])),
    [integrations]
  );
  const rows = useMemo(
    () =>
      (data || []).filter((row) => {
        const integration = channels.get(row.integrationId);
        return (
          integration &&
          (!channel || row.integrationId === channel) &&
          `${row.title} ${integration.name}`
            .toLocaleLowerCase(locale)
            .includes(query.trim().toLocaleLowerCase(locale))
        );
      }),
    [data, channels, channel, query, locale]
  );
  const chosen = rows.find((row) => row.adaptationId === selected);
  const open = async (blank = false) => {
    if (
      !canWrite ||
      busy.current ||
      (!blank && !chosen) ||
      (blank && !integrations.length)
    )
      return;
    busy.current = true;
    setOpening(true);
    setOpenError(false);
    try {
      const ok = blank
        ? (await openBlank({
            integrations,
            date,
            mutate: onSaved,
            ...(channel
              ? { selectedChannels: [channel], focusedChannel: channel }
              : {}),
          }),
          true)
        : await openPost(chosen!.postId, {
            date,
            focusedChannel: chosen!.integrationId,
            mutate: onSaved,
          });
      if (!ok) throw new Error('editor unavailable');
      onClose();
    } catch {
      setOpenError(true);
    } finally {
      busy.current = false;
      setOpening(false);
    }
  };
  const dateCaption = date
    ? new Intl.DateTimeFormat(locale, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }).format(date.toDate()) +
      ' · ' +
      date.format('HH:mm') +
      ' · ' +
      copy.changeDate
    : copy.noDate;
  return (
    <div className="flex min-w-0 flex-col gap-[20px] text-cf-ink">
      <p className="cf-caption text-cf-ink-muted">{dateCaption}</p>
      {!canWrite ? (
        <EmptyState title={copy.readonly} />
      ) : isLoading ? (
        <SkeletonRows rows={3} label={copy.loading} />
      ) : error ? (
        <ErrorState
          title={copy.error}
          action={
            <Button variant="secondary" onClick={() => mutate()}>
              {copy.retry}
            </Button>
          }
        />
      ) : !data?.length ? (
        <EmptyState
          title={copy.empty}
          description={copy.emptyHint}
          action={
            <ButtonLink href="/content" onClick={onClose}>
              {copy.content}
            </ButtonLink>
          }
        />
      ) : (
        <>
          <Input
            name="adaptation-search"
            label={copy.search}
            disableForm
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelected('');
            }}
          />
          <div className="overflow-x-auto">
            <Segmented
              label={copy.allChannels}
              value={channel}
              onChange={(value) => {
                setChannel(value);
                setSelected('');
              }}
              options={[
                { value: '', label: copy.allChannels },
                ...integrations
                  .filter((one) =>
                    data.some((row) => row.integrationId === one.id)
                  )
                  .map((one) => ({ value: one.id, label: one.name })),
              ]}
              className="whitespace-nowrap"
            />
          </div>
          <p className="cf-caption text-cf-ink-muted" aria-live="polite">
            {copy.ready} · {rows.length}
          </p>
          {!rows.length ? (
            <EmptyState
              title={copy.noMatches}
              action={
                <Button
                  variant="quiet"
                  onClick={() => {
                    setQuery('');
                    setChannel('');
                  }}
                >
                  {copy.reset}
                </Button>
              }
            />
          ) : (
            <RadioGroup
              aria-label={copy.title}
              value={chosen?.adaptationId || ''}
              onChange={setSelected}
              className="flex max-h-[40vh] flex-col overflow-y-auto gap-[4px]"
            >
              {rows.map((row) => {
                const integration = channels.get(row.integrationId)!;
                return (
                  <RadioOption
                    key={row.adaptationId}
                    value={row.adaptationId}
                    layout="content"
                    className={`flex items-center gap-[12px] rounded-[8px] p-[12px] text-start ${
                      chosen?.adaptationId === row.adaptationId
                        ? 'bg-cf-accent-soft text-cf-ink'
                        : 'hover:bg-cf-surface-subtle text-cf-ink'
                    }`}
                  >
                    <span className="relative shrink-0">
                      {integration.picture ? (
                        <img
                          src={integration.picture}
                          alt=""
                          width={32}
                          height={32}
                          className="h-[32px] w-[32px] rounded-full object-cover"
                          onError={(event) => {
                            event.currentTarget.onerror = null;
                            event.currentTarget.src = '/no-picture.jpg';
                          }}
                        />
                      ) : (
                        <ChannelMark name={integration.name} size={32} />
                      )}
                      <PlatformBadge
                        identifier={integration.identifier}
                        size={16}
                        className="absolute -bottom-[4px] -end-[4px]"
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="cf-label-md block break-words">
                        {row.title || row.firstLine}
                      </span>
                      <span className="cf-caption block text-cf-ink-muted break-words">
                        {row.pieceCode} · {integration.name}
                      </span>
                    </span>
                    <Status
                      tone="accent"
                      icon={<span aria-hidden>✓</span>}
                      className="shrink-0"
                    >
                      {copy.readyAt}{' '}
                      {new Intl.DateTimeFormat(locale, {
                        day: '2-digit',
                        month: '2-digit',
                      }).format(new Date(row.readyAt))}
                    </Status>
                  </RadioOption>
                );
              })}
            </RadioGroup>
          )}
        </>
      )}
      {openError && (
        <ErrorState
          title={copy.openError}
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setSelected('');
                void mutate();
              }}
            >
              {copy.retry}
            </Button>
          }
        />
      )}
      {!integrations.length && (
        <p className="cf-body-sm text-cf-ink-muted">
          {copy.noChannels}{' '}
          <ButtonLink href="/channels" variant="quiet" onClick={onClose}>
            {copy.channelsLink}
          </ButtonLink>
        </p>
      )}
      <div className="flex flex-wrap items-center gap-[12px] border-t border-cf-border pt-[16px]">
        <div className="flex-1">
          <Button
            variant="quiet"
            disabled={!canWrite || opening || !integrations.length}
            onClick={() => void open(true)}
          >
            {copy.blank}
          </Button>
          <p className="cf-caption text-cf-ink-muted">{copy.blankHint}</p>
        </div>
        <Button variant="secondary" disabled={opening} onClick={onClose}>
          {copy.cancel}
        </Button>
        {!!data?.length && (
          <Button
            disabled={!canWrite || !chosen || opening}
            onClick={() => void open()}
          >
            {copy.open}
          </Button>
        )}
      </div>
    </div>
  );
}

export function useAdaptationPicker() {
  const modal = useModals();
  const language = useInterfaceLanguage();
  const { integrations, reloadCalendarView, integrationId } = useCalendar();
  const title =
    calendarPlanningCopy[language.startsWith('ru') ? 'ru' : 'en'].title;
  return useCallback(
    (date?: Dayjs) => {
      modal.openModal({
        title,
        size: 600,
        closeOnEscape: true,
        closeOnClickOutside: true,
        withCloseButton: true,
        children: (close) => (
          <AdaptationPicker
            integrations={integrations}
            date={date}
            initialChannel={integrationId}
            onClose={close}
            onSaved={reloadCalendarView}
          />
        ),
      });
    },
    [modal, title, integrations, integrationId, reloadCalendarView]
  );
}
