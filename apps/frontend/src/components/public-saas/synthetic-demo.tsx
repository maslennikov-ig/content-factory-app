'use client';

import { useRef, useState } from 'react';
import { clsx } from 'clsx';
import { Button } from '@contentfactory/react/form/button';
import { Textarea } from '@contentfactory/react/form/textarea';
import { Tab, TabList, TabPanel, Tabs } from '@contentfactory/react/choice/tabs';
import { ControlButton } from '@contentfactory/react/choice/control.button';
import { PLATFORM_NAMES } from '@contentfactory/react/platform/platform.families';
import { usePublicCopy } from './public-copy';
import { usePublicTelemetry } from './public-telemetry';
import {
  DemoPanel,
  DemoRow,
  PlatformMark,
  RecordId,
  StatusPill,
} from './home-parts';

/**
 * The public demo: the visitor's own words, carried through the process.
 *
 * The previous version was four paragraphs and a Next button. It described the
 * product rather than showing it, and a visitor could tell — there was nothing
 * to type, so there was nothing to find out. What a demo owes someone is the
 * one thing a landing page cannot say convincingly in prose: *what happens to
 * my text*. So the text is theirs from the first step, and every later step is
 * that same text under a different constraint.
 *
 * Everything is local state. Nothing is stored, nothing leaves the browser, and
 * no account exists — which is also why the channel limits are the only numbers
 * here that are real: they belong to the platforms, so they can be checked.
 */

export const SYNTHETIC_DEMO_VERSION = 'public-demo-v1';

/**
 * The stage ids are a wire contract, not product language: they are what the
 * growth event carries, and the backend accepts these four. The words a visitor
 * reads come from the copy keys of the same name, which say Material,
 * Adaptation, Review and Schedule — the vocabulary the landing page uses.
 */
export const DEMO_STAGES = ['plan', 'draft', 'review', 'schedule'] as const;

/**
 * What a visitor actually walks: the four stages plus the result.
 *
 * The result is a fifth screen and not a fifth stage id, because the id is the
 * part that leaves the browser and the four above are the only values the event
 * endpoint accepts. `demo_completed` still fires on reaching the schedule, so
 * the wire contract is untouched by a step existing after it.
 */
const DEMO_STEPS = [...DEMO_STAGES, 'result'] as const;

const RECORD = 'CF-1042';

/**
 * Six destinations, ordered by how much they allow.
 *
 * The five the landing page features, plus X — because 280 characters is where
 * the mechanic becomes visible. With a spread from 280 to 63 206 a visitor can
 * add two sentences and watch one channel go red while the others do not move,
 * which is the whole point of the step and is not a claim we have to make in
 * words. Every limit is the platform's own.
 */
const DEMO_CHANNELS = [
  { identifier: 'x', limit: 280, views: 830, reach: 610, reactions: 64, clicks: 74 },
  { identifier: 'instagram', limit: 2200, views: 1940, reach: 1420, reactions: 224, clicks: 96 },
  { identifier: 'tiktok', limit: 2200, views: 1260, reach: 980, reactions: 174, clicks: 58 },
  { identifier: 'telegram', limit: 4096, views: 7640, reach: 5120, reactions: 412, clicks: 486 },
  { identifier: 'youtube', limit: 5000, views: 2480, reach: 1780, reactions: 156, clicks: 132 },
  { identifier: 'facebook', limit: 63206, views: 3120, reach: 2240, reactions: 188, clicks: 214 },
] as const;

/**
 * Grouped digits without `toLocaleString`: the grouping character it picks
 * depends on the runtime's locale data, and a number that renders one way on
 * the way out and another way in the browser is a hydration mismatch.
 */
const grouped = (value: number) =>
  String(value).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');

/**
 * What is selected when the demo opens.
 *
 * Not all six. A picker that arrives with everything already on demonstrates
 * nothing about picking, and a visitor learns the step by adding a channel
 * rather than by taking one away. X is in the default set on purpose: it is the
 * one whose limit bites, so the visitor meets the constraint without having to
 * go looking for it.
 */
const DEFAULT_CHANNELS = ['x', 'instagram', 'telegram', 'facebook'];

/** The week the landing page's calendar shows, so the two agree. */
const DEMO_DAYS = [18, 19, 20, 21, 22];
const DEMO_TIMES = ['09:00', '13:00', '18:00'];

type DemoStatus = 'draft' | 'review' | 'approved';

