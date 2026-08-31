'use client';

import { useEffect, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { Button } from '@contentfactory/react/form/button';
import { Textarea } from '@contentfactory/react/form/textarea';
import { Hint } from '@contentfactory/react/layout/hint';
import type { ProfileField } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/assist.contract';
import { voiceCopy, type VoiceLocale } from './voice-copy';

/**
 * The voice, in one card readable in five seconds — and editable in it.
 *
 * The wizard could show every field; it could not show the voice. Four
 * sentences — who speaks, in what tone, to whom, and what is never said —
 * answer the question a person actually arrives with, and the two measurements
 * beside them tie the description to something counted rather than asserted.
 *
 * It embeds in other screens, which is why it takes its own `density`: the
 * same card is the whole subject on the passport screen and a sidebar item
 * next to a draft.
 *
 * "Без голоса" is a first-class variant, not a failure. A workspace generating
 * in neutral style is working, and the card says so instead of leaving a hole
 * where a voice should be.
 *
 * Editing happens here, on the line being read, and that is a correction of a
 * real defect rather than a convenience. The five fields had exactly one
 * editor: a separate form under a separate heading, which filled a draft that
 * had to be completed in full and consented to before any of it counted. A
 * person who spotted two wrong words in «Каким тоном» had to find that form
 * and work out that it described the same voice. Two doors onto one object is
 * how the two come to disagree about what the object is; now there is one, and
 * it is the door the value is behind.
 *
 * Every field carries a hint, because none of these five is self-evident from
 * its label — «Длина фраз» beside a measured number is genuinely ambiguous
 * about which of the two the model obeys. A hint explains; it never holds the
 * only copy of something load-bearing.
 */

export type PassportVoice = Readonly<{
  whoSpeaks: string;
  tone: string;
  audience: string;
  neverSay: readonly string[];
  /** The fifth line the wizard asks for, in the person's own words. */
  sentenceStyle?: string;
  versionLabel: string;
  activeSince: string;
  /**
   * Absent, not zero, when no measurement explains this version. `0` would
   * claim the corpus was counted and found empty; absent says it was never
   * counted for THIS voice at all, which is true even when the workspace
   * holds thirty samples that simply measure a different version.
   */
  sampleCount?: number;
  charCount?: number;
  confidence?: 'LOW' | 'NORMAL';
  /** Two numbers from the analysis, so the words rest on something counted. */
  sentenceLength?: { value: string; low: number; high: number };
  dashShare?: string;
  /**
   * The author's own posts, shown because the model is being handed them.
   *
   * The field existed and stayed empty for as long as the voice existed: a
   * workspace with a hundred and fifty of somebody's posts sent the model none
   * of them. Now that they go into the prompt, they belong on the card — this
   * is the part of a voice a person can judge fastest, because it is their own
   * writing, and the card is where that judgement has somewhere to go.
   */
  examples?: readonly { text: string }[];
}>;

export type VoicePassportState =
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
 * The five lines, each tied to the field the server knows it by.
 *
 * The value shown and the value written are read from the same table, so a
 * label can never end up editing a different field than the one under it.
 * `NEVER_SAY` is a list on screen and one semicolon-separated line on the
 * wire — that is the shape the profile stores and the shape the manual path
 * has always used, and inventing a second one here would mean two parsers.
 */
const FIELD_ORDER = [
  'WHO_SPEAKS',
  'TONE',
  'AUDIENCE',
  'SENTENCE_LENGTH',
  'NEVER_SAY',
] as const satisfies readonly ProfileField[];

const labelOf = (t: (typeof voiceCopy)[VoiceLocale], key: ProfileField) =>
  ({
    WHO_SPEAKS: t.passportWhoSpeaks,
    TONE: t.passportTone,
    AUDIENCE: t.passportAudience,
    SENTENCE_LENGTH: t.passportSentenceStyle,
    NEVER_SAY: t.passportNeverSay,
  }[key]);

const hintOf = (t: (typeof voiceCopy)[VoiceLocale], key: ProfileField) =>
  ({
    WHO_SPEAKS: t.passportHintWhoSpeaks,
    TONE: t.passportHintTone,
    AUDIENCE: t.passportHintAudience,
    SENTENCE_LENGTH: t.passportHintSentenceStyle,
    NEVER_SAY: t.passportHintNeverSay,
  }[key]);

/** What the field holds now, in the one shape the write also takes. */
const valueOf = (voice: PassportVoice, key: ProfileField): string =>
  ({
    WHO_SPEAKS: voice.whoSpeaks,
    TONE: voice.tone,
    AUDIENCE: voice.audience,
    SENTENCE_LENGTH: voice.sentenceStyle ?? '',
    NEVER_SAY: voice.neverSay.join('; '),
  }[key]);

function Field({
  label,
  hint,
  hintName,
  action,
  children,
}: {
  label: string;
  hint: string;
  /** The hint button's own name, so it is not a second «Кто говорит». */
  hintName: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="flex flex-wrap items-center gap-[8px]">
        <span className="cf-label-sm uppercase text-cf-ink-muted">{label}</span>
        <Hint label={hintName}>{hint}</Hint>
        {action}
      </dt>
      <dd className="mt-[4px] cf-body-sm text-cf-ink [text-wrap:pretty]">
        {children}
      </dd>
    </div>
  );
}

/**
 * One line, being rewritten.
 *
 * A textarea rather than an input for all five: «Никогда не говорим» is a
 * list, «Кто говорит» is routinely a full sentence, and a single-line box
 * hides the end of both while somebody is editing them.
 */
function FieldEditor({
  locale,
  label,
  value,
  busy,
  onSave,
  onCancel,
}: {
  locale: VoiceLocale;
  label: string;
  value: string;
  busy: boolean;
  onSave: (text: string) => void;
  onCancel: () => void;
}) {
  const t = voiceCopy[locale];
  const [draft, setDraft] = useState(value);
  const empty = !draft.trim();
  // Reopening the editor on a field the server has since changed must offer
  // what the server holds, not what was typed the time before.
  useEffect(() => setDraft(value), [value]);

  return (
    <form
      data-voice-field-editor="open"
      className="flex min-w-0 flex-col gap-[8px]"
      onSubmit={(event) => {
        event.preventDefault();
        if (empty) return;
        onSave(draft.trim());
      }}
    >
      <Textarea
        standalone
        autoFocus
        rows={3}
        maxLength={600}
        aria-label={label}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onCancel();
        }}
      />
      <div className="flex flex-wrap items-center gap-[8px]">
        <Button type="submit" variant="primary" disabled={empty} loading={busy}>
          {t.passportEditSave}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t.passportEditCancel}
        </Button>
        {empty ? (
          <span className="cf-caption text-cf-danger">
            {t.passportEditEmpty}
          </span>
        ) : null}
      </div>
    </form>
  );
}

