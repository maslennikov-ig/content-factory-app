'use client';

import { useState } from 'react';
import clsx from 'clsx';
import { Button } from '@contentfactory/react/form/button';
import { CheckboxField } from '@contentfactory/react/form/checkbox.field';
import { Input } from '@contentfactory/react/form/input';
import { Textarea } from '@contentfactory/react/form/textarea';
import { voiceCopy, type VoiceLocale } from './voice-copy';

/**
 * The proposal: five fields on the left, the reason for each on the right.
 *
 * Fields are accepted one at a time. That is the whole shape of the screen and
 * the reason for it: a person disagreeing with one sentence should not have to
 * reject the other four, and editing one must not restart an analysis that
 * cost real calls.
 *
 * A field with nothing behind it is shown empty and says so. The design draws
 * that case — "В образцах нет запретных формулировок — предлагать нечего" —
 * and the alternative is a model filling the gap with something that reads
 * well and is not true of this writer.
 *
 * Activation is a separate confirmed action, not the last field's save. What
 * it changes is stated in the sentence beside the checkbox rather than implied:
 * new text is written this way, existing posts do not move.
 *
 * The same screen serves the path where a person fills the five lines
 * themselves. `mode` comes from the server rather than from whichever card was
 * clicked, and it changes two things: every line is writable, and the column of
 * observations goes away — hand-written text rests on the person who wrote it,
 * and an empty "почему предложено именно это" beside it would be a question
 * nobody asked. Everything else — the consent sentence, the gate on activation,
 * the states — is the same, because it is the same decision being made.
 */

export type ProposalFieldKey =
  | 'WHO_SPEAKS'
  | 'TONE'
  | 'AUDIENCE'
  | 'SENTENCE_LENGTH'
  | 'NEVER_SAY';

export type FieldStatus = 'ACCEPTED' | 'EDITING' | 'UNDECIDED';

export type ProposalMode = 'assist' | 'manual';

export type ProposalField = Readonly<{
  key: ProposalFieldKey;
  text: string;
  status: FieldStatus;
  /** `smp-02#1`. Empty means the corpus offered no grounds for this field. */
  observationRefs: readonly string[];
}>;

/**
 * The portrait: one text, decided the way a field is decided.
 *
 * No `key` — there is exactly one, and naming it would be a field that can
 * hold only one value.
 */
export type ProposalPortrait = Readonly<{
  text: string;
  status: FieldStatus;
  observationRefs: readonly string[];
}>;

export type ProposalObservation = Readonly<{
  ref: string;
  index: number;
  field: ProposalFieldKey;
  claim: string;
  quote: string;
  sampleCode: string;
  /** The scale it explains, where it explains one. */
  metric?: string;
}>;

export type VoiceProposalState =
  | 'default'
  | 'loading'
  | 'empty'
  | 'selected'
  | 'success'
  | 'error'
  | 'restricted'
  | 'disabled'
  | 'long-content';

const FIELD_ORDER: readonly ProposalFieldKey[] = [
  'WHO_SPEAKS',
  'TONE',
  'AUDIENCE',
  'SENTENCE_LENGTH',
  'NEVER_SAY',
];

const fieldLabel = (
  key: ProposalFieldKey,
  t: (typeof voiceCopy)['ru'] | (typeof voiceCopy)['en']
) =>
  ({
    WHO_SPEAKS: t.fieldWhoSpeaks,
    TONE: t.fieldTone,
    AUDIENCE: t.fieldAudience,
    SENTENCE_LENGTH: t.fieldSentenceLength,
    NEVER_SAY: t.fieldNeverSay,
  }[key]);

