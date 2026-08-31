'use client';

import Link from 'next/link';
import { clsx } from 'clsx';
import { FC, ReactNode, useState } from 'react';
import { PLATFORM_NAMES } from '@contentfactory/react/platform/platform.families';
import { Tab, TabList, TabPanel, Tabs } from '@contentfactory/react/choice/tabs';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import { getLanguageLabel } from '@contentfactory/frontend/components/layout/language.presentation';
import { usePublicCopy } from './public-copy';
import {
  DemoPanel,
  DemoRow,
  PlatformMark,
  RecordId,
  StatusPill,
} from './home-parts';

/**
 * The six product shots the landing page is built around.
 *
 * Every one of them is markup: the same tokens, the same 4px rhythm and the
 * same flat panels the product itself is drawn with, at whatever width the
 * visitor's screen happens to be. A picture would have been faster and would
 * have been wrong — it cannot reflow at 390px, it cannot be read by a screen
 * reader, it goes stale the day the product moves, and at 200% zoom it is a
 * blur.
 *
 * They all follow one piece of content — the same article, the same
 * identifier — from idea to result. That is the page's whole argument, and five
 * unrelated samples would have made it five unrelated screenshots.
 */

/** The sample record. Not data: a stage set, and the same one every scene. */
const RECORD = 'CF-1042';

const Chip: FC<{ children: ReactNode }> = ({ children }) => (
  <span className="inline-flex items-center rounded-full border border-cf-border px-[8px] py-[4px] cf-body-sm text-cf-ink">
    {children}
  </span>
);

/** A control drawn, not offered: these panels illustrate, they do not act. */
const DemoControl: FC<{ tone?: 'primary' | 'secondary'; children: ReactNode }> =
  ({ tone = 'secondary', children }) => (
    <span
      className={clsx(
        'inline-flex min-h-[32px] items-center rounded-[8px] px-[12px] cf-label-md',
        tone === 'primary'
          ? 'bg-cf-accent text-cf-accent-ink'
          : 'border border-cf-border-control text-cf-ink'
      )}
    >
      {children}
    </span>
  );

/**
 * The destinations this material is going to.
 *
 * The five most-used platforms this product connects to, in order of monthly
 * users worldwide. The hero is the first thing a visitor reads, and a roster
 * that opens with a regional network asks them to recognise the product before
 * they recognise a single name on it. The full registry — thirty-five entries,
 * regional networks included — is the platforms scene further down; these five
 * are one material's selection, not the catalogue.
 */
const HERO_CHANNELS = [
  'facebook',
  'youtube',
  'instagram',
  'tiktok',
  'telegram',
] as const;

/**
 * The height is stated and the mark is centred inside it, rather than the pill
 * growing out of the mark's own padding. A pill is a circle at both ends, so
 * the clearance a square needs there is the diagonal, not the gap — packed to
 * four pixels the cell reads as though it were about to fall out of its own
 * chip. Twenty inside thirty-two leaves six on every side, and six is not a
 * spacing step here: it is what centring produces.
 */
const ChannelChip: FC<{ identifier: string }> = ({ identifier }) => (
  <span className="inline-flex h-[32px] shrink-0 items-center gap-[8px] rounded-full border border-cf-border bg-cf-surface pe-[16px] ps-[8px]">
    <PlatformMark identifier={identifier} />
    <span className="cf-body-sm text-cf-ink">{PLATFORM_NAMES[identifier]}</span>
  </span>
);

/* ------------------------------------------------------------------ hero -- */

const HERO_PATH = [
  'stageDraft',
  'stageAdapt',
  'stageApprove',
  'stagePublish',
  'stageAnalytics',
] as const;

