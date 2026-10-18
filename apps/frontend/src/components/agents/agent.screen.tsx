'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useInterfaceLanguage } from '@contentfactory/react/translation/use-interface-language';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { Button } from '@contentfactory/react/form/button';
import { ButtonLink } from '@contentfactory/react/form/button-link';
import { ErrorState, SkeletonRows } from '@contentfactory/frontend/components/ui/surface';
import { AgentAvailabilityGate } from './agent.availability';
import {
  AGENT_DOORS, AGENT_TIMEZONE_HEADER, artifactHref, artifactKey, artifactRefOf,
  artifactsOf, readAgentWorkspace, readThreadHistory, refToArtifact,
  type AgentArtifact, type AgentThreadHistory, type AgentWorkContextV1,
} from './agent.contract';
import { agentWordsFor, type AgentWords } from './agent.copy';
import { AgentConversation } from './agent.conversation';
import { AgentArtifactHost } from './agent.artifact-host';
import { AgentArtifactPicker } from './agent.artifact-picker';
import { AgentWorkspaceShell } from './agent.workspace-shell';
import { AgentWorkspaceBrowser } from './agent.workspace-browser';
import { AgentContextChip } from './agent.context-chip';
import { AgentArtifactLiveStatus, useArtifactMetadata } from './agent.artifact-metadata';
import { artifactName } from './agent.cards';
import { pieceIdOf, useLoadedPiece, withPieceData } from './agent.piece-data';
import { useAssistantWorkspace } from './assistant.workspace-context';
import { assistantContextKey } from './assistant.route-context';
import { artifactWorkspaceReducer, emptyArtifactWorkspace, persistedArtifactSelection, type ArtifactWorkspaceState } from './agent.workspace-state';
import { THREADS_KEY, ThreadSwitcher, useAgentThreads } from './agent.threads';
import { screenTimeZone } from './agent.transport';
import { AGENT_START_PARAM, startDraftStep } from './agent.starters';
import { AGENT_FROM_EDITOR, AGENT_FROM_PARAM, editorDraft, takeEditorHandoff } from './agent.handoff';
import { useUser } from '@contentfactory/frontend/components/layout/user.context';
import { useOnboardingProgress } from '@contentfactory/frontend/components/onboarding/use-onboarding-progress';

const LEAD_TITLE_IN_DRAFT = 200;
type Session = { key: string; threadId: string | null; fresh: boolean };
let sessionCounter = 0;
const newSession = (): Session => ({ key: `new-${Date.now()}-${++sessionCounter}`, threadId: null, fresh: true });
// A revisit reads current history rather than the previous visit's SWR snapshot.
const threadSession = (id: string): Session => ({ key: `thread-${id}-${++sessionCounter}`, threadId: id, fresh: false });
const routeThread = (id: string | string[] | undefined) => {
  const value = Array.isArray(id) ? id[0] : id;
  if (!value || value === 'new') return null;
  try { return decodeURIComponent(value); } catch { return null; }
};
const contextFor = (artifact: AgentArtifact): AgentWorkContextV1 => {
  const ref = artifactRefOf(artifact);
  const section = ['workspace', 'channels', 'ideas', 'facts', 'media'].includes(ref.kind);
  return {
    version: 'assistant-work-context/v1', kind: ref.kind === 'channels' ? 'workspace' : ref.kind,
    ...(!section ? { id: ref.id } : {}),
    ...(ref.pieceId ? { pieceId: ref.pieceId } : {}),
    ...(ref.channelId ? { channelId: ref.channelId } : {}),
    ...(ref.adaptationId ? { adaptationId: ref.adaptationId } : {}),
  };
};

