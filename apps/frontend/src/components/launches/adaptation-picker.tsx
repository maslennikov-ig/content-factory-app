'use client';
import { useCallback, useMemo, useState } from 'react';
import type { Dayjs } from 'dayjs';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import {
  PIECE_ADAPTATION_WORKSPACE_ROUTES,
  type PieceAdaptationPlacementV1,
} from '@contentfactory/nestjs-libraries/content-intelligence/pieces/adaptation-workspace.contract';
import { Hint } from '@contentfactory/react/layout/hint';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { useInterfaceLanguage } from '@contentfactory/react/translation/use-interface-language';
import { Button } from '@contentfactory/react/form/button';
import { ButtonLink } from '@contentfactory/react/form/button-link';
import { Input } from '@contentfactory/react/form/input';
import {
  RadioGroup,
  RadioOption,
} from '@contentfactory/react/choice/radio.group';
import { useModals } from '../layout/new-modal';
import { useUser } from '../layout/user.context';
import { isOrganizationEditor } from '@contentfactory/nestjs-libraries/user/organization.roles';
import { EmptyState, ErrorState, SkeletonRows } from '../ui/surface';
import { Segmented } from '../ui/segmented';
import { Select } from '@contentfactory/react/form/select';
import { ChannelAvatar } from '../channels/channel-parts';
import { useCalendar, type Integrations } from './calendar.context';
import {
  NEW_PIECE_PATH,
  pieceSlotPath,
} from '../content-intelligence/pieces/pieces.adapter';
import { calendarPlanningCopy } from './calendar-planning.copy';
import { PlanStatePill, PlusIcon } from './post-card.parts';
import type { PlanState } from './calendar-plan';

export type ReadyAdaptation = {
  adaptationId: string;
  pieceId: string;
  pieceCode: string;
  title: string;
  firstLine: string;
  integrationId: string;
  postId: string;
  readyAt: string;
  /** Где адаптация стоит сейчас (`97dq.57`); нет у старого сервера. */
  slot?: {
    status: 'reserved' | 'queued' | 'free';
    date: string | null;
    autopilot: boolean;
  };
};
export const READY_ADAPTATIONS_URL =
  '/content-intelligence/pieces/ready-adaptations?limit=50';

/**
 * «Что публикуем» — выбор готовой адаптации для слота календаря.
 *
 * `97dq.50`, вариант A холста одиннадцатого захода. Выбор ведёт во вкладку
 * канала заготовки с датой слота (`?when=`), а не в старое окно поста: там
 * текст, проверки и «Запланировать» (`97dq.37`, «из заготовки — во вкладку»).
 * Само окно ничего не пишет — только ведёт. «Чистый лист» ушёл: новая мысль
 * начинается заготовкой, тихой ссылкой в подвале.
 *
 * Строка списка не сжимается (`shrink-0`): в прокручиваемой колонке с
 * `max-h` строки без него ужимались ниже своего текста, и заголовок
 * наезжал на подпись `cnt-…` соседней строки (скриншот B6_2).
 *
 * У одной заготовки бывает две адаптации в один канал (две версии текста,
 * обе черновики). Заголовок заготовки у них один, поэтому такие строки
 * называются началом своего текста — иначе список показывал две одинаковые
 * строки (двенадцатый заход, 10-picker-d).
 *
 * С `97dq.57` окно пишет: «Поставить на ЧЧ:ММ» ставит выбранную адаптацию на
 * это время по режиму канала (`POST …/place`) и только потом ведёт во
 * вкладку. Список показывает и забронированные, и стоящие в очереди — со
 * временем («в плане · пт 25.09 09:20»), а черновик без времени — «свободна».
 * Экран подтверждения после постановки рисуется отдельно; ответ двери несёт
 * время и режим для любого из вариантов.
 *
 * `97dq.72` (тринадцатый заход, B3): полоса вкладок по каналам ушла — на
 * 400 px она давала горизонтальную прокрутку, а канал, у которого в дневном
 * виде стоял и пост, и слот в одно время, приходил в список дважды. Теперь
 * над списком один ряд фильтров: канал выбирается `Select` (каналы
 * уникальны по id), состояние — полосой «Все · Свободные · В плане ·
 * В очереди» со счётчиками. Поиск идёт по заголовку, коду `cnt-` и имени
 * канала без учёта регистра и пробелов. В строке имя канала обрезается, а
 * целиком видно по наведению и по фокусу; состояние с полной датой не
 * обрезается никогда — при нехватке места оно уходит на вторую строку.
 */
