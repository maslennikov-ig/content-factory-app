'use client';

import { useState } from 'react';
import clsx from 'clsx';
import { Button } from '@contentfactory/react/form/button';
import {
  Menu,
  MenuButton,
  MenuList,
  MenuOption,
} from '@contentfactory/react/choice/choice.menu';
import { voiceCopy, type VoiceLocale } from './voice-copy';
import type { AvatarKind, AvatarRow } from './voice-avatars.screen';

/**
 * One strip answering one question: what is this text being written with.
 *
 * It replaces the line `content-factory-next-36r.10` put where the inherited
 * personal/company select used to be. The line said which version applied; the
 * strip also says whether that is still the right answer, which is the part
 * that actually goes wrong — a context built in June and used in August is
 * stale, and a voice reactivated after the draft was assembled means the draft
 * was written by a version that is no longer in force.
 *
 * Four states, and the fourth is deliberately not a failure. Working without a
 * profile is a working mode: generation stays in an explicit neutral style,
 * and saying "нейтрально · голос не применён" is a statement rather than a
 * warning. It carries no alert role and no danger colour.
 *
 * Each state offers exactly one action, because each describes exactly one
 * thing being off: change, refresh, rebuild, choose.
 */

export type RibbonState =
  | 'fresh'
  | 'stale-context'
  | 'voice-moved'
  | 'no-profile';

export type RibbonDetails = Readonly<{
  /** The version that wrote it, e.g. `v3`. */
  versionLabel?: string;
  /** The version in force now, when it differs from the one that wrote it. */
  currentVersionLabel?: string;
  /** The batch or snapshot label the context came from. */
  contextLabel?: string;
  /** Age of that context in days; the strip turns it into words. */
  contextAgeDays?: number;
  factCount?: number;
  evidenceCount?: number;
  profileLabel?: string;
  /**
   * Who is writing, and not only which version.
   *
   * Two avatars can both be on `v3`, so the number alone answers a question
   * nobody asked while leaving the one they did ask — whose voice is this —
   * one expand away.
   */
  avatarId?: string;
  avatarName?: string;
  avatarKind?: AvatarKind;
}>;

const TONE: Record<RibbonState, string> = {
  fresh: 'border-cf-border bg-cf-surface',
  'stale-context': 'border-cf-warning bg-cf-warning-soft',
  'voice-moved': 'border-cf-info bg-cf-info-soft',
  // Not an error, so it borrows nothing from one.
  'no-profile': 'border-cf-border bg-cf-surface',
};

