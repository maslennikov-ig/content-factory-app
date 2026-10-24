'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@contentfactory/react/form/button';
import {
  ManualQuestionControls,
  manualQuestionAnswered,
  type ManualQuestionAnswer,
} from '../content-intelligence/intake/questions.card';
import { AgentCard, OpenOnScreen } from './agent.cards';
import { artifactHref, errorCodeOf, readDoorError, type AgentQuestion } from './agent.contract';
import type { AgentWords } from './agent.copy';
import {
  domainQuestionDraftKey,
  useQuestionDraft,
} from './agent.question-draft';

export type AgentDomainQuestion = Extract<
  AgentQuestion,
  { kind: 'domain-questions' }
>;

/** One native checkpoint per explicit answer; the domain applies the complete batch once. */
export function DomainQuestionCard({
  question,
  busy,
  onAnswer,
  words,
  draftStorageKey,
  failure = false,
  failureCode = null,
  readOnly = false,
}: {
  question: AgentDomainQuestion;
  busy: boolean;
  onAnswer: (resumeData: Record<string, unknown>) => void | Promise<void>;
  words: AgentWords;
  draftStorageKey?: string;
  failure?: boolean;
  failureCode?: string | null;
  readOnly?: boolean;
}) {
  const active = question.questions.find(
    (one) => one.key === question.activeKey
  );
  const key = domainQuestionDraftKey(
    draftStorageKey,
    question.batchId,
    question.source.revision,
    question.activeKey
  );
  const [draft, setDraft] = useQuestionDraft<ManualQuestionAnswer | null>(
    key,
    null
  );
  const [sent, setSent] = useState(false);
  const sending = useRef(false);
  const [rejected, setRejected] = useState(false);
  const [rejectionCode, setRejectionCode] = useState<string | null>(null);
  const w = words.question;
  const knownRejection = (failureCode ?? rejectionCode) === 'AGENT_QUESTION_STALE'
    ? words.error.codes.AGENT_QUESTION_STALE
    : null;
  const position =
    Math.max(
      0,
      question.questions.findIndex((one) => one.key === question.activeKey)
    ) + 1;
  useEffect(() => {
    for (const answer of question.answers) {
      const acceptedKey = domainQuestionDraftKey(
        draftStorageKey,
        question.batchId,
        question.source.revision,
        answer.key
      );
      if (acceptedKey)
        try {
          window.sessionStorage.removeItem(acceptedKey);
        } catch {
          /* Optional browser draft. */
        }
    }
  }, [
    draftStorageKey,
    question.answers,
    question.batchId,
    question.source.revision,
  ]);
  // A refused native request keeps this card and its text; the conversation
  // identifies refusal without pretending a model stream succeeded.
  useEffect(() => {
    if (failure) {
      sending.current = false;
      setSent(false);
    }
  }, [failure]);
  const send = async (all: boolean) => {
    if (
      sending.current ||
      busy ||
      readOnly ||
      !!knownRejection ||
      !active ||
      (!all && !manualQuestionAnswered(draft))
    )
      return;
    sending.current = true;
    setSent(true);
    setRejected(false);
    setRejectionCode(null);
    try {
      await onAnswer(
        all
          ? { decideForPerson: true }
          : { answers: [{ key: active.key, ...draft! }] }
      );
      if (key) try { window.sessionStorage.removeItem(key); } catch { /* Native acknowledgement owns accepted answers. */ }
    } catch (failure) {
      sending.current = false;
      setSent(false);
      setRejected(true);
      setRejectionCode(failure instanceof Error ? errorCodeOf(failure.message) ?? readDoorError(failure.message) : null);
    }
  };
  const locked = busy || sent || readOnly;
  if (readOnly && !draft) return null;
  return (
    <AgentCard
      cardKind="domain-questions"
      glyph="ask"
      kind={w.kind}
      title={w.progress(position, question.questions.length)}
      label={`${w.kind}: ${active?.question ?? question.text}`}
      footer={
        !readOnly && active ? (
          <>
            <Button
              type="button"
              disabled={locked || !!knownRejection || !manualQuestionAnswered(draft)}
              loading={sent}
              loadingLabel={w.sending}
              onClick={() => void send(false)}
            >
              {w.send}
            </Button>
            {question.questions.length - question.answers.length > 1 ? (
              <Button
                type="button"
                variant="quiet"
                disabled={locked || !!knownRejection}
                onClick={() => void send(true)}
              >
                {w.decideRemaining}
              </Button>
            ) : null}
            {knownRejection ? <OpenOnScreen href={artifactHref({ kind: 'piece', id: question.source.pieceId })} words={words} /> : null}
          </>
        ) : undefined
      }
    >
      {question.answers.length ? (
        <ol
          aria-label={w.savedAnswers}
          className="flex min-w-0 flex-col gap-[12px] border-b border-cf-border pb-[12px]"
        >
          {question.answers.map((answer) => {
            const one = question.questions.find(
              (item) => item.key === answer.key
            );
            const text =
              answer.mode === 'delegate'
                ? w.delegated
                : answer.text ??
                  (answer.mode === 'confirmed'
                    ? one?.suggested
                    : one?.options
                        ?.filter((option) =>
                          answer.optionIds?.includes(option.id)
                        )
                        .map((option) => option.label)
                        .join('\n'));
            return (
              <li key={answer.key} className="flex min-w-0 flex-col gap-[4px]">
                <span className="cf-caption text-cf-ink-muted whitespace-pre-wrap [overflow-wrap:anywhere]">
                  {one?.question}
                </span>
                <span className="cf-body-sm text-cf-ink whitespace-pre-wrap [overflow-wrap:anywhere]">
                  {text}
                </span>
              </li>
            );
          })}
        </ol>
      ) : null}
      {active ? (
        <>
          <p className="cf-body-md text-cf-ink whitespace-pre-wrap [overflow-wrap:anywhere]">
            {active.question}
          </p>
          <ManualQuestionControls
            question={active}
            value={draft}
            onChange={setDraft}
            disabled={locked}
            words={w}
          />
        </>
      ) : (
        <p role="status" className="cf-body-sm text-cf-danger">
          {w.unavailable}
        </p>
      )}
      {rejected || failure || readOnly || knownRejection ? (
        <p role="status" className="cf-body-sm text-cf-warning">
          {readOnly ? w.draftRetained : knownRejection ? `${knownRejection.what} ${knownRejection.next}` : w.answerFailed}
        </p>
      ) : null}
    </AgentCard>
  );
}
