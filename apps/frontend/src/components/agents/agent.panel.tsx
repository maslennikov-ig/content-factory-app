'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { Button } from '@contentfactory/react/form/button';
import { useInterfaceLanguage } from '@contentfactory/react/translation/use-interface-language';
import { OpeningBand } from '@contentfactory/react/layout';
import { Progress } from '@contentfactory/frontend/components/ui/progress';
import { SkeletonRows } from '@contentfactory/frontend/components/ui/surface';
import { useFocusTrap } from '@contentfactory/frontend/components/ui/use-focus-trap';
import { useOnboardingProgress } from '@contentfactory/frontend/components/onboarding/use-onboarding-progress';
import {
  ONBOARDING_STEP_KEYS,
  doneCount,
  stepIsDone,
  stepOffered,
  type OnboardingStepKey,
} from '@contentfactory/frontend/components/onboarding/onboarding.adapter';
import {
  onboardingCopy,
  resolveOnboardingLocale,
} from '@contentfactory/frontend/components/onboarding/onboarding.copy';
import {
  artifactChannelId,
  artifactHref,
  type AgentArtifact,
} from './agent.contract';
import type { AgentWords } from './agent.copy';
import { OpenOnScreen, artifactOwnName } from './agent.cards';
import { AgentGlyph } from './agent.icons';
import { usePieceArtifact } from './agent.piece-data';
import { useUser } from '@contentfactory/frontend/components/layout/user.context';

/**
 * The work panel beside the chat (spec §6.1, canvas C; owner 27.09.2026 «чат
 * плюс артефакт»): what the turn produced, opened as the product's own screen.
 *
 * A piece, an avatar and a channel open their real screens here — the same components
 * their pages render, so whatever is changed here is saved the way the page
 * saves it. The other kinds show their name and lead to their screen. With
 * nothing open, the panel shows the five steps of «С чего начать», each with
 * «Сделать в чате».
 *
 * From 1280 px it is a column beside the chat; below, it is a sheet over the
 * conversation that the person opens from the line in the chat.
 */

const PieceContainer = dynamic(
  () =>
    import(
      '@contentfactory/frontend/components/content-intelligence/pieces/piece.container'
    ).then((module) => module.PieceContainer),
  { ssr: false, loading: () => <SkeletonRows rows={4} /> }
);

const VoiceAvatarScreen = dynamic(
  () =>
    import(
      '@contentfactory/frontend/components/brand-voice/voice-avatar.screen'
    ).then((module) => module.VoiceAvatarScreen),
  { ssr: false, loading: () => <SkeletonRows rows={4} /> }
);

const ChannelScreen = dynamic(
  () =>
    import('@contentfactory/frontend/components/channels/channel-screen').then(
      (module) => module.ChannelScreen
    ),
  { ssr: false, loading: () => <SkeletonRows rows={4} /> }
);

export type StarterKey = OnboardingStepKey;

const textOf = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value : null;

function ArtifactBody({
  artifact,
  words,
}: {
  artifact: AgentArtifact;
  words: AgentWords;
}) {
  if (artifact.kind === 'piece') {
    return <PieceContainer key={artifact.id} pieceId={artifact.id} embedded />;
  }
  if (artifact.kind === 'adaptation' || artifact.kind === 'plan') {
    // The channel preview (spec §6.2): the piece screen on that channel's tab,
    // as `artifactHref` opens the page — the same component, the same saves.
    // A plan slot opens it at its time, as the page's `?when=` does.
    const pieceId = textOf(artifact.data.pieceId);
    const channelId = artifactChannelId(artifact);
    const when = artifact.kind === 'plan' ? textOf(artifact.data.at) : null;
    // A review, an edit or a rewrite card names only the adaptation: the
    // piece screen finds its channel tab and its variant by id (`kcxz.31`, D8).
    const adaptationId = artifact.kind === 'adaptation' ? artifact.id : null;
    if (pieceId) {
      return (
        <PieceContainer
          key={`${pieceId}:${channelId ?? ''}:${adaptationId ?? ''}`}
          pieceId={pieceId}
          embedded
          {...(channelId ? { initialTab: channelId } : {})}
          {...(channelId && when ? { initialWhen: when } : {})}
          {...(adaptationId ? { initialAdaptation: adaptationId } : {})}
        />
      );
    }
  }
  if (artifact.kind === 'avatar') {
    // Beside the chat the screen follows what the agent did (W3 walk P2-A):
    // a proposal the chat made opens as the proposal, not as «Продолжить».
    return <VoiceAvatarScreen key={artifact.id} avatarId={artifact.id} followChat />;
  }
  if (artifact.kind === 'channel') {
    // The channel page itself (`kcxz.19`): the writing card, the schedule,
    // the recent posts and the connection, saved the way the page saves them.
    return <ChannelScreen key={artifact.id} channelId={artifact.id} embedded />;
  }
  return (
    <div className="flex flex-col items-start gap-[12px]">
      <p className="cf-body-md text-cf-ink">
        {artifact.title ?? words.card.kinds[artifact.kind]}
      </p>
      {artifact.code ? (
        <p className="cf-caption text-cf-ink-muted">{artifact.code}</p>
      ) : null}
      <OpenOnScreen href={artifactHref(artifact)} words={words} />
    </div>
  );
}

