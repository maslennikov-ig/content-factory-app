'use client';

import { useState } from 'react';
import { SuggestedQuestionsCard } from '../intake/questions.card';
import {
  PostLinkFields,
  savePostLink,
  usePostLinkDraft,
} from '../intake/post-link.question';
import { Button } from '@contentfactory/react/form/button';
import { intakeCopy } from '../intake/intake.copy';
import { piecesCopy, type PiecesLocale } from './pieces.copy';
import type { BriefField, IntakeQuestionV1 } from '../intake/intake.adapter';
import type { InterviewAskKeyV1 } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';

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
 *
 * С `content-factory-next-97dq.44` вопросов столько, сколько решила модель, и
 * вопрос о материале (эпизод, число, ставка) поля брифа не закрывает: он
 * опознаётся своим ключом `ask-<n>`, а ответ уходит с этим ключом. «Решите за
 * меня» у него не нужно называть: не отвеченный вопрос о материале сервер и
 * так отдаёт модели.
 */

/** Ответ на открытый вопрос: поле брифа и, у вопроса о материале, его ключ. */
export type PieceQuestionReply = {
  field: BriefField;
  key?: InterviewAskKeyV1;
  text: string;
};

/**
 * «Какую ссылку поставить в пост?» внутри той же карточки (`97dq.89`): одна
 * композиция и одна «Дальше». Ссылка пишется первой — суть, которую
 * пересоберут ответы, уже знает её.
 */
export type PieceLinkQuestion = {
  initial?: { url: string | null; text?: string | null } | null;
  /** Пишет ответ; `false` — не записался. */
  onAnswer: (url: string | null, text?: string) => Promise<boolean>;
  /** Есть, когда ответ уже дан: закрыть вопрос, ничего не меняя. */
  onKeep?: () => void;
};

/**
 * Сохранённый ответ как ключ черновика: сменился — поля заполняются заново
 * (ревью `97dq.89`, F2). Пока вопроса в карточке нет, ключ «closed»: вопрос,
 * открытый «Изменить» поверх уже смонтированных вопросов, начинает с ответа,
 * а не с пустых полей, оставшихся от первого показа.
 */
const linkDraftKey = (link: PieceLinkQuestion | undefined): string => {
  if (!link) return 'closed';
  const initial = link.initial;
  if (!initial) return 'open';
  return `answered:${initial.url ?? 'none'}:${initial.text ?? ''}`;
};

