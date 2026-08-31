'use client';

import { useState, type ReactNode } from 'react';
import { Tab, TabList, TabPanel, Tabs } from '@contentfactory/react/choice/tabs';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import clsx from 'clsx';
import { ContentIntelligenceSettings } from './content-intelligence.settings';
import {
  contentSectionCopy,
  type ContentSectionLocale,
} from './content-section.copy';
import { ContentMaterialsPlaceholder } from './content-materials.placeholder';
import { ContentFactsContainer } from './content-facts.container';
import { VoiceTab } from '../brand-voice/voice-tab';
import { VoiceBriefContainer } from '../brand-voice/voice-brief.container';
import { VoiceMaterialsContainer } from '../brand-voice/voice-materials.container';
import type { ContentIntelligenceSection } from './content-intelligence.view';

/**
 * Content creation, in the working menu instead of inside a settings modal.
 *
 * The product is called Content Factory and the place where its content is
 * shaped was three levels down an administrative dialog. The interface
 * specification splits the shell by question: the working mode answers "what
 * should I make now", the administrative group answers "how is this workspace
 * configured". Avatars and sources answer the first question and were
 * filed under the second.
 *
 * The container moves; the view does not. `ContentIntelligenceSettings` keeps
 * every state, both locales and both themes it already had, and is mounted
 * here with one section visible at a time and its own header off, because this
 * screen already names the surface and already offers the choice.
 */
/**
 * The five tabs, named for themselves.
 *
 * They used to be `ContentIntelligenceSection | 'materials' | 'brief'`, which
 * gave the first tab the key `brand` — the name of a settings section it once
 * mounted. That section is gone and the tab was never really it: what the tab
 * holds is the avatars, which is also what its label has said since 093b1985.
 * Two of the five still open a section of the settings view, and those two
 * carry that view's own names so the mapping stays a fact rather than a table
 * to maintain.
 */
export type ContentTab =
  | 'avatars'
  | ContentIntelligenceSection
  | 'materials'
  | 'brief';

export { contentSectionCopy, ContentMaterialsPlaceholder };
export type { ContentSectionLocale };

/**
 * The order is the working order, and «Бриф» sits where the decision does.
 *
 * Between the sources a text rests on and the material that came out of it:
 * first what is being said and on what grounds, then what was written. The
 * brief screen and its routes were built by `content-factory-next-07h.4` and
 * were reachable from nothing but the review fixture until this entry existed.
 */
export const CONTENT_TABS: readonly ContentTab[] = [
  'avatars',
  'sources',
  'brief',
  'materials',
  'provenance',
];


/**
 * The frame: a heading, five tabs and one panel.
 *
 * Separate from the screen because it holds no data and makes no request, so
 * the review route can open it in every width, theme and language without a
 * network — and because the panel it shows is then obviously the caller's
 * decision rather than something the frame quietly knows.
 *
 * Two things about its geometry are decisions rather than defaults.
 *
 * It takes the whole width the shell gives it. It used to sit in a 1120px
 * column, which put a gutter down both sides of a section whose neighbours —
 * the calendar, analytics — run edge to edge, and made the same application
 * look like two applications. Measure is still bounded where measure matters:
 * the description and every paragraph below carry their own `max-w`, so the
 * column that widened is the one holding tables, cards and lists, not the one
 * holding prose.
 *
 * And the tab strip is the analytics strip. That screen already answers "the
 * section is one place, these are its parts" with a band under the title, and
 * two different answers to that question inside one product is how a person
 * learns the navigation twice. The current tab is marked by an underline that
 * the others do not have as well as by colour, which is the rule `DESIGN.md`
 * states and the reason a filled pill was not simply recoloured.
 */
