'use client';

import { useEffect, useId, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@contentfactory/react/form/button';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import { AgentThreadList } from '../agents/agent.threads';
import { chatWordsFor } from '../agents/agent.chats.copy';
import { AgentGlyph } from '../agents/agent.icons';
import { MenuItem } from './menu-item';

/** Familiar disclosure and new-chat action; Mastra remains the history store. */
export function AssistantMenuItem({ label, icon, collapsed = false, onNavigate }: {
  label: string;
  icon: ReactNode;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname() ?? '';
  const router = useRouter();
  const { language } = useVariables();
  const words = chatWordsFor(language);
  const active = /^\/agents(?:\/|$)/.test(pathname);
  const [expanded, setExpanded] = useState(active);
  const listId = useId();
  const id = /^\/agents\/([^/]+)$/.exec(pathname)?.[1];
  let threadId: string | null = null;
  try { threadId = id && id !== 'new' ? decodeURIComponent(id) : null; } catch { /* A malformed route cannot select a saved chat. */ }

  useEffect(() => { if (active) setExpanded(true); }, [active, pathname]);

  if (collapsed) return <MenuItem label={label} icon={icon} path="/agents" collapsed onNavigate={onNavigate} />;

  return <div data-assistant-navigation="true" className="min-w-0">
    <div className="hidden md:block lg:hidden"><MenuItem label={label} icon={icon} path="/agents" collapsed onNavigate={onNavigate} /></div>
    <div className="flex min-w-0 items-center gap-[4px] md:hidden lg:flex">
      <Button type="button" variant={active ? 'navigation-current' : 'navigation'} density="dense"
        aria-expanded={expanded} aria-controls={listId} title={label}
        onClick={() => setExpanded((value) => !value)}
        className="cf-nav-row min-w-0 flex-1 px-[8px]" innerClassName="cf-nav-row-content justify-start gap-[8px]">
        <span aria-hidden className="flex w-[20px] shrink-0 items-center justify-center">{icon}</span>
        <span className="cf-nav-label min-w-0 flex-1 truncate text-start">{label}</span>
        <span className="cf-nav-label shrink-0"><span className={`block transition-transform duration-state ${expanded ? '' : '-rotate-90 rtl:rotate-90'}`}><AgentGlyph name="chevron" size={14} /></span></span>
      </Button>
      <div className="shrink-0 md:hidden lg:block">
        <Button type="button" variant="navigation" density="dense" iconOnly aria-label={words.newThread} title={words.newThread}
          onClick={() => { setExpanded(true); router.push('/agents/new'); onNavigate?.(); }}>
          <AgentGlyph name="plus" />
        </Button>
      </div>
    </div>
    <div id={listId} hidden={!expanded}>
      {expanded ? <div className="ms-[20px] mt-[4px] min-w-0 border-s border-cf-border-strong ps-[8px] text-cf-navigation-muted md:hidden lg:block"><AgentThreadList sidebar threadId={threadId} language={language} words={words}
        onOpen={(next) => { router.push(`/agents/${encodeURIComponent(next)}`); onNavigate?.(); }} /></div> : null}
    </div>
  </div>;
}