export function AdaptationPicker({
  integrations,
  date,
  initialChannel,
  onClose,
  onPlaced,
}: {
  integrations: Integrations[];
  date?: Dayjs;
  initialChannel?: string | null;
  onClose: () => void;
  /** After a placement is written: the calendar behind reloads at once. */
  onPlaced?: () => void;
}) {
  const request = useFetch();
  const language = useInterfaceLanguage();
  const locale = language.startsWith('ru') ? 'ru' : 'en';
  const copy = calendarPlanningCopy[locale];
  const canWrite = isOrganizationEditor(useUser()?.role);
  const [query, setQuery] = useState('');
  const [channel, setChannel] = useState(initialChannel || '');
  const [stateFilter, setStateFilter] = useState<PickerStateFilter>('all');
  const [selected, setSelected] = useState('');
  const router = useRouter();
  const [placing, setPlacing] = useState(false);
  const [placeFailed, setPlaceFailed] = useState<string | null>(null);
  const [placed, setPlaced] = useState<{
    row: ReadyAdaptation;
    placement: PieceAdaptationPlacementV1;
    target: string;
  } | null>(null);
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
  /*
    One entry per integration id. The day view hands in the channels of one
    time row, and a channel with both a post and a slot at 09:20 arrived twice
    («Тестовая группа Content Factory» ×2 on the owner's one channel).
  */
  const unique = useMemo(() => uniqueById(integrations), [integrations]);
  const channels = useMemo(
    () => new Map(unique.map((one) => [one.id, one])),
    [unique]
  );
  /*
    The slot's channel is preselected; a channel with nothing ready would
    open on an empty list, so it falls back to «Все каналы».
  */
  const activeChannel =
    channel && data?.some((row) => row.integrationId === channel)
      ? channel
      : '';
  const needle = searchKey(query, locale);
  /* Channel and search first: the state counts are counted inside them. */
  const scoped = useMemo(
    () =>
      (data || []).filter((row) => {
        const integration = channels.get(row.integrationId);
        return (
          integration &&
          (!activeChannel || row.integrationId === activeChannel) &&
          (!needle ||
            searchKey(
              `${row.title} ${row.pieceCode} ${integration.name}`,
              locale
            ).includes(needle))
        );
      }),
    [data, channels, activeChannel, needle, locale]
  );
  const stateCounts = useMemo(() => {
    const counts = { all: scoped.length, free: 0, reserved: 0, queued: 0 };
    for (const row of scoped) counts[rowState(row)] += 1;
    return counts;
  }, [scoped]);
  const rows = useMemo(
    () =>
      stateFilter === 'all'
        ? scoped
        : scoped.filter((row) => rowState(row) === stateFilter),
    [scoped, stateFilter]
  );
  const channelOptions = useMemo(() => {
    const present = unique.filter((one) =>
      (data || []).some((row) => row.integrationId === one.id)
    );
    const names = new Map<string, number>();
    for (const one of present) names.set(one.name, (names.get(one.name) || 0) + 1);
    // Two different channels with one name are told apart by the platform.
    return present.map((one) => ({
      value: one.id,
      label:
        (names.get(one.name) || 0) > 1 && one.identifier
          ? `${one.name} · ${one.identifier}`
          : one.name,
    }));
  }, [unique, data]);
  const twins = useMemo(() => {
    const seen = new Map<string, number>();
    for (const row of data || []) {
      const key = `${row.pieceId}:${row.integrationId}`;
      seen.set(key, (seen.get(key) || 0) + 1);
    }
    return seen;
  }, [data]);
  const chosen = rows.find((row) => row.adaptationId === selected);
  const time = date ? date.format('HH:mm') : '';
  const dayMonth = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit' }),
    [locale]
  );
  const weekday = useMemo(
    () => new Intl.DateTimeFormat(locale, { weekday: 'short' }),
    [locale]
  );
  const slotLabel = (row: ReadyAdaptation): string | null => {
    const slot = row.slot;
    if (!slot) return null;
    if (slot.status === 'free') return copy.slotFree;
    const word = slot.status === 'queued' ? copy.slotQueued : copy.slotReserved;
    const at = slot.date ? new Date(slot.date) : null;
    if (!at || Number.isNaN(at.getTime())) return word;
    const two = (value: number) => String(value).padStart(2, '0');
    const moment = `${weekday.format(at).replace('.', '')} ${dayMonth.format(
      at
    )} ${two(at.getHours())}:${two(at.getMinutes())}`;
    return `${word} · ${moment}${
      slot.status === 'queued' && slot.autopilot ? ` · ${copy.slotAutopilot}` : ''
    }`;
  };
  const target = chosen
    ? pieceSlotPath(chosen.pieceId, chosen.integrationId, date?.toDate())
    : '';
  /*
    «Поставить на ЧЧ:ММ» пишет: адаптация встаёт на это время по режиму
    своего канала. С `97dq.59` (холст C3 A) окно после ответа остаётся и
    говорит, где она теперь: «Стоит в плане» / «Стоит в очереди», карточка,
    слово режима и что будет дальше. Во вкладку канала с тем же `?when=`
    ведёт «Открыть и поправить». Отказ остаётся в окне словами — человек
    видит, что ничего не поставлено.
  */
  const place = async () => {
    if (!chosen || !date || placing) return;
    setPlacing(true);
    setPlaceFailed(null);
    try {
      const response = await request(
        PIECE_ADAPTATION_WORKSPACE_ROUTES.place.path(
          chosen.pieceId,
          chosen.adaptationId
        ) + `?language=${locale}`,
        {
          method: PIECE_ADAPTATION_WORKSPACE_ROUTES.place.method,
          body: JSON.stringify({ date: date.toDate().toISOString() }),
        }
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        // The door answers `{ code, message }` in the reader's language.
        throw new Error(
          typeof body?.message === 'string' && body.message.trim()
            ? body.message.trim()
            : ''
        );
      }
      const placement = body?.placement as PieceAdaptationPlacementV1 | undefined;
      setPlaced({
        row: chosen,
        placement: placement ?? {
          mode: 'reserve',
          status: 'reserved',
          date: date.toDate().toISOString(),
          autopilot: false,
          note: null,
        },
        target: pieceSlotPath(
          chosen.pieceId,
          chosen.integrationId,
          placement?.date ? new Date(placement.date) : date.toDate()
        ),
      });
      onPlaced?.();
    } catch (failure) {
      setPlaceFailed(
        (failure instanceof Error && failure.message) || copy.placeFailed
      );
    } finally {
      setPlacing(false);
    }
  };
  if (placed) {
    const { row, placement } = placed;
    const integration = channels.get(row.integrationId);
    const state: PlanState =
      placement.status === 'queued'
        ? 'queued'
        : placement.status === 'reserved'
        ? 'reserved'
        : 'draft';
    const words = {
      queued: [copy.placedQueued, copy.modeAutopilot, copy.explainAutopilot],
      reserved: [copy.placedReserved, copy.modeReserve, copy.explainReserve],
      draft: [copy.placedDraft, copy.modeDraft, copy.explainDraft],
    } as const;
    const [title, modeWord, explain] =
      words[state as 'queued' | 'reserved' | 'draft'];
    const at = new Date(placement.date);
    const two = (value: number) => String(value).padStart(2, '0');
    const moment = Number.isNaN(at.getTime())
      ? ''
      : `${weekday.format(at).replace('.', '')} ${dayMonth.format(at)}, ${two(
          at.getHours()
        )}:${two(at.getMinutes())}`;
    const name =
      (twins.get(`${row.pieceId}:${row.integrationId}`) || 0) > 1
        ? row.firstLine || row.title
        : row.title || row.firstLine;
    return (
      <div
        data-picker-placed={placement.status}
        className="flex min-w-0 flex-col gap-[16px] text-cf-ink"
      >
        <div role="status" className="flex items-center gap-[8px]">
          <span className="flex text-cf-accent">
            <PlacedGlyph />
          </span>
          <h3 className="cf-heading-md">{title}</h3>
        </div>
        <div className="flex min-w-0 items-center gap-[12px] rounded-[8px] border border-cf-border bg-cf-surface p-[12px]">
          {integration ? <ChannelAvatar row={integration} compact /> : null}
          <span className="flex min-w-0 flex-1 flex-col gap-[4px]">
            <span className="cf-body-md block truncate" title={name}>
              {name}
            </span>
            <span className="cf-caption block truncate text-cf-ink-muted">
              <span className="text-cf-signature">{row.pieceCode}</span>
              {' · '}
              {integration?.name}
              {moment ? ` · ${moment}` : ''}
            </span>
          </span>
          <span className="inline-flex shrink-0 items-center">
            <PlanStatePill state={state} label={modeWord} />
            <Hint label={copy.modeHintLabel} side="start">
              {copy.modeHint}
            </Hint>
          </span>
        </div>
        {placement.note ? (
          <p data-picker-plan-note="true" className="cf-body-sm text-cf-warning">
            {placement.note}
          </p>
        ) : (
          <p data-picker-explain={state} className="cf-body-sm text-cf-ink-muted">
            {explain}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-[12px] border-t border-cf-border pt-[16px]">
          <div className="flex-1">
            <Button
              variant="quiet"
              data-picker-another="true"
              onClick={() => {
                setPlaced(null);
                setSelected('');
                void mutate();
              }}
            >
              {copy.chooseAnother}
            </Button>
          </div>
          <Button
            variant="secondary"
            data-picker-open="true"
            onClick={() => {
              onClose();
              router.push(placed.target);
            }}
          >
            {copy.openAndEdit}
          </Button>
          <Button variant="primary" data-picker-done="true" onClick={onClose}>
            {copy.done}
          </Button>
        </div>
      </div>
    );
  }

  const dateCaption = date
    ? new Intl.DateTimeFormat(locale, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }).format(date.toDate()) +
      ' · ' +
      time
    : copy.noDate;
  return (
    <div className="flex min-w-0 flex-col gap-[16px] text-cf-ink">
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
          <div
            data-picker-filters="true"
            className="flex min-w-0 flex-wrap items-center gap-x-[12px] gap-y-[8px]"
          >
            <span className="inline-flex min-w-0 max-w-full items-center gap-[4px]">
              <span className="min-w-0 max-w-[280px]">
                <Select
                  standalone
                  density="dense"
                  aria-label={copy.channelFilter}
                  data-picker-channel="true"
                  value={activeChannel}
                  onChange={(event) => {
                    setChannel(event.target.value);
                    setSelected('');
                  }}
                >
                  <option value="">{copy.allChannels}</option>
                  {channelOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </span>
              <Hint label={copy.channelFilterHintLabel}>
                {copy.channelFilterHint}
              </Hint>
            </span>
            <span className="inline-flex min-w-0 max-w-full flex-wrap items-center gap-[4px]">
              <Segmented<PickerStateFilter>
                label={copy.stateFilter}
                value={stateFilter}
                onChange={(value) => {
                  setStateFilter(value);
                  setSelected('');
                }}
                options={PICKER_STATE_FILTERS.map((value) => ({
                  value,
                  label: `${copy.stateFilterWords[value]} · ${stateCounts[value]}`,
                }))}
                data-picker-state-filter={stateFilter}
                className="max-w-full flex-wrap"
              />
              <Hint label={copy.stateFilterHintLabel}>
                {copy.stateFilterHint}
              </Hint>
            </span>
          </div>
          <p
            className="cf-caption whitespace-nowrap text-cf-ink-muted"
            aria-live="polite"
          >
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
                    setStateFilter('all');
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
                const picked = chosen?.adaptationId === row.adaptationId;
                const name =
                  (twins.get(`${row.pieceId}:${row.integrationId}`) || 0) > 1
                    ? row.firstLine || row.title
                    : row.title || row.firstLine;
                return (
                  <RadioOption
                    key={row.adaptationId}
                    value={row.adaptationId}
                    layout="content"
                    data-picker-row="true"
                    className={`group flex w-full min-w-0 shrink-0 items-center gap-[12px] rounded-[8px] border px-[12px] py-[8px] text-start text-cf-ink transition-colors duration-state motion-reduce:transition-none ${
                      picked
                        ? 'border-cf-accent bg-cf-accent-soft'
                        : 'border-transparent hover:bg-cf-surface-subtle'
                    }`}
                  >
                    <ChannelAvatar row={integration} compact />
                    <span className="flex min-w-0 flex-1 flex-col gap-[4px]">
                      <span
                        className="cf-label-md block truncate"
                        title={name}
                      >
                        {name}
                      </span>
                      {/*
                        Code and channel on one line, the state after them;
                        when the row is narrow the state wraps whole rather
                        than losing its date. The channel name is the one
                        thing that gives way: truncated, full on hover
                        (`title`) and on keyboard focus of the row.
                      */}
                      <span className="cf-caption flex min-w-0 flex-wrap items-baseline text-cf-ink-muted">
                        <span className="shrink-0 text-cf-signature">
                          {row.pieceCode}
                        </span>
                        <span className="shrink-0 whitespace-pre">{' · '}</span>
                        <span
                          data-picker-channel-name="true"
                          title={integration.name}
                          className="min-w-0 max-w-full truncate group-focus-visible:whitespace-normal group-focus-visible:[overflow-wrap:anywhere]"
                        >
                          {integration.name}
                        </span>
                        <span className="shrink-0 whitespace-pre">{' · '}</span>
                        {slotLabel(row) ? (
                          <span
                            data-picker-slot={row.slot?.status}
                            className="shrink-0 whitespace-nowrap"
                          >
                            {slotLabel(row)}
                          </span>
                        ) : (
                          <span className="shrink-0 whitespace-nowrap">
                            {copy.readyAt}{' '}
                            {dayMonth.format(new Date(row.readyAt))}
                          </span>
                        )}
                      </span>
                    </span>
                  </RadioOption>
                );
              })}
            </RadioGroup>
          )}
        </>
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
          <ButtonLink
            href={NEW_PIECE_PATH}
            variant="quiet"
            density="dense"
            disabled={!canWrite}
            onClick={onClose}
          >
            <PlusIcon />
            {copy.newPiece}
          </ButtonLink>
        </div>
        <Button variant="secondary" onClick={onClose}>
          {copy.cancel}
        </Button>
        {!!data?.length &&
          (date ? (
            <Button
              variant="primary"
              disabled={!canWrite || !chosen}
              loading={placing}
              loadingLabel={copy.placing}
              data-picker-place="true"
              onClick={() => void place()}
            >
              {copy.placeAt(time)}
            </Button>
          ) : (
            <ButtonLink
              href={target || '#'}
              variant="primary"
              disabled={!canWrite || !chosen}
              data-picker-place="true"
              onClick={onClose}
            >
              {copy.choose}
            </ButtonLink>
          ))}
      </div>
      {placeFailed ? (
        <p role="alert" className="cf-body-sm text-cf-danger">
          {placeFailed}
        </p>
      ) : null}
    </div>
  );
}