export const HeroShot: FC = () => {
  const copy = usePublicCopy();
  return (
    <DemoPanel label={copy('heroDemoLabel')}>
      <DemoRow className="border-b border-cf-border bg-cf-surface-subtle">
        <RecordId>{RECORD}</RecordId>
        <span className="cf-caption text-cf-ink-muted">2026-05-16 · 22:41</span>
        <span className="ms-auto">
          <StatusPill tone="accent" icon="check">
            {copy('statusDraftSaved')}
          </StatusPill>
        </span>
      </DemoRow>

      <div className="px-[16px] py-[20px] md:px-[20px]">
        <p className="cf-heading-md text-cf-ink [text-wrap:balance]">
          {copy('sampleTitle')}
        </p>
        <p className="mt-[12px] cf-body-md text-cf-ink [text-wrap:pretty]">
          {copy('sampleLead')}
        </p>
        <p className="mt-[8px] cf-body-md text-cf-ink-muted [text-wrap:pretty]">
          {copy('sampleBody')}
        </p>
      </div>

      <div className="border-t border-cf-border px-[16px] py-[16px] md:px-[20px]">
        <p className="cf-caption text-cf-ink-muted">{copy('processLabel')}</p>
        <ol className="mt-[12px] flex flex-wrap items-center gap-[8px]">
          {HERO_PATH.map((stage, index) => {
            const current = index === 0;
            return (
              <li
                key={stage}
                aria-current={current ? 'step' : undefined}
                className="flex min-w-0 items-center gap-[8px]"
              >
                <span
                  aria-hidden
                  className={clsx(
                    'h-[8px] w-[8px] shrink-0 rounded-full',
                    current
                      ? 'bg-cf-accent'
                      : 'border border-cf-border-control bg-cf-surface'
                  )}
                />
                <span
                  className={clsx(
                    current
                      ? 'cf-label-md text-cf-ink'
                      : 'cf-body-sm text-cf-ink-muted'
                  )}
                >
                  {copy(stage)}
                </span>
                {/* The connector trails its own step rather than leading the
                    next one. Leading it meant a wrapped row opened with a
                    dangling rule, which reads as a bullet; trailing it lets a
                    line end on the rule, which reads as "continues below". */}
                {index < HERO_PATH.length - 1 && (
                  <span
                    aria-hidden
                    className="hidden h-px w-[16px] bg-cf-border md:block"
                  />
                )}
              </li>
            );
          })}
        </ol>
      </div>

      <div className="flex flex-wrap items-center gap-[8px] border-t border-cf-border bg-cf-surface-subtle px-[16px] py-[12px] md:px-[20px]">
        <span className="cf-caption text-cf-ink-muted">
          {copy('heroChannelsLabel', { count: String(HERO_CHANNELS.length) })}
        </span>
        {HERO_CHANNELS.map((identifier) => (
          <ChannelChip key={identifier} identifier={identifier} />
        ))}
        <Link
          href="#platforms"
          className="rounded-[4px] cf-body-sm text-cf-ink-muted underline hover:text-cf-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cf-focus"
        >
          {copy('heroMoreIntegrations')}
        </Link>
      </div>
    </DemoPanel>
  );
};

/* ------------------------------------------------------------------ idea -- */

/**
 * Fictional sources, and deliberately so.
 *
 * Nothing here is a real publication: naming one would be a claim about a
 * relationship the product does not have, and the whole scene is marked as not
 * built yet. The titles stay in their own languages because the language is the
 * point of the scene.
 *
 * Six of them, and the scene shows four — the four that are *not* the visitor's
 * own language. A fixed list put an English source under a headline promising
 * ideas nobody had written in English yet, which is the one contradiction this
 * scene cannot afford. Picking by exclusion also means the search-language
 * chips can be derived from the rows below them instead of being a second list
 * that has to be kept in step by hand.
 */
