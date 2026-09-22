'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FC,
} from 'react';
import useSWR from 'swr';
import dayjs from 'dayjs';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { useUser } from '../../layout/user.context';
import { createNdjsonSplitter } from '../../new-launch/ndjson';
import { DatePicker } from '../../launches/helpers/date.picker';
import { AVATAR_ROUTES, mapAvatars } from '../../brand-voice/voice-avatars.adapter';
import { readVoice } from '../../brand-voice/voice-profile.adapter';
import {
  ContentReadOnlyNote,
  writeRightFromRole,
} from '../content-write-right';
import { resolveContentLocale } from '../content-section.copy';
import { SuggestedQuestionsCard } from '../intake/questions.card';
import type { CoreAnswerFeedback } from './core-answer-diff';
import { AdaptationReview, CORE_REVIEW_ACTIONS } from './adaptation-review';
import { PieceScreen } from './piece.screen';
import { PieceCoreTab } from './piece-core-tab';
import { PieceChannelTab, type AutosaveState } from './piece-channel-tab';
import { PieceQuestions } from './piece-questions';
import {
  PieceChannelProfile,
  useChannelWritingProfile,
} from './piece-channel-profile';
import { piecesCopy } from './pieces.copy';
import {
  DEFAULT_POST_BASELINE,
  PIECES_API,
  PIECE_MAX_INTERVIEW_ROUNDS,
  PIECE_TAB_CORE,
  PieceContractError,
  adaptOverrides,
  buildAdaptPayload,
  buildAdaptationPatch,
  buildSchedulePayload,
  calendarPath,
  channelOfTab,
  findSlotUrl,
  pieceTabPath,
  platformName,
  postBaselineOf,
  postOptionsFrom,
  readAdaptEvent,
  readAdaptationPatch,
  readPieceDetail,
  readPieceTab,
  readScheduleResult,
  readSlotDate,
  refusalMessage,
  rememberedProfilePayload,
  tabOfPlatform,
  workspaceChannels,
  type AdaptationImageV1,
  type AdaptationKindV1,
  type PieceAnswerInputV1,
  type PieceQuestionKeyV1,
  type PieceQuestionV1,
  type PieceWorkspaceV1,
  type PostOptionsBaselineV1,
  type PostOptionsV1,
  type VoiceScreenStateV1,
  type WorkspaceAdaptationV1,
} from './pieces.adapter';
import {
  readQualityChecks,
  readQuestions,
  type BriefField,
  type IntakeQuestionV1,
  type QualityChecksV1,
} from '../intake/intake.adapter';
import { writingProfileUrl } from '../intake/writing-profile.adapter';
import { PIECE_ROUTES } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';

/** Тишина, после которой ручная правка уходит в дверь. */
const AUTOSAVE_MS = 800;

/**
 * Рабочее место заготовки: чтение двери, стрим адаптации, правка, расписание.
 *
 * `content-factory-next-97dq.37`, вариант A. Экран рисует, контейнер
 * спрашивает: здесь все запросы страницы и все отказы, а вид вкладок живёт в
 * `piece.screen.tsx`, `piece-core-tab.tsx` и `piece-channel-tab.tsx`. Всё,
 * что уходит в новые двери и приходит из них, собирается и читается в
 * `pieces.adapter.ts` — там одно место выравнивания с бэкендом.
 *
 * Четыре решения, ради которых стоит прочитать этот файл.
 *
 * **Вкладка — в адресе.** `?tab=core|<integrationId>`; старый
 * `?adapt=<площадка>` ведёт во вкладку первого канала площадки. Смена вкладки
 * заменяет адрес, а не добавляет шаг истории: «Назад» уводит со страницы, а
 * не листает вкладки.
 *
 * **Правка сохраняется сама.** Через 800 мс тишины текст уходит `PATCH`-ем в
 * адаптацию и её черновой пост; перед расписанием несохранённое уходит
 * первым, а ряд проверок ждёт, пока правка не ляжет, — иначе проверка
 * читала бы с сервера другой текст, чем тот, что на экране.
 *
 * **Окно поста не открывается.** Ни одна ветка этой страницы не зовёт
 * `useOpenPost`: дата, картинка и отправка — здесь, в дверях заготовки.
 *
 * **Вопрос стрима терминален.** Событие `questions` значит «текста в этот раз
 * не будет»; ответ уходит вторым запросом, кругов не больше двух.
 */
