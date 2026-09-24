'use client';

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Button } from '@contentfactory/react/form/button';
import { Textarea } from '@contentfactory/react/form/textarea';
import { Hint } from '@contentfactory/react/layout/hint';
import type { PieceCoreRevisionV1 } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';
import { Disclosure } from '../../ui/disclosure';
import { FieldLabel } from '../../ui/field-label';
import { useAutosave } from '../../ui/use-autosave';
import { intakeCopy } from '../intake/intake.copy';
import { piecesCopy, type PiecesLocale } from './pieces.copy';

/**
 * The piece is editable after it was written (`content-factory-next-97dq.75`,
 * thirteenth walk, «overall»: «возможность редактировать заготовку, чтобы
 * туда можно было что-то добавить, дописать»).
 *
 * Two blocks on the «Суть» tab, and nothing in them regenerates by itself:
 *
 *  - `CoreTextEdit` — «Править суть» turns the core into a field in place;
 *    every pause saves it (`PUT …/core`) as the new core, and the replaced
 *    text stays in the piece's history on the server.
 *  - `AddMaterial` — «Дописать материал» appends words to the piece's
 *    material (`POST …/material`). The core waits: «Пересобрать суть» is the
 *    one explicit button that writes it again from everything.
 */

/** Pause after the last keystroke before the core saves itself. */
const CORE_AUTOSAVE_MS = 1_000;

