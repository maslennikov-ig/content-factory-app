'use client';

import React, {
  FC,
  Fragment,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { postSaveErrorMessage } from '@contentfactory/frontend/components/new-launch/post-save-error';
import {
  CalendarContext,
  Integrations,
  useCalendar,
} from '@contentfactory/frontend/components/launches/calendar.context';
import dayjs from 'dayjs';
import 'dayjs/locale/en';
import 'dayjs/locale/he';
import 'dayjs/locale/ru';
import 'dayjs/locale/zh';
import 'dayjs/locale/fr';
import 'dayjs/locale/es';
import 'dayjs/locale/pt';
import 'dayjs/locale/de';
import 'dayjs/locale/it';
import 'dayjs/locale/ja';
import 'dayjs/locale/ko';
import 'dayjs/locale/ar';
import 'dayjs/locale/tr';
import 'dayjs/locale/vi';
import localizedFormat from 'dayjs/plugin/localizedFormat';
import { useModals } from '@contentfactory/frontend/components/layout/new-modal';
import clsx from 'clsx';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { useDrag, useDrop } from 'react-dnd';
import { Integration, Post, State, Tags } from '@prisma/client';
import { useToaster } from '@contentfactory/react/toaster/toaster';
import { useUser } from '@contentfactory/frontend/components/layout/user.context';
import {
  isOrganizationEditor,
} from '@contentfactory/nestjs-libraries/user/organization.roles';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import { groupBy, random, sortBy, uniqBy } from 'lodash';
import { extend } from 'dayjs';
import { isUSCitizen } from './helpers/isuscitizen.utils';
import { useInterval } from '@mantine/hooks';
import { StatisticsModal } from '@contentfactory/frontend/components/launches/statistics';
import { MissingReleaseModal } from '@contentfactory/frontend/components/launches/missing-release.modal';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import i18next from 'i18next';
import { useOpenPostEditor } from '@contentfactory/frontend/components/new-launch/compose.modal';
import { CreationMethodBadge } from '@contentfactory/frontend/components/launches/creation.method.badge';
import { deleteDialog } from '@contentfactory/react/helpers/delete.dialog';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import { useInterfaceLanguage } from '@contentfactory/react/translation/use-interface-language';
import copy from 'copy-to-clipboard';
import { newDayjs } from '@contentfactory/frontend/components/layout/set.timezone';
import { Button } from '@contentfactory/react/form/button';
import { ControlButton } from '@contentfactory/react/choice/control.button';
import { calendarPlanningCopy } from './calendar-planning.copy';
import { useAdaptationPicker } from './adaptation-picker';
import { freeSlotsOn } from './calendar-slots';
import {
  channelsOf,
  collapseRows,
  freeChannelsAt,
  groupRowsByTime,
  isAutopilot,
  PlanState,
  planStateOf,
  timesOf,
} from './calendar-plan';
import { Popover } from '@contentfactory/frontend/components/ui/layers';
import { SectionLabel } from '@contentfactory/frontend/components/ui/section-label';
import { PostPreviewDialog } from '@contentfactory/frontend/components/preview/post.preview.dialog';
import { EDITORIAL_STAGE_TONES } from '@contentfactory/frontend/components/launches/editorial-stage.badge';
import {
  editorialStageLabel,
  resolveEditorialStageLocale,
  EditorialStageValue,
} from '@contentfactory/frontend/components/launches/editorial-stage.copy';
import {
  EmptyState,
  StatusTone,
} from '@contentfactory/frontend/components/ui/surface';
import { ButtonLink } from '@contentfactory/react/form/button-link';
import { NEW_PIECE_PATH } from '../content-intelligence/pieces/pieces.adapter';
import {
  BracketsIcon,
  ChannelMarks,
  ChartIcon,
  CopyIcon,
  EyeIcon,
  PostCardAction,
  PostCardActions,
  PlanBand,
  PlanStatePill,
  PlusIcon,
  postLine,
  SlotButton,
  StageBand,
  StagePill,
  TrashIcon,
} from '@contentfactory/frontend/components/launches/post-card.parts';
import { usePopoverTrigger } from '@contentfactory/frontend/components/ui/use-popover-trigger';

// Extend dayjs with necessary plugins
extend(isSameOrAfter);
extend(isSameOrBefore);
extend(localizedFormat);

// Initialize language
const updateDayjsLocale = () => {
  const currentLanguage = i18next.resolvedLanguage || 'en';
  dayjs.locale(currentLanguage);
};

// Set dayjs locale whenever i18next language changes
i18next.on('languageChanged', () => {
  updateDayjsLocale();
});

// Initial setup
updateDayjsLocale();

const convertTimeFormatBasedOnLocality = (time: number) => {
  if (isUSCitizen()) {
    // `time % 12 || 12`: in a twelve-hour clock both midnight and noon are
    // called 12. The special case was written for noon only, so the column
    // began at «0:00 AM» — an hour that does not exist in the notation it is
    // written in (`content-factory-next-fn33.80`).
    return `${time % 12 || 12}:00 ${time >= 12 ? 'PM' : 'AM'}`;
  } else {
    return `${time}:00`;
  }
};

export function calendarErrorMessage(
  value: unknown,
  t: (key: string, fallback: string) => string
): string {
  const generic = t(
    'publishing_error_generic',
    'An error occurred while publishing this post'
  );
  // The two classifications the error ledger writes. They are stored in
  // English, so they are translated here rather than rendered as stored.
  const translateClassification = (text: string) =>
    text === 'Unknown Error'
      ? t('publishing_error_unknown', 'Unknown Error')
      : text === 'Publishing failed'
        ? t('publishing_error_failed', 'Publishing failed')
        : undefined;

  if (typeof value !== 'string' || !value.trim()) {
    return generic;
  }

  const trimmed = value.trim();
  try {
    const parsed = JSON.parse(trimmed);
    // A stored payload can carry a token or a post body beside its message, so
    // nothing but the two known classifications is surfaced from JSON.
    return (
      (typeof parsed?.message === 'string' &&
        translateClassification(parsed.message)) ||
      generic
    );
  } catch {
    const classification = translateClassification(trimmed);
    if (classification) {
      return classification;
    }

    // Rows written before the ledger was minimized hold the provider's own
    // text, which is worth showing ("Rate limit exceeded", "Token expired").
    // Judge it by shape: a short human sentence, never a serialized payload,
    // a URL or anything credential-shaped.
    const looksUnsafe =
      trimmed.length > 120 ||
      /[{}[\]]/.test(trimmed) ||
      /token\s*=/i.test(trimmed) ||
      /bearer/i.test(trimmed) ||
      /http/i.test(trimmed);
    return looksUnsafe ? generic : trimmed;
  }
}

type PlanningCopy = (typeof calendarPlanningCopy)['ru' | 'en'];

/** The word of a plan state, from the calendar's own copy (`97dq.59`). */
export const planStateWord = (copy: PlanningCopy, state: PlanState): string =>
  ({
    reserved: copy.slotReserved,
    queued: copy.slotQueued,
    draft: copy.stateDraft,
    published: copy.statePublished,
    error: copy.stateError,
  })[state];

export const hours = Array.from(
  {
    length: 24,
  },
  (_, i) => i
);

/**
 * One post, all its channels.
 *
 * A post sent to three channels is three `Post` rows sharing one `group` — the
 * shape the upstream schema chose, and the shape every group-level endpoint
 * here already speaks (`/posts/group/:group`, `DELETE /posts/:group`). The
 * calendar was the one place that did not: it drew a card per row, so three
 * channels read as three separate posts and each card claimed exactly one
 * channel. The owner
 * spotted it from the other side — «у нас же может быть сразу несколько мест
 * для публикации, а в карточке оно всегда только одно».
 *
 * Grouping is done here rather than on the server: `group` is already selected
 * and already reaches this component, so nothing has to change behind the API
 * for the calendar to tell the truth.
 */
export type PostGroup = {
  key: string;
  /** The row every group-level action is fired against. */
  lead: any;
  /** Every row in the group, in the order the calendar received them. */
  members: any[];
};

export const groupPostsByGroup = (posts: any[]): PostGroup[] => {
  const order: string[] = [];
  const bucket = new Map<string, any[]>();

  for (const post of posts) {
    // A row with no `group` is its own group; that is the older upstream shape
    // and a few seeded fixtures, not an error to report.
    const key = post?.group || post?.id;
    if (!bucket.has(key)) {
      bucket.set(key, []);
      order.push(key);
    }
    bucket.get(key)!.push(post);
  }

  return order.map((key) => {
    const members = bucket.get(key)!;
    return { key, lead: members[0], members };
  });
};

// Shared hook for post actions (edit, delete, statistics)
const usePostActions = (onMutate?: () => void) => {
  const t = useT();
  const fetch = useFetch();
  const modal = useModals();
  const toaster = useToaster();
  const openPostEditor = useOpenPostEditor();
  const { integrations, reloadCalendarView } = useCalendar();

  const mutate = useCallback(() => {
    reloadCalendarView();
    onMutate?.();
  }, [reloadCalendarView, onMutate]);

  const editPost = useCallback(
    (loadPost: any, isDuplicate?: boolean) => async () => {
      const post = {
        ...loadPost,
        publishDate: loadPost.actualDate || loadPost.publishDate,
      };

      /*
        Пост, пришедший из заготовки, правится во вкладке своего канала на
        странице заготовки, а не в окне поста (`97dq.37`, §3.6): там его
        текст, проверки, дата и отправка. Копия поста — новая запись, и она
        по-прежнему открывается окном.
      */
      const pieceId: unknown = post.piece?.id;
      const channelId: unknown = post.integration?.id;
      if (!isDuplicate && typeof pieceId === 'string' && pieceId) {
        const tab =
          typeof channelId === 'string' && channelId
            ? `?tab=${encodeURIComponent(channelId)}`
            : '';
        window.location.assign(
          `/content/pieces/${encodeURIComponent(pieceId)}${tab}`
        );
        return;
      }

      await openPostEditor({
        group: post.group,
        duplicate: isDuplicate,
        integrations,
        mutate,
        reopenModal: editPost(post),
      });
    },
    [integrations, openPostEditor, mutate]
  );

  const copyDebugJson = useCallback(
    (post: any) => () => {
      modal.openModal({
        title: t('copy_debug_json', 'Copy Debug JSON'),
        closeOnClickOutside: true,
        closeOnEscape: true,
        withCloseButton: true,
        classNames: {
          modal: 'w-[100%] max-w-[500px]',
        },
        children: <DebugJsonModal post={post} />,
      });
    },
    [modal, t]
  );

  const deletePost = useCallback(
    (post: any) => async () => {
      if (
        !(await deleteDialog(
          t(
            'are_you_sure_you_want_to_delete_post',
            'Are you sure you want to delete post?'
          )
        ))
      ) {
        return;
      }

      await fetch(`/posts/${post.group}`, {
        method: 'DELETE',
      });

      toaster.show(
        t('post_deleted_successfully', 'Post deleted successfully'),
        'success'
      );

      mutate();
    },
    [toaster, t, fetch, mutate]
  );

  const openStatistics = useCallback(
    (id: string) => () => {
      modal.openModal({
        title: t('statistics', 'Statistics'),
        closeOnClickOutside: true,
        closeOnEscape: true,
        withCloseButton: true,
        classNames: {
          modal: 'w-[100%] max-w-[1400px]',
        },
        children: <StatisticsModal postId={id} />,
        size: '80%',
      });
    },
    [modal, t]
  );

  const openMissingRelease = useCallback(
    (id: string) => () => {
      modal.openModal({
        title: t('connect_post', 'Connect Post'),
        closeOnClickOutside: true,
        closeOnEscape: true,
        withCloseButton: true,
        classNames: {
          modal: 'w-[100%] max-w-[800px]',
        },
        children: <MissingReleaseModal postId={id} onSuccess={mutate} />,
        size: '60%',
      });
    },
    [modal, t, mutate]
  );

  return {
    editPost,
    deletePost,
    copyDebugJson,
    openStatistics,
    openMissingRelease,
  };
};

export const DayView = () => {
  const calendar = useCalendar();
  const { integrations, posts, startDate } = calendar;

  // Set dayjs locale based on current language
  const currentLanguage = i18next.resolvedLanguage || 'en';
  dayjs.locale(currentLanguage);

  const currentDay = dayjs.utc(startDate);
  const language = useInterfaceLanguage();
  const planningCopy =
    calendarPlanningCopy[language.startsWith('ru') ? 'ru' : 'en'];

  const options = useMemo(() => {
    const createdPosts = posts.map((post) => ({
      integration: [integrations.find((i) => i.id === post.integration.id)!],
      image: post?.integration?.picture || '',
      identifier: post?.integration?.providerIdentifier || '',
      id: post?.integration?.id || '',
      name: post?.integration?.name || '',
      time: dayjs
        .utc(post.publishDate)
        .diff(dayjs.utc(post.publishDate).startOf('day'), 'minute'),
    }));
    return sortBy(
      Object.values(
        groupBy(
          [
            ...createdPosts,
            ...integrations.flatMap((p) =>
              p.time.flatMap((t) => ({
                integration: p,
                identifier: p?.identifier,
                name: p?.name,
                id: p?.id,
                image: p?.picture,
                time: t?.time,
              }))
            ),
          ],
          (p: any) => p.time
        )
      ),
      (p) => p[0].time
    );
  }, [integrations, posts]);

  /*
    Direction A of the 23.09.2026 canvas (`97dq.50`): the time stands in a
    72px column on the left and the slot takes the rest of the row, so the
    day reads as a schedule rather than as centred captions over boxes.
  */
  return (
    <div className="flex flex-col flex-1 relative">
      <div className="absolute start-0 top-0 w-full h-full overflow-auto">
        {/*
          `shrink-0` keeps the grid as tall as the cards inside it. The slots
          used to be flex items of this scroller, free to shrink to their
          floor — and they did, so a 116px card was drawn over the slot below.
          Rows of a grid do not shrink; the grid itself is the one flex-free
          block, and it says so.
        */}
        <div
          data-calendar-day="true"
          className="grid shrink-0 [grid-template-columns:72px_minmax(0,1fr)] gap-x-[16px]"
        >
          {options.map((option) => {
            const at = currentDay
              .startOf('day')
              .add(option[0].time, 'minute')
              .local();
            const passed = at.isBefore(newDayjs());
            return (
              <Fragment key={option[0].time}>
                <div
                  className={clsx(
                    'pt-[12px] cf-caption tabular-nums',
                    passed ? 'text-cf-ink-muted' : 'text-cf-ink'
                  )}
                >
                  {at.format(isUSCitizen() ? 'hh:mm A' : 'HH:mm')}
                </div>
                <div className="min-w-0 py-[8px] border-b border-cf-border">
                  <CalendarContext.Provider
                    value={{
                      ...calendar,
                      // A channel with a post and a slot at this time is in
                      // `option` twice; downstream lists want it once (97dq.72).
                      integrations: uniqBy(
                        option.flatMap((p) => p.integration).filter(Boolean),
                        'id'
                      ),
                    }}
                  >
                    <CalendarColumn getDate={at} />
                  </CalendarContext.Provider>
                </div>
              </Fragment>
            );
          })}
          <div className="pt-[12px] cf-caption text-cf-ink-muted" aria-hidden>
            —
          </div>
          <p className="py-[12px] cf-body-sm text-cf-ink-muted text-pretty">
            {planningCopy.dayOtherTime}
          </p>
        </div>
      </div>
    </div>
  );
};
export const WeekView = () => {
  const { startDate, endDate } = useCalendar();
  const t = useT();

  // Use dayjs to get localized day names
  const localizedDays = useMemo(() => {
    const currentLanguage = i18next.resolvedLanguage || 'en';
    dayjs.locale(currentLanguage);

    const days = [];
    const weekStart = newDayjs(startDate);
    for (let i = 0; i < 7; i++) {
      const day = weekStart.add(i, 'day');
      days.push({
        name: day.format('dddd'),
        day: day.format('L'),
        date: day,
      });
    }
    return days;
  }, [i18next.resolvedLanguage, startDate]);

  return (
    <div className="flex flex-col text-textColor flex-1">
      <div className="flex-1 relative">
        <div className="grid [grid-template-columns:72px_repeat(7,_minmax(116px,_1fr))] md:[grid-template-columns:136px_repeat(7,_minmax(104px,_1fr))] gap-[4px] rounded-[8px] absolute h-full start-0 top-0 w-full overflow-auto">
          <div className="z-10 bg-newTableHeader flex justify-center items-center flex-col h-[62px] rounded-[8px] sticky top-0"></div>
          {localizedDays.map((day, index) => (
            <div
              key={day.name}
              className="p-2 text-center bg-newTableHeader flex justify-center items-center flex-col h-[62px] rounded-[8px] sticky top-0 z-[20]"
            >
              <div className="text-[14px] font-[500] text-newTableText">
                {day.name}
              </div>
              <div
                className={clsx(
                  'text-[14px] font-[600] flex items-center justify-center gap-[6px]',
                  day.day === newDayjs().format('L') &&
                    'text-newTableTextFocused'
                )}
              >
                {day.day === newDayjs().format('L') && (
                  <div className="w-[6px] h-[6px] bg-newTableTextFocused rounded-full" />
                )}
                {day.day}
              </div>
            </div>
          ))}
          {hours.map((hour) => (
            <Fragment key={hour}>
              <div className="p-2 pe-4 text-center items-center justify-center flex text-[14px] text-newTableText">
                {convertTimeFormatBasedOnLocality(hour)}
              </div>
              {localizedDays.map((day, indexDay) => (
                <Fragment
                  key={`${startDate}-${day.date.format('YYYY-MM-DD')}-${hour}`}
                >
                  <div className="relative">
                    <CalendarColumn
                      getDate={day.date.hour(hour).startOf('hour')}
                    />
                  </div>
                </Fragment>
              ))}
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
};
export const MonthView = () => {
  const { startDate } = useCalendar();
  const t = useT();

  // Use dayjs to get localized day names
  const localizedDays = useMemo(() => {
    const currentLanguage = i18next.resolvedLanguage || 'en';
    dayjs.locale(currentLanguage);

    const days = [];
    // Starting from Monday (1) to Sunday (7)
    for (let i = 1; i <= 7; i++) {
      days.push(newDayjs().day(i).format('dddd'));
    }
    return days;
  }, [i18next.resolvedLanguage]);

  const calendarDays = useMemo(() => {
    const monthStart = newDayjs(startDate);
    const currentMonth = monthStart.month();
    const currentYear = monthStart.year();

    const startOfMonth = newDayjs(new Date(currentYear, currentMonth, 1));

    // Calculate the day offset for Monday (isoWeekday() returns 1 for Monday)
    const startDayOfWeek = startOfMonth.isoWeekday(); // 1 for Monday, 7 for Sunday
    const daysBeforeMonth = startDayOfWeek - 1; // Days to show from the previous month

    // Get the start date (Monday of the first week that includes this month)
    const calendarStartDate = startOfMonth.subtract(daysBeforeMonth, 'day');

    // Create an array to hold the calendar days (6 weeks * 7 days = 42 days max)
    const calendarDays = [];
    let currentDay = calendarStartDate;
    for (let i = 0; i < 42; i++) {
      let label = 'current-month';
      if (currentDay.month() < currentMonth) label = 'previous-month';
      if (currentDay.month() > currentMonth) label = 'next-month';
      calendarDays.push({
        day: currentDay,
        label,
      });

      // Move to the next day
      currentDay = currentDay.add(1, 'day');
    }
    return calendarDays;
  }, [startDate]);

  return (
    <div className="flex flex-col text-textColor flex-1">
      <div className="flex-1 flex relative">
        <div className="grid [grid-template-columns:repeat(7,_minmax(104px,_1fr))] grid-rows-[62px_auto] gap-[4px] rounded-[8px] absolute start-0 top-0 overflow-auto w-full h-full">
          {localizedDays.map((day) => (
            <div
              key={day}
              className="z-[20] p-2 bg-newTableHeader flex justify-center items-center flex-col h-[62px] rounded-[8px] sticky top-0"
            >
              <div>{day}</div>
            </div>
          ))}
          {calendarDays.map((date, index) => (
            <div
              key={index}
              className="text-center items-center justify-center flex"
            >
              <CalendarColumn
                getDate={newDayjs(date.day).endOf('day')}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
export const ListView = () => {
  const t = useT();
  const user = useUser();
  const { integrations, loading, listPosts, listState, listSearched } =
    useCalendar();
  const language = useInterfaceLanguage();
  const planning = calendarPlanningCopy[language.startsWith('ru') ? 'ru' : 'en'];
  // A search that found nothing says so, not «no posts» (`odb8.4.1`).
  const emptyMessage = listSearched
    ? planning.listSearchEmpty(listSearched)
    : listState === 'scheduled'
      ? t('no_upcoming_posts', 'No upcoming posts scheduled')
      : listState === 'draft'
      ? t('no_draft_posts', 'No draft posts')
      : listState === 'published'
      ? t('no_published_posts', 'No published posts')
      : t('no_posts', 'No posts');

  // Use shared post actions hook
  const {
    editPost,
    deletePost,
    copyDebugJson,
    openStatistics,
    openMissingRelease,
  } = usePostActions();

  // Group posts by date, then fold each day's rows into one card per post.
  const groupedPosts = useMemo(() => {
    const groups: { [key: string]: any[] } = {};
    listPosts.forEach((post) => {
      const dateKey = newDayjs(post.publishDate).local().format('YYYY-MM-DD');
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(post);
    });
    return Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(
        ([dateKey, datePosts]) =>
          [dateKey, groupPostsByGroup(datePosts)] as [string, PostGroup[]]
      );
  }, [listPosts]);

  if (loading) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center">
        <div className="text-textColor">{t('loading', 'Loading...')}</div>
      </div>
    );
  }

  // An empty list offers one way on (2q28.25): the same «Новая заготовка»
  // the placement window ends with. Not after a search — there the way on is
  // other words — and not for a reader, who cannot write one.
  if (listPosts.length === 0) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center">
        <EmptyState
          title={emptyMessage}
          action={
            !listSearched && isOrganizationEditor(user?.role) ? (
              <ButtonLink href={NEW_PIECE_PATH} variant="secondary">
                {planning.newPiece}
              </ButtonLink>
            ) : undefined
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[10px] flex-1 relative">
      <div className="absolute start-0 top-0 w-full h-full flex flex-col overflow-auto">
        {groupedPosts.map(([dateKey, datePosts]) => (
          <Fragment key={dateKey}>
            <div className="text-center text-[14px] min-h-[21px] text-textColor font-[500] mt-[10px]">
              {newDayjs(dateKey).format(
                isUSCitizen() ? 'dddd, MMMM D, YYYY' : 'dddd, D MMMM YYYY'
              )}
            </div>
            <div className="flex flex-col gap-[10px] mb-[20px] px-[10px]">
              {datePosts.map(({ key, lead, members }) => (
                <CalendarItem
                  key={key}
                  display="day"
                  row
                  isBeforeNow={false}
                  date={newDayjs(lead.publishDate)}
                  state={lead.state}
                  statistics={openStatistics}
                  missingRelease={openMissingRelease}
                  editPost={editPost(lead, false)}
                  duplicatePost={editPost(lead, true)}
                  copyDebugJson={
                    user?.isSuperAdmin ? copyDebugJson(lead) : undefined
                  }
                  post={lead}
                  channels={members}
                  integrations={integrations}
                  deletePost={deletePost(lead)}
                  showTime={true}
                />
              ))}
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  );
};

export const Calendar = () => {
  const { display } = useCalendar();
  return (
    <>
      {display === 'list' ? (
        <ListView />
      ) : display === 'day' ? (
        <DayView />
      ) : display === 'week' ? (
        <WeekView />
      ) : (
        <MonthView />
      )}
    </>
  );
};
export const CalendarColumn: FC<{
  getDate: dayjs.Dayjs;
}> = memo((props) => {
  const t = useT();

  const { getDate } = props;
  const [num, setNum] = useState(0);
  const user = useUser();
  const {
    integrations,
    posts,
    changeDate,
    display,
    reloadCalendarView,
    loading,
    setFilters,
    customer,
    editorialStage,
  } = useCalendar();
  const modal = useModals();
  const fetch = useFetch();

  // Use shared post actions hook
  const {
    editPost,
    deletePost,
    copyDebugJson,
    openStatistics,
    openMissingRelease,
  } = usePostActions();
  const postList = useMemo(() => {
    return groupPostsByGroup(posts.filter((post) => {
      const pList = dayjs.utc(post.publishDate).local();
      const check =
        display === 'day'
          ? pList.format('YYYY-MM-DD HH:mm') ===
            getDate.format('YYYY-MM-DD HH:mm')
          : display === 'week'
          ? pList.isSameOrAfter(getDate.startOf('hour')) &&
            pList.isBefore(getDate.endOf('hour'))
          : pList.format('DD/MM/YYYY') === getDate.format('DD/MM/YYYY');
      return check;
    }));
  }, [posts, display, getDate]);
  /*
    One row per channel post (`97dq.59`, canvas C2 A). A post sent to three
    channels is three rows in the day — each channel has its own state, its
    own text and its own time to confirm — and one group card in the week.
  */
  const rows = useMemo(
    () => postList.flatMap(({ members }) => members),
    [postList]
  );
  const rowChannels = useMemo(() => channelsOf(rows), [rows]);
  const [expanded, setExpanded] = useState(false);

  const isBeforeNow = useMemo(() => {
    const originalUtc = getDate.startOf('hour');
    return originalUtc
      .startOf('hour')
      .isBefore(newDayjs().startOf('hour').utc());
  }, [getDate, num]);

  const { start, stop } = useInterval(
    useCallback(() => {
      if (isBeforeNow) {
        return;
      }
      setNum(num + 1);
    }, [isBeforeNow]),
    random(120000, 150000)
  );

  useEffect(() => {
    start();
    return () => {
      stop();
    };
  }, []);
  const [{ canDrop }, drop] = useDrop(
    () => ({
      accept: 'post',
      drop: async (item: any) => {
        if (isBeforeNow) return;

        // Find the post to check its state
        const post = posts.find((p) => p.id === item.id);
        let action: 'schedule' | 'update' = 'schedule';

        // Check if post is already published or queued in the past
        if (
          post &&
          (post.state === 'PUBLISHED' ||
            (post.state === 'QUEUE' &&
              dayjs().isAfter(dayjs.utc(post.publishDate))))
        ) {
          const whatToDo = await new Promise<'schedule' | 'update' | 'cancel'>(
            (resolve) => {
              modal.openModal({
                title: t('what_do_you_want_to_do', 'What do you want to do?'),
                children: (
                  <div className="flex flex-col">
                    <div className="text-[20px] mb-[20px]">
                      {t(
                        'post_already_published_drag',
                        'This post was already published, what do you want to do?'
                      )}
                    </div>
                    <div className="flex w-full gap-[10px]">
                      <div className="flex-1 flex">
                        <Button
                          type="button"
                          className="flex-1"
                          onClick={() => {
                            modal.closeAll();
                            resolve('update');
                          }}
                        >
                          {t(
                            'just_update_post_details',
                            'Just update the post details'
                          )}
                        </Button>
                      </div>
                      <div className="flex-1 flex">
                        <Button
                          type="button"
                          className="flex-1"
                          onClick={() => {
                            modal.closeAll();
                            resolve('schedule');
                          }}
                        >
                          {t('reschedule_post', 'Reschedule the post')}
                        </Button>
                      </div>
                    </div>
                  </div>
                ),
                onClose: () => resolve('cancel'),
              });
            }
          );

          if (whatToDo === 'cancel') {
            return;
          }
          action = whatToDo;
        }

        // One card is one post across every channel it goes to, so a drag has
        // to move the whole group. `PUT /posts/:id/date` is per row by design —
        // moving only the row under the cursor would leave the rest of the
        // group at the old hour and quietly split one post in two.
        const ids: string[] = item.ids?.length ? item.ids : [item.id];
        if (!item.interval) {
          ids.forEach((id) => changeDate(id, getDate));
        }
        const responses = await Promise.all(
          ids.map(async (id) =>
            fetch(`/posts/${id}/date`, {
              method: 'PUT',
              body: JSON.stringify({
                date: getDate.utc().format('YYYY-MM-DDTHH:mm:ss'),
                action,
              }),
            })
          )
        );
        const statuses = responses.map((response) => response.status);
        // Another version of a Content Factory post is already queued in this
        // channel (`CF_QUEUE_BUSY`, `97dq.67`): say so and redraw the truth.
        const refused = responses.find((response) => response.status === 409);
        if (refused) {
          const refusal = await postSaveErrorMessage(refused, t);
          if (refusal) toaster.show(refusal, 'warning');
          reloadCalendarView();
          return;
        }
        const status = statuses.some((code) => code === 500) ? 500 : 200;
        if (status !== 500) {
          if (item.interval || action === 'schedule') {
            reloadCalendarView();
            return;
          }
          return;
        }
      },
      collect: (monitor) => ({
        canDrop: isBeforeNow
          ? false
          : !!monitor.canDrop() && !!monitor.isOver(),
      }),
    }),
    [posts]
  );

  const openPicker = useAdaptationPicker();

  const toaster = useToaster();
  const canWritePosts = isOrganizationEditor(user?.role);
  const language = useInterfaceLanguage();
  const planningCopy = calendarPlanningCopy[language.startsWith('ru') ? 'ru' : 'en'];

  const refuseWritePost = useCallback(() => {
    toaster.show(
      t(
        'create_post_editor_only',
        'Writing a post is an editor action. Ask an administrator of this workspace for the editor role.'
      ),
      'warning'
    );
  }, [t, toaster]);

  /*
    A slot that belongs to exactly one channel opens the picker on that
    channel; a shared slot or a bare cell opens on «Все каналы».
  */
  const addAt = useCallback(
    (at: dayjs.Dayjs, channelIds: string[] = []) => () =>
      canWritePosts
        ? openPicker(at, channelIds.length === 1 ? channelIds[0] : undefined)
        : refuseWritePost(),
    [canWritePosts, openPicker, refuseWritePost]
  );

  /*
    The channel schedule, read in local time. The day view has always drawn
    its rows from it; the week and month now use it too, so an empty cell
    offers the time a channel is waiting for («+ 09:20») instead of a bare
    plus (`97dq.50`).
  */
  const toLocalMinute = useCallback((minute: number) => {
    const local = newDayjs().utc().startOf('day').add(minute, 'minute').local();
    return local.hour() * 60 + local.minute();
  }, []);

  const taken = useMemo(
    () =>
      postList.map(({ lead }) =>
        dayjs.utc(lead.publishDate).local().format('HH:mm')
      ),
    [postList]
  );

  const freeSlots = useMemo(
    () =>
      display === 'day' || isBeforeNow
        ? []
        : freeSlotsOn({
            channels: integrations,
            day: getDate,
            now: newDayjs(),
            toLocalMinute,
            taken,
            ...(display === 'week' ? { hour: getDate.hour() } : {}),
          }),
    // `num` ticks every two minutes, so a slot that has just passed goes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [display, isBeforeNow, integrations, getDate, toLocalMinute, taken, num]
  );

  /** Channels whose schedule holds this exact time — the day row's caption. */
  const slotOwners = useMemo(() => {
    if (display !== 'day') return [];
    const minute = getDate.hour() * 60 + getDate.minute();
    return integrations.filter(
      (channel) =>
        !channel.disabled &&
        channel.time?.some((slot) => toLocalMinute(slot.time) === minute)
    );
  }, [display, integrations, getDate, toLocalMinute]);
  const slotChannels = useMemo(
    () => Array.from(new Set(slotOwners.map((channel) => channel.name))),
    [slotOwners]
  );
  /** Channels of this time that have no post at it yet. */
  const freeOwners = useMemo(
    () => freeChannelsAt(slotOwners, rows),
    [slotOwners, rows]
  );

  const time = getDate.format(isUSCitizen() ? 'hh:mm A' : 'HH:mm');
  const passedHint =
    isBeforeNow && postList.length === 0
      ? { 'data-date-passed': t('date_passed', 'Date passed') }
      : {};

  const openDay = useCallback(() => {
    const day = getDate.format('YYYY-MM-DD');
    setFilters({
      startDate: day,
      endDate: day,
      display: 'day',
      customer,
      editorialStage,
    });
  }, [getDate, setFilters, customer, editorialStage]);

  const rowProps = (row: any) => ({
    isBeforeNow,
    date: getDate,
    state: row.state as State,
    statistics: openStatistics,
    missingRelease: openMissingRelease,
    editPost: editPost(row, false),
    duplicatePost: editPost(row, true),
    copyDebugJson: user?.isSuperAdmin ? copyDebugJson(row) : undefined,
    post: row,
    channels: [row],
    integrations,
    deletePost: deletePost(row),
  });

  /** A row's own `HH:mm` — the key the week groups by. */
  const rowTime = useCallback(
    (row: any) => dayjs.utc(row.publishDate).local().format('HH:mm'),
    []
  );

  /*
    The week: one card per time. A time with one channel post keeps the
    ordinary card; two and more become one group card with a band segment
    per channel and the channel marks, which opens the list on click.
  */
  const weekCards =
    display === 'week'
      ? groupRowsByTime(rows, rowTime).map((group) =>
          group.rows.length === 1 ? (
            <div key={group.time} className="relative w-full min-w-0">
              <CalendarItem
                display="week"
                {...rowProps(group.rows[0])}
                showTime
              />
            </div>
          ) : (
            <WeekTimeGroup
              key={group.time}
              rows={group.rows}
              time={dayjs
                .utc(group.rows[0].publishDate)
                .local()
                .format(isUSCitizen() ? 'hh:mm A' : 'HH:mm')}
              day={getDate}
              planningCopy={planningCopy}
              rowProps={rowProps}
            />
          )
        )
      : null;

  const loadingVeil = loading && (
    <div className="h-full w-full p-[4px] animate-pulse absolute start-0 top-0 z-[50]">
      <div className="h-full w-full bg-cf-surface-subtle rounded-[8px]" />
    </div>
  );

  /*
    The day view (`97dq.59`, canvas C2 A): a time is a group. Two posts and
    more get a head — «N каналов» and their marks, «свободно: нет» when every
    channel of the slot is taken — then one row per channel post. Past five
    rows the rest folds into «ещё N». The dashed row under them adds a post
    at this time and names the channels still free; with none free it is the
    slimmer «Ещё пост на …». A past slot keeps the hatch and has no button.
  */
  if (display === 'day') {
    const { shown, hidden, collapsible } = collapseRows(rows, expanded);
    return (
      <div
        ref={drop as any}
        className={clsx(
          'relative flex flex-col gap-[8px] w-full rounded-[8px]',
          isBeforeNow && postList.length === 0 && 'min-h-[40px] repeated-strip col-calendar cursor-not-allowed',
          canDrop && 'outline outline-2 outline-offset-2 outline-cf-accent'
        )}
        {...passedHint}
      >
        {loadingVeil}
        {rows.length > 1 && (
          <div
            data-calendar-group-head="true"
            // Wraps on a phone: six marks and «свободно: нет» do not share
            // 270px with the label, and overlapping them was the alternative.
            className="flex min-w-0 flex-wrap items-center gap-x-[8px] gap-y-[4px] py-[4px]"
          >
            <SectionLabel as="span" className="whitespace-nowrap">
              {planningCopy.channels(rowChannels.length)}
            </SectionLabel>
            <ChannelMarks channels={rowChannels} max={6} />
            {!isBeforeNow && slotOwners.length > 0 && !freeOwners.length && (
              <span className="ms-auto shrink-0 cf-caption text-cf-ink-muted">
                {planningCopy.freeNone}
              </span>
            )}
          </div>
        )}
        {shown.map((row) => (
          <CalendarItem
            key={row.id}
            display="day"
            channelRow
            {...rowProps(row)}
          />
        ))}
        {collapsible && (
          <Button
            type="button"
            variant="quiet"
            density="dense"
            className="self-start"
            aria-expanded={expanded}
            data-calendar-more="true"
            onClick={() => setExpanded((was) => !was)}
          >
            {expanded ? planningCopy.lessRows : planningCopy.moreRows(hidden)}
          </Button>
        )}
        {!isBeforeNow &&
          (postList.length ? (
            freeOwners.length ? (
              <SlotButton
                shape="row"
                label={planningCopy.addPostAt(time)}
                marks={<ChannelMarks channels={freeOwners} max={4} />}
                caption={planningCopy.freeLeft(freeOwners.length)}
                onClick={addAt(
                  getDate,
                  freeOwners.map((channel) => channel.id)
                )}
              />
            ) : (
              <SlotButton
                shape="slim"
                label={planningCopy.morePostAt(time)}
                onClick={addAt(
                  getDate,
                  slotOwners.map((channel) => channel.id)
                )}
              />
            )
          ) : (
            <SlotButton
              shape="row"
              label={planningCopy.addPostAt(time)}
              caption={
                slotChannels.length
                  ? `${planningCopy.slotOf(slotChannels.length)} · ${slotChannels.join(', ')}`
                  : undefined
              }
              onClick={addAt(
                getDate,
                slotOwners.map((channel) => channel.id)
              )}
            />
          ))}
      </div>
    );
  }

  /*
    Week and month: the same card, then the same dashed slot. A configured
    channel time is a «+ 09:20» chip in the week; the month counts them
    («+ 2 слота») and opens the day, where every slot has its own row. A cell
    with no channel time keeps the quiet «+» that appears under the pointer.
  */
  return (
    <div
      ref={drop as any}
      className={clsx(
        'relative flex flex-col gap-[4px] w-full min-h-full p-[4px] rounded-[8px]',
        isBeforeNow
          ? 'repeated-strip cursor-not-allowed'
          : 'border border-cf-border',
        isBeforeNow && postList.length === 0 && 'col-calendar',
        canDrop && 'outline outline-2 outline-offset-2 outline-cf-accent'
      )}
      {...passedHint}
    >
      {display === 'month' && (
        <div className="px-[4px] cf-caption tabular-nums text-cf-ink-muted">
          {getDate.date()}
        </div>
      )}
      {loadingVeil}
      {weekCards}
      {display === 'month' && rows.length > 0 && (
        /*
          The month (`97dq.59`): the channel marks and the times, no text —
          a month cell is 104px and a sentence there was three letters. The
          summary opens the day, where every channel has its row.
        */
        <ControlButton
          layout="content"
          data-calendar-month-summary="true"
          aria-label={`${getDate.format('DD.MM')}: ${planningCopy.channels(
            rowChannels.length
          )} · ${timesOf(rows, rowTime).join(', ')}`}
          className="flex w-full min-w-0 flex-col items-start gap-[4px] rounded-[8px] px-[4px] py-[4px] text-start hover:bg-cf-surface-subtle"
          onClick={openDay}
        >
          <span className="flex min-w-0 items-center gap-[4px]">
            <ChannelMarks channels={rowChannels} max={4} />
            {rowChannels.length > 1 && (
              <span className="cf-caption tabular-nums text-cf-ink-muted">
                {rowChannels.length}
              </span>
            )}
          </span>
          <span className="w-full min-w-0 truncate cf-caption tabular-nums text-cf-ink">
            {timesOf(rows, rowTime).join(' · ')}
          </span>
        </ControlButton>
      )}
      {!isBeforeNow &&
        (freeSlots.length ? (
          display === 'week' ? (
            freeSlots.map((slot) => (
              <SlotButton
                key={slot.key}
                shape="chip"
                label={slot.at.format(isUSCitizen() ? 'hh:mm A' : 'HH:mm')}
                ariaLabel={`${planningCopy.addPostAt(
                  slot.at.format(isUSCitizen() ? 'hh:mm A' : 'HH:mm')
                )} · ${slot.channels.join(', ')}`}
                onClick={addAt(slot.at, slot.channelIds)}
              />
            ))
          ) : (
            <SlotButton
              shape="chip"
              label={planningCopy.slots(freeSlots.length)}
              ariaLabel={planningCopy.slotsOpenDay(
                freeSlots.length,
                getDate.format('DD.MM')
              )}
              onClick={openDay}
            />
          )
        ) : (
          <ControlButton
            layout="content"
            aria-label={`${planningCopy.schedule} · ${getDate.format('DD.MM.YYYY HH:mm')}`}
            className="group flex flex-1 w-full items-center justify-center rounded-[8px] text-cf-ink-muted hover:text-cf-ink"
            onClick={addAt(getDate)}
          >
            <span className="flex items-center justify-center w-[32px] h-[32px] rounded-[8px] border border-dashed border-cf-border-strong opacity-0 transition-opacity duration-state group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none">
              <PlusIcon />
            </span>
          </ControlButton>
        ))}
    </div>
  );
});
/**
 * The week's card for one time with several channels (`97dq.59`, canvas
 * C2 A): a band with one segment per channel post, the time, «N кан.» and the
 * channel marks (+N past three). A click opens the group's rows in a popover
 * — the same rows the day draws — and Escape or a click outside closes it.
 */
const WeekTimeGroup: FC<{
  rows: any[];
  /** The time as the reader writes it. */
  time: string;
  day: dayjs.Dayjs;
  planningCopy: PlanningCopy;
  rowProps: (row: any) => Record<string, any>;
}> = ({ rows, time, day, planningCopy, rowProps }) => {
  const { open, setOpen, holder } = usePopoverTrigger<HTMLDivElement>();
  const channels = useMemo(() => channelsOf(rows), [rows]);
  const states = useMemo(() => rows.map((row) => planStateOf(row)), [rows]);

  // Friday to Sunday open towards the start, so the list stays on screen.
  const towardsStart = day.day() === 0 || day.day() >= 5;
  const heading = `${day.format('dd DD.MM')} · ${time}`;

  return (
    <div ref={holder} className="relative w-full min-w-0">
      <ControlButton
        layout="content"
        aria-expanded={open}
        aria-label={planningCopy.groupOpen(time, channels.length)}
        data-calendar-week-group={rows.length}
        className="flex w-full min-w-0 flex-col items-stretch rounded-[8px] border border-cf-border bg-cf-surface text-start hover:border-cf-border-strong"
        onClick={() => setOpen((was) => !was)}
      >
        <PlanBand states={states} />
        <span className="flex min-w-0 flex-col gap-[4px] px-[8px] py-[4px]">
          <span className="flex min-w-0 items-center gap-[4px]">
            <span className="cf-caption tabular-nums text-cf-ink">{time}</span>
            <span className="ms-auto shrink-0 cf-caption text-cf-ink-muted">
              {planningCopy.channelsShort(channels.length)}
            </span>
          </span>
          <ChannelMarks channels={channels} max={3} />
        </span>
      </ControlButton>
      {open && (
        <Popover
          role="dialog"
          className={clsx(
            'absolute top-[calc(100%+4px)] z-[60] flex w-[min(560px,calc(100vw-32px))] flex-col gap-[8px] p-[12px]',
            towardsStart ? 'end-0' : 'start-0'
          )}
        >
          <SectionLabel as="p">{heading}</SectionLabel>
          {rows.map((row) => (
            <CalendarItem
              key={row.id}
              display="day"
              channelRow
              {...(rowProps(row) as any)}
            />
          ))}
        </Popover>
      )}
    </div>
  );
};

/**
 * One card per post, whatever number of channels the post goes to.
 *
 * Direction A of the 02.09.2026 canvas, chosen by the owner on the same day.
 * What changed and why is written up in `post-card.parts.tsx`; the short
 * version is that the coloured head band is now the stage — the word appears
 * once, its colour comes from the stage's own tone rather than from a colour a
 * person typed on a tag, and the actions arrive on their own surface instead
 * of inside the band.
 *
 * Two shapes, one vocabulary. The day, week and month grids get the card
 * (band, sentence, channel marks, time) — the day the same card, only wider
 * (`97dq.50`, 23.09.2026: «должна быть консистентность дизайна на день,
 * неделю или месяц»). The list view keeps a single 36px row with the stage as a
 * pill at the head of the line.
 */
const CalendarItem: FC<{
  date: dayjs.Dayjs;
  isBeforeNow: boolean;
  editPost: () => void;
  duplicatePost: () => void;
  copyDebugJson?: () => void;
  deletePost: () => void;
  /** Bound per row, not per card: statistics belong to one channel. */
  statistics: (id: string) => () => void;
  missingRelease?: (id: string) => () => void;
  integrations: Integrations[];
  state: State;
  display: 'day' | 'week' | 'month';
  /** The list view's single-line row; every calendar grid draws the card. */
  row?: boolean;
  /**
   * One channel post as a row of a time group (`97dq.59`): mark, name,
   * state, the start of the text, the piece code.
   */
  channelRow?: boolean;
  showTime?: boolean;
  post: Post & {
    integration: Integration;
    piece?: { id: string; code: string; title: string } | null;
    tags: {
      tag: Tags;
    }[];
  };
  /** Every row of the post's group, the lead included, in calendar order. */
  channels?: any[];
}> = memo((props) => {
  const t = useT();
  const {
    editPost,
    statistics,
    duplicatePost,
    copyDebugJson,
    post,
    date,
    isBeforeNow,
    state,
    display,
    deletePost,
    showTime,
    missingRelease,
  } = props;
  const { disableXAnalytics } = useVariables();
  const interfaceLanguage = useInterfaceLanguage();
  const user = useUser();
  const showCreationMethodBadge =
    user?.impersonate &&
    post.creationMethod &&
    post.creationMethod !== 'UNKNOWN';

  const members: any[] = props.channels?.length ? props.channels : [post];
  /*
    One card in the day, the week and the month (`97dq.50`): band, sentence,
    channel marks, time. The day draws it wider — with room for every action
    inline and four marks — and only the list view keeps the single-line row.
  */
  const wide = Boolean(props.row);
  const channelRow = Boolean(props.channelRow);
  const roomy = wide || display === 'day';
  const planningCopy =
    calendarPlanningCopy[interfaceLanguage.startsWith('ru') ? 'ru' : 'en'];
  const planState = planStateOf(post as any);

  const [previewId, setPreviewId] = useState<string | null>(null);
  const closePreview = useCallback(() => setPreviewId(null), []);

  const [{ opacity }, dragRef] = useDrag(
    () => ({
      type: 'post',
      item: {
        id: post.id,
        ids: members.map((member) => member.id),
        interval: !!post.intervalInDays,
        date,
      },
      collect: (monitor) => ({
        opacity: monitor.isDragging() ? 0 : 1,
      }),
    }),
    [post.id, members.length]
  );

  const locale = resolveEditorialStageLocale(interfaceLanguage);
  const tagNames = (post.tags || []).map((p) => p.tag.name).join(', ');
  /*
    The band says the stage. A post recorded before the stage field existed has
    none, and rather than paint a blank strip the band falls back to the tag
    names in the neutral tone — which is also where the tag survives now that
    its own colour no longer paints the card.
  */
  const bandTone: StatusTone = post.editorialStage
    ? EDITORIAL_STAGE_TONES[post.editorialStage as EditorialStageValue]
    : 'neutral';
  const bandLabel = post.editorialStage
    ? editorialStageLabel(locale, post.editorialStage as EditorialStageValue)
    : tagNames || (state === 'DRAFT' ? t('draft', 'Draft') : '');
  const bandTitle = [bandLabel, tagNames && tagNames !== bandLabel ? tagNames : '']
    .filter(Boolean)
    .join(' · ');

  /*
    Statistics are a property of one delivery, not of the post: the release id
    lives on the row. So the action names the channel it will open whenever the
    card carries more than one, instead of silently picking the first.
  */
  const statisticsMember = members.find(
    (member) =>
      member.releaseId &&
      member.releaseId !== 'missing' &&
      !(member.integration?.providerIdentifier === 'x' && disableXAnalytics)
  );
  const missingMember = members.find(
    (member) =>
      member.releaseId === 'missing' &&
      !(member.integration?.providerIdentifier === 'x' && disableXAnalytics)
  );
  const named = (label: string, member: any) =>
    members.length > 1 && member?.integration?.name
      ? `${label}: ${member.integration.name}`
      : label;

  const actions: PostCardAction[] = [
    {
      key: 'preview',
      label: named(t('preview_post', 'Preview post'), post),
      icon: <EyeIcon />,
      onClick: () => setPreviewId(post.id),
    },
    {
      key: 'duplicate',
      label: t('duplicate_post', 'Duplicate Post'),
      icon: <CopyIcon />,
      onClick: duplicatePost,
    },
    ...(statisticsMember
      ? [
          {
            key: 'statistics',
            label: named(
              t('post_statistics', 'Post Statistics'),
              statisticsMember
            ),
            icon: <ChartIcon />,
            onClick: statistics(statisticsMember.id),
          },
        ]
      : []),
    ...(missingMember && missingRelease
      ? [
          {
            key: 'missing-release',
            label: named(t('connect_post', 'Connect Post'), missingMember),
            icon: <ChartIcon />,
            onClick: missingRelease(missingMember.id),
          },
        ]
      : []),
    ...(copyDebugJson
      ? [
          {
            key: 'debug',
            label: t('copy_debug_json', 'Copy Debug JSON'),
            icon: <BracketsIcon />,
            onClick: copyDebugJson,
          },
        ]
      : []),
    {
      key: 'delete',
      label: t('delete_post', 'Delete Post'),
      icon: <TrashIcon />,
      onClick: deletePost,
      danger: true,
    },
  ];

  /*
    Merging a group's rows into one card would have taken the other channels'
    previews away: each row used to be a card with an eye of its own. They come
    back as menu entries, one per channel, each naming the channel it opens —
    the marks themselves stay a reading, not a 20px control.
  */
  const channelPreviews: PostCardAction[] =
    members.length > 1
      ? members.map((member) => ({
          key: `preview-${member.id}`,
          label: named(t('preview_post', 'Preview post'), member),
          icon: <EyeIcon />,
          onClick: () => setPreviewId(member.id),
        }))
      : [];

  const channelMarks = (
    <ChannelMarks
      channels={members.map((member) => ({
        id: member.id,
        name: member.integration?.name || '',
        picture: member.integration?.picture,
      }))}
      // A week card is 94px: one mark and the time fit, two do not. The month
      // card is 110px and holds two; the day holds four.
      max={roomy ? 4 : display === 'month' ? 2 : 1}
    />
  );

  const timeLabel = newDayjs(post.publishDate)
    .local()
    .format(isUSCitizen() ? 'hh:mm A' : 'HH:mm');

  /*
    The line is the start of the post. The state word used to lead it
    («Черновик: …») and on a 94px week card it was all the card said; the
    band carries the stage now, and the word stays for a screen reader. The
    body flattens to one line with a space between its paragraphs — striping
    the tags alone glued «…ноу-хау.Для меня…» together.
  */
  const sentence = (
    <>
      {state === 'DRAFT' ? (
        <span className="sr-only">{`${t('draft', 'Draft')}: `}</span>
      ) : null}
      {postLine(post.content) || t('no_content', 'no content')}
    </>
  );

  /*
    The actions panel is out of the flow on the narrow card, so it cannot
    change the card's height, and it is `pointer-events-none` until the card is
    hovered — invisible controls that still swallow clicks are worse than no
    controls. Keyboard focus is unaffected by `pointer-events`, which is why
    `focus-within` alone is enough to bring it back for a tab user.
  */
  const actionsPanel = (
    <PostCardActions
      actions={actions}
      extra={channelPreviews}
      // A channel row is a line in a group of up to five: the actions float
      // over its corner, so an invisible panel never takes the text's width.
      inline={roomy && !channelRow}
      moreLabel={t('more_actions', 'More actions')}
      className={clsx(
        'opacity-0 pointer-events-none',
        'group-hover:opacity-100 group-hover:pointer-events-auto',
        'focus-within:opacity-100 focus-within:pointer-events-auto',
        'transition-opacity duration-state',
        channelRow && 'absolute -top-[12px] -end-[8px] z-30 shadow-menu',
        // The narrow card of the week and month grid: above the card, not on
        // it (`content-factory-next-97dq.43`, item 4). Laid over the corner of
        // a 104px column it covered the card's middle, and a click meant to
        // open the post landed on «Предпросмотр». Flush with the card's top
        // edge, so the pointer never crosses a gap that drops the hover.
        !wide && !channelRow && 'absolute bottom-full end-0 z-30 shadow-menu'
      )}
    />
  );

  return (
    <div
      // @ts-ignore
      ref={dragRef}
      data-calendar-row={channelRow ? 'channel' : undefined}
      className={clsx(
        'w-full flex flex-1 group relative',
        wide || channelRow ? 'items-center' : 'h-full flex-col',
        'rounded-[8px] border',
        channelRow ? 'bg-cf-surface' : 'bg-cf-surface-subtle',
        state === 'ERROR' ? 'border-cf-danger' : 'border-cf-border',
        // A phone has no room for the state chip and the sentence on one
        // line: the sentence takes its own line above the chip, time and
        // channel (stand check 26.09.2026 — the chip shrank it to «П.»).
        wide &&
          'min-h-[36px] flex-wrap sm:flex-nowrap gap-x-[10px] gap-y-[4px] px-[10px] py-[4px]',
        channelRow && 'min-w-0 min-h-[40px] gap-[12px] px-[12px] py-[4px]',
        isBeforeNow && '!grayscale'
      )}
      style={{
        opacity,
      }}
    >
      {state === 'ERROR' && (
        <div
          className="absolute -top-[6px] -start-[6px] z-20 w-[18px] h-[18px] rounded-full bg-cf-danger flex items-center justify-center text-cf-ink-inverse cf-caption cursor-pointer"
          data-tooltip-id="tooltip"
          data-tooltip-content={calendarErrorMessage(post.error, t)}
        >
          !
        </div>
      )}
      {showCreationMethodBadge && (
        <div className="absolute -bottom-[4px] -end-[4px] z-10">
          <CreationMethodBadge
            creationMethod={post.creationMethod}
            ringColor="var(--cf-surface-subtle)"
          />
        </div>
      )}

      {channelRow ? (
        <>
          <ChannelMarks
            channels={[
              {
                id: post.id,
                name: post.integration?.name || '',
                picture: post.integration?.picture,
              },
            ]}
            max={1}
          />
          <ControlButton
            layout="content"
            data-calendar-row-open="true"
            className="flex flex-1 min-w-0 items-center gap-[12px] text-start"
            onClick={editPost}
          >
            <span className="hidden w-[152px] shrink-0 truncate cf-body-sm text-cf-ink sm:block">
              {post.integration?.name}
            </span>
            <PlanStatePill
              state={planState}
              label={planStateWord(planningCopy, planState)}
              title={bandTitle || undefined}
            />
            {isAutopilot(post as any) && (
              <span
                data-calendar-autopilot="true"
                className="hidden shrink-0 cf-caption text-cf-ink-muted md:inline"
              >
                {planningCopy.slotAutopilot}
              </span>
            )}
            <span className="flex-1 min-w-0 truncate cf-body-sm text-cf-ink-muted">
              {sentence}
            </span>
            {post.piece?.code && (
              <span className="shrink-0 cf-caption tabular-nums text-cf-signature">
                {post.piece.code}
              </span>
            )}
          </ControlButton>
          {actionsPanel}
        </>
      ) : wide ? (
        <>
          {/*
            The list row always says where the post is in delivery, in the
            calendar's own words — the ones the channel rows and the legend
            use (live walk 25.09.2026, P3-10). It used to fall back from the
            stage to the tag names to «Черновик», so a post confirmed into
            the queue, with neither a stage nor a tag, lost its only chip.
            The stage, when a person set one, stays beside it.
          */}
          <PlanStatePill
            state={planState}
            label={planStateWord(planningCopy, planState)}
            title={tagNames || undefined}
          />
          {post.editorialStage && bandLabel && (
            <StagePill tone={bandTone} label={bandLabel} title={bandTitle} />
          )}
          <div
            onClick={editPost}
            className="order-first basis-full sm:order-none sm:basis-0 flex-1 min-w-0 cf-body-md text-cf-ink truncate text-start cursor-pointer"
          >
            {sentence}
          </div>
          {channelMarks}
          {showTime && (
            <span className="shrink-0 cf-caption text-cf-ink-muted">
              {timeLabel}
            </span>
          )}
          {actionsPanel}
        </>
      ) : (
        <>
          {bandLabel && (
            <StageBand tone={bandTone} label={bandLabel} title={bandTitle} />
          )}
          <div
            onClick={editPost}
            className={clsx(
              'flex flex-col flex-1 gap-[4px] w-full min-w-0 px-[8px] py-[4px] cursor-pointer',
              'rounded-b-[8px]',
              !bandLabel && 'rounded-t-[8px]'
            )}
          >
            {/*
              `min-w-0` is what keeps the sentence inside the card: a flex item
              defaults to `min-width: auto`, so without it the longest word
              sets the column's width and the card's own border stops meaning
              anything. In flow, not an absolute overlay — out of flow it
              contributes no height and the text paints over the card below.
            */}
            <div className="w-full min-w-0 cf-body-sm text-cf-ink line-clamp-1 text-start">
              {sentence}
            </div>
            <div className="flex items-center w-full min-w-0">
              {channelMarks}
              {showTime && (
                <span className="ms-auto ps-[8px] shrink-0 cf-caption text-cf-ink-muted">
                  {timeLabel}
                </span>
              )}
            </div>
          </div>
          {actionsPanel}
        </>
      )}

      <PostPreviewDialog
        open={Boolean(previewId)}
        onClose={closePreview}
        postId={previewId || post.id}
        piece={members.find(member => member.id === (previewId || post.id))?.piece ?? null}
      />
    </div>
  );
});
const DebugJsonModal: FC<{ post: any }> = ({ post }) => {
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();
  const { closeCurrent } = useModals();

  const copyPostId = useCallback(() => {
    copy(post.id);
    toaster.show(t('post_id_copied', 'Post ID copied to clipboard'), 'success');
    closeCurrent();
  }, [post, toaster, t, closeCurrent]);

  const copyJson = useCallback(async () => {
    try {
      const data = await (
        await fetch(`/posts/group/${post.group}/debug-export`)
      ).json();
      copy(JSON.stringify(data, null, 2));
      toaster.show(
        t('debug_json_copied', 'Debug JSON copied to clipboard'),
        'success'
      );
      closeCurrent();
    } catch {
      toaster.show(
        t('debug_json_copy_failed', 'Failed to copy debug data'),
        'warning'
      );
    }
  }, [fetch, post, toaster, t, closeCurrent]);

  return (
    <div className="flex flex-col gap-[16px] p-[16px]">
      <div className="text-textColor text-[14px]">
        {t('debug_choose_copy', 'Choose what you want to copy')}
      </div>
      <div className="flex gap-[10px]">
        <Button onClick={copyPostId}>
          {t('copy_post_id', 'Copy post id')}
        </Button>
        <Button secondary onClick={copyJson}>
          {t('copy_debug_json', 'Copy Debug JSON')}
        </Button>
      </div>
    </div>
  );
};

export const SetSelectionModal: FC<{
  sets: any[];
  onSelect: (set: any) => void;
  onContinueWithoutSet: () => void;
}> = ({ sets, onSelect, onContinueWithoutSet }) => {
  const t = useT();

  return (
    <div className="flex flex-col gap-4">
      <div className="text-lg font-medium">
        {t('choose_set_or_continue', 'Choose a set or continue without one')}
      </div>

      <div className="flex flex-col gap-2 max-h-60 overflow-y-auto">
        {sets.map((set) => (
          <div
            key={set.id}
            onClick={() => onSelect(set)}
            className="p-3 border border-tableBorder rounded-lg cursor-pointer hover:transition-colors duration-state motion-reduce:transition-none"
          >
            <div className="font-medium">{set.name}</div>
            {set.description && (
              <div className="text-sm text-gray-400 mt-1">
                {set.description}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-2 pt-2 border-t border-tableBorder">
        <Button
          variant="secondary"
          onClick={onContinueWithoutSet}
          className="flex-1"
        >
          {t('continue_without_set', 'Continue without set')}
        </Button>
      </div>
    </div>
  );
};
