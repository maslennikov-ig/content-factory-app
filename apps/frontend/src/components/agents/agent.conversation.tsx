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
import useSWR, { useSWRConfig } from 'swr';
import { useRefreshOnReturn, useRevalidateArtifact, useRevalidateUnder, useRevalidateWhenCountGrows } from './agent.revalidate';
import { Button } from '@contentfactory/react/form/button';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { CfMark } from '@contentfactory/frontend/components/ui/brand/cf-mark';
import { WorkingLine } from '@contentfactory/frontend/components/ui/working-line';
import { useOnboardingProgress } from '@contentfactory/frontend/components/onboarding/use-onboarding-progress';
import {
  AGENT_DOORS,
  AGENT_MEDIA_PART_TYPE,
  AGENT_SAMPLES_PART_TYPE,
  AGENT_TIMEZONE_HEADER,
  approvalWaits,
  artifactKey,
  createdAvatarOf,
  artifactsOf,
  avatarCallsOf,
  channelCallsOf,
  ideaCallsOf,
  factCallsOf,
  mediaCallsOf,
  panelReadsOf,
  errorCodeOf,
  pendingCardId,
  pieceTouchesOf,
  videoTouchesOf,
  provisionalTitle,
  questionWaits,
  readThreadHistory,
  readDoorError,
  readAttachedText,
  readMessageBlocks,
  readProgressPart,
  readSamplesPart,
  readMediaPart,
  removedArtifactsOf,
  reopenApprovalAnswer,
  toolNameOf,
  waitingApprovalIds,
  withoutRepeatedQuestionLines,
  type AgentArtifact,
  type AgentBlock,
  type AgentMessage,
  type AgentPagination,
  type AgentPendingRun,
  type AgentThreadExecution,
  type AgentSignalReceipt,
  type AgentWorkContextV1,
} from './agent.contract';
import { errorWordsFor, stageWordFor, type AgentWords } from './agent.copy';
import { sendSamplesTo } from './agent.samples';
import {
  keepShownPictureInLibrary,
  uploadToLibrary,
  type LibrarySaved,
} from './agent.media';
import { MEDIA_LIBRARY_KEY_PREFIX } from '@contentfactory/frontend/components/media/media-library.keys';
import { AVATAR_ROUTES, mapAvatars } from '@contentfactory/frontend/components/brand-voice/voice-avatars.adapter';
import { readVoice } from '@contentfactory/frontend/components/brand-voice/voice-profile.adapter';
import { VOICE_API_BASE } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';
import { isOrganizationEditor } from '@contentfactory/nestjs-libraries/user/organization.roles';
import {
  ApprovalCard,
  ArtifactLine,
  DoneLine,
  ErrorCard,
  Note,
  ObjectiveCard,
  ProgressCard,
  QuestionCard,
  QuestionClosedLine,
  RetainedQuestionDraft,
  SubagentCard,
  TaskChecklistCard,
} from './agent.cards';
import { SecretCard } from './agent.secret-card';
import { ChannelConnectCard } from './agent.channel-card';
import { SelectionCard } from './agent.selection-card';
import { InterviewCard } from './agent.interview-card';
import { DomainQuestionCard } from './agent.domain-question-card';
import { PlanCard } from './agent.plan-card';
import { AgentMarkdown } from './agent.markdown';
import { AgentComposer, type ComposerSubmit, type ComposerRecovery, type SamplesTarget } from './agent.composer';
import { ALLOWANCE_API } from '@contentfactory/frontend/components/ui/allowance-hint';
import { THREADS_KEY } from './agent.threads';
import { createAgentTransport, isAgentRequestNotStarted, screenTimeZone } from './agent.transport';
import { PIECES_API } from '@contentfactory/frontend/components/content-intelligence/pieces/pieces.adapter';
import { LEADS_API } from '@contentfactory/frontend/components/content-intelligence/content-leads.adapter';
import { FACTS_API } from '@contentfactory/frontend/components/content-intelligence/content-facts.adapter';
import { useUser } from '@contentfactory/frontend/components/layout/user.context';
import { startersFor, type AgentStarter } from './agent.starters';
import { channelWaitsForAdmin } from '@contentfactory/frontend/components/onboarding/onboarding.adapter';
import { AgentGlyph } from './agent.icons';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { assistantContextKey } from './assistant.route-context';

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

/** The same run of the server's list: its id and its call. */
const sameRun = (one: AgentPendingRun, other: AgentPendingRun) =>
  one.runId === other.runId && one.toolCallId === other.toolCallId;

const hasNativeToolCall = (messages: readonly AgentMessage[], toolCallId: string) => messages.some((message) =>
  message.parts.some((part) => 'toolCallId' in part && part.toolCallId === toolCallId &&
    (part.type.startsWith('tool-') || part.type === 'dynamic-tool')));

/** Memory may still be flushing text already shown when Stop was pressed. */
const withStoppedText = (saved: AgentMessage, live: AgentMessage): AgentMessage => {
  if (saved.role !== 'assistant' || live.role !== 'assistant') return saved;
  const visible = live.parts.filter((part) => part.type === 'text');
  const stored = saved.parts.filter((part) => part.type === 'text');
  if (stored.length !== visible.length) return saved;
  let index = 0;
  return { ...saved, parts: saved.parts.map((part) => {
    if (part.type !== 'text') return part;
    const text = visible[index++].text;
    return text.startsWith(part.text) ? { ...part, text } : part;
  }) };
};

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
        : block.question.kind === 'plan'
          ? words.question.planKind
          : words.question.kind,
  text:
    block.question.kind === 'interview'
      ? words.interview.title(block.question.questions.length)
      : block.question.text || block.title || '',
});

const isNetworkFailure = (error: Error) =>
  error.name === 'TypeError' || /failed to fetch|network/i.test(error.message);

const questionFailureCode = (failure: unknown): string | null => failure instanceof Error
  ? errorCodeOf(failure.message) ?? readDoorError(failure.message)
  : null;

