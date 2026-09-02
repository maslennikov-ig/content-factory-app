'use client';

import { useState } from 'react';
import {
  InterfaceReviewFrame,
  defineInterfaceReviewScene,
  type InterfaceReviewContext,
  type InterfaceReviewState,
} from '../interface-review/fixture-contract';
import {
  ContentMaterialsPlaceholder,
  ContentSectionShell,
  contentSectionCopy,
  type ContentTab,
} from './content-section.screen';

/**
 * The Content route's frame: heading, four tabs, one panel.
 *
 * Only the frame. `avatars` and the now-hidden `sources`/`provenance`
 * settings sections are the same `ContentIntelligenceView` the settings
 * modal always showed, and they have their own review scenes; opening them
 * here would review them twice and would need a network this route
 * deliberately does not have. `content-factory-next-odb8` dropped `sources`
 * from `CONTENT_TABS` and repointed `provenance`'s panel at the facts
 * witness screen — this scene's own stub cases follow, below.
 *
 * What is new and therefore worth looking at is the frame itself: whether
 * four tabs fit at 390px in Russian, whether a tab with no content reads as
 * unfinished rather than broken, and whether the current tab is marked by
 * something other than colour.
 */
export const CONTENT_SECTION_REVIEW_STATES = [
  'loading',
  'empty',
  'default',
  'selected',
  'success',
  'error',
  'restricted',
  'disabled',
  'long-content',
] as const satisfies readonly InterfaceReviewState[];

export const contentSectionFixture = {
  tabs: ['avatars', 'brief', 'materials', 'provenance'],
} as const;

export const scene = defineInterfaceReviewScene({
  id: 'content-intelligence/content-section',
  fixture: contentSectionFixture,
  states: CONTENT_SECTION_REVIEW_STATES,
});

type PanelCase = Readonly<{
  tab: ContentTab;
  panel: 'materials' | 'stub';
  note: { en: string; ru: string };
  stub?: {
    en: string;
    ru: string;
    role?: 'alert' | 'status';
    busy?: boolean;
    muted?: boolean;
  };
}>;

/**
 * The frame carries a state only in as much as its panel does. Where the panel
 * is somebody else's surface, this shows a stub that says which state that
 * surface is in — the question here is whether the frame still holds together
 * around it, not what that surface looks like.
 */
const CASES: Readonly<Record<InterfaceReviewState, PanelCase>> = {
  loading: {
    tab: 'avatars',
    panel: 'stub',
    stub: {
      en: 'Loading the brand voice',
      ru: 'Загружаем аватары',
      busy: true,
    },
    note: {
      en: 'The frame is complete before the panel is. Tabs stay usable while one loads.',
      ru: 'Оболочка готова раньше панели. Вкладки остаются рабочими, пока одна грузится.',
    },
  },
  empty: {
    tab: 'materials',
    panel: 'materials',
    note: {
      en: 'The fourth tab has no content until 36r.8. It is shown anyway, and says why.',
      ru: 'Четвёртая вкладка пуста до 36r.8. Её всё равно показывают и объясняют почему.',
    },
  },
  default: {
    tab: 'avatars',
    panel: 'stub',
    stub: { en: 'Avatars', ru: 'Аватары' },
    note: {
      en: 'The first tab, which is where the route opens.',
      ru: 'Первая вкладка — с неё раздел открывается.',
    },
  },
  selected: {
    tab: 'provenance',
    panel: 'stub',
    stub: { en: 'Facts', ru: 'Откуда факты' },
    note: {
      en: 'The current tab carries an underline the others do not, so the mark is not colour alone.',
      ru: 'У текущей вкладки есть подчёркивание, которого нет у остальных: метка не только цветом.',
    },
  },
  success: {
    tab: 'provenance',
    panel: 'stub',
    stub: {
      en: 'Fact retracted',
      ru: 'Факт снят',
      role: 'status',
    },
    note: {
      en: 'A result inside the panel does not move the frame.',
      ru: 'Результат внутри панели не двигает оболочку.',
    },
  },
  error: {
    tab: 'provenance',
    panel: 'stub',
    stub: {
      en: 'The facts could not be loaded',
      ru: 'Факты не загрузились',
      role: 'alert',
    },
    note: {
      en: 'A failed panel keeps the other three reachable: the frame is not part of the failure.',
      ru: 'Отказ панели не запирает остальные три: оболочка в отказе не участвует.',
    },
  },
  restricted: {
    tab: 'avatars',
    panel: 'stub',
    stub: {
      en: 'Workspace administrator access is required',
      ru: 'Нужны права администратора рабочего пространства',
      muted: true,
    },
    note: {
      en: 'A reader without rights still navigates; the restriction belongs to the panel.',
      ru: 'Читатель без прав всё равно ходит по вкладкам; ограничение принадлежит панели.',
    },
  },
  disabled: {
    tab: 'materials',
    panel: 'materials',
    note: {
      en: 'Nothing in the frame is disabled. The tab with no content still opens and explains itself.',
      ru: 'В оболочке ничего не выключено. Вкладка без содержимого открывается и объясняет себя.',
    },
  },
  'long-content': {
    tab: 'materials',
    panel: 'materials',
    note: {
      en: 'Six Russian labels wrap onto a second row at 390px rather than scrolling sideways.',
      ru: 'Шесть русских подписей переносятся на вторую строку на 390px, а не уезжают вбок.',
    },
  },
};

export function Scene({ context }: { context: InterfaceReviewContext }) {
  const active = CASES[context.state];
  const [tab, setTab] = useState<ContentTab>(active.tab);
  const locale = context.locale;
  const t = contentSectionCopy[locale];

  return (
    <InterfaceReviewFrame scene={scene} context={context}>
      <div data-interface-review-data="synthetic">
        <ContentSectionShell locale={locale} tab={tab} onTabChange={setTab}>
          {tab === 'materials' || active.panel === 'materials' ? (
            <ContentMaterialsPlaceholder locale={locale} />
          ) : (
            <div
              data-content-panel="stub"
              role={active.stub?.role}
              aria-busy={active.stub?.busy ? 'true' : undefined}
              className={`rounded-[8px] border border-cf-border bg-cf-surface p-[20px] cf-body-md ${
                active.stub?.muted ? 'text-cf-ink-muted' : 'text-cf-ink'
              }`}
            >
              {active.stub?.[locale] ?? t[tab as 'avatars' | 'brief' | 'provenance']}
            </div>
          )}
        </ContentSectionShell>
        <p className="max-w-[72ch] px-[20px] pb-[20px] cf-caption text-cf-ink-muted [text-wrap:pretty] md:px-[24px]">
          {active.note[locale]}
        </p>
      </div>
    </InterfaceReviewFrame>
  );
}