export function PieceContainer({
  pieceId,
  initialTab,
  /** Площадка из старого адреса `?adapt=`. */
  adaptPlatform,
}: {
  pieceId: string;
  initialTab?: string;
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
  const detail = useSWR<PieceWorkspaceV1>(
    url,
    async () => {
      const response = await request(url);
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(refusalMessage(body) || 'piece unavailable');
      }
      return readPieceDetail(await response.json());
    },
    { revalidateOnFocus: false }
  );

  const avatarsQuery = useSWR(
    canWrite ? AVATAR_ROUTES.list : null,
    () => readVoice(request, AVATAR_ROUTES.list),
    { revalidateOnFocus: false }
  );
  const avatars = useMemo(
    () =>
      mapAvatars(avatarsQuery.data).avatars.map((avatar) => ({
        id: avatar.id,
        label: avatar.name ?? w.avatarUnnamed,
      })),
    [avatarsQuery.data, w]
  );

  /* ---- Вкладка ----------------------------------------------------------- */

  const [tab, setTab] = useState(() => readPieceTab(initialTab));
  const changeTab = useCallback(
    (next: string) => {
      setTab(next);
      if (typeof window !== 'undefined')
        window.history.replaceState(null, '', pieceTabPath(pieceId, next));
    },
    [pieceId]
  );

  /* ---- Стрим адаптации ---------------------------------------------------- */

  const [busy, setBusy] = useState(false);
  const [questions, setQuestions] = useState<readonly PieceQuestionV1[]>([]);
  const [rounds, setRounds] = useState(0);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [kind, setKind] = useState<AdaptationKindV1>('post');
  /*
    Текст свежей адаптации и то, что о нём известно, — одним состоянием:
    проверки и пробелы приезжают тем же событием, что и текст.
  */
  const [draft, setDraft] = useState<{
    adaptation: WorkspaceAdaptationV1;
    checks: QualityChecksV1;
    draftGaps: readonly unknown[];
  } | null>(null);
  const [reviewedSlop, setReviewedSlop] = useState<
    Record<string, { slopBefore: number; slopAfter: number }>
  >({});
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [answering, setAnswering] = useState(false);
  const [coreAnswer, setCoreAnswer] = useState<CoreAnswerFeedback | null>(null);
  const [asked, setAsked] = useState<readonly IntakeQuestionV1[] | null>(null);

  /* ---- Рабочее место канала ---------------------------------------------- */

  const [postOptions, setPostOptions] = useState<
    Record<string, PostOptionsV1>
  >({});
  const [chosenVersion, setChosenVersion] = useState<Record<string, string>>(
    {}
  );
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saves, setSaves] = useState<
    Record<string, { state: AutosaveState; at: string | null }>
  >({});
  const [when, setWhen] = useState<Record<string, Date>>({});
  const [scheduleBusy, setScheduleBusy] = useState<{
    id: string;
    kind: 'schedule' | 'now' | 'unschedule' | 'delete';
  } | null>(null);
  /*
    Адрес картинки, выбранной в медиатеке: дверь адаптации возвращает только
    её идентификатор, а миниатюра нужна сейчас, а не после перезагрузки.
  */
  const [mediaPaths, setMediaPaths] = useState<Record<string, string>>({});
  /*
    Медиатека — тяжёлое дерево, и приезжает она по нажатию «картинка», а не
    при загрузке страницы: тот же приём, каким окно поста грузит редактор.
    Открывает её общий `useOpenMediaBox`, другого пути в медиатеку нет.
  */
  const [picker, setPicker] = useState<{
    adaptationId: string;
    useOpen: MediaOpenerHook;
  } | null>(null);
  const pickImage = useCallback(async (adaptationId: string) => {
    try {
      const media = await import('../../media/media.component');
      setPicker({ adaptationId, useOpen: media.useOpenMediaBox });
    } catch {
      setScheduleError((current) => ({
        ...current,
        [adaptationId]: w.imageFailed,
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [scheduleError, setScheduleError] = useState<Record<string, string>>(
    {}
  );
  const [remember, setRemember] = useState<
    Record<string, 'idle' | 'saving' | 'saved' | 'failed'>
  >({});

  const abort = useRef<AbortController | null>(null);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const pending = useRef<Record<string, string>>({});
  const latestRequest = useRef(request);
  latestRequest.current = request;
  useEffect(
    () => () => {
      abort.current?.abort();
      abort.current = null;
      for (const timer of Object.values(timers.current)) clearTimeout(timer);
      /*
        Ушли со страницы раньше, чем правка легла: несохранённое уходит сразу,
        без ответа — экрана, которому его показать, уже нет.
      */
      for (const [id, text] of Object.entries(pending.current))
        void latestRequest
          .current(PIECES_API.adaptation(pieceId, id), {
            method: 'PATCH',
            body: JSON.stringify(buildAdaptationPatch({ body: text })),
          })
          .catch(() => undefined);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  /*
    Свежая адаптация, которой перечитанная заготовка ещё не знает, стоит в
    списке сразу: стрим прислал её раньше, чем дверь заготовки.
  */
  const data: PieceWorkspaceV1 | null = useMemo(() => {
    if (!detail.data) return null;
    if (
      draft &&
      !detail.data.adaptations.some((one) => one.id === draft.adaptation.id)
    )
      return {
        ...detail.data,
        adaptations: [...detail.data.adaptations, draft.adaptation],
      };
    return detail.data;
  }, [detail.data, draft]);

  const channels = useMemo(
    () => (data ? workspaceChannels(data) : []),
    [data]
  );

  // Старый адрес `?adapt=<площадка>` — во вкладку первого канала площадки.
  useEffect(() => {
    if (!adaptPlatform || tab !== PIECE_TAB_CORE || !channels.length) return;
    const found = tabOfPlatform(channels, adaptPlatform);
    if (found) changeTab(found);
    // Только при первом знании каналов: дальше вкладку выбирает человек.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adaptPlatform, channels.length]);

  const activeChannel = channelOfTab(channels, tab);
  const activeAdaptation: WorkspaceAdaptationV1 | null = activeChannel
    ? activeChannel.adaptations.find(
        (one) => one.id === chosenVersion[activeChannel.id]
      ) ??
      activeChannel.adaptations[0] ??
      null
    : null;

  const profile = useChannelWritingProfile(
    activeChannel?.connected ? activeChannel.id : null
  );
  /*
    Как решено для канала — от этого считается «Для этого поста». Профиль
    читается для открытой вкладки; адаптация, начатая из «Сути» до его
    ответа, идёт без переопределений — сервер сам разрешит цепочку.
  */
  const baselineOf = useCallback(
    (integrationId: string): PostOptionsBaselineV1 =>
      profile.data && activeChannel?.id === integrationId
        ? postBaselineOf(profile.data.profile)
        : DEFAULT_POST_BASELINE,
    [activeChannel?.id, profile.data]
  );
  const optionsOf = useCallback(
    (integrationId: string): PostOptionsV1 =>
      postOptions[integrationId] ??
      postOptionsFrom(baselineOf(integrationId)),
    [baselineOf, postOptions]
  );
  const slotKey =
    activeChannel?.connected &&
    activeAdaptation &&
    (activeAdaptation.state === 'draft' || activeAdaptation.state === 'error')
      ? findSlotUrl(activeChannel.id)
      : null;
  const slot = useSWR(
    slotKey,
    async () => {
      const response = await request(slotKey as string);
      if (!response.ok) return null;
      return readSlotDate(await response.json());
    },
    { revalidateOnFocus: false }
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

      try {
        const response = await request(PIECES_API.adapt(pieceId), {
          method: 'POST',
          signal: controller.signal,
          body: JSON.stringify(
            buildAdaptPayload({
              ...input,
              overrides: adaptOverrides(
                optionsOf(input.integrationId),
                baselineOf(input.integrationId)
              ),
            })
          ),
        });

        if (!response.ok || !response.body) {
          const body = await response.json().catch(() => null);
          setFailure(refusalMessage(body) || w.errorBody);
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let sawQuestions = false;
        let sawAdaptation = false;
        let sawError = false;

        const splitter = createNdjsonSplitter((line) => {
          const reading = readAdaptEvent(line);
          if (!reading || reading.kind === 'step') return;
          const event = reading.event;
          switch (event.name) {
            case 'questions':
              sawQuestions = true;
              setQuestions(event.questions);
              setRounds((current) => current + 1);
              break;
            case 'adaptation':
              sawAdaptation = true;
              setDraft({
                adaptation: event.adaptation,
                checks: readQualityChecks(event.checks),
                draftGaps: event.draftGaps ?? [],
              });
              setChosenVersion((current) => ({
                ...current,
                [input.integrationId]: event.adaptation.id,
              }));
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
          своего: строка `error` несёт причину словами.
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
      }
    },
    [baselineOf, detail, optionsOf, pieceId, request, w]
  );

  const adapt = useCallback(
    (integrationId: string, nextKind: AdaptationKindV1) => {
      setChannelId(integrationId);
      setKind(nextKind);
      setRounds(0);
      void run({ integrationId, kind: nextKind });
    },
    [run]
  );

  const answer = useCallback(
    (
      answers: readonly {
        key: string;
        text: string;
        origin: 'person' | 'confirmed';
      }[],
      decideKeys: readonly string[]
    ) => {
      if (!channelId) return;
      // Третий круг не начинается: предел проверяется до запроса.
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

  /* ---- Уточнения заготовки ----------------------------------------------- */

  /**
   * Ответ на открытые вопросы: суть переписывается, страница перечитывается.
   * Предел кругов держит сервер: заготовка уже существует, и худший исход —
   * «ничего не изменилось».
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
          setFailure(refusalMessage(body) || w.clarifyFailed);
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let next: readonly IntakeQuestionV1[] = [];
        let sawError = false;
        let receivedCore: CoreAnswerFeedback | null = null;

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
          if (
            parsed?.name === 'piece' &&
            typeof parsed.previousBody === 'string' &&
            typeof parsed.core?.text === 'string'
          ) {
            receivedCore = {
              previousBody: parsed.previousBody,
              body: parsed.core.text,
            };
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

        // Пустой список — «спрашивать больше нечего», и он пересиливает бриф.
        setAsked(next);
        setCoreAnswer(receivedCore);
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

  /* ---- Заготовка целиком ------------------------------------------------- */

  /*
    «В архив»: одна дверь, одно перечитывание и никакого подтверждения —
    архив прячет заготовку из списка и не трогает постов.
  */
  const archive = useCallback(async () => {
    try {
      const response = await request(PIECES_API.archive(pieceId), {
        method: 'POST',
        // Тело обязательно: у `PieceArchiveDto` нет умолчания для `archived`.
        body: JSON.stringify({ archived: true }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setFailure(refusalMessage(body) || w.errorBody);
        return;
      }
      setFailure(null);
      setNotice(w.archiveDone);
      void detail.mutate();
    } catch {
      setFailure(w.errorBody);
    }
  }, [detail, pieceId, request, w]);

  /* Удаление заготовки (`97dq.30`): после успеха — в список. */
  const removePiece = useCallback(async () => {
    try {
      const response = await request(PIECES_API.delete(pieceId), {
        method: 'DELETE',
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setFailure(refusalMessage(body) || w.errorBody);
        return;
      }
      if (typeof window !== 'undefined')
        window.location.assign('/content?tab=materials');
    } catch {
      setFailure(w.errorBody);
    }
  }, [pieceId, request, w]);

  /* ---- Правка адаптации -------------------------------------------------- */

  /** Обновить адаптацию в кэше заготовки, не перечитывая её. */
  const patchCached = useCallback(
    (id: string, patch: Partial<WorkspaceAdaptationV1>) => {
      void detail.mutate(
        (current) =>
          current
            ? {
                ...current,
                adaptations: current.adaptations.map((one) =>
                  one.id === id ? { ...one, ...patch } : one
                ),
              }
            : current,
        { revalidate: false }
      );
    },
    [detail]
  );

  const saveBody = useCallback(
    async (id: string, text: string): Promise<boolean> => {
      delete pending.current[id];
      setSaves((current) => ({
        ...current,
        [id]: { state: 'saving', at: current[id]?.at ?? null },
      }));
      try {
        const response = await request(PIECES_API.adaptation(pieceId, id), {
          method: 'PATCH',
          body: JSON.stringify(buildAdaptationPatch({ body: text })),
        });
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(refusalMessage(body) ?? '');
        const saved = readAdaptationPatch(body);
        patchCached(id, {
          body: text,
          ...(saved?.checks ? { checks: saved.checks } : {}),
        });
        setSaves((current) => ({
          ...current,
          [id]: { state: 'saved', at: dayjs().format('HH:mm') },
        }));
        return true;
      } catch {
        setSaves((current) => ({
          ...current,
          [id]: { state: 'failed', at: current[id]?.at ?? null },
        }));
        return false;
      }
    },
    [patchCached, pieceId, request]
  );

  const changeBody = useCallback(
    (id: string, text: string) => {
      setEdits((current) => ({ ...current, [id]: text }));
      pending.current[id] = text;
      clearTimeout(timers.current[id]);
      timers.current[id] = setTimeout(() => {
        void saveBody(id, text);
      }, AUTOSAVE_MS);
    },
    [saveBody]
  );

  /** Несохранённое — сейчас: перед расписанием и повтором после отказа. */
  const flush = useCallback(
    async (id: string): Promise<boolean> => {
      clearTimeout(timers.current[id]);
      const text = pending.current[id] ?? null;
      if (text === null) return true;
      return saveBody(id, text);
    },
    [saveBody]
  );

  const setImage = useCallback(
    async (id: string, image: AdaptationImageV1 | null) => {
      if (image?.path)
        setMediaPaths((current) => ({ ...current, [image.id]: image.path }));
      try {
        const response = await request(PIECES_API.adaptation(pieceId, id), {
          method: 'PATCH',
          body: JSON.stringify(buildAdaptationPatch({ image })),
        });
        const body = await response.json().catch(() => null);
        if (!response.ok) {
          setScheduleError((current) => ({
            ...current,
            [id]: refusalMessage(body) || w.imageFailed,
          }));
          return;
        }
        const saved = readAdaptationPatch(body);
        patchCached(id, {
          image,
          mediaId: image?.id ?? null,
          ...(saved?.checks ? { checks: saved.checks } : {}),
        });
      } catch {
        setScheduleError((current) => ({ ...current, [id]: w.imageFailed }));
      }
    },
    [patchCached, pieceId, request, w]
  );

  const schedule = useCallback(
    async (adaptation: WorkspaceAdaptationV1, now: boolean, at: Date) => {
      setScheduleBusy({ id: adaptation.id, kind: now ? 'now' : 'schedule' });
      setScheduleError((current) => {
        const next = { ...current };
        delete next[adaptation.id];
        return next;
      });
      try {
        if (!(await flush(adaptation.id))) {
          setScheduleError((current) => ({
            ...current,
            [adaptation.id]: w.autosaveFailed,
          }));
          return;
        }
        const response = await request(
          PIECES_API.schedule(pieceId, adaptation.id),
          {
            method: 'POST',
            body: JSON.stringify(
              buildSchedulePayload(now ? { now: true } : { date: at })
            ),
          }
        );
        const body = await response.json().catch(() => null);
        if (!response.ok) {
          setScheduleError((current) => ({
            ...current,
            [adaptation.id]: refusalMessage(body) || w.scheduleFailed,
          }));
          return;
        }
        const result = readScheduleResult(body);
        setNotice(
          result.state === 'published' || now
            ? w.publishedDone
            : w.scheduledDone
        );
        void detail.mutate();
      } catch {
        setScheduleError((current) => ({
          ...current,
          [adaptation.id]: w.scheduleFailed,
        }));
      } finally {
        setScheduleBusy(null);
      }
    },
    [detail, flush, pieceId, request, w]
  );

  /** «Снять с расписания»: пост из очереди — обратно в черновик. */
  const unschedule = useCallback(
    async (adaptation: WorkspaceAdaptationV1) => {
      setScheduleBusy({ id: adaptation.id, kind: 'unschedule' });
      try {
        const response = await request(
          PIECES_API.unschedule(pieceId, adaptation.id),
          { method: 'POST' }
        );
        const body = await response.json().catch(() => null);
        if (!response.ok) {
          setScheduleError((current) => ({
            ...current,
            [adaptation.id]: refusalMessage(body) || w.scheduleFailed,
          }));
          return;
        }
        setNotice(w.unscheduledDone);
        void detail.mutate();
      } catch {
        setScheduleError((current) => ({
          ...current,
          [adaptation.id]: w.scheduleFailed,
        }));
      } finally {
        setScheduleBusy(null);
      }
    },
    [detail, pieceId, request, w]
  );

  const removeAdaptation = useCallback(
    async (adaptation: WorkspaceAdaptationV1) => {
      // Опубликованную дверь отказывает кодом `ADAPTATION_PUBLISHED`; экран
      // говорит это словами до запроса.
      if (adaptation.state === 'published') {
        setFailure(w.deleteRefusedPublished);
        return;
      }
      setScheduleBusy({ id: adaptation.id, kind: 'delete' });
      clearTimeout(timers.current[adaptation.id]);
      delete pending.current[adaptation.id];
      try {
        const response = await request(
          PIECES_API.deleteAdaptation(pieceId, adaptation.id),
          { method: 'DELETE' }
        );
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          setScheduleError((current) => ({
            ...current,
            [adaptation.id]:
              body?.code === 'ADAPTATION_PUBLISHED'
                ? w.deleteRefusedPublished
                : refusalMessage(body) || w.errorBody,
          }));
          return;
        }
        setDraft((current) =>
          current?.adaptation.id === adaptation.id ? null : current
        );
        setChosenVersion((current) => {
          const next = { ...current };
          for (const key of Object.keys(next))
            if (next[key] === adaptation.id) delete next[key];
          return next;
        });
        void detail.mutate();
      } catch {
        setFailure(w.errorBody);
      } finally {
        setScheduleBusy(null);
      }
    },
    [detail, pieceId, request, w]
  );

  const rememberForChannel = useCallback(
    async (integrationId: string) => {
      const current =
        activeChannel?.id === integrationId ? profile.data?.profile : null;
      if (!current) {
        setRemember((state) => ({ ...state, [integrationId]: 'failed' }));
        return;
      }
      setRemember((state) => ({ ...state, [integrationId]: 'saving' }));
      try {
        const response = await request(writingProfileUrl(integrationId), {
          method: 'PUT',
          body: JSON.stringify(
            rememberedProfilePayload(current, optionsOf(integrationId))
          ),
        });
        if (!response.ok) throw new Error('not remembered');
        setRemember((state) => ({ ...state, [integrationId]: 'saved' }));
        void profile.mutate();
      } catch {
        setRemember((state) => ({ ...state, [integrationId]: 'failed' }));
      }
    },
    [activeChannel?.id, optionsOf, profile, request]
  );

  /* ---- Что показать ------------------------------------------------------ */

  const state: VoiceScreenStateV1 = detail.error
    ? 'error'
    : !detail.data
    ? 'loading'
    : failure
    ? 'error'
    : busy || answering
    ? 'disabled'
    : detail.data.state;

  const openQuestions = asked ?? detail.data?.core?.questions?.items ?? [];

  const platformLabel = (platform: string, fallback?: string) =>
    platformName(platform, locale, fallback);

  const adaptingName =
    channels.find((one) => one.id === channelId)?.name ?? '';

  const channelQuestions = (id: string) =>
    questions.length > 0 && channelId === id ? (
      <div data-piece-channel-questions={id}>
        <SuggestedQuestionsCard
          words={{
            badge: w.interviewBadge,
            title: w.interviewTitle,
            lead: questions.some(
              (question) => (question.key as string) === 'takeaway'
            )
              ? w.interviewTakeawayLead
              : w.interviewChannelLead(adaptingName),
            suggestedLead: w.suggestedLead,
            yes: w.answerYes,
            fix: w.answerFix,
            decide: w.answerDecide,
            skip: w.answerSkip,
            ownAnswerLabel: w.ownAnswerLabel,
            ownAnswerHint: w.ownAnswerHint,
            ownOptionPlaceholder: w.ownOptionPlaceholder,
            send: w.interviewSend,
            skipAll: w.answerDecideAll,
            own: w.ownAnswer,
          }}
          questions={questions.map((question) => ({
            key: question.key,
            question: question.question,
            options: question.options,
            suggested: question.suggested,
            ...(question.why ? { why: question.why } : {}),
          }))}
          busy={busy}
          onSubmit={(given, decideKeys) =>
            answer(
              given.map((one) => ({
                key: one.key,
                text: one.text,
                origin: one.origin,
              })),
              decideKeys
            )
          }
          onSkipAll={skipInterview}
        />
      </div>
    ) : undefined;

  const coreTab = data ? (
    <PieceCoreTab
      locale={locale}
      detail={data}
      channels={channels}
      unavailable={data.targets.filter(
        (target) => !target.available || target.channels.length === 0
      )}
      canWrite={canWrite}
      busy={busy || answering}
      coreAnswer={coreAnswer}
      factSelectable={canWrite}
      onFactSelect={async (factKey, selected) => {
        const response = await request(`${url}/facts`, {
          method: 'PATCH',
          body: JSON.stringify({ factKey, selected }),
        });
        if (!response.ok) throw new Error('Fact selection failed');
        await detail.mutate();
      }}
      questionsSlot={
        canWrite && openQuestions.length > 0 ? (
          <PieceQuestions
            locale={locale}
            questions={openQuestions}
            busy={answering}
            onAnswer={(given, decide) => void answerQuestions(given, decide)}
            onSkip={() =>
              void answerQuestions(
                [],
                openQuestions.map((question) => question.field)
              )
            }
          />
        ) : undefined
      }
      actionRow={
        data.core?.text && canWrite ? (
          <AdaptationReview
            key="core"
            actions={CORE_REVIEW_ACTIONS}
            pieceId={pieceId}
            workspaceId={user?.orgId ?? ''}
            locale={locale}
            disabled={!canWrite || busy}
            onAccepted={() => {
              setCoreAnswer(null);
              void detail.mutate();
            }}
          />
        ) : null
      }
      onOpenChannel={changeTab}
      onAdaptChannel={(id) => {
        const channel = channels.find((one) => one.id === id);
        changeTab(id);
        adapt(id, channel?.kinds[0] ?? 'post');
      }}
    />
  ) : null;

  const renderChannelTab = (channel: (typeof channels)[number]) => {
    const adaptation =
      channel.adaptations.find(
        (one) => one.id === chosenVersion[channel.id]
      ) ??
      channel.adaptations[0] ??
      null;
    const fresh = adaptation && draft?.adaptation.id === adaptation.id;
    const body = adaptation ? edits[adaptation.id] ?? adaptation.body ?? '' : '';
    const dirty =
      !!adaptation &&
      edits[adaptation.id] !== undefined &&
      edits[adaptation.id] !== (adaptation.body ?? '');
    const save = adaptation ? saves[adaptation.id] : undefined;
    const options = optionsOf(channel.id);
    const image = adaptation?.image
      ? {
          ...adaptation.image,
          path: adaptation.image.path || mediaPaths[adaptation.image.id] || '',
        }
      : null;
    const label = platformLabel(channel.platform, channel.platformName);
    const at =
      (adaptation && when[adaptation.id]) ?? slot.data ?? new Date();
    const maxLength =
      channel.maxLength ??
      (channel.id === activeChannel?.id
        ? profile.data?.provider.maxLength || null
        : null);

    return (
      <PieceChannelTab
        key={channel.id}
        locale={locale}
        channel={channel}
        platformLabel={label}
        adaptation={adaptation}
        canWrite={canWrite}
        adapting={busy && channelId === channel.id}
        adaptingLabel={w.adaptingFor(channel.name)}
        questionsSlot={channelQuestions(channel.id)}
        body={body}
        onBodyChange={(text) => adaptation && changeBody(adaptation.id, text)}
        saveState={save?.state ?? 'idle'}
        savedAt={save?.at ?? null}
        onRetrySave={() =>
          adaptation && void saveBody(adaptation.id, body)
        }
        maxLength={maxLength}
        image={image}
        onPickImage={
          adaptation ? () => void pickImage(adaptation.id) : undefined
        }
        onRemoveImage={
          adaptation ? () => void setImage(adaptation.id, null) : undefined
        }
        checks={fresh ? draft?.checks : adaptation?.checks}
        draftGaps={fresh ? draft?.draftGaps : null}
        slopChange={adaptation ? reviewedSlop[adaptation.id] ?? null : null}
        actionRow={
          adaptation && adaptation.postId ? (
            <AdaptationReview
              key={`${user?.orgId}:${pieceId}:${adaptation.id}`}
              pieceId={pieceId}
              adaptationId={adaptation.id}
              workspaceId={user?.orgId ?? ''}
              locale={locale}
              disabled={
                !canWrite || busy || dirty || save?.state === 'saving'
              }
              onAccepted={(outcome) => {
                setDraft((current) =>
                  current?.adaptation.id === adaptation.id ? null : current
                );
                setEdits((current) => {
                  const next = { ...current };
                  delete next[adaptation.id];
                  return next;
                });
                if (outcome)
                  setReviewedSlop((current) => ({
                    ...current,
                    [adaptation.id]: outcome,
                  }));
                void detail.mutate();
              }}
            />
          ) : null
        }
        postOptions={options}
        postBaseline={baselineOf(channel.id)}
        avatars={avatars}
        onPostOptionsChange={(next) =>
          setPostOptions((current) => ({ ...current, [channel.id]: next }))
        }
        rememberState={remember[channel.id] ?? 'idle'}
        onRemember={() => void rememberForChannel(channel.id)}
        channelProfile={
          channel.connected ? (
            <PieceChannelProfile
              locale={locale}
              id={channel.id}
              name={channel.name}
              canWrite={canWrite}
            />
          ) : null
        }
        when={
          adaptation ? (
            <DatePicker
              date={dayjs(at)}
              disabled={!canWrite || scheduleBusy !== null}
              onChange={(next) =>
                setWhen((current) => ({
                  ...current,
                  [adaptation.id]: next.toDate(),
                }))
              }
            />
          ) : null
        }
        scheduleBusy={
          adaptation && scheduleBusy?.id === adaptation.id
            ? scheduleBusy.kind
            : null
        }
        scheduleError={adaptation ? scheduleError[adaptation.id] : null}
        calendarHref={calendarPath(adaptation?.date, channel.connected ? channel.id : null)}
        onSelectAdaptation={(id) =>
          setChosenVersion((current) => ({ ...current, [channel.id]: id }))
        }
        onAdapt={(nextKind) => adapt(channel.id, nextKind)}
        onCancelAdapt={() => {
          abort.current?.abort();
          abort.current = null;
          setBusy(false);
        }}
        onSchedule={() => adaptation && void schedule(adaptation, false, at)}
        onPublishNow={() => adaptation && void schedule(adaptation, true, at)}
        onUnschedule={() => adaptation && void unschedule(adaptation)}
        onDelete={() => adaptation && void removeAdaptation(adaptation)}
      />
    );
  };

  return (
    <>
      {picker ? (
        <OpenMediaOnce
          key={picker.adaptationId}
          useOpen={picker.useOpen}
          onSelect={(media) => {
            const first = media[0];
            if (first)
              void setImage(picker.adaptationId, {
                id: first.id,
                path: first.path,
              });
          }}
          onOpened={() => setPicker(null)}
        />
      ) : null}
    <PieceScreen
      locale={locale}
      state={state}
      detail={data}
      channels={channels}
      tab={tab}
      canWrite={canWrite}
      busy={busy || answering}
      coreTab={coreTab}
      renderChannelTab={renderChannelTab}
      errorMessage={
        failure ??
        (detail.error
          ? (detail.error as Error).message || w.pieceNotFound
          : undefined)
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
      onTabChange={changeTab}
      onTitleSave={async (title) => {
        const response = await request(url, {
          method: 'PATCH',
          body: JSON.stringify({ title }),
        });
        if (!response.ok) throw new Error('Title update failed');
        await detail.mutate();
      }}
      onArchive={() => void archive()}
      onDelete={() => void removePiece()}
      onRetry={() => {
        setFailure(null);
        void detail.mutate();
      }}
    />
    </>
  );
}

type MediaOpenerHook = () => (
  onSelect: (media: { id: string; path: string }[]) => void,
  options?: { type?: 'image' | 'video' }
) => void;

/**
 * Открывает медиатеку один раз и уходит.
 *
 * Хук приезжает вместе с медиатекой по нажатию, а хук можно звать только
 * из компонента — поэтому он живёт здесь, пока окно не открыто.
 */
const OpenMediaOnce: FC<{
  useOpen: MediaOpenerHook;
  onSelect: (media: { id: string; path: string }[]) => void;
  onOpened: () => void;
}> = ({ useOpen, onSelect, onOpened }) => {
  const open = useOpen();
  useEffect(() => {
    open(onSelect, { type: 'image' });
    onOpened();
    // Один раз на монтирование: ключ — адаптация, для которой выбирают.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
};

export default PieceContainer;
