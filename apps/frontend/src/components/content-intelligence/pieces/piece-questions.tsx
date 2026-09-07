'use client';

import { SuggestedQuestionsCard } from '../intake/questions.card';
import { piecesCopy, type PiecesLocale } from './pieces.copy';
import type { BriefField, IntakeQuestionV1 } from '../intake/intake.adapter';

/**
 * «Уточнение» на странице заготовки: вопросы там, где стоит суть.
 *
 * `content-factory-next-m2eg`, живой прогон 07.09.2026. До этой волны вопрос
 * жил на экране входа и был терминальным: пока человек не ответил, заготовки
 * не существовало, и второй круг упирался в «больше спрашивать не будем» — ни
 * заготовки, ни текста. Теперь заготовка записана до вопросов, а вопросы
 * приезжают в её брифе и стоят здесь, первым блоком после шапки: ответ правит
 * ту самую суть, которую человек видит ниже.
 *
 * Своей карточки у этого блока нет и не заводится. Рисует его
 * `SuggestedQuestionsCard` из папки входа — та же работа, та же геометрия, те
 * же четыре способа закрыть вопрос: «Так и есть», «Поправить», «Реши сама» и
 * «Пропустить». Второй компонент на ту же работу однажды уже разошёлся с
 * первым на третьем поле, и повторять это незачем.
 *
 * Единственный перевод, который здесь есть, — ключ. Карточка знает вопросы по
 * строковому ключу, а заготовка — по полю брифа (`thesis`, `facts`,
 * `position`), потому что поле и есть то, что вопрос закрывает. Перевод
 * туда-обратно занимает две строки и держит обещание волны: один вопрос на
 * поле, и повтора «на что это опирается» больше не бывает.
 */

export function PieceQuestions({
  locale,
  questions,
  busy = false,
  onAnswer,
  onSkip,
}: {
  locale: PiecesLocale;
  /** Что осталось спросить: приезжает в брифе заготовки. */
  questions: readonly IntakeQuestionV1[];
  busy?: boolean;
  /** Ответы уходят одним ходом: один запрос, а не по одному на вопрос. */
  onAnswer: (
    answers: readonly { field: BriefField; text: string }[],
    decide: readonly BriefField[]
  ) => void;
  /** «Оставить как есть»: заготовка уже годится, и это законный исход. */
  onSkip: () => void;
}) {
  const t = piecesCopy[locale];
  if (!questions.length) return null;

  return (
    <div data-piece-clarify="true">
      <SuggestedQuestionsCard
        words={{
          badge: t.interviewBadge,
          title: t.interviewTitle,
          lead: t.clarifyLead,
          suggestedLead: t.suggestedLead,
          yes: t.answerYes,
          fix: t.answerFix,
          decide: t.answerDecide,
          skip: t.answerSkip,
          ownAnswerLabel: t.ownAnswerLabel,
          ownAnswerHint: t.ownAnswerHint,
          send: t.interviewSend,
          skipAll: t.clarifySkip,
        }}
        questions={questions.map((question) => ({
          key: question.field,
          question: question.question,
          suggested: question.suggested ?? null,
          ...(question.why ? { why: question.why } : {}),
        }))}
        busy={busy}
        onSubmit={(answers, decide) =>
          onAnswer(
            answers.map((answer) => ({
              field: answer.key as BriefField,
              // Дословно, включая «Так и есть»: подтверждённое предложение
              // модели становится словом человека ровно в тот момент, когда он
              // под ним подписался.
              text: answer.text,
            })),
            decide as readonly BriefField[]
          )
        }
        onSkipAll={onSkip}
      />
    </div>
  );
}

export default PieceQuestions;
