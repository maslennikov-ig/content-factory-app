'use client';

import { Button } from '@contentfactory/react/form/button';
import type { VoiceTextSpotV1 } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';
import type { VoiceLocale } from './voice-copy';

/**
 * The places the draft leaves the author's own manner, in the draft's words.
 *
 * The check used to answer with a line of arithmetic — «2 шкалы в коридоре ·
 * «Ставит тире вместо связки» 0% — ниже коридора». True, and nothing anybody
 * can act on: it does not say which phrase. This shows the phrases, one note
 * each, and one action each.
 *
 * The action repairs a single sentence and never regenerates the text. That is
 * the owner's decision of 2026-08-24 and it has three reasons: a regeneration
 * loses the facts and the order of thought the text was written for, it costs a
 * full call instead of a short one, and a second pass can carry the style
 * further away than the first did.
 *
 * Nothing applies itself. The rewrite arrives beside the original with the
 * facts that had to survive listed under it, and the person says yes or no.
 */

export type SpotRepair = {
  sentence: string;
  status: 'loading' | 'ready' | 'error';
  proposal?: string;
  note?: string;
  keptFacts?: string[];
  message?: string;
  /** False when the sentence cannot be found in any box to replace it in. */
  applicable?: boolean;
};

const copy = {
  ru: {
    heading: 'Что расходится с вашей манерой',
    fix: 'Поправить это предложение',
    working: 'Модель правит…',
    was: 'Было',
    becomes: 'Станет',
    kept: 'Сохранено дословно',
    apply: 'Применить',
    dismiss: 'Отклонить',
    unapplicable:
      'Это предложение не найти в поле как есть — похоже, внутри него разметка. Правку придётся перенести руками.',
  },
  en: {
    heading: 'What departs from your manner',
    fix: 'Repair this sentence',
    working: 'The model is rewriting…',
    was: 'Was',
    becomes: 'Becomes',
    kept: 'Kept word for word',
    apply: 'Apply',
    dismiss: 'Dismiss',
    unapplicable:
      'This sentence is not in the box as it stands — there is markup inside it. The repair has to be carried over by hand.',
  },
} satisfies Record<VoiceLocale, Record<string, string>>;

export function VoiceSpots({
  locale,
  spots,
  repair,
  onRepair,
  onApply,
  onDismiss,
}: {
  locale: VoiceLocale;
  spots: readonly VoiceTextSpotV1[];
  /** The one sentence being repaired, if any. One at a time, on purpose. */
  repair: SpotRepair | null;
  onRepair: (spot: VoiceTextSpotV1) => void;
  onApply: (repair: SpotRepair) => void;
  onDismiss: () => void;
}) {
  const t = copy[locale];
  if (spots.length === 0) return null;

  return (
    <div
      data-voice-spots={spots.length}
      className="flex flex-col gap-[8px] rounded-[8px] border border-cf-border bg-cf-surface p-[12px]"
    >
      <span className="cf-label-sm uppercase text-cf-ink-muted">
        {t.heading}
      </span>

      {spots.map((spot) => {
        const active = repair?.sentence === spot.sentence;
        return (
          <div
            key={`${spot.start}-${spot.scale}`}
            data-voice-spot={spot.scale}
            className="flex min-w-0 flex-col gap-[4px] border-s border-cf-warning ps-[8px]"
          >
            <p className="cf-body-sm text-cf-ink [overflow-wrap:anywhere]">
              {spot.sentence}
            </p>
            <p className="cf-caption text-cf-ink-muted [text-wrap:pretty]">
              {spot.note}
            </p>

            {!active ? (
              <div className="flex flex-wrap gap-[8px]">
                <Button
                  type="button"
                  variant="quiet"
                  onClick={() => onRepair(spot)}
                  disabled={repair?.status === 'loading'}
                >
                  {t.fix}
                </Button>
              </div>
            ) : null}

            {active && repair.status === 'loading' ? (
              <p
                data-voice-spot-state="loading"
                aria-busy="true"
                className="cf-caption text-cf-ink-muted"
              >
                {t.working}
              </p>
            ) : null}

            {active && repair.status === 'error' ? (
              <p
                data-voice-spot-state="error"
                role="status"
                className="cf-caption text-cf-ink [text-wrap:pretty]"
              >
                {repair.message}
              </p>
            ) : null}

            {active && repair.status === 'ready' ? (
              <div
                data-voice-spot-state="ready"
                className="flex min-w-0 flex-col gap-[4px] rounded-[8px] bg-cf-surface-subtle p-[8px]"
              >
                <span className="cf-label-sm uppercase text-cf-ink-muted">
                  {t.becomes}
                </span>
                <p className="cf-body-sm text-cf-ink [overflow-wrap:anywhere]">
                  {repair.proposal}
                </p>
                {repair.note ? (
                  <p className="cf-caption text-cf-ink-muted [text-wrap:pretty]">
                    {repair.note}
                  </p>
                ) : null}
                {repair.keptFacts?.length ? (
                  <p className="cf-caption text-cf-ink-muted [overflow-wrap:anywhere]">
                    {t.kept}: {repair.keptFacts.join(' · ')}
                  </p>
                ) : null}
                {repair.applicable === false ? (
                  <p className="cf-caption text-cf-ink [text-wrap:pretty]">
                    {t.unapplicable}
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-[8px]">
                  {repair.applicable !== false ? (
                    <Button
                      type="button"
                      variant="primary"
                      onClick={() => onApply(repair)}
                    >
                      {t.apply}
                    </Button>
                  ) : null}
                  <Button type="button" variant="quiet" onClick={onDismiss}>
                    {t.dismiss}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export const voiceSpotsCopy = copy;
