'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { useModals } from '../../layout/new-modal';
import { useIntegrationList } from '../../launches/helpers/use.integration.list';
import { useUser } from '../../layout/user.context';
import type { Integrations } from '../../launches/calendar.context';
import { createNdjsonSplitter } from '../../new-launch/ndjson';
import {
  EDITOR_MODAL,
  editorChannels,
  editorDate,
  postEndpoint,
} from '../../brand-voice/voice-materials.adapter';
import {
  ContentReadOnlyNote,
  writeRightFromRole,
} from '../content-write-right';
import { resolveContentLocale } from '../content-section.copy';
import { useAssistantAvailability } from '../../copilot/assistant-availability';
import { IntakeScreen, type IntakeChannel } from './intake.screen';
import { WritingProfileCard } from './writing-profile.card';
import { intakeCopy } from './intake.copy';
import {
  INTAKE_API,
  INTAKE_MAX_CHANNELS,
  INTAKE_MAX_ROUNDS,
  IntakeContractError,
  blockReason,
  buildIntakePayload,
  detectInputKind,
  readIntakeEvent,
  screenState,
  type BriefField,
  type BriefFilledV1,
  type IntakeInputKindV1,
  type IntakeQuestionV1,
  type PieceAnswerInputV1,
  type PieceQuestionKeyV1,
  type PieceQuestionV1,
  type ReceiptField,
} from './intake.adapter';
import type { BriefOverrides } from './brief.receipt';
import type { ChannelPickerIntegration } from '../../new-launch/picks.socials.component';

/**
 * Вход одной мыслью: запросы, стрим и то, что из них выходит.
 *
 * `content-factory-next-tu3k.4`, решения владельца 06.09.2026. Один экран и
 * две двери в него — календарь и вкладка «Бриф»; вторая копия экрана не
 * заводится, поэтому здесь есть `surface`, а не два похожих контейнера.
 *
 * Четыре ворот стоят до формы, и порядок их — порядок отказов, а не удобства:
 *
 *  1. Есть ли чем позвать модель (`useAssistantAvailability`). Пока ответа
 *     нет — «Проверяем»; ответ `unavailable` — `RestrictedState` с той же
 *     фразой, что говорят остальные двери модели, и ни одного запроса.
 *  2. Есть ли право писать. Роль читается из сессии до отрисовки: заполнить
 *     поле и узнать про 403 после нажатия — дефект, который в этом разделе
 *     уже чинили (`content-factory-next-fn33.90.8`).
 *  3. Есть ли куда писать. Ни одного доступного канала — не поломка, а один
 *     недостающий шаг, и экран называет, где он делается.
 *  4. И только потом сам вход.
 *
 * Стрим читается тем же способом, что и генератор постов: `getReader()`,
 * разбивка на строки общим `createNdjsonSplitter`, разбор каждой строки
 * контрактом. `AbortController` заводится на каждый ход и обрывается при
 * уходе с экрана — иначе закрытая модалка продолжает получать события и
 * писать в размонтированное состояние.
 *
 * Ответы копятся между ходами. Второй запрос несёт `answers` и `decide`
 * первого — сервер обещает, что отвеченное поле больше не спрашивается, и
 * терять их между ходами означало бы задать тот же вопрос дважды. Третьего
 * хода нет: предел в два уточнения проверяется здесь, до запроса.
 */