export function SyntheticDemo() {
  const copy = usePublicCopy();
  const track = usePublicTelemetry();
  const [index, setIndex] = useState(0);
  // The sample is the same article the landing page follows, so a visitor who
  // arrives from it recognises the text before they start changing it.
  const [text, setText] = useState(
    () => `${copy('sampleLead')} ${copy('sampleBody')}`
  );
  const [channel, setChannel] = useState<string>(DEMO_CHANNELS[0].identifier);
  const [selected, setSelected] = useState<string[]>(DEFAULT_CHANNELS);
  const [status, setStatus] = useState<DemoStatus>('draft');
  const [day, setDay] = useState<number | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const started = useRef(false);
  const completed = useRef(false);
  const [reached, setReached] = useState(0);

  const stage = DEMO_STEPS[index];
  const length = text.trim().length;
  // Kept in the table's own order rather than in the order they were clicked,
  // so the strip does not reshuffle itself under the visitor's hand.
  const chosen = DEMO_CHANNELS.filter((entry) =>
    selected.includes(entry.identifier)
  );
  const active =
    chosen.find((entry) => entry.identifier === channel) ?? chosen[0];
  const scheduled = day !== null && time !== null;
  // Approval gates the calendar and the calendar gates the result, exactly as
  // they do in the product. A step that can be skipped teaches nothing about
  // the step.
  const canAdvance =
    stage === 'draft'
      ? chosen.length > 0
      : stage === 'review'
      ? status === 'approved'
      : stage === 'schedule'
      ? scheduled
      : stage !== 'result';

  /**
   * A channel reports figures only if the visitor's text fitted it. That is the
   * single place the earlier steps pay off: leave the text long and X is not in
   * the result, because nothing went there — which is the kind of thing a
   * screenshot of a dashboard can never say.
   */
  const delivered = chosen.filter((entry) => length <= entry.limit);
  const totals = delivered.reduce(
    (sum, entry) => ({
      views: sum.views + entry.views,
      reach: sum.reach + entry.reach,
      reactions: sum.reactions + entry.reactions,
      clicks: sum.clicks + entry.clicks,
    }),
    { views: 0, reach: 0, reactions: 0, clicks: 0 }
  );
  const best = delivered.reduce(
    (leader, entry) => (leader && leader.clicks >= entry.clicks ? leader : entry),
    delivered[0]
  );

  const goTo = (next: number) => {
    setIndex(next);
    setReached((furthest) => Math.max(furthest, next));
    if (next > 0 && !started.current) {
      started.current = true;
      void track('demo_started', 'plan');
    }
    if (DEMO_STEPS[next] === 'schedule' && !completed.current) {
      completed.current = true;
      void track('demo_completed', 'schedule');
    }
  };

  const restart = () => {
    setIndex(0);
    setReached(0);
    setStatus('draft');
    setDay(null);
    setTime(null);
    setChannel(DEMO_CHANNELS[0].identifier);
    setSelected(DEFAULT_CHANNELS);
  };

  const toggleChannel = (identifier: string) =>
    setSelected((current) =>
      current.includes(identifier)
        ? current.filter((entry) => entry !== identifier)
        : [...current, identifier]
    );

  const statusPill =
    stage === 'result' ? (
      <StatusPill tone="accent" icon="check">
        {copy('demoPublished')}
      </StatusPill>
    ) : status === 'approved' ? (
      <StatusPill tone="accent" icon="check">
        {copy('demoApproved')}
      </StatusPill>
    ) : status === 'review' ? (
      <StatusPill tone="info" icon="clock">
        {copy('statusInReview')}
      </StatusPill>
    ) : (
      <StatusPill tone="accent" icon="check">
        {copy('statusDraftSaved')}
      </StatusPill>
    );

  return (
    <DemoPanel label={copy('demoRegion')}>
      <DemoRow className="border-b border-cf-border bg-cf-surface-subtle">
        <RecordId>{RECORD}</RecordId>
        <span className="cf-caption tabular-nums text-cf-ink-muted">
          {index + 1} / {DEMO_STEPS.length}
        </span>
        <span className="ms-auto">{statusPill}</span>
      </DemoRow>

      {/* The steps are a process, not a tab set: each one is reachable only
          once it has been reached, and going back is allowed because a visitor
          who changes their text will want to see the versions again. */}
      <ol className="flex flex-wrap items-center gap-x-[16px] gap-y-[8px] border-b border-cf-border px-[16px] py-[12px] md:px-[20px]">
        {DEMO_STEPS.map((step, stepIndex) => {
          const current = stepIndex === index;
          return (
            <li key={step} className="flex items-center gap-[8px]">
              <span className="cf-caption tabular-nums text-cf-ink-muted">
                {String(stepIndex + 1).padStart(2, '0')}
              </span>
              <ControlButton
                density="dense"
                aria-current={current ? 'step' : undefined}
                disabled={stepIndex > reached}
                onClick={() => goTo(stepIndex)}
                className={clsx(
                  'rounded-[8px] px-[8px] transition-colors duration-state motion-reduce:transition-none',
                  current
                    ? 'cf-label-md text-cf-ink'
                    : 'cf-body-sm text-cf-ink-muted hover:bg-cf-surface-subtle hover:text-cf-ink'
                )}
              >
                {copy(step)}
              </ControlButton>
            </li>
          );
        })}
      </ol>

      <div
        aria-live="polite"
        className="min-w-0 px-[16px] py-[16px] md:px-[20px] md:py-[20px]"
      >
        <h2 className="cf-heading-md text-cf-ink">{copy(stage)}</h2>
        <p className="mt-[8px] max-w-[70ch] cf-body-md text-cf-ink-muted [text-wrap:pretty]">
          {copy(`${stage}Detail` as 'planDetail')}
        </p>

        {stage === 'plan' && (
          <div className="mt-[16px]">
            <Textarea
              standalone
              rows={6}
              value={text}
              aria-label={copy('plan')}
              onChange={(event) => setText(event.target.value)}
              className="w-full"
            />
          </div>
        )}

        {stage === 'draft' && (
          <div className="mt-[16px] min-w-0">
            {/* One material goes to several channels at once, so the choice is
                a multiple one — the same shape the product's own picker has:
                the accent border marks what is chosen, and it is a button with
                `aria-pressed`, so the choice is reachable from a keyboard,
                which the picker inside the product still is not. */}
            <div
              role="group"
              aria-label={copy('demoChannelsLabel')}
              className="flex flex-wrap items-center gap-[8px]"
            >
              <span className="cf-caption text-cf-ink-muted">
                {copy('heroChannelsLabel', { count: String(chosen.length) })}
              </span>
              {DEMO_CHANNELS.map((entry) => {
                const picked = selected.includes(entry.identifier);
                return (
                  <ControlButton
                    key={entry.identifier}
                    density="dense"
                    mobileTouchTarget
                    aria-pressed={picked}
                    onClick={() => toggleChannel(entry.identifier)}
                    className={clsx(
                      'inline-flex shrink-0 items-center gap-[8px] rounded-full border pe-[16px] ps-[8px] cf-body-sm transition-colors duration-state motion-reduce:transition-none',
                      picked
                        ? 'border-cf-accent bg-cf-accent-soft text-cf-ink'
                        : 'border-cf-border-control bg-cf-surface text-cf-ink-muted hover:bg-cf-surface-subtle'
                    )}
                  >
                    <PlatformMark identifier={entry.identifier} />
                    {PLATFORM_NAMES[entry.identifier]}
                  </ControlButton>
                );
              })}
            </div>

            {chosen.length === 0 ? (
              <p className="mt-[16px] rounded-[8px] border border-dashed border-cf-border-strong p-[12px] cf-body-sm text-cf-ink-muted">
                {copy('demoNoChannels')}
              </p>
            ) : (
              <div className="mt-[16px] min-w-0">
            <Tabs value={active.identifier} onChange={setChannel}>
              {/* Underlined rather than chipped, because the row above is
                  already chips. Two rows of the same six names in the same
                  shape ask a reader to work out which one is "chosen" and which
                  is "open"; a tab strip says "you are looking at this one" and
                  nothing else. */}
              <TabList
                aria-label={copy('adaptTabsLabel')}
                className="flex gap-[16px] overflow-x-auto border-b border-cf-border"
              >
                {chosen.map((entry) => {
                  const current = entry.identifier === active.identifier;
                  const over = length > entry.limit;
                  return (
                    <Tab
                      key={entry.identifier}
                      value={entry.identifier}
                      density="dense"
                      mobileTouchTarget
                      className={clsx(
                        '-mb-px inline-flex shrink-0 items-center gap-[8px] border-b-2 px-[4px] cf-label-md transition-colors duration-state motion-reduce:transition-none',
                        current
                          ? 'border-cf-accent text-cf-ink'
                          : over
                          ? 'border-transparent text-cf-danger hover:text-cf-ink'
                          : 'border-transparent text-cf-ink-muted hover:text-cf-ink'
                      )}
                    >
                      <PlatformMark identifier={entry.identifier} />
                      {PLATFORM_NAMES[entry.identifier]}
                    </Tab>
                  );
                })}
              </TabList>

              <TabPanel
                value={channel}
                focusable
                className="mt-[16px] min-w-0 rounded-[8px] border border-cf-border bg-cf-surface-subtle p-[12px] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-cf-focus md:p-[16px]"
              >
                <div className="flex flex-wrap items-center gap-[8px]">
                  <PlatformMark identifier={active.identifier} />
                  <span className="cf-label-md text-cf-ink">
                    {PLATFORM_NAMES[active.identifier]}
                  </span>
                  <span className="ms-auto flex items-center gap-[8px]">
                    <span
                      className={clsx(
                        'cf-caption tabular-nums',
                        length > active.limit
                          ? 'text-cf-danger'
                          : 'text-cf-ink-muted'
                      )}
                    >
                      {length} / {active.limit}
                    </span>
                    {length > active.limit ? (
                      <StatusPill tone="danger" icon="alert">
                        {copy('demoOverLimit')}
                      </StatusPill>
                    ) : (
                      <StatusPill tone="accent" icon="check">
                        {copy('demoWithinLimit')}
                      </StatusPill>
                    )}
                  </span>
                </div>
                <p className="mt-[12px] whitespace-pre-line cf-body-md text-cf-ink [overflow-wrap:anywhere]">
                  {text}
                </p>
              </TabPanel>
            </Tabs>
              </div>
            )}
          </div>
        )}

        {stage === 'review' && (
          <div className="mt-[16px] rounded-[8px] border border-cf-border bg-cf-surface-subtle p-[12px] md:p-[16px]">
            <p className="cf-body-md text-cf-ink [overflow-wrap:anywhere]">
              {text.trim().slice(0, 160)}
              {text.trim().length > 160 ? '…' : ''}
            </p>
            <div className="mt-[16px] flex flex-wrap items-center gap-[8px]">
              {status === 'draft' && (
                <Button
                  type="button"
                  variant="secondary"
                  layout="content"
                  onClick={() => setStatus('review')}
                >
                  {copy('draftHandoff')}
                </Button>
              )}
              {status === 'review' && (
                <>
                  <Button
                    type="button"
                    layout="content"
                    onClick={() => setStatus('approved')}
                  >
                    {copy('approveApprove')}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    layout="content"
                    onClick={() => setStatus('draft')}
                  >
                    {copy('approveReturn')}
                  </Button>
                </>
              )}
              {status === 'approved' && (
                <Button
                  type="button"
                  variant="secondary"
                  layout="content"
                  onClick={() => setStatus('draft')}
                >
                  {copy('approveReturn')}
                </Button>
              )}
            </div>
          </div>
        )}

        {stage === 'schedule' && (
          <div
            className="mt-[16px] rounded-[8px] border border-cf-border bg-cf-surface-subtle p-[12px] md:p-[16px]"
            role="group"
            aria-label={copy('calendarLabel')}
          >
            <p className="cf-label-md text-cf-ink">{copy('calendarMonth')}</p>
            <div className="mt-[12px] flex flex-wrap gap-[8px]">
              {DEMO_DAYS.map((entry) => (
                <ControlButton
                  key={entry}
                  density="dense"
                  mobileTouchTarget
                  aria-pressed={entry === day}
                  onClick={() => setDay(entry)}
                  className={clsx(
                    'rounded-[8px] border px-[12px] cf-caption tabular-nums transition-colors duration-state motion-reduce:transition-none',
                    entry === day
                      ? 'border-cf-accent bg-cf-accent text-cf-accent-ink'
                      : 'border-cf-border-control bg-cf-surface text-cf-ink hover:bg-cf-surface-subtle'
                  )}
                >
                  {entry}
                </ControlButton>
              ))}
            </div>
            <div className="mt-[12px] flex flex-wrap gap-[8px]">
              {DEMO_TIMES.map((entry) => (
                <ControlButton
                  key={entry}
                  density="dense"
                  mobileTouchTarget
                  aria-pressed={entry === time}
                  onClick={() => setTime(entry)}
                  className={clsx(
                    'rounded-[8px] border px-[12px] cf-caption tabular-nums transition-colors duration-state motion-reduce:transition-none',
                    entry === time
                      ? 'border-cf-accent bg-cf-accent text-cf-accent-ink'
                      : 'border-cf-border-control bg-cf-surface text-cf-ink hover:bg-cf-surface-subtle'
                  )}
                >
                  {entry}
                </ControlButton>
              ))}
            </div>

            {scheduled && (
              <div className="mt-[16px] flex flex-wrap items-center gap-[8px] rounded-[8px] border border-cf-border bg-cf-surface p-[12px]">
                <span className="cf-caption tabular-nums text-cf-ink-muted">
                  {copy('calendarMonth')} · {day} · {time}
                </span>
                <span className="ms-auto">
                  <StatusPill icon="check">{copy('statusScheduled')}</StatusPill>
                </span>
              </div>
            )}
          </div>
        )}

        {stage === 'result' && (
          <div className="mt-[16px] min-w-0 rounded-[8px] border border-cf-border bg-cf-surface-subtle">
            <div className="flex flex-wrap items-center gap-[8px] border-b border-cf-border px-[12px] py-[12px] md:px-[16px]">
              <span className="cf-body-sm text-cf-ink">
                {copy('analyticsSubject')}
              </span>
              <span className="cf-caption tabular-nums text-cf-ink-muted">
                {copy('calendarMonth')} · {day} · {time}
              </span>
              {/* Said in words, inside the panel the numbers are in. */}
              <span className="ms-auto">
                <StatusPill>{copy('demoData')}</StatusPill>
              </span>
            </div>

            <dl className="grid grid-cols-2 md:grid-cols-4">
              {(
                [
                  ['metricViews', totals.views],
                  ['metricReach', totals.reach],
                  ['metricReactions', totals.reactions],
                  ['metricClicks', totals.clicks],
                ] as const
              ).map(([key, value], position) => (
                <div
                  key={key}
                  className={clsx(
                    'min-w-0 border-cf-border px-[12px] py-[12px] md:px-[16px]',
                    position < 2 && 'border-b md:border-b-0',
                    position % 2 === 0 && 'border-e',
                    position === 1 && 'md:border-e'
                  )}
                >
                  <dt className="cf-body-sm text-cf-ink-muted">{copy(key)}</dt>
                  <dd className="mt-[8px] cf-heading-lg tabular-nums text-cf-ink">
                    {grouped(value)}
                  </dd>
                </div>
              ))}
            </dl>

            <ul className="border-t border-cf-border">
              {chosen.map((entry) => {
                const sent = length <= entry.limit;
                return (
                  <li
                    key={entry.identifier}
                    className="flex min-w-0 flex-wrap items-center gap-[8px] border-b border-cf-border px-[12px] py-[8px] last:border-b-0 md:px-[16px]"
                  >
                    <PlatformMark identifier={entry.identifier} />
                    <span className="cf-body-sm text-cf-ink">
                      {PLATFORM_NAMES[entry.identifier]}
                    </span>
                    {sent ? (
                      /* On a narrow screen the figures take their own line for
                         every channel rather than for whichever names happen to
                         be long, so the column of numbers stays a column. */
                      <span className="flex w-full items-center justify-between gap-[16px] sm:ms-auto sm:w-auto sm:justify-end">
                        <span className="cf-caption tabular-nums text-cf-ink-muted">
                          {copy('metricViews')} {grouped(entry.views)}
                        </span>
                        <span className="cf-caption tabular-nums text-cf-ink">
                          {copy('metricClicks')} {grouped(entry.clicks)}
                        </span>
                      </span>
                    ) : (
                      <span className="ms-auto">
                        <StatusPill tone="danger" icon="alert">
                          {copy('demoNotSent')}
                        </StatusPill>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>

            <div className="border-t border-cf-border px-[12px] py-[12px] md:px-[16px]">
              {best && (
                <p className="cf-label-md text-cf-ink [text-wrap:pretty]">
                  {copy('demoBestChannel', {
                    channel: PLATFORM_NAMES[best.identifier],
                  })}
                </p>
              )}
              <p className="mt-[8px] max-w-[70ch] cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
                {copy('analyticsDepthNote')}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-[12px] border-t border-cf-border px-[16px] py-[12px] md:px-[20px]">
        <p className="min-w-0 cf-caption text-cf-ink-muted [text-wrap:pretty]">
          {copy('demoNothingLeaves')}
        </p>
        <span className="ms-auto flex flex-wrap items-center gap-[8px]">
          {index > 0 && (
            <Button
              type="button"
              variant="secondary"
              layout="content"
              onClick={restart}
            >
              {copy('reset')}
            </Button>
          )}
          {index < DEMO_STEPS.length - 1 && (
            <Button
              type="button"
              layout="content"
              disabled={!canAdvance}
              onClick={() => goTo(index + 1)}
            >
              {copy('next')}
            </Button>
          )}
        </span>
      </div>
    </DemoPanel>
  );
}
