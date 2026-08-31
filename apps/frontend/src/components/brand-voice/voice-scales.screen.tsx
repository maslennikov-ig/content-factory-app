'use client';

import { useState } from 'react';
import clsx from 'clsx';
import { Button } from '@contentfactory/react/form/button';
import { CheckboxField } from '@contentfactory/react/form/checkbox.field';
import { Hint } from '@contentfactory/react/layout/hint';
import { VoiceCorridorControl } from './voice-corridor.control';
import {
  SCALE_ORDER,
  scaleLabels,
  toDisplay,
  voiceCopy,
  type StyleScaleKey,
  type VoiceLocale,
} from './voice-copy';

/**
 * Eight measurements, one axis, no radar chart.
 *
 * The shared 0–100 axis is the only thing that lets the eight be compared by
 * eye; give each its own and the set stops being readable as a set. The bar is
 * the author's own corridor and the mark is their average, which is why a
 * value outside it is a statement about this writer rather than about a norm.
 *
 * Two things are deliberately absent. There is no radar chart: eight axes in a
 * circle cannot be compared with one another, cannot be read aloud, and lend a
 * false sense of a personality's "shape". And there is no single voice-quality
 * score: it would collapse eight different observations into one rating with
 * nothing to do.
 *
 * A value outside the corridor is labelled in words as well as coloured. The
 * caption column is sized for English, which runs 10–15% longer than Russian:
 * a column measured on Russian is a column that breaks in the other language.
 *
 * The corridor is edited on the bar. It used to be edited in a form that
 * opened below the fold, out of sight of the button that opened it and out of
 * sight of the picture the two numbers described — so pressing «Править
 * коридоры» looked, from where the reader was, like pressing a dead button.
 * «Править границы» now turns the bars into controls in place, and each row
 * commits on its own: a corridor is a per-scale decision and a single Save for
 * eight of them would make three unintended changes to keep one.
 */

export type ScaleValue = Readonly<{
  kind: 'value';
  raw: number;
  display: number;
  low: number;
  high: number;
  observations: number;
  sampleCount: number;
  exampleText: string | null;
  exampleSampleCode: string | null;
  /** The corridor was edited by hand and survives recomputation. */
  manualCorridor?: boolean;
  /**
   * What the analysis measured under a corridor somebody moved by hand.
   *
   * Present only after a recount carried a hand-set corridor across. Without
   * it the row can say «вы поставили сами» and nothing more; with it, it can
   * say what the product would have chosen and hand it back in one press.
   */
  measuredLow?: number;
  measuredHigh?: number;
  /** Excluded from the generator's checks by the owner. */
  excluded?: boolean;
}>;

export type ScaleGap = Readonly<{
  kind: 'gap';
  reason:
    | 'TOO_FEW_OBSERVATIONS'
    | 'TOO_FEW_POSITIVE'
    | 'TOO_FEW_SAMPLES'
    /** About the product, not about this corpus: no word list for the language. */
    | 'NO_DICTIONARY'
    | 'FAILED';
  positives: number;
}>;

export type ScaleEntry = ScaleValue | ScaleGap;

export type CorridorEdit = Readonly<{
  key: StyleScaleKey;
  low: number;
  high: number;
  excluded: boolean;
}>;

export type VoiceScalesState =
  | 'default'
  | 'loading'
  | 'empty'
  | 'selected'
  | 'success'
  | 'error'
  | 'restricted'
  | 'disabled'
  | 'long-content';

/** Where the value sits relative to the corridor, in words. */
const placement = (scale: ScaleValue): 'inside' | 'above' | 'below' =>
  scale.raw > scale.high ? 'above' : scale.raw < scale.low ? 'below' : 'inside';

const formatRaw = (key: StyleScaleKey, raw: number, locale: VoiceLocale) => {
  const number = new Intl.NumberFormat(
    locale === 'ru' ? 'ru-RU' : 'en-US',
    { maximumFractionDigits: 1 }
  ).format(raw);
  return key === 'sentenceLength' || key === 'sentenceSpread'
    ? number
    : `${number}%`;
};

