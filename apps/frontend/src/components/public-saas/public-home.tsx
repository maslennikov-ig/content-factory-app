'use client';

import Link from 'next/link';
import { clsx } from 'clsx';
import { ReactNode, useEffect, useRef } from 'react';
import { PlatformBadge } from '@contentfactory/react/platform/platform.badge';
import {
  KNOWN_PLATFORMS,
  PLATFORM_NAMES,
  PLATFORM_TWINS,
} from '@contentfactory/react/platform/platform.families';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { usePublicCopy } from './public-copy';
import { usePublicTelemetry } from './public-telemetry';
import {
  PrimaryCta,
  Scene,
  SceneHeading,
  SecondaryCta,
  SoonBadge,
  SoonNote,
} from './home-parts';
import {
  AdaptShot,
  AnalyticsShot,
  ApproveShot,
  DraftShot,
  HeroShot,
  IdeaShot,
} from './home-shots';

/**
 * The public front door.
 *
 * One process, told once, in the order a person works: idea → material →
 * channel versions → review and schedule → publish → result. Each scene owns
 * one stage, one product shot and one point, and the tone under it changes so
 * that scrolling feels like moving between rooms rather than down a list of
 * cards.
 *
 * Two of the six stages are not built yet. They are shown, because a visitor
 * deciding whether this is the product for them deserves to see where it is
 * going — and they are marked in words, on the strip, on the scene and inside
 * it, because a product that blurs that line is asking to be believed twice.
 *
 * Registration is the page's one primary action. The demo is offered beside it
 * every time, quietly, for the visitor who is not ready to be asked for an
 * email address.
 */

const REGISTER_ROUTE = '/auth';
const DEMO_ROUTE = '/demo';

const PROCESS = [
  { id: 'idea', stage: 'stageIdea', step: '01', soon: true },
  { id: 'draft', stage: 'stageDraft', step: '02', soon: false },
  { id: 'adapt', stage: 'stageAdapt', step: '03', soon: false },
  { id: 'approve', stage: 'stageApprove', step: '04', soon: false },
  { id: 'platforms', stage: 'stagePublish', step: '05', soon: false },
  { id: 'analytics', stage: 'stageAnalytics', step: '06', soon: false },
] as const;

const stepOf = (id: string) =>
  PROCESS.find((entry) => entry.id === id) ?? PROCESS[0];

/** The two columns of a scene, alternating which side the product is on. */
const SceneColumns = ({
  productFirst,
  heading,
  shot,
}: {
  productFirst?: boolean;
  heading: ReactNode;
  shot: ReactNode;
}) => (
  <div
    className={clsx(
      'grid min-w-0 gap-[32px] lg:items-center lg:gap-[64px]',
      // The product keeps the wider column whichever side it is on. Flipping
      // only the order left the shot in the narrower half on alternate scenes,
      // which reads as the product mattering less every second time.
      productFirst
        ? 'lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]'
        : 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]'
    )}
  >
    {/* The heading stays first in the document on both sides. Reading order is
        the argument; which half of the screen the product sits on is rhythm. */}
    <div className={clsx('min-w-0', productFirst && 'lg:order-2')}>
      {heading}
    </div>
    <div className={clsx('min-w-0', productFirst && 'lg:order-1')}>{shot}</div>
  </div>
);

