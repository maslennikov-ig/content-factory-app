'use client';

import { useState, type ReactNode } from 'react';
import { Button, buttonClassName } from '@contentfactory/react/form/button';
import { Status } from '../../ui/surface';
import { cellDate, stateTone, stateWord } from './adaptation.cell';
import { SplitButton } from '../../ui/split-button';
import type { AdaptationPlanV1, AdaptationStateV1 } from './pieces.adapter';
import { piecesCopy, type PiecesLocale } from './pieces.copy';

export type ScheduleBusy =
  | 'schedule'
  | 'now'
  | 'unschedule'
  | 'delete'
  | 'move'
  | 'plan';

/** Состояние строки плана: от него зависят слова и главное действие. */
export type PlanRowKind = 'off' | 'reserved' | 'queued' | 'done';

export const planRowKindOf = (
  state: AdaptationStateV1,
  plan: AdaptationPlanV1 | undefined
): PlanRowKind => {
  if (state === 'queued') return 'queued';
  if (state !== 'draft' && state !== 'error') return 'done';
  return plan?.status === 'reserved' && plan.current && plan.date
    ? 'reserved'
    : 'off';
};

/**
 * Строка плана поста (`97dq.70`): сразу под «Убрать следы · Проверить факты ·
 * Переписать», а не под всей колонкой настроек.
 *
 * Владелец на тринадцатом заходе: «всё, что внизу сейчас в плане, когда
 * запланировать, должно быть сверху», «если бронь, то нужно не
 * „Запланировать“, а „Подтвердить“», «должно быть явно видно, что уже
 * запланировано… только кнопка „Изменить“». Слова и главное действие — по
 * состоянию:
 *
 *  - черновик: «Черновик» · «Когда» и «Запланировать» (в меню —
 *    «Опубликовать сейчас»), как и было;
 *  - бронь: «В плане на ДД.ММ ЧЧ:ММ · бронь» · «Подтвердить» ставит пост в
 *    очередь на это время; в меню — «Сменить время» и «Снять из плана»;
 *  - в очереди: «В очереди на ДД.ММ ЧЧ:ММ» и метка «автопилот», если поставил
 *    он · «Изменить время»; в меню — «Снять с расписания» и «Открыть в
 *    календаре»;
 *  - вышел: состояние и «Открыть в календаре».
 *
 * «Удалить адаптацию» здесь больше нет: одна кнопка удаления живёт в верхнем
 * ряду вкладки.
 */
