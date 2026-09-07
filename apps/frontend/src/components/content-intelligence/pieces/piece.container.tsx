'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { useUser } from '../../layout/user.context';
import { createNdjsonSplitter } from '../../new-launch/ndjson';
import { ContentReadOnlyNote, writeRightFromRole } from '../content-write-right';
import { resolveContentLocale } from '../content-section.copy';
import { useOpenPost } from '../shared/use-open-post';
import { PieceScreen } from './piece.screen';
import { PieceQuestions } from './piece-questions';
import { piecesCopy } from './pieces.copy';
import {
  PIECES_API,
  PIECE_MAX_INTERVIEW_ROUNDS,
  PieceContractError,
  buildAdaptPayload,
  readAdaptEvent,
  readPieceDetail,
  type AdaptationKindV1,
  type AdaptationV1,
  type PieceAnswerInputV1,
  type PieceQuestionKeyV1,
  type PieceQuestionV1,
  type VoiceScreenStateV1,
} from './pieces.adapter';
import { readQuestions, type BriefField, type IntakeQuestionV1 } from '../intake/intake.adapter';
import { PIECE_ROUTES } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';

/**
 * Страница заготовки: чтение двери, стрим адаптации и отказы.
 *
 * `content-factory-next-tu3k.9.9`, поток Z5. Стрим читается тем же способом,
 * что и вход, и генератор постов: `getReader()`, общий `createNdjsonSplitter`,
 * разбор строки контрактом. `AbortController` заводится на ход и обрывается
 * при уходе со страницы — иначе закрытая страница продолжает получать события.
 *
 * Событие `questions` при адаптации терминально: адаптации в этот раз не
 * будет, и клиент повторяет запрос с ответами. Кругов не больше двух — предел
 * проверяется здесь, до запроса, чтобы человек не ждал ответа ради «больше не
 * спросим».
 *
 * Уточнения самой заготовки устроены иначе (`content-factory-next-m2eg`).
 * Заготовка уже существует — её записал вход, до всяких вопросов, — поэтому
 * тупика нет и предел кругов держит только сервер: экрану нечего беречь от
 * лишнего запроса, а «ничего не изменилось» — законный исход. Вопросы
 * приезжают в брифе заготовки, ответ идёт дверью `answer`, и после него
 * страница перечитывается целиком.
 *
 * Удаление адаптации опубликованного поста отказывается кодом
 * `ADAPTATION_PUBLISHED`, и отказ печатается словами: происхождение
 * опубликованного текста не стирается.
 *
 * «В архив» — единственное действие страницы, которое ничего не пишет и
 * ничего не удаляет: заготовка исчезает из списка, посты остаются. Поэтому
 * подтверждения нет, а после успеха страница перечитывает заготовку и сама
 * показывает состояние «в архиве» — вместо того чтобы рисовать его по памяти
 * о собственном нажатии.
 */

