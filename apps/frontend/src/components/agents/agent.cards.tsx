'use client';

import { useId, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { Button } from '@contentfactory/react/form/button';
import { ButtonLink } from '@contentfactory/react/form/button-link';
import { Input } from '@contentfactory/react/form/input';
import { CheckboxField } from '@contentfactory/react/form/checkbox.field';
import { Progress } from '@contentfactory/frontend/components/ui/progress';
import {
  choiceAnswer,
  consentAnswer,
  DECIDE_FOR_PERSON_ANSWER,
  type AgentApprovalState,
  type AgentArtifact,
  type AgentArtifactKind,
  type AgentQuestion,
} from './agent.contract';
import { errorWordsFor, type AgentWords } from './agent.copy';
import { AgentGlyph, type AgentGlyphName } from './agent.icons';
import { usePieceArtifact } from './agent.piece-data';

/**
 * The chat's cards (`content-factory-next-kcxz.10`, spec §6.2, canvas
 * variant C «Cards»).
 *
 * `AgentCard` is the one frame: a kind line in `label-sm` with its glyph, a
 * title, an optional body and a footer of actions. A card that needs the
 * person (approval, question, key) is a full card; a thing the turn produced
 * is one line in the conversation (`ArtifactLine`) and opens beside the chat.
 * Nothing here talks to the network: answers go back through callbacks, so
 * the frame and the cards render in any state for a test or a review scene.
 */

export type AgentCardTone = 'neutral' | 'warning' | 'danger';

const FRAME_TONE: Record<AgentCardTone, string> = {
  neutral: 'border-cf-border',
  warning: 'border-cf-warning',
  danger: 'border-cf-danger',
};

const HEAD_TONE: Record<AgentCardTone, string> = {
  neutral: 'border-cf-border',
  warning: 'border-cf-warning bg-cf-warning-soft',
  danger: 'border-cf-danger bg-cf-danger-soft',
};

const KIND_TONE: Record<AgentCardTone, string> = {
  neutral: 'text-cf-ink-muted',
  warning: 'text-cf-warning',
  danger: 'text-cf-danger',
};

export function AgentCard({
  tone = 'neutral',
  glyph,
  kind,
  title,
  aside,
  children,
  footer,
  label,
  cardKind,
}: {
  tone?: AgentCardTone;
  glyph: AgentGlyphName;
  kind: string;
  title?: ReactNode;
  /** Right end of the head: a status, «Открыть на экране». */
  aside?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  /** The card's accessible name. */
  label: string;
  /** `data-agent-card`, for tests and the review stand. */
  cardKind: string;
}) {
  const titleId = useId();
  return (
    <section
      aria-label={label}
      aria-describedby={title ? titleId : undefined}
      data-agent-card={cardKind}
      className={clsx(
        'flex min-w-0 flex-col overflow-hidden rounded-[12px] border bg-cf-surface',
        FRAME_TONE[tone]
      )}
    >
      <header
        className={clsx(
          'flex min-w-0 flex-wrap items-center gap-x-[12px] gap-y-[4px] border-b px-[16px] py-[12px]',
          HEAD_TONE[tone]
        )}
      >
        <span
          className={clsx(
            'inline-flex shrink-0 items-center gap-[8px] cf-label-sm',
            KIND_TONE[tone]
          )}
        >
          <AgentGlyph name={glyph} size={14} />
          {kind}
        </span>
        {title ? (
          <span id={titleId} className="min-w-0 cf-label-md text-cf-ink [text-wrap:balance]">
            {title}
          </span>
        ) : null}
        {aside ? (
          <span className="ms-auto inline-flex items-center gap-[8px]">
            {aside}
          </span>
        ) : null}
      </header>
      {children ? (
        <div className="flex min-w-0 flex-col gap-[12px] p-[16px]">
          {children}
        </div>
      ) : null}
      {footer ? (
        <footer className="flex min-w-0 flex-wrap items-center gap-[8px] border-t border-cf-border px-[16px] py-[12px]">
          {footer}
        </footer>
      ) : null}
    </section>
  );
}

/** «Открыть на экране» — the same words and the same control on every card. */
export function OpenOnScreen({ href, words }: { href: string; words: AgentWords }) {
  return (
    <ButtonLink href={href} variant="quiet" density="dense">
      {words.card.openOnScreen}
      <AgentGlyph name="external" size={14} />
    </ButtonLink>
  );
}

/** A row of «what — value», the canvas `kv` grid. */
export function Facts({ rows }: { rows: ReadonlyArray<[string, ReactNode]> }) {
  return (
    <dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-[12px] gap-y-[8px] cf-body-sm">
      {rows.map(([name, value]) => (
        <div key={name} className="contents">
          <dt className="cf-caption text-cf-ink-muted">{name}</dt>
          <dd className="min-w-0 text-cf-ink">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A note inside a card: a glyph and one or two sentences. */
export function Note({
  tone,
  children,
}: {
  tone: 'neutral' | 'warning';
  children: ReactNode;
}) {
  return (
    <p
      className={clsx(
        'flex items-start gap-[8px] rounded-[8px] px-[12px] py-[8px] cf-body-sm text-cf-ink',
        tone === 'warning' ? 'bg-cf-warning-soft' : 'bg-cf-surface-subtle'
      )}
    >
      <span className={tone === 'warning' ? 'pt-[4px] text-cf-warning' : 'pt-[4px] text-cf-info'}>
        <AgentGlyph name={tone === 'warning' ? 'alert' : 'info'} size={14} />
      </span>
      <span className="min-w-0 [text-wrap:pretty]">{children}</span>
    </p>
  );
}

/* ---- Artifact line ---------------------------------------------------------- */

const ARTIFACT_GLYPH: Record<AgentArtifactKind, AgentGlyphName> = {
  piece: 'doc',
  adaptation: 'doc',
  avatar: 'user',
  workspace: 'gauge',
  channels: 'channels',
  channel: 'channels',
  plan: 'calendar',
};

/**
 * The name a produced thing goes by, in the line and in the panel head. An
 * adaptation has no title of its own: it is its channel and its variant
 * («Канал про работу · вариант 2», `kcxz.16`).
 */
export const artifactName = (artifact: AgentArtifact, words: AgentWords): string =>
  artifactOwnName(artifact, words) ?? words.card.kinds[artifact.kind];

/**
 * The name when the thing has one of its own; `null` when all there is to
 * say is its kind — then the kind is said once, not «Адаптация Адаптация»
 * (`kcxz.31`, D8).
 */
export const artifactOwnName = (
  artifact: AgentArtifact,
  words: AgentWords
): string | null => {
  const kind = words.card.kinds[artifact.kind];
  if (artifact.kind === 'adaptation' || artifact.kind === 'plan') {
    const channel = artifact.data.channel;
    const name =
      channel && typeof channel === 'object' && 'name' in channel &&
      typeof channel.name === 'string' && channel.name.trim()
        ? channel.name
        : null;
    const variant =
      typeof artifact.data.variant === 'number' && artifact.data.variant > 0
        ? words.card.variant(artifact.data.variant)
        : null;
    if (name || variant) return [name ?? kind, variant].filter(Boolean).join(' · ');
  }
  const own = artifact.title ?? artifact.code;
  return own && own !== kind ? own : null;
};

/**
 * A thing the turn produced, as one line (canvas C «свёрнутые строки»): its
 * kind, its name, and either «открыто рядом» or the control that opens it.
 */
export function ArtifactLine({
  artifact: written,
  open,
  removed = false,
  latest = true,
  onOpen,
  words,
}: {
  artifact: AgentArtifact;
  /** It is the one shown beside the chat right now. */
  open: boolean;
  /** Deleted later in this conversation: named, not offered (kcxz.29, D6). */
  removed?: boolean;
  /**
   * The last line of this piece in the conversation. An earlier one does
   * not repeat the count of open questions from its own moment (`kcxz.31`,
   * D12), unless the loaded piece tells the count as it is now.
   */
  latest?: boolean;
  onOpen: (artifact: AgentArtifact) => void;
  words: AgentWords;
}) {
  // What the loaded piece adds: the channel and variant of an adaptation
  // card that named only its id, the open questions as they are now.
  const { artifact, loaded } = usePieceArtifact(written);
  const kind = words.card.kinds[artifact.kind];
  const own = artifactOwnName(artifact, words);
  const name = own ?? kind;
  const questions =
    artifact.kind === 'piece' &&
    typeof artifact.data.questions === 'number' &&
    (latest || loaded)
      ? artifact.data.questions
      : 0;
  return (
    <div
      data-agent-artifact={artifact.kind}
      data-agent-artifact-removed={removed || undefined}
      className={clsx(
        'flex min-w-0 flex-wrap items-center gap-x-[12px] gap-y-[4px] rounded-[12px] border py-[8px] pe-[8px] ps-[12px]',
        open && !removed
          ? 'border-cf-accent bg-cf-accent-soft'
          : 'border-cf-border bg-cf-surface'
      )}
    >
      <span
        className={clsx(
          'inline-flex items-center gap-[8px] cf-label-sm text-cf-ink-muted',
          own ? 'shrink-0' : 'min-w-0 flex-1'
        )}
      >
        <AgentGlyph name={ARTIFACT_GLYPH[artifact.kind]} size={14} />
        {kind}
      </span>
      {own ? (
        <span className="min-w-0 flex-1 truncate cf-body-sm text-cf-ink" title={own}>
          {own}
        </span>
      ) : null}
      {artifact.code && artifact.title ? (
        <span className="hidden shrink-0 cf-caption text-cf-ink-muted sm:inline">
          {artifact.code}
        </span>
      ) : null}
      {removed ? (
        <span className="shrink-0 pe-[4px] cf-caption text-cf-ink-muted">
          {words.card.removed}
        </span>
      ) : open ? (
        <span className="shrink-0 pe-[4px] cf-caption text-cf-accent">
          {words.card.openedBeside}
        </span>
      ) : (
        <Button
          type="button"
          variant="quiet"
          density="dense"
          onClick={() => onOpen(artifact)}
          aria-label={
            own ? `${words.card.openBeside}: ${kind} «${own}»` : `${words.card.openBeside}: ${kind}`
          }
        >
          <span className="hidden sm:inline">{words.card.openBeside}</span>
          <AgentGlyph name="right" size={14} />
        </Button>
      )}
      {questions > 0 && !removed ? (
        // The piece is written but not finished: its open questions wait on
        // the piece card (kcxz.29, D4).
        <p className="flex w-full min-w-0 items-center gap-[8px] cf-caption text-cf-ink">
          <span className="text-cf-warning">
            <AgentGlyph name="info" size={12} />
          </span>
          <span className="min-w-0 [text-wrap:pretty]">
            {words.card.pieceQuestions(questions)}
          </span>
        </p>
      ) : null}
    </div>
  );
}

/** A finished step that produced nothing to open: one quiet line. */
export function DoneLine({
  title,
  stale = false,
  words,
}: {
  title: string | null;
  /**
   * A proposal of changes answered after its text changed (`kcxz.32`, N2):
   * nothing was applied, and the line says so instead of «Готово».
   */
  stale?: boolean;
  words: AgentWords;
}) {
  if (stale) {
    return (
      <p
        data-agent-done="stale"
        className="flex min-w-0 items-center gap-[8px] cf-caption text-cf-ink-muted"
      >
        <AgentGlyph name="close" size={12} />
        <span className="min-w-0 truncate">
          {title ? `${title} — ${words.question.stale}` : words.question.stale}
        </span>
      </p>
    );
  }
  return (
    <p className="flex min-w-0 items-center gap-[8px] cf-caption text-cf-ink-muted">
      <span className="text-cf-accent">
        <AgentGlyph name="check" size={12} />
      </span>
      <span className="min-w-0 truncate">
        {title ? `${words.card.done}: ${title}` : words.card.done}
      </span>
    </p>
  );
}

/* ---- Approval --------------------------------------------------------------- */

/**
 * «Нужно ваше „да“» — one component for every confirm-class action (spec §1.2,
 * §1.4). The question is the tool's own label, what happens is the server's
 * `requestReason`, and a deletion says it cannot be taken back.
 */
/**
 * Which footnote an approval carries (`kcxz.31`, D7): a deletion cannot be
 * undone; a post sent now is not taken back from here; a scheduled or moved
 * post can come off the schedule before it goes out; the rest can be undone
 * on the product screen.
 */
const SCHEDULE_TOOLS: readonly string[] = ['plan_schedule', 'plan_move', 'plan_apply'];
export const approvalNoteOf = (
  toolName: string | null | undefined,
  irreversible: boolean
): 'delete' | 'publish' | 'schedule' | 'undo' =>
  irreversible
    ? 'delete'
    : toolName === 'plan_publish_now'
      ? 'publish'
      : toolName && SCHEDULE_TOOLS.includes(toolName)
        ? 'schedule'
        : 'undo';

export function ApprovalCard({
  title,
  reason,
  irreversible,
  toolName = null,
  state,
  busy,
  sending = null,
  onAnswer,
  words,
}: {
  title: string | null;
  reason: string | null;
  irreversible: boolean;
  /** The tool asking: picks the footnote (`approvalNoteOf`). */
  toolName?: string | null;
  state: AgentApprovalState;
  /** The chat is streaming; an answer waits for it. */
  busy: boolean;
  /**
   * The answer on its way, until the door takes it (`kcxz.32`, N1): the card
   * stays with that button loading, never «ответ отправлен» before.
   */
  sending?: boolean | null;
  onAnswer: (approved: boolean) => void;
  words: AgentWords;
}) {
  const w = words.approval;
  const action = title ?? w.fallbackAction;
  const [picked, setAnswer] = useState<boolean | null>(null);
  const answer = sending ?? picked;
  const settled = state !== 'asked';

  if (settled) {
    const word =
      state === 'approved'
        ? w.approved
        : state === 'declined'
          ? w.declined
          : state === 'closed'
            ? w.closed
            : w.sent;
    return (
      <p
        data-agent-card="approval"
        data-agent-approval={state}
        className="flex min-w-0 items-center gap-[8px] cf-caption text-cf-ink-muted"
      >
        <AgentGlyph
          name={state === 'declined' || state === 'closed' ? 'close' : 'check'}
          size={12}
        />
        <span className="min-w-0 truncate">
          {action} — {word}
        </span>
      </p>
    );
  }

  const answerWith = (approved: boolean) => {
    setAnswer(approved);
    onAnswer(approved);
  };
  const note = approvalNoteOf(toolName, irreversible);

  return (
    <AgentCard
      cardKind="approval"
      tone="warning"
      glyph="alert"
      kind={w.kind}
      title={w.ask(action)}
      label={`${w.kind}: ${w.ask(action)}`}
      footer={
        <>
          <Button
            type="button"
            density="dense"
            variant={irreversible ? 'destructive' : 'primary'}
            disabled={busy || answer !== null}
            loading={answer === true}
            loadingLabel={w.sending}
            onClick={() => answerWith(true)}
          >
            {w.yes}
          </Button>
          <Button
            type="button"
            density="dense"
            variant="secondary"
            disabled={busy || answer !== null}
            loading={answer === false}
            loadingLabel={w.sending}
            onClick={() => answerWith(false)}
          >
            {w.no}
          </Button>
        </>
      }
    >
      {reason ? <Facts rows={[[w.what, reason]]} /> : null}
      {note === 'delete' ? (
        <Note tone="warning">
          <strong>{w.irreversible}:</strong> {w.irreversibleNote}
        </Note>
      ) : note === 'publish' ? (
        <Note tone="warning">
          <strong>{w.publishHeading}:</strong> {w.publishNote}
        </Note>
      ) : (
        <Note tone="neutral">
          {note === 'schedule' ? w.scheduleNote : w.reversibleNote}
        </Note>
      )}
    </AgentCard>
  );
}

/* ---- Question --------------------------------------------------------------- */

/**
 * One question with its answers on view and «Решите за меня» where the
 * product may decide (spec §1.9). Consent is the person's own: the avatar's
 * card has a box to tick and no «Решите за меня».
 */
/**
 * A question card folded to its line: answered, or no longer waiting — the
 * server closed it, a later turn went on without it (`kcxz.31`, D2). Said in
 * words and a glyph, so the person knows the card is not simply broken.
 */
export function QuestionClosedLine({
  kind,
  text,
  state,
  words,
}: {
  kind: string;
  text: string;
  /**
   * `stale`: answered, but the proposal was for a text that has changed since
   * — nothing was applied (`kcxz.32`, N2).
   */
  state: 'answered' | 'closed' | 'stale';
  words: AgentWords;
}) {
  return (
    <p
      data-agent-card="question"
      data-agent-question={state}
      className="flex min-w-0 items-center gap-[8px] cf-caption text-cf-ink-muted"
    >
      <AgentGlyph name={state === 'answered' ? 'check' : 'close'} size={12} />
      <span className="min-w-0 truncate" title={text || undefined}>
        {text ? `${kind}: ${text}` : kind} —{' '}
        {state === 'closed'
          ? words.question.closed
          : state === 'stale'
            ? words.question.stale
            : words.question.answered}
      </span>
    </p>
  );
}

export function QuestionCard({
  title,
  question,
  answered,
  stale = false,
  busy,
  onAnswer,
  words,
}: {
  title: string | null;
  question: AgentQuestion;
  answered: boolean;
  /** Answered after its text changed: nothing applied (`kcxz.32`, N2). */
  stale?: boolean;
  busy: boolean;
  onAnswer: (resumeData: Record<string, unknown>) => void;
  words: AgentWords;
}) {
  const w = words.question;
  const [sent, setSent] = useState<string | null>(null);
  const [own, setOwn] = useState('');
  const [consent, setConsent] = useState(false);
  const [name, setName] = useState('');
  const ownId = useId();

  if (answered) {
    return (
      <QuestionClosedLine
        kind={question.kind === 'selection' ? words.selection.kind : w.kind}
        text={question.text || title || ''}
        state={stale ? 'stale' : 'answered'}
        words={words}
      />
    );
  }

  const send = (key: string, resumeData: Record<string, unknown>) => {
    setSent(key);
    onAnswer(resumeData);
  };
  const locked = busy || sent !== null;

  if (question.kind === 'consent' && question.subject === 'autopilot') {
    // Writing into an autopilot channel (`kcxz.14`): the server's words name
    // the channel and the queue; the button is the consent. Only the person
    // decides here — no «Решите за меня».
    return (
      <AgentCard
        cardKind="question"
        glyph="user"
        kind={w.kind}
        title={title}
        label={`${w.kind}: ${question.text}`}
        footer={
          <>
            <Button
              type="button"
              density="dense"
              disabled={locked}
              loading={sent === 'yes'}
              loadingLabel={w.sending}
              data-agent-consent="autopilot"
              onClick={() => send('yes', consentAnswer(question, true, ''))}
            >
              {w.autopilotWrite}
            </Button>
            <Button
              type="button"
              density="dense"
              variant="quiet"
              disabled={locked}
              loading={sent === 'no'}
              loadingLabel={w.sending}
              onClick={() => send('no', consentAnswer(question, false, ''))}
            >
              {w.autopilotSkip}
            </Button>
          </>
        }
      >
        <p className="cf-body-md text-cf-ink [text-wrap:pretty]">{question.text}</p>
      </AgentCard>
    );
  }

  if (question.kind === 'consent') {
    return (
      <AgentCard
        cardKind="question"
        glyph="user"
        kind={w.kind}
        title={title}
        label={`${w.kind}: ${question.text}`}
        footer={
          <>
            <Button
              type="button"
              density="dense"
              disabled={locked || !consent}
              loading={sent === 'yes'}
              loadingLabel={w.sending}
              onClick={() => send('yes', consentAnswer(question, true, name))}
            >
              {w.activate}
            </Button>
            <Button
              type="button"
              density="dense"
              variant="quiet"
              disabled={locked}
              loading={sent === 'no'}
              loadingLabel={w.sending}
              onClick={() => send('no', consentAnswer(question, false, ''))}
            >
              {w.notNow}
            </Button>
          </>
        }
      >
        <p className="cf-body-md text-cf-ink [text-wrap:pretty]">{question.text}</p>
        {question.nameKey ? (
          <Input
            standalone
            density="dense"
            label={w.nameLabel}
            value={name}
            maxLength={120}
            placeholder={w.namePlaceholder}
            disabled={locked}
            onChange={(event) => setName(event.target.value)}
          />
        ) : null}
        <CheckboxField
          label={w.consentLabel}
          checked={consent}
          disabled={locked}
          onChange={(event) => setConsent(event.target.checked)}
        />
      </AgentCard>
    );
  }

  // An open selection or interview is the conversation's own card
  // (`SelectionCard`, `InterviewCard`); answered, it folded into the line above.
  if (question.kind === 'selection' || question.kind === 'interview') return null;

  return (
    <AgentCard
      cardKind="question"
      glyph="ask"
      kind={w.kind}
      label={`${w.kind}: ${question.text}`}
      footer={
        question.canDecideForPerson ? (
          <Button
            type="button"
            density="dense"
            variant="secondary"
            disabled={locked}
            loading={sent === 'decide'}
            loadingLabel={w.sending}
            onClick={() => send('decide', { ...DECIDE_FOR_PERSON_ANSWER })}
          >
            <AgentGlyph name="spark" size={14} />
            {w.decide}
          </Button>
        ) : undefined
      }
    >
      <p className="cf-body-sm text-cf-ink-muted">{w.lead}</p>
      <p className="cf-body-md text-cf-ink [text-wrap:pretty]">{question.text}</p>
      {question.options.length ? (
        <div className="flex flex-wrap gap-[8px]">
          {question.options.map((option) => (
            <Button
              key={option.id}
              type="button"
              density="dense"
              variant="secondary"
              disabled={locked}
              loading={sent === option.id}
              loadingLabel={w.sending}
              onClick={() => send(option.id, choiceAnswer(question, option.id))}
            >
              {option.label}
            </Button>
          ))}
        </div>
      ) : null}
      <form
        className="flex min-w-0 items-end gap-[8px]"
        onSubmit={(event) => {
          event.preventDefault();
          if (own.trim()) send('own', choiceAnswer(question, own.trim()));
        }}
      >
        <Input
          standalone
          id={ownId}
          density="dense"
          label={w.ownAnswer}
          value={own}
          disabled={locked}
          fieldClassName="min-w-0 flex-1"
          onChange={(event) => setOwn(event.target.value)}
        />
        <Button
          type="submit"
          density="dense"
          variant="secondary"
          disabled={locked || !own.trim()}
          loading={sent === 'own'}
          loadingLabel={w.sending}
        >
          {w.send}
        </Button>
      </form>
    </AgentCard>
  );
}

/* ---- Progress --------------------------------------------------------------- */

/**
 * The running step (canvas «Ход работы · идёт»): what runs, the step it has
 * reached, the steps so far. The step list is announced as it grows.
 */
export function ProgressCard({
  title,
  current,
  steps,
  onStop,
  words,
}: {
  title: string | null;
  /** The word for the step running now. */
  current: string;
  /** Words of the steps already reached, oldest first, without `current`. */
  steps: readonly string[];
  onStop?: () => void;
  words: AgentWords;
}) {
  const w = words.progress;
  return (
    <AgentCard
      cardKind="progress"
      glyph="bolt"
      kind={w.kind}
      title={title}
      label={`${w.kind}: ${title ?? current}`}
      footer={
        <>
          {onStop ? (
            <Button type="button" density="dense" variant="quiet" onClick={onStop}>
              <AgentGlyph name="stop" size={14} />
              {w.stop}
            </Button>
          ) : null}
          <span className="ms-auto cf-caption text-cf-ink-muted">{w.leaveNote}</span>
        </>
      }
    >
      <Progress mode="indeterminate" label={title ?? current} />
      <ol aria-label={w.stepsLabel} aria-live="polite" className="flex flex-col gap-[8px]">
        {steps.map((step, index) => (
          <li key={`${step}-${index}`} className="flex items-center gap-[8px] cf-body-sm text-cf-ink">
            <span className="text-cf-accent">
              <AgentGlyph name="check" size={12} />
            </span>
            {step}
          </li>
        ))}
        <li className="flex items-center gap-[8px] cf-label-md text-cf-ink">
          <span className="text-cf-accent">
            <AgentGlyph name="bolt" size={12} />
          </span>
          {current}
        </li>
      </ol>
    </AgentCard>
  );
}

/* ---- Error ------------------------------------------------------------------ */

/**
 * «Не получилось» (spec §6.2): the product's code in plain words, the next
 * step, and one way on. An unknown code keeps its name in small print, so the
 * person can quote it.
 */
export function ErrorCard({
  title,
  code,
  network,
  refusal = false,
  onRetry,
  href,
  words,
}: {
  title: string | null;
  code: string | null;
  /** The request never came back, not a refusal. */
  network?: boolean;
  /**
   * An action answered «no» with a reason (`{ ok: false, code }`): trying
   * again changes nothing, the agent's answer below says why (kcxz.29, D7).
   */
  refusal?: boolean;
  onRetry?: () => void;
  href?: string | null;
  words: AgentWords;
}) {
  const w = words.error;
  const known = network
    ? { ...w.network, known: true }
    : errorWordsFor(words, code, refusal);
  return (
    <AgentCard
      cardKind="error"
      tone="danger"
      glyph="alert"
      kind={w.kind}
      title={title ?? undefined}
      label={`${w.kind}${title ? `: ${title}` : ''}`}
      footer={
        onRetry || href ? (
          <>
            {onRetry ? (
              <Button type="button" density="dense" onClick={onRetry}>
                {w.retry}
              </Button>
            ) : null}
            {href ? <OpenOnScreen href={href} words={words} /> : null}
          </>
        ) : undefined
      }
    >
      <div role="alert" className="flex flex-col gap-[4px]">
        <p className="cf-body-md text-cf-ink [text-wrap:pretty]">{known.what}</p>
        <p className="cf-body-sm text-cf-ink-muted [text-wrap:pretty]">{known.next}</p>
      </div>
      {code && !known.known ? (
        <p className="cf-caption text-cf-ink-muted">{w.code(code)}</p>
      ) : null}
    </AgentCard>
  );
}
