'use client';

import { useId, useState } from 'react';
import { Button } from '@contentfactory/react/form/button';
import { Textarea } from '@contentfactory/react/form/textarea';
import { Hint } from '@contentfactory/react/layout/hint';
import type { PieceMaterialAskV1 } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';
import { FieldLabel } from '../../ui/field-label';
import { piecesCopy, type PiecesLocale } from './pieces.copy';

/**
 * «Материала мало» (`content-factory-next-97dq.98`): optional questions under
 * a post that came out clearly shorter than its channel expects.
 *
 * The owner, 25.09.2026: «Мы разрешим ИИ задавать просто дополнительные
 * вопросы и объяснять, почему он их задает. Но они являются необязательными.
 * Ну, захочет человек отвечать и ладно. Может, его и так устраивает.» So the
 * block is quiet: one line of notice, no badge, no panel, nothing blocked.
 * Each question carries its reason; a field left empty changes nothing.
 * «Дополнить пост» is the one action — the answers join the piece's
 * material, the core is rebuilt and this channel's post rewritten (the
 * container chains the existing doors). «Не нужно» closes it for good.
 *
 * Not `SuggestedQuestionsCard`: that card is the interview before a text —
 * options, «Реши сама», a badge — and every one of those is wrong here: only
 * the person knows the answer, and the post already exists.
 */

/** «~370»: the length is an estimate of the material, not a count to argue with. */
export const approximateLength = (length: number): number =>
  length >= 100 ? Math.round(length / 10) * 10 : Math.max(0, Math.round(length));

export function MaterialAsk({
  locale,
  ask,
  disabled = false,
  onUse,
  onDismiss,
}: {
  locale: PiecesLocale;
  ask: PieceMaterialAskV1;
  /** A rewrite is running, or the person cannot write here. */
  disabled?: boolean;
  /** Answers by key (`ask-N`); `false` — they were not saved. */
  onUse: (answers: readonly { key: string; text: string }[]) => Promise<boolean>;
  onDismiss: () => Promise<boolean>;
}) {
  const t = piecesCopy[locale];
  const baseId = useId();
  const noticeId = `${baseId}-notice`;
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<'use' | 'dismiss' | null>(null);
  const [failed, setFailed] = useState(false);

  const given = ask.questions
    .map((question) => ({
      key: question.key,
      text: (answers[question.key] ?? '').trim(),
    }))
    .filter((answer) => answer.text);
  const locked = disabled || busy !== null;

  const run = async (kind: 'use' | 'dismiss') => {
    setBusy(kind);
    setFailed(false);
    const ok = await (kind === 'use' ? onUse(given) : onDismiss()).catch(
      () => false
    );
    setBusy(null);
    if (!ok) setFailed(true);
  };

  return (
    <section
      data-piece-material-ask={ask.adaptationId}
      aria-label={t.materialAskLabel}
      aria-describedby={noticeId}
      className="flex min-w-0 max-w-[72ch] flex-col gap-[16px] border-t border-cf-border pt-[16px]"
    >
      <div className="flex min-w-0 items-start gap-[4px]">
        <p
          id={noticeId}
          className="min-w-0 cf-body-sm text-cf-ink-muted [text-wrap:pretty]"
        >
          {t.materialAskNotice(approximateLength(ask.length), ask.min)}
        </p>
        <Hint label={t.materialAskNoticeHintLabel}>{t.materialAskNoticeHint}</Hint>
      </div>

      {ask.questions.map((question, index) => {
        const fieldId = `${baseId}-${question.key}`;
        const whyId = `${fieldId}-why`;
        return (
          <div
            key={question.key}
            data-piece-material-question={question.key}
            className="flex min-w-0 flex-col gap-[8px]"
          >
            <div className="flex min-w-0 flex-col gap-[4px]">
              <FieldLabel
                htmlFor={fieldId}
                label={question.question}
                labelClassName="cf-label-md text-cf-ink [text-wrap:pretty]"
              />
              {question.why ? (
                <p id={whyId} className="cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
                  {question.why}
                </p>
              ) : null}
            </div>
            <Textarea
              standalone
              id={fieldId}
              layout="content"
              name={`piece-material-answer-${index + 1}`}
              placeholder={t.materialAskPlaceholder}
              aria-describedby={question.why ? whyId : undefined}
              className="w-full"
              value={answers[question.key] ?? ''}
              disabled={locked}
              onChange={(event) => {
                const text = event.target.value;
                setAnswers((current) => ({ ...current, [question.key]: text }));
                setFailed(false);
              }}
            />
          </div>
        );
      })}

      <div className="flex min-w-0 flex-wrap items-center gap-[8px]">
        <span className="inline-flex items-center gap-[4px]">
          <Button
            type="button"
            variant="secondary"
            density="dense"
            loading={busy === 'use'}
            loadingLabel={t.materialAskUsing}
            disabled={locked || given.length === 0}
            data-piece-material-use="true"
            onClick={() => void run('use')}
          >
            {t.materialAskUse}
          </Button>
          <Hint label={t.materialAskUseHintLabel}>{t.materialAskUseHint}</Hint>
        </span>
        <Button
          type="button"
          variant="quiet"
          density="dense"
          loading={busy === 'dismiss'}
          loadingLabel={t.materialAskDismiss}
          disabled={locked}
          data-piece-material-dismiss="true"
          onClick={() => void run('dismiss')}
        >
          {t.materialAskDismiss}
        </Button>
      </div>
      {failed ? (
        <p role="alert" className="cf-body-sm text-cf-danger">
          {t.materialAskFailed}
        </p>
      ) : null}
    </section>
  );
}

export default MaterialAsk;