export function AgentConversation({
  threadId,
  initialMessages,
  initialPagination,
  initialExecution,
  initialSignalReceipts = [],
  draftStorageKey,
  pending,
  onThreadId,
  onTitle,
  onArtifact,
  onArtifacts,
  workContext,
  contextControls,
  onNewConversation,
  onForked,
  onWorkContext,
  openArtifact,
  onArtifactRemoved,
  starter,
  onStarterUsed,
  draft = null,
  onDraftUsed,
  visible = true,
  words,
}: {
  threadId: string | null;
  initialMessages: AgentMessage[];
  initialPagination?: AgentPagination;
  initialExecution?: AgentThreadExecution;
  initialSignalReceipts?: AgentSignalReceipt[];
  draftStorageKey?: string;
  pending: AgentPendingRun[];
  /** The server named the thread a first message opened. */
  onThreadId: (id: string) => void;
  onTitle: (title: string | null) => void;
  /** The turn produced something, or the person asked to open it. */
  onArtifact: (artifact: AgentArtifact, how: 'produced' | 'asked') => void;
  onArtifacts?: (artifacts: AgentArtifact[]) => void;
  workContext?: AgentWorkContextV1 | null;
  contextControls?: ReactNode;
  onNewConversation?: () => void;
  /** Opens a newly branched thread (`bxeb.2`). */
  onForked?: (id: string) => void;
  onWorkContext?: (context: AgentWorkContextV1 | null) => void;
  openArtifact: AgentArtifact | null;
  /** The open artifact was deleted in this conversation: close it. */
  onArtifactRemoved: () => void;
  /** A starter chosen outside the conversation (the work panel). */
  starter: string | null;
  onStarterUsed: () => void;
  /**
   * Words to put into the composer, not to send: «Сделать в чате» from
   * «С чего начать» (review W3-21 P2-2). The person presses send.
   */
  draft?: string | null;
  onDraftUsed?: () => void;
  /** The shared session stays mounted while a manual route hides its pane. */
  visible?: boolean;
  words: AgentWords;
}) {
  const request = useFetch();
  const t = useT();
  const currentContext = useRef(workContext);
  currentContext.current = workContext;
  const announceContext = useRef(onWorkContext);
  announceContext.current = onWorkContext;
  const { mutate } = useSWRConfig();
  const revalidateUnder = useRevalidateUnder();
  const revalidateArtifact = useRevalidateArtifact();
  const thread = useRef(threadId);
  useEffect(() => {
    if (threadId) thread.current = threadId;
  }, [threadId]);
  const announceThread = useRef(onThreadId);
  announceThread.current = onThreadId;
  const refusedBeforeStart = useRef(false);
  const submittedMessage = useRef<{ message: ComposerSubmit; context?: AgentWorkContextV1 | null;
  } | null>(null);
  const refusedMessage = useRef<typeof submittedMessage.current>(null);
  const [composerRecovery, setComposerRecovery] = useState<ComposerRecovery | null>(null);
  const replayComplete = useRef<() => Promise<void>>(async () => undefined);

  const transport = useMemo(
    () =>
      createAgentTransport({
        request,
        currentThread: () => thread.current,
        currentContext: () => currentContext.current,
        onNotStarted: () => { refusedBeforeStart.current = true; },
        onThread: (named) => {
          thread.current = named;
          announceThread.current(named);
        },
        onReplayComplete: () => replayComplete.current(),
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
  const [serverExecution, setServerExecution] = useState<AgentThreadExecution | undefined>(initialExecution);
  const [signalReceipts, setSignalReceipts] = useState(initialSignalReceipts);
  const [pendingKnown, setPendingKnown] = useState(true);
  const questionSent = useRef<{
    cardId: string;
    toolCallId: string | null;
  } | null>(null);
  const questionInFlight = useRef(false);
  const questionError = useRef<Error | null>(null);
  const [questionFailures, setQuestionFailures] = useState<ReadonlyMap<string, string | null>>(() => new Map());
  /*
    Every question card the server listed while this conversation was open
    (`kcxz.38`, R2). A history read while a card waited has no question part
    of its own; once the list drops the card, this keeps it drawn as a line
    that says it no longer waits, instead of letting it vanish.
  */
  const [seenQuestions, setSeenQuestions] = useState<readonly AgentPendingRun[]>(
    () => pending.filter((run) => run.kind === 'question')
  );
  /** Native message IDs confirmed before any live/possibly unsaved stream. */
  const confirmedHistoryIds = useRef(new Set(initialMessages.map((message) => message.id)));
  /** A prior native leg's history cannot mutate a later deliberate request. */
  const turnGeneration = useRef(0);
  const explicitStop = useRef(false);
  const stopReceipt = useRef<{
    threadId: string; requestId: string; humanId: string; toolCallIds: string[]; verified: boolean; generation: number;
  } | null>(null);
  const confirmStoppedHistory = useRef<((history: ReturnType<typeof readThreadHistory>) => void) | null>(null);
  const confirmWaitingHistory = useRef<((history: ReturnType<typeof readThreadHistory>, nativeWaitObserved?: boolean) => boolean) | null>(null);
  const transportBusy = useRef(false);
  /** An observer detached at a proven human gate; this is not server Stop. */
  const waitingObserverStop = useRef<number | null>(null);
  const pendingGateRead = useRef<AbortController | null>(null);
  const refreshStreamGate = useRef<(nativeWaitObserved?: boolean) => void>(() => undefined);
  useEffect(() => () => pendingGateRead.current?.abort(), []);
  /** `setMessages` of the chat below, for an authoritative native snapshot. */
  const replaceMessages = useRef<
    | ((next: AgentMessage[] | ((current: AgentMessage[]) => AgentMessage[])) => void) | null>(null);
  const refreshPending = useCallback(
    async (
      /** Also take the thread's messages: another tab moved it on (R2). */
      withMessages = false,
      /** Native replay may have started before its human message was saved. */
      mergeMessages = false,
      generation = turnGeneration.current,
      nativeWaitObserved = false
    ) => {
      const id = thread.current;
      if (!id) return false;
      const contextAtRead = assistantContextKey(currentContext.current ?? null);
      const interruptedAtRead = interruptedNow.current;
      const busyAtRead = transportBusy.current;
      try {
        const zone = screenTimeZone();
        const response = await request(
          AGENT_DOORS.thread(id),
          zone ? { headers: { [AGENT_TIMEZONE_HEADER]: zone } } : {}
        );
        if (!response.ok) return false;
        const history = readThreadHistory(await response.json());
        if (thread.current !== id || generation !== turnGeneration.current) return false;
        if (history.workspace && contextAtRead === assistantContextKey(currentContext.current ?? null) && contextAtRead === assistantContextKey(history.workspace.workContext)) {
          currentContext.current = history.workspace.workContext;
          announceContext.current?.(history.workspace.workContext);
        }
        setServerPending(history.pending);
        setNativeWaiting(history.pending.length > 0);
        if (history.execution) setServerExecution(history.execution);
        setSignalReceipts(history.signalReceipts ?? []);
        setSeenQuestions((seen) => [
          ...seen,
          ...history.pending.filter(
            (run) => run.kind === 'question' && !seen.some((one) => sameRun(one, run))
          ),
        ]);
        setPendingKnown(true);
        // A lost response can reach the next native call while this tab still
        // holds the previous tool input. Its pending payload needs that saved
        // tool part; changing only the pending list cannot draw a new card.
        const canRestorePending = !explicitStop.current && history.pending.length > 0 &&
          (interruptedAtRead || (!busyAtRead && !transportBusy.current));
        if ((withMessages || mergeMessages || canRestorePending) && history.messages.length) {
          replaceMessages.current?.((current) => {
            const restorePending = canRestorePending && history.pending.some((run) => run.toolCallId &&
              !hasNativeToolCall(current, run.toolCallId) && hasNativeToolCall(history.messages, run.toolCallId));
            if (!withMessages && !mergeMessages && !restorePending) return current;
            const savedIds = new Set(history.messages.map((message) => message.id));
            if (mergeMessages && !withMessages && !restorePending) {
              const merged = [...current];
              let next = 0;
              // Retain loaded older pages and separate live fragments. Insert
              // newly saved messages in history order around their native IDs.
              while (next < merged.length && confirmedHistoryIds.current.has(merged[next].id) && !savedIds.has(merged[next].id)) next++;
              for (const message of history.messages) {
                const index = merged.findIndex((existing) => existing.id === message.id);
                if (index < 0) merged.splice(next++, 0, message);
                else {
                  // The stream can finish before the HTTP owner's terminal
                  // marker commits; its live response is newer until then.
                  if (history.execution?.state === 'settled') {
                    merged[index] = explicitStop.current ? withStoppedText(message, merged[index]) : message;
                  }
                  next = Math.max(next, index + 1);
                }
              }
              return merged;
            }
            const boundary = current.findIndex((message) => savedIds.has(message.id));
            // Only a confirmed older prefix lies outside a bounded newest
            // page. An absent live fragment is not a saved action result.
            const prefix = history.pagination?.hasMore
              ? (boundary >= 0 ? current.slice(0, boundary) : current).filter((message) => confirmedHistoryIds.current.has(message.id) && !savedIds.has(message.id))
              : [];
            return [...prefix, ...history.messages];
          });
        }
        for (const message of history.messages) confirmedHistoryIds.current.add(message.id);
        // A tab return can see terminal Memory after both Stop/SDK reads saw
        // a still-running owner. Reuse the exact Stop proof on that new read.
        confirmStoppedHistory.current?.(history);
        confirmWaitingHistory.current?.(history, nativeWaitObserved);
        return history;
      } catch {
        // Not read: the last message's cards keep the stream's word.
        return false;
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
  const [interrupted, setInterrupted] = useState(false);
  const interruptedNow = useRef(false);
  const interrupt = useCallback(() => {
    if (explicitStop.current && stopReceipt.current?.verified) return;
    interruptedNow.current = true;
    setInterrupted(true);
  }, []);
  const [checking, setChecking] = useState(false);
  const reconnectAttempt = useRef<string | null>(null);
  const continuation = useRef(false);
  const [nativeWaiting, setNativeWaiting] = useState(pending.length > 0);

  const {
    messages,
    sendMessage,
    status,
    stop,
    resumeStream,
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
      if (part.type === 'data-native-input-wait') {
        reconnectAttempt.current = null;
        setNativeWaiting(true);
        refreshStreamGate.current(true);
        return;
      }
      if (['data-tool-call-suspended', 'data-tool-call-approval'].includes(part.type) &&
        (part.data as any)?.resumed !== true) {
        // Replayed PubSub carries the question itself, but not the HTTP
        // producer's transient input-wait notification. Commit may follow it.
        reconnectAttempt.current = null;
        // Approval events can be followed by automatic approval and another
        // native gate. Only suspension/input-wait events prove that an
        // approval-only history read may detach this live reader. A saved
        // question remains sufficient proof on its own (including replay).
        refreshStreamGate.current(part.type === 'data-tool-call-suspended');
        return;
      }
      if (part.type === 'data-native-run-continuation' && typeof (part.data as any)?.runId === 'string') {
        continuation.current = true;
        interruptedNow.current = false;
        setInterrupted(false);
        setServerExecution((saved) => ({ requestId: saved?.requestId ?? null, runId: (part.data as any).runId, state: 'running' }));
        return;
      }
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
    onError: (failure) => {
      if (waitingObserverStop.current === turnGeneration.current && !explicitStop.current) return;
      if (questionInFlight.current) questionError.current = failure;
      if (questionSent.current) {
        questionError.current = failure;
        const cardId = questionSent.current.cardId;
        setQuestionFailures((seen) => new Map(seen).set(cardId, questionFailureCode(failure) ?? seen.get(cardId) ?? null));
      }
      refusedBeforeStart.current = isAgentRequestNotStarted(failure);
      if (refusedBeforeStart.current) {
        const refused = submittedMessage.current;
        if (refused) {
          refusedMessage.current = refused;
          setComposerRecovery((previous) => ({ version: (previous?.version ?? 0) + 1, kind: 'restore', text: refused.message.text }));
        }
        interruptedNow.current = false;
        setInterrupted(false);
      } else if (isNetworkFailure(failure)) {
        // The transport outcome is unknown until native history proves a
        // resumable owner. Block another write while that read is pending.
        interrupt();
      }
    },
    onFinish: ({ isAbort, isError, isDisconnect }) => {
      pendingGateRead.current?.abort();
      const pausedObserver = waitingObserverStop.current === turnGeneration.current && !explicitStop.current;
      waitingObserverStop.current = null;
      if (pausedObserver) {
        setStages({});
        void mutate(THREADS_KEY);
        void mutate(ALLOWANCE_API);
        return;
      }
      if (questionInFlight.current && (isAbort || isError || isDisconnect) && !questionError.current) questionError.current = new Error('AGENT_TASK_UNCERTAIN');
      const generation = turnGeneration.current;
      const notStarted = refusedBeforeStart.current;
      refusedBeforeStart.current = false;
      if (notStarted) {
        interruptedNow.current = false;
        setInterrupted(false);
      } else {
        submittedMessage.current = null;
        refusedMessage.current = null;
        const followed = continuation.current;
        continuation.current = false;
        if (!followed && (isAbort || isDisconnect || isError)) {
          interrupt();
          void refreshPending(false, explicitStop.current, generation).then((history) => {
            if (generation !== turnGeneration.current) return;
            if (history && confirmWaitingHistory.current?.(history)) return;
            if (explicitStop.current) {
              if (!confirmStopped(history)) interrupt();
              return;
            }
            const run = history && history.execution;
            if (!explicitStop.current && history && !history.pending.length &&
              run?.state === 'running' && run.runId && reconnectAttempt.current !== run.runId) {
              interruptedNow.current = false;
              setInterrupted(false);
            } else interrupt();
          });
        }
      }
      setStages({});
      void refreshPending(false, explicitStop.current || (!notStarted && !isAbort && !isError && !isDisconnect), generation);
      void mutate(THREADS_KEY);
      // Every turn spends from the allowance; the line under the composer
      // says what is left after it, not before it (kcxz.29, D8).
      void mutate(ALLOWANCE_API);
    },
  });
  refreshStreamGate.current = (nativeWaitObserved = false) => {
    pendingGateRead.current?.abort();
    const controller = new AbortController();
    pendingGateRead.current = controller;
    const generation = turnGeneration.current;
    const id = thread.current;
    const current = () => !controller.signal.aborted && generation === turnGeneration.current && id === thread.current && !explicitStop.current;
    void (async () => {
      // Read-only reconciliation, bounded and canceled on a new event/unmount.
      // Nothing here resumes a model or repeats the person's accepted answer.
      for (const delay of [0, 100, 500, 1500, 5000]) {
        if (!current()) return;
        if (delay) await new Promise<void>((resolve) => {
          const done = () => { clearTimeout(timer); controller.signal.removeEventListener('abort', done); resolve(); };
          const timer = setTimeout(done, delay);
          controller.signal.addEventListener('abort', done, { once: true });
        });
        if (!current()) return;
        const history = await refreshPending(false, true, generation, nativeWaitObserved);
        if (!current() || history && confirmWaitingHistory.current?.(history, nativeWaitObserved)) return;
      }
    })().finally(() => {
      if (pendingGateRead.current === controller) pendingGateRead.current = null;
    });
  };
  transportBusy.current = status === 'submitted' || status === 'streaming';

  const [pagination, setPagination] = useState(initialPagination);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderFailed, setOlderFailed] = useState(false);
  const loadOlder = useCallback(async () => {
    const id = thread.current;
    if (!id || !pagination?.hasMore || loadingOlder) return;
    setLoadingOlder(true); setOlderFailed(false);
    try {
      const zone = screenTimeZone();
      const response = await request(`${AGENT_DOORS.thread(id)}?page=${pagination.page + 1}&perPage=${pagination.perPage}`, zone ? { headers: { [AGENT_TIMEZONE_HEADER]: zone } } : {});
      if (!response.ok) throw new Error(String(response.status));
      const history = readThreadHistory(await response.json());
      if (thread.current !== id) return;
      for (const message of history.messages) confirmedHistoryIds.current.add(message.id);
      const node = scroller.current;
      const before = node?.scrollHeight ?? 0;
      setMessages((current) => [...history.messages.filter((older) => !current.some((message) => message.id === older.id)), ...current]);
      setPagination(history.pagination);
      // Prepending history keeps the person's reading position.
      requestAnimationFrame(() => { if (node) node.scrollTop += node.scrollHeight - before; });
    } catch { setOlderFailed(true); }
    finally { setLoadingOlder(false); }
  }, [pagination, loadingOlder, request, setMessages]);

  replaceMessages.current = setMessages;
  const confirmStopped = useCallback((history: Awaited<ReturnType<typeof refreshPending>>) => {
    const receipt = stopReceipt.current;
    if (!explicitStop.current || !receipt || receipt.generation !== turnGeneration.current || receipt.threadId !== thread.current || !history ||
        history.execution?.requestId !== receipt.requestId || history.execution.state !== 'settled' ||
        !['completed', 'interrupted'].includes(history.execution.outcome ?? '') || history.pending.length || error) return false;
    const boundary = history.messages.findIndex((message) => message.id === receipt.humanId && message.role === 'user');
    if (boundary < 0) return false;
    const parts = history.messages.slice(boundary + 1).flatMap((message) => message.parts);
    if (parts.some((part) => 'state' in part && part.state === 'output-error' ||
        'output' in part && part.output && typeof part.output === 'object' && 'ok' in part.output && part.output.ok === false)) return false;
    if (receipt.toolCallIds.some((id) => !parts.some((part) => 'toolCallId' in part && part.toolCallId === id &&
        'state' in part && (part.state === 'output-available' || part.state === 'output-denied')))) return false;
    receipt.verified = true;
    interruptedNow.current = false;
    setInterrupted(false);
    clearError();
    return true;
  }, [clearError, error]);
  confirmStoppedHistory.current = confirmStopped;
  replayComplete.current = async () => {
    const generation = turnGeneration.current;
    // A 204 has no SDK finish callback. Native Memory is the terminal source
    // after the framework has released its cached streaming events.
    const history = await refreshPending(false, true, generation);
    if (generation !== turnGeneration.current) return;
    if (history && history.execution?.state === 'settled' && history.messages.some(message => message.role === 'assistant')) {
      continuation.current = false;
      if (!explicitStop.current) {
        interruptedNow.current = false;
        setInterrupted(false);
        clearError();
      }
    } else if (!history || !confirmWaitingHistory.current?.(history)) interrupt();
  };

  useEffect(() => {
    // The mounted conversation survives navigation and live replay. A newer
    // history read must therefore refresh its gates even when messages are
    // already present and the native stream saved only the tool input.
    setServerPending(pending);
    setPendingKnown(true);
    setNativeWaiting(pending.length > 0);
    setSeenQuestions((seen) => [
      ...seen,
      ...pending.filter((run) => run.kind === 'question' && !seen.some((one) => sameRun(one, run))),
    ]);
  }, [pending]);

  useEffect(() => {
    if (initialMessages.length && !messages.length && status === 'ready') {
      setMessages(initialMessages);
      for (const message of initialMessages) confirmedHistoryIds.current.add(message.id);
      setServerPending(pending);
      if (initialExecution) setServerExecution(initialExecution);
      setSignalReceipts(initialSignalReceipts);
      setNativeWaiting(pending.length > 0);
    }
  }, [initialMessages, initialExecution, initialSignalReceipts, messages.length, pending, setMessages, status]);

  const busy = status === 'submitted' || status === 'streaming';
  const attachedRunning =
    serverExecution?.state === 'running' &&
    !nativeWaiting &&
    !explicitStop.current &&
    !interrupted &&
    !busy;
  useEffect(() => {
    const runId = serverExecution?.runId;
    if (!attachedRunning || !runId || !thread.current || reconnectAttempt.current === runId) return;
    reconnectAttempt.current = runId;
    // The SDK starts a fresh assistant response state for replay. Native
    // message IDs replace the same saved response and append continuations.
    void resumeStream().catch(() => interrupt());
  }, [attachedRunning, serverExecution?.runId, resumeStream, interrupt]);
  const refreshOnReturn = useCallback(() => {
    if (openArtifact) revalidateArtifact(openArtifact);
    // Refresh the revision separately from the editor cache. This never
    // replaces messages, clears an interruption or repeats a model request.
    void refreshPending();
  }, [openArtifact, revalidateArtifact, refreshPending]);
  useRefreshOnReturn(refreshOnReturn, visible, busy);
  useEffect(() => {
    if (busy) { setPendingKnown(false); setNativeWaiting(false); }
  }, [busy]);

  /* ---- Sending ------------------------------------------------------------ */

  const stopAndReconcile = useCallback(() => {
    const generation = turnGeneration.current;
    explicitStop.current = true;
    stopReceipt.current = null;
    interrupt();
    // Closing the HTTP observer leaves a durable run alive. Every explicit
    // Stop must reach the server, including the ordinary live SDK stream.
    if (thread.current) {
      const id = thread.current;
      const humanIndex = messages.map((message) => message.role).lastIndexOf('user');
      const humanId = messages[humanIndex]?.id;
      const toolCallIds = messages.slice(humanIndex + 1).flatMap((message) => message.parts.flatMap((part) =>
        'toolCallId' in part && typeof part.toolCallId === 'string' ? [part.toolCallId] : []));
      void request(AGENT_DOORS.stopThread(id), {
        method: 'POST',
      }).then(async (response) => {
        if (generation !== turnGeneration.current) return;
        if (!response.ok) throw new Error(String(response.status));
        const receipt = await response.json().catch(() => null);
        if (generation !== turnGeneration.current) return;
        if (receipt?.stopped === true && receipt.threadId === id && typeof receipt.requestId === 'string' && receipt.requestId && humanId) {
          stopReceipt.current = { threadId: id, requestId: receipt.requestId, humanId, toolCallIds, verified: false, generation };
        }
        const history = await refreshPending(false, true, generation);
        if (generation === turnGeneration.current) confirmStopped(history);
      }).catch(() => {
        if (generation !== turnGeneration.current) return;
        setServerExecution({ requestId: serverExecution?.requestId ?? null, state: 'unknown' });
      });
    }
    void stop();
  }, [confirmStopped, interrupt, messages, refreshPending, request, serverExecution?.requestId, stop]);
  const reconcile = useCallback(async () => {
    const generation = turnGeneration.current;
    setChecking(true);
    try {
      const history = await refreshPending(true, false, generation);
      if (generation !== turnGeneration.current) return;
      if (history && history.execution?.state === 'settled' && !history.pending.length) {
        explicitStop.current = false;
        stopReceipt.current = null;
        interruptedNow.current = false;
        setInterrupted(false);
        clearError();
        void revalidateUnder(PIECES_API.list);
      }
    } finally { setChecking(false); }
  }, [refreshPending, clearError, revalidateUnder]);
  useEffect(() => {
    if (error && !isAgentRequestNotStarted(error) && currentContext.current?.revision && errorCodeOf(error.message) === 'AGENT_BAD_REQUEST') interrupt();
  }, [error, interrupt]);

  /** The last failed request was an approval answer (its card asks again). */
  const approvalFailed = useRef(false);
  /** An approval request left: `submitted` is set by the SDK before it returns. */
  const approvalSent = useRef(false);

  const send = useCallback(
    (message: ComposerSubmit, context?: AgentWorkContextV1 | null, prepared?: AgentMessage) => {
      if (interruptedNow.current) return;
      turnGeneration.current++;
      explicitStop.current = false;
      stopReceipt.current = null;
      reconnectAttempt.current = null;
      const retry = refusedMessage.current;
      refusedMessage.current = null;
      clearError();
      approvalFailed.current = false;
      if (!prepared && retry && message.text === retry.message.text && !message.files.length && !message.samples && !message.media) {
        // Explicit Enter retries the same SDK user message, including its
        // already prepared files/receipts, rather than appending it twice.
        submittedMessage.current = retry;
        void regenerate(retry.context !== undefined ? { body: { workContext: retry.context } } : undefined);
        return;
      }
      if (retry) {
        // The person edited a positively refused instruction. Its unsaved
        // user message is replaced by the new deliberate instruction.
        setMessages((current) => {
          let index = current.length - 1;
          while (index >= 0 && current[index].role !== 'user') index--;
          return index >= 0 ? current.slice(0, index) : current;
        });
      }
      submittedMessage.current = { message, context };
      const options = context !== undefined ? { body: { workContext: context } } : undefined;
      if (prepared) {
        void sendMessage(prepared, options);
        return;
      }
      if (message.samples || message.media) {
        // The receipt of files already added to an avatar (`kcxz.18`) or of
        // pictures already in the media library (`kcxz.25`): the chat door
        // reads it as a line of data, never a file.
        void sendMessage({
          parts: [
            ...(message.text ? [{ type: 'text' as const, text: message.text }] : []),
            ...(message.samples ? [{ type: AGENT_SAMPLES_PART_TYPE, data: message.samples }] : []),
            ...(message.media ? [{ type: AGENT_MEDIA_PART_TYPE, data: message.media }] : []),
            ...message.files,
          ],
        }, options);
        return;
      }
      void sendMessage(
        message.text
          ? { text: message.text, files: message.files }
          : { files: message.files },
        options
      );
    },
    [clearError, sendMessage, regenerate, setMessages]
  );

  const submit = useCallback(
    async (message: ComposerSubmit) => {
      if (!busy && !attachedRunning) { send(message); return; }
      const id = thread.current;
      if (!id) throw new Error('The conversation is not yet assigned.');
      const selected = currentContext.current ?? null;
      const userMessage = { id: crypto.randomUUID(), role: 'user', parts: [
        ...(message.text ? [{ type: 'text', text: message.text }] : []),
        ...(message.samples ? [{ type: AGENT_SAMPLES_PART_TYPE, data: message.samples }] : []),
        ...(message.media ? [{ type: AGENT_MEDIA_PART_TYPE, data: message.media }] : []),
        ...message.files,
      ] };
      const response = await request(AGENT_DOORS.threadSignals(id), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'deliver', message: userMessage, workContext: selected }),
      });
      if (!response.ok) throw new Error(String(response.status));
      const accepted = await response.json();
      if (accepted.accepted === false && accepted.code === 'AGENT_SIGNAL_IDLE' && accepted.id === userMessage.id) {
        send(message, selected, userMessage as AgentMessage);
        return;
      }
      if (accepted.accepted !== true) throw new Error('The instruction was not accepted.');
      setSignalReceipts((saved) => [...saved.filter(receipt => receipt.id !== userMessage.id), {
        id: userMessage.id, text: message.text, kind: 'deliver', durability: 'native',
      }]);
    },
    [attachedRunning, busy, request, send]
  );

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
  const sendingApprovalsRef = useRef<ReadonlyMap<string, boolean>>(new Map());
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
      if (
        interruptedNow.current ||
        sendingApprovalsRef.current.has(approvalId) ||
        approvalSent.current
      )
        return;
      const generation = turnGeneration.current;
      clearError();
      approvalFailed.current = false;
      // The server's list is the truth: a card it no longer holds sends
      // nothing and says so (N1, D2).
      if (!waits(approvalId)) {
        setClosedApprovals((seen) => new Set(seen).add(approvalId));
        return;
      }
      const answered = new Map(sendingApprovalsRef.current).set(
        approvalId,
        approved
      );
      sendingApprovalsRef.current = answered;
      setSendingApprovals(answered);
      await addToolApprovalResponse({ id: approvalId, approved });
      if (generation !== turnGeneration.current) return;
      // One request per step: when every card of this message's step that
      // still waits is answered, the SDK sends it for this very message.
      const approvalRun = approvalId.slice(0, approvalId.lastIndexOf('::'));
      const gates = [
        ...new Set([
          ...waitingApprovalIds(message),
          ...serverPending
            .filter(
              (run) =>
                run.kind === 'approval' &&
                run.runId === approvalRun &&
                run.toolCallId
            )
            .map((run) => `${run.runId}::${run.toolCallId}`),
        ]),
      ];
      const remaining = gates.filter(
        (id) => !sendingApprovalsRef.current.has(id) && waits(id)
      );
      if (remaining.length) return;
      if (interruptedNow.current || approvalSent.current) return;
      approvalSent.current = true;
      submittedMessage.current = null;
      refusedMessage.current = null;
      turnGeneration.current++;
      void sendMessage();
    },
    [addToolApprovalResponse, clearError, sendMessage, serverPending]
  );

  // The door took the request (the stream began), or did not.
  useEffect(() => {
    if (!sendingApprovals.size || !approvalSent.current) return;
    if (status === 'submitted') return;
    approvalSent.current = false;
    if (status === 'streaming') {
      sendingApprovalsRef.current = new Map();
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
    sendingApprovalsRef.current = new Map();
    setSendingApprovals(new Map());
    if (status === 'error') approvalFailed.current = true;
    // The card itself says it no longer waits; no second error card.
    if (gone) clearError();
    void refreshPending();
  }, [clearError, error, refreshPending, sendingApprovals, setMessages, status]);

  const answerQuestion = useCallback(
    async (
      runId: string,
      toolCallId: string | null,
      cardId: string | null,
      resumeData: Record<string, unknown>
    ) => {
      if (interruptedNow.current || questionInFlight.current)
        throw new Error('AGENT_RUN_NOT_PENDING');
      questionInFlight.current = true;
      questionError.current = null;
      turnGeneration.current++;
      clearError();
      approvalFailed.current = false;
      if (cardId) setAnsweredCards((seen) => new Set(seen).add(cardId));
      if (cardId)
        setQuestionFailures((seen) => {
          const next = new Map(seen);
          next.delete(cardId);
          return next;
        });
      questionSent.current = cardId ? { cardId, toolCallId } : null;
      submittedMessage.current = null;
      refusedMessage.current = null;
      try {
        await sendMessage(undefined, {
          body: { resume: { runId, toolCallId, cardId, resumeData } },
        });
        if (questionError.current) throw questionError.current;
      } catch (failure) {
        if (cardId) {
          setAnsweredCards((seen) => {
            const next = new Set(seen);
            next.delete(cardId);
            return next;
          });
          setQuestionFailures((seen) => new Map(seen).set(cardId, questionFailureCode(failure) ?? seen.get(cardId) ?? null));
        }
        throw failure;
      } finally {
        questionInFlight.current = false;
      }
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
  confirmWaitingHistory.current = (history, nativeWaitObserved = false) => {
    if (explicitStop.current) return false;
    const gates = history.pending.filter((run) => !!run.runId && !!run.toolCallId &&
      (run.kind === 'approval' || run.kind === 'question' && !!pendingCardId(run)));
    if (!gates.length) return false;
    // A legacy running marker cannot identify the owner of this projection.
    // Only the current native run, or a terminal execution, can reopen it.
    if (history.execution?.state !== 'settled' &&
      (!history.execution?.runId ||
        gates.some((run) => run.runId !== history.execution!.runId))) return false;
    // A replay can remain streaming after a slow provider reaches the next
    // durable question. Its observer is no longer useful and would lock every
    // answer control. Detach only that reader, never cancel the server task or
    // abort an answer/approval whose request is still being applied.
    const sentQuestion = questionSent.current;
    const answerStillPending = questionInFlight.current && (!sentQuestion || gates.some(run =>
      run.toolCallId === sentQuestion.toolCallId && pendingCardId(run) === sentQuestion.cardId));
    const questionWaiting = gates.some((run) => run.kind === 'question');
    if (transportBusy.current && (questionWaiting || nativeWaitObserved) && !answerStillPending && !approvalSent.current &&
      waitingObserverStop.current !== turnGeneration.current) {
      waitingObserverStop.current = turnGeneration.current;
      void stop();
    }
    // A fresh owned history read proves which native gate still waits. It
    // enables that gate, never repeats the lost answer or starts another run.
    const cards = new Set(gates.map(pendingCardId).filter((id): id is string => !!id));
    const recovering = interruptedNow.current || [...cards].some((id) => closedCards.has(id));
    if (!recovering) return true;
    const calls = new Set(gates.map((run) => run.toolCallId));
    const approvals = new Set(gates.filter((run) => run.kind === 'approval').map((run) => `${run.runId}::${run.toolCallId}`));
    // The SDK optimistically marked this answer responded. A saved pending
    // gate proves it still needs an answer; clear that local response too.
    if (approvals.size) setMessages((current) => [...approvals].reduce(
      (messages, id) => reopenApprovalAnswer(messages, id, false), current));
    setNativeWaiting(true);
    reconnectAttempt.current = null;
    continuation.current = false;
    interruptedNow.current = false;
    setInterrupted(false);
    clearError();
    setAnsweredCards((seen) => new Set([...seen].filter((id) => !cards.has(id))));
    setClosedCards((seen) => new Set([...seen].filter((id) => !cards.has(id))));
    setClosedCalls((seen) => new Set([...seen].filter((id) => !calls.has(id))));
    setClosedApprovals((seen) => new Set([...seen].filter((id) => !approvals.has(id))));
    sendingApprovalsRef.current = new Map([...sendingApprovalsRef.current].filter(([id]) => !approvals.has(id)));
    setSendingApprovals(sendingApprovalsRef.current);
    approvalSent.current = false;
    setApprovalTries((tries) => { const next = { ...tries }; for (const id of approvals) next[id] = (next[id] ?? 0) + 1; return next; });
    return true;
  };
  useEffect(() => {
    const sent = questionSent.current;
    if (!sent || status === 'submitted' || status === 'streaming') return;
    questionSent.current = null;
    if (status !== 'error') return;
    const { cardId, toolCallId } = sent;
    setQuestionFailures((seen) => new Map(seen).set(cardId, questionFailureCode(error) ?? seen.get(cardId) ?? null));
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
  const announceArtifacts = useRef(onArtifacts);
  announceArtifacts.current = onArtifacts;
  useEffect(() => { announceArtifacts.current?.(artifacts); }, [artifacts]);
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

  /*
    Sample files attached in the chat (`kcxz.18`) go to the avatar the
    composer names (review W3-18 F2): the one the person picked there, else
    the avatar this conversation created last, else the workspace default.
    A card left by a read (a proposal, the lines by hand) does not choose it.
  */
  const role = useUser()?.role ?? null;
  const editor = isOrganizationEditor(role);
  const created = useMemo(() => createdAvatarOf(messages, removed), [messages, removed]);
  const createdId = created?.id ?? null;
  /** The person's own pick; `undefined` — not picked since the last avatar made here. */
  const [picked, setPicked] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    setPicked(undefined);
    // A new avatar made here joins the list the composer offers.
    if (createdId) void mutate(AVATAR_ROUTES.list);
  }, [createdId, mutate]);
  const avatarList = useSWR(
    editor ? AVATAR_ROUTES.list : null,
    () => readVoice(request, AVATAR_ROUTES.list),
    { revalidateOnFocus: false }
  );
  const samplesTarget = useMemo<SamplesTarget>(() => {
    const rows = mapAvatars(avatarList.data).avatars;
    const fallback = rows.find((one) => one.isDefault) ?? null;
    const named = (one: { name: string | null }) =>
      one.name ?? words.composer.samplesUnnamed;
    const options = rows
      .filter((one) => one.id !== fallback?.id)
      .map((one) => ({ id: one.id, label: named(one) }));
    const wanted = picked !== undefined ? picked : createdId;
    // Just made here, not in the list yet: named from its card.
    if (wanted && wanted !== fallback?.id && !options.some((one) => one.id === wanted)) {
      options.push({ id: wanted, label: created?.name ?? words.composer.samplesUnnamed });
    }
    return {
      // Not named until the list is read: «первому аватару» would be a guess.
      known: avatarList.data !== undefined,
      options,
      value: wanted && wanted !== fallback?.id ? wanted : null,
      defaultName: fallback ? named(fallback) : null,
      onChange: setPicked,
    };
  }, [avatarList.data, created, createdId, picked, words]);
  const sendSamples = useCallback(
    async (files: File[], avatarId: string | null) => {
      const sent = await sendSamplesTo(request, files, {
        avatarId,
        locale: words.locale,
      });
      // The avatar screen beside the chat reads its samples again.
      revalidateUnder(VOICE_API_BASE);
      return sent;
    },
    [revalidateUnder, request, words.locale]
  );
  // Pictures go to the media library through its own request (`kcxz.25`);
  // the library beside the chat reads its pages again.
  const sendMedia = useCallback(
    async (files: File[], saved: LibrarySaved) => {
      try {
        return await uploadToLibrary(request, files, saved);
      } finally {
        revalidateUnder(MEDIA_LIBRARY_KEY_PREFIX);
      }
    },
    [request, revalidateUnder]
  );
  // A picture the agent was shown, put into the library when the person
  // agrees on the `media.keep` card (owner decision 28.09); the library beside
  // the chat reads its pages again.
  const keepPicture = useCallback(
    async (key: string) => {
      try {
        return await keepShownPictureInLibrary(request, key);
      } finally {
        revalidateUnder(MEDIA_LIBRARY_KEY_PREFIX);
      }
    },
    [request, revalidateUnder]
  );
  const describeSamplesFailure = useCallback(
    ({ code }: { code: string | null }) => {
      const known = errorWordsFor(words, code, true);
      return known.known ? `${known.what} ${known.next}` : words.composer.samplesFailed;
    },
    [words]
  );
  const [forkingMessageId, setForkingMessageId] = useState<string | null>(null);
  const [forkFailedMessageId, setForkFailedMessageId] = useState<string | null>(null);
  const forkFromMessage = useCallback(
    async (messageId: string) => {
      const id = thread.current;
      if (!id || !onForked || forkingMessageId) return;
      setForkingMessageId(messageId);
      setForkFailedMessageId(null);
      try {
        const response = await request(AGENT_DOORS.forkThread(id), {
          method: 'POST',
          body: JSON.stringify({ upToMessageId: messageId }),
        });
        if (!response.ok) throw new Error(String(response.status));
        const cloned = (await response.json()) as { id?: unknown };
        if (typeof cloned?.id !== 'string' || !cloned.id) {
          throw new Error('fork_failed');
        }
        await mutate(THREADS_KEY);
        onForked(cloned.id);
      } catch {
        setForkFailedMessageId(messageId);
      } finally {
        setForkingMessageId(null);
      }
    },
    [forkingMessageId, mutate, onForked, request]
  );
  const sendVoice = useCallback(
    async (audio: Blob) => {
      const form = new FormData();
      const ext = audio.type.includes('mp4')
        ? 'm4a'
        : audio.type.includes('ogg')
          ? 'ogg'
          : 'webm';
      form.append('file', audio, `voice.${ext}`);
      const response = await request(AGENT_DOORS.voiceTranscribe, {
        method: 'POST',
        body: form,
      });
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        const code = errorCodeOf(body) ?? readDoorError(body);
        const failure = new Error(code ?? 'VOICE_TRANSCRIPTION_FAILED') as Error & {
          code?: string | null;
        };
        failure.code = code;
        throw failure;
      }
      const payload = (await response.json()) as { text?: unknown };
      if (typeof payload?.text !== 'string') {
        throw new Error('VOICE_TRANSCRIPTION_FAILED');
      }
      void mutate(ALLOWANCE_API);
      return payload.text;
    },
    [mutate, request]
  );
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
    for (const pieceId of again)
      revalidateArtifact({
        kind: 'piece',
        id: pieceId,
        title: null,
        code: null,
        data: {},
      });
  }, [revalidateArtifact, touches]);

  const videoTouches = useMemo(() => videoTouchesOf(messages), [messages]);
  const touchedVideos = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!touchedVideos.current) { touchedVideos.current = new Set(videoTouches.map(touch => touch.key)); return; }
    for (const touch of videoTouches) {
      if (touchedVideos.current.has(touch.key)) continue;
      touchedVideos.current.add(touch.key);
      revalidateArtifact(touch.artifact);
    }
  }, [videoTouches, revalidateArtifact]);

  // A finished action of a group re-reads the screen beside the chat
  // (`useRevalidateWhenCountGrows`); what the thread loaded with is already
  // current. Channels (`kcxz.19`): the channel screen and a connect card.
  // A finished read of a group opens its panel, which reads again too (W4
  // walk P2-B, `panelReadsOf`): the agent points at what the panel shows.
  const channelCalls = useMemo(
    () => channelCallsOf(messages) + panelReadsOf(messages, 'channel_'),
    [messages]
  );
  useRevalidateWhenCountGrows(channelCalls, '/integrations/');
  // Avatars (W3 walk P2-A): the avatar screen and the composer's avatar list.
  const avatarCalls = useMemo(
    () => avatarCallsOf(messages) + panelReadsOf(messages, 'avatar_'),
    [messages]
  );
  useRevalidateWhenCountGrows(avatarCalls, VOICE_API_BASE);
  // «Откуда идеи» (`kcxz.23`): its subscriptions and queue.
  const ideaCalls = useMemo(
    () => ideaCallsOf(messages) + panelReadsOf(messages, 'ideas_'),
    [messages]
  );
  useRevalidateWhenCountGrows(ideaCalls, LEADS_API);
  // «Откуда факты» (`kcxz.24`): the facts.
  const factCalls = useMemo(
    () => factCallsOf(messages) + panelReadsOf(messages, 'facts_'),
    [messages]
  );
  useRevalidateWhenCountGrows(factCalls, FACTS_API);
  // «Медиатека» (`kcxz.25`): a picture generated into it.
  const mediaCalls = useMemo(
    () => mediaCallsOf(messages) + panelReadsOf(messages, 'media_'),
    [messages]
  );
  useRevalidateWhenCountGrows(mediaCalls, MEDIA_LIBRARY_KEY_PREFIX);

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
  // Chosen from the workspace once it answered (spec §6.1, `kcxz.21`); an
  // error counts as an answer, and then every open step is offered.
  const starters = onboarding.answered
    ? startersFor(onboarding.progress, user?.role ?? null)
    : null;
  // No channel and this role cannot connect one: say who does, instead of a
  // starter that ends in a refusal (review W3-21 P3-2/P3-3).
  const channelByAdmin =
    onboarding.answered &&
    channelWaitsForAdmin(onboarding.progress, user?.role ?? null);

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
      case 'source-range':
        return (
          <Note key={block.key} tone="neutral">
            {words.question.readRange(
              block.sourceTitle,
              block.offset,
              block.characters
            )}
          </Note>
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
            : block.state === 'asked' &&
              sending === undefined &&
              !waits(block.approvalId)
            ? 'closed'
            : block.state;
        return (
          <ApprovalCard
            key={`${block.key}:${approvalTries[block.approvalId] ?? 0}`}
            title={block.title}
            reason={block.reason}
            irreversible={block.irreversible}
            toolName={block.toolName}
            videoApproval={block.videoApproval}
            canAnswer={block.approvalId.includes('::')}
            state={state}
            busy={busy || interrupted}
            sending={sending ?? null}
            onAnswer={(approved) =>
              void answerApproval(message, block.approvalId, approved, waits)
            }
            onRefresh={() => {
              void refreshPending(true);
            }}
            words={words}
          />
        );
      }
      case 'question': {
        // Refused here as no longer waiting, and since read back from the
        // thread with its answer from elsewhere: it still says so (R2).
        if (
          block.runId === null &&
          block.toolCallId &&
          closedCalls.has(block.toolCallId)
        ) {
          return (
            <div key={block.key} className="flex min-w-0 flex-col gap-[8px]">
              <QuestionClosedLine
                {...closedLineOf(block, words)}
                state="closed"
                words={words}
              />
              {block.question.kind === 'domain-questions' ? (
                <DomainQuestionCard
                  question={block.question}
                  busy={false}
                  readOnly
                  onAnswer={() => undefined}
                  words={words}
                  draftStorageKey={draftStorageKey}
                />
              ) : (
                <RetainedQuestionDraft
                  words={words}
                  draftStorageKey={
                    draftStorageKey
                      ? `${draftStorageKey}:question:${block.question.cardId}`
                      : undefined
                  }
                />
              )}
            </div>
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
            (block.question.kind === 'domain-questions' &&
              questionSent.current?.cardId === block.question.cardId &&
              (busy || questionInFlight.current)) ||
            (last && !pendingKnown));
        if (block.runId && !waits) {
          return (
            <div key={block.key} className="flex min-w-0 flex-col gap-[8px]">
              <QuestionClosedLine
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
              {block.question.kind === 'domain-questions' &&
              closedCards.has(block.question.cardId ?? '') ? (
                <DomainQuestionCard
                  question={block.question}
                  busy={false}
                  readOnly
                  onAnswer={() => undefined}
                  words={words}
                  draftStorageKey={draftStorageKey}
                />
              ) : null}
              {block.question.kind !== 'domain-questions' &&
              closedCards.has(block.question.cardId ?? '') ? (
                <RetainedQuestionDraft
                  words={words}
                  draftStorageKey={
                    draftStorageKey
                      ? `${draftStorageKey}:question:${block.question.cardId}`
                      : undefined
                  }
                />
              ) : null}
            </div>
          );
        }
        if (block.question.kind === 'domain-questions' && block.runId) {
          const runId = block.runId;
          return (
            <DomainQuestionCard
              key={`${block.key}:${block.question.cardId}`}
              question={block.question}
              busy={busy || interrupted}
              failure={questionFailures.has(block.question.cardId ?? '')}
              failureCode={questionFailures.get(block.question.cardId ?? '') ?? null}
              draftStorageKey={draftStorageKey}
              onAnswer={(resumeData) =>
                answerQuestion(
                  runId,
                  block.toolCallId,
                  block.question.cardId,
                  resumeData
                )
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
              failure={questionFailures.has(selection.cardId ?? '')}
              busy={busy || interrupted}
              onAnswer={(resumeData) =>
                answerQuestion(
                  runId,
                  block.toolCallId,
                  block.question.cardId,
                  resumeData
                )
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
              draftStorageKey={
                draftStorageKey
                  ? `${draftStorageKey}:interview:${interview.cardId}`
                  : undefined
              }
              failure={questionFailures.has(interview.cardId ?? '')}
              busy={busy || interrupted}
              onAnswer={(resumeData) =>
                answerQuestion(
                  runId,
                  block.toolCallId,
                  block.question.cardId,
                  resumeData
                )
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
            failure={questionFailures.has(block.question.cardId ?? '')}
            draftStorageKey={
              draftStorageKey
                ? `${draftStorageKey}:question:${block.question.cardId}`
                : undefined
            }
            busy={busy || interrupted}
            onAnswer={(resumeData) => {
              if (block.runId)
                return answerQuestion(
                  block.runId,
                  block.toolCallId,
                  block.question.cardId,
                  resumeData
                );
            }}
            keepPicture={keepPicture}
            words={words}
          />
        );
      }
      case 'working': {
        if (!live) return null;
        const toolSeen = stages[block.toolName] ?? [];
        const agentSeen = stages.agent ?? [];
        const seen = [
          ...toolSeen,
          ...agentSeen.filter((word) => !toolSeen.includes(word)),
        ];
        return (
          <ProgressCard
            key={block.key}
            title={block.title}
            current={seen[seen.length - 1] ?? words.progress.working}
            steps={seen.slice(0, -1)}
            onStop={stopAndReconcile}
            words={words}
          />
        );
      }
      case 'tasks':
        return (
          <TaskChecklistCard
            key={block.key}
            tasks={block.tasks}
            words={words}
          />
        );
      case 'objective':
        return (
          <ObjectiveCard
            key={block.key}
            objective={block.objective}
            words={words}
          />
        );
      case 'subagent':
        return (
          <SubagentCard
            key={block.key}
            subagent={block.subagent}
            words={words}
          />
        );
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
        // The paid limit of one message is a designed stop, not a failure
        // (W3 recheck R-5): a quiet line under the step, and the agent's own
        // words say what is done and what is left.
        if (block.code === 'PAID_CAP_REACHED') {
          return (
            <Note key={block.key} tone="neutral">
              {words.error.paidCapNote(block.title)}
            </Note>
          );
        }
        return (
          <ErrorCard
            key={block.key}
            title={block.title}
            code={block.code}
            reviewFindings={block.reviewFindings}
            refusal
            words={words}
          />
        );
      case 'connect':
        return (
          <ChannelConnectCard
            key={block.key}
            connect={block.connect}
            threadId={thread.current}
            onOpen={(artifact) => onArtifact(artifact, 'asked')}
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
  const lastBlocks = lastAssistant ? (blocksOf.get(lastAssistant.id) ?? []) : [];
  const hasWorkingBlock = lastBlocks.some((block) => block.type === 'working');
  const agentStages = stages.agent ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={scroller}
        onScroll={(event) => {
          const node = event.currentTarget;
          pinned.current =
            node.scrollHeight - node.scrollTop - node.clientHeight < 96;
        }}
        className="relative min-h-0 flex-1 overflow-y-auto px-[16px] py-[24px] md:px-[20px]"
      >
        <div
          role="log"
          aria-label={words.conversation.label}
          aria-live="polite"
          aria-relevant="additions"
          className="flex w-full min-w-0 flex-col gap-[20px]"
        >
          {pagination?.hasMore ? (
            <div className="flex flex-wrap items-center gap-[8px]">
              <Button type="button" variant="quiet" density="dense" disabled={busy} loading={loadingOlder} loadingLabel={words.history.loading} onClick={() => void loadOlder()}>
                {words.threads.older}
              </Button>
              {olderFailed ? (
                <span role="status" className="cf-body-sm text-cf-danger">
                  {words.threads.actionFailed}
                </span>
              ) : null}
            </div>
          ) : null}
          {!messages.length && !busy && !interrupted && serverExecution?.state !== 'running' && serverExecution?.state !== 'unknown' ? (
            <StartHere
              starters={starters}
              channelByAdmin={channelByAdmin}
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
                  {onForked && (threadId || thread.current) && !live ? (
                    <div className="flex flex-wrap items-center gap-[8px]">
                      <Button
                        type="button"
                        variant="quiet"
                        density="dense"
                        disabled={busy || forkingMessageId !== null}
                        loading={forkingMessageId === message.id}
                        loadingLabel={words.conversation.forking}
                        onClick={() => void forkFromMessage(message.id)}
                      >
                        <AgentGlyph name="branch" size={12} />
                        <span className="cf-caption">
                          {words.conversation.forkFromMessage}
                        </span>
                      </Button>
                      {forkFailedMessageId === message.id ? (
                        <span role="status" className="cf-caption text-cf-danger">
                          {words.conversation.forkFailed}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
          {signalReceipts.filter(receipt => !messages.some(message => message.id === receipt.id)).map((receipt) => (
              <div key={`signal:${receipt.id}`}>
                <UserMessage message={{ id: receipt.id, role: 'user', parts: [{ type: 'text', text: receipt.text }] }} words={words} />
                <span role="status" className="cf-caption text-cf-ink-muted">
                  {receipt.state === 'unknown' ? words.composer.signalUnknown : receipt.kind === 'deliver' ? words.composer.signalAccepted : words.composer.signalQueued}
                </span>
              </div>
            ))}
          {status === 'submitted' && !agentStages.length ? (
            <WorkingLine label={words.conversation.thinking} />
          ) : null}
          {!hasWorkingBlock && (attachedRunning || (busy && agentStages.length > 0)) ? (
            <ProgressCard
              title={null}
              current={agentStages[agentStages.length - 1] ?? words.progress.working}
              steps={agentStages.slice(0, -1)}
              onStop={stopAndReconcile}
              words={words}
            />
          ) : null}
          {nativeWaiting && serverPending.length > 0 && !busy && !interrupted ? (
            <div className="flex min-w-0 items-center">
              <Button type="button" variant="quiet" density="dense" onClick={stopAndReconcile}>
                <AgentGlyph name="stop" size={14} />
                {words.progress.stop}
              </Button>
            </div>
          ) : null}
          {chatError ? (
            <ErrorCard
              title={null}
              code={chatError.code}
              network={chatError.network && !chatError.code}
              // An approval that did not go through is asked again on its own
              // card; regenerating would re-run the last message instead.
              onRetry={
                approvalFailed.current || interrupted || chatError.network
                  ? undefined
                  : () => {
                      const retry = refusedMessage.current;
                      if (retry) {
                        submittedMessage.current = retry;
                        refusedMessage.current = null;
                        setComposerRecovery((previous) => ({ version: (previous?.version ?? 0) + 1, kind: 'clear', text: retry.message.text }));
                      }
                      turnGeneration.current++;
                      clearError();
                      void regenerate(retry?.context !== undefined ? { body: { workContext: retry.context } } : undefined);
                    }
              }
              words={words}
            />
          ) : null}
        </div>
      </div>
      <div className="shrink-0 px-[16px] pb-[16px] pt-[8px] md:px-[20px]">
        <div className="w-full min-w-0">
          {contextControls}
          {interrupted ? (
            <div role="status" className="mb-[12px] flex flex-wrap items-center gap-[8px] cf-body-sm text-cf-ink-muted">
              <span>
                {thread.current ? t('assistant_interrupted_note', 'Response interrupted. Check the saved result before continuing.') : t('assistant_unknown_result', 'The response was interrupted before the conversation identifier arrived. Check history: the action may have been saved. You can start a new conversation.')}
              </span>
              {thread.current ? (
                <Button type="button" variant="secondary" density="dense" loading={checking} loadingLabel={t('assistant_working', 'Working')} disabled={busy} onClick={() => void reconcile()}>
                  {t('assistant_reconcile', 'Check saved result')}
                </Button>
              ) : onNewConversation ? (
                <Button type="button" variant="secondary" density="dense" onClick={onNewConversation}>
                  {words.threads.newThread}
                </Button>
              ) : null}
            </div>
          ) : null}
          <fieldset disabled={interrupted && !busy} className="min-w-0">
          <AgentComposer
            busy={busy || attachedRunning}
            queued={false}
            onSubmit={submit}
            onStop={stopAndReconcile}
            uploadSamples={sendSamples}
            samplesTarget={samplesTarget}
            samplesAllowed={editor}
            uploadMedia={sendMedia}
            mediaAllowed={editor}
            transcribeVoice={sendVoice}
            describeFailure={describeSamplesFailure}
            words={words}
            autoFocus={!messages.length}
            draft={draft}
            draftStorageKey={draftStorageKey}
            recovery={composerRecovery}
            onDraftUsed={onDraftUsed}
          />
          </fieldset>
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
  // An attached text file and a samples or pictures receipt travel as the
  // server's data wrapper; they are drawn as the files' line, not as words
  // (`kcxz.18`, `kcxz.25`).
  const attached = parts.map((part) =>
    part.type === 'text'
      ? readAttachedText(String(part.text ?? ''))
      : readSamplesPart(part) ?? readMediaPart(part)
  );
  const text = parts
    .map((part, index) =>
      part.type === 'text' && !attached[index] ? String(part.text ?? '') : ''
    )
    .join('\n')
    .trim();
  const files = parts.flatMap((part, index) => {
    const read = attached[index];
    if (read) {
      return [
        {
          name: read.name,
          samples: 'samples' in read ? read.samples ?? null : null,
          media: 'media' in read ? read.media ?? null : null,
          viewed: 'viewed' in read ? read.viewed === true : false,
        },
      ];
    }
    // A picture shown to the AI rides inline in the live message (28.09).
    return part.type === 'file'
      ? [
          {
            name: String(part.filename ?? part.mediaType ?? ''),
            samples: null,
            media: null,
            viewed: String(part.mediaType ?? '').startsWith('image/'),
          },
        ]
      : [];
  });
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
            {file.samples
              ? words.conversation.samplesAdded(file.name, file.samples.accepted)
              : file.media
                ? words.conversation.mediaAdded(file.name, file.media.count)
                : file.viewed
                  ? words.conversation.pictureViewed(file.name)
                  : file.name}
          </span>
        </span>
      ))}
    </div>
  );
}

/**
 * An empty thread: say where to start. The starters are the open steps of
 * «С чего начать» the role can run, in menu order, the first one leading
 * (spec §6.1, `kcxz.21`; roles `kcxz.31`, D14). Until the workspace answers
 * only the words show, so no button appears and then vanishes.
 */
function StartHere({
  starters,
  channelByAdmin = false,
  onStart,
  words,
}: {
  starters: AgentStarter[] | null;
  /** No channel yet, and an administrator has to connect it. */
  channelByAdmin?: boolean;
  onStart: (step: AgentStarter) => void;
  words: AgentWords;
}) {
  const w = words.start;
  return (
    <div className="flex min-w-0 items-start gap-[12px]">
      <span className="pt-[4px]">
        <CfMark size={24} decorative />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-[16px]">
        <div className="flex flex-col gap-[4px]">
          <h2 className="cf-heading-md text-cf-ink [text-wrap:balance]">
            {w.title}
          </h2>
          <p className="cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
            {w.lead}
          </p>
          {channelByAdmin ? (
            <p
              data-agent-start-note="channel-by-admin"
              className="cf-body-sm text-cf-ink-muted [text-wrap:pretty]"
            >
              {w.channelByAdmin}
            </p>
          ) : null}
        </div>
        {starters?.length ? (
          <div className="flex flex-col items-start gap-[8px]">
            {starters.map((step, index) => (
              <Button
                key={step}
                type="button"
                density="dense"
                variant={index === 0 ? 'primary' : 'secondary'}
                onClick={() => onStart(step)}
              >
                {w.starters[step]}
              </Button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