export function PieceContainer({
  pieceId,
  /** Площадка из адреса: нажатая пустая клетка приводит сюда уже с выбором. */
  adaptPlatform,
}: {
  pieceId: string;
  adaptPlatform?: string;
}) {
  const request = useFetch();
  const t = useT();
  const { language } = useVariables();
  const locale = resolveContentLocale(language);
  const w = piecesCopy[locale];

  const user = useUser();
  const canWrite = writeRightFromRole(user?.role).allowed;

  const url = PIECES_API.detail(pieceId);
  const detail = useSWR(
    url,
    async () => {
      const response = await request(url);
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(
          (body && typeof body.message === 'string' && body.message) ||
            'piece unavailable'
        );
      }
      return readPieceDetail(await response.json());
    },
    { revalidateOnFocus: false }
  );

  const openPost = useOpenPost();

  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  const [questions, setQuestions] = useState<readonly PieceQuestionV1[]>([]);
  const [rounds, setRounds] = useState(0);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [kind, setKind] = useState<AdaptationKindV1>('post');
  const [draft, setDraft] = useState<{ text: string; platform?: string } | null>(
    null
  );
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /*
    Уточнения волны `content-factory-next-m2eg`. Открытые вопросы приезжают в
    брифе заготовки, поэтому первый их источник — сама страница, а не стрим;
    ответ дверью `answer` присылает следующий круг или не присылает ничего, и
    тогда спрашивать больше нечего.
  */
  const [answering, setAnswering] = useState(false);
  const [asked, setAsked] = useState<readonly IntakeQuestionV1[] | null>(null);

  const abort = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      abort.current?.abort();
      abort.current = null;
    },
    []
  );

  const run = useCallback(
    async (input: {
      integrationId: string;
      kind: AdaptationKindV1;
      answers?: readonly PieceAnswerInputV1[];
      decideKeys?: readonly PieceQuestionKeyV1[];
      skipInterview?: boolean;
    }) => {
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;

      setBusy(true);
      setFailure(null);
      setNotice(null);
      setQuestions([]);
      setStep('started');

      try {
        const response = await request(PIECES_API.adapt(pieceId), {
          method: 'POST',
          signal: controller.signal,
          body: JSON.stringify(buildAdaptPayload(input)),
        });

        if (!response.ok || !response.body) {
          const body = await response.json().catch(() => null);
          setFailure(
            (body && typeof body.message === 'string' && body.message) ||
              w.errorBody
          );
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let sawQuestions = false;
        let sawAdaptation = false;
        let sawError = false;

        const splitter = createNdjsonSplitter((line) => {
          const reading = readAdaptEvent(line);
          if (!reading) return;
          if (reading.kind === 'step') {
            setStep(reading.name);
            return;
          }
          const event = reading.event;
          switch (event.name) {
            case 'adapt-started':
              setStep('started');
              break;
            case 'questions':
              sawQuestions = true;
              setQuestions(event.questions);
              setRounds((current) => current + 1);
              setStep(null);
              break;
            case 'adaptation':
              sawAdaptation = true;
              setDraft({
                text: event.content.map((one) => one.content).join('\n\n'),
                platform: event.adaptation.platform,
              });
              break;
            case 'error':
              sawError = true;
              setFailure(event.message);
              break;
            default:
              break;
          }
        });

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          splitter.push(decoder.decode(value, { stream: true }));
        }
        splitter.finish();

        /*
          Общее «попробуйте ещё раз» — только когда сервер не сказал ничего
          своего. Строка `error` несёт причину словами, и затирать её общей
          фразой значит потерять единственное объяснение, которое было.
        */
        if (!sawQuestions && !sawAdaptation && !sawError) {
          setFailure(w.errorBody);
        }
        if (sawAdaptation) void detail.mutate();
      } catch (error) {
        if ((error as { name?: string } | null)?.name === 'AbortError') return;
        setFailure(
          error instanceof PieceContractError ? error.message : w.errorBody
        );
      } finally {
        setBusy(false);
        setStep(null);
      }
    },
    [detail, pieceId, request, w]
  );

  const adapt = useCallback(
    (integrationId: string, nextKind: AdaptationKindV1) => {
      setChannelId(integrationId);
      setKind(nextKind);
      setRounds(0);
      setDraft(null);
      void run({ integrationId, kind: nextKind });
    },
    [run]
  );

  const answer = useCallback(
    (
      answers: readonly { key: string; text: string; origin: 'person' | 'confirmed' }[],
      decideKeys: readonly string[]
    ) => {
      if (!channelId) return;
      // Третий круг не начинается: предел решения владельца проверяется до
      // запроса, а не в ожидании ответа.
      if (rounds >= PIECE_MAX_INTERVIEW_ROUNDS) {
        setQuestions([]);
        setNotice(w.interviewExhausted);
        void run({ integrationId: channelId, kind, skipInterview: true });
        return;
      }
      void run({
        integrationId: channelId,
        kind,
        answers: answers.map((one) => ({
          key: one.key as PieceQuestionKeyV1,
          text: one.text,
          origin: one.origin,
        })),
        decideKeys: decideKeys as PieceQuestionKeyV1[],
      });
    },
    [channelId, kind, rounds, run, w]
  );

  const skipInterview = useCallback(() => {
    if (!channelId) return;
    void run({ integrationId: channelId, kind, skipInterview: true });
  }, [channelId, kind, run]);

  /* ---------------------------------------------------------------------
   * Уточнения заготовки
   * ------------------------------------------------------------------ */

  /**
   * Ответ на открытые вопросы: суть переписывается, страница перечитывается.
   *
   * Тупика здесь нет ни на каком круге — заготовка уже существует, и худшее,
   * что может случиться, это «ничего не изменилось». Поэтому предел кругов
   * держит сервер, а экран его не дублирует: ему нечего беречь от лишнего
   * запроса, кроме одного вызова модели, о котором сервер знает лучше.
   *
   * Два события, и оба уже умеет читать раздел: `questions` разбирает тот же
   * `readQuestions`, что и стрим входа, а `piece` несёт только идентификатор —
   * саму заготовку страница всё равно перечитывает целиком.
   */
  const answerQuestions = useCallback(
    async (
      given: readonly { field: BriefField; text: string }[],
      decide: readonly BriefField[]
    ) => {
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;

      setAnswering(true);
      setFailure(null);
      setNotice(null);
      try {
        const response = await request(PIECE_ROUTES.answer.path(pieceId), {
          method: 'POST',
          signal: controller.signal,
          body: JSON.stringify({
            ...(given.length ? { answers: [...given] } : {}),
            ...(decide.length ? { decide: [...decide] } : {}),
          }),
        });

        if (!response.ok || !response.body) {
          const body = await response.json().catch(() => null);
          setFailure(
            (body && typeof body.message === 'string' && body.message) ||
              w.clarifyFailed
          );
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let next: readonly IntakeQuestionV1[] = [];
        let sawError = false;

        const splitter = createNdjsonSplitter((line) => {
          if (!line.trim()) return;
          let parsed: any = null;
          try {
            parsed = JSON.parse(line);
          } catch {
            return;
          }
          if (parsed?.error === true || parsed?.name === 'error') {
            sawError = true;
            setFailure(
              typeof parsed.message === 'string' && parsed.message
                ? parsed.message
                : w.clarifyFailed
            );
            return;
          }
          if (parsed?.name === 'questions') {
            next = readQuestions(parsed.questions);
          }
        });

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          splitter.push(decoder.decode(value, { stream: true }));
        }
        splitter.finish();
        if (sawError) return;

        // Пустой список — это «спрашивать больше нечего», и он тоже ответ:
        // карточка исчезает, а `null` вернул бы вопросы из брифа обратно.
        setAsked(next);
        setNotice(w.clarifyDone);
        void detail.mutate();
      } catch (error) {
        if ((error as { name?: string } | null)?.name === 'AbortError') return;
        setFailure(w.clarifyFailed);
      } finally {
        setAnswering(false);
      }
    },
    [detail, pieceId, request, w]
  );

  /** «Оставить как есть»: вопросы уходят с экрана и ничего не спрашивают. */
  const skipQuestions = useCallback(() => setAsked([]), []);

  /*
    «В архив»: одна дверь, одно перечитывание и никакого подтверждения.
    Архив прячет заготовку из списка и не трогает посты, включая
    опубликованные, — поэтому даже заготовка с опубликованной адаптацией
    уходит туда одним нажатием. Отказ двери (`PIECE_ARCHIVED` — она уже там)
    печатается той же полосой, что и все остальные отказы страницы.
  */
  const archive = useCallback(async () => {
    try {
      const response = await request(PIECES_API.archive(pieceId), {
        method: 'POST',
        // Тело обязательно: `PieceArchiveDto` требует `archived` без значения
        // по умолчанию, и запрос без тела дверь отклоняла как 400
        // (`content-factory-next-m2eg`, живой прогон 07.09.2026). Умолчания у
        // поля нет намеренно — «пустое тело значит убрать» это ровно та ошибка,
        // которой раздел не повторяет.
        body: JSON.stringify({ archived: true }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setFailure(
          (typeof body?.message === 'string' && body.message) || w.errorBody
        );
        return;
      }
      setFailure(null);
      setNotice(w.archiveDone);
      void detail.mutate();
    } catch {
      setFailure(w.errorBody);
    }
  }, [detail, pieceId, request, w]);

  const removeAdaptation = useCallback(
    async (adaptation: AdaptationV1) => {
      // Опубликованную дверь отказывает кодом `ADAPTATION_PUBLISHED`; экран
      // говорит это словами до запроса и не делает вида, что попытка была.
      if (adaptation.state === 'published') {
        setFailure(w.deleteRefusedPublished);
        return;
      }
      try {
        const response = await request(
          PIECES_API.deleteAdaptation(pieceId, adaptation.id),
          { method: 'DELETE' }
        );
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          setFailure(
            body?.code === 'ADAPTATION_PUBLISHED'
              ? w.deleteRefusedPublished
              : (typeof body?.message === 'string' && body.message) || w.errorBody
          );
          return;
        }
        void detail.mutate();
      } catch {
        setFailure(w.errorBody);
      }
    },
    [detail, pieceId, request, w]
  );

  /*
    Площадка из адреса. Нажатие на пустую клетку в таблице ведёт сюда с
    именем площадки, и страница сама выбирает её первый канал: человек уже
    сказал, куда хочет, и спрашивать это второй раз — лишний шаг.
  */
  useEffect(() => {
    if (!adaptPlatform || !detail.data || busy || draft) return;
    const target = detail.data.targets.find(
      (one) => one.platform === adaptPlatform && one.available
    );
    const channel = target?.channels[0];
    if (channel && !channelId) adapt(channel.id, target?.kinds[0] ?? 'post');
  }, [adapt, adaptPlatform, busy, channelId, detail.data, draft]);

  const state: VoiceScreenStateV1 = detail.error
    ? 'error'
    : !detail.data
    ? 'loading'
    : failure
    ? 'error'
    : busy || answering
    ? 'disabled'
    : detail.data.state;

  /*
    Что спросить: сначала то, что вернула дверь ответов, потом то, что лежит в
    брифе заготовки. `null` от двери не бывает — пустой список означает
    «спрашивать больше нечего», и он должен пересилить бриф, который экран уже
    перечитывает.
  */
  const openQuestions = asked ?? detail.data?.core?.questions?.items ?? [];

  const adaptingChannel = useMemo(() => {
    if (!channelId || !detail.data) return null;
    for (const target of detail.data.targets) {
      const channel = target.channels.find((one) => one.id === channelId);
      if (channel) return channel.name;
    }
    return null;
  }, [channelId, detail.data]);

  return (
    <PieceScreen
      locale={locale}
      state={state}
      detail={detail.data ?? null}
      canWrite={canWrite}
      busy={busy}
      step={step}
      questions={questions}
      draftText={draft?.text ?? null}
      draftPlatform={draft?.platform}
      adaptingChannel={busy ? adaptingChannel : null}
      errorMessage={
        failure ??
        (detail.error ? (detail.error as Error).message || w.pieceNotFound : undefined)
      }
      notice={answering ? w.clarifyBusy : notice}
      restrictedReason={t(
        'ai_allowance_unavailable',
        'AI is not available in this workspace yet.'
      )}
      readOnlyNote={
        canWrite ? undefined : (
          <ContentReadOnlyNote
            id="piece-read-only"
            surface="brief"
            refusal="role"
          >
            {w.restrictedBody}
          </ContentReadOnlyNote>
        )
      }
      questionsSlot={
        canWrite && openQuestions.length > 0 ? (
          <PieceQuestions
            locale={locale}
            questions={openQuestions}
            busy={answering}
            onAnswer={(given, decide) => void answerQuestions(given, decide)}
            onSkip={skipQuestions}
          />
        ) : undefined
      }
      onAdapt={adapt}
      onArchive={() => void archive()}
      onAnswer={answer}
      onSkipInterview={skipInterview}
      onCancel={() => {
        abort.current?.abort();
        abort.current = null;
        setBusy(false);
        setStep(null);
      }}
      onOpenPost={(adaptation) => {
        if (adaptation.postId) void openPost(adaptation.postId);
      }}
      onDeleteAdaptation={(adaptation) => void removeAdaptation(adaptation)}
      onOpenEditor={() => {
        const postId = detail.data?.adaptations.find(
          (one) => one.integrationId === channelId
        )?.postId;
        if (postId) void openPost(postId);
      }}
      onRetry={() => {
        setFailure(null);
        void detail.mutate();
      }}
    />
  );
}

export default PieceContainer;
