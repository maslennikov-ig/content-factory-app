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
 * A piece, an avatar, a channel, «Откуда идеи», «Откуда факты» and «Медиатека» open their real screens here — the same components
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

const ContentLeadsTab = dynamic(
  () =>
    import(
      '@contentfactory/frontend/components/content-intelligence/content-leads.tab'
    ).then((module) => module.ContentLeadsTab),
  { ssr: false, loading: () => <SkeletonRows rows={4} /> }
);

const ContentFactsShowcase = dynamic(
  () =>
    import(
      '@contentfactory/frontend/components/content-intelligence/content-facts.showcase'
    ).then((module) => module.ContentFactsShowcase),
  { ssr: false, loading: () => <SkeletonRows rows={4} /> }
);

const MediaBox = dynamic(
  () =>
    import('@contentfactory/frontend/components/media/media.component').then(
      (module) => module.MediaBox
    ),
  { ssr: false, loading: () => <SkeletonRows rows={4} /> }
);

/** The library beside the chat picks nothing: it is looked at, not chosen from. */
const keepMedia = (): void => undefined;

export type StarterKey = OnboardingStepKey;

const textOf = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value : null;

/**
 * «Взять в работу» pressed in the ideas panel: the lead is taken, and the
 * request to write from it goes into the composer (review W4-23 F1).
 */
export type WriteFromLead = (title: string) => void;

function ArtifactBody({
  artifact,
  words,
  onWriteFromLead,
}: {
  artifact: AgentArtifact;
  words: AgentWords;
  onWriteFromLead?: WriteFromLead;
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
  if (artifact.kind === 'ideas') {
    // «Откуда идеи» itself (`kcxz.23`): the subscriptions and the queue,
    // saved the way the tab saves them. «Взять в работу» here takes the lead
    // and puts the request to write from it into the composer — the
    // «Сделать в чате» pattern, never sent (review W4-23 F1). Without a
    // conversation to write in, the tab says only that the lead was taken.
    return onWriteFromLead ? (
      <ContentLeadsTab takenTo="chat" onNavigateToBrief={(lead) => onWriteFromLead(lead.title)} />
    ) : (
      <ContentLeadsTab />
    );
  }
  if (artifact.kind === 'facts') {
    // «Откуда факты» itself (`kcxz.24`): the facts, «Снять» and «Вернуть»
    // saved the way the tab saves them.
    return <ContentFactsShowcase />;
  }
  if (artifact.kind === 'media') {
    // «Медиатека» itself (`kcxz.25`), as its page shows it: newest first, so a
    // picture the chat generated or the composer uploaded is the first one.
    return <MediaBox standalone setMedia={keepMedia} closeModal={keepMedia} />;
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
  onWriteFromLead,
}: {
  artifact: AgentArtifact | null;
  onClose: () => void;
  /** What the panel shows with nothing open. */
  empty: ReactNode;
  words: AgentWords;
  onWriteFromLead?: WriteFromLead;
}) {
  return artifact ? (
    <ResolvedColumn
      artifact={artifact}
      onClose={onClose}
      words={words}
      onWriteFromLead={onWriteFromLead}
    />
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
  onWriteFromLead,
}: {
  artifact: AgentArtifact;
  onClose: () => void;
  words: AgentWords;
  onWriteFromLead?: WriteFromLead;
}) {
  const { artifact } = usePieceArtifact(written);
  return (
    <ColumnFrame artifact={artifact} onClose={onClose} words={words}>
      <ArtifactBody artifact={written} words={words} onWriteFromLead={onWriteFromLead} />
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
  onWriteFromLead,
}: {
  artifact: AgentArtifact;
  onClose: () => void;
  words: AgentWords;
  onWriteFromLead?: WriteFromLead;
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
          <ArtifactBody artifact={written} words={words} onWriteFromLead={onWriteFromLead} />
        </div>
      </section>
    </div>
  );
}
