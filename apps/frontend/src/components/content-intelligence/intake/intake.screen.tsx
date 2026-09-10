'use client';

import type { ReactNode } from 'react';
import { Button } from '@contentfactory/react/form/button';
import { Select } from '@contentfactory/react/form/select';
import { Textarea } from '@contentfactory/react/form/textarea';
import type { ChannelPickerIntegration } from '../../new-launch/picks.socials.component';
import {
  EmptyState,
  ErrorState,
  RestrictedState,
} from '../../ui/surface';
import { Progress } from '../../ui/progress';
import { intakeCopy, type IntakeLocale } from './intake.copy';
import type {
  IntakeBlockReason,
  IntakeInputKindV1,
  IntakeScreenState,
} from './intake.adapter';

/**
 * Экран «Написать из мысли»: одно поле, каналы, кнопка и результат.
 *
 * Рисует и ничего не просит. Ни одного `fetch`, ни одного SWR-ключа: всё
 * состояние приходит сверху от `intake.container.tsx`, и это тот же раздел
 * ответственности, что у `voice-brief.screen.tsx` рядом. Стенд
 * `/interface-review` открывает этот файл во всех девяти состояниях без сети
 * именно поэтому.
 *
 * Три вещи в разметке — решения, а не оформление.
 *
 * Строка «похоже на ссылку» появляется только для URL и живёт в
 * `role="status"`: она сообщает о том, что продукт сейчас сделает иначе
 * (прочитает страницу), и человек, который не смотрит на экран, должен об
 * этом услышать. Для мысли и чужого поста строки нет — экран не гадает вслух.
 *
 * Причина, по которой «Написать» не нажимается, стоит рядом с кнопкой
 * текстом, а не всплывающей подсказкой: правило системы — выключенный
 * элемент объясняет себя, и объяснение это текст.
 *
 * Готового текста здесь нет вовсе — `content-factory-next-m2eg.21`, хвост
 * живого прогона 07.09.2026. Черновик с квитанцией рисовались и здесь, и на
 * странице заготовки: экран уходит на неё сам, поэтому вторая копия успевала
 * только мигнуть между первым каналом и концом стрима. Читают текст там, где
 * его правят, — на странице заготовки.
 *
 * Вопросов на этом экране больше нет — волна `content-factory-next-m2eg`.
 * Заготовка теперь записывается до них, экран уходит на её страницу, и
 * уточнения живут там, рядом с сутью, которую они правят. Здесь остался
 * последний кадр перед переходом: строка «Заготовка сохранена» и, если
 * переход не случился, кнопка «Открыть заготовку».
 */

export type IntakeChannel = ChannelPickerIntegration & {
  contentLanguage?: 'en' | 'ru';
};

