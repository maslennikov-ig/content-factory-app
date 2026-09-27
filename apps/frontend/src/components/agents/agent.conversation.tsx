'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useChat } from '@ai-sdk/react';
import { useSWRConfig } from 'swr';
import { Button } from '@contentfactory/react/form/button';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { CfMark } from '@contentfactory/frontend/components/ui/brand/cf-mark';
import { WorkingLine } from '@contentfactory/frontend/components/ui/working-line';
import { useOnboardingProgress } from '@contentfactory/frontend/components/onboarding/use-onboarding-progress';
import {
  ONBOARDING_STEP_KEYS,
  stepIsDone,
  type OnboardingStepKey,
} from '@contentfactory/frontend/components/onboarding/onboarding.adapter';
import {
  AGENT_DOORS,
  AGENT_TIMEZONE_HEADER,
  approvalWaits,
  artifactKey,
  artifactsOf,
  errorCodeOf,
  pendingCardId,
  pieceTouchesOf,
  provisionalTitle,
  questionWaits,
  readThreadHistory,
  readDoorError,
  readMessageBlocks,
  readProgressPart,
  removedArtifactsOf,
  reopenApprovalAnswer,
  toolNameOf,
  waitingApprovalIds,
  withoutRepeatedQuestionLines,
  type AgentArtifact,
  type AgentBlock,
  type AgentMessage,
  type AgentPendingRun,
} from './agent.contract';
import { stageWordFor, type AgentWords } from './agent.copy';
import {
  ApprovalCard,
  ArtifactLine,
  DoneLine,
  ErrorCard,
  Note,
  ProgressCard,
  QuestionCard,
  QuestionClosedLine,
} from './agent.cards';
import { SecretCard } from './agent.secret-card';
import { SelectionCard } from './agent.selection-card';
import { InterviewCard } from './agent.interview-card';
import { PlanCard } from './agent.plan-card';
import { AgentMarkdown } from './agent.markdown';
import { AgentComposer, type ComposerSubmit } from './agent.composer';
import { ALLOWANCE_API } from '@contentfactory/frontend/components/ui/allowance-hint';
import { THREADS_KEY } from './agent.threads';
import { createAgentTransport, screenTimeZone } from './agent.transport';
import { PIECES_API } from '@contentfactory/frontend/components/content-intelligence/pieces/pieces.adapter';
import { useUser } from '@contentfactory/frontend/components/layout/user.context';
import { starterAllowed } from './agent.starters';
import { AgentGlyph } from './agent.icons';

/**
 * One conversation on `useChat` (`content-factory-next-kcxz.10`, spec §4.4).
 *
 * The transport is the AI SDK's own, pointed at `POST /agent/chat` through the
 * product's fetch (auth, workspace header, the shared refusal handler). The
 * body is built by `agent.contract.ts`: the last message only, or a resume.
 * Approvals are native: `addToolApprovalResponse`, then — once every card
 * of that message's step is answered — `sendMessage()`, which the SDK sends
 * for the message the card is in, wherever it is in the conversation
 * (`kcxz.32`, N1: the automatic send looked at the last message only, and an
 * answer on a card further up never left the page). A card answers only
 * while the server's `pending` list holds it, and says «ответ отправлен»
 * only once the door took the request. A question is answered with
 * `sendMessage(undefined, { body: { resume } })`, which continues the same
 * assistant message the way the server streams it.
 *
 * The conversation is a `log`: new messages are announced, and a message that
 * is still streaming is `aria-busy`, so a screen reader hears it once, whole,
 * rather than token by token.
 */

const STARTER_ORDER: readonly OnboardingStepKey[] = [
  'avatar',
  'channel',
  'piece',
  'plan',
];

/** The same run of the server's list: its id and its call. */
const sameRun = (one: AgentPendingRun, other: AgentPendingRun) =>
  one.runId === other.runId && one.toolCallId === other.toolCallId;