export function VoiceProposalScreen({
  locale,
  state = 'default',
  mode = 'assist',
  portrait,
  fields,
  observations,
  profileLabel,
  avatarName = '',
  consentGiven = false,
  activatedAt,
  onAccept,
  onEdit,
  onSaveField,
  onAcceptPortrait,
  onEditPortrait,
  onSavePortrait,
  onConsentChange,
  onAvatarNameChange,
  onActivate,
  onSaveDraft,
  notice,
}: {
  locale: VoiceLocale;
  state?: VoiceProposalState;
  /** Whose five lines these are. `manual` makes every one of them writable. */
  mode?: ProposalMode;
  /**
   * Who this person is, in prose. Absent where the analysis predates portraits
   * or where the model could not ground one — and absence is shown as absence,
   * not as an empty box that reads like a portrait waiting to be typed.
   */
  portrait?: ProposalPortrait;
  fields: readonly ProposalField[];
  observations: readonly ProposalObservation[];
  profileLabel?: string;
  /**
   * What this avatar will be called.
   *
   * Asked here because this is where it starts writing. Nobody was asked
   * before, so a hand-filled avatar landed in the list as «Без имени» and the
   * list told its owner «тексты пишет Без имени»
   * (`content-factory-next-fn33.46`).
   */
  avatarName?: string;
  consentGiven?: boolean;
  activatedAt?: string;
  onAccept?: (key: ProposalFieldKey) => void;
  onEdit?: (key: ProposalFieldKey) => void;
  onSaveField?: (key: ProposalFieldKey, text: string) => void;
  onAcceptPortrait?: () => void;
  onEditPortrait?: () => void;
  onSavePortrait?: (text: string) => void;
  onConsentChange?: (checked: boolean) => void;
  onAvatarNameChange?: (value: string) => void;
  onActivate?: () => void;
  onSaveDraft?: () => void;
  notice?: string;
}) {
  const t = voiceCopy[locale];
  const busy = state === 'loading';
  const readOnly = state === 'restricted';
  const manual = mode === 'manual';
  const named = avatarName.trim().length > 0;
  const accepted = fields.filter((one) => one.status === 'ACCEPTED').length;
  const allAccepted = fields.length > 0 && accepted === fields.length;

  /**
   * What is in the box right now, before it has been saved.
   *
   * Local, and deliberately not a prop: an unsaved keystroke is not something
   * the server knows or should be told, and the contract's registry says as
   * much by listing no field for it. What survives a reload is what was saved,
   * which is the honest promise — the button below says which of the two a
   * person is looking at.
   */
  const [drafts, setDrafts] = useState<Partial<Record<ProposalFieldKey, string>>>(
    {}
  );
  const written = (field: ProposalField) => drafts[field.key] ?? field.text;
  /** The portrait's unsaved keystrokes, kept apart from the five short ones. */
  const [portraitDraft, setPortraitDraft] = useState<string | null>(null);
  /** One status word for both the portrait and the five lines. */
  const statusWord = (status: FieldStatus) =>
    status === 'ACCEPTED'
      ? t.stateAccepted
      : status === 'EDITING'
      ? t.stateEditing
      : t.stateUndecided;

  return (
    <section
      data-voice-surface="proposal"
      data-voice-state={state}
      data-voice-mode={mode}
      aria-busy={busy ? 'true' : undefined}
      className="flex min-w-0 flex-col gap-[16px] [&_button]:min-h-[44px] sm:[&_button]:min-h-0"
    >
      <header>
        <h2 className="cf-heading-md text-cf-ink [text-wrap:balance]">
          {manual ? t.manualProposalTitle : t.proposalTitle}
        </h2>
        <p className="mt-[4px] cf-caption text-cf-ink-muted">
          {[
            profileLabel,
            manual
              ? t.manualProposalSubtitle(accepted, fields.length)
              : t.proposalSubtitle(accepted, fields.length),
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {manual ? (
          <p className="mt-[8px] max-w-[72ch] cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
            {t.manualProposalLead}
          </p>
        ) : null}
      </header>

      {state === 'error' ? (
        <p
          role="alert"
          className="rounded-[8px] border border-cf-danger bg-cf-danger-soft p-[12px] cf-body-sm text-cf-ink [text-wrap:pretty]"
        >
          {notice ??
            (locale === 'ru'
              ? 'Правка не ушла на сервер. Текст остался в поле; активация недоступна, пока поле не сохранено.'
              : 'The edit did not reach the server. Your text is still here; activation waits until it saves.')}
        </p>
      ) : null}

      {state === 'success' && activatedAt ? (
        <p
          role="status"
          className="rounded-[8px] border border-cf-accent bg-cf-accent-soft p-[12px] cf-body-sm text-cf-ink"
        >
          {t.activatedAt(activatedAt)}
        </p>
      ) : null}

      <div
        className={clsx(
          'grid min-w-0 gap-[20px]',
          manual ? 'lg:grid-cols-1' : 'lg:grid-cols-2'
        )}
      >
        <div className="flex min-w-0 flex-col gap-[12px]">
          {/*
            The portrait sits above the five lines because that is the order it
            is read in and the order the generator reads it in: who this person
            is, and only then the habits observed about them. Measured on
            2026-08-25, the five lines alone moved generation no closer to the
            author than no voice at all — they describe a manner, and a manner
            is not a person.
          */}
          {portrait ? (
            <article
              data-voice-portrait="true"
              data-voice-portrait-status={portrait.status}
              className={clsx(
                'min-w-0 rounded-[8px] border bg-cf-surface p-[12px]',
                portrait.status === 'ACCEPTED'
                  ? 'border-cf-accent'
                  : 'border-cf-border'
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-[8px]">
                <div className="flex flex-wrap items-center gap-[8px]">
                  <span className="cf-label-md text-cf-ink">
                    {t.portraitTitle}
                  </span>
                  {portrait.observationRefs.length ? (
                    <span className="cf-caption text-cf-ink-muted">
                      {portrait.observationRefs.join(' · ')}
                    </span>
                  ) : null}
                </div>
                <span
                  className={clsx(
                    'cf-label-sm uppercase',
                    portrait.status === 'ACCEPTED'
                      ? 'text-cf-accent'
                      : 'text-cf-ink-muted'
                  )}
                >
                  {statusWord(portrait.status)}
                </span>
              </div>

              <p className="mt-[4px] cf-caption text-cf-ink-muted [text-wrap:pretty]">
                {t.portraitHint}
              </p>

              {!readOnly && portrait.status === 'EDITING' ? (
                <div className="mt-[8px]">
                  <Textarea
                    standalone
                    layout="content"
                    name="voice-portrait"
                    aria-label={t.portraitTitle}
                    value={portraitDraft ?? portrait.text}
                    rows={7}
                    onChange={(event) => setPortraitDraft(event.target.value)}
                    className="w-full"
                  />
                </div>
              ) : (
                <p className="mt-[8px] cf-body-sm text-cf-ink [text-wrap:pretty]">
                  {portrait.text}
                </p>
              )}

              {readOnly ? null : (
                <div className="mt-[12px] flex flex-wrap gap-[8px]">
                  {portrait.status === 'EDITING' ? (
                    <Button
                      type="button"
                      variant="primary"
                      disabled={!(portraitDraft ?? portrait.text).trim()}
                      onClick={() =>
                        onSavePortrait?.(portraitDraft ?? portrait.text)
                      }
                    >
                      {t.saveField}
                    </Button>
                  ) : (
                    <>
                      {portrait.status !== 'ACCEPTED' ? (
                        <Button
                          type="button"
                          variant="primary"
                          onClick={onAcceptPortrait}
                        >
                          {t.accept}
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={onEditPortrait}
                      >
                        {t.edit}
                      </Button>
                    </>
                  )}
                </div>
              )}
            </article>
          ) : null}

          <h3 className="cf-label-sm uppercase text-cf-ink-muted">
            {manual ? t.manualProposalFields : t.proposalFields} ·{' '}
            {FIELD_ORDER.length}
          </h3>

          {FIELD_ORDER.map((key) => {
            /**
             * Five lines, always, because five is what a voice is.
             *
             * Observations are tied to counted metrics, and nothing counts
             * «кто говорит» or «к кому обращаемся» — so the model can never
             * propose those, however good the corpus is. Hiding the lines it
             * did not propose let a voice be activated with «Кто говорит»
             * empty and the audience a placeholder, with nothing on screen
             * saying so (`content-factory-next-vme.21.11`). Absent is shown
             * as an empty line to write, which is what the path promised:
             * «Вы соглашаетесь или правите».
             */
            const proposed = fields.find((one) => one.key === key);
            const field: ProposalField = proposed ?? {
              key,
              text: '',
              status: 'UNDECIDED',
              observationRefs: [],
            };
            const grounded = field.observationRefs.length > 0;
            // Writable on the hand-filled path always, on the model's path
            // once the person asked to change a line, and always for a line
            // the model never proposed — there is nothing there to accept.
            const writable =
              !readOnly && (manual || !proposed || field.status === 'EDITING');
            return (
              <article
                key={key}
                data-voice-field={key}
                data-voice-field-status={field.status}
                className={clsx(
                  'min-w-0 rounded-[8px] border bg-cf-surface p-[12px]',
                  field.status === 'ACCEPTED'
                    ? 'border-cf-accent'
                    : 'border-cf-border'
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-[8px]">
                  <div className="flex flex-wrap items-center gap-[8px]">
                    <span className="cf-label-md text-cf-ink">
                      {fieldLabel(key, t)}
                    </span>
                    {grounded ? (
                      <span className="cf-caption text-cf-ink-muted">
                        {field.observationRefs.join(' · ')}
                      </span>
                    ) : null}
                  </div>
                  <span
                    className={clsx(
                      'cf-label-sm uppercase',
                      field.status === 'ACCEPTED'
                        ? 'text-cf-accent'
                        : 'text-cf-ink-muted'
                    )}
                  >
                    {statusWord(field.status)}
                  </span>
                </div>

                {writable ? (
                  <div className="mt-[8px]">
                    <Textarea
                      standalone
                      layout="content"
                      name={`voice-field-${key}`}
                      aria-label={fieldLabel(key, t)}
                      placeholder={
                        manual ? t.manualPlaceholders[key] : undefined
                      }
                      value={written(field)}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [key]: event.target.value,
                        }))
                      }
                      className="w-full"
                    />
                  </div>
                ) : grounded ? (
                  <p className="mt-[8px] cf-body-sm text-cf-ink [text-wrap:pretty]">
                    {field.text}
                  </p>
                ) : (
                  <div className="mt-[8px]" data-voice-field-empty="true">
                    <p className="cf-label-sm uppercase text-cf-ink-muted">
                      {t.proposalNoGround}
                    </p>
                    <p className="mt-[4px] cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
                      {t.proposalNoGroundBody}
                    </p>
                  </div>
                )}

                {readOnly ? null : (
                  <div className="mt-[12px] flex flex-wrap gap-[8px]">
                    {writable ? (
                      <Button
                        type="button"
                        variant="primary"
                        // An empty line is not a decision: on the hand-filled
                        // path it is the work still to do, and saving nothing
                        // would report it as done.
                        disabled={!written(field).trim()}
                        onClick={() => onSaveField?.(key, written(field))}
                      >
                        {t.saveField}
                      </Button>
                    ) : (
                      <>
                        {field.status !== 'ACCEPTED' ? (
                          <Button
                            type="button"
                            variant="primary"
                            onClick={() => onAccept?.(key)}
                          >
                            {t.accept}
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => onEdit?.(key)}
                        >
                          {t.edit}
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </article>
            );
          })}

          <p className="cf-caption text-cf-ink-muted [text-wrap:pretty]">
            {manual ? t.manualProposalNote : t.editNote}
          </p>
        </div>

        {manual ? null : (
        <div className="flex min-w-0 flex-col gap-[12px]">
          <h3 className="cf-label-sm uppercase text-cf-ink-muted">
            {t.proposalWhy}
          </h3>

          {observations.length === 0 ? (
            <p className="rounded-[8px] border border-cf-border bg-cf-surface p-[12px] cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
              {t.proposalNoGroundBody}
            </p>
          ) : (
            observations.map((observation) => (
              <article
                key={observation.ref}
                data-voice-observation={observation.ref}
                className="min-w-0 rounded-[8px] border border-cf-border bg-cf-surface p-[12px]"
              >
                <p className="cf-label-sm uppercase text-cf-ink-muted">
                  {t.proposalObservation} {observation.index} ·{' '}
                  {fieldLabel(observation.field, t)}
                </p>
                <p className="mt-[8px] cf-body-sm text-cf-ink [text-wrap:pretty]">
                  {observation.claim}
                </p>
                {/* The quote is the point. Without it the claim is an opinion,
                    and the design's standard is a number and a sentence, not an
                    adjective. */}
                <p className="mt-[8px] cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
                  «{observation.quote}»
                  <span className="ms-[8px] cf-caption">
                    {observation.sampleCode}
                  </span>
                </p>
              </article>
            ))
          )}

          <p className="cf-caption text-cf-ink-muted [text-wrap:pretty]">
            {t.proposalObservationOpens}
          </p>
        </div>
        )}
      </div>

      {readOnly ? null : (
        <div className="flex min-w-0 flex-col gap-[12px] rounded-[8px] border border-cf-border bg-cf-surface p-[16px]">
          <div className="flex min-w-0 flex-col gap-[4px]">
            <Input
              disableForm
              label={t.avatarNameLabel}
              name="voice-avatar-name"
              value={avatarName}
              disabled={state === 'disabled'}
              onChange={(event) => onAvatarNameChange?.(event.target.value)}
            />
            <p className="max-w-[72ch] cf-caption text-cf-ink-muted [text-wrap:pretty]">
              {named ? t.avatarNameHint : t.avatarNameRequired}
            </p>
          </div>
          <CheckboxField
            checked={consentGiven}
            disabled={state === 'disabled'}
            onChange={(event) => onConsentChange?.(event.target.checked)}
            label={
              <span className="cf-body-sm text-cf-ink [text-wrap:pretty]">
                {t.activationConsent}
              </span>
            }
          />
          <div className="flex flex-wrap gap-[8px]">
            <Button
              type="button"
              variant="primary"
              // Activation waits on two things: every field decided, and the
              // sentence above read. Neither is implied by saving a field.
              disabled={
                !consentGiven || !allAccepted || !named || state === 'disabled'
              }
              onClick={onActivate}
            >
              {t.activate}
            </Button>
            <Button type="button" variant="secondary" onClick={onSaveDraft}>
              {t.saveDraft}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
