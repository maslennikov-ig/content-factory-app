'use client';

import { useState } from 'react';
import { Button } from '@contentfactory/react/form/button';
import { Input } from '@contentfactory/react/form/input';
import {
  RadioGroup,
  RadioOption,
} from '@contentfactory/react/choice/radio.group';
import clsx from 'clsx';
import { Status } from '../../ui/surface';
import { intakeCopy, type IntakeLocale } from './intake.copy';
import type { BriefField, IntakeQuestionV1 } from './intake.adapter';

/**
 * Не больше двух вопросов, и только когда без ответа писать не из чего.
 *
 * Решение владельца 06.09.2026 (пункт 2) и старый отказ от анкеты
 * (`draft-gaps.ts`, `pl1.10`): продукт предлагает, а не допрашивает. Поэтому
 * у каждого вопроса есть готовые варианты, «Свой ответ» и «Реши сама» — три
 * способа закрыть его, и ни один из них не «напишите сочинение в поле».
 *
 * «Реши сама» — это не пропуск. Поле уходит в `decide[]`, модель заполняет его
 * сама и помечает как предположение; вопрос про него больше не задаётся. Тем
 * и отличается от пустого ответа, который сервер счёл бы за «всё ещё не
 * знаю» и спросил бы снова.
 *
 * `RadioGroup` вместо списка кнопок по причине, записанной у самого
 * примитива: выбор дешёвый и обратимый, ничего никуда не ведёт. Раскрывашки
 * здесь нет намеренно — оба вопроса видны сразу, иначе человек отвечает на
 * первый и не знает, что есть второй.
 *
 * ## Второй вопрос того же вида: интервью заготовки
 *
 * `content-factory-next-tu3k.9.9` (Z5) добавляет в этот же файл
 * `SuggestedQuestionsCard` — карточку, где модель уже ответила первой («я
 * думаю, вот так»), а человек соглашается, правит, отдаёт решение модели или
 * пропускает вопрос. Это та же работа и та же геометрия, поэтому она живёт
 * рядом, а не третьей карточкой вопросов в соседней папке: у продукта уже был
 * случай, когда одна работа разъехалась по двум компонентам и они разошлись
 * на третьем поле.
 *
 * Слова карточка не знает: они приходят пропсом `words`. Ей одинаково служат
 * словарь входа и словарь заготовок, и ни один из них не становится её
 * зависимостью.
 */

/**
 * Что человек выбрал по одному полю.
 *
 * `via` у своего ответа — подпись варианта, который это поле открыл
 * (`content-factory-next-97dq.23`). Нужна ровно для одного: показать выбранным
 * тот вариант, который человек нажал, пока он пишет свои слова. В ответ она не
 * уходит никогда — ответом остаётся написанное.
 */
export type QuestionAnswer =
  | { mode: 'option'; text: string }
  | { mode: 'own'; text: string; via?: string }
  | { mode: 'decide' };

export type QuestionAnswers = Partial<Record<string, QuestionAnswer>>;

const OWN = '__own__';