/** The tick of «Стоит в плане», drawn in the card icons' own hand. */
const PlacedGlyph = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="9" />
    <path d="m8 12.5 2.7 2.7L16 9.8" />
  </svg>
);

export type PickerStateFilter = 'all' | 'free' | 'reserved' | 'queued';
export const PICKER_STATE_FILTERS: readonly PickerStateFilter[] = [
  'all',
  'free',
  'reserved',
  'queued',
];

/** Where a row stands; an old server without `slot` reads as free. */
const rowState = (row: ReadyAdaptation): Exclude<PickerStateFilter, 'all'> =>
  row.slot?.status === 'reserved' || row.slot?.status === 'queued'
    ? row.slot.status
    : 'free';

/**
 * The search key: lower case, without spaces, dashes or middle dots, so
 * «CNT 24», «cnt-24» and «Тестовая  группа» all find what they mean.
 */
export const searchKey = (value: string, locale: string) =>
  value.toLocaleLowerCase(locale).replace(/[\s\-‐-―·]+/g, '');

/** First occurrence of each id, order kept. */
export const uniqueById = <T extends { id: string }>(items: readonly T[]) => {
  const seen = new Set<string>();
  return items.filter((item) =>
    seen.has(item.id) ? false : (seen.add(item.id), true)
  );
};

export function useAdaptationPicker() {
  const modal = useModals();
  const language = useInterfaceLanguage();
  const { integrations, integrationId, reloadCalendarView } = useCalendar();
  const title =
    calendarPlanningCopy[language.startsWith('ru') ? 'ru' : 'en'].title;
  return useCallback(
    /** `channelId` — the channel whose schedule holds this slot, if one. */
    (date?: Dayjs, channelId?: string) => {
      modal.openModal({
        title,
        // 720 fits «в очереди · чт 24.09 09:20 · автопилот» beside a long
        // channel name; the shell caps it at the screen minus 32px.
        size: 720,
        closeOnEscape: true,
        closeOnClickOutside: true,
        withCloseButton: true,
        children: (close) => (
          <AdaptationPicker
            integrations={integrations}
            date={date}
            initialChannel={channelId || integrationId}
            onClose={close}
            onPlaced={reloadCalendarView}
          />
        ),
      });
    },
    [modal, title, integrations, integrationId, reloadCalendarView]
  );
}