export function IntakeScreen({
  locale,
  state,
  input,
  inputKind,
  detectedLink,
  language,
  step,
  piece,
  blocked,
  errorTitle,
  errorMessage,
  restrictedReason,
  readOnlyNote,
  onInputChange,
  onLanguageChange,
  onWrite,
  onCancel,
  onOpenPiece,
  onManual,
  onRetry,
}: {
  locale: IntakeLocale;
  state: IntakeScreenState;
  input: string;
  inputKind: IntakeInputKindV1 | null;
  detectedLink: boolean;
  language: 'ru' | 'en';
  step: string | null;
  /** Записанная заготовка: код и адрес, чтобы её было куда открыть. */
  piece?: { pieceId: string; code: string } | null;
  blocked: IntakeBlockReason;
  errorTitle?: string;
  errorMessage?: string;
  restrictedReason: ReactNode;
  readOnlyNote?: ReactNode;
  onInputChange: (value: string) => void;
  onLanguageChange: (language: 'ru' | 'en') => void;
  onWrite: () => void;
  onCancel: () => void;
  onOpenPiece?: (pieceId: string) => void;
  onManual?: () => void;
  onRetry: () => void;
}) {
  const t = intakeCopy[locale];
  const busy = state === 'streaming';
  const blockedWord =
    blocked === 'input'
      ? t.blockedNoInput
      : blocked === 'channel'
      ? t.blockedNoChannel
      : blocked === 'checking'
      ? t.blockedChecking
      : null;
  const stepWord =
    step === 'brief-started'
      ? t.stepBrief
      : step === 'claims'
      ? t.stepClaims
      : step === 'search'
      ? t.stepSearch
      : step === 'writing'
      ? t.stepWriting
      : t.stepStarted;

  return (
    <section
      data-content-panel="intake"
      data-intake-state={state}
      data-intake-kind={inputKind ?? 'unknown'}
      aria-busy={busy}
      className="flex min-w-0 flex-col gap-[16px] [&_button]:min-h-[44px] sm:[&_button]:min-h-0"
    >
      <header className="flex min-w-0 flex-col gap-[4px]">
        <h2 className="cf-heading-lg text-cf-ink [text-wrap:balance]">
          {t.title}
        </h2>
        <p className="max-w-[72ch] cf-body-md text-cf-ink-muted [text-wrap:pretty]">
          {t.lead}
        </p>
      </header>

      {state === 'checking' ? (
        <p role="status" className="cf-body-sm text-cf-ink-muted">
          {t.blockedChecking}
        </p>
      ) : state === 'restricted' ? (
        <RestrictedState title={t.restrictedTitle} reason={restrictedReason} />
      ) : state === 'no-channel' ? (
        <EmptyState
          title={t.emptyTitle}
          description={t.emptyBody}
          action={
            // Обычная ссылка, а не кнопка с `router.push`: это переход в
            // другой раздел, и он должен открываться средним щелчком и
            // копироваться, как всякий адрес.
            <a
              href="/channels"
              className="inline-flex items-center rounded-[8px] border border-cf-border-control px-[16px] py-[8px] cf-label-md text-cf-ink transition-colors duration-state hover:bg-cf-surface-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cf-focus motion-reduce:transition-none"
            >
              {t.emptyAction}
            </a>
          }
        />
      ) : (
        <>
          {readOnlyNote}

          <fieldset
            disabled={state === 'read-only'}
            className="contents min-w-0"
          >
            <div className="flex min-w-0 flex-col gap-[4px]">
              <label
                htmlFor="intake-input"
                className="cf-label-sm uppercase text-cf-ink-muted"
              >
                {t.inputLabel}
              </label>
              <Textarea
                disabled={busy}
                standalone
                layout="content"
                id="intake-input"
                name="intake-input"
                aria-label={t.inputLabel}
                placeholder={t.inputPlaceholder}
                className="w-full"
                value={input}
                onChange={(event) => onInputChange(event.target.value)}
              />
              {detectedLink && (
                <p
                  role="status"
                  data-intake-kind-line="link"
                  className="max-w-[72ch] cf-caption text-cf-ink-muted [text-wrap:pretty]"
                >
                  {t.kindLink}
                </p>
              )}
            </div>

            <div className="flex min-w-0 flex-col gap-[4px] sm:max-w-[280px]">
              <label
                htmlFor="intake-language"
                className="cf-label-sm uppercase text-cf-ink-muted"
              >
                {t.languageLabel}
              </label>
              <Select
                disabled={busy}
                standalone
                id="intake-language"
                name="intake-language"
                aria-label={t.languageLabel}
                value={language}
                onChange={(event) =>
                  onLanguageChange(event.target.value as 'ru' | 'en')
                }
              >
                <option value="ru">{t.languageRu}</option>
                <option value="en">{t.languageEn}</option>
              </Select>
            </div>

            <div className="flex flex-wrap items-center gap-[8px]">
              {/*
                Надпись меняется от выбора: кнопка называет то, что сейчас
                произойдёт. Без каналов будет только заготовка, и обещать
                текст она не вправе (`content-factory-next-tu3k.9`).
              */}
              <Button
                type="button"
                variant="primary"
                data-intake-action="piece"
                disabled={busy || blocked !== null || state === 'read-only'}
                onClick={onWrite}
              >
                {t.makePiece}
              </Button>
              {busy && (
                <Button type="button" variant="secondary" onClick={onCancel}>
                  {t.cancel}
                </Button>
              )}
              {/*
                Шаг стрима стоит РЯДОМ с кнопкой, а не отдельной строкой ниже.
                Волна `content-factory-next-m2eg`: экран теперь уходит на
                страницу заготовки сам, и те секунды, что он ещё здесь, — это
                единственное место, где человек видит, что работа идёт. Строка
                под другими блоками читалась как надпись у страницы, а не как
                состояние нажатой кнопки. `aria-live="polite"` и
                `data-intake-step` на одном узле: человек слышит ход, а не
                гадает по индикатору без подписи.
              */}
              {busy && (
                <div
                  aria-live="polite"
                  data-intake-step={step}
                  className="flex min-w-0 flex-1 items-center gap-[8px]"
                >
                  <Progress
                    mode="indeterminate"
                    label={stepWord}
                    className="w-[80px] shrink-0"
                  />
                  <p className="cf-body-sm text-cf-ink-muted">
                    {stepWord}
                  </p>
                </div>
              )}
              {blockedWord && !busy && (
                <p
                  role="status"
                  data-intake-block-reason={blocked}
                  className="cf-caption text-cf-ink-muted"
                >
                  {blockedWord}
                </p>
              )}
            </div>
          </fieldset>

          {/*
            Заготовка записана до цикла по каналам и до единого вопроса, и её
            код — первое, что человек получает. Дальше экран уходит на её
            страницу сам, поэтому эта строка — последний кадр здесь; кнопка
            рядом остаётся на случай, когда переход не случился.
          */}
          {piece && (
            <p
              role="status"
              data-intake-piece={piece.code}
              className="flex flex-wrap items-center gap-[8px] cf-body-sm text-cf-ink"
            >
              {t.pieceSaved(piece.code)}
              {onOpenPiece && (
                <Button
                  type="button"
                  variant="quiet"
                  density="dense"
                  onClick={() => onOpenPiece(piece.pieceId)}
                >
                  {t.openPiece}
                </Button>
              )}
            </p>
          )}

          {state === 'error' && (
            <ErrorState
              title={errorTitle ?? t.errorTitle}
              description={errorMessage ?? t.errorFallback}
              action={
                /*
                  Два выхода, и второй — не любезность. Ручная форма брифа
                  живёт рядом с отказом, а не после расспросов: расспросов
                  здесь больше нет вовсе (`content-factory-next-m2eg`), а
                  вход, который не собрался, — это ровно тот случай, когда
                  человеку нужен другой путь, а не третья попытка.
                */
                <span className="flex flex-wrap gap-[8px]">
                  <Button type="button" variant="secondary" onClick={onRetry}>
                    {t.retry}
                  </Button>
                  {onManual && (
                    <Button type="button" variant="quiet" onClick={onManual}>
                      {t.manualForm}
                    </Button>
                  )}
                </span>
              }
            />
          )}
        </>
      )}
    </section>
  );
}

export default IntakeScreen;