export function VoicePassportScreen({
  locale,
  state = 'default',
  voice,
  density = 'full',
  saved = false,
  onEditField,
  onAddExample,
  onRemoveExample,
  onRefreshExamples,
}: {
  locale: VoiceLocale;
  state?: VoicePassportState;
  /** `null` is the "no voice" variant, which is a working state. */
  voice: PassportVoice | null;
  density?: 'full' | 'compact';
  /** The last edit landed. Announced once, beside the field list. */
  saved?: boolean;
  /**
   * All four are optional, and each control appears only with its handler.
   *
   * The card is embedded read-only beside a draft as well as owned by the
   * passport screen, and a member without the right to change a voice must not
   * be shown a button that will refuse them.
   */
  onEditField?: (key: ProfileField, text: string) => void;
  onAddExample?: (text: string) => void;
  onRemoveExample?: (index: number) => void;
  onRefreshExamples?: () => void;
}) {
  const t = voiceCopy[locale];
  const busy = state === 'loading';
  const numbers = new Intl.NumberFormat(locale === 'ru' ? 'ru-RU' : 'en-US');
  const [editing, setEditing] = useState<ProfileField | null>(null);
  const [adding, setAdding] = useState(false);
  const [example, setExample] = useState('');

  return (
    <section
      data-voice-surface="passport"
      data-voice-state={state}
      data-voice-passport={voice ? 'present' : 'absent'}
      aria-busy={busy ? 'true' : undefined}
      className={clsx(
        'min-w-0 rounded-[8px] border border-cf-border bg-cf-surface',
        // The 44px touch area every other voice surface already reserves. The
        // card had no controls of its own until the edits and the hints
        // arrived, which is why it never needed the rule before.
        '[&_button]:min-h-[44px] sm:[&_button]:min-h-0',
        density === 'full' ? 'p-[20px]' : 'p-[12px]'
      )}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-[8px]">
        <h2 className="cf-heading-md text-cf-ink [text-wrap:balance]">
          {voice ? t.passportTitle : t.passportNoVoice}
        </h2>
        {voice ? (
          <p className="cf-label-sm text-cf-ink-muted">
            {voice.versionLabel} · {t.passportActiveSince} {voice.activeSince}
          </p>
        ) : null}
      </header>

      {state === 'error' ? (
        <p
          role="alert"
          className="mt-[12px] rounded-[8px] border border-cf-danger bg-cf-danger-soft p-[12px] cf-body-sm text-cf-ink [text-wrap:pretty]"
        >
          {locale === 'ru'
            ? 'Паспорт не обновился. Показано последнее, что удалось прочитать; действующая версия работает.'
            : 'The passport did not refresh. What was last read is shown; the active version keeps working.'}
        </p>
      ) : null}

      {!voice ? (
        <p className="mt-[8px] max-w-[72ch] cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
          {t.passportNoVoiceBody}
        </p>
      ) : (
        <>
          {/* What an edit does to the history, said once above the fields
              rather than beside each of the five. */}
          {onEditField ? (
            <p className="mt-[8px] max-w-[72ch] cf-caption text-cf-ink-muted [text-wrap:pretty]">
              {t.passportEditNote}
            </p>
          ) : null}
          {saved ? (
            <p
              role="status"
              data-voice-passport-saved="true"
              className="mt-[8px] rounded-[8px] border border-cf-accent bg-cf-accent-soft p-[12px] cf-body-sm text-cf-ink"
            >
              {t.passportEditSaved}
            </p>
          ) : null}

          <dl
            className={clsx(
              'mt-[16px] grid gap-[16px]',
              density === 'full' ? 'sm:grid-cols-2' : ''
            )}
          >
            {FIELD_ORDER.map((key) => {
              const value = valueOf(voice, key);
              // The fifth line only exists when it was written: a voice
              // measured from texts may carry the number below and no
              // sentence, and an empty row would claim otherwise. It stays
              // offered for editing, because writing the missing line is
              // exactly what somebody would want to do here.
              if (key === 'SENTENCE_LENGTH' && !value && !onEditField) {
                return null;
              }
              const label = labelOf(t, key);
              const open = editing === key;
              return (
                <Field
                  key={key}
                  label={label}
                  hint={hintOf(t, key)}
                  hintName={t.hintFor(label)}
                  action={
                    onEditField && !open ? (
                      <Button
                        type="button"
                        variant="quiet"
                        disabled={busy}
                        aria-label={`${t.passportEdit}: ${label}`}
                        onClick={() => setEditing(key)}
                      >
                        {t.passportEdit}
                      </Button>
                    ) : undefined
                  }
                >
                  {open && onEditField ? (
                    <FieldEditor
                      locale={locale}
                      label={label}
                      value={value}
                      busy={busy}
                      onSave={(text) => {
                        setEditing(null);
                        onEditField(key, text);
                      }}
                      onCancel={() => setEditing(null)}
                    />
                  ) : key === 'NEVER_SAY' ? (
                    voice.neverSay.length === 0 ? (
                      <span className="text-cf-ink-muted">—</span>
                    ) : (
                      <ul className="flex flex-col gap-[4px]">
                        {voice.neverSay.map((item) => (
                          <li key={item}>«{item}»</li>
                        ))}
                      </ul>
                    )
                  ) : value ? (
                    value
                  ) : (
                    <span className="text-cf-ink-muted">—</span>
                  )}
                </Field>
              );
            })}
          </dl>

          {voice.sentenceLength || voice.dashShare ? (
            <div className="mt-[16px] flex flex-wrap gap-[24px] border-t border-cf-border pt-[16px]">
              {voice.sentenceLength ? (
                <div>
                  <p className="cf-label-sm uppercase text-cf-ink-muted">
                    {t.passportSentenceLength}
                  </p>
                  <p className="mt-[4px] cf-display-num text-cf-ink">
                    {voice.sentenceLength.value}
                  </p>
                  <p className="mt-[4px] cf-caption text-cf-ink-muted">
                    {t.scalesYourCorridor} {voice.sentenceLength.low}–
                    {voice.sentenceLength.high}
                  </p>
                </div>
              ) : null}
              {voice.dashShare ? (
                <div>
                  <p className="cf-label-sm uppercase text-cf-ink-muted">
                    {t.passportDash}
                  </p>
                  <p className="mt-[4px] cf-display-num text-cf-ink">
                    {voice.dashShare}
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}

          {typeof voice.sampleCount === 'number' &&
          typeof voice.charCount === 'number' ? (
            <p className="mt-[16px] cf-caption text-cf-ink-muted">
              {t.passportSamples} {voice.sampleCount} · {t.passportCorpus}{' '}
              {numbers.format(voice.charCount)}
            </p>
          ) : (
            <p className="mt-[16px] cf-caption text-cf-ink-muted">
              {t.passportUnmeasured}
            </p>
          )}

          {voice.confidence === 'LOW' ? (
            <p className="mt-[8px] max-w-[72ch] cf-caption text-cf-ink-muted [text-wrap:pretty]">
              {t.passportLowConfidence}
            </p>
          ) : null}

          {/* The examples block stands even with an empty list once a person
              may add to it: «нет примеров» plus a door is a state, where a
              missing block is a feature that appears to be absent. */}
          {voice.examples?.length || onAddExample ? (
            <div
              data-voice-examples={String(voice.examples?.length ?? 0)}
              className="mt-[16px] border-t border-cf-border pt-[16px]"
            >
              <div className="flex flex-wrap items-center justify-between gap-[8px]">
                <span className="flex items-center gap-[8px]">
                  <span className="cf-label-sm uppercase text-cf-ink-muted">
                    {t.passportExamples}
                  </span>
                  <Hint label={t.hintFor(t.passportExamples)}>
                    {t.passportHintExamples}
                  </Hint>
                </span>
                <span className="flex flex-wrap items-center gap-[8px]">
                  {onAddExample && !adding ? (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => {
                        setExample('');
                        setAdding(true);
                      }}
                    >
                      {t.passportExampleAdd}
                    </Button>
                  ) : null}
                  {onRefreshExamples ? (
                    <>
                      <Button
                        type="button"
                        variant="quiet"
                        disabled={busy}
                        onClick={onRefreshExamples}
                      >
                        {t.passportExamplesRefresh}
                      </Button>
                      {/* The button replaces the whole list, including
                          hand-written entries. That is worth knowing before
                          pressing it rather than after. */}
                      <Hint side="start" label={t.hintFor(t.passportExamplesRefresh)}>
                        {t.passportExamplesRefreshHint}
                      </Hint>
                    </>
                  ) : null}
                </span>
              </div>
              <p className="mt-[4px] max-w-[72ch] cf-caption text-cf-ink-muted [text-wrap:pretty]">
                {t.passportExamplesHint}
              </p>

              {adding && onAddExample ? (
                <form
                  data-voice-example-add="open"
                  className="mt-[12px] flex min-w-0 flex-col gap-[8px] rounded-[8px] border border-cf-border bg-cf-surface-subtle p-[12px]"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const text = example.trim();
                    if (!text) return;
                    setAdding(false);
                    setExample('');
                    onAddExample(text);
                  }}
                >
                  <span className="flex items-center gap-[8px]">
                    <span className="cf-label-sm uppercase text-cf-ink-muted">
                      {t.passportExampleAdd}
                    </span>
                    <Hint label={t.hintFor(t.passportExampleAdd)}>
                      {t.passportExampleAddHint}
                    </Hint>
                  </span>
                  <Textarea
                    standalone
                    autoFocus
                    rows={4}
                    aria-label={t.passportExampleAdd}
                    placeholder={t.passportExampleAddPlaceholder}
                    value={example}
                    onChange={(event) => setExample(event.target.value)}
                  />
                  <div className="flex flex-wrap gap-[8px]">
                    <Button
                      type="submit"
                      variant="primary"
                      disabled={!example.trim()}
                      loading={busy}
                    >
                      {t.passportExampleAddSave}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        setAdding(false);
                        setExample('');
                      }}
                    >
                      {t.passportExampleCancel}
                    </Button>
                  </div>
                </form>
              ) : null}

              <ul className="mt-[12px] flex flex-col gap-[8px]">
                {(voice.examples ?? []).map((one, index) => (
                  <li
                    key={`${index}-${one.text.slice(0, 24)}`}
                    className="flex items-start justify-between gap-[12px] rounded-[8px] border border-cf-border bg-cf-surface-subtle p-[12px]"
                  >
                    <p className="min-w-0 cf-body-sm text-cf-ink [overflow-wrap:anywhere] [text-wrap:pretty]">
                      {one.text}
                    </p>
                    {onRemoveExample ? (
                      <Button
                        type="button"
                        variant="quiet"
                        disabled={busy}
                        aria-label={`${t.passportExampleRemove}: ${one.text.slice(0, 40)}`}
                        onClick={() => onRemoveExample(index)}
                      >
                        {t.passportExampleRemove}
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
