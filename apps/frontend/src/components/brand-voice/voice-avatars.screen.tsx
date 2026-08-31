'use client';

import clsx from 'clsx';
import { Button } from '@contentfactory/react/form/button';
import { Input } from '@contentfactory/react/form/input';
import {
  RadioGroup,
  RadioOption,
} from '@contentfactory/react/choice/radio.group';
import { voiceCopy, type VoiceLocale } from './voice-copy';

/**
 * Screen 12 — every avatar of the space, and which one writes.
 *
 * Three things are meant to be readable without opening anything: who is
 * writing right now, what makes a person different from a brand, and which
 * avatar exists but does not write yet.
 *
 * One card shape for both kinds. `kind` is the whole difference between a
 * person and a brand — everything else about them, portrait, examples, print,
 * the likeness check, behaves identically — so it is a marker inside the card
 * rather than a column the list is split by. Two lists would need the same
 * defect fixed twice, and would make a reader learn where a brand lives before
 * finding the name they came for.
 *
 * «Без разбора» is a working state and is drawn as one: no danger colour, no
 * alert role, and a sentence saying so. What it does take away is the ability
 * to become the default, and the card says why in the place the button would
 * have been rather than leaving a disabled control with no explanation.
 *
 * The card's «Ещё» is a disclosure and not a popup menu. The three things
 * behind it — rename, change the kind, delete — are actions rather than a
 * choice, and `MenuOption` in this repository is a `menuitemradio`: correct
 * for the strip below, which really is a choice, and a lie about a delete.
 */

export type AvatarKind = 'PERSON' | 'BRAND';

export type AvatarRow = Readonly<{
  id: string;
  /** `null` is «Без имени» — a state, not a missing value to invent one for. */
  name: string | null;
  kind: AvatarKind;
  isDefault: boolean;
  /** Whether it can write at all. See `VoiceAvatarRowV1`. */
  analysed: boolean;
  versionLabel?: string;
  sampleCount?: number;
  createdAt: string;
  activeSince?: string;
  hasPortrait?: boolean;
}>;

export type AvatarDeleteIntent = Readonly<{
  avatarId: string;
  /** Who takes over the default; only ever set for the avatar that holds it. */
  successorId?: string;
}>;

export type VoiceAvatarsState =
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
 * What an analysed avatar says about itself, in one sentence.
 *
 * Joined with a comma and finished with a full stop rather than glued out of
 * two finished phrases: «Разобран: 48 образцов. портрет принят» is what the
 * naive version reads like. Empty when there is nothing counted to say — a
 * lone full stop under a name is worse than a blank line.
 */
const summaryOf = (locale: VoiceLocale, avatar: AvatarRow): string => {
  const t = voiceCopy[locale];
  const parts = [
    avatar.sampleCount === undefined
      ? null
      : t.avatarsAnalysed(avatar.sampleCount),
    avatar.hasPortrait ? t.avatarsPortraitAccepted : null,
  ].filter(Boolean);
  return parts.length ? `${parts.join(', ')}.` : '';
};

const KIND_LABEL = (locale: VoiceLocale, kind: AvatarKind) =>
  kind === 'BRAND'
    ? voiceCopy[locale].avatarsKindBrand
    : voiceCopy[locale].avatarsKindPerson;

/** A pill: the kind, and the «без разбора» mark beside it. */
function Marker({
  children,
  muted,
}: {
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-[4px] rounded-full border px-[8px] py-[4px] cf-label-sm uppercase',
        muted
          ? 'border-cf-border-control text-cf-ink-muted'
          : 'border-cf-border-strong text-cf-ink'
      )}
    >
      {children}
    </span>
  );
}

function DotsIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M10 5.5h.01M10 10h.01M10 14.5h.01" />
    </svg>
  );
}

function TickIcon({ className }: { className?: string }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M3 8.5 6.5 12 13 4.5" />
    </svg>
  );
}

function PersonIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
      aria-hidden="true"
    >
      <path d="M4 16.5c0-2.8 2.7-4.5 6-4.5s6 1.7 6 4.5" />
      <circle cx="10" cy="7" r="3.2" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="6" />
      <path d="M8 5.4v5.2" />
    </svg>
  );
}

/**
 * Two letters, or a dash where there is no name.
 *
 * The dash is dashed-bordered rather than filled: an unnamed avatar is a hole
 * in the list on purpose, and a solid monogram of «БИ» would read as somebody
 * called that.
 */