export function QuestionsCard({
  locale,
  questions,
  busy = false,
  onSubmit,
}: {
  locale: IntakeLocale;
  questions: readonly IntakeQuestionV1[];
  busy?: boolean;
  /** Ответы уходят одним ходом: один запрос, а не по одному на вопрос. */
  onSubmit: (
    answers: readonly { field: BriefField; text: string }[],
    decide: readonly BriefField[]
  ) => void;
}) {
  const t = intakeCopy[locale];
  const [answers, setAnswers] = useState<QuestionAnswers>({});

  const answerOf = (field: string) => answers[field];
  const answered = questions.every((question) => {
    const answer = answerOf(question.field);
    if (!answer) return false;
    if (answer.mode === 'decide') return true;
    return answer.text.trim().length > 0;
  });

  const submit = (all: boolean) => {
    if (all) {
      onSubmit(
        [],
        questions.map((question) => question.field)
      );
      return;
    }
    const filled: { field: BriefField; text: string }[] = [];
    const decided: BriefField[] = [];
    for (const question of questions) {
      const answer = answerOf(question.field);
      if (!answer || answer.mode === 'decide') {
        decided.push(question.field);
        continue;
      }
      filled.push({ field: question.field, text: answer.text.trim() });
    }
    onSubmit(filled, decided);
  };

  return (
    <section
      data-intake-questions="true"
      className="flex min-w-0 flex-col gap-[16px] rounded-[8px] border border-cf-border bg-cf-surface p-[16px]"
    >
      <header className="flex flex-col gap-[8px]">
        <div className="flex flex-wrap items-center gap-[8px]">
          <Status tone="info">{t.questionsBadge}</Status>
          <h3 className="cf-heading-md text-cf-ink [text-wrap:balance]">
            {t.questionsTitle(questions.length)}
          </h3>
        </div>
        <p className="max-w-[72ch] cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
          {t.questionsLead}
        </p>
      </header>

      {questions.map((question) => {
        const answer = answerOf(question.field);
        const value =
          answer?.mode === 'decide'
            ? '__decide__'
            : answer?.mode === 'own'
            ? OWN
            : answer?.text ?? null;

        return (
          <div
            key={question.field}
            data-intake-question={question.field}
            className="flex min-w-0 flex-col gap-[8px]"
          >
            <p className="max-w-[72ch] cf-body-md text-cf-ink [text-wrap:pretty]">
              {question.question}
            </p>
            <RadioGroup
              value={value}
              aria-label={question.question}
              onChange={(next) =>
                setAnswers((current) => ({
                  ...current,
                  [question.field]:
                    next === '__decide__'
                      ? { mode: 'decide' }
                      : next === OWN
                      ? { mode: 'own', text: '' }
                      : { mode: 'option', text: next },
                }))
              }
              className="flex flex-col gap-[4px]"
            >
              {(question.options ?? []).map((option) => (
                <RadioOption
                  key={option}
                  value={option}
                  layout="content"
                  className={clsx(
                    'w-full justify-start rounded-[8px] border px-[12px] py-[8px] text-start cf-body-sm transition-colors duration-state motion-reduce:transition-none',
                    answer?.mode === 'option' && answer.text === option
                      ? 'border-cf-accent bg-cf-accent-soft text-cf-ink cf-pressed'
                      : 'border-cf-border-control text-cf-ink hover:bg-cf-surface-subtle cf-pressed'
                  )}
                >
                  {option}
                </RadioOption>
              ))}
              <RadioOption
                value={OWN}
                layout="content"
                className={clsx(
                  'w-full justify-start rounded-[8px] border px-[12px] py-[8px] text-start cf-body-sm transition-colors duration-state motion-reduce:transition-none',
                  answer?.mode === 'own'
                    ? 'border-cf-accent bg-cf-accent-soft text-cf-ink cf-pressed'
                    : 'border-cf-border-control text-cf-ink hover:bg-cf-surface-subtle cf-pressed'
                )}
              >
                {t.ownAnswer}
              </RadioOption>
              <RadioOption
                value="__decide__"
                layout="content"
                className={clsx(
                  'w-full justify-start rounded-[8px] border px-[12px] py-[8px] text-start cf-body-sm transition-colors duration-state motion-reduce:transition-none',
                  answer?.mode === 'decide'
                    ? 'border-cf-accent bg-cf-accent-soft text-cf-ink cf-pressed'
                    : 'border-cf-border-control text-cf-ink-muted hover:bg-cf-surface-subtle cf-pressed'
                )}
              >
                {t.decideThis}
              </RadioOption>
            </RadioGroup>

            {answer?.mode === 'own' && (
              <Input
                standalone
                removeError
                name={`intake-answer-${question.field}`}
                label={t.ownAnswerLabel}
                value={answer.text}
                onChange={(event) =>
                  setAnswers((current) => ({
                    ...current,
                    [question.field]: { mode: 'own', text: event.target.value },
                  }))
                }
              />
            )}
          </div>
        );
      })}

      <footer className="flex flex-wrap items-center gap-[8px]">
        <Button
          type="button"
          variant="primary"
          disabled={busy || !answered}
          onClick={() => submit(false)}
        >
          {t.write}
        </Button>
        {/*
          Второй выход из карточки, равный по силе первому: человек не обязан
          знать ответ, чтобы получить текст. Модель заполнит оба поля сама и
          пометит их предположением в квитанции.
        */}
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={() => submit(true)}
        >
          {t.decideAll}
        </Button>
        {!answered && (
          <p
            role="status"
            data-intake-block-reason="answers"
            className="cf-caption text-cf-ink-muted"
          >
            {t.blockedUnanswered}
          </p>
        )}
      </footer>
    </section>
  );
}

