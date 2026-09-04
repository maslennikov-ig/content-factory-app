'use client';

import { useCallback, useState, type ReactNode } from 'react';
import { Tab, TabList, TabPanel, Tabs } from '@contentfactory/react/choice/tabs';
import {
  RadioGroup,
  RadioOption,
} from '@contentfactory/react/choice/radio.group';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import clsx from 'clsx';
import { ContentIntelligenceSettings } from './content-intelligence.settings';
import {
  contentSectionCopy,
  type ContentSectionLocale,
} from './content-section.copy';
import { ContentMaterialsPlaceholder } from './content-materials.placeholder';
import { ContentFactsShowcase } from './content-facts.showcase';
import { ContentLeadsTab } from './content-leads.tab';
import { VoiceTab } from '../brand-voice/voice-tab';
import { VoiceBriefContainer } from '../brand-voice/voice-brief.container';
import { VoiceMaterialsContainer } from '../brand-voice/voice-materials.container';
import { ContentArchiveContainer } from './content-archive.container';
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
 * The tabs, named for themselves.
 *
 * The type still widens through `ContentIntelligenceSection` (`'sources' |
 * 'provenance'`) rather than naming its own values: `'sources'` is no
 * longer in `CONTENT_TABS` below, but `ContentIntelligenceSettings` and its
 * review scenes still accept it, and narrowing the type here would be one
 * more place that has to change every time a settings section is folded in
 * or out of this screen's strip. `avatars` used to be `brand`, the name of a
 * settings section it once mounted; that section is gone and the tab was
 * never really it — what the tab holds is the avatars, which is also what
 * its label has said since 093b1985.
 *
 * `'archive'` left this union along with the tab: it is no longer a value
 * `ContentSectionShell` or its `TabPanel` ever has to render. It survives
 * only as a legacy input `ContentSectionScreen` accepts and translates — see
 * the comment there.
 */
export type { ContentTab } from './content-section.tabs';
import type { ContentTab } from './content-section.tabs';

export { contentSectionCopy, ContentMaterialsPlaceholder };
import { resolveContentLocale } from './content-section.copy';
export type { ContentSectionLocale };

/**
 * Five places, and «Бриф» sits where the decision does.
 *
 * `content-factory-next-odb8` sections the working menu down to three
 * questions (`docs/product/content-section-map.md` §3): who writes, what is
 * written next, and where the product got what it treats as true. «Источники»
 * — the list, the form and the lifecycle of a `ContentSource` row — is gone
 * from here: it sat dead on production for twelve days before anyone
 * noticed, and the owner did not read it with three explanations. Nothing it
 * ran was deleted; `ContentIntelligenceSettings` and its review scenes still
 * exist, reachable through `/interface-review`, and simply are not on this
 * strip any more. «Происхождение» keeps its key — `content-section.copy.ts`
 * still calls it `provenance` and `content-facts.container.tsx`'s own test
 * still greps for `tab === 'provenance'` — but the panel behind it is now
 * the witness screen (`content-facts.showcase.tsx`), not the context
 * inspector; the label changed instead of the key so a stored tab or a test
 * regex naming the old key does not silently point at nothing.
 *
 * «Материалы» keeps its place, and «Что уже написали» is not a sixth tab
 * beside it: §9.4 of `docs/product/content-section-map.md`, decided
 * 02.09.2026 — «Не вижу смысла делать два места» — folds the archive into
 * the Materials tab as a view a person switches inside one list, not a
 * separate stop on the strip. `ContentSectionScreen` below owns the switch
 * and mounts `ContentArchiveContainer` under it; `content-archive.adapter.ts`
 * and the container itself are unchanged.
 */
export { CONTENT_TABS } from './content-section.tabs';
import { CONTENT_TABS } from './content-section.tabs';


/**
 * The two views one list holds instead of two tabs.
 *
 * `docs/product/content-section-map.md` §9.4 (decided 02.09.2026): «Материалы»
 * and «Что уже написали» read as one place with a switch inside it, not two
 * stops on the tab strip. `RadioGroup`/`RadioOption` is the choice primitive
 * this same file's neighbour, `content-archive.container.tsx`, already uses
 * for its import dialog's origin field, and it fits here for the reason its
 * own doc comment gives: picking a view is cheap, reversible, and does not
 * navigate anywhere — which is what separates a radio group from a tab list
 * in this design system, not just which panel happens to be underneath it.
 *
 * The pill styling below is the same fill-versus-surface split
 * `form/button.tsx` uses for its own variants: a filled, accent pill for the
 * current view and a quiet one for the other, `cf-pressed-fill`/`cf-pressed`
 * for the press each already carries. The wrapping panel forces every button
 * inside it to a 44px mobile hit area (`ContentSectionShell`'s own
 * `[&_button]:min-h-[44px]`), so the switch does not have to ask for its own.
 */
export type MaterialsView = 'materials' | 'archive';

