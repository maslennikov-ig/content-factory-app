'use client';

import clsx from 'clsx';
import { Button } from '@contentfactory/react/form/button';
import { CheckboxField } from '@contentfactory/react/form/checkbox.field';
import { Hint } from '@contentfactory/react/layout/hint';
import type { ProfileField } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/assist.contract';
import { voiceCopy, type VoiceLocale } from './voice-copy';

/**
 * Versions, and what actually changed between two of them.
 *
 * The comparison is field by field, not a text diff, because a person is
 * comparing decisions rather than lines. Unchanged fields are listed beside
 * changed ones for the same reason: a table showing only differences leaves it
 * unclear whether the other fields were looked at at all.
 *
 * Restoring creates a new version carrying the old fields. It does not move a
 * pointer. Posts reference the profile version that wrote them, so rewriting
 * history would be lying about what produced old text — the design states the
 * consequence in the sentence this screen prints verbatim.
 *
 * The picker used to be broken in a way that read as a bug in the checkboxes
 * and was really a bug in the model behind them. Ticking a third version
 * silently dropped one of the first two — so a box the reader had not touched
 * cleared itself, and which one it was depended on the order things had been
 * ticked in. Underneath, `/versions` compared only the two newest and took no
 * arguments, so most pairs a person could tick had no table behind them at all
 * and the screen simply printed «выберите две» while two were already ticked.
 *
 * Both halves are fixed and the fix is one idea: what is ticked is what is
 * compared. The route takes the pair, and the third tick is refused where it
 * happens — a disabled box with the reason beside it — instead of being
 * accepted and undone somewhere else.
 */

export type VersionLifecycle = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export type VoiceVersion = Readonly<{
  id: string;
  label: string;
  lifecycle: VersionLifecycle;
  active?: boolean;
  changedAt: string;
  actor: string;
}>;

export type FieldComparison = Readonly<{
  field: ProfileField;
  was: string;
  became: string;
  changed: boolean;
}>;

export type VoiceVersionsState =
  | 'default'
  | 'loading'
  | 'empty'
  | 'selected'
  | 'success'
  | 'error'
  | 'restricted'
  | 'disabled'
  | 'long-content';

/**
 * The five lines, named the way the card above them names them.
 *
 * The server used to send the display name and the two surfaces disagreed:
 * «Тон» in the table, «Каким тоном» on the card, for one field. Worse, the
 * name was built in Russian on the server, so an English session read a
 * Russian table. The key travels now and the name is read here, from the one
 * place both surfaces already share.
 */
const fieldLabel = (t: (typeof voiceCopy)[VoiceLocale], field: ProfileField) =>
  ({
    WHO_SPEAKS: t.passportWhoSpeaks,
    TONE: t.passportTone,
    AUDIENCE: t.passportAudience,
    SENTENCE_LENGTH: t.passportSentenceStyle,
    NEVER_SAY: t.passportNeverSay,
  }[field]);

