'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { usePathname, useSearchParams } from 'next/navigation';
import { Button } from '@contentfactory/react/form/button';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { useUser } from '@contentfactory/frontend/components/layout/user.context';
import { WorkingLine } from '@contentfactory/frontend/components/ui/working-line';
import type { AgentArtifact, AgentWorkContextV1 } from './agent.contract';
import { assistantContextKey, assistantRouteContext, linkedAssistantThread } from './assistant.route-context';

const AssistantScreen = dynamic(() => import('./agent.screen').then((module) => module.AgentScreen), { ssr: false });

type AssistantWorkspace = {
  workContext: AgentWorkContextV1 | null;
  contextArtifact: AgentArtifact | null;
  contextVersion: number;
  contextual: boolean;
  requestedThreadId: string | null;
  requestVersion: number;
  closeContextual: () => void;
  setWorkContext: (context: AgentWorkContextV1 | null, artifact?: AgentArtifact | null) => void;
  openContextual: (context: AgentWorkContextV1, artifact?: AgentArtifact | null) => void;
  rememberThread: (threadId: string) => void;
};
const Workspace = createContext<AssistantWorkspace | null>(null);
const EmbeddedArtifact = createContext(false);

export const useAssistantWorkspace = () => useContext(Workspace);
export function AssistantArtifactBoundary({ children }: { children: ReactNode }) {
  return <EmbeddedArtifact.Provider value>{children}</EmbeddedArtifact.Provider>;
}

/** The same action in every manual section; it prepares context without sending. */
export function AssistantContextAction({ context, artifact, disabled = false }: {
  context: AgentWorkContextV1;
  artifact?: AgentArtifact | null;
  disabled?: boolean;
}) {
  const workspace = useAssistantWorkspace();
  const embedded = useContext(EmbeddedArtifact);
  const t = useT();
  if (!workspace || embedded) return null;
  return <Button type="button" variant="secondary" density="dense" disabled={disabled} onClick={() => workspace.openContextual(context, artifact)}>
    {t('assistant_discuss', 'Discuss with assistant')}
  </Button>;
}

/** Actor changes unmount the entire private session, including an in-flight SDK stream. */
export function AssistantWorkspaceHost({ children }: { children: ReactNode }) {
  const user = useUser();
  return <AssistantWorkspaceSession key={`${user?.orgId ?? ''}:${user?.id ?? ''}`} actor={`${user?.orgId ?? ''}:${user?.id ?? ''}`}>{children}</AssistantWorkspaceSession>;
}

function AssistantWorkspaceSession({ children, actor }: { children: ReactNode; actor: string }) {
  const pathname = usePathname() ?? '';
  const params = useSearchParams();
  const t = useT();
  const assistantRoute = /^\/agents(?:\/|$)/.test(pathname);
  const routeContext = useMemo(() => assistantRouteContext(pathname, params.toString()), [pathname, params]);
  const [contextual, setContextual] = useState(false);
  const [opened, setOpened] = useState(false);
  const [workContext, updateContext] = useState<AgentWorkContextV1 | null>(null);
  const [contextArtifact, updateArtifact] = useState<AgentArtifact | null>(null);
  const [contextVersion, setContextVersion] = useState(0);
  const contextKey = useRef(assistantContextKey(null));
  const [requestVersion, setRequestVersion] = useState(0);
  const [requestedThreadId, setRequestedThreadId] = useState<string | null>(null);
  const invoker = useRef<HTMLElement | null>(null);
  const storageKey = `cf-assistant-links/v1:${actor}`;
  const readLinks = useCallback((): Record<string, string[]> => {
    try {
      const value = JSON.parse(localStorage.getItem(storageKey) ?? '{}');
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch { return {}; }
  }, [storageKey]);
  const setWorkContext = useCallback((context: AgentWorkContextV1 | null, artifact: AgentArtifact | null = null) => {
    const next = assistantContextKey(context);
    updateContext(context);
    updateArtifact(artifact);
    if (next !== contextKey.current) {
      contextKey.current = next;
      setContextVersion((value) => value + 1);
    }
  }, []);
  const rememberThread = useCallback((threadId: string) => {
    if (contextKey.current === 'null') return;
    const links = readLinks();
    const previous = Array.isArray(links[contextKey.current]) ? links[contextKey.current] : [];
    links[contextKey.current] = [...new Set([...previous, threadId])].slice(-5);
    try { localStorage.setItem(storageKey, JSON.stringify(Object.fromEntries(Object.entries(links).slice(-50)))); } catch { /* Storage is optional; server ownership remains authoritative. */ }
  }, [readLinks, storageKey]);
  const openContextual = useCallback((context: AgentWorkContextV1, artifact: AgentArtifact | null = null) => {
    invoker.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!opened || contextKey.current !== assistantContextKey(context)) {
      setRequestedThreadId(linkedAssistantThread(readLinks(), assistantContextKey(context)));
      setRequestVersion((value) => value + 1);
    }
    setWorkContext(context, artifact);
    setContextual(true);
    setOpened(true);
  }, [readLinks, setWorkContext, opened]);
  const closeContextual = useCallback(() => {
    setContextual(false);
    requestAnimationFrame(() => { if (invoker.current?.isConnected) invoker.current.focus(); });
  }, []);
  const value = useMemo(() => ({ workContext, contextArtifact, contextVersion, contextual: contextual && !assistantRoute, requestedThreadId, requestVersion, closeContextual, setWorkContext, openContextual, rememberThread }), [workContext, contextArtifact, contextVersion, contextual, assistantRoute, requestedThreadId, requestVersion, closeContextual, setWorkContext, openContextual, rememberThread]);
  const visible = assistantRoute || contextual;
  // Keep the same mounted conversation when switching routes or hiding the pane.
  // Navigation away before the first assistant opening does not load its bundle.
  const everMounted = useRef(false);
  if (assistantRoute || opened) everMounted.current = true;
  return <Workspace.Provider value={value}>
    <div className="flex min-h-0 min-w-0 flex-1 overflow-x-hidden" data-assistant-workspace="true">
      <div className={`${assistantRoute ? 'hidden' : contextual ? 'hidden lg:flex' : 'flex'} min-h-0 min-w-0 flex-1 flex-col`}>
        {routeContext && routeContext.kind !== 'piece' ? <div className="flex shrink-0 justify-end border-b border-cf-border px-[16px] py-[8px]">
          <AssistantContextAction context={routeContext} />
        </div> : null}
        {children}
      </div>
      {everMounted.current ? <section aria-label={t('agent', 'AI assistant')} className={`${visible ? 'flex' : 'hidden'} min-h-0 min-w-0 flex-1 flex-col ${contextual && !assistantRoute ? 'lg:max-w-[640px] lg:border-s lg:border-cf-border' : ''}`}>
        {contextual && !assistantRoute ? <div className="flex shrink-0 items-center justify-between gap-[12px] border-b border-cf-border px-[16px] py-[8px]">
          <span className="cf-label-md">{t('agent', 'AI assistant')}</span>
          <Button variant="quiet" density="dense" type="button" onClick={closeContextual}>{t('assistant_hide', 'Hide')}</Button>
        </div> : null}
        <AssistantScreen contextual={contextual && !assistantRoute} />
      </section> : visible ? <WorkingLine label={t('assistant_working', 'Working')} /> : null}
    </div>
  </Workspace.Provider>;
}