/* -------------------------------------------------------------------------
 * Интервью заготовки: модель отвечает первой
 * ---------------------------------------------------------------------- */

/**
 * Вопрос, у которого уже есть ответ модели.
 *
 * `suggested: null` — модель честно не нашла ответа в тексте и просит слова
 * человека. Тогда «Так и есть» не показывается вовсе: соглашаться не с чем, а
 * кнопка, подтверждающая пустоту, — это способ получить пустую строку в
 * брифе.
 */
export type SuggestedQuestion = {
  key: string;
  question: string;
  suggested: string | null;
  options?: readonly string[];
  /**
   * Вариант, который просит слова человека, а не выбирается ответом: его
   * нажатие открывает поле так же, как «Поправить», и подпись варианта в ответ
   * не уходит. Приходит с сервера (`IntakeQuestionV1.ownOption`), а не
   * угадывается здесь по тексту.
   */
  ownOption?: string;
  why?: string;
};

export type SuggestedAnswer = {
  key: string;
  text: string;
  /** `confirmed` — «Так и есть»; `person` — свои слова. */
  origin: 'person' | 'confirmed';
};

export type SuggestedQuestionsWords = {
  badge: string;
  title: (count: number) => string;
  lead: string;
  suggestedLead: string;
  yes: string;
  fix: string;
  decide: string;
  skip: string;
  ownAnswerLabel: string;
  ownAnswerHint: string;
  /** Подсказка в поле, открытом вариантом «хочу уточнить свою позицию». */
  ownOptionPlaceholder: string;
  /**
   * Подпись чипа «свои слова», когда у вопроса нет предложения модели
   * (`content-factory-next-97dq.31`): «Поправить» там поправлять нечего.
   * Без неё — `ownAnswerLabel`.
   */
  own?: string;
  send: string;
  skipAll: string;
};

const FIX = '__fix__';
const DECIDE = '__decide__';
const SKIP = '__skip__';

