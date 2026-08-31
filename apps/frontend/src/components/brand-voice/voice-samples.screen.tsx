'use client';

import clsx from 'clsx';
import { Button } from '@contentfactory/react/form/button';
import { CheckboxField } from '@contentfactory/react/form/checkbox.field';
import { FileInput } from '@contentfactory/react/form/file-input';
import { Input } from '@contentfactory/react/form/input';
import {
  type VoiceCopy,
  LOW_CONFIDENCE_CHARS,
  LOW_CONFIDENCE_SAMPLES,
  MIN_CORPUS_CHARS,
  confidenceReasonsFor,
  requiredSamples,
  formatBytes,
  formatChars,
  voiceCopy,
  type VoiceLocale,
} from './voice-copy';

/**
 * Collecting the corpus, and being honest about how far off it is.
 *
 * The number is the screen. `display-num` exists for exactly this: a figure a
 * person reads as an instrument reading, recomputed as they paste, which must
 * not shift the line every time it changes.
 *
 * The shortfall states its reason rather than only its size. "Добавьте ещё
 * 8 600 знаков" alone reads as an arbitrary gate; the sentence after it — "на
 * меньшем объёме разбор находит случайные привычки вместо устойчивых" — is why
 * the gate exists, and it is the difference between a rule and a wall.
 *
 * Two floors, not one. Volume alone lets four long documents through, and
 * short-form writing needs count as well; the second shortfall line says so.
 */

export type SampleOriginLabel =
  | 'OWN_POST'
  | 'TELEGRAM_EXPORT'
  | 'PASTE'
  | 'FILE'
  | 'SOURCE_SNAPSHOT';

export type SampleRow = Readonly<{
  code: string;
  title: string;
  origin: SampleOriginLabel;
  charCount: number;
  date: string;
  /** Set when something was taken out on the way in. Never the value itself. */
  redacted?: boolean;
}>;

export type SampleSource = Readonly<{
  key: SampleOriginLabel;
  available: boolean;
  /** Shown instead of the hint when the path is closed. */
  unavailableReason?: string;
}>;

/**
 * What the browser is holding before anything has been sent.
 *
 * Two phases and no percentage. A byte counter would reach a hundred and stop
 * there: the answer to this request only arrives once every file has been
 * parsed, so the honest states are «выбрано» — the files are named and their
 * weights are visible, and nothing has left the machine — and «отправляем»,
 * which covers the sending and the reading because from here the two are one
 * wait.
 */
export type VoiceUploadState = Readonly<{
  phase: 'idle' | 'chosen' | 'sending';
  files: readonly { name: string; size: number }[];
  /** Refused here, before sending, with the file named. */
  refused?: readonly { name: string; note: string }[];
  /**
   * Set on the path that takes somebody else's writing.
   *
   * The same two promises the pasted path makes — a confirmed right and the
   * date the raw text is erased — asked in the same card the files were picked
   * in. The server refuses without them either way; asking here is what makes
   * that refusal impossible to walk into.
   */
  rights?: Readonly<{ confirmed: boolean; retentionUntil: string }>;
}>;

export type VoiceSamplesState =
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
 * What the picker offers, in the order the card names them.
 *
 * A filter rather than a rule: a person can always override it in the dialog,
 * and `file-intake.ts` refuses by extension on the server regardless. It is
 * here so the four formats that work are the four the dialog shows first.
 */
const FILE_ACCEPT = '.txt,.md,.markdown,.docx,.pdf';

const ORIGIN_KEYS = [
  'OWN_POST',
  'TELEGRAM_EXPORT',
  'PASTE',
  'FILE',
  'SOURCE_SNAPSHOT',
] as const satisfies readonly SampleOriginLabel[];

const originLabel = (
  origin: SampleOriginLabel,
  t: VoiceCopy
): string =>
  ({
    OWN_POST: t.originOwnPost,
    TELEGRAM_EXPORT: t.originTelegram,
    PASTE: t.originPaste,
    FILE: t.originFile,
    SOURCE_SNAPSHOT: t.originSource,
  }[origin]);

const sourceTitle = (
  origin: SampleOriginLabel,
  t: VoiceCopy
): { title: string; hint: string; action: string } =>
  ({
    OWN_POST: {
      title: t.sourceOwnPosts,
      hint: t.sourceOwnPostsHint,
      action: t.choose,
    },
    TELEGRAM_EXPORT: {
      title: t.sourceTelegram,
      hint: t.sourceTelegramHint,
      action: t.upload,
    },
    PASTE: { title: t.sourcePaste, hint: t.sourcePasteHint, action: t.paste },
    FILE: { title: t.sourceFile, hint: t.sourceFileHint, action: t.choose },
    SOURCE_SNAPSHOT: {
      title: t.sourceUrl,
      hint: t.sourceUrlHint,
      action: t.setAddress,
    },
  }[origin]);

