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
import { ExistingDataContextProvider } from '@contentfactory/frontend/components/launches/helpers/use.existing.data';
import { useDrag, useDrop } from 'react-dnd';
import { Integration, Post, State, Tags } from '@prisma/client';
import { useAddProvider } from '@contentfactory/frontend/components/launches/add.provider.component';
import { NoChannelNotice } from '@contentfactory/frontend/components/launches/no-channel.notice';
import { useToaster } from '@contentfactory/react/toaster/toaster';
import { useUser } from '@contentfactory/frontend/components/layout/user.context';
import {
  isOrganizationAdmin,
  isOrganizationEditor,
} from '@contentfactory/nestjs-libraries/user/organization.roles';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import { groupBy, random, sortBy } from 'lodash';
import { extend } from 'dayjs';
import { isUSCitizen } from './helpers/isuscitizen.utils';
import { useInterval } from '@mantine/hooks';
import { StatisticsModal } from '@contentfactory/frontend/components/launches/statistics';
import { MissingReleaseModal } from '@contentfactory/frontend/components/launches/missing-release.modal';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import i18next from 'i18next';
import { AddEditModal } from '@contentfactory/frontend/components/new-launch/add.edit.modal';
import { CreationMethodBadge } from '@contentfactory/frontend/components/launches/creation.method.badge';
import { deleteDialog } from '@contentfactory/react/helpers/delete.dialog';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import { useInterfaceLanguage } from '@contentfactory/react/translation/use-interface-language';
import copy from 'copy-to-clipboard';
import { stripHtmlValidation } from '@contentfactory/helpers/utils/strip.html.validation';
import { newDayjs } from '@contentfactory/frontend/components/layout/set.timezone';
import { Button } from '@contentfactory/react/form/button';
import { PlatformBadge } from '@contentfactory/react/platform/platform.badge';
import { PlatformSymbol } from '@contentfactory/react/platform/platform.symbol';
import { PostPreviewDialog } from '@contentfactory/frontend/components/preview/post.preview.dialog';
import { EDITORIAL_STAGE_TONES } from '@contentfactory/frontend/components/launches/editorial-stage.badge';
import {
  editorialStageLabel,
  resolveEditorialStageLocale,
  EditorialStageValue,
} from '@contentfactory/frontend/components/launches/editorial-stage.copy';
import { StatusTone } from '@contentfactory/frontend/components/ui/surface';
import {
  BracketsIcon,
  ChannelMarks,
  ChartIcon,
  CopyIcon,
  EyeIcon,
  PostCardAction,
  PostCardActions,
  StageBand,
  StagePill,
  TrashIcon,
} from '@contentfactory/frontend/components/launches/post-card.parts';

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

      const data = await (await fetch(`/posts/group/${post.group}`)).json();
      const date = !isDuplicate
        ? null
        : (await (await fetch('/posts/find-slot')).json()).date;
      const publishDate = dayjs.utc(date || data.posts[0].publishDate).local();
      const ExistingData = !isDuplicate
        ? ExistingDataContextProvider
        : Fragment;
      modal.openModal({
        id: 'add-edit-modal',
        closeOnClickOutside: false,
        removeLayout: true,
        closeOnEscape: false,
        withCloseButton: false,
        askClose: true,
        fullScreen: true,
        classNames: {
          modal: 'w-[100%] max-w-[1400px] text-textColor',
        },
        children: (
          <ExistingData value={data}>
            <AddEditModal
              {...(isDuplicate
                ? {
                    onlyValues: data.posts.map(
                      ({ image, settings, content }: any) => ({
                        image,
                        settings,
                        content,
                      })
                    ),
                  }
                : {})}
              allIntegrations={integrations.map((p) => ({ ...p }))}
              reopenModal={editPost(post)}
              mutate={mutate}
              integrations={
                isDuplicate
                  ? integrations
                  : integrations
                      .slice(0)
                      .filter((f) => f.id === data.integration)
                      .map((p) => ({
                        ...p,
                        picture: data.integrationPicture,
                      }))
              }
              date={publishDate}
            />
          </ExistingData>
        ),
        size: '80%',
        title: ``,
      });
    },
    [integrations, fetch, modal, mutate]
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

  return (
    <div className="flex flex-col gap-[10px] flex-1 relative">
      <div className="absolute start-0 top-0 w-full h-full flex flex-col overflow-auto scrollbar scrollbar-thumb-fifth scrollbar-track-newBgColor">
        {options.map((option) => (
          <Fragment key={option[0].time}>
            <div className="text-center text-[14px] min-h-[21px] shrink-0">
              {newDayjs()
                .utc()
                .startOf('day')
                .add(option[0].time, 'minute')
                .local()
                .format(isUSCitizen() ? 'hh:mm A' : 'LT')}
            </div>
            {/*
              `shrink-0` is what keeps a time slot as tall as the card inside
              it. The scroller above is a flex column, so every slot was a flex
              item free to shrink to its `min-h-[60px]` floor — and it did, so
              a 116px card was drawn over the slot below it. The taller the
              card, the further it reached: with the stage badge on the card,
              the sentence landed under the next post's coloured strip.
            */}
            <div
              key={option[0].time}
              className="min-h-[60px] shrink-0 rounded-[10px] flex justify-center items-center gap-[10px] mb-[20px]"
            >
              <CalendarContext.Provider
                value={{
                  ...calendar,
                  integrations: option.flatMap((p) => p.integration),
                }}
              >
                <CalendarColumn
                  getDate={currentDay
                    .startOf('day')
                    .add(option[0].time, 'minute')
                    .local()}
                />
              </CalendarContext.Provider>
            </div>
          </Fragment>
        ))}
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
                randomHour={true}
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
  const { integrations, loading, listPosts, listState } = useCalendar();
  const emptyMessage =
    listState === 'scheduled'
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

  if (listPosts.length === 0) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center">
        <div className="text-textColor text-[16px]">{emptyMessage}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[10px] flex-1 relative">
      <div className="absolute start-0 top-0 w-full h-full flex flex-col overflow-auto scrollbar scrollbar-thumb-fifth scrollbar-track-newBgColor">
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
  randomHour?: boolean;
}> = memo((props) => {
  const t = useT();

  const { getDate, randomHour } = props;
  const [num, setNum] = useState(0);
  const user = useUser();
  const {
    integrations,
    posts,
    changeDate,
    display,
    reloadCalendarView,
    sets,
    signature,
    loading,
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
  const [showAll, setShowAll] = useState(false);
  const showAllFunc = useCallback(() => {
    setShowAll(true);
  }, []);
  const showLessFunc = useCallback(() => {
    setShowAll(false);
  }, []);
  const list = useMemo(() => {
    if (showAll) {
      return postList;
    }
    return postList.slice(0, 3);
  }, [postList, showAll]);

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
        const statuses = await Promise.all(
          ids.map(async (id) => {
            const { status } = await fetch(`/posts/${id}/date`, {
              method: 'PUT',
              body: JSON.stringify({
                date: getDate.utc().format('YYYY-MM-DDTHH:mm:ss'),
                action,
              }),
            });
            return status;
          })
        );
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

  const addModal = useCallback(async () => {
    const set: any = !sets.length
      ? undefined
      : await new Promise((resolve) => {
          modal.openModal({
            title: t('select_set', 'Select a Set'),
            closeOnClickOutside: true,
            askClose: false,
            closeOnEscape: true,
            withCloseButton: true,
            onClose: () => resolve('exit'),
            children: (
              <SetSelectionModal
                sets={sets}
                onSelect={(selectedSet) => {
                  resolve(selectedSet);
                  modal.closeAll();
                }}
                onContinueWithoutSet={() => {
                  resolve(undefined);
                  modal.closeAll();
                }}
              />
            ),
          });
        });

    if (set === 'exit') return;

    modal.openModal({
      id: 'add-edit-modal',
      closeOnClickOutside: false,
      removeLayout: true,
      closeOnEscape: false,
      withCloseButton: false,
      askClose: true,
      fullScreen: true,
      classNames: {
        modal: 'w-[100%] max-w-[1400px] text-textColor',
      },
      children: (
        <AddEditModal
          allIntegrations={integrations.map((p) => ({
            ...p,
          }))}
          integrations={integrations.slice(0).map((p) => ({
            ...p,
          }))}
          mutate={reloadCalendarView}
          {...(signature?.id && !set
            ? {
                onlyValues: [
                  {
                    content: '\n' + signature.content,
                  },
                ],
              }
            : {})}
          date={
            randomHour
              ? getDate.hour(Math.floor(Math.random() * 24))
              : getDate.format('YYYY-MM-DDTHH:mm:ss') ===
                newDayjs().startOf('hour').format('YYYY-MM-DDTHH:mm:ss')
              ? newDayjs().add(10, 'minute')
              : getDate
          }
          {...(set?.content ? { set: JSON.parse(set.content) } : {})}
          reopenModal={() => ({})}
        />
      ),
      size: '80%',
    });
  }, [integrations, getDate, sets, signature]);

  const addProvider = useAddProvider();
  const toaster = useToaster();

  /**
   * The empty cell, for somebody who may not add a channel
   * (content-factory-next-fn33.67).
   *
   * With no channel in the workspace this cell opened the whole provider
   * catalogue, and every icon in it ends at
   * `GET /integrations/social/:integration` — an administrator door
   * (`docs/product/roles-matrix.md`). `AddProviderButton` already hides
   * itself from a member for exactly that reason; the calendar reached the
   * same modal around it.
   */
  const canAddChannel = isOrganizationAdmin(user?.role);

  /**
   * The same cell for somebody who may not write a post
   * (`content-factory-next-fn33.90`, owner decision of 05.09.2026).
   *
   * `POST /posts` carries `Sections.EDITOR` now, so opening the compose
   * window for a `USER` would hand them a form with a dead «Добавить в
   * календарь» at the end of it. That is the shape of the defect
   * `content-factory-next-fn33.63` was opened for, one screen over. The cell
   * answers in one line instead.
   */
  const canWritePosts = isOrganizationEditor(user?.role);

  /**
   * The same cell in a workspace with no channel at all
   * (`content-factory-next-fn33.148`).
   *
   * `fn33.67` above answered the member with a toast and still handed the
   * administrator the catalogue, so one cell gave two roles two different
   * answers and neither of them opened the compose window — which the
   * calendar's own «План / Пишется / Проверка» band promises. A draft with no
   * channel cannot exist today: `Post.integrationId` is required in
   * `schema.prisma` and `Post.integration` is `@IsDefined()` in
   * `create.post.dto.ts`, so opening the window would hand somebody a form
   * that dies on save.
   *
   * One answer for everybody, in a card rather than a toast: a toast has no
   * second reading, and the design rules keep the only copy of a state off
   * one. The administrator gets the catalogue from a button
   * inside the card instead of in place of it.
   */
  const explainNoChannel = useCallback(() => {
    modal.openModal({
      title: t('compose_needs_channel_title', 'Connect a channel to write posts'),
      closeOnClickOutside: true,
      closeOnEscape: true,
      withCloseButton: true,
      children: (close: () => void) => (
        <NoChannelNotice
          canAddChannel={canAddChannel}
          canWritePosts={canWritePosts}
          onAddChannel={() => {
            close();
            addProvider();
          }}
        />
      ),
    });
  }, [modal, t, canAddChannel, canWritePosts, addProvider]);

  const refuseWritePost = useCallback(() => {
    toaster.show(
      t(
        'create_post_editor_only',
        'Writing a post is an editor action. Ask an administrator of this workspace for the editor role.'
      ),
      'warning'
    );
  }, [t, toaster]);

  return (
    <div
      className={clsx(
        'flex flex-col w-full min-h-full relative',
        isBeforeNow && 'repeated-strip',
        loading && 'animate-pulse',
        isBeforeNow
          ? 'cursor-not-allowed'
          : 'border border-newTextColor/5 rounded-[8px]'
      )}
      ref={drop as any}
    >
      {display === 'month' && (
        <div className={clsx('pt-[6px] text-[14px]')}>{getDate.date()}</div>
      )}
      <div
        className={clsx(
          'relative flex flex-col flex-1 text-white rounded-[8px] min-h-[70px]',
          canDrop && 'border border-cf-accent'
        )}
      >
        <div
          className={clsx(
            'flex-col text-[12px] pointer w-full flex scrollbar scrollbar-thumb-tableBorder scrollbar-track-secondary',
            isBeforeNow ? 'flex-1' : 'cursor-pointer',
            isBeforeNow && postList.length === 0 && 'col-calendar'
          )}
          // The hover caption on a cell whose time has gone. Kept as an
          // attribute so the words come out of the dictionary rather than out
          // of `global.scss` (`content-factory-next-fn33.79`).
          {...(isBeforeNow && postList.length === 0
            ? { 'data-date-passed': t('date_passed', 'Date passed') }
            : {})}
        >
          {loading && (
            <div className="h-full w-full p-[5px] animate-pulse absolute left-0 top-0 z-[50]">
              <div className="h-full w-full bg-newSettings rounded-[10px]" />
            </div>
          )}
          {list.map(({ key, lead, members }) => (
            <div
              key={key}
              className={clsx(
                'text-textColor p-[2.5px] relative flex flex-col justify-center items-center'
              )}
            >
              <div className="relative w-full flex flex-col items-center p-[2.5px]">
                <CalendarItem
                  display={display as 'day' | 'week' | 'month'}
                  isBeforeNow={isBeforeNow}
                  date={getDate}
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
                />
              </div>
            </div>
          ))}
          {!showAll && postList.length > 3 && (
            <div
              className="text-center hover:underline py-[5px] text-textColor"
              onClick={showAllFunc}
            >
              {t('show_more', '+ Show more')} ({postList.length - 3})
            </div>
          )}
          {showAll && postList.length > 3 && (
            <div
              className="text-center hover:underline py-[5px]"
              onClick={showLessFunc}
            >
              {t('show_less', '- Show less')}
            </div>
          )}
        </div>
        {!isBeforeNow && (
          <div
            className="pb-[2.5px] px-[5px] flex-1 flex"
            onClick={
              !integrations.length
                ? explainNoChannel
                : !canWritePosts
                ? refuseWritePost
                : addModal
            }
          >
            <div
              className={clsx(
                display === ('month' as any)
                  ? 'flex-1 min-h-[40px] w-full'
                  : !postList.length
                  ? 'min-h-full w-full p-[5px]'
                  : 'min-h-[40px] w-full',
                'flex items-center justify-center cursor-pointer pb-[2.5px]'
              )}
            >
              {display !== 'day' && (
                <div
                  className={clsx(
                    'group hover:before:h-[30px] w-full h-full rounded-[10px] flex justify-center items-center text-white'
                  )}
                >
                  <div
                    className={`group-hover:before:content-["+"] pb-[5px] flex justify-center items-center rounded-[8px] transition-all group-hover:bg-btnPrimary w-full h-full max-w-[40px] max-h-[40px]`}
                  />
                </div>
              )}
              {display === 'day' && (
                <div
                  className={`w-full h-full rounded-[10px] py-[10px] flex-wrap hover:border hover:border-seventh flex justify-center items-center gap-[20px] opacity-30 grayscale hover:grayscale-0 hover:opacity-100`}
                >
                  {integrations.slice(0, 4).map((selectedIntegrations) => (
                    <div
                      className="relative"
                      key={selectedIntegrations.identifier}
                    >
                      <div
                        className={clsx(
                          'relative w-[34px] h-[34px] rounded-[8px] flex justify-center items-center filter transition-all duration-500'
                        )}
                      >
                        {selectedIntegrations.picture ? (
                          <img
                            src={selectedIntegrations.picture}
                            className="h-[32px] w-[32px] rounded-[8px]"
                            alt={selectedIntegrations.name}
                          />
                        ) : (
                          <PlatformSymbol
                            identifier={selectedIntegrations.identifier}
                            size={32}
                            decorative={false}
                            name={selectedIntegrations.name}
                          />
                        )}
                        <PlatformBadge
                          identifier={selectedIntegrations.identifier}
                          size={16}
                          className="absolute z-10 -bottom-[4px] -end-[4px]"
                        />
                      </div>
                    </div>
                  ))}
                  {integrations.length > 4 && (
                    <span
                      className="cf-label-sm text-cf-ink"
                      role="img"
                      aria-label={t('more_connected_channels', '{{count}} more channels', {
                        count: integrations.length - 4,
                      })}
                    >
                      +{integrations.length - 4}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
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
 * Two shapes, one vocabulary. The week and month grids get the narrow card
 * (band, sentence, channel marks); the day and list views, where the column is
 * the full width of the screen, get a single 36px row with the stage as a pill
 * at the head of the line.
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
  showTime?: boolean;
  post: Post & {
    integration: Integration;
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
  const wide = display === 'day';

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
    : tagNames;
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
      max={wide ? 4 : 3}
    />
  );

  const timeLabel = newDayjs(post.publishDate)
    .local()
    .format(isUSCitizen() ? 'hh:mm A' : 'HH:mm');

  const sentence = (
    <>
      {state === 'DRAFT' ? `${t('draft', 'Draft')}: ` : ''}
      {stripHtmlValidation('none', post.content, false, true, false) ||
        t('no_content', 'no content')}
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
      inline={wide}
      moreLabel={t('more_actions', 'More actions')}
      className={clsx(
        'opacity-0 pointer-events-none',
        'group-hover:opacity-100 group-hover:pointer-events-auto',
        'focus-within:opacity-100 focus-within:pointer-events-auto',
        'transition-opacity duration-state',
        !wide && 'absolute -top-[12px] -end-[8px] z-30 shadow-menu'
      )}
    />
  );

  return (
    <div
      // @ts-ignore
      ref={dragRef}
      className={clsx(
        'w-full flex flex-1 group relative',
        wide ? 'items-center' : 'h-full flex-col',
        'rounded-[8px] border bg-cf-surface-subtle',
        state === 'ERROR' ? 'border-cf-danger' : 'border-cf-border',
        wide && 'min-h-[36px] gap-[10px] px-[10px] py-[4px]',
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

      {wide ? (
        <>
          {bandLabel && (
            <StagePill tone={bandTone} label={bandLabel} title={bandTitle} />
          )}
          <div
            onClick={editPost}
            className="flex-1 min-w-0 cf-body-md text-cf-ink truncate text-start cursor-pointer"
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
            className="p-3 border border-tableBorder rounded-lg cursor-pointer hover:transition-colors"
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
          className="flex-1 px-4 py-2 rounded-lg hover:transition-colors"
        >
          {t('continue_without_set', 'Continue without set')}
        </Button>
      </div>
    </div>
  );
};