const SOURCE_POOL = [
  {
    language: 'en',
    title: 'Short-form video benchmarks, 2026',
    origin: 'industry-report.org · 2026-03-12',
    kindKey: 'ideaKindReport',
  },
  {
    language: 'de',
    title: 'B2B-Content im Wandel: Formate und Kanäle',
    origin: 'fachmagazin.de · 2026-02-04',
    kindKey: 'ideaKindArticle',
  },
  {
    language: 'es',
    title: 'Vídeo corto y atención: datos de plataformas',
    origin: 'datos-medios.es · 2026-01-27',
    kindKey: 'ideaKindData',
  },
  {
    language: 'fr',
    title: 'Éditorial après le virage vidéo',
    origin: 'notes-pratiques.fr · 2026-01-19',
    kindKey: 'ideaKindPractice',
  },
  {
    language: 'pt',
    title: 'Formatos curtos e o plano editorial',
    origin: 'revista-conteudo.pt · 2026-02-18',
    kindKey: 'ideaKindArticle',
  },
  {
    language: 'ja',
    title: 'ショート動画と可処分注意の実測',
    origin: 'media-lab.jp · 2026-03-02',
    kindKey: 'ideaKindData',
  },
] as const;

const SHOWN_SOURCES = 4;

const SearchIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    aria-hidden
    className="shrink-0 text-cf-ink-muted"
  >
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4 4" />
  </svg>
);

export const IdeaShot: FC = () => {
  const copy = usePublicCopy();
  const { language } = useVariables();
  // The visitor's own language, the way that language writes it: `Русский`,
  // `Deutsch`, `日本語`. The same helper the language picker uses, so the chip
  // and the picker can never disagree about what a language is called.
  const own = (language || 'en').split(/[-_]/)[0];
  const sources = SOURCE_POOL.filter((source) => source.language !== own).slice(
    0,
    SHOWN_SOURCES
  );

  return (
    <DemoPanel label={copy('ideaSourcesLabel')}>
      <div className="border-b border-cf-border p-[16px] md:p-[20px]">
        <div className="flex cf-control-h min-w-0 items-center gap-[8px] rounded-[8px] border border-cf-border-control bg-cf-surface-subtle px-[12px]">
          <SearchIcon />
          <span className="min-w-0 truncate cf-body-md text-cf-ink">
            {copy('ideaQuery')}
          </span>
        </div>
        <div className="mt-[12px] flex flex-wrap items-center gap-[8px]">
          <span className="cf-caption text-cf-ink-muted">
            {copy('ideaSearchLanguages')}
          </span>
          {sources.map((source) => (
            <Chip key={source.language}>{getLanguageLabel(source.language)}</Chip>
          ))}
        </div>
        <div className="mt-[12px] flex flex-wrap items-center gap-[8px]">
          <span className="cf-caption text-cf-ink-muted">
            {copy('ideaOutputLabel')}
          </span>
          <StatusPill tone="accent" icon="check">
            {getLanguageLabel(own)}
          </StatusPill>
        </div>
      </div>

      <ul>
        {sources.map((source) => (
          <li
            key={source.origin}
            className="flex min-w-0 items-start gap-[12px] border-b border-cf-border px-[16px] py-[12px] md:px-[20px]"
          >
            <span className="shrink-0 rounded-[4px] border border-cf-border-strong px-[4px] py-[4px] cf-label-sm uppercase text-cf-ink-muted">
              {source.language}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block cf-label-md text-cf-ink [overflow-wrap:anywhere]">
                {source.title}
              </span>
              <span className="mt-[4px] block cf-caption text-cf-ink-muted [overflow-wrap:anywhere]">
                {source.origin}
              </span>
            </span>
            <span className="hidden shrink-0 cf-body-sm text-cf-ink-muted sm:block">
              {copy(source.kindKey)}
            </span>
          </li>
        ))}
      </ul>

      <div className="bg-cf-surface-subtle px-[16px] py-[16px] md:px-[20px]">
        <p className="cf-caption text-cf-ink-muted">{copy('ideaThesisLabel')}</p>
        <p className="mt-[8px] cf-body-md text-cf-ink [text-wrap:pretty]">
          {copy('ideaThesis')}
        </p>
      </div>
    </DemoPanel>
  );
};

