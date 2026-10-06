/** Literal query references; the caller must bind this view in its request catalogue. */
export interface ReaderSubjectAnchors {
  readonly version: 'reader-subject-anchors/v1';
  readonly parts: ReadonlyArray<readonly [string, string]>;
}

interface SubjectPosition {
  start: number;
  end: number;
}
interface TrustedSubject {
  subject: string;
  positions: ReadonlyMap<string, SubjectPosition>;
}
const trustedSubjects = new WeakMap<ReaderSubjectAnchors, TrustedSubject>();

// Node 22 supplies Segmenter; the repository's shared TS lib is es2020.
interface WordSegmenter {
  segment(text: string): Iterable<{ segment: string; index: number }>;
}
const NodeIntl = Intl as typeof Intl & {
  Segmenter: new (
    locales: string | undefined,
    options: { granularity: 'word' }
  ) => WordSegmenter;
};

export function prepareReaderSubjectAnchors(
  subject: string
): ReaderSubjectAnchors | null {
  if (
    typeof subject !== 'string' ||
    !subject.length ||
    subject.length > 5000 ||
    /[\uD800-\uDFFF]/u.test(subject)
  )
    return null;
  const segmenter = new NodeIntl.Segmenter(undefined, { granularity: 'word' });
  const positions = new Map<string, SubjectPosition>();
  const parts: Array<readonly [string, string]> = [];
  for (const row of segmenter.segment(subject)) {
    const id = `Q${parts.length.toString(36)}`;
    const end = row.index + row.segment.length;
    if (subject.slice(row.index, end) !== row.segment) return null;
    positions.set(id, { start: row.index, end });
    parts.push(Object.freeze([id, row.segment] as const));
  }
  if (!parts.length || parts.map((row) => row[1]).join('') !== subject)
    return null;
  const view: ReaderSubjectAnchors = Object.freeze({
    version: 'reader-subject-anchors/v1',
    parts: Object.freeze(parts),
  });
  trustedSubjects.set(view, { subject, positions });
  return view;
}

export function resolveReaderSubjectAnchor(
  table: ReaderSubjectAnchors,
  reference: unknown
): { quote: string; start: number; end: number } | null {
  const trusted = trustedSubjects.get(table);
  if (
    !trusted ||
    !reference ||
    typeof reference !== 'object' ||
    Array.isArray(reference)
  )
    return null;
  const fields = Object.getOwnPropertyDescriptors(reference);
  if (
    Reflect.ownKeys(fields).length !== 2 ||
    !fields.first ||
    !fields.last ||
    !('value' in fields.first) ||
    !('value' in fields.last) ||
    typeof fields.first.value !== 'string' ||
    typeof fields.last.value !== 'string'
  )
    return null;
  const first = trusted.positions.get(fields.first.value);
  const last = trusted.positions.get(fields.last.value);
  if (!first || !last || first.start > last.start) return null;
  const { start } = first;
  const { end } = last;
  if (end <= start || end - start > 80) return null;
  const quote = trusted.subject.slice(start, end);
  if (
    trusted.subject.indexOf(quote) !== start ||
    trusted.subject.indexOf(quote, start + 1) !== -1 ||
    /[\uDC00-\uDFFF]/.test(trusted.subject[start]) ||
    /[\uD800-\uDBFF]/.test(trusted.subject[end - 1])
  )
    return null;
  return { quote, start, end };
}