/** «Что есть в пространстве» — the five steps, the chat's starting points. */
export function WorkspaceSteps({
  onStarter,
  busy,
  words,
}: {
  onStarter: (step: StarterKey) => void;
  busy: boolean;
  words: AgentWords;
}) {
  const language = useInterfaceLanguage();
  const onboarding = onboardingCopy[resolveOnboardingLocale(language)];
  const role = useUser()?.role ?? null;
  const { progress, answered, error } = useOnboardingProgress();
  const done = doneCount(progress);
  const total = ONBOARDING_STEP_KEYS.length;
  const firstOpen = ONBOARDING_STEP_KEYS.find(
    (step) => !stepIsDone(step, progress)
  );

  return (
    <div className="flex min-w-0 flex-col gap-[12px]">
      <p className="max-w-[65ch] cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
        {words.panel.emptyLead}
      </p>
      {!answered ? (
        <SkeletonRows rows={5} label={words.panel.loading} />
      ) : (
        <>
          <div className="flex items-center gap-[12px]">
            <div className="min-w-0 flex-1">
              <Progress
                mode="steps"
                value={done}
                total={total}
                label={words.panel.workspaceTitle}
                valueText={onboarding.progressValue(done, total)}
              />
            </div>
            <span className="shrink-0 cf-caption text-cf-ink-muted">
              {onboarding.progressValue(done, total)}
            </span>
          </div>
          {error ? (
            <p className="cf-body-sm text-cf-ink-muted">{words.panel.failed}</p>
          ) : null}
          <ol className="flex flex-col overflow-hidden rounded-[12px] border border-cf-border">
            {ONBOARDING_STEP_KEYS.map((step, index) => {
              const isDone = stepIsDone(step, progress);
              const current = step === firstOpen;
              return (
                <li
                  key={step}
                  data-agent-step={step}
                  className="flex min-w-0 items-center gap-[12px] border-b border-cf-border px-[16px] py-[12px] last:border-b-0"
                >
                  <span
                    className={
                      isDone
                        ? 'inline-flex size-[24px] shrink-0 items-center justify-center rounded-full border border-cf-accent bg-cf-accent-soft text-cf-accent'
                        : current
                        ? 'inline-flex size-[24px] shrink-0 items-center justify-center rounded-full border border-cf-accent cf-caption text-cf-ink'
                        : 'inline-flex size-[24px] shrink-0 items-center justify-center rounded-full border border-cf-border-strong cf-caption text-cf-ink-muted'
                    }
                  >
                    {isDone ? <AgentGlyph name="check" size={12} /> : index + 1}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="cf-label-md text-cf-ink">
                      {onboarding.steps[step].short}
                    </span>
                    <span className="cf-caption text-cf-ink-muted">
                      {isDone ? onboarding.stateDone : onboarding.stateOpen}
                    </span>
                  </span>
                  {/*
                    Only what the role can run, and not an adaptation or a
                    reserve before a channel exists (`kcxz.31`, D14; review
                    W3-21 P3-3) — the chat's starters by the same rule.
                  */}
                  {!stepOffered(step, progress, role) ? null : (
                    <Button
                      type="button"
                      density="dense"
                      variant={current ? 'primary' : 'quiet'}
                      disabled={busy}
                      onClick={() => onStarter(step)}
                      aria-label={`${words.panel.doInChat}: ${onboarding.steps[step].short}`}
                    >
                      {words.panel.doInChat}
                    </Button>
                  )}
                </li>
              );
            })}
          </ol>
        </>
      )}
    </div>
  );
}