/* ----------------------------------------------------------------- draft -- */

const DRAFT_TABS = [
  'draftTabText',
  'draftTabMedia',
  'draftTabLinks',
  'draftTabTags',
] as const;

export const DraftShot: FC = () => {
  const copy = usePublicCopy();
  return (
    <DemoPanel
      label={copy('draftDemoLabel')}
      className="grid md:grid-cols-[168px_minmax(0,1fr)]"
    >
      <div className="min-w-0 border-b border-cf-border bg-cf-surface-subtle p-[16px] md:border-b-0 md:border-e">
        <p className="cf-label-sm text-cf-ink-muted">{RECORD}</p>
        <ul className="mt-[12px] flex flex-wrap gap-[8px] md:block md:gap-0">
          {DRAFT_TABS.map((tab, index) => (
            <li
              key={tab}
              className={clsx(
                'flex min-h-[32px] items-center px-[8px] md:px-[12px]',
                index === 0
                  ? 'border-s-2 border-cf-accent bg-cf-surface cf-label-md text-cf-ink'
                  : 'cf-body-sm text-cf-ink-muted'
              )}
            >
              {copy(tab)}
            </li>
          ))}
        </ul>
        <p className="mt-[16px] cf-body-sm text-cf-ink-muted">
          {copy('draftAutosave')}
        </p>
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-[8px] border-b border-cf-border px-[16px] py-[12px] md:px-[20px]">
          <span aria-hidden className="flex items-center gap-[12px] text-cf-ink-muted">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M5 6h14M5 12h9M5 18h12" />
            </svg>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M7 5h7a4 4 0 0 1 0 8H7zM7 13h8a4 4 0 0 1 0 8H7z" />
            </svg>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M14 5h-4M10 19h4M13 5 11 19" />
            </svg>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 8 6 12l4 4M14 8l4 4-4 4" />
            </svg>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="5" width="16" height="14" rx="2" />
              <path d="m4 15 4-4 4 4 3-3 5 5" />
            </svg>
          </span>
          <span className="ms-auto cf-caption text-cf-ink-muted">
            {copy('draftMeta')}
          </span>
        </div>

        <div className="px-[16px] py-[20px] md:px-[20px]">
          <p className="cf-heading-md text-cf-ink [text-wrap:balance]">
            {copy('sampleTitle')}
          </p>
          <p className="mt-[12px] cf-body-md text-cf-ink [text-wrap:pretty]">
            {copy('sampleLead')}
          </p>
          <p className="mt-[16px] cf-label-md text-cf-ink">
            {copy('draftSectionTitle')}
          </p>
          <p className="mt-[8px] cf-body-md text-cf-ink-muted [text-wrap:pretty]">
            {copy('draftSectionBody')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-[8px] border-t border-cf-border px-[16px] py-[12px] md:px-[20px]">
          {/* The hero already showed the saved pill. Repeating it here would
              spend the accent twice on the same fact; a timestamp says more. */}
          <span className="cf-caption text-cf-ink-muted">
            {copy('draftSavedAt')}
          </span>
          <span className="ms-auto">
            <DemoControl>{copy('draftHandoff')}</DemoControl>
          </span>
        </div>
      </div>
    </DemoPanel>
  );
};

/* ----------------------------------------------------------------- adapt -- */

/**
 * The same five destinations, and what each of them actually takes.
 *
 * The limits are the platforms' own — a Facebook post really does hold 63 206
 * characters and an Instagram caption really does stop at 2 200 — which is the
 * point of the scene: the asymmetry the paragraph beside it describes is on
 * screen rather than asserted. Two platforms sharing a limit is not a mistake;
 * Instagram and TikTok genuinely stop at the same place.
 */
const CHANNEL_VERSIONS = [
  {
    identifier: 'facebook',
    account: '/company',
    used: '1180',
    limit: '63206',
    copyKey: 'adaptTextFacebook',
  },
  {
    identifier: 'youtube',
    account: '/@company',
    used: '940',
    limit: '5000',
    copyKey: 'adaptTextYoutube',
  },
  {
    identifier: 'instagram',
    account: '@company',
    used: '640',
    limit: '2200',
    copyKey: 'adaptTextInstagram',
  },
  {
    identifier: 'tiktok',
    account: '@company',
    used: '248',
    limit: '2200',
    copyKey: 'adaptTextTiktok',
  },
  {
    identifier: 'telegram',
    account: '@company_news',
    used: '812',
    limit: '4096',
    copyKey: 'adaptTextTelegram',
  },
] as const;

/**
 * The only thing on the page that changes, and only when a person asks it to.
 *
 * No carousel, no timer: a version a visitor did not choose to see is a version
 * they have to wait for, and the scene's point — one text, several shapes — is
 * made by them doing the switching.
 */
export const AdaptShot: FC = () => {
  const copy = usePublicCopy();
  const [active, setActive] = useState(CHANNEL_VERSIONS[0].identifier as string);
  const version =
    CHANNEL_VERSIONS.find((entry) => entry.identifier === active) ??
    CHANNEL_VERSIONS[0];

  return (
    <DemoPanel label={copy('adaptTabsLabel')}>
      <DemoRow className="border-b border-cf-border bg-cf-surface-subtle">
        <RecordId>{RECORD}</RecordId>
        <span className="min-w-0 truncate cf-body-sm text-cf-ink-muted">
          {copy('sampleTitle')}
        </span>
      </DemoRow>

      <Tabs value={active} onChange={setActive}>
        <TabList
          aria-label={copy('adaptTabsLabel')}
          className="flex gap-[8px] overflow-x-auto border-b border-cf-border px-[16px] py-[12px] md:px-[20px]"
        >
          {CHANNEL_VERSIONS.map((entry) => {
            const selected = entry.identifier === active;
            return (
              <Tab
                key={entry.identifier}
                value={entry.identifier}
                density="dense"
                mobileTouchTarget
                className={clsx(
                  'inline-flex shrink-0 items-center gap-[8px] rounded-[8px] border px-[12px] cf-label-md transition-colors duration-state motion-reduce:transition-none',
                  selected
                    ? 'border-cf-accent bg-cf-accent-soft text-cf-ink'
                    : 'border-cf-border-control bg-cf-surface text-cf-ink-muted hover:bg-cf-surface-subtle'
                )}
              >
                <PlatformMark identifier={entry.identifier} />
                {PLATFORM_NAMES[entry.identifier]}
              </Tab>
            );
          })}
        </TabList>

        <TabPanel
          value={active}
          focusable
          className="min-w-0 px-[16px] py-[16px] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-cf-focus md:px-[20px]"
        >
          <div className="flex flex-wrap items-center gap-[8px]">
            <PlatformMark identifier={version.identifier} />
            <span className="cf-label-md text-cf-ink">{version.account}</span>
            <span className="ms-auto cf-caption tabular-nums text-cf-ink-muted">
              {version.used} / {version.limit}
            </span>
          </div>
          <p className="mt-[12px] rounded-[8px] border border-cf-border bg-cf-surface-subtle p-[12px] cf-body-md text-cf-ink [text-wrap:pretty]">
            {copy(version.copyKey)}
          </p>
          <p className="mt-[12px] cf-caption text-cf-ink-muted">
            {copy('adaptCharLimit', { limit: version.limit })}
          </p>
        </TabPanel>
      </Tabs>

      <div className="flex flex-wrap items-center gap-[8px] border-t border-cf-border bg-cf-surface-subtle px-[16px] py-[12px] md:px-[20px]">
        <span className="min-w-0 cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
          {copy('adaptSyncNote')}
        </span>
        <span className="ms-auto">
          <DemoControl tone="primary">{copy('adaptReady')}</DemoControl>
        </span>
      </div>
    </DemoPanel>
  );
};

/* --------------------------------------------------------------- approve -- */

const COMMENTS = [
  { authorKey: 'commentOneAuthor', bodyKey: 'commentOneBody', at: '22:44' },
  { authorKey: 'commentTwoAuthor', bodyKey: 'commentTwoBody', at: '22:47' },
] as const;

/**
 * Initials taken from the translated name, not typed beside it.
 *
 * The two reviewers are named in every locale, so hard-coding `АК` next to
 * them would have put Cyrillic initials on a Korean page. One letter per word
 * is wrong for no writing system this product ships.
 */
const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => [...word][0])
    .join('');