/** What a question's folded line names: its kind and its words. */
const closedLineOf = (
  block: Extract<AgentBlock, { type: 'question' }>,
  words: AgentWords
) => ({
  kind:
    block.question.kind === 'selection'
      ? words.selection.kind
      : block.question.kind === 'interview'
        ? words.interview.badge
        : words.question.kind,
  text:
    block.question.kind === 'interview'
      ? words.interview.title(block.question.questions.length)
      : block.question.text || block.title || '',
});

const isNetworkFailure = (error: Error) =>
  error.name === 'TypeError' || /failed to fetch|network/i.test(error.message);

export function AgentConversation({
  threadId,
  initialMessages,
  pending,
  onThreadId,
  onTitle,
  onArtifact,
  openArtifact,
  onArtifactRemoved,
  starter,
  onStarterUsed,
  words,
}: {
  threadId: string | null;
  initialMessages: AgentMessage[];
  pending: AgentPendingRun[];
  /** The server named the thread a first message opened. */
  onThreadId: (id: string) => void;
  onTitle: (title: string | null) => void;
  /** The turn produced something, or the person asked to open it. */
  onArtifact: (artifact: AgentArtifact, how: 'produced' | 'asked') => void;
  openArtifact: AgentArtifact | null;
  /** The open artifact was deleted in this conversation: close it. */
  onArtifactRemoved: () => void;
  /** A starter chosen outside the conversation (the work panel). */
  starter: string | null;
  onStarterUsed: () => void;
  words: AgentWords;
}) {
  const request = useFetch();
  const { mutate } = useSWRConfig();
  const thread = useRef(threadId);
  useEffect(() => {
    if (threadId) thread.current = threadId;
  }, [threadId]);
  const announceThread = useRef(onThreadId);
  announceThread.current = onThreadId;

  const transport = useMemo(
    () =>
      createAgentTransport({
        request,
        currentThread: () => thread.current,
        onThread: (named) => {
          thread.current = named;
          announceThread.current(named);
        },
      }),
    [request]
  );

  /*
    The server's `pending` list (`kcxz.31`, D2): read with the thread, and
    read again after every turn, so a card further up the conversation is
    answerable while the server still waits for it. `pendingKnown` is false
    from a turn's start until that read comes back; meanwhile the cards of
    the last message stand on what the stream said.
  */
  const [serverPending, setServerPending] = useState(pending);
  const [pendingKnown, setPendingKnown] = useState(true);
  /*
    Every question card the server listed while this conversation was open
    (`kcxz.38`, R2). A history read while a card waited has no question part
    of its own; once the list drops the card, this keeps it drawn as a line
    that says it no longer waits, instead of letting it vanish.
  */
  const [seenQuestions, setSeenQuestions] = useState<readonly AgentPendingRun[]>(
    () => pending.filter((run) => run.kind === 'question')
  );
  /** `setMessages` of the chat below, for a thread read again whole. */
  const replaceMessages = useRef<((next: AgentMessage[]) => void) | null>(null);
  const refreshPending = useCallback(
    async (
      /** Also take the thread's messages: another tab moved it on (R2). */
      withMessages = false
    ) => {
      const id = thread.current;
      if (!id) return;
      try {
        const zone = screenTimeZone();
        const response = await request(
          AGENT_DOORS.thread(id),
          zone ? { headers: { [AGENT_TIMEZONE_HEADER]: zone } } : {}
        );
        if (!response.ok) return;
        const history = readThreadHistory(await response.json());
        setServerPending(history.pending);
        setSeenQuestions((seen) => [
          ...seen,
          ...history.pending.filter(
            (run) => run.kind === 'question' && !seen.some((one) => sameRun(one, run))
          ),
        ]);
        setPendingKnown(true);
        if (withMessages && history.messages.length) {
          replaceMessages.current?.(history.messages);
        }
      } catch {
        // Not read: the last message's cards keep the stream's word.
      }
    },
    [request]
  );
  const goneQuestions = useMemo(
    () => seenQuestions.filter((run) => !serverPending.some((one) => sameRun(one, run))),
    [seenQuestions, serverPending]
  );

  /** Stage words per tool, from the transient `data-progress` parts. */
  const [stages, setStages] = useState<Record<string, string[]>>({});

  const {
    messages,
    sendMessage,
    status,
    stop,
    error,
    clearError,
    regenerate,
    addToolApprovalResponse,
    setMessages,
  } = useChat<AgentMessage>({
    messages: initialMessages,
    transport,
    throttle: 50,
    // No automatic send: an approval answer is sent by `answerApproval`,
    // once, for the message its card is in (`kcxz.32`, N1).
    onData: (part) => {
      const progress = readProgressPart(part as { type: string; data?: unknown });
      if (!progress) return;
      const tool = toolNameOf(progress.capability);
      const word = stageWordFor(words, progress.stage);
      setStages((current) => {
        const seen = current[tool] ?? [];
        return seen[seen.length - 1] === word
          ? current
          : { ...current, [tool]: [...seen, word] };
      });
    },
    onFinish: () => {
      setStages({});
      void refreshPending();
      void mutate(THREADS_KEY);
      // Every turn spends from the allowance; the line under the composer
      // says what is left after it, not before it (kcxz.29, D8).
      void mutate(ALLOWANCE_API);
    },
  });

  replaceMessages.current = setMessages;

  const busy = status === 'submitted' || status === 'streaming';
  useEffect(() => {
    if (busy) setPendingKnown(false);
  }, [busy]);

  /* ---- Sending ------------------------------------------------------------ */

  const [queued, setQueued] = useState<ComposerSubmit | null>(null);

  /** The last failed request was an approval answer (its card asks again). */
  const approvalFailed = useRef(false);
  /** An approval request left: `submitted` is set by the SDK before it returns. */
  const approvalSent = useRef(false);

  const send = useCallback(
    (message: ComposerSubmit) => {
      clearError();
      approvalFailed.current = false;
      void sendMessage(
        message.text
          ? { text: message.text, files: message.files }
          : { files: message.files }
      );
    },
    [clearError, sendMessage]
  );

  const submit = useCallback(
    (message: ComposerSubmit) => (busy ? setQueued(message) : send(message)),
    [busy, send]
  );

  useEffect(() => {
    if (!busy && queued) {
      send(queued);
      setQueued(null);
    }
  }, [busy, queued, send]);

  useEffect(() => {
    if (starter && !busy) {
      send({ text: starter, files: [] });
      onStarterUsed();
    }
  }, [busy, onStarterUsed, send, starter]);

  // Cards answered in this conversation. The thread's `pending` list was read
  // once, at load; a card of it answered here stops winning over what the
  // stream brings next — the call's next card (review W2 F3).
  const [answeredCards, setAnsweredCards] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const openPending = useMemo(
    () =>
      serverPending.filter((run) => {
        const card = pendingCardId(run);
        return !card || !answeredCards.has(card);
      }),
    [answeredCards, serverPending]
  );

  /*
    Approval answers on their way (`kcxz.32`, N1): the card shows «Отправляем
    ответ» until the door takes the request — the stream starts — and says
    «ответ отправлен» only then. A request the door refused puts the card
    back: asked again, or «больше не ждёт ответа» when the server says so.
    `approvalTries` remounts a card that was put back, so its buttons live.
  */
  const [sendingApprovals, setSendingApprovals] = useState<
    ReadonlyMap<string, boolean>
  >(() => new Map());
  const [approvalTries, setApprovalTries] = useState<Record<string, number>>({});
  const [closedApprovals, setClosedApprovals] = useState<ReadonlySet<string>>(
    () => new Set()
  );

  const answerApproval = useCallback(
    async (
      message: AgentMessage,
      approvalId: string,
      approved: boolean,
      /** Whether a card still waits, as the conversation draws it. */
      waits: (id: string) => boolean
    ) => {
      clearError();
      approvalFailed.current = false;
      // The server's list is the truth: a card it no longer holds sends
      // nothing and says so (N1, D2).
      if (!waits(approvalId)) {
        setClosedApprovals((seen) => new Set(seen).add(approvalId));
        return;
      }
      const answered = new Map(sendingApprovals).set(approvalId, approved);
      setSendingApprovals(answered);
      await addToolApprovalResponse({ id: approvalId, approved });
      // One request per step: when every card of this message's step that
      // still waits is answered, the SDK sends it for this very message.
      const remaining = waitingApprovalIds(message).filter(
        (id) => !answered.has(id) && waits(id)
      );
      if (remaining.length) return;
      approvalSent.current = true;
      void sendMessage();
    },
    [addToolApprovalResponse, clearError, sendMessage, sendingApprovals]
  );

  // The door took the request (the stream began), or did not.
  useEffect(() => {
    if (!sendingApprovals.size || !approvalSent.current) return;
    if (status === 'submitted') return;
    approvalSent.current = false;
    if (status === 'streaming') {
      setSendingApprovals(new Map());
      return;
    }
    // Refused, failed, or stopped before the stream: nothing says «отправлен».
    // The list is read again; a card the server no longer holds closes.
    const gone =
      status === 'error' &&
      !!error &&
      (errorCodeOf(error.message) ?? readDoorError(error.message)) === 'AGENT_RUN_NOT_PENDING';
    const ids = [...sendingApprovals.keys()];
    setMessages((current) =>
      ids.reduce((all, id) => reopenApprovalAnswer(all, id, gone), current)
    );
    setApprovalTries((tries) => {
      const next = { ...tries };
      for (const id of ids) next[id] = (next[id] ?? 0) + 1;
      return next;
    });
    setSendingApprovals(new Map());
    if (status === 'error') approvalFailed.current = true;
    // The card itself says it no longer waits; no second error card.
    if (gone) clearError();
    void refreshPending();
  }, [clearError, error, refreshPending, sendingApprovals, setMessages, status]);

  /** The card of the question answer on its way (`kcxz.32`, D2), and its call. */
  const questionSent = useRef<{ cardId: string; toolCallId: string | null } | null>(null);

  const answerQuestion = useCallback(
    (
      runId: string,
      toolCallId: string | null,
      cardId: string | null,
      resumeData: Record<string, unknown>
    ) => {
      clearError();
      approvalFailed.current = false;
      if (cardId) setAnsweredCards((seen) => new Set(seen).add(cardId));
      questionSent.current = cardId ? { cardId, toolCallId } : null;
      void sendMessage(undefined, {
        body: { resume: { runId, toolCallId, cardId, resumeData } },
      });
    },
    [clearError, sendMessage]
  );

  // The same for a question (`kcxz.32`, D2): a card answered from further up
  // folds into «отвечено»; refused as no longer pending it says «больше не
  // ждёт ответа», any other failure lets the person answer it again.
  const [closedCards, setClosedCards] = useState<ReadonlySet<string>>(() => new Set());
  // Calls whose card was refused here as no longer waiting: their line keeps
  // saying so after the thread is read again with the other tab's outcome
  // (`kcxz.38`, R2).
  const [closedCalls, setClosedCalls] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => {
    const sent = questionSent.current;
    if (!sent || status === 'submitted') return;
    questionSent.current = null;
    if (status !== 'error') return;
    const { cardId, toolCallId } = sent;
    const gone =
      !!error &&
      (errorCodeOf(error.message) ?? readDoorError(error.message)) === 'AGENT_RUN_NOT_PENDING';
    if (gone) {
      setClosedCards((seen) => new Set(seen).add(cardId));
      if (toolCallId) setClosedCalls((seen) => new Set(seen).add(toolCallId));
      // The server said it holds no such card: the list drops it now, so the
      // card stays a line even when the thread cannot be read again.
      setServerPending((runs) => runs.filter((run) => pendingCardId(run) !== cardId));
      // The card itself says «больше не ждёт ответа»; there is nothing to
      // try again, so no error card under it (`kcxz.34`, F3).
      clearError();
      // Another tab answered it: read the thread whole, so this tab shows
      // what came of that answer without a reload (R2).
      void refreshPending(true);
      return;
    }
    setAnsweredCards((seen) => {
      const next = new Set(seen);
      next.delete(cardId);
      return next;
    });
    void refreshPending();
  }, [clearError, error, refreshPending, status]);

  /* ---- What the screen hears about --------------------------------------- */

  useEffect(() => {
    onTitle(provisionalTitle(messages));
  }, [messages, onTitle]);

  const artifacts = useMemo(() => artifactsOf(messages), [messages]);
  const removed = useMemo(() => removedArtifactsOf(messages), [messages]);
  const openKey = openArtifact ? artifactKey(openArtifact) : null;
  const artifactGone = useRef(onArtifactRemoved);
  artifactGone.current = onArtifactRemoved;
  useEffect(() => {
    // The piece beside the chat was deleted: its panel would show a dead
    // screen with live buttons (kcxz.29, D6).
    if (openKey && removed.has(openKey)) artifactGone.current();
  }, [openKey, removed]);
  const latest = artifacts[artifacts.length - 1];
  const latestKey = latest ? `${latest.kind}:${latest.id}` : null;
  const shownKey = useRef<string | null>(null);
  useEffect(() => {
    if (!latest || latestKey === shownKey.current) return;
    shownKey.current = latestKey;
    onArtifact(latest, 'produced');
  }, [latest, latestKey, onArtifact]);

  // A tool call that touched a piece (an answer, an adaptation, a review, a
  // plan move) makes the piece screen beside the chat read it again
  // (`kcxz.31`, D6). What the thread loaded with is already current.
  const touches = useMemo(() => pieceTouchesOf(messages), [messages]);
  const touched = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!touched.current) {
      touched.current = new Set(touches.map((touch) => touch.key));
      return;
    }
    const again = new Set<string>();
    for (const touch of touches) {
      if (touched.current.has(touch.key)) continue;
      touched.current.add(touch.key);
      again.add(touch.pieceId);
    }
    for (const pieceId of again) void mutate(PIECES_API.detail(pieceId));
  }, [mutate, touches]);

  // The last line of each piece in the conversation (`kcxz.31`, D12): an
  // earlier line's count of open questions is from its own moment, and a
  // later answer has made it wrong.
  const latestPieceLine = useMemo(() => {
    const latest = new Map<string, string>();
    for (const message of messages) {
      if (message.role !== 'assistant') continue;
      for (const block of readMessageBlocks(message)) {
        if (block.type === 'artifact' && block.artifact.kind === 'piece')
          latest.set(block.artifact.id, block.key);
      }
    }
    return latest;
  }, [messages]);

  /* ---- Scrolling ---------------------------------------------------------- */

  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  useEffect(() => {
    const node = scroller.current;
    if (node && pinned.current) node.scrollTop = node.scrollHeight;
  }, [messages, status]);

  /* ---- Drawing ------------------------------------------------------------ */

  const user = useUser();
  const onboarding = useOnboardingProgress();
  const recommended = ONBOARDING_STEP_KEYS.find(
    (step) => !stepIsDone(step, onboarding.progress)
  );

  const lastAssistant = [...messages]
    .reverse()
    .find((message) => message.role === 'assistant');

  const chatError = error
    ? {
        code: errorCodeOf(error.message) ?? readDoorError(error.message),
        network: isNetworkFailure(error),
      }
    : null;

  const renderBlock = (
    block: AgentBlock,
    message: AgentMessage,
    live: boolean,
    last: boolean
  ): ReactNode => {
    switch (block.type) {
      case 'text':
        return <AgentMarkdown key={block.key} text={block.text} />;
      case 'file':
        return (
          <p key={block.key} className="cf-caption text-cf-ink-muted">
            {words.conversation.attached(block.name)}
          </p>
        );
      case 'approval': {
        const sending = sendingApprovals.get(block.approvalId);
        // Waits while the server's list holds it; the last message's cards
        // also while that list is read again after the turn (N1, D2).
        const waits = (id: string) =>
          !closedApprovals.has(id) &&
          (approvalWaits(openPending, id) || (last && !pendingKnown));
        const state =
          sending !== undefined && block.state === 'sent'
            ? 'asked'
            : block.state === 'asked' && sending === undefined && !waits(block.approvalId)
              ? 'closed'
              : block.state;
        return (
          <ApprovalCard
            key={`${block.key}:${approvalTries[block.approvalId] ?? 0}`}
            title={block.title}
            reason={block.reason}
            irreversible={block.irreversible}
            toolName={block.toolName}
            state={state}
            busy={busy}
            sending={sending ?? null}
            onAnswer={(approved) =>
              void answerApproval(message, block.approvalId, approved, waits)
            }
            words={words}
          />
        );
      }
      case 'question': {
        // Refused here as no longer waiting, and since read back from the
        // thread with its answer from elsewhere: it still says so (R2).
        if (block.runId === null && block.toolCallId && closedCalls.has(block.toolCallId)) {
          return (
            <QuestionClosedLine
              key={block.key}
              {...closedLineOf(block, words)}
              state="closed"
              words={words}
            />
          );
        }
        // A card waits while the server's list holds it; the last message's
        // cards also while that list is being read again after the turn. One
        // that no longer waits says so, not a dead card (`kcxz.31`, D2).
        // A card the server refused as not waiting never waits again here.
        const waits =
          block.runId !== null &&
          !(block.question.cardId && closedCards.has(block.question.cardId)) &&
          (questionWaits(openPending, {
            runId: block.runId,
            toolCallId: block.toolCallId,
            cardId: block.question.cardId,
          }) ||
            (last && !pendingKnown));
        if (block.runId && !waits) {
          return (
            <QuestionClosedLine
              key={block.key}
              {...closedLineOf(block, words)}
              // Answered here (from further up, `kcxz.32` D2) is «отвечено»;
              // closed elsewhere or superseded is «больше не ждёт ответа».
              state={
                block.question.cardId &&
                answeredCards.has(block.question.cardId) &&
                !closedCards.has(block.question.cardId)
                  ? 'answered'
                  : 'closed'
              }
              words={words}
            />
          );
        }
        // Rows to keep (`kcxz.16`); answered, it folds into the question's line.
        const selection = block.question;
        if (selection.kind === 'selection' && block.runId) {
          const runId = block.runId;
          return (
            <SelectionCard
              key={block.key}
              question={selection}
              busy={busy}
              onAnswer={(resumeData) =>
                answerQuestion(runId, block.toolCallId, block.question.cardId, resumeData)
              }
              words={words}
            />
          );
        }
        // The adaptation interview (`kcxz.16`), the channel tab's own card.
        const interview = block.question;
        if (interview.kind === 'interview' && block.runId) {
          const runId = block.runId;
          return (
            <InterviewCard
              key={block.key}
              question={interview}
              busy={busy}
              onAnswer={(resumeData) =>
                answerQuestion(runId, block.toolCallId, block.question.cardId, resumeData)
              }
              words={words}
            />
          );
        }
        return (
          <QuestionCard
            key={block.key}
            title={block.title}
            question={block.question}
            answered={block.runId === null}
            stale={block.stale === true}
            busy={busy}
            onAnswer={(resumeData) =>
              block.runId &&
              answerQuestion(block.runId, block.toolCallId, block.question.cardId, resumeData)
            }
            words={words}
          />
        );
      }
      case 'working': {
        if (!live) return null;
        const seen = stages[block.toolName] ?? [];
        return (
          <ProgressCard
            key={block.key}
            title={block.title}
            current={seen[seen.length - 1] ?? words.progress.working}
            steps={seen.slice(0, -1)}
            onStop={() => void stop()}
            words={words}
          />
        );
      }
      case 'done':
        return (
          <DoneLine
            key={block.key}
            title={block.title}
            stale={block.stale === true}
            words={words}
          />
        );
      case 'artifact':
        // A plan slot is a card: its way back (cancel, take off) is here, not
        // only beside the chat (`kcxz.16`, spec §6.2).
        if (block.artifact.kind === 'plan' && !block.removed) {
          return (
            <PlanCard
              key={block.key}
              artifact={block.artifact}
              open={
                openArtifact?.kind === block.artifact.kind &&
                openArtifact.id === block.artifact.id
              }
              onOpen={(artifact) => onArtifact(artifact, 'asked')}
              words={words}
            />
          );
        }
        return (
          <ArtifactLine
            key={block.key}
            artifact={block.artifact}
            removed={block.removed}
            latest={latestPieceLine.get(block.artifact.id) === block.key}
            open={
              openArtifact?.kind === block.artifact.kind &&
              openArtifact.id === block.artifact.id
            }
            onOpen={(artifact) => onArtifact(artifact, 'asked')}
            words={words}
          />
        );
      case 'error':
        // The agent tried to answer the person's questions itself and the
        // product stopped it: nothing failed, the questions wait for the
        // person (`kcxz.31`, D1).
        if (block.code === 'INPUT_NEEDS_PERSON') {
          return (
            <Note key={block.key} tone="neutral">
              {words.question.yours}
            </Note>
          );
        }
        // A second proposal for a text whose card is still open above was
        // not run: nothing failed, the open card waits (`kcxz.32`, N2).
        if (block.code === 'PROPOSAL_CARD_OPEN') {
          const said = words.error.codes.PROPOSAL_CARD_OPEN;
          return (
            <Note key={block.key} tone="neutral">
              {said ? `${said.what} ${said.next}` : null}
            </Note>
          );
        }
        return (
          <ErrorCard
            key={block.key}
            title={block.title}
            code={block.code}
            refusal
            words={words}
          />
        );
      case 'secret':
        return (
          <SecretCard
            key={block.key}
            secret={block.secret}
            onContinue={(text) => submit({ text, files: [] })}
            words={words}
          />
        );
      default:
        return null;
    }
  };

  // One folded line per card (`kcxz.38`, P3-a): a card answered from further
  // up also shows its answer's line in the message that took the stream.
  const blocksOf = new Map(
    (() => {
      const assistant = messages.filter((message) => message.role === 'assistant');
      const read = withoutRepeatedQuestionLines(
        assistant.map((message) =>
          readMessageBlocks(message, openPending, removed, goneQuestions)
        )
      );
      return assistant.map((message, index) => [message.id, read[index]] as const);
    })()
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={scroller}
        onScroll={(event) => {
          const node = event.currentTarget;
          pinned.current =
            node.scrollHeight - node.scrollTop - node.clientHeight < 96;
        }}
        className="min-h-0 flex-1 overflow-y-auto px-[16px] py-[24px] md:px-[20px]"
      >
        <div
          role="log"
          aria-label={words.conversation.label}
          aria-live="polite"
          aria-relevant="additions"
          className="mx-auto flex min-w-0 max-w-[760px] flex-col gap-[20px]"
        >
          {!messages.length ? (
            <StartHere
              role={user?.role ?? null}
              recommended={recommended ?? null}
              onStart={(step) =>
                send({ text: words.start.starters[step], files: [] })
              }
              words={words}
            />
          ) : null}
          {messages.map((message) => {
            if (message.role === 'user') {
              return <UserMessage key={message.id} message={message} words={words} />;
            }
            const last = message.id === lastAssistant?.id;
            const live = last && busy;
            const blocks = blocksOf.get(message.id) ?? [];
            return (
              <article
                key={message.id}
                aria-busy={live || undefined}
                className="flex min-w-0 items-start gap-[12px]"
              >
                <span className="pt-[4px]">
                  <CfMark size={24} decorative />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-[12px]">
                  <span className="sr-only">{words.conversation.agent}:</span>
                  {blocks.map((block) => renderBlock(block, message, live, last))}
                </div>
              </article>
            );
          })}
          {status === 'submitted' ? (
            <WorkingLine label={words.conversation.thinking} />
          ) : null}
          {chatError ? (
            <ErrorCard
              title={null}
              code={chatError.code}
              network={chatError.network && !chatError.code}
              // An approval that did not go through is asked again on its own
              // card; regenerating would re-run the last message instead.
              onRetry={
                approvalFailed.current
                  ? undefined
                  : () => {
                      clearError();
                      void regenerate();
                    }
              }
              words={words}
            />
          ) : null}
        </div>
      </div>
      <div className="shrink-0 px-[16px] pb-[16px] pt-[8px] md:px-[20px]">
        <div className="mx-auto max-w-[760px]">
          <AgentComposer
            busy={busy}
            queued={queued !== null}
            onSubmit={submit}
            onStop={() => void stop()}
            words={words}
            autoFocus={!messages.length}
          />
        </div>
      </div>
    </div>
  );
}

