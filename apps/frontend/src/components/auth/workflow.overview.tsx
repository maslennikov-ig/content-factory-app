'use client';

import { FC, useState } from 'react';
import {
  Tab,
  TabList,
  TabPanel,
  Tabs,
} from '@contentfactory/react/choice/tabs';
import { PlatformBadge } from '@contentfactory/react/platform/platform.badge';

type Momentum = {
  availableLabel: string;
  availableBody: string;
  nextLabel: string;
  nextBody: string;
};

type Step = {
  title: string;
  tabTitle?: string;
  body: string;
  momentum?: Momentum;
};

const FEATURED_PLATFORMS = [
  { identifier: 'instagram', name: 'Instagram' },
  { identifier: 'linkedin', name: 'LinkedIn' },
  { identifier: 'youtube', name: 'YouTube' },
  { identifier: 'tiktok', name: 'TikTok' },
  { identifier: 'telegram', name: 'Telegram' },
  { identifier: 'wordpress', name: 'WordPress' },
] as const;

/**
 * The desktop half of the auth screen.
 *
 * It describes the working loop the product actually implements. No
 * testimonials, no customer counts, no invented metrics — the spec is explicit
 * that this space explains the work instead of selling it.
 */
const StageArtifact: FC<{ stage: number }> = ({ stage }) => {
  if (stage === 0) {
    return (
      <div aria-hidden className="mt-[24px] grid grid-cols-4 gap-[8px]">
        {Array.from({ length: 12 }, (_, index) => (
          <span
            key={index}
            className={
              index === 5 || index === 10
                ? 'h-[28px] rounded-[4px] border border-cf-accent bg-cf-accent-soft'
                : 'h-[28px] rounded-[4px] border border-cf-border bg-cf-surface-subtle'
            }
          />
        ))}
      </div>
    );
  }

  if (stage === 1) {
    return (
      <div aria-hidden className="mt-[24px] flex gap-[16px]">
        <div className="flex-1 space-y-[12px] py-[4px]">
          <span className="block h-[8px] w-3/4 rounded-full bg-cf-border-strong" />
          <span className="block h-[8px] w-full rounded-full bg-cf-border" />
          <span className="block h-[8px] w-5/6 rounded-full bg-cf-border" />
          <span className="block h-[8px] w-2/3 rounded-full bg-cf-border" />
        </div>
        <span className="block h-[76px] w-[88px] rounded-[8px] bg-cf-accent-soft border border-cf-accent" />
      </div>
    );
  }

  if (stage === 2) {
    return (
      <div aria-hidden className="mt-[24px] grid grid-cols-[1fr_104px] gap-[16px]">
        <div className="min-h-[88px] rounded-[8px] bg-cf-surface-subtle p-[12px] space-y-[12px]">
          <span className="block h-[8px] w-2/3 rounded-full bg-cf-border-strong" />
          <span className="block h-[8px] w-full rounded-full bg-cf-border" />
          <span className="block h-[8px] w-4/5 rounded-full bg-cf-border" />
        </div>
        <div className="space-y-[8px]">
          {Array.from({ length: 3 }, (_, index) => (
            <span
              key={index}
              className="block h-[24px] rounded-[4px] border border-cf-accent bg-cf-accent-soft"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div aria-hidden className="mt-[24px] grid grid-cols-5 gap-px bg-cf-border">
      {Array.from({ length: 15 }, (_, index) => (
        <span
          key={index}
          className={
            index === 7 || index === 13
              ? 'h-[28px] bg-cf-accent-soft'
              : 'h-[28px] bg-cf-surface-subtle'
          }
        />
      ))}
    </div>
  );
};

export const WorkflowOverview: FC<{
  heading: string;
  intro: string;
  platformProof: string;
  steps: Step[];
  initialStep?: number;
}> = ({ heading, intro, platformProof, steps, initialStep = 0 }) => {
  const initialIndex = Math.min(
    Math.max(initialStep, 0),
    Math.max(steps.length - 1, 0)
  );
  const [active, setActive] = useState(`step-${initialIndex}`);
  const activeIndex = Math.max(
    0,
    steps.findIndex((_, index) => `step-${index}` === active)
  );
  const activeStep = steps[activeIndex];

  return (
    <section className="w-full max-w-[680px]">
      <h2 className="cf-heading-lg text-cf-ink [text-wrap:balance]">
        {heading}
      </h2>
      <p className="cf-body-md mt-[12px] max-w-[65ch] text-cf-ink-muted [text-wrap:pretty]">
        {intro}
      </p>

      <div className="mt-[24px] flex flex-col gap-[12px] border-y border-cf-border py-[12px] sm:flex-row sm:items-center">
        <div className="flex shrink-0 items-center gap-[4px]">
          {FEATURED_PLATFORMS.map((platform) => (
            <PlatformBadge
              key={platform.identifier}
              identifier={platform.identifier}
              name={platform.name}
              decorative={false}
            />
          ))}
        </div>
        <p className="cf-body-sm text-cf-ink [text-wrap:pretty]">
          {platformProof}
        </p>
      </div>

      {activeStep && (
        <Tabs value={active} onChange={setActive}>
          <TabList
            aria-label={heading}
            className="mt-[16px] grid grid-cols-2 gap-[8px] sm:grid-cols-4"
          >
            {steps.map((step, index) => {
              const value = `step-${index}`;
              const selected = value === active;
              return (
                <Tab
                  key={value}
                  value={value}
                  // Height belongs to the primitive: `dense` is the 32px body
                  // and `mobileTouchTarget` grows the hit area to 44px below
                  // the desktop breakpoint while reserving the flow space it
                  // borrows, so wrapped rows never sit on the same point.
                  density="dense"
                  mobileTouchTarget
                  className={
                    selected
                      ? 'cf-label-md rounded-[8px] border border-cf-accent bg-cf-accent px-[12px] text-cf-accent-ink transition-colors duration-state motion-reduce:transition-none'
                      : 'cf-label-md rounded-[8px] border border-cf-border-control bg-cf-surface px-[12px] text-cf-ink hover:bg-cf-surface-raised active:bg-cf-surface-subtle transition-colors duration-state motion-reduce:transition-none'
                  }
                >
                  {step.tabTitle ?? step.title}
                </Tab>
              );
            })}
          </TabList>

          <div className="mt-[12px] overflow-hidden rounded-[12px] border border-cf-border bg-cf-surface">
            <TabPanel
              value={active}
              focusable
              data-stage={activeIndex}
              className="grid sm:grid-cols-[minmax(0,1fr)_184px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cf-focus"
            >
              <div className="min-w-0 bg-cf-surface-raised p-[20px] sm:p-[24px]">
                <div className="cf-caption text-cf-ink-muted tabular-nums">
                  {String(activeIndex + 1).padStart(2, '0')} /{' '}
                  {String(steps.length).padStart(2, '0')}
                </div>
                <h3 className="cf-heading-md mt-[12px] text-cf-ink [text-wrap:balance]">
                  {activeStep.title}
                </h3>
                <p className="cf-body-md mt-[8px] max-w-[65ch] text-cf-ink-muted [text-wrap:pretty]">
                  {activeStep.body}
                </p>
                {activeStep.momentum && (
                  <dl className="mt-[16px] divide-y divide-cf-border border-y border-cf-border">
                    <div className="grid gap-[4px] py-[8px] sm:grid-cols-[112px_minmax(0,1fr)] sm:gap-[12px]">
                      <dt className="cf-caption text-cf-accent">
                        {activeStep.momentum.availableLabel}
                      </dt>
                      <dd className="cf-body-sm text-cf-ink [text-wrap:pretty]">
                        {activeStep.momentum.availableBody}
                      </dd>
                    </div>
                    <div className="grid gap-[4px] py-[8px] sm:grid-cols-[112px_minmax(0,1fr)] sm:gap-[12px]">
                      <dt className="cf-caption text-cf-info">
                        {activeStep.momentum.nextLabel}
                      </dt>
                      <dd className="cf-body-sm text-cf-ink [text-wrap:pretty]">
                        {activeStep.momentum.nextBody}
                      </dd>
                    </div>
                  </dl>
                )}
                <StageArtifact stage={activeIndex} />
              </div>

              <ol className="border-t border-cf-border bg-cf-surface-subtle p-[16px] sm:border-s sm:border-t-0">
                {steps.map((step, index) => {
                  const selected = index === activeIndex;
                  return (
                    <li
                      key={`${step.title}-${index}`}
                      className="flex min-h-[36px] items-center gap-[12px] border-b border-cf-border py-[8px] last:border-b-0"
                    >
                      <span
                        aria-hidden
                        className={
                          selected
                            ? 'h-[8px] w-[8px] shrink-0 rounded-full bg-cf-accent'
                            : 'h-[8px] w-[8px] shrink-0 rounded-full border border-cf-border-strong bg-cf-surface'
                        }
                      />
                      <span
                        className={
                          selected
                            ? 'cf-body-sm text-cf-ink'
                            : 'cf-body-sm text-cf-ink-muted'
                        }
                      >
                        {step.tabTitle ?? step.title}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </TabPanel>
          </div>
        </Tabs>
      )}
    </section>
  );
};
