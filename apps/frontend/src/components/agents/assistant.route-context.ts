import type { AgentWorkContextV1 } from './agent.contract';

/** Route hints carry identity, never unsaved editor contents or access authority. */
export function assistantRouteContext(pathname: string, search: string): AgentWorkContextV1 | null {
  const version = 'assistant-work-context/v1' as const;
  const object = pathname.match(/^\/(content\/pieces|content\/avatars|channels)\/([^/]+)\/?$/);
  if (object) {
    const kind = object[1] === 'content/pieces' ? 'piece' : object[1] === 'content/avatars' ? 'avatar' : 'channel';
    try { return { version, kind, id: decodeURIComponent(object[2]) }; } catch { return null; }
  }
  if (pathname === '/media') return { version, kind: 'media' };
  if (pathname === '/content') {
    const tab = new URLSearchParams(search).get('tab');
    return { version, kind: tab === 'leads' ? 'ideas' : tab === 'provenance' ? 'facts' : 'workspace' };
  }
  if (pathname === '/channels') return { version, kind: 'workspace' };
  return null;
}

export const assistantContextKey = (context: AgentWorkContextV1 | null) =>
  JSON.stringify(context ? {
    version: context.version, kind: context.kind, id: context.id,
    pieceId: context.pieceId, channelId: context.channelId,
    adaptationId: context.adaptationId, from: context.from, to: context.to,
  } : null);

export const linkedAssistantThread = (value: unknown, key: string): string | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const ids = (value as Record<string, unknown>)[key];
  return Array.isArray(ids) && ids.length === 1 && typeof ids[0] === 'string' && ids[0].length <= 128
    ? ids[0] : null;
};