const CALENDAR_DAYS = [
  11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24,
];

export const ApproveShot: FC = () => {
  const copy = usePublicCopy();
  return (
    <DemoPanel
      label={copy('approveDemoLabel')}
      className="grid md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]"
    >
      <div className="min-w-0 border-b border-cf-border md:border-b-0 md:border-e">
        <DemoRow className="border-b border-cf-border">
          <RecordId>{RECORD}</RecordId>
          <StatusPill tone="info" icon="clock">
            {copy('statusInReview')}
          </StatusPill>
          <span className="ms-auto cf-caption text-cf-ink-muted">
            {copy('approveUpdated')}
          </span>
        </DemoRow>

        <div className="px-[16px] py-[16px] md:px-[20px]">
          <p className="cf-heading-md text-cf-ink [text-wrap:balance]">
            {copy('sampleTitle')}
          </p>
          <ul className="mt-[16px] flex flex-col gap-[12px]">
            {COMMENTS.map((comment) => (
              <li key={comment.at} className="flex min-w-0 gap-[12px]">
                <span
                  aria-hidden
                  className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-full border border-cf-border-strong cf-caption text-cf-ink-muted"
                >
                  {initialsOf(copy(comment.authorKey))}
                </span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-baseline gap-[8px]">
                    <span className="cf-label-md text-cf-ink">
                      {copy(comment.authorKey)}
                    </span>
                    <span className="cf-caption text-cf-ink-muted">
                      {comment.at}
                    </span>
                  </span>
                  <span className="mt-[4px] block cf-body-md text-cf-ink-muted [text-wrap:pretty]">
                    {copy(comment.bodyKey)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-wrap items-center gap-[8px] border-t border-cf-border px-[16px] py-[12px] md:px-[20px]">
          <DemoControl tone="primary">{copy('approveApprove')}</DemoControl>
          <DemoControl>{copy('approveReturn')}</DemoControl>
        </div>
      </div>

      <div
        className="min-w-0 bg-cf-surface-subtle"
        role="group"
        aria-label={copy('calendarLabel')}
      >
        <DemoRow className="border-b border-cf-border">
          <span className="cf-label-md text-cf-ink">
            {copy('calendarMonth')}
          </span>
        </DemoRow>
        <div className="px-[16px] py-[16px] md:px-[20px]">
          <div aria-hidden>
            <div className="grid grid-cols-7 gap-[4px] text-center">
              {copy('calendarWeekdays')
                .split(/\s+/)
                .filter(Boolean)
                .map((day, index) => (
                  <span
                    key={`${day}-${index}`}
                    className="cf-caption text-cf-ink-muted"
                  >
                    {day}
                  </span>
                ))}
            </div>
            <div className="mt-[8px] grid grid-cols-7 gap-[4px] text-center">
              {CALENDAR_DAYS.map((day) => (
                <span
                  key={day}
                  className={clsx(
                    'rounded-[4px] py-[4px] cf-caption tabular-nums',
                    day === 19
                      ? 'bg-cf-accent text-cf-accent-ink'
                      : 'text-cf-ink-muted'
                  )}
                >
                  {day}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-[16px] rounded-[8px] border border-cf-border bg-cf-surface p-[12px]">
            <p className="cf-caption text-cf-ink-muted">
              {copy('calendarSlot')}
            </p>
            <p className="mt-[4px] cf-label-md text-cf-ink [text-wrap:balance]">
              {copy('sampleTitle')}
            </p>
            <div className="mt-[12px] flex flex-wrap items-center gap-[8px]">
              {HERO_CHANNELS.map((identifier) => (
                <PlatformMark key={identifier} identifier={identifier} />
              ))}
              <span className="ms-auto">
                <StatusPill icon="check">{copy('statusScheduled')}</StatusPill>
              </span>
            </div>
          </div>
        </div>
      </div>
    </DemoPanel>
  );
};

/* ------------------------------------------------------------- analytics -- */

const METRICS = [
  { key: 'metricViews', value: '12 480' },
  { key: 'metricReach', value: '8 120' },
  { key: 'metricReactions', value: '642' },
  { key: 'metricClicks', value: '940' },
] as const;

/**
 * Three of the five, not all five: the paragraph beside this panel says the
 * depth of the figures depends on the platform, and a row that answered for
 * every channel would contradict it.
 */
const CHANNEL_TOTALS = [
  { identifier: 'facebook', value: '7 640' },
  { identifier: 'youtube', value: '3 210' },
  { identifier: 'telegram', value: '1 630' },
] as const;

export const AnalyticsShot: FC = () => {
  const copy = usePublicCopy();
  return (
    <DemoPanel label={copy('analyticsSubject')}>
      <DemoRow className="border-b border-cf-border bg-cf-surface-subtle">
        <RecordId>{RECORD}</RecordId>
        <span className="cf-body-sm text-cf-ink">
          {copy('analyticsSubject')}
        </span>
        {/* Said in words, inside the panel the numbers are in. A figure a
            visitor could mistake for a result is worse than no figure. */}
        <span className="ms-auto">
          <StatusPill>{copy('demoData')}</StatusPill>
        </span>
      </DemoRow>

      <dl className="grid grid-cols-2 md:grid-cols-4">
        {METRICS.map((metric, index) => (
          <div
            key={metric.key}
            className={clsx(
              'min-w-0 border-cf-border px-[16px] py-[16px] md:px-[20px]',
              index < 2 && 'border-b md:border-b-0',
              index % 2 === 0 && 'border-e',
              index === 1 && 'md:border-e'
            )}
          >
            <dt className="cf-body-sm text-cf-ink-muted">{copy(metric.key)}</dt>
            <dd className="mt-[8px] cf-heading-lg tabular-nums text-cf-ink">
              {metric.value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="border-t border-cf-border px-[16px] py-[16px] md:px-[20px]">
        <svg
          viewBox="0 0 640 140"
          width="100%"
          height="140"
          preserveAspectRatio="none"
          role="img"
          aria-label={copy('analyticsChartLabel')}
        >
          <line x1="0" y1="139" x2="640" y2="139" className="stroke-cf-border" strokeWidth="1" />
          <line x1="0" y1="70" x2="640" y2="70" className="stroke-cf-border" strokeWidth="1" strokeDasharray="3 5" />
          <polyline
            points="0,116 71,104 142,110 213,86 284,92 355,64 426,52 497,58 568,34 640,26"
            fill="none"
            className="stroke-cf-accent"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>
        <p className="mt-[8px] cf-caption text-cf-ink-muted">
          {copy('analyticsRange')}
        </p>
      </div>

      <ul className="flex flex-wrap items-center gap-x-[16px] gap-y-[8px] border-t border-cf-border bg-cf-surface-subtle px-[16px] py-[12px] md:px-[20px]">
        {CHANNEL_TOTALS.map((total) => (
          <li
            key={total.identifier}
            className="flex items-center gap-[8px] cf-body-sm text-cf-ink-muted"
          >
            <PlatformMark identifier={total.identifier} />
            {PLATFORM_NAMES[total.identifier]}
            <span className="tabular-nums">{total.value}</span>
          </li>
        ))}
      </ul>
    </DemoPanel>
  );
};