export function PublicHome() {
  const copy = usePublicCopy();
  const t = useT();
  const track = usePublicTelemetry();
  const landingViewSent = useRef(false);
  useEffect(() => {
    if (landingViewSent.current) return;
    landingViewSent.current = true;
    void track('landing_view');
  }, [track]);

  return (
    <div className="min-w-0">
      {/* The first screen is the first screen: on a desktop the hero fills the
          height under the sticky bar, so the page opens as one composed view
          rather than as a band with the next section already crowding it. A
          minimum, not a height — content still grows past it, and below `lg`
          it is dropped entirely, because a phone's viewport height moves as
          its browser chrome slides. */}
      <section
        aria-labelledby="home-hero-title"
        className="bg-cf-canvas lg:flex lg:min-h-[calc(100svh-64px)] lg:items-center"
      >
        <div className="mx-auto w-full max-w-[1360px] px-[16px] py-[48px] md:px-[24px] md:py-[96px]">
          {/* The product panel takes the wider half. It carries five channels
              and a five-step path, and both have to sit on one line — a hero
              that wraps its own product screenshot argues against itself. */}
          <div className="grid min-w-0 gap-[40px] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.32fr)] lg:items-center lg:gap-[64px]">
            <div className="min-w-0">
              <h1
                id="home-hero-title"
                className="cf-display-xl text-cf-ink [text-wrap:balance] [overflow-wrap:anywhere]"
              >
                {copy('homeTitle')}
              </h1>
              <p className="mt-[24px] max-w-[34em] cf-body-lg text-cf-ink-muted [text-wrap:pretty]">
                {copy('homeBody')}
              </p>
              <div className="mt-[32px] flex flex-col items-stretch gap-[12px] sm:flex-row sm:flex-wrap sm:items-center">
                <PrimaryCta href={REGISTER_ROUTE}>{copy('signUp')}</PrimaryCta>
                <SecondaryCta href={DEMO_ROUTE}>{copy('tryDemo')}</SecondaryCta>
              </div>
            </div>
            <HeroShot />
          </div>
        </div>
      </section>

      {/* The index of the page, and the first place "Soon" is said. */}
      <nav
        aria-label={copy('processLabel')}
        className="border-y border-cf-border bg-cf-navigation"
      >
        {/* Edge to edge, with the rule between steps carrying the span. The
            strip is a process, and a process bunched into the left third of a
            1440px screen reads as a list of links instead. Below `md` the rules
            go and the steps wrap. */}
        <ol className="mx-auto flex w-full max-w-[1360px] flex-wrap items-center gap-x-[24px] gap-y-[8px] px-[16px] py-[16px] md:flex-nowrap md:gap-x-[16px] md:px-[24px]">
          {PROCESS.map((entry, index) => (
            <li
              key={entry.id}
              className={clsx(
                'flex items-center gap-[8px]',
                index < PROCESS.length - 1 && 'md:flex-1'
              )}
            >
              <span className="cf-caption tabular-nums text-cf-ink-muted">
                {entry.step}
              </span>
              <Link
                href={`#${entry.id}`}
                className="shrink-0 rounded-[4px] cf-body-md text-cf-ink hover:text-cf-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cf-focus"
              >
                {copy(entry.stage)}
              </Link>
              {entry.soon && (
                <span className="shrink-0 rounded-[4px] border border-cf-warning px-[4px] py-[4px] cf-caption text-cf-warning">
                  {copy('soon')}
                </span>
              )}
              {index < PROCESS.length - 1 && (
                <span
                  aria-hidden
                  className="hidden h-px min-w-[16px] flex-1 bg-cf-border md:block"
                />
              )}
            </li>
          ))}
        </ol>
      </nav>

      <Scene id="idea" tone="surface" labelledBy="home-idea-title">
        <SceneColumns
          heading={
            <SceneHeading
              id="home-idea-title"
              step={stepOf('idea').step}
              stage={copy('stageIdea')}
              title={copy('ideaTitle')}
              body={copy('ideaBody')}
              badge={<SoonBadge label={copy('soon')} />}
            />
          }
          shot={<IdeaShot />}
        />
      </Scene>

      <Scene id="draft" tone="canvas" labelledBy="home-draft-title">
        <SceneColumns
          productFirst
          heading={
            <SceneHeading
              id="home-draft-title"
              step={stepOf('draft').step}
              stage={copy('stageDraft')}
              title={copy('draftTitle')}
              body={copy('draftBody')}
            >
              <SoonNote
                label={copy('soon')}
                title={copy('brandVoiceTitle')}
                body={copy('brandVoiceBody')}
              />
            </SceneHeading>
          }
          shot={<DraftShot />}
        />
      </Scene>

      <Scene id="adapt" tone="surface" labelledBy="home-adapt-title">
        <SceneColumns
          heading={
            <SceneHeading
              id="home-adapt-title"
              step={stepOf('adapt').step}
              stage={copy('stageAdapt')}
              title={copy('adaptTitle')}
              body={copy('adaptBody')}
            >
              <p className="mt-[16px] max-w-[34em] cf-body-md text-cf-ink-muted [text-wrap:pretty]">
                {copy('adaptNote')}
              </p>
            </SceneHeading>
          }
          shot={<AdaptShot />}
        />
      </Scene>

      {/* The wide scene: the one stage that is genuinely two panels, so it gets
          the full measure instead of being squeezed into half of one. */}
      <Scene id="approve" tone="canvas" labelledBy="home-approve-title">
        <div className="max-w-[640px]">
          <SceneHeading
            id="home-approve-title"
            step={stepOf('approve').step}
            stage={copy('stageApprove')}
            title={copy('approveTitle')}
            body={copy('approveBody')}
          />
        </div>
        <div className="mt-[32px] md:mt-[48px]">
          <ApproveShot />
        </div>
      </Scene>

      <Scene id="platforms" tone="subtle" labelledBy="home-platforms-title">
        <div className="grid min-w-0 gap-[16px] lg:grid-cols-2 lg:items-end lg:gap-[64px]">
          <SceneHeading
            id="home-platforms-title"
            step={stepOf('platforms').step}
            stage={copy('stagePublish')}
            title={copy('platformsTitle')}
            body={copy('platformsBody')}
          />
        </div>
        {/* The registry itself, not a chosen fifteen: the count in the heading
            is one a visitor can finish reading and check. */}
        <ul className="mt-[32px] flex flex-wrap gap-[8px]">
          {KNOWN_PLATFORMS.map((identifier) => {
            const twin = PLATFORM_TWINS[identifier];
            return (
              <li
                key={identifier}
                className="inline-flex min-h-[40px] items-center gap-[8px] rounded-[8px] border border-cf-border bg-cf-surface px-[12px]"
              >
                <PlatformBadge identifier={identifier} size={16} />
                <span className="cf-body-sm text-cf-ink">
                  {PLATFORM_NAMES[identifier]}
                </span>
                {twin && (
                  <span className="cf-caption text-cf-ink-muted">
                    {t(twin.key, twin.default)}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        <p className="mt-[24px] max-w-[70ch] cf-body-md text-cf-ink-muted [text-wrap:pretty]">
          {copy('platformsNote')}
        </p>
      </Scene>

      <Scene id="analytics" tone="canvas" labelledBy="home-analytics-title">
        <SceneColumns
          productFirst
          heading={
            <SceneHeading
              id="home-analytics-title"
              step={stepOf('analytics').step}
              stage={copy('stageAnalytics')}
              title={copy('analyticsTitle')}
              body={copy('analyticsBody')}
            >
              <p className="mt-[16px] max-w-[34em] border-s-2 border-cf-border-strong ps-[16px] cf-body-md text-cf-ink-muted [text-wrap:pretty]">
                {copy('analyticsDepthNote')}
              </p>
              <SoonNote
                label={copy('soon')}
                title={copy('analyticsLoopTitle')}
                body={copy('analyticsLoopBody')}
              />
            </SceneHeading>
          }
          shot={<AnalyticsShot />}
        />
      </Scene>

      <Scene id="signup" tone="navigation" labelledBy="home-cta-title">
        <div className="flex min-w-0 flex-wrap items-end justify-between gap-[32px]">
          <div className="min-w-0 max-w-[640px]">
            <h2
              id="home-cta-title"
              className="cf-heading-xl text-cf-ink [text-wrap:balance] [overflow-wrap:anywhere]"
            >
              {copy('ctaTitle')}
            </h2>
            <p className="mt-[16px] max-w-[34em] cf-body-lg text-cf-ink-muted [text-wrap:pretty]">
              {copy('ctaBody')}
            </p>
          </div>
          <div className="flex flex-col items-stretch gap-[12px] sm:flex-row sm:flex-wrap sm:items-center">
            <PrimaryCta href={REGISTER_ROUTE}>{copy('signUp')}</PrimaryCta>
            <SecondaryCta href={DEMO_ROUTE}>{copy('tryDemo')}</SecondaryCta>
          </div>
        </div>
      </Scene>
    </div>
  );
}
