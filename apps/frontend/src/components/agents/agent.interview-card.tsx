'use client';

import { useState } from 'react';
import {
  SuggestedQuestionsCard,
  type SuggestedAnswer,
} from '@contentfactory/frontend/components/content-intelligence/intake/questions.card';
import {
  DECIDE_FOR_PERSON_ANSWER,
  type AgentInterviewQuestionPayload,
  type AgentQuestion,
} from './agent.contract';
import { AgentCard } from './agent.cards';
import type { AgentWords } from './agent.copy';

/**
 * «Уточнение» before an adaptation (`kcxz.16`, `piece_adapt`'s pause): the
 * channel tab's own interview, `SuggestedQuestionsCard`, inside the chat's
 * card frame — the same questions, the model's suggestion, «Так и есть»,
 * «Поправить», «Решите за меня» per question and «Решите всё за меня».
 *
 * The answer is the page's: `{ answers: [{ key, text, origin }], decideKeys }`
 * (a skipped or empty question goes to `decideKeys`, as on the page), or
 * `{ decideForPerson: true }` for all of them.
 */

export type AgentInterviewQuestion = Extract<AgentQuestion, { kind: 'interview' }>;

export const interviewAnswer = (
  answers: readonly SuggestedAnswer[],
  decideKeys: readonly string[]
): Record<string, unknown> => ({
  answers: answers.map(({ key, text, origin }) => ({ key, text, origin })),
  decideKeys: [...decideKeys],
});

export function InterviewCard({
  question,
  busy,
  onAnswer,
  words,
}: {
  question: AgentInterviewQuestion;
  busy: boolean;
  onAnswer: (resumeData: Record<string, unknown>) => void;
  words: AgentWords;
}) {
  const w = words.interview;
  const [sent, setSent] = useState(false);
  const send = (resumeData: Record<string, unknown>) => {
    setSent(true);
    onAnswer(resumeData);
  };
  const title = w.title(question.questions.length);

  return (
    <AgentCard
      cardKind="interview"
      glyph="ask"
      kind={w.badge}
      title={title}
      label={`${w.badge}: ${title}`}
      aside={
        question.channel ? (
          <span className="cf-caption text-cf-ink-muted">{question.channel.name}</span>
        ) : undefined
      }
    >
      {question.text ? (
        <p className="max-w-[72ch] cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
          {question.text}
        </p>
      ) : null}
      <SuggestedQuestionsCard
        framed={false}
        // The lead is the server's, drawn above; unframed, the card shows none.
        words={{ ...w, lead: question.text }}
        questions={question.questions.map((one) => ({
          key: one.key,
          question: one.question,
          suggested: one.suggested,
          ...(one.options ? { options: one.options } : {}),
          ...(one.why ? { why: one.why } : {}),
        }))}
        busy={busy || sent}
        busyLabel={words.conversation.thinking}
        onSubmit={(given, decideKeys) => send(interviewAnswer(given, decideKeys))}
        onSkipAll={
          question.canDecideForPerson
            ? () => send({ ...DECIDE_FOR_PERSON_ANSWER })
            : undefined
        }
      />
    </AgentCard>
  );
}
