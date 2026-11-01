/** One unacknowledged text draft in the existing actor/thread browser-session scope. */
export type SubmissionFailure = { status: number; code?: string; notStarted: boolean };
export type SubmissionDraft = {
  id: string;
  text: string;
  attachments?: boolean;
  diagnostic?: SubmissionFailure;
};
const keyOf = (key: string) => `${key}:submission`;
export const readSubmissionDraft = (key?: string): SubmissionDraft | null => {
  try {
    if (!key || typeof window === 'undefined') return null;
    const value = JSON.parse(window.sessionStorage.getItem(keyOf(key)) ?? 'null');
    if (!value || typeof value.id !== 'string' || !value.id || typeof value.text !== 'string' || !value.text) return null;
    const diagnostic = value.diagnostic;
    return {
      id: value.id,
      text: value.text,
      ...(value.attachments === true ? { attachments: true } : {}),
      ...(diagnostic && Number.isInteger(diagnostic.status) && diagnostic.status >= 100 && diagnostic.status <= 599 ? {
        diagnostic: {
          status: diagnostic.status,
          notStarted: diagnostic.notStarted === true,
          ...(typeof diagnostic.code === 'string' && /^[A-Z][A-Z0-9_]+$/.test(diagnostic.code) ? { code: diagnostic.code } : {}),
        },
      } : {}),
    };
  } catch { return null; }
};
export const writeSubmissionDraft = (key: string | undefined, draft: SubmissionDraft): boolean => {
  try {
    if (!key || typeof window === 'undefined') return false;
    if (draft.text) window.sessionStorage.setItem(keyOf(key), JSON.stringify(draft));
    else window.sessionStorage.removeItem(keyOf(key));
    return true;
  } catch { return false; }
};
export const clearSubmissionDraft = (key: string | undefined, id: string) => {
  try { if (key && readSubmissionDraft(key)?.id === id) window.sessionStorage.removeItem(keyOf(key)); } catch { /* Optional browser storage. */ }
};
/** Never replace a newer unsent draft; the original bubble/cache stays available. */
export const restoreSubmissionDraft = (key: string | undefined, draft: SubmissionDraft): boolean => {
  try {
    if (key && typeof window !== 'undefined') {
      const current = window.sessionStorage.getItem(key);
      if (current && current !== draft.text) return false;
      window.sessionStorage.setItem(key, draft.text);
    }
    return true;
  } catch { return false; }
};