export function ContentSectionShell({
  locale,
  tab,
  onTabChange,
  children,
}: {
  locale: ContentSectionLocale;
  tab: ContentTab;
  onTabChange: (tab: ContentTab) => void;
  children: ReactNode;
}) {
  const t = contentSectionCopy[locale];

  return (
    <Tabs value={tab} onChange={(value) => onTabChange(value as ContentTab)}>
      <div
        data-production-surface="content/section"
        data-content-tab={tab}
        // The 44px mobile hit area belongs to the frame, not to each control:
        // `ControlButton` strips a height its caller passes, so the rule has to
        // come from an ancestor. It covers the tab strip as well as the panel —
        // the strip is the first thing a thumb lands on.
        className="flex min-h-0 w-full min-w-0 flex-1 flex-col bg-cf-canvas text-cf-ink [&_button]:min-h-[44px] sm:[&_button]:min-h-0"
      >
        <header className="border-b border-cf-border bg-cf-surface px-[20px] pt-[20px] md:px-[24px]">
          <h1 className="cf-heading-lg text-cf-ink [text-wrap:balance]">
            {t.title}
          </h1>
          <p className="mt-[8px] max-w-[72ch] cf-body-md text-cf-ink-muted [text-wrap:pretty]">
            {t.description}
          </p>

          <TabList
            aria-label={t.tabs}
            // Width is the other half of a touch target, and a two-syllable
            // label like «Бриф» is narrower than a fingertip on its own.
            className="mt-[16px] flex flex-wrap gap-x-[24px] gap-y-[4px] [&_button]:min-w-[44px] sm:[&_button]:min-w-0"
          >
            {CONTENT_TABS.map((value) => (
              <Tab
                key={value}
                value={value}
                className={clsx(
                  // The height belongs to `ControlButton`, which strips any the
                  // caller passes. The mobile hit area is the wrapper's job, the
                  // same way `content-intelligence.view.tsx` does it.
                  'inline-flex items-center border-b-2 pb-[12px] cf-label-md transition-colors duration-state motion-reduce:transition-none',
                  tab === value
                    ? 'border-cf-accent text-cf-accent'
                    : 'border-transparent text-cf-ink-muted hover:text-cf-ink'
                )}
              >
                {t[value]}
              </Tab>
            ))}
          </TabList>
        </header>

        <TabPanel
          value={tab}
          className="flex min-w-0 flex-col p-[20px] md:p-[24px]"
        >
          {children}
        </TabPanel>
      </div>
    </Tabs>
  );
}

export function ContentSectionScreen({
  initialTab = 'avatars',
}: {
  initialTab?: ContentTab;
} = {}) {
  const { language } = useVariables();
  const locale: ContentSectionLocale = language.toLowerCase().startsWith('ru')
    ? 'ru'
    : 'en';
  const [tab, setTab] = useState<ContentTab>(initialTab);

  return (
    <ContentSectionShell locale={locale} tab={tab} onTabChange={setTab}>
      {/*
        Three tabs hold live work rather than a settings form. `avatars` is the
        measured voice, edited on the card that shows it. `brief` is the radar
        and the gate between a brief and a draft. `materials` is the library;
        its empty state is the same one that stood here as a placeholder,
        because that is genuinely what a workspace with no pieces sees.
      */}
      {tab === 'avatars' ? (
        <VoiceTab />
      ) : tab === 'brief' ? (
        <VoiceBriefContainer />
      ) : tab === 'materials' ? (
        <VoiceMaterialsContainer />
      ) : tab === 'provenance' ? (
        // The fact catalogue a brief cites by id sits above the context
        // inspector: the door to add to working memory, next to the tool that
        // reads what a built context drew from it.
        <div className="flex min-w-0 flex-col gap-[20px]">
          <ContentFactsContainer />
          <ContentIntelligenceSettings
            visibleSections={[tab]}
            showHeader={false}
          />
        </div>
      ) : (
        <ContentIntelligenceSettings
          visibleSections={[tab]}
          showHeader={false}
        />
      )}
    </ContentSectionShell>
  );
}

export default ContentSectionScreen;
