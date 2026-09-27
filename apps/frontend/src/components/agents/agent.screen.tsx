'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { useParams, useRouter } from 'next/navigation';
import { useInterfaceLanguage } from '@contentfactory/react/translation/use-interface-language';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { Button } from '@contentfactory/react/form/button';
import { ErrorState, SkeletonRows } from '@contentfactory/frontend/components/ui/surface';
import { AgentAvailabilityGate } from './agent.availability';
import {
  AGENT_DOORS,
  AGENT_TIMEZONE_HEADER,
  readThreadHistory,
  type AgentArtifact,
  type AgentThreadHistory,
} from './agent.contract';
import { agentWordsFor, type AgentWords } from './agent.copy';
import { AgentConversation } from './agent.conversation';
import { ArtifactColumn, ArtifactSheet, WorkspaceSteps } from './agent.panel';
import { THREADS_KEY, ThreadSwitcher, useAgentThreads } from './agent.threads';
import { screenTimeZone } from './agent.transport';

/**
 * The «Агент» screen, `/agents` (`content-factory-next-kcxz.10`; spec §6;
 * owner 27.09.2026 — «чат плюс артефакт», canvas variant C).
 *
 * The conversation on the left, 520 px from 1280 up; beside it the work
 * panel with what the turn produced, opened as the product's own screen. On
 * narrower screens the chat takes the width and the panel is a sheet opened
 * from the line in the chat.
 *
 * The screen owns which conversation is open. A new one has no id until the
 * server names it in the first answer; the address then becomes
 * `/agents/<id>` without reloading anything, and the stream in flight keeps
 * going in the same session.
 */

const WIDE = '(min-width: 1280px)';

const useWide = () => {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(WIDE);
    const update = () => setWide(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return wide;
};

type Session = {
  /** `useChat` identity: stays while a new thread gets its id. */
  key: string;
  threadId: string | null;
  /** Opened in this visit: nothing to load. */
  fresh: boolean;
};

let sessionCounter = 0;
const newSession = (): Session => ({
  key: `new-${Date.now()}-${(sessionCounter += 1)}`,
  threadId: null,
  fresh: true,
});
const threadSession = (id: string): Session => ({
  key: id,
  threadId: id,
  fresh: false,
});

const routeThread = (id: string | string[] | undefined) => {
  const value = Array.isArray(id) ? id[0] : id;
  return value && value !== 'new' ? decodeURIComponent(value) : null;
};

export function AgentScreen() {
  // The same language source as every `t()` on the screen, the allowance line
  // included; the request-time variable misses a language switch and differs
  // from i18next on mixed cookies (kcxz.29, D8).
  const language = useInterfaceLanguage();
  const words = agentWordsFor(language);
  const router = useRouter();
  const params = useParams<{ id?: string }>();
  const routeId = routeThread(params?.id);
  const { mutate } = useSWRConfig();

  const [session, setSession] = useState<Session>(() =>
    routeId ? threadSession(routeId) : newSession()
  );
  const current = useRef(session);
  current.current = session;

  // Back and forward, and links from elsewhere; the screen's own moves set the
  // session first, so these find nothing to do.
  useEffect(() => {
    const open = current.current;
    if (routeId === open.threadId) return;
    if (!routeId) {
      if (!open.fresh) setSession(newSession());
      return;
    }
    setSession(threadSession(routeId));
  }, [routeId]);

  const [artifact, setArtifact] = useState<AgentArtifact | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [starter, setStarter] = useState<string | null>(null);
  const wide = useWide();

  useEffect(() => {
    setArtifact(null);
    setTitle(null);
  }, [session.key]);

  const closeArtifact = useCallback(() => setArtifact(null), []);

  const openThread = useCallback((id: string) => {
    setSession(threadSession(id));
  }, []);

  const startNew = useCallback(() => {
    setSession(newSession());
    router.push('/agents/new');
  }, [router]);

  const onThreadId = useCallback(
    (id: string) => {
      setSession((open) => ({ ...open, threadId: id }));
      window.history.replaceState(null, '', `/agents/${encodeURIComponent(id)}`);
      void mutate(THREADS_KEY);
    },
    [mutate]
  );

  const onArtifact = useCallback(
    (next: AgentArtifact, how: 'produced' | 'asked') => {
      // A produced thing opens beside the chat on its own; below 1280 px the
      // sheet would cover the conversation, so there it waits to be asked.
      if (how === 'asked' || wide) setArtifact(next);
    },
    [wide]
  );

  const threads = useAgentThreads();
  const listed = session.threadId
    ? threads.data?.find((thread) => thread.id === session.threadId)?.title
    : null;
  const shownTitle = listed ?? title ?? words.threads.newThread;

  return (
    <div
      data-agent-screen=""
      // Below `md` the page scrolls, so the screen takes exactly the viewport
      // under the header and does not grow: the conversation scrolls inside
      // it and the composer stays on screen. As a flex item of `<main>` it
      // must not grow, or its content height wins over this one and the
      // document scrolls instead (kcxz.29, D11).
      className="relative flex h-[calc(100dvh-56px)] min-h-0 min-w-0 flex-none md:h-auto md:flex-1"
    >
      <div className="flex min-h-0 min-w-0 flex-1 md:absolute md:inset-0">
        <section
          aria-label={words.screenLabel}
          className="flex min-h-0 min-w-0 flex-1 flex-col bg-cf-canvas xl:w-[520px] xl:flex-none"
        >
          <ThreadSwitcher
            threadId={session.threadId}
            title={shownTitle}
            language={language}
            onOpen={openThread}
            onNew={startNew}
            onRemoved={startNew}
            words={words}
          />
          <AgentAvailabilityGate>
            <SessionView
              key={session.key}
              session={session}
              onThreadId={onThreadId}
              onTitle={setTitle}
              onArtifact={onArtifact}
              openArtifact={artifact}
              onArtifactRemoved={closeArtifact}
              starter={starter}
              onStarterUsed={() => setStarter(null)}
              words={words}
            />
          </AgentAvailabilityGate>
        </section>
        {wide ? (
          <ArtifactColumn
            artifact={artifact}
            onClose={() => setArtifact(null)}
            words={words}
            empty={
              <WorkspaceSteps
                busy={starter !== null}
                onStarter={(step) => setStarter(words.start.starters[step])}
                words={words}
              />
            }
          />
        ) : artifact ? (
          <ArtifactSheet
            artifact={artifact}
            onClose={() => setArtifact(null)}
            words={words}
          />
        ) : null}
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
  session,
  onThreadId,
  onTitle,
  onArtifact,
  openArtifact,
  onArtifactRemoved,
  starter,
  onStarterUsed,
  words,
}: {
  session: Session;
  onThreadId: (id: string) => void;
  onTitle: (title: string | null) => void;
  onArtifact: (artifact: AgentArtifact, how: 'produced' | 'asked') => void;
  openArtifact: AgentArtifact | null;
  onArtifactRemoved: () => void;
  starter: string | null;
  onStarterUsed: () => void;
  words: AgentWords;
}) {
  const request = useFetch();
  const load = !session.fresh && session.threadId;
  const history = useSWR<AgentThreadHistory>(
    load ? AGENT_DOORS.thread(session.threadId as string) : null,
    async (url: string) => {
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
      threadId={session.threadId}
      initialMessages={loaded.messages}
      pending={loaded.pending}
      onThreadId={onThreadId}
      onTitle={onTitle}
      onArtifact={onArtifact}
      openArtifact={openArtifact}
      onArtifactRemoved={onArtifactRemoved}
      starter={starter}
      onStarterUsed={onStarterUsed}
      words={words}
    />
  );
}