/** The authenticated host keeps this one session mounted across manual routes. */
export function AgentScreen({ contextual = false }: { contextual?: boolean }) {
  const language = useInterfaceLanguage();
  const t = useT();
  const baseWords = agentWordsFor(language);
  const words = useMemo(() => ({ ...baseWords, screenLabel: t('agent', 'AI assistant'), conversation: { ...baseWords.conversation, agent: t('agent', 'AI assistant') } }), [baseWords, t]);
  const router = useRouter();
  const pathname = usePathname();
  const isAgentsRoute = /^\/agents(?:\/|$)/.test(pathname ?? '');
  const params = useParams<{ id?: string }>();
  const routeId = isAgentsRoute ? routeThread(params?.id) : null;
  const assistant = useAssistantWorkspace();
  const assistantRef = useRef(assistant);
  assistantRef.current = assistant;
  const { mutate } = useSWRConfig();
  const request = useFetch();
  const [session, setSession] = useState<Session>(() => routeId ? threadSession(routeId) : newSession());
  const current = useRef(session);
  current.current = session;
  const [states, setStates] = useState<Record<string, ArtifactWorkspaceState>>(() => ({ [session.key]: emptyArtifactWorkspace(session.fresh) }));
  const fallback = useMemo(() => emptyArtifactWorkspace(session.fresh), [session.key]);
  const workspace = states[session.key] ?? fallback;
  const dispatch = useCallback((action: Parameters<typeof artifactWorkspaceReducer>[1]) => {
    setStates((previous) => ({ ...previous, [session.key]: artifactWorkspaceReducer(previous[session.key] ?? emptyArtifactWorkspace(session.fresh), action) }));
  }, [session.key, session.fresh]);
  const [title, setTitle] = useState<string | null>(null);
  const [selectionVersion, setSelectionVersion] = useState(0);
  const [starter, setStarter] = useState<string | null>(null);
  const [requested, setRequested] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [aiUnavailable, setAiUnavailable] = useState(false);
  const [saveFailed, setSaveFailed] = useState<string | null>(null);
  const [saveAttempt, setSaveAttempt] = useState(0);
  const explicitSelection = useRef(new Set<string>());

  useLayoutEffect(() => {
    if (!isAgentsRoute || routeId === current.current.threadId) return;
    if (routeId) setSession(threadSession(routeId));
    else if (pathname === '/agents/new' && !current.current.fresh) setSession(newSession());
  }, [isAgentsRoute, routeId, pathname]);
  const lastRequest = useRef({ version: 0, context: assistantContextKey(assistant?.workContext ?? null) });
  useLayoutEffect(() => {
    const version = assistant?.requestVersion ?? 0;
    if (!version || version === lastRequest.current.version) return;
    const context = assistantContextKey(assistant?.workContext ?? null);
    const sameContext = lastRequest.current.context === context;
    lastRequest.current = { version, context };
    const target = assistant?.requestedThreadId;
    if (target && current.current.threadId === target) return;
    if (!target && current.current.fresh && sameContext) return;
    setSession(target ? threadSession(target) : newSession());
  }, [assistant?.requestVersion, assistant?.requestedThreadId, assistant?.workContext]);
  useEffect(() => { setTitle(null); setSaveFailed(null); }, [session.key]);
  useEffect(() => {
    if (session.threadId) assistantRef.current?.rememberThread(session.threadId);
  }, [session.threadId]);
  useEffect(() => {
    if (!isAgentsRoute) return;
    const query = new URLSearchParams(window.location.search);
    const fromEditor = query.get(AGENT_FROM_PARAM) === AGENT_FROM_EDITOR;
    if (!query.has(AGENT_START_PARAM) && !fromEditor) return;
    const step = query.get(AGENT_START_PARAM);
    query.delete(AGENT_START_PARAM);
    if (fromEditor) query.delete(AGENT_FROM_PARAM);
    const rest = query.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${rest ? `?${rest}` : ''}`);
    if (fromEditor) {
      const handoff = takeEditorHandoff(window.sessionStorage);
      if (!routeId && handoff) setDraft(editorDraft(words.panel.fromEditor, handoff));
    } else if (!routeId) setRequested(step);
    // Consume an explicit handoff once. Opening never submits it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAgentsRoute]);
  const user = useUser();
  const onboarding = useOnboardingProgress();
  useEffect(() => {
    if (requested === null || !user || !onboarding.answered) return;
    const step = startDraftStep(requested, { newThread: !current.current.threadId, role: user.role, progress: onboarding.progress });
    setRequested(null);
    if (step) setDraft(words.start.starters[step]);
  }, [requested, user, onboarding.answered, onboarding.progress, words]);
  useEffect(() => { if (aiUnavailable && starter !== null) setStarter(null); }, [aiUnavailable, starter]);
  const onDraftUsed = useCallback(() => setDraft(null), []);
  const onArtifacts = useCallback((artifacts: AgentArtifact[]) => dispatch({ type: 'produced', artifacts }), [dispatch]);
  const selectArtifact = useCallback((artifact: AgentArtifact) => {
    explicitSelection.current.add(session.key);
    dispatch({ type: 'select', artifact });
    setSelectionVersion((version) => version + 1);
    assistantRef.current?.setWorkContext(contextFor(artifact), artifact);
    if (contextual) router.push(artifactHref(artifact));
  }, [dispatch, contextual, router, session.key]);
  const onArtifact = useCallback((artifact: AgentArtifact, how: 'produced' | 'asked') => {
    if (how === 'asked') selectArtifact(artifact);
    else dispatch({ type: 'produced', artifacts: [artifact] });
  }, [dispatch, selectArtifact]);
  const artifact = workspace.artifacts.find((one) => artifactKey(one) === workspace.active) ?? null;
  useEffect(() => {
    if (contextual || workspace.hidden || workspace.activeSource !== 'produced' || !artifact) return;
    assistantRef.current?.setWorkContext(contextFor(artifact), artifact);
    // The accepted selection drives context once; removing context is a separate deliberate action.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.active, workspace.activeSource, workspace.hidden, contextual]);
  const closeArtifact = useCallback(() => {
    explicitSelection.current.add(session.key);
    dispatch({ type: 'hide' });
    window.setTimeout(() => document.querySelector<HTMLButtonElement>('[data-assistant-restore]')?.focus(), 0);
  }, [dispatch, session.key]);
  const onRemoved = useCallback(() => {
    if (workspace.active) dispatch({ type: 'remove', key: workspace.active });
  }, [workspace.active, dispatch]);
  const onHistory = useCallback((history: AgentThreadHistory) => {
    const saved = history.workspace ?? null;
    dispatch({ type: 'restore', artifacts: [...(saved?.artifacts.map(refToArtifact) ?? []), ...artifactsOf(history.messages)], workspace: saved });
    if (!contextual && saved && !explicitSelection.current.has(session.key)) assistantRef.current?.setWorkContext(saved.workContext, saved.activeArtifact ? refToArtifact(saved.activeArtifact) : null);
  }, [dispatch, contextual, session.key]);
  const writeFromLead = useCallback((leadTitle: string) => {
    setDraft(words.panel.writeFromLead(leadTitle.trim().slice(0, LEAD_TITLE_IN_DRAFT)));
    if (window.innerWidth < 1280) dispatch({ type: 'hide' });
  }, [words, dispatch]);
  const openThread = useCallback((id: string) => {
    setSession(threadSession(id));
    if (isAgentsRoute) router.push(`/agents/${encodeURIComponent(id)}`);
  }, [isAgentsRoute, router]);
  const startNew = useCallback(() => {
    setSession(newSession());
    if (isAgentsRoute) assistantRef.current?.setWorkContext(null);
    if (isAgentsRoute) router.push('/agents/new');
  }, [isAgentsRoute, router]);
  const onThreadId = useCallback((id: string) => {
    if (current.current.key !== session.key) return;
    setSession((open) => ({ ...open, threadId: id }));
    assistantRef.current?.rememberThread(id);
    if (/^\/agents(?:\/|$)/.test(window.location.pathname)) window.history.replaceState(null, '', `/agents/${encodeURIComponent(id)}`);
    void mutate(THREADS_KEY);
  }, [mutate, session.key]);
  const onTitle = useCallback((next: string | null) => {
    if (current.current.key === session.key) setTitle(next);
  }, [session.key]);
  const onWorkContext = useCallback((next: AgentWorkContextV1 | null) => {
    if (current.current.key !== session.key) return;
    const open = assistantRef.current;
    if (open && assistantContextKey(open.workContext) === assistantContextKey(next)) open.setWorkContext(next, open.contextArtifact);
  }, [session.key]);

  const saveQueue = useRef(Promise.resolve());
  const lastSaved = useRef<Record<string, string>>({});
  const workContext = assistant?.workContext ?? null;
  const selection = useMemo(() => persistedArtifactSelection(workspace), [workspace]);
  const savedBody = useMemo(() => JSON.stringify({
    workContext,
    artifacts: selection.artifacts.map(artifactRefOf),
    activeArtifact: selection.activeArtifact ? artifactRefOf(selection.activeArtifact) : null,
  }), [workContext, selection]);
  useEffect(() => {
    const id = session.threadId;
    if (!id || !workspace.ready || lastSaved.current[id] === savedBody) return;
    const key = session.key;
    const timer = window.setTimeout(() => {
      saveQueue.current = saveQueue.current.catch(() => undefined).then(async () => {
        if (lastSaved.current[id] === savedBody) return;
        try {
          const response = await request(AGENT_DOORS.threadWorkspace(id), { method: 'PATCH', body: savedBody });
          if (!response.ok) throw new Error(String(response.status));
          const next = readAgentWorkspace((await response.json()).workspace);
          if (!next) throw new Error('workspace unavailable');
          lastSaved.current[id] = savedBody;
          if (current.current.key === key) setSaveFailed(null);
        } catch {
          if (current.current.key === key) setSaveFailed(key);
        }
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [session.key, session.threadId, workspace.ready, savedBody, request, saveAttempt]);

  const threads = useAgentThreads();
  const listed = session.threadId ? threads.data?.find((thread) => thread.id === session.threadId)?.title : null;
  const shownTitle = listed ?? title ?? words.threads.newThread;
  const loadedPiece = useLoadedPiece(artifact ? pieceIdOf(artifact) : null);
  const metadata = useArtifactMetadata(artifact ? [artifact] : []);
  const resolved = artifact && loadedPiece ? withPieceData(artifact, loadedPiece) : artifact;
  const materialName = resolved ? resolved.kind === 'piece' && loadedPiece?.piece.title ? loadedPiece.piece.title : metadata.get(resolved)?.name || artifactName(resolved, words) : t('assistant_material', 'Material');
  const picker = <AgentArtifactPicker artifacts={workspace.artifacts} active={workspace.active} unread={workspace.unread.length} onSelect={selectArtifact} onRemove={(key) => dispatch({ type: 'remove', key })} words={words} />;

  return (
    <div data-agent-screen="" className={contextual ? 'relative flex min-h-0 min-w-0 flex-1' : 'relative flex h-[calc(100dvh-56px)] min-h-0 min-w-0 flex-none md:h-auto md:flex-1'}>
      <div className="flex min-h-0 min-w-0 flex-1 md:absolute md:inset-0">
        <AgentWorkspaceShell contextual={contextual} hasMaterial={!!artifact} hidden={workspace.hidden} selectionVersion={selectionVersion} materialName={materialName} onHide={closeArtifact} materialActions={<>
          {resolved ? <AgentArtifactLiveStatus artifact={resolved} metadata={metadata.get(resolved)} /> : null}
          {workspace.active && workspace.dirty.includes(workspace.active) ? <span className="cf-caption text-cf-ink-muted">{t('assistant_manual_edits', 'Manual edits')}</span> : null}
          {picker}
          {artifact ? <ButtonLink href={artifactHref(artifact)} variant="quiet" density="dense">{t('assistant_open_in_section', 'Open in section')}</ButtonLink> : null}
        </>} material={<AgentArtifactHost artifact={artifact} selectionVersion={selectionVersion} available={workspace.artifacts} words={words} onSelectArtifact={selectArtifact} onDirty={(key) => dispatch({ type: 'dirty', key })} {...(aiUnavailable ? {} : { onWriteFromLead: writeFromLead })} />}>
          <section aria-label={t('agent', 'AI assistant')} className="flex min-h-0 min-w-0 flex-1 flex-col">
            <ThreadSwitcher threadId={session.threadId} title={shownTitle} language={language} onOpen={openThread} onNew={startNew} onRemoved={startNew} words={words} actions={<>
              {picker}
              <AgentWorkspaceBrowser onSelect={selectArtifact} words={words} />
              {workspace.hidden && artifact ? <Button data-assistant-restore="" type="button" density="dense" variant="quiet" onClick={() => selectArtifact(artifact)}>{t('assistant_restore', 'Restore')}</Button> : null}
            </>} />
            {saveFailed === session.key ? <div role="status" className="flex flex-wrap items-center gap-[8px] border-b border-cf-border px-[16px] py-[8px] cf-body-sm text-cf-ink-muted">
              {words.threads.actionFailed}
              <Button type="button" density="dense" variant="quiet" onClick={() => setSaveAttempt((attempt) => attempt + 1)}>{t('assistant_reconcile', 'Check result')}</Button>
            </div> : null}
            <AgentAvailabilityGate onUnavailable={setAiUnavailable}>
              <SessionView key={session.key} visible={isAgentsRoute || contextual} session={session} onHistory={onHistory} workContext={workContext} onWorkContext={onWorkContext} onNewConversation={startNew} contextControls={<AgentContextChip context={workContext} artifact={assistant?.contextArtifact} onRemove={() => assistantRef.current?.setWorkContext(null)} />} onArtifacts={onArtifacts} onThreadId={onThreadId} onTitle={onTitle} onArtifact={onArtifact} openArtifact={contextual ? assistant?.contextArtifact ?? null : workspace.hidden ? null : artifact} onArtifactRemoved={onRemoved} starter={starter} onStarterUsed={() => setStarter(null)} draft={draft} onDraftUsed={onDraftUsed} words={words} />
            </AgentAvailabilityGate>
          </section>
        </AgentWorkspaceShell>
      </div>
    </div>
  );
}

const EMPTY_HISTORY: AgentThreadHistory = {
  thread: null,
  messages: [],
  pending: [],
};

function SessionView({
  visible,
  session,
  onHistory,
  workContext,
  onArtifacts,
  contextControls,
  onNewConversation,
  onWorkContext,
  onThreadId,
  onTitle,
  onArtifact,
  openArtifact,
  onArtifactRemoved,
  starter,
  onStarterUsed,
  draft,
  onDraftUsed,
  words,
}: {
  visible: boolean;
  session: Session;
  onHistory: (history: AgentThreadHistory) => void;
  workContext: AgentWorkContextV1 | null;
  onArtifacts: (artifacts: AgentArtifact[]) => void;
  contextControls: ReactNode;
  onNewConversation: () => void;
  onWorkContext: (context: AgentWorkContextV1 | null) => void;
  onThreadId: (id: string) => void;
  onTitle: (title: string | null) => void;
  onArtifact: (artifact: AgentArtifact, how: 'produced' | 'asked') => void;
  openArtifact: AgentArtifact | null;
  onArtifactRemoved: () => void;
  starter: string | null;
  onStarterUsed: () => void;
  draft: string | null;
  onDraftUsed: () => void;
  words: AgentWords;
}) {
  const request = useFetch();
  const load = !session.fresh && session.threadId;
  const history = useSWR<AgentThreadHistory>(
    load ? [AGENT_DOORS.thread(session.threadId as string), session.key] : null,
    async ([url]: [string, string]) => {
      // The zone the chat door gets too, so a reloaded card tells local time.
      const zone = screenTimeZone();
      const response = await request(url, zone ? { headers: { [AGENT_TIMEZONE_HEADER]: zone } } : {});
      if (!response.ok) throw new Error(String(response.status));
      return readThreadHistory(await response.json());
    },
    // Read once per session: the conversation owns its messages from then on,
    // and a revalidation that failed must not swap a live conversation for
    // the error screen (kcxz.29, D2).
    {
      revalidateOnFocus: false,
      revalidateIfStale: false,
      revalidateOnReconnect: false,
    }
  );
  const reportHistory = useRef(onHistory);
  reportHistory.current = onHistory;
  useEffect(() => {
    if (history.data) reportHistory.current(history.data);
  }, [history.data]);

  if (load && !history.data && history.isLoading) {
    return (
      <div className="flex-1 px-[16px] py-[24px] md:px-[20px]">
        <SkeletonRows rows={4} label={words.history.loading} />
      </div>
    );
  }

  if (load && !history.data && history.error) {
    return (
      <div className="flex-1 px-[16px] py-[24px] md:px-[20px]">
        <ErrorState
          title={words.history.failedTitle}
          description={words.history.failedBody}
          action={
            <Button
              type="button"
              density="dense"
              variant="secondary"
              onClick={() => void history.mutate()}
            >
              {words.history.retry}
            </Button>
          }
        />
      </div>
    );
  }

  const loaded = history.data ?? EMPTY_HISTORY;
  return (
    <AgentConversation
      visible={visible}
      threadId={session.threadId}
      initialMessages={loaded.messages}
      pending={loaded.pending}
      workContext={workContext}
      onArtifacts={onArtifacts}
      contextControls={contextControls}
      onNewConversation={onNewConversation}
      onWorkContext={onWorkContext}
      onThreadId={onThreadId}
      onTitle={onTitle}
      onArtifact={onArtifact}
      openArtifact={openArtifact}
      onArtifactRemoved={onArtifactRemoved}
      starter={starter}
      onStarterUsed={onStarterUsed}
      draft={draft}
      onDraftUsed={onDraftUsed}
      words={words}
    />
  );
}
