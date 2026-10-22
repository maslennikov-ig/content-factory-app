import { createHash } from 'node:crypto';

/** Provider material and prompt previews are separate views of one source. */
export type RetainedResearchSource = {
  fullText?: unknown;
  text?: unknown;
  content?: unknown;
  excerpt?: unknown;
};

/** No model-context cap belongs on the material saved for an authorized read. */
export const retainedSourceText = (source: RetainedResearchSource | null | undefined): string => {
  for (const value of [source?.fullText, source?.text, source?.content, source?.excerpt]) {
    if (typeof value === 'string' && value.trim()) return value;
  }
  return '';
};

/** Bind reads/selections to the provider material, independently of UI redaction. */
export const retainedSourceRevision = (source: RetainedResearchSource): string =>
  createHash('sha256').update(retainedSourceText(source)).digest('hex');