function ScaleRow({
  scaleKey,
  entry,
  locale,
  expanded,
  editing,
  draft,
  busy,
  onExpand,
  onRecount,
  onDraftChange,
  onSave,
  onReset,
}: {
  scaleKey: StyleScaleKey;
  entry: ScaleEntry;
  locale: VoiceLocale;
  expanded?: boolean;
  editing: boolean;
  draft?: CorridorEdit;
  busy: boolean;
  onExpand?: () => void;
  onRecount?: () => void;
  onDraftChange?: (next: CorridorEdit) => void;
  onSave?: () => void;
  onReset?: () => void;
}) {
  const t = voiceCopy[locale];
  const caption = scaleLabels[locale][scaleKey];
  const shown =
    entry.kind === 'value' && draft
      ? { ...entry, low: draft.low, high: draft.high, excluded: draft.excluded }
      : entry;
  const corridorStart =
    shown.kind === 'value' ? toDisplay(shown.low, scaleKey) : 0;
  const corridorEnd =
    shown.kind === 'value' ? toDisplay(shown.high, scaleKey) : 0;
  const dirty =
    entry.kind === 'value' &&
    draft !== undefined &&
    (draft.low !== entry.low ||
      draft.high !== entry.high ||
      draft.excluded !== (entry.excluded === true));

  return (
    <div
      data-voice-scale={scaleKey}
      data-voice-scale-kind={entry.kind}
      data-voice-scale-placement={
        shown.kind === 'value' ? placement(shown) : undefined
      }
      className="grid items-start gap-x-[16px] gap-y-[8px] border-b border-cf-border py-[12px] sm:grid-cols-[minmax(0,22ch)_minmax(0,1fr)_auto]"
    >
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-[8px] cf-body-sm text-cf-ink [text-wrap:pretty]">
          {caption.label}
          {/* Every scale explains itself where it is read. «Номинализация» is
              a word almost nobody arrives knowing, and the unit line under it
              says how it is counted, not what it means. */}
          <Hint label={t.hintFor(caption.label)}>{caption.unit}</Hint>
        </p>
        <p className="mt-[4px] cf-caption text-cf-ink-muted [text-wrap:pretty]">
          {caption.unit}
        </p>
      </div>

      {entry.kind === 'gap' ? (
        <div className="min-w-0 sm:col-span-2">
          <p
            // A scale falling over is a failure and is announced, even though
            // it is a calm one: the other seven keep working, which is what
            // the sentence after it says.
            role={entry.reason === 'FAILED' ? 'alert' : undefined}
            className="cf-body-sm text-cf-ink-muted [text-wrap:pretty]"
          >
            {entry.reason === 'FAILED'
              ? `${t.scalesFailed} ${t.scalesFailedRest}`
              : entry.reason === 'NO_DICTIONARY'
              ? t.scalesNoDictionary
              : entry.positives > 0
              ? t.scalesEmptyBody(entry.positives)
              : t.scalesEmptyNone}
          </p>
          {entry.reason === 'FAILED' ? (
            <Button
              type="button"
              variant="secondary"
              className="mt-[8px]"
              onClick={onRecount}
            >
              {t.scalesRecount}
            </Button>
          ) : null}
        </div>
      ) : (
        <>
          <div className="min-w-0">
            {editing && draft ? (
              <VoiceCorridorControl
                scaleKey={scaleKey}
                low={draft.low}
                high={draft.high}
                value={entry.raw}
                lowLabel={`${caption.label}: ${t.scalesLow}`}
                highLabel={`${caption.label}: ${t.scalesHigh}`}
                disabled={busy}
                onChange={(next) =>
                  onDraftChange?.({ ...draft, ...next })
                }
              />
            ) : (
              <div
                className="relative h-[12px] w-full rounded-[4px] bg-cf-surface-subtle"
                role="img"
                aria-label={`${caption.label}: ${formatRaw(
                  scaleKey,
                  entry.raw,
                  locale
                )}, ${t.scalesYourCorridor} ${entry.low}–${entry.high}`}
              >
                {/* The corridor is mapped through the same domain as the mark.
                    `low`/`high` are in the scale's own unit — 10–18 words, not
                    10–18 per cent — and drawing them raw would place the
                    corridor where the value can never fall. */}
                <span
                  className="absolute inset-y-0 rounded-[4px] bg-cf-accent-soft"
                  style={{
                    insetInlineStart: `${corridorStart}%`,
                    width: `${Math.max(2, corridorEnd - corridorStart)}%`,
                  }}
                />
                <span
                  className={clsx(
                    // 4px, on the system's rhythm. A hairline would read better
                    // and is not available: the geometry ledger refuses
                    // off-rhythm pixels, and dodging it by spelling the same 2px
                    // as a named utility would be dodging the rule, not meeting
                    // it.
                    'absolute inset-y-0 w-[4px] rounded-[4px]',
                    placement(entry) === 'inside'
                      ? 'bg-cf-accent'
                      : 'bg-cf-warning'
                  )}
                  style={{
                    insetInlineStart: `${Math.min(99, entry.display)}%`,
                  }}
                />
              </div>
            )}

            {editing && draft ? (
              <div className="mt-[12px] flex flex-col gap-[8px]">
                <span className="flex items-center gap-[8px]">
                  <CheckboxField
                    checked={draft.excluded}
                    disabled={busy}
                    onChange={(event) =>
                      onDraftChange?.({
                        ...draft,
                        excluded: event.target.checked,
                      })
                    }
                    label={
                      <span className="cf-body-sm text-cf-ink [text-wrap:pretty]">
                        {t.scalesExclude}
                      </span>
                    }
                  />
                  <Hint label={t.hintFor(t.scalesExclude)}>{t.scalesExcludeHint}</Hint>
                </span>
                {/* The row commits itself. Eight corridors behind one Save
                    would make seven changes nobody asked for to keep one. */}
                {dirty ? (
                  <span className="flex flex-wrap gap-[8px]">
                    <Button
                      type="button"
                      variant="primary"
                      loading={busy}
                      onClick={onSave}
                    >
                      {t.scalesCorridorSave}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busy}
                      onClick={onReset}
                    >
                      {t.scalesCorridorReset}
                    </Button>
                  </span>
                ) : null}
              </div>
            ) : null}

            {expanded && entry.exampleText ? (
              <p className="mt-[8px] cf-body-sm text-cf-ink [text-wrap:pretty]">
                «{entry.exampleText}»
                <span className="ms-[8px] cf-caption text-cf-ink-muted">
                  {entry.exampleSampleCode}
                </span>
              </p>
            ) : null}
            {expanded ? (
              <p className="mt-[4px] cf-caption text-cf-ink-muted">
                {entry.observations} {t.scalesObservations} ·{' '}
                {entry.sampleCount} {t.scalesInSamples}
              </p>
            ) : null}
            {entry.excluded ? (
              <p className="mt-[4px] cf-caption text-cf-ink-muted">
                {t.scalesDisabled}
              </p>
            ) : null}
            {/* Перенесённая через пересчёт граница: обе величины рядом, и
                продуктовую можно взять обратно одним нажатием. */}
            {entry.manualCorridor &&
            entry.measuredLow !== undefined &&
            entry.measuredHigh !== undefined ? (
              <p
                data-voice-carried-corridor={scaleKey}
                className="mt-[4px] flex flex-wrap items-center gap-[8px] cf-caption text-cf-ink-muted"
              >
                {t.scalesMeasuredHere(entry.measuredLow, entry.measuredHigh)}
                {onDraftChange && editing && draft ? (
                  <Button
                    type="button"
                    variant="quiet"
                    disabled={busy}
                    onClick={() =>
                      onDraftChange({
                        ...draft,
                        low: entry.measuredLow!,
                        high: entry.measuredHigh!,
                      })
                    }
                  >
                    {t.scalesTakeMeasured}
                  </Button>
                ) : null}
              </p>
            ) : null}
          </div>

          <div className="text-end">
            <Button type="button" variant="quiet" onClick={onExpand}>
              {formatRaw(scaleKey, entry.raw, locale)}
            </Button>
            <p className="mt-[4px] whitespace-nowrap cf-caption text-cf-ink-muted">
              {shown.kind === 'value' ? `${shown.low}–${shown.high}` : null}
              {entry.manualCorridor ? ' ·' : ''}
            </p>
            {shown.kind === 'value' && placement(shown) !== 'inside' ? (
              // A label, not only a colour: the design says the same thing and
              // `DESIGN.md` makes it a rule.
              <p className="mt-[4px] cf-caption text-cf-warning">
                {placement(shown) === 'above' ? t.scalesAbove : t.scalesBelow}
              </p>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

export function VoiceScalesScreen({
  locale,
  state = 'default',
  scales,
  profileLabel,
  versionLabel,
  sampleCount,
  expandedScale,
  lastCheck,
  canEditCorridors = true,
  recalibration,
  recalibrating = false,
  recalibrated = false,
  onRecalibrate,
  saved = false,
  onExpand,
  onSaveCorridor,
  onRecount,
}: {
  locale: VoiceLocale;
  state?: VoiceScalesState;
  scales: Partial<Record<StyleScaleKey, ScaleEntry>>;
  profileLabel?: string;
  versionLabel?: string;
  sampleCount?: number;
  expandedScale?: StyleScaleKey;
  /** The last generated text measured against these same corridors. */
  lastCheck?: { inCorridor: number; outside?: { key: StyleScaleKey; value: string } };
  canEditCorridors?: boolean;
  /**
   * Offered only when measuring the same texts again would move these numbers,
   * and only to somebody who may both manage this voice and see the operator's
   * side of the product. Absent is the ordinary case and draws nothing.
   */
  recalibration?: { movedByHand: number };
  recalibrating?: boolean;
  recalibrated?: boolean;
  onRecalibrate?: () => void;
  /** The last corridor written landed. Announced once, above the list. */
  saved?: boolean;
  onExpand?: (key: StyleScaleKey) => void;
  /** Absent means the bars are a picture and nothing more. */
  onSaveCorridor?: (edit: CorridorEdit) => void;
  onRecount?: (key: StyleScaleKey) => void;
}) {
  const t = voiceCopy[locale];
  const busy = state === 'loading';
  const [editing, setEditing] = useState(false);
  /**
   * What the handles are showing, per scale, before it is written.
   *
   * A draft rather than a write on every pointer move: a range input fires on
   * each pixel, and committing there would send fifty requests for one drag
   * and leave the corridor wherever the network happened to land last.
   */
  const [drafts, setDrafts] = useState<
    Partial<Record<StyleScaleKey, CorridorEdit>>
  >({});

  const draftFor = (key: StyleScaleKey): CorridorEdit | undefined => {
    const held = drafts[key];
    if (held) return held;
    const entry = scales[key];
    if (!entry || entry.kind !== 'value') return undefined;
    return {
      key,
      low: entry.low,
      high: entry.high,
      excluded: entry.excluded === true,
    };
  };

  const editable = Boolean(onSaveCorridor) && canEditCorridors;

  return (
    <section
      data-voice-surface="scales"
      data-voice-state={state}
      data-voice-corridor-editing={editing ? 'true' : undefined}
      aria-busy={busy ? 'true' : undefined}
      className="flex min-w-0 flex-col gap-[16px] [&_button]:min-h-[44px] sm:[&_button]:min-h-0"
    >
      <header className="flex flex-wrap items-start justify-between gap-[12px]">
        <div className="min-w-0">
          <h2 className="flex flex-wrap items-center gap-[8px] cf-heading-md text-cf-ink [text-wrap:balance]">
            {t.scalesTitle}
            <Hint label={t.hintFor(t.scalesTitle)}>{t.scalesTitleHint}</Hint>
          </h2>
          <p className="mt-[4px] cf-caption text-cf-ink-muted">
            {[profileLabel, versionLabel, sampleCount ? `${sampleCount} ${t.scalesInSamples}` : null]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        {editable ? (
          <span className="flex items-center gap-[8px]">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setEditing((current) => !current);
                setDrafts({});
              }}
            >
              {editing ? t.scalesEditDone : t.scalesEditCorridors}
            </Button>
            <Hint side="start" label={t.hintFor(t.scalesEditCorridors)}>
              {t.scalesEditHint}
            </Hint>
          </span>
        ) : null}
      </header>

      {state === 'restricted' ? (
        <p className="rounded-[8px] border border-cf-border bg-cf-surface p-[12px] cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
          <span className="text-cf-ink">{t.scalesRestricted}.</span>{' '}
          {t.scalesRestrictedBody}
        </p>
      ) : null}

      {recalibration ? (
        <div
          data-voice-recalibrate="offered"
          className="flex min-w-0 flex-col gap-[8px] rounded-[8px] border border-cf-border bg-cf-surface p-[16px]"
        >
          <p className="cf-label-md text-cf-ink">{t.scalesRecalibrateWhy}</p>
          <p className="max-w-[72ch] cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
            {t.scalesRecalibrateWhat}
          </p>
          {/* Сказано до нажатия, а не после: человек, подвинувший полосу,
              должен знать, что с ней будет, пока ещё решает. */}
          {recalibration.movedByHand > 0 ? (
            <p className="max-w-[72ch] cf-body-sm text-cf-ink [text-wrap:pretty]">
              {t.scalesRecalibrateMoved(recalibration.movedByHand)}
            </p>
          ) : null}
          <span className="flex flex-wrap items-center gap-[8px]">
            <Button
              type="button"
              variant="secondary"
              loading={recalibrating}
              onClick={onRecalibrate}
            >
              {t.scalesRecalibrate}
            </Button>
            {recalibrating ? (
              <span role="status" className="cf-caption text-cf-ink-muted">
                {t.scalesRecalibrateRunning}
              </span>
            ) : null}
          </span>
        </div>
      ) : null}

      {recalibrated ? (
        <p
          role="status"
          data-voice-recalibrated="true"
          className="rounded-[8px] border border-cf-accent bg-cf-accent-soft p-[12px] cf-body-sm text-cf-ink"
        >
          {t.scalesRecalibrateDone}
        </p>
      ) : null}

      {saved ? (
        <p
          role="status"
          data-voice-corridor-saved="true"
          className="rounded-[8px] border border-cf-accent bg-cf-accent-soft p-[12px] cf-body-sm text-cf-ink"
        >
          {t.scalesCorridorSaved}
        </p>
      ) : null}

      <p className="cf-label-sm uppercase text-cf-ink-muted">
        {t.scalesSubtitle}
      </p>

      <div className="min-w-0 rounded-[8px] border border-cf-border bg-cf-surface px-[16px]">
        {SCALE_ORDER.map((key) => {
          const entry = scales[key];
          if (!entry) return null;
          const draft = editing ? draftFor(key) : undefined;
          return (
            <ScaleRow
              key={key}
              scaleKey={key}
              entry={entry}
              locale={locale}
              expanded={expandedScale === key}
              editing={editing}
              busy={busy}
              {...(draft ? { draft } : {})}
              onExpand={() => onExpand?.(key)}
              onRecount={() => onRecount?.(key)}
              onDraftChange={(next) =>
                setDrafts((current) => ({ ...current, [key]: next }))
              }
              onSave={() => {
                if (draft) onSaveCorridor?.(draft);
              }}
              onReset={() =>
                setDrafts((current) => {
                  const next = { ...current };
                  delete next[key];
                  return next;
                })
              }
            />
          );
        })}
      </div>

      {lastCheck ? (
        <div
          className="rounded-[8px] border border-cf-border bg-cf-surface p-[12px]"
          data-voice-last-check="true"
        >
          <p className="cf-label-sm uppercase text-cf-ink-muted">
            {t.scalesLastCheck}
          </p>
          <p className="mt-[8px] cf-body-sm text-cf-ink">
            {t.scalesInCorridor(lastCheck.inCorridor)}
            {lastCheck.outside ? (
              <>
                {' · '}
                <span className="text-cf-warning">
                  {t.scalesOutside(
                    scaleLabels[locale][lastCheck.outside.key].label,
                    lastCheck.outside.value
                  )}
                </span>
              </>
            ) : null}
          </p>
        </div>
      ) : null}

      <div className="grid gap-[12px] sm:grid-cols-2">
        <div className="rounded-[8px] border border-cf-border bg-cf-surface p-[12px]">
          <p className="cf-label-sm uppercase text-cf-ink-muted">
            {t.scalesHowToRead}
          </p>
          <p className="mt-[8px] cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
            {t.scalesHowToReadBody}
          </p>
          <p className="mt-[8px] cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
            {t.scalesGeneratorBody}
          </p>
        </div>
        <div className="rounded-[8px] border border-cf-border bg-cf-surface p-[12px]">
          <p className="cf-label-sm uppercase text-cf-ink-muted">
            {t.scalesNoRadarTitle}
          </p>
          <p className="mt-[8px] cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
            {t.scalesNoRadarBody}
          </p>
        </div>
      </div>
    </section>
  );
}