function Monogram({ name }: { name: string | null }) {
  const initials = (name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <span
      aria-hidden="true"
      className={clsx(
        'flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-[8px] border cf-label-sm uppercase',
        initials
          ? 'border-cf-border-control text-cf-ink'
          : 'border-dashed border-cf-border-strong text-cf-ink-muted'
      )}
    >
      {initials || '——'}
    </span>
  );
}

export function VoiceAvatarsScreen({
  locale,
  state = 'default',
  avatars,
  defaultAvatarId = null,
  limit,
  canManage = true,
  notice,
  openMenuId = null,
  renamingId = null,
  draftName = '',
  confirmDelete = null,
  onCreate,
  onOpen,
  onCollect,
  onMenuToggle,
  onRenameStart,
  onRenameChange,
  onRenameSubmit,
  onRenameCancel,
  onKindChange,
  onMakeDefault,
  onDeleteStart,
  onDeleteSuccessorChange,
  onDeleteConfirm,
  onDeleteCancel,
  onRetry,
}: {
  locale: VoiceLocale;
  state?: VoiceAvatarsState;
  avatars: readonly AvatarRow[];
  defaultAvatarId?: string | null;
  limit: number;
  canManage?: boolean;
  notice?: string;
  openMenuId?: string | null;
  renamingId?: string | null;
  draftName?: string;
  confirmDelete?: AvatarDeleteIntent | null;
  onCreate?: () => void;
  onOpen?: (id: string) => void;
  onCollect?: (id: string) => void;
  onMenuToggle?: (id: string | null) => void;
  onRenameStart?: (id: string) => void;
  onRenameChange?: (value: string) => void;
  onRenameSubmit?: (id: string) => void;
  onRenameCancel?: () => void;
  onKindChange?: (id: string, kind: AvatarKind) => void;
  onMakeDefault?: (id: string) => void;
  onDeleteStart?: (id: string) => void;
  onDeleteSuccessorChange?: (successorId: string) => void;
  onDeleteConfirm?: () => void;
  onDeleteCancel?: () => void;
  onRetry?: () => void;
}) {
  const t = voiceCopy[locale];
  const busy = state === 'loading';
  const atLimit = avatars.length >= limit;
  const writing = avatars.find((one) => one.id === defaultAvatarId) ?? null;
  const deleting = confirmDelete
    ? avatars.find((one) => one.id === confirmDelete.avatarId) ?? null
    : null;
  // Who may inherit the default: analysed, and not the one being deleted.
  // An avatar that cannot write is left off rather than shown disabled — the
  // list is a question and an option that can never be picked is not an answer.
  const successors = deleting
    ? avatars.filter((one) => one.id !== deleting.id && one.analysed)
    : [];
  const nameOf = (avatar: AvatarRow) => avatar.name ?? t.avatarsNoName;

  return (
    <section
      data-voice-surface="avatars"
      data-voice-state={state}
      aria-busy={busy ? 'true' : undefined}
      className="flex min-w-0 flex-col gap-[16px] [&_button]:min-h-[44px] sm:[&_button]:min-h-0"
    >
      <header className="flex flex-wrap items-start justify-between gap-[12px]">
        <div className="min-w-0">
          <h2 className="cf-heading-md text-cf-ink [text-wrap:balance]">
            {t.avatarsTitle}
          </h2>
          <p className="mt-[4px] cf-caption text-cf-ink-muted">
            {t.avatarsCount(avatars.length, limit)}
          </p>
        </div>
        {canManage ? (
          <Button
            type="button"
            variant="primary"
            disabled={atLimit || busy}
            onClick={() => onCreate?.()}
          >
            {t.avatarsCreate}
          </Button>
        ) : null}
      </header>

      {/*
        Who writes when nobody is picked. Stated at the top rather than only
        as a marker on one card: the answer to "whose voice is my next post in"
        should not depend on finding the right card first.
      */}
      <p
        className={clsx(
          'flex flex-wrap items-center gap-[8px] rounded-[8px] border p-[12px] cf-body-sm [text-wrap:pretty]',
          writing
            ? 'border-cf-accent bg-cf-accent-soft text-cf-ink'
            : 'border-cf-border bg-cf-surface text-cf-ink-muted'
        )}
        data-voice-avatars-default={writing ? writing.id : 'none'}
      >
        <span className={writing ? 'text-cf-accent' : 'text-cf-ink-muted'}>
          <PersonIcon />
        </span>
        <span className="min-w-0">
          {writing
            ? t.avatarsDefaultLine(nameOf(writing))
            : t.avatarsDefaultNeutral}
        </span>
        <span className="ms-auto cf-caption text-cf-ink-muted">
          {t.avatarsDefaultOverride}
        </span>
      </p>

      {state === 'error' ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-[12px] rounded-[8px] border border-cf-danger bg-cf-danger-soft p-[12px]"
        >
          <span className="min-w-0">
            <span className="block cf-label-md text-cf-ink">
              {t.avatarsErrorTitle}
            </span>
            <span className="mt-[4px] block cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
              {notice ?? t.avatarsErrorBody}
            </span>
          </span>
          <Button
            type="button"
            variant="secondary"
            className="ms-auto"
            onClick={() => onRetry?.()}
          >
            {t.avatarsRetry}
          </Button>
        </div>
      ) : null}

      {state === 'success' && writing ? (
        <p
          role="status"
          className="flex items-center gap-[8px] rounded-[8px] border border-cf-accent bg-cf-accent-soft p-[12px] cf-body-sm text-cf-ink"
        >
          <span className="text-cf-accent">
            <TickIcon />
          </span>
          {t.avatarsSuccess(nameOf(writing))}
        </p>
      ) : null}

      {state === 'restricted' || !canManage ? (
        <div className="rounded-[8px] border border-cf-border bg-cf-surface p-[16px]">
          <p className="cf-label-md text-cf-ink">{t.avatarsRestrictedTitle}</p>
          <p className="mt-[4px] cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
            {notice ?? t.avatarsRestrictedBody}
          </p>
        </div>
      ) : null}

      {avatars.length === 0 ? (
        <div className="flex flex-col items-start gap-[8px] rounded-[8px] border border-cf-border bg-cf-surface p-[16px]">
          <p className="cf-label-md text-cf-ink">{t.avatarsEmptyTitle}</p>
          <p className="max-w-[72ch] cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
            {t.avatarsEmptyBody}
          </p>
          {canManage ? (
            <Button type="button" variant="primary" onClick={() => onCreate?.()}>
              {t.avatarsCreate}
            </Button>
          ) : null}
        </div>
      ) : (
        <ul className="grid min-w-0 grid-cols-1 gap-[16px] md:grid-cols-2">
          {avatars.map((avatar) => {
            const isRenaming = renamingId === avatar.id;
            const menuOpen = openMenuId === avatar.id;
            return (
              <li
                key={avatar.id}
                data-voice-avatar={avatar.id}
                data-voice-avatar-default={avatar.isDefault ? 'true' : undefined}
                className={clsx(
                  'flex min-w-0 flex-col overflow-hidden rounded-[8px] border bg-cf-surface',
                  avatar.isDefault ? 'border-cf-accent' : 'border-cf-border'
                )}
              >
                <div
                  className={clsx(
                    'flex flex-wrap items-center gap-[8px] border-b px-[16px] py-[8px]',
                    avatar.isDefault
                      ? 'border-cf-accent bg-cf-accent-soft'
                      : 'border-cf-border bg-cf-surface-subtle'
                  )}
                >
                  {avatar.isDefault ? (
                    <>
                      <span className="text-cf-accent">
                        <TickIcon />
                      </span>
                      <span className="cf-label-sm uppercase text-cf-accent">
                        {t.avatarsWritesByDefault}
                      </span>
                    </>
                  ) : null}
                  <span className="ms-auto cf-caption text-cf-ink-muted">
                    {avatar.createdAt}
                  </span>
                </div>

                <div className="flex min-w-0 gap-[12px] p-[16px]">
                  <Monogram name={avatar.name} />
                  <div className="flex min-w-0 flex-col gap-[8px]">
                    {isRenaming ? (
                      <Input
                        standalone
                        disableForm
                        removeError
                        name={`avatar-name-${avatar.id}`}
                        label={t.avatarsRename}
                        value={draftName}
                        maxLength={120}
                        autoFocus
                        fieldClassName="w-full"
                        onChange={(event) =>
                          onRenameChange?.(event.target.value)
                        }
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            onRenameSubmit?.(avatar.id);
                          }
                          if (event.key === 'Escape') onRenameCancel?.();
                        }}
                      />
                    ) : (
                      <span
                        className={clsx(
                          'cf-heading-md [text-wrap:pretty]',
                          avatar.name ? 'text-cf-ink' : 'text-cf-ink-muted'
                        )}
                      >
                        {nameOf(avatar)}
                      </span>
                    )}

                    <span className="flex flex-wrap items-center gap-[8px]">
                      <Marker>{KIND_LABEL(locale, avatar.kind)}</Marker>
                      {avatar.analysed ? (
                        <span className="cf-caption text-cf-ink-muted">
                          {[avatar.versionLabel, avatar.activeSince]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      ) : (
                        <Marker muted>
                          <InfoIcon />
                          {t.avatarsNotAnalysed}
                        </Marker>
                      )}
                    </span>

                    <span className="cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
                      {avatar.analysed
                        ? summaryOf(locale, avatar)
                        : t.avatarsNotWriting}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-[8px] border-t border-cf-border px-[16px] py-[8px]">
                  {isRenaming ? (
                    <>
                      <Button
                        type="button"
                        variant="primary"
                        density="dense"
                        onClick={() => onRenameSubmit?.(avatar.id)}
                      >
                        {t.avatarsRenameSave}
                      </Button>
                      <Button
                        type="button"
                        variant="quiet"
                        density="dense"
                        onClick={() => onRenameCancel?.()}
                      >
                        {t.avatarsRenameCancel}
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        type="button"
                        variant="secondary"
                        density="dense"
                        onClick={() =>
                          avatar.analysed
                            ? onOpen?.(avatar.id)
                            : onCollect?.(avatar.id)
                        }
                      >
                        {avatar.analysed ? t.avatarsOpen : t.avatarsCollect}
                      </Button>
                      {canManage ? (
                        <Button
                          type="button"
                          variant="quiet"
                          density="dense"
                          onClick={() => onRenameStart?.(avatar.id)}
                        >
                          {t.avatarsRename}
                        </Button>
                      ) : null}
                    </>
                  )}

                  <span className="ms-auto flex flex-wrap items-center gap-[8px]">
                    {avatar.isDefault ? (
                      <Button
                        type="button"
                        variant="quiet"
                        density="dense"
                        disabled
                      >
                        {t.avatarsAlreadyDefault}
                      </Button>
                    ) : avatar.analysed ? (
                      canManage ? (
                        <Button
                          type="button"
                          variant="quiet"
                          density="dense"
                          onClick={() => onMakeDefault?.(avatar.id)}
                        >
                          {t.avatarsMakeDefault}
                        </Button>
                      ) : null
                    ) : (
                      // The reason stands where the button would have been. A
                      // disabled control saying «Сделать основным» explains
                      // nothing and invites a second click.
                      <span className="cf-caption text-cf-ink-muted">
                        {t.avatarsCannotDefault}
                      </span>
                    )}
                    {canManage ? (
                      <Button
                        type="button"
                        variant="secondary"
                        density="dense"
                        aria-expanded={menuOpen}
                        onClick={() =>
                          onMenuToggle?.(menuOpen ? null : avatar.id)
                        }
                      >
                        <DotsIcon />
                        {t.avatarsMore}
                      </Button>
                    ) : null}
                  </span>
                </div>

                {menuOpen && canManage ? (
                  <div
                    data-voice-avatar-more={avatar.id}
                    className="flex flex-wrap items-center gap-[8px] border-t border-cf-border bg-cf-surface-subtle px-[16px] py-[8px]"
                  >
                    <Button
                      type="button"
                      variant="quiet"
                      density="dense"
                      onClick={() =>
                        onKindChange?.(
                          avatar.id,
                          avatar.kind === 'PERSON' ? 'BRAND' : 'PERSON'
                        )
                      }
                    >
                      {t.avatarsSwitchKind(avatar.kind)}
                    </Button>
                    <Button
                      type="button"
                      variant="quiet"
                      density="dense"
                      className="ms-auto text-cf-danger"
                      onClick={() => onDeleteStart?.(avatar.id)}
                    >
                      {t.avatarsDelete}
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <p className="flex flex-wrap items-center gap-[12px] cf-caption text-cf-ink-muted">
        <span>{t.avatarsOrder}</span>
        <span className="ms-auto">{t.avatarsMoreNote}</span>
      </p>

      {atLimit ? (
        <p className="rounded-[8px] border border-cf-border bg-cf-surface-subtle p-[12px] cf-caption text-cf-ink-muted [text-wrap:pretty]">
          {t.avatarsLimitTitle(limit)} · {t.avatarsLimitBody}
        </p>
      ) : null}

      {/*
        Two confirmations rather than one, because the consequence differs:
        a space with nobody to write as, or a space whose default moved to
        somebody the person picks here. A third, plainest case — deleting an
        avatar that is not the default — says what does *not* change, which is
        the question somebody asks before pressing it.

        The overlay shadow is read through the theme's own variable rather than
        retyped as a value: the two themes carry different shadows, and a
        literal here would drag the dark one into the light.
      */}
      {deleting ? (
        <div
          role="dialog"
          aria-modal="false"
          aria-label={
            deleting.isDefault && successors.length
              ? t.avatarsDeleteDefaultTitle(nameOf(deleting))
              : deleting.isDefault
              ? t.avatarsDeleteLastTitle
              : t.avatarsDeletePlainTitle(nameOf(deleting))
          }
          data-voice-avatar-confirm={deleting.id}
          style={{ boxShadow: 'var(--cf-overlay-shadow)' }}
          className="flex min-w-0 flex-col gap-[16px] rounded-[12px] border border-cf-border-strong bg-cf-surface-raised p-[24px]"
        >
          <p className="cf-heading-md text-cf-ink [text-wrap:balance]">
            {deleting.isDefault && successors.length
              ? t.avatarsDeleteDefaultTitle(nameOf(deleting))
              : deleting.isDefault
              ? t.avatarsDeleteLastTitle
              : t.avatarsDeletePlainTitle(nameOf(deleting))}
          </p>
          <p className="max-w-[72ch] cf-body-md text-cf-ink [text-wrap:pretty]">
            {deleting.isDefault && successors.length
              ? t.avatarsDeleteDefaultBody(avatars.length - 1)
              : deleting.isDefault
              ? t.avatarsDeleteLastBody(nameOf(deleting))
              : t.avatarsDeletePlainBody}
          </p>

          {deleting.isDefault && successors.length ? (
            <div className="flex flex-col gap-[8px]">
              <p className="cf-label-sm uppercase text-cf-ink-muted">
                {t.avatarsDeleteSuccessor}
              </p>
              {/*
                A `RadioGroup` rather than a list of labelled inputs: this is a
                choice, arrows walk it, and the primitive owns the role and the
                tab stop. The look stays here — the primitive imposes none.
              */}
              <RadioGroup
                orientation="vertical"
                aria-label={t.avatarsDeleteSuccessor}
                value={confirmDelete?.successorId ?? null}
                onChange={(next) => onDeleteSuccessorChange?.(next)}
                className="flex flex-col gap-[8px]"
              >
                {successors.map((candidate) => (
                  <RadioOption
                    key={candidate.id}
                    value={candidate.id}
                    layout="content"
                    className={clsx(
                      'flex w-full items-center gap-[12px] rounded-[8px] border px-[12px] py-[12px] text-start',
                      confirmDelete?.successorId === candidate.id
                        ? 'border-cf-accent bg-cf-accent-soft'
                        : 'border-cf-border bg-cf-surface'
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={clsx(
                        'flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-full border',
                        confirmDelete?.successorId === candidate.id
                          ? 'border-cf-accent'
                          : 'border-cf-border-control'
                      )}
                    >
                      {confirmDelete?.successorId === candidate.id ? (
                        <span className="h-[8px] w-[8px] rounded-full bg-cf-accent" />
                      ) : null}
                    </span>
                    <span className="min-w-0 flex-1 cf-label-md text-cf-ink">
                      {nameOf(candidate)}
                    </span>
                    <span className="cf-caption text-cf-ink-muted">
                      {[
                        KIND_LABEL(locale, candidate.kind),
                        candidate.versionLabel,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </RadioOption>
                ))}
              </RadioGroup>
              <p className="cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
                {t.avatarsDeleteSuccessorNote}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-[8px] rounded-[8px] border border-cf-border bg-cf-surface-subtle p-[12px]">
              <p className="cf-label-sm uppercase text-cf-ink-muted">
                {t.avatarsDeleteWhatGoes}
              </p>
              <p className="cf-body-sm text-cf-ink [text-wrap:pretty]">
                {t.avatarsDeleteWhatStays}
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-[12px]">
            <Button
              type="button"
              variant="secondary"
              onClick={() => onDeleteCancel?.()}
            >
              {t.avatarsDeleteCancel}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={
                deleting.isDefault &&
                successors.length > 0 &&
                !confirmDelete?.successorId
              }
              onClick={() => onDeleteConfirm?.()}
            >
              {deleting.isDefault && successors.length
                ? t.avatarsDeleteDefaultConfirm
                : deleting.isDefault
                ? t.avatarsDeleteLastConfirm
                : t.avatarsDeletePlainConfirm}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