export function CoreTextEdit({
  locale,
  text,
  editedByYou,
  disabled,
  onSave,
  onEditingChange,
  children,
}: {
  locale: PiecesLocale;
  /** The core as the server holds it. */
  text: string;
  editedByYou: boolean;
  disabled: boolean;
  /** Saves `next` in place of `expected`; `false` — not saved. */
  onSave: (next: string, expected: string) => Promise<boolean>;
  /**
   * The field is open (review of 97dq.81-85, P3-4): the tab keeps a restore
   * or a rebuild from moving the core under the draft, which would refuse
   * every autosave that follows.
   */
  onEditingChange?: (editing: boolean) => void;
  /** The read view, shown while the core is not being edited. */
  children: ReactNode;
}) {
  const t = piecesCopy[locale];
  const fieldId = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  /** The text the server holds now: what the next save replaces. */
  const saved = useRef(text);

  useEffect(() => {
    onEditingChange?.(editing);
  }, [editing, onEditingChange]);
  useEffect(() => () => onEditingChange?.(false), [onEditingChange]);

  // The core changed on the server (rebuild, answer): the field follows it
  // unless the author is typing.
  useEffect(() => {
    if (editing) return;
    saved.current = text;
    setDraft(text);
  }, [text, editing]);

  const save = useCallback(
    async (next: string): Promise<boolean> => {
      if (!next.trim() || next.trim() === saved.current.trim()) return true;
      const ok = await onSave(next, saved.current);
      if (ok) saved.current = next.trim();
      return ok;
    },
    [onSave]
  );
  const autosave = useAutosave<string>(save, { delay: CORE_AUTOSAVE_MS });

  const finish = async () => {
    const ok = await autosave.flush();
    if (ok) setEditing(false);
  };

  return (
    <div data-piece-core-edit={editing ? 'edit' : 'read'} className="flex min-w-0 flex-col gap-[8px]">
      {editing ? (
        <Textarea
          standalone
          id={fieldId}
          layout="content"
          name="piece-core-text"
          aria-label={t.coreEditLabel}
          className="w-full max-w-[72ch] cf-body-lg"
          value={draft}
          disabled={disabled}
          onChange={(event) => {
            setDraft(event.target.value);
            autosave.schedule(event.target.value);
          }}
          onBlur={() => void autosave.flush()}
        />
      ) : (
        children
      )}
      <div className="flex min-w-0 flex-wrap items-center gap-x-[12px] gap-y-[4px]">
        <span className="inline-flex items-center gap-[4px]">
          <Button
            type="button"
            variant={editing ? 'secondary' : 'quiet'}
            density="dense"
            disabled={disabled}
            data-piece-core-edit-toggle={editing ? 'done' : 'edit'}
            onClick={() => (editing ? void finish() : setEditing(true))}
          >
            {editing ? t.coreEditDone : t.coreEdit}
          </Button>
          <Hint label={intakeCopy[locale].profileHintFor(t.coreEdit)}>
            {t.coreEditHint}
          </Hint>
        </span>
        <span
          data-piece-core-saved={autosave.state}
          className="cf-caption tabular-nums text-cf-ink-muted"
        >
          {autosave.state === 'saving'
            ? t.settingsSaving
            : autosave.savedAt && autosave.state !== 'failed'
            ? t.settingsSaved(autosave.savedAt)
            : editedByYou
            ? t.coreEditedByYou
            : null}
        </span>
      </div>
      {autosave.state === 'failed' ? (
        <div className="flex min-w-0 flex-wrap items-center gap-[8px]">
          <p role="alert" className="cf-body-sm text-cf-danger">
            {t.coreEditFailed}
          </p>
          <Button
            type="button"
            variant="quiet"
            density="dense"
            onClick={() => void autosave.retry()}
          >
            {t.coreEditRetry}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function AddMaterial({
  locale,
  disabled,
  addedCount,
  pending,
  onAdd,
  onRebuild,
  onRebuildingChange,
}: {
  locale: PiecesLocale;
  disabled: boolean;
  /** How many times material was added. */
  addedCount: number;
  /** Material waits for «Пересобрать суть». */
  pending: boolean;
  onAdd: (text: string) => Promise<boolean>;
  /** Rebuilds the core; resolves to an error sentence, or `null` on success. */
  onRebuild: () => Promise<string | null>;
  /**
   * A rebuild is running (review of 97dq.81-85, P3-4): the tab turns the
   * versions and the hand edit off meanwhile — the server would refuse them.
   */
  onRebuildingChange?: (running: boolean) => void;
}) {
  const t = piecesCopy[locale];
  const fieldId = useId();
  const [text, setText] = useState('');
  const [adding, setAdding] = useState(false);
  const [addFailed, setAddFailed] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [rebuildError, setRebuildError] = useState<string | null>(null);

  const add = async () => {
    if (!text.trim()) return;
    setAdding(true);
    setAddFailed(false);
    const ok = await onAdd(text).catch(() => false);
    setAdding(false);
    if (ok) setText('');
    else setAddFailed(true);
  };

  const rebuild = async () => {
    setRebuilding(true);
    onRebuildingChange?.(true);
    setRebuildError(null);
    const error = await onRebuild().catch(() => t.coreRebuildFailed);
    setRebuilding(false);
    onRebuildingChange?.(false);
    setRebuildError(error);
  };

  return (
    <section
      data-piece-material="true"
      className="flex min-w-0 max-w-[72ch] flex-col gap-[8px]"
    >
      <FieldLabel
        htmlFor={fieldId}
        label={t.materialTitle}
        hint={t.materialHint}
        hintLabel={intakeCopy[locale].profileHintFor(t.materialTitle)}
      />
      <Textarea
        standalone
        id={fieldId}
        layout="content"
        name="piece-added-material"
        placeholder={t.materialPlaceholder}
        className="w-full"
        value={text}
        disabled={disabled || adding}
        onChange={(event) => {
          setText(event.target.value);
          setAddFailed(false);
        }}
      />
      <div className="flex min-w-0 flex-wrap items-center gap-[8px]">
        <Button
          type="button"
          variant="secondary"
          density="dense"
          loading={adding}
          loadingLabel={t.materialAdding}
          disabled={disabled || adding || !text.trim()}
          data-piece-material-add="true"
          onClick={() => void add()}
        >
          {t.materialAdd}
        </Button>
        {addedCount > 0 ? (
          <span className="cf-caption text-cf-ink-muted">
            {t.materialAddedCount(addedCount)}
          </span>
        ) : null}
      </div>
      {addFailed ? (
        <p role="alert" className="cf-body-sm text-cf-danger">
          {t.materialAddFailed}
        </p>
      ) : null}
      {pending ? (
        <div
          data-piece-material-pending="true"
          className="flex min-w-0 flex-wrap items-center gap-[8px]"
        >
          <p className="cf-body-sm text-cf-ink-muted">{t.materialPending}</p>
          <span className="inline-flex items-center gap-[4px]">
            <Button
              type="button"
              variant="primary"
              density="dense"
              loading={rebuilding}
              loadingLabel={t.coreRebuilding}
              disabled={disabled || rebuilding}
              data-piece-core-rebuild="true"
              onClick={() => void rebuild()}
            >
              {t.coreRebuild}
            </Button>
            <Hint label={intakeCopy[locale].profileHintFor(t.coreRebuild)}>
              {t.coreRebuildHint}
            </Hint>
          </span>
        </div>
      ) : null}
      {rebuildError ? (
        <p role="alert" className="cf-body-sm text-cf-danger">
          {rebuildError}
        </p>
      ) : null}
    </section>
  );
}

/** «ДД.ММ ЧЧ:ММ» in the reader's time zone; nothing for a broken stamp. */
const versionTime = (iso: string): string | null => {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const two = (value: number) => String(value).padStart(2, '0');
  return `${two(at.getDate())}.${two(at.getMonth() + 1)} ${two(
    at.getHours()
  )}:${two(at.getMinutes())}`;
};

/**
 * «Версии сути» (`content-factory-next-97dq.85`, fourteenth walk, B3): the
 * core texts the piece replaced — by a hand edit, a rebuild or a restore —
 * newest first, with who wrote each and until when it was the core. Any of
 * them can be read and restored; restoring is itself a new version, so the
 * current core is never lost.
 */
export function CoreVersions({
  locale,
  current,
  revisions,
  disabled,
  onRestore,
}: {
  locale: PiecesLocale;
  /** The core on the page: what a restore replaces. */
  current: string;
  /** Stored oldest first, as the server keeps them. */
  revisions: readonly PieceCoreRevisionV1[];
  disabled: boolean;
  /** Resolves to an error sentence, or `null` when the version is back. */
  onRestore?: (
    index: number,
    replacedAt: string,
    expected: string
  ) => Promise<string | null>;
}) {
  const t = piecesCopy[locale];
  const [open, setOpen] = useState<number | null>(null);
  const [restoring, setRestoring] = useState<number | null>(null);
  const [error, setError] = useState<{ index: number; text: string } | null>(
    null
  );
  const restore = async (index: number) => {
    if (!onRestore) return;
    setRestoring(index);
    setError(null);
    const failed = await onRestore(
      index,
      revisions[index].replacedAt,
      current
    ).catch(() => t.coreVersionRestoreFailed);
    setRestoring(null);
    if (failed) setError({ index, text: failed });
    else setOpen(null);
  };

  const newestFirst = revisions
    .map((revision, index) => ({ revision, index }))
    .filter(({ revision }) => revision.text.trim())
    .reverse();
  if (!newestFirst.length) return null;

  return (
    <section
      data-piece-core-versions="true"
      className="flex min-w-0 max-w-[72ch] items-start gap-[4px]"
    >
      <Disclosure
        className="min-w-0 flex-1"
        summary={
          <span className="flex min-w-0 flex-wrap items-baseline gap-x-[12px] gap-y-[4px]">
            <span className="cf-label-md text-cf-ink">{t.coreVersionsTitle}</span>
            <span className="cf-caption tabular-nums text-cf-ink-muted">
              {t.coreVersionsCount(newestFirst.length)}
            </span>
          </span>
        }
        triggerProps={{ 'data-piece-core-versions-toggle': 'true' } as never}
        contentClassName="flex min-w-0 flex-col gap-[8px] pb-[8px] pt-[4px]"
      >
        <ol className="flex min-w-0 flex-col gap-[8px]">
          {newestFirst.map(({ revision, index }) => {
            const shown = open === index;
            const time = versionTime(revision.replacedAt);
            return (
              <li
                key={`${index}-${revision.replacedAt}`}
                data-piece-core-version={index}
                className="flex min-w-0 flex-col gap-[8px] border-s border-cf-border ps-[12px]"
              >
                <div className="flex min-w-0 flex-wrap items-center gap-x-[12px] gap-y-[4px]">
                  <span className="cf-body-sm text-cf-ink">
                    {revision.writtenBy === 'person'
                      ? t.coreVersionByYou
                      : t.coreVersionByAi}
                  </span>
                  {time ? (
                    <span className="cf-caption tabular-nums text-cf-ink-muted">
                      {t.coreVersionUntil(time)}
                    </span>
                  ) : null}
                  <Button
                    type="button"
                    variant="quiet"
                    density="dense"
                    aria-expanded={shown}
                    data-piece-core-version-show={index}
                    onClick={() => setOpen(shown ? null : index)}
                  >
                    {shown ? t.coreVersionHide : t.coreVersionShow}
                  </Button>
                </div>
                {shown ? (
                  <>
                    <blockquote
                      data-piece-core-version-text={index}
                      className="min-w-0 whitespace-pre-wrap cf-body-md text-cf-ink [overflow-wrap:anywhere] [text-wrap:pretty]"
                    >
                      {revision.text}
                    </blockquote>
                    {onRestore ? (
                      <span className="inline-flex items-center gap-[4px]">
                        <Button
                          type="button"
                          variant="secondary"
                          density="dense"
                          loading={restoring === index}
                          loadingLabel={t.coreVersionRestoring}
                          disabled={
                            disabled ||
                            restoring !== null ||
                            revision.text === current
                          }
                          data-piece-core-version-restore={index}
                          onClick={() => void restore(index)}
                        >
                          {t.coreVersionRestore}
                        </Button>
                        <Hint
                          label={intakeCopy[locale].profileHintFor(
                            t.coreVersionRestore
                          )}
                        >
                          {t.coreVersionRestoreHint}
                        </Hint>
                      </span>
                    ) : null}
                    {error?.index === index ? (
                      <p role="alert" className="cf-body-sm text-cf-danger">
                        {error.text}
                      </p>
                    ) : null}
                  </>
                ) : null}
              </li>
            );
          })}
        </ol>
      </Disclosure>
      {/* The «?» sits beside the trigger, never inside the button. */}
      <span className="flex shrink-0 items-center pt-[8px]">
        <Hint label={intakeCopy[locale].profileHintFor(t.coreVersionsTitle)}>
          {t.coreVersionsHint}
        </Hint>
      </span>
    </section>
  );
}