function PanelHead({
  artifact,
  onClose,
  words,
}: {
  artifact: AgentArtifact | null;
  onClose?: () => void;
  words: AgentWords;
}) {
  // With no name of its own the kind is the name, said once (`kcxz.31`, D8).
  const own = artifact ? artifactOwnName(artifact, words) : null;
  const name = artifact
    ? own ?? words.card.kinds[artifact.kind]
    : words.panel.workspaceTitle;
  return (
    <OpeningBand className="mb-0 shrink-0 gap-[8px] border-b border-cf-border px-[16px] xl:px-[24px]">
      {artifact && own ? (
        <span className="hidden shrink-0 items-center gap-[8px] cf-label-sm text-cf-ink-muted sm:inline-flex">
          {words.card.kinds[artifact.kind]}
        </span>
      ) : null}
      <h2 className="min-w-0 flex-1 truncate cf-label-md text-cf-ink" title={name}>
        {name}
      </h2>
      {artifact ? <OpenOnScreen href={artifactHref(artifact)} words={words} /> : null}
      {artifact && onClose ? (
        <Button
          iconOnly
          type="button"
          variant="quiet"
          density="dense"
          aria-label={words.panel.close}
          onClick={onClose}
        >
          <AgentGlyph name="close" />
        </Button>
      ) : null}
    </OpeningBand>
  );
}

/** The column beside the chat, from 1280 px. */
export function ArtifactColumn({
  artifact,
  onClose,
  empty,
  words,
}: {
  artifact: AgentArtifact | null;
  onClose: () => void;
  /** What the panel shows with nothing open. */
  empty: ReactNode;
  words: AgentWords;
}) {
  return artifact ? (
    <ResolvedColumn artifact={artifact} onClose={onClose} words={words} />
  ) : (
    <ColumnFrame artifact={null} onClose={onClose} words={words}>
      {empty}
    </ColumnFrame>
  );
}

/** The open thing as the loaded piece names it (`kcxz.31`, D8). */
function ResolvedColumn({
  artifact: written,
  onClose,
  words,
}: {
  artifact: AgentArtifact;
  onClose: () => void;
  words: AgentWords;
}) {
  const { artifact } = usePieceArtifact(written);
  return (
    <ColumnFrame artifact={artifact} onClose={onClose} words={words}>
      <ArtifactBody artifact={written} words={words} />
    </ColumnFrame>
  );
}

function ColumnFrame({
  artifact,
  onClose,
  children,
  words,
}: {
  artifact: AgentArtifact | null;
  onClose: () => void;
  children: ReactNode;
  words: AgentWords;
}) {
  return (
    <section
      aria-label={words.panel.label}
      data-agent-panel={artifact ? artifact.kind : 'workspace'}
      className="flex min-h-0 min-w-0 flex-1 flex-col border-s border-cf-border bg-cf-surface"
    >
      <PanelHead artifact={artifact} onClose={onClose} words={words} />
      <div className="min-h-0 flex-1 overflow-y-auto px-[16px] py-[20px] xl:px-[24px]">
        {children}
      </div>
    </section>
  );
}

/**
 * The same panel as a sheet, below 1280 px (canvas CMobile). A dialog: focus
 * stays inside, Escape and the backdrop close it, focus returns to the line
 * that opened it.
 */
export function ArtifactSheet({
  artifact: written,
  onClose,
  words,
}: {
  artifact: AgentArtifact;
  onClose: () => void;
  words: AgentWords;
}) {
  const panel = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useFocusTrap(panel, true);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const { artifact } = usePieceArtifact(written);
  const own = artifactOwnName(artifact, words);
  const kind = words.card.kinds[artifact.kind];

  return (
    <div className="fixed inset-0 z-[60] flex flex-col justify-end">
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{ background: 'var(--cf-backdrop)' }}
        onClick={onClose}
      />
      <section
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={own ? `${kind}: ${own}` : kind}
        tabIndex={-1}
        data-agent-panel={artifact.kind}
        className="relative flex max-h-[88dvh] min-h-[50dvh] flex-col rounded-t-[12px] border-t border-cf-border-strong bg-cf-surface shadow-menu cf-page-enter"
      >
        <span
          aria-hidden="true"
          className="mx-auto mt-[8px] block h-[4px] w-[40px] shrink-0 rounded-full bg-cf-border-strong"
        />
        <PanelHead artifact={artifact} onClose={onClose} words={words} />
        <div className="min-h-0 flex-1 overflow-y-auto px-[16px] py-[16px]">
          <ArtifactBody artifact={written} words={words} />
        </div>
      </section>
    </div>
  );
}
