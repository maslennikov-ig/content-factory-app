'use client';
import { Textarea } from '@contentfactory/react/form/textarea';
import { useState } from 'react';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { Button } from '@contentfactory/react/form/button';
import type { ReviewChange } from '@contentfactory/nestjs-libraries/content-intelligence/pieces/review.v2.contract';
export type PendingReviewQuestions = {
  token: string;
  adaptationId?: string;
  questions: ReviewChange[];
};
/** Author evidence is persisted through /answer; it never exists only in a rewrite prompt. */
export function ReviewQuestions({
  pieceId,
  pending,
  locale,
  disabled,
  onSaved,
}: {
  pieceId: string;
  pending: PendingReviewQuestions;
  locale: 'ru' | 'en';
  disabled?: boolean;
  onSaved: (remaining?: PendingReviewQuestions | null) => void;
}) {
  const request = useFetch(),
    ru = locale === 'ru';
  const [answers, setAnswers] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  async function save() {
    if (busy || disabled) return;
    const given = pending.questions
      .filter((q) => answers[q.id]?.trim())
      .map((q) => ({ questionId: q.id, text: answers[q.id] }));
    if (!given.length) return;
    setBusy(true);
    setError(null);
    try {
      const response = await request(
        `/content-intelligence/pieces/${encodeURIComponent(pieceId)}/answer`,
        {
          method: 'POST',
          body: JSON.stringify({
            reviewAnswer: {
              token: pending.token,
              adaptationId: pending.adaptationId,
              answers: given,
            },
          }),
        }
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.message);
      if (body.version !== 'review-answer/v2')
        throw new Error(
          ru ? 'Ответ не сохранён.' : 'The answer was not saved.'
        );
      onSaved(body.remaining ?? null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="flex flex-col gap-[8px]"
      aria-label={ru ? 'Вопросы проверки' : 'Review questions'}
    >
      <h3 className="cf-label-md text-cf-ink">
        {ru ? 'Вопросы автору' : 'Questions for the author'}
      </h3>
      {pending.questions.map((q) => (
        <label
          key={q.id}
          className="flex flex-col gap-[4px] cf-body-sm text-cf-ink"
        >
          {q.why}
          <Textarea
            standalone
            layout="content"
            value={answers[q.id] ?? ''}
            maxLength={2000}
            disabled={disabled || busy}
            onChange={(e) =>
              setAnswers((a) => ({ ...a, [q.id]: e.target.value }))
            }
          />
        </label>
      ))}
      <p className="cf-body-sm text-cf-ink-muted">
        {ru
          ? 'Ответы сохранятся в опорах как ваши слова. Текст пока не изменится.'
          : 'Answers are saved as your evidence. The draft stays unchanged.'}
      </p>
      {error ? (
        <p role="alert" className="cf-body-sm text-cf-danger">
          {error}
        </p>
      ) : null}
      <Button
        variant="secondary"
        loading={busy}
        disabled={
          disabled || !pending.questions.some((q) => answers[q.id]?.trim())
        }
        onClick={() => void save()}
      >
        {ru ? 'Сохранить ответы' : 'Save answers'}
      </Button>
    </section>
  );
}
