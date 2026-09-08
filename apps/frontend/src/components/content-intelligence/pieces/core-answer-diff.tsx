import type { PiecesLocale } from './pieces.copy';

/** Keep whitespace verbatim; only new/changed sentences receive emphasis. */
export function sentenceChanges(previousBody: string, body: string) {
  const split = (text: string) =>
    text.match(/[^.!?…\n]+(?:[.!?…]+|(?=\n|$))|[.!?…]+|\n/gu) ?? [];
  const previous = new Map<string, number>();
  for (const sentence of split(previousBody)) {
    const key = sentence.trim();
    if (key) previous.set(key, (previous.get(key) ?? 0) + 1);
  }
  return split(body).map((text) => {
    const key = text.trim();
    const remaining = previous.get(key) ?? 0;
    if (remaining) previous.set(key, remaining - 1);
    return { text, changed: Boolean(key) && remaining === 0 };
  });
}

export type CoreAnswerFeedback = { previousBody: string; body: string };
export function CoreAnswerDiff({
  previousBody,
  body,
  locale,
}: CoreAnswerFeedback & { locale: PiecesLocale }) {
  const unchanged = previousBody === body;
  return (
    <>
      <span
        role="status"
        data-core-answer={unchanged ? 'unchanged' : 'changed'}
        className="mb-[8px] block cf-caption text-cf-ink-muted"
      >
        {locale === 'ru'
          ? unchanged
            ? 'Суть не менялась, ответ сохранён'
            : 'Изменилось после вашего ответа'
          : unchanged
          ? 'The core stayed the same; your answer was saved'
          : 'Changed after your answer'}
      </span>
      {sentenceChanges(previousBody, body).map((sentence, index) =>
        sentence.changed ? (
          <mark key={index} className="bg-cf-accent-soft text-cf-ink">
            {sentence.text}
          </mark>
        ) : (
          <span key={index}>{sentence.text}</span>
        )
      )}
    </>
  );
}