export function SuggestedQuestionsCard({
  words,
  questions,
  busy = false,
  onSubmit,
  onSkipAll,
}: {
  words: SuggestedQuestionsWords;
  questions: readonly SuggestedQuestion[];
  busy?: boolean;
  /** Ответы уходят одним ходом; остальные ключи — «реши сама». */
  onSubmit: (
    answers: readonly SuggestedAnswer[],
    decideKeys: readonly string[]
  ) => void;
  onSkipAll?: () => void;
}) {
  const [answers, setAnswers] = useState<QuestionAnswers>({});

  /**
   * Геометрия чипа одна на оба ряда, краска — разная: варианты ответа несут
   * рамку, служебные действия стоят тише (`content-factory-next-97dq.23`).
   * Владелец на девятом заходе прочитал шесть одинаковых чипов как шесть
   * равных вариантов ответа, и это ровно то, чем они выглядели.
   */
  const chipBase =
    'max-w-full justify-start rounded-[8px] border px-[12px] py-[8px] text-start cf-body-sm transition-colors duration-state motion-reduce:transition-none';
  const chosen = 'border-cf-accent bg-cf-accent-soft text-cf-ink cf-pressed';

  const optionClass = (active: boolean) =>
    clsx(
      chipBase,
      active
        ? chosen
        : 'border-cf-border-control text-cf-ink hover:bg-cf-surface-subtle cf-pressed'
    );

  const serviceClass = (active: boolean) =>
    clsx(
      chipBase,
      active
        ? chosen
        : 'border-transparent text-cf-ink-muted hover:bg-cf-surface-subtle cf-pressed'
    );

  const submit = () => {
    const given: SuggestedAnswer[] = [];
    const decided: string[] = [];
    for (const question of questions) {
      const answer = answers[question.key];
      // «Пропустить» — тоже решение модели, а не ответ: служебная метка чипа
      // не должна уйти в бриф или в промпт словами человека.
      if (!answer || answer.mode === 'decide' || answer.text === SKIP) {
        decided.push(question.key);
        continue;
      }
      const text =
        answer.text.trim();
      // Пустое своё поле закрывается моделью — так же, как пустое «Поправить»
      // до этой волны. Подпись варианта, просящего свои слова, ответом не
      // становится ни при каком стечении обстоятельств.
      if (!text || (question.ownOption && text === question.ownOption)) {
        decided.push(question.key);
        continue;
      }
      given.push({
        key: question.key,
        text,
        // «Так и есть» — подтверждение слова модели, а не слово человека.
        // Контракт различает их, и квитанция потом тоже.
        origin: answer.mode === 'option' ? 'confirmed' : 'person',
      });
    }
    onSubmit(given, decided);
  };

  return (
    <section
      data-piece-questions="true"
      className="flex min-w-0 flex-col gap-[16px] rounded-[8px] border border-cf-border bg-cf-surface p-[16px]"
    >
      <header className="flex flex-col gap-[8px]">
        <div className="flex flex-wrap items-center gap-[8px]">
          <Status tone="info">{words.badge}</Status>
          <h3 className="cf-heading-md text-cf-ink [text-wrap:balance]">
            {words.title(questions.length)}
          </h3>
        </div>
        <p className="max-w-[72ch] cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
          {words.lead}
        </p>
      </header>

      {questions.map((question) => {
        const answer = answers[question.key];
        const value =
          answer?.mode === 'option'
            ? answer.text
            : answer?.mode === 'own'
            ? answer.text === SKIP
              ? SKIP
              : answer.via ?? FIX
            : answer?.mode === 'decide'
            ? DECIDE
            : null;
        // Поле открыто своими словами, и видно, чем именно: «Поправить» или
        // вариантом, который просит уточнения.
        const writing = answer?.mode === 'own' && answer.text !== SKIP;

        return (
          <div
            key={question.key}
            data-piece-question={question.key}
            className="flex min-w-0 flex-col gap-[8px]"
          >
            <p className="max-w-[72ch] cf-body-md text-cf-ink [text-wrap:pretty]">
              {question.question}
            </p>
            {question.why ? (
              <p className="max-w-[72ch] cf-caption text-cf-ink-muted [text-wrap:pretty]">
                {question.why}
              </p>
            ) : null}

            {/*
              Ответ модели стоит выше кнопок и целиком: «Так и есть» под
              свёрнутой цитатой — это согласие вслепую.
            */}
            {question.suggested ? (
              <blockquote
                data-piece-suggested={question.key}
                className="border-s-2 border-cf-border-strong ps-[12px] cf-body-sm text-cf-ink [text-wrap:pretty]"
              >
                <span className="block cf-label-sm uppercase text-cf-ink-muted">
                  {words.suggestedLead}
                </span>
                {question.suggested}
              </blockquote>
            ) : null}

            {/*
              Один `RadioGroup` и два ряда внутри него: выбор по-прежнему один
              на вопрос и по-прежнему ходится стрелками — группа ищет варианты
              в разметке, а не в списке регистраций, и слои ей не мешают. Ряды
              нужны глазу: ответы отдельно, служебные действия отдельно.
            */}
            <RadioGroup
              value={value}
              aria-label={question.question}
              onChange={(next) =>
                setAnswers((current) => ({
                  ...current,
                  [question.key]:
                    next === DECIDE
                      ? { mode: 'decide' }
                      : next === SKIP
                      ? { mode: 'own', text: SKIP }
                      : next === FIX
                      ? { mode: 'own', text: question.suggested ?? '' }
                      : next === question.ownOption
                      ? // Вариант просит свои слова: поле открывается пустым,
                        // и подпись варианта в него не подставляется.
                        { mode: 'own', text: '', via: next }
                      : { mode: 'option', text: next },
                }))
              }
              className="flex flex-col gap-[8px]"
            >
              {/*
                Ряда вариантов нет вовсе, когда вариантов нет: пустой ряд —
                это лишний отступ над служебными действиями и пустая группа
                для читалки с экрана.
              */}
              {question.options?.length || question.suggested ? (
                <div
                  data-piece-answer-options="true"
                  className="flex flex-wrap gap-[4px]"
                >
                  {(question.options ?? []).map((option) => (
                    <RadioOption
                      key={option}
                      value={option}
                      disabled={busy}
                      layout="content"
                      className={optionClass(
                        option === question.ownOption
                          ? writing &&
                              answer?.mode === 'own' &&
                              answer.via === option
                          : answer?.mode === 'option' && answer.text === option
                      )}
                    >
                      {option}
                    </RadioOption>
                  ))}
                  {question.suggested &&
                  !question.options?.includes(question.suggested) ? (
                    <RadioOption
                      disabled={busy}
                      value={question.suggested}
                      layout="content"
                      className={optionClass(
                        answer?.mode === 'option' &&
                          answer.text === question.suggested
                      )}
                    >
                      {words.yes}
                    </RadioOption>
                  ) : null}
                </div>
              ) : null}
              <div
                data-piece-service-actions="true"
                className="flex flex-wrap gap-[4px]"
              >
                <RadioOption
                  disabled={busy}
                  value={FIX}
                  layout="content"
                  className={serviceClass(
                    writing && answer?.mode === 'own' && !answer.via
                  )}
                >
                  {/*
                    Без предложения модели и без варианта «своими словами» от
                    сервера поправлять нечего: чип зовётся своим ответом
                    (`content-factory-next-97dq.31`).
                  */}
                  {question.suggested || question.ownOption
                    ? words.fix
                    : words.own ?? words.ownAnswerLabel}
                </RadioOption>
                <RadioOption
                  disabled={busy}
                  value={DECIDE}
                  layout="content"
                  className={serviceClass(answer?.mode === 'decide')}
                >
                  {words.decide}
                </RadioOption>
                <RadioOption
                  disabled={busy}
                  value={SKIP}
                  layout="content"
                  className={serviceClass(
                    answer?.mode === 'own' && answer.text === SKIP
                  )}
                >
                  {words.skip}
                </RadioOption>
              </div>
            </RadioGroup>

            {/*
              Модель ответа не нашла — поле открыто сразу: вопрос, до поля
              которого надо ещё дожать кнопку, читается как необязательный.
            */}
            {writing || (!question.suggested && !question.options?.length) ? (
              <div className="flex min-w-0 flex-col gap-[4px]">
                <Input
                  disabled={busy}
                  standalone
                  removeError
                  name={`piece-answer-${question.key}`}
                  label={words.ownAnswerLabel}
                  {...(answer?.mode === 'own' && answer.via
                    ? { placeholder: words.ownOptionPlaceholder }
                    : {})}
                  value={answer?.mode === 'own' && answer.text !== SKIP ? answer.text : ''}
                  onChange={(event) =>
                    setAnswers((current) => {
                      const previous = current[question.key];
                      const via =
                        previous?.mode === 'own' ? previous.via : undefined;
                      return {
                        ...current,
                        [question.key]: {
                          mode: 'own',
                          text: event.target.value,
                          // Вариант, открывший поле, остаётся выбранным, пока
                          // человек пишет: иначе подсветка уезжает на первой
                          // же букве.
                          ...(via ? { via } : {}),
                        },
                      };
                    })
                  }
                />
                <p className="cf-caption text-cf-ink-muted">
                  {words.ownAnswerHint}
                </p>
              </div>
            ) : null}
          </div>
        );
      })}

      <footer className="flex flex-wrap items-center gap-[8px]">
        <Button type="button" variant="primary" disabled={busy} onClick={submit}>
          {words.send}
        </Button>
        {/*
          Второй выход, равный по силе первому: интервью пропускается целиком
          одной кнопкой — правило владельца, а не любезность.
        */}
        {onSkipAll ? (
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            data-piece-skip-interview="true"
            onClick={onSkipAll}
          >
            {words.skipAll}
          </Button>
        ) : null}
      </footer>
    </section>
  );
}

export default QuestionsCard;
