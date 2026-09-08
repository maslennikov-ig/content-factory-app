'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { useUser } from '../../layout/user.context';
import type { Integrations } from '../../launches/calendar.context';
import { createNdjsonSplitter } from '../../new-launch/ndjson';
import {
  ContentReadOnlyNote,
  writeRightFromRole,
} from '../content-write-right';
import { resolveContentLocale } from '../content-section.copy';
import { useAssistantAvailability } from '../../copilot/assistant-availability';
import { IntakeScreen } from './intake.screen';
import { intakeCopy } from './intake.copy';
import {
  INTAKE_API,
  IntakeContractError,
  blockReason,
  buildIntakePayload,
  detectInputKind,
  readIntakeEvent,
  screenState,
  type BriefFilledV1,
} from './intake.adapter';
import { piecePath } from '../pieces/pieces.adapter';

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
 * Ход теперь один, и это волна `content-factory-next-m2eg` (живой прогон
 * 07.09.2026). Раньше их было до трёх: сервер отвечал вопросами, экран собирал
 * ответы и слал весь вход заново, а на третьем круге показывал тупик «больше
 * спрашивать не будем» — и человек оставался ни с чем. Теперь первый же ход
 * записывает заготовку, экран уходит на её страницу, и уточнения живут там,
 * рядом с сутью, которую они правят.
 */

export function IntakeContainer({
  surface,
  integrations: given,
  prefill,
  onSwitchToManual,
}: {
  surface: 'calendar' | 'brief';
  /** Список каналов, когда он уже есть у вызывающего (стенд, календарь). */
  integrations?: readonly Integrations[];
  prefill?: { input: string; sourceLeadId?: string } | null;
  onSwitchToManual?: () => void;
}) {
  const request = useFetch();
  const t = useT();
  const { language } = useVariables();
  const locale = resolveContentLocale(language);
  const w = intakeCopy[locale];

  const user = useUser();
  const canWrite = writeRightFromRole(user?.role).allowed;
  const availability = useAssistantAvailability(true);

  const [input, setInput] = useState(prefill?.input ?? '');
  const [textLanguage, setTextLanguage] = useState<'ru' | 'en' | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  const [brief, setBrief] = useState<BriefFilledV1 | null>(null);
  /*
    Черновик остаётся фактом хода, а не текстом на экране
    (`content-factory-next-m2eg.21`). Экран уходит на страницу заготовки, и
    читают текст там; здесь важно только, написалось ли что-нибудь, — по этому
    `screenState` отличает `draft` от `idle`.
  */
  const [wrote, setWrote] = useState(false);
  const [failure, setFailure] = useState<{ title: string; message: string } | null>(
    null
  );
  /*
    Заготовка волны `tu3k.9`: она записывается до цикла по каналам и до единого
    вопроса, поэтому её код приходит раньше черновика и живёт отдельно от него
    — текст для канала может не собраться, а заготовка всё равно сохранена.
  */
  const [piece, setPiece] = useState<{ pieceId: string; code: string } | null>(
    null
  );

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
  const language0 = textLanguage ?? locale;

  const detectedLink = detectInputKind(input) === 'link';

  const blocked = blockReason({ availability, input, selected: [] });

  const state = screenState({
    availability,
    canWrite,
    // Канал больше не обязателен: без него получается заготовка. Значение
    // остаётся в вызове, потому что его читают другие ветки состояния.
    hasChannel: true,
    busy,
    draft: wrote,
    failed: failure !== null,
  });

  /**
   * Уход на страницу заготовки — обычным адресом, а не подменой вида.
   *
   * `window.location.assign`, а не `router.push`: страница заготовки читает
   * свои данные сама и ничего не наследует от этого экрана, а вход открывается
   * и вкладкой раздела, и модалкой календаря — из модалки `router.push` оставил
   * бы её висеть поверх новой страницы.
   */
  const goToPiece = useCallback((pieceId: string) => {
    if (typeof window === 'undefined') return;
    window.location.assign(piecePath(pieceId));
  }, []);

  /* ---------------------------------------------------------------------
   * Один ход
   * ------------------------------------------------------------------ */

  const run = useCallback(async () => {
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;

      setBusy(true);
      setFailure(null);
      setStep('started');

      try {
        const response = await request(INTAKE_API.intake, {
          method: 'POST',
          signal: controller.signal,
          body: JSON.stringify(
            buildIntakePayload({
              input,
              language: language0,
              ...(prefill?.sourceLeadId
                ? { sourceLeadId: prefill.sourceLeadId }
                : {}),
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
        let recorded: string | null = null;

        const splitter = createNdjsonSplitter((line) => {
          const reading = readIntakeEvent(line);
          if (!reading) return;
          if (reading.kind === 'step') {
            // `search-started` приходит перед поиском недостающих фактов:
            // строка об обогащении встаёт вовремя, а не после завершения поиска.
            setStep(reading.name === 'search-started' ? 'search' : reading.name);
            return;
          }
          if (reading.kind === 'piece') {
            // Заготовка записана. Её адрес запоминается здесь, а уходят на неё
            // после последней строки: увести страницу посреди стрима значило
            // бы оборвать адаптации, которые сервер как раз пишет.
            if (reading.event.name === 'piece') {
              recorded = reading.event.pieceId;
              setWrote(true);
              setPiece({
                pieceId: reading.event.pieceId,
                code: reading.event.code,
              });
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
              setStep('brief-started');
              break;
            case 'brief-filled':
              setBrief(event.brief);
              setStep('writing');
              break;
            case 'questions':
              // Вопросы больше не показываются здесь и не обрывают ход: они
              // уехали в бриф заготовки и живут на её странице.
              break;
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

        if (!recorded) {
          setFailure({ title: w.errorTitle, message: w.errorIncomplete });
          return;
        }
        /*
          Заготовка есть — дальше человек работает с ней, а не с этим экраном:
          суть, квитанция, уточнения и адаптации живут на её странице. Переход
          настоящий, адресом, а не подменой вида: заготовку можно открыть
          заново, послать ссылкой и вернуться на неё назад.
        */
        if (recorded) goToPiece(recorded);
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
    [goToPiece, input, language0, prefill?.sourceLeadId, request, w]
  );

  const write = useCallback(() => {
    setWrote(false);
    setBrief(null);
    setPiece(null);
    void run();
  }, [run]);

  const retry = useCallback(() => {
    setFailure(null);
    void run();
  }, [run]);

  /* ------------------------------------------------------------------ */

  const readOnlyNoteId = 'intake-read-only';

  return (
    <>
      <IntakeScreen
        locale={locale}
        state={state}
        input={input}
        inputKind={brief?.inputKind ?? detectInputKind(input) ?? null}
        detectedLink={detectedLink}
        language={language0}
        step={step}
        piece={piece}
        blocked={blocked}
        errorTitle={failure?.title}
        errorMessage={failure?.message}
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
        onInputChange={setInput}
        onLanguageChange={setTextLanguage}
        onWrite={write}
        onCancel={() => {
          abort.current?.abort();
          abort.current = null;
          setBusy(false);
          setStep(null);
        }}
        onOpenPiece={goToPiece}
        onManual={onSwitchToManual}
        onRetry={retry}
      />

    </>
  );
}

export default IntakeContainer;
