'use client';

import { useState, type ReactNode } from 'react';
import { Button, buttonClassName } from '@contentfactory/react/form/button';
import { DropdownArrowSmallIcon } from '@contentfactory/frontend/components/ui/icons';
import { Status } from '../../ui/surface';
import { ConfirmButton } from '../../ui/confirm-button';
import { cellDate, stateTone, stateWord } from './adaptation.cell';
import { WorkspaceMenu } from './workspace-menu';
import type { AdaptationStateV1 } from './pieces.adapter';
import { piecesCopy, type PiecesLocale } from './pieces.copy';

/**
 * Подвал вкладки канала: когда, удалить и отправить (`97dq.37`, §3.2).
 *
 * Всё, что раньше делало окно «Создать пост», здесь в одну строку. С
 * двенадцатой волны (`97dq.49`, вариант A) порядок такой: слева — тихое
 * опасное «Удалить адаптацию», дальше пустое место, справа вместе —
 * «Когда», дата и главная «Запланировать» с «Опубликовать сейчас» в её
 * меню. Владелец на одиннадцатом заходе: «календарь слева, потом „Удалить
 * адаптацию“, потом „Запланировать“, и между ними огромный пробел». Черновик правится и отправляется;
 * запланированный и опубликованный пост показывают своё состояние и
 * «Открыть в календаре» — править их отсюда нельзя, и кнопка, которая
 * обещает правку, соврала бы.
 *
 * Удаление подтверждается вторым нажатием той же кнопки — общий
 * `ConfirmButton` (`97dq.39`, A3); опубликованную адаптацию сервер не
 * удаляет, поэтому кнопки у неё нет вовсе. Запланированный пост возвращается
 * в черновик только явным «Снять с расписания», а не правкой поверх очереди.
 */
export function ScheduleBar({
  locale,
  state,
  date,
  when,
  canWrite,
  busy,
  error,
  calendarHref,
  onSchedule,
  onPublishNow,
  onUnschedule,
  onDelete,
}: {
  locale: PiecesLocale;
  state: AdaptationStateV1;
  /** ISO — дата поста у запланированного и опубликованного. */
  date: string | null;
  /** Поле «Когда»: общий выбор даты продукта, его рисует контейнер. */
  when: ReactNode;
  canWrite: boolean;
  busy: 'schedule' | 'now' | 'unschedule' | 'delete' | null;
  error?: string | null;
  calendarHref: string;
  onSchedule: () => void;
  onPublishNow: () => void;
  /** «Снять с расписания»: запланированный пост — обратно в черновик. */
  onUnschedule: () => void;
  onDelete: () => void;
}) {
  const t = piecesCopy[locale];
  const sendable = state === 'draft' || state === 'error';
  // Только запланированный пост можно вернуть в черновик.
  const queued = state === 'queued';
  const off = !canWrite || busy !== null;
  const moment = cellDate(state, date);
  const [armed, setArmed] = useState(false);

  const remove =
    state !== 'published' ? (
      <ConfirmButton
        label={t.deleteAdaptation}
        armedLabel={t.deletePieceArmed}
        disabled={!canWrite || (busy !== null && busy !== 'delete')}
        loading={busy === 'delete'}
        loadingLabel={t.deletingAdaptation}
        data-piece-delete-adaptation="true"
        onArmedChange={setArmed}
        // Тихая, но опасная: слово цветом опасности, пока не взведена, —
        // взведённую красит сам `ConfirmButton`.
        className={armed ? undefined : 'text-cf-danger'}
        onConfirm={onDelete}
      />
    ) : null;

  return (
    <div
      data-schedule-bar={state}
      className="flex min-w-0 flex-col gap-[8px] border-t border-cf-border-strong pt-[16px]"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-[12px] gap-y-[8px]">
        {remove}
        <span className="min-w-[8px] flex-1" />
        {sendable ? (
          <div
            data-schedule-send="true"
            className="flex min-w-0 flex-wrap items-center justify-end gap-x-[12px] gap-y-[8px]"
          >
            <span className="cf-caption text-cf-ink-muted">{t.whenLabel}</span>
            <div className="min-w-0">{when}</div>
            <div className="relative inline-flex">
              <Button
                type="button"
                variant="primary"
                disabled={off}
                loading={busy === 'schedule' || busy === 'now'}
                loadingLabel={busy === 'now' ? t.publishingNow : t.scheduling}
                data-schedule-action="schedule"
                className="rounded-e-none"
                onClick={onSchedule}
              >
                {t.schedule}
              </Button>
              <WorkspaceMenu
                dataName="schedule"
                label={t.scheduleMore}
                disabled={off}
                placement="above"
                align="end"
                triggerClassName={buttonClassName({
                  variant: 'primary',
                  className:
                    'w-[40px] rounded-s-none border-s border-cf-accent-ink px-0',
                })}
                trigger={<DropdownArrowSmallIcon aria-hidden="true" />}
                items={[
                  {
                    id: 'now',
                    title: t.publishNow,
                    description: t.publishNowHint,
                    onSelect: onPublishNow,
                  },
                  {
                    id: 'schedule',
                    title: t.schedule,
                    description: t.scheduleHint,
                    onSelect: onSchedule,
                  },
                ]}
              />
            </div>
          </div>
        ) : (
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-[8px]">
            <Status tone={stateTone(state)}>{stateWord(state, t)}</Status>
            {moment ? (
              <span className="cf-caption tabular-nums text-cf-ink-muted">
                {moment}
              </span>
            ) : null}
            <a
              href={calendarHref}
              data-schedule-calendar="true"
              className={buttonClassName({
                variant: 'secondary',
                density: 'dense',
              })}
            >
              {t.openInCalendar}
            </a>
            {queued ? (
              <Button
                type="button"
                variant="quiet"
                density="dense"
                disabled={off}
                loading={busy === 'unschedule'}
                loadingLabel={t.unscheduling}
                data-schedule-action="unschedule"
                onClick={onUnschedule}
              >
                {t.unschedule}
              </Button>
            ) : null}
          </div>
        )}
      </div>
      {error ? (
        <p role="alert" className="cf-body-sm text-cf-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default ScheduleBar;
