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
/** Тишина, после которой ручная правка уходит в дверь (общая с `useAutosave`). */
import { AUTOSAVE_MS } from '../../ui/use-autosave';
import { PieceQuestions, type PieceQuestionReply } from './piece-questions';
import { PostLinkQuestion } from '../intake/post-link.question';
import { useChannelWritingProfile } from './piece-channel-profile';
import type { SaveStateV1 } from './post-options.panel';
import type { ScheduleBusy } from './schedule-bar';
import { piecesCopy } from './pieces.copy';
import {
  DEFAULT_POST_BASELINE,
  DEFAULT_POST_OPTIONS,
  PIECES_API,
  PIECE_MAX_INTERVIEW_ROUNDS,
  PIECE_TAB_CORE,
  PieceContractError,
  adaptOverrides,
  buildAdaptPayload,
  buildAdaptationPatch,
  buildPostSettingsPayload,
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
  readPieceWhen,
  readPostSettingsResponse,
  readScheduleResult,
  readSlotDate,
  refusalMessage,
  refusalCode,
  EDIT_CLOSED_CODES,
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
  type PlanModeWordV1,
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
import {
  channelPlanModeUrl,
} from '../intake/channel-plan-mode';
import {
  isInterviewAskKey,
  PIECE_ROUTES,
} from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';

/** Время, которое версия держит в календаре канала: бронь или очередь. */
function plannedDateOf(adaptation: {
  plan?: { status: string; date: string | null; current: boolean };
}): Date | null {
  const plan = adaptation.plan;
  if (!plan || !plan.date || !plan.current || plan.status === 'draft') return null;
  const at = new Date(plan.date);
  return Number.isNaN(at.getTime()) ? null : at;
}

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
  /** `?when=` — дата слота календаря для черновика вкладки `initialTab` (`97dq.50`). */
  initialWhen,
}: {
  pieceId: string;
  initialTab?: string;
  adaptPlatform?: string;
  initialWhen?: string;
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
  /** «Изменить» у ссылки для поста: вопрос открыт снова (`97dq.75`). */
  const [linkEditing, setLinkEditing] = useState(false);

  /* ---- Рабочее место канала ---------------------------------------------- */

  const [postOptions, setPostOptions] = useState<
    Record<string, PostOptionsV1>
  >({});
  const [chosenVersion, setChosenVersion] = useState<Record<string, string>>(
    {}
  );
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saves, setSaves] = useState<
    Record<
      string,
      {
        state: AutosaveState;
        at: string | null;
        message?: string | null;
        /** Повтор имеет смысл: отказ не закрыл правку насовсем. */
        retry?: boolean;
      }
    >
  >({});
  const [when, setWhen] = useState<Record<string, Date>>({});
  // Слот, выбранный в календаре: только для канала, во вкладку которого вели.
  const [slotWhen] = useState(() => ({
    channel: readPieceTab(initialTab),
    at: readPieceWhen(initialWhen),
  }));
  const [scheduleBusy, setScheduleBusy] = useState<{
    id: string;
    kind: ScheduleBusy;
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
  const [remember, setRemember] = useState<Record<string, SaveStateV1>>({});
  /*
    Настройки поста (`97dq.70`): каждое изменение уходит само через ту же
    тишину, что правка текста; режим плана — сразу. Своё значение режима
    держится здесь до ответа двери, чтобы выбор не мигал назад.
  */
  const [settingsSaves, setSettingsSaves] = useState<
    Record<string, { state: SaveStateV1; at: string | null }>
  >({});
  const [planOverrides, setPlanOverrides] = useState<
    Record<string, PlanModeWordV1 | null>
  >({});
  const [textChangedAt, setTextChangedAt] = useState<Record<string, string>>(
    {}
  );
  const settingsTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>(
    {}
  );
  /*
    Поля поста, ещё не ушедшие в дверь (ревью `97dq.70`, P2): смена режима
    берёт их с собой, уход со страницы отправляет их сразу.
  */
  const pendingSettings = useRef<Record<string, PostOptionsV1>>({});
  /** Режим плана в полёте: второй выбор ждёт ответа на первый. */
  const [planBusy, setPlanBusy] = useState<Record<string, boolean>>({});
  const planInFlight = useRef<Record<string, boolean>>({});

  const abort = useRef<AbortController | null>(null);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const pending = useRef<Record<string, string>>({});
  /*
    Одна запись текста на адаптацию за раз (ревью `97dq.80`, P2-2): следующая
    ждёт предыдущую, поэтому сервер получает правки в том порядке, в каком
    их писали, а ответ устаревшей записи экран не слушает.
  */
  const saveChain = useRef<Record<string, Promise<unknown>>>({});
  const saveTicket = useRef<Record<string, number>>({});
  const latestRequest = useRef(request);
  latestRequest.current = request;
  useEffect(
    () => () => {
      abort.current?.abort();
      abort.current = null;
    },
    []
  );
  /*
    Ушли со страницы — или на другую заготовку в том же экране — раньше, чем
    правка легла: несохранённое уходит сразу, без ответа, и уходит в ту
    заготовку, где его написали (второе ревью, пункт 8): очистка держит свой
    `pieceId`, а не первый, с которым экран открылся.
  */
  useEffect(() => {
    const ownPiece = pieceId;
    return () => {
      for (const timer of Object.values(timers.current)) clearTimeout(timer);
      for (const timer of Object.values(settingsTimers.current))
        clearTimeout(timer);
      timers.current = {};
      settingsTimers.current = {};
      for (const [integrationId, options] of Object.entries(
        pendingSettings.current
      ))
        void latestRequest
          .current(PIECES_API.postSettings(ownPiece, integrationId), {
            method: 'PUT',
            body: JSON.stringify(buildPostSettingsPayload({ options })),
          })
          .catch(() => undefined);
      for (const [id, text] of Object.entries(pending.current))
        void latestRequest
          .current(PIECES_API.adaptation(ownPiece, id), {
            method: 'PATCH',
            body: JSON.stringify(buildAdaptationPatch({ body: text })),
          })
          .catch(() => undefined);
      pendingSettings.current = {};
      pending.current = {};
    };
  }, [pieceId]);

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
    (integrationId: string): PostOptionsV1 => {
      if (postOptions[integrationId]) return postOptions[integrationId];
      // Сохранённые настройки поста (`97dq.70`) — с аватаром канала, если
      // своего у поста нет.
      const stored = channels.find((one) => one.id === integrationId)?.settings
        ?.options;
      const start = postOptionsFrom(baselineOf(integrationId));
      return stored
        ? {
            ...stored,
            brandProfileId: stored.brandProfileId ?? start.brandProfileId,
          }
        : start;
    },
    [baselineOf, channels, postOptions]
  );
  const slotKey =
    activeChannel?.connected &&
    activeAdaptation &&
    !plannedDateOf(activeAdaptation) &&
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
        answers: answers.map((one) => {
          // Вопрос модели едет с ответом (`97dq.44`): круга сервер не помнит.
          const asked = questions.find((question) => question.key === one.key);
          return {
            key: one.key as PieceQuestionKeyV1,
            text: one.text,
            origin: one.origin,
            ...(asked && isInterviewAskKey(asked.key)
              ? { question: asked.question }
              : {}),
          };
        }),
        decideKeys: decideKeys as PieceQuestionKeyV1[],
      });
    },
    [channelId, kind, questions, rounds, run, w]
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
      given: readonly PieceQuestionReply[],
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
    (id: string, text: string): Promise<boolean> => {
      delete pending.current[id];
      const ticket = (saveTicket.current[id] ?? 0) + 1;
      saveTicket.current[id] = ticket;
      const current = () => saveTicket.current[id] === ticket;
      setSaves((state) => ({
        ...state,
        [id]: { state: 'saving', at: state[id]?.at ?? null },
      }));
      const previous = saveChain.current[id];
      const STALE = Symbol('stale');
      const run = (async (): Promise<boolean | typeof STALE> => {
        if (previous) await previous.catch(() => undefined);
        // Пока ждали, написали новее: эта запись уже не нужна.
        if (!current()) return STALE;
        try {
          const response = await request(PIECES_API.adaptation(pieceId, id), {
            method: 'PATCH',
            body: JSON.stringify(buildAdaptationPatch({ body: text })),
          });
          const body = await response.json().catch(() => null);
          if (!response.ok)
            throw Object.assign(new Error(refusalMessage(body) ?? ''), {
              refusal: true,
              code: refusalCode(body),
            });
          if (!current()) return STALE;
          const saved = readAdaptationPatch(body);
          patchCached(id, {
            body: text,
            ...(saved?.checks ? { checks: saved.checks } : {}),
          });
          setSaves((state) => ({
            ...state,
            [id]: { state: 'saved', at: dayjs().format('HH:mm') },
          }));
          return true;
        } catch (error) {
          if (!current()) return STALE;
          /*
            Отказ сервера говорится его словами (`97dq.80`): пост в очереди,
            который уже уходит, не правится — и человек должен знать, что
            ушёл прежний текст, а не «попробуйте ещё раз». Такой отказ
            закрывает правку (ревью P2-4): несохранённый текст забывается,
            экран показывает то, что в посте, повтора нет.
          */
          const refused = error as {
            refusal?: boolean;
            code?: string | null;
            message?: string;
          } | null;
          const message =
            refused?.refusal && refused.message ? refused.message : null;
          const closed = Boolean(
            refused?.refusal && refused.code && EDIT_CLOSED_CODES.has(refused.code)
          );
          if (closed) {
            clearTimeout(timers.current[id]);
            delete pending.current[id];
            setEdits((state) => {
              const next = { ...state };
              delete next[id];
              return next;
            });
          }
          setSaves((state) => ({
            ...state,
            [id]: {
              state: 'failed',
              at: state[id]?.at ?? null,
              message,
              retry: !closed,
            },
          }));
          if (message) void detail.mutate();
          return false;
        }
      })();
      saveChain.current[id] = run;
      return run.then((result) =>
        result === STALE
          ? Promise.resolve(saveChain.current[id]).then((latest) => latest === true)
          : result
      );
    },
    [detail, patchCached, pieceId, request]
  );

  /*
    Черновик сохраняется сам после паузы. Пост в очереди — только по
    «Сохранить в пост» (ревью `97dq.80`, P2-2): полунабранная фраза не
    должна уйти в канал за минуту до слота.
  */
  const changeBody = useCallback(
    (id: string, text: string, queued = false) => {
      setEdits((state) => ({ ...state, [id]: text }));
      clearTimeout(timers.current[id]);
      if (queued) {
        delete pending.current[id];
        return;
      }
      pending.current[id] = text;
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
        // Черновик сохраняет прежнее время (`97dq.43`, п. 2): поле «Когда»
        // остаётся на нём, а не прыгает на следующий свободный слот канала.
        const held = plannedDateOf(adaptation);
        if (held) {
          setWhen((current) => ({ ...current, [adaptation.id]: held }));
        }
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

  /** Настройки поста — в дверь (`97dq.70`); режим плана применяется сразу. */
  const saveSettings = useCallback(
    async (
      integrationId: string,
      sent: {
        options?: PostOptionsV1;
        planMode?: PlanModeWordV1 | null;
        expectedChannelMode?: PlanModeWordV1;
      }
    ): Promise<false | ReturnType<typeof readPostSettingsResponse>> => {
      clearTimeout(settingsTimers.current[integrationId]);
      // То, что ждало тишины, уходит этим же запросом, а не пропадает.
      const waiting = pendingSettings.current[integrationId];
      delete pendingSettings.current[integrationId];
      const input = !sent.options && waiting ? { ...sent, options: waiting } : sent;
      setSettingsSaves((current) => ({
        ...current,
        [integrationId]: {
          state: 'saving',
          at: current[integrationId]?.at ?? null,
        },
      }));
      try {
        const response = await request(
          PIECES_API.postSettings(pieceId, integrationId),
          {
            method: 'PUT',
            body: JSON.stringify(buildPostSettingsPayload(input)),
          }
        );
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(refusalMessage(body) || 'not saved');
        const saved = readPostSettingsResponse(body);
        setSettingsSaves((current) => ({
          ...current,
          [integrationId]: { state: 'saved', at: dayjs().format('HH:mm') },
        }));
        if (saved.adaptation || input.planMode !== undefined)
          void detail.mutate();
        return saved;
      } catch {
        setSettingsSaves((current) => ({
          ...current,
          [integrationId]: {
            state: 'failed',
            at: current[integrationId]?.at ?? null,
          },
        }));
        /*
          Поля, что ехали с этим запросом, не теряются (второе ревью, пункт
          6): они снова ждут отправки — со следующей правкой, со следующим
          режимом или при уходе со страницы. Более новая правка важнее.
        */
        if (input.options && !pendingSettings.current[integrationId])
          pendingSettings.current[integrationId] = input.options;
        // Сервер мог успеть часть: страница перечитывается, а не гадает.
        if (input.planMode !== undefined) void detail.mutate();
        return false;
      }
    },
    [detail, pieceId, request]
  );

  /** Поля поста: сразу на экран, в дверь — после тишины. */
  const changePostOptions = useCallback(
    (integrationId: string, next: PostOptionsV1) => {
      const before = optionsOf(integrationId);
      setPostOptions((current) => ({ ...current, [integrationId]: next }));
      const textChanged = (
        ['length', 'emoji', 'hashtags', 'links', 'cta', 'brandProfileId', 'wish', 'link', 'linkText'] as const
      ).some((field) => before[field] !== next[field]);
      if (textChanged)
        setTextChangedAt((current) => ({
          ...current,
          [integrationId]: new Date().toISOString(),
        }));
      clearTimeout(settingsTimers.current[integrationId]);
      pendingSettings.current[integrationId] = next;
      settingsTimers.current[integrationId] = setTimeout(() => {
        void saveSettings(integrationId, { options: next });
      }, AUTOSAVE_MS);
    },
    [optionsOf, saveSettings]
  );

  /**
   * «План» поста: свой режим или снова как в канале — сразу.
   *
   * «Как в канале» (`content-factory-next-97dq.86`) уходит вместе с режимом
   * канала, который показывало поле (ревью W1 пятнадцатого захода, F10).
   * Решает сервер под замком канала: режим канала тот же — пост «как в
   * канале»; уже другой (прод 24.09.2026: канал на «Автопилоте», пост после
   * «Бронь» остался в очереди) — пишется выбор человека явно. Проверка на
   * странице перед сохранением оставляла окно, в котором другая вкладка
   * успевала переключить канал. Поле берёт то, что сервер сохранил.
   */
  const changePostPlan = useCallback(
    async (
      integrationId: string,
      picked: PlanModeWordV1 | null,
      /** Режим канала, который показывало поле, когда выбор стал `null`. */
      shownChannel?: PlanModeWordV1
    ) => {
      if (planInFlight.current[integrationId]) return;
      planInFlight.current[integrationId] = true;
      setPlanBusy((current) => ({ ...current, [integrationId]: true }));
      setPlanOverrides((current) => ({ ...current, [integrationId]: picked }));
      const saved = await saveSettings(integrationId, {
        planMode: picked,
        ...(picked === null && shownChannel
          ? { expectedChannelMode: shownChannel }
          : {}),
      });
      planInFlight.current[integrationId] = false;
      setPlanBusy((current) => ({ ...current, [integrationId]: false }));
      if (!saved)
        setPlanOverrides((current) => {
          const rest = { ...current };
          delete rest[integrationId];
          return rest;
        });
      else if (saved.settings)
        setPlanOverrides((current) => ({
          ...current,
          [integrationId]: saved.settings!.planMode,
        }));
    },
    [saveSettings]
  );

  /** «Перенести»: запланированный пост — на время из «Когда». */
  const move = useCallback(
    async (adaptation: WorkspaceAdaptationV1, at: Date) => {
      setScheduleBusy({ id: adaptation.id, kind: 'move' });
      try {
        const response = await request(
          PIECES_API.place(pieceId, adaptation.id),
          {
            method: 'POST',
            body: JSON.stringify({ date: at.toISOString() }),
          }
        );
        const body = await response.json().catch(() => null);
        if (!response.ok) {
          setScheduleError((current) => ({
            ...current,
            [adaptation.id]: refusalMessage(body) || w.planMoveFailed,
          }));
          return;
        }
        void detail.mutate();
      } catch {
        setScheduleError((current) => ({
          ...current,
          [adaptation.id]: w.planMoveFailed,
        }));
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
        return false;
      }
      setRemember((state) => ({ ...state, [integrationId]: 'saving' }));
      const chosen = optionsOf(integrationId);
      try {
        const response = await request(writingProfileUrl(integrationId), {
          method: 'PUT',
          body: JSON.stringify(rememberedProfilePayload(current, chosen)),
        });
        if (!response.ok) throw new Error('not remembered');
        // Свой режим поста — тоже умолчание канала (для новых постов).
        const ownPlan =
          planOverrides[integrationId] !== undefined
            ? planOverrides[integrationId]
            : channels.find((one) => one.id === integrationId)?.settings
                ?.planMode ?? null;
        if (ownPlan) {
          const planned = await request(channelPlanModeUrl(integrationId), {
            method: 'PUT',
            body: JSON.stringify({ planMode: ownPlan }),
          });
          if (!planned.ok) throw new Error('plan mode not remembered');
        }
        setRemember((state) => ({ ...state, [integrationId]: 'saved' }));
        /*
          Запомненное стало решением канала: поля панели возвращаются к «как
          в канале», и рамка «изменено» больше не стоит на том, что канал
          теперь делает сам. Пожелание — слово к этому посту — остаётся.
        */
        const reset: PostOptionsV1 = {
          ...DEFAULT_POST_OPTIONS,
          brandProfileId: chosen.brandProfileId,
          wish: chosen.wish,
          // Ссылка и её слова — тоже только этого поста (`97dq.79`).
          link: chosen.link,
          linkText: chosen.linkText,
        };
        setPostOptions((state) => ({ ...state, [integrationId]: reset }));
        if (ownPlan)
          setPlanOverrides((state) => ({ ...state, [integrationId]: null }));
        // Пост снова «как в канале»: его переопределения ушли в канал.
        await saveSettings(integrationId, {
          options: reset,
          ...(ownPlan ? { planMode: null } : {}),
        });
        void profile.mutate();
        return true;
      } catch {
        setRemember((state) => ({ ...state, [integrationId]: 'failed' }));
        return false;
      }
    },
    [
      activeChannel?.id,
      channels,
      optionsOf,
      planOverrides,
      profile,
      request,
      saveSettings,
    ]
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
            lead: questions.some((question) => isInterviewAskKey(question.key))
              ? w.interviewAdaptLead(questions.length)
              : questions.some(
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

  /* ---- Ссылка для поста и правка заготовки (`97dq.75`) ------------------- */

  /**
   * Ответ на «Какую ссылку поставить в пост?»; `null` — «Без ссылки».
   * `text` — «Текст ссылки» (`97dq.79`), только с адресом.
   */
  const putPostLink = useCallback(
    async (link: string | null, text?: string): Promise<boolean> => {
      const response = await request(
        `${PIECES_API.postLink(pieceId)}?language=${locale}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            url: link,
            ...(link && text?.trim() ? { text: text.trim() } : {}),
          }),
        }
      );
      if (!response.ok) return false;
      setLinkEditing(false);
      return true;
    },
    [locale, pieceId, request]
  );
  /** Вопрос один, своей панелью: после записи страница перечитывается. */
  const answerPostLink = useCallback(
    async (link: string | null, text?: string): Promise<boolean> => {
      if (!(await putPostLink(link, text))) return false;
      await detail.mutate();
      return true;
    },
    [detail, putPostLink]
  );
  /*
    В карточке вопросов ссылка пишется перед ответами, и ответы не ждут
    перечитывания страницы (ревью `97dq.89`, F7): его делают сами ответы,
    когда допишут суть. Здесь — только чтобы строка ссылки не отстала.
  */
  const answerPostLinkInQuestions = useCallback(
    async (link: string | null, text?: string): Promise<boolean> => {
      if (!(await putPostLink(link, text))) return false;
      void detail.mutate();
      return true;
    },
    [detail, putPostLink]
  );

  /** Правка сути руками: `expected` — текст, который она заменяет. */
  const saveCore = useCallback(
    async (next: string, expected: string): Promise<boolean> => {
      const response = await request(
        `${PIECES_API.editCore(pieceId)}?language=${locale}`,
        { method: 'PUT', body: JSON.stringify({ text: next, expected }) }
      );
      if (!response.ok) {
        // Суть сменилась в другом окне: страница перечитывается.
        if (response.status === 409) void detail.mutate();
        return false;
      }
      setCoreAnswer(null);
      void detail.mutate();
      return true;
    },
    [detail, locale, pieceId, request]
  );

  /** «Дописать материал»: суть не меняется до «Пересобрать суть». */
  const addMaterial = useCallback(
    async (text: string): Promise<boolean> => {
      const response = await request(
        `${PIECES_API.appendMaterial(pieceId)}?language=${locale}`,
        { method: 'POST', body: JSON.stringify({ text }) }
      );
      if (!response.ok) return false;
      await detail.mutate();
      return true;
    },
    [detail, locale, pieceId, request]
  );

  /** «Пересобрать суть»: слово отказа или `null`, когда суть пересобрана. */
  const rebuildCore = useCallback(async (): Promise<string | null> => {
    const response = await request(
      `${PIECES_API.rebuildCore(pieceId)}?language=${locale}`,
      { method: 'POST' }
    );
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      return refusalMessage(body) || w.coreRebuildFailed;
    }
    setCoreAnswer(null);
    await detail.mutate();
    return null;
  }, [detail, locale, pieceId, request, w]);

  /** «Вернуть эту версию» (`97dq.85`): слово отказа или `null`. */
  const restoreCore = useCallback(
    async (
      index: number,
      replacedAt: string,
      expected: string
    ): Promise<string | null> => {
      const response = await request(
        `${PIECES_API.restoreCore(pieceId)}?language=${locale}`,
        {
          method: 'POST',
          body: JSON.stringify({ index, replacedAt, expected }),
        }
      );
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        if (response.status === 409) void detail.mutate();
        return refusalMessage(body) || w.coreVersionRestoreFailed;
      }
      setCoreAnswer(null);
      await detail.mutate();
      return null;
    },
    [detail, locale, pieceId, request, w]
  );

  const coreLink = data?.core?.postLink ?? null;
  const linkAsked = Boolean(
    canWrite && data?.core && (data.linkQuestion || linkEditing)
  );
  /*
    Вопросы открыты — ссылка стоит в их карточке и пишется той же «Дальше»
    (`97dq.89`); одна — своей панелью со своей «Дальше».
  */
  const linkInQuestions = linkAsked && canWrite && openQuestions.length > 0;
  const linkSlot =
    linkAsked && !linkInQuestions ? (
      <PostLinkQuestion
        key={coreLink ? `answered-${coreLink.url ?? 'none'}` : 'open'}
        locale={locale}
        initial={coreLink ? { url: coreLink.url, text: coreLink.text ?? '' } : null}
        onAnswer={answerPostLink}
        onKeep={coreLink ? () => setLinkEditing(false) : undefined}
      />
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
            link={
              linkInQuestions
                ? {
                    initial: coreLink
                      ? { url: coreLink.url, text: coreLink.text ?? '' }
                      : null,
                    onAnswer: answerPostLinkInQuestions,
                    ...(coreLink
                      ? { onKeep: () => setLinkEditing(false) }
                      : {}),
                  }
                : undefined
            }
            onAnswer={(given, decide) => void answerQuestions(given, decide)}
            onSkip={() =>
              void answerQuestions(
                [],
                // Вопрос о материале без ответа сервер отдаёт модели сам.
                openQuestions
                  .filter((question) => !question.key)
                  .map((question) => question.field)
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
      linkSlot={linkSlot}
      onChangeLink={canWrite ? () => setLinkEditing(true) : undefined}
      onCoreSave={canWrite ? saveCore : undefined}
      onMaterialAdd={canWrite ? addMaterial : undefined}
      onCoreRebuild={canWrite ? rebuildCore : undefined}
      onCoreRestore={canWrite ? restoreCore : undefined}
      onOpenChannel={changeTab}
      /*
        «Адаптировать для …» открывает вкладку и ничего не пишет (`97dq.78`,
        четырнадцатый заход, B2: «мы не можем делать настройки адаптации до
        адаптации»): настройки поста уже открыты, текст пишет их
        «Адаптировать».
      */
      onAdaptChannel={changeTab}
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
    // «Когда» — время, которое версия уже держит (бронь или очередь,
    // `97dq.57`), а не свободное время канала поверх него.
    const at =
      (adaptation && when[adaptation.id]) ??
      (adaptation ? plannedDateOf(adaptation) : null) ??
      (channel.id === slotWhen.channel ? slotWhen.at : null) ??
      slot.data ??
      new Date();
    const ownPlan =
      planOverrides[channel.id] !== undefined
        ? planOverrides[channel.id]
        : channel.settings?.planMode ?? null;
    // Текст старше настроек, меняющих текст: «применится при переписывании».
    const changedAt =
      textChangedAt[channel.id] ?? channel.settings?.textChangedAt ?? null;
    const rewritePending = Boolean(
      adaptation &&
        changedAt &&
        new Date(changedAt).getTime() > new Date(adaptation.createdAt).getTime()
    );
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
        onBodyChange={(text) =>
          adaptation &&
          changeBody(adaptation.id, text, adaptation.state === 'queued')
        }
        saveState={save?.state ?? 'idle'}
        savedAt={save?.at ?? null}
        saveError={save?.state === 'failed' ? save.message ?? null : null}
        canRetrySave={save?.retry !== false}
        onRetrySave={() =>
          adaptation && void saveBody(adaptation.id, body)
        }
        unsaved={dirty}
        onSaveQueued={() =>
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
        pieceLink={coreLink ? { url: coreLink.url, text: coreLink.text ?? null } : null}
        avatars={avatars}
        onPostOptionsChange={(next) => changePostOptions(channel.id, next)}
        postPlan={{
          value: ownPlan,
          channel: channel.planMode,
          disabled:
            !canWrite || scheduleBusy !== null || Boolean(planBusy[channel.id]),
          onChange: (next) =>
            void changePostPlan(channel.id, next, channel.planMode),
        }}
        rewritePending={rewritePending}
        settingsSaveState={settingsSaves[channel.id]?.state ?? 'idle'}
        settingsSavedAt={
          settingsSaves[channel.id]?.at ??
          (channel.settings?.savedAt
            ? dayjs(channel.settings.savedAt).format('HH:mm')
            : null)
        }
        onSaveSettings={() =>
          void saveSettings(channel.id, { options: optionsOf(channel.id) })
        }
        channelSaveState={remember[channel.id] ?? 'idle'}
        onSaveForChannel={() => void rememberForChannel(channel.id)}
        onRewriteAndRemember={() =>
          adaptation &&
          void rememberForChannel(channel.id).then(
            (ok) => ok && adapt(channel.id, adaptation.kind)
          )
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
        onDropPlan={() => void changePostPlan(channel.id, 'draft')}
        onMove={() => adaptation && void move(adaptation, at)}
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
      channelDelete={
        activeAdaptation && activeAdaptation.state !== 'published'
          ? {
              id: activeAdaptation.id,
              onConfirm: () => void removeAdaptation(activeAdaptation),
              disabled:
                scheduleBusy !== null &&
                !(scheduleBusy.id === activeAdaptation.id && scheduleBusy.kind === 'delete'),
              loading:
                scheduleBusy?.id === activeAdaptation.id &&
                scheduleBusy.kind === 'delete',
            }
          : null
      }
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