export function PieceQuestions({
  locale,
  questions,
  busy = false,
  onAnswer,
  onSkip,
  link,
}: {
  locale: PiecesLocale;
  /** Что осталось спросить: приезжает в брифе заготовки. */
  questions: readonly IntakeQuestionV1[];
  busy?: boolean;
  /** Ответы уходят одним ходом: один запрос, а не по одному на вопрос. */
  onAnswer: (
    answers: readonly PieceQuestionReply[],
    decide: readonly BriefField[]
  ) => void;
  /** «Оставить как есть»: заготовка уже годится, и это законный исход. */
  onSkip: () => void;
  /** Вопрос о ссылке, когда он открыт одновременно с вопросами. */
  link?: PieceLinkQuestion;
}) {
  const t = piecesCopy[locale];
  const draft = usePostLinkDraft(link?.initial, linkDraftKey(link));
  const [linkSaving, setLinkSaving] = useState(false);
  /** Правка черновика, на которой ссылка не записалась; правка после — снимает слово. */
  const [linkFailedAt, setLinkFailedAt] = useState<number | null>(null);
  const linkFailed = linkFailedAt !== null && linkFailedAt === draft.revision;
  if (!questions.length) return null;

  /**
   * Ссылка — первой: неверный адрес держит шаг на месте, отмечен у поля и
   * забирает фокус; незаписанный ответ тоже держит шаг. Пустой адрес —
   * вопрос без ответа, он остаётся открытым, как любой другой. Открытый
   * заново и не тронутый ответ не переписывается: вопрос просто закрывается.
   */
  const withLink = async (next: () => void) => {
    if (!link) return next();
    if (link.initial && draft.pristine) {
      link.onKeep?.();
      return next();
    }
    const answer = draft.read();
    if (answer === 'invalid') return;
    if (answer) {
      const revision = draft.revision;
      setLinkSaving(true);
      setLinkFailedAt(null);
      const ok = await savePostLink(answer, link.onAnswer);
      setLinkSaving(false);
      if (!ok) {
        setLinkFailedAt(revision);
        return;
      }
    }
    next();
  };
  const idOf = (question: IntakeQuestionV1): string =>
    question.key ?? question.field;
  const byId = new Map(questions.map((question) => [idOf(question), question]));

  return (
    <div data-piece-clarify="true">
      <SuggestedQuestionsCard
        words={{
          badge: t.interviewBadge,
          title: t.interviewTitle,
          lead: locale === 'ru' ? 'Мы спросили по вашему тексту. Ответьте, затем напишем суть.' : 'We asked about your material. Answer before drafting the core.',
          suggestedLead: t.suggestedLead,
          yes: t.answerYes,
          fix: t.answerFix,
          decide: t.answerDecide,
          skip: t.answerSkip,
          ownAnswerLabel: t.ownAnswerLabel,
          ownAnswerHint: t.ownAnswerHint,
          ownOptionPlaceholder: t.ownOptionPlaceholder,
          send: t.interviewSend,
          skipAll: t.answerDecideAll,
          own: t.ownAnswer,
        }}
        questions={questions.map((question) => ({
          key: idOf(question),
          question: question.question,
          options: question.options,
          suggested: question.suggested ?? null,
          // Вариант, просящий свои слова, едет с сервера и здесь только
          // передаётся дальше: узнавать его по тексту карточка не должна.
          ...(question.ownOption ? { ownOption: question.ownOption } : {}),
          ...(question.why ? { why: question.why } : {}),
        }))}
        busy={busy || linkSaving}
        extra={
          link ? (
            <div
              data-piece-link-in-questions="true"
              className="flex min-w-0 flex-col gap-[8px] border-t border-cf-border pt-[16px]"
            >
              <PostLinkFields
                locale={locale}
                draft={draft}
                disabled={busy || linkSaving}
              />
              {link.onKeep ? (
                <div className="flex min-w-0 flex-wrap items-center gap-[8px]">
                  <Button
                    type="button"
                    variant="quiet"
                    density="dense"
                    disabled={busy || linkSaving}
                    data-piece-link-keep="true"
                    onClick={link.onKeep}
                  >
                    {intakeCopy[locale].postLinkKeep}
                  </Button>
                </div>
              ) : null}
              {linkFailed ? (
                <p role="alert" className="cf-body-sm text-cf-danger">
                  {intakeCopy[locale].postLinkFailed}
                </p>
              ) : null}
            </div>
          ) : undefined
        }
        onSubmit={(answers, decide) =>
          void withLink(() => onAnswer(
            answers.flatMap((answer) => {
              const question = byId.get(answer.key);
              if (!question) return [];
              return [
                {
                  field: question.field,
                  ...(question.key ? { key: question.key } : {}),
                  // Дословно, включая «Так и есть»: подтверждённое предложение
                  // модели становится словом человека ровно в тот момент,
                  // когда он под ним подписался.
                  text: answer.text,
                },
              ];
            }),
            decide.flatMap((id) => {
              const question = byId.get(id);
              return question && !question.key ? [question.field] : [];
            })
          ))
        }
        // «Оставить как есть» оставляет заготовку как есть — и ссылку тоже:
        // набранный, но не отправленный адрес этой кнопкой не пишется.
        onSkipAll={questions.length >= 2 ? onSkip : undefined}
      />
    </div>
  );
}

export default PieceQuestions;