export function ScheduleBar({
  locale,
  state,
  date,
  plan,
  when,
  canWrite,
  busy,
  error,
  calendarHref,
  onSchedule,
  onPublishNow,
  onUnschedule,
  onDropPlan,
  onMove,
  onOpenCalendar,
}: {
  locale: PiecesLocale;
  state: AdaptationStateV1;
  /** ISO — дата поста у запланированного и опубликованного. */
  date: string | null;
  /** Место версии в календаре канала (`97dq.57`). */
  plan?: AdaptationPlanV1;
  /** Поле «Когда»: общий выбор даты продукта, его рисует контейнер. */
  when: ReactNode;
  canWrite: boolean;
  busy: ScheduleBusy | null;
  error?: string | null;
  calendarHref: string;
  /** «Запланировать» и «Подтвердить»: в очередь на выбранное время. */
  onSchedule: () => void;
  onPublishNow: () => void;
  /** «Снять с расписания»: запланированный пост — обратно в черновик. */
  onUnschedule: () => void;
  /** «Снять из плана»: бронь уходит, пост остаётся черновиком. */
  onDropPlan?: () => void;
  /** «Перенести»: запланированный пост — на время из «Когда». */
  onMove?: () => void;
  /** «Открыть в календаре» из меню; по умолчанию — переход по `calendarHref`. */
  onOpenCalendar?: (href: string) => void;
}) {
  const t = piecesCopy[locale];
  const kind = planRowKindOf(state, plan);
  const off = !canWrite || busy !== null;
  const [editing, setEditing] = useState(false);
  const planned =
    kind === 'reserved' ? cellDate('draft', plan?.date, true) ?? '' : '';
  const moment = cellDate(state, date);
  const autopilot = kind === 'queued' && Boolean(plan?.autopilot);
  const planNote =
    kind === 'off' || kind === 'reserved' ? plan?.note || null : null;
  const openCalendar = () => {
    if (onOpenCalendar) onOpenCalendar(calendarHref);
    else window.location.assign(calendarHref);
  };

  const label =
    kind === 'off'
      ? t.planRowDraft
      : kind === 'reserved'
      ? t.planRowReserved(planned)
      : kind === 'queued'
      ? t.planRowQueued(moment ?? '')
      : null;

  const whenField = (caption: string) => (
    <div
      data-schedule-when="true"
      className="flex min-w-0 flex-wrap items-center gap-x-[8px] gap-y-[4px]"
    >
      <span className="cf-caption text-cf-ink-muted">{caption}</span>
      <div className="min-w-0">{when}</div>
    </div>
  );

  const scheduleLoading = busy === 'schedule' || busy === 'now';
  const scheduleLabel = busy === 'now' ? t.publishingNow : t.scheduling;

  let controls: ReactNode = null;
  if (kind === 'off')
    controls = (
      <div
        data-schedule-send="true"
        className="flex min-w-0 flex-wrap items-center justify-end gap-x-[12px] gap-y-[8px]"
      >
        {whenField(t.whenLabel)}
        <SplitButton
          dataName="schedule"
          density="dense"
          disabled={off}
          loading={scheduleLoading}
          loadingLabel={scheduleLabel}
          actionData={{ 'data-schedule-action': 'schedule' }}
          menuLabel={t.scheduleMore}
          placement="below"
          align="end"
          onClick={onSchedule}
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
        >
          {t.schedule}
        </SplitButton>
      </div>
    );
  else if (kind === 'reserved')
    controls = (
      <div
        data-schedule-send="true"
        className="flex min-w-0 flex-wrap items-center justify-end gap-x-[12px] gap-y-[8px]"
      >
        <SplitButton
          dataName="confirm"
          density="dense"
          disabled={off}
          loading={scheduleLoading || busy === 'plan'}
          loadingLabel={scheduleLabel}
          actionData={{
            'data-schedule-action': 'confirm',
            'data-tour': 'plan-confirm',
          }}
          menuLabel={t.planReservedMore}
          placement="below"
          align="end"
          onClick={onSchedule}
          items={[
            {
              id: 'time',
              title: t.planChangeTime,
              description: t.planChangeTimeHint,
              onSelect: () => setEditing(true),
            },
            ...(onDropPlan
              ? [
                  {
                    id: 'drop',
                    title: t.planDrop,
                    description: t.planDropHint,
                    onSelect: onDropPlan,
                  },
                ]
              : []),
          ]}
        >
          {t.planConfirm}
        </SplitButton>
      </div>
    );
  else if (kind === 'queued')
    controls = (
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-x-[12px] gap-y-[8px]">
        <SplitButton
          dataName="queued"
          variant="secondary"
          density="dense"
          disabled={off}
          loading={busy === 'unschedule' || busy === 'move'}
          loadingLabel={busy === 'move' ? t.planMoving : t.unscheduling}
          actionData={{ 'data-schedule-action': 'edit-time' }}
          menuLabel={t.planQueuedMore}
          placement="below"
          align="end"
          onClick={() => setEditing((value) => !value)}
          items={[
            {
              id: 'unschedule',
              title: t.unschedule,
              description: t.unscheduleHint,
              onSelect: onUnschedule,
            },
            {
              id: 'calendar',
              title: t.openInCalendar,
              description: t.openInCalendarHint,
              onSelect: openCalendar,
            },
          ]}
        >
          {t.planEditTime}
        </SplitButton>
      </div>
    );
  else
    controls = (
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
          className={buttonClassName({ variant: 'secondary', density: 'dense' })}
        >
          {t.openInCalendar}
        </a>
      </div>
    );

  return (
    <div
      data-schedule-bar={state}
      data-plan-row={kind}
      className="flex min-w-0 flex-col gap-[8px] rounded-[8px] border border-cf-border bg-cf-surface px-[12px] py-[8px]"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-[12px] gap-y-[8px]">
        {label ? (
          <span
            data-plan-row-label="true"
            className="cf-label-md tabular-nums text-cf-ink"
          >
            {label}
          </span>
        ) : null}
        {autopilot ? (
          <span data-schedule-plan="autopilot">
            <Status tone="accent">{t.planAutopilot}</Status>
          </span>
        ) : null}
        <span className="min-w-[8px] flex-1" />
        {controls}
      </div>
      {editing && (kind === 'reserved' || kind === 'queued') ? (
        <div
          data-plan-row-edit="true"
          className="flex min-w-0 flex-wrap items-center justify-end gap-x-[12px] gap-y-[8px]"
        >
          {whenField(kind === 'queued' ? t.planNewTime : t.whenLabel)}
          {kind === 'queued' && onMove ? (
            <Button
              type="button"
              variant="primary"
              density="dense"
              disabled={off}
              loading={busy === 'move'}
              loadingLabel={t.planMoving}
              data-schedule-action="move"
              onClick={onMove}
            >
              {t.planMove}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="quiet"
            density="dense"
            onClick={() => setEditing(false)}
          >
            {t.cancel}
          </Button>
        </div>
      ) : null}
      {planNote ? (
        <p data-schedule-plan-note="true" className="cf-body-sm text-cf-ink-muted">
          {planNote}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="cf-body-sm text-cf-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default ScheduleBar;