export function VoiceVersionsScreen({
  locale,
  state = 'default',
  versions,
  selected = [],
  comparison,
  comparisonNotice,
  profileLabel,
  canRestore = true,
  onToggle,
  onRestore,
}: {
  locale: VoiceLocale;
  state?: VoiceVersionsState;
  versions: readonly VoiceVersion[];
  selected?: readonly string[];
  comparison?: { from: string; to: string; fields: readonly FieldComparison[] };
  /** Why a pair that was asked for has no table under it. */
  comparisonNotice?: string;
  profileLabel?: string;
  canRestore?: boolean;
  onToggle?: (id: string, checked: boolean) => void;
  onRestore?: (id: string) => void;
}) {
  const t = voiceCopy[locale];
  const busy = state === 'loading';
  const picked = new Set(selected);
  /**
   * Two is the whole capacity, and the third tick is refused here.
   *
   * Not silently absorbed: the box that cannot be ticked is disabled and the
   * sentence under the list says why. The version this replaces accepted the
   * tick and then cleared a different box to make room, which is the interface
   * doing something the reader did not ask for and did not see coming.
   */
  const full = picked.size >= 2;
  const restorable = versions.find(
    (version) => !version.active && version.lifecycle !== 'DRAFT'
  );
  const changedCount =
    comparison?.fields.filter((field) => field.changed).length ?? 0;
  const nextLabel = `v${versions.length + 1}`;

  const lifecycleLabel = (version: VoiceVersion) =>
    version.active
      ? t.versionsActive
      : version.lifecycle === 'DRAFT'
      ? t.versionsDraft
      : t.versionsArchived;

  return (
    <section
      data-voice-surface="versions"
      data-voice-state={state}
      aria-busy={busy ? 'true' : undefined}
      className="flex min-w-0 flex-col gap-[16px] [&_button]:min-h-[44px] sm:[&_button]:min-h-0"
    >
      <header className="flex flex-wrap items-start justify-between gap-[12px]">
        <div className="min-w-0">
          <h2 className="flex flex-wrap items-center gap-[8px] cf-heading-md text-cf-ink [text-wrap:balance]">
            {t.versionsTitle}
            <Hint label={t.hintFor(t.versionsTitle)}>{t.versionsTitleHint}</Hint>
          </h2>
          <p className="mt-[4px] cf-caption text-cf-ink-muted">
            {[profileLabel, `${versions.length} ${locale === 'ru' ? 'версии' : 'versions'}`]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        {canRestore && restorable ? (
          <span className="flex items-center gap-[8px]">
            <Button
              type="button"
              variant="secondary"
              onClick={() => onRestore?.(restorable.id)}
            >
              {t.versionsRestore(restorable.label)}
            </Button>
            {/* «Вернуть v2» does not say what happens to v3, which is the
                thing a person hesitates over before pressing it. */}
            <Hint side="start" label={t.hintFor(t.versionsRestore(restorable.label))}>
              {t.versionsRestoreHint}
            </Hint>
          </span>
        ) : null}
      </header>

      {state === 'error' ? (
        <p
          role="alert"
          className="rounded-[8px] border border-cf-danger bg-cf-danger-soft p-[12px] cf-body-sm text-cf-ink"
        >
          {locale === 'ru'
            ? 'История версий не загрузилась. Действующая версия продолжает работать.'
            : 'The version history did not load. The active version keeps working.'}
        </p>
      ) : null}

      {state === 'success' ? (
        <p
          role="status"
          className="rounded-[8px] border border-cf-accent bg-cf-accent-soft p-[12px] cf-body-sm text-cf-ink"
        >
          {restorable
            ? t.versionsRestoreNote(restorable.label, nextLabel)
            : t.versionsNote}
        </p>
      ) : null}

      <p className="flex flex-wrap items-center gap-[8px] cf-label-sm uppercase text-cf-ink-muted">
        {t.versionsPick}
        <Hint label={t.hintFor(t.versionsPick)}>{t.versionsPickHint}</Hint>
      </p>

      {versions.length === 0 ? (
        <p className="rounded-[8px] border border-cf-border bg-cf-surface p-[16px] cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
          {locale === 'ru'
            ? 'Версий пока нет: голос ещё ни разу не активировали.'
            : 'No versions yet: the voice has never been activated.'}
        </p>
      ) : (
        <ul className="flex min-w-0 flex-col rounded-[8px] border border-cf-border bg-cf-surface">
          {versions.map((version) => (
            <li
              key={version.id}
              data-voice-version={version.label}
              data-voice-version-picked={
                picked.has(version.id) ? 'true' : undefined
              }
              className={clsx(
                'flex flex-wrap items-center justify-between gap-[8px] border-b border-cf-border px-[16px] py-[12px] last:border-b-0',
                picked.has(version.id) && 'bg-cf-accent-soft'
              )}
            >
              <CheckboxField
                checked={picked.has(version.id)}
                disabled={
                  state === 'restricted' || (full && !picked.has(version.id))
                }
                onChange={(event) =>
                  onToggle?.(version.id, event.target.checked)
                }
                label={
                  <span className="flex flex-wrap items-baseline gap-x-[8px]">
                    <span className="cf-label-md text-cf-ink">
                      {version.label}
                    </span>
                    <span
                      className={clsx(
                        'cf-label-sm uppercase',
                        version.active ? 'text-cf-accent' : 'text-cf-ink-muted'
                      )}
                    >
                      {lifecycleLabel(version)}
                    </span>
                  </span>
                }
              />
              <span className="cf-caption text-cf-ink-muted">
                {version.changedAt} · {version.actor}
              </span>
            </li>
          ))}
        </ul>
      )}

      {full ? (
        <p
          data-voice-versions-full="true"
          className="cf-caption text-cf-ink-muted [text-wrap:pretty]"
        >
          {t.versionsPickFull}
        </p>
      ) : null}

      <p className="cf-caption text-cf-ink-muted [text-wrap:pretty]">
        {t.versionsNote}
      </p>

      {comparison ? (
        (() => {
          /**
           * Строки, пустые в обеих версиях, в таблицу не попадают.
           *
           * Раньше попадали, и выглядело это сломанным: название поля,
           * «БЕЗ ИЗМЕНЕНИЙ» под ним и две пустые клетки справа. Причина, по
           * которой неизменённые строки вообще показывают, — чтобы было видно,
           * что их сравнивали, а не пропустили, — к пустым не относится:
           * сравнивать там нечего. Сказать, что поле не заполнено, честнее
           * одной строкой под таблицей, чем пустой полосой внутри неё.
           */
          const filled = comparison.fields.filter(
            (field) => field.was || field.became
          );
          const blank = comparison.fields.filter(
            (field) => !field.was && !field.became
          );

          return (
            <div
              className="min-w-0 rounded-[8px] border border-cf-border bg-cf-surface p-[16px]"
              data-voice-comparison="true"
            >
              <p className="cf-label-sm uppercase text-cf-ink-muted">
                {t.comparisonTitle(comparison.from, comparison.to)} ·{' '}
                {t.comparisonChanged(changedCount, comparison.fields.length)}
              </p>
              <div className="mt-[12px] min-w-0 overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-cf-border">
                      <th className="pb-[8px] pe-[8px] text-start cf-label-sm uppercase text-cf-ink-muted">
                        {t.comparisonField}
                      </th>
                      <th className="pb-[8px] pe-[8px] text-start cf-label-sm uppercase text-cf-ink-muted">
                        {t.comparisonWas} · {comparison.from}
                      </th>
                      <th className="pb-[8px] pe-[8px] text-start cf-label-sm uppercase text-cf-ink-muted">
                        {t.comparisonBecame} · {comparison.to}
                      </th>
                      {/* Своя колонка, а не вторая строка под названием поля:
                          «Никогда не говорим» и «БЕЗ ИЗМЕНЕНИЙ» друг под другом
                          читались как одна фраза. */}
                      <th className="pb-[8px] text-end cf-label-sm uppercase text-cf-ink-muted">
                        {t.comparisonState}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filled.map((field) => (
                      <tr
                        key={field.field}
                        data-voice-field={field.field}
                        data-voice-field-changed={field.changed ? 'true' : 'false'}
                        className="border-b border-cf-border last:border-b-0"
                      >
                        <td className="py-[8px] pe-[8px] align-top cf-body-sm text-cf-ink">
                          {fieldLabel(t, field.field)}
                        </td>
                        <td className="py-[8px] pe-[8px] align-top cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
                          {field.was || '—'}
                        </td>
                        <td className="py-[8px] pe-[8px] align-top cf-body-sm text-cf-ink [text-wrap:pretty]">
                          {field.became || '—'}
                        </td>
                        <td
                          className={clsx(
                            'whitespace-nowrap py-[8px] text-end align-top cf-caption',
                            field.changed ? 'text-cf-accent' : 'text-cf-ink-muted'
                          )}
                        >
                          {field.changed
                            ? t.comparisonChangedMark
                            : t.comparisonUnchanged}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {blank.length ? (
                <p
                  data-voice-comparison-blank={String(blank.length)}
                  className="mt-[12px] cf-caption text-cf-ink-muted [text-wrap:pretty]"
                >
                  {t.comparisonEmptyBoth(
                    blank
                      .map((field) => `«${fieldLabel(t, field.field)}»`)
                      .join(', ')
                  )}
                </p>
              ) : null}
            </div>
          );
        })()
      ) : (
        // A pair that was asked for and refused says why; a pair that was
        // never asked for says how to ask. Printing «выберите две» over two
        // ticked boxes is what the previous version did.
        <p
          data-voice-comparison-notice={comparisonNotice ? 'true' : undefined}
          className="cf-body-sm text-cf-ink-muted [text-wrap:pretty]"
        >
          {comparisonNotice ?? t.comparisonPickTwo}
        </p>
      )}
    </section>
  );
}