// The labels live with the rest of the frame's words in
// `content-section.copy.ts`; this only reshapes them by view key.
const materialsViewCopy = (locale: ContentSectionLocale) => {
  const words = contentSectionCopy[locale];
  return {
    label: words.materialsViewLabel,
    materials: words.materialsViewMaterials,
    archive: words.materialsViewArchive,
  } as const;
};

const MATERIALS_VIEWS: readonly MaterialsView[] = ['materials', 'archive'];

export function MaterialsViewSwitch({
  locale,
  view,
  onChange,
}: {
  locale: ContentSectionLocale;
  view: MaterialsView;
  onChange: (view: MaterialsView) => void;
}) {
  const t = materialsViewCopy(locale);

  return (
    <RadioGroup
      value={view}
      onChange={(value) => onChange(value as MaterialsView)}
      aria-label={t.label}
      className="inline-flex gap-[4px] self-start rounded-[8px] border border-cf-border bg-cf-surface p-[4px]"
    >
      {MATERIALS_VIEWS.map((option) => (
        <RadioOption
          key={option}
          value={option}
          layout="content"
          className={clsx(
            'rounded-[4px] px-[16px] cf-label-sm transition-colors duration-state motion-reduce:transition-none',
            view === option
              ? 'bg-cf-accent text-cf-accent-ink cf-pressed-fill'
              : 'text-cf-ink-muted hover:bg-cf-surface-subtle hover:text-cf-ink cf-pressed'
          )}
        >
          {t[option]}
        </RadioOption>
      ))}
    </RadioGroup>
  );
}

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
  // `'archive'` is accepted here and nowhere else: a caller that still asks
  // for the tab from before §9.4 folded it into Materials as a view gets a
  // real screen back instead of a strip with no tab marked current. It is
  // deliberately outside `ContentTab` itself — `tab` state, `CONTENT_TABS`
  // and `ContentSectionShell` never see the value, only this prop does.
  initialTab?: ContentTab | 'archive';
} = {}) {
  const { language } = useVariables();
  const locale: ContentSectionLocale = resolveContentLocale(language);
  const [tab, setTab] = useState<ContentTab>(
    initialTab === 'archive' ? 'materials' : initialTab
  );
  const [materialsView, setMaterialsView] = useState<MaterialsView>(
    initialTab === 'archive' ? 'archive' : 'materials'
  );

  /**
   * The address follows the screen (content-factory-next-fn33.60).
   *
   * The tab was local state and nothing else: «Взять в работу» moved the
   * screen to «Бриф» while the bar still read `?tab=leads`, and a reload
   * threw the person back to «Откуда идеи». Every way of changing the tab
   * goes through here now — the strip and the lead alike — so there is one
   * answer to "where am I", not two.
   *
   * `history.replaceState` rather than the router: the same idiom
   * `launches/calendar.context.tsx` already uses for exactly this, and it
   * keeps a tab change from re-running the section's server component. It
   * replaces rather than pushes because a tab is where you are, not a step
   * back through.
   */
  const changeTab = useCallback((next: ContentTab) => {
    setTab(next);
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', `/content?tab=${next}`);
    }
  }, []);

  return (
    <ContentSectionShell locale={locale} tab={tab} onTabChange={changeTab}>
      {/*
        Three tabs hold live work rather than a settings form. `avatars` is the
        measured voice, edited on the card that shows it. `brief` is the radar
        and the gate between a brief and a draft. `materials` is the library;
        its empty state is the same one that stood here as a placeholder,
        because that is genuinely what a workspace with no pieces sees. It
        also carries the view switch — `materialsView` picks between the
        library (`VoiceMaterialsContainer`) and the archive
        (`ContentArchiveContainer`), per §9.4's "one place, two views".
      */}
      {tab === 'avatars' ? (
        <VoiceTab />
      ) : tab === 'leads' ? (
        // «Откуда идеи» (`content-factory-next-odb8.3`): subscriptions and
        // the leads they bring back. «Взять в работу» spends the lead and
        // opens the Brief tab; it does not prefill the brief's thesis field
        // — `voice-brief.container.tsx` is outside this task's write zone.
        <ContentLeadsTab onNavigateToBrief={() => changeTab('brief')} />
      ) : tab === 'brief' ? (
        <VoiceBriefContainer />
      ) : tab === 'materials' ? (
        <div className="flex min-w-0 flex-col gap-[16px]">
          <MaterialsViewSwitch
            locale={locale}
            view={materialsView}
            onChange={setMaterialsView}
          />
          {materialsView === 'materials' ? (
            <VoiceMaterialsContainer />
          ) : (
            // «Что уже написали» (`content-factory-next-odb8.4`): three
            // layers — made here, brought in from before the product,
            // published beside it — in one flat, filterable list, now the
            // second view inside Materials rather than its own tab.
            <ContentArchiveContainer />
          )}
        </div>
      ) : tab === 'provenance' ? (
        // «Откуда факты» (`content-factory-next-odb8.1`): a witness, not a
        // workbench. Adding a fact happens on the Brief tab, where the
        // question is asked; this only shows what memory already holds.
        <ContentFactsShowcase />
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