function UserMessage({
  message,
  words,
}: {
  message: AgentMessage;
  words: AgentWords;
}) {
  const parts = message.parts as unknown as Array<
    Record<string, unknown> & { type: string }
  >;
  const text = parts
    .map((part) => (part.type === 'text' ? String(part.text ?? '') : ''))
    .join('\n')
    .trim();
  const files = parts.filter((part) => part.type === 'file');
  return (
    <div className="flex min-w-0 flex-col items-end gap-[4px]">
      <span className="sr-only">{words.conversation.you}:</span>
      {text ? (
        <p className="max-w-[85%] whitespace-pre-wrap rounded-[12px] rounded-ee-[4px] border border-cf-border bg-cf-surface-raised px-[12px] py-[8px] cf-body-md text-cf-ink [overflow-wrap:anywhere]">
          {text}
        </p>
      ) : null}
      {files.map((file, index) => (
        <span
          key={index}
          className="inline-flex max-w-[85%] items-center gap-[4px] cf-caption text-cf-ink-muted"
        >
          <AgentGlyph name="clip" size={12} />
          <span className="min-w-0 truncate">
            {String(file.filename ?? file.mediaType ?? '')}
          </span>
        </span>
      ))}
    </div>
  );
}

/** An empty thread: say where to start, one step recommended (spec §6.1). */
function StartHere({
  role,
  recommended,
  onStart,
  words,
}: {
  /** Only the starters this role can run are offered (`kcxz.31`, D14). */
  role: string | null;
  recommended: OnboardingStepKey | null;
  onStart: (step: 'avatar' | 'channel' | 'piece' | 'plan') => void;
  words: AgentWords;
}) {
  const w = words.start;
  const offered = STARTER_ORDER.filter((step) => starterAllowed(step, role));
  const lead =
    recommended && offered.includes(recommended) ? recommended : offered[0];
  return (
    <div className="flex min-w-0 items-start gap-[12px]">
      <span className="pt-[4px]">
        <CfMark size={24} decorative />
      </span>
      <div className="flex min-w-0 flex-col gap-[16px]">
        <div className="flex flex-col gap-[4px]">
          <h2 className="cf-heading-md text-cf-ink [text-wrap:balance]">{w.title}</h2>
          <p className="max-w-[65ch] cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
            {w.lead}
          </p>
        </div>
        <div className="flex flex-col items-start gap-[8px]">
          {offered.map((step) => {
            const key = step as 'avatar' | 'channel' | 'piece' | 'plan';
            return (
              <Button
                key={step}
                type="button"
                density="dense"
                variant={step === lead ? 'primary' : 'secondary'}
                onClick={() => onStart(key)}
              >
                {w.starters[key]}
              </Button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