export function VoiceSamplesScreen({
  locale,
  state = 'default',
  samples,
  sources,
  selectedCodes = [],
  upload,
  onAdd,
  onPickFiles,
  onSendFiles,
  onClearFiles,
  onRightsChange,
  onRetentionChange,
  onToggle,
  onDeleteSelected,
  onNext,
  notice,
}: {
  locale: VoiceLocale;
  state?: VoiceSamplesState;
  samples: readonly SampleRow[];
  sources: readonly SampleSource[];
  selectedCodes?: readonly string[];
  /** The files picked in this browser, before the server has seen them. */
  upload?: VoiceUploadState;
  onAdd?: (origin: SampleOriginLabel) => void;
  onPickFiles?: (files: readonly File[]) => void;
  onSendFiles?: () => void;
  onClearFiles?: () => void;
  onRightsChange?: (confirmed: boolean) => void;
  onRetentionChange?: (date: string) => void;
  onToggle?: (code: string, checked: boolean) => void;
  onDeleteSelected?: () => void;
  onNext?: () => void;
  notice?: string;
}) {
  const t = voiceCopy[locale];
  const busy = state === 'loading';
  const picked = upload?.files ?? [];
  const sending = upload?.phase === 'sending';
  const charCount = samples.reduce((sum, one) => sum + one.charCount, 0);
  const missingChars = Math.max(0, MIN_CORPUS_CHARS - charCount);
  // Eight long articles and eight short posts are not the same corpus, and
  // this screen used to ask the same eight of both.
  const missingSamples = Math.max(
    0,
    requiredSamples(charCount, samples.length) - samples.length
  );
  const ready = missingChars === 0 && missingSamples === 0;
  /**
   * Enough to compute is not the same as enough to trust, and the label alone
   * never said which half was thin — whether to write more posts or longer
   * ones, which are different pieces of advice.
   */
  const confidenceReasons = confidenceReasonsFor(charCount, samples.length);
  const selected = new Set(selectedCodes);

  return (
    <section
      data-voice-surface="samples"
      data-voice-state={state}
      data-voice-ready={ready ? 'true' : 'false'}
      aria-busy={busy ? 'true' : undefined}
      className="flex min-w-0 flex-col gap-[20px] [&_button]:min-h-[44px] sm:[&_button]:min-h-0"
    >
      <header>
        <h2 className="cf-heading-md text-cf-ink [text-wrap:balance]">
          {t.samplesTitle}
        </h2>
        <p className="mt-[4px] cf-caption text-cf-ink-muted">
          {t.samplesSubtitle}
        </p>
      </header>

      {state === 'error' ? (
        <p
          role="alert"
          className="rounded-[8px] border border-cf-danger bg-cf-danger-soft p-[12px] cf-body-sm text-cf-ink"
        >
          {notice ??
            (locale === 'ru'
              ? 'Формат не распознан. Остальные файлы загрузились.'
              : 'That format was not recognised. The other files loaded.')}
        </p>
      ) : null}

      {state === 'success' ? (
        <p
          role="status"
          className="rounded-[8px] border border-cf-accent bg-cf-accent-soft p-[12px] cf-body-sm text-cf-ink"
        >
          {notice ??
            (locale === 'ru' ? 'Норма набрана.' : 'The floor is reached.')}
        </p>
      ) : null}

      <div className="grid min-w-0 gap-[20px] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="flex flex-col gap-[12px]">
          <h3 className="cf-label-sm uppercase text-cf-ink-muted">
            {t.samplesWhere}
          </h3>
          {ORIGIN_KEYS.map((key) => {
            const source =
              sources.find((one) => one.key === key) ??
              ({ key, available: true } as SampleSource);
            const meta = sourceTitle(key, t);
            // The card that promised a file is the card that takes one. Its
            // button used to open the paste box, which was the only thing
            // behind it: the three parsers existed and no route accepted a
            // file for any origin at all.
            const isFileCard = key === 'FILE';
            const disabled = !source.available || state === 'restricted';
            return (
              <div
                key={key}
                data-voice-source={key}
                aria-disabled={source.available ? undefined : 'true'}
                className={clsx(
                  'rounded-[8px] border border-cf-border bg-cf-surface p-[12px]',
                  !source.available && 'opacity-60'
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-[8px]">
                  <div className="min-w-0">
                    <p className="cf-body-sm text-cf-ink">{meta.title}</p>
                    <p className="mt-[4px] cf-caption text-cf-ink-muted [text-wrap:pretty]">
                      {source.available
                        ? meta.hint
                        : source.unavailableReason ?? meta.hint}
                    </p>
                  </div>
                  {isFileCard ? (
                    <FileInput
                      name="voice-sample-files"
                      label={meta.action}
                      accept={FILE_ACCEPT}
                      multiple
                      disabled={disabled || sending}
                      onFiles={(files) => onPickFiles?.(files)}
                    />
                  ) : (
                    <Button
                      type="button"
                      disabled={disabled || sending}
                      onClick={() => onAdd?.(key)}
                      variant="secondary"
                    >
                      {meta.action}
                    </Button>
                  )}
                </div>

                {isFileCard ? (
                  <div data-voice-upload={upload?.phase ?? 'idle'}>
                    {picked.length ? (
                      <ul className="mt-[12px] flex flex-col gap-[4px]">
                        {picked.map((file) => (
                          <li
                            key={file.name}
                            data-voice-upload-file={file.name}
                            className="flex flex-wrap items-baseline justify-between gap-[8px]"
                          >
                            <span className="cf-body-sm text-cf-ink [overflow-wrap:anywhere]">
                              {file.name}
                            </span>
                            <span className="cf-label-sm text-cf-ink-muted">
                              {formatBytes(file.size, locale)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    {upload?.refused?.length ? (
                      <ul
                        className="mt-[8px] flex flex-col gap-[4px]"
                        data-voice-upload-refused="true"
                      >
                        {upload.refused.map((file) => (
                          <li
                            key={file.name}
                            className="cf-body-sm text-cf-ink [text-wrap:pretty]"
                          >
                            «{file.name}» — {file.note}
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    {picked.length && upload?.rights ? (
                      <div className="mt-[12px] flex flex-col gap-[12px]">
                        <CheckboxField
                          checked={upload.rights.confirmed}
                          disabled={sending}
                          onChange={(event) =>
                            onRightsChange?.(event.target.checked)
                          }
                          label={
                            <span className="cf-body-sm text-cf-ink [text-wrap:pretty]">
                              {t.uploadRights}
                            </span>
                          }
                        />
                        <Input
                          standalone
                          removeError
                          type="date"
                          name="voice-upload-retention"
                          label={t.uploadRetention}
                          value={upload.rights.retentionUntil}
                          disabled={sending}
                          onChange={(event) =>
                            onRetentionChange?.(event.target.value)
                          }
                        />
                      </div>
                    ) : null}

                    {picked.length ? (
                      <div className="mt-[12px] flex flex-wrap items-center gap-[8px]">
                        <Button
                          type="button"
                          variant="primary"
                          disabled={
                            disabled ||
                            sending ||
                            (!!upload?.rights &&
                              (!upload.rights.confirmed ||
                                !upload.rights.retentionUntil))
                          }
                          onClick={onSendFiles}
                        >
                          {sending
                            ? t.uploadSending(picked.length)
                            : t.uploadSend(picked.length)}
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={sending}
                          onClick={onClearFiles}
                        >
                          {t.uploadClear}
                        </Button>
                      </div>
                    ) : null}

                    {sending ? (
                      <p
                        role="status"
                        className="mt-[8px] cf-caption text-cf-ink-muted [text-wrap:pretty]"
                      >
                        {t.uploadReading}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
          <p className="cf-caption text-cf-ink-muted [text-wrap:pretty]">
            {t.samplesNote}
          </p>
        </div>

        <div className="flex min-w-0 flex-col gap-[16px]">
          <div className="min-w-0 rounded-[8px] border border-cf-border bg-cf-surface p-[16px]">
            <p className="cf-label-sm uppercase text-cf-ink-muted">
              {t.collected}
            </p>
            <p
              className="mt-[4px] cf-display-num text-cf-ink"
              data-voice-collected="true"
            >
              {formatChars(charCount, locale)}
            </p>
            <p className="mt-[4px] cf-caption text-cf-ink-muted">
              {t.ofMinimum} · {t.minimumNeeded}{' '}
              {formatChars(MIN_CORPUS_CHARS, locale)}
            </p>

            {ready ? (
              <div
                className="mt-[16px] flex flex-col gap-[4px]"
                data-voice-confidence={
                  confidenceReasons.length === 0 ? 'NORMAL' : 'LOW'
                }
              >
                <p className="cf-label-sm uppercase text-cf-ink-muted">
                  {t.confidenceLabel}
                </p>
                {confidenceReasons.length === 0 ? (
                  <p className="cf-caption text-cf-ink-muted [text-wrap:pretty]">
                    {t.confidenceFirm}
                  </p>
                ) : null}
                {confidenceReasons.includes('FEW_CHARS') ? (
                  <p className="cf-caption text-cf-ink-muted [text-wrap:pretty]">
                    {t.confidenceFewChars(
                      formatChars(LOW_CONFIDENCE_CHARS - charCount, locale)
                    )}
                  </p>
                ) : null}
                {confidenceReasons.includes('FEW_SAMPLES') ? (
                  <p className="cf-caption text-cf-ink-muted [text-wrap:pretty]">
                    {t.confidenceFewSamples(
                      LOW_CONFIDENCE_SAMPLES - samples.length
                    )}
                  </p>
                ) : null}
              </div>
            ) : (
              <div
                className="mt-[16px] rounded-[8px] border border-cf-warning bg-cf-warning-soft p-[12px]"
                data-voice-shortfall="true"
              >
                <p className="cf-label-sm uppercase text-cf-ink">
                  {t.shortfall}
                </p>
                {missingChars > 0 ? (
                  <p className="mt-[8px] cf-body-sm text-cf-ink [text-wrap:pretty]">
                    {t.shortfallBody(formatChars(missingChars, locale))}
                  </p>
                ) : null}
                {missingSamples > 0 ? (
                  <p className="mt-[8px] cf-body-sm text-cf-ink [text-wrap:pretty]">
                    {t.shortfallSamples(missingSamples)}
                  </p>
                ) : null}
              </div>
            )}
          </div>

          <div className="min-w-0 rounded-[8px] border border-cf-border bg-cf-surface p-[16px]">
            <div className="flex flex-wrap items-center justify-between gap-[8px]">
              <h3 className="cf-label-sm uppercase text-cf-ink-muted">
                {t.collectedSamples} · {samples.length}
              </h3>
              <Button
                type="button"
                disabled={selected.size === 0 || state === 'restricted'}
                onClick={onDeleteSelected}
                variant="secondary"
              >
                {t.deleteSelected}
              </Button>
            </div>

            {samples.length === 0 ? (
              <div className="mt-[16px]" data-voice-empty-corpus="true">
                <p className="cf-display-num text-cf-ink-muted">
                  0 / {formatChars(MIN_CORPUS_CHARS, locale)}
                </p>
                <p className="mt-[8px] cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
                  {t.emptyCorpusBody}
                </p>
              </div>
            ) : (
              <div className="mt-[12px] min-w-0 overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-cf-border text-start">
                      <th className="pb-[8px] pe-[8px] text-start cf-label-sm uppercase text-cf-ink-muted">
                        {t.columnCode}
                      </th>
                      <th className="pb-[8px] pe-[8px] text-start cf-label-sm uppercase text-cf-ink-muted">
                        {t.columnWhat}
                      </th>
                      <th className="pb-[8px] pe-[8px] text-start cf-label-sm uppercase text-cf-ink-muted">
                        {t.columnFrom}
                      </th>
                      <th className="pb-[8px] pe-[8px] text-end cf-label-sm uppercase text-cf-ink-muted">
                        {t.columnChars}
                      </th>
                      <th className="pb-[8px] text-end cf-label-sm uppercase text-cf-ink-muted">
                        {t.columnDate}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {samples.map((sample) => (
                      <tr
                        key={sample.code}
                        data-voice-sample={sample.code}
                        data-voice-selected={
                          selected.has(sample.code) ? 'true' : undefined
                        }
                        className={clsx(
                          'border-b border-cf-border',
                          selected.has(sample.code) && 'bg-cf-accent-soft'
                        )}
                      >
                        <td className="py-[8px] pe-[8px] align-top">
                          <CheckboxField
                            checked={selected.has(sample.code)}
                            onChange={(event) =>
                              onToggle?.(sample.code, event.target.checked)
                            }
                            label={
                              <span className="whitespace-nowrap cf-label-sm text-cf-ink">
                                {sample.code}
                              </span>
                            }
                          />
                        </td>
                        <td className="py-[8px] pe-[8px] align-top">
                          <span className="cf-body-sm text-cf-ink [overflow-wrap:anywhere]">
                            {sample.title}
                          </span>
                          {sample.redacted ? (
                            <span className="ms-[8px] cf-caption text-cf-ink-muted">
                              {t.secretRemoved}
                            </span>
                          ) : null}
                        </td>
                        <td className="py-[8px] pe-[8px] align-top cf-caption text-cf-ink-muted">
                          {originLabel(sample.origin, t)}
                        </td>
                        <td className="py-[8px] pe-[8px] text-end align-top cf-label-sm text-cf-ink">
                          {formatChars(sample.charCount, locale)}
                        </td>
                        <td className="py-[8px] text-end align-top cf-caption text-cf-ink-muted">
                          {sample.date}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-[8px]">
            <Button
              type="button"
              disabled={!ready || state === 'restricted'}
              onClick={onNext}
              variant="primary"
            >
              {t.nextAnalysis}
            </Button>
            {ready ? null : (
              <span className="cf-caption text-cf-ink-muted">{t.opensAt}</span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