export function IntakeContainer({
  surface,
  integrations: given,
  prefill,
  onSwitchToManual,
  onDraftOpened,
}: {
  surface: 'calendar' | 'brief';
  /** Список каналов, когда он уже есть у вызывающего (стенд, календарь). */
  integrations?: readonly Integrations[];
  prefill?: { input: string; sourceLeadId?: string } | null;
  onSwitchToManual?: () => void;
  onDraftOpened?: () => void;
}) {
  const request = useFetch();
  const modal = useModals();
  const t = useT();
  const { language } = useVariables();
  const locale = resolveContentLocale(language);
  const w = intakeCopy[locale];

  const user = useUser();
  const canWrite = writeRightFromRole(user?.role).allowed;
  const availability = useAssistantAvailability(true);

  const { data: fetched } = useIntegrationList();
  const channels: readonly Integrations[] = given ?? fetched ?? [];

  /*
    Доступный канал — тот же фильтр, что применяет сам выбор каналов
    (`PicksSocialsView`): не выключенный и не застрявший на середине
    подключения. Считать по всему списку значило бы обещать форму
    пространству, где писать некуда.
  */
  const available = useMemo(
    () => channels.filter((one) => !one.disabled && !one.inBetweenSteps),
    [channels]
  );

  /*
    Настроена ли у канала карточка «Как пишем сюда».

    Один флаг едет в списке каналов, который экран и так читает: значок честен
    сразу, до того как карточку открыли. Опрашивать дверь карточки у каждого
    канала — это шесть запросов ради подписи в два слова.
  */
  const writingProfileStored = useMemo(
    () =>
      Object.fromEntries(
        channels.map((one) => [one.id, Boolean(one.writingProfileStored)])
      ),
    [channels]
  );

  const [input, setInput] = useState(prefill?.input ?? '');
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
  const [textLanguage, setTextLanguage] = useState<'ru' | 'en' | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  const [questions, setQuestions] = useState<readonly IntakeQuestionV1[]>([]);
  const [brief, setBrief] = useState<BriefFilledV1 | null>(null);
  const [draft, setDraft] = useState<{
    postId: string;
    integrationId: string;
    text: string;
  } | null>(null);
  const [overrides, setOverrides] = useState<BriefOverrides>({});
  const [kindOverride, setKindOverride] = useState<IntakeInputKindV1 | undefined>();
  const [failure, setFailure] = useState<{ title: string; message: string } | null>(
    null
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [rounds, setRounds] = useState(0);
  const [answers, setAnswers] = useState<
    readonly { field: BriefField; text: string }[]
  >([]);
  const [decided, setDecided] = useState<readonly BriefField[]>([]);
  const [profileFor, setProfileFor] = useState<string | null>(null);
  const [runId, setRunId] = useState(0);
  /*
    Заготовка волны `tu3k.9`: она записывается до цикла по каналам, поэтому
    её код приходит раньше черновика и живёт отдельно от него — текст для
    канала может не собраться, а заготовка всё равно сохранена.
  */
  const [piece, setPiece] = useState<{ pieceId: string; code: string } | null>(
    null
  );
  const [pieceQuestions, setPieceQuestions] = useState<
    readonly PieceQuestionV1[]
  >([]);
  const [interview, setInterview] = useState<readonly PieceAnswerInputV1[]>([]);
  const [decidedKeys, setDecidedKeys] = useState<readonly PieceQuestionKeyV1[]>(
    []
  );
  const [skipInterview, setSkipInterview] = useState(false);

  const abort = useRef<AbortController | null>(null);

  // Уход с экрана обрывает ход. Модалку закрыли — сервер больше не пишет в
  // никуда, а состояние не трогается после размонтирования.
  useEffect(
    () => () => {
      abort.current?.abort();
      abort.current = null;
    },
    []
  );

  useEffect(() => {
    if (prefill?.input) setInput(prefill.input);
  }, [prefill?.input]);

  // Язык текста по умолчанию — язык первого выбранного канала: у канала он
  // уже записан (`Integration.contentLanguage`), и спрашивать заново то, что
  // продукт знает, — лишний вопрос. Нет канала или языка у него — язык
  // интерфейса.
  const language0 =
    textLanguage ??
    available.find((one) => one.id === selectedIds[0])?.contentLanguage ??
    locale;

  const detectedLink = detectInputKind(input) === 'link';

  const blocked = blockReason({ availability, input, selected: selectedIds });

  const state = screenState({
    availability,
    canWrite,
    // Канал больше не обязателен: без него получается заготовка. Значение
    // остаётся в вызове, потому что его читают другие ветки состояния.
    hasChannel: true,
    busy,
    questions: questions.length,
    draft: draft !== null,
    failed: failure !== null,
  });

  const toggleChannel = useCallback((integration: ChannelPickerIntegration) => {
    setSelectedIds((current) =>
      current.includes(integration.id)
        ? current.filter((id) => id !== integration.id)
        : // Четвёртый канал дверь отказывает до первого байта; экран просто
          // не даёт его выбрать, вместо того чтобы слать заведомый отказ.
          current.length >= INTAKE_MAX_CHANNELS
          ? current
          : [...current, integration.id]
    );
  }, []);

  /* ---------------------------------------------------------------------
   * Один ход
   * ------------------------------------------------------------------ */

  const run = useCallback(
    async (extra: {
      answers?: readonly { field: BriefField; text: string }[];
      decide?: readonly BriefField[];
      briefOverrides?: BriefOverrides;
      inputKind?: IntakeInputKindV1;
      interview?: readonly PieceAnswerInputV1[];
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
      setPieceQuestions([]);
      setStep('started');
      setRunId((current) => current + 1);

      const nextAnswers = [...answers, ...(extra.answers ?? [])];
      const nextDecided = [...decided, ...(extra.decide ?? [])];
      setAnswers(nextAnswers);
      setDecided(nextDecided);

      // Ответы интервью тоже копятся между ходами: отвеченный вопрос сервер
      // больше не задаёт, и потерять ответ означало бы спросить дважды.
      const nextInterview = [...interview, ...(extra.interview ?? [])];
      const nextDecidedKeys = [...decidedKeys, ...(extra.decideKeys ?? [])];
      const nextSkip = skipInterview || extra.skipInterview === true;
      setInterview(nextInterview);
      setDecidedKeys(nextDecidedKeys);
      setSkipInterview(nextSkip);

      try {
        const response = await request(INTAKE_API.intake, {
          method: 'POST',
          signal: controller.signal,
          body: JSON.stringify(
            buildIntakePayload({
              input,
              integrationIds: selectedIds,
              language: language0,
              answers: nextAnswers,
              decide: nextDecided,
              briefOverrides: extra.briefOverrides,
              inputKind: extra.inputKind ?? kindOverride,
              ...(prefill?.sourceLeadId
                ? { sourceLeadId: prefill.sourceLeadId }
                : {}),
              interview: nextInterview,
              decideKeys: nextDecidedKeys,
              skipInterview: nextSkip,
            })
          ),
        });

        if (!response.ok || !response.body) {
          const body = await response.json().catch(() => null);
          setFailure({
            title: w.errorTitle,
            message:
              (body && typeof body.message === 'string' && body.message) ||
              w.errorFallback,
          });
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let sawQuestions = false;
        let sawDraft = false;
        let sawPiece = false;

        const splitter = createNdjsonSplitter((line) => {
          const reading = readIntakeEvent(line);
          if (!reading) return;
          if (reading.kind === 'step') {
            // `search-started` приходит перед проверкой чисел поиском
            // (`content-factory-next-tu3k.7`): строка «Проверяем цифры
            // поиском…» встаёт вовремя, а не после того, как поиск закончился.
            setStep(reading.name === 'search-started' ? 'search' : reading.name);
            return;
          }
          if (reading.kind === 'piece') {
            if (reading.event.name === 'piece') {
              sawPiece = true;
              setPiece({
                pieceId: reading.event.pieceId,
                code: reading.event.code,
              });
            } else {
              sawQuestions = true;
              setPieceQuestions(reading.event.questions);
              setRounds((current) => current + 1);
              setStep(null);
            }
            return;
          }
          const event = reading.event;
          switch (event.name) {
            case 'intake-started':
              setStep('started');
              break;
            case 'claims':
              setStep('claims');
              break;
            case 'link-fetched':
              setStep('search');
              break;
            case 'brief-filled':
              setBrief(event.brief);
              setStep('writing');
              break;
            case 'questions':
              sawQuestions = true;
              setQuestions(event.questions);
              setRounds((current) => current + 1);
              setStep(null);
              break;
            case 'channel-started':
              setStep('writing');
              break;
            case 'draft': {
              sawDraft = true;
              const text = event.content.map((one) => one.content).join('\n\n');
              // Первый черновик — тот, что показан. Остальные каналы всё
              // равно сохранены в DRAFT и открываются из календаря; показывать
              // три текста подряд на одном экране было бы третьим списком.
              setDraft((current) =>
                current ?? {
                  postId: event.postId,
                  integrationId: event.integrationId,
                  text,
                }
              );
              break;
            }
            case 'error':
              setFailure({ title: w.errorTitle, message: event.message });
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
        setStep(null);

        if (!sawQuestions && !sawDraft && !sawPiece) {
          setFailure({ title: w.errorTitle, message: w.errorIncomplete });
        }
      } catch (error) {
        if ((error as { name?: string } | null)?.name === 'AbortError') return;
        setFailure({
          title: w.errorTitle,
          message:
            error instanceof IntakeContractError
              ? w.errorIncomplete
              : w.errorFallback,
        });
      } finally {
        setBusy(false);
        setStep(null);
      }
    },
    [
      answers,
      decided,
      decidedKeys,
      input,
      interview,
      kindOverride,
      language0,
      prefill?.sourceLeadId,
      request,
      selectedIds,
      skipInterview,
      w,
    ]
  );

  const write = useCallback(() => {
    setDraft(null);
    setBrief(null);
    setOverrides({});
    setAnswers([]);
    setDecided([]);
    setRounds(0);
    setPiece(null);
    setInterview([]);
    setDecidedKeys([]);
    setSkipInterview(false);
    void run({});
  }, [run]);

  /** Ответы интервью заготовки: тот же ход, что и уточнения брифа. */
  const answerInterview = useCallback(
    (
      given: readonly { key: string; text: string; origin: 'person' | 'confirmed' }[],
      decideKeys: readonly string[]
    ) => {
      if (rounds >= INTAKE_MAX_ROUNDS) {
        setPieceQuestions([]);
        void run({ skipInterview: true });
        return;
      }
      void run({
        interview: given.map((one) => ({
          key: one.key as PieceQuestionKeyV1,
          text: one.text,
          origin: one.origin,
        })),
        decideKeys: decideKeys as PieceQuestionKeyV1[],
      });
    },
    [rounds, run]
  );

  const skipTheInterview = useCallback(() => {
    setPieceQuestions([]);
    void run({ skipInterview: true });
  }, [run]);

  const answer = useCallback(
    (
      given: readonly { field: BriefField; text: string }[],
      decide: readonly BriefField[]
    ) => {
      // Третий круг не начинается. Предел в два уточнения проверяется здесь,
      // до запроса: сервер тоже его знает, но человеку незачем ждать ответа,
      // чтобы услышать «больше спрашивать не будем».
      if (rounds >= INTAKE_MAX_ROUNDS) {
        setQuestions([]);
        return;
      }
      void run({ answers: given, decide });
    },
    [rounds, run]
  );

  const rebuild = useCallback(() => {
    setDraft(null);
    void run({ briefOverrides: overrides, inputKind: kindOverride });
  }, [kindOverride, overrides, run]);

  const retry = useCallback(() => {
    setFailure(null);
    void run({});
  }, [run]);

  /* ---------------------------------------------------------------------
   * Редактор
   * ------------------------------------------------------------------ */

  /**
   * Открытие черновика — тот же след, что у вкладки «Бриф».
   *
   * Пост уже сохранён сервером как DRAFT, поэтому здесь только чтение
   * `GET /posts/:id` и то же самое окно поста, что открывается из календаря.
   * Окно не меняется вовсе (решение владельца 04.09 «только полезное»);
   * строка происхождения появится в нём сама из сохранённого контекста.
   *
   * Редактор — самое тяжёлое дерево в приложении, поэтому он приезжает по
   * нажатию, а не вместе с экраном.
   */
  const openEditor = useCallback(async () => {
    if (!draft) return;
    try {
      const response = await request(postEndpoint(draft.postId));
      if (!response.ok) throw new Error('post unavailable');
      const existing = await response.json();
      const [{ AddEditModal }, { ExistingDataContextProvider }] =
        await Promise.all([
          import('../../new-launch/add.edit.modal'),
          import('../../launches/helpers/use.existing.data'),
        ]);
      const editorChannelList = editorChannels(existing, channels);
      modal.openModal({
        ...EDITOR_MODAL,
        children: (
          <ExistingDataContextProvider value={existing}>
            <AddEditModal
              allIntegrations={editorChannelList.allIntegrations}
              integrations={editorChannelList.integrations}
              date={editorDate(existing)}
              reopenModal={() => void openEditor()}
              mutate={() => undefined}
            />
          </ExistingDataContextProvider>
        ),
      });
      setNotice(w.draftOpened);
      onDraftOpened?.();
    } catch {
      setFailure({ title: w.errorTitle, message: w.errorFallback });
    }
  }, [channels, draft, modal, onDraftOpened, request, w]);

  /* ------------------------------------------------------------------ */

  const readOnlyNoteId = 'intake-read-only';
  const pickerChannels: readonly IntakeChannel[] = available;
  const draftPlatform = available.find(
    (one) => one.id === draft?.integrationId
  )?.identifier;

  return (
    <>
      <IntakeScreen
        locale={locale}
        state={state}
        input={input}
        inputKind={brief?.inputKind ?? detectInputKind(input) ?? null}
        detectedLink={detectedLink}
        channels={pickerChannels}
        selectedIds={selectedIds}
        language={language0}
        step={step}
        questions={questions}
        pieceQuestions={pieceQuestions}
        piece={piece}
        brief={brief}
        overrides={overrides}
        kindOverride={kindOverride}
        draftText={draft?.text ?? null}
        draftPlatform={draftPlatform}
        blocked={blocked}
        errorTitle={failure?.title}
        errorMessage={failure?.message}
        notice={notice}
        // Та же фраза, которой отвечают остальные двери модели: одна беда —
        // одно объяснение, и оно уже переведено на шестнадцать языков.
        restrictedReason={t(
          'ai_allowance_unavailable',
          'AI is not available in this workspace yet.'
        )}
        readOnlyNote={
          state === 'read-only' ? (
            <ContentReadOnlyNote
              id={readOnlyNoteId}
              surface="brief"
              refusal="role"
            >
              {w.readOnlyBody}
            </ContentReadOnlyNote>
          ) : undefined
        }
        roundsSpent={rounds >= INTAKE_MAX_ROUNDS && !draft && questions.length === 0}
        slopKey={`${draft?.postId ?? 'none'}-${runId}`}
        onInputChange={setInput}
        onToggleChannel={toggleChannel}
        onLanguageChange={setTextLanguage}
        onWrite={write}
        onCancel={() => {
          abort.current?.abort();
          abort.current = null;
          setBusy(false);
          setStep(null);
        }}
        onAnswer={answer}
        onPieceAnswer={answerInterview}
        onSkipInterview={skipTheInterview}
        onOpenPiece={(pieceId) => {
          if (typeof window !== 'undefined') {
            window.location.assign(`/content/pieces/${encodeURIComponent(pieceId)}`);
          }
        }}
        onOverride={(field: ReceiptField, value: string) =>
          setOverrides((current) => ({ ...current, [field]: value }))
        }
        onKindChange={setKindOverride}
        onRevertOverrides={() => {
          setOverrides({});
          setKindOverride(undefined);
        }}
        onRebuild={rebuild}
        onOpenEditor={() => void openEditor()}
        onOpenWritingProfile={setProfileFor}
        onManual={onSwitchToManual}
        onRetry={retry}
        writingProfileStored={writingProfileStored}
      />

      {profileFor && (
        <WritingProfileCard
          locale={locale}
          integrationId={profileFor}
          integrationName={
            available.find((one) => one.id === profileFor)?.name ?? ''
          }
          canWrite={canWrite}
          open
          onClose={() => setProfileFor(null)}
        />
      )}
    </>
  );
}

export default IntakeContainer;