export function VoiceRibbon({
  locale,
  state,
  details,
  avatars = [],
  defaultAvatarId = null,
  expanded: expandedProp,
  pickerOpen: pickerOpenProp,
  pickedAvatarId,
  onAction,
  onToggle,
  onPickerToggle,
  onPickAvatar,
}: {
  locale: VoiceLocale;
  state: RibbonState;
  details: RibbonDetails;
  /** Who this space can write as. Empty is a space with no avatar at all. */
  avatars?: readonly AvatarRow[];
  defaultAvatarId?: string | null;
  expanded?: boolean;
  pickerOpen?: boolean;
  /**
   * The avatar chosen for *this* draft.
   *
   * `undefined` means "nobody picked", which is not the same as picking the
   * default: the draft follows whoever the default is at generation time, and
   * an explicit pick survives the default moving underneath it. `null` is the
   * deliberate "no avatar · neutral style" choice.
   */
  pickedAvatarId?: string | null;
  onAction?: (state: RibbonState) => void;
  onToggle?: (expanded: boolean) => void;
  onPickerToggle?: (open: boolean) => void;
  onPickAvatar?: (avatarId: string | null) => void;
}) {
  const t = voiceCopy[locale];
  const [openLocal, setOpenLocal] = useState(false);
  const [pickerLocal, setPickerLocal] = useState(false);
  const open = expandedProp ?? openLocal;
  const pickerOpen = pickerOpenProp ?? pickerLocal;
  // Only avatars that can write. An unanalysed one on this list would be an
  // option that produces a neutral text under somebody's name.
  const choosable = avatars.filter((one) => one.analysed);
  const picked =
    pickedAvatarId === undefined ? details.avatarId ?? null : pickedAvatarId;

  const summary =
    state === 'no-profile'
      ? t.ribbonNeutral
      : state === 'voice-moved'
      ? `${details.versionLabel} → ${details.currentVersionLabel} · ${t.ribbonBuiltOn(
          details.versionLabel ?? '',
          details.currentVersionLabel ?? ''
        )}`
      : [
          // The name as well as the number. The mockup shows only the number
          // because it draws one workspace with one profile; a reader with
          // three needs to know which of them wrote this, and one expand away
          // is not "visible before generation".
          details.avatarName,
          details.profileLabel,
          details.versionLabel,
          details.contextLabel,
          details.contextAgeDays === undefined
            ? null
            : t.ribbonDays(details.contextAgeDays),
        ]
          .filter(Boolean)
          .join(' · ');

  const action =
    state === 'fresh'
      ? t.ribbonChange
      : state === 'stale-context'
      ? t.ribbonRefresh
      : state === 'voice-moved'
      ? t.ribbonRebuild
      : t.ribbonChoose;

  return (
    <div
      data-voice-surface="ribbon"
      data-voice-ribbon-state={state}
      className={clsx(
        'flex min-w-0 flex-col gap-[8px] rounded-[8px] border p-[12px] [&_button]:min-h-[44px] sm:[&_button]:min-h-0',
        TONE[state]
      )}
    >
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-[8px]">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-[8px] gap-y-[4px]">
          <span className="cf-label-sm uppercase text-cf-ink-muted">
            {t.ribbonLabel}
          </span>
          <span
            className={clsx(
              'cf-body-sm [overflow-wrap:anywhere]',
              state === 'no-profile' ? 'text-cf-ink-muted' : 'text-cf-ink'
            )}
          >
            {summary}
          </span>
          {details.avatarKind ? (
            <span className="inline-flex items-center rounded-full border border-cf-border-strong px-[8px] py-[4px] cf-label-sm uppercase text-cf-ink">
              {details.avatarKind === 'BRAND'
                ? t.avatarsKindBrand
                : t.avatarsKindPerson}
            </span>
          ) : null}
        </div>
        <div className="relative flex flex-wrap gap-[8px]">
          {/*
            Who writes this text, decided before it is written.

            A `Menu` rather than a `RadioGroup`: in a radio group selection
            follows the arrow keys, and every pass over the list would change
            who is about to write. Here the arrows only move and Enter commits,
            which is the rule this repository's authoring notes give for any
            choice that costs something.

            It is offered in every state including «нет аватара» — that is the
            state in which a person most needs to pick one, and a picker that
            appears only once a voice is already in force appears exactly when
            it is least needed.
          */}
          {choosable.length ? (
            <Menu
              open={pickerOpen}
              onOpenChange={(next) => {
                setPickerLocal(next);
                onPickerToggle?.(next);
              }}
            >
              <MenuButton
                density="dense"
                className="rounded-[8px] border border-cf-border-control bg-cf-surface px-[12px] cf-label-md text-cf-ink hover:bg-cf-surface-subtle"
              >
                {t.ribbonSwitchAvatar}
              </MenuButton>
              {pickerOpen ? (
                <MenuList
                  aria-label={t.ribbonWhoWrites}
                  style={{ boxShadow: 'var(--cf-overlay-shadow)' }}
                  className="absolute end-0 top-[100%] z-[300] mt-[8px] flex w-[320px] max-w-[90vw] flex-col rounded-[8px] border border-cf-border-strong bg-cf-surface-raised p-[8px]"
                >
                  <span className="px-[8px] pb-[8px] pt-[4px] cf-label-sm uppercase text-cf-ink-muted">
                    {t.ribbonWhoWrites}
                  </span>
                  {choosable.map((avatar) => (
                    <MenuOption
                      key={avatar.id}
                      selected={picked === avatar.id}
                      density="dense"
                      layout="content"
                      onClick={() => onPickAvatar?.(avatar.id)}
                      className={clsx(
                        'flex w-full items-start gap-[12px] rounded-[8px] px-[8px] py-[8px] text-start',
                        picked === avatar.id
                          ? 'border border-cf-accent bg-cf-accent-soft'
                          : 'border border-transparent hover:bg-cf-surface-subtle'
                      )}
                    >
                      {/*
                        Name over meta rather than beside it. Side by side, a
                        name of ordinary length loses its last third to an
                        ellipsis while «человек «я» · v3 · по умолчанию» keeps
                        every character — which is the wrong way round for a
                        menu whose whole question is *whose* voice.
                      */}
                      <span className="flex min-w-0 flex-1 flex-col gap-[4px]">
                        <span className="cf-label-md text-cf-ink [text-wrap:pretty]">
                          {avatar.name ?? t.avatarsNoName}
                        </span>
                        <span className="cf-caption text-cf-ink-muted">
                          {[
                            avatar.kind === 'BRAND'
                              ? t.avatarsKindBrand
                              : t.avatarsKindPerson,
                            avatar.versionLabel,
                            avatar.id === defaultAvatarId
                              ? t.ribbonDefaultMark
                              : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </span>
                    </MenuOption>
                  ))}
                  <span className="mx-[8px] my-[8px] block border-t border-cf-border" />
                  <MenuOption
                    selected={picked === null}
                    density="dense"
                    layout="content"
                    onClick={() => onPickAvatar?.(null)}
                    className={clsx(
                      'flex w-full items-center rounded-[8px] px-[8px] py-[8px] text-start cf-body-sm',
                      picked === null
                        ? 'border border-cf-accent bg-cf-accent-soft text-cf-ink'
                        : 'border border-transparent text-cf-ink-muted hover:bg-cf-surface-subtle'
                    )}
                  >
                    {t.ribbonNoAvatar}
                  </MenuOption>
                </MenuList>
              ) : null}
            </Menu>
          ) : null}
          <Button
            type="button"
            variant="quiet"
            aria-expanded={open}
            onClick={() => {
              setOpenLocal(!open);
              onToggle?.(!open);
            }}
          >
            {open ? t.ribbonHide : t.ribbonWhatApplied}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onAction?.(state)}
          >
            {action}
          </Button>
        </div>
      </div>

      {state === 'stale-context' ? (
        <p className="cf-caption text-cf-ink [text-wrap:pretty]">
          {t.ribbonStaleBody}
        </p>
      ) : null}
      {state === 'voice-moved' ? (
        <p className="cf-caption text-cf-ink [text-wrap:pretty]">
          {t.ribbonMovedBody}
        </p>
      ) : null}
      {state === 'no-profile' ? (
        <p className="cf-caption text-cf-ink-muted [text-wrap:pretty]">
          {t.ribbonNeutralBody}
        </p>
      ) : null}

      {open ? (
        <dl
          className="flex flex-wrap gap-x-[24px] gap-y-[8px] border-t border-cf-border pt-[8px]"
          data-voice-ribbon-details="true"
        >
          {[
            { label: t.ribbonDetailAvatar, value: details.avatarName },
            { label: t.ribbonDetailVoice, value: details.versionLabel },
            { label: t.ribbonDetailProfile, value: details.profileLabel },
            { label: t.ribbonDetailContext, value: details.contextLabel },
            {
              label: t.ribbonDetailAge,
              value:
                details.contextAgeDays === undefined
                  ? undefined
                  : t.ribbonDays(details.contextAgeDays),
            },
            {
              label: t.ribbonDetailFacts,
              value:
                details.factCount === undefined
                  ? undefined
                  : String(details.factCount),
            },
            {
              label: t.ribbonDetailEvidence,
              value:
                details.evidenceCount === undefined
                  ? undefined
                  : String(details.evidenceCount),
            },
          ]
            .filter((entry) => entry.value)
            .map((entry) => (
              <div key={entry.label}>
                <dt className="cf-caption text-cf-ink-muted">{entry.label}</dt>
                <dd className="mt-[4px] cf-label-sm text-cf-ink">
                  {entry.value}
                </dd>
              </div>
            ))}
        </dl>
      ) : null}
    </div>
  );
}
