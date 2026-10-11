/** Dirty text stays in this tab, scoped by account and workspace by its caller. */
// A null entry suppresses an acknowledged draft the browser refused to remove.
const memory = new Map<string, string | null>();
const prefix = 'cf:dirty-text:v1:';

export function readRecoverableDraft(key?: string): string | null {
  if (!key) return null;
  if (memory.has(key)) return memory.get(key) ?? null;
  try {
    const stored = window.sessionStorage.getItem(prefix + key);
    if (stored !== null) return stored;
  } catch {
    // Restricted browser storage still permits recovery after app navigation.
  }
  return memory.get(key) ?? null;
}

export function retainRecoverableDraft(key: string | undefined, text: string) {
  if (!key) return;
  try {
    window.sessionStorage.setItem(prefix + key, text);
    memory.delete(key);
  } catch {
    // Keep the in-memory copy when the browser refuses session storage.
    memory.set(key, text);
  }
}

/** A late save must never remove the newer words typed while it was running. */
export function clearRecoverableDraft(key: string | undefined, saved: string) {
  if (!key || readRecoverableDraft(key) !== saved) return;
  memory.set(key, null);
  try {
    window.sessionStorage.removeItem(prefix + key);
    memory.delete(key);
  } catch {
    // Keep the acknowledgement in memory, hiding stale browser storage.
  }
}

export function textDraftScope(
  userId?: string,
  orgId?: string
): string | undefined {
  return userId && orgId ? `${userId}:${orgId}` : undefined;
}
